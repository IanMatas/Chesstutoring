// engine.js — Stockfish Engine Wrapper
// Loads Stockfish via Web Worker from CDN, communicates via UCI protocol

const STOCKFISH_CDN = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js';
// Stockfish 18 Lite: neural-network evaluation, single-threaded WASM (no special server headers).
// Far stronger than any human player. jsDelivr refuses this package (over 150 MB), so it comes from unpkg.
const STRONG_CDN = 'https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single';

class StockfishEngine {
    static _blobUrls = {};

    // strong: use Stockfish 18 for best-move answers. The bot keeps Stockfish 10, whose
    // Skill Level the Elo slider is tuned for. If Stockfish 18 cannot start, Stockfish 10 is used.
    constructor(name = 'engine', { strong = false } = {}) {
        this.name = name;
        this.strong = strong;
        this.worker = null;
        this.ready = false;
        this.listeners = [];
        this._queue = Promise.resolve();
    }

    // One search at a time. A new request stops the running search early, then waits for it to
    // finish: overlapping searches mix up results, and crash Stockfish 18.
    _exclusive(run, { stop = true } = {}) {
        if (stop) this.send('stop');
        const job = this._queue.then(run, run);
        this._queue = job.catch(() => {});
        return job;
    }

    /* ── Shared blob URL per script (download once, reuse for multiple workers) ── */
    static _getBlobUrl(src) {
        if (!StockfishEngine._blobUrls[src]) {
            const p = (async () => {
                const res = await fetch(src);
                if (!res.ok) throw new Error('Failed to fetch Stockfish from CDN');
                const js = await res.text();
                return URL.createObjectURL(new Blob([js], { type: 'application/javascript' }));
            })();
            p.catch(() => { delete StockfishEngine._blobUrls[src]; }); // allow a retry later
            StockfishEngine._blobUrls[src] = p;
        }
        return StockfishEngine._blobUrls[src];
    }

    /* ── Lifecycle ── */
    async init() {
        if (this.strong) {
            try {
                // The worker stays silent if its .wasm cannot load, so check that first and fail fast.
                if (typeof WebAssembly !== 'object') throw new Error('WebAssembly is not supported');
                const head = await fetch(STRONG_CDN + '.wasm', { method: 'HEAD' });
                if (!head.ok) throw new Error('WASM file returned ' + head.status);
                // The worker reads its .wasm location from the URL fragment.
                await this._start(STRONG_CDN + '.js', '#' + encodeURIComponent(STRONG_CDN + '.wasm'), 30000);
                console.log(`[${this.name}] ready (Stockfish 18)`);
                return;
            } catch (e) {
                console.warn(`[${this.name}] Stockfish 18 unavailable, using Stockfish 10:`, e.message || e);
                this.destroy();
                this.strong = false;
            }
        }
        await this._start(STOCKFISH_CDN, '', 0);
        console.log(`[${this.name}] ready`);
    }

    async _start(src, fragment, timeoutMs) {
        const url = await StockfishEngine._getBlobUrl(src);
        this.listeners = [];
        this.worker = new Worker(url + fragment);
        this.worker.onmessage = (e) => {
            const msg = typeof e.data === 'string' ? e.data : '';
            this.listeners.forEach(cb => cb(msg));
        };
        let fail;
        const failed = new Promise((_, reject) => { fail = reject; });
        this.worker.onerror = (e) => { console.error(`[${this.name}]`, e); fail(new Error(e.message || 'Engine worker failed')); };
        const handshake = (async () => {
            await this._sendWait('uci', 'uciok');
            this.send('setoption name MultiPV value 1');
            await this._sendWait('isready', 'readyok');
        })();
        const race = [handshake, failed];
        if (timeoutMs) race.push(new Promise((_, reject) => setTimeout(() => reject(new Error('Engine did not start in time')), timeoutMs)));
        await Promise.race(race);
        failed.catch(() => {}); // later worker errors are only logged
        this.ready = true;
    }

    destroy() {
        if (this.worker) { this.send('quit'); this.worker.terminate(); this.worker = null; }
    }

    /* ── Messaging helpers ── */
    send(cmd) { if (this.worker) this.worker.postMessage(cmd); }

    _sendWait(cmd, token) {
        return new Promise(resolve => {
            const h = msg => { if (msg.includes(token)) { this._off(h); resolve(msg); } };
            this._on(h);
            this.send(cmd);
        });
    }

    _on(cb)  { this.listeners.push(cb); }
    _off(cb) { this.listeners = this.listeners.filter(l => l !== cb); }

    /* ── Options ── */
    // Applied between searches (never during one), without stopping a search in progress.
    setOptions(opts) {
        return this._exclusive(async () => {
            if (!this.worker) return;
            for (const [k, v] of Object.entries(opts)) this.send(`setoption name ${k} value ${v}`);
            await this._sendWait('isready', 'readyok');
        }, { stop: false });
    }

    /* ── Evaluate a position ── */
    evaluate(fen, depth = 10, maxTime = 600, searchMoves = []) {
        return this._exclusive(() => this._search(fen, depth, maxTime, searchMoves));
    }

    _search(fen, depth, maxTime, searchMoves) {
        if (!this.worker) return Promise.resolve({ bestMove: null, score: 0, mate: null, pv: [], depth: 0 });
        return new Promise(resolve => {
            let best = null;
            let finished = false;
            const exact = []; // full-score lines, to recover a line Stockfish cut short

            const cleanup = () => {
                if (!finished) {
                    finished = true;
                    this._off(handler);
                }
            };

            const timer = setTimeout(() => {
                if (!finished) {
                    this.send('stop');
                }
            }, maxTime + 150);
            // If the engine never answers (a dead worker), give up with what we have so the queue moves on.
            const deadline = setTimeout(() => {
                if (finished) return;
                console.warn(`[${this.name}] no answer from the engine; using the partial search`);
                handler('bestmove ' + (best && best.pv[0] ? best.pv[0] : '(none)'));
            }, maxTime + 5000);

            const handler = msg => {
                if (msg.startsWith('info') && msg.includes('score') && msg.includes(' pv ')) {
                    const info = this._parseInfo(msg);
                    if (info && (!best || info.depth >= best.depth)) best = info;
                    if (info && !/ (upper|lower)bound /.test(msg)) exact.push(info);
                }
                if (msg.startsWith('bestmove')) {
                    clearTimeout(timer);
                    clearTimeout(deadline);
                    cleanup();
                    const raw = msg.split(' ')[1], bestMove = raw === '(none)' ? null : raw;
                    resolve({
                        bestMove,
                        score : best ? best.score  : 0,
                        mate  : best ? best.mate   : null,
                        pv    : StockfishEngine._fullLine(best, exact, bestMove),
                        depth : best ? best.depth  : depth
                    });
                }
            };

            this._on(handler);
            this.send(`position fen ${fen}`);
            const restricted = searchMoves.length ? ` searchmoves ${searchMoves.join(' ')}` : '';
            this.send(`go depth ${depth} movetime ${maxTime}${restricted}`);
        });
    }

    /* ── Evaluate MultiPV (multiple distinct candidate lines) ── */
    evaluateMultiPV(fen, count = 3, depth = 9, maxTime = 600) {
        return this._exclusive(() => this._searchMultiPV(fen, count, depth, maxTime));
    }

    _searchMultiPV(fen, count, depth, maxTime) {
        if (!this.worker) return Promise.resolve([]);
        this.send(`setoption name MultiPV value ${count}`);
        return new Promise(resolve => {
            const pvs = {};
            let finished = false;

            const cleanup = () => {
                if (!finished) {
                    finished = true;
                    this._off(handler);
                    this.send('setoption name MultiPV value 1');
                }
            };

            const timer = setTimeout(() => {
                if (!finished) {
                    this.send('stop');
                }
            }, maxTime + 150);
            const deadline = setTimeout(() => { if (!finished) handler('bestmove (none)'); }, maxTime + 5000);

            const handler = msg => {
                if (msg.startsWith('info') && msg.includes('score') && msg.includes(' pv ')) {
                    const info = this._parseInfo(msg);
                    if (info) {
                        const mpvMatch = msg.match(/\bmultipv (\d+)/);
                        const mpvIdx = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;
                        if (!pvs[mpvIdx] || info.depth >= pvs[mpvIdx].depth) {
                            pvs[mpvIdx] = info;
                        }
                    }
                }
                if (msg.startsWith('bestmove')) {
                    clearTimeout(timer);
                    clearTimeout(deadline);
                    cleanup();
                    const results = [];
                    for (let i = 1; i <= count; i++) {
                        if (pvs[i] && pvs[i].pv && pvs[i].pv.length > 0) {
                            results.push(pvs[i]);
                        }
                    }
                    resolve(results);
                }
            };

            this._on(handler);
            this.send(`position fen ${fen}`);
            this.send(`go depth ${depth} movetime ${maxTime}`);
        });
    }

    /* ── Filling out short lines ── */
    // One shared Stockfish 18 for short follow-up searches, so it never interrupts another search.
    static _helper = null;
    static _helperQueue = Promise.resolve();
    static helper() {
        if (!StockfishEngine._helper) {
            const e = new StockfishEngine('line-helper', { strong: true });
            StockfishEngine._helper = e.init().then(() => e);
            StockfishEngine._helper.catch(() => { StockfishEngine._helper = null; });
        }
        return StockfishEngine._helper;
    }

    // Extend `pv` (UCI moves from `fen`) to at least `plies` moves by asking for the best move at
    // its end, one move at a time. Stops early when the game ends. Returns the (possibly longer) line.
    static extendLine(fen, pv, plies = 8) {
        const run = async () => {
            const g = new Chess(fen), line = [];
            for (const u of pv || []) {
                if (!g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' })) break;
                line.push(u);
            }
            if (line.length >= plies || g.game_over()) return line;
            const e = await StockfishEngine.helper();
            while (line.length < plies && !g.game_over()) {
                const r = await e.evaluate(g.fen(), 18, 250);
                const u = r.bestMove;
                if (!u || !g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' })) break;
                line.push(u);
            }
            return line;
        };
        const job = StockfishEngine._helperQueue.then(run, run);
        StockfishEngine._helperQueue = job.catch(() => {});
        return job;
    }

    // Stockfish often reports its final line cut short (sometimes one move). Prefer the longest
    // recent line that starts with the same best move; the score still comes from the deepest search.
    static _fullLine(best, exact, bestMove) {
        const pv = best ? best.pv : (bestMove ? [bestMove] : []);
        if (pv.length >= 6 || !bestMove) return pv;
        const recent = exact.filter(l => l.pv[0] === bestMove && l.depth >= (best ? best.depth : 0) - 4);
        const longest = recent.sort((a, b) => b.pv.length - a.pv.length)[0];
        return longest && longest.pv.length > pv.length ? longest.pv : pv;
    }

    /* ── Parse a UCI info line ── */
    _parseInfo(line) {
        const d = line.match(/\bdepth (\d+)/);
        const s = line.match(/\bscore (cp|mate) (-?\d+)/);
        const p = line.match(/\bpv (.+)$/);
        if (!s) return null;
        return {
            depth : d ? +d[1] : 0,
            score : s[1] === 'cp'   ? +s[2] : null,
            mate  : s[1] === 'mate' ? +s[2] : null,
            pv    : p ? p[1].trim().split(/\s+/) : []
        };
    }

    stop() { this.send('stop'); }
}

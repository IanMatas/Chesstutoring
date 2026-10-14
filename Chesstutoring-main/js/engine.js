// engine.js — Stockfish Engine Wrapper
// Loads Stockfish via Web Worker from CDN, communicates via UCI protocol

const STOCKFISH_CDN = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js';

class StockfishEngine {
    static _blobUrl = null;

    constructor(name = 'engine') {
        this.name = name;
        this.worker = null;
        this.ready = false;
        this.listeners = [];
    }

    /* ── Shared blob URL (download once, reuse for multiple workers) ── */
    static async _getBlobUrl() {
        if (!StockfishEngine._blobUrl) {
            const res = await fetch(STOCKFISH_CDN);
            if (!res.ok) throw new Error('Failed to fetch Stockfish from CDN');
            const js = await res.text();
            const blob = new Blob([js], { type: 'application/javascript' });
            StockfishEngine._blobUrl = URL.createObjectURL(blob);
        }
        return StockfishEngine._blobUrl;
    }

    /* ── Lifecycle ── */
    async init() {
        const url = await StockfishEngine._getBlobUrl();
        this.worker = new Worker(url);

        this.worker.onmessage = (e) => {
            const msg = typeof e.data === 'string' ? e.data : '';
            this.listeners.forEach(cb => cb(msg));
        };

        this.worker.onerror = (e) => console.error(`[${this.name}]`, e);

        await this._sendWait('uci', 'uciok');
        this.send('setoption name MultiPV value 1');
        await this._sendWait('isready', 'readyok');
        this.ready = true;
        console.log(`[${this.name}] ready`);
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
    async setOptions(opts) {
        for (const [k, v] of Object.entries(opts)) this.send(`setoption name ${k} value ${v}`);
        await this._sendWait('isready', 'readyok');
    }

    /* ── Evaluate a position ── */
    async evaluate(fen, depth = 10, maxTime = 600, searchMoves = []) {
        this.send('stop');                       // cancel any previous search
        return new Promise(resolve => {
            let best = null;
            let finished = false;

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

            const handler = msg => {
                if (msg.startsWith('info') && msg.includes('score') && msg.includes(' pv ')) {
                    const info = this._parseInfo(msg);
                    if (info && (!best || info.depth >= best.depth)) best = info;
                }
                if (msg.startsWith('bestmove')) {
                    clearTimeout(timer);
                    cleanup();
                    const bestMove = msg.split(' ')[1];
                    resolve({
                        bestMove: bestMove === '(none)' ? null : bestMove,
                        score : best ? best.score  : 0,
                        mate  : best ? best.mate   : null,
                        pv    : best ? best.pv     : (bestMove ? [bestMove] : []),
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
    async evaluateMultiPV(fen, count = 3, depth = 9, maxTime = 600) {
        this.send('stop');
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

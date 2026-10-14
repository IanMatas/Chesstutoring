/* Game review: Stockfish checks every move of a game, the coach explains each one in plain
   language, and the reviewed side's mistakes become positions to practice. */
(() => {
  'use strict';
  const T = () => window.ChessTeach;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const parse = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
  const uciOf = (m) => m.from + m.to + (m.promotion || '');
  const DEPTH = 11, TIME = 800;           // first pass over every position
  const DEEP_DEPTH = 14, DEEP_TIME = 2000; // second look at every move that seems wrong
  const SYMBOL = { inaccuracy: '?!', mistake: '?', blunder: '??' };
  const SAMPLE = '[Event "Sample game"]\n[White "White"]\n[Black "Black"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1';

  function bounded(promise, ms = 20000) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The engine stopped responding. Try again.')), ms); }),
    ]).finally(() => clearTimeout(timer));
  }

  class GameReview {
    constructor(app) {
      this.app = app;
      this.el = document.getElementById('reviewMode');
      this.body = document.getElementById('reviewBody');
      this.token = 0;
      this.game = null;
      this.state = 'empty';
      this.el.addEventListener('click', (e) => this.click(e));
      document.addEventListener('keydown', (e) => this.key(e));
    }

    onMode(mode) {
      const active = mode === 'review';
      if (this.active && !active) this.leave();
      this.active = active;
      this.el.hidden = !active;
      if (!active) return;
      this.cache = {};
      if (this.state === 'paused') this.analyze();
      else this.render();
    }

    leave() {
      this.stopLine();
      this.stopTry();
      if (this.state === 'analyzing') { this.cancel(); this.state = 'paused'; }
    }

    cancel() {
      this.token++;
      (this.engines || []).forEach((e) => e.destroy());
      this.engines = null;
    }

    /* ── Loading a game ─────────────────────────────────── */
    load(game, { source = 'pgn', side } = {}) {
      this.cancel();
      this.stopTry();
      this.stopLine();
      const headers = game.header();
      const root = headers.FEN || new Chess().fen();
      const g = new Chess(root), positions = [g.fen()], moves = [];
      for (const m of game.history({ verbose: true })) {
        const played = g.move({ from: m.from, to: m.to, promotion: m.promotion });
        if (!played) break;
        moves.push(played);
        positions.push(g.fen());
      }
      this.game = { positions, moves, headers, source };
      this.evals = new Array(positions.length).fill(null);
      this.cache = {};
      this.info = [];
      this.keys = [];
      this.index = 0;
      const guess = headers.White === 'You' ? 'w' : headers.Black === 'You' ? 'b' : 'w';
      this.side = side === undefined ? guess : side;
      this.flipped = this.side === 'b';
      this.summaryOpen = true;
      this.state = !moves.length ? 'empty-game' : side === undefined ? 'setup' : 'ready';
      if (this.state === 'ready') this.analyze();
      else this.render();
    }

    importPGN(text, side) {
      try {
        const game = FreePlay.parsePGN(text);
        document.getElementById('pgnError').textContent = '';
        if (document.getElementById('pgnDialog').open) document.getElementById('pgnDialog').close();
        this.load(game, { source: 'pgn', side });
        return true;
      } catch (error) {
        document.getElementById('pgnError').textContent = error.message;
        return false;
      }
    }

    openFromCoach() {
      const app = this.app, g = new Chess(app.posHistory[0]);
      for (const md of app.moveData) g.move({ from: md.from, to: md.to, promotion: md.promotion || undefined });
      g.header('White', app.playerColor === 'w' ? 'You' : 'Bot', 'Black', app.playerColor === 'b' ? 'You' : 'Bot');
      this.load(g, { source: 'coach', side: app.playerColor });
      window.trainer._switchMode('review');
    }

    openFromFree() {
      const fp = window.freePlay, g = new Chess(fp.root), h = fp.game.header();
      for (const m of fp.moves) g.move({ from: m.from, to: m.to, promotion: m.promotion });
      for (const k of ['Event', 'White', 'Black', 'Result']) if (h[k]) g.header(k, h[k]);
      this.load(g, { source: 'free' });
      window.trainer._switchMode('review');
    }

    /* ── Analysis ───────────────────────────────────────── */
    async analyze() {
      if (!this.game) return;
      const token = ++this.token;
      this.state = 'analyzing';
      this.verifying = null;
      this.render();
      const count = Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
      const engines = Array.from({ length: count }, (_, i) => new StockfishEngine('review-' + i));
      this.engines = engines;
      try {
        await bounded(Promise.all(engines.map((e) => e.init())));
        if (token !== this.token) return;
        const todo = this.evals.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
        const work = async (engine) => {
          while (todo.length && token === this.token) {
            const i = todo.shift(), fen = this.game.positions[i], g = new Chess(fen);
            if (g.game_over()) this.evals[i] = { cp: g.in_checkmate() ? -T().MATE : 0, best: null, pv: [] };
            else {
              const r = await bounded(engine.evaluate(fen, DEPTH, TIME));
              if (token !== this.token) return;
              this.evals[i] = { cp: T().scoreOf(r), best: r.bestMove, pv: r.pv || [], depth: r.depth };
            }
            this.progress();
          }
        };
        await Promise.all(engines.map(work));
        if (token !== this.token) return;
        // Short searches are noisy. Before calling a move a mistake, check it again more deeply.
        this.classify();
        const suspects = this.info.map((x, i) => i).filter((i) => ['inaccuracy', 'mistake', 'blunder'].includes(this.info[i].verdict) && !(this.evals[i].deep && this.evals[i + 1].deep));
        this.verifying = { done: 0, total: suspects.length };
        this.progress();
        const recheck = async (engine) => {
          while (suspects.length && token === this.token) {
            const i = suspects.shift();
            for (const j of [i, i + 1]) {
              const e = this.evals[j], g = new Chess(this.game.positions[j]);
              if (e.deep || g.game_over()) continue;
              const r = await bounded(engine.evaluate(this.game.positions[j], DEEP_DEPTH, DEEP_TIME), DEEP_TIME + 20000);
              if (token !== this.token) return;
              if ((r.depth || 0) >= (e.depth || 0)) this.evals[j] = { cp: T().scoreOf(r), best: r.bestMove, pv: r.pv || [], depth: r.depth, deep: true };
              else e.deep = true;
            }
            this.verifying.done++;
            this.progress();
          }
        };
        await Promise.all(engines.map(recheck));
        if (token === this.token) this.finish();
      } catch (error) {
        if (token !== this.token) return;
        this.state = 'error';
        this.error = error.message;
        this.render();
      } finally {
        engines.forEach((e) => e.destroy());
        if (this.engines === engines) this.engines = null;
      }
    }

    progress() {
      const fill = this.body.querySelector('.tc-progress-fill'), text = this.body.querySelector('[data-progress-text]');
      const v = this.verifying;
      const done = v ? v.done : this.evals.filter(Boolean).length, total = v ? v.total : this.evals.length;
      if (fill) fill.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
      if (text) text.textContent = v ? `Double-checking ${v.total} move${v.total === 1 ? '' : 's'} that look wrong: ${v.done} done` : `Checked ${done} of ${total} positions`;
    }

    classify() {
      const moves = this.game.moves;
      this.info = moves.map((m, i) => {
        const e0 = this.evals[i], e1 = this.evals[i + 1], before = e0.cp, after = -e1.cp;
        const isBest = !e0.best || e0.best === uciOf(m) || after >= before - 8;
        const verdict = T().classify(before, after, isBest), history = this.history(i);
        if (history && T().bookInfo([...history, m.san])) return { verdict: 'book', accuracy: 100 };
        return { verdict, accuracy: T().moveAccuracy(before, after) };
      });
    }

    finish() {
      const moves = this.game.moves;
      this.verifying = null;
      this.cache = {};
      this.classify();
      const serious = (i) => this.reviewed(i) && ['mistake', 'blunder'].includes(this.info[i].verdict);
      this.keys = moves.map((_, i) => i).filter(serious);
      if (!this.keys.length) this.keys = moves.map((_, i) => i).filter((i) => this.reviewed(i) && this.info[i].verdict === 'inaccuracy');
      if (this.game.source !== 'coach' && this.side) {
        const key = `${this.game.positions[0]}|${moves.map(uciOf).join(' ')}|${this.side}`;
        T().profile.recordGame(key, this.keys.map((i) => this.lessonAt(i).concept?.id).filter(Boolean), 'review');
      }
      this.state = 'review';
      this.index = 0;
      this.render();
    }

    reviewed(i) { return !this.side || this.game.moves[i].color === this.side; }

    // SAN moves before ply i, only for games that start from the normal position (for book moves).
    history(i) {
      return this.game.positions[0] === new Chess().fen() ? this.game.moves.slice(0, i).map((m) => m.san) : null;
    }

    lessonAt(i) {
      if (this.cache[i]) return this.cache[i];
      const m = this.game.moves[i], e0 = this.evals[i], e1 = this.evals[i + 1];
      const lesson = T().lessonFor({
        fenBefore: this.game.positions[i], move: m, best: { uci: e0.best, pv: e0.pv, cp: e0.cp },
        playedCp: -e1.cp, replyPv: e1.pv || [], me: this.side || null, opponent: 'your opponent', level: T().profile.level,
        history: this.history(i),
      });
      this.cache[i] = lesson;
      return lesson;
    }

    nextKey(ply) { return this.keys.find((k) => k > ply) ?? null; }

    /* ── Rendering ──────────────────────────────────────── */
    render() {
      if (!this.active) return;
      this.stopLineTimer();
      const s = this.state;
      // Once a game is on the board, the page heading shrinks so the board fits on screen.
      this.el.toggleAttribute('data-compact', !!this.game && !['empty', 'empty-game', 'setup'].includes(s));
      if (!this.game || s === 'empty') { this.body.innerHTML = this.landingHtml(); return; }
      if (s === 'empty-game') { this.body.innerHTML = this.landingHtml('This game has no moves to review yet.'); return; }
      if (s === 'setup') { this.body.innerHTML = this.setupHtml(); return; }
      this.body.innerHTML = `<div class="tc-review-layout">
        <section class="tc-review-board-col">
          <p class="tc-review-name" data-name="top"></p>
          <div id="reviewBoard" class="learning-board" aria-label="Game review board"></div>
          <p class="tc-review-name" data-name="bottom"></p>
          <div class="tc-review-nav">
            <button class="btn btn-secondary" data-review="first" aria-label="Start of the game">⏮</button>
            <button class="btn btn-secondary" data-review="prev" aria-label="Previous move">◀</button>
            <button class="btn btn-secondary" data-review="next" aria-label="Next move">▶</button>
            <button class="btn btn-secondary" data-review="last" aria-label="End of the game">⏭</button>
            <button class="btn btn-primary" data-review="next-key">Next key moment</button>
            <button class="btn btn-ghost" data-review="flip">Flip board</button>
          </div>
          <div id="reviewLine" class="tc-line-box" hidden></div>
        </section>
        <section class="tc-review-panel" id="reviewPanel">${s === 'review' ? this.panelHtml() : this.progressHtml()}</section>
      </div>`;
      this.board = new BoardView(document.getElementById('reviewBoard'), { onSquare: (sq) => this.square(sq) });
      if (s !== 'review') this.progress();
      this.update();
    }

    landingHtml(message) {
      const coachMoves = this.app.moveData.length, freeMoves = window.freePlay?.moves.length || 0;
      return `<section class="tc-review-landing">
        ${message ? `<p class="tc-feedback">${esc(message)}</p>` : ''}
        <ol class="tc-review-how">
          <li><strong>Load a game</strong><span>Paste or upload a PGN, or use a game you played here.</span></li>
          <li><strong>Every move explained</strong><span>Mistakes get a name — hanging piece, fork, missed mate — and the habit that prevents them.</span></li>
          <li><strong>Practice your key moments</strong><span>Find the better move yourself, with hints when you need them.</span></li>
        </ol>
        <div class="tc-actions">
          <button class="btn btn-primary" data-review="load">Load a PGN</button>
          ${coachMoves ? `<button class="btn btn-secondary" data-review="coach-game">Review my Coach Play game</button>` : ''}
          ${freeMoves ? `<button class="btn btn-secondary" data-review="free-game">Review my Free Play game</button>` : ''}
          <button class="btn btn-ghost" data-review="sample">Try a sample game</button>
        </div>
      </section>`;
    }

    setupHtml() {
      const g = this.game, h = g.headers, plies = g.moves.length;
      const seconds = Math.max(10, Math.round((plies + 1) * 0.6));
      const choice = (value, text) => {
        const on = value === 'both' ? !this.side : this.side === value;
        return `<button class="btn ${on ? 'btn-primary' : 'btn-secondary'}" data-review="side" data-side="${value}" aria-pressed="${on}">${text}</button>`;
      };
      return `<section class="tc-review-setup">
        <span class="eyebrow">READY TO REVIEW</span>
        <h2>${esc(h.White || 'White')} vs ${esc(h.Black || 'Black')}${h.Result && h.Result !== '*' ? ` · ${esc(h.Result)}` : ''}</h2>
        <p>${Math.ceil(plies / 2)} moves. Which side did you play?</p>
        <div class="tc-seg" role="group" aria-label="Your side">${choice('w', 'White')}${choice('b', 'Black')}${choice('both', 'Both sides')}</div>
        <p class="tc-fine">The review takes about ${seconds} seconds. Stockfish runs in your browser.</p>
        <div class="tc-actions"><button class="btn btn-primary" data-review="start">Start the review</button><button class="btn btn-ghost" data-review="load">Load a different game</button></div>
      </section>`;
    }

    progressHtml() {
      if (this.state === 'error') return `<article class="tc-card"><h3 class="tc-headline">The review stopped.</h3><p class="tc-why">${esc(this.error)}</p><div class="tc-actions"><button class="btn btn-primary" data-review="resume">Try again</button></div></article>`;
      const stopped = this.state === 'stopped';
      return `<article class="tc-card tc-progress-card">
        <h3 class="tc-headline">${stopped ? 'Review paused.' : 'Checking every move…'}</h3>
        <div class="tc-progress"><div class="tc-progress-fill"></div></div>
        <p class="tc-fine" data-progress-text>Starting the engine…</p>
        <p class="tc-why">Stockfish looks at each position. Then the coach explains your moves and picks your key moments.</p>
        <div class="tc-actions">${stopped ? '<button class="btn btn-primary" data-review="resume">Continue</button>' : '<button class="btn btn-ghost" data-review="cancel">Stop</button>'}</div>
      </article>`;
    }

    panelHtml() {
      return `<details class="tc-review-summary"${this.summaryOpen ? ' open' : ''}><summary>Game summary</summary>${this.summaryHtml()}</details>
        <div id="reviewCard"></div>
        <h3 class="tc-section-title">Moves</h3>${this.movesHtml()}`;
    }

    summaryHtml() {
      const g = this.game, info = this.info;
      const side = (c) => {
        const idx = info.map((_, i) => i).filter((i) => g.moves[i].color === c);
        if (!idx.length) return '';
        const acc = Math.round(idx.reduce((sum, i) => sum + info[i].accuracy, 0) / idx.length);
        const n = (v) => idx.filter((i) => info[i].verdict === v).length;
        const name = (c === 'w' ? g.headers.White : g.headers.Black) || (c === 'w' ? 'White' : 'Black');
        const count = (v, one, many) => `${n(v)} ${n(v) === 1 ? one : many}`;
        return `<div class="tc-side${this.side === c ? ' tc-you' : ''}"><span>${c === 'w' ? '♔' : '♚'} ${esc(name)}${this.side === c ? ' (you)' : ''}</span><strong>${acc}%</strong><small>accuracy</small><small>${count('inaccuracy', 'inaccuracy', 'inaccuracies')} · ${count('mistake', 'mistake', 'mistakes')} · ${count('blunder', 'blunder', 'blunders')}</small></div>`;
      };
      const counts = {};
      info.forEach((x, i) => {
        if (!this.reviewed(i) || !['inaccuracy', 'mistake', 'blunder'].includes(x.verdict)) return;
        const c = this.lessonAt(i).concept;
        if (c) counts[c.id] = (counts[c.id] || 0) + 1;
      });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const lessons = top.length
        ? `<h4>${this.side ? 'Your lessons from this game' : 'Lessons from this game'}</h4><ul class="tc-lessons">${top.map(([id, n]) => {
            const c = T().CONCEPTS[id], pr = T().PRACTICE[c.practice];
            return `<li><strong>${esc(c.name)}</strong>${n > 1 ? ` <span class="tc-count">×${n}</span>` : ''}<p>${esc(c.rule)}</p>${pr ? `<button class="tc-link" data-review="practice-concept" data-concept="${id}">${esc(pr.label)} →</button>` : ''}</li>`;
          }).join('')}</ul>`
        : '';
      const keys = this.keys.length;
      return `<div class="tc-sides">${side('w')}${side('b')}</div>${this.graphHtml()}${lessons}
        <div class="tc-actions">${keys ? `<button class="btn btn-primary" data-review="practice">Practice your ${keys} key moment${keys > 1 ? 's' : ''}</button><button class="btn btn-secondary" data-review="first-key">Go to the first key moment</button>` : '<p class="tc-fine">No serious mistakes to practice in this game. Step through it to see what worked.</p>'}</div>`;
    }

    graphHtml() {
      const W = 600, H = 90, n = Math.max(1, this.evals.length - 1);
      const points = this.evals.map((e, i) => {
        const white = this.game.positions[i].split(' ')[1] === 'w' ? e.cp : -e.cp;
        return [(i / n) * W, H - (T().winPercent(white) / 100) * H];
      });
      const area = `M0,${H} ${points.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${W},${H} Z`;
      const dots = this.info.map((x, i) => (['mistake', 'blunder'].includes(x.verdict) ? `<circle cx="${points[i + 1][0].toFixed(1)}" cy="${points[i + 1][1].toFixed(1)}" r="5" class="tc-dot-${x.verdict}${this.reviewed(i) ? '' : ' tc-dot-other'}"></circle>` : '')).join('');
      return `<svg class="tc-graph" viewBox="0 0 ${W} ${H}" data-review="graph" role="img" aria-label="Who was better during the game. The light area is White’s share. Dots mark mistakes.">
        <rect width="${W}" height="${H}" class="tc-graph-bg"></rect><path d="${area}" class="tc-graph-white"></path>
        <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="tc-graph-mid"></line>${dots}
        <line class="tc-graph-cursor" x1="0" y1="0" x2="0" y2="${H}"></line></svg>`;
    }

    movesHtml() {
      const { moves, positions } = this.game;
      let html = '';
      moves.forEach((m, i) => {
        const [, turn, , , , full] = positions[i].split(' ');
        if (turn === 'w') html += `<span class="tc-mv-num">${full}.</span>`;
        else if (i === 0) html += `<span class="tc-mv-num">${full}.</span><span></span>`;
        const v = this.info[i].verdict, mark = SYMBOL[v] || '';
        html += `<button class="tc-mv tc-mv-${v}${this.reviewed(i) ? '' : ' tc-mv-other'}" data-ply="${i + 1}" title="${esc(T().verdictLabel(v, 'intermediate'))}">${esc(m.san)}${mark ? `<span>${mark}</span>` : ''}</button>`;
      });
      return `<div class="tc-moves">${html}</div>`;
    }

    cardHtml() {
      const i = this.index - 1;
      if (i < 0) {
        const keys = this.keys.length;
        return `<article class="tc-card"><h3 class="tc-headline">Starting position</h3><p class="tc-why">Step through the game with ▶ or the arrow keys. Every move gets a short explanation.${keys ? ` Your ${keys} key moment${keys > 1 ? 's are' : ' is'} marked with ?, ?? or ?!.` : ''}</p></article>`;
      }
      const L = this.lessonAt(i), m = this.game.moves[i];
      if (this.side && m.color !== this.side) {
        const theirs = ['mistake', 'blunder'].includes(L.verdict);
        const note = T().opponentNote(this.game.positions[i], m, this.side, 'your opponent');
        return `<article class="tc-card tc-opponent">
          <header class="tc-card-head"><span class="tc-chip ${theirs ? 'tc-chip-their' : 'tc-chip-neutral'}">${theirs ? 'Their mistake' : 'Opponent'}</span><span class="tc-move">${esc(L.moveLabel)}</span></header>
          <h3 class="tc-headline">${esc(note)}</h3>
          ${theirs ? `<p class="tc-why">${esc(L.headline)} ${esc(L.why)}</p><p class="tc-note">Did you take advantage? Your next move shows.</p>` : ''}
        </article>`;
      }
      const isKey = this.keys.includes(i);
      const actions = L.isMistake
        ? `<button class="btn btn-primary" data-review="try">Find a better move</button>${L.replyUci ? '<button class="btn btn-secondary" data-review="line-played">Show what happens</button>' : ''}${L.bestUci ? '<button class="btn btn-secondary" data-review="line-best">Show the better move</button>' : ''}`
        : L.bestUci && L.bestSan !== L.san ? '<button class="btn btn-ghost" data-review="line-best">Show the engine’s choice</button>' : '';
      return window.CoachCards.lessonCard(L, { actions, note: isKey ? `Key moment ${this.keys.indexOf(i) + 1} of ${this.keys.length}` : '' });
    }

    tryHtml() {
      const t = this.trying, L = t.lesson;
      if (t.solved) {
        const next = this.nextKey(t.ply);
        return `<article class="tc-card tc-success">
          <header class="tc-card-head"><span class="tc-chip tc-chip-best">Well found</span><span class="tc-move">${esc(t.solved.moveLabel)}</span></header>
          <h3 class="tc-headline">${esc(t.solved.headline)}</h3>${t.solved.why ? `<p class="tc-why">${esc(t.solved.why)}</p>` : ''}
          <p class="tc-note">In the game, ${esc(L.san)} was played: ${esc(L.headline.charAt(0).toLowerCase() + L.headline.slice(1))}</p>
          <div class="tc-actions">${next != null ? '<button class="btn btn-primary" data-review="next-key-try">Next key moment</button>' : ''}<button class="btn btn-secondary" data-review="back">Back to the game</button></div>
        </article>`;
      }
      const shown = L.hints.slice(0, t.hints);
      return `<article class="tc-card tc-retry">
        <header class="tc-card-head"><span class="tc-chip tc-chip-retry">Your turn</span><span class="tc-move">${T().SIDE[L.mover]} to move</span></header>
        <h3 class="tc-headline">Find a better move than ${esc(L.san)}.</h3>
        <p class="tc-why">${t.busy ? 'Checking your move…' : 'Select a piece, then where it should go.'}</p>
        ${t.last ? `<p class="tc-feedback" role="status"><strong>Not quite — ${esc(t.last.san)}:</strong> ${esc(t.last.headline)} ${esc(t.last.why || '')}</p>` : ''}
        ${t.error ? `<p class="tc-feedback" role="alert">${esc(t.error)}</p>` : ''}
        ${shown.length ? `<ol class="tc-hints">${shown.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>` : ''}
        <div class="tc-actions">
          ${t.hints < L.hints.length ? `<button class="btn btn-secondary" data-review="hint">${t.hints ? 'Another hint' : 'Give me a hint'}</button><button class="btn btn-secondary" data-review="answer">Show me the answer</button>` : ''}
          <button class="btn btn-ghost" data-review="back">Back to the game</button>
        </div>
      </article>`;
    }

    update() {
      if (!this.active || !this.game || !this.board) return;
      const g = this.game, review = this.state === 'review';
      if (this.line) {
        const l = this.line;
        this.board.render({ fen: l.positions[l.index], flipped: this.flipped, last: l.moves[l.index - 1] || null, disabled: true });
      } else if (this.trying) {
        const t = this.trying, L = t.lesson, fen = t.attempt ? t.attempt.fen : t.fen, game = new Chess(fen);
        const marks = {}, arrows = [];
        if (t.hints >= 2 && L.hintSquares?.[0]) marks[L.hintSquares[0]] = 'hint';
        if (t.hints >= 3 && L.hintSquares?.length === 2) arrows.push({ from: L.hintSquares[0], to: L.hintSquares[1], color: 'good' });
        const legal = t.selected ? game.moves({ square: t.selected, verbose: true }).map((m) => m.to) : [];
        this.board.render({ fen, flipped: this.flipped, selected: t.selected, legal, last: t.attempt ? t.attempt.move : null, marks, arrows, disabled: t.busy || !!t.solved });
      } else {
        const i = this.index, last = g.moves[i - 1] || null;
        let marks = {}, arrows = [];
        if (review && i > 0 && this.reviewed(i - 1)) {
          const L = this.lessonAt(i - 1);
          if (L.isMistake) { marks = L.marks; arrows = L.arrows; }
        }
        this.board.render({ fen: g.positions[i], flipped: this.flipped, last, marks, arrows, disabled: true });
      }
      const names = { w: g.headers.White || 'White', b: g.headers.Black || 'Black' };
      const top = this.body.querySelector('[data-name="top"]'), bottom = this.body.querySelector('[data-name="bottom"]');
      if (top) top.textContent = `${this.flipped ? '♔' : '♚'} ${this.flipped ? names.w : names.b}`;
      if (bottom) bottom.textContent = `${this.flipped ? '♚' : '♔'} ${this.flipped ? names.b : names.w}`;
      const lock = !review || !!this.trying;
      const set = (a, disabled) => { const b = this.body.querySelector(`[data-review="${a}"]`); if (b) b.disabled = disabled; };
      set('first', lock || this.index === 0);
      set('prev', lock || this.index === 0);
      set('next', lock || this.index === g.moves.length);
      set('last', lock || this.index === g.moves.length);
      set('next-key', lock || this.nextKey(this.index - 1) == null);
      const box = document.getElementById('reviewLine');
      if (box) {
        box.hidden = !this.line;
        if (this.line) {
          const l = this.line, note = l.index ? l.moves[l.index - 1].note : l.intro;
          box.innerHTML = `<strong>${esc(l.title)}</strong><p>${esc(note)}</p>
            <div class="pattern-actions"><button class="btn btn-secondary" data-review="line-prev"${l.index ? '' : ' disabled'}>◀ Previous</button><button class="btn btn-secondary" data-review="line-next"${l.index >= l.moves.length ? ' disabled' : ''}>Next ▶</button><button class="btn btn-secondary" data-review="line-play">${this.lineTimer ? 'Pause' : 'Play'}</button><button class="btn btn-primary" data-review="back">Back to the game</button></div>
            <span class="tc-fine">Move ${l.index} of ${l.moves.length}</span>`;
        }
      }
      if (!review) return;
      const card = document.getElementById('reviewCard');
      if (card) card.innerHTML = this.trying ? this.tryHtml() : this.cardHtml();
      const list = this.body.querySelector('.tc-moves');
      this.body.querySelectorAll('.tc-mv').forEach((b) => b.classList.toggle('current', +b.dataset.ply === this.index));
      const cur = list && list.querySelector('.current');
      if (cur && (cur.offsetTop < list.scrollTop || cur.offsetTop > list.scrollTop + list.clientHeight - 30)) list.scrollTop = cur.offsetTop - 40;
      const cursor = this.body.querySelector('.tc-graph-cursor');
      if (cursor) {
        const x = ((this.trying ? this.trying.ply : this.index) / Math.max(1, g.moves.length)) * 600;
        cursor.setAttribute('x1', x);
        cursor.setAttribute('x2', x);
      }
    }

    /* ── Navigation, lines and practice ─────────────────── */
    go(index) {
      if (!this.game || this.state !== 'review') return;
      this.stopLine();
      this.stopTry();
      this.index = Math.max(0, Math.min(this.game.moves.length, index));
      if (this.index > 0 && this.summaryOpen) {
        this.summaryOpen = false;
        this.body.querySelector('.tc-review-summary')?.removeAttribute('open');
      }
      this.update();
    }

    key(e) {
      if (!this.active || this.state !== 'review' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      if (this.line) this.lineStep(step);
      else if (!this.trying) this.go(this.index + step);
    }

    showLine(which) {
      const i = this.index - 1;
      if (i < 0) return;
      const L = this.lessonAt(i), m = this.game.moves[i], fen = this.game.positions[i];
      const line = which === 'best' ? (this.evals[i].pv.length ? this.evals[i].pv : [L.bestUci]) : [uciOf(m), ...(this.evals[i + 1].pv || [])];
      const g = new Chess(fen), positions = [fen], moves = [];
      for (const u of line.slice(0, 10)) {
        const before = g.fen(), mv = g.move(parse(u));
        if (!mv) break;
        moves.push({ ...mv, note: T().narrate(before, mv, this.side || null, 'your opponent') });
        positions.push(g.fen());
        if (g.game_over()) break;
      }
      if (!moves.length) return;
      this.line = {
        title: which === 'best' ? `The better move: ${L.bestSan}` : `What ${L.san} allows`,
        intro: which === 'best' ? (L.better || L.why) : `${L.headline} ${L.why}`,
        positions, moves, index: 1,
      };
      this.update();
      this.playLine();
    }

    lineStep(d) {
      if (!this.line) return;
      this.line.index = Math.max(0, Math.min(this.line.moves.length, this.line.index + d));
      if (d) this.stopLineTimer();
      this.update();
    }

    playLine() {
      this.stopLineTimer();
      const l = this.line;
      if (!l) return;
      if (l.index >= l.moves.length) l.index = 0;
      this.lineTimer = setInterval(() => {
        if (this.line !== l || l.index >= l.moves.length) { this.stopLineTimer(); this.update(); return; }
        l.index++;
        if (l.index >= l.moves.length) this.stopLineTimer();
        this.update();
      }, 2200);
      this.update();
    }

    stopLineTimer() {
      clearInterval(this.lineTimer);
      this.lineTimer = null;
    }

    stopLine() {
      this.stopLineTimer();
      this.line = null;
    }

    startTry(ply) {
      this.stopLine();
      this.stopTry();
      this.trying = { ply, fen: this.game.positions[ply], lesson: this.lessonAt(ply), hints: 0, attempts: 0, last: null, selected: null, busy: false, solved: null };
      this.flipped = this.game.moves[ply].color === 'b';
      if (this.summaryOpen) {
        this.summaryOpen = false;
        this.body.querySelector('.tc-review-summary')?.removeAttribute('open');
      }
      this.update();
      document.getElementById('reviewBoard')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    stopTry() {
      this.trying = null;
      this.tryEngine?.destroy();
      this.tryEngine = null;
      this.tryEnginePromise = null;
    }

    getTryEngine() {
      if (!this.tryEnginePromise) {
        const e = new StockfishEngine('review-practice');
        this.tryEngine = e;
        this.tryEnginePromise = bounded(e.init()).then(() => e).catch((err) => {
          e.destroy();
          if (this.tryEngine === e) { this.tryEngine = null; this.tryEnginePromise = null; }
          throw err;
        });
      }
      return this.tryEnginePromise;
    }

    square(sq) {
      const t = this.trying;
      if (!t || t.busy || t.solved) return;
      const g = new Chess(t.fen);
      if (t.selected) {
        const choices = g.moves({ square: t.selected, verbose: true }).filter((m) => m.to === sq);
        if (choices.length) {
          const pick = choices.find((m) => m.promotion === 'q') || choices[0];
          this.submitTry({ from: pick.from, to: pick.to, promotion: pick.promotion });
          return;
        }
      }
      const p = g.get(sq);
      t.selected = p && p.color === g.turn() ? sq : null;
      this.update();
    }

    async submitTry(input) {
      const t = this.trying, g = new Chess(t.fen), m = g.move(input);
      if (!m) return;
      t.busy = true;
      t.selected = null;
      t.error = '';
      t.attempt = { fen: g.fen(), move: m };
      this.update();
      try {
        const ended = g.game_over();
        const r = ended ? null : await bounded((await this.getTryEngine()).evaluate(g.fen(), 12, 900));
        if (this.trying !== t) return;
        const e0 = this.evals[t.ply];
        const playedCp = r ? -T().scoreOf(r) : g.in_checkmate() ? T().MATE : 0;
        const L = T().lessonFor({ fenBefore: t.fen, move: m, best: { uci: e0.best, pv: e0.pv, cp: e0.cp }, playedCp, replyPv: r ? r.pv || [] : [], me: m.color, opponent: 'your opponent', level: T().profile.level });
        const ok = ['best', 'good'].includes(L.verdict) || (L.verdict === 'inaccuracy' && T().profile.level === 'beginner');
        if (ok) { t.solved = L; ChessSounds.correct(); }
        else { t.attempts++; t.last = L; t.attempt = null; ChessSounds.wrong(); }
      } catch (error) {
        if (this.trying === t) { t.error = error.message; t.attempt = null; }
      } finally {
        if (this.trying === t) { t.busy = false; this.update(); }
      }
    }

    click(e) {
      const b = e.target.closest('[data-review], [data-ply]');
      if (!b || b.disabled) return;
      if (b.dataset.ply) { this.go(+b.dataset.ply); return; }
      const t = this.trying;
      switch (b.dataset.review) {
        case 'load':
          window.pgnTarget = 'review';
          document.getElementById('pgnError').textContent = '';
          document.getElementById('pgnDialog').showModal();
          break;
        case 'sample': this.importPGN(SAMPLE); break;
        case 'coach-game': this.openFromCoach(); break;
        case 'free-game': this.openFromFree(); break;
        case 'side':
          this.side = b.dataset.side === 'both' ? null : b.dataset.side;
          this.flipped = this.side === 'b';
          this.render();
          break;
        case 'start': case 'resume': this.analyze(); break;
        case 'cancel': this.cancel(); this.state = 'stopped'; this.render(); break;
        case 'first': this.go(0); break;
        case 'prev': this.go(this.index - 1); break;
        case 'next': this.go(this.index + 1); break;
        case 'last': this.go(this.game.moves.length); break;
        case 'next-key': { const k = this.nextKey(this.index - 1); if (k != null) this.go(k + 1); break; }
        case 'first-key': if (this.keys.length) this.go(this.keys[0] + 1); break;
        case 'flip': this.flipped = !this.flipped; this.update(); break;
        case 'try': if (this.index > 0) this.startTry(this.index - 1); break;
        case 'practice': if (this.keys.length) this.startTry(this.keys[0]); break;
        case 'next-key-try': { const k = t && this.nextKey(t.ply); if (k != null) this.startTry(k); break; }
        case 'hint': if (t && !t.busy) { t.hints = Math.min(t.hints + 1, t.lesson.hints.length); ChessSounds.hint(); this.update(); } break;
        case 'answer': if (t && !t.busy) { t.hints = t.lesson.hints.length; this.update(); } break;
        case 'back': {
          const ply = t ? t.ply : null;
          this.stopTry();
          this.stopLine();
          if (ply != null) { this.index = ply + 1; this.flipped = this.side ? this.side === 'b' : this.flipped; }
          this.update();
          break;
        }
        case 'line-played': this.showLine('played'); break;
        case 'line-best': this.showLine('best'); break;
        case 'line-prev': this.lineStep(-1); break;
        case 'line-next': this.lineStep(1); break;
        case 'line-play': if (this.lineTimer) { this.stopLineTimer(); this.update(); } else this.playLine(); break;
        case 'graph': {
          if (t) break;
          const r = b.getBoundingClientRect();
          this.go(Math.round(((e.clientX - r.left) / r.width) * this.game.moves.length));
          break;
        }
        case 'practice-concept': {
          const c = T().CONCEPTS[b.dataset.concept];
          window.CoachCards.openPractice(c && T().PRACTICE[c.practice]);
          break;
        }
      }
    }
  }

  window.GameReview = GameReview;
})();

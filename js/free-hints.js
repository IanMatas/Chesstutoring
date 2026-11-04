/* Free Play analysis: the evaluation bar, a green arrow for the best move in the shown position,
   and an orange arrow for what was better when the last move was a mistake. */
(() => {
  'use strict';
  const MISTAKE_CP = 120;
  const cp = (r) => (r.mate != null ? Math.sign(r.mate) * (10000 - Math.abs(r.mate) * 100) : r.score || 0);
  const uci = (m) => ({ from: m.slice(0, 2), to: m.slice(2, 4) });
  // White's share of the bar from a White-side score, using the same win-chance curve as move grading.
  const whiteShare = (score) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-2000, Math.min(2000, score)))) - 1);

  class FreeHints {
    constructor() { this.cache = new Map(); this.engine = null; this.queue = Promise.resolve(); this.serial = 0; }
    get on() { return document.getElementById('freeHints')?.checked; }
    get barOn() { return document.getElementById('freeEvalToggle')?.checked; }

    // Fill the evaluation bar for `fen`. r: this module's analysis of it (null = finished game only).
    setBar(fp, fen, r) {
      const bar = document.getElementById('freeEval');
      if (!bar) return;
      const g = new Chess(fen);
      let white, text, label;
      if (g.in_checkmate()) {
        white = g.turn() === 'w' ? 0 : 100;
        text = g.turn() === 'w' ? '0-1' : '1-0';
        label = `Checkmate: ${g.turn() === 'w' ? 'Black' : 'White'} wins`;
      } else if (g.game_over()) {
        white = 50; text = '½'; label = 'The game is drawn';
      } else if (r) {
        const sign = g.turn() === 'w' ? 1 : -1, mate = r.mate != null ? r.mate * sign : null, score = (r.score || 0) * sign;
        const lead = mate != null ? (mate > 0 ? 'White' : 'Black') : score >= 0 ? 'White' : 'Black';
        white = mate != null ? (mate > 0 ? 100 : 0) : Math.max(3, Math.min(97, whiteShare(score)));
        text = mate != null ? `M${Math.abs(mate)}` : (Math.abs(score) / 100).toFixed(1);
        label = mate != null ? `${lead} can force mate in ${Math.abs(mate)}` : Math.abs(score) < 15 ? 'The position is equal' : `${lead} is better by ${(Math.abs(score) / 100).toFixed(1)} pawns`;
      } else return;
      // White fills from the bottom; when the board is flipped, from the top.
      bar.classList.toggle('flipped', !!fp.flipped);
      bar.querySelector('.free-eval-fill').style.height = `${white}%`;
      const num = bar.querySelector('.free-eval-num'), whiteLeads = white >= 50;
      num.textContent = text;
      num.className = `free-eval-num ${whiteLeads === !fp.flipped ? 'at-bottom' : 'at-top'} ${whiteLeads ? 'on-light' : 'on-dark'}`;
      bar.setAttribute('aria-label', `Evaluation: ${label}`);
      bar.title = label;
      this.lastBar = { fen, r };
    }

    async analyse(fen) {
      if (this.cache.has(fen)) return this.cache.get(fen);
      if (!this.engine) {
        const e = new StockfishEngine('free-hints', { strong: true });
        this.engine = e.init().then(() => e);
        this.engine.catch(() => { this.engine = null; }); // retry on the next move
      }
      // Stockfish 18 reaches about depth 14 in this time: far above super-GM strength.
      const r = await (await this.engine).evaluate(fen, 20, 900);
      const out = { best: r.bestMove, cp: cp(r), score: r.score, mate: r.mate };
      this.cache.set(fen, out);
      return out;
    }

    update(fp) {
      const note = document.getElementById('freeHintNote');
      document.getElementById('freeEval').hidden = !this.barOn;
      if (!this.on) note.textContent = '';
      if ((!this.on && !this.barOn) || fp.busy || fp.pending) { if (fp.busy || fp.pending) note.textContent = ''; return; }
      const fen = fp.positions[fp.index], prev = fp.positions[fp.index - 1], last = fp.moves[fp.index - 1];
      const known = this.cache.get(fen);
      // No wait when already known; otherwise keep the last reading (in the current orientation) until the new one lands.
      if (this.barOn && (known || new Chess(fen).game_over())) this.setBar(fp, fen, known || null);
      else if (this.barOn && this.lastBar) this.setBar(fp, this.lastBar.fen, this.lastBar.r);
      const serial = ++this.serial;
      // Serialize searches on one engine; drop results for positions no longer shown.
      this.queue = this.queue.then(async () => {
        if (serial !== this.serial) return;
        try {
          const now = await this.analyse(fen);
          if (serial !== this.serial || fp.positions[fp.index] !== fen) return;
          if (this.barOn) this.setBar(fp, fen, now);
          if (!this.on) return;
          const before = prev ? await this.analyse(prev) : null;
          if (serial !== this.serial || fp.positions[fp.index] !== fen) return;
          this.draw(fp, now, before, last);
        } catch (_) { note.textContent = 'Engine analysis is unavailable right now.'; }
      });
    }

    draw(fp, now, before, last) {
      const arrows = [], note = document.getElementById('freeHintNote');
      let text = '';
      const playedUci = last && last.from + last.to + (last.promotion || '');
      // Scores are from the side to move, so the mover's loss is their best minus the opponent's score negated.
      const loss = before && last ? before.cp + now.cp : 0;
      if (before?.best && playedUci !== before.best && loss >= MISTAKE_CP) {
        const better = new Chess(fp.positions[fp.index - 1]).move({ ...uci(before.best), promotion: before.best[4] });
        arrows.push({ ...uci(before.best), color: 'warn' });
        text = `${last.san} was a ${loss >= 300 ? 'blunder' : 'mistake'}. Orange arrow: ${better ? better.san : before.best} was better.`;
      }
      if (now.best) {
        arrows.push({ ...uci(now.best), color: 'best' });
        text += `${text ? ' ' : ''}Green arrow: best move now.`;
      }
      const board = document.getElementById('freeBoard');
      board.querySelector('.tc-arrows')?.remove();
      board.append(BoardView.prototype.arrowLayer.call({ flipped: fp.flipped, center: BoardView.prototype.center }, arrows));
      note.textContent = text;
    }
  }
  window.freeHints = new FreeHints();
  document.addEventListener('change', (e) => { if (['freeHints', 'freeEvalToggle'].includes(e.target.id) && window.freePlay) window.freePlay.render(); });
})();

/* Reversible board demonstrations of a lesson: what a move allows, and the better move.
   Lines come from the analysis stored with the move, so they open instantly. */
(() => {
  const obj = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });

  class MoveLessons {
    constructor(app) {
      this.app = app;
      this.comparison = null;
      document.getElementById('lessonPlayed').addEventListener('click', () => this.show('played'));
      document.getElementById('lessonBest').addEventListener('click', () => this.show('best'));
      document.getElementById('lessonAutoplay').addEventListener('click', () => (this.timer ? this.pause() : this.autoplay()));
      for (const id of ['varStartBtn', 'varPrevBtn', 'varNextBtn', 'varEndBtn'])
        document.getElementById(id).addEventListener('click', () => this.pause());
    }

    cancel() {
      this.pause();
      this.comparison = null;
    }

    showStored(md, which = 'played') {
      const L = md.lesson;
      if (!L) return;
      const played = [md.from + md.to + (md.promotion || ''), ...(md.replyLine || [])];
      const best = md.bestLine && md.bestLine.length ? md.bestLine : md.bestMove ? [md.bestMove] : [];
      const sameMove = best[0] === played[0];
      this.comparison = {
        played: this.build(md, played, `What ${L.san} allows`, L.isMistake ? `${L.headline} ${L.why}` : `${L.headline} Watch the most likely replies.`),
        best: best.length && !sameMove ? this.build(md, best, `The better move: ${L.bestSan}`, L.better || L.why || 'The engine’s choice in this position.') : null,
      };
      this.show(which === 'best' && this.comparison.best ? 'best' : 'played');
    }

    build(md, line, title, verdict) {
      const T = window.ChessTeach;
      const g = new Chess(md.fenBefore), positions = [g.fen()], moves = [];
      for (const u of line.slice(0, 10)) {
        const before = g.fen(), m = g.move(obj(u));
        if (!m) break;
        moves.push({ ...m, fen: g.fen(), note: T.narrate(before, m, md.color, 'the bot') });
        positions.push(g.fen());
        if (g.game_over()) break;
      }
      return { title, positions, moves, moveLesson: true, cause: verdict, whyBetter: `${verdict} Press Next move, or let the moves play.` };
    }

    pause() {
      clearInterval(this.timer);
      this.timer = null;
      const button = document.getElementById('lessonAutoplay');
      if (button) button.textContent = 'Play the moves';
    }

    autoplay() {
      this.pause();
      const v = this.app.activeVariation;
      if (!v?.moveLesson) return;
      if (this.app.varStepIndex >= v.moves.length) this.app._stepVariation(0);
      document.getElementById('lessonAutoplay').textContent = 'Pause';
      this.timer = setInterval(() => {
        if (this.app.activeVariation !== v) { this.pause(); return; }
        this.app._stepVariation(this.app.varStepIndex + 1);
        if (this.app.varStepIndex >= v.moves.length) this.pause();
      }, 2500);
    }

    show(which) {
      const v = this.comparison?.[which];
      if (!v || !v.moves.length) return;
      this.pause();
      this.app._previewVariation(v);
      if (this.app.varStepIndex < v.moves.length) this.autoplay();
    }

    onStep(v, index) {
      const box = document.getElementById('moveLessonControls');
      box.hidden = !v?.moveLesson;
      if (box.hidden) { this.pause(); return; }
      document.getElementById('lessonVerdict').textContent = v.cause || '';
      document.getElementById('lessonBest').disabled = !this.comparison?.best;
      document.getElementById('lessonPlayed').setAttribute('aria-pressed', String(this.comparison?.played === v));
      document.getElementById('lessonBest').setAttribute('aria-pressed', String(this.comparison?.best === v));
      document.getElementById('lessonProgress').textContent = index >= v.moves.length
        ? 'End of this line. Compare the other line, or go back to your game.'
        : `Move ${index} of ${v.moves.length}. Read what each move does.`;
      if (index >= v.moves.length) this.pause();
    }
  }
  window.MoveLessons = MoveLessons;
})();

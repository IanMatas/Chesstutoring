/* Reversible board demonstrations of a lesson: what a move allows, and the better move.
   Lines come from the analysis stored with the move, so they open instantly. */
(() => {
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

    async showStored(md, which = 'played') {
      const L = md.lesson;
      if (!L) return;
      const token = this.token = (this.token || 0) + 1;
      const i = this.app.moveData.indexOf(md), lastMove = i > 0 ? this.app.moveData[i - 1] : null;
      let played = [md.from + md.to + (md.promotion || ''), ...(md.replyLine || [])];
      let best = md.bestLine && md.bestLine.length ? md.bestLine : md.bestMove ? [md.bestMove] : [];
      // Fill out lines Stockfish cut short, so each one shows a real sequence.
      if (played.length < 6 || (best.length && best.length < 6)) {
        this.app.panel.thinking('Preparing the line…');
        try {
          played = await StockfishEngine.extendLine(md.fenBefore, played, 8);
          if (best.length) best = await StockfishEngine.extendLine(md.fenBefore, best, 8);
        } catch (_) { /* show what we have */ }
        this.app.panel.el.querySelector('.tc-busy')?.remove();
        if (token !== this.token) return;
      }
      const sameMove = best[0] === played[0];
      const line = (moves, cp) => window.ChessTeach.explainLine(md.fenBefore, moves, { me: md.color, opponent: 'the bot', plies: 10, cp, lastMove });
      this.comparison = {
        played: L.isMistake
          ? this.fromPlan(md.fenBefore, line(played, md.evalAfter), `What ${L.san} allows`, `${L.headline} ${L.why}`)
          : this.fromPlan(md.fenBefore, line(played, md.evalAfter), `Why ${L.san} works`, L.headline),
        best: best.length && !sameMove ? this.fromPlan(md.fenBefore, line(best, md.evalBefore), `The better move: ${L.bestSan}`, L.better || L.why || 'The engine’s choice in this position.') : null,
      };
      this.show(which === 'best' && this.comparison.best ? 'best' : 'played');
    }

    // One line on its own, already explained (the Hint's best line).
    showLine({ fen, plan, title, intro }) {
      this.token = (this.token || 0) + 1;
      this.comparison = { played: null, best: null };
      this.play(this.fromPlan(fen, plan, title, intro));
    }

    // A board demonstration from an explained line; the summary closes the last step.
    fromPlan(fen, plan, title, intro) {
      const n = plan.steps.length;
      const moves = plan.steps.map((s, i) => ({ ...s.move, fen: s.fen, note: i === n - 1 && plan.summary ? `${s.note} ${plan.summary}` : s.note }));
      const lead = `${intro || ''} ${plan.summary || ''}`.trim();
      return { title, positions: [fen, ...plan.steps.map((s) => s.fen)], moves, moveLesson: true, cause: intro, whyBetter: `${lead} Press Next move, or let the moves play.` };
    }

    pause() {
      clearTimeout(this.timer);
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
      // Give each step time to be read: longer explanations stay up longer.
      const text = () => (this.app.varStepIndex ? v.moves[this.app.varStepIndex - 1]?.note : v.whyBetter) || '';
      const tick = () => {
        this.timer = setTimeout(() => {
          if (this.app.activeVariation !== v) { this.pause(); return; }
          this.app._stepVariation(this.app.varStepIndex + 1);
          if (this.app.varStepIndex >= v.moves.length) this.pause();
          else tick();
        }, Math.max(2500, Math.min(8000, 1500 + text().length * 40)));
      };
      tick();
    }

    show(which) {
      this.play(this.comparison?.[which]);
    }

    play(v) {
      if (!v || !v.moves.length) return;
      this.pause();
      this.app._previewVariation(v);
      if (this.app.varStepIndex < v.moves.length) this.autoplay();
    }

    onStep(v, index) {
      const box = document.getElementById('moveLessonControls');
      box.hidden = !v?.moveLesson;
      if (box.hidden) { this.pause(); return; }
      // The "what my move allows / the better move" switch only makes sense with both lines.
      box.querySelector('.pattern-actions').hidden = !(this.comparison?.played && this.comparison?.best);
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

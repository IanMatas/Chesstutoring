/* One-board study: see what to notice, try a move, get a named lesson, and watch the lines.
   You control both sides; the engine only explains. */
(() => {
  const parse = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
  const T = () => window.ChessTeach;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  class StudyBoard {
    constructor(app) {
      this.app = app;
      this.el = document.getElementById('guidedAnalysisMode');
      this.view = new BoardView(document.getElementById('studyBoard'));
      this.token = 0;
      this.game = new Chess();
      this.origin = this.game.fen();
      this.flipped = false;
      this.el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (b.dataset.square) return this.square(b.dataset.square);
        if (b.dataset.promote) {
          const m = this.pending;
          this.pending = null;
          document.getElementById('studyPromotion').hidden = true;
          return this.play({ ...m, promotion: b.dataset.promote });
        }
        if (b.dataset.coach === 'practice') {
          const c = T().CONCEPTS[b.dataset.concept];
          return window.CoachCards.openPractice(c && T().PRACTICE[c.practice]);
        }
        const a = b.dataset.study;
        if (a === 'import') this.load(this.sourceMode === 'play' && window.freePlay ? window.freePlay.viewedFen() : this.app.game.fen());
        if (a === 'reset') this.load(this.origin);
        if (a === 'undo' || a === 'tryagain') {
          this.stop();
          this.replay = null;
          this.game.undo();
          this.analyze();
        }
        if (a === 'flip') {
          this.flipped = !this.flipped;
          this.render();
        }
        if (a === 'best' || a === 'played') this.watch(a);
        if (a === 'next') this.step(this.index + 1);
        if (a === 'prev') this.step(this.index - 1);
        if (a === 'auto') {
          if (this.timer) this.pause();
          else {
            this.timer = setInterval(() => {
              if (this.index >= this.replay.moves.length) this.pause();
              else this.step(this.index + 1);
            }, 1800);
            b.textContent = 'Pause';
          }
        }
        if (a === 'return') {
          this.pause();
          this.replay = null;
          this.render();
        }
        if (a === 'patterns') window.trainer._switchMode('patterns');
        if (a === 'retry') this.analyze(this.lastMove);
      });
    }

    onMode(mode) {
      this.active = mode === 'deep-analysis';
      this.el.hidden = !this.active;
      if (this.active) {
        if (!this.opened) {
          this.opened = true;
          this.load(this.sourceMode === 'play' && window.freePlay ? window.freePlay.viewedFen() : this.app.game.fen());
        } else this.analyze(this.lastMove);
      } else this.stop();
    }

    pause() {
      clearInterval(this.timer);
      this.timer = null;
      document.getElementById('studyAuto').textContent = 'Play sequence';
    }

    stop() {
      this.token++;
      this.pause();
      this.engine?.destroy();
      this.engine = null;
      this.busy = false;
    }

    load(fen) {
      this.stop();
      this.game = new Chess(fen);
      this.origin = fen;
      this.replay = null;
      this.lastMove = null;
      this.selected = null;
      this.pending = null;
      this.flipped = this.game.turn() === 'b';
      document.getElementById('studyPromotion').hidden = true;
      this.analyze();
    }

    async bounded(p) {
      let timer;
      try {
        return await Promise.race([p, new Promise((_, reject) => (timer = setTimeout(() => reject(Error('The engine did not respond. Retry analysis.')), 15000)))]);
      } finally {
        clearTimeout(timer);
      }
    }

    async analyze(md = null) {
      this.stop();
      this.replay = null;
      this.selected = null;
      this.lines = null;
      this.lesson = null;
      this.notice = null;
      this.lastMove = md;
      this.pending = null;
      this.summary = '';
      document.getElementById('studyPromotion').hidden = true;
      document.getElementById('studyDetail').textContent = 'Checking this position. The assessment will appear here when ready.';
      this.busy = true;
      this.render();
      const token = this.token, e = new StockfishEngine('guided-study');
      this.engine = e;
      const root = md?.fenBefore || this.game.fen();
      try {
        if (this.game.game_over() && !md) {
          this.summary = this.game.in_checkmate() ? 'Checkmate. Undo or load your game to try another idea.' : 'This position is drawn. Undo or load your game to continue.';
          return;
        }
        await this.bounded(e.init());
        if (token !== this.token) return;
        const best = await this.bounded(e.evaluate(root, 16, 1200));
        if (token !== this.token) return;
        const played = md ? await this.bounded(e.evaluate(root, 16, 1200, [T().uciOf(md)])) : null;
        if (token !== this.token) return;
        this.lines = {};
        for (const [key, result] of [['best', best], ['played', played]]) {
          if (!result) continue;
          const g = new Chess(root), line = [];
          for (const u of result.pv || []) {
            if (line.length === 8 || !g.move(parse(u))) break;
            line.push(u);
          }
          while (line.length < 5 && !g.game_over()) {
            const next = await this.bounded(e.evaluate(g.fen(), 14, 500));
            if (token !== this.token) return;
            if (!next.pv?.[0] || !g.move(parse(next.pv[0]))) break;
            line.push(next.pv[0]);
          }
          if (!line.length) throw Error('No legal continuation was returned. Retry analysis.');
          result.line = line;
          this.lines[key] = this.build(root, line, key === 'played' ? 'What your move allows' : 'The engine’s idea');
        }
        const level = T().profile.level;
        if (md) {
          this.lesson = T().lessonFor({
            fenBefore: root, move: md, best: { uci: best.bestMove, pv: best.line, cp: T().scoreOf(best) },
            playedCp: T().scoreOf(played), replyPv: played.line.slice(1), me: null, level,
          });
          if (this.lines.played) this.lines.played.intro = `${this.lesson.headline} ${this.lesson.why}`.trim();
          if (this.lines.best) this.lines.best.intro = this.lesson.better || this.lesson.why || 'The engine’s choice from the same position.';
          this.summary = `You played ${md.san}. ${this.lesson.headline}`;
        } else {
          const side = T().SIDE[this.game.turn()];
          this.notice = T().routineNotes(root, this.game.turn(), 'the other side');
          this.summary = `${side} to move. Read what to notice, then try a move.`;
          if (this.lines.best) this.lines.best.intro = `${this.lines.best.moves[0].san}: the engine’s choice for ${side}.`;
        }
        document.getElementById('studyDetail').textContent = `Engine evaluation for ${T().SIDE[new Chess(root).turn()]}: ${T().formatCp(T().scoreOf(best))} (depth ${best.depth}). An evaluation compares positions; it is a short search, not a guaranteed result.`;
      } catch (error) {
        if (token === this.token) {
          this.summary = error.message;
          document.getElementById('studyRetry').hidden = false;
        }
      } finally {
        e.destroy();
        if (token === this.token) {
          this.engine = null;
          this.busy = false;
          this.render();
        }
      }
    }

    build(root, line, title) {
      const g = new Chess(root), positions = [g.fen()], moves = [];
      for (const u of line) {
        const before = g.fen(), m = g.move(parse(u));
        if (!m) break;
        moves.push({ ...m, note: T().narrate(before, m, null) });
        positions.push(g.fen());
      }
      return { title, positions, moves, intro: '' };
    }

    square(sq) {
      if (this.busy || this.replay || this.pending) return;
      const p = this.game.get(sq);
      if (this.selected) {
        const moves = this.game.moves({ square: this.selected, verbose: true }).filter((m) => m.to === sq);
        if (moves.length) {
          if (moves.some((m) => m.promotion)) {
            this.pending = { from: this.selected, to: sq };
            document.getElementById('studyPromotion').hidden = false;
            return;
          }
          return this.play(moves[0]);
        }
      }
      this.selected = p?.color === this.game.turn() ? sq : null;
      this.render();
    }

    play(m) {
      const fenBefore = this.game.fen(), move = this.game.move({ from: m.from, to: m.to, promotion: m.promotion });
      if (!move) return;
      ChessSounds.playMoveSound(move);
      this.analyze({ ...move, fenBefore, fenAfter: this.game.fen() });
    }

    watch(key) {
      if (!this.lines?.[key] || this.busy) return;
      this.pause();
      this.replay = this.lines[key];
      this.index = 1;
      this.render();
      document.getElementById('studyBoard').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    step(i) {
      if (!this.replay) return;
      this.index = Math.max(0, Math.min(this.replay.moves.length, i));
      if (this.index === this.replay.moves.length) this.pause();
      this.render();
    }

    cardHtml() {
      if (this.busy || this.replay) return '';
      if (this.lesson) {
        const actions = this.lesson.isMistake ? '<button class="btn btn-primary" data-study="tryagain">Try another move</button>' : '';
        return window.CoachCards.lessonCard(this.lesson, { actions });
      }
      if (this.notice) {
        const n = this.notice;
        return `<article class="tc-card tc-notice"><h3 class="tc-headline">What to notice</h3>
          <ol class="tc-steps tc-live">
            <li><strong>Threats</strong><span>${esc(n.threat)}</span></li>
            <li><strong>Forcing moves</strong><span>${esc(n.forcing)}</span></li>
            <li><strong>Blunder check</strong><span>Before you move, check that the piece is safe on its new square.</span></li>
          </ol></article>`;
      }
      return '';
    }

    render() {
      const v = this.replay, g = v ? new Chess(v.positions[this.index]) : this.game;
      const last = v ? v.moves[this.index - 1] || null : this.lastMove;
      const legal = this.selected && !v ? g.moves({ square: this.selected, verbose: true }).map((m) => m.to) : [];
      let marks = {}, arrows = [];
      if (!v && !this.busy && this.lesson?.isMistake) ({ marks, arrows } = this.lesson);
      else if (!v && !this.busy && this.notice) ({ marks, arrows } = this.notice);
      this.view.render({ fen: g.fen(), flipped: this.flipped, selected: v ? null : this.selected, legal, last, marks, arrows, disabled: this.busy || !!v });
      document.getElementById('studyState').textContent = v
        ? `${v.title} · move ${this.index} of ${v.moves.length}`
        : this.busy ? 'Checking the position…' : `${g.turn() === 'w' ? 'White' : 'Black'} to move · Try your idea`;
      document.getElementById('studyInstruction').textContent = v
        ? 'The highlighted squares show each move. Use Next move, or return to try your own idea.'
        : 'Select a piece, then a highlighted square. You control both sides; no surprise bot moves.';
      document.getElementById('studyExplanation').textContent = v
        ? (this.index ? last.note : v.intro || 'Starting position. Next move begins the line.')
        : this.busy ? 'Checking a line with replies from both sides…' : this.summary || 'Try a move to begin.';
      document.getElementById('studyCard').innerHTML = this.cardHtml();
      document.getElementById('studyReplayControls').hidden = !v;
      document.getElementById('studyChoices').hidden = !!v;
      document.getElementById('studyBest').disabled = this.busy || !this.lines?.best;
      document.getElementById('studyBest').textContent = this.lesson?.isMistake ? 'Watch the better move' : 'Show the engine’s idea';
      document.getElementById('studyPlayed').hidden = !this.lines?.played;
      document.getElementById('studyPlayed').disabled = this.busy;
      document.getElementById('studyPrev').disabled = !v || !this.index;
      document.getElementById('studyNext').disabled = !v || this.index === v.moves.length;
      document.getElementById('studyAuto').disabled = !v || this.index === v.moves.length;
      document.getElementById('studyUndo').disabled = this.busy || !this.game.history().length;
      document.getElementById('studyRetry').hidden = this.busy || !!this.lines?.best;
    }
  }
  window.StudyBoard = StudyBoard;
})();

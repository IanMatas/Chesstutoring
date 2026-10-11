/* One-board analysis: edit a position or watch a verified line, never both at once. */
(() => {
  const parse = (u) => ({
    from: u.slice(0, 2),
    to: u.slice(2, 4),
    promotion: u[4] || "q",
  });
  const images = {
    wk: "4/42/Chess_klt45.svg",
    wq: "1/15/Chess_qlt45.svg",
    wr: "7/72/Chess_rlt45.svg",
    wb: "b/b1/Chess_blt45.svg",
    wn: "7/70/Chess_nlt45.svg",
    wp: "4/45/Chess_plt45.svg",
    bk: "f/f0/Chess_kdt45.svg",
    bq: "4/47/Chess_qdt45.svg",
    br: "f/ff/Chess_rdt45.svg",
    bb: "9/98/Chess_bdt45.svg",
    bn: "e/ef/Chess_ndt45.svg",
    bp: "c/c7/Chess_pdt45.svg",
  };
  const symbols = {
    wk: "♔",
    wq: "♕",
    wr: "♖",
    wb: "♗",
    wn: "♘",
    wp: "♙",
    bk: "♚",
    bq: "♛",
    br: "♜",
    bb: "♝",
    bn: "♞",
    bp: "♟",
  };
  const names = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  };
  class StudyBoard {
    constructor(app) {
      this.app = app;
      this.el = document.getElementById("guidedAnalysisMode");
      this.token = 0;
      this.game = new Chess();
      this.origin = this.game.fen();
      this.flipped = false;
      this.el.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || b.disabled) return;
        if (b.dataset.square) return this.square(b.dataset.square);
        if (b.dataset.promote) {
          const m = this.pending;
          this.pending = null;
          document.getElementById("studyPromotion").hidden = true;
          return this.play({ ...m, promotion: b.dataset.promote });
        }
        const a = b.dataset.study;
        if (a === "import") this.load(this.sourceMode === "play" && window.freePlay ? window.freePlay.viewedFen() : this.app.game.fen());
        if (a === "reset") this.load(this.origin);
        if (a === "undo") {
          this.stop();
          this.replay = null;
          this.game.undo();
          this.analyze();
        }
        if (a === "flip") {
          this.flipped = !this.flipped;
          this.render();
        }
        if (a === "best" || a === "played") this.watch(a);
        if (a === "next") this.step(this.index + 1);
        if (a === "prev") this.step(this.index - 1);
        if (a === "auto") {
          if (this.timer) this.pause();
          else {
            this.timer = setInterval(() => {
              if (this.index >= this.replay.moves.length) this.pause();
              else this.step(this.index + 1);
            }, 1400);
            b.textContent = "Pause";
          }
        }
        if (a === "return") {
          this.pause();
          this.replay = null;
          this.render();
        }
        if (a === "patterns") window.trainer._switchMode("patterns");
        if (a === "retry") this.analyze(this.lastMove);
      });
      this.el.addEventListener(
        "error",
        (e) => {
          if (e.target.tagName === "IMG") {
            const p = e.target.parentElement;
            p.textContent = p.dataset.symbol;
          }
        },
        true,
      );
    }
    onMode(mode) {
      this.active = mode === "deep-analysis";
      this.el.hidden = !this.active;
      if (this.active) {
        if (!this.opened) {
          this.opened = true;
          this.load(this.sourceMode === "play" && window.freePlay ? window.freePlay.viewedFen() : this.app.game.fen());
        } else this.analyze(this.lastMove);
      } else this.stop();
    }
    pause() {
      clearInterval(this.timer);
      this.timer = null;
      document.getElementById("studyAuto").textContent = "Play sequence";
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
      document.getElementById("studyPromotion").hidden = true;
      this.analyze();
    }
    async bounded(p) {
      let timer;
      try {
        return await Promise.race([
          p,
          new Promise(
            (_, reject) =>
              (timer = setTimeout(
                () =>
                  reject(Error("The engine did not respond. Retry analysis.")),
                15000,
              )),
          ),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async analyze(md = null) {
      this.stop();
      this.replay = null;
      this.selected = null;
      this.lines = null;
      this.lastMove = md;
      this.pending = null;
      document.getElementById("studyPromotion").hidden = true;
      document.getElementById("studyDetail").textContent="Checking this position. The assessment will appear here when ready.";
      this.busy = true;
      this.render();
      const token = this.token,
        e = new StockfishEngine("guided-study");
      this.engine = e;
      const root = md?.fenBefore || this.game.fen();
      try {
        if (this.game.game_over() && !md) {
          this.summary = this.game.in_checkmate()
            ? "Checkmate. Undo or load your game to try another idea."
            : "This position is drawn. Undo or load your game to continue.";
          return;
        }
        await this.bounded(e.init());
        if (token !== this.token) return;
        const best = await this.bounded(e.evaluate(root, 16, 1200));
        if (token !== this.token) return;
        const played = md
          ? await this.bounded(
              e.evaluate(root, 16, 1200, [
                md.from + md.to + (md.promotion || ""),
              ]),
            )
          : null;
        if (token !== this.token) return;
        this.lines = {};
        for (const [key, result] of [
          ["best", best],
          ["played", played],
        ]) {
          if (!result) continue;
          const g = new Chess(root),
            line = [];
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
          if (!line.length)
            throw Error("No legal continuation was returned. Retry analysis.");
          const model = window.moveLessons.build(
            md || { fenBefore: root },
            { ...result, pv: line },
            key === "played" ? "What your move allows" : "Engine alternative",
            "",
          );
          this.lines[key] = model;
        }
        const bestSan = this.lines.best.moves[0].san;
        this.summary = md
          ? `You played ${md.san}. Watch the opponent’s reply, then compare ${bestSan}.`
          : `${new Chess(root).turn() === "w" ? "White" : "Black"} to move. Try your idea, or watch ${bestSan} and the reply.`;
        document.getElementById("studyDetail").textContent =
          this.lines.best.whyBetter;
      } catch (error) {
        if (token === this.token) {
          this.summary = error.message;
          document.getElementById("studyRetry").hidden = false;
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
    square(sq) {
      if (this.busy || this.replay || this.pending) return;
      const p = this.game.get(sq);
      if (this.selected) {
        const moves = this.game
          .moves({ square: this.selected, verbose: true })
          .filter((m) => m.to === sq);
        if (moves.length) {
          if (moves.some((m) => m.promotion)) {
            this.pending = { from: this.selected, to: sq };
            document.getElementById("studyPromotion").hidden = false;
            return;
          }
          return this.play(moves[0]);
        }
      }
      this.selected = p?.color === this.game.turn() ? sq : null;
      this.render();
    }
    play(m) {
      const fenBefore = this.game.fen(),
        move = this.game.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion,
        });
      if (!move) return;
      this.analyze({ ...move, fenBefore, fenAfter: this.game.fen() });
    }
    watch(key) {
      if (!this.lines?.[key] || this.busy) return;
      this.pause();
      this.replay = this.lines[key];
      this.index = 1;
      this.render();
      document.getElementById("studyBoard").scrollIntoView({block:"center",behavior:"smooth"});
    }
    step(i) {
      if (!this.replay) return;
      this.index = Math.max(0, Math.min(this.replay.moves.length, i));
      if (this.index === this.replay.moves.length) this.pause();
      this.render();
    }
    render() {
      const v = this.replay,
        g = v ? new Chess(v.positions[this.index]) : this.game,
        last = v?.moves[this.index - 1] || (!v ? this.lastMove : null),
        legal =
          this.selected && !v
            ? g.moves({ square: this.selected, verbose: true }).map((m) => m.to)
            : [];
      const board = document.getElementById("studyBoard");
      board.replaceChildren();
      for (let r = 0; r < 8; r++)
        for (let f = 0; f < 8; f++) {
          const rank = this.flipped ? r + 1 : 8 - r,
            file = this.flipped ? 7 - f : f,
            sq = String.fromCharCode(97 + file) + rank,
            p = g.get(sq),
            b = document.createElement("button");
          b.type = "button";
          b.dataset.square = sq;
          b.className = `learning-square ${(file + rank) % 2 ? "dark" : "light"} ${this.selected === sq ? "selected" : ""} ${legal.includes(sq) ? "possible" : ""} ${last && (last.from === sq || last.to === sq) ? "study-last" : ""}`;
          b.disabled = this.busy || !!v;
          b.setAttribute(
            "aria-label",
            `${sq}${p ? ", " + (p.color === "w" ? "White" : "Black") + " " + names[p.type] : ", empty"}`,
          );
          const span = document.createElement("span");
          span.className = "learning-piece";
          if (p) {
            span.dataset.symbol = symbols[p.color + p.type];
            const img = document.createElement("img");
            img.src =
              "https://upload.wikimedia.org/wikipedia/commons/" +
              images[p.color + p.type];
            img.alt = "";
            span.append(img);
          }
          b.append(span);
          if (f === 0) {
            const label = document.createElement("span");
            label.className = "learning-rank";
            label.textContent = rank;
            b.append(label);
          }
          if (r === 7) {
            const label = document.createElement("span");
            label.className = "learning-file";
            label.textContent = String.fromCharCode(97 + file);
            b.append(label);
          }
          board.append(b);
        }
      document.getElementById("studyState").textContent = v
        ? `Watching · ${this.index} of ${v.moves.length} moves`
        : this.busy
          ? "Checking the position…"
          : `${g.turn() === "w" ? "White" : "Black"} to move · Try your idea`;
      document.getElementById("studyInstruction").textContent = v
        ? "The highlighted squares show the move. Use Next move, or return to try your own idea."
        : "Select a piece, then a highlighted square. You control both sides; no surprise bot moves.";
      document.getElementById("studyExplanation").textContent = v
        ? this.index
          ? last.note
          : "Starting position. Next move begins the demonstration."
        : this.busy
          ? "Checking a line with replies from both sides…"
          : this.summary || "Try a move to begin.";
      document.getElementById("studyReplayControls").hidden = !v;
      document.getElementById("studyChoices").hidden = !!v;
      document.getElementById("studyBest").disabled =
        this.busy || !this.lines?.best;
      document.getElementById("studyPlayed").hidden = !this.lines?.played;
      document.getElementById("studyPlayed").disabled = this.busy;
      document.getElementById("studyPrev").disabled = !v || !this.index;
      document.getElementById("studyNext").disabled =
        !v || this.index === v.moves.length;
      document.getElementById("studyAuto").disabled =
        !v || this.index === v.moves.length;
      document.getElementById("studyUndo").disabled =
        this.busy || !this.game.history().length;
      document.getElementById("studyRetry").hidden =
        this.busy || !!this.lines?.best;
    }
  }
  window.StudyBoard = StudyBoard;
})();

/* A separate, engine-optional sandbox. PGN replay never mutates the coach game. */
(() => {
  const imgs = {
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
    },
    names = {
      p: "pawn",
      n: "knight",
      b: "bishop",
      r: "rook",
      q: "queen",
      k: "king",
    };
  const move = (u) => ({
    from: u.slice(0, 2),
    to: u.slice(2, 4),
    promotion: u[4] || "q",
  });
  class FreePlay {
    constructor() {
      this.el = document.getElementById("freePlayMode");
      this.game = new Chess();
      this.root = this.game.fen();
      this.positions = [this.root];
      this.moves = [];
      this.index = 0;
      this.token = 0;
      this.human = null;
      this.flipped = false;
      this.original = null;
      this.active = true;
      this.el.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || b.disabled) return;
        if (b.dataset.square) return this.square(b.dataset.square);
        if (b.dataset.freePly != null)
          return this.go(Number(b.dataset.freePly));
        if (b.dataset.freePromote) {
          const pending = this.pending;
          this.pending = null;
          return this.play({ ...pending, promotion: b.dataset.freePromote });
        }
        switch (b.dataset.free) {
          case "first":
            this.go(0);
            break;
          case "prev":
            this.go(this.index - 1);
            break;
          case "next":
            this.go(this.index + 1);
            break;
          case "last":
            this.go(this.moves.length);
            break;
          case "flip":
            this.flipped = !this.flipped;
            this.render();
            break;
          case "new":
            this.loadGame(new Chess());
            this.original = null;
            this.render();
            break;
          case "export":
            this.download(this.exportPGN(), "chess-game.pgn");
            break;
          case "original":
            this.download(this.original, "original-game.pgn");
            break;
          case "import":
            window.pgnTarget = "free";
            document.getElementById("pgnError").textContent = "";
            document.getElementById("pgnDialog").showModal();
            break;
          case "continue":
            this.continueAs(document.getElementById("freeSide").value);
            break;
          case "study": {
            const fen = this.viewedFen();
            window.trainer._switchMode("deep-analysis");
            window.studyBoard.load(fen);
            break;
          }
          case "review":
            if (this.moves.length) window.gameReview.openFromFree();
            else {
              this.message = "Make some moves or open a PGN first, then review the game.";
              this.render();
            }
            break;
        }
      });
      this.el.addEventListener(
        "error",
        (e) => {
          if (e.target.tagName === "IMG")
            e.target.parentElement.textContent =
              e.target.parentElement.dataset.symbol;
        },
        true,
      );
      this.el.addEventListener("dragstart", (e) => {
        const sq = e.target.closest("[data-square]");
        if (!sq || !this.canMove()) {
          e.preventDefault();
          return;
        }
        const p = new Chess(this.viewedFen()).get(sq.dataset.square);
        if (!p || p.color !== new Chess(this.viewedFen()).turn()) {
          e.preventDefault();
          return;
        }
        this.dragFrom = sq.dataset.square;
        e.dataTransfer.setData("text/plain", this.dragFrom);
      });
      this.el.addEventListener("dragover", (e) => {
        if (e.target.closest("[data-square]")) e.preventDefault();
      });
      this.el.addEventListener("drop", (e) => {
        e.preventDefault();
        const sq = e.target.closest("[data-square]"),
          from = this.dragFrom;
        this.dragFrom = null;
        if (sq && from) {
          this.selected = from;
          this.square(sq.dataset.square);
        }
      });
      document.getElementById("pgnClose").onclick = () =>
        document.getElementById("pgnDialog").close();
      // The import dialog serves Free Play and Game Review.
      const route = (text) =>
        window.pgnTarget === "review" ? window.gameReview.importPGN(text) : this.importPGN(text);
      document.getElementById("pgnLoad").onclick = () =>
        route(document.getElementById("pgnText").value);
      document.getElementById("pgnFile").onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          this.importError("Choose one PGN game smaller than 2 MB.");
          return;
        }
        try {
          const text = await file.text();
          document.getElementById("pgnText").value = text;
          route(text);
        } catch {
          this.importError("The file could not be read.");
        } finally {
          e.target.value = "";
        }
      };
      document.getElementById("freeDifficulty").onchange = () => {
        if (this.human) this.continueAs(this.human);
      };
      this.onMode("play");
      this.render();
    }
    viewedFen() {
      return this.positions[this.index];
    }
    onMode(mode) {
      this.active = mode === "play";
      this.el.hidden = !this.active;
      document.getElementById("loadingOverlay").hidden = this.active;
      if (!this.active) this.cancel();
      else {
        document.getElementById("playMode").style.display = "none";
        this.render();
        this.maybeBot();
      }
    }
    cancel() {
      this.token++;
      this.engine?.destroy();
      this.engine = null;
      this.busy = false;
      this.pending = null;
      this.selected = null;
      this.dragFrom = null;
    }
    go(index) {
      this.cancel();
      this.index = Math.max(0, Math.min(this.moves.length, index));
      this.message =
        "Viewing the game. Choose a continuation below to play this position.";
      this.render();
    }
    rebuild() {
      const history = this.game.history({ verbose: true }),
        g = new Chess(this.root);
      this.positions = [g.fen()];
      this.moves = [];
      for (const m of history) {
        const played = g.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion,
        });
        if (!played) throw Error("Invalid game history");
        this.moves.push(played);
        this.positions.push(g.fen());
      }
      this.index = this.moves.length;
    }
    loadGame(game) {
      this.cancel();
      const headers = game.header();
      this.root = headers.FEN || new Chess().fen();
      this.game = game;
      this.human = null;
      this.rebuild();
      this.message =
        "You control both sides. No bot will move unless you choose one.";
      document.getElementById("freeSide").value = "both";
      this.render();
    }
    branch() {
      if (this.index === this.moves.length) return;
      const headers = this.game.header(),
        g = new Chess(this.root);
      for (const [k, v] of Object.entries(headers)) g.header(k, v);
      for (const m of this.moves.slice(0, this.index))
        g.move({ from: m.from, to: m.to, promotion: m.promotion });
      g.header("Result", "*");
      this.game = g;
      this.rebuild();
      this.message = this.original
        ? "A new continuation starts here. Download original PGN keeps the imported main line."
        : "A new continuation starts here. Later moves have been replaced in this working copy.";
    }
    continueAs(side) {
      this.cancel();
      this.branch();
      this.human = side === "both" ? null : side;
      document.getElementById("freeSide").value = side;
      this.message = this.human
        ? `You play ${side === "w" ? "White" : "Black"}; the bot plays the other side.`
        : "You control both sides. No automatic replies.";
      this.render();
      this.maybeBot();
    }
    fromFen(fen, side = "both") {
      this.loadGame(new Chess(fen));
      this.original = null;
      this.root = fen;
      this.positions = [fen];
      window.trainer._switchMode("play");
      this.continueAs(side);
    }
    canMove() {
      return (
        this.active &&
        !this.busy &&
        !this.pending &&
        (!this.human || new Chess(this.viewedFen()).turn() === this.human)
      );
    }
    square(sq) {
      if (!this.canMove()) return;
      const g =
        this.index === this.moves.length
          ? this.game
          : new Chess(this.viewedFen());
      if (g.game_over()) return;
      if (this.selected) {
        const choices = g
          .moves({ square: this.selected, verbose: true })
          .filter((m) => m.to === sq);
        if (choices.length) {
          if (choices.some((m) => m.promotion)) {
            this.pending = { from: this.selected, to: sq };
            this.render();
            return;
          }
          this.play(choices[0]);
          return;
        }
      }
      const p = g.get(sq);
      this.selected = p?.color === g.turn() ? sq : null;
      this.render();
    }
    play(m) {
      if (this.busy) return;
      this.branch();
      const played = this.game.move({
        from: m.from,
        to: m.to,
        promotion: m.promotion,
      });
      if (!played) return;
      this.game.header("Result", "*");
      this.pending = null;
      this.selected = null;
      this.rebuild();
      this.message = "";
      ChessSounds.playMoveSound(played);
      this.render();
      this.maybeBot();
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
                  reject(
                    Error(
                      "The bot did not respond. Choose Continue to retry, or switch to both sides.",
                    ),
                  ),
                15000,
              )),
          ),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async maybeBot() {
      if (
        !this.active ||
        !this.human ||
        this.busy ||
        this.index !== this.moves.length ||
        this.game.game_over() ||
        this.game.turn() === this.human
      )
        return;
      const token = this.token,
        fen = this.game.fen(),
        e = new StockfishEngine("free-play-bot");
      this.engine = e;
      this.busy = true;
      this.render();
      try {
        await this.bounded(e.init());
        if (token !== this.token) return;
        await this.bounded(
          e.setOptions({
            "Skill Level": Number(
              document.getElementById("freeDifficulty").value,
            ),
          }),
        );
        if (token !== this.token) return;
        const r = await this.bounded(e.evaluate(fen, 12, 700));
        if (token !== this.token || this.game.fen() !== fen) return;
        const played = r.bestMove && this.game.move(move(r.bestMove));
        if (!played)
          throw Error(
            "The bot could not find a legal move. Choose Continue to retry.",
          );
        this.game.header("Result", "*");
        this.rebuild();
        ChessSounds.playMoveSound(played);
        this.message = "Your turn.";
      } catch (error) {
        if (token === this.token) this.message = error.message;
      } finally {
        e.destroy();
        if (token === this.token) {
          this.engine = null;
          this.busy = false;
          this.render();
        }
      }
    }
    importError(message) {
      document.getElementById("pgnError").textContent = message;
    }
    // Validate one PGN game and return it as a chess.js game, or throw a readable error.
    static parsePGN(text) {
      if (!text.trim() || text.length > 2 * 1024 * 1024)
        throw Error("Paste one PGN game, up to 2 MB.");
      if ((text.match(/\[Event\s+"/g) || []).length > 1)
        throw Error("Select one game at a time.");
      const candidate = new Chess();
      if (!candidate.load_pgn(text, { sloppy: true }))
        throw Error(
          "This PGN could not be read. Check the move notation and any starting FEN.",
        );
      const start = new Chess(candidate.header().FEN || new Chess().fen());
      const pieces = start.board().flat().filter(Boolean);
      if (
        ["w", "b"].some(
          (color) =>
            pieces.filter((p) => p.type === "k" && p.color === color)
              .length !== 1,
        )
      )
        throw Error(
          "The starting position must contain one king of each color.",
        );
      return candidate;
    }
    importPGN(text) {
      this.importError("");
      try {
        const candidate = FreePlay.parsePGN(text);
        this.original = text;
        this.loadGame(candidate);
        this.index = 0;
        this.message =
          "PGN loaded at the start. Step through the moves, or choose Review this game for a move-by-move lesson. Comments and side variations stay in the original file; the board shows the main line.";
        this.render();
        document.getElementById("pgnDialog").close();
        return true;
      } catch (error) {
        this.importError(error.message);
        return false;
      }
    }
    exportPGN() {
      const g = this.game;
      let result = ["1-0", "0-1", "1/2-1/2"].includes(g.header().Result)
        ? g.header().Result
        : "*";
      if (g.in_checkmate()) result = g.turn() === "w" ? "0-1" : "1-0";
      else if (g.game_over()) result = "1/2-1/2";
      g.header("Result", result);
      if (!g.header().Event) g.header("Event", "Chess Tutor Free Play");
      // chess.js 0.10 omits the header/movetext separator for a zero-move game.
      return g.pgn({ max_width: 80 }).replace(/\]\n(?=(?:\*|1-0|0-1|1\/2-1\/2)(?:\s|$))/, "]\n\n") + "\n";
    }
    download(text, name) {
      if (!text) return;
      const url = URL.createObjectURL(
          new Blob([text], { type: "application/x-chess-pgn;charset=utf-8" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    render() {
      const g =
          this.index === this.moves.length
            ? this.game
            : new Chess(this.viewedFen()),
        board = document.getElementById("freeBoard");
      const destinations = this.selected
        ? g.moves({ square: this.selected, verbose: true }).map((m) => m.to)
        : [];
      const last = this.moves[this.index - 1];
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
          b.className = `learning-square ${(file + rank) % 2 ? "dark" : "light"} ${this.selected === sq ? "selected" : ""} ${destinations.includes(sq) ? "possible" : ""} ${last && (last.from === sq || last.to === sq) ? "study-last" : ""}`;
          b.disabled = this.busy || !!this.pending;
          b.setAttribute(
            "aria-label",
            `${sq}, ${p ? (p.color === "w" ? "White " : "Black ") + names[p.type] : "empty"}`,
          );
          const span = document.createElement("span");
          span.className = "learning-piece";
          if (p) {
            span.dataset.symbol = symbols[p.color + p.type];
            const img = document.createElement("img");
            img.src =
              "https://upload.wikimedia.org/wikipedia/commons/" +
              imgs[p.color + p.type];
            img.alt = "";
            img.draggable = true;
            span.append(img);
          }
          b.append(span);
          if (f === 0) {
            const l = document.createElement("span");
            l.className = "learning-rank";
            l.textContent = rank;
            b.append(l);
          }
          if (r === 7) {
            const l = document.createElement("span");
            l.className = "learning-file";
            l.textContent = String.fromCharCode(97 + file);
            b.append(l);
          }
          board.append(b);
        }
      let status = this.busy
        ? "Bot is thinking…"
        : `${g.turn() === "w" ? "White" : "Black"} to move${g.in_check() ? " · Check" : ""}`;
      if (g.in_checkmate()) status = "Checkmate";
      else if (g.game_over()) status = "Draw — this position is finished";
      document.getElementById("freeState").textContent = status;
      document.getElementById("freeMessage").textContent =
        this.message ||
        (this.human
          ? "Play your side, or switch to both sides below."
          : "Move either side in turn. Click a piece and its destination.");
      document.getElementById("freePosition").textContent =
        `Position ${this.index} of ${this.moves.length}`;
      document.getElementById("freePromotion").hidden = !this.pending;
      document.getElementById("freeOriginal").hidden = !this.original;
      for (const [action, disabled] of [
        ["first", this.index === 0],
        ["prev", this.index === 0],
        ["next", this.index === this.moves.length],
        ["last", this.index === this.moves.length],
      ])
        this.el.querySelector(`[data-free=${action}]`).disabled = disabled;
      const list = document.getElementById("freeMoves");
      list.replaceChildren();
      this.moves.forEach((m, i) => {
        const b = document.createElement("button");
        b.className =
          "btn btn-secondary" + (i + 1 === this.index ? " free-current" : "");
        b.dataset.freePly = i + 1;
        const n = this.positions[i].split(" ")[5];
        b.textContent = `${n}${m.color === "w" ? "." : "…"} ${m.san}`;
        b.setAttribute("aria-current", i + 1 === this.index ? "step" : "false");
        list.append(b);
      });
      if (!this.moves.length) list.textContent = "Your moves will appear here.";
      document.getElementById("freeContinuation").textContent =
        this.index < this.moves.length
          ? "Continuing here replaces later moves in your working copy. Export first to keep your current line."
          : "Continue from this position — checkmate is not required.";
    }
  }
  window.FreePlay = FreePlay;
})();

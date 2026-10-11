/* Concrete, reversible board demonstrations for actual moves from the game. */
(() => {
  const obj = (u) => ({
    from: u.slice(0, 2),
    to: u.slice(2, 4),
    promotion: u[4] || "q",
  });
  const uci = (m) => m.from + m.to + (m.promotion || "");
  const names = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  };
  const weights = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const material = (g, color) =>
    g
      .board()
      .flat()
      .reduce(
        (n, p) => n + (p ? weights[p.type] * (p.color === color ? 1 : -1) : 0),
        0,
      );
  const san = (fen, u) => new Chess(fen).move(obj(u))?.san || u;
  class MoveLessons {
    constructor(app) {
      this.app = app;
      this.token = 0;
      this.button = document.getElementById("showMoveWhy");
      this.button.addEventListener("click", () => this.open());
      document
        .getElementById("lessonPlayed")
        .addEventListener("click", () => this.show("played"));
      document
        .getElementById("lessonBest")
        .addEventListener("click", () => this.show("best"));
      document.getElementById("lessonPredict").addEventListener("click", () => {
        const v = this.app.activeVariation,
          index = this.app.varStepIndex,
          select = document.getElementById("lessonPrediction");
        if (!v?.moveLesson || !select.value) return;
        const actual = v.moves[index];
        const matches = select.value === uci(actual);
        this.app._stepVariation(index + 1);
        document.getElementById("lessonPredictionFeedback").textContent =
          matches
            ? "You anticipated the engine’s continuation."
            : `The illustrated continuation is ${actual.san}. Your alternative is not automatically wrong; this comparison follows the engine’s line.`;
      });
    }
    update(md) {
      const index = this.app.moveData.indexOf(md);
      const target = md?.isPlayer
        ? md
        : index > 0
          ? this.app.moveData[index - 1]
          : null;
      if (target !== this.target) {
        this.token++;
        this.target = target;
        this.comparison = null;
        this.button.disabled = false;
        this.button.textContent = "Show why on the board";
        document.getElementById("moveWhyStatus").textContent = "";
      }
      this.button.hidden = !target?.isPlayer;
    }
    cancel() {
      this.token++;
      this.engine?.destroy();
      this.engine = null;
      this.button.disabled = false;
    }
    async bounded(p) {
      let timer;
      try {
        return await Promise.race([
          p,
          new Promise(
            (_, reject) =>
              (timer = setTimeout(
                () => reject(Error("Analysis timed out. Try again.")),
                15000,
              )),
          ),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async open() {
      if (!this.target) return;
      const status = document.getElementById("moveWhyStatus");
      if (this.app.thinking) {
        status.textContent =
          "Wait for the bot to finish its move, then open the comparison.";
        return;
      }
      if (this.comparison) {
        this.show("played");
        return;
      }
      this.cancel();
      const token = this.token,
        md = this.target,
        liveFen = this.app.game.fen(),
        e = new StockfishEngine("move-demonstration");
      this.engine = e;
      this.button.disabled = true;
      status.textContent =
        "Checking your move and the alternative from the same position…";
      try {
        await this.bounded(e.init());
        if (token !== this.token) return;
        const root = md.fenBefore,
          playedUci = md.from + md.to + (md.promotion || "");
        const best = await this.bounded(e.evaluate(root, 17, 1800));
        if (token !== this.token) return;
        const played = await this.bounded(
          e.evaluate(root, 17, 1800, [playedUci]),
        );
        if (token !== this.token) return;
        // Extend short PVs with fresh searches. Both sides remain engine-controlled.
        for (const result of [played, best]) {
          if (!result.pv?.length || !new Chess(root).move(obj(result.pv[0])))
            throw Error("No verified continuation is available. Try again.");
          const g = new Chess(root);
          const line = [];
          for (const u of result.pv.slice(0, 10)) {
            if (!g.move(obj(u))) break;
            line.push(u);
          }
          while (line.length < 6 && !g.game_over()) {
            const next = await this.bounded(e.evaluate(g.fen(), 15, 700));
            if (token !== this.token) return;
            if (!next.pv?.[0] || !g.move(obj(next.pv[0]))) break;
            line.push(next.pv[0]);
          }
          result.pv = line;
        }
        if (this.app.game.fen() !== liveFen || this.app.thinking) {
          status.textContent =
            "The game advanced during analysis. Open the comparison again after the move finishes.";
          return;
        }
        const score = (r) =>
          r.mate != null ? (r.mate > 0 ? 10000 : -10000) : r.score;
        const gap = Math.max(0, score(best) - score(played));
        const label = this.app.coach.classifyMove(
          gap,
          playedUci === best.pv[0],
          false,
          false,
        );
        const verdict =
          gap <= 90
            ? "This deeper comparison finds no substantial loss from your move."
            : `At this depth, your move is rated ${label}; the engine prefers ${san(root, best.pv[0])}.`;
        this.comparison = {
          played: this.build(md, played, "Your move", verdict),
          best: this.build(md, best, "Engine alternative", verdict),
        };
        status.textContent = verdict;
        document.getElementById("quickCoachLesson").textContent = verdict;
        document.getElementById("quickCoachThreat").textContent =
          "After your move: " +
          this.comparison.played.moves
            .slice(0, 4)
            .map((m) => m.san)
            .join(" → ");
        document.getElementById("quickCoachLine").textContent =
          this.comparison.best.moves
            .slice(0, 4)
            .map((m) => m.san)
            .join(" → ");
        this.show("played");
      } catch (error) {
        if (token === this.token) status.textContent = error.message;
      } finally {
        e.destroy();
        if (this.engine === e) this.engine = null;
        if (token === this.token) this.button.disabled = false;
      }
    }
    build(md, result, title, verdict) {
      const g = new Chess(md.fenBefore),
        color = g.turn(),
        start = material(g, color),
        positions = [g.fen()],
        moves = [];
      for (const u of result.pv) {
        const before = g.fen(),
          m = g.move(obj(u));
        if (!m) break;
        const net = material(g, color) - start;
        let note = `${m.color === color ? "Your side" : "Opponent"}: ${m.san}. `;
        if (m.captured)
          note += `Takes the ${names[m.captured]} on ${m.to} (${weights[m.captured]} points). `;
        if (g.in_checkmate())
          note += "Checkmate: no legal escape, capture or block remains. ";
        else if (g.in_check())
          note +=
            "This gives check, so the next move must deal with the king’s safety. ";
        else {
          if (new Chess(before).in_check())
            note += "Answers the check and makes the king safe for this move. ";
          const threats = this.newCaptures(before, g.fen(), m.color);
          if (threats.length)
            note += `Creates a legal capture threat: ${threats.join(", ")}. The opponent can still defend. `;
          else if (
            ["n", "b"].includes(m.piece) &&
            ["1", "8"].includes(m.from[1]) &&
            !["1", "8"].includes(m.to[1])
          )
            note +=
              "Develops a minor piece from its starting rank so it can join the fight. ";
          else if (m.piece === "p" && ["d4", "e4", "d5", "e5"].includes(m.to))
            note +=
              "Places a pawn in the center, contesting space for the pieces. ";
          else if (m.flags.includes("k") || m.flags.includes("q"))
            note += "Castles: moves the king and brings the rook into play. ";
          else
            note +=
              "Watch the next reply before deciding whether this move achieves its aim. ";
        }
        note += `Material change for your side so far: ${net >= 0 ? "+" : ""}${net}. ${net < 0 ? "You have invested material; follow the replies to see whether it is recovered or compensated." : ""}`;
        moves.push({ ...m, fen: g.fen(), note });
        positions.push(g.fen());
      }
      const estimate =
        result.mate != null
          ? `Stockfish finds mate ${result.mate > 0 ? "for" : "against"} your side in ${Math.abs(result.mate)}.`
          : `Engine estimate ${(result.score / 100).toFixed(2)} pawns for your side.`;
      const delta = material(g, color) - start;
      const outcome = g.in_checkmate()
        ? "The illustrated line ends in checkmate."
        : `The illustrated line ends with a material change of ${delta >= 0 ? "+" : ""}${delta} for your side. ${delta === 0 ? "No net material gain occurs within this excerpt; the score alone does not explain the whole position." : "Include every recapture when judging the investment."}`;
      return {
        title: `${title}: ${moves[0]?.san || ""}`,
        positions,
        moves,
        moveLesson: true,
        whyBetter: `${verdict} ${estimate} Search depth ${result.depth}. ${outcome} This is a finite engine search, not a promise that the opponent will cooperate. Predict each reply or use Next to reveal it.`,
      };
    }
    newCaptures(before, after, color) {
      const captures = (fen) => {
        const parts = fen.split(" ");
        parts[1] = color;
        parts[3] = "-";
        return new Chess(parts.join(" "))
          .moves({ verbose: true })
          .filter((m) => m.captured && m.captured !== "k");
      };
      const prior = new Set(captures(before).map((m) => m.to));
      return captures(after)
        .filter((m) => !prior.has(m.to))
        .slice(0, 2)
        .map((m) => `${names[m.captured]} on ${m.to} with ${m.san}`);
    }
    show(which) {
      if (this.comparison) this.app._previewVariation(this.comparison[which]);
    }
    onStep(v, index) {
      const box = document.getElementById("moveLessonControls");
      box.hidden = !v?.moveLesson;
      if (box.hidden) return;
      const select = document.getElementById("lessonPrediction"),
        g = new Chess(v.positions[index]);
      select.replaceChildren(new Option("Choose the move you expect", ""));
      for (const m of g.moves({ verbose: true }))
        select.add(new Option(m.san, uci(m)));
      const ended = index >= v.moves.length || g.game_over();
      select.disabled = ended;
      document.getElementById("lessonPredict").disabled = ended;
      document.getElementById("lessonPredictionLabel").textContent = ended
        ? "End of this illustrated line"
        : `${g.turn() === "w" ? "White" : "Black"} to move — predict the next move`;
      document.getElementById("lessonPredictionFeedback").textContent = "";
    }
  }
  window.MoveLessons = MoveLessons;
})();

/* Guided pattern practice. Engine searches use an isolated, sequential worker. */
(() => {
  "use strict";
  const DAY = 86400000,
    KEY = "chess-tutor.patterns.v1";
  const PIECE_IMAGES = {
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
  const move = (u) => ({
    from: u.slice(0, 2),
    to: u.slice(2, 4),
    promotion: u[4] || "q",
  });
  const uci = (m) => m.from + m.to + (m.promotion || "");
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const legal = new Chess();
  "e4 e5 Nf3 Nc6 Bc4 d6 Nc3 Bg4 h3 Bh5"
    .split(" ")
    .forEach((m) => legal.move(m));
  const LESSONS = [
    {
      id: "fork",
      name: "Knight forks",
      fen: "3q3k/p7/8/4N3/8/8/P7/6K1 w - - 0 1",
      key: "e5f7",
      line: ["e5f7", "h8g8", "f7d8"],
      idea: "A knight can check the king and attack the queen at the same time. Look for a square that attacks both targets.",
      steps: [
        "Nf7+ attacks h8 and d8. The check buys time to collect the queen.",
        "The king must leave check. The queen cannot move instead.",
        "Nxd8 collects the queen. Count what remains, then convert patiently.",
      ],
      defense:
        "Before a fork arrives, move a target or control the fork square. Once forked with check, move the king and limit the damage.",
    },
    {
      id: "backrank",
      name: "Queen sacrifice: back rank",
      fen: "r5k1/4Qppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
      key: "e7e8",
      line: ["e7e8", "a8e8", "e1e8"],
      idea: "The king has no escape behind its own pawns. A queen can draw the defending rook onto the square your rook needs.",
      steps: [
        "Qe8+ offers the queen, with a rook ready to recapture.",
        "Rxe8 removes the queen but puts the defender on e8.",
        "Rxe8 is checkmate: the pawns block every escape. Material no longer matters.",
      ],
      defense:
        "Create a safe escape square before the forcing sequence, or exchange the attacking rook. After Qe8+ here, defense is too late.",
    },
    {
      id: "exchange",
      name: "Rook investment: force a fork",
      fen: "3q4/p7/3b1k2/8/8/2N5/P7/R2R2K1 w - - 0 1",
      key: "d1d6",
      line: ["d1d6", "d8d6", "c3e4", "f6e5", "e4d6", "e5d6"],
      idea: "Calculate beyond the first recapture. Rxd6+ removes the bishop and invites the queen onto a knight-fork square.",
      steps: [
        "The rook takes a bishop with check. If the king moves, inspect Rxd8 next.",
        "The queen accepts the rook. White has temporarily given up a rook for a bishop.",
        "Ne4+ forks the king and queen. This is the point of the investment.",
        "Ke5 answers the check and prepares to recapture on d6.",
        "The knight takes the queen, but the exchange is not over.",
        "Kxd6 recaptures the knight. White still has a rook: count the entire sequence, including this recapture.",
      ],
      defense:
        "Look one move beyond a tempting capture. Compare accepting the rook with moving the king; choose the line that preserves the most chances.",
    },
    {
      id: "discovered",
      name: "Bishop sacrifice: discovered attack",
      fen: "4q1k1/7p/8/8/4B3/8/P7/4R1K1 w - - 0 1",
      key: "e4h7",
      line: ["e4h7", "g8h7", "e1e8"],
      idea: "Moving the bishop uncovers the rook’s attack on the queen. Doing it with check prevents the queen from escaping immediately.",
      steps: [
        "Bxh7+ opens the e-file while checking the king.",
        "Even accepting the bishop does not save the queen.",
        "Rxe8 collects the queen. A bishop and a queen are very different investments.",
      ],
      defense:
        "Notice the rook behind the bishop. Against discovered checks, evaluate both the checking piece and the newly opened line.",
    },
    {
      id: "pin",
      name: "Relative pins: Légal’s idea",
      fen: legal.fen(),
      key: "f3e5",
      line: ["f3e5", "h5d1", "c4f7", "e8e7", "c3d5"],
      idea: "A knight pinned to a queen can legally move. Nxe5 invites a queen capture, but Black can decline it. This example is a trap to understand, not a forced queen sacrifice.",
      steps: [
        "Nxe5 breaks a relative pin. White must calculate the queen capture before doing this.",
        "Bxd1 is the tempting mistake, not a forced reply.",
        "Bxf7+ starts the mating sequence.",
        "Ke7 is forced in this branch.",
        "Nd5 is mate. In practice, compare Black’s stronger alternatives instead of assuming Bxd1.",
      ],
      defense:
        "Decline the bait. Compare Nxe5 with the queen capture and check whether White can take the bishop on h5.",
    },
    {
      id: "restraint",
      name: "When the bishop sacrifice fails",
      fen: "rnbq1rk1/pppnbppp/4p3/3pP3/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w - - 0 1",
      key: "d3h7",
      line: ["d3h7", "g8h7", "f3g5", "e7g5"],
      reject: true,
      idea: "Bxh7+ resembles a famous mating pattern, but the bishop on e7 can capture the knight that follows. Recognizing a pattern does not make the sacrifice sound.",
      steps: [
        "Bxh7+ offers a bishop. First ask which attackers can actually join.",
        "Kxh7 accepts the gift.",
        "Ng5+ looks dangerous, but inspect all Black captures.",
        "Bxg5 removes the next attacker. The familiar-looking sequence has failed.",
      ],
      defense:
        "Capture or exchange an attacking piece when safe. Calculate checks and captures before retreating automatically.",
    },
    {
      id: "breakthrough",
      name: "Pawn breaks: create a passer",
      fen: "7k/ppp5/8/PPP5/8/8/8/7K w - - 0 1",
      key: "b5b6",
      line: ["b5b6", "c7b6", "a5a6", "b7a6", "c5c6"],
      idea: "A pawn sacrifice can pull the opposing pawns away from a promotion route. Calculate both captures of b6 before committing.",
      steps: [
        "b6 offers the middle pawn to break the blockade.",
        "If cxb6, look for a second pawn sacrifice on the other wing.",
        "a6 diverts the b7 pawn away from the c-file.",
        "After bxa6, the c-pawn has an open route.",
        "c6 starts the promotion race. Count how many moves each side needs; if Black instead played axb6, examine c6 and then a6.",
      ],
      defense:
        "Stop a breakthrough before the pawns reach this formation. After a sacrifice, compare declining it and both possible captures; count promotion tempos.",
    },
    {
      id: "escape",
      name: "Defense: save the back rank",
      fen: "6k1/r4ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1",
      key: "h7h6",
      line: ["h7h6", "e1e8", "g8h7"],
      idea: "White threatens Re8 mate. Black can make an escape square or defend the back rank. There may be several good defensive moves.",
      steps: [
        "h6 opens h7 for the king. Verify that the escape square is not attacked.",
        "Re8 is now only a check.",
        "Kh7 escapes safely. A quiet defensive move prevented mate.",
      ],
      defense:
        "Name the threat first. Then compare an escape square, a block, an exchange, or a countercheck. A draw can be a successful result.",
    },
  ];
  const value = (r) =>
    r.mate != null ? Math.sign(r.mate) * (100000 - Math.abs(r.mate)) : r.score;
  const sound = (best, chosen) =>
    best.mate > 0
      ? chosen.mate > 0
      : best.mate < 0
        ? chosen.mate == null ||
          chosen.mate > 0 ||
          Math.abs(chosen.mate) >= Math.abs(best.mate) - 1
        : value(best) - value(chosen) <= 70;
  function notation(fen, line) {
    const g = new Chess(fen),
      out = [];
    for (const u of line || []) {
      const m = g.move(move(u));
      if (!m) break;
      out.push(m.san);
    }
    return out.join(" ");
  }
  function balance(fen, color) {
    let n = 0;
    for (const row of new Chess(fen).board())
      for (const p of row)
        if (p)
          n +=
            { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[p.type] *
            (p.color === color ? 1 : -1);
    return n;
  }
  function flip(fen) {
    const [placement, turn] = fen.split(" ");
    return (
      placement
        .split("/")
        .reverse()
        .map((r) =>
          r.replace(/[a-zA-Z]/g, (c) =>
            c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase(),
          ),
        )
        .join("/") +
      " " +
      (turn === "w" ? "b" : "w") +
      " - - 0 1"
    );
  }
  const flipMove = (u) =>
    u[0] + (9 - Number(u[1])) + u[2] + (9 - Number(u[3])) + (u[4] || "");
  class PatternController {
    constructor() {
      this.el = document.getElementById("patternsMode");
      this.el.addEventListener(
        "error",
        (event) => {
          const img = event.target;
          if (img.tagName === "IMG" && img.parentElement?.dataset.symbol) {
            const piece = img.parentElement;
            piece.textContent = piece.dataset.symbol;
            piece.classList.add("pattern-piece");
          }
        },
        true,
      );
      this.serial = 0;
      this.active = false;
      this.busy = false;
      this.data = { results: {}, recent: [] };
      try {
        const d = JSON.parse(localStorage.getItem(KEY));
        if (d && d.results && Array.isArray(d.recent)) {
          this.data.recent = d.recent
            .filter((x) => typeof x === "string")
            .slice(-500);
          for (const l of LESSONS) {
            const r = d.results[l.id];
            if (
              r &&
              ["attempts", "clean", "defense", "due", "last", "retained"].every(
                (k) => Number.isFinite(r[k]) && r[k] >= 0,
              )
            )
              this.data.results[l.id] = r;
          }
        }
      } catch {}
      this.el.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || b.disabled) return;
        const a = b.dataset.action;
        if (b.dataset.lesson) this.start(b.dataset.lesson);
        else if (a === "hub") this.hub();
        else if (a === "next-example") this.exampleStep(1);
        else if (a === "prev-example") this.exampleStep(-1);
        else if (a === "calculate") this.prepare();
        else if (a === "submit") this.submit();
        else if (a === "defend") this.defend();
        else if (a === "submit-defense") this.submitDefense();
        else if (a === "review") this.review();
        else if (a === "replay-prev") this.replay(-1);
        else if (a === "replay-next") this.replay(1);
        else if (a === "again") this.prepare();
        else if (a === "hint") this.hint();
        else if (a === "recommended") this.start(this.recommended().id);
        else if (b.dataset.branch) this.setReplay(Number(b.dataset.branch));
      });
      this.el.addEventListener("change", (e) => {
        if (["planA", "planReply"].includes(e.target.id)) this.planOptions();
        if (e.target.id === "reviewBranch")
          this.setReplay(Number(e.target.value));
      });
    }
    onMode(mode) {
      this.active = mode === "patterns";
      this.el.style.display = this.active ? "" : "none";
      if (this.active) this.hub();
      else this.cancel();
    }
    cancel() {
      this.serial++;
      this.engine?.destroy();
      this.engine = null;
      this.busy = false;
    }
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch {
        this.el.querySelector("#patternStatus").textContent +=
          " Progress could not be saved in this browser.";
      }
    }
    recommended() {
      return [...LESSONS].sort((a, b) => {
        const rank = (l) => {
          const r = this.data.results[l.id];
          return !r
            ? 0
            : r.due <= Date.now()
              ? -100000000 + (r.due - Date.now()) / DAY
              : r.clean + r.defense;
        };
        return rank(a) - rank(b);
      })[0];
    }
    hub() {
      this.cancel();
      this.lesson = null;
      this.el.innerHTML = `<div class="section-heading"><h1>Learn → Calculate → Defend → Review</h1></div><p class="muted">Recognize a pattern, calculate both sides, then test it in a fresh study variation. Your game stays where you left it.</p><button class="btn btn-primary" data-action="recommended">Practice a due or developing skill</button><div class="puzzle-collection">${LESSONS.map(
        (l) => {
          const r = this.data.results[l.id];
          return `<button class="puzzle-card" data-lesson="${l.id}"><strong>${l.name}</strong><span>${l.idea}</span><span class="pattern-progress">${r ? `${r.clean}/${r.attempts} independent calculations · ${r.defense} sound defenses · ${r.retained} delayed reviews${r.due <= Date.now() ? " · Review due" : ""}` : "New pattern"}</span></button>`;
        },
      ).join(
        "",
      )}</div><p class="muted">Progress is saved on this browser. Fresh study variations change supporting pawns and colors; the separate Endless challenges collection generates positions from legal games.</p><p id="patternStatus" role="status"></p>`;
    }
    shell(stage, content) {
      this.el.innerHTML = `<div class="section-heading"><h2 tabindex="-1">${esc(this.lesson.name)}</h2><button class="btn btn-secondary" data-action="hub">All patterns</button></div><p class="eyebrow">${stage}</p><div class="pattern-workspace"><div><div id="patternBoard" class="learning-board" role="img" aria-label="Training position"></div><p id="patternBoardCaption" class="muted"></p></div><section class="pattern-panel">${content}<p id="patternStatus" role="status" aria-live="polite"></p></section></div>`;
      this.el.querySelector("h2").focus({ preventScroll: true });
    }
    board(fen, caption) {
      const g = new Chess(fen),
        black = this.orientation === "b",
        pieces = {
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
      let html = "";
      for (let r = 0; r < 8; r++)
        for (let f = 0; f < 8; f++) {
          const rank = black ? r + 1 : 8 - r,
            file = black ? 7 - f : f,
            sq = String.fromCharCode(97 + file) + rank,
            p = g.get(sq);
          html += `<div class="learning-square ${(file + rank) % 2 ? "dark" : "light"}" data-square="${sq}" title="${sq}"><span class="learning-piece ${p?.color === "w" ? "white-piece" : "black-piece"}" data-symbol="${p ? pieces[p.color + p.type] : ""}">${p ? `<img src="https://upload.wikimedia.org/wikipedia/commons/${PIECE_IMAGES[p.color + p.type]}" alt="" draggable="false">` : ""}</span>${f === 0 ? `<span class="learning-rank">${rank}</span>` : ""}${r === 7 ? `<span class="learning-file">${String.fromCharCode(97 + file)}</span>` : ""}</div>`;
        }
      const el = this.el.querySelector("#patternBoard");
      el.innerHTML = html;
      el.setAttribute(
        "aria-label",
        `${caption}. ${g.board().flat().filter(Boolean).length} pieces. FEN ${fen}`,
      );
      this.el.querySelector("#patternBoardCaption").textContent = caption;
    }
    start(id) {
      this.cancel();
      this.lesson = LESSONS.find((l) => l.id === id);
      this.orientation = new Chess(this.lesson.fen).turn();
      this.exampleIndex = 1;
      this.exampleStep(0);
    }
    exampleStep(delta) {
      const l = this.lesson;
      this.exampleIndex = Math.max(
        0,
        Math.min(l.line.length, this.exampleIndex + delta),
      );
      const g = new Chess(l.fen);
      for (const u of l.line.slice(0, this.exampleIndex)) g.move(move(u));
      this.shell(
        "1 · Learn",
        `<p>${l.idea}</p><p><strong>${this.exampleIndex ? l.steps[this.exampleIndex - 1] : "Step through the example, then try a different position without the answer."}</strong></p><p>${esc(notation(l.fen, l.line.slice(0, this.exampleIndex))) || "Starting position"}</p><div class="pattern-actions"><button class="btn btn-secondary" data-action="prev-example" ${!this.exampleIndex ? "disabled" : ""}>Previous</button><button class="btn btn-secondary" data-action="next-example" ${this.exampleIndex === l.line.length ? "disabled" : ""}>Next move</button></div><p><strong>Defensive idea:</strong> ${l.defense}</p><button class="btn btn-primary" data-action="calculate">Calculate a fresh variation</button>`,
      );
      this.board(
        g.fen(),
        `Example · move ${this.exampleIndex} of ${l.line.length}`,
      );
      const controls=this.el.querySelector(".pattern-actions");
      this.el.querySelector("#patternBoard").before(controls);
    }
    async timed(p) {
      let timer;
      try {
        return await Promise.race([
          p,
          new Promise(
            (_, reject) =>
              (timer = setTimeout(
                () =>
                  reject(new Error("The engine took too long. Please retry.")),
                12000,
              )),
          ),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async search(fen, restrict = []) {
      const e = this.engine;
      const r = await this.timed(e.evaluate(fen, 15, 650, restrict));
      if (e !== this.engine) throw new Error("Cancelled");
      if (!r.pv?.length || !new Chess(fen).move(move(r.pv[0])))
        throw new Error("The engine could not verify this line. Please retry.");
      return r;
    }
    async run(fn) {
      if (this.busy) return;
      this.busy = true;
      const serial = this.serial;
      this.el
        .querySelectorAll('button:not([data-action="hub"]),select')
        .forEach((b) => (b.disabled = true));
      try {
        if (!this.engine) {
          const e = new StockfishEngine("pattern-coach");
          this.engine = e;
          await this.timed(e.init());
          if (serial !== this.serial) {
            e.destroy();
            return;
          }
        }
        if (serial !== this.serial) return;
        await fn(serial);
      } catch (e) {
        if (serial === this.serial) {
          this.engine?.destroy();
          this.engine = null;
          this.el.querySelector("#patternStatus").textContent = e.message;
          this.el
            .querySelector("#patternStatus")
            .insertAdjacentHTML(
              "beforeend",
              ' <button class="btn btn-secondary" data-action="again">Retry a fresh variation</button>',
            );
        }
      } finally {
        if (serial === this.serial) {
          this.busy = false;
          this.el
            .querySelectorAll("button,select")
            .forEach((b) => (b.disabled = false));
          this.planOptions?.();
        }
      }
    }
    variant() {
      const l = this.lesson,
        g = new Chess(l.fen);
      const protectedSquares = new Set(
        l.line.flatMap((u) => [u.slice(0, 2), u.slice(2, 4)]),
      );
      let changed = false;
      for (let i = 0; i < 2; i++) {
        const color = Math.random() < 0.5 ? "w" : "b",
          file = "abcdefgh"[Math.floor(Math.random() * 8)],
          rank = (color === "w" ? 2 : 5) + Math.floor(Math.random() * 3),
          sq = file + rank;
        if (
          !g.get(sq) &&
          !protectedSquares.has(sq) &&
          g
            .board()
            .flat()
            .filter((p) => p?.type === "p" && p.color === color).length < 8
        ) {
          g.put({ type: "p", color }, sq);
          changed = true;
        }
      }
      if (!changed) {
        const candidates = g
          .moves({ verbose: true })
          .filter(
            (m) =>
              m.piece === "p" &&
              !m.captured &&
              !protectedSquares.has(m.from) &&
              !protectedSquares.has(m.to) &&
              Math.abs(Number(m.from[1]) - Number(m.to[1])) === 1,
          );
        if (!candidates.length) return null;
        const m = candidates[Math.floor(Math.random() * candidates.length)];
        g.remove(m.from);
        g.put({ type: "p", color: m.color }, m.to);
      }
      let fen = g.fen(),
        key = l.key,
        line = l.line,
        mirrored = false;
      if (Math.random() < 0.5) {
        mirrored = true;
        fen = flip(fen);
        key = flipMove(key);
        line = line.map(flipMove);
      }
      const check = new Chess(fen),
        other = fen.split(" ");
      other[1] = check.turn() === "w" ? "b" : "w";
      other[3] = "-";
      if (new Chess(other.join(" ")).in_check() || check.game_over())
        return null;
      const branch = new Chess(fen);
      for (const u of line) if (!branch.move(move(u))) return null;
      return { fen, key, line, mirrored };
    }
    prepare() {
      this.run(async (serial) => {
        this.el.querySelector("#patternStatus").textContent =
          "Checking a fresh study variation…";
        for (let i = 0; i < 24; i++) {
          if (serial !== this.serial) return;
          const v = this.variant();
          if (
            !v ||
            this.data.recent.includes(v.fen.split(" ").slice(0, 2).join(" "))
          )
            continue;
          const best = await this.search(v.fen),
            key = await this.search(v.fen, [v.key]);
          if (
            this.lesson.reject
              ? value(best) - value(key) < 150
              : !sound(best, key)
          )
            continue;
          if (["backrank", "pin"].includes(this.lesson.id)) {
            const branch = new Chess(v.fen);
            v.line.forEach((u) => branch.move(move(u)));
            if (!branch.in_checkmate()) continue;
          }
          if (
            !this.lesson.reject &&
            this.lesson.id !== "escape" &&
            value(key) < 50
          )
            continue;
          this.exercise = {
            ...v,
            best,
            key,
            assisted: false,
            branches: [],
            clean: false,
            defenseOK: false,
          };
          this.data.recent.push(v.fen.split(" ").slice(0, 2).join(" "));
          this.data.recent = this.data.recent.slice(-500);
          this.orientation = new Chess(v.fen).turn();
          this.calculate();
          this.save();
          return;
        }
        throw new Error(
          "No suitable fresh variation was verified. Try again; no unverified puzzle was substituted.",
        );
      });
    }
    options(fen) {
      return new Chess(fen)
        .moves({ verbose: true })
        .sort((a, b) => a.san.localeCompare(b.san))
        .map((m) => `<option value="${uci(m)}">${esc(m.san)}</option>`)
        .join("");
    }
    select(id, label, options) {
      return `<label for="${id}">${label}</label><select id="${id}"><option value="">Choose a move</option>${options}</select>`;
    }
    calculate() {
      const x = this.exercise;
      this.stage = "calculate";
      this.shell(
        "2 · Calculate",
        `<p>Find two candidates. Commit to A, then predict the opponent’s strongest reply and your follow-up. Visualize the moves: the board stays at the starting position.</p>${this.select("planA", "Candidate A — your choice", this.options(x.fen))}${this.select("planB", "Candidate B — an alternative", this.options(x.fen))}${this.select("planReply", "Best opponent reply to A", "")}${this.select("planFollow", "Your next move after that reply", "")}<div class="pattern-actions"><button class="btn btn-primary" data-action="submit">Check my calculation</button><button class="btn btn-secondary" data-action="hint">Pattern hint</button></div><p class="muted">Engine scores and lines stay hidden until you commit. A hint makes this an assisted attempt.</p>`,
      );
      this.board(
        x.fen,
        `${this.orientation === "w" ? "White" : "Black"} to move · fresh study variation`,
      );
      this.planOptions();
    }
    planOptions() {
      if (this.stage !== "calculate" || !this.el.querySelector("#planA"))
        return;
      const a = this.el.querySelector("#planA").value,
        g = new Chess(this.exercise.fen),
        reply = this.el.querySelector("#planReply"),
        follow = this.el.querySelector("#planFollow");
      const fill = (el, game) => {
        const old = el.value;
        el.innerHTML =
          '<option value="">' +
          (game.game_over() ? "Game ends here" : "Choose a move") +
          "</option>" +
          (!game.game_over() ? this.options(game.fen()) : "");
        if ([...el.options].some((o) => o.value === old)) el.value = old;
        el.disabled = this.busy || game.game_over();
      };
      if (a) {
        g.move(move(a));
        fill(reply, g);
        if (reply.value) {
          g.move(move(reply.value));
          fill(follow, g);
        } else {
          follow.innerHTML = '<option value="">Choose the reply first</option>';
          follow.disabled = true;
        }
      } else {
        reply.innerHTML = '<option value="">Choose A first</option>';
        reply.disabled = true;
        follow.innerHTML = '<option value="">Choose the reply first</option>';
        follow.disabled = true;
      }
    }
    teachingText(text) {
      return this.exercise?.mirrored
        ? text
            .replace(/\b(White|Black)\b/g, (color) =>
              color === "White" ? "Black" : "White",
            )
            .replace(
              /([a-h])([1-8])/g,
              (_, file, rank) => file + (9 - Number(rank)),
            )
        : text;
    }
    hint() {
      this.exercise.assisted = true;
      this.el.querySelector("#patternStatus").textContent = this.teachingText(
        this.lesson.idea,
      );
    }
    async grade(fen, u, label) {
      const best = await this.search(fen),
        chosen = await this.search(fen, [u]);
      const ok = sound(best, chosen);
      return { fen, line: chosen.pv, label, ok, best, chosen, u };
    }
    submit() {
      const val = (id) => this.el.querySelector("#" + id).value,
        a = val("planA"),
        b = val("planB"),
        reply = val("planReply"),
        follow = val("planFollow"),
        g = new Chess(this.exercise.fen);
      if (!a || !b || a === b) {
        this.el.querySelector("#patternStatus").textContent =
          "Choose two different candidate moves.";
        return;
      }
      g.move(move(a));
      if (!g.game_over() && !reply) {
        this.el.querySelector("#patternStatus").textContent =
          "Predict the strongest opponent reply.";
        return;
      }
      if (reply) g.move(move(reply));
      if (!g.game_over() && !follow) {
        this.el.querySelector("#patternStatus").textContent =
          "Choose your follow-up, too.";
        return;
      }
      this.run(async () => {
        const x = this.exercise,
          root = new Chess(x.fen);
        this.el.querySelector("#patternStatus").textContent =
          "Checking both candidates and the opponent’s best defense…";
        const checks = [await this.grade(x.fen, a, "Your candidate A")];
        x.branches.push(
          checks[0],
          await this.grade(x.fen, b, "Your candidate B"),
        );
        root.move(move(a));
        if (reply) {
          const c = await this.grade(
            root.fen(),
            reply,
            "Your predicted opponent reply",
          );
          checks.push(c);
          x.branches.push(c);
          root.move(move(reply));
        }
        if (follow) {
          const c = await this.grade(root.fen(), follow, "Your follow-up");
          checks.push(c);
          x.branches.push(c);
        }
        x.clean = checks.every((c) => c.ok) && !x.assisted;
        x.checks = checks;
        this.stage = "feedback";
        this.shell(
          "2 · Calculation feedback",
          `${checks.map((c) => `<p><strong>${c.label}: ${c.ok ? "sound at this search depth" : "reconsider"}.</strong> ${esc(notation(c.fen, [c.u]))}. ${c.ok ? "Your move preserves the engine’s assessment." : `Compare ${esc(notation(c.fen, c.best.pv.slice(0, 5)))}. Your line permits ${esc(notation(c.fen, c.chosen.pv.slice(0, 5)))}.`}</p>`).join("")}<p>${x.clean ? "Independent calculation recorded after you finish the defense." : "This attempt will count as practice; review the reply you missed."}</p><button class="btn btn-primary" data-action="defend">Now find the defense</button>`,
        );
        this.board(x.fen, "Compare your calculation before switching sides");
      });
    }
    defend() {
      const x = this.exercise;
      const g = new Chess(x.fen);
      g.move(move(x.best.pv[0]));
      const separateDefense = this.lesson.id === "escape" || g.game_over();
      if (separateDefense) {
        const fen = "6k1/5ppp/r7/8/8/8/5PPP/3R2K1 b - - 0 1";
        x.defenseFen = x.mirrored ? flip(fen) : fen;
      } else x.defenseFen = g.fen();
      this.stage = "defend";
      this.orientation = new Chess(x.defenseFen).turn();
      this.shell(
        "3 · Defend",
        `<p>${separateDefense ? "Try a different back-rank position." : "You now have the other side after the engine’s preferred move."} Find the strongest defense: save a draw if possible, or offer the strongest resistance if the attack is forced.</p><p>${this.teachingText(this.lesson.defense)}</p>${this.select("defenseMove", "Your defensive move", this.options(x.defenseFen))}<button class="btn btn-primary" data-action="submit-defense">Test my defense</button>`,
      );
      this.board(
        x.defenseFen,
        `${this.orientation === "w" ? "White" : "Black"} to defend`,
      );
    }
    submitDefense() {
      const u = this.el.querySelector("#defenseMove").value;
      if (!u) {
        this.el.querySelector("#patternStatus").textContent =
          "Choose a defensive move first.";
        return;
      }
      this.run(async () => {
        const x = this.exercise,
          c = await this.grade(x.defenseFen, u, "Your defense");
        x.branches.push(c);
        x.defenseOK = c.ok;
        this.record();
        this.stage = "defense-feedback";
        this.shell(
          "3 · Defense feedback",
          `<p><strong>${c.ok ? "Sound defense at this depth." : "The opponent has a stronger answer."}</strong></p><p>${c.best.mate < 0 ? "Stockfish finds a forced mate against the defender here. This task measures resistance, not a way to escape." : Math.abs(c.best.score || 0) <= 70 ? "The best defense keeps the engine assessment near equality. Saving the position counts as success." : "Compare the best practical resistance; a good defensive move need not make a losing position equal."}</p><p>Your move: ${esc(notation(c.fen, c.line.slice(0, 6)))}.</p><p>Engine alternative: ${esc(notation(c.fen, c.best.pv.slice(0, 6)))}.</p><button class="btn btn-primary" data-action="review">Review lines and the investment</button>`,
        );
        this.board(x.defenseFen, "Defense position");
      });
    }
    record() {
      const x = this.exercise;
      if (x.recorded) return;
      x.recorded = true;
      const now = Date.now(),
        r = this.data.results[this.lesson.id] || {
          attempts: 0,
          clean: 0,
          defense: 0,
          due: 0,
          last: 0,
          retained: 0,
        };
      r.attempts++;
      if (x.clean) r.clean++;
      if (x.defenseOK) r.defense++;
      if (x.clean && x.defenseOK && r.last && now - r.last >= DAY) {
        r.retained++;
        r.last = now;
      } else if (!r.last) r.last = now;
      r.due =
        now +
        (x.clean && x.defenseOK ? [1, 3, 7, 14][Math.min(r.retained, 3)] : 1) *
          DAY;
      this.data.results[this.lesson.id] = r;
      this.save();
    }
    describe(r) {
      return r.mate != null
        ? `Stockfish finds mate ${r.mate > 0 ? "for" : "against"} the side to move in ${Math.abs(r.mate)} at depth ${r.depth}.`
        : `Engine estimate ${(r.score / 100).toFixed(2)} pawns for the side to move, depth ${r.depth}. This is a finite-search estimate, not a guaranteed outcome.`;
    }
    review() {
      this.stage = "review";
      const x = this.exercise;
      x.reviews = [
        {
          fen: x.fen,
          line: x.best.pv,
          label: "Best line against best defense",
          result: x.best,
        },
        {
          fen: x.fen,
          line: x.key.pv,
          label: this.lesson.reject
            ? "Test the tempting sacrifice"
            : "Pattern move against best defense",
          result: x.key,
        },
        ...x.branches.flatMap((c) => [
          { fen: c.fen, line: c.line, label: c.label, result: c.chosen },
          {
            fen: c.fen,
            line: c.best.pv,
            label: `Stronger alternative: ${c.label}`,
            result: c.best,
          },
        ]),
      ];
      this.shell(
        "4 · Review",
        `<p>${x.clean && x.defenseOK ? "Both calculations held up independently." : "Practice completed. Revisit the branch where your calculation changed."}</p><label for="reviewBranch">Choose a line to replay</label><select id="reviewBranch">${x.reviews.map((r, i) => `<option value="${i}">${r.label}</option>`).join("")}</select><p id="patternEvaluation"></p><p id="patternLine"></p><p id="patternInvestment"></p><div class="pattern-actions"><button class="btn btn-secondary" data-action="replay-prev">Previous move</button><button class="btn btn-secondary" data-action="replay-next">Next move</button></div><p>${this.teachingText(this.lesson.defense)}</p><p class="muted">Material uses pawn 1, knight/bishop 3, rook 5, queen 9. King safety, activity and a forced mate can matter more. A later review after a day checks retention; immediate repeats do not.</p><button class="btn btn-primary" data-action="again">Same pattern, fresh variation</button>`,
      );
      this.setReplay(0);
    }
    setReplay(i) {
      this.reviewIndex = i;
      this.replayIndex = 0;
      this.replay(0);
    }
    replay(delta) {
      const r = this.exercise.reviews[this.reviewIndex];
      this.replayIndex = Math.max(
        0,
        Math.min(r.line.length, this.replayIndex + delta),
      );
      const g = new Chess(r.fen),
        color = g.turn(),
        start = balance(r.fen, color);
      let last = null;
      for (const u of r.line.slice(0, this.replayIndex)) {
        last = g.move(move(u));
        if (!last) break;
      }
      this.orientation = color;
      this.board(g.fen(), `${r.label} · ply ${this.replayIndex}`);
      this.el.querySelector("#patternEvaluation").textContent = this.describe(
        r.result,
      );
      this.el.querySelector("#patternLine").textContent = notation(
        r.fen,
        r.line,
      );
      const current = balance(g.fen(), color);
      this.el.querySelector("#patternInvestment").textContent =
        `Material balance for ${color === "w" ? "White" : "Black"}: ${start} before, ${current} now (${current - start >= 0 ? "+" : ""}${current - start}). ${g.in_checkmate() ? "Checkmate ends the calculation." : last?.captured ? `${last.san} captures a ${{ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen" }[last.captured]}. Inspect the next reply before judging the trade.` : last?.flags.includes("k") ? "Castling brings the king to safety." : "Look for the next check, capture, threat, or safe escape."}`;
      this.el.querySelector('[data-action="replay-prev"]').disabled =
        this.replayIndex === 0;
      this.el.querySelector('[data-action="replay-next"]').disabled =
        this.replayIndex === r.line.length;
    }
  }
  window.PatternController = PatternController;
  window.ChessPatterns = { LESSONS, notation, flip, flipMove, sound };
})();

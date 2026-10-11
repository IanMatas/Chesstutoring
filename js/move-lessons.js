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
      document
        .getElementById("lessonAutoplay")
        .addEventListener("click", () =>
          this.timer ? this.pause() : this.autoplay(),
        );
      for (const id of ["varStartBtn", "varPrevBtn", "varNextBtn", "varEndBtn"])
        document
          .getElementById(id)
          .addEventListener("click", () => this.pause());
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
        this.pause();
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
      this.pause();
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
        const reason=this.explain(md,played,best,gap);
        this.comparison = {
          played:this.build(md,played,"Your move",reason.text),
          best:this.build(md,best,"Engine alternative",reason.better)
        };
        this.comparison.played.cause=reason.text;
        this.comparison.played.startStep=reason.step;
        this.comparison.best.cause=reason.better;
        status.textContent='Comparison ready. The board shows the consequence of your move.';
        document.getElementById("quickCoachLesson").textContent=reason.text;
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
    trace(fen, pv) {
      const g=new Chess(fen), color=g.turn(), start=material(g,color), events=[];
      for(const u of pv||[]){const m=g.move(obj(u));if(!m)break;events.push({...m,ply:events.length+1,fen:g.fen(),delta:material(g,color)-start});}
      return {events,color,delta:material(g,color)-start,mate:g.in_checkmate()};
    }
    explain(md, played, best, gap=md.cpLoss||0) {
      const line=this.trace(md.fenBefore,played.pv), alternative=this.trace(md.fenBefore,best.pv);
      const lost=line.events.filter(m=>m.color!==line.color&&m.captured);
      const critical=[...lost].sort((a,b)=>weights[b.captured]-weights[a.captured])[0];
      const reply=line.events[1];
      const label=gap>500?'Blunder':gap>200?'Mistake':gap>90?'Inaccuracy':'Move review';
      let text='',step=reply?2:1;
      if(played.mate<0 && !(best.mate<0)) {
        text=`${md.san} allows a forced mate. ${reply?`${reply.san} starts the punishment. `:''}The engine finds mate in ${Math.abs(played.mate)} against your side.`;
        step=reply?2:1;
      } else if(critical && line.delta<0 && gap>90 && !(played.mate>0)) {
        step=critical.ply;
        const taken=lost.map(m=>names[m.captured]);
        const won=line.events.filter(m=>m.color===line.color&&m.captured).map(m=>names[m.captured]);
        text=`${md.san} allows ${critical.san}: the opponent's ${names[critical.piece]} takes your ${names[critical.captured]} on ${critical.to}. `;
        text+=won.length?`In this line you give up ${taken.join(' and ')} for ${won.join(' and ')} — a material loss in this continuation.`:`You get no material back in the shown line.`;
        const after=new Chess(critical.fen);
        if(!after.moves({verbose:true}).some(m=>m.captured&&m.to===critical.to))text+=` You cannot immediately recapture on ${critical.to}.`;
      } else if(best.mate>0 && !(played.mate>0)) {
        text=`${md.san} misses a mating attack. ${san(md.fenBefore,best.pv[0])} starts the engine's mate-in-${best.mate} line.`;
      } else if(gap>90) {
        text=`${md.san} gives the opponent ${reply?.san||'a stronger position'}. No clear material loss or mate is established in this short line; the engine's preference alone does not prove a specific tactical reason.`;
      } else if(played.mate>0) {
        text=`${md.san} preserves a mating attack. Follow the replies to see why the material given up does not save the opponent.`;
      } else text=`${md.san} keeps a similar engine assessment. ${reply?`The opponent's strongest illustrated reply is ${reply.san}.`:''}`;
      let better=best.pv?.[0]?`Compare ${san(md.fenBefore,best.pv[0])}. `:'';
      if(best.mate>0)better+=`The engine finds mate in ${best.mate} for your side.`;
      else if(line.delta<0&&alternative.delta>=0)better+='The alternative avoids that material deficit in the shown continuation.';
      else better+='Watch how the opponent answers this move from the same starting position.';
      return {text:`${label}: ${text}`,better,step};
    }
    immediate(md) {
      if(!md?.replyLine?.length || !md.bestLine?.length)return '';
      const u=md.from+md.to+(md.promotion||'');
      return this.explain(md,{pv:[u,...md.replyLine],mate:md.playedMate}, {pv:md.bestLine,mate:md.bestMate}).text;
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
        const who = m.color === "w" ? "White" : "Black",
          other = m.color === "w" ? "Black" : "White";
        let note = m.captured
          ? `${who}'s ${names[m.piece]} takes ${other}'s ${names[m.captured]} on ${m.to}. `
          : `${who}'s ${names[m.piece]} moves from ${m.from} to ${m.to}. `;
        if (m.promotion) note += `The pawn becomes a ${names[m.promotion]}. `;
        if (g.in_checkmate())
          note += `Checkmate: ${other} has no legal escape, capture, or block. `;
        else if (g.in_check()) {
          const replies = g.moves();
          const targets = this.newCaptures(before, g.fen(), m.color);
          if(targets.length)note+=`At the same time, it attacks the ${targets[0]}. `;
          note += `${other}'s king is in check. ${replies.length === 1 ? `The only legal reply is ${replies[0]}.` : "The next move must remove that check."} `;
        } else if (new Chess(before).in_check())
          note += `This gets ${who}'s king out of check. `;
        else if (m.captured) {
          const recaptures = g
            .moves({ verbose: true })
            .filter((reply) => reply.to === m.to && reply.captured);
          note += recaptures.length
            ? `${other} can recapture on ${m.to}; the trade is not finished yet. `
            : `${other} has no immediate legal recapture on ${m.to}. `;
        } else {
          const threats = this.newCaptures(before, g.fen(), m.color);
          if (threats.length)
            note += `It now threatens to take the ${threats[0]}. `;
          else if (m.piece === "p" && !m.promotion) {
            const f = m.to.charCodeAt(0),
              r = Number(m.to[1]) + (m.color === "w" ? 1 : -1);
            const squares = [f - 1, f + 1]
              .filter((c) => c >= 97 && c <= 104)
              .map((c) => String.fromCharCode(c) + r);
            if (r > 0 && r < 9)
              note += `The pawn controls ${squares.join(" and ")}. `;
          } else if (m.flags.includes("k") || m.flags.includes("q"))
            note += "Castling also brings the rook toward the center. ";
        }
        const net = material(g, color) - start;
        const worth =
          {
            1: "one pawn",
            2: "two pawns",
            3: "a knight or bishop",
            5: "a rook",
            9: "a queen",
          }[Math.abs(net)] || `${Math.abs(net)} pawns`;
        if (g.in_checkmate())
          note += "The mating result matters more than the pieces given up.";
        else if (net < 0)
          note += `Compared with the start, ${color === "w" ? "White" : "Black"} has given up material equal to ${worth} so far. The later replies must justify that cost.`;
        else if (net > 0)
          note += `${color === "w" ? "White" : "Black"} has gained material equal to ${worth} compared with the start.`;
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
        whyBetter: `${verdict} ${estimate} Search depth ${result.depth}. ${outcome} This is a finite engine search, not a promise that the opponent will cooperate. The moves play automatically. Pause whenever you want to examine a position.`,
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
    pause() {
      clearInterval(this.timer);
      this.timer = null;
      const button = document.getElementById("lessonAutoplay");
      if (button) button.textContent = "Play demonstration";
    }
    autoplay() {
      this.pause();
      const v = this.app.activeVariation;
      if (!v?.moveLesson) return;
      if (this.app.varStepIndex >= v.moves.length) this.app._stepVariation(0);
      document.getElementById("lessonAutoplay").textContent =
        "Pause demonstration";
      this.timer = setInterval(() => {
        if (this.app.activeVariation !== v) {
          this.pause();
          return;
        }
        this.app._stepVariation(this.app.varStepIndex + 1);
        if (this.app.varStepIndex >= v.moves.length) this.pause();
      }, 3000);
    }
    show(which) {
      if (!this.comparison) return;
      this.pause();
      this.app._previewVariation(this.comparison[which]);
      if(this.comparison[which].startStep)this.app._stepVariation(this.comparison[which].startStep);
      if (this.app.varStepIndex < this.app.activeVariation.moves.length)
        this.autoplay();
    }
    onStep(v, index) {
      const box = document.getElementById("moveLessonControls");
      box.hidden = !v?.moveLesson;
      if (box.hidden) {
        this.pause();
        return;
      }
      document.getElementById("lessonVerdict").textContent=v.cause||v.whyBetter;
      const status = document.getElementById("lessonProgress");
      status.textContent =
        index >= v.moves.length
          ? "End of this line. Compare the other line or return to your game."
          : `${index} of ${v.moves.length} moves shown. Watch the highlighted move and read its explanation.`;
      if (index >= v.moves.length) this.pause();
    }
  }
  window.MoveLessons = MoveLessons;
})();

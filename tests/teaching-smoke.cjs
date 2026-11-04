// Deterministic checks of the teaching core (js/teach.js) with hand-written engine lines.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.CHESS_TEST_ASSET_DIR)
      for (const [url, file] of [
        ["https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js", "chesstutoring-chess.js"],
        ["https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js", "chesstutoring-stockfish.js"],
      ])
        await page.route(url, (r) =>
          r.fulfill({ path: path.join(process.env.CHESS_TEST_ASSET_DIR, file), contentType: "application/javascript" }),
        );
    await page.goto(process.env.CHESS_TEST_URL || "http://127.0.0.1:8000");
    await page.waitForFunction(() => window.ChessTeach && window.Chess);
    const results = await page.evaluate(() => {
      const T = ChessTeach;
      // lesson(fen, played SAN, best SAN, best score, played score, reply SANs) — scores from the mover's side.
      const lesson = (fen, san, bestSan, bestCp, playedCp, replySans, extra = {}) => {
        const g = new Chess(fen), move = g.move(san);
        const best = new Chess(fen).move(bestSan);
        const reply = [];
        for (const s of replySans) reply.push(T.uciOf(g.move(s)));
        const l = T.lessonFor({ fenBefore: fen, move, best: { uci: T.uciOf(best), pv: [T.uciOf(best)], cp: bestCp }, playedCp, replyPv: reply, opponent: "the bot", ...extra });
        return { verdict: l.verdict, concept: l.concept && l.concept.id, step: l.routine && l.routine.step, headline: l.headline, why: l.why, teaser: l.teaser || "", also: l.also || "", better: l.better };
      };
      return {
        verdicts: [T.classify(0, -5), T.classify(0, -20), T.classify(0, -60), T.classify(0, -120), T.classify(30, -400), T.classify(9990, 500), T.classify(9990, 1200), T.classify(100, -9990)],
        hanging: lesson("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", "Ba6", "Nf3", 30, -280, ["Nxa6", "d4", "exd4"]),
        ignored: lesson("rnbqkbnr/ppp1pppp/8/8/3pP3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3", "Bc4", "Nce2", 20, -250, ["dxc3", "bxc3", "Nf6"]),
        fork: lesson("6k1/5ppp/8/8/3n4/8/3Q1PPP/6K1 w - - 0 1", "Qc3", "Qxd4", 300, -650, ["Ne2+", "Kf1", "Nxc3"]),
        missedMate: lesson("3r2k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1", "Qd4", "Qxd8#", 9990, -900, ["Rxd4", "h3", "Rd1+"]),
        freePiece: lesson("6k1/5ppp/8/3q4/8/2N5/5PPP/6K1 w - - 0 1", "h3", "Nxd5", 900, 0, ["Qd8", "Kh2", "Kf8"]),
        knightTwice: lesson("r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4", "Nb5", "Bb5", 30, -40, ["a6", "Nc3"]),
        stalemate: lesson("7k/8/5K2/8/8/8/8/6Q1 w - - 0 1", "Qg6", "Qg7#", 9990, 0, []),
        book: lesson("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "e4", "d4", 30, -80, ["e5"], { history: [] }),
        bookName: T.bookInfo("e4 e5 Nf3 Nc6 Bc4".split(" ")),
        notBook: T.bookInfo("e4 e5 Nf3 Nc6 Bc4 Nd4".split(" ")),
        routine: T.routineNotes("rnbqkbnr/ppp1pppp/8/8/3pP3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3", "w", "the bot").threat,
        narrate: T.narrate("3r2k1/5ppp/8/8/3Q4/8/5PPP/6K1 b - - 0 1", "d8d4", "w", "the bot"),
        opponent: T.opponentNote("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", { from: "g8", to: "f6" }, "w", "the bot"),
        profile: (() => {
          const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
          const p = new T.Profile(storage);
          p.setLevel("beginner");
          p.record("hanging-piece", "coach");
          p.recordGame("game-1", ["hanging-piece", "allowed-fork"], "review");
          p.recordGame("game-1", ["hanging-piece"], "review");
          const again = new T.Profile(storage);
          return { level: again.level, top: again.top(2).map((c) => `${c.id}:${c.count}`), pauseBlunder: again.shouldPause("blunder"), pauseInaccuracy: again.shouldPause("inaccuracy") };
        })(),
      };
    });
    assert.deepEqual(results.verdicts, ["best", "good", "inaccuracy", "mistake", "blunder", "blunder", "inaccuracy", "blunder"]);
    assert.equal(results.hanging.concept, "hanging-piece");
    assert.match(results.hanging.headline, /bishop can be taken on a6/);
    assert.equal(results.hanging.step, 3);
    assert.equal(results.ignored.concept, "ignored-threat");
    assert.match(results.ignored.headline, /knight on c3 was already under attack/);
    assert.equal(results.ignored.step, 1);
    assert.equal(results.fork.concept, "allowed-fork");
    assert.match(results.fork.why, /king and queen at once/);
    assert.equal(results.missedMate.concept, "missed-mate");
    assert.match(results.missedMate.headline, /missed checkmate in one/i);
    assert.match(results.missedMate.why, /Qxd8#/);
    assert.doesNotMatch(results.missedMate.teaser, /Qxd8/);
    assert.match(results.missedMate.also, /queen/);
    assert.equal(results.freePiece.concept, "missed-material");
    assert.match(results.freePiece.headline, /queen on d5 was free to take/);
    assert.equal(results.knightTwice.concept, "opening-development");
    assert.equal(results.stalemate.concept, "stalemate");
    assert.equal(results.book.verdict, "book");
    assert.match(results.book.headline, /Book move — King's Pawn Opening/);
    assert.deepEqual(results.bookName, { name: "Italian Game" });
    assert.equal(results.notBook, null);
    assert.match(results.routine, /knight on c3 can be won/);
    assert.match(results.narrate, /The bot’s rook takes your queen on d4\. No piece can take back\./);
    assert.match(results.opponent, /The bot played Nf6: it attacks your pawn on e4/);
    assert.deepEqual(results.profile, { level: "beginner", top: ["hanging-piece:2", "allowed-fork:1"], pauseBlunder: true, pauseInaccuracy: false });
    assert.deepEqual(errors, []);
    console.log("PASS verdicts, named concepts, spoiler-free teasers, book moves, routine notes, narration and learner profile");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

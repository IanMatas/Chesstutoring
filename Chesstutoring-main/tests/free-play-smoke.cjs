const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const p = await browser.newPage();
    p.setDefaultTimeout(60000);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    if (process.env.CHESS_TEST_ASSET_DIR)
      for (const [url, file] of [
        [
          "https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js",
          "chesstutoring-chess.js",
        ],
        [
          "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js",
          "chesstutoring-stockfish.js",
        ],
      ])
        await p.route(url, (r) =>
          r.fulfill({
            path: path.join(process.env.CHESS_TEST_ASSET_DIR, file),
            contentType: "application/javascript",
          }),
        );
    await p.goto(process.env.CHESS_TEST_URL || "http://127.0.0.1:8000");
    await p.waitForFunction(() => window.freePlay);
    assert.equal(await p.locator("#freePlayMode").isVisible(), true);
    assert.equal(await p.locator("#playMode").isVisible(), false);
    for (const [a, b] of [
      ["e2", "e4"],
      ["e7", "e5"],
      ["g1", "f3"],
    ]) {
      await p.locator(`#freeBoard [data-square=${a}]`).click();
      await p.locator(`#freeBoard [data-square=${b}]`).click();
    }
    await p.waitForTimeout(1000);
    assert.equal(await p.evaluate(() => freePlay.moves.length), 3);
    assert.equal(await p.evaluate(() => freePlay.engine), undefined);
    assert.deepEqual(await p.evaluate(() => app.game.history()), []);
    const pgn =
      '[Event "Study example"]\n[Result "*"]\n\n1. e4 {Central space} e5 2. Nf3 (2. Bc4) Nc6 3. Bb5 a6 *';
    await p.locator("[data-free=import]").click();
    await p.locator("#pgnText").fill(pgn);
    await p.locator("#pgnLoad").click();
    assert.equal(await p.locator("#pgnDialog").isVisible(), false);
    assert.equal(await p.evaluate(() => freePlay.moves.length), 6);
    assert.equal(await p.evaluate(() => freePlay.index), 0);
    await p.locator("[data-free=next]").click();
    assert.equal(
      await p.evaluate(() => new Chess(freePlay.viewedFen()).get("e4").type),
      "p",
    );
    await p.locator('[data-free-ply="3"]').click();
    assert.equal(await p.evaluate(() => freePlay.index), 3);
    await p.locator("#freeSide").selectOption("w");
    await p.locator("[data-free=continue]").click();
    await p.waitForFunction(
      () => !freePlay.busy && freePlay.moves.length === 4,
    );
    assert.equal(await p.evaluate(() => freePlay.game.turn()), "w");
    assert.equal(await p.evaluate(() => freePlay.original), pgn);
    const downloadEvent = p.waitForEvent("download");
    await p.locator("[data-free=export]").click();
    const download = await downloadEvent;
    const exported = await fs.readFile(await download.path(), "utf8");
    assert.equal(
      await p.evaluate((text) => {
        const g = new Chess();
        return g.load_pgn(text) && g.history().length === 4;
      }, exported),
      true,
    );
    const sourceEvent = p.waitForEvent("download");
    await p.locator("[data-free=original]").click();
    assert.equal(
      await fs.readFile(await (await sourceEvent).path(), "utf8"),
      pgn,
    );
    await p.locator("#freeSide").selectOption("both");
    await p.locator("[data-free=continue]").click();
    const fen = await p.evaluate(() => freePlay.game.fen());
    await p.locator("[data-free=import]").click();
    await p.locator("#pgnText").fill("1. NotAChessMove");
    await p.locator("#pgnLoad").click();
    assert.match(
      await p.locator("#pgnError").textContent(),
      /could not|No moves/,
    );
    assert.equal(await p.evaluate(() => freePlay.game.fen()), fen);
    await p.locator("#pgnClose").click();
    // File import and a nonstandard start with Black to move preserve FEN and numbering.
    const setup =
      '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/p7/6K1 b - - 0 20"]\n[Result "*"]\n\n20... a1=Q+ 21. Kf2 *';
    await p.locator("[data-free=import]").click();
    await p.locator("#pgnFile").setInputFiles({
      name: "ending.pgn",
      mimeType: "application/x-chess-pgn",
      buffer: Buffer.from(setup),
    });
    await p.locator("#pgnDialog").waitFor({state:"hidden"});
    assert.equal(await p.locator("#pgnDialog").isVisible(), false);
    assert.equal(await p.evaluate(() => freePlay.root.split(" ")[1]), "b");
    assert.match(await p.locator('[data-free-ply="1"]').textContent(), /20…/);
    await p.locator("[data-free=next]").click();
    assert.equal(
      await p.evaluate(() => new Chess(freePlay.viewedFen()).get("a1").type),
      "q",
    );
    assert.equal(
      await p.evaluate(() => {
        const g = new Chess();
        return g.load_pgn(freePlay.exportPGN()) && g.history().length === 2;
      }),
      true,
    );
    await p.locator("[data-free=study]").click();
    await p.waitForFunction(() => !studyBoard.busy);
    assert.equal(
      await p.evaluate(() => studyBoard.game.fen()),
      await p.evaluate(() => freePlay.viewedFen()),
    );
    await p.locator("#modePlay").click();
    await p.locator("[data-free=new]").click();
    await p.locator("#freeSide").selectOption("b");
    await p.locator("[data-free=continue]").click();
    await p.waitForFunction(
      () => !freePlay.busy && freePlay.moves.length === 1,
    );
    assert.equal(await p.evaluate(() => freePlay.game.turn()), "b");
    // Cancelling a pending bot turn leaves the board unchanged.
    await p.locator("[data-free=new]").click();
    await p.locator("#freeSide").selectOption("b");
    await p.locator("[data-free=continue]").click();
    await p.locator("#freeSide").selectOption("both");
    await p.locator("[data-free=continue]").click();
    await p.waitForTimeout(1200);
    assert.equal(await p.evaluate(() => freePlay.moves.length), 0);
    assert.equal(await p.evaluate(() => freePlay.engine), null);
    await p.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await p.screenshot({ path: "/tmp/free-play-v4.png", fullPage: true });
    const sample = await fs.readFile(
      path.join(__dirname, "../examples/study-game.pgn"),
      "utf8",
    );
    assert.equal(
      await p.evaluate((text) => freePlay.importPGN(text), sample),
      true,
    );
    assert.equal(
      await p.evaluate(
        () => freePlay.moves.filter((m) => m.san === "O-O").length,
      ),
      2,
    );
    assert.equal(
      await p.evaluate(() => {
        const g = new Chess();
        return (
          g.load_pgn(freePlay.exportPGN()) && g.fen() === freePlay.game.fen()
        );
      }),
      true,
    );
    assert.equal(
      await p.evaluate(() => freePlay.importPGN("1. e4 a6 2. e5 d5 3. exd6 *")),
      true,
    );
    assert.equal(
      await p.evaluate(() => freePlay.moves.at(-1).flags.includes("e")),
      true,
    );
    await p.locator("[data-free=new]").click();
    assert.equal(
      await p.evaluate(() => freePlay.importPGN(freePlay.exportPGN())),
      true,
    );
    // Blocking Stockfish must not prevent playing both sides.
    const offline = await browser.newPage();
    if (process.env.CHESS_TEST_ASSET_DIR)
      await offline.route(
        "https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js",
        (r) =>
          r.fulfill({
            path: path.join(
              process.env.CHESS_TEST_ASSET_DIR,
              "chesstutoring-chess.js",
            ),
            contentType: "application/javascript",
          }),
      );
    await offline.route(
      "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js",
      (r) => r.abort(),
    );
    await offline.goto(process.env.CHESS_TEST_URL || "http://127.0.0.1:8000");
    await offline.waitForFunction(() => window.freePlay);
    for (const [a, b] of [
      ["e2", "e4"],
      ["e7", "e5"],
    ]) {
      await offline.locator("#freeBoard [data-square=" + a + "]").click();
      await offline.locator("#freeBoard [data-square=" + b + "]").click();
    }
    assert.equal(await offline.evaluate(() => freePlay.moves.length), 2);
    assert.equal(await offline.locator("#loadingOverlay").isVisible(), false);
    await offline.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS both sides, PGN text/file import, export, original preservation, FEN, branching, both bot colors, study handoff and cancellation",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
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
    await p.waitForFunction(() => window.studyBoard && app.cachedEval);
    const live = await p.evaluate(() => app.game.fen());
    await p.locator("#modeAnalysis").click();
    await p.waitForFunction(() => !studyBoard.busy);
    assert.equal(await p.locator("#deepAnalysisMode").count(), 0);
    assert.equal(await p.locator("#studyBoard button").count(), 64);
    assert.match(await p.locator("#studyState").textContent(), /White to move/);
    await p.locator("#studyBoard [data-square=e2]").click();
    await p.locator("#studyBoard [data-square=e4]").click();
    await p.waitForFunction(() => !studyBoard.busy);
    assert.match(
      await p.locator("#studyExplanation").textContent(),
      /You played e4/,
    );
    const edited = await p.evaluate(() => studyBoard.game.fen());
    await p.locator("#studyPlayed").click();
    assert.equal(await p.evaluate(() => studyBoard.index), 1);
    const start = await p.evaluate(
      () => studyBoard.replay.positions[studyBoard.index],
    );
    await p.locator("#studyNext").click();
    assert.notEqual(
      await p.evaluate(() => studyBoard.replay.positions[studyBoard.index]),
      start,
    );
    await p.locator("#studyPrev").click();
    assert.equal(await p.evaluate(() => studyBoard.index), 1);
    await p.locator("#studyAuto").click();
    await p.waitForFunction(() => studyBoard.index >= 2);
    await p.locator("#studyAuto").click();
    assert.equal(await p.evaluate(() => studyBoard.timer), null);
    await p.locator("[data-study=return]").click();
    assert.equal(await p.evaluate(() => studyBoard.game.fen()), edited);
    await p.locator("#studyBest").click();
    assert.match(
      await p.locator("#studyExplanation").textContent(),
      /White|Black/,
    );
    await p.locator("[data-study=return]").click();
    await p.locator("#studyUndo").click();
    await p.waitForFunction(() => !studyBoard.busy);
    assert.equal(await p.evaluate(() => studyBoard.game.fen()), live);
    // Underpromotions are explicit, and terminal positions remain understandable.
    await p.evaluate(() => studyBoard.load("7k/P7/8/8/8/8/8/6K1 w - - 0 1"));
    await p.waitForFunction(() => !studyBoard.busy);
    await p.locator('#studyBoard [data-square=a7]').click();
    await p.locator('#studyBoard [data-square=a8]').click();
    assert.equal(await p.locator('#studyPromotion').isVisible(), true);
    await p.locator('[data-promote=n]').click();
    await p.waitForFunction(() => !studyBoard.busy);
    assert.equal(await p.evaluate(() => studyBoard.game.get('a8').type), 'n');
    assert.equal(await p.evaluate(() => studyBoard.game.game_over()), true);
    await p.evaluate(() => studyBoard.load("7k/8/8/8/8/8/8/6K1 w - - 0 1"));
    await p.waitForFunction(() => !studyBoard.busy);
    assert.match(await p.locator('#studyExplanation').textContent(), /drawn/);
    await p.locator('[data-study=import]').click();
    await p.waitForFunction(() => !studyBoard.busy);
    await p.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await p.screenshot({ path: "/tmp/study-v3-mobile.png", fullPage: true });
    await p.locator("[data-study=patterns]").click();
    assert.equal(await p.evaluate(() => studyBoard.engine), null);
    await p.locator("[data-lesson=backrank]").click();
    const before = await p.locator("#patternBoard").getAttribute("aria-label");
    await p.locator("[data-action=next-example]").click();
    assert.notEqual(
      await p.locator("#patternBoard").getAttribute("aria-label"),
      before,
    );
    assert.equal(await p.evaluate(() => app.game.fen()), live);
    await p.locator("#modeAnalysis").click();
    await p.locator("#modePlay").click();
    await p.waitForTimeout(700);
    assert.equal(await p.evaluate(() => studyBoard.engine), null);
    assert.equal(await p.locator("#guidedAnalysisMode").isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      "PASS guided analysis: editable moves, actual replay, autoplay/pause, undo, lesson steps, mobile and cancellation",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

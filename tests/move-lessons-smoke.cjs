const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
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
      if (process.env.CHESS_TEST_ASSET_DIR)
        await page.route(url, (r) =>
          r.fulfill({
            path: path.join(process.env.CHESS_TEST_ASSET_DIR, file),
            contentType: "application/javascript",
          }),
        );
    await page.goto(process.env.CHESS_TEST_URL || "http://127.0.0.1:8000");
    await page.waitForFunction(() => app.cachedEval && window.moveLessons);
    await page.locator("#modeCoach").click();
    // A real game move exposes the lesson button without opening the full sidebar.
    await page.locator("#chessboard [data-square=e2]").click();
    await page.locator("#chessboard [data-square=e4]").click();
    await page.waitForFunction(
      () => app.moveData.length === 2 && !app.thinking,
    );
    assert.equal(await page.locator("#showMoveWhy").isVisible(), true);
    const live = await page.evaluate(() => ({
      fen: app.game.fen(),
      history: app.posHistory.slice(),
      view: app.viewIndex,
    }));
    await page.locator("#showMoveWhy").click();
    await page.waitForFunction(() => app.activeVariation?.moveLesson);
    assert.ok(await page.locator("#moveLessonControls").isVisible());
    const branches = await page.evaluate(() =>
      Object.values(moveLessons.comparison).map((v) => ({
        root: v.positions[0],
        count: v.moves.length,
      })),
    );
    assert.equal(branches[0].root, branches[1].root);
    assert.ok(branches.every((b) => b.count >= 3));
    await page.locator("#lessonBest").click();
    assert.match(
      await page.locator("#varPreviewTitle").textContent(),
      /Engine alternative/,
    );
    const next = await page.evaluate(() => {
      const m = app.activeVariation.moves[0];
      return m.from + m.to + (m.promotion || "");
    });
    await page.locator("#lessonPrediction").selectOption(next);
    await page.locator("#lessonPredict").click();
    assert.match(
      await page.locator("#lessonPredictionFeedback").textContent(),
      /anticipated/,
    );
    assert.match(
      await page.locator("#varPreviewDesc").textContent(),
      /Material change/,
    );
    await page.locator("#varExitBtn").click();
    assert.deepEqual(
      await page.evaluate(() => ({
        fen: app.game.fen(),
        history: app.posHistory.slice(),
        view: app.viewIndex,
      })),
      live,
    );
    // A queen sacrifice must include its acceptance and the mating recapture.
    await page.evaluate(() => {
      const fen = "r5k1/4Qppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
      const g = new Chess(fen),
        m = g.move("Qa7");
      const md = { ...m, isPlayer: true, fenBefore: fen, fenAfter: g.fen() };
      moveLessons.update(md);
    });
    await page.locator("#showMoveWhy").click();
    await page.waitForFunction(
      () =>
        moveLessons.comparison &&
        app.activeVariation?.positions[0].startsWith("r5k1"),
    );
    await page.locator("#lessonBest").click();
    await page.locator("#varEndBtn").click();
    assert.match(
      await page.locator("#varPreviewDesc").textContent(),
      /Checkmate/,
    );
    assert.equal(
      await page.evaluate(() =>
        new Chess(app.activeVariation.positions.at(-1)).in_checkmate(),
      ),
      true,
    );
    await page.locator("#lessonPlayed").click();
    assert.notEqual(
      await page.evaluate(() => app.activeVariation.moves[0].san),
      "Qe8+",
    );
    await page.locator("#modePuzzles").click();
    assert.equal(await page.evaluate(() => app.activeVariation), null);
    assert.equal(await page.evaluate(() => app.game.fen()), live.fen);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#modeCoach").click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    // Cancel an in-flight search, not just an already-open demonstration.
    await page.evaluate(() => { moveLessons.comparison = null; });
    await page.locator("#showMoveWhy").click();
    await page.locator("#modePuzzles").click();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => moveLessons.engine), null);
    assert.equal(await page.evaluate(() => app.activeVariation), null);
    assert.equal(await page.evaluate(() => app.game.fen()), live.fen);
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual move comparison, prediction, queen sacrifice, game preservation, cancellation and mobile layout",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

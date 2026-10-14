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
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [url, file] of [
      ["https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js", "chesstutoring-chess.js"],
      ["https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js", "chesstutoring-stockfish.js"],
    ])
      if (process.env.CHESS_TEST_ASSET_DIR)
        await page.route(url, (r) =>
          r.fulfill({ path: path.join(process.env.CHESS_TEST_ASSET_DIR, file), contentType: "application/javascript" }),
        );
    await page.goto(process.env.CHESS_TEST_URL || "http://127.0.0.1:8000");
    await page.waitForFunction(() => app.cachedEval && window.moveLessons);
    await page.evaluate(() => { ChessTeach.profile.setLevel("intermediate"); ChessTeach.profile.setPause(true); });
    await page.locator("#modeCoach").click();
    const start = "3r2k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1";
    await page.evaluate(async (fen) => {
      app.game = new Chess(fen);
      app.playerColor = "w"; app.flipped = false; app.over = false;
      app._resetHistory(); app._buildBoard(); app._render();
      await app._evalAndCache();
      app.panel.refresh();
    }, start);
    // Qd4 misses mate in one and puts the queen where the rook takes it: the game pauses.
    await page.locator("#chessboard [data-square=d1]").click();
    await page.locator("#chessboard [data-square=d4]").click();
    await page.waitForFunction(() => app.pending && !app.thinking);
    const live = await page.evaluate(() => ({ fen: app.game.fen(), history: app.posHistory.slice(), view: app.viewIndex }));
    const paused = await page.locator("#coachContent").innerText();
    assert.match(paused, /checkmate/i);
    assert.doesNotMatch(paused, /Qxd8/, "The paused card must not give the answer away");
    assert.equal(await page.evaluate(() => app.moveData.length), 1, "The bot waits while the game is paused");

    // Show me why: the stored lines play on the board, both rooted at the same position.
    await page.locator("[data-coach=why]").click();
    await page.waitForFunction(() => app.activeVariation?.moveLesson);
    assert.ok(await page.locator("#moveLessonControls").isVisible());
    const branches = await page.evaluate(() =>
      Object.values(moveLessons.comparison).filter(Boolean).map((v) => ({ root: v.positions[0], count: v.moves.length })),
    );
    assert.equal(branches.length, 2);
    assert.equal(branches[0].root, branches[1].root);
    await page.locator("#lessonBest").click();
    assert.match(await page.locator("#varPreviewTitle").textContent(), /better move/);
    await page.locator("#varEndBtn").click();
    assert.match(await page.locator("#varPreviewDesc").textContent(), /Checkmate/);
    await page.locator("#lessonPlayed").click();
    assert.match(await page.locator("#varPreviewTitle").textContent(), /allows/);
    await page.locator("#lessonAutoplay").click();
    assert.equal(await page.evaluate(() => moveLessons.timer), null);
    await page.locator("#varNextBtn").click();
    assert.match(await page.locator("#varPreviewDesc").textContent(), /takes your queen/);
    for (const width of [1280, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll(".variation-preview-controls button, #moveLessonControls button")].filter((b) => b.getClientRects().length);
        const rects = buttons.map((b) => b.getBoundingClientRect());
        return {
          fits: buttons.every((b) => b.scrollWidth <= b.clientWidth + 1),
          inside: rects.every((r) => r.left >= 0 && r.right <= innerWidth + 1),
          overlap: rects.some((a, i) => rects.slice(i + 1).some((b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1)),
          pageFits: document.documentElement.scrollWidth <= innerWidth,
        };
      });
      assert.deepEqual(layout, { fits: true, inside: true, overlap: false, pageFits: true }, `layout at ${width}px`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#varExitBtn").click();
    assert.deepEqual(await page.evaluate(() => ({ fen: app.game.fen(), history: app.posHistory.slice(), view: app.viewIndex })), live);

    // Try again: the same mistake is taken back with a reason, hints escalate, then mate is found.
    await page.locator("[data-coach=retry]").click();
    assert.equal(await page.evaluate(() => app.game.fen()), start);
    await page.locator("#chessboard [data-square=d1]").click();
    await page.locator("#chessboard [data-square=d4]").click();
    await page.waitForFunction(() => app.retry?.last && !app.thinking);
    assert.match(await page.locator(".tc-feedback").innerText(), /Not quite/);
    assert.equal(await page.evaluate(() => app.game.fen()), start);
    await page.locator("[data-coach=hint]").click();
    await page.locator("[data-coach=hint]").click();
    assert.equal(await page.locator("#chessboard .tc-sq-hint").count(), 1);
    await page.locator("#chessboard [data-square=d1]").click();
    await page.locator("#chessboard [data-square=d8]").click();
    await page.waitForFunction(() => app.over && !app.thinking);
    assert.equal(await page.evaluate(() => app.moveData[0].retried?.san), "Qd4");
    assert.match(await page.locator("#coachContent").innerText(), /Review this game/);

    // Switching modes closes any demonstration and keeps the game.
    await page.evaluate(() => app._showLessonLine(app.moveData[0], "best"));
    await page.locator("#modePuzzles").click();
    assert.equal(await page.evaluate(() => app.activeVariation), null);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#modeCoach").click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log("PASS paused mistake without spoilers, both demonstration lines, retry with hints, game preservation and layouts");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

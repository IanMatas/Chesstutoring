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
    await page.waitForFunction(() => app.cachedEval && window.ChessTeach);
    await page.evaluate(() => { ChessTeach.profile.setLevel("beginner"); ChessTeach.profile.setPause(true); });
    await page.locator("#modeCoach").click();
    // 1.e4 e5, then 2.Ba6?? puts the bishop where two black pieces can take it.
    await page.evaluate(async () => {
      app.game = new Chess("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
      app.playerColor = "w"; app.flipped = false; app.over = false;
      app._resetHistory(); app._buildBoard(); app._render();
      await app._evalAndCache();
      app.panel.refresh();
    });
    await page.locator("#chessboard [data-square=f1]").click();
    await page.locator("#chessboard [data-square=a6]").click();
    await page.waitForFunction(() => app.pending && !app.thinking);
    const card = await page.locator("#coachContent .tc-card").innerText();
    assert.match(card, /bishop can be taken on a6/);
    assert.match(card, /Big mistake/i);
    assert.match(card, /Blunder check/i);
    assert.ok(await page.locator('#chessboard [data-square=a6].tc-sq-danger').count());
    assert.ok(await page.locator("#chessboard .board-arrows [data-arrow-id^='tc-']").count());
    assert.ok(await page.evaluate(() => ChessTeach.profile.data.history.some((h) => h.c === "hanging-piece")));

    // Continue with the mistake: the bot replies and the routine appears, revealed for beginners.
    await page.locator("[data-coach=continue]").click();
    await page.waitForFunction(() => app.moveData.length === 2 && !app.thinking);
    assert.match(await page.locator(".tc-recap summary").innerText(), /Big mistake/i);
    assert.match(await page.locator(".tc-bot-note").innerText(), /The bot played/);
    assert.equal(await page.locator("[data-coach=reveal]").count(), 0);
    assert.equal(await page.locator(".tc-live li").count(), 3);

    // Layout: the board stays in view next to the lesson on a laptop screen.
    await page.setViewportSize({ width: 1366, height: 768 });
    const fit = await page.evaluate(() => {
      const b = document.getElementById("chessboard").getBoundingClientRect();
      const c = document.querySelector("#playMode .coach-section").getBoundingClientRect();
      return { boardVisible: b.bottom <= innerHeight && b.top >= 0, beside: c.left >= b.right, page: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.deepEqual(fit, { boardVisible: true, beside: true, page: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const order = await page.evaluate(() => {
      const b = document.getElementById("chessboard").getBoundingClientRect();
      const c = document.getElementById("coachContent").getBoundingClientRect();
      return { below: c.top >= b.bottom, page: document.documentElement.scrollWidth <= innerWidth, gap: Math.round(c.top - b.bottom) };
    });
    assert.equal(order.below, true);
    assert.equal(order.page, true);
    assert.ok(order.gap < 200, `lesson should sit right under the board on phones (gap ${order.gap}px)`);
    assert.deepEqual(errors, []);
    console.log("PASS hanging-piece lesson, board highlights, continue flow, beginner routine and board-in-view layouts");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

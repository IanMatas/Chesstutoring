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
    await page.evaluate(async () => {
      app.game = new Chess("3r2k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1");
      app.playerColor = 'w'; app.flipped = false; app.over = false;
      app._resetHistory(); app._buildBoard(); app._render();
      await app._evalAndCache();
    });
    await page.locator('#chessboard [data-square=d1]').click();
    await page.locator('#chessboard [data-square=d4]').click();
    await page.waitForFunction(() => app.moveData.length === 2 && !app.thinking);
    const message = await page.locator('#quickCoachLesson').textContent();
    assert.match(message, /Rxd4.*queen.*d4/);
    assert.match(message, /cannot immediately recapture/);
    const live = await page.evaluate(() => ({fen:app.game.fen(),history:app.posHistory.slice()}));
    await page.locator('#showMoveWhy').click();
    await page.waitForFunction(() => moveLessons.comparison && app.activeVariation?.moveLesson);
    await page.evaluate(() => moveLessons.pause());
    assert.match(await page.locator('#lessonVerdict').textContent(), /Rxd4.*queen/);
    assert.deepEqual(await page.evaluate(() => new Chess(app.activeVariation.positions[app.varStepIndex]).get('d4')), {type:'r',color:'b'});
    for(const width of [1280,820,390,320]) {
      await page.setViewportSize({width,height:900});
      const layout = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('.variation-preview-controls button, #moveLessonControls button')].filter(b=>b.getClientRects().length);
        const rects = buttons.map(b=>b.getBoundingClientRect());
        return {
          fits: buttons.every(b=>b.scrollWidth<=b.clientWidth+1),
          inside: rects.every(r=>r.left>=0&&r.right<=innerWidth+1),
          overlap: rects.some((a,i)=>rects.slice(i+1).some(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1)),
          pageFits:document.documentElement.scrollWidth<=innerWidth
        };
      });
      assert.deepEqual(layout,{fits:true,inside:true,overlap:false,pageFits:true}, `layout at ${width}px`);
    }
    await page.locator('#variationPreviewBanner').screenshot({path:'/tmp/chess-blunder-mobile.png'});
    await page.locator('#lessonBest').click();
    await page.locator('#varEndBtn').click();
    assert.match(await page.locator('#varPreviewDesc').textContent(), /Checkmate/);
    await page.locator('#varExitBtn').click();
    assert.deepEqual(await page.evaluate(() => ({fen:app.game.fen(),history:app.posHistory.slice()})), live);
    const sacrifice = await page.evaluate(() => moveLessons.explain(
      {san:'Qe8+',fenBefore:'r5k1/4Qppp/8/8/8/8/5PPP/4R1K1 w - - 0 1'},
      {pv:['e7e8','a8e8','e1e8'],mate:2},
      {pv:['e7e8','a8e8','e1e8'],mate:2},0
    ).text);
    assert.match(sacrifice,/preserves a mating attack/);
    assert.doesNotMatch(sacrifice,/Blunder|losing trade/);
    assert.deepEqual(errors, []);
    console.log(
      "PASS real queen blunder feedback, punishment board, mating alternative, sacrifice accuracy and nonoverlapping desktop/tablet/mobile controls",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

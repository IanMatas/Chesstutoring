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
    page.setDefaultTimeout(120000);
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
    await page.waitForFunction(() => app.cachedEval && window.gameReview);
    const reviewed = () => page.waitForFunction(() => gameReview.state === "review");

    // The sample game: White walks into a known trap.
    await page.locator("#modeReview").click();
    assert.match(await page.locator("#reviewBody").innerText(), /Practice your key moments/);
    await page.locator("[data-review=sample]").click();
    assert.match(await page.locator(".tc-review-setup").innerText(), /Which side did you play/);
    await page.locator('[data-review=side][data-side="w"]').click();
    assert.equal(await page.locator('[data-review=side][data-side="w"]').getAttribute("aria-pressed"), "true");
    await page.locator("[data-review=start]").click();
    await reviewed();
    const summary = await page.locator(".tc-review-summary").innerText();
    assert.match(summary, /accuracy/);
    assert.match(summary, /Your lessons from this game/i);
    const verdicts = await page.evaluate(() => gameReview.info.map((x) => x.verdict));
    assert.deepEqual(verdicts.slice(0, 5), ["book", "book", "book", "book", "book"], "Opening moves are recognised as book moves");
    assert.ok(await page.evaluate(() => gameReview.keys.includes(8)), "5.Nxf7 is a key moment");
    assert.match(await page.evaluate(() => gameReview.lessonAt(8).headline), /g2 was already under attack|double attack/);
    assert.ok(await page.locator(".tc-mv-blunder").count());

    // Every move has a card; a key moment offers practice, lines and the better move.
    await page.locator('.tc-mv[data-ply="1"]').click();
    assert.match(await page.locator("#reviewCard").innerText(), /Book move/);
    await page.locator('.tc-mv[data-ply="9"]').click();
    assert.match(await page.locator("#reviewCard").innerText(), /Key moment/);
    await page.locator("[data-review=line-played]").click();
    assert.ok(await page.locator("#reviewLine").isVisible());
    await page.locator("[data-review=line-next]").click();
    assert.match(await page.locator("#reviewLine").innerText(), /Move 2 of/);
    await page.locator("#reviewLine [data-review=back]").click();
    assert.equal(await page.locator("#reviewLine").isVisible(), false);

    // Practice: the game move is rejected with a reason; the engine's move is accepted.
    await page.locator("#reviewCard [data-review=try]").click();
    const moments = await page.evaluate(() => ({ played: gameReview.game.moves[8], best: gameReview.evals[8].best }));
    const play = async (from, to) => {
      await page.locator(`#reviewBoard [data-square=${from}]`).click();
      await page.locator(`#reviewBoard [data-square=${to}]`).click();
      await page.waitForFunction(() => gameReview.trying && !gameReview.trying.busy);
    };
    await play(moments.played.from, moments.played.to);
    assert.match(await page.locator("#reviewCard").innerText(), /Not quite/);
    await page.locator("#reviewCard [data-review=hint]").click();
    assert.equal(await page.locator("#reviewCard .tc-hints li").count(), 1);
    await play(moments.best.slice(0, 2), moments.best.slice(2, 4));
    assert.match(await page.locator("#reviewCard").innerText(), /Well found/i);
    await page.locator("#reviewCard [data-review=back]").click();
    assert.equal(await page.evaluate(() => gameReview.index), 9);
    console.log("PASS sample review: book moves, key moments, lines and practice");

    // Free Play hands its game to the review; both sides can be reviewed.
    await page.locator("#modePlay").click();
    for (const [a, b] of [["e2", "e4"], ["e7", "e5"], ["d1", "h5"], ["b8", "c6"], ["f1", "c4"], ["g8", "f6"], ["h5", "f7"]]) {
      await page.locator(`#freeBoard [data-square=${a}]`).click();
      await page.locator(`#freeBoard [data-square=${b}]`).click();
    }
    await page.locator("[data-free=review]").click();
    assert.ok(await page.locator("#reviewMode").isVisible());
    await page.locator('[data-review=side][data-side="both"]').click();
    await page.locator("[data-review=start]").click();
    await reviewed();
    assert.ok(await page.evaluate(() => gameReview.keys.includes(5)), "...Nf6 allowing mate is a key moment");
    assert.match(await page.evaluate(() => gameReview.lessonAt(5).headline), /checkmate/i);

    // PGN import from the review page.
    await page.locator("#reviewMode .study-heading [data-review=load]").click();
    await page.locator("#pgnText").fill('[White "You"]\n[Black "Friend"]\n[Result "*"]\n\n1. d4 d5 2. c4 e6 *');
    await page.locator("#pgnLoad").click();
    assert.equal(await page.locator("#pgnDialog").isVisible(), false);
    assert.match(await page.locator(".tc-review-setup").innerText(), /You vs Friend/);
    assert.equal(await page.locator('[data-review=side][data-side="w"]').getAttribute("aria-pressed"), "true");

    // Coach Play games open straight into a review of the player's side.
    await page.locator("#modeCoach").click();
    if (await page.locator("[data-level=intermediate]").count()) await page.locator("[data-level=intermediate]").click();
    await page.locator("#chessboard [data-square=d2]").click();
    await page.locator("#chessboard [data-square=d4]").click();
    await page.waitForFunction(() => app.moveData.length >= 2 && !app.thinking && !app.pending);
    await page.evaluate(() => gameReview.openFromCoach());
    await reviewed();
    assert.equal(await page.evaluate(() => gameReview.side), "w");
    assert.equal(await page.evaluate(() => gameReview.game.moves.length), await page.evaluate(() => app.moveData.length));

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator("#modePlay").click();
    assert.equal(await page.evaluate(() => gameReview.engines), null);
    assert.deepEqual(errors, []);
    console.log("PASS free play handoff, both-side review, PGN import, coach handoff, mobile layout");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

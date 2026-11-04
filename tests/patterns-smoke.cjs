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
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
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
        await page.route(url, (r) =>
          r.fulfill({
            path: path.join(process.env.CHESS_TEST_ASSET_DIR, file),
            contentType: "application/javascript",
          }),
        );
    await page.goto(process.env.CHESS_TEST_URL || "http://127.0.0.1:8000");
    await page.waitForFunction(() => window.patterns && app.cachedEval);
    const gameFen = await page.evaluate(() => app.game.fen());
    const lessons = await page.evaluate(() =>
      ChessPatterns.LESSONS.map((l) => {
        const g = new Chess(l.fen);
        const other = l.fen.split(" ");
        other[1] = g.turn() === "w" ? "b" : "w";
        other[3] = "-";
        if (new Chess(other.join(" ")).in_check())
          throw Error("Illegal starting check: " + l.id);
        for (const u of l.line) {
          if (!g.move({ from: u.slice(0, 2), to: u.slice(2, 4) }))
            throw Error("Illegal lesson: " + l.id + " " + u);
        }
        if (["backrank", "pin"].includes(l.id) && !g.in_checkmate())
          throw Error("Missing mate: " + l.id);
        return l.id;
      }),
    );
    await page.locator("#modePuzzles").click();
    await page.locator("#patternShortcut").click();
    assert.equal(await page.locator("[data-lesson]").count(), 8);
    for (const id of lessons) {
      await page.locator(`[data-lesson="${id}"]`).click();
      await page.locator('[data-action="calculate"]').click();
      await page.waitForFunction(() => !patterns.busy);
      assert.equal(
        await page.evaluate(() => patterns.stage),
        "calculate",
        await page.locator("#patternStatus").textContent(),
      );
      assert.equal(await page.locator("#patternEvaluation").count(), 0);
      assert.equal(
        await page.locator("#patternBoard .learning-square").count(),
        64,
        JSON.stringify({
          errors,
          status: await page.locator("#patternStatus").textContent(),
        }),
      );
      const fresh = await page.evaluate(() => patterns.exercise.fen);
      assert.notEqual(fresh, await page.evaluate(() => patterns.lesson.fen));
      if (["backrank", "restraint"].includes(id)) {
        await page.locator('[data-action="submit"]').click();
        assert.match(
          await page.locator("#patternStatus").textContent(),
          /two different/,
        );
        const plan = await page.evaluate(async () => {
          const x = patterns.exercise,
            g = new Chess(x.fen);
          const a = x.key.pv[0],
            b = g
              .moves({ verbose: true })
              .map((m) => m.from + m.to + (m.promotion || ""))
              .find((u) => u !== a);
          g.move({ from: a.slice(0, 2), to: a.slice(2, 4) });
          const reply = (await patterns.search(g.fen())).pv[0];
          g.move({ from: reply.slice(0, 2), to: reply.slice(2, 4) });
          const follow = (await patterns.search(g.fen())).pv[0];
          return { a, b, reply, follow };
        });
        for (const [id, key] of [
          ["planA", "a"],
          ["planB", "b"],
          ["planReply", "reply"],
          ["planFollow", "follow"],
        ])
          await page.locator("#" + id).selectOption(plan[key]);
        await page.locator('[data-action="submit"]').click();
        await page.waitForFunction(() => !patterns.busy);
        assert.equal(
          await page.evaluate(() => patterns.exercise.clean),
          id === "backrank",
        );
        await page.locator('[data-action="defend"]').click();
        const defense = await page.evaluate(
          async () =>
            (await patterns.search(patterns.exercise.defenseFen)).pv[0],
        );
        await page.locator("#defenseMove").selectOption(defense);
        await page.locator('[data-action="submit-defense"]').click();
        await page.waitForFunction(() => !patterns.busy);
        assert.equal(
          await page.evaluate(() => patterns.exercise.defenseOK),
          true,
        );
        await page.locator('[data-action="review"]').click();
        assert.match(
          await page.locator("#patternEvaluation").textContent(),
          id === "backrank" ? /mate/ : /estimate|mate/,
        );
        await page.locator('[data-action="replay-next"]').click();
        assert.match(
          await page.locator("#patternInvestment").textContent(),
          /Material balance/,
        );
        const p = await page.evaluate(
          () => patterns.data.results[patterns.lesson.id],
        );
        assert.equal(p.attempts, 1);
        assert.equal(p.clean, id === "backrank" ? 1 : 0);
        assert.equal(p.retained, 0);
        await page.locator('[data-action="again"]').click();
        await page.waitForFunction(() => !patterns.busy);
        assert.notEqual(
          await page.evaluate(() => patterns.exercise.fen),
          fresh,
        );
        await page.locator('[data-action="hint"]').click();
        assert.equal(
          await page.evaluate(() => patterns.exercise.assisted),
          true,
        );
      }
      console.log("Verified lesson and fresh variation:", id);
      await page.locator('[data-action="hub"]').click();
    }
    // Leaving during generation must not repaint the new mode or leak a worker.
    await page.locator('[data-lesson="pin"]').click();
    await page.locator('[data-action="calculate"]').click();
    await page.locator("#modePlay").click();
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => patterns.engine), null);
    assert.equal(await page.locator("#patternsMode").isVisible(), false);
    assert.equal(await page.evaluate(() => app.game.fen()), gameFen);
    await page.reload();
    await page.waitForFunction(() => window.patterns && app.cachedEval);
    assert.equal(
      await page.evaluate(() => patterns.data.results.backrank.clean),
      1,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#modePuzzles").click();
    await page.locator("#patternShortcut").click();
    await page.locator('[data-lesson="backrank"]').click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: "/tmp/patterns-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log("Pattern coaching smoke checks passed.");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

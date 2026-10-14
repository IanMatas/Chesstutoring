const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

// Preserve the original styles; compact coaching layout rules may be appended.
for (const [file, expected, originalLength] of [
    ['styles.css', '6ac29af1b7c3ddc930c157cdf9a47cfee452a13f96f1faaff82a5c13d3865010', null],
    ['learning.css', '569950da88655cedf5c1c43e2d54b8b8af0af470624f3908bdafb68da39db66a', 13486]
]) {
    const bytes = fs.readFileSync(path.join(__dirname, '../css', file));
    const actual = createHash('sha256').update(originalLength ? bytes.subarray(0, originalLength) : bytes).digest('hex');
    assert.equal(actual, expected, 'Preserve uploaded stylesheet: ' + file);
}

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox']
    });
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(20000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        if (process.env.CHESS_TEST_ASSET_DIR) {
            for (const [url, file] of [
                ['https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js', 'chesstutoring-chess.js'],
                ['https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js', 'chesstutoring-stockfish.js']
            ]) {
                await page.route(url, route => route.fulfill({
                    contentType: 'application/javascript',
                    path: path.join(process.env.CHESS_TEST_ASSET_DIR, file)
                }));
            }
        }
        await page.goto(process.env.CHESS_TEST_URL || 'http://127.0.0.1:8000/');
        await page.waitForFunction(() => app.cachedEval);
        assert.equal(await page.locator('.mode-tabs .mode-tab').count(), 5);
        await page.locator('#modeCoach').click();
        // First visit: the coach asks for a level, then teaches the three-step routine.
        await page.locator('[data-level=intermediate]').click();
        assert.match(await page.locator('#coachContent').innerText(), /three questions/);
        assert.equal(await page.locator('#coachLevel').inputValue(), 'intermediate');
        await page.locator('#chessboard [data-square=e2]').click();
        await page.locator('#chessboard [data-square=e4]').click();
        await page.waitForFunction(() => app.moveData.length === 2 && !app.thinking);
        // After the bot replies: a recap of your move, what the bot did, and the routine.
        assert.match(await page.locator('.tc-recap summary').innerText(), /Book/i);
        assert.match(await page.locator('.tc-bot-note').innerText(), /The bot played/);
        assert.equal(await page.locator('.tc-live li').count(), 3);
        await page.locator('[data-coach=reveal][data-step="1"]').click();
        assert.equal(await page.locator('[data-coach=reveal][data-step="1"]').count(), 0);
        // History navigation shows the lesson for the viewed move.
        await page.locator('#prevMoveBtn').click();
        assert.match(await page.locator('#coachContent .tc-card .tc-move').innerText(), /1\.e4/);
        await page.locator('#nextMoveBtn').click();
        assert.ok(await page.locator('.tc-bot-note').isVisible());
        // A stored line plays on the board without changing the game.
        const gameFen = await page.evaluate(() => app.game.fen());
        await page.evaluate(() => app._showLessonLine(app.moveData[0], 'played'));
        await page.locator('#varEndBtn').click();
        assert.equal(await page.evaluate(() => app.game.fen()), gameFen);
        await page.locator('#varExitBtn').click();
        console.log('PASS level choice, lesson cards, thinking routine, history and line preview');

        await page.evaluate(async () => {
            await learning.open({ id: 'quiz-test', kind: 'engine', skill: 'calculation', title: 'Test check-in',
                fen: app.game.fen(), line: [app.cachedEval.bestMove], prompt: 'Find a strong move.' }, 'quiz');
        });
        assert.ok(await page.locator('#puzzleDialog').isVisible());
        await page.locator('#closePuzzle').click();
        assert.equal(await page.evaluate(() => app.game.fen()), gameFen);
        assert.ok(await page.locator('.tc-bot-note').isVisible());
        console.log('PASS quiz pause/resume preserves the game and the coaching');

        await page.locator('#modePuzzles').click();
        await page.locator('[data-puzzle-filter=all]').click();
        await page.locator('[data-puzzle="loose-queen"]').click();
        await page.locator('#puzzleBoard [data-square=d1]').click();
        await page.locator('#puzzleBoard [data-square=d5]').click();
        assert.ok(await page.evaluate(() => learning.session.done));
        await page.locator('#closePuzzle').click();
        console.log('PASS uploaded puzzle collection and original dialog');

        const seen = new Set();
        let reviewedId;
        for (const difficulty of ['standard', 'challenging', 'expert']) {
            if (difficulty === 'challenging') {
                await page.evaluate(() => { learning.preferredDifficulty='challenging'; learning.renderHub(); });
                await page.locator('[data-start-practice]').click();
            }
            else await page.locator(`[data-generate=${difficulty}]`).click();
            await page.waitForFunction(() => learning.session && !learning.session.busy, null, { timeout: 115000 });
            assert.equal(await page.evaluate(() => !!learning.session.failed), false, await page.locator('#puzzleFeedback').innerText());
            const puzzle = await page.evaluate(() => learning.session.puzzle);
            assert.equal(puzzle.line.length, { standard: 3, challenging: 5, expert: 7 }[difficulty]);
            const key = puzzle.fen.split(' ').slice(0, 4).join(' ');
            assert.ok(!seen.has(key));
            seen.add(key);
            assert.ok(await page.evaluate(() => {
                const game = new Chess(learning.session.puzzle.fen);
                return learning.session.puzzle.line.every(move => game.move(ChessLearning.moveObject(move)));
            }));
            if (difficulty === 'standard') {
                // Choose a poor legal move using a restricted search, then test the UI grader.
                const badMove = await page.evaluate(async () => {
                    const s = learning.session, engine = await learning.getEngine();
                    const best = await engine.evaluate(s.game.fen(), 11, 350);
                    for (const m of s.game.moves({ verbose: true })) {
                        const u = m.from + m.to + (m.promotion || '');
                        if (u === s.puzzle.line[0]) continue;
                        const candidate = await engine.evaluate(s.game.fen(), 11, 350, [u]);
                        if (candidate.mate < 0 || (best.mate > 0 && candidate.mate == null) || (best.score - candidate.score > 300)) return u;
                    }
                    return null;
                });
                assert.ok(badMove, 'Find a clearly inferior move to test grading');
                const before = await page.evaluate(() => learning.session.game.fen());
                await page.evaluate(move => learning.submit(ChessLearning.moveObject(move)), badMove);
                assert.equal(await page.evaluate(() => learning.session.game.fen()), before);
                assert.equal(await page.evaluate(() => learning.session.errors), 1);
                await page.locator('#puzzleHint').click();
            }
            for (let turn = 0; turn < 5 && !await page.evaluate(() => learning.session.done); turn++) {
                await page.evaluate(() => {
                    const s = learning.session;
                    return learning.submit(ChessLearning.moveObject(s.puzzle.line[s.index]));
                });
            }
            assert.equal(await page.locator('#puzzleStep').innerText(), difficulty === 'standard' ? 'IDEA COMPLETED' : 'SOLVED WITHOUT HELP');
            assert.ok(await page.locator('#puzzleReview').isVisible());
            const solvingFen = await page.evaluate(() => learning.session.game.fen());
            await page.locator('#puzzleReviewNext').click();
            assert.equal(await page.evaluate(() => learning.session.game.fen()), solvingFen);
            assert.ok((await page.locator('#puzzleReviewNote').innerText()).length > 40);
            reviewedId = puzzle.id;
            if (difficulty === 'challenging') {
                await page.locator('#puzzleNext').click();
                await page.waitForFunction(() => learning.session && !learning.session.busy, null, { timeout: 115000 });
                assert.equal(await page.evaluate(() => !!learning.session.failed), false);
                assert.ok(!seen.has(await page.evaluate(() => learning.session.puzzle.fen.split(' ').slice(0, 4).join(' '))));
                await page.locator('#puzzleReveal').click();
                assert.equal(await page.locator('#puzzleStep').innerText(), 'LINE TO REMEMBER');
            }
            await page.locator('#closePuzzle').click();
            console.log('PASS', difficulty, 'fresh generation, legal multi-move line, completion');
        }
        await page.reload();
        await page.waitForFunction(() => app.cachedEval);
        assert.ok(await page.evaluate(id => learning.store.data.results[id]?.solves === 1, reviewedId));
        assert.ok(await page.evaluate(() => learning.store.data.results['loose-queen']?.solves === 1));
        assert.ok(await page.evaluate(() => learning.store.data.generated.length >= 4));
        console.log('PASS uploaded progress and generated reviews survive reload');

        await page.locator('#modePuzzles').click();
        const beforeCancel = await page.evaluate(() => learning.store.data.generated.length);
        await page.locator('[data-generate=expert]').click();
        await page.locator('#closePuzzle').click();
        assert.equal(await page.evaluate(() => learning.session), null);
        assert.equal(await page.evaluate(() => learning.store.data.generated.length), beforeCancel);
        await page.locator('[data-puzzle-filter=fresh]').click();
        assert.equal(await page.locator('[data-generate]').count(), 3);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(await page.locator('[data-generate=challenging]').isVisible());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        console.log('PASS cancellation, original mobile layout, no page errors');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

# Chess Tutor

A browser chess tutor with Stockfish analysis, coached games, opening lessons,
scenarios, endgames, and generated puzzles.

## Run

From this directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

No application build or package installation is required. The browser loads
chess.js from cdnjs.cloudflare.com and Stockfish from cdn.jsdelivr.net. Piece
images and fonts use upload.wikimedia.org, fonts.googleapis.com, and
fonts.gstatic.com. Those destinations must be reachable with valid TLS trust.

## Coaching during play

After the bot replies, the panel keeps your previous move's complete lesson,
classification, suggestions, board analysis, and variations. The current
position has separate Stockfish candidate lines with evaluations from White's
perspective. Select a line to step through it without changing the game.
**Practice this position** starts a new practice game at the displayed position,
with you playing the side to move; it replaces the current game history.

## Endless Puzzles

Select **Endless Puzzles** to generate new positions from randomized legal games.
Stockfish filters for a clear best continuation and verifies both sides of the
solution. Standard asks for two player moves, Challenging three, and Expert four.
Harder levels reject large initial advantages and require more decisions with a
clear separation between the best move and alternatives. These are difficulty
filters, not calibrated Elo ratings.

Play moves by selecting a piece and destination. Choose the promotion piece
before promoting. The engine plays the replies and checks alternative solutions;
a sound alternative within 0.35 pawns of its best evaluation is accepted, while
mating positions must preserve the mating line. Hints, mistakes, and retries mark
a completion as assisted. Revealing a solution lets you review each position.

There is no fixed puzzle deck. The most recent 2,000 positions are remembered in
local storage to reduce repetition across sessions, alongside completion counts.
Repeats are still possible after that window or if browser storage is unavailable.
Searching for a suitable combination may take time, especially on Expert. You
can cancel, and a search that finds no match offers another batch rather than
silently lowering difficulty. An active search is cancelled when you leave the puzzles tab.

## Browser regression checks

The smoke test uses Playwright and Chromium. Install test tooling outside the
application checkout if it is not already available:

```sh
npm install --prefix /tmp/chess-tutor-test-tools playwright
NODE_PATH=/tmp/chess-tutor-test-tools/node_modules node tests/browser-smoke.cjs
```

Keep the local server running while testing. Set `CHROMIUM_PATH` for a Chromium
binary elsewhere, or `CHESS_TEST_URL` for another server address. The test checks
persistent coaching, line previews and history, all three puzzle levels, legal
solutions, incorrect moves, hints, completion counts, cancellation, mobile board
layout, and practice from a selected line. Puzzle generation tests use the real
engine and can take several minutes.

In a test environment whose browser cannot trust its network proxy, an optional
`CHESS_TEST_ASSET_DIR` may point to **previously TLS-verified** copies named
`chesstutoring-chess.js` (chess.js 0.10.3) and `chesstutoring-stockfish.js`
(stockfish.js 10.0.2). The test serves those exact scripts through Playwright
request routing. This tests application behavior; it does not validate direct
browser CDN access or external images and fonts. Do not disable TLS verification.

# Chess Tutor

This version uses the supplied Free Play / Puzzles / Coach Play application as
its base. Both supplied stylesheets are preserved unchanged. Opening lessons,
strategy lessons, endgames, the analysis board, saved game moments, and review
scheduling remain available.

## Run

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

There is no build step. The browser needs chess.js from cdnjs.cloudflare.com,
Stockfish from cdn.jsdelivr.net, piece images from upload.wikimedia.org, and fonts
from fonts.googleapis.com / fonts.gstatic.com, with valid TLS trust.

## Coaching

Free Play keeps the supplied quiet interface. Coach Play restores the full move
lesson, classification, board analysis, threats, defense advice, and candidate
lines. Your move's lesson remains available after the bot replies. Use **Use
short guidance** / **Show full coaching** to switch between the supplied compact
coaching and the detailed analysis.

Expand an engine line and select **Explore this line** to step through its moves
without changing the game. Evaluations are from White's perspective; continuations
are predictions, not forced replies. Practicing a displayed position starts a new
game from that point and replaces the current game history.

## Continuous puzzle practice

In the existing **Puzzles** collection, choose a fresh challenge card or the
**Endless challenges** filter. Challenges open in the supplied puzzle dialog,
using the same board, images, buttons, hints, and solution feedback. The original
collection, personal game moments, review queue, and Coach Play quizzes remain.

Stockfish checks positions from randomized legal games. Standard requires two
player moves, Challenging three, and Expert four. Harder levels reject large
initial advantages and require more meaningful decisions. These filters are not
calibrated Elo ratings. Sound alternative moves are checked from the same root
position; alternatives within 0.35 pawns of the best evaluation are accepted,
while mating alternatives must preserve the mating advantage and distance.

After a generated challenge, **Next puzzle** generates another at the same
level. There is no fixed deck or puzzle-count limit. The latest 2,000 positions
are remembered to reduce repeats, and the latest 200 generated puzzles remain
available for review. Existing learning progress is retained in the same browser
storage. Repeats remain possible outside the recent window or when storage is
unavailable.

Generation can take time, especially on Expert. Close the dialog to cancel.
A search that cannot verify a suitable position offers another search without
scoring an attempt or silently reducing difficulty. Hints and mistakes count as
guided practice; existing spaced-review rules apply to generated challenges too.

## Browser regression checks

Keep the local server running. If Playwright is not already available:

```sh
npm install --prefix /tmp/chess-tutor-test-tools playwright
NODE_PATH=/tmp/chess-tutor-test-tools/node_modules node tests/browser-smoke.cjs
```

Set `CHROMIUM_PATH` for a browser outside `/usr/bin/chromium`, or `CHESS_TEST_URL`
for a different server address. Checks cover stylesheet preservation, the supplied
navigation and collection, full/short coaching, move history and previews, quiz
pause/resume, all generated difficulty levels, incorrect moves, hints, new
challenges, solution reveal, persistent reviews, cancellation, and mobile layout.
The real-engine generation checks can take several minutes.

For environments whose browser cannot trust their network proxy,
`CHESS_TEST_ASSET_DIR` can point to previously TLS-verified copies named
`chesstutoring-chess.js` (chess.js 0.10.3) and `chesstutoring-stockfish.js`
(stockfish.js 10.0.2). Playwright supplies those exact scripts to the page. This
validates application behavior, not direct browser CDN connectivity or external
images/fonts. TLS verification must remain enabled when obtaining these files.

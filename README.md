# Chess Tutor

This version uses the supplied Free Play / Puzzles / Coach Play application as
its base. The supplied palette and typography are retained, with a compact sticky
coaching summary added to reduce scrolling. Opening lessons,
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

Free Play keeps the supplied quiet interface. Coach Play puts a short **Your move /
Watch for / Next line** summary above the board, where it stays visible while
playing. Expand **Full lesson, threats and engine variations** for the full move
lesson, classification, board analysis, threats, defense advice, and candidate
lines. Your move's lesson remains available after the bot replies. Use **Use
short guidance** / **Show full coaching** to switch between the supplied compact
coaching and the detailed analysis.

Expand an engine line and select **Explore this line** to step through its moves
without changing the game. Evaluations are from White's perspective; continuations
are predictions, not forced replies. Practicing a displayed position starts a new
game from that point and replaces the current game history.

## Continuous puzzle practice

The **Puzzles** screen defaults to **Endless challenges**. **Start a fresh
challenge** generates a new position; **Next fresh challenge** generates another,
even after a fixed collection puzzle. Choose a difficulty card to change level.
The finite teaching examples remain accessible under **Study collection**. Challenges open in the supplied puzzle dialog,
using the same board, images, buttons, hints, and solution feedback. The original
collection, personal game moments, review queue, and Coach Play quizzes remain.

Stockfish checks positions from randomized legal games. Standard requires two
player moves, Challenging three, and Expert four. Harder levels reject large
initial advantages and require more meaningful decisions. These filters are not
calibrated Elo ratings. Sound alternative moves are checked from the same root
position; alternatives within 0.35 pawns of the best evaluation are accepted,
while mating alternatives must preserve the mating advantage and distance.

After a generated challenge, **Next fresh challenge** generates another at the same
level. Hints direct attention to checks, captures, and recaptures. After solving
or revealing, review each move on the original board with an explanation of its
capture/check and the material result of the line. Reviewing does not change
the solving history or score. There is no fixed deck or puzzle-count limit. The latest 2,000 positions
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

## Guided pattern coaching

Open **Puzzles → Learn attacking patterns, defenses and sacrifices**, or
**Study library → Pattern training**. This uses the existing green interface
and keeps your current game intact.

Eight lessons cover knight forks, back-rank queen sacrifices, a rook investment
that forces a fork, discovered attacks, relative pins, rejecting an unsound bishop
sacrifice, pawn breakthroughs, and defensive escape squares. Each lesson follows
**Learn → Calculate → Defend → Review**:

- Step through an explained example, including recaptures and declined sacrifices.
- Compare two legal candidates and predict the opponent's reply and your next move
  without moving the board or seeing engine scores.
- Choose a defense; preserving equality counts, and forced-loss positions are
  explicitly identified as resistance exercises.
- Replay your choices and engine alternatives, with material balances and
  finite-depth evaluation rather than claims of guaranteed compensation.

Study variations change supporting pawns and colors, reject recently seen
positions, and check legality and the pattern move with a separate Stockfish
worker. They are constructed study positions, not claimed to be played games.
Generation is bounded and offers a retry if verification fails. The existing
Endless challenges generator still supplies positions from randomized legal games.

Pattern progress uses the separate `chess-tutor.patterns.v1` browser-storage key.
It tracks completed calculations, hint-free results, defenses, and reviews after
at least a day. Review intervals grow from 1 to 3, 7, and 14 days; repeating a
position immediately does not count as retained learning. Scores are training
feedback, not an Elo estimate. Engine checks accept close alternatives (within
0.70 pawns), preserve winning mates, and compare resistance in forced losses.

Run `node tests/patterns-smoke.cjs` alongside the existing browser regression
suite. It supports the same `CHESS_TEST_URL`, `CHROMIUM_PATH`, and
`CHESS_TEST_ASSET_DIR` settings and uses real Stockfish searches.

## Show why a game move matters

In Coach Play, **Show why on the board** opens a reversible comparison of your
last move with an engine alternative from the same starting position. A dedicated
Stockfish worker checks both root moves; deeper analysis may revise the earlier
quick label. Switch between the two lines, watch the automatic demonstration, or step through them
on the board with arrows. Notes identify captures, checks, newly available capture
threats, development and running material changes. Sacrifice lines include the
opponent's replies and recaptures. If the shown line has no net material change,
the explanation identifies that limit instead of inventing a tactical win.

Demonstrations advance every three seconds and can be paused or stepped manually.
There is no prediction quiz to complete. Notes name the pieces, explain checks
and immediate recaptures, and describe the material cost in familiar piece values.
Evaluations are finite-search estimates.
The demonstration preserves the live game; **Back to Game** returns to it. The
existing **Play vs Bot** button intentionally starts a practice game at the viewed
position. Navigation cancels pending comparison searches.

`node tests/move-lessons-smoke.cjs` checks actual move entry, both branches,
automatic playback, a forced queen-sacrifice mate, game preservation and mobile layout.
It uses the same environment variables as the other browser suites.

## Guided coach v3 interface

**Learn on the board** is now a visible main navigation item. Its default view
replaces the old multi-tab analysis dashboard with one editable board and one
current explanation. Select a piece and a destination to try a move; then watch
what it allows or compare the engine alternative. Watching a line immediately
shows its first move. Explicit Previous/Next buttons and Play sequence/Pause
advance both sides, while Return restores the editable position. Analysis uses
an isolated worker, and leaving the screen cancels it. The live game is preserved.

Engine details are collapsed by default. Coach Play similarly shows one main
takeaway, with threats and extra lines available on request. Pattern demonstrations
start with a visible move and put their Previous/Next controls above the board.
Mobile navigation exposes all four destinations rather than hiding Analysis offscreen.

The header's **Guided coach · v3** label identifies this release. Local script and
stylesheet URLs use a release query parameter to avoid reusing older cached assets.
Publishing a GitHub commit does not by itself prove that a separately hosted site
has deployed it; verify the version label on the actual URL in use.

Run `node tests/study-board-smoke.cjs` with the same browser-test environment
variables to check editing, replay, autoplay/pause, undo, pattern demonstrations,
mobile layout, cancellation and live-game preservation.

## Free Play and PGN games (v4)

**Free Play** is now an independent sandbox. You move both sides by default,
without engine analysis or automatic replies. **Coach Play** keeps its separate
coached bot game. Free Play remains usable if Stockfish cannot load (chess.js
still supplies the rules).

Use **Open PGN** to upload a file or paste one game. Previous/Next and the move
list select any position, including positions in unfinished games. Choose
**Both sides**, **White against the bot**, or **Black against the bot**, then
**Continue from this position**. The bot moves immediately if it is the opposing
side's turn. Browsing history or switching modes cancels pending bot searches.
Easy/Medium/Strong are Stockfish skill settings, not calibrated Elo ratings.

Continuing from an earlier position replaces the later moves in the working
copy. **Download PGN** exports the entire working main line, including its starting
FEN when needed. Export before branching to retain a self-play line.
**Download original PGN** preserves an imported file exactly, including comments
and variations. The board follows only its main line. Imported declared results
are retained until play changes the line; unfinished continuations use `*`.

Try [the included unfinished Italian Game](examples/study-game.pgn), also linked
in the import dialog. **Explain this position on the study board** sends the
selected position to guided analysis without altering either game.

Run `node tests/free-play-smoke.cjs` with the same test environment variables.
It covers both-side play, PGN file/text import, downloadable round-trips, branching,
original-file preservation, nonstandard starting FENs, both bot colors, cancellation,
and handoff to the study board. The header reads **Free play + PGN · v4**.

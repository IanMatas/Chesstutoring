# Chess Tutor

A browser chess coach built on Stockfish. It teaches one habit at a time: every
mistake gets a name, a short explanation of what happens on the board, and the
step of a three-step thinking routine that would have prevented it. When a move
goes wrong, the coach pauses the game so you can find a better move yourself.

The header reads **Teaching coach · v6**.

## Run

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

There is no build step. The browser needs chess.js from cdnjs.cloudflare.com,
Stockfish from cdn.jsdelivr.net, piece images from upload.wikimedia.org, and fonts
from fonts.googleapis.com / fonts.gstatic.com, with valid TLS trust.

## How the coach teaches (v6)

### One thinking routine

Strong players ask the same three questions before every move. The coach teaches
them as a habit and ties every lesson back to one of them:

1. **Their threat** — what does my opponent's last move attack or threaten?
2. **My forcing moves** — can I give check, capture something, or create a threat?
3. **Blunder check** — after my move, can anything of mine be taken, or can they check me?

Each mistake is named (hanging piece, missed threat, piece left unguarded, losing
capture, fork or double attack, checkmate danger, missed mate, free material,
missed fork, stalemate, and opening and endgame principles) and shown with the rule
to remember. The explanation comes from the actual engine lines and the board —
which piece is taken, by what, and whether you can take back. When a short engine
line shows no concrete reason, the coach says so instead of inventing one.
Opening moves from the built-in opening book are labelled **Book** with the
opening's name.

### Levels

On the first Coach Play visit the coach asks how well you know chess. You can
change the level and the **Pause on mistakes** switch at the top of the coach
panel at any time.

- **Beginner** — plain words, threats are pointed out on the board, pauses on
  mistakes and blunders.
- **Intermediate** — pauses on mistakes and blunders; you reveal threats yourself
  with **Show me**; engine details are available.
- **Advanced** — pauses only on blunders; engine details are available.

### Coach Play

After each of your moves you get one short card: what the move did, or what went
wrong. If the move is a real problem, the game pauses before the bot replies:

- **Try a better move** takes the move back. Wrong attempts are taken back too,
  each with its own explanation. **Give me a hint** escalates from the idea, to
  the piece (highlighted on the board), to the move itself.
- **Show me why** plays the opponent's punishment on the board; **Show the better
  move** plays the engine's alternative. Both are reversible and keep your game.
- **Continue with my move** lets the bot reply.

Before pausing, a suspected mistake is checked again with a deeper search, so
noise from a quick search does not stop the game. After the bot replies, the
panel shows what its move does and the three routine questions for the new
position. The board stays in view next to the lesson on wide screens; on phones
the lesson sits directly under the board. At the end of a game you get your
accuracy, the concepts to work on with practice links, and **Review this game
move by move**. Mistakes are still saved to **Puzzles → Your game moments**.

### Game review

**Game review** checks every move of a game, not just a few positions. Load a
PGN, use your Free Play game (**Review this game**), review a finished Coach Play
game, or try the included sample game. Choose the side you played (or both).

Stockfish checks every position, then double-checks each move that looks wrong
with a deeper search before calling it a mistake. The summary shows accuracy and
mistake counts for both sides, a graph of who was better, and the lessons from
your mistakes. Every move has a card — including your opponent's mistakes that
you could have punished — and each key moment offers:

- **Find a better move** — practice the position; wrong tries are explained and
  hints are available.
- **Show what happens** / **Show the better move** — step through the lines.

Analysis runs in your browser, uses up to three engine workers, and stops when
you leave the page (it resumes when you return).

### Learn on the board

The study board lists what to notice in the position (threats, loose pieces,
checks and captures) and marks them on the board. Try a move and you get the same
lesson card as Coach Play, with **Try another move**, **Watch what my move
allows** and **Watch the better move**. You control both sides; no bot moves.

### Progress

Your level, the pause setting and the concepts behind your recent mistakes are
stored in the `chess-tutor.coach.v1` browser-storage key. A reviewed game is
counted once, even if you review it again. The coach panel shows your most
frequent recent lesson as **Your focus lately**.

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

## Guided pattern coaching

Open **Puzzles → Learn attacking patterns, defenses and sacrifices**, or
**Study library → Pattern training**. This uses the existing green interface
and keeps your current game intact. Lesson cards link here when a mistake
matches a pattern (forks, checkmate patterns).

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

## Free Play and PGN games

**Free Play** is an independent sandbox. You move both sides by default,
without engine analysis or automatic replies. **Coach Play** keeps its separate
coached bot game. Free Play remains usable if Stockfish cannot load (chess.js
still supplies the rules).

Use **Open PGN** to upload a file or paste one game. Previous/Next and the move
list select any position, including positions in unfinished games. Choose
**Both sides**, **White against the bot**, or **Black against the bot**, then
**Continue from this position**. The bot moves immediately if it is the opposing
side's turn. Browsing history or switching modes cancels pending bot searches.
Easy/Medium/Strong are Stockfish skill settings, not calibrated Elo ratings.
**Review this game** sends the whole working game to Game review.

Continuing from an earlier position replaces the later moves in the working
copy. **Download PGN** exports the entire working main line, including its starting
FEN when needed. Export before branching to retain a self-play line.
**Download original PGN** preserves an imported file exactly, including comments
and variations. The board follows only its main line. Imported declared results
are retained until play changes the line; unfinished continuations use `*`.

Try [the included unfinished Italian Game](examples/study-game.pgn), also linked
in the import dialog. **Explain this position on the study board** sends the
selected position to **Learn on the board** without altering either game.

## Browser regression checks

Keep the local server running. If Playwright is not already available, install it
without downloading browsers and point `CHROMIUM_PATH` at an installed Chromium,
Chrome or Edge:

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix /tmp/chess-tutor-test-tools playwright
NODE_PATH=/tmp/chess-tutor-test-tools/node_modules node tests/teaching-smoke.cjs
```

On Windows (Git Bash), for example:
`CHROMIUM_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"`.
`CHROMIUM_PATH` defaults to `/usr/bin/chromium`; `CHESS_TEST_URL` sets a different
server address.

| Test | Covers |
| --- | --- |
| `teaching-smoke.cjs` | Verdicts, named concepts, spoiler-free hints, book moves, routine notes, narration and the learner profile, using fixed engine lines (no engine needed). |
| `blunder-feedback-smoke.cjs` | A real hanging-piece blunder in Coach Play, board highlights, continuing the game, the beginner routine, and that the board stays in view on laptop and phone layouts. |
| `move-lessons-smoke.cjs` | A paused mistake that does not reveal the answer, both demonstration lines, retry with hints until mate is found, game preservation and button layout from 320 to 1280 px. |
| `review-smoke.cjs` | Full game review: book moves, key moments, lines, practice, Free Play and Coach Play handoff, PGN import and mobile layout. |
| `browser-smoke.cjs` | Stylesheet preservation, navigation, coach levels and lesson cards, history, quiz pause/resume, the puzzle collection, all generated difficulty levels, persistent reviews and cancellation. The real-engine generation checks can take several minutes. |
| `study-board-smoke.cjs` | Learn on the board: editing, replay, autoplay/pause, undo, promotion, terminal positions and cancellation. |
| `free-play-smoke.cjs` | Both-side play, PGN file/text import, round-trips, branching, original-file preservation, nonstandard starting FENs, both bot colors and handoff to the study board. |
| `patterns-smoke.cjs` | Guided pattern lessons with real Stockfish searches. |

For environments whose browser cannot trust their network proxy,
`CHESS_TEST_ASSET_DIR` can point to previously TLS-verified copies named
`chesstutoring-chess.js` (chess.js 0.10.3) and `chesstutoring-stockfish.js`
(stockfish.js 10.0.2). Playwright supplies those exact scripts to the page. This
validates application behavior, not direct browser CDN connectivity or external
images/fonts. TLS verification must remain enabled when obtaining these files.

The original `css/styles.css` and the first part of `css/learning.css` are kept
byte-for-byte (`browser-smoke.cjs` checks this). New styles live in `css/teach.css`.
Local script and stylesheet URLs use a release query parameter (`?v=teach-v6`) so
browsers do not reuse older cached files.

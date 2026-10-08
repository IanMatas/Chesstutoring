# Chess Tutor

A static chess practice app with three main modes:

- **Free Play:** play Stockfish without quizzes or automatic move advice. Useful positions are saved as you play, so a completed game is not required.
- **Puzzles:** 18 starter positions covering safe captures, knight forks, and checkmate, plus personal game moments. Fork puzzles require the follow-up capture. Hints become progressively more specific; showing a line counts as guided practice.
- **Coach Play:** the same game with a thinking checklist and up to two short quizzes, separated by four to six player moves. Quizzes use a separate board and engine. Completing or skipping one leaves the real game unchanged.

The study library keeps the existing openings, strategy, endgames, and analysis tools accessible without adding more primary tabs.

## Run

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Run this from the repository directory. There is no application build or package installation step. The browser loads chess.js, Stockfish, fonts, and piece images from external CDNs.

## Learning and progress

Progress is stored in this browser's local storage (`chess-tutor.learning.v1`); it is not an account or cloud sync. Storage failures show a notice and allow practice to continue for the current visit.

The app saves up to three significant engine-evaluation mistakes per game, with a maximum of 40 personal positions. Personal positions are reanalyzed when opened. Engine exercises accept the preferred move and alternatives within 60 centipawns; mate evaluations are handled separately. Evaluation is bounded, so this is practice feedback, not a guarantee of perfect analysis.

The recommended queue prioritizes due reviews, new personal positions, and the current skill goal. Reviews are scheduled after 1, 3, 7, and 14 days of successful recall. Guided attempts return the next day. Repetition on the same day does not extend the review interval. Mirrored starter positions share a concept family for progress tracking.

Progress distinguishes first encounters solved without hints or retries from concepts recalled at least a day later. Coach Play compares the first three and latest three checks after six completed attempts. It does not infer a chess rating or claim that differently difficult positions prove a rating increase. Skipped, untouched quizzes are not scored.

Starter puzzle lines are validated with chess.js, including their tactical outcomes. The legacy study library has not received a comprehensive chess-expert content audit; selected incorrect generalizations were corrected in this change.

## Browser checks

The prepared cloud environment already includes Node, Playwright, and Chromium. With the server running:

```sh
node tests/learning.browser.cjs
```

The check exercises puzzle outcomes, hints, alternative mates, both colors, progress persistence, review scheduling, uninterrupted play, live quiz isolation, engine-graded personal positions, skipped/failed quizzes, new games as Black, and mobile layouts. It uses the platform proxy and Playwright's verified HTTPS client for CDN assets, retaining TLS verification. Screenshots are written to `/tmp/chess-*.png`.

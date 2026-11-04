// Procedural puzzles: legal randomized games, engine selection, multi-move solving.
(function () {
    'use strict';
    const LEVELS = {
        standard: { moves: 2, depth: 11, time: 350, maxScore: 1600, gap: 130 },
        challenging: { moves: 3, depth: 13, time: 550, maxScore: 500, gap: 100 },
        expert: { moves: 4, depth: 15, time: 800, maxScore: 400, gap: 80 }
    };
    const OPENINGS = [
        'e4 e5 Nf3 Nc6 Bc4 Bc5', 'e4 c5 Nf3 d6 d4 cxd4',
        'd4 d5 c4 e6 Nc3 Nf6', 'e4 e6 d4 d5 Nc3 Nf6',
        'd4 Nf6 c4 g6 Nc3 Bg7', 'e4 c6 d4 d5 Nc3 dxe4',
        'Nf3 d5 g3 Nf6 Bg2 e6', 'c4 e5 Nc3 Nf6 g3 d5',
        'e4 e5 Nf3 Nc6 Bb5 a6', 'd4 d5 Nf3 Nf6 Bf4 c5'
    ];
    const play = (game, move) => game.move({ from:move.slice(0,2), to:move.slice(2,4), promotion:move[4] });
    const key = fen => fen.split(' ').slice(0,4).join(' ');
    const value = line => line.mate != null ? Math.sign(line.mate) * (100000 - Math.abs(line.mate) * 100) : line.score;

    class PuzzleGenerator {
        constructor(engine, recent = []) { this.engine = engine; this.recent = new Set(recent); }
        randomMove(game) {
            const moves = game.moves({ verbose:true });
            // Varied human-like inaccuracies rather than random board arrangements.
            const weighted = moves.flatMap(m => Array(m.captured ? 4 : m.piece === 'k' ? 1 : 3).fill(m));
            return weighted[Math.floor(Math.random() * weighted.length)];
        }
        async generate(difficulty, cancelled, progress) {
            const level = LEVELS[difficulty];
            const deadline = Date.now() + 90000;
            let game = new Chess(), checked = 0;
            for (let attempt = 0; attempt < 180 && Date.now() < deadline; attempt++) {
                if (cancelled()) return null;
                if (attempt % 18 === 0 || game.game_over() || game.history().length > 75) {
                    game = new Chess();
                    const opening = OPENINGS[Math.floor(Math.random() * OPENINGS.length)];
                    opening.split(' ').forEach(m => game.move(m));
                    for (let i = 0, n = 5 + Math.floor(Math.random() * 16); i < n && !game.game_over(); i++) game.move(this.randomMove(game));
                } else {
                    for (let i = 0; i < 2 + attempt % 3 && !game.game_over(); i++) game.move(this.randomMove(game));
                }
                if (game.game_over() || game.moves().length < 3 || this.recent.has(key(game.fen()))) continue;
                progress(++checked);
                const lines = await this.engine.evaluateMultiPV(game.fen(), 2, 10, 180);
                if (cancelled()) return null;
                if (!this.suitable(lines, level)) continue;
                const verified = await this.engine.evaluateMultiPV(game.fen(), 2, level.depth, level.time);
                if (cancelled()) return null;
                if (!this.suitable(verified, level)) continue;
                const replay = new Chess(game.fen());
                const solution = [];
                let choices = verified;
                let meaningful = 0;
                for (let turn = 0; turn < level.moves; turn++) {
                    if (turn > 0) choices = await this.engine.evaluateMultiPV(replay.fen(), 2, level.depth, level.time);
                    if (cancelled()) return null;
                    if (!choices[0]?.pv?.length || value(choices[0]) < 80) break;
                    // Require more than an easy first move followed by arbitrary shuffling.
                    if (choices.length > 1 && value(choices[0]) - value(choices[1]) >= 60) meaningful++;
                    const move = choices[0].pv[0];
                    if (!play(replay, move)) break;
                    solution.push(move);
                    if (turn === level.moves-1 || replay.game_over()) break;
                    const response = await this.engine.evaluate(replay.fen(), level.depth, level.time);
                    if (cancelled()) return null;
                    if (!response.bestMove || !play(replay,response.bestMove)) break;
                    solution.push(response.bestMove);
                }
                // Do not label a one-move win as a multi-move challenge.
                if (solution.length < level.moves * 2 - 1) continue;
                if (meaningful < (difficulty === 'standard' ? 1 : difficulty === 'challenging' ? 2 : 3)) continue;
                const material = new Chess(game.fen());
                let tactical = false;
                for (const move of solution) {
                    const m = play(material, move);
                    if (m.captured || /[+#]/.test(m.san) || m.promotion) tactical = true;
                }
                if (!tactical) continue;
                const puzzle = { fen:game.fen(), solution, difficulty, score:verified[0].score, mate:verified[0].mate };
                this.recent.add(key(puzzle.fen));
                return puzzle;
            }
            throw new Error('No suitable puzzle found in this search. Try New puzzle for another batch, or choose Standard.');
        }
        suitable(lines, level) {
            if (lines.length < 2 || !lines[0].pv?.length || !lines[1].pv?.length) return false;
            const best = lines[0], second = lines[1];
            if (best.mate != null) return best.mate >= level.moves && best.mate <= level.moves + 3 && second.mate == null && value(second) < 500;
            return best.score >= 100 && best.score <= level.maxScore && value(best) - value(second) >= level.gap;
        }
    }

    window.PuzzleGenerator = PuzzleGenerator;
    window.PuzzleLevels = LEVELS;
})();

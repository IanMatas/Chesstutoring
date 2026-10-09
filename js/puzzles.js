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
    const PIECES = { wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙', bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟' };
    const NAMES = { k:'king', q:'queen', r:'rook', b:'bishop', n:'knight', p:'pawn' };
    const uci = move => move.from + move.to + (move.promotion || '');
    const play = (game, move) => game.move({ from:move.slice(0,2), to:move.slice(2,4), promotion:move[4] });
    const key = fen => fen.split(' ').slice(0,4).join(' ');
    const value = line => line.mate != null ? Math.sign(line.mate) * (100000 - Math.abs(line.mate) * 100) : line.score;
    const read = (name, fallback) => { try { return JSON.parse(localStorage.getItem(name)) || fallback; } catch (_) { return fallback; } };
    const write = (name, data) => { try { localStorage.setItem(name, JSON.stringify(data)); } catch (_) { /* Private browsing can disable storage. */ } };

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

    class PuzzleController {
        constructor() {
            this.engine = new StockfishEngine('puzzles');
            const recent = read('chess-tutor-puzzle-recent', []);
            this.generator = new PuzzleGenerator(this.engine, Array.isArray(recent) ? recent : []);
            const stats = read('chess-tutor-puzzle-stats', {});
            this.stats = { solved:Math.max(0, Number(stats.solved)||0), assisted:Math.max(0, Number(stats.assisted)||0) };
            this.busy = false;
            this.cancelled = false;
            this.selected = null;
            this.puzzle = null;
            document.getElementById('puzzleNext').addEventListener('click', () => this.next());
            document.getElementById('puzzleCancel').addEventListener('click', () => { this.cancelled = true; this.status('Cancelling search…'); });
            document.getElementById('puzzleHint').addEventListener('click', () => this.hint());
            document.getElementById('puzzleReveal').addEventListener('click', () => this.reveal());
            document.getElementById('puzzleRestart').addEventListener('click', () => this.restart());
            document.getElementById('puzzleBoard').addEventListener('click', event => {
                const square = event.target.closest('[data-square]');
                if (square) this.click(square.dataset.square);
            });
            this.updateStats();
        }
        status(text) { document.getElementById('puzzleStatus').textContent = text; }
        open() { if (!this.puzzle && !this.busy) this.next(); }
        pause() { if (this.generating) this.cancelled = true; }
        controls() {
            for (const id of ['puzzleNext','puzzleDifficulty','puzzleHint','puzzleReveal','puzzleRestart']) {
                document.getElementById(id).disabled = this.busy || (!this.puzzle && !['puzzleNext','puzzleDifficulty'].includes(id));
            }
            document.getElementById('puzzleCancel').hidden = !this.generating;
            document.getElementById('puzzleBoard').setAttribute('aria-busy', String(this.busy));
        }
        async next() {
            if (this.busy) return;
            this.busy = this.generating = true;
            this.cancelled = false;
            this.controls();
            this.status('Generating a fresh position and checking its tactics…');
            try {
                if (!this.engine.ready) {
                    // Workers are independent of the live-game engines.
                    await Promise.race([this.engine.init(), new Promise((_, reject) => { this.initTimer = setTimeout(() => reject(new Error('The puzzle engine could not start. Check your connection and try again.')), 20000); })]);
                    clearTimeout(this.initTimer);
                }
                const difficulty = document.getElementById('puzzleDifficulty').value;
                const puzzle = await this.generator.generate(difficulty, () => this.cancelled, n => this.status(`Checking fresh position ${n}… You can cancel this search.`));
                if (!puzzle) { this.status('Search cancelled. Choose New puzzle when ready.'); return; }
                this.puzzle = puzzle;
                this.recorded = false;
                this.assisted = false;
                this.generator.recent = new Set([...this.generator.recent].slice(-2000));
                write('chess-tutor-puzzle-recent', [...this.generator.recent]);
                this.resetPosition();
            } catch (error) {
                clearTimeout(this.initTimer);
                if (!this.engine.ready) { this.engine.destroy(); this.engine = new StockfishEngine('puzzles'); this.generator.engine = this.engine; }
                this.status(error.message);
            } finally { this.busy = this.generating = false; this.controls(); }
        }
        resetPosition() {
            this.game = new Chess(this.puzzle.fen);
            this.color = this.game.turn();
            this.line = this.puzzle.solution.slice();
            this.step = 0;
            this.done = false;
            this.selected = null;
            document.getElementById('puzzleSolution').replaceChildren();
            this.status('Find the strongest move, then calculate the continuation.');
            this.render();
        }
        restart() {
            if (!this.puzzle || this.busy) return;
            // Retrying an exposed solution must not count as a fresh unassisted solve.
            this.assisted = true;
            this.resetPosition();
        }
        render() {
            const board = document.getElementById('puzzleBoard');
            board.replaceChildren();
            const targets = this.selected ? this.game.moves({ square:this.selected, verbose:true }).map(m => m.to) : [];
            for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
                const file = this.color === 'b' ? 7-col : col;
                const rank = this.color === 'b' ? row+1 : 8-row;
                const square = String.fromCharCode(97+file) + rank;
                const piece = this.game.get(square);
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.square = square;
                button.className = `puzzle-square ${(file+rank)%2 ? 'light' : 'dark'}${this.selected === square ? ' selected' : ''}${targets.includes(square) ? ' legal-target' : ''}`;
                button.textContent = piece ? PIECES[piece.color+piece.type] : '';
                button.setAttribute('aria-label', `${square}${piece ? ' '+(piece.color === 'w' ? 'White' : 'Black')+' '+NAMES[piece.type] : ' empty'}`);
                const label = document.createElement('small'); label.textContent = square; button.append(label);
                board.append(button);
            }
            document.getElementById('puzzleTurn').textContent = `${this.color === 'w' ? 'White' : 'Black'} to play · ${this.puzzle.difficulty}`;
            document.getElementById('puzzleProgress').textContent = `Your moves: ${Math.ceil(this.step/2)} / ${LEVELS[this.puzzle.difficulty].moves}`;
            document.getElementById('puzzleMoves').textContent = this.game.history().join('  ');
        }
        async click(square) {
            if (!this.puzzle || this.busy || this.done) return;
            const piece = this.game.get(square);
            if (piece?.color === this.color) { this.selected = square; this.render(); return; }
            if (!this.selected) return;
            const from = this.selected;
            const promotion = document.getElementById('puzzlePromotion').value;
            const candidate = this.game.moves({ square:from, verbose:true }).find(m => m.to === square && (!m.promotion || m.promotion === promotion));
            if (!candidate) { this.status('That move is not legal. Select a highlighted square.'); return; }
            await this.submit(uci(candidate));
        }
        async submit(move) {
            if (!this.puzzle || this.busy || this.done) return;
            const trial = new Chess(this.game.fen());
            if (!play(trial, move)) return;
            this.busy = true;
            this.controls();
            try {
                if (move !== this.line[this.step]) {
                    this.status('Checking your alternative…');
                    const level = LEVELS[this.puzzle.difficulty];
                    const best = await this.engine.evaluate(this.game.fen(), level.depth, level.time);
                    // Restrict the root search so both evaluations share a side-to-move
                    // perspective and search depth. Always accept the newly found best move.
                    const candidate = move === best.bestMove ? best : await this.engine.evaluate(this.game.fen(), level.depth, level.time, [move]);
                    const acceptable = move === best.bestMove || (best.mate != null
                        ? best.mate > 0 && (trial.in_checkmate() || (candidate.mate != null && candidate.mate > 0 && candidate.mate <= best.mate))
                        : (candidate.mate != null ? candidate.mate > 0 : (candidate.score || 0) >= (best.score || 0) - 35));
                    if (!acceptable) {
                        this.assisted = true;
                        this.selected = null;
                        this.status('That loses part of the advantage. Look for a stronger continuation and try again.');
                        this.render();
                        return;
                    }
                    // Accept sound alternatives and continue from their actual best defense.
                    const after = await this.engine.evaluate(trial.fen(), level.depth, level.time);
                    const needed = LEVELS[this.puzzle.difficulty].moves*2-1-this.step;
                    const continuation = [move, ...(after.pv || [])];
                    if (continuation.length < needed && !trial.game_over()) {
                        const extended = new Chess(trial.fen());
                        for (const m of after.pv || []) { if (!play(extended,m)) break; }
                        while (continuation.length < needed && !extended.game_over()) {
                            const more = await this.engine.evaluate(extended.fen(), level.depth, level.time);
                            if (!more.bestMove || !play(extended,more.bestMove)) throw new Error('Could not verify this continuation. Please try again.');
                            continuation.push(more.bestMove);
                        }
                    }
                    this.line = [...this.line.slice(0,this.step), ...continuation.slice(0,needed)];
                }
                play(this.game, move);
                this.step++;
                this.selected = null;
                if (!this.game.game_over() && this.step < this.line.length) {
                    const reply = play(this.game, this.line[this.step]);
                    if (!reply) throw new Error('Could not play the verified reply. Retry this puzzle.');
                    this.step++;
                    this.status(`Correct. The reply is ${reply.san}. Find your next move.`);
                }
                if (this.game.game_over() || this.step >= this.line.length) this.complete();
                this.render();
            } catch (error) { this.status(error.message); }
            finally { this.busy = false; this.controls(); }
        }
        complete() {
            this.done = true;
            if (!this.recorded) {
                const category = this.assisted ? 'assisted' : 'solved';
                this.stats[category] = (Number(this.stats[category]) || 0)+1;
                this.recorded = true;
                write('chess-tutor-puzzle-stats',this.stats);
            }
            this.status(this.assisted ? 'Completed with assistance. Try a fresh puzzle next.' : 'Solved! You found the full continuation. Generate another whenever you’re ready.');
            this.updateStats();
            this.renderSolution();
        }
        hint() {
            if (!this.puzzle || this.busy || this.done) return;
            this.assisted = true;
            this.selected = this.line[this.step].slice(0,2);
            this.status(`Look for a move with the piece on ${this.selected}. Calculate checks, captures and threats.`);
            this.render();
        }
        reveal() {
            if (!this.puzzle || this.busy) return;
            this.assisted = true;
            this.done = true;
            this.renderSolution();
            this.status('Solution revealed. Retry to practice this line, or generate a fresh puzzle.');
        }
        renderSolution() {
            const game = new Chess(this.puzzle.fen);
            const positions = [game.fen()], labels = ['Start'];
            const explanations = ['Starting position. Calculate both sides before moving.'];
            for (const move of this.line) {
                const played = play(game,move);
                if (!played) break;
                positions.push(game.fen()); labels.push(played.san);
                const action = played.captured ? `captures the ${NAMES[played.captured]} on ${played.to}` : `moves the ${NAMES[played.piece]} to ${played.to}`;
                explanations.push(`${played.color === 'w' ? 'White' : 'Black'} ${action}${played.promotion ? ', promoting to a '+NAMES[played.promotion] : ''}.${game.in_checkmate() ? ' Checkmate.' : game.in_check() ? ' This gives check, so the king must be defended.' : ' Compare the threats before the next reply.'}`);
            }
            const solution = document.getElementById('puzzleSolution');
            solution.innerHTML = '<h4>Solution — select a move to review the position</h4>';
            const explanation = document.createElement('p');
            labels.forEach((label,index) => {
                const button = document.createElement('button');
                button.className = 'btn btn-secondary'; button.textContent = index ? `${index}. ${label}` : label;
                button.addEventListener('click', () => { this.game = new Chess(positions[index]); this.selected = null; this.render(); explanation.textContent = explanations[index]; document.getElementById('puzzleMoves').textContent = labels.slice(1,index+1).join(' '); });
                solution.append(button);
            });
            solution.append(explanation);
        }
        updateStats() { document.getElementById('puzzleStats').textContent = `Solved without help: ${Number(this.stats.solved)||0} · Completed with help: ${Number(this.stats.assisted)||0}`; }
    }
    window.PuzzleGenerator = PuzzleGenerator;
    window.addEventListener('DOMContentLoaded', () => { window.puzzles = new PuzzleController(); });
})();

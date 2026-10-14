// app.js — Main Chess Tutor Application (with full move navigation)
// Integrates board renderer, Stockfish engine, coaching module, and move-by-move browsing.

(function () {
    'use strict';

    /* ── Piece images (Wikimedia Commons SVGs) ── */
    const IMG = {
        wk:'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
        wq:'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
        wr:'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
        wb:'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
        wn:'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
        wp:'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
        bk:'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
        bq:'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
        br:'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
        bb:'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
        bn:'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
        bp:'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg'
    };
    Object.values(IMG).forEach(u => { const i = new Image(); i.src = u; });

    /* ── Rating → Stockfish params ── */
    function ratingToParams(r) {
        const skill = Math.max(0, Math.min(20, Math.round((r - 400) * 20 / 2600)));
        let depth;
        if      (r <= 500)  depth = 1;
        else if (r <= 700)  depth = 2;
        else if (r <= 900)  depth = 3;
        else if (r <= 1100) depth = 5;
        else if (r <= 1300) depth = 7;
        else if (r <= 1500) depth = 9;
        else if (r <= 1700) depth = 11;
        else if (r <= 1900) depth = 13;
        else if (r <= 2100) depth = 15;
        else if (r <= 2400) depth = 17;
        else                depth = 20;
        return { skill, depth };
    }

    /* ══════════════════════════════════════════════════════════════
       ChessTutorApp
       ══════════════════════════════════════════════════════════════ */
    class ChessTutorApp {
        constructor() {
            this.game           = new Chess();
            this.analysisEngine = new StockfishEngine('analysis');
            this.botEngine      = new StockfishEngine('bot');
            this.coach          = new ChessCoach();

            this.playerColor = 'w';
            this.botRating   = 1500;
            this.flipped     = false;
            this.selected    = null;
            this.validMoves  = [];
            this.thinking    = false;
            this.over        = false;
            this.cachedEval  = null;
            this.dragState   = null;

            /* ── Move navigation state ── */
            this.posHistory  = [];   // FEN at each position   [0]=start, [1]=after move 0, …
            this.moveData    = [];   // info for each half-move [0]=first move, …
            this.viewIndex   = 0;    // which position we're viewing (index into posHistory)

            /* ── Lesson state: a paused mistake, or a retry in progress ── */
            this.pending     = null; // { md } — the bot waits while the player reads a lesson
            this.retry       = null; // { original, attempts, hints, last }
            this.annotations = null; // { fen, arrows, marks } drawn on the board
            this.panel       = new CoachPanel(this);
        }

        /* ══════════════════════════════════════════════════
           Initialisation
           ══════════════════════════════════════════════════ */
        async init() {
            this._showLoading(true);
            try {
                await Promise.all([this.analysisEngine.init(), this.botEngine.init()]);
                await this.analysisEngine.setOptions({ 'Skill Level': 20 });
                await this._syncBotSkill();
            } catch (err) {
                console.error(err);
                document.getElementById('loadingOverlay').innerHTML =
                    `<div class="loading-content"><div class="error-icon">⚠️</div>
                     <h3>Failed to load Stockfish</h3><p>Check your connection and refresh.</p>
                     <button onclick="location.reload()" class="btn btn-primary">Retry</button></div>`;
                return;
            }
            this._showLoading(false);

            this._resetHistory();
            this._buildBoard();
            this._bindEvents();
            this._render();
            await this._evalAndCache();

            if (this.playerColor === 'b') {
                this.thinking = true;
                this._status('Bot is thinking…');
                await this._botMove();
                this.thinking = false;
            }
            this._status('Your turn');
        }

        /* ── Reset position/move history ── */
        _resetHistory() {
            this.activeVariation = null;
            this.pending = null;
            this.retry = null;
            this.annotations = null;
            document.getElementById('variationPreviewBanner').style.display = 'none';
            this.posHistory = [this.game.fen()];
            this.moveData   = [];
            this.viewIndex  = 0;
        }

        /* ══════════════════════════════════════════════════
           Board construction
           ══════════════════════════════════════════════════ */
        _buildBoard() {
            const el = document.getElementById('chessboard');
            el.innerHTML = '';

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('board-arrows');
            svg.setAttribute('viewBox', '0 0 800 800');
            el.appendChild(svg);
            this._arrowSvg = svg;

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const ar = this.flipped ? 7 - r : r;
                    const ac = this.flipped ? 7 - c : c;
                    const file = String.fromCharCode(97 + ac);
                    const rank = 8 - ar;
                    const sq = document.createElement('div');
                    sq.classList.add('square', (ar + ac) % 2 === 0 ? 'light' : 'dark');
                    sq.dataset.square = file + rank;
                    if (c === 0) { const l = document.createElement('span'); l.className = 'rank-label'; l.textContent = rank; sq.appendChild(l); }
                    if (r === 7) { const l = document.createElement('span'); l.className = 'file-label'; l.textContent = file; sq.appendChild(l); }
                    el.appendChild(sq);
                }
            }
        }

        /* ══════════════════════════════════════════════════
           Render pieces & highlights (uses posHistory[viewIndex])
           ══════════════════════════════════════════════════ */
        _render() {
            const fen = this.posHistory[this.viewIndex];
            const displayGame = new Chess(fen);
            const bd = document.getElementById('chessboard');

            bd.querySelectorAll('.piece-img, .move-dot').forEach(e => e.remove());
            bd.querySelectorAll('.square').forEach(s => s.classList.remove('selected', 'last-move', 'check', 'valid-move'));

            // — Pieces —
            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                const file = String.fromCharCode(97 + c), rank = 8 - r, sq = file + rank;
                const p = displayGame.get(sq);
                if (!p) continue;
                const el = bd.querySelector(`[data-square="${sq}"]`);
                if (!el) continue;
                const img = document.createElement('img');
                img.src = IMG[p.color + p.type]; img.className = 'piece-img'; img.draggable = false;
                el.appendChild(img);
            }

            // — Last-move highlight —
            if (this.viewIndex > 0) {
                const md = this.moveData[this.viewIndex - 1];
                if (md) {
                    const f = bd.querySelector(`[data-square="${md.from}"]`);
                    const t = bd.querySelector(`[data-square="${md.to}"]`);
                    if (f) f.classList.add('last-move');
                    if (t) t.classList.add('last-move');
                }
            }

            // — Check highlight —
            if (displayGame.in_check()) {
                const turn = displayGame.turn();
                for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                    const file = String.fromCharCode(97 + c), rank = 8 - r;
                    const p = displayGame.get(file + rank);
                    if (p && p.type === 'k' && p.color === turn) {
                        const el = bd.querySelector(`[data-square="${file}${rank}"]`);
                        if (el) el.classList.add('check');
                    }
                }
            }

            // — Valid-move dots (only when at latest position) —
            const atEnd = this._atEnd();
            if (atEnd && this.selected) {
                const sel = bd.querySelector(`[data-square="${this.selected}"]`);
                if (sel) sel.classList.add('selected');
                this.validMoves.forEach(m => {
                    const el = bd.querySelector(`[data-square="${m.to}"]`);
                    if (!el) return;
                    el.classList.add('valid-move');
                    const dot = document.createElement('div');
                    dot.className = 'move-dot' + (m.captured ? ' capture' : '');
                    el.appendChild(dot);
                });
            }

            this._paintAnnotations();
            this._updateCaptured();
            this._updateNavUI();
        }

        /* ══════════════════════════════════════════════════
           Event binding
           ══════════════════════════════════════════════════ */
        _bindEvents() {
            const bd = document.getElementById('chessboard');

            /* Board click */
            bd.addEventListener('click', e => {
                if (this.thinking || this.over) return;
                if (!this._atEnd()) return;                    // must be at latest position
                if (this.game.turn() !== this.playerColor) return;
                const sq = e.target.closest('.square');
                if (sq) this._onSquareClick(sq.dataset.square);
            });

            /* Drag: mouse */
            bd.addEventListener('mousedown', e => {
                if (this.thinking || this.over || !this._atEnd()) return;
                if (this.game.turn() !== this.playerColor) return;
                const sq = e.target.closest('.square'); if (!sq) return;
                const name = sq.dataset.square, p = this.game.get(name);
                if (p && p.color === this.playerColor) this._startDrag(name, e);
            });
            document.addEventListener('mousemove', e => { if (this.dragState) this._moveDrag(e); });
            document.addEventListener('mouseup',   e => { if (this.dragState) this._endDrag(e); });

            /* Drag: touch */
            bd.addEventListener('touchstart', e => {
                if (this.thinking || this.over || !this._atEnd()) return;
                if (this.game.turn() !== this.playerColor) return;
                const t = e.touches[0];
                const sq = document.elementFromPoint(t.clientX, t.clientY)?.closest('.square');
                if (!sq) return;
                const name = sq.dataset.square, p = this.game.get(name);
                if (p && p.color === this.playerColor) { e.preventDefault(); this._startDrag(name, { clientX: t.clientX, clientY: t.clientY }); }
            }, { passive: false });
            document.addEventListener('touchmove', e => {
                if (this.dragState) { e.preventDefault(); this._moveDrag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }
            }, { passive: false });
            document.addEventListener('touchend', e => {
                if (this.dragState) { const t = e.changedTouches[0]; this._endDrag({ clientX: t.clientX, clientY: t.clientY }); }
            });
            document.addEventListener('touchcancel', () => { if (this.dragState) this._cancelDrag(); });
            window.addEventListener('blur', () => { if (this.dragState) this._cancelDrag(); });
            window.addEventListener('scroll', () => { if (this.dragState) this._cancelDrag(); }, { passive: true });

            /* Action buttons */
            document.getElementById('newGameBtn').addEventListener('click', () => this._showModal());
            document.getElementById('undoBtn').addEventListener('click',    () => this._undo());
            document.getElementById('hintBtn').addEventListener('click',    () => this._hint());
            document.getElementById('flipBtn').addEventListener('click',    () => this._flip());

            /* Navigation buttons */
            document.getElementById('firstMoveBtn').addEventListener('click', () => { ChessSounds.navigate(); this._goFirst(); });
            document.getElementById('prevMoveBtn').addEventListener('click',  () => { ChessSounds.navigate(); this._goPrev(); });
            document.getElementById('nextMoveBtn').addEventListener('click',  () => { ChessSounds.navigate(); this._goNext(); });
            document.getElementById('lastMoveBtn').addEventListener('click',  () => { ChessSounds.navigate(); this._goLast(); });

            /* Keyboard navigation */
            document.addEventListener('keydown', e => {
                if (window.learning?.session || !['play','coach'].includes(window.trainer?.currentMode || 'play')) return;
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                switch (e.key) {
                    case 'ArrowLeft':  e.preventDefault(); this._goPrev();  break;
                    case 'ArrowRight': e.preventDefault(); this._goNext();  break;
                    case 'Home':       e.preventDefault(); this._goFirst(); break;
                    case 'End':        e.preventDefault(); this._goLast();  break;
                }
            });

            /* "Play from here" & "Resume" buttons */
            document.getElementById('playFromHereBtn').addEventListener('click', () => this._playFromHere());
            document.getElementById('resumeBtn').addEventListener('click',       () => this._goLast());

            /* Clickable move history (event delegation) */
            document.getElementById('moveList').addEventListener('click', e => {
                const entry = e.target.closest('.move-entry[data-idx]');
                if (entry) this._goToPosition(+entry.dataset.idx + 1);   // position AFTER move i
            });

            /* Rating slider */
            const slider = document.getElementById('ratingSlider');
            slider.addEventListener('input', e => {
                this.botRating = +e.target.value;
                document.getElementById('ratingDisplay').textContent = this.botRating;
                document.getElementById('botRating').textContent     = `Rating: ${this.botRating}`;
                this._syncBotSkill();
            });

            /* New-game modal */
            document.getElementById('startGameBtn').addEventListener('click',  () => this._startNew());
            document.getElementById('cancelModalBtn').addEventListener('click', () => this._hideModal());
            document.querySelectorAll('.color-btn').forEach(b => b.addEventListener('click', () => {
                document.querySelectorAll('.color-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
            }));
            document.getElementById('modalRatingSlider').addEventListener('input', e => {
                document.getElementById('modalRating').textContent = e.target.value;
            });

            /* Variation preview stepper */
            this._bindVariationPreviewControls();
        }

        /* ══════════════════════════════════════════════════
           Move Navigation
           ══════════════════════════════════════════════════ */
        _atEnd() { return this.viewIndex === this.posHistory.length - 1; }

        _goToPosition(idx) {
            if (this.thinking || window.learning?.session) return;
            idx = Math.max(0, Math.min(idx, this.posHistory.length - 1));
            if (idx === this.viewIndex) return;
            this.viewIndex = idx;
            this._deselect(true);             // deselect without re-render
            this._render();
            this._showCoachingForView();      // show coaching for the viewed move

            // Hide checkmate overlay if viewing an earlier move, or restore if at final checkmate position
            const overlay = document.getElementById('checkmateOverlay');
            if (overlay) {
                overlay.style.display = (this.viewIndex === this.posHistory.length - 1 && this.over && this.game.in_checkmate()) ? 'flex' : 'none';
            }
        }

        _goFirst() { this._goToPosition(0); }
        _goPrev()  { this._goToPosition(this.viewIndex - 1); }
        _goNext()  { this._goToPosition(this.viewIndex + 1); }
        _goLast()  { this._goToPosition(this.posHistory.length - 1); }

        /** Show the coach panel for the viewed position */
        _showCoachingForView() { this.panel.refresh(); }

        /** Truncate game to the current viewIndex and resume play from there */
        async _playFromHere() {
            if (this._atEnd() || this.thinking) return;
            this.pending = null;
            this.retry = null;
            this.annotations = null;
            const fen = this.posHistory[this.viewIndex];

            // Truncate
            this.posHistory = this.posHistory.slice(0, this.viewIndex + 1);
            this.moveData   = this.moveData.slice(0, this.viewIndex);

            // Rebuild chess.js game from the truncated FEN
            this.game = new Chess(fen);
            this.over = false;
            this.cachedEval = null;

            this._clearCheckmateVisuals();
            this._clearArrows();
            this._rebuildHistory();
            this._render();
            this._updateCaptured();
            this._updateNavUI();

            // Re-cache eval
            this._status('Preparing analysis…');
            await this._evalAndCache();

            // If it's the bot's turn, bot moves
            if (this.game.turn() !== this.playerColor) {
                this.thinking = true;
                this._status('Bot is thinking…');
                await this._botMove();
                this.thinking = false;
            }
            this._status('Your turn');
            document.getElementById('playerStatus').textContent = 'Your turn';
            this.panel.refresh();
        }

        /** Update navigation buttons & banner visibility */
        _updateNavUI() {
            const atStart = this.viewIndex === 0;
            const atEnd   = this._atEnd();
            const total   = this.posHistory.length - 1;

            document.getElementById('firstMoveBtn').disabled = atStart;
            document.getElementById('prevMoveBtn').disabled  = atStart;
            document.getElementById('nextMoveBtn').disabled  = atEnd;
            document.getElementById('lastMoveBtn').disabled  = atEnd;

            // "Viewing history" banner
            const banner = document.getElementById('viewingBanner');
            if (!atEnd && total > 0) {
                banner.classList.add('visible');
                const moveNum = this.viewIndex === 0 ? 'start' : `move ${this.viewIndex}`;
                document.getElementById('viewingLabel').textContent = `Viewing ${moveNum} of ${total}`;
            } else {
                banner.classList.remove('visible');
            }

            // Move counter
            document.getElementById('moveCounter').textContent = total > 0 ? `${total} moves` : '';

            // Highlight active move in history
            document.querySelectorAll('#moveList .move-entry').forEach(el => {
                el.classList.toggle('active-move', +el.dataset.idx === this.viewIndex - 1);
            });
        }

        /* ══════════════════════════════════════════════════
           Square click logic
           ══════════════════════════════════════════════════ */
        _onSquareClick(name) {
            if (this.activeVariation) return;
            if (this.selected) {
                const vm = this.validMoves.find(m => m.to === name);
                if (vm) { this._playerMove(vm); return; }
                const p = this.game.get(name);
                if (p && p.color === this.playerColor) { this._select(name); return; }
                this._deselect(); return;
            }
            const p = this.game.get(name);
            if (p && p.color === this.playerColor) this._select(name);
        }

        _select(name) {
            this.selected = name;
            ChessSounds.select();
            const all = this.game.moves({ square: name, verbose: true });
            const seen = new Set();
            this.validMoves = all.filter(m => {
                const key = m.from + m.to;
                if (m.promotion && m.promotion !== 'q') return false;
                if (seen.has(key)) return false; seen.add(key); return true;
            });
            this._render();
        }
        _deselect(skipRender) {
            this.selected = null; this.validMoves = [];
            if (!skipRender) this._render();
        }

        /* ══════════════════════════════════════════════════
           Drag & Drop
           ══════════════════════════════════════════════════ */
        _cancelDrag() {
            if (this.dragState && this.dragState.el) {
                this.dragState.el.remove();
            }
            document.querySelectorAll('.drag-piece').forEach(el => el.remove());
            this.dragState = null;
        }

        _startDrag(name, e) {
            if (this.activeVariation) return;
            this._cancelDrag();
            this._select(name);
            const p = this.game.get(name);
            if (!p) return;
            const ghost = document.createElement('img');
            ghost.src = IMG[p.color + p.type];
            ghost.className = 'drag-piece';
            ghost.draggable = false;
            document.body.appendChild(ghost);
            this.dragState = { from: name, el: ghost };
            this._moveDrag(e);
        }
        _moveDrag(e) {
            if (!this.dragState || !this.dragState.el) return;
            const g = this.dragState.el;
            g.style.left = (e.clientX - 35) + 'px'; g.style.top = (e.clientY - 35) + 'px';
        }
        _endDrag(e) {
            const state = this.dragState;
            this._cancelDrag();
            if (!state || !e || e.clientX == null || e.clientY == null) return;
            const below = document.elementFromPoint(e.clientX, e.clientY);
            const sq = below ? below.closest('.square') : null;
            if (sq) {
                const vm = this.validMoves.find(m => m.to === sq.dataset.square);
                if (vm) { this._playerMove(vm); return; }
            }
        }

        /* ══════════════════════════════════════════════════
           Player move execution & analysis
           ══════════════════════════════════════════════════ */
        async _playerMove(moveObj) {
            if (this.thinking || this.over || this.pending || window.learning?.session) return;
            this.thinking = true;
            // Promotion?
            if (moveObj.flags && moveObj.flags.includes('p')) {
                const promo = await this._promotionDialog();
                if (!promo) { this.thinking = false; this._deselect(); return; }
                moveObj = { from: moveObj.from, to: moveObj.to, promotion: promo };
            }
            const T = window.ChessTeach;
            const fenBefore = this.game.fen();
            this.panel.thinking('Checking your move…');
            let before = await this._bestFor(fenBefore);

            const move = this.game.move({ from: moveObj.from, to: moveObj.to, promotion: moveObj.promotion });
            if (!move) { this.thinking = false; this._deselect(); return; }
            this.posHistory.push(this.game.fen());
            this.viewIndex = this.posHistory.length - 1;
            this.annotations = null;
            this._deselect(true);
            this._clearArrows();
            this._render();
            ChessSounds.playMoveSound(move);
            this._status('Checking your move…');

            // One search after the move gives its score and the opponent's best reply line.
            const ended = this.game.game_over(), fenAfter = this.game.fen();
            const fromStart = this.posHistory[0] === new Chess().fen();
            const history = fromStart ? this.moveData.map(m => m.san) : null;
            const judge = (b, a) => T.lessonFor({
                fenBefore, move, best: { uci: b.bestMove, pv: b.pv, cp: T.scoreOf(b) },
                playedCp: a ? -T.scoreOf(a) : this.game.in_checkmate() ? T.MATE : 0,
                replyPv: a?.pv || [], me: this.playerColor, opponent: 'the bot', level: T.profile.level, history
            });
            let after = ended ? null : await this.analysisEngine.evaluate(fenAfter, 12, 700);
            let lesson = judge(before, after);
            // Quick searches can be noisy: confirm with a deeper look before stopping the game.
            if (!ended && T.LEVELS[T.profile.level].pause.has(lesson.verdict)) {
                this._status('Double-checking that move…');
                this.panel.thinking('Double-checking that move…');
                const deepBefore = await this.analysisEngine.evaluate(fenBefore, 14, 1800);
                const deepAfter = await this.analysisEngine.evaluate(fenAfter, 14, 1800);
                if ((deepBefore.depth || 0) >= (before.depth || 0)) {
                    deepBefore.fen = fenBefore;
                    before = deepBefore;
                    this.cachedEval = deepBefore; // retries are judged against the same, deeper baseline
                }
                if ((deepAfter.depth || 0) >= (after.depth || 0)) after = deepAfter;
                lesson = judge(before, after);
            }
            const bestCp = T.scoreOf(before);
            const playedCp = after ? -T.scoreOf(after) : this.game.in_checkmate() ? T.MATE : 0;
            const md = {
                san: move.san, color: move.color, from: move.from, to: move.to,
                captured: move.captured || null, promotion: move.promotion || null,
                isPlayer: true, classification: lesson.verdict, lesson, phase: T.phaseOf(fenBefore),
                coaching: { classification: lesson.verdict, title: lesson.headline, message: lesson.why },
                fenBefore, fenAfter: this.game.fen(),
                bestMove: before.bestMove || '', bestLine: before.pv || [], replyLine: after?.pv || [],
                bestMate: before.mate ?? null, playedMate: after?.mate == null ? null : -after.mate,
                evalBefore: bestCp, evalAfter: playedCp, cpLoss: Math.max(0, bestCp - playedCp)
            };
            if (this.retry) return this._finishRetryAttempt(md);

            this.moveData.push(md);
            window.learning?.capture(md);
            if (['mistake', 'blunder'].includes(lesson.verdict) && lesson.concept) T.profile.record(lesson.concept.id, 'coach');
            this._rebuildHistory();
            this._updateEvalBarFromMover(playedCp, move.color);
            if (ended) { this.panel.lesson(md, 'final'); this._gameOver(); this.thinking = false; return; }
            ChessSounds.playClassificationSound(lesson.verdict);

            // A real problem pauses the game: the player can retry before the bot replies.
            if (T.profile.shouldPause(lesson.verdict)) {
                this.pending = { md };
                this.thinking = false;
                this.panel.lesson(md, 'paused');
                this._status('Paused — the bot waits while you look at this');
                return;
            }
            this.panel.lesson(md, 'final');
            await this._continueAfterPlayer();
        }

        async _finishRetryAttempt(md) {
            const r = this.retry, T = window.ChessTeach;
            const solved = !T.LEVELS[T.profile.level].pause.has(md.lesson.verdict) && !this.game.in_stalemate();
            if (solved) {
                this.retry = null;
                md.retried = { san: r.original.san, verdict: r.original.classification, concept: r.original.lesson.concept?.id || null };
                this.moveData.push(md);
                this._rebuildHistory();
                this._updateEvalBarFromMover(md.evalAfter, md.color);
                this.panel.lesson(md, 'success', { original: r.original });
                ChessSounds.correct();
                if (this.game.game_over()) { this._gameOver(); this.thinking = false; return; }
                this._status('Well found!');
                await new Promise(resolve => setTimeout(resolve, 900));
                await this._continueAfterPlayer();
                return;
            }
            // Not good enough yet: take the attempt back and keep the player on the problem.
            r.attempts++;
            r.last = md.lesson;
            this.game.undo();
            this.posHistory.pop();
            this.viewIndex = this.posHistory.length - 1;
            this._render();
            this.thinking = false;
            ChessSounds.wrong();
            this.panel.retry(r);
            this._status('Not quite — try again');
        }

        async _continueAfterPlayer() {
            if (this.over) return;
            if (this.activeVariation) this._exitVariationPreview();
            const fromPause = !!this.pending;
            this.pending = null;
            this.thinking = true;
            if (fromPause) this.panel.lesson(this.moveData[this.moveData.length - 1], 'final');
            this._status('Bot is thinking…');
            try { await this._botMove(); }
            finally { this.thinking = false; }
            window.learning?.onTurn();
        }

        _startRetry() {
            const p = this.pending;
            if (!p || this.thinking) return;
            if (this.activeVariation) this._exitVariationPreview();
            this.pending = null;
            this.moveData.pop();
            this.posHistory.pop();
            this.game.undo();
            this.viewIndex = this.posHistory.length - 1;
            this.retry = { original: p.md, attempts: 0, hints: 0, last: null };
            this._deselect(true);
            this._clearArrows();
            this._rebuildHistory();
            this._render();
            this.panel.retry(this.retry);
            this._status('Your turn — find a better move');
        }

        _retryHint() {
            const r = this.retry;
            if (!r || this.thinking) return;
            r.hints = Math.min(r.hints + 1, r.original.lesson.hints.length);
            ChessSounds.hint();
            this.panel.retry(r);
        }

        _retryAnswer() {
            const r = this.retry;
            if (!r || this.thinking) return;
            r.hints = r.original.lesson.hints.length;
            this.panel.retry(r);
        }

        async _keepOriginal() {
            if (this.pending) return this._continueAfterPlayer();
            const r = this.retry;
            if (!r || this.thinking) return;
            if (this.activeVariation) this._exitVariationPreview();
            this.retry = null;
            const md = r.original;
            const move = this.game.move({ from: md.from, to: md.to, promotion: md.promotion || undefined });
            if (!move) { this.panel.refresh(); return; }
            this.posHistory.push(this.game.fen());
            this.moveData.push(md);
            this.viewIndex = this.posHistory.length - 1;
            this._rebuildHistory();
            this._render();
            this.panel.lesson(md, 'final');
            await this._continueAfterPlayer();
        }

        /** Replay a stored lesson line on the board: what the move allows, or the better move */
        _showLessonLine(md, which) {
            if (!md?.lesson || this.thinking) return;
            window.moveLessons?.showStored(md, which);
        }

        /* Lesson annotations: arrows and highlighted squares that belong to one position */
        _setAnnotations(a) {
            this.annotations = a && a.fen && ((a.arrows && a.arrows.length) || Object.keys(a.marks || {}).length) ? a : null;
            this._paintAnnotations();
        }

        _paintAnnotations(clearOnly = false) {
            const bd = document.getElementById('chessboard');
            if (!bd || !this._arrowSvg) return;
            const kinds = ['tc-sq-danger', 'tc-sq-target', 'tc-sq-warn', 'tc-sq-hint'];
            bd.querySelectorAll('.' + kinds.join(', .')).forEach(s => s.classList.remove(...kinds));
            this._arrowSvg.querySelectorAll('[data-arrow-id^="tc-"]').forEach(el => el.remove());
            const a = this.annotations;
            if (clearOnly || !a || this.activeVariation || this.posHistory[this.viewIndex] !== a.fen) return;
            Object.entries(a.marks || {}).forEach(([sq, kind]) => bd.querySelector(`[data-square="${sq}"]`)?.classList.add('tc-sq-' + kind));
            const colors = { danger: '#ca3431', good: '#96bc4b', info: '#5c8bb0', warn: '#e6a827' };
            (a.arrows || []).forEach((ar, i) => this._drawArrow(ar.from, ar.to, colors[ar.color] || colors.info, { id: 'tc-' + i, opacity: 0.8, width: 12 }));
        }

        /* ══════════════════════════════════════════════════
           Bot move
           ══════════════════════════════════════════════════ */
        async _botMove() {
            const p = ratingToParams(this.botRating);
            await this.botEngine.setOptions({ 'Skill Level': p.skill });
            await new Promise(r => setTimeout(r, 400 + Math.random() * 800));

            const fenBeforeBot = this.game.fen();
            const res = await this.botEngine.evaluate(fenBeforeBot, Math.min(p.depth, 10), 450);
            if (!res.bestMove || res.bestMove === '(none)') return;

            const move = this.game.move({
                from: res.bestMove.substring(0,2),
                to:   res.bestMove.substring(2,4),
                promotion: res.bestMove.length > 4 ? res.bestMove[4] : undefined
            });
            if (!move) return;
            ChessSounds.playMoveSound(move);
            this.posHistory.push(this.game.fen());
            this.viewIndex = this.posHistory.length - 1;

            // What the bot's move does to the player's position, read from the board.
            let note = '';
            try { note = window.ChessTeach.opponentNote(fenBeforeBot, move, this.playerColor, 'the bot'); }
            catch (e) { console.warn('Bot move note failed:', e); }
            const md = {
                san: move.san, color: move.color, from: move.from, to: move.to,
                captured: move.captured || null, promotion: move.promotion || null,
                isPlayer: false, classification: null, coaching: null, note,
                fenBefore: fenBeforeBot, fenAfter: this.game.fen(),
                cpLoss: 0, evalBefore: 0, evalAfter: 0, bestMove: ''
            };
            this.moveData.push(md);
            this._rebuildHistory();
            this._render();

            if (this.game.game_over()) { this._gameOver(); return; }
            this.panel.turn(md);
            this._status('Preparing analysis…');
            await this._evalAndCache();
            this._status('Your turn');
            document.getElementById('playerStatus').textContent = 'Your turn';
        }

        /* ══════════════════════════════════════════════════
           Eval cache & bar
           ══════════════════════════════════════════════════ */
        async _evalAndCache() {
            const fen = this.game.fen();
            const ev = await this.analysisEngine.evaluate(fen, 12, 700);
            ev.fen = fen;
            this.cachedEval = ev;
            const turn = this.game.turn();
            const ws = turn === 'w' ? (ev.score||0) : -(ev.score||0);
            const wm = turn === 'w' ? ev.mate : (ev.mate != null ? -ev.mate : null);
            this._updateEvalBar(ws, wm);
        }

        /** Engine result for the side to move in `fen`, reusing the cached search when it matches */
        async _bestFor(fen) {
            if (this.cachedEval && this.cachedEval.fen === fen) return this.cachedEval;
            const ev = await this.analysisEngine.evaluate(fen, 12, 700);
            ev.fen = fen;
            return ev;
        }

        _updateEvalBarFromMover(cp, color) {
            const T = window.ChessTeach, white = color === 'w' ? cp : -cp, n = T.mateIn(white);
            if (n != null) this._updateEvalBar(0, white > 0 ? n : -n);
            else this._updateEvalBar(white, null);
        }

        _updateEvalBar(whiteScore, whiteMate) {
            const pct = this.coach.scoreToBarPct(whiteScore, whiteMate);
            document.getElementById('evalBarFill').style.height = pct + '%';
            const v = document.getElementById('evalValue');
            if (whiteMate != null) v.textContent = whiteMate > 0 ? `M${Math.abs(whiteMate)}` : `-M${Math.abs(whiteMate)}`;
            else { const p = (whiteScore / 100).toFixed(1); v.textContent = whiteScore >= 0 ? `+${p}` : p; }
        }

        /* ══════════════════════════════════════════════════
           Interactive Multi-Move Variation Previewer
           ══════════════════════════════════════════════════ */
        _bindVariationPreviewControls() {
            const startBtn = document.getElementById('varStartBtn');
            if (startBtn) startBtn.addEventListener('click', () => this._stepVariation(0));
            const prevBtn = document.getElementById('varPrevBtn');
            if (prevBtn) prevBtn.addEventListener('click', () => this._stepVariation(Math.max(0, this.varStepIndex - 1)));
            const nextBtn = document.getElementById('varNextBtn');
            if (nextBtn) nextBtn.addEventListener('click', () => {
                if (this.activeVariation) {
                    this._stepVariation(Math.min(this.activeVariation.moves.length, this.varStepIndex + 1));
                }
            });
            const endBtn = document.getElementById('varEndBtn');
            if (endBtn) endBtn.addEventListener('click', () => {
                if (this.activeVariation) {
                    this._stepVariation(this.activeVariation.moves.length);
                }
            });
            const exitBtn = document.getElementById('varExitBtn');
            if (exitBtn) exitBtn.addEventListener('click', () => this._exitVariationPreview());
            const playBtn = document.getElementById('varPlayVsBotBtn');
            if (playBtn) playBtn.addEventListener('click', () => {
                if (this.activeVariation) this._playFromVariation(this.activeVariation);
            });
        }

        _previewVariation(variation) {
            if (!variation || !variation.moves || variation.moves.length === 0) return;
            ChessSounds.tabSwitch();
            this._cancelDrag();
            this._deselect(true);
            this.activeVariation = variation;
            this.varStepIndex = 0;

            const banner = document.getElementById('variationPreviewBanner');
            if (banner) banner.style.display = 'flex';

            document.getElementById('varPreviewTitle').textContent = variation.title;

            // Scroll smoothly to chessboard
            document.querySelector('.board-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

            this._stepVariation(1);
        }

        _stepVariation(stepIdx) {
            if (!this.activeVariation) return;
            const v = this.activeVariation;
            const safeIdx = Math.max(0, Math.min(v.moves.length, stepIdx));
            this.varStepIndex = safeIdx;

            window.moveLessons?.onStep(v, safeIdx);
            this._paintAnnotations(true);
            const targetFen = v.positions[safeIdx] || v.positions[0];
            const displayGame = new Chess(targetFen);

            const bd = document.getElementById('chessboard');
            if (!bd) return;
            bd.querySelectorAll('.piece-img, .move-dot').forEach(e => e.remove());
            bd.querySelectorAll('.square').forEach(s => s.classList.remove('selected', 'last-move', 'check', 'valid-move'));

            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                const ar = this.flipped ? 7 - r : r, ac = this.flipped ? 7 - c : c;
                const file = String.fromCharCode(97 + ac), rank = 8 - ar, sq = file + rank;
                const p = displayGame.get(sq);
                if (!p) continue;
                const el = bd.querySelector(`[data-square="${sq}"]`);
                if (!el) continue;
                const img = document.createElement('img');
                img.src = IMG[p.color + p.type];
                img.className = 'piece-img';
                img.draggable = false;
                el.appendChild(img);
            }

            this._clearArrows();

            if (safeIdx === 0) {
                document.getElementById('varPreviewStep').textContent = `Start Position (0 of ${v.moves.length})`;
                document.getElementById('varPreviewDesc').textContent = v.whyBetter;
                const firstMove = v.moves[0];
                if (firstMove && firstMove.from && firstMove.to) {
                    this._drawArrow(firstMove.from, firstMove.to, '#96bc4b', { id: 'var-step', label: firstMove.san });
                }
            } else {
                const movePlayed = v.moves[safeIdx - 1];
                document.getElementById('varPreviewStep').textContent = `Step ${safeIdx} of ${v.moves.length}: ${movePlayed.san}`;
                document.getElementById('varPreviewDesc').textContent = movePlayed.note;
                if (movePlayed.from && movePlayed.to) {
                    this._drawArrow(movePlayed.from, movePlayed.to, '#96bc4b', { id: 'var-step', label: movePlayed.san });
                }
                if (movePlayed.captured) ChessSounds.capture();
                else if (movePlayed.san && (movePlayed.san.includes('+') || movePlayed.san.includes('#'))) ChessSounds.check();
                else ChessSounds.move();
            }
        }

        _exitVariationPreview() {
            window.moveLessons?.pause();
            this.activeVariation = null;
            document.getElementById('moveLessonControls').hidden=true;
            const banner = document.getElementById('variationPreviewBanner');
            if (banner) banner.style.display = 'none';
            this._clearArrows();
            this._render();
        }

        async _playFromVariation(variation) {
            if (!variation?.positions?.length || this.thinking) return;
            const index = this.activeVariation === variation ? this.varStepIndex : 0;
            const game = new Chess(variation.positions[index] || variation.positions[0]);
            if (window.freePlay && !game.game_over()) { window.freePlay.fromFen(game.fen(), game.turn()); return; }
            if (game.game_over()) {
                this._status('This position is finished. Step back to practice an earlier position.');
                return;
            }
            this.game = game;
            this.playerColor = game.turn();
            this.flipped = this.playerColor === 'b';
            this.over = false;
            this.cachedEval = null;
            this.selected = null;
            this.validMoves = [];
            this._resetHistory();
            this._clearCheckmateVisuals();
            this._buildBoard();
            this._exitVariationPreview();
            this._rebuildHistory();
            this._updateCaptured();
            this._showCoachingForView();
            this.thinking = true;
            try { await this._evalAndCache(); }
            finally { this.thinking = false; }
            this._status('Practice game started from this position. Your turn.');
        }

        /* ══════════════════════════════════════════════════
           Move History list (fully rebuilt from moveData)
           ══════════════════════════════════════════════════ */
        _rebuildHistory() {
            const list = document.getElementById('moveList');
            list.innerHTML = '';
            if (!this.moveData.length) {
                list.innerHTML = '<div class="empty-history">No moves yet</div>';
                this._updateNavUI();
                return;
            }

            for (let i = 0; i < this.moveData.length; i++) {
                const md  = this.moveData[i];
                const isW = md.color === 'w';
                const num = Math.floor(i / 2) + 1;

                if (isW) {
                    const row = document.createElement('div');
                    row.className = 'move-row';
                    row.innerHTML = `<span class="move-number">${num}.</span>`;
                    list.appendChild(row);
                }

                // If Black moves first in a game (player is Black), we may need a placeholder row
                if (i === 0 && !isW) {
                    const row = document.createElement('div');
                    row.className = 'move-row';
                    row.innerHTML = `<span class="move-number">1.</span><span class="move-entry placeholder">…</span>`;
                    list.appendChild(row);
                }

                const row  = list.querySelector('.move-row:last-child');
                const span = document.createElement('span');
                span.className = 'move-entry';
                span.dataset.idx = String(i);
                span.title = `Go to move ${md.san}`;

                if (md.classification) {
                    span.classList.add(md.classification);
                    span.style.color = this.coach.color(md.classification);
                }
                if (i === this.viewIndex - 1) span.classList.add('active-move');

                span.textContent = md.san;
                row.appendChild(span);
            }

            list.scrollTop = list.scrollHeight;
            this._updateNavUI();
        }

        /* ══════════════════════════════════════════════════
           Captured pieces (derived from moveData up to viewIndex)
           ══════════════════════════════════════════════════ */
        _updateCaptured() {
            const wCap = [], bCap = [];
            const end = Math.min(this.viewIndex, this.moveData.length);
            for (let i = 0; i < end; i++) {
                const md = this.moveData[i];
                if (md.captured) {
                    (md.color === 'w' ? wCap : bCap).push((md.color === 'w' ? 'b' : 'w') + md.captured);
                }
            }
            const pCap = this.playerColor === 'w' ? wCap : bCap;
            const oCap = this.playerColor === 'w' ? bCap : wCap;
            document.getElementById('playerCaptured').innerHTML = pCap.map(p=>`<img src="${IMG[p]}" class="captured-piece">`).join('');
            document.getElementById('botCaptured').innerHTML    = oCap.map(p=>`<img src="${IMG[p]}" class="captured-piece">`).join('');
        }

        /* ══════════════════════════════════════════════════
           Arrows — supports multiple simultaneous arrows
           ══════════════════════════════════════════════════ */
        _drawArrow(from, to, color = '#96bc4b', { id = 'default', label = '', opacity = 0.78, width: userWidth } = {}) {
            const svg = this._arrowSvg, S = 100, ns = 'http://www.w3.org/2000/svg';

            // Remove any existing arrow with the same id
            svg.querySelectorAll(`[data-arrow-id="${id}"]`).forEach(el => el.remove());

            let x1 = (from.charCodeAt(0)-97)*S + S/2, y1 = (8- +from[1])*S + S/2;
            let x2 = (to.charCodeAt(0)-97)*S   + S/2, y2 = (8- +to[1])*S   + S/2;
            if (this.flipped) { x1=800-x1; y1=800-y1; x2=800-x2; y2=800-y2; }

            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx*dx + dy*dy);
            const sqDist = len / S;

            // Scale arrow width based on distance (thin for short moves)
            const autoW = sqDist <= 1.2 ? 6 : sqDist <= 1.5 ? 8 : sqDist <= 2.5 ? 10 : 13;
            const width = userWidth != null ? Math.min(userWidth, autoW + 4) : autoW;
            const mW = Math.max(8, Math.round(width * 0.9));
            const mH = Math.max(6, Math.round(mW * 0.7));

            // Shorten arrow so head doesn't overlap center
            const shortenPx = Math.max(8, Math.min(18, sqDist * 6));
            let ex2 = x2, ey2 = y2;
            if (len > shortenPx * 2) { ex2 -= (dx/len)*shortenPx; ey2 -= (dy/len)*shortenPx; }

            const group = document.createElementNS(ns, 'g');
            group.setAttribute('data-arrow-id', id);

            const markerId = `ah-${id}-${Date.now()}`;
            const defs = document.createElementNS(ns,'defs');
            const marker = document.createElementNS(ns,'marker');
            marker.setAttribute('id', markerId);
            marker.setAttribute('markerWidth', String(mW));
            marker.setAttribute('markerHeight', String(mH));
            marker.setAttribute('refX', String(mW-2));
            marker.setAttribute('refY', String(mH/2));
            marker.setAttribute('orient','auto');
            const poly = document.createElementNS(ns,'polygon');
            poly.setAttribute('points', `0 0,${mW} ${mH/2},0 ${mH}`);
            poly.setAttribute('fill', color);
            marker.appendChild(poly); defs.appendChild(marker); group.appendChild(defs);

            // Shadow
            const shadow = document.createElementNS(ns,'line');
            shadow.setAttribute('x1', x1+1); shadow.setAttribute('y1', y1+1);
            shadow.setAttribute('x2', ex2+1); shadow.setAttribute('y2', ey2+1);
            shadow.setAttribute('stroke', 'rgba(0,0,0,0.2)');
            shadow.setAttribute('stroke-width', String(width + 2));
            shadow.setAttribute('stroke-linecap','round');
            group.appendChild(shadow);

            // Main line
            const line = document.createElementNS(ns,'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', ex2); line.setAttribute('y2', ey2);
            line.setAttribute('stroke', color); line.setAttribute('stroke-width', String(width));
            line.setAttribute('stroke-opacity', String(opacity));
            line.setAttribute('marker-end', `url(#${markerId})`);
            line.setAttribute('stroke-linecap','round');
            group.appendChild(line);

            // Only show label for longer moves (skip for 1-2 square pawn pushes)
            if (label && sqDist > 1.8) {
                const mx = (x1+ex2)/2, my = (y1+ey2)/2;
                const fs = sqDist > 3 ? 13 : 11;
                const pillW = Math.max(label.length*(fs-1)+12, 36), pillH = fs+10;
                const rect = document.createElementNS(ns, 'rect');
                rect.setAttribute('x', mx-pillW/2); rect.setAttribute('y', my-pillH/2-14);
                rect.setAttribute('width', pillW); rect.setAttribute('height', pillH);
                rect.setAttribute('rx', String(pillH/2)); rect.setAttribute('fill', color);
                rect.setAttribute('fill-opacity', '0.9');
                group.appendChild(rect);
                const text = document.createElementNS(ns, 'text');
                text.setAttribute('x', mx); text.setAttribute('y', my-14);
                text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central');
                text.setAttribute('fill', '#fff'); text.setAttribute('font-size', String(fs));
                text.setAttribute('font-weight', '700'); text.setAttribute('font-family', 'Inter, sans-serif');
                text.textContent = label;
                group.appendChild(text);
            }

            group.style.opacity = '0';
            svg.appendChild(group);
            requestAnimationFrame(() => { group.style.transition = 'opacity 0.35s ease'; group.style.opacity = '1'; });
        }

        /** Remove a specific arrow by id, or all arrows */
        _clearArrows(id) {
            if (!this._arrowSvg) return;
            if (id) {
                this._arrowSvg.querySelectorAll(`[data-arrow-id="${id}"]`).forEach(el => el.remove());
            } else {
                while (this._arrowSvg.firstChild) this._arrowSvg.removeChild(this._arrowSvg.firstChild);
            }
        }

        /* ══════════════════════════════════════════════════
           Hint
           ══════════════════════════════════════════════════ */
        async _hint() {
            if (this.retry) return this._retryHint();
            if (this.pending) return;
            return window.learning?.gameHint();
        }

        /* ══════════════════════════════════════════════════
           Undo (cleanly restores game to player's turn)
           ══════════════════════════════════════════════════ */
        _clearCheckmateVisuals() {
            document.querySelectorAll('.checkmate-overlay').forEach(el => el.remove());
            document.querySelectorAll('.checkmate-king').forEach(el => el.classList.remove('checkmate-king'));
            this._clearArrows('checkmate-move');
        }

        _findKingSquare(color) {
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const sq = String.fromCharCode(97 + c) + (8 - r);
                    const p = this.game.get(sq);
                    if (p && p.type === 'k' && p.color === color) return sq;
                }
            }
            return null;
        }

        _describeMove(moveObj) {
            if (!moveObj) return '';
            const san = moveObj.san || '';
            const from = (moveObj.from || '').toUpperCase();
            const to = (moveObj.to || '').toUpperCase();
            const isCapture = san.includes('x') || !!moveObj.captured;

            let pieceName = 'Pawn';
            if (san.startsWith('N')) pieceName = 'Knight';
            else if (san.startsWith('B')) pieceName = 'Bishop';
            else if (san.startsWith('R')) pieceName = 'Rook';
            else if (san.startsWith('Q')) pieceName = 'Queen';
            else if (san.startsWith('K')) pieceName = 'King';
            else if (san.startsWith('O-O-O')) return 'Queen-side Castling (O-O-O)';
            else if (san.startsWith('O-O')) return 'King-side Castling (O-O)';

            const action = isCapture ? `captures on ${to}` : `moves to ${to}`;
            if (from && to) {
                return `${pieceName} from ${from} ${action} (${san})`;
            }
            return `${pieceName} ${action} (${san})`;
        }

        _getCheckmateExplanation(moveObj, won) {
            if (!moveObj) return '';
            const san = moveObj.san || '';
            const desc = this._describeMove(moveObj);
            const loserColor = this.game.turn();
            const kingSquare = this._findKingSquare(loserColor);
            const kingCoord = kingSquare ? kingSquare.toUpperCase() : 'the king';

            if (won) {
                return `Your winning move <strong>${san}</strong> (${desc}) delivers decisive checkmate! The opposing king on <strong>${kingCoord}</strong> is attacked with no legal escape squares, cannot block the line of attack, and cannot capture the attacking piece.`;
            } else {
                return `The bot played <strong>${san}</strong> (${desc}), delivering checkmate. Your king on <strong>${kingCoord}</strong> is trapped with no legal moves to escape, block, or capture.`;
            }
        }

        async _undo() {
            if (this.thinking) return;
            if (this.activeVariation) this._exitVariationPreview();
            this.pending = null;
            this.retry = null;
            this.annotations = null;
            this.panel.lastGameOver = null;

            // Clear any checkmate overlays and king pulse highlights
            this._clearCheckmateVisuals();

            // Check if player has made any moves to undo
            const playerMoves = this.moveData.filter(m => m.isPlayer);
            if (playerMoves.length === 0) {
                this._status('No player moves to undo');
                return;
            }

            ChessSounds.undo();

            // Determine how many half-moves to pop to get back to the PLAYER's turn:
            // 1) If the last move was by the player (e.g. player checkmated bot or bot has not moved):
            //    Undoing 1 move (the player's move) brings us back to player's turn!
            // 2) If the last move was by the bot:
            //    Undoing 2 moves (bot's reply + player's move) brings us back to player's turn!
            const lastMove = this.moveData[this.moveData.length - 1];
            let popCount = (lastMove && lastMove.isPlayer) ? 1 : 2;
            popCount = Math.min(popCount, this.moveData.length);

            for (let i = 0; i < popCount; i++) {
                this.moveData.pop();
            }

            // Slice position history to match
            this.posHistory = this.posHistory.slice(0, this.moveData.length + 1);
            this.viewIndex  = this.posHistory.length - 1;

            // Reset chess instance to the target position
            this.game = new Chess(this.posHistory[this.viewIndex]);
            this.over = false;
            this.thinking = false;
            this.cachedEval = null;

            // Safety check: ensure the turn is definitely the player's turn
            if (this.game.turn() !== this.playerColor && this.moveData.length > 0) {
                this.moveData.pop();
                this.posHistory = this.posHistory.slice(0, this.moveData.length + 1);
                this.viewIndex  = this.posHistory.length - 1;
                this.game       = new Chess(this.posHistory[this.viewIndex]);
            }

            // Deselect and clear old arrows
            this._deselect(true);
            this._clearArrows();

            // Rebuild history list & highlight the active move
            this._rebuildHistory();

            // Re-render board and pieces
            this._render();

            // Update captured pieces count
            this._updateCaptured();

            // Update navigation UI buttons & counter
            this._updateNavUI();

            // Update status and whose turn it is
            const fullMoveNum = Math.floor(this.moveData.length / 2) + 1;
            const turnColorName = this.playerColor === 'w' ? 'White' : 'Black';
            const statusMsg = `Move undone — Your turn (${turnColorName}, Move ${fullMoveNum})`;
            this._status(statusMsg);
            document.getElementById('playerStatus').textContent = `Your turn (Move ${fullMoveNum})`;

            // Restore the coach panel for the restored position
            if (this.viewIndex > 0) this.panel.refresh();
            else this.panel.welcome('undo');

            // Re-evaluate position and refresh eval bar
            await this._evalAndCache();
            if (this.cachedEval) {
                const turn = this.game.turn();
                const ws = turn === 'w' ? (this.cachedEval.score || 0) : -(this.cachedEval.score || 0);
                const wm = turn === 'w' ? this.cachedEval.mate : (this.cachedEval.mate != null ? -this.cachedEval.mate : null);
                this._updateEvalBar(ws, wm);
            }
        }

        /* ══════════════════════════════════════════════════
           Flip board
           ══════════════════════════════════════════════════ */
        _flip() { this.flipped = !this.flipped; this._buildBoard(); this._render(); }

        /* ══════════════════════════════════════════════════
           New Game modal
           ══════════════════════════════════════════════════ */
        _showModal() {
            document.getElementById('newGameModal').classList.add('active');
            document.getElementById('modalRatingSlider').value = this.botRating;
            document.getElementById('modalRating').textContent  = this.botRating;
        }
        _hideModal() { document.getElementById('newGameModal').classList.remove('active'); }

        async _startNew() {
            if (this.thinking || window.learning?.session) return;
            this.thinking = true;
            window.learning?.resetGame();
            const btn = document.querySelector('.color-btn.active');
            let col = btn ? btn.dataset.color : 'white';
            if (col === 'random') col = Math.random() > 0.5 ? 'white' : 'black';
            this.playerColor = col === 'white' ? 'w' : 'b';
            this.botRating   = +document.getElementById('modalRatingSlider').value;

            document.getElementById('ratingSlider').value       = this.botRating;
            document.getElementById('ratingDisplay').textContent = this.botRating;
            document.getElementById('botRating').textContent     = `Rating: ${this.botRating}`;
            await this._syncBotSkill();

            this.game = new Chess();
            this.thinking = true; this.over = false; this.cachedEval = null;
            this.flipped = this.playerColor === 'b';
            this._resetHistory();
            this._clearCheckmateVisuals();
            this._clearArrows();
            ChessSounds.newGame();

            this.panel.lastGameOver = null;
            this.panel.welcome('new');

            this._hideModal();
            this._buildBoard();
            this._deselect(true);
            this._rebuildHistory();
            this._render();
            this._updateCaptured();
            this._updateNavUI();
            await this._evalAndCache();

            if (this.playerColor === 'b') {
                this.thinking = true; this._status('Bot is thinking…');
                await this._botMove();
                this.thinking = false;
            }
            this._status('Your turn');
            document.getElementById('playerStatus').textContent = 'Your turn';
            this.thinking = false;
            window.learning?.onTurn();
        }

        /* ══════════════════════════════════════════════════
           Game Over — review prompt & checkmate display
           ══════════════════════════════════════════════════ */
        _gameOver() {
            this.over = true;
            let title='', msg='', isCheckmate = false;
            const lastMove = this.moveData.length > 0 ? this.moveData[this.moveData.length - 1] : null;

            if (this.game.in_checkmate()) {
                isCheckmate = true;
                const winnerColor = this.game.turn() === 'w' ? 'b' : 'w';
                const won = winnerColor === this.playerColor;
                title = won ? '🎉 Checkmate — You Win!' : '😞 Checkmate — You Lost';
                msg   = won ? 'Brilliant play! You delivered checkmate.' : 'The bot checkmated you. Review your moves to improve.';
                ChessSounds.checkmate();
            } else {
                title = '🤝 Draw';
                msg   = this.game.in_stalemate() ? 'Stalemate.' :
                        this.game.in_threefold_repetition() ? 'Draw by repetition.' :
                        this.game.insufficient_material() ? 'Insufficient material.' : 'The game ended in a draw.';
                ChessSounds.draw();
            }

            // Show checkmate overlay & arrow on the board
            if (isCheckmate) {
                this._showCheckmateOverlay();
            }

            // What this game teaches: accuracy, mistake counts and the concepts behind them.
            const T = window.ChessTeach;
            const mine = this.moveData.filter(m => m.isPlayer && m.lesson);
            const accuracy = mine.length ? Math.round(mine.reduce((sum, m) => sum + T.moveAccuracy(m.evalBefore, m.evalAfter), 0) / mine.length) : null;
            const counts = { inaccuracy: 0, mistake: 0, blunder: 0 };
            const conceptCounts = {};
            mine.forEach(m => {
                const L = m.lesson;
                if (counts[L.verdict] != null) counts[L.verdict]++;
                if (L.isMistake && L.concept) conceptCounts[L.concept.id] = (conceptCounts[L.concept.id] || 0) + 1;
                if (m.retried?.concept) conceptCounts[m.retried.concept] = (conceptCounts[m.retried.concept] || 0) + 1;
            });
            const fixed = this.moveData.filter(m => m.retried).length;
            const concepts = Object.entries(conceptCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
                .map(([id, count]) => ({ id, count, ...T.CONCEPTS[id], practice: T.PRACTICE[T.CONCEPTS[id].practice] }));
            const summary = `<div class="tc-summary">
                    <div><strong>${accuracy == null ? '–' : accuracy + '%'}</strong><span>accuracy</span></div>
                    <div><strong>${counts.inaccuracy}</strong><span>inaccuracies</span></div>
                    <div><strong>${counts.mistake}</strong><span>mistakes</span></div>
                    <div><strong>${counts.blunder}</strong><span>blunders</span></div>
                </div>${fixed ? `<p class="tc-fine">You fixed ${fixed} move${fixed > 1 ? 's' : ''} by retrying.</p>` : ''}`;
            const saved = window.learning?.store.data.moments.length || 0;
            this.panel.gameOver({ title, message: msg, summary, concepts, saved });

            const statusText = isCheckmate && lastMove
                ? (lastMove.isPlayer ? `Checkmate! You won with ${lastMove.san}` : `Checkmate! Bot delivered ${lastMove.san}`)
                : 'Game Over';
            this._status(statusText);
            document.getElementById('playerStatus').textContent = statusText;
        }

        /** Show checkmate visual overlay & move card on the board */
        _showCheckmateOverlay() {
            this._clearCheckmateVisuals();
            this._clearArrows();           // clear ALL arrows (including bot-move coaching arrow)
            const bd = document.getElementById('chessboard');
            if (!bd) return;

            const loserColor = this.game.turn();
            const winnerColor = loserColor === 'w' ? 'b' : 'w';
            const won = winnerColor === this.playerColor;
            const lastMove = this.moveData.length > 0 ? this.moveData[this.moveData.length - 1] : null;

            // Highlight the checkmated king
            const kingSq = this._findKingSquare(loserColor);
            if (kingSq) {
                const sq = bd.querySelector(`[data-square="${kingSq}"]`);
                if (sq) sq.classList.add('checkmate-king');
            }

            // Draw an arrow for the checkmate move
            if (lastMove && lastMove.from && lastMove.to) {
                this._drawArrow(lastMove.from, lastMove.to, won ? '#ffd700' : '#ca3431', {
                    id: 'checkmate-move',
                    label: lastMove.san,
                    opacity: 0.95,
                    width: 14
                });
            }

            const moveDesc = lastMove ? this._describeMove(lastMove) : '';
            const moveSan  = lastMove ? lastMove.san : '#';

            // Add interactive overlay card with move details & actions
            const overlay = document.createElement('div');
            overlay.className = 'checkmate-overlay animate-in';
            overlay.id = 'checkmateOverlay';
            overlay.innerHTML = `
                <div class="checkmate-card-dialog ${won ? 'win' : 'loss'}">
                    <div class="checkmate-dialog-icon">${won ? '🏆' : '💀'}</div>
                    <div class="checkmate-dialog-title">${won ? 'CHECKMATE — YOU WIN!' : 'CHECKMATE — BOT WINS'}</div>
                    <div class="checkmate-dialog-move-badge">
                        <span class="cd-badge-label">${won ? 'Winning Move' : 'Bot\'s Move'}:</span>
                        <span class="cd-badge-san">${moveSan}</span>
                        ${lastMove ? `<span class="cd-badge-coords">(${lastMove.from.toUpperCase()} &rarr; ${lastMove.to.toUpperCase()})</span>` : ''}
                    </div>
                    <div class="checkmate-dialog-desc">${moveDesc}</div>
                    <div class="checkmate-dialog-actions">
                        <button class="btn btn-sm btn-ghost" id="viewBoardCheckmateBtn">👁️ View Board</button>
                        <button class="btn btn-sm btn-secondary" id="undoCheckmateBtn">↩ Undo Move</button>
                        <button class="btn btn-sm btn-primary" id="newGameCheckmateBtn">✨ New Game</button>
                    </div>
                </div>
            `;
            bd.appendChild(overlay);

            // Bind overlay action buttons
            const viewBtn = overlay.querySelector('#viewBoardCheckmateBtn');
            if (viewBtn) {
                viewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    overlay.style.display = 'none';
                });
            }
            const undoBtn = overlay.querySelector('#undoCheckmateBtn');
            if (undoBtn) {
                undoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._undo();
                });
            }
            const newBtn = overlay.querySelector('#newGameCheckmateBtn');
            if (newBtn) {
                newBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._showModal();
                });
            }
        }

        /* ══════════════════════════════════════════════════
           Promotion dialog
           ══════════════════════════════════════════════════ */
        _promotionDialog() {
            return new Promise(resolve => {
                const modal = document.getElementById('promotionModal');
                const cont  = document.getElementById('promotionPieces');
                cont.innerHTML = '';
                ['q','r','b','n'].forEach(pc => {
                    const btn = document.createElement('button');
                    btn.className = 'promotion-piece-btn';
                    btn.innerHTML = `<img src="${IMG[this.playerColor+pc]}" alt="${pc}">`;
                    btn.addEventListener('click', () => { modal.classList.remove('active'); resolve(pc); });
                    cont.appendChild(btn);
                });
                modal.classList.add('active');
            });
        }

        /* ══════════════════════════════════════════════════
           Helpers
           ══════════════════════════════════════════════════ */
        async _syncBotSkill() {
            const p = ratingToParams(this.botRating);
            if (this.botEngine.ready) await this.botEngine.setOptions({ 'Skill Level': p.skill });
        }
        _status(t)           { document.getElementById('coachStatus').textContent = t; }
        _showLoading(show)   { document.getElementById('loadingOverlay').classList.toggle('active', show); }
    }

    /* ══════════════════════════════════════════════════════════════
       TrainingController — Handles the Learning Center modes
       ══════════════════════════════════════════════════════════════ */
    class TrainingController {
        constructor(app) {
            this.app = app;
            this.currentMode = 'play';
            this.trainingGame = null;        // chess.js instance for training board
            this.trainingData = null;        // current opening/scenario data
            this.trainingStep = 0;           // current step in the training
            this.trainingFlipped = false;
            this._trainingArrowSvg = null;
        }

        init() {
            this._bindModeTabs();
        }

        /* ── Mode Switching ── */
        _bindModeTabs() {
            document.querySelectorAll('.mode-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const mode = tab.dataset.mode;
                    if (mode === this.currentMode) return;
                    this._switchMode(mode);
                });
            });
        }

        _switchMode(mode) {
            if (window.learning?.session) return;
            // Keep UCI searches isolated while a move is being evaluated.
            if (this.app.thinking && !['play', 'coach', 'puzzles', 'deep-analysis', 'patterns', 'review'].includes(mode)) return;
            if (["play", "coach"].includes(this.currentMode) && window.studyBoard) window.studyBoard.sourceMode=this.currentMode;
            this.currentMode = mode;
            ChessSounds.tabSwitch();

            // Cancel any active drag in training or play mode and remove stray ghosts
            if (typeof this._cancelTrainingDrag === 'function') this._cancelTrainingDrag();
            if (this.app && typeof this.app._cancelDrag === 'function') this.app._cancelDrag();
            document.querySelectorAll('.drag-piece').forEach(el => el.remove());

            // Update tabs
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');

            // Show/hide sections
            document.getElementById('playMode').style.display = mode === 'coach' ? '' : 'none';
            document.getElementById('trainingHub').style.display = ['openings','midgame','endgame'].includes(mode) ? '' : 'none';
            document.getElementById('trainingSession').style.display = 'none';

            window.learning?.onMode(mode);
            window.patterns?.onMode(mode);
            window.moveLessons?.cancel();
            if (this.app.activeVariation) this.app._exitVariationPreview();
            window.freePlay?.onMode(mode);
            window.studyBoard?.onMode(mode);
            window.gameReview?.onMode(mode);
            if (mode === 'deep-analysis') return;
            else if (mode === 'openings') this._renderOpeningsHub();
            else if (mode === 'midgame') this._renderMidgameHub();
            else if (mode === 'endgame') this._renderEndgameHub();
        }

        /* ══════════════════════════════════════════════════════════
           OPENINGS HUB
           ══════════════════════════════════════════════════════════ */
        _renderOpeningsHub() {
            const openings = ChessTrainer.getOpeningList();
            const categories = ChessTrainer.getCategories();
            const ct = document.getElementById('trainingContent');

            let html = `
                <div class="training-hub-header">
                    <h1>📖 Opening Explorer</h1>
                    <p>Learn the main lines, key ideas, and common traps for the most popular chess openings. Play through each move with expert explanations.</p>
                </div>`;

            categories.forEach(cat => {
                const catOpenings = openings.filter(o => o.category === cat);
                const catIcon = cat.includes('e4') ? '♙' : cat.includes('d4') ? '♕' : '♘';
                html += `
                    <div class="training-category">
                        <div class="training-category-title">
                            <span class="cat-icon">${catIcon}</span> ${cat}
                        </div>
                        <div class="training-cards">
                            ${catOpenings.map(o => this._renderOpeningCard(o)).join('')}
                        </div>
                    </div>`;
            });

            ct.innerHTML = html;

            // Bind card clicks
            ct.querySelectorAll('.training-card[data-opening-id]').forEach(card => {
                card.addEventListener('click', () => this._startOpeningTraining(card.dataset.openingId));
            });
        }

        _renderOpeningCard(o) {
            return `
                <div class="training-card" data-opening-id="${o.id}">
                    <div class="training-card-header">
                        <span class="training-card-icon">${o.icon}</span>
                        <div class="training-card-info">
                            <div class="training-card-name">${o.name}</div>
                            <div class="training-card-meta">
                                <span class="training-card-eco">${o.eco}</span>
                                <span class="difficulty-badge ${o.difficulty.toLowerCase()}">${o.difficulty}</span>
                            </div>
                        </div>
                    </div>
                    <div class="training-card-desc">${o.description}</div>
                    <div class="training-card-footer">
                        <span class="training-card-play-as">Play as ${o.playAs === 'w' ? '♔ White' : '♚ Black'}</span>
                        <span class="training-card-start">Start Learning →</span>
                    </div>
                </div>`;
        }

        /* ══════════════════════════════════════════════════════════
           MIDGAME HUB
           ══════════════════════════════════════════════════════════ */
        _renderMidgameHub() {
            const scenarios = ChessTrainer.getMidgameList();
            const ct = document.getElementById('trainingContent');

            let html = `
                <div class="training-hub-header">
                    <h1>⚡ Midgame Strategy</h1>
                    <p>Master key tactical and strategic concepts through curated positions. Each topic has multiple scenarios — you'll get a <strong>random position</strong> every time!</p>
                </div>
                <div class="training-cards">
                    ${scenarios.map(s => `
                        <div class="training-card" data-midgame-id="${s.id}">
                            <div class="training-card-header">
                                <span class="training-card-icon">${s.icon}</span>
                                <div class="training-card-info">
                                    <div class="training-card-name">${s.title}</div>
                                    <div class="training-card-meta">
                                        <span class="training-card-eco">${s.concept}</span>
                                        <span class="difficulty-badge ${s.difficulty.toLowerCase()}">${s.difficulty}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="training-card-desc">${s.description}</div>
                            <div class="training-card-footer">
                                <span class="training-card-play-as">🎲 ${s.poolSize} random scenarios</span>
                                <span class="training-card-start">Practice →</span>
                            </div>
                        </div>
                    `).join('')}
                </div>`;

            ct.innerHTML = html;

            ct.querySelectorAll('.training-card[data-midgame-id]').forEach(card => {
                card.addEventListener('click', () => this._startMidgameTraining(card.dataset.midgameId));
            });
        }

        /* ══════════════════════════════════════════════════════════
           ENDGAME HUB
           ══════════════════════════════════════════════════════════ */
        _renderEndgameHub() {
            const positions = ChessTrainer.getEndgameList();
            const ct = document.getElementById('trainingContent');

            let html = `
                <div class="training-hub-header">
                    <h1>👑 Endgame Mastery</h1>
                    <p>Learn the essential endgame techniques that separate beginners from experts. Each topic has multiple positions — you'll get a <strong>random scenario</strong> every time!</p>
                </div>
                <div class="training-cards">
                    ${positions.map(p => `
                        <div class="training-card" data-endgame-id="${p.id}">
                            <div class="training-card-header">
                                <span class="training-card-icon">${p.icon}</span>
                                <div class="training-card-info">
                                    <div class="training-card-name">${p.title}</div>
                                    <div class="training-card-meta">
                                        <span class="training-card-eco">${p.concept}</span>
                                        <span class="difficulty-badge ${p.difficulty.toLowerCase()}">${p.difficulty}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="training-card-desc">${p.description}</div>
                            <div class="training-card-footer">
                                <span class="training-card-play-as">🎲 ${p.poolSize} random positions</span>
                                <span class="training-card-start">Learn →</span>
                            </div>
                        </div>
                    `).join('')}
                </div>`;

            ct.innerHTML = html;

            ct.querySelectorAll('.training-card[data-endgame-id]').forEach(card => {
                card.addEventListener('click', () => this._startEndgameTraining(card.dataset.endgameId));
            });
        }

        /* ══════════════════════════════════════════════════════════
           OPENING TRAINING SESSION — with interactive piece movement
           ══════════════════════════════════════════════════════════ */
        _startOpeningTraining(id) {
            const data = ChessTrainer.getOpening(id);
            if (!data) return;

            this.trainingData = data;
            this.trainingStep = 0;
            this.trainingGame = new Chess();
            this.trainingFlipped = data.playAs === 'b';
            this._trainingMode = 'opening';
            this._trainingSelected = null;
            this._trainingValidMoves = [];
            this._trainingDragState = null;
            this._trainingFeedback = null;

            document.getElementById('trainingHub').style.display = 'none';
            document.getElementById('trainingSession').style.display = '';

            // Header
            document.getElementById('trainingSessionHeader').innerHTML = `
                <h3>${data.icon} ${data.name}</h3>
                <p>${data.eco} • Play as ${data.playAs === 'w' ? 'White' : 'Black'} • ${data.difficulty}</p>`;

            this._buildTrainingBoard();
            this._bindTrainingBoardEvents();
            this._renderTrainingPosition();
            this._renderOpeningGuide();
            this._bindTrainingControls();

            // If the player is Black, auto-play White's first move
            if (data.playAs === 'b' && data.mainLine.length > 0 && data.mainLine[0].white) {
                setTimeout(() => this._autoPlayOpponentMove(), 500);
            }
        }

        _buildTrainingBoard() {
            const el = document.getElementById('trainingBoard');
            el.innerHTML = '';

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('board-arrows');
            svg.setAttribute('viewBox', '0 0 800 800');
            el.appendChild(svg);
            this._trainingArrowSvg = svg;

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const ar = this.trainingFlipped ? 7 - r : r;
                    const ac = this.trainingFlipped ? 7 - c : c;
                    const file = String.fromCharCode(97 + ac);
                    const rank = 8 - ar;
                    const sq = document.createElement('div');
                    sq.classList.add('square', (ar + ac) % 2 === 0 ? 'light' : 'dark');
                    sq.dataset.square = file + rank;
                    if (c === 0) { const l = document.createElement('span'); l.className = 'rank-label'; l.textContent = rank; sq.appendChild(l); }
                    if (r === 7) { const l = document.createElement('span'); l.className = 'file-label'; l.textContent = file; sq.appendChild(l); }
                    el.appendChild(sq);
                }
            }
        }

        /** Bind click/drag events on the training board for interactive play */
        _bindTrainingBoardEvents() {
            const bd = document.getElementById('trainingBoard');

            // Remove old listeners by replacing the node (clean approach)
            const clone = bd.cloneNode(true);
            bd.parentNode.replaceChild(clone, bd);
            // Re-grab reference
            this._trainingArrowSvg = clone.querySelector('.board-arrows');

            // Click
            clone.addEventListener('click', e => {
                const sq = e.target.closest('.square');
                if (sq) this._onTrainingSquareClick(sq.dataset.square);
            });

            // Mouse drag
            clone.addEventListener('mousedown', e => {
                const sq = e.target.closest('.square'); if (!sq) return;
                const name = sq.dataset.square;
                const p = this.trainingGame.get(name);
                const playerColor = this._getTrainingPlayerColor();
                if (p && p.color === playerColor && this._isPlayerTurnInTraining()) {
                    this._startTrainingDrag(name, e);
                }
            });

            // Touch drag
            clone.addEventListener('touchstart', e => {
                const t = e.touches[0];
                const sq = document.elementFromPoint(t.clientX, t.clientY)?.closest('.square');
                if (!sq) return;
                const name = sq.dataset.square;
                const p = this.trainingGame.get(name);
                const playerColor = this._getTrainingPlayerColor();
                if (p && p.color === playerColor && this._isPlayerTurnInTraining()) {
                    e.preventDefault();
                    this._startTrainingDrag(name, { clientX: t.clientX, clientY: t.clientY });
                }
            }, { passive: false });

            // Attach global drag listeners once
            if (!this._trainingGlobalBound) {
                this._trainingGlobalBound = true;
                document.addEventListener('mousemove', e => { if (this._trainingDragState) this._moveTrainingDrag(e); });
                document.addEventListener('mouseup',   e => { if (this._trainingDragState) this._endTrainingDrag(e); });
                document.addEventListener('touchmove', e => {
                    if (this._trainingDragState) { e.preventDefault(); this._moveTrainingDrag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }
                }, { passive: false });
                document.addEventListener('touchend', e => {
                    if (this._trainingDragState) { const t = e.changedTouches[0]; this._endTrainingDrag({ clientX: t.clientX, clientY: t.clientY }); }
                });
                document.addEventListener('touchcancel', () => { if (this._trainingDragState) this._cancelTrainingDrag(); });
                window.addEventListener('blur', () => { if (this._trainingDragState) this._cancelTrainingDrag(); });
                window.addEventListener('scroll', () => { if (this._trainingDragState) this._cancelTrainingDrag(); }, { passive: true });
            }
        }

        _getTrainingPlayerColor() {
            if (this._trainingMode === 'opening') return this.trainingData.playAs;
            return this.trainingData.playerColor;
        }

        _isPlayerTurnInTraining() {
            if (this._trainingMode === 'opening') {
                const line = this.trainingData.mainLine;
                if (!line || this.trainingStep >= line.length) return false;
                const nextMove = line[this.trainingStep];
                const playerColor = this.trainingData.playAs;
                return (nextMove.white && playerColor === 'w') || (!nextMove.white && playerColor === 'b');
            }
            // Midgame/Endgame — always the player's turn for the first key move
            return this.trainingGame.turn() === this.trainingData.playerColor;
        }

        /** Handle square clicks on the training board */
        _onTrainingSquareClick(name) {
            if (!this._isPlayerTurnInTraining()) return;

            if (this._trainingSelected) {
                const vm = this._trainingValidMoves.find(m => m.to === name);
                if (vm) { this._executeTrainingMove(vm); return; }
                const p = this.trainingGame.get(name);
                const playerColor = this._getTrainingPlayerColor();
                if (p && p.color === playerColor) { this._selectTrainingPiece(name); return; }
                this._deselectTrainingPiece(); return;
            }
            const p = this.trainingGame.get(name);
            const playerColor = this._getTrainingPlayerColor();
            if (p && p.color === playerColor) this._selectTrainingPiece(name);
        }

        _selectTrainingPiece(name) {
            this._trainingSelected = name;
            ChessSounds.select();
            const all = this.trainingGame.moves({ square: name, verbose: true });
            const seen = new Set();
            this._trainingValidMoves = all.filter(m => {
                const key = m.from + m.to;
                if (m.promotion && m.promotion !== 'q') return false;
                if (seen.has(key)) return false; seen.add(key); return true;
            });
            this._renderTrainingPosition();
        }

        _deselectTrainingPiece() {
            this._trainingSelected = null;
            this._trainingValidMoves = [];
            this._renderTrainingPosition();
        }

        _cancelTrainingDrag() {
            if (this._trainingDragState && this._trainingDragState.el) {
                this._trainingDragState.el.remove();
            }
            document.querySelectorAll('.drag-piece').forEach(el => el.remove());
            this._trainingDragState = null;
        }

        /** Drag helpers for training board */
        _startTrainingDrag(name, e) {
            this._cancelTrainingDrag();
            this._selectTrainingPiece(name);
            const p = this.trainingGame.get(name);
            if (!p) return;
            const ghost = document.createElement('img');
            ghost.src = IMG[p.color + p.type];
            ghost.className = 'drag-piece';
            ghost.draggable = false;
            document.body.appendChild(ghost);
            this._trainingDragState = { from: name, el: ghost };
            this._moveTrainingDrag(e);
        }
        _moveTrainingDrag(e) {
            if (!this._trainingDragState || !this._trainingDragState.el) return;
            const g = this._trainingDragState.el;
            g.style.left = (e.clientX - 35) + 'px'; g.style.top = (e.clientY - 35) + 'px';
        }
        _endTrainingDrag(e) {
            const state = this._trainingDragState;
            this._cancelTrainingDrag();
            if (!state || !e || e.clientX == null || e.clientY == null) return;
            const below = document.elementFromPoint(e.clientX, e.clientY);
            const sq = below ? below.closest('.square') : null;
            if (sq) {
                const vm = this._trainingValidMoves.find(m => m.to === sq.dataset.square);
                if (vm) { this._executeTrainingMove(vm); return; }
            }
        }

        /** Execute a move on the training board and check if correct */
        _executeTrainingMove(moveObj) {
            const move = this.trainingGame.move({ from: moveObj.from, to: moveObj.to, promotion: moveObj.promotion || 'q' });
            if (!move) { ChessSounds.illegal(); this._deselectTrainingPiece(); return; }

            // Check if the move matches the expected move in the opening line
            if (this._trainingMode === 'opening') {
                const line = this.trainingData.mainLine;
                const expected = line[this.trainingStep];
                if (move.san === expected.move) {
                    // Correct move!
                    ChessSounds.playMoveSound(move);
                    this.trainingStep++;
                    this._trainingFeedback = { type: 'correct', message: `✅ Correct! ${expected.explanation}` };
                    this._deselectTrainingPiece();
                    this._clearTrainingArrows();
                    this._drawTrainingArrow(move.from, move.to, '#96bc4b', move.san);
                    this._renderOpeningGuide();
                    this._updateTrainingMoveList();

                    // Auto-play opponent's next move(s)
                    if (this.trainingStep < line.length) {
                        setTimeout(() => this._autoPlayOpponentMove(), 600);
                    } else {
                        ChessSounds.complete();
                    }
                } else {
                    // Wrong move — undo it
                    this.trainingGame.undo();
                    ChessSounds.wrong();
                    this._trainingFeedback = { type: 'wrong', message: `❌ Not quite! The correct move is <strong>${expected.move}</strong>. ${expected.explanation}` };
                    this._deselectTrainingPiece();
                    this._showTrainingFeedback();
                }
            } else {
                // Midgame/Endgame — check against key moves
                ChessSounds.playMoveSound(move);
                const normSan = move.san.replace(/[+#]/g, '');
                const keyMoves = this.trainingData.keyMoves || [];
                const matchedKey = keyMoves.find(km => {
                    const kmNorm = (km.move || '').replace(/[+#]/g, '');
                    return move.san === km.move || normSan === kmNorm || (km.from && km.to && move.from === km.from && move.to === km.to);
                });

                if (matchedKey) {
                    ChessSounds.correct();
                    this._trainingFeedback = { type: 'correct', message: `🎯 Excellent! ${matchedKey.explanation}` };
                    this.trainingStep++;
                } else {
                    // Any legal move is allowed, but guide them on the key tactical concept
                    this._trainingFeedback = { type: 'info', message: `You played <strong>${move.san}</strong>. ${keyMoves.length > 0 ? `The key idea was <strong>${keyMoves[0].move}</strong>: ${keyMoves[0].explanation}` : 'Explore the position freely!'}` };
                }
                this._deselectTrainingPiece();
                this._clearTrainingArrows();
                this._drawTrainingArrow(move.from, move.to, matchedKey ? '#96bc4b' : '#5c8bb0', move.san);
                this._renderTrainingPosition();
                this._updateTrainingMoveList();
                this._showTrainingFeedback();

                // If not finished, allow opponent to respond with fast bot move so position is playable!
                if (!this.trainingGame.game_over() && this.app && this.app.botEngine) {
                    setTimeout(async () => {
                        const botRes = await this.app.botEngine.evaluate(this.trainingGame.fen(), 6, 300);
                        if (botRes && botRes.bestMove && botRes.bestMove !== '(none)') {
                            const bMove = this.trainingGame.move({
                                from: botRes.bestMove.substring(0, 2),
                                to:   botRes.bestMove.substring(2, 4),
                                promotion: botRes.bestMove[4] || 'q'
                            });
                            if (bMove) {
                                ChessSounds.playMoveSound(bMove);
                                this._renderTrainingPosition();
                                this._updateTrainingMoveList();
                                this._drawTrainingArrow(bMove.from, bMove.to, '#e68427', bMove.san);
                            }
                        }
                    }, 450);
                }
            }
        }

        /** Auto-play the opponent's moves in opening training */
        _autoPlayOpponentMove() {
            if (this._trainingMode !== 'opening') return;
            const line = this.trainingData.mainLine;
            if (!line || this.trainingStep >= line.length) return;

            const nextMove = line[this.trainingStep];
            const playerColor = this.trainingData.playAs;
            const isOpponentMove = (nextMove.white && playerColor === 'b') || (!nextMove.white && playerColor === 'w');

            if (isOpponentMove) {
                const m = this.trainingGame.move(nextMove.move);
                if (m) {
                    ChessSounds.playMoveSound(m);
                    this.trainingStep++;
                    this._clearTrainingArrows();
                    this._drawTrainingArrow(m.from, m.to, '#5c8bb0', m.san);
                    this._renderTrainingPosition();
                    this._renderOpeningGuide();
                    this._updateTrainingMoveList();

                    // Check if next move is also opponent's
                    if (this.trainingStep < line.length) {
                        const next = line[this.trainingStep];
                        const isAlsoOpponent = (next.white && playerColor === 'b') || (!next.white && playerColor === 'w');
                        if (isAlsoOpponent) {
                            setTimeout(() => this._autoPlayOpponentMove(), 600);
                        }
                    } else {
                        ChessSounds.complete();
                    }
                }
            }
        }

        /** Show feedback message in the training guide panel */
        _showTrainingFeedback() {
            if (!this._trainingFeedback) return;
            const fb = this._trainingFeedback;
            const guide = document.getElementById('trainGuideContent');

            // Find or create feedback element
            let fbEl = guide.querySelector('.train-feedback');
            if (!fbEl) {
                fbEl = document.createElement('div');
                fbEl.className = 'train-feedback';
                guide.insertBefore(fbEl, guide.firstChild);
            }

            fbEl.className = `train-feedback ${fb.type} animate-in`;
            fbEl.innerHTML = fb.message;

            // Auto-clear after a bit
            setTimeout(() => { if (fbEl.parentNode) fbEl.classList.add('fade-out'); }, 5000);
        }

        _renderTrainingPosition() {
            const fen = this.trainingGame.fen();
            const displayGame = new Chess(fen);
            const bd = document.getElementById('trainingBoard');

            bd.querySelectorAll('.piece-img, .move-dot').forEach(e => e.remove());
            bd.querySelectorAll('.square').forEach(s => s.classList.remove('selected', 'last-move', 'check', 'valid-move'));

            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                const file = String.fromCharCode(97 + c), rank = 8 - r, sq = file + rank;
                const p = displayGame.get(sq);
                if (!p) continue;
                const el = bd.querySelector(`[data-square="${sq}"]`);
                if (!el) continue;
                const img = document.createElement('img');
                img.src = IMG[p.color + p.type]; img.className = 'piece-img'; img.draggable = false;
                el.appendChild(img);
            }

            // Show valid move dots when a piece is selected
            if (this._trainingSelected) {
                const sel = bd.querySelector(`[data-square="${this._trainingSelected}"]`);
                if (sel) sel.classList.add('selected');
                this._trainingValidMoves.forEach(m => {
                    const el = bd.querySelector(`[data-square="${m.to}"]`);
                    if (!el) return;
                    el.classList.add('valid-move');
                    const dot = document.createElement('div');
                    dot.className = 'move-dot' + (m.captured ? ' capture' : '');
                    el.appendChild(dot);
                });
            }

            // Check highlight
            if (displayGame.in_check()) {
                const turn = displayGame.turn();
                for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                    const file = String.fromCharCode(97 + c), rank = 8 - r;
                    const p = displayGame.get(file + rank);
                    if (p && p.type === 'k' && p.color === turn) {
                        const el = bd.querySelector(`[data-square="${file}${rank}"]`);
                        if (el) el.classList.add('check');
                    }
                }
            }
        }

        _renderOpeningGuide() {
            const data = this.trainingData;
            const guide = document.getElementById('trainGuideContent');
            document.getElementById('trainGuideTitle').textContent = data.name;
            document.getElementById('trainGuideIcon').textContent = data.icon;

            const stepStatus = this.trainingStep >= data.mainLine.length
                ? 'Complete!'
                : `Move ${this.trainingStep + 1} of ${data.mainLine.length}`;
            document.getElementById('trainGuideStatus').textContent = stepStatus;

            let html = '';

            // Interactive instruction
            if (this.trainingStep < data.mainLine.length) {
                const nextMove = data.mainLine[this.trainingStep];
                const playerColor = this.trainingData.playAs;
                const isPlayerMove = (nextMove.white && playerColor === 'w') || (!nextMove.white && playerColor === 'b');
                if (isPlayerMove) {
                    html += `<div class="train-objective animate-in"><strong>🎯 Your turn:</strong> Play the correct move! Click or drag a piece on the board.</div>`;
                } else {
                    html += `<div class="train-objective" style="opacity:0.7"><em>Opponent is making their move...</em></div>`;
                }
            }

            // Move steps
            data.mainLine.forEach((step, i) => {
                const moveNum = Math.floor(i / 2) + 1;
                const side = step.white ? 'White' : 'Black';
                let state = 'upcoming';
                if (i < this.trainingStep) state = 'completed';
                else if (i === this.trainingStep) state = 'current';

                html += `
                    <div class="train-step-card ${state}">
                        <div class="train-step-header">
                            <span class="train-step-num">${i < this.trainingStep ? '✓' : i + 1}</span>
                            <span class="train-step-move">${step.white ? moveNum + '.' : moveNum + '...'} ${step.move}</span>
                            <span class="train-step-side">${side}</span>
                        </div>
                        <div class="train-step-explanation">${state !== 'upcoming' ? step.explanation : '...'}</div>
                    </div>`;
            });

            // Completion card
            if (this.trainingStep >= data.mainLine.length) {
                html += `
                    <div class="train-complete animate-in">
                        <div class="train-complete-icon">🎉</div>
                        <h3>Opening Complete!</h3>
                        <p>You've learned the main line of the ${data.name}. Review the key ideas and traps below!</p>
                    </div>`;
            }

            // Key ideas
            if (data.keyIdeas && data.keyIdeas.length > 0) {
                html += `
                    <div class="train-ideas-panel">
                        <h4>💡 Key Ideas</h4>
                        <ul class="train-ideas-list">
                            ${data.keyIdeas.map(idea => `<li>${idea}</li>`).join('')}
                        </ul>
                    </div>`;
            }

            // Common traps
            if (data.commonTraps && data.commonTraps.length > 0) {
                html += `
                    <div class="train-traps-section">
                        <h4>⚠️ Common Traps</h4>
                        ${data.commonTraps.map(trap => `
                            <div class="train-trap-card">
                                <strong>${trap.name}</strong>
                                <p>${trap.description}</p>
                            </div>
                        `).join('')}
                    </div>`;
            }

            // Counters
            if (data.counters && data.counters.length > 0) {
                html += `
                    <div class="train-counters-section">
                        <h4>🔄 Responses & Counters</h4>
                        ${data.counters.map(c => `
                            <div class="train-counter-card">
                                <strong>${c.name}</strong>
                                <p>${c.description}</p>
                            </div>
                        `).join('')}
                    </div>`;
            }

            guide.innerHTML = html;

            // Scroll to current step
            const currentCard = guide.querySelector('.train-step-card.current');
            if (currentCard) currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        _bindTrainingControls() {
            const nextBtn = document.getElementById('trainNextBtn');
            const prevBtn = document.getElementById('trainPrevBtn');
            const resetBtn = document.getElementById('trainResetBtn');
            const backBtn = document.getElementById('trainBackBtn');
            const flipBtn = document.getElementById('trainFlipBtn');

            // Remove old listeners by cloning
            const newNext = nextBtn.cloneNode(true);
            const newPrev = prevBtn.cloneNode(true);
            const newReset = resetBtn.cloneNode(true);
            const newBack = backBtn.cloneNode(true);
            const newFlip = flipBtn.cloneNode(true);
            nextBtn.replaceWith(newNext);
            prevBtn.replaceWith(newPrev);
            resetBtn.replaceWith(newReset);
            backBtn.replaceWith(newBack);
            flipBtn.replaceWith(newFlip);

            newNext.addEventListener('click', () => { ChessSounds.navigate(); this._trainingNext(); });
            newPrev.addEventListener('click', () => { ChessSounds.navigate(); this._trainingPrev(); });
            newReset.addEventListener('click', () => { ChessSounds.newGame(); this._trainingReset(); });
            newBack.addEventListener('click', () => this._trainingBack());
            newFlip.addEventListener('click', () => {
                this.trainingFlipped = !this.trainingFlipped;
                this._buildTrainingBoard();
                this._bindTrainingBoardEvents();
                this._renderTrainingPosition();
            });
        }

        _trainingNext() {
            if (!this.trainingData) return;

            if (this._trainingMode === 'opening') {
                const line = this.trainingData.mainLine;
                if (!line || this.trainingStep >= line.length) return;

                const moveData = line[this.trainingStep];
                const m = this.trainingGame.move(moveData.move);
                if (!m) return;

                ChessSounds.playMoveSound(m);
                this.trainingStep++;
                this._renderTrainingPosition();
                this._clearTrainingArrows();
                this._drawTrainingArrow(m.from, m.to, moveData.white ? '#96bc4b' : '#5c8bb0', moveData.move);
                this._renderOpeningGuide();
                this._updateTrainingMoveList();

                if (this.trainingStep >= line.length) ChessSounds.complete();
            }
        }

        _trainingPrev() {
            if (!this.trainingData || this.trainingStep <= 0) return;

            this.trainingStep--;
            if (this._trainingMode === 'opening') {
                this.trainingGame = new Chess();
                const line = this.trainingData.mainLine;
                for (let i = 0; i < this.trainingStep; i++) {
                    this.trainingGame.move(line[i].move);
                }
            } else {
                // For scenario mode, rebuild from FEN
                this.trainingGame = new Chess(this.trainingData.fen);
                this.trainingStep = 0;
            }

            this._clearTrainingArrows();
            this._deselectTrainingPiece();
            this._renderTrainingPosition();
            if (this._trainingMode === 'opening') this._renderOpeningGuide();
            this._updateTrainingMoveList();
        }

        _trainingReset() {
            if (!this.trainingData) return;
            this.trainingStep = 0;
            this._trainingFeedback = null;

            if (this._trainingMode === 'opening') {
                this.trainingGame = new Chess();
            } else {
                this.trainingGame = new Chess(this.trainingData.fen);
            }

            this._clearTrainingArrows();
            this._deselectTrainingPiece();
            this._renderTrainingPosition();
            if (this._trainingMode === 'opening') this._renderOpeningGuide();
            else this._renderScenarioGuide(this.trainingData, this._trainingMode);
            this._updateTrainingMoveList();

            // Auto-play opponent's first move if needed
            if (this._trainingMode === 'opening') {
                const data = this.trainingData;
                if (data.playAs === 'b' && data.mainLine.length > 0 && data.mainLine[0].white) {
                    setTimeout(() => this._autoPlayOpponentMove(), 500);
                }
            }
        }

        _trainingBack() {
            document.getElementById('trainingSession').style.display = 'none';
            document.getElementById('trainingHub').style.display = '';
        }

        _updateTrainingMoveList() {
            const list = document.getElementById('trainMoveList');

            if (this._trainingMode === 'opening') {
                const line = this.trainingData?.mainLine;
                if (!line || this.trainingStep === 0) {
                    list.innerHTML = '<div class="empty-history">Play the opening moves</div>';
                    document.getElementById('trainMoveCounter').textContent = '';
                    return;
                }

                list.innerHTML = '';
                for (let i = 0; i < this.trainingStep; i++) {
                    const md = line[i];
                    const isW = md.white;
                    const num = Math.floor(i / 2) + 1;

                    if (isW) {
                        const row = document.createElement('div');
                        row.className = 'move-row';
                        row.innerHTML = `<span class="move-number">${num}.</span>`;
                        list.appendChild(row);
                    }
                    if (i === 0 && !isW) {
                        const row = document.createElement('div');
                        row.className = 'move-row';
                        row.innerHTML = `<span class="move-number">1.</span><span class="move-entry placeholder">…</span>`;
                        list.appendChild(row);
                    }

                    const row = list.querySelector('.move-row:last-child');
                    const span = document.createElement('span');
                    span.className = 'move-entry';
                    span.style.color = isW ? '#96bc4b' : '#5c8bb0';
                    span.textContent = md.move;
                    row.appendChild(span);
                }

                document.getElementById('trainMoveCounter').textContent = `${this.trainingStep} / ${line.length}`;
            } else {
                // Scenario mode — show game history from the chess instance
                const history = this.trainingGame.history();
                if (history.length === 0) {
                    list.innerHTML = '<div class="empty-history">Make your move on the board</div>';
                    document.getElementById('trainMoveCounter').textContent = '';
                    return;
                }

                list.innerHTML = '';
                for (let i = 0; i < history.length; i++) {
                    const san = history[i];
                    // Determine color based on starting FEN
                    const startTurn = new Chess(this.trainingData.fen).turn();
                    const isW = (startTurn === 'w') ? (i % 2 === 0) : (i % 2 === 1);
                    const num = Math.floor(i / 2) + 1;

                    if (i % 2 === 0) {
                        const row = document.createElement('div');
                        row.className = 'move-row';
                        row.innerHTML = `<span class="move-number">${num}.</span>`;
                        list.appendChild(row);
                    }

                    const row = list.querySelector('.move-row:last-child');
                    const span = document.createElement('span');
                    span.className = 'move-entry';
                    span.style.color = isW ? '#96bc4b' : '#5c8bb0';
                    span.textContent = san;
                    row.appendChild(span);
                }

                document.getElementById('trainMoveCounter').textContent = `${history.length} moves`;
            }

            list.scrollTop = list.scrollHeight;
        }

        /* ── Training board arrows ── */
        _drawTrainingArrow(from, to, color, label) {
            const svg = this._trainingArrowSvg;
            if (!svg) return;
            const S = 100, ns = 'http://www.w3.org/2000/svg';

            let x1 = (from.charCodeAt(0)-97)*S + S/2, y1 = (8- +from[1])*S + S/2;
            let x2 = (to.charCodeAt(0)-97)*S   + S/2, y2 = (8- +to[1])*S   + S/2;
            if (this.trainingFlipped) { x1=800-x1; y1=800-y1; x2=800-x2; y2=800-y2; }

            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx*dx + dy*dy);
            const sqDist = len / S;

            // Scale arrow width based on distance (thin for short moves)
            const width = sqDist <= 1.2 ? 6 : sqDist <= 1.5 ? 8 : sqDist <= 2.5 ? 10 : 13;
            const mW = Math.max(8, Math.round(width * 0.9));
            const mH = Math.max(6, Math.round(mW * 0.7));

            // Shorten arrow so head doesn't overlap center
            const shortenPx = Math.max(8, Math.min(18, sqDist * 6));
            if (len > shortenPx * 2) { x2 -= (dx/len)*shortenPx; y2 -= (dy/len)*shortenPx; }

            const group = document.createElementNS(ns, 'g');
            const markerId = `train-ah-${Date.now()}`;
            const defs = document.createElementNS(ns,'defs');
            const marker = document.createElementNS(ns,'marker');
            marker.setAttribute('id', markerId);
            marker.setAttribute('markerWidth', String(mW)); marker.setAttribute('markerHeight', String(mH));
            marker.setAttribute('refX', String(mW - 2)); marker.setAttribute('refY', String(mH / 2));
            marker.setAttribute('orient','auto');
            const poly = document.createElementNS(ns,'polygon');
            poly.setAttribute('points', `0 0,${mW} ${mH/2},0 ${mH}`); poly.setAttribute('fill', color);
            marker.appendChild(poly); defs.appendChild(marker); group.appendChild(defs);

            const line = document.createElementNS(ns,'line');
            line.setAttribute('x1',x1); line.setAttribute('y1',y1);
            line.setAttribute('x2',x2); line.setAttribute('y2',y2);
            line.setAttribute('stroke',color); line.setAttribute('stroke-width', String(width));
            line.setAttribute('stroke-opacity','0.8');
            line.setAttribute('marker-end',`url(#${markerId})`);
            line.setAttribute('stroke-linecap','round');
            group.appendChild(line);

            // Only show label for longer moves (skip for short 1-square moves)
            if (label && sqDist > 1.8) {
                const mx = (x1+x2)/2, my = (y1+y2)/2;
                const pillW = Math.max(label.length*10+14, 36), pillH = 22;
                const rect = document.createElementNS(ns,'rect');
                rect.setAttribute('x',mx-pillW/2); rect.setAttribute('y',my-pillH/2-14);
                rect.setAttribute('width',pillW); rect.setAttribute('height',pillH);
                rect.setAttribute('rx','11'); rect.setAttribute('fill',color);
                rect.setAttribute('fill-opacity','0.9');
                group.appendChild(rect);
                const text = document.createElementNS(ns,'text');
                text.setAttribute('x',mx); text.setAttribute('y',my-14);
                text.setAttribute('text-anchor','middle'); text.setAttribute('dominant-baseline','central');
                text.setAttribute('fill','#fff'); text.setAttribute('font-size','12');
                text.setAttribute('font-weight','700'); text.setAttribute('font-family','Inter,sans-serif');
                text.textContent = label;
                group.appendChild(text);
            }

            group.style.opacity = '0';
            svg.appendChild(group);
            requestAnimationFrame(() => { group.style.transition = 'opacity 0.3s ease'; group.style.opacity = '1'; });
        }

        _clearTrainingArrows() {
            if (this._trainingArrowSvg) {
                while (this._trainingArrowSvg.firstChild) this._trainingArrowSvg.removeChild(this._trainingArrowSvg.firstChild);
            }
        }

        /* ══════════════════════════════════════════════════════════
           MIDGAME TRAINING SESSION — with interactive play
           ══════════════════════════════════════════════════════════ */
        _startMidgameTraining(id) {
            const data = ChessTrainer.getMidgame(id);
            if (!data) return;
            this._startScenarioTraining(data, 'midgame');
        }

        /* ══════════════════════════════════════════════════════════
           ENDGAME TRAINING SESSION — with interactive play
           ══════════════════════════════════════════════════════════ */
        _startEndgameTraining(id) {
            const data = ChessTrainer.getEndgame(id);
            if (!data) return;
            this._startScenarioTraining(data, 'endgame');
        }

        /* ── Shared scenario training (midgame/endgame) with interactive play ── */
        _startScenarioTraining(data, type) {
            this.trainingData = data;
            this.trainingStep = 0;
            this.trainingGame = new Chess(data.fen);
            this.trainingFlipped = data.playerColor === 'b';
            this._trainingMode = type;
            this._trainingSelected = null;
            this._trainingValidMoves = [];
            this._trainingDragState = null;
            this._trainingFeedback = null;

            document.getElementById('trainingHub').style.display = 'none';
            document.getElementById('trainingSession').style.display = '';

            document.getElementById('trainingSessionHeader').innerHTML = `
                <h3>${data.icon} ${data.title || data.name}</h3>
                <p>${data.concept} • ${data.difficulty} • Play as ${data.playerColor === 'w' ? 'White' : 'Black'}</p>`;

            this._buildTrainingBoard();
            this._bindTrainingBoardEvents();
            this._renderTrainingPosition();
            this._renderScenarioGuide(data, type);
            this._bindTrainingControls();
            this._updateTrainingMoveList();
        }

        _renderScenarioGuide(data, type) {
            const guide = document.getElementById('trainGuideContent');
            const modeLabel = type === 'midgame' ? '⚡ Midgame Scenario' : '👑 Endgame Position';
            document.getElementById('trainGuideTitle').textContent = data.title || data.name;
            document.getElementById('trainGuideIcon').textContent = data.icon;
            document.getElementById('trainGuideStatus').textContent = modeLabel;

            let html = '';

            // Objective — with clear instruction to play on the board
            if (data.objective) {
                html += `<div class="train-objective"><strong>🎯 Objective:</strong> ${data.objective}<br><em style="opacity:0.7;font-size:12px">Click or drag pieces on the board to make your move!</em></div>`;
            }

            // Description
            html += `<div class="coaching-message" style="margin-bottom:14px;font-size:13px;line-height:1.7">${data.description}</div>`;

            // Key moves — hidden until player attempts or after feedback
            if (data.keyMoves && data.keyMoves.length > 0) {
                const showKey = this.trainingStep > 0;
                html += `<div class="train-ideas-panel" style="background:rgba(150,188,75,.06);border-color:rgba(150,188,75,.2)">
                    <h4 style="color:#96bc4b">🎯 Key Move${data.keyMoves.length > 1 ? 's' : ''} ${showKey ? '' : '(play first!)'}</h4>`;
                data.keyMoves.forEach(km => {
                    html += `<div class="train-step-card ${showKey ? 'current' : 'upcoming'}" style="margin-bottom:8px">
                        <div class="train-step-header">
                            <span class="train-step-num">★</span>
                            <span class="train-step-move">${showKey ? km.move : '???'}</span>
                        </div>
                        <div class="train-step-explanation" style="color:var(--text)">${showKey ? km.explanation : 'Make your move to reveal the answer!'}</div>
                    </div>`;
                });
                html += `</div>`;
            }

            // Lesson
            if (data.lesson) {
                html += `<div class="train-lesson-card">
                    <h4>🎓 Lesson</h4>
                    <p>${data.lesson}</p>
                </div>`;
            }

            // Tips
            if (data.tips && data.tips.length > 0) {
                html += `<div class="train-ideas-panel">
                    <h4>💡 Tips & Principles</h4>
                    <ul class="train-ideas-list">
                        ${data.tips.map(t => `<li>${t}</li>`).join('')}
                    </ul>
                </div>`;
            }

            // New Scenario button
            html += `<div style="text-align:center;margin-top:18px">
                <button class="btn btn-accent" id="newScenarioBtn"><span class="icon">🎲</span> New Random Scenario</button>
            </div>`;

            guide.innerHTML = html;

            // Bind new scenario button
            const newBtn = document.getElementById('newScenarioBtn');
            if (newBtn) {
                newBtn.addEventListener('click', () => {
                    ChessSounds.newGame();
                    this._startScenarioTraining(
                        type === 'midgame' ? ChessTrainer.getMidgame(data.id) : ChessTrainer.getEndgame(data.id),
                        type
                    );
                });
            }
        }
    }

    /* ── Bootstrap ── */
    window.addEventListener('DOMContentLoaded', () => {
        window.app = new ChessTutorApp();
        window.app.init();

        // Initialize training controller
        window.trainer = new TrainingController(window.app);
        window.trainer.init();
        window.learning = new LearningController(window.app, window.trainer);
        window.patterns = new PatternController();
        window.moveLessons = new MoveLessons(window.app);
        window.studyBoard = new StudyBoard(window.app);
        window.freePlay = new FreePlay();
        window.gameReview = new GameReview(window.app);
        document.getElementById('patternShortcut').addEventListener('click', () => window.trainer._switchMode('patterns'));
    });
})();


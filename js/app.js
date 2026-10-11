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

        /** Show the stored coaching for the move at (viewIndex - 1), if any */
        _showCoachingForView() {
            if (this.viewIndex === 0) {
                // At starting position — show welcome card
                this._clearArrows();
                const colName = this.playerColor === 'w' ? 'White' : 'Black';
                document.getElementById('coachContent').innerHTML = `
                    <div class="coach-welcome"><div class="welcome-icon">♟️</div>
                    <h3>Starting Position</h3>
                    <p>You are playing as ${colName}. Make your move on the board!</p></div>`;
                return;
            }
            const md = this.moveData[this.viewIndex - 1];
            if (!md) return;
            if (md.coaching) {
                this._showCoaching(md.coaching, md);
            } else if (md.botAnalysis) {
                // Bot move with stored analysis — show full bot coaching
                this._showBotCoaching(md.botAnalysis, md);
            } else {
                // Bot move without analysis — simple fallback
                this._clearArrows();
                document.getElementById('coachContent').innerHTML = `
                    <div class="coaching-card bot-move animate-in">
                        <div class="coaching-title" style="color:var(--text-muted)">🤖 Bot Move</div>
                        <div class="coaching-move">Bot played: <strong>${md.san}</strong></div>
                        <div class="coaching-message">This was the bot's response at rating ${this.botRating}.</div>
                    </div>`;
            }
        }

        /** Truncate game to the current viewIndex and resume play from there */
        async _playFromHere() {
            if (this._atEnd()) return;
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
            if (this.thinking || this.over || window.learning?.session) return;
            this.thinking = true;
            // Promotion?
            if (moveObj.flags && moveObj.flags.includes('p')) {
                const promo = await this._promotionDialog();
                if (!promo) { this.thinking = false; this._deselect(); return; }
                moveObj = { from: moveObj.from, to: moveObj.to, promotion: promo };
            }

            // Eval before (cached or fresh)
            const evalBefore = this.cachedEval || await this.analysisEngine.evaluate(this.game.fen(), 10, 400);

            // Execute move
            const move = this.game.move({ from: moveObj.from, to: moveObj.to, promotion: moveObj.promotion });
            if (!move) { this.thinking = false; this._deselect(); return; }

            // Record in history
            const newFen = this.game.fen();
            this.posHistory.push(newFen);
            this.viewIndex = this.posHistory.length - 1;

            this._deselect(true);
            this._clearArrows();
            this._render();
            ChessSounds.playMoveSound(move);
            this._status('Analyzing your move…');
            this.thinking = true;

            // Eval after (fast depth 10)
            const evalAfter = await this.analysisEngine.evaluate(this.game.fen(), 10, 400);

            // Scores
            const cpBefore   = evalBefore.mate != null ? (evalBefore.mate > 0 ? 10000 : -10000) : (evalBefore.score || 0);
            const cpAfterRaw = evalAfter.mate  != null ? (evalAfter.mate  > 0 ? 10000 : -10000) : (evalAfter.score  || 0);
            const cpLoss     = Math.max(0, cpBefore + cpAfterRaw);

            const playerUci = move.from + move.to + (move.promotion || '');
            const isBest    = playerUci === evalBefore.bestMove;

            // Build game history (SANs before this move) for opening detection
            const sanHistory = this.moveData.map(m => m.san);

            // Use the comprehensive coach analysis
            const coaching = this.coach.analyzePlayerMove({
                fenBefore: this.posHistory[this.posHistory.length - 2],
                move,
                bestMoveUci: evalBefore.bestMove,
                isBestMove: isBest,
                cpLoss,
                evalBefore: cpBefore,
                evalAfter: -cpAfterRaw,
                gameHistory: sanHistory,
                gameFen: this.game.fen()
            });

            // Human instructor: board situation & future variations
            const boardSituation = this.coach.getBoardSituation(this.game.fen(), move.color);
            let multiPv = [];
            try {
                multiPv = await this.analysisEngine.evaluateMultiPV(this.game.fen(), 3, 9, 450);
            } catch (_) {}
            const futureVariations = this.coach.explainVariations(this.game.fen(), multiPv, move.color, move);

            const md = {
                san: move.san, color: move.color, from: move.from, to: move.to,
                captured: move.captured || null, promotion: move.promotion || null,
                isPlayer: true, classification: coaching.classification,
                coaching, phase: coaching.phase,
                boardSituation, futureVariations, engineLines: multiPv, replyLine: evalAfter.pv || [],
                bestLine: evalBefore.pv || [], bestMate: evalBefore.mate, playedMate: evalAfter.mate == null ? null : -evalAfter.mate,
                cpLoss, evalBefore: cpBefore, evalAfter: -cpAfterRaw, bestMove: evalBefore.bestMove || '',
                fenBefore: this.posHistory[this.posHistory.length - 2],
                fenAfter: newFen
            };
            this.moveData.push(md);
            window.learning?.capture(md);

            // UI — coaching display (arrows are drawn inside _showCoaching)
            this._showCoaching(coaching, md);
            if (window.learning?.mode === 'coach') ChessSounds.playClassificationSound(coaching.classification);
            this._rebuildHistory();

            // Eval bar (White's perspective)
            const turn = this.game.turn();
            const ws = turn === 'w' ? (evalAfter.score||0) : -(evalAfter.score||0);
            const wm = turn === 'w' ? evalAfter.mate : (evalAfter.mate != null ? -evalAfter.mate : null);
            this._updateEvalBar(ws, wm);

            if (this.game.game_over()) { this._gameOver(); this.thinking = false; return; }

            // Bot turn
            this._status('Bot is thinking…');
            await this._botMove();
            this.thinking = false;
            window.learning?.onTurn();
        }

        /* ══════════════════════════════════════════════════
           Bot move
           ══════════════════════════════════════════════════ */
        async _botMove() {
            const p = ratingToParams(this.botRating);
            await this.botEngine.setOptions({ 'Skill Level': p.skill });
            await new Promise(r => setTimeout(r, 400 + Math.random() * 800));

            const fenBeforeBot = this.game.fen();
            const res = await this.botEngine.evaluate(this.game.fen(), Math.min(p.depth, 10), 450);
            if (!res.bestMove || res.bestMove === '(none)') return;

            const move = this.game.move({
                from: res.bestMove.substring(0,2),
                to:   res.bestMove.substring(2,4),
                promotion: res.bestMove.length > 4 ? res.bestMove[4] : undefined
            });
            if (!move) return;
            ChessSounds.playMoveSound(move);

            // Record position
            this.posHistory.push(this.game.fen());
            this.viewIndex = this.posHistory.length - 1;

            // Analyze the bot's move — what it does, why, and what threats it creates
            let botAnalysis = null;
            let botPvLines = [];
            try {
                // Get future PV lines from the position AFTER bot's move (player's perspective)
                botPvLines = await this.analysisEngine.evaluateMultiPV(this.game.fen(), 3, 12, 900);
            } catch (_) {}

            try {
                botAnalysis = this.coach.analyzeBotMove(fenBeforeBot, move, res.score || 0, botPvLines);
            } catch (e) {
                console.warn('Bot analysis failed:', e);
            }

            // Store move data with bot analysis
            this.moveData.push({
                san: move.san, color: move.color, from: move.from, to: move.to,
                captured: move.captured || null, promotion: move.promotion || null,
                isPlayer: false, classification: null, coaching: null,
                botAnalysis: botAnalysis,
                engineLines: botPvLines,
                fenBefore: fenBeforeBot,
                fenAfter: this.game.fen(),
                cpLoss: 0, evalBefore: 0, evalAfter: 0, bestMove: ''
            });

            this._rebuildHistory();
            this._render();

            // Show bot analysis coaching panel
            if (botAnalysis) {
                this._showBotCoaching(botAnalysis, this.moveData[this.moveData.length - 1]);
            }

            if (this.game.game_over()) { this._gameOver(); return; }

            this._status('Preparing analysis…');
            await this._evalAndCache();
            this._status('Your turn');
            document.getElementById('playerStatus').textContent = 'Your turn';
        }

        /* ══════════════════════════════════════════════════
           Eval cache & bar
           ══════════════════════════════════════════════════ */
        async _evalAndCache() {
            this.cachedEval = await this.analysisEngine.evaluate(this.game.fen(), 10, 400);
            const turn = this.game.turn();
            const ws = turn === 'w' ? (this.cachedEval.score||0) : -(this.cachedEval.score||0);
            const wm = turn === 'w' ? this.cachedEval.mate : (this.cachedEval.mate != null ? -this.cachedEval.mate : null);
            this._updateEvalBar(ws, wm);
        }

        _updateEvalBar(whiteScore, whiteMate) {
            const pct = this.coach.scoreToBarPct(whiteScore, whiteMate);
            document.getElementById('evalBarFill').style.height = pct + '%';
            const v = document.getElementById('evalValue');
            if (whiteMate != null) v.textContent = whiteMate > 0 ? `M${Math.abs(whiteMate)}` : `-M${Math.abs(whiteMate)}`;
            else { const p = (whiteScore / 100).toFixed(1); v.textContent = whiteScore >= 0 ? `+${p}` : p; }
        }

        /* ══════════════════════════════════════════════════
           Coaching display — Human Instructor Experience:
           1. Coach Lesson & Board Situation Radar
           2. 2-3 Future Move Variations & Attack Possibilities
           3. Rating & Move Polish
           ══════════════════════════════════════════════════ */
        _showCoaching(c, md) {
            if (window.learning && !window.learning.detailedCoaching()) { this._clearArrows(); window.learning.showGameCard(md); return; }
            const col = this.coach.color(c.classification);
            const isBad = ['inaccuracy','mistake','blunder'].includes(c.classification);
            const hasBest = md.bestMove && md.bestMove.length >= 4;

            // Arrow toggle for bad moves
            let arrowBtnHtml = '';
            if (isBad && hasBest) {
                arrowBtnHtml = `
                    <div class="coaching-arrows-section">
                        <button class="btn btn-arrow-toggle active" id="toggleArrowsBtn">
                            <span class="arrow-toggle-icon">🏹</span> Arrows Shown
                        </button>
                        <div class="arrow-legend">
                            <span class="arrow-legend-item"><span class="arrow-swatch" style="background:${c.classification === 'blunder' ? '#ca3431' : c.classification === 'mistake' ? '#e68427' : '#e6a827'}"></span>Your move</span>
                            <span class="arrow-legend-item"><span class="arrow-swatch" style="background:#96bc4b"></span>Best move</span>
                        </div>
                    </div>`;
            }

            // Extract situation and variations
            const situation = md.boardSituation || this.coach.getBoardSituation(md.fenAfter || this.game.fen(), md.color);
            const variations = md.futureVariations || this.coach.explainVariations(md.fenAfter || this.game.fen(), [], md.color, md);

            // Generate deep analysis sections
            let deepHtml = '';
            try {
                const fenBefore = md.fenBefore || this.posHistory[this.posHistory.length - 2];
                const moveEffects = this.coach.analyzeMoveEffects(fenBefore, {
                    piece: md.san.match(/^[NBRQK]/)?.[0]?.toLowerCase() || 'p',
                    from: md.from, to: md.to, san: md.san, color: md.color,
                    captured: md.captured, flags: '', promotion: null
                });
                let bestEffects = null;
                if (hasBest) {
                    bestEffects = this.coach.analyzeBestMove(fenBefore, md.bestMove);
                }
                const sections = this.coach.generateDeepAnalysis(fenBefore, md, moveEffects, bestEffects, c.phase, md.evalAfter);
                if (sections.length > 0) {
                    deepHtml = sections.map(s => `
                        <div class="deep-section">
                            <div class="deep-section-title">${s.title}</div>
                            <div class="deep-section-content">${s.content}</div>
                        </div>
                    `).join('');
                } else {
                    deepHtml = '<div class="deep-section"><div class="deep-section-content" style="opacity:0.6">No additional strategic insights for this move.</div></div>';
                }
            } catch (e) {
                deepHtml = '<div class="deep-section"><div class="deep-section-content" style="opacity:0.6">Analysis not available for this move.</div></div>';
            }

            const ratingBadge = '';

            document.getElementById('coachContent').innerHTML = `
                <div class="coaching-card ${c.classification} animate-in" style="--accent:${col}">
                    ${c.phaseLabel ? `<div class="phase-badge phase-${c.phase}">${c.phaseLabel}</div>` : ''}
                    <div class="coaching-title" style="color:${col}">${c.title}</div>
                    <div class="coaching-move">You played: <strong>${md.san}</strong></div>
                    ${ratingBadge}

                    <div class="coach-tabs">
                        <button class="coach-tab active" data-tab="situation">🎓 Lesson & Board Radar</button>
                        <button class="coach-tab" data-tab="variations">🔮 Move continuations (${variations.length})</button>
                        <button class="coach-tab" data-tab="deep">📊 Further analysis</button>
                    </div>

                    <!-- TAB 1: Situation & Lesson -->
                    <div class="coach-tab-content" id="coachSituationTab">
                        <div class="coaching-message">${c.message}</div>
                        ${c.suggestion ? `<div class="coaching-suggestion"><span class="suggestion-icon">💡</span> ${c.suggestion}</div>` : ''}
                        ${arrowBtnHtml}

                        <!-- Board Situation Breakdown -->
                        <div class="board-situation-card">
                            <div class="situation-header">
                                <span>🗺️</span>
                                <span>Current Board Situation (Instructor Radar)</span>
                            </div>

                            <!-- Weak enemy targets -->
                            ${situation.targets && situation.targets.length > 0 ? `
                                <div style="font-size:11.5px;font-weight:700;color:var(--text);margin-top:4px">🎯 Prime Targets to Attack:</div>
                                ${situation.targets.map(t => `
                                    <div class="situation-item">
                                        <span class="situation-target-badge">${t.square.toUpperCase()}</span>
                                        <div>
                                            <strong style="color:var(--text);display:block">${t.title}</strong>
                                            <span style="color:var(--text-muted)">${t.desc}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            ` : ''}

                            <!-- King Safety -->
                            <div style="font-size:11.5px;font-weight:700;color:var(--text);margin-top:6px">🛡️ King Safety & Defenses:</div>
                            <div class="situation-item">
                                <span class="situation-safety-badge">You</span>
                                <div>${situation.myKingSafety}</div>
                            </div>
                            <div class="situation-item">
                                <span class="situation-safety-badge" style="background:rgba(202,52,49,0.2);color:#e0524f">Bot</span>
                                <div>${situation.oppKingSafety}</div>
                            </div>

                            <!-- Central Pawn Break -->
                            ${situation.pawnBreakAdvice ? `
                                <div style="font-size:11.5px;font-weight:700;color:var(--text);margin-top:6px">⚡ Decisive Pawn Break:</div>
                                <div class="situation-item">
                                    <span class="situation-lever-badge">Break</span>
                                    <div>${situation.pawnBreakAdvice}</div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Jump to Variations button -->
                        <button class="btn btn-accent btn-sm" id="jumpToVariationsBtn" style="margin-top:10px;width:100%;padding:8px 12px;font-weight:700">
                            <span>🔮</span> Explore ${variations.length} Future Move Variations &rarr;
                        </button>
                    </div>

                    <!-- TAB 2: Future Variations -->
                    <div class="coach-tab-content" id="coachVariationsTab" style="display:none">
                        <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 10px 0;line-height:1.5">
                            These <strong>${variations.length} continuations</strong> start after your move, with your opponent to play. Calculate both sides:
                        </p>

                        <div style="display:flex;flex-direction:column;gap:10px">
                            ${variations.map((v, i) => `
                                <div class="variation-card">
                                    <div class="variation-card-header">
                                        <span class="variation-card-title">${v.icon} ${v.title}</span>
                                        <span class="variation-target-tag">🎯 ${v.target}</span>
                                    </div>

                                    <div class="variation-move-chips">
                                        ${v.moves.map((m, mi) => `
                                            <span class="var-chip ${mi === 0 ? 'first-move' : ''}">
                                                ${mi % 2 === 0 ? (Math.floor(mi/2) + 1) + '.' : '...'} ${m.san}
                                            </span>
                                        `).join('')}
                                    </div>

                                    <div class="variation-explanation-text">
                                        ${v.whyBetter}
                                    </div>

                                    <div class="variation-step-list">
                                        ${v.moves.map(m => `
                                            <div class="variation-step-row">
                                                <span class="var-chip" style="font-size:11px;padding:1px 5px">${m.san}</span>
                                                <span>${m.note}</span>
                                            </div>
                                        `).join('')}
                                    </div>

                                    <div class="variation-actions">
                                        <button class="btn btn-primary btn-sm preview-var-btn" data-var-index="${i}">
                                            <span>▶</span> Preview on Chessboard
                                        </button>
                                        <button class="btn btn-secondary btn-sm play-var-btn" data-var-index="${i}">
                                            <span>🤖</span> Play Out vs Bot
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- TAB 3: Polish & Rating -->
                    <div class="coach-tab-content" id="coachRatingTab" style="display:none">
                        <div class="coaching-eval" style="margin-bottom:12px">
                            <div class="eval-badge">Position Eval: ${this.coach.formatEval(md.evalAfter)}</div>
                            <div class="eval-change ${md.cpLoss > 35 ? 'negative' : 'positive'}">
                                ${md.cpLoss > 0 ? `(${(md.cpLoss/100).toFixed(1)} pawns lost)` : '(Accurate position)'}
                            </div>
                        </div>
                        ${c.phaseTip ? `<div class="phase-tip">${c.phaseTip}</div>` : ''}
                        ${deepHtml}
                    </div>
                </div>`;

            // Tab switching
            document.querySelectorAll('.coach-tab[data-tab]').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.coach-tab[data-tab]').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    const which = tab.dataset.tab;
                    document.getElementById('coachSituationTab').style.display = which === 'situation' ? '' : 'none';
                    document.getElementById('coachVariationsTab').style.display = which === 'variations' ? '' : 'none';
                    document.getElementById('coachRatingTab').style.display = which === 'deep' ? '' : 'none';
                });
            });

            // Jump to variations button
            const jumpBtn = document.getElementById('jumpToVariationsBtn');
            if (jumpBtn) {
                jumpBtn.addEventListener('click', () => {
                    document.querySelectorAll('.coach-tab[data-tab]').forEach(t => t.classList.remove('active'));
                    document.querySelector('.coach-tab[data-tab="variations"]')?.classList.add('active');
                    document.getElementById('coachSituationTab').style.display = 'none';
                    document.getElementById('coachVariationsTab').style.display = '';
                    document.getElementById('coachRatingTab').style.display = 'none';
                });
            }

            // Bind preview on chessboard buttons
            document.querySelectorAll('.preview-var-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.varIndex, 10);
                    if (variations[idx]) {
                        this._previewVariation(variations[idx]);
                    }
                });
            });

            // Bind play out vs bot buttons
            document.querySelectorAll('.play-var-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.varIndex, 10);
                    if (variations[idx]) {
                        this._playFromVariation(variations[idx]);
                    }
                });
            });

            // Draw arrows automatically for bad moves
            if (isBad && hasBest) {
                this._drawCoachingArrows(md, c);

                const toggleBtn = document.getElementById('toggleArrowsBtn');
                if (toggleBtn) {
                    let arrowsVisible = true;
                    toggleBtn.addEventListener('click', () => {
                        arrowsVisible = !arrowsVisible;
                        if (arrowsVisible) {
                            this._drawCoachingArrows(md, c);
                            toggleBtn.classList.add('active');
                            toggleBtn.innerHTML = '<span class="arrow-toggle-icon">🏹</span> Arrows Shown';
                        } else {
                            this._clearArrows();
                            toggleBtn.classList.remove('active');
                            toggleBtn.innerHTML = '<span class="arrow-toggle-icon">🏹</span> Show Arrows';
                        }
                    });
                }
            } else {
                this._clearArrows();
            }
            window.learning?.presentCoaching(md);
        }

        /* ══════════════════════════════════════════════════
           Bot Move Analysis Display
           Shows what the bot did, why, threats, and defense tips
           ══════════════════════════════════════════════════ */
        _showBotCoaching(analysis, md) {
            if (window.learning && !window.learning.detailedCoaching()) { this._clearArrows(); window.learning.showGameCard(); return; }
            const a = analysis;
            const dl = a.dangerLevel;
            // Keep the last player lesson alive when the bot replies, including its controls.
            const index = this.moveData.indexOf(md);
            const previous = index > 0 ? this.moveData[index - 1] : null;
            const lesson = document.createElement('section');
            lesson.className = 'previous-move-lesson';
            if (previous?.coaching) {
                this._assemblingLesson = true;
                try { this._showCoaching(previous.coaching, previous); }
                finally { this._assemblingLesson = false; }
                lesson.append(...document.getElementById('coachContent').childNodes);
            }

            // Draw arrow showing bot's move
            this._clearArrows();
            const from = typeof md === 'object' && md.from ? md.from : null;
            const to = typeof md === 'object' && md.to ? md.to : null;
            if (from && to) {
                this._drawArrow(from, to, dl.color, {
                    id: 'bot-move', label: md.san || '', opacity: 0.8, width: 14
                });
            }

            // Build threats HTML
            const threatsHtml = a.threatsCreated.map(t => `
                <div class="bot-threat-item ${t.type}">
                    <span class="bot-threat-icon">${t.icon}</span>
                    <div class="bot-threat-content">
                        <div class="bot-threat-target">
                            <strong>${t.piece}</strong>
                            ${t.square !== '-' && t.square !== 'multiple' && t.square !== 'in check' ? `<span class="bot-threat-square">${t.square.toUpperCase()}</span>` : ''}
                        </div>
                        <div class="bot-threat-desc">${t.desc}</div>
                    </div>
                </div>
            `).join('');

            // Build reasoning HTML
            const reasonsHtml = a.whyChosen.map(r => `
                <div class="bot-reason-item">
                    <span class="bot-reason-bullet">▸</span>
                    <div>${r}</div>
                </div>
            `).join('');

            // Build future plans HTML
            let plansHtml = '';
            if (a.futurePlans.length > 0) {
                plansHtml = a.futurePlans.map(p => {
                    if (p.steps && p.steps.length > 0) {
                        const stepsHtml = p.steps.map(s => `
                            <span class="bot-plan-chip ${s.isBot ? 'bot-chip' : 'player-chip'}">
                                ${s.isBot ? '🤖' : '👤'} ${s.san}
                            </span>
                        `).join('');
                        return `
                            <div class="bot-plan-card">
                                <div class="bot-plan-title">🔮 ${p.title}</div>
                                <div class="bot-plan-chips">${stepsHtml}</div>
                                ${p.eval ? `<span class="bot-plan-eval">Eval: ${p.eval > 0 ? '+' : ''}${p.eval}</span>` : ''}
                            </div>
                        `;
                    } else if (p.note) {
                        return `
                            <div class="bot-plan-card">
                                <div class="bot-plan-title">📌 ${p.title}</div>
                                <div class="bot-plan-note">${p.note}</div>
                            </div>
                        `;
                    }
                    return '';
                }).join('');
            }

            // Build defensive advice HTML
            const adviceHtml = a.defensiveAdvice.map(adv => {
                const priorityClass = adv.priority === 'urgent' ? 'urgent' : adv.priority === 'high' ? 'high' : adv.priority === 'medium' ? 'medium' : adv.priority === 'opportunity' ? 'opportunity' : 'tip';
                return `
                    <div class="bot-advice-item ${priorityClass}">
                        <span class="bot-advice-icon">${adv.icon}</span>
                        <div class="bot-advice-text">${adv.text}</div>
                    </div>
                `;
            }).join('');

            // Danger meter bar segments
            const dangerPct = Math.min(100, (dl.level / 5) * 100);

            document.getElementById('coachContent').innerHTML = `
                <div class="coaching-card bot-analysis animate-in" style="--bot-accent:${dl.color}">
                    ${a.phase ? `<div class="phase-badge phase-bot">${a.phase}</div>` : ''}

                    <!-- Danger Level Banner -->
                    <div class="bot-danger-banner" style="border-color:${dl.color}">
                        <div class="bot-danger-header">
                            <span class="bot-danger-icon">${dl.icon}</span>
                            <div>
                                <div class="bot-danger-label" style="color:${dl.color}">${dl.label}</div>
                                <div class="bot-danger-desc">${dl.desc}</div>
                            </div>
                        </div>
                        <div class="bot-danger-meter">
                            <div class="bot-danger-meter-fill" style="width:${dangerPct}%;background:${dl.color}"></div>
                        </div>
                    </div>

                    <div class="coaching-title bot-title">🤖 Bot's Move Analysis</div>
                    <div class="coaching-move">Bot played: <strong>${md.san}</strong></div>
                    <div class="coaching-message bot-what">${a.whatItDoes}</div>

                    <!-- Tabbed Content -->
                    <div class="coach-tabs bot-tabs">
                        <button class="coach-tab active" data-bot-tab="threats">⚔️ Threats Radar</button>
                        <button class="coach-tab" data-bot-tab="thinking">🧠 Bot's Thinking</button>
                        <button class="coach-tab" data-bot-tab="defense">🛡️ Your Defense</button>
                    </div>

                    <!-- TAB 1: Threats -->
                    <div class="coach-tab-content bot-tab-panel" id="botThreatsTab">
                        <div class="bot-threats-header">
                            <span>⚔️</span>
                            <span>Active Threats & Attacking Chances</span>
                        </div>
                        <div class="bot-threats-list">${threatsHtml}</div>
                    </div>

                    <!-- TAB 2: Bot's Thinking -->
                    <div class="coach-tab-content bot-tab-panel" id="botThinkingTab" style="display:none">
                        <div class="bot-section-title">🧠 Why the Bot Chose This Move</div>
                        <div class="bot-reasons-list">${reasonsHtml}</div>
                        ${plansHtml ? `
                            <div class="bot-section-title" style="margin-top:12px">🔮 Bot's Likely Next Plans</div>
                            <div class="bot-plans-list">${plansHtml}</div>
                        ` : ''}
                    </div>

                    <!-- TAB 3: Defense -->
                    <div class="coach-tab-content bot-tab-panel" id="botDefenseTab" style="display:none">
                        <div class="bot-section-title">🛡️ How to Respond</div>
                        <div class="bot-advice-list">${adviceHtml}</div>
                    </div>
                </div>`;

            // Tab switching for bot tabs
            document.querySelectorAll('[data-bot-tab]').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('[data-bot-tab]').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    const which = tab.dataset.botTab;
                    document.getElementById('botThreatsTab').style.display = which === 'threats' ? '' : 'none';
                    document.getElementById('botThinkingTab').style.display = which === 'thinking' ? '' : 'none';
                    document.getElementById('botDefenseTab').style.display = which === 'defense' ? '' : 'none';
                });
            });
            const content = document.getElementById('coachContent');
            this._appendEngineLines(content, md.fenAfter, md.engineLines || []);
            if (lesson.childNodes.length) content.append(lesson);
            window.learning?.presentCoaching(md);
        }

        _appendEngineLines(container, fen, lines) {
            if (!fen || !lines.length) return;
            const section = document.createElement('section');
            section.className = 'simple-coach live-engine-lines';
            const side = new Chess(fen).turn() === 'w' ? 'White' : 'Black';
            section.innerHTML = `<h3>Engine lines · ${side} to move</h3><p>Evaluations from White’s perspective. Explore a line on the board; moves are predictions, not forced replies.</p>`;
            lines.forEach((line, index) => {
                const game = new Chess(fen);
                const positions = [fen], moves = [], notation = [];
                for (const uci of line.pv.slice(0, 10)) {
                    const number = game.fen().split(' ')[5];
                    const color = game.turn();
                    const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
                    if (!move) break;
                    notation.push(`${color === 'w' ? number + '.' : moves.length === 0 ? number + '...' : ''}${move.san}`);
                    positions.push(game.fen());
                    moves.push({ ...move, note: `${move.color === 'w' ? 'White' : 'Black'} plays ${move.san}${move.captured ? ', capturing on ' + move.to : ''}.`, fen: game.fen() });
                }
                if (!moves.length) return;
                const sign = new Chess(fen).turn() === 'w' ? 1 : -1;
                const evaluation = this.coach.formatEval((line.score || 0) * sign, line.mate == null ? null : line.mate * sign);
                const review = document.createElement('details');
                review.className = 'move-review';
                const summary = document.createElement('summary');
                summary.textContent = `Line ${index + 1}: ${moves[0].san} · ${evaluation}`;
                review.append(summary);
                const text = document.createElement('p');
                text.textContent = `${notation.join(' ')} (depth ${line.depth})`;
                review.append(text);
                const button = document.createElement('button');
                button.className = 'engine-line btn btn-secondary';
                button.textContent = 'Explore this line';
                button.addEventListener('click', () => this._previewVariation({ title: `Candidate ${index + 1}: ${moves[0].san}`, whyBetter: `Engine continuation, evaluation ${evaluation} for White. Opponent replies are included.`, positions, moves }));
                review.append(button);
                section.append(review);
            });
            container.prepend(section);
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
            const currentMd = this.moveData[this.viewIndex - 1];
            if (currentMd && currentMd.coaching && ['inaccuracy','mistake','blunder'].includes(currentMd.classification)) {
                this._drawCoachingArrows(currentMd, currentMd.coaching);
            }
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

        /** Draw the "your move" arrow (red/orange) and the "best move" arrow (green) */
        _drawCoachingArrows(md, coaching) {
            this._clearArrows();
            const cl = coaching.classification;
            if (!['inaccuracy','mistake','blunder'].includes(cl)) return;

            // Arrow for the player's move (bad) — red/orange
            const badColor = cl === 'blunder' ? '#ca3431' : cl === 'mistake' ? '#e68427' : '#e6a827';
            const badLabel = cl === 'blunder' ? 'Blunder' : cl === 'mistake' ? 'Mistake' : 'Inaccuracy';
            this._drawArrow(md.from, md.to, badColor, {
                id: 'player-move', label: badLabel, opacity: 0.7, width: 13
            });

            // Arrow for the best move — green
            if (md.bestMove && md.bestMove.length >= 4) {
                const bestFrom = md.bestMove.substring(0,2);
                const bestTo = md.bestMove.substring(2,4);
                this._drawArrow(bestFrom, bestTo, '#96bc4b', {
                    id: 'best-move', label: 'Best', opacity: 0.85, width: 16
                });
            }
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
            if (window.learning) return window.learning.gameHint();
            if (this.thinking || this.over || !this._atEnd()) return;
            ChessSounds.hint();
            if (this.game.turn() !== this.playerColor) return;
            this._status('Calculating best move…');
            const ev = this.cachedEval || await this.analysisEngine.evaluate(this.game.fen(), 10, 400);
            if (!ev.bestMove) return;

            const from = ev.bestMove.substring(0,2), to = ev.bestMove.substring(2,4);
            this._clearArrows();
            this._drawArrow(from, to, '#96bc4b', { id: 'hint', label: 'Hint', opacity: 0.85, width: 16 });

            let san = ev.bestMove;
            try { const t = this.game.move({from,to,promotion:ev.bestMove.length>4?ev.bestMove[4]:undefined}); if(t){san=t.san;this.game.undo();} } catch(_){}

            // Analyze the hint move for a richer explanation
            let hintExplanation = '';
            try {
                const hintEffects = this.coach.analyzeBestMove(this.game.fen(), ev.bestMove);
                if (hintEffects) {
                    const reasons = [];
                    if (hintEffects.isCapture) reasons.push(`captures the ${hintEffects.capturedName} on ${hintEffects.to}`);
                    if (hintEffects.isCheck) reasons.push('gives check, gaining tempo');
                    if (hintEffects.isForking) {
                        const targets = hintEffects.forkTargets.map(t => t.name).join(' and ');
                        reasons.push(`creates a fork attacking the ${targets}`);
                    }
                    if (hintEffects.isDevelopment) reasons.push('develops a piece toward a better square');
                    if (hintEffects.isCastle) reasons.push('castles for king safety');
                    if (hintEffects.centerCtrl.length > 0) reasons.push(`controls key central square${hintEffects.centerCtrl.length > 1 ? 's' : ''} ${hintEffects.centerCtrl.join(', ')}`);
                    if (hintEffects.threats.length > 0 && !hintEffects.isForking) {
                        const top = hintEffects.threats.sort((a,b) => b.value - a.value)[0];
                        if (top.value >= 3) reasons.push(`threatens the ${top.name} on ${top.square}`);
                    }
                    if (reasons.length > 0) hintExplanation = `<br><strong>Why?</strong> This move ${reasons.join(', ')}.`;
                }
            } catch(_) {}

            document.getElementById('coachContent').innerHTML = `
                <div class="coaching-card hint animate-in">
                    <div class="coaching-title" style="color:#96bc4b">💡 Hint</div>
                    <div class="coaching-message">The best move here is <strong>${san}</strong>.
                        ${ev.mate ? `There's a forced checkmate in ${Math.abs(ev.mate)} moves!` :
                          ev.score > 200 ? 'This maintains your strong advantage.' :
                          ev.score > 50  ? 'This keeps you in a comfortable position.' :
                          ev.score > -50 ? 'This is the most solid continuation.' :
                                           'This gives you the best fighting chances.'}
                        ${hintExplanation}
                    </div>
                    <div class="coaching-eval"><div class="eval-badge">Eval: ${this.coach.formatEval(ev.score,ev.mate)}</div></div>
                </div>`;
            this._status('Your turn');
            setTimeout(() => this._clearArrows(), 5000);
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

            // Restore coaching panel for the restored position
            if (this.viewIndex > 0) {
                this._showCoachingForView();
            } else {
                document.getElementById('coachContent').innerHTML = `
                    <div class="coach-welcome"><div class="welcome-icon">♟️</div>
                    <h3>Move Undone</h3>
                    <p>Back to the starting position. You are playing as ${turnColorName}. Make your move!</p></div>`;
            }

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

            document.getElementById('coachContent').innerHTML = `
                <div class="coach-welcome"><div class="welcome-icon">♟️</div>
                <h3>New Game Started!</h3>
                <p>You're playing as ${col}. Make your move and I'll analyze it!</p></div>`;

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
            window.learning?.showGameCard();
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

            // Move quality counts
            const counts = {};
            this.moveData.filter(m=>m.isPlayer).forEach(m => { if(m.classification) counts[m.classification]=(counts[m.classification]||0)+1; });
            const classes = ['brilliant','best','great','good','inaccuracy','mistake','blunder'];
            let summary = '<div class="summary-grid">';
            classes.forEach(c => { if(counts[c]) summary += `<div class="summary-item"><span class="summary-dot" style="background:${this.coach.color(c)}"></span><span>${c[0].toUpperCase()+c.slice(1)}</span><span class="summary-count">${counts[c]}</span></div>`; });
            summary += '</div>';

            const saved = window.learning?.store.data.moments.length || 0;
            const ratingHtml = `<div class="simple-game-review"><h3>Your next learning moment</h3><p>${saved} positions are saved in Puzzles. Try them before revealing a hint, then revisit them on a later day.</p><button class="btn btn-accent" id="gameOverPracticeBtn">Practice your game moments</button></div>`;

            // Weakness analysis
            const weakness = this.coach.analyzeWeaknesses(this.moveData);
            let weaknessHtml = '';
            if (weakness.phaseStats) {
                const phases = [
                    { key: 'opening', label: '🏁 Opening', color: '#5c8bb0' },
                    { key: 'midgame', label: '⚔️ Midgame', color: '#e6a827' },
                    { key: 'endgame', label: '👑 Endgame', color: '#96bc4b' }
                ];
                weaknessHtml += '<div class="weakness-section"><h4>📊 Phase Performance</h4><div class="phase-bars">';
                phases.forEach(p => {
                    const stats = weakness.phaseStats[p.key];
                    if (!stats) return;
                    const isWeakest = weakness.weakest === p.key;
                    weaknessHtml += `
                        <div class="phase-bar-row ${isWeakest ? 'weakest' : ''}">
                            <span class="phase-bar-label">${p.label}</span>
                            <div class="phase-bar-track">
                                <div class="phase-bar-fill" style="width:${stats.accuracy}%;background:${isWeakest ? '#ca3431' : p.color}"></div>
                            </div>
                            <span class="phase-bar-pct">${stats.accuracy}%</span>
                        </div>`;
                });
                weaknessHtml += '</div></div>';

                // Improvement suggestions
                if (weakness.suggestions.length > 0) {
                    weaknessHtml += '<div class="improvement-section"><h4>🎯 Areas to Improve</h4>';
                    weakness.suggestions.forEach(s => {
                        weaknessHtml += `<div class="improvement-tip"><span class="improvement-icon">${s.icon}</span><span>${s.text}</span></div>`;
                    });
                    weaknessHtml += '</div>';
                }
            }

            // Prominent checkmating move showcase card
            let checkmateShowcaseHtml = '';
            if (isCheckmate && lastMove) {
                const winnerColor = this.game.turn() === 'w' ? 'b' : 'w';
                const won = winnerColor === this.playerColor;
                const explanation = this._getCheckmateExplanation(lastMove, won);
                checkmateShowcaseHtml = `
                    <div class="checkmate-showcase-card ${won ? 'win' : 'loss'}">
                        <div class="checkmate-showcase-header">
                            <span class="checkmate-showcase-badge">${won ? '🏆 Decisive Checkmate' : '💀 Delivered Checkmate'}</span>
                            <span class="checkmate-showcase-move-san">${lastMove.san}</span>
                        </div>
                        <div class="checkmate-showcase-body">
                            ${explanation}
                        </div>
                    </div>
                `;
            }

            document.getElementById('coachContent').innerHTML = `
                <div class="coaching-card game-over animate-in">
                    <div class="coaching-title">${title}</div>
                    <div class="coaching-message">${msg}</div>
                    ${checkmateShowcaseHtml}
                    ${ratingHtml}
                    <div class="game-summary"><h4>Your Move Summary</h4>${summary}</div>
                    ${weaknessHtml}
                    <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap">
                        <button class="btn btn-secondary" id="gameOverUndoBtn">↩ Undo Move</button>
                        <button class="btn btn-primary" id="gameOverNewBtn">New Game</button>
                    </div>
                </div>`;

            document.getElementById('gameOverPracticeBtn')?.addEventListener('click', () => { window.learning.filter = 'mistakes'; window.trainer._switchMode('puzzles'); });
            document.getElementById('gameOverNewBtn').addEventListener('click', () => this._showModal());
            const gameOverUndoBtn = document.getElementById('gameOverUndoBtn');
            if (gameOverUndoBtn) {
                gameOverUndoBtn.addEventListener('click', () => this._undo());
            }

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
            if (this.app.thinking && !['play', 'coach', 'puzzles', 'deep-analysis', 'patterns'].includes(mode)) return;
            if (["play", "coach"].includes(this.currentMode) && window.studyBoard) window.studyBoard.sourceMode=this.currentMode;
            this.currentMode = mode;
            ChessSounds.tabSwitch();

            // Cancel any active drag in analysis, training, or play mode and remove stray ghosts
            if (typeof this._cancelAnalysisDrag === 'function') this._cancelAnalysisDrag();
            if (typeof this._cancelTrainingDrag === 'function') this._cancelTrainingDrag();
            if (this.app && typeof this.app._cancelDrag === 'function') this.app._cancelDrag();
            document.querySelectorAll('.drag-piece').forEach(el => el.remove());

            // Update tabs
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');

            // Show/hide sections
            document.getElementById('playMode').style.display = mode === 'coach' ? '' : 'none';
            const deepEl = document.getElementById('deepAnalysisMode');
            if (deepEl) deepEl.style.display = 'none';
            document.getElementById('trainingHub').style.display = ['openings','midgame','endgame'].includes(mode) ? '' : 'none';
            document.getElementById('trainingSession').style.display = 'none';

            window.learning?.onMode(mode);
            window.patterns?.onMode(mode);
            window.moveLessons?.cancel();
            if (this.app.activeVariation) this.app._exitVariationPreview();
            window.freePlay?.onMode(mode);
            window.studyBoard?.onMode(mode);
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

        /* ══════════════════════════════════════════════════════════
           DEEP ANALYSIS & MIDGAME STRATEGY MODE CONTROLLER
           Teaches WHAT to do when every piece has been moved,
           WHY a square is the best move, and WHY a move is a blunder.
           ══════════════════════════════════════════════════════════ */
        _initDeepAnalysisMode() {
            if (!this.analysisData) {
                this.analysisData = ChessTrainer.getPostOpening('italian-mid');
                this.analysisGame = new Chess(this.analysisData.fen);
                this.analysisTab = 'plans';
                this.analysisFlipped = this.analysisData.turn === 'b';
                this.analysisHistory = [];
                this.analysisLastMoveVerdict = null;
            }
            if (this.analysisBotEnabled === undefined) {
                this.analysisBotEnabled = true;
            }
            this.analysisLastBotMove = null;
            this.analysisNextVariations = [];
            this.analysisNextSituation = null;
            this._analysisBotThinking = false;

            this._buildAnalysisBoard();
            this._bindAnalysisControls();
            this._renderAnalysisBoard();
            this._renderAnalysisPanel();
            this._evalAnalysisPosition();
        }

        _buildAnalysisBoard() {
            this._cancelAnalysisDrag();
            const el = document.getElementById('analysisBoard');
            if (!el) return;
            el.innerHTML = '';

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('board-arrows');
            svg.setAttribute('viewBox', '0 0 800 800');
            if (this._analysisArrowsVisible === false) {
                svg.style.display = 'none';
            }
            el.appendChild(svg);
            this._analysisArrowSvg = svg;

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const ar = this.analysisFlipped ? 7 - r : r;
                    const ac = this.analysisFlipped ? 7 - c : c;
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

            this._bindAnalysisBoardEvents();
        }

        _bindAnalysisBoardEvents() {
            if (this._analysisBoardEventsBound) return;
            this._analysisBoardEventsBound = true;

            const bd = document.getElementById('analysisBoard');
            if (!bd) return;

            // Click
            bd.addEventListener('click', e => {
                if (this._analysisBotThinking) return;
                const sq = e.target.closest('.square');
                if (sq) this._onAnalysisSquareClick(sq.dataset.square);
            });

            // Mouse drag
            bd.addEventListener('mousedown', e => {
                if (this._analysisBotThinking) return;
                const sq = e.target.closest('.square'); if (!sq) return;
                const name = sq.dataset.square;
                const p = this.analysisGame.get(name);
                if (p && p.color === this.analysisGame.turn()) {
                    this._startAnalysisDrag(name, e);
                }
            });

            // Touch drag
            bd.addEventListener('touchstart', e => {
                if (this._analysisBotThinking) return;
                const t = e.touches[0];
                const sq = document.elementFromPoint(t.clientX, t.clientY)?.closest('.square');
                if (!sq) return;
                const name = sq.dataset.square;
                const p = this.analysisGame.get(name);
                if (p && p.color === this.analysisGame.turn()) {
                    e.preventDefault();
                    this._startAnalysisDrag(name, { clientX: t.clientX, clientY: t.clientY });
                }
            }, { passive: false });

            // Ensure global drag listeners
            if (!this._analysisGlobalBound) {
                this._analysisGlobalBound = true;
                document.addEventListener('mousemove', e => { if (this._analysisDragState) this._moveAnalysisDrag(e); });
                document.addEventListener('mouseup',   e => { if (this._analysisDragState) this._endAnalysisDrag(e); });
                document.addEventListener('touchmove', e => {
                    if (this._analysisDragState) { e.preventDefault(); this._moveAnalysisDrag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }
                }, { passive: false });
                document.addEventListener('touchend', e => {
                    if (this._analysisDragState) { const t = e.changedTouches[0]; this._endAnalysisDrag({ clientX: t.clientX, clientY: t.clientY }); }
                });
                document.addEventListener('touchcancel', () => { if (this._analysisDragState) this._cancelAnalysisDrag(); });
                window.addEventListener('blur', () => { if (this._analysisDragState) this._cancelAnalysisDrag(); });
                window.addEventListener('scroll', () => { if (this._analysisDragState) this._cancelAnalysisDrag(); }, { passive: true });
                document.addEventListener('keydown', e => {
                    if (e.key === 'Escape' && this._analysisDragState) {
                        this._cancelAnalysisDrag();
                        this._deselectAnalysisPiece();
                    }
                });
            }
        }

        _bindAnalysisControls() {
            if (this._analysisControlsBound) return;
            this._analysisControlsBound = true;

            // Tabs
            document.querySelectorAll('#deepAnalysisMode .analysis-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('#deepAnalysisMode .analysis-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.analysisTab = tab.dataset.tab;
                    if (this.analysisTab === 'patterns') {
                        if (!this.analysisPattern) {
                            this._loadAttackPattern('greek-gift');
                            return;
                        } else {
                            const seqBar = document.getElementById('analysisSequenceBar');
                            if (seqBar) seqBar.style.display = 'flex';
                        }
                    } else if (!this.analysisSeqData || !this.analysisSeqData.isContinuation) {
                        const seqBar = document.getElementById('analysisSequenceBar');
                        if (seqBar) seqBar.style.display = 'none';
                    }
                    this._renderAnalysisPanel();
                });
            });

            // Sequence navigation buttons
            const seqStart = document.getElementById('seqStartBtn');
            if (seqStart) seqStart.addEventListener('click', () => this._stepSequenceStart());
            const seqPrev = document.getElementById('seqPrevBtn');
            if (seqPrev) seqPrev.addEventListener('click', () => this._stepSequencePrev());
            const seqNext = document.getElementById('seqNextBtn');
            if (seqNext) seqNext.addEventListener('click', () => this._stepSequenceNext());
            const seqEnd = document.getElementById('seqEndBtn');
            if (seqEnd) seqEnd.addEventListener('click', () => this._stepSequenceEnd());

            // Play vs AI from Here button
            const playVsAiBtn = document.getElementById('analysisPlayVsAiBtn');
            if (playVsAiBtn) playVsAiBtn.addEventListener('click', () => this._playVsAiFromCurrentAnalysis());

            // Preset select
            const presetSel = document.getElementById('analysisPresetSelect');
            if (presetSel) {
                presetSel.addEventListener('change', () => {
                    this._loadDeepAnalysisPreset(presetSel.value);
                });
            }

            // Load My Game button
            const importBtn = document.getElementById('analysisImportGameBtn');
            if (importBtn) {
                importBtn.addEventListener('click', () => {
                    this._importFromPlayGame();
                });
            }

            // Random Midgame button
            const randomBtn = document.getElementById('analysisRandomMidgameBtn');
            if (randomBtn) {
                randomBtn.addEventListener('click', () => {
                    this._loadRandomMidgamePosition();
                });
            }

            // Bot Move Button
            const botMoveBtn = document.getElementById('analysisBotMoveBtn');
            if (botMoveBtn) {
                botMoveBtn.addEventListener('click', () => {
                    if (!this._analysisBotThinking && !this.analysisGame.game_over()) {
                        this._executeAnalysisBotMove();
                    }
                });
            }

            // Bot Auto-Reply Toggle Button
            const botToggleBtn = document.getElementById('analysisBotToggleBtn');
            if (botToggleBtn) {
                botToggleBtn.addEventListener('click', () => {
                    this.analysisBotEnabled = !this.analysisBotEnabled;
                    botToggleBtn.classList.toggle('active', this.analysisBotEnabled);
                    botToggleBtn.innerHTML = this.analysisBotEnabled
                        ? '<span class="icon">🤖</span> Bot: ON'
                        : '<span class="icon">🤖</span> Bot: OFF';
                    ChessSounds.tabSwitch();
                });
            }

            // Reset button
            const resetBtn = document.getElementById('analysisResetBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    ChessSounds.newGame();
                    this.analysisGame = new Chess(this.analysisData.fen);
                    this.analysisSelected = null;
                    this.analysisValidMoves = [];
                    this.analysisHistory = [];
                    this.analysisLastMoveVerdict = null;
                    this.analysisLastBotMove = null;
                    this.analysisNextVariations = [];
                    this.analysisNextSituation = null;
                    this._analysisBotThinking = false;
                    this._clearAnalysisArrows();
                    this._renderAnalysisBoard();
                    this._renderAnalysisPanel();
                    this._evalAnalysisPosition();
                });
            }

            // Undo button (undos full bot+player turn if bot moved)
            const undoBtn = document.getElementById('analysisUndoBtn');
            if (undoBtn) {
                undoBtn.addEventListener('click', () => {
                    if (this.analysisGame.history().length > 0) {
                        this.analysisGame.undo();
                        if (this.analysisLastBotMove && this.analysisGame.history().length > 0) {
                            this.analysisGame.undo();
                        }
                        ChessSounds.undo();
                        this.analysisSelected = null;
                        this.analysisValidMoves = [];
                        this.analysisLastMoveVerdict = null;
                        this.analysisLastBotMove = null;
                        this.analysisNextVariations = [];
                        this.analysisNextSituation = null;
                        this._analysisBotThinking = false;
                        this._clearAnalysisArrows();
                        this._renderAnalysisBoard();
                        this._renderAnalysisPanel();
                        this._evalAnalysisPosition();

                        const sub = document.getElementById('analysisSubtitle');
                        if (sub && this.analysisData) {
                            const turnName = this.analysisGame.turn() === 'w' ? 'White' : 'Black';
                            sub.textContent = `${turnName} to move — test any move to see the coach breakdown.`;
                        }
                    }
                });
            }

            // Flip button
            const flipBtn = document.getElementById('analysisFlipBtn');
            if (flipBtn) {
                flipBtn.addEventListener('click', () => {
                    this.analysisFlipped = !this.analysisFlipped;
                    ChessSounds.tabSwitch();
                    this._buildAnalysisBoard();
                    this._renderAnalysisBoard();
                });
            }

            // Toggle Arrows button
            const toggleArrBtn = document.getElementById('analysisToggleArrowsBtn');
            if (toggleArrBtn) {
                toggleArrBtn.addEventListener('click', () => {
                    this._analysisArrowsVisible = !this._analysisArrowsVisible;
                    toggleArrBtn.classList.toggle('active', this._analysisArrowsVisible);
                    if (this._analysisArrowSvg) {
                        this._analysisArrowSvg.style.display = this._analysisArrowsVisible ? '' : 'none';
                    }
                });
            }
        }

        _loadDeepAnalysisPreset(id) {
            this._cancelAnalysisDrag();
            const data = ChessTrainer.getPostOpening(id);
            if (!data) return;
            ChessSounds.tabSwitch();
            this.analysisData = data;
            this.analysisGame = new Chess(data.fen);
            this.analysisSelected = null;
            this.analysisValidMoves = [];
            this.analysisHistory = [];
            this.analysisLastMoveVerdict = null;
            this.analysisLastBotMove = null;
            this.analysisNextVariations = [];
            this.analysisNextSituation = null;
            this._analysisBotThinking = false;
            this.analysisFlipped = data.turn === 'b';

            document.getElementById('analysisTitle').textContent = data.title;
            document.getElementById('analysisSubtitle').textContent = data.description;
            const sel = document.getElementById('analysisPresetSelect');
            if (sel) sel.value = id;

            this._clearAnalysisArrows();
            this._buildAnalysisBoard();
            this._renderAnalysisBoard();
            this._renderAnalysisPanel();
            this._evalAnalysisPosition();
        }

        _importFromPlayGame() {
            if (!this.app || !this.app.game) return;
            this._cancelAnalysisDrag();
            ChessSounds.newGame();
            const fen = this.app.game.fen();
            const moveCount = this.app.moveData ? this.app.moveData.length : 0;
            const turn = this.app.game.turn();

            this.analysisData = {
                id: 'custom-game',
                title: "Your Game Position",
                icon: "⚔️",
                opening: "Imported from Play & Learn",
                fen: fen,
                turn: turn,
                description: `Position after ${moveCount} moves in your game. ${turn === 'w' ? 'White' : 'Black'} to move. Explore all candidate moves and understand what to do!`,
                plans: [
                    {
                        title: "Find the Optimal Pawn Break",
                        badge: "primary",
                        icon: "⚔️",
                        explanation: "Check the central pawn levers (c4/c5, d4/d5, e4/e5, f4/f5). The right pawn break opens lines in favor of your better-developed pieces.",
                        steps: [
                            "Scan for defended pawn breaks that challenge opponent's center",
                            "Ensure your rooks are placed behind the files that will open",
                            "Never push pawns if your king lacks safety"
                        ]
                    },
                    {
                        title: "Improve Your Least Active Piece",
                        badge: "alternative",
                        icon: "♞",
                        explanation: "Grandmaster Rule: Locate your worst-placed minor piece (knight or bishop) and maneuver it to an outpost or open diagonal.",
                        steps: [
                            "Look for outposts: squares that cannot be attacked by enemy pawns",
                            "Knights excel on 5th and 6th ranks in enemy territory",
                            "Bishops need long unobstructed diagonals"
                        ]
                    }
                ],
                diagnosis: {
                    structure: "Live Game Position",
                    pawnBreaks: "Analyze central pawn levers",
                    openFiles: "Check c-, d-, and e-files",
                    bestOutposts: "Look for central hole squares",
                    kingSafety: "Check pawn shields"
                },
                checklistTips: [
                    "Examine every candidate move before deciding",
                    "Ask: 'What does my opponent threaten if I make this move?'",
                    "Always look for tactics first (checks, captures, attacks), then strategic plans"
                ]
            };

            this.analysisGame = new Chess(fen);
            this.analysisSelected = null;
            this.analysisValidMoves = [];
            this.analysisHistory = [];
            this.analysisLastMoveVerdict = null;
            this.analysisLastBotMove = null;
            this.analysisNextVariations = [];
            this.analysisNextSituation = null;
            this._analysisBotThinking = false;
            this.analysisFlipped = turn === 'b';

            document.getElementById('analysisTitle').textContent = "Your Live Game Position";
            document.getElementById('analysisSubtitle').textContent = this.analysisData.description;

            this._clearAnalysisArrows();
            this._buildAnalysisBoard();
            this._renderAnalysisBoard();
            this._renderAnalysisPanel();
            this._evalAnalysisPosition();
        }

        _loadRandomMidgamePosition() {
            const list = ChessTrainer.getPostOpeningList();
            if (!list || list.length === 0) return;
            const pick = list[Math.floor(Math.random() * list.length)];
            this._loadDeepAnalysisPreset(pick.id);
        }

        _onAnalysisSquareClick(name) {
            if (this._analysisBotThinking) return;
            if (this.analysisSelected) {
                const vm = this.analysisValidMoves.find(m => m.to === name);
                if (vm) {
                    this._executeAnalysisMove(vm);
                    return;
                }
                const p = this.analysisGame.get(name);
                if (p && p.color === this.analysisGame.turn()) {
                    this._selectAnalysisPiece(name);
                    return;
                }
                this._deselectAnalysisPiece();
                return;
            }

            const p = this.analysisGame.get(name);
            if (p && p.color === this.analysisGame.turn()) {
                this._selectAnalysisPiece(name);
            }
        }

        _selectAnalysisPiece(name) {
            this.analysisSelected = name;
            ChessSounds.select();
            const all = this.analysisGame.moves({ square: name, verbose: true });
            const seen = new Set();
            this.analysisValidMoves = all.filter(m => {
                const key = m.from + m.to;
                if (m.promotion && m.promotion !== 'q') return false;
                if (seen.has(key)) return false; seen.add(key); return true;
            });

            this._renderAnalysisBoard();

            // If on inspector tab, update radar immediately
            if (this.analysisTab === 'inspector') {
                this._renderPieceRadarTab();
            }
        }

        _deselectAnalysisPiece() {
            this.analysisSelected = null;
            this.analysisValidMoves = [];
            this._renderAnalysisBoard();
            if (this.analysisTab === 'inspector') {
                this._renderPieceRadarTab();
            }
        }

        _cancelAnalysisDrag() {
            if (this._analysisDragState && this._analysisDragState.el) {
                this._analysisDragState.el.remove();
            }
            document.querySelectorAll('.drag-piece').forEach(el => el.remove());
            this._analysisDragState = null;
        }

        _startAnalysisDrag(name, e) {
            if (this._analysisBotThinking) return;
            this._cancelAnalysisDrag();
            this._selectAnalysisPiece(name);
            const p = this.analysisGame.get(name);
            if (!p) return;
            const ghost = document.createElement('img');
            ghost.src = IMG[p.color + p.type];
            ghost.className = 'drag-piece';
            ghost.draggable = false;
            document.body.appendChild(ghost);
            this._analysisDragState = { from: name, el: ghost };
            this._moveAnalysisDrag(e);
        }

        _moveAnalysisDrag(e) {
            if (!this._analysisDragState || !this._analysisDragState.el) return;
            const g = this._analysisDragState.el;
            g.style.left = (e.clientX - 35) + 'px';
            g.style.top = (e.clientY - 35) + 'px';
        }

        _endAnalysisDrag(e) {
            const state = this._analysisDragState;
            this._cancelAnalysisDrag();
            if (!state || !e || e.clientX == null || e.clientY == null) return;
            const below = document.elementFromPoint(e.clientX, e.clientY);
            const sq = below ? below.closest('.square') : null;
            if (sq) {
                const vm = this.analysisValidMoves.find(m => m.to === sq.dataset.square);
                if (vm) {
                    this._executeAnalysisMove(vm);
                    return;
                }
            }
        }

        async _executeAnalysisMove(moveObj) {
            if (this._analysisBotThinking) return;
            const fenBefore = this.analysisGame.fen();

            // Fast Stockfish evaluation before move
            let evalBefore = { bestMove: null, score: 0 };
            try {
                if (this.app && this.app.analysisEngine) {
                    evalBefore = await this.app.analysisEngine.evaluate(fenBefore, 10, 400);
                }
            } catch (_) {}

            const move = this.analysisGame.move({
                from: moveObj.from,
                to: moveObj.to,
                promotion: moveObj.promotion || 'q'
            });
            if (!move) {
                ChessSounds.illegal();
                this._deselectAnalysisPiece();
                return;
            }

            ChessSounds.playMoveSound(move);
            this._deselectAnalysisPiece();
            this._clearAnalysisArrows();

            // Fast Stockfish evaluation after move
            let evalAfter = { bestMove: null, score: 0 };
            try {
                if (this.app && this.app.analysisEngine) {
                    evalAfter = await this.app.analysisEngine.evaluate(this.analysisGame.fen(), 10, 400);
                }
            } catch (_) {}

            const cpBefore = evalBefore.mate != null ? (evalBefore.mate > 0 ? 10000 : -10000) : (evalBefore.score || 0);
            const cpAfterRaw = evalAfter.mate != null ? (evalAfter.mate > 0 ? 10000 : -10000) : (evalAfter.score || 0);
            const cpLoss = Math.max(0, cpBefore + cpAfterRaw);

            // Classification
            let classification = 'good';
            if (cpLoss <= 12) classification = 'best';
            else if (cpLoss <= 45) classification = 'good';
            else if (cpLoss <= 100) classification = 'inaccuracy';
            else if (cpLoss <= 220) classification = 'mistake';
            else classification = 'blunder';

            // Generate pedagogical explanation
            const playerUci = move.from + move.to;
            const isBest = evalBefore.bestMove ? playerUci.startsWith(evalBefore.bestMove.substring(0, 4)) : false;
            if (isBest) classification = 'best';

            // Extract what happens tactically
            let whyBlunder = '';
            let bestMoveExplanation = '';
            let futurePlans = [];

            if (move.san.includes('#')) {
                whyBlunder = `🎉 Decisive Checkmate! You delivered checkmate with <strong>${move.san}</strong> (${move.from.toUpperCase()} &rarr; ${move.to.toUpperCase()}). The opposing king has no escape squares!`;
            } else if (classification === 'blunder' || classification === 'mistake') {
                if (evalAfter.bestMove) {
                    const oppFrom = evalAfter.bestMove.substring(0, 2);
                    const oppTo = evalAfter.bestMove.substring(2, 4);
                    whyBlunder = `Opponent's punishing counter is <strong>${evalAfter.bestMove}</strong> (${oppFrom.toUpperCase()} &rarr; ${oppTo.toUpperCase()}). It seizes an immediate tactical advantage or attacks an undefended square created by your move.`;
                } else {
                    whyBlunder = `This move weakens your key defensive squares and hands the initiative to the opponent.`;
                }
            } else {
                whyBlunder = `This move improves piece activity, maintains harmonious coordination, and clamps down on key central squares.`;
            }

            if (evalBefore.bestMove) {
                const bFrom = evalBefore.bestMove.substring(0, 2);
                const bTo = evalBefore.bestMove.substring(2, 4);
                bestMoveExplanation = `The engine recommends <strong>${evalBefore.bestMove}</strong> (${bFrom.toUpperCase()} &rarr; ${bTo.toUpperCase()}) because it exerts stronger central control, keeps pawn structure solid, and develops with tempo.`;
                this._drawAnalysisArrow(bFrom, bTo, '#96bc4b', 'Best');
            }

            // Arrow for user's move
            const moveColor = classification === 'best' ? '#96bc4b' : classification === 'good' ? '#5c8bb0' : classification === 'inaccuracy' ? '#e6a827' : '#ca3431';
            this._drawAnalysisArrow(move.from, move.to, moveColor, move.san);

            futurePlans = [
                `Coordinate rooks along the central open files`,
                `Target opponent's undefended or backward pawns`,
                `Improve minor pieces toward central outposts`
            ];

            this.analysisLastMoveVerdict = {
                move,
                classification,
                cpLoss,
                bestMove: evalBefore.bestMove,
                bestPv: evalBefore.pv || [],
                punishPv: evalAfter.pv || [],
                fenBefore: fenBefore,
                fenAfter: this.analysisGame.fen(),
                whyBlunder,
                bestMoveExplanation,
                futurePlans
            };

            // Reset previous bot response and next variations
            this.analysisLastBotMove = null;
            this.analysisNextVariations = [];
            this.analysisNextSituation = null;

            // Switch to move explainer tab so the user sees the explanation
            this.analysisTab = 'move-explainer';
            document.querySelectorAll('#deepAnalysisMode .analysis-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === 'move-explainer');
            });

            this._renderAnalysisBoard();
            this._renderAnalysisPanel();

            // Update eval bar
            const turn = this.analysisGame.turn();
            const ws = turn === 'w' ? (evalAfter.score || 0) : -(evalAfter.score || 0);
            this._updateAnalysisEvalBar(ws, evalAfter.mate);

            // Auto-reply bot move
            if (this.analysisBotEnabled && !this.analysisGame.game_over()) {
                setTimeout(() => {
                    this._executeAnalysisBotMove();
                }, 750);
            }
        }

        async _executeAnalysisBotMove() {
            if (!this.analysisGame || this.analysisGame.game_over()) return;
            if (this._analysisBotThinking) return;
            this._analysisBotThinking = true;

            const sub = document.getElementById('analysisSubtitle');
            if (sub) {
                sub.innerHTML = `<span style="color:var(--accent);font-weight:700">🤖 Bot is calculating its response...</span>`;
            }

            const fen = this.analysisGame.fen();
            const rating = this.app ? this.app.botRating : 1500;
            const p = ratingToParams(rating);

            let res = null;
            try {
                if (this.app && this.app.botEngine) {
                    await this.app.botEngine.setOptions({ 'Skill Level': p.skill });
                    res = await this.app.botEngine.evaluate(fen, Math.min(p.depth, 10), 450);
                } else if (this.app && this.app.analysisEngine) {
                    res = await this.app.analysisEngine.evaluate(fen, 10, 450);
                }
            } catch (_) {}

            if (!res || !res.bestMove || res.bestMove === '(none)') {
                const legal = this.analysisGame.moves({ verbose: true });
                if (legal.length > 0) {
                    const rand = legal[Math.floor(Math.random() * legal.length)];
                    res = { bestMove: rand.from + rand.to + (rand.promotion || '') };
                }
            }

            if (!res || !res.bestMove) {
                this._analysisBotThinking = false;
                if (sub && this.analysisData) sub.textContent = this.analysisData.description;
                return;
            }

            const from = res.bestMove.substring(0, 2);
            const to = res.bestMove.substring(2, 4);
            const promotion = res.bestMove.length > 4 ? res.bestMove[4] : undefined;

            const botMove = this.analysisGame.move({ from, to, promotion });
            this._analysisBotThinking = false;

            if (!botMove) {
                if (sub && this.analysisData) sub.textContent = this.analysisData.description;
                return;
            }

            ChessSounds.playMoveSound(botMove);

            // Pedagogical reasoning for bot's move
            let botExplanation = '';
            if (botMove.captured) {
                const capturedPiece = PIECE_NAME[botMove.captured] || 'piece';
                botExplanation = `Bot captures your ${capturedPiece} on ${to.toUpperCase()} to win material and challenge your central control.`;
            } else if (botMove.san.includes('#')) {
                botExplanation = `Bot delivers checkmate! The king has no escape squares.`;
            } else if (botMove.san.includes('+')) {
                botExplanation = `Bot checks your king with tempo! You must immediately respond to the check.`;
            } else if (botMove.san.startsWith('O-O')) {
                botExplanation = `Bot castles into safety, shielding its king behind pawns and connecting its rooks.`;
            } else if (botMove.piece === 'p' && (to === 'd5' || to === 'd4' || to === 'e5' || to === 'e4' || to === 'c5' || to === 'c4')) {
                botExplanation = `Bot strikes in the center with <strong>${botMove.san}</strong>, challenging your pawn structure and opening lines.`;
            } else if (botMove.piece === 'n') {
                botExplanation = `Bot develops knight to <strong>${to.toUpperCase()}</strong> to contest key central outposts and add attacking pressure.`;
            } else if (botMove.piece === 'b') {
                botExplanation = `Bot places bishop on <strong>${to.toUpperCase()}</strong> along an active diagonal, targeting your pieces.`;
            } else if (botMove.piece === 'r') {
                botExplanation = `Bot centralizes rook on <strong>${to.toUpperCase()}</strong> on the ${to[0]}-file to support future breaks.`;
            } else if (botMove.piece === 'q') {
                botExplanation = `Bot brings queen to <strong>${to.toUpperCase()}</strong> to create dual threats across the board.`;
            } else {
                botExplanation = `Bot plays <strong>${botMove.san}</strong> to reinforce its defensive perimeter.`;
            }

            this.analysisLastBotMove = {
                san: botMove.san,
                from: botMove.from,
                to: botMove.to,
                explanation: botExplanation
            };

            // Draw bot move arrow
            this._drawAnalysisArrow(botMove.from, botMove.to, '#ca3431', `Bot: ${botMove.san}`);

            // MultiPV analysis for the player's upcoming turn
            let multiPv = [];
            try {
                if (this.app && this.app.analysisEngine) {
                    multiPv = await this.app.analysisEngine.evaluateMultiPV(this.analysisGame.fen(), 3, 9, 450);
                }
            } catch (_) {}

            if (this.app && this.app.coach) {
                this.analysisNextVariations = this.app.coach.explainVariations(
                    this.analysisGame.fen(),
                    multiPv,
                    this.analysisGame.turn(),
                    botMove
                );
                this.analysisNextSituation = this.app.coach.getBoardSituation(
                    this.analysisGame.fen(),
                    this.analysisGame.turn()
                );
            }

            if (sub) {
                if (botMove.san.includes('#')) {
                    sub.innerHTML = `<span style="color:#ca3431;font-weight:700">💀 Checkmate! Bot delivered ${botMove.san}. The king has no escape.</span>`;
                } else {
                    sub.textContent = `Bot responded with ${botMove.san}. It's your turn — what is your attacking plan?`;
                }
            }

            this._renderAnalysisBoard();
            this._renderAnalysisPanel();
            this._evalAnalysisPosition();
        }

        _renderAnalysisBoard() {
            const bd = document.getElementById('analysisBoard');
            if (!bd) return;

            bd.querySelectorAll('.piece-img, .move-dot').forEach(e => e.remove());
            bd.querySelectorAll('.square').forEach(s => s.classList.remove('selected', 'last-move', 'check', 'valid-move'));

            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                const file = String.fromCharCode(97 + c), rank = 8 - r, sq = file + rank;
                const p = this.analysisGame.get(sq);
                if (!p) continue;
                const el = bd.querySelector(`[data-square="${sq}"]`);
                if (!el) continue;
                const img = document.createElement('img');
                img.src = IMG[p.color + p.type];
                img.className = 'piece-img';
                img.draggable = false;
                el.appendChild(img);
            }

            // Highlight last move squares
            const lastM = this.analysisLastBotMove || (this.analysisLastMoveVerdict ? this.analysisLastMoveVerdict.move : null);
            if (lastM && lastM.from && lastM.to) {
                bd.querySelector(`[data-square="${lastM.from}"]`)?.classList.add('last-move');
                bd.querySelector(`[data-square="${lastM.to}"]`)?.classList.add('last-move');
            }

            // Valid moves highlight
            if (this.analysisSelected) {
                const sel = bd.querySelector(`[data-square="${this.analysisSelected}"]`);
                if (sel) sel.classList.add('selected');

                this.analysisValidMoves.forEach(m => {
                    const el = bd.querySelector(`[data-square="${m.to}"]`);
                    if (!el) return;
                    el.classList.add('valid-move');
                    const dot = document.createElement('div');
                    dot.className = 'move-dot' + (m.captured ? ' capture' : '');
                    el.appendChild(dot);
                });
            }

            // Check highlight
            if (this.analysisGame.in_check()) {
                const turn = this.analysisGame.turn();
                for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                    const file = String.fromCharCode(97 + c), rank = 8 - r;
                    const p = this.analysisGame.get(file + rank);
                    if (p && p.type === 'k' && p.color === turn) {
                        const el = bd.querySelector(`[data-square="${file}${rank}"]`);
                        if (el) el.classList.add('check');
                    }
                }
            }
        }

        async _evalAnalysisPosition() {
            if (!this.app || !this.app.analysisEngine) return;
            try {
                const ev = await this.app.analysisEngine.evaluate(this.analysisGame.fen(), 10, 400);
                const turn = this.analysisGame.turn();
                const ws = turn === 'w' ? (ev.score || 0) : -(ev.score || 0);
                this._updateAnalysisEvalBar(ws, ev.mate);
            } catch (_) {}
        }

        _updateAnalysisEvalBar(score, mate) {
            const fill = document.getElementById('analysisEvalBarFill');
            const scoreEl = document.getElementById('analysisEvalScore');
            if (!fill || !scoreEl) return;

            let displayScore = '0.0';
            let pct = 50;

            if (mate != null) {
                displayScore = mate > 0 ? `+M${mate}` : `-M${Math.abs(mate)}`;
                pct = mate > 0 ? 100 : 0;
            } else {
                const p = (score / 100).toFixed(1);
                displayScore = (score >= 0 ? '+' : '') + p;
                pct = Math.min(96, Math.max(4, 50 + score * 0.05));
            }

            scoreEl.textContent = displayScore;
            fill.style.height = `${pct}%`;
        }

        _drawAnalysisArrow(from, to, color, label) {
            const svg = this._analysisArrowSvg;
            if (!svg) return;
            const S = 100, ns = 'http://www.w3.org/2000/svg';

            let x1 = (from.charCodeAt(0)-97)*S + S/2, y1 = (8- +from[1])*S + S/2;
            let x2 = (to.charCodeAt(0)-97)*S   + S/2, y2 = (8- +to[1])*S   + S/2;
            if (this.analysisFlipped) { x1=800-x1; y1=800-y1; x2=800-x2; y2=800-y2; }

            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx*dx + dy*dy);
            const sqDist = len / S;

            const width = sqDist <= 1.2 ? 6 : sqDist <= 1.5 ? 8 : sqDist <= 2.5 ? 10 : 13;
            const mW = Math.max(8, Math.round(width * 0.9));
            const mH = Math.max(6, Math.round(mW * 0.7));

            const shortenPx = Math.max(8, Math.min(18, sqDist * 6));
            if (len > shortenPx * 2) { x2 -= (dx/len)*shortenPx; y2 -= (dy/len)*shortenPx; }

            const group = document.createElementNS(ns, 'g');
            const markerId = `anal-ah-${Date.now()}-${Math.random()}`;
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
            line.setAttribute('stroke-opacity','0.85');
            line.setAttribute('marker-end',`url(#${markerId})`);
            line.setAttribute('stroke-linecap','round');
            group.appendChild(line);

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

            svg.appendChild(group);
        }

        _clearAnalysisArrows() {
            if (this._analysisArrowSvg) {
                while (this._analysisArrowSvg.firstChild) this._analysisArrowSvg.removeChild(this._analysisArrowSvg.firstChild);
            }
        }

        /* ── Panel Tab Renderers ── */
        _renderAnalysisPanel() {
            const container = document.getElementById('analysisBodyContent');
            if (!container) return;

            if (this.analysisTab === 'plans') {
                this._renderStrategicPlansTab();
            } else if (this.analysisTab === 'patterns') {
                this._renderAttackPatternsTab();
            } else if (this.analysisTab === 'move-explainer') {
                this._renderMoveExplainerTab();
            } else if (this.analysisTab === 'inspector') {
                this._renderPieceRadarTab();
            } else if (this.analysisTab === 'checklist') {
                this._renderChecklistTab();
            }
        }

        _renderStrategicPlansTab() {
            const container = document.getElementById('analysisBodyContent');
            if (!container || !this.analysisData) return;
            const data = this.analysisData;
            const diag = data.diagnosis || {};

            let html = `
                <!-- Diagnosis Overview Grid -->
                <div class="diagnosis-grid">
                    <div class="diagnosis-item">
                        <span class="diagnosis-label">Pawn Structure</span>
                        <span class="diagnosis-val">${diag.structure || 'Dynamic Center'}</span>
                    </div>
                    <div class="diagnosis-item">
                        <span class="diagnosis-label">Pawn Breaks</span>
                        <span class="diagnosis-val">${diag.pawnBreaks || 'd4 / ...d5'}</span>
                    </div>
                    <div class="diagnosis-item">
                        <span class="diagnosis-label">Open Files</span>
                        <span class="diagnosis-val">${diag.openFiles || 'Center Files'}</span>
                    </div>
                    <div class="diagnosis-item">
                        <span class="diagnosis-label">Outposts</span>
                        <span class="diagnosis-val">${diag.bestOutposts || '5th/6th rank'}</span>
                    </div>
                </div>

                <div style="font-size:13.5px;line-height:1.6;color:var(--text);margin-bottom:14px">
                    ${data.description}
                </div>

                <h3 style="font-size:14px;font-weight:700;margin:0 0 10px 0;color:var(--text)">🗺️ Candidate Plans for this Middlegame:</h3>
            `;

            (data.plans || []).forEach(p => {
                html += `
                    <div class="plan-card">
                        <div class="plan-card-header">
                            <span class="plan-card-title">${p.icon || '📌'} ${p.title}</span>
                            <span class="plan-badge ${p.badge || 'primary'}">${p.badge === 'primary' ? 'Main Plan' : 'Counter Plan'}</span>
                        </div>
                        <div class="plan-card-body">${p.explanation}</div>
                        ${p.steps && p.steps.length > 0 ? `
                            <ol class="plan-card-steps">
                                ${p.steps.map(s => `<li>${s}</li>`).join('')}
                            </ol>
                        ` : ''}
                    </div>
                `;
            });

            html += `
                <div style="background:rgba(255,255,255,0.03);border:1px dashed var(--border);border-radius:var(--radius);padding:14px;margin-top:8px">
                    <strong style="color:var(--accent);display:block;margin-bottom:6px">💡 How to Decide Your Move:</strong>
                    <p style="margin:0;font-size:12.5px;line-height:1.6;color:var(--text-muted)">
                        Ask yourself: <em>"Which of my pieces is doing the least?"</em> If all pieces are active, push your key pawn break to open lines for your rooks, or plant a knight on an outpost where no enemy pawn can attack it!
                    </p>
                </div>
            `;

            container.innerHTML = html;
        }

        _renderMoveExplainerTab() {
            const container = document.getElementById('analysisBodyContent');
            if (!container) return;

            const verdict = this.analysisLastMoveVerdict;
            if (!verdict) {
                container.innerHTML = `
                    <div style="text-align:center;padding:36px 16px;color:var(--text-muted)">
                        <div style="font-size:42px;margin-bottom:12px">🎯</div>
                        <h3 style="color:var(--text);font-size:16px;margin-bottom:8px">Test ANY Move on the Board</h3>
                        <p style="font-size:13px;line-height:1.6;max-width:380px;margin:0 auto">
                            Make a move on the board to see an instant pedagogical breakdown! The coach will explain whether it's a <strong>blunder</strong>, <strong>mistake</strong>, or <strong>great plan</strong>, and why the best square works.
                        </p>
                    </div>
                `;
                return;
            }

            const isBad = verdict.classification === 'blunder' || verdict.classification === 'mistake' || verdict.classification === 'inaccuracy';
            const badgeClass = verdict.classification;
            const badgeLabel = verdict.classification.toUpperCase();
            const badgeIcon = verdict.classification === 'best' ? '⭐' : verdict.classification === 'good' ? '✅' : verdict.classification === 'inaccuracy' ? '⚠️' : verdict.classification === 'mistake' ? '❌' : '💥';

            let html = `
                <div class="move-verdict-card ${badgeClass}">
                    <div class="verdict-header">
                        <span class="verdict-tag">${badgeIcon} ${badgeLabel}: ${verdict.move.san}</span>
                        <span style="font-size:12px;font-weight:700;color:var(--text-muted)">${verdict.cpLoss > 0 ? `-${(verdict.cpLoss/100).toFixed(2)} cp` : 'Exact Best Move'}</span>
                    </div>

                    <!-- Why this move -->
                    <div class="verdict-detail-box">
                        <div class="verdict-detail-title">
                            ${isBad ? '⚠️ Why this is a ' + verdict.classification : '✅ Why this move is strong'}:
                        </div>
                        <p style="margin:0">${verdict.whyBlunder}</p>
                    </div>

                    <!-- Better alternative if it was bad -->
                    ${isBad && verdict.bestMove ? `
                        <div class="verdict-detail-box" style="margin-top:10px;background:rgba(150,188,75,0.08);border:1px solid rgba(150,188,75,0.25)">
                            <div class="verdict-detail-title" style="color:#96bc4b">
                                🌟 The Recommended Move:
                            </div>
                            <p style="margin:0">${verdict.bestMoveExplanation}</p>
                        </div>
                    ` : ''}

                    <!-- Multi-move refutation line if bad move -->
                    ${isBad && verdict.punishPv && verdict.punishPv.length > 0 ? `
                        <div class="verdict-detail-box" style="margin-top:10px;background:rgba(202,52,49,0.08);border:1px solid rgba(202,52,49,0.25)">
                            <div class="verdict-detail-title" style="color:#e0524f">
                                ⚔️ Multi-Move Opponent Punishment:
                            </div>
                            <p style="margin:0 0 8px 0;font-size:12px">Watch how the opponent punishes this move over the next several moves:</p>
                            <button class="btn btn-secondary btn-sm" id="stepRefutationBtn">
                                <span>▶</span> Step Through Opponent's Refutation (${Math.min(5, verdict.punishPv.length)} moves)
                            </button>
                        </div>
                    ` : ''}

                    <!-- Multi-move recommended attack line -->
                    ${verdict.bestPv && verdict.bestPv.length > 0 ? `
                        <div class="verdict-detail-box" style="margin-top:10px;background:rgba(150,188,75,0.08);border:1px solid rgba(150,188,75,0.25)">
                            <div class="verdict-detail-title" style="color:#96bc4b">
                                🌟 Multi-Move Recommended Attack Plan:
                            </div>
                            <p style="margin:0 0 8px 0;font-size:12px">Step through the winning tactical sequence to see how pieces coordinate:</p>
                            <button class="btn btn-accent btn-sm" id="stepBestLineBtn">
                                <span>▶</span> Step Through Recommended Attack (${Math.min(5, verdict.bestPv.length)} moves)
                            </button>
                        </div>
                    ` : ''}

                    <!-- Bot's Response -->
                    ${this.analysisLastBotMove ? `
                        <div class="verdict-detail-box" style="margin-top:10px;background:rgba(202,52,49,0.08);border:1px solid rgba(202,52,49,0.3)">
                            <div class="verdict-detail-title" style="color:#e0524f">
                                🤖 Bot's Response: <strong>${this.analysisLastBotMove.san}</strong>
                            </div>
                            <p style="margin:0">${this.analysisLastBotMove.explanation}</p>
                        </div>
                    ` : (this._analysisBotThinking ? `
                        <div class="verdict-detail-box" style="margin-top:10px;background:rgba(255,255,255,0.03);border:1px dashed var(--border)">
                            <div style="color:var(--accent);font-weight:700">🤖 Bot is calculating its response...</div>
                        </div>
                    ` : '')}

                    <!-- Future Roadmap -->
                    <div class="verdict-detail-future">
                        <strong style="color:var(--text);display:block;margin-bottom:6px">🔮 Strategic Follow-Up in Future Moves:</strong>
                        <ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.6">
                            ${(verdict.futurePlans || []).map(fp => `<li>${fp}</li>`).join('')}
                        </ul>
                    </div>

                    <!-- Candidate Attack Plans for Next Move -->
                    ${this.analysisNextVariations && this.analysisNextVariations.length > 0 ? `
                        <div style="margin-top:12px">
                            <strong style="color:var(--text);display:block;margin-bottom:8px;font-size:13px">
                                🔮 Your Turn: What Is Your Plan? (${this.analysisNextVariations.length} Candidate Attacks):
                            </strong>
                            <div style="display:flex;flex-direction:column;gap:8px">
                                ${this.analysisNextVariations.map((v, i) => `
                                    <div class="plan-card" style="margin-bottom:0;padding:10px 12px">
                                        <div class="plan-card-header" style="margin-bottom:4px">
                                            <span class="plan-card-title" style="font-size:12.5px">${v.icon} ${v.title}</span>
                                            <button class="btn btn-primary btn-sm play-next-var-btn" data-from="${v.moves[0].from}" data-to="${v.moves[0].to}" style="font-size:11px;padding:3px 9px">
                                                Play ${v.firstMoveSan} →
                                            </button>
                                        </div>
                                        <div style="font-size:12px;color:var(--text-muted);line-height:1.4">${v.whyBetter}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div style="display:flex;gap:10px;justify-content:center;margin-top:10px">
                    <button class="btn btn-secondary btn-sm" id="undoTestMoveBtn"><span>↩</span> Try Another Move</button>
                </div>
            `;

            container.innerHTML = html;

            // Bind multi-move continuation buttons
            const refutBtn = document.getElementById('stepRefutationBtn');
            if (refutBtn && verdict.punishPv && verdict.punishPv.length > 0) {
                refutBtn.addEventListener('click', () => {
                    this._loadContinuationSequence("Opponent's Refutation Sequence", verdict.fenAfter, verdict.punishPv, "Refutation");
                });
            }

            const bestBtn = document.getElementById('stepBestLineBtn');
            if (bestBtn && verdict.bestPv && verdict.bestPv.length > 0) {
                bestBtn.addEventListener('click', () => {
                    this._loadContinuationSequence("Recommended Attack Sequence", verdict.fenBefore, verdict.bestPv, "Recommended");
                });
            }

            // Bind play candidate move buttons
            document.querySelectorAll('.play-next-var-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const from = btn.dataset.from;
                    const to = btn.dataset.to;
                    if (from && to && !this._analysisBotThinking) {
                        this._executeAnalysisMove({ from, to });
                    }
                });
            });

            const uBtn = document.getElementById('undoTestMoveBtn');
            if (uBtn) {
                uBtn.addEventListener('click', () => {
                    this.analysisGame.undo();
                    if (this.analysisLastBotMove && this.analysisGame.history().length > 0) {
                        this.analysisGame.undo();
                    }
                    ChessSounds.undo();
                    this.analysisLastMoveVerdict = null;
                    this.analysisLastBotMove = null;
                    this.analysisNextVariations = [];
                    this.analysisNextSituation = null;
                    this._analysisBotThinking = false;
                    this._clearAnalysisArrows();
                    this._renderAnalysisBoard();
                    this._renderAnalysisPanel();
                    this._evalAnalysisPosition();

                    const sub = document.getElementById('analysisSubtitle');
                    if (sub && this.analysisData) {
                        const turnName = this.analysisGame.turn() === 'w' ? 'White' : 'Black';
                        sub.textContent = `${turnName} to move — test any move to see the coach breakdown.`;
                    }
                });
            }
        }

        _renderPieceRadarTab() {
            const container = document.getElementById('analysisBodyContent');
            if (!container) return;

            if (!this.analysisSelected) {
                container.innerHTML = `
                    <div style="text-align:center;padding:36px 16px;color:var(--text-muted)">
                        <div style="font-size:42px;margin-bottom:12px">🔬</div>
                        <h3 style="color:var(--text);font-size:16px;margin-bottom:8px">Piece & Square Radar</h3>
                        <p style="font-size:13px;line-height:1.6;max-width:380px;margin:0 auto">
                            Click any piece on the board to see a detailed square-by-square radar! Discover why certain squares are permanent outposts, while others are tactical traps.
                        </p>
                    </div>
                `;
                return;
            }

            const p = this.analysisGame.get(this.analysisSelected);
            if (!p) return;
            const pieceName = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' }[p.type];
            const sqMoves = this.analysisValidMoves;

            let html = `
                <div class="square-radar-card">
                    <div class="radar-piece-title">
                        <span>${IMG[p.color + p.type] ? `<img src="${IMG[p.color + p.type]}" style="width:24px;height:24px;vertical-align:middle">` : ''}</span>
                        <span>${pieceName} on ${this.analysisSelected.toUpperCase()}</span>
                    </div>

                    <p style="margin:0;font-size:12.5px;color:var(--text-muted)">
                        Available destination squares evaluated for tactical safety and strategic value:
                    </p>

                    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
            `;

            if (sqMoves.length === 0) {
                html += `<div style="color:var(--text-muted);font-size:12.5px;padding:8px">No legal moves available for this piece.</div>`;
            } else {
                sqMoves.forEach(m => {
                    const to = m.to;
                    const isCenter = ['d4','d5','e4','e5','c4','c5','f4','f5'].includes(to);
                    const isOutpost = (p.type === 'n' && (to[1] === '4' || to[1] === '5' || to[1] === '6'));
                    const isCapture = !!m.captured;

                    let ratingTag = 'caution';
                    let ratingLabel = 'Neutral';
                    let reason = `Standard move to ${to}.`;

                    if (isCapture) {
                        ratingTag = 'great';
                        ratingLabel = 'Capture';
                        reason = `Wins opponent's ${m.captured ? m.captured.toUpperCase() : 'piece'} on ${to}!`;
                    } else if (isOutpost) {
                        ratingTag = 'great';
                        ratingLabel = 'Outpost';
                        reason = `Excellent central outpost on ${to}! Restricts opponent pieces and dominates key diagonals/files.`;
                    } else if (isCenter) {
                        ratingTag = 'great';
                        ratingLabel = 'Central';
                        reason = `Controls the critical central square ${to}.`;
                    } else if (to[0] === 'a' || to[0] === 'h') {
                        ratingTag = 'caution';
                        ratingLabel = 'Rim';
                        reason = `Piece on the edge has reduced mobility and fewer attacking squares.`;
                    }

                    html += `
                        <div class="radar-square-item">
                            <span class="radar-square-tag ${ratingTag}">${to.toUpperCase()} &bull; ${ratingLabel}</span>
                            <span>${reason}</span>
                        </div>
                    `;
                });
            }

            html += `
                    </div>
                </div>
            `;

            container.innerHTML = html;
        }

        _renderChecklistTab() {
            const container = document.getElementById('analysisBodyContent');
            if (!container) return;

            const html = `
                <div class="checklist-card">
                    <h3 style="font-size:15px;font-weight:700;color:var(--text);margin:0 0 4px 0">📋 Post-Opening Middlegame Checklist</h3>
                    <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 14px 0">
                        When all pieces are developed and you're asking <em>"What do I do now?"</em>, run through these 5 master steps before every move:
                    </p>

                    <div class="checklist-item">
                        <div class="checklist-number">1</div>
                        <div class="checklist-content">
                            <h4>Target Weak & Backward Enemy Pawns</h4>
                            <p>Look across the board: Are there isolated pawns (no friendly pawns on adjacent files)? Backward pawns on open files? Place your rooks and knights opposite these weaknesses.</p>
                        </div>
                    </div>

                    <div class="checklist-item">
                        <div class="checklist-number">2</div>
                        <div class="checklist-content">
                            <h4>Claim Open and Half-Open Files with Rooks</h4>
                            <p>Rooks belong on open files (files with no pawns). If there are no open files, place them on half-open files opposite the opponent's queen or king.</p>
                        </div>
                    </div>

                    <div class="checklist-item">
                        <div class="checklist-number">3</div>
                        <div class="checklist-content">
                            <h4>Create Outposts for Your Knights</h4>
                            <p>A knight outpost is a central square (usually on rank 5 or 6) protected by a pawn that opponent pawns cannot chase away. A knight on an outpost is often worth as much as a rook!</p>
                        </div>
                    </div>

                    <div class="checklist-item">
                        <div class="checklist-number">4</div>
                        <div class="checklist-content">
                            <h4>Identify Your Decisive Pawn Break</h4>
                            <p>In chess, pawns open doors for pieces. Decide which pawn break (d4/d5, c4/c5, or f4/f5) shatters the opponent's center and allows your pieces to invade.</p>
                        </div>
                    </div>

                    <div class="checklist-item">
                        <div class="checklist-number">5</div>
                        <div class="checklist-content">
                            <h4>King Safety & Creating a "Luft"</h4>
                            <p>Before launching an all-out assault, ensure your king is safe. Push h3 (or ...h6) to create a "luft" (escape square) to eliminate dangerous back-rank checkmates.</p>
                        </div>
                    </div>
                </div>
            `;

            container.innerHTML = html;
        }

        /* ══════════════════════════════════════════════════════════
           ATTACK PATTERNS & MULTI-MOVE SEQUENCE ENGINE
           Answers: "Which piece needs what to attack?",
           "How do I put pieces together for future attacks?",
           and provides interactive multi-move line stepping.
           ══════════════════════════════════════════════════════════ */
        _renderAttackPatternsTab() {
            const container = document.getElementById('analysisBodyContent');
            if (!container) return;

            const patterns = ChessTrainer.getAttackPatternList();
            if (!patterns || patterns.length === 0) return;

            if (!this.analysisPattern) {
                this.analysisPattern = patterns[0];
            }
            const p = this.analysisPattern;
            const seqBar = document.getElementById('analysisSequenceBar');
            if (seqBar) seqBar.style.display = 'flex';

            let html = `
                <!-- Pattern Header -->
                <div class="pattern-selection-header">
                    <div>
                        <h3 style="font-size:15px;font-weight:800;color:var(--text);margin:0 0 4px 0">${p.icon} ${p.title}</h3>
                        <span class="pattern-badge-target">🎯 ${p.target}</span>
                    </div>
                    <span class="plan-badge ${p.difficulty === 'Beginner' ? 'primary' : 'alternative'}">${p.difficulty}</span>
                </div>

                <!-- Pattern Selection Pills -->
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
                    ${patterns.map(pat => `
                        <button class="btn btn-sm ${pat.id === p.id ? 'btn-accent' : 'btn-ghost'}" data-pattern-id="${pat.id}" style="font-size:11.5px;padding:4px 9px">
                            ${pat.icon} ${pat.title.split(' ')[0]}
                        </button>
                    `).join('')}
                </div>

                <!-- Piece Roles & Attack Synergy Matrix -->
                <div class="piece-synergy-container">
                    <div class="piece-synergy-title">
                        <span>♟️</span>
                        <span>Which Piece Needs What: Attack Synergy Matrix</span>
                    </div>
                    <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px 0;line-height:1.5">
                        In middlegame attacks, pieces must act as a coordinated team. Here is the exact role and requirement of each piece for this attack pattern:
                    </p>
                    <div class="piece-role-grid">
                        <div class="piece-role-card">
                            <div class="piece-role-card-header">
                                <img src="${IMG.wq}" style="width:20px;height:20px;vertical-align:middle">
                                <span>Queen — Infiltrator & Finisher</span>
                            </div>
                            <div class="piece-role-card-text">${p.pieceRoles.queen}</div>
                        </div>

                        <div class="piece-role-card">
                            <div class="piece-role-card-header">
                                <img src="${IMG.wn}" style="width:20px;height:20px;vertical-align:middle">
                                <span>Knight — Outpost & Striker</span>
                            </div>
                            <div class="piece-role-card-text">${p.pieceRoles.knight}</div>
                        </div>

                        <div class="piece-role-card">
                            <div class="piece-role-card-header">
                                <img src="${IMG.wb}" style="width:20px;height:20px;vertical-align:middle">
                                <span>Bishop — Shield-Breaker</span>
                            </div>
                            <div class="piece-role-card-text">${p.pieceRoles.bishop}</div>
                        </div>

                        <div class="piece-role-card">
                            <div class="piece-role-card-header">
                                <img src="${IMG.wr}" style="width:20px;height:20px;vertical-align:middle">
                                <span>Rook — Lifter / Open File Controller</span>
                            </div>
                            <div class="piece-role-card-text">${p.pieceRoles.rook}</div>
                        </div>

                        <div class="piece-role-card" style="grid-column: 1 / -1">
                            <div class="piece-role-card-header">
                                <img src="${IMG.wp}" style="width:20px;height:20px;vertical-align:middle">
                                <span>Pawns — Levers & Battering Rams</span>
                            </div>
                            <div class="piece-role-card-text">${p.pieceRoles.pawns}</div>
                        </div>
                    </div>
                </div>

                <!-- Multi-Move Sequence Steps -->
                <div class="sequence-steps-container">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                        <strong style="font-size:13px;color:var(--text)">⚔️ Multi-Move Sequence (Step-by-Step):</strong>
                        <span style="font-size:11.5px;color:var(--text-muted)">Click any step or use [▶ Next]</span>
                    </div>

                    <div style="display:flex;flex-direction:column;gap:6px">
                        ${p.sequence.map((st, i) => {
                            const isCurrent = this.analysisSeqIndex === i + 1;
                            return `
                                <div class="sequence-step-card ${isCurrent ? 'active' : ''}" data-step-index="${i + 1}">
                                    <span class="step-number-badge">${i + 1}</span>
                                    <div style="flex:1">
                                        <div style="display:flex;align-items:center;gap:6px">
                                            <span class="step-move-san">${st.san}</span>
                                            <span class="step-annotation-tag">${st.annotation}</span>
                                        </div>
                                        <div class="step-detail-text">${st.explanation}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- Summary Checklist Box -->
                <div style="margin-top:12px;background:rgba(255,255,255,0.03);border:1px dashed var(--border);border-radius:var(--radius);padding:12px">
                    <strong style="color:var(--accent);display:block;margin-bottom:4px;font-size:12.5px">📋 Pattern Rule & Checklist:</strong>
                    <p style="margin:0;font-size:12px;line-height:1.5;color:var(--text-muted)">${p.summary}</p>
                </div>

                <!-- Bottom action buttons -->
                <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:12px">
                    <button class="btn btn-secondary btn-sm" id="resetPatternSeqBtn"><span>⏮</span> Reset Sequence</button>
                    <button class="btn btn-accent btn-sm" id="playVsAiFromPatternBtn"><span>🤖</span> Play vs AI from Here</button>
                </div>
            `;

            container.innerHTML = html;

            // Bind pattern selector buttons
            container.querySelectorAll('[data-pattern-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._loadAttackPattern(btn.dataset.patternId);
                });
            });

            // Bind sequence steps click
            container.querySelectorAll('[data-step-index]').forEach(card => {
                card.addEventListener('click', () => {
                    const idx = parseInt(card.dataset.stepIndex, 10);
                    this._stepSequence(idx);
                });
            });

            // Bind bottom action buttons
            const resetBtn = document.getElementById('resetPatternSeqBtn');
            if (resetBtn) resetBtn.addEventListener('click', () => this._stepSequenceStart());

            const playBtn = document.getElementById('playVsAiFromPatternBtn');
            if (playBtn) playBtn.addEventListener('click', () => this._playVsAiFromCurrentAnalysis());
        }

        _loadAttackPattern(id) {
            const p = ChessTrainer.getAttackPattern(id);
            if (!p) return;
            ChessSounds.tabSwitch();
            this.analysisPattern = p;
            this.analysisData = { ...p, plans: [] };
            this.analysisFlipped = p.turn === 'b';

            // Simulate full sequence to store FENs
            const tempG = new Chess(p.fen);
            const positions = [p.fen];
            const moves = [];

            (p.sequence || []).forEach(step => {
                const m = tempG.move(step.san || step.move);
                positions.push(tempG.fen());
                moves.push({
                    ...step,
                    from: step.from || (m ? m.from : null),
                    to: step.to || (m ? m.to : null),
                    san: step.san || (m ? m.san : step.move)
                });
            });

            this.analysisSeqData = {
                title: p.title,
                positions,
                moves,
                isPattern: true
            };
            this.analysisSeqIndex = 0;
            this.analysisGame = new Chess(p.fen);
            this.analysisSelected = null;
            this.analysisValidMoves = [];
            this.analysisLastMoveVerdict = null;

            document.getElementById('analysisTitle').textContent = p.title;
            document.getElementById('analysisSubtitle').textContent = `Target: ${p.target} — Step through the sequence or play vs AI`;

            const seqBar = document.getElementById('analysisSequenceBar');
            if (seqBar) seqBar.style.display = 'flex';

            this._clearAnalysisArrows();
            this._buildAnalysisBoard();
            this._renderAnalysisBoard();
            this._renderAnalysisPanel();
            this._stepSequence(0);
        }

        _stepSequence(idx) {
            this._cancelAnalysisDrag();
            if (!this.analysisSeqData) return;
            const positions = this.analysisSeqData.positions;
            const moves = this.analysisSeqData.moves;
            if (!positions || positions.length === 0) return;

            const safeIdx = Math.max(0, Math.min(positions.length - 1, idx));
            this.analysisSeqIndex = safeIdx;

            this.analysisGame = new Chess(positions[safeIdx]);
            this.analysisSelected = null;
            this.analysisValidMoves = [];
            this._clearAnalysisArrows();

            const ind = document.getElementById('analysisStepIndicator');
            const total = moves.length;

            if (safeIdx === 0) {
                if (ind) ind.textContent = `Start Position (0 of ${total})`;
                if (moves.length > 0) {
                    const nextMove = moves[0];
                    if (nextMove.from && nextMove.to) {
                        this._drawAnalysisArrow(nextMove.from, nextMove.to, '#96bc4b', nextMove.san || 'Move 1');
                    }
                }
            } else {
                const movePlayed = moves[safeIdx - 1];
                if (ind) ind.textContent = `Step ${safeIdx} of ${total}: ${movePlayed.san}`;
                if (movePlayed.from && movePlayed.to) {
                    this._drawAnalysisArrow(movePlayed.from, movePlayed.to, '#96bc4b', movePlayed.san);
                }
                // Sound
                if (movePlayed.san && (movePlayed.san.includes('#') || movePlayed.san.includes('+'))) {
                    ChessSounds.check();
                } else if (movePlayed.captured || (movePlayed.san && movePlayed.san.includes('x'))) {
                    ChessSounds.capture();
                } else {
                    ChessSounds.move();
                }
            }

            this._renderAnalysisBoard();

            // Highlight step card in panel if visible
            document.querySelectorAll('.sequence-step-card').forEach((card, i) => {
                card.classList.toggle('active', i + 1 === safeIdx);
            });

            this._evalAnalysisPosition();
        }

        _stepSequenceStart() {
            this._stepSequence(0);
        }

        _stepSequencePrev() {
            if (this.analysisSeqIndex > 0) {
                this._stepSequence(this.analysisSeqIndex - 1);
            }
        }

        _stepSequenceNext() {
            if (this.analysisSeqData && this.analysisSeqIndex < this.analysisSeqData.positions.length - 1) {
                this._stepSequence(this.analysisSeqIndex + 1);
            }
        }

        _stepSequenceEnd() {
            if (this.analysisSeqData) {
                this._stepSequence(this.analysisSeqData.positions.length - 1);
            }
        }

        _loadContinuationSequence(title, startFen, uciMoves, label = 'Engine Continuation') {
            if (!uciMoves || uciMoves.length === 0) return;
            const seq = this._uciLineToSequence(startFen, uciMoves, 6);
            if (!seq.moves || seq.moves.length === 0) return;

            this.analysisSeqData = {
                title,
                positions: seq.positions,
                moves: seq.moves,
                isContinuation: true
            };

            const seqBar = document.getElementById('analysisSequenceBar');
            if (seqBar) seqBar.style.display = 'flex';

            document.getElementById('analysisTitle').textContent = title;
            document.getElementById('analysisSubtitle').textContent = `Step through the ${seq.moves.length}-move line to understand the multi-move attack and defense`;

            this._stepSequence(0);
        }

        _uciLineToSequence(startFen, uciMoves, maxMoves = 6) {
            const tempG = new Chess(startFen);
            const positions = [startFen];
            const moves = [];
            const slice = uciMoves.slice(0, maxMoves);

            for (let i = 0; i < slice.length; i++) {
                const u = slice[i];
                if (!u || u.length < 4) break;
                const from = u.substring(0, 2);
                const to = u.substring(2, 4);
                const promotion = u.length > 4 ? u[4] : undefined;
                const m = tempG.move({ from, to, promotion });
                if (!m) break;
                positions.push(tempG.fen());
                moves.push({
                    san: m.san,
                    from: m.from,
                    to: m.to,
                    color: m.color,
                    captured: m.captured,
                    piece: m.piece,
                    annotation: m.captured ? 'Capture' : (m.san.includes('+') ? 'Check' : 'Continuation'),
                    explanation: m.captured
                        ? `${m.color === 'w' ? 'White' : 'Black'} captures on ${to}.`
                        : (m.san.includes('+') ? `${m.color === 'w' ? 'White' : 'Black'} gives check.` : `${m.color === 'w' ? 'White' : 'Black'} plays ${m.san} to ${to}.`)
                });
            }
            return { positions, moves };
        }

        _playVsAiFromCurrentAnalysis() {
            if (!this.analysisGame) return;
            const fen = this.analysisGame.fen();
            const turn = this.analysisGame.turn();

            // Switch to play mode
            this._switchMode('play');

            // Initialize app game from this position
            this.app.game = new Chess(fen);
            this.app.posHistory = [fen];
            this.app.moveData = [];
            this.app.viewIndex = 0;
            this.app.playerColor = turn;
            this.app.flipped = turn === 'b';
            this.app.over = false;
            this.app.thinking = false;
            this.app.selected = null;
            this.app.validMoves = [];

            this.app._buildBoard();
            this.app._render();
            this.app._evalAndCache();
            this.app._status(`Play vs AI from position! Your turn (${turn === 'w' ? 'White' : 'Black'})`);
            ChessSounds.newGame();
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
        document.getElementById('patternShortcut').addEventListener('click', () => window.trainer._switchMode('patterns'));
    });
})();


/* Learning flow: independent practice, personal reviews, and optional in-game checks.
   All progress stays on this browser. Chess rules validate every stored position. */
(() => {
    'use strict';
    const DAY = 86400000;
    const KEY = 'chess-tutor.learning.v1';
    const SKILLS = {
        safety: { name: 'Piece safety', goal: 'Notice pieces that can be taken for free.' },
        forks: { name: 'Double attacks', goal: 'Find a check that attacks another valuable piece.' },
        mate: { name: 'Checkmate patterns', goal: 'Check the king and cover every escape square.' },
        calculation: { name: 'Thinking ahead', goal: 'Compare a move with your opponent’s best reply.' }
    };
    const BASE = [
        { id: 'loose-queen', skill: 'safety', title: 'A loose piece', fen: '6k1/5pp1/8/3q4/8/8/5PP1/3R2K1 w - - 0 1', line: ['d1d5'], prompt: 'Win an undefended piece without giving up your own.', explanation: 'Rxd5 takes the undefended queen. Always check whether the captured piece has a defender.', clue: 'Scan along your rook’s file. Which enemy piece has no defender?' },
        { id: 'loose-rook', skill: 'safety', title: 'Look before you leap', fen: '6k1/5pp1/8/4r3/8/5N2/5PP1/6K1 w - - 0 1', line: ['f3e5'], prompt: 'Find a safe capture that wins material.', explanation: 'Nxe5 wins the rook. A knight can jump over pieces, so check all eight of its possible destinations.', clue: 'Trace the L-shaped moves of your knight.' },
        { id: 'long-diagonal', skill: 'safety', title: 'Across the diagonal', fen: '6k1/5pp1/8/8/5r2/8/3B1PP1/6K1 w - - 0 1', line: ['d2f4'], prompt: 'Find the undefended piece you can capture safely.', explanation: 'Bxf4 wins the rook. Scan a bishop’s entire open diagonal, not just the adjacent squares.', clue: 'Follow your bishop’s diagonal toward the enemy rook.' },
        { id: 'royal-fork', skill: 'forks', title: 'Two targets, one move', fen: '3q3k/8/8/4N3/8/8/8/6K1 w - - 0 1', line: ['e5f7','h8g8','f7d8'], prompt: 'Force the king to move, then win the queen.', explanation: 'Nf7+ attacks the king and queen at once. After the king escapes, Nxd8 wins the queen.', clue: 'Look for a knight check that also attacks the queen.' },
        { id: 'corner-fork', skill: 'forks', title: 'A forcing move', fen: 'q3k3/8/8/1N6/8/8/8/6K1 w - - 0 1', line: ['b5c7','e8d7','c7a8'], prompt: 'Give check and follow through to win the queen.', explanation: 'Nc7+ forks the king and queen. The king must move, giving you time for Nxa8.', clue: 'Which knight jump checks the king and reaches the corner?' },
        { id: 'central-fork', skill: 'forks', title: 'Find the double attack', fen: '8/2q3k1/8/8/3N4/8/8/6K1 w - - 0 1', line: ['d4e6','g7h7','e6c7'], prompt: 'Use a forcing move to win the queen in two moves.', explanation: 'Ne6+ attacks both targets. After the king moves, Nxc7 completes the tactic.', clue: 'A knight can attack two distant pieces from one central square.' },
        { id: 'back-rank', skill: 'mate', title: 'No escape', fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', line: ['e1e8'], prompt: 'Deliver checkmate in one move.', explanation: 'Re8# checks along the back rank. The king’s own pawns block its escape squares.', clue: 'The enemy king is trapped behind its own pawns.' },
        { id: 'queen-support', skill: 'mate', title: 'Work together', fen: '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1', line: ['g6g7'], prompt: 'Deliver checkmate in one move. Make sure your queen is protected.', explanation: 'Qg7# works because the king protects the queen and the queen covers every escape square.', clue: 'Bring the queen close to the king, with support from your own king.' },
        { id: 'rook-support', skill: 'mate', title: 'Close the last door', fen: '7k/5K2/8/8/8/8/8/6R1 w - - 0 1', line: ['g1h1'], prompt: 'Deliver checkmate in one move with king and rook.', explanation: 'Rh1# checks along the h-file while your king covers g8 and g7.', clue: 'Your king already covers two escapes. Check along the enemy king’s file.' }
    ];
    const moveObject = uci => ({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] });
    const uciOf = move => move.from + move.to + (move.promotion || '');
    const flipMove = uci => uci[0] + (9 - Number(uci[1])) + uci[2] + (9 - Number(uci[3])) + uci.slice(4);
    function oppositePuzzle(p) {
        const parts = p.fen.split(' ');
        parts[0] = parts[0].split('/').reverse().join('/').replace(/[a-z]/gi, c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());
        parts[1] = 'b';
        return { ...p, id: p.id + '-black', family: p.id, title: p.title + ' · Black', fen: parts.join(' '), line: p.line.map(flipMove), explanation: 'The same idea works with Black. Follow the line on the board and notice how the pieces cooperate.' };
    }
    const CATALOG = BASE.flatMap(p => [{ ...p, family: p.id }, oppositePuzzle(p)]);
    const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const label = color => color === 'w' ? 'White' : 'Black';
    const PIECE_IMAGES = {wk:'4/42/Chess_klt45.svg',wq:'1/15/Chess_qlt45.svg',wr:'7/72/Chess_rlt45.svg',wb:'b/b1/Chess_blt45.svg',wn:'7/70/Chess_nlt45.svg',wp:'4/45/Chess_plt45.svg',bk:'f/f0/Chess_kdt45.svg',bq:'4/47/Chess_qdt45.svg',br:'f/ff/Chess_rdt45.svg',bb:'9/98/Chess_bdt45.svg',bn:'e/ef/Chess_ndt45.svg',bp:'c/c7/Chess_pdt45.svg'};
    const NAMES = {k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'};
    function moveLesson(move, game) {
        let text=`${label(move.color)} plays ${move.san}`;
        if(move.captured)text+=`, capturing the ${NAMES[move.captured]} on ${move.to}`;
        else if(move.flags.includes('k')||move.flags.includes('q'))text+=', bringing the king to safety and activating the rook';
        else text+=`, moving the ${NAMES[move.piece]} to ${move.to}`;
        if(move.promotion)text+=` and promoting to a ${NAMES[move.promotion]}`;
        text+='.';
        if(game.in_checkmate())text+=' Checkmate: there is no legal escape, block or capture.';
        else if(game.in_check())text+=' This is check: the opponent must answer the threat to the king.';
        else text+=' Check what this changes before choosing the next move.';
        return text;
    }
    function validGenerated(p) {
        if (!p || typeof p.id !== 'string' || !p.id.startsWith('generated-') || typeof p.fen !== 'string' || !PuzzleLevels[p.difficulty] || !Array.isArray(p.line) || !new Chess().validate_fen(p.fen).valid) return false;
        const game = new Chess(p.fen);
        return p.line.length > 0 && p.line.length <= 15 && p.line.every(move => typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) && game.move(moveObject(move)));
    }

    class LearningStore {
        constructor(storage) {
            this.storage = storage;
            this.available = true;
            this.data = { version: 1, results: {}, moments: [], attempts: [], generated: [], recent: [] };
            try {
                const raw = storage.getItem(KEY);
                if (raw) {
                    const d = JSON.parse(raw);
                    if (d.version !== 1 || !d.results || !Array.isArray(d.moments) || !Array.isArray(d.attempts)) throw Error('Invalid progress');
                    this.data.moments = d.moments.filter(p => p && typeof p.id === 'string' && p.id.startsWith('moment-') && typeof p.fen === 'string' && new Chess().validate_fen(p.fen).valid && Array.isArray(p.line) && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(p.line[0])).slice(-40).map(p => ({...p, skill: SKILLS[p.skill] ? p.skill : 'calculation', kind: 'engine'}));
                    this.data.generated = (Array.isArray(d.generated) ? d.generated : []).filter(validGenerated).slice(-200).map(p => ({...p, kind:'generated', skill:'calculation'}));
                    this.data.recent = (Array.isArray(d.recent) ? d.recent : []).filter(f => typeof f === 'string').slice(-2000);
                    const ids = new Set([...CATALOG, ...this.data.moments, ...this.data.generated].map(p => p.id));
                    for (const [id,r] of Object.entries(d.results)) {
                        if (ids.has(id) && r && ['due','last','streak','solves'].every(k => Number.isFinite(r[k]) && r[k] >= 0)) this.data.results[id] = r;
                    }
                    this.data.attempts = d.attempts.filter(a => a && typeof a.id === 'string' && SKILLS[a.skill] && Number.isFinite(a.at) && typeof a.clean === 'boolean').slice(-400);
                }
            } catch (_) { this.available = false; }
        }
        save() {
            try { this.storage.setItem(KEY, JSON.stringify(this.data)); this.available = true; }
            catch (_) { this.available = false; }
        }
        record(p, { solved, hints, errors, source }, now = Date.now()) {
            const old = this.data.results[p.id];
            const clean = solved && hints === 0 && errors === 0;
            const delayed = !!(old && old.solves && now - old.last >= DAY);
            // Same-day repetition cannot push a review farther away or count as retention.
            const streak = clean ? (old ? old.streak + (delayed ? 1 : 0) : 1) : 0;
            const days = clean ? [1,3,7,14][Math.min(Math.max(streak-1,0),3)] : 1;
            this.data.results[p.id] = { last: now, due: old && clean && !delayed ? old.due : now + days*DAY, streak, solves: (old?.solves || 0) + Number(solved) };
            this.data.attempts.push({ id:p.id, family:p.family || p.id, skill:p.skill, at:now, solved, clean, delayed:delayed && clean, hints, errors, source });
            this.data.attempts = this.data.attempts.slice(-400);
            this.save();
        }
        addMoment(p) {
            if (this.data.moments.some(m => m.fen.split(' ').slice(0,4).join(' ') === p.fen.split(' ').slice(0,4).join(' '))) return false;
            this.data.moments.push(p);
            if (this.data.moments.length > 40) { const removed = this.data.moments.shift(); delete this.data.results[removed.id]; }
            this.save(); return true;
        }
        addGenerated(p) {
            this.data.generated.push(p);
            this.data.recent.push(p.fen.split(' ').slice(0,4).join(' '));
            this.data.recent = this.data.recent.slice(-2000);
            while (this.data.generated.length > 200) {
                const removed = this.data.generated.shift();
                delete this.data.results[removed.id];
            }
            this.save();
        }
        stats(skill) {
            const attempts = this.data.attempts.filter(a => a.skill === skill);
            const first = new Map();
            for (const a of attempts) if (!first.has(a.family)) first.set(a.family, a);
            return { seen: first.size, independent: [...first.values()].filter(a => a.clean).length,
                reviews: new Set(attempts.filter(a => a.delayed).map(a => a.family)).size };
        }
    }

    class LearningController {
        constructor(app, trainer) {
            this.app = app; this.trainer = trainer;
            let storage;
            try { storage = window.localStorage; } catch (_) { storage = {getItem(){throw Error('Unavailable');},setItem(){throw Error('Unavailable');}}; }
            this.store = new LearningStore(storage);
            this.filter = 'fresh'; this.mode = 'play'; this.session = null;
            this.preferredDifficulty='challenging';
            const header=document.querySelector('.app-header');
            const sizeCoach=()=>document.documentElement.style.setProperty('--coach-header-height',header.offsetHeight+'px');
            sizeCoach();
            if(window.ResizeObserver){this.headerObserver=new ResizeObserver(sizeCoach);this.headerObserver.observe(header);}
            this.nextQuiz = 4 + Math.floor(Math.random()*3); this.quizCount = 0; this.momentsThisGame = 0;
            this.engine = null; this.enginePromise = null; this.hintLevel = 0;
            this.dialog = document.getElementById('puzzleDialog');
            document.getElementById('practiceShortcut').onclick = () => trainer._switchMode('puzzles');
            document.querySelectorAll('[data-puzzle-filter]').forEach(b => b.onclick = () => { this.filter=b.dataset.puzzleFilter; this.renderHub(); });
            document.getElementById('puzzleCollection').onclick = e => {
                const fresh = e.target.closest('[data-generate]');
                if (fresh) { this.openGenerated(fresh.dataset.generate); return; }
                const b=e.target.closest('[data-puzzle]'); if (b) this.open(this.all().find(p => p.id === b.dataset.puzzle));
            };
            document.getElementById('learningOverview').onclick = e => { if (e.target.closest('[data-start-practice]')) this.openGenerated(this.preferredDifficulty); };
            document.getElementById('closePuzzle').onclick = () => this.close();
            this.dialog.addEventListener('cancel', e => { e.preventDefault(); this.close(); });
            document.getElementById('puzzleHint').onclick = () => this.hint();
            document.getElementById('puzzleReveal').onclick = () => this.reveal();
            document.getElementById('puzzleNext').onclick = () => {
                if (this.session?.source === 'quiz') { this.close(); return; }
                if (this.session?.puzzle.kind === 'generated') {
                    const difficulty = this.session.puzzle.difficulty;
                    this.close(); this.openGenerated(difficulty); return;
                }
                this.close(); this.openGenerated(this.preferredDifficulty);
            };
            document.getElementById('puzzleReviewPrev').onclick=()=>this.stepReview(-1);
            document.getElementById('puzzleReviewNext').onclick=()=>this.stepReview(1);
            document.getElementById('puzzleBoard').onclick = e => { const sq=e.target.closest('[data-square]'); if(sq) this.select(sq.dataset.square); };
            document.getElementById('puzzleBoard').addEventListener('keydown', e => {
                const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8}; if (!(e.key in moves)) return;
                e.preventDefault(); const buttons=[...e.currentTarget.querySelectorAll('button')]; const i=buttons.indexOf(document.activeElement);
                buttons[Math.max(0,Math.min(63,i+moves[e.key]))]?.focus();
            });
            document.querySelectorAll('[data-promotion]').forEach(b => b.onclick = () => {
                const pending=this.session?.promotion; if (!pending) return;
                this.session.promotion=null; document.getElementById('puzzlePromotion').hidden=true;
                this.submit({...pending,promotion:b.dataset.promotion});
            });
            this.onMode('play');
        }
        all() { return [...CATALOG, ...this.store.data.moments, ...this.store.data.generated]; }
        goal() { return ['safety','forks','mate'].find(k => new Set(this.store.data.attempts.filter(a => a.skill===k && a.clean).map(a=>a.family)).size < 2) || 'calculation'; }
        recommended() {
            const goal=this.goal(), now=Date.now();
            const priority=p => {
                const r=this.store.data.results[p.id];
                if (r?.due <= now) return 0;
                if (!r && p.kind==='engine') return 1;
                if (!r && p.skill===goal) return 2;
                if (!r) return 3;
                return 4;
            };
            return this.all().sort((a,b)=>priority(a)-priority(b) || (this.store.data.results[a.id]?.last || 0)-(this.store.data.results[b.id]?.last || 0));
        }
        notice() {
            const el=document.getElementById('storageNotice'); el.hidden=this.store.available;
            el.textContent='Progress is available for this visit, but browser storage could not be read or saved. Allow local storage to keep your practice history.';
        }
        renderHub() {
            this.notice(); const goal=this.goal(), data=this.store.data;
            const independent=new Set(data.attempts.filter(a=>a.clean).map(a=>a.id)).size;
            const due=this.all().filter(p=>data.results[p.id]?.due<=Date.now()).length;
            document.getElementById('learningOverview').innerHTML=`<div class="daily-goal"><span class="eyebrow">A FRESH POSITION EVERY TIME</span><h2>Calculate. Understand. Repeat.</h2><p>Generate a new ${this.preferredDifficulty} challenge. Find the whole continuation, then review why each move matters.</p><button class="btn btn-primary" data-start-practice>Start a fresh challenge <span aria-hidden="true">→</span></button></div><div class="practice-summary"><div><strong>${independent}</strong><span>positions solved without help</span></div><div><strong>${due}</strong><span>reviews ready today</span></div><p>Fresh challenges to stretch you. Saved reviews to check what you remember.</p></div>`;
            const checks=data.attempts.filter(a=>a.source==='quiz');
            if(checks.length){
                const recent=checks.slice(-3), earlier=checks.slice(0,3);
                const count=items=>items.filter(a=>a.clean).length;
                const comparison=checks.length>=6 ? `First 3 checks: ${count(earlier)}/3 without help. Latest 3: ${count(recent)}/3.` : `${count(checks)}/${checks.length} checks solved without hints or retries. Play more Coach Play games to build a comparison.`;
                document.getElementById('learningOverview').insertAdjacentHTML('beforeend',`<div class="quiz-progress"><strong>Coach Play check-ins</strong><p>${comparison}</p><span>Different positions vary in difficulty. This tracks practice, not a chess rating.</span></div>`);
            }
            document.getElementById('mistakeCount').textContent=data.moments.length;
            document.querySelectorAll('[data-puzzle-filter]').forEach(b=>{const active=b.dataset.puzzleFilter===this.filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
            let puzzles=this.filter==='recommended' ? this.recommended().slice(0,6) : this.all();
            if (this.filter==='mistakes') puzzles=data.moments.slice().reverse();
            if (this.filter==='due') puzzles=puzzles.filter(p=>data.results[p.id]?.due<=Date.now());
            if (this.filter==='fresh') puzzles=[];
            const empty=this.filter==='mistakes' ? 'Your game moments will appear here as you play. You can start the puzzle collection now—no completed game needed.' : 'You’re up to date. Explore the collection while your next review is scheduled.';
            document.getElementById('puzzleCollection').innerHTML=puzzles.length ? puzzles.map(p=>{
                const r=data.results[p.id]; const state=!r?'New':r.due<=Date.now()?'Review today':r.solves?'Practiced · review later':'Try again';
                return `<button class="puzzle-card" data-puzzle="${escape(p.id)}"><span class="puzzle-card-top"><span>${escape(SKILLS[p.skill].name)}</span><span>${state}</span></span><span class="puzzle-card-icon" aria-hidden="true">${{safety:'♜',forks:'♞',mate:'♚',calculation:'♟'}[p.skill]}</span><strong>${escape(p.title)}</strong><span>${p.kind==='engine'?'From your game':label(p.fen.split(' ')[1])+' to move · '+(p.line.length>1?'Find & follow through':'One move')}</span><span class="card-action">${r?'Practice again':'Try this position'} →</span></button>`;
            }).join('') : `<div class="empty-practice"><h3>${this.filter==='mistakes'?'A place for your learning moments':'Nothing due yet'}</h3><p>${empty}</p></div>`;
            if (['recommended','all','fresh'].includes(this.filter)) {
                const cards = Object.entries(PuzzleLevels).map(([level, settings]) => `<button class="puzzle-card" data-generate="${level}"><span class="puzzle-card-top"><span>Thinking ahead</span><span>Fresh each time</span></span><span class="puzzle-card-icon" aria-hidden="true">♞</span><strong>${level[0].toUpperCase()+level.slice(1)} challenge</strong><span>${settings.moves} moves to find · New positions checked by Stockfish</span><span class="card-action">Generate a new challenge →</span></button>`).join('');
                const collection = document.getElementById('puzzleCollection');
                if (this.filter==='fresh') collection.innerHTML=cards;
                else collection.insertAdjacentHTML('afterbegin',cards);
            }
            document.getElementById('skillProgress').innerHTML=Object.entries(SKILLS).map(([key,skill])=>{
                const s=this.store.stats(key);
                return `<div class="skill-card"><h3>${skill.name}</h3><p>${s.seen ? `<strong>${s.independent}/${s.seen}</strong> first encounters solved independently` : 'Try a new position to set your starting point.'}</p><p>${s.reviews} concepts recalled on a later day</p></div>`;
            }).join('');
        }
        onMode(mode) {
            this.mode=mode; document.body.dataset.learningMode=mode;
            const copy={play:['YOUR BOARD. YOUR PACE.','Make your next move.','Play both sides, open a PGN, or continue any position against the bot. When you finish, review the game move by move.'],puzzles:['SMALL CHALLENGES. LASTING SKILLS.','Build your chess instincts.','Practice anytime. Start with a fresh puzzle, revisit a mistake, or check what you remember.']};
            const intro=document.getElementById('modeIntro'); intro.hidden=!copy[mode];
            if(copy[mode]) ['modeEyebrow','modeTitle','modeDescription'].forEach((id,i)=>document.getElementById(id).textContent=copy[mode][i]);
            document.getElementById('practiceShortcut').hidden=mode==='puzzles';
            document.getElementById('puzzlesMode').style.display=mode==='puzzles'?'':'none';
            document.getElementById('studyMenu').open=false;
            document.querySelectorAll('.mode-tab').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));
            if(mode==='puzzles') this.renderHub();
            if(mode==='coach') { this.showGameCard(); this.onTurn(); }
            this.notice();
        }
        showGameCard() {
            if(this.mode==='coach') this.app.panel.refresh();
            return true;
        }
        capture(md) {
            if(this.momentsThisGame>=3 || md.cpLoss<180 || !md.bestMove) return;
            const g=new Chess(md.fenBefore); const best=g.move(moveObject(md.bestMove)); if(!best) return;
            let skill='calculation';
            if(g.in_checkmate()) skill='mate';
            else if(best.captured && !g.moves({verbose:true}).some(m=>m.to===best.to && m.captured)) skill='safety';
            const id='moment-'+md.fenBefore.replace(/[^a-z0-9]/gi,'')+'-'+md.bestMove;
            if(this.store.addMoment({id,family:id,title:'Rethink move '+md.san,skill,kind:'engine',fen:md.fenBefore,line:[md.bestMove],prompt:'Find a strong alternative to the move you played. Check your opponent’s reply.',created:Date.now()})) this.momentsThisGame++;
            this.notice();
        }
        resetGame() { this.nextQuiz=4+Math.floor(Math.random()*3);this.quizCount=0;this.momentsThisGame=0;this.hintLevel=0;this.hintFen=null; }
        onTurn() {
            const app=this.app;
            if(this.mode!=='coach'||this.session||app.thinking||app.over||app.pending||app.retry||!app.analysisEngine.ready||!app._atEnd()||app.game.turn()!==app.playerColor) return;
            const count=app.moveData.filter(m=>m.isPlayer).length;
            if(count<this.nextQuiz||this.quizCount>=2||!app.cachedEval?.bestMove) return;
            this.quizCount++;this.nextQuiz=count+4+Math.floor(Math.random()*3);
            const fen=app.game.fen();
            this.open({id:'quiz-'+fen.replace(/[^a-z0-9]/gi,''),family:'quiz-'+fen,kind:'engine',skill:'calculation',title:'Your move. What’s your idea?',fen,line:[app.cachedEval.bestMove],prompt:'Find a strong move in your current position. This is a practice board—your game will stay exactly where it is.'},'quiz');
        }
        async getEngine() {
            if(!this.enginePromise) {
                const engine = new StockfishEngine('practice');
                this.engine = engine;
                const pending = this.withTimeout(engine.init(),12000).then(()=>engine).catch(e=>{
                    engine.destroy();
                    if(this.engine === engine) this.enginePromise=null;
                    throw e;
                });
                this.enginePromise = pending;
            }
            return this.enginePromise;
        }
        async withTimeout(promise,ms=8000) {
            let timer;try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The engine took too long.')),ms);})]);}finally{clearTimeout(timer);}
        }
        async evaluate(fen) { const engine=await this.getEngine();return this.withTimeout(engine.evaluate(fen,12,800)); }
        async openGenerated(difficulty='challenging') {
            if (this.session || !PuzzleLevels[difficulty]) return;
            this.preferredDifficulty=difficulty;
            const title=difficulty[0].toUpperCase()+difficulty.slice(1)+' · Fresh challenge';
            await this.open({id:'generating',kind:'generated',difficulty,skill:'calculation',fen:new Chess().fen(),line:[],loading:true,title,prompt:'Finding a legal position with a meaningful combination. You can close this search at any time.'});
            const s=this.session;
            if (!s || !s.puzzle.loading) return;
            const engine=new StockfishEngine('generator');
            this.generatorEngine=engine;
            try {
                await this.withTimeout(engine.init(),12000);
                if(this.session!==s)return;
                const checkedEngine={
                    evaluate:(...args)=>this.withTimeout(engine.evaluate(...args)),
                    evaluateMultiPV:(...args)=>this.withTimeout(engine.evaluateMultiPV(...args))
                };
                const generator=new PuzzleGenerator(checkedEngine,this.store.data.recent);
                const result=await generator.generate(difficulty,()=>this.session!==s,n=>{
                    if(this.session===s)this.feedback(`Checking position ${n}… Looking for a ${PuzzleLevels[difficulty].moves}-move continuation.`);
                });
                if(this.session!==s||!result)return;
                s.puzzle={id:'generated-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),kind:'generated',skill:'calculation',difficulty,fen:result.fen,line:result.solution,title,prompt:`Find ${PuzzleLevels[difficulty].moves} strong moves against the best replies. Calculate checks, captures and threats.`,explanation:'You followed the strongest continuation against the engine’s defense. Review the line and notice how both sides respond.',created:Date.now()};
                s.game=new Chess(result.fen);s.busy=false;
                this.store.addGenerated(s.puzzle);this.notice();
                document.getElementById('puzzlePrompt').textContent=s.puzzle.prompt;
                this.feedback('Your new position is ready. Find the full idea.');this.renderBoard();
            } catch (_) {
                if(this.session===s){s.failed=true;s.busy=false;this.feedback('No verified challenge was found in this search. Try another fresh challenge. Nothing has been scored.','error');document.getElementById('puzzleNext').hidden=false;document.getElementById('puzzleNext').textContent='Try a fresh challenge';this.renderBoard();}
            } finally {engine.destroy();if(this.generatorEngine===engine)this.generatorEngine=null;}
        }
        async open(puzzle,source='practice') {
            if(!puzzle||this.session) return;
            const game=new Chess(puzzle.fen);
            const s=this.session={puzzle:{...puzzle,line:[...puzzle.line]},source,game,index:0,selected:null,hints:0,errors:0,done:false,recorded:false,busy:puzzle.kind==='engine'||!!puzzle.loading,promotion:null};
            document.getElementById('puzzleContext').textContent=source==='quiz'?'SURPRISE CHECK · YOUR GAME IS PAUSED':puzzle.kind==='engine'?'A MOMENT FROM YOUR GAME':'PUZZLE PRACTICE';
            document.getElementById('puzzleTitle').textContent=puzzle.title;
            document.getElementById('puzzlePrompt').textContent=puzzle.prompt;
            document.getElementById('puzzleStep').textContent='THINK FIRST';
            document.getElementById('closePuzzle').textContent=source==='quiz'?'Skip & resume':'Close';
            document.getElementById('closePuzzle').setAttribute('aria-label',source==='quiz'?'Skip quiz and resume game':'Close puzzle');
            document.getElementById('puzzleNext').textContent=source==='quiz'?'Continue game':'Next fresh challenge';
            document.getElementById('puzzleReview').hidden=true;
            document.getElementById('puzzleNext').hidden=true;
            document.getElementById('puzzleHint').textContent='Give me a clue';
            document.getElementById('puzzleHint').hidden=false;document.getElementById('puzzleReveal').hidden=false;
            document.getElementById('puzzlePromotion').hidden=true;
            document.getElementById('puzzleSaveNote').textContent='Take your time. Hints count as guided practice.';
            this.feedback(s.busy?'Preparing this position…':'Start with your own idea. You can ask for a clue anytime.');
            this.renderBoard(); this.dialog.showModal();
            if(s.busy && !puzzle.loading) {
                try {
                    s.baseline=await this.evaluate(puzzle.fen);
                    if(this.session!==s) return;
                    const g=new Chess(puzzle.fen);
                    if(!s.baseline.bestMove||!g.move(moveObject(s.baseline.bestMove))) throw Error('No legal analysis');
                    s.puzzle.line=[s.baseline.bestMove];s.busy=false;
                    this.feedback('The position is ready. What would you play?');this.renderBoard();
                }catch(_){if(this.session===s){s.failed=true;s.busy=false;this.feedback('Analysis is unavailable right now. Close this position and try again, or practice a collection puzzle. No result has been recorded.','error');this.renderBoard();}}
            }
        }
        close() {
            const s=this.session;if(!s)return;
            if(!s.recorded&&(s.errors||s.hints)) this.record(false);
            // Abort this worker if a check is in flight; never let two UCI searches overlap.
            if(s.busy&&this.engine){this.engine.destroy();this.enginePromise=null;}
            if(this.generatorEngine)this.generatorEngine.destroy();
            this.session=null;this.dialog.close();
            if(this.mode==='puzzles')this.renderHub();
            if(s.source==='quiz'){this.app._clearArrows();this.showGameCard();document.getElementById('chessboard').setAttribute('tabindex','-1');document.getElementById('chessboard').focus();}
        }
        feedback(text,type='') { const el=document.getElementById('puzzleFeedback');el.textContent=text;el.className='puzzle-feedback '+type; }
        renderBoard() {
            const s=this.session;if(!s)return;
            const display=s.review?new Chess(s.review.positions[s.review.index]):s.game;
            const black=s.puzzle.fen.split(' ')[1]==='b';const el=document.getElementById('puzzleBoard');
            const focus=document.activeElement?.dataset.square;
            const legal=s.selected?s.game.moves({square:s.selected,verbose:true}).map(m=>m.to):[];
            let html='';
            for(let r=0;r<8;r++)for(let f=0;f<8;f++){
                const rank=black?r+1:8-r,file=black?7-f:f,sq=String.fromCharCode(97+file)+rank,p=display.get(sq);
                const name=p?`${label(p.color)} ${NAMES[p.type]}`:'empty';
                html+=`<button class="learning-square ${(file+rank)%2?'light':'dark'} ${s.selected===sq?'selected':''} ${legal.includes(sq)?'possible':''}" data-square="${sq}" aria-label="${sq}, ${name}" aria-pressed="${s.selected===sq}" ${s.busy||s.done||s.failed?'disabled':''}><span class="learning-piece ${p?.color==='w'?'white-piece':'black-piece'}" aria-hidden="true">${p?`<img src="https://upload.wikimedia.org/wikipedia/commons/${PIECE_IMAGES[p.color+p.type]}" alt="" draggable="false">`:''}</span>${f===0?`<span class="learning-rank">${rank}</span>`:''}${r===7?`<span class="learning-file">${String.fromCharCode(97+file)}</span>`:''}</button>`;
            }
            el.innerHTML=html;if(focus)el.querySelector(`[data-square="${focus}"]`)?.focus();
            document.getElementById('puzzleTurn').textContent=s.done?'Position reviewed':label(s.game.turn())+' to move'+(s.puzzle.line.length>1?' · Find the whole idea':'');
            document.getElementById('puzzleHint').disabled=!!(s.busy||s.failed||s.promotion);
            document.getElementById('puzzleReveal').disabled=!!(s.busy||s.failed||s.promotion);
        }
        select(square) {
            const s=this.session;if(!s||s.busy||s.done||s.failed||s.promotion)return;
            if(s.selected) {
                const moves=s.game.moves({square:s.selected,verbose:true}).filter(m=>m.to===square);
                if(moves.length){if(moves[0].promotion){s.promotion={from:s.selected,to:square};document.getElementById('puzzlePromotion').hidden=false;this.renderBoard();document.querySelector('[data-promotion]').focus();return;}this.submit(moves[0]);return;}
            }
            const p=s.game.get(square);s.selected=p?.color===s.game.turn()?square:null;this.renderBoard();
        }
        async submit(input) {
            const s=this.session;if(!s||s.busy||s.done||s.failed)return;
            const before=s.game.fen(),move=s.game.move(input);if(!move)return;
            s.selected=null;s.reply=null;s.busy=true;this.renderBoard();
            let correct=false;
            try {
                if(s.puzzle.kind==='generated') {
                    correct=uciOf(move)===s.puzzle.line[s.index] || await this.checkGeneratedAlternative(s,before,uciOf(move));
                } else if(s.puzzle.kind==='engine') {
                    if(s.game.in_checkmate())correct=true;
                    else if(uciOf(move)===s.puzzle.line[0])correct=true;
                    else {
                        const after=await this.evaluate(s.game.fen());if(this.session!==s)return;
                        // Evaluation is from the side to move, so the reply score is negated.
                        if(s.baseline.mate>0)correct=after.mate<0;
                        else if(s.baseline.mate<0)correct=after.mate===null || after.mate<=0 || after.mate>=Math.abs(s.baseline.mate)-1;
                        else correct=after.mate<0 || (after.mate==null && (s.baseline.score || 0)+(after.score || 0)<=60);
                        s.reply=after.pv?.[0] || after.bestMove;
                    }
                } else correct=s.game.in_checkmate() || uciOf(move)===s.puzzle.line[s.index];
                if(this.session!==s)return;
                if(!correct) {
                    s.game.undo();s.errors++;s.busy=false;
                    let message=s.puzzle.skill==='mate'?'That move is not checkmate. Check every escape square and possible capture.':'That move doesn’t complete this challenge. Try another idea, or ask for a clue.';
                    if(s.reply){const g=new Chess(before);g.move(input);const reply=g.move(moveObject(s.reply));if(reply)message=`After ${move.san}, your opponent can play ${reply.san}. Compare that reply with another candidate move.`;}
                    this.feedback(message,'try-again');this.renderBoard();return;
                }
                s.index++;
                if(s.puzzle.kind!=='engine'&&!s.game.in_checkmate()&&s.index<s.puzzle.line.length) {
                    const lesson=moveLesson(move,s.game);
                    const reply=s.game.move(moveObject(s.puzzle.line[s.index++]));
                    s.busy=false;this.feedback(`${lesson} Your opponent replied ${reply.san}. Find the continuation (${Math.ceil(s.index/2)} of ${Math.ceil(s.puzzle.line.length/2)} moves found).`,'success');
                    document.getElementById('puzzleStep').textContent='FOLLOW THROUGH';this.renderBoard();return;
                }
                s.busy=false;this.finish(true, s.game.in_checkmate() && uciOf(move)!==s.puzzle.line[s.index-1] ? `${move.san} is checkmate. The king is in check with no legal escape, block, or capture. Your alternative works too.` : undefined);
            }catch(_){if(this.session===s){s.game.load(before);s.busy=false;this.feedback('The engine could not check that move. Try again; this attempt has not been scored.','error');this.renderBoard();}}
        }
        async checkGeneratedAlternative(s,fen,move) {
            const engine=await this.getEngine(),level=PuzzleLevels[s.puzzle.difficulty];
            const evaluate=(position,moves=[])=>this.withTimeout(engine.evaluate(position,level.depth,level.time,moves));
            const best=await evaluate(fen);
            if(this.session!==s)return false;
            const candidate=move===best.bestMove?best:await evaluate(fen,[move]);
            if(this.session!==s)return false;
            s.reply=candidate.pv?.[1];
            const good=move===best.bestMove || (best.mate!=null
                ? best.mate>0 && candidate.mate>0 && candidate.mate<=best.mate
                : candidate.mate!=null ? candidate.mate>0 : candidate.score>=best.score-35);
            if(!good)return false;
            const game=new Chess(s.game.fen()),line=[move];
            const required=level.moves*2-1-s.index;
            while(line.length<required&&!game.game_over()) {
                const result=await evaluate(game.fen());
                if(this.session!==s)return false;
                const moves=result.pv?.length?result.pv:[result.bestMove];
                let count=0;
                for(const next of moves) {
                    if(!next||!game.move(moveObject(next)))break;
                    line.push(next);count++;
                    if(line.length>=required||game.game_over())break;
                }
                if(!count)throw Error('No verified continuation');
            }
            s.puzzle.line=[...s.puzzle.line.slice(0,s.index),...line];
            return true;
        }
        hint() {
            const s=this.session;if(!s||s.done||s.busy||s.failed)return;s.hints++;
            const move=moveObject(s.puzzle.line[s.index]||s.puzzle.line[0]);
            const p=s.game.get(move.from);
            if(s.hints===1){
                const trial=new Chess(s.game.fen()),candidate=trial.move(move);
                const clue=s.game.in_check()?'You are in check. Compare captures, blocks and king moves before attacking.':candidate?.captured?'Compare the available captures. Count the opponent’s recaptures before deciding what you gain.':trial.in_check()?'Look for a forcing check. Calculate how the opponent can escape, block or capture.':'Compare candidate moves and calculate the opponent’s strongest reply to each. Which continuation keeps your advantage?';
                this.feedback(s.puzzle.clue||clue);
            }
            else if(s.hints===2)this.feedback(`Look closely at your ${p?NAMES[p.type]:'piece'} on ${move.from}.`);
            else { const g=new Chess(s.game.fen()),m=g.move(move);this.feedback(`Try ${m?.san||move.from+'–'+move.to}. Play it, then look for your opponent’s response.`); }
            document.getElementById('puzzleHint').textContent=s.hints<2?'Another clue':'Show a move hint';
            document.getElementById('puzzleSaveNote').textContent='Guided practice · revisit this idea tomorrow without hints.';
        }
        async reveal() {
            const s=this.session;if(!s||s.done||s.busy||s.failed)return;s.hints++;
            s.game=new Chess(s.puzzle.fen);const moves=[];
            const line=s.puzzle.kind==='engine'?(s.baseline?.pv?.slice(0,3)||s.puzzle.line):s.puzzle.line;
            for(const uci of line){const move=s.game.move(moveObject(uci));if(!move)break;moves.push(move.san);}
            this.finish(false,`One line to study: ${moves.join(' → ')}. ${s.puzzle.kind==='engine'?'Notice the opponent’s reply before choosing your move.':s.puzzle.explanation}`);
        }
        record(solved) {
            const s=this.session;if(!s||s.recorded)return;s.recorded=true;
            // Keep live quizzes as future reviews, too; they are independent of the game result.
            if(s.source==='quiz') {
                s.puzzle.id='moment-'+s.puzzle.id;s.puzzle.family=s.puzzle.id;s.puzzle.title='Your Coach Play check';
                this.store.addMoment({...s.puzzle,kind:'engine',created:Date.now()});
            }
            this.store.record(s.puzzle,{solved,hints:s.hints,errors:s.errors,source:s.source});this.notice();
        }
        finish(solved,message) {
            const s=this.session;s.done=true;s.busy=false;this.record(solved);
            const independent=solved&&!s.hints&&!s.errors;
            const g=new Chess(s.puzzle.fen);const line=(s.baseline?.pv?.slice(0,3)||s.puzzle.line).map(uci=>g.move(moveObject(uci))?.san).filter(Boolean).join(' → ');
            this.feedback(message || (s.puzzle.kind==='engine'?`A strong choice. One engine line is ${line}. There can be more than one good move. Pay attention to the opponent’s reply.`:s.puzzle.explanation),'success');
            document.getElementById('puzzleStep').textContent=independent?'SOLVED WITHOUT HELP':solved?'IDEA COMPLETED':'LINE TO REMEMBER';
            document.getElementById('puzzleSaveNote').textContent=independent?'Saved as an independent solve. Return on a later day to check what sticks.':'Saved as guided practice. Your next review is tomorrow.';
            document.getElementById('puzzleHint').hidden=true;document.getElementById('puzzleReveal').hidden=true;document.getElementById('puzzleNext').hidden=false;
            document.getElementById('closePuzzle').textContent=s.source==='quiz'?'Resume game':'Close';this.renderBoard();document.getElementById('puzzleNext').focus();
            this.buildReview();
        }
        buildReview() {
            const s=this.session,game=new Chess(s.puzzle.fen);
            const positions=[game.fen()],notes=['Starting position. Before revealing the first move, predict the opponent’s strongest reply.'];
            const values={p:1,n:3,b:3,r:5,q:9,k:0},color=game.turn();
            const material=()=>game.board().flat().reduce((sum,p)=>sum+(p?values[p.type]*(p.color===color?1:-1):0),0);
            const before=material();
            for(const u of (s.puzzle.kind==='engine'?s.baseline?.pv||s.puzzle.line:s.puzzle.line)){
                const move=game.move(moveObject(u));if(!move)break;
                positions.push(game.fen());notes.push(moveLesson(move,game));
                if(positions.length>=12)break;
            }
            const gain=material()-before;
            const result=game.in_checkmate()?'The line ends in checkmate.':gain>0?`Across this line, your net material improves by ${gain} point${gain===1?'':'s'} (pawn = 1, minor piece = 3, rook = 5, queen = 9).`:'The aim is to preserve your advantage through the opponent’s strongest replies, not just find the first move.';
            s.review={positions,notes,index:1<positions.length?1:0,result};
            document.getElementById('puzzleReview').hidden=false;
            this.stepReview(0);
        }
        stepReview(direction) {
            const s=this.session;if(!s?.review)return;
            const r=s.review;r.index=Math.max(0,Math.min(r.positions.length-1,r.index+direction));
            document.getElementById('puzzleReviewNote').textContent=`${r.index} / ${r.positions.length-1}: ${r.notes[r.index]} ${r.index===r.positions.length-1?r.result:''}`;
            document.getElementById('puzzleReviewPrev').disabled=r.index===0;
            document.getElementById('puzzleReviewNext').disabled=r.index===r.positions.length-1;
            this.renderBoard();
        }
        gameHint() {
            if(this.app.thinking||this.app.over||!this.app._atEnd())return;
            const fen=this.app.game.fen();if(fen!==this.hintFen){this.hintFen=fen;this.hintLevel=0;}
            this.hintLevel++;
            const uci=this.app.cachedEval?.bestMove;if(!uci)return;
            const g=new Chess(fen),m=g.move(moveObject(uci));if(!m)return;
            const message=this.hintLevel===1?'Look for checks, captures, and threats. Which of your pieces need protection?':this.hintLevel===2?`Consider your ${NAMES[m.piece]} on ${m.from}. Where could it be useful?`:`One strong move is ${m.san}. What could your opponent play in reply?`;
            this.app.panel.hint(this.hintLevel<3?`${message} Press Hint again for a more specific clue.`:message,this.hintLevel<3?'A clue, then your turn':'Move hint');
        }
    }
    window.LearningController=LearningController;
    window.ChessLearning={CATALOG,LearningStore,DAY,moveObject};
})();

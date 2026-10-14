// coach.js — Comprehensive Chess Coach with Position Analysis
// Provides thorough move explanations with tactical & positional reasoning,
// game-phase detection (opening/midgame/endgame), and opening book recognition.

/* ── Constants ── */
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const PIECE_NAME  = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PIECE_ICON  = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
const CENTER          = new Set(['d4','d5','e4','e5']);
const EXTENDED_CENTER = new Set(['c3','c4','c5','c6','d3','d4','d5','d6','e3','e4','e5','e6','f3','f4','f5','f6']);
const FILES = 'abcdefgh';

/* ── Opening Book (SAN sequence → name) ── */
const OPENINGS = {
    'e4':'King\'s Pawn Opening','d4':'Queen\'s Pawn Opening','Nf3':'Réti Opening','c4':'English Opening','f4':'Bird\'s Opening',
    'e4 e5':'Open Game','e4 c5':'Sicilian Defense','e4 e6':'French Defense','e4 c6':'Caro-Kann Defense',
    'e4 d5':'Scandinavian Defense','e4 d6':'Pirc Defense','e4 g6':'Modern Defense','e4 Nf6':'Alekhine\'s Defense',
    'd4 d5':'Closed Game','d4 Nf6':'Indian Defense','d4 f5':'Dutch Defense',
    'd4 d5 c4':'Queen\'s Gambit','d4 d5 c4 dxc4':'Queen\'s Gambit Accepted','d4 d5 c4 e6':'Queen\'s Gambit Declined',
    'd4 d5 c4 c6':'Slav Defense','d4 Nf6 c4':'Indian Game','d4 Nf6 c4 g6':'King\'s Indian Defense',
    'd4 Nf6 c4 e6':'Indian Systems','d4 Nf6 c4 e6 Nc3 Bb4':'Nimzo-Indian Defense',
    'd4 Nf6 c4 e6 Nf3 b6':'Queen\'s Indian Defense','d4 Nf6 c4 c5':'Benoni Defense',
    'd4 Nf6 c4 g6 Nc3 d5':'Grünfeld Defense',
    'e4 e5 Nf3':'King\'s Knight Opening','e4 e5 Nf3 Nc6':'Open Game — Main Line',
    'e4 e5 Nf3 Nc6 Bb5':'Ruy López (Spanish Opening)','e4 e5 Nf3 Nc6 Bc4':'Italian Game',
    'e4 e5 Nf3 Nc6 Bc4 Bc5':'Giuoco Piano','e4 e5 Nf3 Nc6 Bc4 Nf6':'Two Knights Defense',
    'e4 e5 Nf3 Nc6 d4':'Scotch Game','e4 e5 Nf3 Nf6':'Petrov\'s Defense',
    'e4 e5 f4':'King\'s Gambit','e4 e5 Nc3':'Vienna Game',
    'e4 c5 Nf3 d6':'Sicilian — Najdorf/Classical','e4 c5 Nf3 d6 d4':'Open Sicilian',
    'e4 c5 Nf3 Nc6':'Sicilian — Old Sicilian','e4 c5 Nf3 e6':'Sicilian — Kan/Taimanov',
    'e4 c5 Nc3':'Closed Sicilian','e4 e6 d4 d5':'French Defense — Main Line',
    'e4 c6 d4 d5':'Caro-Kann — Main Line','e4 d5 exd5 Qxd5':'Scandinavian — Queen Recapture',
    'c4 e5':'English — Reversed Sicilian','Nf3 d5 g3':'King\'s Indian Attack',
    'e4 e5 Nf3 Nc6 Bb5 a6':'Ruy López — Morphy Defense',
    'e4 e5 Nf3 Nc6 Bb5 a6 Ba4':'Ruy López — Closed',
    'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3':'Open Sicilian — Najdorf/Classical',
};

/* ══════════════════════════════════════════════════════════════
   Attack‐square helpers (no chess.js dependency for raw attacks)
   ══════════════════════════════════════════════════════════════ */
function sq2rc(sq) { return [sq.charCodeAt(0) - 97, +sq[1] - 1]; }
function rc2sq(f, r) { return String.fromCharCode(97 + f) + (r + 1); }
function onBoard(f, r) { return f >= 0 && f <= 7 && r >= 0 && r <= 7; }

function buildBoardMap(game) {
    const m = {};
    for (let r = 1; r <= 8; r++) for (let f = 0; f < 8; f++) {
        const sq = rc2sq(f, r - 1);
        const p = game.get(sq);
        if (p) m[sq] = p;
    }
    return m;
}

function scanDirs(sq, dirs, bm) {
    const [f0, r0] = sq2rc(sq);
    const out = [];
    for (const [df, dr] of dirs) {
        let f = f0 + df, r = r0 + dr;
        while (onBoard(f, r)) {
            const s = rc2sq(f, r);
            out.push(s);
            if (bm[s]) break;          // blocked
            f += df; r += dr;
        }
    }
    return out;
}

function getAttacks(type, sq, color, bm) {
    const [f, r] = sq2rc(sq);
    switch (type) {
        case 'n': {
            const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
            return offsets.map(([df,dr]) => [f+df,r+dr]).filter(([f,r]) => onBoard(f,r)).map(([f,r]) => rc2sq(f,r));
        }
        case 'b': return scanDirs(sq, [[1,1],[1,-1],[-1,1],[-1,-1]], bm);
        case 'r': return scanDirs(sq, [[0,1],[0,-1],[1,0],[-1,0]], bm);
        case 'q': return scanDirs(sq, [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]], bm);
        case 'k': {
            const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            return offsets.map(([df,dr]) => [f+df,r+dr]).filter(([f,r]) => onBoard(f,r)).map(([f,r]) => rc2sq(f,r));
        }
        case 'p': {
            const dir = color === 'w' ? 1 : -1;
            return [[-1,dir],[1,dir]].map(([df,dr]) => [f+df,r+dr]).filter(([f,r]) => onBoard(f,r)).map(([f,r]) => rc2sq(f,r));
        }
    }
    return [];
}

/* ══════════════════════════════════════════════════════════════
   ChessCoach
   ══════════════════════════════════════════════════════════════ */
class ChessCoach {
    constructor() {
        this.thresholds = { great: 10, good: 35, inaccuracy: 90, mistake: 200 };
    }

    /* ─── Classification ─── */
    classifyMove(cpLoss, isBest, isSacrifice, isMate) {
        if (isMate)               return 'brilliant';
        if (isBest && isSacrifice) return 'brilliant';
        if (isBest || cpLoss <= this.thresholds.great)  return 'best';
        if (cpLoss <= this.thresholds.good)              return 'great';
        if (cpLoss <= this.thresholds.inaccuracy)        return 'good';
        if (cpLoss <= this.thresholds.mistake)           return 'inaccuracy';
        if (cpLoss <= 500)                                return 'mistake';
        return 'blunder';
    }
    color(c) {
        return {brilliant:'#1bada6',best:'#96bc4b',great:'#5c8bb0',good:'#96bc4b',
                book:'#a88865',inaccuracy:'#e6a827',mistake:'#e68427',blunder:'#ca3431'}[c]||'#888';
    }
    icon(c) {
        return {brilliant:'💎',best:'⭐',great:'👍',good:'✅',book:'📖',
                inaccuracy:'⚠️',mistake:'❌',blunder:'💀'}[c]||'•';
    }
    titleLabel(c) {
        return {brilliant:'💎 Brilliant Move!',best:'⭐ Best Move!',great:'👍 Great Move!',good:'✅ Good Move',
                inaccuracy:'⚠️ Inaccuracy',mistake:'❌ Mistake',blunder:'💀 Blunder!'}[c] || c;
    }

    /* ══════════════════════════════════════════════════════════
       Main entry: analyse a player's move
       ══════════════════════════════════════════════════════════ */
    analyzePlayerMove({ fenBefore, move, bestMoveUci, isBestMove, cpLoss, evalBefore, evalAfter, gameHistory, gameFen }) {
        const cl          = this.classifyMove(cpLoss, isBestMove, false, move.san && move.san.includes('#'));
        const phase       = this.detectPhase(fenBefore, gameHistory ? gameHistory.length + 1 : 1);
        const opening     = phase === 'opening' ? this.matchOpening(gameHistory || [], move.san) : null;
        const moveEffects = this.analyzeMoveEffects(fenBefore, move);
        let bestEffects   = null;
        const playerUci   = move.from + move.to + (move.promotion || '');
        if (bestMoveUci && bestMoveUci !== playerUci) {
            bestEffects = this.analyzeBestMove(fenBefore, bestMoveUci);
        }
        const message     = this.generateMainMessage(cl, move, moveEffects, bestEffects, phase, opening, cpLoss, evalAfter);
        const suggestion  = bestEffects && ['inaccuracy','mistake','blunder'].includes(cl)
                          ? this.generateSuggestion(bestEffects) : null;
        const phaseLabel  = this.phaseLabel(phase, opening);
        const phaseTip    = this.generatePhaseTip(phase, fenBefore, move, gameHistory ? gameHistory.length : 0);

        return { classification: cl, title: this.titleLabel(cl), message, suggestion, phase, phaseLabel, phaseTip };
    }

    /* ─── Phase detection ─── */
    detectPhase(fen, totalMoves) {
        const g = new Chess(fen);
        let mat = { w: 0, b: 0 }, queens = 0;
        for (let r = 1; r <= 8; r++) for (let f = 0; f < 8; f++) {
            const p = g.get(rc2sq(f, r - 1));
            if (!p || p.type === 'k') continue;
            mat[p.color] += PIECE_VALUE[p.type];
            if (p.type === 'q') queens++;
        }
        const total = mat.w + mat.b;
        if (totalMoves <= 14 && total > 55) return 'opening';
        if (total <= 24 || (queens === 0 && total <= 38)) return 'endgame';
        return 'midgame';
    }

    /* ─── Opening book ─── */
    matchOpening(history, currentSan) {
        const full = [...history, currentSan];
        for (let len = full.length; len > 0; len--) {
            const key = full.slice(0, len).join(' ');
            if (OPENINGS[key]) return OPENINGS[key];
        }
        return null;
    }

    phaseLabel(phase, opening) {
        if (phase === 'opening') return '🏁 Opening' + (opening ? ` — ${opening}` : '');
        if (phase === 'midgame') return '⚔️ Middlegame';
        return '👑 Endgame';
    }

    /* ══════════════════════════════════════════════════════════
       Analyse what a move does on the board
       ══════════════════════════════════════════════════════════ */
    analyzeMoveEffects(fen, moveObj) {
        const pre  = new Chess(fen);
        const preBm = buildBoardMap(pre);

        // Make the move
        pre.move({ from: moveObj.from, to: moveObj.to, promotion: moveObj.promotion });
        const postBm = buildBoardMap(pre);
        const enemyColor = moveObj.color === 'w' ? 'b' : 'w';
        const startRank = moveObj.color === 'w' ? '1' : '8';

        // Attacks from the new square
        const attacks = getAttacks(moveObj.piece, moveObj.to, moveObj.color, postBm);

        // Pieces threatened
        const threats = attacks
            .filter(sq => postBm[sq] && postBm[sq].color === enemyColor)
            .map(sq => ({ square: sq, type: postBm[sq].type, name: PIECE_NAME[postBm[sq].type], value: PIECE_VALUE[postBm[sq].type] }));

        // Fork detection
        const valuableThreats = threats.filter(t => t.value >= 3);
        const isForking = valuableThreats.length >= 2;

        // Center squares controlled
        const centerCtrl = attacks.filter(sq => CENTER.has(sq));

        // Development?
        const isDev = moveObj.piece !== 'p' && moveObj.piece !== 'k' && moveObj.from[1] === startRank;

        // Open file detection for rooks
        let opensFile = null;
        if (moveObj.piece === 'p') {
            // Moving a pawn might open a file for a rook
            const file = moveObj.from[0];
            let pawnOnFile = false;
            for (let r = 1; r <= 8; r++) {
                const p = postBm[file + r];
                if (p && p.type === 'p' && p.color === moveObj.color) { pawnOnFile = true; break; }
            }
            if (!pawnOnFile) opensFile = file;
        }

        // Was the moved piece previously attacked?  (simple heuristic)
        // Check if an enemy piece attacks the from-square
        let wasInDanger = false;
        for (const sq of Object.keys(preBm)) {
            const p = preBm[sq];
            if (p && p.color === enemyColor) {
                const att = getAttacks(p.type, sq, p.color, preBm);
                if (att.includes(moveObj.from)) { wasInDanger = true; break; }
            }
        }

        // Discovered attack: did moving open a line for another friendly piece?
        let discoveredThreats = [];
        // Check if any friendly sliding piece now has new squares along the vacated line
        const friendlySliders = Object.entries(postBm).filter(([s,p]) => p.color === moveObj.color && ['b','r','q'].includes(p.type) && s !== moveObj.to);
        for (const [sq, p] of friendlySliders) {
            const newAttacks = getAttacks(p.type, sq, p.color, postBm);
            const oldAttacks = getAttacks(p.type, sq, p.color, preBm);
            const fresh = newAttacks.filter(s => !oldAttacks.includes(s));
            const freshThreats = fresh.filter(s => postBm[s] && postBm[s].color === enemyColor);
            freshThreats.forEach(s => discoveredThreats.push({ from: sq, fromPiece: p.type, target: s, targetPiece: postBm[s].type }));
        }

        // Count total development for the side
        let undeveloped = 0;
        for (let f = 0; f < 8; f++) {
            const sq = rc2sq(f, startRank === '1' ? 0 : 7);
            const p = postBm[sq];
            if (p && p.color === moveObj.color && (p.type === 'n' || p.type === 'b')) undeveloped++;
        }

        // King castled?
        const isCastle = moveObj.flags && (moveObj.flags.includes('k') || moveObj.flags.includes('q'));
        const castleSide = moveObj.flags && moveObj.flags.includes('k') ? 'kingside' : (moveObj.flags && moveObj.flags.includes('q') ? 'queenside' : null);

        return {
            piece: moveObj.piece, pieceName: PIECE_NAME[moveObj.piece],
            from: moveObj.from, to: moveObj.to, san: moveObj.san,
            isCapture: !!moveObj.captured,
            capturedName: moveObj.captured ? PIECE_NAME[moveObj.captured] : null,
            capturedValue: moveObj.captured ? PIECE_VALUE[moveObj.captured] : 0,
            isCastle, castleSide,
            isCheck: !!(moveObj.san && (moveObj.san.includes('+') || moveObj.san.includes('#'))),
            isCheckmate: !!(moveObj.san && moveObj.san.includes('#')),
            isDevelopment: isDev,
            goesToCenter: CENTER.has(moveObj.to),
            goesToExtCenter: EXTENDED_CENTER.has(moveObj.to),
            centerCtrl,
            threats, isForking, forkTargets: valuableThreats,
            discoveredThreats,
            opensFile,
            wasInDanger,
            undeveloped,
            isPromotion: !!(moveObj.flags && moveObj.flags.includes('p')),
            color: moveObj.color,
        };
    }

    /* ─── Analyze the engine's best move ─── */
    analyzeBestMove(fen, uci) {
        try {
            const g = new Chess(fen);
            const m = g.move({ from: uci.substring(0,2), to: uci.substring(2,4), promotion: uci.length > 4 ? uci[4] : undefined });
            if (!m) return null;
            return this.analyzeMoveEffects(fen, m);
        } catch (_) { return null; }
    }

    /* ══════════════════════════════════════════════════════════
       Generate the main coaching message
       ══════════════════════════════════════════════════════════ */
    generateMainMessage(cl, move, eff, bestEff, phase, opening, cpLoss, evalAfter) {
        const parts = [];

        // ── Part 1: Describe what the player's move does ──
        parts.push(this._describeMove(eff, phase));

        // ── Part 2: Strategic / tactical explanation ──
        parts.push(this._explainEffects(eff, phase));

        // ── Part 3: Opening context ──
        if (opening) parts.push(`You're in the <strong>${opening}</strong>.`);

        // ── Part 4: If bad move, explain what went wrong and why best is better ──
        if (bestEff && ['inaccuracy','mistake','blunder'].includes(cl)) {
            parts.push(this._explainProblem(eff, bestEff, cpLoss, cl));
        }

        // ── Part 5: Phase-specific strategic note ──
        parts.push(this._phaseNote(eff, phase));

        return parts.filter(Boolean).join(' ');
    }

    /* ── Describe the move itself ── */
    _describeMove(e, phase) {
        if (e.isCheckmate) return `<strong>${e.san}</strong> delivers checkmate!`;
        if (e.isCastle) return `You castled <strong>${e.castleSide}</strong>, tucking your king to safety and connecting your rooks.`;
        if (e.isPromotion) return `You promoted your pawn to a ${e.pieceName} on ${e.to} — a new powerhouse joins the fight.`;

        if (e.isCapture && e.isDevelopment)
            return `You developed your ${e.pieceName} to ${e.to} while capturing the ${e.capturedName} — gaining material and improving your position simultaneously.`;
        if (e.isCapture)
            return `You captured the ${e.capturedName} on ${e.to} with your ${e.pieceName}.`;
        if (e.isDevelopment)
            return `You developed your ${e.pieceName} from ${e.from} to ${e.to}, bringing a new piece into the game.`;
        if (e.piece === 'p' && e.goesToCenter)
            return `You pushed your pawn to <strong>${e.to}</strong>, planting it firmly in the center.`;
        if (e.piece === 'p')
            return `You advanced your pawn to ${e.to}.`;
        if (e.wasInDanger)
            return `You moved your ${e.pieceName} from ${e.from} to ${e.to}, escaping the threat it was under.`;

        return `You moved your ${e.pieceName} from ${e.from} to ${e.to}.`;
    }

    /* ── Explain the effects (center, threats, forks, discoveries) ── */
    _explainEffects(e, phase) {
        const parts = [];

        // Center control
        if (e.centerCtrl.length > 0) {
            const sqs = e.centerCtrl.map(s => `<strong>${s}</strong>`).join(' and ');
            parts.push(`This controls the key central square${e.centerCtrl.length>1?'s':''} ${sqs}, giving your pieces more room to operate.`);
        }

        // Forks
        if (e.isForking) {
            const targets = e.forkTargets.map(t => `the ${t.name} on <strong>${t.square}</strong>`);
            parts.push(`This creates a <strong>fork</strong>, simultaneously attacking ${targets.join(' and ')}! Your opponent can only save one.`);
        } else if (e.threats.length > 0) {
            const best = e.threats.sort((a,b) => b.value - a.value)[0];
            if (best.value >= 3) {
                parts.push(`This threatens the ${best.name} on <strong>${best.square}</strong>${e.threats.length > 1 ? `, among ${e.threats.length} pieces under pressure` : ''}.`);
            } else if (best.value >= 1 && e.piece !== 'p') {
                parts.push(`This puts pressure on the pawn on <strong>${best.square}</strong>.`);
            }
        }

        // Discovered threats
        if (e.discoveredThreats.length > 0) {
            const dt = e.discoveredThreats[0];
            parts.push(`By moving, you've also unleashed a <strong>discovered attack</strong> from your ${PIECE_NAME[dt.fromPiece]} on ${dt.from} toward the ${PIECE_NAME[dt.targetPiece]} on <strong>${dt.target}</strong>.`);
        }

        // Check
        if (e.isCheck && !e.isCheckmate) {
            parts.push(`This gives <strong>check</strong>, forcing your opponent to deal with the threat to their king immediately — a tempo-gaining move.`);
        }

        // Castling benefits
        if (e.isCastle) {
            parts.push(`This dramatically improves your king safety. Your rook is now centralized and ready to control the open files.`);
        }

        // Open file for rook
        if (e.opensFile) {
            parts.push(`This opens the <strong>${e.opensFile}-file</strong>, which could be valuable for your rooks later.`);
        }

        // Development encouragement
        if (e.isDevelopment && e.undeveloped > 0 && phase === 'opening') {
            parts.push(`You still have ${e.undeveloped} minor piece${e.undeveloped>1?'s':''} to develop.`);
        }

        return parts.join(' ');
    }

    /* ── Explain what went wrong and why the best move is better ── */
    _explainProblem(playerEff, bestEff, cpLoss, cl) {
        const parts = [];
        const lossStr = (cpLoss / 100).toFixed(1);

        // Why the player's move is problematic — with human explanation
        if (cl === 'blunder') {
            parts.push(`<strong>This is a serious mistake</strong> — you're losing roughly <strong>${lossStr} pawns</strong> worth of advantage here.`);
            if (!playerEff.isCapture && !playerEff.isCheck && playerEff.threats.length === 0) {
                parts.push(`Your move doesn't create any threats, which gives your opponent a free hand to improve their position or exploit your weaknesses.`);
            }
            if (playerEff.wasInDanger && !bestEff.wasInDanger) {
                parts.push(`You moved a piece that wasn't in danger — the real problem was elsewhere on the board.`);
            }
        } else if (cl === 'mistake') {
            parts.push(`This costs about <strong>${lossStr} pawns</strong> — a noticeable swing. Let me show you why.`);
        } else {
            // Inaccuracy — give deep specific strategic diagnosis
            parts.push(`<strong>Why this is an inaccuracy:</strong> This loses ~${lossStr} pawns of initiative.`);
            if ((playerEff.to[0] === 'a' || playerEff.to[0] === 'h') && playerEff.piece === 'n') {
                parts.push(`Placing your knight on the rim (<strong>${playerEff.to}</strong>) sharply reduces its attacking scope ('a knight on the rim is dim'). In the middlegame, knights need central outposts (d4, d5, e4, e5, f5) where they control 8 squares.`);
            } else if (playerEff.wasInDanger) {
                parts.push(`Your piece was under attack, but retreating it passively here conceded board control instead of finding an active counter-threat.`);
            } else if (bestEff.piece === 'p' && bestEff.goesToCenter && playerEff.piece !== 'p') {
                parts.push(`This delays your decisive central pawn break. In the middlegame, pawn breaks crack open files for your rooks and queen.`);
            } else if (bestEff.threats.length > 0 && playerEff.threats.length === 0) {
                parts.push(`This move is overly passive. It doesn't put pressure on any enemy target or coordinate your pieces for a future attack pattern.`);
            } else if (playerEff.piece === 'r' && !playerEff.opensFile) {
                parts.push(`Rooks need open or half-open files to generate attacking pressure. Moving your rook to an obstructed file blunts its long-range power.`);
            } else if (playerEff.piece === 'b' && (playerEff.to[1] === '2' || playerEff.to[1] === '7')) {
                parts.push(`This retreats your bishop behind your own pawn chain, blunting its diagonal and slowing down your attack.`);
            } else {
                parts.push(`This coordinates your pieces sub-optimally. When organizing a middlegame attack, make sure every piece has a target (open file, outpost, or enemy pawn weakness).`);
            }
        }

        // Why the best move is better — detailed strategic/tactical reasoning
        parts.push(`The stronger continuation was <strong>${bestEff.san}</strong>.`);

        // Build a rich "here's why" explanation
        const reasons = [];

        if (bestEff.isCapture && !playerEff.isCapture) {
            reasons.push(`it wins the ${bestEff.capturedName} on ${bestEff.to} (worth ${bestEff.capturedValue} point${bestEff.capturedValue>1?'s':''}), gaining material you left on the table`);
        } else if (bestEff.isCapture && playerEff.isCapture && bestEff.capturedValue > playerEff.capturedValue) {
            reasons.push(`it captures a more valuable piece — the ${bestEff.capturedName} (${bestEff.capturedValue} pts) instead of the ${playerEff.capturedName} (${playerEff.capturedValue} pts)`);
        }

        if (bestEff.isForking) {
            const targets = bestEff.forkTargets.map(t => `the ${t.name} on <strong>${t.square}</strong>`);
            reasons.push(`it creates a devastating <strong>fork</strong>, attacking ${targets.join(' and ')} at the same time — your opponent can only save one`);
        }

        if (bestEff.discoveredThreats.length > 0 && playerEff.discoveredThreats.length === 0) {
            const dt = bestEff.discoveredThreats[0];
            reasons.push(`it unleashes a <strong>discovered attack</strong> from your ${PIECE_NAME[dt.fromPiece]} toward the ${PIECE_NAME[dt.targetPiece]} on ${dt.target} — a two-for-one tactic`);
        }

        if (bestEff.isCheck && !playerEff.isCheck) {
            reasons.push(`it gives <strong>check</strong>, a forcing move that gains tempo — your opponent must respond to the king threat before doing anything else`);
        }

        if (bestEff.isDevelopment && !playerEff.isDevelopment) {
            reasons.push(`it develops a piece into the action, improving your army's coordination`);
        }

        if (bestEff.isCastle && !playerEff.isCastle) {
            reasons.push(`castling was urgent here — your king is exposed in the center and could be targeted as the position opens up`);
        }

        if (bestEff.centerCtrl.length > playerEff.centerCtrl.length) {
            reasons.push(`it seizes stronger central control, the backbone of any strong position`);
        }

        if (bestEff.threats.length > playerEff.threats.length && bestEff.threats.some(t => t.value >= 3)) {
            const topThreat = bestEff.threats.sort((a,b) => b.value - a.value)[0];
            reasons.push(`it creates a concrete threat against the ${topThreat.name} on ${topThreat.square}, keeping the pressure on`);
        }

        // Explain why player's move specifically fails
        if (playerEff.threats.length === 0 && bestEff.threats.length > 0 && cl !== 'inaccuracy') {
            reasons.push(`unlike your move, it creates active threats rather than leaving your opponent with no pressure to deal with`);
        }

        if (reasons.length > 0) {
            parts.push(`<strong>Here's why it's better:</strong> ${reasons[0]}${reasons.length > 1 ? '. Additionally, ' + reasons.slice(1).join('. Also, ') : ''}.`);
        }

        return parts.join(' ');
    }

    /* ── Phase-specific note ── */
    _phaseNote(e, phase) {
        if (phase === 'opening') {
            if (e.piece === 'q' && e.isDevelopment) return '⚠️ Be cautious with early queen moves — your queen can be chased around, losing tempo.';
            if (e.piece === 'p' && !e.goesToCenter && !e.goesToExtCenter && !e.isCapture) return 'In the opening, prioritize center pawns (d & e files) unless you have a specific plan for flank pawns.';
            if (e.undeveloped >= 3) return 'Tip: Try to develop all your minor pieces before launching an attack.';
            return '';
        }
        if (phase === 'midgame') {
            if (e.piece === 'r' && e.opensFile) return 'Good instinct — rooks thrive on open files where they can penetrate into the enemy position.';
            if (e.threats.length === 0 && !e.isCapture && !e.isCheck && !e.isCastle) return 'Try to make moves that <em>improve</em> your position while <em>creating threats</em> — idle moves let your opponent seize the initiative.';
            return '';
        }
        if (phase === 'endgame') {
            if (e.piece === 'k') return 'Excellent — in the endgame, an active king is worth roughly 4 pawns. Keep it centralized!';
            if (e.piece === 'p') return 'Pawn advances in the endgame can be decisive. Passed pawns are the key to winning.';
            if (e.piece === 'r') return 'Rooks are strongest when active: on open files, or behind passed pawns (yours or the opponent\'s).';
            return '';
        }
        return '';
    }

    /* ─── Suggestion line for bad moves ─── */
    generateSuggestion(bestEff) {
        let s = `Better was <strong>${bestEff.san}</strong>`;
        if (bestEff.isCapture) s += ` — winning the ${bestEff.capturedName}`;
        else if (bestEff.isCheck) s += ' — with check';
        else if (bestEff.isForking) s += ' — creating a fork';
        else if (bestEff.isDevelopment) s += ' — developing a piece';
        else if (bestEff.isCastle) s += ' — securing the king';
        else if (bestEff.centerCtrl.length > 0) s += ' — strengthening central control';
        return s;
    }

    /* ══════════════════════════════════════════════════════════
       Phase-specific tips (shown below coaching card)
       ══════════════════════════════════════════════════════════ */
    generatePhaseTip(phase, fen, move, moveCount) {
        if (phase === 'opening') {
            const tips = [
                '💡 <strong>Opening principle:</strong> Develop your pieces toward the center — knights to f3/c3 (or f6/c6), bishops to active diagonals. Castle before move 10.',
                '💡 <strong>Opening principle:</strong> Don\'t move the same piece twice unless forced. Every tempo counts in the opening.',
                '💡 <strong>Opening principle:</strong> "Knights before bishops" — knights have fewer good squares, so develop them first to claim the best posts.',
                '💡 <strong>Opening principle:</strong> Avoid moving pawns beyond the center in the opening. Each pawn move is a tempo not spent developing.',
                '💡 <strong>Opening principle:</strong> Connect your rooks by developing all your minor pieces and castling. Connected rooks support each other.',
                '💡 <strong>Opening principle:</strong> Don\'t bring your queen out early — it can be chased by enemy minor pieces, losing valuable time.',
            ];
            return tips[moveCount % tips.length];
        }
        if (phase === 'midgame') {
            const tips = [
                '💡 <strong>Midgame strategy:</strong> Before each move, ask "Checks, Captures, Threats" (CCT). Look for forcing moves first.',
                '💡 <strong>Midgame strategy:</strong> Place rooks on open or semi-open files. Doubled rooks on an open file can be devastating.',
                '💡 <strong>Midgame strategy:</strong> Knights are strongest on outposts — squares in the enemy half protected by your pawns where no enemy pawn can attack.',
                '💡 <strong>Midgame strategy:</strong> Identify weak pawns (isolated, doubled, backward) and target them. They\'re permanent weaknesses.',
                '💡 <strong>Midgame strategy:</strong> Coordinate your pieces toward a single goal: attack the king, target a weakness, or prepare a pawn break.',
                '💡 <strong>Midgame strategy:</strong> A bishop pair is strong in open positions. If you have both bishops, try to open the position with pawn trades.',
            ];
            return tips[Math.floor(Math.random() * tips.length)];
        }
        if (phase === 'endgame') {
            const tips = [
                '💡 <strong>Endgame mastery:</strong> Activate your king! In the endgame, the king is a fighting piece worth ~4 pawns. Centralize it.',
                '💡 <strong>Endgame mastery:</strong> Passed pawns must be pushed. A passed pawn supported by the king is often unstoppable.',
                '💡 <strong>Endgame mastery:</strong> In rook endgames, cut off the enemy king with your rook — file or rank. Activity beats material.',
                '💡 <strong>Endgame mastery:</strong> "The opposition" — if kings face each other with one square between, the side NOT to move has the opposition (advantage).',
                '💡 <strong>Endgame mastery:</strong> Trade pieces (not pawns) when ahead in material. Trade pawns (not pieces) when behind — fewer pawns = more drawing chances.',
                '💡 <strong>Endgame mastery:</strong> Rooks belong behind passed pawns, whether they\'re yours or your opponent\'s. This maximizes their activity.',
            ];
            return tips[Math.floor(Math.random() * tips.length)];
        }
        return '';
    }

    /* ── Eval display ── */
    scoreToBarPct(score, mate) {
        if (mate != null) return mate > 0 ? 96 : 4;
        const p = score / 100;
        return Math.max(2, Math.min(98, 50 + 50 * (2 / (1 + Math.exp(-0.4 * p)) - 1)));
    }
}


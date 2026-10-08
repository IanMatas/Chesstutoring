// coach.js — Comprehensive Chess Coach with Position Analysis
// Provides thorough move explanations with tactical & positional reasoning,
// game-phase detection (opening/midgame/endgame), and opening book recognition.

/* ── Constants ── */
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const PIECE_NAME  = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PIECE_ICON  = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
const CENTER          = new Set(['d4','d5','e4','e5']);
const EXTENDED_CENTER = new Set(['c3','c4','c5','c6','d3','d4','d5','d6','e3','e4','e5','e6','f3','f4','f5','f6']);
const KINGSIDE_SQ     = new Set(['f1','g1','h1','f2','g2','h2','f3','g3','h3','f8','g8','h8','f7','g7','h7','f6','g6','h6']);
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
    formatEval(score, mate) {
        if (mate != null) return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
        const p = (score / 100).toFixed(1);
        return score >= 0 ? `+${p}` : p;
    }
    scoreToBarPct(score, mate) {
        if (mate != null) return mate > 0 ? 96 : 4;
        const p = score / 100;
        return Math.max(2, Math.min(98, 50 + 50 * (2 / (1 + Math.exp(-0.4 * p)) - 1)));
    }

    /* ══════════════════════════════════════════════════════════
       PLAYER RATING ESTIMATION
       Estimates rating from accuracy % and move quality distribution.
       Calibrated against chess.com/lichess accuracy-to-rating curves.
       ══════════════════════════════════════════════════════════ */
    estimateRating(moveData) {
        const playerMoves = moveData.filter(m => m.isPlayer && m.classification);
        if (playerMoves.length < 3) return { rating: null, accuracy: 0, acpl: 0, confidence: 'low' };

        // Average centipawn loss
        const totalCpLoss = playerMoves.reduce((sum, m) => sum + (m.cpLoss || 0), 0);
        const acpl = totalCpLoss / playerMoves.length;

        // Accuracy % (chess.com style: based on win probability preservation)
        const accuracy = Math.max(0, Math.min(100, 100 - (acpl * 0.75)));

        // Move quality counts
        const counts = {};
        playerMoves.forEach(m => { counts[m.classification] = (counts[m.classification] || 0) + 1; });

        // Rating estimation from ACPL (calibrated curve)
        // ACPL → Estimated Rating mapping:
        // ACPL 10 → ~2400, ACPL 25 → ~2000, ACPL 50 → ~1600, ACPL 80 → ~1200, ACPL 120+ → ~800, ACPL 200+ → ~400
        let rating;
        if (acpl <= 5)        rating = 2600;
        else if (acpl <= 10)  rating = 2400 + (10 - acpl) * 40;
        else if (acpl <= 20)  rating = 2100 + (20 - acpl) * 30;
        else if (acpl <= 35)  rating = 1800 + (35 - acpl) * 20;
        else if (acpl <= 55)  rating = 1500 + (55 - acpl) * 15;
        else if (acpl <= 80)  rating = 1200 + (80 - acpl) * 12;
        else if (acpl <= 120) rating = 900 + (120 - acpl) * 7.5;
        else if (acpl <= 200) rating = 500 + (200 - acpl) * 5;
        else                  rating = 400;

        // Adjust for blunder/mistake ratio
        const blunderRate = (counts.blunder || 0) / playerMoves.length;
        const mistakeRate = (counts.mistake || 0) / playerMoves.length;
        const brilliantBonus = (counts.brilliant || 0) * 25;
        rating -= blunderRate * 300;
        rating -= mistakeRate * 150;
        rating += brilliantBonus;

        rating = Math.round(Math.max(400, Math.min(2800, rating)));

        // Confidence based on move count
        const confidence = playerMoves.length >= 20 ? 'high' : playerMoves.length >= 10 ? 'medium' : 'low';

        // Rating tier label
        const tier = rating >= 2200 ? 'Master' : rating >= 2000 ? 'Expert' :
                     rating >= 1800 ? 'Class A' : rating >= 1600 ? 'Class B' :
                     rating >= 1400 ? 'Class C' : rating >= 1200 ? 'Class D' :
                     rating >= 1000 ? 'Beginner+' : 'Beginner';

        return { rating, accuracy: Math.round(accuracy * 10) / 10, acpl: Math.round(acpl), confidence, tier, counts, totalMoves: playerMoves.length };
    }

    /* ══════════════════════════════════════════════════════════
       WEAKNESS ANALYSIS
       Tracks performance per game phase and identifies areas to improve.
       ══════════════════════════════════════════════════════════ */
    analyzeWeaknesses(moveData) {
        const phases = { opening: [], midgame: [], endgame: [] };
        moveData.filter(m => m.isPlayer && m.classification).forEach(m => {
            if (m.phase && phases[m.phase]) phases[m.phase].push(m);
        });

        const phaseStats = {};
        for (const [phase, moves] of Object.entries(phases)) {
            if (moves.length === 0) { phaseStats[phase] = null; continue; }
            const acpl = moves.reduce((s, m) => s + (m.cpLoss || 0), 0) / moves.length;
            const accuracy = Math.max(0, Math.min(100, 100 - (acpl * 0.75)));
            const blunders = moves.filter(m => m.classification === 'blunder').length;
            const mistakes = moves.filter(m => m.classification === 'mistake').length;
            const good = moves.filter(m => ['brilliant','best','great','good'].includes(m.classification)).length;
            phaseStats[phase] = { acpl: Math.round(acpl), accuracy: Math.round(accuracy), blunders, mistakes, good, total: moves.length };
        }

        // Find weakest phase
        let weakest = null, worstAccuracy = 101;
        for (const [phase, stats] of Object.entries(phaseStats)) {
            if (stats && stats.accuracy < worstAccuracy) {
                worstAccuracy = stats.accuracy;
                weakest = phase;
            }
        }

        // Generate improvement suggestions
        const suggestions = [];
        if (phaseStats.opening && phaseStats.opening.acpl > 40) {
            suggestions.push({ phase: 'opening', icon: '🏁', text: 'Study common openings to improve your early game. Focus on developing pieces and controlling the center.' });
        }
        if (phaseStats.midgame && phaseStats.midgame.blunders > 1) {
            suggestions.push({ phase: 'midgame', icon: '⚔️', text: 'Practice tactical puzzles! Your midgame has too many blunders — look for checks, captures, and threats before each move.' });
        }
        if (phaseStats.endgame && phaseStats.endgame.acpl > 50) {
            suggestions.push({ phase: 'endgame', icon: '👑', text: 'Study endgame fundamentals. Focus on king activity, pawn promotion paths, and rook positioning.' });
        }
        if (suggestions.length === 0 && weakest) {
            const phaseLabels = { opening: 'opening theory', midgame: 'tactical awareness', endgame: 'endgame technique' };
            suggestions.push({ phase: weakest, icon: weakest === 'opening' ? '🏁' : weakest === 'midgame' ? '⚔️' : '👑',
                text: `Your weakest area is ${phaseLabels[weakest]}. Head to the Learning Center to practice!` });
        }

        return { phaseStats, weakest, suggestions };
    }

    /* ══════════════════════════════════════════════════════════
       DEEP ANALYSIS — explains WHY moves matter strategically
       Covers: square control, future plans, piece coordination,
       king safety implications, pawn structure, attack preparation
       ══════════════════════════════════════════════════════════ */
    generateDeepAnalysis(fenBefore, move, moveEffects, bestEffects, phase, evalAfter) {
        const sections = [];
        const eff = moveEffects;
        const post = new Chess(fenBefore);
        post.move({ from: move.from, to: move.to, promotion: move.promotion });

        // 1. Square significance — what does landing on this square accomplish?
        const sqSig = this._analyzeSquareSignificance(eff, phase, post);
        if (sqSig) sections.push({ title: '📍 Why This Square?', content: sqSig });

        // 2. What the piece controls from here
        const control = this._analyzeControl(eff, post);
        if (control) sections.push({ title: '🎯 Board Control', content: control });

        // 3. Future plans — what can happen next?
        const plans = this._analyzeFuturePlans(eff, phase, post);
        if (plans) sections.push({ title: '🔮 Future Plans', content: plans });

        // 4. If bad move — why the best is strategically superior
        if (bestEffects && bestEffects.san) {
            const compare = this._analyzeComparison(eff, bestEffects, phase);
            if (compare) sections.push({ title: '⚖️ Best Move Advantage', content: compare });
        }

        // 5. King safety assessment
        const kingSafety = this._assessKingSafety(post, eff.color);
        if (kingSafety) sections.push({ title: '🏰 King Safety', content: kingSafety });

        // 6. Pawn structure evaluation
        const pawnStructure = this._assessPawnStructure(post, eff.color);
        if (pawnStructure) sections.push({ title: '🧱 Pawn Structure', content: pawnStructure });

        return sections;
    }

    _analyzeSquareSignificance(eff, phase, game) {
        const parts = [];
        const sq = eff.to;
        const file = sq[0], rank = +sq[1];

        if (CENTER.has(sq)) {
            parts.push(`<strong>${sq}</strong> is a central square — the most powerful position on the board. Pieces here radiate influence in all directions and limit opponent mobility.`);
        } else if (EXTENDED_CENTER.has(sq)) {
            parts.push(`<strong>${sq}</strong> is in the extended center. While not as dominant as d4/d5/e4/e5, it still provides good influence over the board's most contested territory.`);
        }

        if (eff.piece === 'n' && (rank >= 4 && rank <= 6)) {
            // Check if it's an outpost (no enemy pawns can attack it)
            const enemyColor = eff.color === 'w' ? 'b' : 'w';
            const pawnDir = enemyColor === 'w' ? 1 : -1;
            const adjFiles = [String.fromCharCode(file.charCodeAt(0)-1), String.fromCharCode(file.charCodeAt(0)+1)].filter(f => f >= 'a' && f <= 'h');
            let canBeKicked = false;
            for (const f of adjFiles) {
                for (let r = rank; r >= 1 && r <= 8; r += pawnDir) {
                    const p = game.get(f + r);
                    if (p && p.type === 'p' && p.color === enemyColor) { canBeKicked = true; break; }
                }
            }
            if (!canBeKicked) {
                parts.push(`This is a powerful <strong>outpost</strong> — no enemy pawn can ever attack this knight here! It will dominate from this square.`);
            }
        }

        if (eff.piece === 'b') {
            const diagonalReach = getAttacks('b', sq, eff.color, buildBoardMap(game)).length;
            if (diagonalReach >= 5) parts.push(`From ${sq}, your bishop commands <strong>${diagonalReach} diagonal squares</strong> — a very active post with long-range influence.`);
        }

        if (eff.piece === 'r') {
            // Check if on open/semi-open file
            let friendlyPawns = 0, enemyPawns = 0;
            for (let r = 1; r <= 8; r++) {
                const p = game.get(file + r);
                if (p && p.type === 'p') { if (p.color === eff.color) friendlyPawns++; else enemyPawns++; }
            }
            if (friendlyPawns === 0 && enemyPawns === 0) parts.push(`Your rook is on the <strong>open ${file}-file</strong> — maximum activity! It can penetrate deep into enemy territory.`);
            else if (friendlyPawns === 0) parts.push(`Your rook controls the <strong>semi-open ${file}-file</strong>. Target the enemy pawn on this file.`);
        }

        if (KINGSIDE_SQ.has(sq) && phase === 'midgame' && ['n','b','q'].includes(eff.piece)) {
            parts.push(`Placing your ${eff.pieceName} on the kingside signals potential <strong>attacking intentions</strong> against the enemy king.`);
        }

        return parts.length > 0 ? parts.join(' ') : null;
    }

    _analyzeControl(eff, game) {
        const attacks = getAttacks(eff.piece, eff.to, eff.color, buildBoardMap(game));
        if (attacks.length === 0) return null;

        const parts = [];
        const center = attacks.filter(s => CENTER.has(s));
        const extCenter = attacks.filter(s => EXTENDED_CENTER.has(s));
        const enemyHalf = attacks.filter(s => {
            const r = +s[1];
            return eff.color === 'w' ? r >= 5 : r <= 4;
        });

        parts.push(`From <strong>${eff.to}</strong>, your ${eff.pieceName} attacks <strong>${attacks.length} squares</strong>.`);
        if (center.length > 0) parts.push(`It controls ${center.length} key center square${center.length > 1 ? 's' : ''} (${center.join(', ')}).`);
        if (enemyHalf.length > 3) parts.push(`<strong>${enemyHalf.length} squares</strong> reach into the enemy half — great for creating pressure.`);

        return parts.join(' ');
    }

    _analyzeFuturePlans(eff, phase, game) {
        const parts = [];

        if (phase === 'opening') {
            if (eff.isDevelopment && eff.undeveloped > 0) {
                parts.push(`Continue developing: you have <strong>${eff.undeveloped} minor piece${eff.undeveloped > 1 ? 's' : ''}</strong> still on their starting squares. Aim to castle within the next few moves.`);
            }
            if (eff.piece === 'p' && eff.goesToCenter) {
                parts.push(`This central pawn opens diagonals for your bishops. Consider developing your light-squared bishop next.`);
            }
        }

        if (phase === 'midgame') {
            if (eff.threats.length > 0) {
                const top = eff.threats.sort((a,b) => b.value - a.value)[0];
                parts.push(`Your ${eff.pieceName} threatens the <strong>${top.name}</strong> on ${top.square}. Your opponent must respond, giving you the <strong>initiative</strong> — the ability to dictate play.`);
            }
            if (eff.isForking) {
                parts.push(`The fork creates a <strong>forcing sequence</strong> — your opponent must lose material. Calculate which piece they'll save and plan accordingly.`);
            }
            if (eff.centerCtrl.length > 0 && !eff.isCapture) {
                parts.push(`Strengthening center control opens future possibilities: piece invasions, pawn breaks, and king attacks all flow from central dominance.`);
            }
        }

        if (phase === 'endgame') {
            if (eff.piece === 'k') {
                parts.push(`Your king's activity is crucial now. March it toward the center or toward passed pawns. An active king can support pawn promotion or restrict the enemy king.`);
            }
            if (eff.piece === 'p') {
                const rank = +eff.to[1];
                const promoRank = eff.color === 'w' ? 8 : 1;
                const distToPromo = Math.abs(promoRank - rank);
                if (distToPromo <= 3) {
                    parts.push(`Your pawn is <strong>${distToPromo} square${distToPromo > 1 ? 's' : ''}</strong> from promotion! Your opponent must deal with this immediately or face a new queen.`);
                }
            }
        }

        return parts.length > 0 ? parts.join(' ') : null;
    }

    _analyzeComparison(playerEff, bestEff, phase) {
        const parts = [];

        // Material comparison
        const playerMaterialGain = playerEff.isCapture ? playerEff.capturedValue : 0;
        const bestMaterialGain = bestEff.isCapture ? bestEff.capturedValue : 0;
        if (bestMaterialGain > playerMaterialGain) {
            parts.push(`<strong>${bestEff.san}</strong> wins ${bestMaterialGain > playerMaterialGain + 2 ? 'significantly ' : ''}more material (${bestEff.capturedName} = ${bestMaterialGain} pts).`);
        }

        // Tactical comparison
        if (bestEff.isForking && !playerEff.isForking) {
            parts.push(`It creates a <strong>fork</strong> that your move missed — attacking ${bestEff.forkTargets.map(t => `the ${t.name}`).join(' and ')} simultaneously.`);
        }
        if (bestEff.isCheck && !playerEff.isCheck) {
            parts.push(`It gives <strong>check</strong>, which is a <em>tempo move</em> — forcing your opponent to react before they can execute their own plan.`);
        }

        // Positional comparison
        if (bestEff.centerCtrl.length > playerEff.centerCtrl.length) {
            parts.push(`It controls <strong>${bestEff.centerCtrl.length - playerEff.centerCtrl.length} more central squares</strong>, establishing superior positional control.`);
        }

        if (bestEff.threats.length > playerEff.threats.length) {
            parts.push(`It creates <strong>${bestEff.threats.length} threat${bestEff.threats.length > 1 ? 's' : ''}</strong> vs. your move's ${playerEff.threats.length} — more active and forcing.`);
        }

        return parts.length > 0 ? parts.join(' ') : null;
    }

    _assessKingSafety(game, color) {
        const bm = buildBoardMap(game);
        const kingSq = Object.entries(bm).find(([s, p]) => p.type === 'k' && p.color === color);
        if (!kingSq) return null;

        const [sq] = kingSq;
        const rank = +sq[1];
        const file = sq[0];
        const castled = (color === 'w' && (file === 'g' || file === 'c') && rank === 1) ||
                        (color === 'b' && (file === 'g' || file === 'c') && rank === 8);

        // Check pawn shield
        const pawnShieldDir = color === 'w' ? 1 : -1;
        const shieldRank = rank + pawnShieldDir;
        let shieldPawns = 0;
        for (const f of [String.fromCharCode(file.charCodeAt(0)-1), file, String.fromCharCode(file.charCodeAt(0)+1)]) {
            if (f >= 'a' && f <= 'h') {
                const p = bm[f + shieldRank];
                if (p && p.type === 'p' && p.color === color) shieldPawns++;
            }
        }

        if (castled && shieldPawns >= 2) return `Your king is <strong>well-protected</strong> behind a solid pawn shield. ✅`;
        if (castled && shieldPawns === 1) return `Your king is castled but the pawn shield has <strong>holes</strong>. Watch for pawn storms or piece sacrifices on the weak squares. ⚠️`;
        if (!castled && rank >= 2 && rank <= 7) return `Your king is in the <strong>center</strong> — vulnerable to attacks from both flanks. Castle as soon as possible! ⚠️`;
        return null;
    }

    _assessPawnStructure(game, color) {
        const bm = buildBoardMap(game);
        const myPawns = Object.entries(bm).filter(([s, p]) => p.type === 'p' && p.color === color);
        if (myPawns.length === 0) return null;

        const issues = [];
        const pawnFiles = {};
        myPawns.forEach(([sq]) => {
            const f = sq[0];
            pawnFiles[f] = (pawnFiles[f] || 0) + 1;
        });

        // Doubled pawns
        const doubled = Object.entries(pawnFiles).filter(([f, c]) => c >= 2);
        if (doubled.length > 0) {
            issues.push(`<strong>Doubled pawns</strong> on the ${doubled.map(([f]) => f).join(', ')}-file${doubled.length > 1 ? 's' : ''} — they can't protect each other and become targets.`);
        }

        // Isolated pawns
        myPawns.forEach(([sq]) => {
            const f = sq[0];
            const adjFiles = [String.fromCharCode(f.charCodeAt(0)-1), String.fromCharCode(f.charCodeAt(0)+1)].filter(af => af >= 'a' && af <= 'h');
            const hasNeighbor = adjFiles.some(af => pawnFiles[af]);
            if (!hasNeighbor) issues.push(`<strong>Isolated pawn</strong> on ${f}-file — no friendly pawns on adjacent files to protect it. A long-term weakness.`);
        });

        if (issues.length === 0) return `Your pawn structure is <strong>healthy</strong> — no doubled or isolated pawns. ✅`;
        return issues.slice(0, 2).join(' ');
    }

    /* ══════════════════════════════════════════════════════════
       HUMAN INSTRUCTOR — CURRENT BOARD SITUATION
       Breaks down targets, king safety, and pawn breaks in plain English
       ══════════════════════════════════════════════════════════ */
    getBoardSituation(fen, color = 'w') {
        const game = new Chess(fen);
        const bm = buildBoardMap(game);
        const oppColor = color === 'w' ? 'b' : 'w';

        // 1. Weak & Vulnerable Enemy Targets
        const targets = [];
        const oppPawns = Object.entries(bm).filter(([s, p]) => p.type === 'p' && p.color === oppColor);
        
        // Check f7/f2
        const keySq = oppColor === 'b' ? 'f7' : 'f2';
        const keyP = bm[keySq];
        if (keyP && keyP.type === 'p') {
            targets.push({
                square: keySq,
                badge: 'Crucial Target',
                title: `Vulnerable ${keySq.toUpperCase()} Pawn`,
                desc: `The ${keySq} pawn is the weakest square in the opponent's camp because only the enemy king protects it. Ideal for bishop and knight attacks!`
            });
        }

        // Check undefended pawns
        oppPawns.forEach(([sq, p]) => {
            if (sq === keySq) return;
            const f = sq[0];
            const hasNeighbor = oppPawns.some(([os]) => {
                const of = os[0];
                return Math.abs(of.charCodeAt(0) - f.charCodeAt(0)) === 1;
            });
            if (!hasNeighbor) {
                targets.push({
                    square: sq,
                    badge: 'Isolated Target',
                    title: `Isolated ${sq.toUpperCase()} Pawn`,
                    desc: `No adjacent pawns can defend this pawn on ${sq.toUpperCase()}. Put your rooks and knights directly opposite it to win it.`
                });
            } else if (sq === 'e5' || sq === 'd5' || sq === 'e4' || sq === 'd4') {
                targets.push({
                    square: sq,
                    badge: 'Central Target',
                    title: `Central ${sq.toUpperCase()} Pawn`,
                    desc: `Opponent's central stake on ${sq.toUpperCase()} can be undermined with pawn breaks and piece pressure.`
                });
            }
        });

        // 2. King Safety Breakdown
        const myKingSafety = this._assessKingSafety(game, color) || (color === 'w' ? 'Your king is relatively secure.' : 'Your king is relatively secure.');
        const oppKingSafety = this._assessKingSafety(game, oppColor) || 'Opponent king is managing its defenses.';

        // 3. Pawn Levers
        let pawnBreakAdvice = '';
        if (color === 'w') {
            const moves = game.moves({ verbose: true });
            const hasD4 = moves.some(m => m.san.startsWith('d4'));
            const hasE4 = moves.some(m => m.san.startsWith('e4'));
            const hasC4 = moves.some(m => m.san.startsWith('c4'));
            if (hasD4) pawnBreakAdvice = "Pushing <strong>d4</strong> is your primary central lever to blast open diagonals and files for your pieces.";
            else if (hasE4) pawnBreakAdvice = "Pushing <strong>e4</strong> claims the central space and opens diagonals for your bishop.";
            else if (hasC4) pawnBreakAdvice = "Striking with <strong>c4</strong> challenges the center from the flank.";
            else pawnBreakAdvice = "Coordinate your rooks and knights to prepare a decisive central pawn push.";
        } else {
            const moves = game.moves({ verbose: true });
            const hasD5 = moves.some(m => m.san.startsWith('d5'));
            const hasE5 = moves.some(m => m.san.startsWith('e5'));
            const hasC5 = moves.some(m => m.san.startsWith('c5'));
            if (hasD5) pawnBreakAdvice = "Striking with <strong>...d5</strong> is your counter-punch in the center.";
            else if (hasC5) pawnBreakAdvice = "Challenging with <strong>...c5</strong> puts counter-pressure on White's d4 pawn.";
            else if (hasE5) pawnBreakAdvice = "Pushing <strong>...e5</strong> stakes your claim on central squares.";
            else pawnBreakAdvice = "Keep your pawn shield solid and prepare a counter-break.";
        }

        return {
            targets: targets.slice(0, 3),
            myKingSafety,
            oppKingSafety,
            pawnBreakAdvice
        };
    }

    /* ══════════════════════════════════════════════════════════
       HUMAN INSTRUCTOR — FUTURE ATTACK VARIATIONS
       Converts engine PV lines into 2-3 human-instructed plan possibilities
       ══════════════════════════════════════════════════════════ */
    explainVariations(fen, pvLines, color = 'w', lastPlayedMove = null) {
        if (!pvLines || pvLines.length === 0) {
            return this._generateFallbackVariations(fen, color);
        }

        const variations = [];
        const seenFirstMoves = new Set();

        pvLines.forEach((line, idx) => {
            if (!line || !line.pv || line.pv.length === 0) return;
            const uciFirst = line.pv[0];
            if (seenFirstMoves.has(uciFirst)) return;
            seenFirstMoves.add(uciFirst);

            const tempG = new Chess(fen);
            const positions = [fen];
            const moves = [];
            const slice = line.pv.slice(0, 5);

            for (let i = 0; i < slice.length; i++) {
                const u = slice[i];
                if (!u || u.length < 4) break;
                const m = tempG.move({ from: u.substring(0, 2), to: u.substring(2, 4), promotion: u.length > 4 ? u[4] : undefined });
                if (!m) break;
                positions.push(tempG.fen());

                let stepNote = '';
                if (m.captured) {
                    stepNote = `Captures ${PIECE_NAME[m.captured]} on ${m.to}, winning material`;
                } else if (m.san.includes('+')) {
                    stepNote = `Checks the enemy king with tempo!`;
                } else if (m.san.includes('#')) {
                    stepNote = `Delivers checkmate!`;
                } else if (m.piece === 'p' && (m.to === 'd4' || m.to === 'd5' || m.to === 'e4' || m.to === 'e5')) {
                    stepNote = `Claims the center with a powerful pawn break`;
                } else if (m.piece === 'n') {
                    stepNote = `Maneuvers knight to ${m.to.toUpperCase()} for active outpost pressure`;
                } else if (m.piece === 'b') {
                    stepNote = `Develops bishop to ${m.to.toUpperCase()}, pinning or targeting enemy pieces`;
                } else if (m.piece === 'q') {
                    stepNote = `Brings queen to ${m.to.toUpperCase()} to create dual threats`;
                } else if (m.piece === 'r') {
                    stepNote = `Centralizes rook on the ${m.to[0]}-file for future file control`;
                } else if (m.san.startsWith('O-O')) {
                    stepNote = `Tucks king safely away and activates the rook`;
                } else {
                    stepNote = `Advances to ${m.to.toUpperCase()} to support the plan`;
                }

                moves.push({
                    step: i + 1,
                    san: m.san,
                    from: m.from,
                    to: m.to,
                    piece: m.piece,
                    color: m.color,
                    captured: m.captured,
                    note: stepNote,
                    fen: tempG.fen()
                });
            }

            if (moves.length === 0) return;

            // Determine thematic human title & why this path is better
            const firstM = moves[0];
            let themeIcon = '⚔️';
            let themeTitle = `Variation ${idx + 1}: ${firstM.san}`;
            let targetPawn = 'enemy position';
            let whyBetter = '';

            const movesSans = moves.map(m => m.san).join(' ');

            if (movesSans.includes('d4') || movesSans.includes('d5') || movesSans.includes('c4') || movesSans.includes('c5')) {
                themeIcon = '⚡';
                themeTitle = `Plan ${String.fromCharCode(65 + idx)}: Central Pawn Breakthrough (${firstM.san})`;
                targetPawn = 'Central Squares & Open Files';
                whyBetter = `This variation blows open the center. By striking with ${firstM.san}, you shatter Black's pawn coordination, opening direct lanes for your queen and rooks to dominate the board.`;
            } else if (movesSans.includes('f7') || movesSans.includes('f2') || movesSans.includes('Ng5') || movesSans.includes('Ng4') || movesSans.includes('Bc4') || movesSans.includes('Bc5')) {
                themeIcon = '🔥';
                themeTitle = `Plan ${String.fromCharCode(65 + idx)}: Kingside Pawn Assault on Weakest Square (${firstM.san})`;
                targetPawn = 'The Vulnerable f7/f2 Weakness';
                whyBetter = `This variation coordinates pieces to target the opponent's most fragile pawn. In 2-3 moves, your pieces combine forces so the opponent cannot defend both threats without giving up major material.`;
            } else if (movesSans.includes('O-O') || movesSans.includes('Nf3') || movesSans.includes('Nf6') || movesSans.includes('Nc3') || movesSans.includes('Nc6')) {
                themeIcon = '🛡️';
                themeTitle = `Plan ${String.fromCharCode(65 + idx)}: Rapid Mobilization & Safe King (${firstM.san})`;
                targetPawn = 'Piece Dominance & King Safety';
                whyBetter = `This variation brings your pieces into harmonious coordination. Before launching a deep attack, you safeguard your king and establish outposts so your future attack has rock-solid support.`;
            } else {
                themeIcon = '🎯';
                themeTitle = `Plan ${String.fromCharCode(65 + idx)}: Tactical Pressure Line (${firstM.san})`;
                targetPawn = 'Opponent Inactive Pieces';
                whyBetter = `This variation exerts active pressure from move 1, forcing your opponent to play reactive defense while your army dictates the tempo.`;
            }

            variations.push({
                index: idx,
                icon: themeIcon,
                title: themeTitle,
                firstMoveSan: firstM.san,
                target: targetPawn,
                whyBetter,
                moves,
                positions,
                score: line.score || 0
            });
        });

        if (variations.length < 2) {
            const fallback = this._generateFallbackVariations(fen, color);
            fallback.forEach(f => {
                if (!seenFirstMoves.has(f.firstMoveSan) && variations.length < 3) {
                    variations.push(f);
                }
            });
        }

        return variations.slice(0, 3);
    }

    /* ══════════════════════════════════════════════════════════════
       BOT MOVE ANALYSIS — "Opponent's Thinking" Panel
       Breaks down WHY the bot chose its move, what threats it creates,
       and how the player should respond defensively.
       ══════════════════════════════════════════════════════════════ */
    analyzeBotMove(fenBefore, move, evalAfter, pvLines) {
        const effects = this.analyzeMoveEffects(fenBefore, move);
        const post = new Chess(fenBefore);
        post.move({ from: move.from, to: move.to, promotion: move.promotion });
        const postFen = post.fen();
        const bm = buildBoardMap(post);
        const botColor = move.color;
        const playerColor = botColor === 'w' ? 'b' : 'w';
        const phase = this.detectPhase(fenBefore, 10);

        // ── 1. What the bot's move does ──
        const whatItDoes = this._describeBotMove(effects, phase);

        // ── 2. Why the bot chose this move (strategic reasoning) ──
        const whyChosen = this._explainBotReasoning(effects, phase, post, botColor);

        // ── 3. Threats created — what the bot is now attacking ──
        const threatsCreated = this._analyzeBotThreats(effects, post, botColor, playerColor);

        // ── 4. Bot's likely next plans ──
        const futurePlans = this._analyzeBotFuturePlans(effects, phase, post, botColor, pvLines);

        // ── 5. Defensive advice for the player ──
        const defensiveAdvice = this._generateDefensiveAdvice(effects, post, botColor, playerColor, phase);

        // ── 6. Danger level assessment ──
        const dangerLevel = this._assessDangerLevel(effects, post, playerColor);

        return {
            whatItDoes,
            whyChosen,
            threatsCreated,
            futurePlans,
            defensiveAdvice,
            dangerLevel,
            effects,
            phase: this.phaseLabel(phase, null)
        };
    }

    /* ── Describe what the bot's move does ── */
    _describeBotMove(e, phase) {
        if (e.isCheckmate) return `<strong>${e.san}</strong> delivers <strong>checkmate</strong>! The game is over.`;
        if (e.isCastle) return `The bot castled <strong>${e.castleSide}</strong>, securing its king behind a wall of pawns and activating its rook — a key defensive and offensive move.`;
        if (e.isPromotion) return `The bot promoted a pawn to a <strong>${e.pieceName}</strong> on ${e.to} — a devastating new piece joins the attack.`;

        if (e.isCapture && e.isCheck)
            return `The bot captured your <strong>${e.capturedName}</strong> on ${e.to} <em>with check</em> — a forcing move that wins material while attacking your king.`;
        if (e.isCapture && e.capturedValue >= 3)
            return `The bot captured your <strong>${e.capturedName}</strong> on ${e.to} with its ${e.pieceName} — winning ${e.capturedValue} points of material. This is a significant material gain.`;
        if (e.isCapture)
            return `The bot captured your <strong>${e.capturedName}</strong> on ${e.to} with its ${e.pieceName}.`;
        if (e.isCheck)
            return `The bot played <strong>${e.san}</strong>, giving <strong>check</strong> — forcing you to respond to the king threat immediately.`;
        if (e.isDevelopment)
            return `The bot developed its <strong>${e.pieceName}</strong> from ${e.from} to ${e.to}, bringing another piece into the fight.`;
        if (e.piece === 'p' && e.goesToCenter)
            return `The bot pushed its pawn to <strong>${e.to}</strong>, claiming central space and restricting your pieces.`;
        if (e.piece === 'p')
            return `The bot advanced its pawn to <strong>${e.to}</strong>.`;

        return `The bot moved its <strong>${e.pieceName}</strong> from ${e.from} to <strong>${e.to}</strong>.`;
    }

    /* ── Explain WHY the bot chose this move ── */
    _explainBotReasoning(e, phase, game, botColor) {
        const reasons = [];

        if (e.isCastle) {
            reasons.push(`The bot prioritized <strong>king safety</strong>. Castling connects the rooks and removes the king from the center where it's vulnerable to opening attacks.`);
        }

        if (e.isCapture && e.capturedValue >= 3) {
            reasons.push(`The bot seized the opportunity to <strong>win material</strong>. In chess, being up a piece (3+ points) is often a decisive advantage.`);
        }

        if (e.isForking) {
            const targets = e.forkTargets.map(t => `the ${t.name} on <strong>${t.square}</strong>`);
            reasons.push(`The bot created a <strong>fork</strong>, simultaneously attacking ${targets.join(' and ')}. You can only save one piece — this is a powerful tactical pattern to watch for.`);
        }

        if (e.isCheck) {
            reasons.push(`By giving check, the bot gains <strong>tempo</strong> — you must deal with the king threat before doing anything else, giving the bot a free move to reposition.`);
        }

        if (e.centerCtrl.length >= 2) {
            reasons.push(`This move controls <strong>${e.centerCtrl.length} central squares</strong> (${e.centerCtrl.join(', ')}), which is the strategic heart of the board. Center control = more options for attack.`);
        }

        if (e.discoveredThreats.length > 0) {
            const dt = e.discoveredThreats[0];
            reasons.push(`This unleashes a <strong>discovered attack</strong> from the ${PIECE_NAME[dt.fromPiece]} on ${dt.from} toward your ${PIECE_NAME[dt.targetPiece]} on <strong>${dt.target}</strong>. Discovered attacks are one of the most lethal tactics.`);
        }

        if (e.isDevelopment && phase === 'opening') {
            reasons.push(`The bot is following a key opening principle: <strong>develop pieces quickly</strong>. Each new piece in play increases attacking potential exponentially.`);
        }

        if (e.opensFile) {
            reasons.push(`This opens the <strong>${e.opensFile}-file</strong>, creating a highway for the bot's rooks to penetrate into your position.`);
        }

        if (e.threats.length > 0 && !e.isForking) {
            const top = e.threats.sort((a,b) => b.value - a.value)[0];
            if (top.value >= 3) {
                reasons.push(`The bot is threatening your <strong>${top.name}</strong> on ${top.square}. This forces you to respond, giving the bot the <strong>initiative</strong>.`);
            }
        }

        if (e.piece === 'n' && e.goesToExtCenter) {
            reasons.push(`The bot placed its knight in the extended center — knights are most powerful when centralized, controlling up to 8 squares.`);
        }

        if (e.piece === 'r') {
            reasons.push(`Rook moves signal the bot is preparing for the <strong>middlegame battle</strong>. Rooks need open files to be effective, and this move prepares that.`);
        }

        if (reasons.length === 0) {
            if (phase === 'opening') reasons.push(`The bot is methodically building its position, following opening principles to prepare for the middlegame.`);
            else if (phase === 'midgame') reasons.push(`The bot is maneuvering its pieces to improve their coordination and set up future tactical opportunities.`);
            else reasons.push(`The bot is making a positional improvement, optimizing piece placement for the endgame.`);
        }

        return reasons;
    }

    /* ── Analyze what threats the bot's move creates ── */
    _analyzeBotThreats(e, game, botColor, playerColor) {
        const threats = [];
        const bm = buildBoardMap(game);

        // Direct threats from the moved piece
        if (e.threats.length > 0) {
            e.threats.forEach(t => {
                threats.push({
                    type: t.value >= 5 ? 'critical' : t.value >= 3 ? 'serious' : 'minor',
                    icon: t.value >= 5 ? '🔴' : t.value >= 3 ? '🟠' : '🟡',
                    piece: t.name,
                    square: t.square,
                    desc: `Your <strong>${t.name}</strong> on ${t.square.toUpperCase()} is under attack by the bot's ${e.pieceName}. ${t.value >= 5 ? 'This is a high-value piece — losing it would be devastating!' : t.value >= 3 ? 'Losing a minor piece shifts the balance of power.' : 'A pawn is at risk.'}`
                });
            });
        }

        // Check for forks
        if (e.isForking) {
            threats.push({
                type: 'critical',
                icon: '⚡',
                piece: 'Fork',
                square: e.to,
                desc: `<strong>FORK!</strong> The bot's ${e.pieceName} on ${e.to} attacks multiple pieces at once. You can only save one — evaluate which piece is more valuable to keep.`
            });
        }

        // Discovered attacks
        if (e.discoveredThreats.length > 0) {
            e.discoveredThreats.forEach(dt => {
                threats.push({
                    type: 'critical',
                    icon: '💥',
                    piece: PIECE_NAME[dt.targetPiece],
                    square: dt.target,
                    desc: `<strong>Discovered attack!</strong> The bot's ${PIECE_NAME[dt.fromPiece]} on ${dt.from} now targets your ${PIECE_NAME[dt.targetPiece]} on ${dt.target}. This was hidden behind the piece that just moved.`
                });
            });
        }

        // Check threat
        if (e.isCheck) {
            threats.push({
                type: 'critical',
                icon: '👑',
                piece: 'King',
                square: 'in check',
                desc: `<strong>Your king is in check!</strong> You must block, capture, or move your king. No other moves are legal.`
            });
        }

        // Check for potential follow-up threats from all bot pieces
        const botPieces = Object.entries(bm).filter(([s, p]) => p.color === botColor);
        let pressuredSquares = new Set();
        botPieces.forEach(([sq, p]) => {
            const attacks = getAttacks(p.type, sq, p.color, bm);
            attacks.forEach(a => {
                if (bm[a] && bm[a].color === playerColor && bm[a].type !== 'p') {
                    pressuredSquares.add(a);
                }
            });
        });

        // Count pieces under pressure not already in direct threats
        const directThreats = new Set(e.threats.map(t => t.square));
        const additionalPressure = [...pressuredSquares].filter(sq => !directThreats.has(sq));
        if (additionalPressure.length > 0 && threats.length < 4) {
            threats.push({
                type: 'info',
                icon: '🔍',
                piece: 'Pressure',
                square: 'multiple',
                desc: `The bot has <strong>${pressuredSquares.size} of your pieces</strong> under pressure across the board. Be vigilant about undefended pieces.`
            });
        }

        if (threats.length === 0) {
            threats.push({
                type: 'safe',
                icon: '✅',
                piece: 'None',
                square: '-',
                desc: `No immediate tactical threats from this move. Use this breathing room to <strong>improve your own position</strong> or prepare an attack!`
            });
        }

        return threats;
    }

    /* ── Analyze bot's likely future plans ── */
    _analyzeBotFuturePlans(e, phase, game, botColor, pvLines) {
        const plans = [];

        // Use PV lines if available to predict bot's next moves
        if (pvLines && pvLines.length > 0) {
            pvLines.forEach((line, idx) => {
                if (!line || !line.pv || line.pv.length < 2) return;
                // The PV starts from the player's perspective after bot's move
                // So pv[0] = player's best response, pv[1] = bot's next move
                const tempG = new Chess(game.fen());
                const futureSteps = [];
                const slice = line.pv.slice(0, 4);

                for (let i = 0; i < slice.length; i++) {
                    const u = slice[i];
                    if (!u || u.length < 4) break;
                    const m = tempG.move({ from: u.substring(0,2), to: u.substring(2,4), promotion: u.length > 4 ? u[4] : undefined });
                    if (!m) break;
                    futureSteps.push({
                        san: m.san,
                        color: m.color,
                        isBot: m.color === botColor,
                        note: m.color === botColor
                            ? (m.captured ? `Bot captures ${PIECE_NAME[m.captured]}` : m.san.includes('+') ? 'Bot gives check' : `Bot plays ${m.san}`)
                            : (m.captured ? `You capture ${PIECE_NAME[m.captured]}` : `Your best reply: ${m.san}`)
                    });
                }

                if (futureSteps.length >= 2) {
                    plans.push({
                        title: `Likely continuation ${idx + 1}`,
                        steps: futureSteps,
                        eval: line.score != null ? (line.score / 100).toFixed(1) : null
                    });
                }
            });
        }

        // Positional plans based on the move effects
        if (phase === 'opening') {
            if (e.undeveloped > 0) plans.push({ title: 'Development', steps: [], note: `The bot still has <strong>${e.undeveloped} undeveloped pieces</strong>. Expect it to continue bringing pieces into play, castling soon, and fighting for center control.` });
            if (!e.isCastle) plans.push({ title: 'King Safety', steps: [], note: `The bot will likely <strong>castle soon</strong> to protect its king. Watch for its castling direction — that tells you where to aim your attack.` });
        }
        if (phase === 'midgame') {
            if (e.threats.length > 0) plans.push({ title: 'Tactical Pressure', steps: [], note: `The bot is building <strong>tactical pressure</strong>. Expect follow-up moves that create double threats, pins, or discovered attacks.` });
            if (e.centerCtrl.length > 0) plans.push({ title: 'Central Dominance', steps: [], note: `The bot is establishing <strong>central control</strong>. It may use this to launch a kingside or queenside attack, or to restrict your piece mobility.` });
        }
        if (phase === 'endgame') {
            if (e.piece === 'k') plans.push({ title: 'Active King', steps: [], note: `The bot's king is becoming active — in endgames, the king is a <strong>powerful fighting piece</strong>. It's likely heading toward the center or toward passed pawns.` });
            if (e.piece === 'p') plans.push({ title: 'Pawn Promotion', steps: [], note: `The bot is advancing a pawn. Watch for it creating a <strong>passed pawn</strong> that could promote to a queen.` });
        }

        return plans.slice(0, 3);
    }

    /* ── Generate defensive advice for the player ── */
    _generateDefensiveAdvice(e, game, botColor, playerColor, phase) {
        const advice = [];

        // Immediate responses needed
        if (e.isCheck) {
            advice.push({
                priority: 'urgent',
                icon: '🚨',
                text: `You're in check! You <strong>must</strong> respond: block, capture the checking piece, or move your king. Look for responses that also improve your position.`
            });
        }

        if (e.isForking) {
            advice.push({
                priority: 'urgent',
                icon: '⚠️',
                text: `You're being forked! Evaluate which piece is more valuable. Sometimes the best defense is a <strong>counter-attack</strong> — can you create a bigger threat while saving one piece?`
            });
        }

        if (e.threats.length > 0) {
            const topThreat = e.threats.sort((a,b) => b.value - a.value)[0];
            if (topThreat.value >= 5) {
                advice.push({
                    priority: 'high',
                    icon: '🛡️',
                    text: `Your <strong>${topThreat.name}</strong> on ${topThreat.square} is under attack. Defend it, move it to a safe square, or look for a <strong>counter-threat</strong> that's bigger than what you're losing.`
                });
            } else if (topThreat.value >= 3) {
                advice.push({
                    priority: 'medium',
                    icon: '🛡️',
                    text: `Your ${topThreat.name} on ${topThreat.square} is threatened. Consider: (1) Defend it with another piece, (2) Move it to a better square, or (3) Create a counter-attack.`
                });
            }
        }

        // Strategic advice based on phase
        if (phase === 'opening') {
            if (e.isDevelopment) {
                advice.push({
                    priority: 'tip',
                    icon: '💡',
                    text: `The bot developed a piece. <strong>Match its development tempo</strong> — if you fall behind in development, the bot can launch an early attack with more pieces.`
                });
            }
            advice.push({
                priority: 'tip',
                icon: '💡',
                text: `<strong>Opening defense:</strong> Control the center, develop pieces quickly, and castle early. Don't chase pawns at the cost of development.`
            });
        }

        if (phase === 'midgame') {
            if (e.centerCtrl.length > 0) {
                advice.push({
                    priority: 'tip',
                    icon: '💡',
                    text: `The bot controls central squares. <strong>Challenge its center</strong> with pawn breaks (d5, e5, c5) or place your knights on outposts to contest control.`
                });
            }
            advice.push({
                priority: 'tip',
                icon: '⚔️',
                text: `<strong>Midgame defense tip:</strong> Before responding, use the "Checks, Captures, Threats" (CCT) method. Can you give check? Capture something? Create a threat? If yes, that might be better than passive defense.`
            });
        }

        if (phase === 'endgame') {
            advice.push({
                priority: 'tip',
                icon: '👑',
                text: `<strong>Endgame defense:</strong> Activate your king! In the endgame, a centralized king is worth ~4 points. Also watch for passed pawns — they're the key to winning or losing endgames.`
            });
        }

        // General counter-attack suggestion
        if (!e.isCheck && !e.isForking && e.threats.filter(t => t.value >= 3).length === 0) {
            advice.push({
                priority: 'opportunity',
                icon: '⚔️',
                text: `No immediate danger! This is your chance to <strong>seize the initiative</strong>. Look for attacking moves — checks, captures, and threats of your own. Make the bot react to YOU.`
            });
        }

        return advice;
    }

    /* ── Assess overall danger level from the bot's move ── */
    _assessDangerLevel(e, game, playerColor) {
        let score = 0;
        let label, color, icon;

        if (e.isCheckmate) return { level: 5, label: 'Checkmate', color: '#ca3431', icon: '💀', desc: 'Game over!' };
        if (e.isCheck) score += 3;
        if (e.isForking) score += 3;
        if (e.discoveredThreats.length > 0) score += 2;
        if (e.isCapture && e.capturedValue >= 5) score += 3;
        else if (e.isCapture && e.capturedValue >= 3) score += 2;
        else if (e.isCapture) score += 1;
        if (e.threats.filter(t => t.value >= 5).length > 0) score += 2;
        if (e.threats.filter(t => t.value >= 3).length > 0) score += 1;
        if (e.centerCtrl.length >= 2) score += 1;

        if (score >= 5) {
            label = 'Critical Danger'; color = '#ca3431'; icon = '🔴';
        } else if (score >= 3) {
            label = 'High Alert'; color = '#e68427'; icon = '🟠';
        } else if (score >= 1) {
            label = 'Moderate'; color = '#e6a827'; icon = '🟡';
        } else {
            label = 'Low Threat'; color = '#96bc4b'; icon = '🟢';
        }

        const descriptions = {
            'Critical Danger': 'This move creates serious threats! Respond carefully — one wrong move could cost the game.',
            'High Alert': 'The bot is building real pressure. Address the threats before thinking about your own attack.',
            'Moderate': 'Some positional pressure, but nothing immediately dangerous. Stay alert while improving your position.',
            'Low Threat': 'A quiet move. This is your chance to take the initiative and create your own threats!'
        };

        return { level: Math.min(score, 5), label, color, icon, desc: descriptions[label] };
    }

    _generateFallbackVariations(fen, color = 'w') {
        const game = new Chess(fen);
        const legal = game.moves({ verbose: true });
        const list = [];

        const candidates = [];
        const pMove = legal.find(m => m.piece === 'p' && (m.to[1] === '4' || m.to[1] === '5'));
        if (pMove) candidates.push({ m: pMove, theme: 'Central Pawn Strike', icon: '⚡' });

        const nMove = legal.find(m => m.piece === 'n');
        if (nMove && !candidates.some(c => c.m.san === nMove.san)) candidates.push({ m: nMove, theme: 'Knight Outpost Maneuver', icon: '♞' });

        const bMove = legal.find(m => m.piece === 'b');
        if (bMove && !candidates.some(c => c.m.san === bMove.san)) candidates.push({ m: bMove, theme: 'Bishop Diagonal Pressure', icon: '🏹' });

        if (candidates.length < 3) {
            legal.slice(0, 3).forEach(m => {
                if (!candidates.some(c => c.m.san === m.san)) candidates.push({ m, theme: 'Active Continuation', icon: '🎯' });
            });
        }

        candidates.forEach((c, idx) => {
            const temp = new Chess(fen);
            const m = temp.move(c.m);
            const positions = [fen, temp.fen()];
            const moves = [{
                step: 1,
                san: m.san,
                from: m.from,
                to: m.to,
                note: `Plays ${m.san} to seize active board control`
            }];

            list.push({
                index: idx,
                icon: c.icon,
                title: `Plan ${String.fromCharCode(65 + idx)}: ${c.theme} (${m.san})`,
                firstMoveSan: m.san,
                target: 'Central Control & Coordination',
                whyBetter: `Developing with ${m.san} improves your piece activity and prepares future attack corridors on opponent pawns.`,
                moves,
                positions,
                score: 0
            });
        });

        return list;
    }
}


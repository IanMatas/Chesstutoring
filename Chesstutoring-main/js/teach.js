/* Teaching core: turns engine facts into one concrete, honest lesson.
   Every lesson names a concept and ties it to one step of a three-step
   thinking routine, so each mistake trains a habit. No DOM access here. */
(() => {
  'use strict';
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const SIDE = { w: 'White', b: 'Black' };
  const FILES = 'abcdefgh';
  const other = (c) => (c === 'w' ? 'b' : 'w');
  const parse = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
  const uciOf = (m) => m.from + m.to + (m.promotion || '');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const MATE = 10000;

  /* ── Scores ─────────────────────────────────────────────── */
  // Engine result → centipawns for the side to move. Mate 0 means that side is mated.
  function scoreOf(r) {
    if (!r) return 0;
    if (r.mate != null) return (r.mate > 0 ? 1 : -1) * (MATE - Math.min(Math.abs(r.mate), 99) * 10);
    return r.score || 0;
  }
  const isMateScore = (cp) => Math.abs(cp) >= MATE - 1000;
  const mateIn = (cp) => (isMateScore(cp) ? Math.round((MATE - Math.abs(cp)) / 10) : null);
  // Lichess-style winning chances in [-1, 1].
  const winChance = (cp) => 2 / (1 + Math.exp(-0.00368208 * Math.max(-2000, Math.min(2000, cp)))) - 1;
  const winPercent = (cp) => 50 + 50 * winChance(cp);
  function moveAccuracy(beforeCp, afterCp) {
    const drop = winPercent(beforeCp) - winPercent(afterCp);
    if (drop <= 0) return 100;
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
  }
  const VERDICTS = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const BAD = new Set(['inaccuracy', 'mistake', 'blunder']);
  // Scores are from the mover's perspective before and after the move.
  function classify(before, after, isBest) {
    const beforeMate = before >= MATE - 1000, afterMate = after >= MATE - 1000;
    const allowedMate = after <= -(MATE - 1000) && before > -(MATE - 1000);
    if (allowedMate) return before < -999 ? 'inaccuracy' : before < -700 ? 'mistake' : 'blunder';
    if (beforeMate && !afterMate) return after > 999 ? 'inaccuracy' : after > 700 ? 'mistake' : 'blunder';
    if (isBest) return 'best';
    const drop = winChance(before) - winChance(after);
    if (drop >= 0.3) return 'blunder';
    if (drop >= 0.2) return 'mistake';
    if (drop >= 0.1) return 'inaccuracy';
    return drop <= 0.025 ? 'best' : 'good';
  }

  /* ── Board geometry ─────────────────────────────────────── */
  function boardMap(game) {
    const map = {}, rows = game.board();
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) if (rows[r][f]) map[FILES[f] + (8 - r)] = rows[r][f];
    return map;
  }
  const LINES = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
  LINES.q = LINES.b.concat(LINES.r);
  const JUMPS = { n: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]], k: [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] };
  function attacksFrom(map, sq) {
    const p = map[sq];
    if (!p) return [];
    const f0 = sq.charCodeAt(0) - 97, r0 = +sq[1] - 1, out = [];
    const add = (f, r) => { if (f >= 0 && f < 8 && r >= 0 && r < 8) out.push(FILES[f] + (r + 1)); };
    if (p.type === 'p') { const d = p.color === 'w' ? 1 : -1; add(f0 - 1, r0 + d); add(f0 + 1, r0 + d); }
    else if (JUMPS[p.type]) JUMPS[p.type].forEach(([a, b]) => add(f0 + a, r0 + b));
    else for (const [a, b] of LINES[p.type]) {
      let f = f0 + a, r = r0 + b;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const s = FILES[f] + (r + 1);
        out.push(s);
        if (map[s]) break;
        f += a; r += b;
      }
    }
    return out;
  }
  const attackersOf = (map, sq, color) => Object.keys(map).filter((s) => map[s].color === color && attacksFrom(map, s).includes(sq));
  function withTurn(fen, color) {
    const parts = fen.split(' ');
    if (parts[1] === color) return fen;
    parts[1] = color;
    parts[3] = '-';
    return parts.join(' ');
  }
  function material(game, color) {
    let n = 0;
    for (const row of game.board()) for (const p of row) if (p) n += VALUE[p.type] * (p.color === color ? 1 : -1);
    return n;
  }
  function kingSquare(game, color) {
    const map = boardMap(game);
    return Object.keys(map).find((s) => map[s].type === 'k' && map[s].color === color);
  }
  // Static exchange: material `color` can win by starting captures on `sq`
  // (least valuable attacker first, legal moves only, either side may stop).
  function exchangeGain(fen, sq, color, depth = 0) {
    if (depth > 7) return 0;
    const g = new Chess(withTurn(fen, color));
    const captures = g.moves({ verbose: true }).filter((m) => m.to === sq && m.captured && m.captured !== 'k');
    if (!captures.length) return 0;
    const order = (m) => (m.piece === 'k' ? 100 : VALUE[m.piece]);
    captures.sort((a, b) => order(a) - order(b));
    const m = captures[0];
    const gained = VALUE[m.captured] + (m.promotion ? VALUE[m.promotion] - 1 : 0);
    g.move(m);
    return Math.max(0, gained - exchangeGain(g.fen(), sq, other(color), depth + 1));
  }
  // Pieces of `color` that the opponent could win right now (if it were their turn).
  function loosePieces(fen, color) {
    const map = boardMap(new Chess(fen)), out = [];
    for (const sq of Object.keys(map)) {
      const p = map[sq];
      if (p.color !== color || p.type === 'k') continue;
      const gain = exchangeGain(fen, sq, other(color));
      if (gain > 0) out.push({ square: sq, type: p.type, value: VALUE[p.type], gain, attackers: attackersOf(map, sq, other(color)) });
    }
    return out.sort((a, b) => b.gain - a.gain || b.value - a.value);
  }
  // A move that attacks two worthwhile targets at once (the king counts).
  function forkTargets(fenAfter, square) {
    const g = new Chess(fenAfter), map = boardMap(g), piece = map[square];
    if (!piece) return [];
    const enemy = other(piece.color);
    const targets = attacksFrom(map, square).filter((s) => map[s] && map[s].color === enemy).map((s) => ({ square: s, type: map[s].type }));
    const worth = targets.filter((t) => t.type === 'k' || VALUE[t.type] > VALUE[piece.type] || exchangeGain(fenAfter, t.square, piece.color) > 0);
    const serious = worth.some((t) => t.type === 'k' || VALUE[t.type] >= 3);
    return worth.length >= 2 && serious ? worth.sort((a, b) => (b.type === 'k') - (a.type === 'k') || VALUE[b.type] - VALUE[a.type]) : [];
  }
  function pinnedPieces(fen, color) {
    const g = new Chess(fen), map = boardMap(g), king = kingSquare(g, color), out = [];
    if (!king) return out;
    const kf = king.charCodeAt(0) - 97, kr = +king[1] - 1;
    for (const [a, b] of LINES.q) {
      let f = kf + a, r = kr + b, own = null;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const s = FILES[f] + (r + 1), p = map[s];
        if (p) {
          if (p.color === color) { if (own) break; own = s; }
          else {
            const diagonal = a !== 0 && b !== 0;
            if (own && (p.type === 'q' || p.type === (diagonal ? 'b' : 'r'))) out.push({ square: own, type: map[own].type, by: s, byType: p.type });
            break;
          }
        }
        f += a; r += b;
      }
    }
    return out;
  }

  /* ── Lines ──────────────────────────────────────────────── */
  // Walk an engine line; net material is from the root mover's perspective,
  // settled with one exchange calculation on the last capture square.
  function trace(fen, pv, maxPlies = 10) {
    const g = new Chess(fen), color = g.turn(), start = material(g, color), steps = [];
    for (const u of (pv || []).slice(0, maxPlies)) {
      const before = g.fen(), m = g.move(parse(u));
      if (!m) break;
      steps.push({ move: m, before, after: g.fen(), net: material(g, color) - start, check: g.in_check(), mate: g.in_checkmate() });
      if (g.game_over()) break;
    }
    let net = steps.length ? steps[steps.length - 1].net : 0;
    const last = steps[steps.length - 1];
    if (last && last.move.captured && !g.game_over()) {
      const gain = exchangeGain(g.fen(), last.move.to, g.turn());
      net += g.turn() === color ? gain : -gain;
    }
    return { color, steps, net, mate: g.in_checkmate(), end: g.fen() };
  }
  function label(fen, san) {
    const [, turn, , , , full] = fen.split(' ');
    return `${full}${turn === 'w' ? '.' : '...'}${san}`;
  }
  function lineText(fen, pv, plies = 6) {
    const g = new Chess(fen), out = [];
    for (const u of (pv || []).slice(0, plies)) {
      const before = g.fen(), m = g.move(parse(u));
      if (!m) break;
      out.push(out.length && m.color === 'b' ? m.san : label(before, m.san));
    }
    return out.join(' ');
  }
  const sanOf = (fen, u) => { const m = u && new Chess(fen).move(parse(u)); return m ? m.san : u || ''; };
  function worth(n) {
    n = Math.abs(n);
    return { 1: 'a pawn', 2: 'two pawns', 3: 'a piece (about 3 pawns)', 4: 'about four pawns', 5: 'a rook’s worth', 6: 'about six pawns', 8: 'about eight pawns', 9: 'a queen’s worth' }[n] || `about ${n} pawns of material`;
  }

  /* ── Voice: who is "you"? ───────────────────────────────── */
  // me: the side addressed as "you" (null = third person). theirs: possessive for the other side.
  function makeVoice(me, opponent = 'your opponent', theirs = `${opponent}’s`) {
    const pos = (c) => (me ? (c === me ? 'your' : theirs) : `${SIDE[c]}’s`);
    const subj = (c) => (me ? (c === me ? 'you' : opponent) : SIDE[c]);
    return { me, subj, pos, Subj: (c) => cap(subj(c)), Pos: (c) => cap(pos(c)) };
  }

  /* ── Concepts and the thinking routine ──────────────────── */
  const ROUTINE = [
    { step: 1, title: 'Their threat', question: 'What does my opponent’s last move attack or threaten?' },
    { step: 2, title: 'My forcing moves', question: 'Can I give check, capture something, or create a threat?' },
    { step: 3, title: 'Blunder check', question: 'After my move, can anything of mine be taken — or can they check me?' },
  ];
  const PRACTICE = {
    safety: { kind: 'puzzles', label: 'Practice piece safety' },
    forks: { kind: 'pattern', lesson: 'fork', label: 'Learn the fork pattern' },
    mate: { kind: 'pattern', lesson: 'backrank', label: 'Practice checkmate patterns' },
    calc: { kind: 'puzzles', label: 'Practice thinking ahead' },
    openings: { kind: 'mode', mode: 'openings', label: 'Study openings' },
    endgame: { kind: 'mode', mode: 'endgame', label: 'Study endgames' },
  };
  const CONCEPTS = {
    'hanging-piece': { name: 'Hanging piece', step: 3, practice: 'safety', rule: 'Before you let go of a piece, check every enemy piece that could capture it on its new square.' },
    'ignored-threat': { name: 'Missed threat', step: 1, practice: 'safety', rule: 'Start every move by asking what your opponent’s last move attacks.' },
    'removed-defender': { name: 'Left a piece unguarded', step: 3, practice: 'safety', rule: 'When a piece moves, everything it was guarding loses a defender. Check what it leaves behind.' },
    'bad-trade': { name: 'Counting a capture', step: 3, practice: 'safety', rule: 'Before you capture, count attackers and defenders on that square. If they can take back more, you lose material.' },
    'allowed-fork': { name: 'Double attack (fork)', step: 3, practice: 'forks', rule: 'Look for squares where one enemy piece could attack two of yours at once — knight and queen moves especially.' },
    'allowed-mate': { name: 'Checkmate danger', step: 3, practice: 'mate', rule: 'After every move, look at every check your opponent could give. A check can turn into mate.' },
    'allowed-tactic': { name: 'Allowed a tactic', step: 3, practice: 'calc', rule: 'Before you move, picture your opponent’s checks, captures and threats in the new position.' },
    'missed-mate': { name: 'Missed checkmate', step: 2, practice: 'mate', rule: 'Checks first: every move, look at each check you can give. One of them may be mate.' },
    'missed-material': { name: 'Free material', step: 2, practice: 'safety', rule: 'After every enemy move, ask: did they leave something undefended?' },
    'missed-fork': { name: 'Double attack', step: 2, practice: 'forks', rule: 'Look for moves that attack two things at once. Your opponent can only save one.' },
    'missed-tactic': { name: 'Missed a tactic', step: 2, practice: 'calc', rule: 'Look at checks, captures and threats for your side before quiet moves.' },
    'opening-development': { name: 'Development', step: 0, practice: 'openings', rule: 'In the opening, bring out a new knight or bishop each move before moving the same piece twice.' },
    'opening-queen': { name: 'Early queen moves', step: 0, practice: 'openings', rule: 'Develop knights and bishops before the queen. An early queen gets chased and you lose time.' },
    'opening-castle': { name: 'King safety', step: 0, practice: 'openings', rule: 'Castle early. A king left in the middle gets attacked as soon as the center opens.' },
    center: { name: 'Center control', step: 0, practice: 'openings', rule: 'Pawns and pieces in the center control the most squares. Fight for e4, d4, e5 and d5.' },
    'endgame-king': { name: 'Active king', step: 0, practice: 'endgame', rule: 'In the endgame the king is a strong piece. Bring it toward the center and the pawns.' },
    'passed-pawn': { name: 'Passed pawns', step: 0, practice: 'endgame', rule: 'Passed pawns must be pushed — and stopped. Count how many moves each side needs to promote.' },
    'better-plan': { name: 'A stronger plan', step: 0, practice: 'calc', rule: 'When there is no tactic, improve your worst-placed piece or attack a weakness.' },
    stalemate: { name: 'Stalemate', step: 3, practice: 'mate', rule: 'When you are winning, make sure the enemy king always has a legal move — unless your move is checkmate.' },
    'allowed-draw': { name: 'Throwing away a win', step: 3, practice: 'calc', rule: 'When you are ahead, avoid repeating moves and keep enough material to checkmate.' },
  };
  const VERDICT_TEXT = {
    book: { label: 'Book', beginner: 'Opening move' },
    best: { label: 'Best', beginner: 'Great move!' },
    good: { label: 'Good', beginner: 'Good move' },
    inaccuracy: { label: 'Inaccuracy', beginner: 'Not the best' },
    mistake: { label: 'Mistake', beginner: 'Mistake' },
    blunder: { label: 'Blunder', beginner: 'Big mistake' },
  };

  /* ── What a move does (honest, from the board) ──────────── */
  const HOME = { w: { b1: 'n', g1: 'n', c1: 'b', f1: 'b' }, b: { b8: 'n', g8: 'n', c8: 'b', f8: 'b' } };
  function undeveloped(game, color) {
    return Object.entries(HOME[color]).filter(([sq, t]) => { const p = game.get(sq); return p && p.color === color && p.type === t; }).length;
  }
  function isPassed(game, sq, color) {
    const f = sq.charCodeAt(0) - 97, r = +sq[1];
    for (let df = -1; df <= 1; df++) {
      const ff = f + df;
      if (ff < 0 || ff > 7) continue;
      for (let rr = r + (color === 'w' ? 1 : -1); rr >= 1 && rr <= 8; rr += color === 'w' ? 1 : -1) {
        const p = game.get(FILES[ff] + rr);
        if (p && p.type === 'p' && p.color !== color) return false;
      }
    }
    return true;
  }
  const centerDistance = (sq) => Math.max(Math.abs(sq.charCodeAt(0) - 100.5), Math.abs(+sq[1] - 4.5));
  // A short phrase completing "This move …".
  function effectOf(fenBefore, move, v) {
    const before = new Chess(fenBefore), after = new Chess(fenBefore);
    const m = after.move(typeof move === 'string' ? parse(move) : { from: move.from, to: move.to, promotion: move.promotion || 'q' });
    if (!m) return '';
    const me = m.color, own = v.pos(me), enemy = v.pos(other(me));
    if (after.in_checkmate()) return 'is checkmate';
    if (m.flags.includes('k') || m.flags.includes('q')) return 'castles, so your king is safer and a rook can join the game'.replace('your', own);
    const forks = forkTargets(after.fen(), m.to);
    if (forks.length >= 2) return `attacks ${enemy} ${NAME[forks[0].type]} and ${NAME[forks[1].type]} at the same time`;
    if (m.captured) {
      const free = exchangeGain(fenBefore, m.to, me) >= VALUE[m.captured];
      return `captures ${enemy} ${NAME[m.captured]} on ${m.to}${free && m.captured !== 'p' ? ' for free' : ''}`;
    }
    if (m.promotion) return `promotes the pawn to a ${NAME[m.promotion]}`;
    if (after.in_check()) return `gives check, so ${v.subj(other(me))} must answer it first`;
    const looseBefore = loosePieces(withTurn(fenBefore, other(me)), me);
    const looseAfter = loosePieces(after.fen(), me);
    const saved = looseBefore.find((t) => !looseAfter.some((u) => u.square === t.square) && t.square !== m.from);
    if (looseBefore.some((t) => t.square === m.from) && !looseAfter.some((t) => t.square === m.to)) return `moves ${own} ${NAME[m.piece]} out of danger`;
    if (saved) return `protects ${own} ${NAME[saved.type]} on ${saved.square}`;
    const newTargets = loosePieces(withTurn(after.fen(), me), other(me)).filter((t) => !loosePieces(withTurn(fenBefore, me), other(me)).some((u) => u.square === t.square));
    if (newTargets.length && newTargets[0].value >= 3) return `attacks ${enemy} ${NAME[newTargets[0].type]} on ${newTargets[0].square}`;
    const home = HOME[me][m.from];
    if (home && home === m.piece) return `develops ${own} ${NAME[m.piece]} toward the center`;
    if (m.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(m.to)) return 'claims the center with a pawn';
    if (m.piece === 'p' && attacksFrom(boardMap(after), m.to).some((sq) => ['d4', 'e4', 'd5', 'e5'].includes(sq))) return 'fights for the center';
    if (m.piece === 'p' && isPassed(after, m.to, me)) return `pushes ${own} passed pawn closer to promotion`;
    if (m.piece === 'r') {
      const file = m.to[0];
      const pawns = [1, 2, 3, 4, 5, 6, 7, 8].map((r) => after.get(file + r)).filter((p) => p && p.type === 'p');
      if (!pawns.length) return `puts ${own} rook on the open ${file}-file`;
    }
    const phase = phaseOf(fenBefore);
    if (m.piece === 'k' && phase === 'endgame' && centerDistance(m.to) < centerDistance(m.from)) return `brings ${own} king closer to the center`;
    const reachBefore = attacksFrom(boardMap(before), m.from).length, reachAfter = attacksFrom(boardMap(after), m.to).length;
    if (m.piece !== 'p' && m.piece !== 'k' && reachAfter > reachBefore + 1) return `puts ${own} ${NAME[m.piece]} on a more active square`;
    return '';
  }
  // "15.Nd2 protects your knight on f3." / "15.Nd2 was stronger."
  function moveWithEffect(fenBefore, uci, v) {
    const san = sanOf(fenBefore, uci), effect = effectOf(fenBefore, uci, v);
    return `${label(fenBefore, san)} ${effect || 'was stronger'}.`;
  }
  function phaseOf(fen) {
    const g = new Chess(fen);
    let total = 0, queens = 0;
    for (const row of g.board()) for (const p of row) if (p && p.type !== 'k') { total += VALUE[p.type]; if (p.type === 'q') queens++; }
    const full = +fen.split(' ')[5] || 1;
    if (full <= 12 && total > 60) return 'opening';
    if (total <= 26 || (queens === 0 && total <= 38)) return 'endgame';
    return 'middlegame';
  }

  // "That loses the knight." / "You get only a pawn back for it."
  function costOf(type, lossNet, v, mover) {
    const value = VALUE[type], n = Math.abs(lossNet);
    if (n > value + 1) return `In total that costs ${worth(n)}.`;
    if (n >= value - 0.5) return `That loses the ${NAME[type]}.`;
    return `${v.Subj(mover)} ${v.me === mover ? 'get' : 'gets'} only ${worth(value - n)} back for it.`;
  }

  // Known opening moves from the coach's opening book (coach.js). Only for games from the start.
  function bookInfo(sans) {
    if (typeof OPENINGS === 'undefined' || !sans || !sans.length) return null;
    const seq = sans.join(' ');
    if (!OPENINGS[seq] && !Object.keys(OPENINGS).some((k) => k.startsWith(seq + ' '))) return null;
    for (let n = sans.length; n > 0; n--) {
      const name = OPENINGS[sans.slice(0, n).join(' ')];
      if (name) return { name };
    }
    return { name: '' };
  }

  /* ── The lesson for one move ────────────────────────────── */
  /* fenBefore, move (chess.js verbose), best {uci, pv, cp}: the engine's choice and its score,
     playedCp: the mover's score after this move, replyPv: the opponent's best line after it.
     me/opponent choose the wording ("you" or "White"). Scores are from the mover's side. */
  function lessonFor({ fenBefore, move, best = {}, playedCp, replyPv = [], me = move.color, opponent = 'your opponent', level = 'intermediate', history = null }) {
    const v = makeVoice(me, opponent);
    const mover = move.color, playedUci = uciOf(move);
    const afterGame = new Chess(fenBefore);
    afterGame.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    const fenAfter = afterGame.fen();
    const bestCp = best.cp != null ? best.cp : playedCp;
    const isBest = !best.uci || best.uci === playedUci || (playedCp != null && playedCp >= bestCp - 8);
    let verdict = playedCp == null ? 'good' : classify(bestCp, playedCp, isBest);
    // Opening-book moves are sound; short searches in the opening are too noisy to judge them.
    if (history && bookInfo([...history, move.san])) verdict = 'book';
    const bestSan = best.uci ? sanOf(fenBefore, best.uci) : '';
    const replySan = replyPv[0] ? sanOf(fenAfter, replyPv[0]) : '';
    const lesson = {
      verdict, level, mover, fenBefore, fenAfter, san: move.san, moveLabel: label(fenBefore, move.san),
      bestUci: best.uci || null, bestSan, bestLabel: bestSan ? label(fenBefore, bestSan) : '',
      replyUci: replyPv[0] || null, replySan, replyLabel: replySan ? label(fenAfter, replySan) : '',
      bestLine: best.pv && best.pv.length ? lineText(fenBefore, best.pv, 8) : '',
      replyLine: replyPv.length ? lineText(fenAfter, replyPv, 8) : '',
      cpBefore: bestCp, cpAfter: playedCp, arrows: [], marks: {}, hints: [], focus: [], better: '', history,
    };
    lesson.swing = bestCp == null || playedCp == null || isMateScore(bestCp) || isMateScore(playedCp) ? null : Math.max(0, bestCp - playedCp) / 100;
    const ctx = { move, best, bestCp, playedCp, replyPv, v, afterGame, playedUci };
    return BAD.has(verdict) ? explainMistake(lesson, ctx) : explainGood(lesson, ctx);
  }

  function explainGood(lesson, { move, replyPv, v, afterGame, playedCp, playedUci }) {
    const { fenBefore, moveLabel, mover, verdict, bestSan, bestLabel } = lesson;
    const effect = effectOf(fenBefore, move, v);
    const pt = trace(fenBefore, [playedUci, ...replyPv]);
    const are = v.me === mover ? 'are' : 'is';
    if (verdict === 'book') {
      const book = bookInfo([...(lesson.history || []), move.san]);
      lesson.headline = `Book move${book && book.name ? ` — ${book.name}` : ''}.`;
      lesson.why = `A standard opening move that strong players have used for a long time${effect ? `: it ${effect}` : ''}.`;
      lesson.opening = book && book.name;
    } else if (afterGame.in_checkmate()) {
      lesson.headline = 'Checkmate!';
      lesson.why = `${moveLabel} leaves the king no escape, no block and no capture.`;
    } else if (playedCp != null && playedCp >= MATE - 1000) {
      lesson.headline = `${v.Subj(mover)} ${v.me === mover ? 'have' : 'has'} a forced checkmate.`;
      lesson.why = `${moveLabel} keeps it going: mate in ${mateIn(playedCp)}.`;
    } else if (pt.net >= 2) {
      lesson.headline = `${verdict === 'best' ? 'Strong' : 'Good'} — this wins material.`;
      lesson.why = `${moveLabel}${effect ? ` ${effect}` : ''}. After ${lineText(fenBefore, [playedUci, ...replyPv], 5)}, ${v.subj(mover)} ${are} ahead by ${worth(pt.net)}.`;
    } else {
      const lead = verdict === 'best' ? (lesson.level === 'beginner' ? 'Great move' : 'Best move') : 'Good move';
      lesson.headline = effect ? `${lead} — it ${effect}.` : `${lead}.`;
      lesson.why = verdict === 'best' ? `${moveLabel} matches the engine’s top choice.` : bestSan && bestSan !== move.san ? `${bestLabel} was slightly more precise.` : '';
    }
    return finalize(lesson, null);
  }

  const OPENERS = {
    'opening-queen': 'Moving the queen out this early costs time.',
    'opening-development': 'This doesn’t bring a new piece into the game.',
    'opening-castle': 'Getting the king safe was more urgent.',
    center: 'This gives up the fight for the center.',
    'endgame-king': 'The king should join the fight.',
    'passed-pawn': 'Passed pawns decide endgames.',
    'better-plan': 'There was a stronger plan.',
  };

  function explainMistake(lesson, { move, best, bestCp, playedCp, replyPv, v, afterGame, playedUci }) {
    const { fenBefore, fenAfter, moveLabel, mover, bestLabel, replyLabel } = lesson;
    const opp = other(mover), focus = lesson.focus;
    const rt = trace(fenAfter, replyPv);
    const pt = trace(fenBefore, [playedUci, ...replyPv]);
    const bt = trace(fenBefore, best.pv && best.pv.length ? best.pv : best.uci ? [best.uci] : []);
    const reply = rt.steps[0] ? rt.steps[0].move : null;
    const bestFirst = bt.steps[0] ? bt.steps[0].move : null;
    const lossNet = Math.min(0, pt.net);
    const bestGain = Math.max(0, bt.net);
    // The immediate reply takes a piece that was already attacked before this move.
    const ignoredSq = reply && reply.captured && reply.to !== move.to && afterGame.get(reply.to)?.color === mover
      && exchangeGain(fenBefore, reply.to, opp) > 0 && exchangeGain(fenAfter, reply.to, opp) > 0 ? reply.to : null;
    const explainIgnored = (key) => {
      const piece = NAME[reply.captured];
      headline = `${v.Pos(mover)} ${piece} on ${ignoredSq} was already under attack.`;
      why = key && VALUE[key.move.captured] > VALUE[reply.captured]
        ? `${moveLabel} doesn’t deal with it. ${replyLabel} takes it, and then ${label(key.before, key.move.san)} wins ${v.pos(mover)} ${NAME[key.move.captured]} too.`
        : `${moveLabel} doesn’t deal with it, so ${replyLabel} takes it.`;
      focus.push(ignoredSq);
    };
    let concept, headline = '', why = '';

    if (afterGame.in_stalemate()) {
      concept = 'stalemate';
      headline = 'Stalemate — the win slips away.';
      why = `After ${moveLabel}, ${v.subj(opp)} has no legal move but is not in check, so the game is a draw.`;
    } else if (afterGame.in_draw() && bestCp > 150) {
      concept = 'allowed-draw';
      headline = 'This lets the game end in a draw.';
      why = afterGame.insufficient_material() ? `After ${moveLabel}, there isn’t enough material left to checkmate.` : `After ${moveLabel}, the game is drawn.`;
    } else if (playedCp <= -(MATE - 1000) && bestCp > -(MATE - 1000) && ((mateIn(-playedCp) || 1) <= 3 || bestGain < 3)) {
      concept = 'allowed-mate';
      const n = mateIn(-playedCp) || 1;
      headline = n === 1 ? 'This allows checkmate in one.' : 'This allows a forced checkmate.';
      why = n === 1 ? `After ${moveLabel}, ${replyLabel} is checkmate.` : `After ${moveLabel}, ${v.subj(opp)} can force mate in ${n}: ${lineText(fenAfter, replyPv, Math.min(2 * n - 1, 7))}.`;
      if (reply) lesson.arrows.push({ from: reply.from, to: reply.to, color: 'danger' });
      const k = kingSquare(afterGame, mover);
      if (k) focus.push(k);
    } else if (bestCp >= MATE - 1000 && playedCp < MATE - 1000) {
      concept = 'missed-mate';
      const n = mateIn(bestCp) || 1;
      headline = n === 1 ? `${v.Subj(mover)} missed checkmate in one!` : `${v.Subj(mover)} missed a forced checkmate.`;
      lesson.teaser = n === 1 ? 'There is a checkmate in one move. Can you find it?' : `There is a forced checkmate in ${n}. Look at every check.`;
      why = n === 1 ? `${bestLabel} was checkmate.` : `Mate in ${n} was possible: ${lineText(fenBefore, best.pv, Math.min(2 * n - 1, 7))}.`;
      if (lossNet <= -3) lesson.also = `Also, after ${moveLabel} the reply ${replyLabel} wins ${worth(lossNet)}.`;
    } else if (lossNet <= -1 && (-lossNet >= bestGain || bestGain < 2)) {
      // Material is lost: name the key capture and its cause.
      const theirs = rt.steps.filter((s) => s.move.color === opp && s.move.captured);
      const key = theirs.slice().sort((a, b) => VALUE[b.move.captured] - VALUE[a.move.captured])[0] || null;
      const target = key ? key.move.to : null;
      const there = target ? afterGame.get(target) : null;
      const hanging = !!(there && there.color === mover && there.type === key.move.captured && exchangeGain(fenAfter, target, opp) > 0);
      const lost = key ? NAME[key.move.captured] : '';
      const keyLabel = key ? label(key.before, key.move.san) : replyLabel;
      const noRecapture = key && !new Chess(key.after).moves({ verbose: true }).some((m) => m.to === target && m.captured);
      const tail = noRecapture ? `, and ${v.subj(mover)} can’t take back` : '';
      const cost = key ? costOf(key.move.captured, lossNet, v, mover) : `That costs ${worth(lossNet)}.`;
      const forks = reply ? forkTargets(rt.steps[0].after, reply.to) : [];
      if (move.captured && reply && reply.to === move.to && reply.captured && lossNet <= -2) {
        concept = 'bad-trade';
        headline = 'This capture loses material.';
        why = reply.captured === move.piece && VALUE[move.piece] > VALUE[move.captured]
          ? `${moveLabel} takes a ${NAME[move.captured]}, but ${replyLabel} takes back: a ${NAME[move.piece]} for a ${NAME[move.captured]}.`
          : `${moveLabel} takes a ${NAME[move.captured]}, but ${replyLabel} takes back. In the end it costs ${worth(lossNet)}.`;
        focus.push(move.to);
      } else if (hanging && target === move.to) {
        concept = 'hanging-piece';
        headline = `${v.Pos(mover)} ${lost} can be taken on ${target}.`;
        why = `After ${moveLabel}, ${keyLabel} captures it${tail}. ${cost}`;
        focus.push(target);
      } else if (ignoredSq) {
        concept = 'ignored-threat';
        explainIgnored(key);
        why += key && VALUE[key.move.captured] > VALUE[reply.captured] ? ` In total that costs ${worth(lossNet)}.` : ` ${cost}`;
      } else if (hanging) {
        concept = 'removed-defender';
        const guarded = attackersOf(boardMap(new Chess(fenBefore)), target, mover).includes(move.from);
        headline = `${v.Pos(mover)} ${lost} on ${target} is left unprotected.`;
        why = guarded
          ? `${v.Pos(mover)} ${NAME[move.piece]} was guarding it from ${move.from}. After ${moveLabel}, ${keyLabel} wins it${tail}.`
          : `After ${moveLabel}, ${keyLabel} wins it${tail}. ${cost}`;
        focus.push(target);
      } else if (forks.length >= 2) {
        concept = 'allowed-fork';
        headline = ['n', 'p'].includes(reply.piece) ? 'This allows a fork.' : 'This allows a double attack.';
        why = `${replyLabel}: ${v.pos(opp)} ${NAME[reply.piece]} attacks ${v.pos(mover)} ${NAME[forks[0].type]} and ${NAME[forks[1].type]} at once. Only one can be saved. ${cost}`;
        forks.forEach((t) => focus.push(t.square));
      } else {
        concept = 'allowed-tactic';
        headline = `This lets ${v.subj(opp)} win material.`;
        why = `After ${moveLabel}, ${lineText(fenAfter, replyPv, 5)} wins ${worth(lossNet)}.`;
      }
      if (reply) lesson.arrows.push({ from: reply.from, to: reply.to, color: 'danger' });
      if (lesson.swing != null && lesson.swing + lossNet - bestGain >= 3) why += ` Beyond the material, ${v.pos(opp)} position also improves.`;
      if (bestGain >= 2 && bestFirst) lesson.also = `Also, ${bestLabel} would have won ${worth(bestGain)}.`;
    } else if (ignoredSq && bestGain < 3) {
      concept = 'ignored-threat';
      explainIgnored(rt.steps.filter((st) => st.move.color === opp && st.move.captured).sort((a, b) => VALUE[b.move.captured] - VALUE[a.move.captured])[0]);
      lesson.arrows.push({ from: reply.from, to: reply.to, color: 'danger' });
    } else if (bestFirst && bestGain >= 1 && bestFirst.captured && exchangeGain(fenBefore, bestFirst.to, mover) >= 1) {
      concept = 'missed-material';
      const undefended = !attackersOf(boardMap(new Chess(fenBefore)), bestFirst.to, opp).length;
      headline = `${v.Pos(opp)} ${NAME[bestFirst.captured]} on ${bestFirst.to} was ${undefended ? 'free to take' : 'not protected enough'}.`;
      why = `${bestLabel} wins it${undefended ? ' — nothing protects it' : ''}${bt.net >= 1 ? `, leaving ${v.subj(mover)} ahead by ${worth(bt.net)}` : ''}.`;
      lesson.teaser = 'Can you find the move that wins it?';
      focus.push(bestFirst.to);
    } else if (bestFirst && bestGain >= 2) {
      const forks = forkTargets(bt.steps[0].after, bestFirst.to);
      if (forks.length >= 2) {
        concept = 'missed-fork';
        headline = `${v.Subj(mover)} missed a fork.`;
        why = `${bestLabel} attacks ${v.pos(opp)} ${NAME[forks[0].type]} and ${NAME[forks[1].type]} at once${bt.net >= 1 ? `, winning ${worth(bt.net)}` : ''}.`;
        lesson.teaser = 'One move attacks two pieces at once. Can you find it?';
        forks.forEach((t) => focus.push(t.square));
      } else {
        concept = 'missed-tactic';
        headline = 'There was a way to win material.';
        why = `${lineText(fenBefore, best.pv, 5)} wins ${worth(bt.net)}.`;
        lesson.teaser = 'Look at your checks and captures — one of them wins material.';
      }
    } else if (reply && forkTargets(rt.steps[0].after, reply.to).length >= 2) {
      // The best reply attacks two things at once; good defense limits the damage but costs time.
      const forks = forkTargets(rt.steps[0].after, reply.to);
      concept = 'allowed-fork';
      headline = ['n', 'p'].includes(reply.piece) ? 'This allows a fork.' : 'This allows a double attack.';
      why = `${replyLabel}: ${v.pos(opp)} ${NAME[reply.piece]} attacks ${v.pos(mover)} ${NAME[forks[0].type]} and ${NAME[forks[1].type]} at once. Even with the best defense, ${v.pos(mover)} position gets worse.`;
      forks.forEach((t) => focus.push(t.square));
      lesson.arrows.push({ from: reply.from, to: reply.to, color: 'danger' });
    } else if (lesson.swing != null && lesson.swing >= 3 && replyLabel) {
      concept = 'allowed-tactic';
      headline = 'This allows a strong reply.';
      why = `After ${moveLabel}, ${replyLabel} leaves ${v.subj(opp)} clearly better: ${lineText(fenAfter, replyPv, 6)}.`;
      if (rt.steps[0]) lesson.arrows.push({ from: rt.steps[0].move.from, to: rt.steps[0].move.to, color: 'danger' });
    } else {
      concept = positionalConcept(fenBefore, move, best.uci);
      headline = OPENERS[concept];
      const n = undeveloped(new Chess(fenBefore), mover);
      why = {
        'opening-queen': `${v.Pos(opp)} pieces can chase the queen and develop at the same time.`,
        'opening-development': n ? `${v.Subj(mover)} still ${v.me === mover ? 'have' : 'has'} ${n === 1 ? 'a knight or bishop' : `${n} knights and bishops`} on ${n === 1 ? 'its starting square' : 'their starting squares'}.` : '',
        'opening-castle': `${v.Pos(mover)} king is still in the center, where lines open quickly.`,
        center: 'Central squares give your pieces the most room.',
        'endgame-king': 'With fewer pieces left, the king is safe enough to be active.',
        'passed-pawn': 'A pawn with no enemy pawns in front of it can run to promotion.',
        'better-plan': 'No material was lost, but the engine prefers another idea.',
      }[concept];
      if (lesson.verdict !== 'inaccuracy' && replyLabel) why = `${why} The strongest reply is ${replyLabel}.`.trim();
    }

    if (best.uci && !concept.startsWith('missed')) lesson.better = moveWithEffect(fenBefore, best.uci, v);
    lesson.headline = headline;
    lesson.why = why;
    focus.forEach((sq) => { lesson.marks[sq] = 'danger'; });
    lesson.hints = hintsFor(concept, fenBefore, best.uci, v, mover, lesson);
    return finalize(lesson, concept);
  }

  function positionalConcept(fenBefore, move, bestUci) {
    const g = new Chess(fenBefore), phase = phaseOf(fenBefore), me = move.color;
    const bestMove = bestUci ? new Chess(fenBefore).move(parse(bestUci)) : null;
    const castles = (m) => m && (m.flags.includes('k') || m.flags.includes('q'));
    if (phase === 'opening') {
      const minors = undeveloped(g, me), full = +fenBefore.split(' ')[5];
      const threatened = loosePieces(fenBefore, me).some((t) => t.square === move.from);
      const bestDevelops = !!(bestMove && HOME[me][bestMove.from] === bestMove.piece);
      const bestCenter = !!(bestMove && bestMove.piece === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5'].includes(bestMove.to));
      if (move.piece === 'k' && !castles(move)) return 'opening-castle';
      if (move.piece === 'q' && full <= 10 && minors >= 2 && !move.captured) return 'opening-queen';
      if (['n', 'b'].includes(move.piece) && !HOME[me][move.from] && !move.captured && minors >= 1 && !threatened) return 'opening-development';
      if (castles(bestMove)) return 'opening-castle';
      const flank = move.piece === 'p' && 'abgh'.includes(move.from[0]) && !move.captured;
      if (flank && bestCenter) return 'center';
      if (bestDevelops) return 'opening-development';
      if (bestCenter) return 'center';
      return 'better-plan';
    }
    if (phase === 'endgame' && bestMove) {
      if (bestMove.piece === 'k' && centerDistance(bestMove.to) < centerDistance(bestMove.from) && move.piece !== 'k') return 'endgame-king';
      const after = new Chess(fenBefore);
      after.move(parse(bestUci));
      if (bestMove.piece === 'p' && isPassed(after, bestMove.to, me)) return 'passed-pawn';
    }
    return 'better-plan';
  }

  function hintsFor(concept, fenBefore, bestUci, v, mover, lesson) {
    const g = new Chess(fenBefore);
    const best = bestUci ? g.move(parse(bestUci)) : null;
    const piece = best ? `${v.pos(mover)} ${NAME[best.piece]} on ${best.from}` : '';
    const first = {
      'hanging-piece': 'Before choosing, look at each square your opponent attacks. Is the piece you want to move safe there?',
      'ignored-threat': 'Start with your opponent’s last move. What is it attacking right now?',
      'removed-defender': 'Which of your pieces is guarding something important? Keep that job covered.',
      'bad-trade': 'Count the attackers and defenders on the square before you capture.',
      'allowed-fork': 'Look at the squares where an enemy knight or queen could attack two of your pieces.',
      'allowed-mate': 'Look at every check your opponent could give after your move.',
      'allowed-tactic': 'Imagine your opponent’s strongest reply: checks, captures and threats.',
      'missed-mate': 'Look at every check you can give. One of them leaves the king no escape.',
      'missed-material': 'One enemy piece is not protected well enough. Which one can you capture?',
      'missed-fork': 'Find a move that attacks two enemy pieces at once.',
      'missed-tactic': 'Look at your checks and captures first.',
      'opening-development': 'Which knight or bishop is still on its starting square?',
      'opening-queen': 'Which knight or bishop could come out instead of the queen?',
      'opening-castle': 'Where would your king be safer?',
      center: 'Which pawn move fights for the central squares?',
      'endgame-king': 'Your king can help. Which way should it walk?',
      'passed-pawn': 'Find the pawn that has a clear road to promotion.',
      'better-plan': 'Which of your pieces is doing the least? Find it a better square.',
    }[concept] || 'Compare a few candidate moves and your opponent’s best reply to each.';
    const hints = [first];
    if (piece) hints.push(`Look at ${piece}.`);
    if (best) hints.push(`Try ${best.san}.`);
    lesson.hintSquares = best ? [best.from, best.to] : [];
    return hints;
  }

  function finalize(lesson, conceptId) {
    const c = conceptId ? CONCEPTS[conceptId] : null;
    lesson.concept = c ? { id: conceptId, ...c, practice: PRACTICE[c.practice] } : null;
    lesson.routine = c && c.step ? ROUTINE[c.step - 1] : null;
    lesson.verdictLabel = VERDICT_TEXT[lesson.verdict][lesson.level === 'beginner' ? 'beginner' : 'label'];
    lesson.isMistake = BAD.has(lesson.verdict);
    return lesson;
  }

  /* ── Threat scan: what to notice before moving ──────────── */
  function scan(fen, me = new Chess(fen).turn(), opponent = 'your opponent') {
    const g = new Chess(fen), v = makeVoice(me, opponent), opp = other(me);
    const toMove = g.turn();
    const threats = loosePieces(withTurn(fen, opp), me);
    const targets = loosePieces(withTurn(fen, me), opp);
    const mine = new Chess(withTurn(fen, me)).moves({ verbose: true });
    const checks = mine.filter((m) => /[+#]/.test(m.san));
    const mates = mine.filter((m) => m.san.includes('#'));
    const captures = mine.filter((m) => m.captured);
    const theirMoves = new Chess(withTurn(fen, opp)).moves({ verbose: true });
    const mateThreat = toMove === me && !g.in_check() ? theirMoves.find((m) => m.san.includes('#')) : null;
    const pins = pinnedPieces(fen, me).filter((p) => p.type !== 'p');
    return { me, toMove, inCheck: toMove === me && g.in_check(), threats, targets, checks, mates, captures, mateThreat, pins, v };
  }
  // Plain sentences for the "Before you move" routine.
  function routineNotes(fen, me, opponent = 'your opponent') {
    const s = scan(fen, me, opponent), v = s.v, notes = { threat: '', forcing: '', arrows: [], marks: {} };
    if (s.inCheck) notes.threat = `${v.Subj(me)} ${me === v.me ? 'are' : 'is'} in check — that comes first.`;
    else if (s.mateThreat) {
      notes.threat = `Danger: ${v.subj(other(me))} threatens ${s.mateThreat.san} — checkmate.`;
      notes.arrows.push({ from: s.mateThreat.from, to: s.mateThreat.to, color: 'danger' });
    } else if (s.threats.length) {
      const t = s.threats[0];
      notes.threat = `${v.Pos(me)} ${NAME[t.type]} on ${t.square} can be won${t.attackers.length ? ` by the ${s.threats[0].attackers.map((a) => NAME[new Chess(fen).get(a).type]).slice(0, 2).join(' or ')}` : ''}.`;
      notes.marks[t.square] = 'danger';
      t.attackers.slice(0, 2).forEach((a) => notes.arrows.push({ from: a, to: t.square, color: 'danger' }));
    } else if (s.pins.length) {
      const p = s.pins[0];
      notes.threat = `${v.Pos(me)} ${NAME[p.type]} on ${p.square} is pinned to the king by the ${NAME[p.byType]} on ${p.by}. It can’t move.`;
      notes.marks[p.square] = 'warn';
    } else notes.threat = 'Nothing is under attack right now. Still check what their last move wants to do next.';
    if (s.mates.length) {
      notes.forcing = `There is a checkmate on the board. Look at your checks!`;
    } else if (s.targets.length) {
      const t = s.targets[0];
      notes.forcing = `${v.Pos(other(me))} ${NAME[t.type]} on ${t.square} is not protected enough — can you win it?`;
      notes.marks[t.square] = notes.marks[t.square] || 'target';
    } else {
      const parts = [];
      if (s.checks.length) parts.push(`${s.checks.length} check${s.checks.length > 1 ? 's' : ''}`);
      if (s.captures.length) parts.push(`${s.captures.length} capture${s.captures.length > 1 ? 's' : ''}`);
      const one = s.checks.length + s.captures.length === 1;
      notes.forcing = parts.length ? `${cap(v.subj(me))} ${me === v.me ? 'have' : 'has'} ${parts.join(' and ')}. Look at ${one ? 'it' : 'them'} before quiet moves.` : 'No checks or captures. Improve your least active piece.';
    }
    notes.scan = s;
    return notes;
  }

  /* ── Narration for board demonstrations ─────────────────── */
  function narrate(fenBefore, move, me = null, opponent = 'your opponent') {
    const v = makeVoice(me, opponent), g = new Chess(fenBefore);
    const m = g.move(typeof move === 'string' ? parse(move) : { from: move.from, to: move.to, promotion: move.promotion || 'q' });
    if (!m) return '';
    const who = m.color, them = other(who);
    let text;
    if (m.flags.includes('k') || m.flags.includes('q')) text = `${v.Subj(who)} castle${v.me === who ? '' : 's'}.`;
    else if (m.captured) text = `${v.Pos(who)} ${NAME[m.piece]} takes ${v.pos(them)} ${NAME[m.captured]} on ${m.to}.`;
    else text = `${v.Pos(who)} ${NAME[m.piece]} goes to ${m.to}.`;
    if (m.promotion) text += ` It becomes a ${NAME[m.promotion]}.`;
    if (g.in_checkmate()) return `${text} Checkmate — no escape, block or capture.`;
    const forks = forkTargets(g.fen(), m.to);
    if (forks.length >= 2) text += ` Fork: it attacks the ${NAME[forks[0].type]} and the ${NAME[forks[1].type]} at once.`;
    else if (g.in_check()) text += ` Check — ${v.subj(them)} must deal with it.`;
    if (m.captured && !g.in_check()) {
      const back = g.moves({ verbose: true }).filter((x) => x.to === m.to && x.captured);
      text += back.length ? ` ${v.Subj(them)} can take back.` : ` No piece can take back.`;
    } else if (!forks.length && !g.in_check()) {
      const threats = loosePieces(withTurn(g.fen(), who), them).filter((t) => !loosePieces(withTurn(fenBefore, who), them).some((u) => u.square === t.square));
      if (threats.length) text += ` Now ${v.pos(them)} ${NAME[threats[0].type]} on ${threats[0].square} is attacked.`;
    }
    return text;
  }
  // One sentence about an opponent move, from "your" point of view.
  function opponentNote(fenBefore, move, me, opponent = 'your opponent') {
    const v = makeVoice(me, opponent, 'its'), g = new Chess(fenBefore);
    const m = g.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    if (!m) return '';
    if (g.in_checkmate()) return `${cap(opponent)} played ${m.san} — checkmate.`;
    const parts = [];
    if (m.captured) {
      const back = g.moves({ verbose: true }).filter((x) => x.to === m.to && x.captured);
      parts.push(`took your ${NAME[m.captured]} on ${m.to}${back.length ? ` — you can take back with ${back[0].san}` : ''}`);
    }
    const forks = forkTargets(g.fen(), m.to);
    if (forks.length >= 2) parts.push(`forks your ${NAME[forks[0].type]} and ${NAME[forks[1].type]}`);
    else if (g.in_check()) parts.push('gives check');
    if (!forks.length) {
      const fresh = loosePieces(withTurn(g.fen(), other(me)), me).filter((t) => !loosePieces(withTurn(fenBefore, other(me)), me).some((u) => u.square === t.square));
      if (fresh.length) parts.push(`attacks your ${NAME[fresh[0].type]} on ${fresh[0].square}`);
    }
    const mateThreat = !g.in_check() && new Chess(withTurn(g.fen(), other(me))).moves().find((s) => s.includes('#'));
    if (mateThreat) parts.push(`threatens ${mateThreat} checkmate`);
    if (!parts.length) parts.push(effectOf(fenBefore, m, v) || 'makes a quiet move');
    return `${cap(opponent)} played ${m.san}: it ${parts.join(', and ')}.`.replace(/: it took/, ' and took').replace(/: it castles/, ' and castled');
  }

  /* ── Learner profile: level and recurring mistakes ──────── */
  const PROFILE_KEY = 'chess-tutor.coach.v1';
  const LEVELS = {
    beginner: { label: 'Beginner', pause: new Set(['mistake', 'blunder']), reveal: true, details: false },
    intermediate: { label: 'Intermediate', pause: new Set(['mistake', 'blunder']), reveal: false, details: true },
    advanced: { label: 'Advanced', pause: new Set(['blunder']), reveal: false, details: true },
  };
  class Profile {
    constructor(storage) {
      this.storage = storage;
      this.data = { level: null, pause: true, history: [], games: [] };
      try {
        const d = JSON.parse(storage.getItem(PROFILE_KEY) || 'null');
        if (d && typeof d === 'object') {
          if (LEVELS[d.level]) this.data.level = d.level;
          if (typeof d.pause === 'boolean') this.data.pause = d.pause;
          if (Array.isArray(d.history)) this.data.history = d.history.filter((h) => h && CONCEPTS[h.c] && Number.isFinite(h.t)).slice(-300);
          if (Array.isArray(d.games)) this.data.games = d.games.filter((g) => typeof g === 'string').slice(-50);
        }
      } catch (_) {}
    }
    get level() { return this.data.level || 'intermediate'; }
    get chosen() { return !!this.data.level; }
    setLevel(level) { if (LEVELS[level]) { this.data.level = level; this.save(); } }
    setPause(on) { this.data.pause = !!on; this.save(); }
    shouldPause(verdict) { return this.data.pause && LEVELS[this.level].pause.has(verdict); }
    record(conceptId, source) {
      if (!CONCEPTS[conceptId]) return;
      this.data.history.push({ c: conceptId, t: Date.now(), s: source || 'game' });
      this.data.history = this.data.history.slice(-300);
      this.save();
    }
    // Count a reviewed game's lessons once, even if the same game is reviewed again.
    recordGame(key, conceptIds, source) {
      if (this.data.games.includes(key)) return;
      this.data.games = [...this.data.games, key].slice(-50);
      for (const id of conceptIds) if (CONCEPTS[id]) this.data.history.push({ c: id, t: Date.now(), s: source || 'review' });
      this.data.history = this.data.history.slice(-300);
      this.save();
    }
    top(limit = 3, days = 30) {
      const since = Date.now() - days * 86400000, counts = {};
      for (const h of this.data.history) if (h.t >= since) counts[h.c] = (counts[h.c] || 0) + 1;
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id, n]) => ({ id, count: n, ...CONCEPTS[id], practice: PRACTICE[CONCEPTS[id].practice] }));
    }
    save() { try { this.storage.setItem(PROFILE_KEY, JSON.stringify(this.data)); } catch (_) {} }
  }
  let storage;
  try { storage = window.localStorage; storage.getItem(PROFILE_KEY); } catch (_) { storage = { getItem() { return null; }, setItem() {} }; }

  const verdictLabel = (verdict, level) => VERDICT_TEXT[verdict][level === 'beginner' ? 'beginner' : 'label'];
  // Mover's view: "+1.4", "−0.3", "mate in 3", "mated in 2".
  function formatCp(cp) {
    if (cp == null) return '';
    const n = mateIn(cp);
    if (n != null) return cp > 0 ? `mate in ${n}` : n === 0 ? 'checkmated' : `mated in ${n}`;
    const p = (cp / 100).toFixed(1);
    return cp > 0 ? `+${p}` : cp < 0 ? `−${p.slice(1)}` : '0.0';
  }

  window.ChessTeach = {
    VALUE, NAME, SIDE, CONCEPTS, ROUTINE, PRACTICE, LEVELS, VERDICTS,
    parse, uciOf, other, scoreOf, winChance, winPercent, moveAccuracy, classify, isMateScore, mateIn,
    boardMap, attacksFrom, attackersOf, exchangeGain, loosePieces, forkTargets, pinnedPieces, withTurn,
    trace, label, lineText, sanOf, phaseOf, effectOf, lessonFor, scan, routineNotes, narrate, opponentNote, makeVoice, bookInfo,
    verdictLabel, formatCp, MATE,
    profile: new Profile(storage), Profile,
  };
})();

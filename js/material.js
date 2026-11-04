/* Material strip shared by Free Play and Coach Play: the pieces one side has captured,
   shown on a light tray so dark pieces stay visible, and that side's lead (+N). */
(() => {
  'use strict';
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const ORDER = ['p', 'n', 'b', 'r', 'q'];
  const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };
  const SIDE = { w: 'White', b: 'Black' };
  const IMG = {
    wp: '4/45/Chess_plt45.svg', wn: '7/70/Chess_nlt45.svg', wb: 'b/b1/Chess_blt45.svg',
    wr: '7/72/Chess_rlt45.svg', wq: '1/15/Chess_qlt45.svg',
    bp: 'c/c7/Chess_pdt45.svg', bn: 'e/ef/Chess_ndt45.svg', bb: '9/98/Chess_bdt45.svg',
    br: 'f/ff/Chess_rdt45.svg', bq: '4/47/Chess_qdt45.svg',
  };
  const SYMBOL = { wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛' };
  const other = (c) => (c === 'w' ? 'b' : 'w');

  // White's material minus Black's, read from the board (so promotions count).
  function balance(fen) {
    let n = 0;
    for (const p of new Chess(fen).board().flat()) if (p) n += VALUE[p.type] * (p.color === 'w' ? 1 : -1);
    return n;
  }

  // Piece types each side has taken: { w: ['p', 'n'], b: ['p'] }. Moves need { color, captured }.
  function captures(moves) {
    const out = { w: [], b: [] };
    for (const m of moves) if (m && m.captured) out[m.color].push(m.captured);
    return out;
  }

  function describe(color, taken, lead) {
    const counts = ORDER.filter((t) => taken.includes(t)).map((t) => {
      const k = taken.filter((x) => x === t).length;
      return k > 1 ? `${k} ${NAME[t]}s` : `a ${NAME[t]}`;
    });
    const list = counts.length > 1 ? `${counts.slice(0, -1).join(', ')} and ${counts[counts.length - 1]}` : counts[0];
    const got = counts.length ? `${SIDE[color]} has captured ${list}.` : `${SIDE[color]} has captured nothing yet.`;
    return lead > 0 ? `${got} ${SIDE[color]} is ahead by ${lead}.` : got;
  }

  // Fill `el` with what `color` has captured (pieces of the other color) and its lead.
  function render(el, color, taken, whiteLead) {
    const lead = color === 'w' ? whiteLead : -whiteLead;
    el.replaceChildren();
    el.classList.add('mat');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', describe(color, taken, lead));
    const sorted = [...taken].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    if (sorted.length) {
      const tray = document.createElement('span');
      tray.className = 'mat-tray';
      let group = null;
      sorted.forEach((t, i) => {
        if (t !== sorted[i - 1]) {
          group = document.createElement('span');
          group.className = 'mat-group';
          tray.append(group);
        }
        const code = other(color) + t, piece = document.createElement('span'), img = document.createElement('img');
        piece.className = 'mat-piece';
        piece.dataset.symbol = SYMBOL[code];
        img.src = 'https://upload.wikimedia.org/wikipedia/commons/' + IMG[code];
        img.alt = '';
        img.draggable = false;
        img.onerror = () => { piece.textContent = SYMBOL[code]; };
        piece.append(img);
        group.append(piece);
      });
      el.append(tray);
    }
    if (lead > 0) {
      const score = document.createElement('span');
      score.className = 'mat-score';
      score.textContent = `+${lead}`;
      el.append(score);
    }
  }

  window.ChessMaterial = { balance, captures, render };
})();

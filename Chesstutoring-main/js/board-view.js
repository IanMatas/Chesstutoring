/* A clickable board with square highlights and arrows, shared by the study board and game review. */
(() => {
  'use strict';
  const IMAGES = {
    wk: '4/42/Chess_klt45.svg', wq: '1/15/Chess_qlt45.svg', wr: '7/72/Chess_rlt45.svg',
    wb: 'b/b1/Chess_blt45.svg', wn: '7/70/Chess_nlt45.svg', wp: '4/45/Chess_plt45.svg',
    bk: 'f/f0/Chess_kdt45.svg', bq: '4/47/Chess_qdt45.svg', br: 'f/ff/Chess_rdt45.svg',
    bb: '9/98/Chess_bdt45.svg', bn: 'e/ef/Chess_ndt45.svg', bp: 'c/c7/Chess_pdt45.svg',
  };
  const SYMBOLS = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };
  const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const ARROW = { danger: '#e0524f', good: '#8fc46f', best: '#8fc46f', info: '#6ea8dc', warn: '#e6a827' };
  const NS = 'http://www.w3.org/2000/svg';

  class BoardView {
    constructor(el, { onSquare } = {}) {
      this.el = el;
      this.onSquare = onSquare;
      el.classList.add('tc-board');
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-square]');
        if (b && !b.disabled && this.onSquare) this.onSquare(b.dataset.square);
      });
      el.addEventListener('error', (e) => {
        if (e.target.tagName !== 'IMG') return;
        const piece = e.target.parentElement;
        piece.textContent = piece.dataset.symbol || '';
      }, true);
    }

    /* fen, flipped, selected square, legal target squares, last move {from,to},
       marks {square: 'danger'|'target'|'warn'|'hint'}, arrows [{from,to,color}], disabled */
    render({ fen, flipped = false, selected = null, legal = [], last = null, marks = {}, arrows = [], disabled = false }) {
      const g = new Chess(fen);
      this.flipped = flipped;
      const squares = [];
      for (let r = 0; r < 8; r++)
        for (let f = 0; f < 8; f++) {
          const rank = flipped ? r + 1 : 8 - r, file = flipped ? 7 - f : f;
          const sq = String.fromCharCode(97 + file) + rank, p = g.get(sq);
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.square = sq;
          b.className = [
            'learning-square', (file + rank) % 2 ? 'dark' : 'light',
            selected === sq ? 'selected' : '', legal.includes(sq) ? 'possible' : '',
            last && (last.from === sq || last.to === sq) ? 'study-last' : '',
            marks[sq] ? `tc-mark-${marks[sq]}` : '',
          ].filter(Boolean).join(' ');
          b.disabled = disabled;
          b.setAttribute('aria-label', `${sq}, ${p ? `${p.color === 'w' ? 'White' : 'Black'} ${NAMES[p.type]}` : 'empty'}`);
          const span = document.createElement('span');
          span.className = 'learning-piece';
          if (p) {
            span.dataset.symbol = SYMBOLS[p.color + p.type];
            const img = document.createElement('img');
            img.src = 'https://upload.wikimedia.org/wikipedia/commons/' + IMAGES[p.color + p.type];
            img.alt = '';
            img.draggable = false;
            span.append(img);
          }
          b.append(span);
          if (f === 0) b.append(Object.assign(document.createElement('span'), { className: 'learning-rank', textContent: rank }));
          if (r === 7) b.append(Object.assign(document.createElement('span'), { className: 'learning-file', textContent: String.fromCharCode(97 + file) }));
          squares.push(b);
        }
      this.el.replaceChildren(...squares, this.arrowLayer(arrows));
    }

    center(sq) {
      const f = sq.charCodeAt(0) - 97, r = +sq[1];
      const col = this.flipped ? 7 - f : f, row = this.flipped ? r - 1 : 8 - r;
      return [col * 100 + 50, row * 100 + 50];
    }

    arrowLayer(arrows) {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 800 800');
      svg.setAttribute('class', 'tc-arrows');
      svg.setAttribute('aria-hidden', 'true');
      const defs = document.createElementNS(NS, 'defs');
      svg.append(defs);
      arrows.forEach((a, i) => {
        if (!a || !a.from || !a.to || a.from === a.to) return;
        const color = ARROW[a.color] || a.color || ARROW.info;
        const id = `tc-head-${Math.random().toString(36).slice(2)}-${i}`;
        const marker = document.createElementNS(NS, 'marker');
        marker.setAttribute('id', id);
        marker.setAttribute('markerWidth', '4');
        marker.setAttribute('markerHeight', '4');
        marker.setAttribute('refX', '2.2');
        marker.setAttribute('refY', '2');
        marker.setAttribute('orient', 'auto');
        const head = document.createElementNS(NS, 'path');
        head.setAttribute('d', 'M0,0 L4,2 L0,4 Z');
        head.setAttribute('fill', color);
        marker.append(head);
        defs.append(marker);
        const [x1, y1] = this.center(a.from), [x2, y2] = this.center(a.to);
        const len = Math.hypot(x2 - x1, y2 - y1), cut = 34;
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2 - ((x2 - x1) / len) * cut);
        line.setAttribute('y2', y2 - ((y2 - y1) / len) * cut);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '17');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('opacity', '0.82');
        line.setAttribute('marker-end', `url(#${id})`);
        svg.append(line);
      });
      return svg;
    }
  }
  window.BoardView = BoardView;
})();

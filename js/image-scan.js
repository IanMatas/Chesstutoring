/* image-scan.js — Intelligent in-browser chessboard & piece recognizer.
   1. Auto-detects the 8x8 chessboard boundaries in any screenshot (crops headers, footers, borders).
   2. Samples square colors using canonical board color analysis (handles highlighted squares, coordinate labels).
   3. Detects empty squares vs White/Black pieces.
   4. Classifies piece types (Pawn, Knight, Bishop, Rook, Queen, King) using shape profile and silhouette matching.
   5. Auto-detects checks and sets whose turn it is.
   6. Renders a side-by-side cropped view so the user can verify, tweak with the palette, and place on board. */
(() => {
  'use strict';

  const PIECE_IMAGES = {
    wk: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    wq: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    wr: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    wb: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    wn: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    wp: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    bk: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
    bq: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    br: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    bb: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    bn: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    bp: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg'
  };

  /* Preload template images (used as silhouettes for piece-type matching) */
  const templateBitmaps = {};
  // Extra template set: Chess.com "neo" pieces (the most common screenshot source)
  const NEO_URL = (k) => `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${k}.png`;
  const TEMPLATE_SOURCES = [
    ...Object.entries(PIECE_IMAGES),
    ...Object.keys(PIECE_IMAGES).map(k => [`neo-${k}`, NEO_URL(k)])
  ];
  const templatesReady = Promise.all(TEMPLATE_SOURCES.map(([name, url]) => new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { templateBitmaps[name] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = url;
  })));

  const NORM = 32; // normalized silhouette resolution

  /* ═══════════════════════════════════════════════════════
     Computer Vision Engine
     ═══════════════════════════════════════════════════════ */

  class BoardVisionEngine {
    /** Grayscale buffer of the full image. */
    static toGray(data, W, H) {
      const g = new Float32Array(W * H);
      for (let i = 0, p = 0; i < g.length; i++, p += 4) {
        g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      }
      return g;
    }

    /**
     * Finds the 9 equally spaced grid lines along one axis by maximizing edge
     * strength at grid lines while penalizing edges at square centers.
     */
    static findGridAxis(profile, N) {
      const at = (i) => {
        const k = Math.round(i);
        let m = 0;
        for (let d = -1; d <= 1; d++) {
          const v = profile[k + d];
          if (v !== undefined && v > m) m = v;
        }
        return m;
      };
      let best = { score: -Infinity, offset: 0, step: N / 8 };
      const minStep = Math.max(8, N / 8 * 0.25);
      for (let s = N / 8; s >= minStep; s -= 0.5) {
        for (let o = 0; o + 8 * s < N; o += 1) {
          let peaks = 0, mids = 0, minPeak = Infinity;
          for (let k = 0; k <= 8; k++) {
            const v = at(o + k * s);
            peaks += v;
            if (k >= 1 && k <= 7 && v < minPeak) minPeak = v;
            if (k < 8) mids += at(o + k * s + s / 2);
          }
          // Inner grid lines must all be present; favor bigger boards slightly.
          const score = (peaks / 9 - mids / 8) + minPeak * 0.5 + s * 0.01;
          if (score > best.score) best = { score, offset: o, step: s };
        }
      }
      return best;
    }

    static findBoardBounds(gray, W, H) {
      const colP = new Float32Array(W);
      const rowP = new Float32Array(H);
      for (let y = 1; y < H; y++) {
        for (let x = 1; x < W; x++) {
          const i = y * W + x;
          colP[x] += Math.abs(gray[i] - gray[i - 1]);
          rowP[y] += Math.abs(gray[i] - gray[i - W]);
        }
      }
      for (let x = 0; x < W; x++) colP[x] /= H;
      for (let y = 0; y < H; y++) rowP[y] /= W;

      const bx = this.findGridAxis(colP, W);
      const by = this.findGridAxis(rowP, H);
      const step = (bx.step + by.step) / 2;
      return { x: bx.offset, y: by.offset, width: step * 8, height: step * 8, sqSize: step };
    }

    /** Median color of a thin ring along the square's border (robust to labels / highlights). */
    static squareBackground(data, w, h) {
      const rs = [], gs = [], bs = [];
      const band = Math.max(1, Math.floor(w * 0.06));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (x >= band && x < w - band && y >= band && y < h - band) continue;
          const i = (y * w + x) * 4;
          rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
        }
      }
      const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
      return { r: med(rs), g: med(gs), b: med(bs) };
    }

    /** Foreground mask with interior holes filled (flood-fill background from the border). */
    static pieceMask(data, w, h, bg) {
      const fg = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        const diff = Math.abs(data[p] - bg.r) + Math.abs(data[p + 1] - bg.g) + Math.abs(data[p + 2] - bg.b);
        if (diff > 40) fg[i] = 1;
      }
      // Flood fill from edges through non-foreground pixels
      const outside = new Uint8Array(w * h);
      const stack = [];
      const push = (i) => { if (!fg[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
      while (stack.length) {
        const i = stack.pop();
        const x = i % w, y = (i / w) | 0;
        if (x > 0) push(i - 1);
        if (x < w - 1) push(i + 1);
        if (y > 0) push(i - w);
        if (y < h - 1) push(i + w);
      }
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) mask[i] = outside[i] ? 0 : 1;
      return this.largestComponent(mask, w, h);
    }

    /** Keeps only the biggest connected blob (drops coordinate letters, dots, etc). */
    static largestComponent(mask, w, h) {
      const label = new Int32Array(w * h);
      let best = 0, bestSize = 0, id = 0;
      for (let s = 0; s < w * h; s++) {
        if (!mask[s] || label[s]) continue;
        id++;
        let size = 0;
        const stack = [s];
        label[s] = id;
        while (stack.length) {
          const i = stack.pop();
          size++;
          const x = i % w;
          for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
            if (j >= 0 && j < w * h && mask[j] && !label[j]) { label[j] = id; stack.push(j); }
          }
        }
        if (size > bestSize) { bestSize = size; best = id; }
      }
      const out = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = label[i] === best ? 1 : 0;
      return out;
    }

    /** Crops a mask to its bounding box and resamples it into NORM x NORM (aspect preserved). */
    static normalizeMask(mask, w, h) {
      let minX = w, maxX = -1, minY = h, maxY = -1, area = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!mask[y * w + x]) continue;
          area++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) return null;
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const scale = NORM / Math.max(bw, bh);
      const ox = (NORM - bw * scale) / 2, oy = (NORM - bh * scale) / 2;
      const out = new Uint8Array(NORM * NORM);
      for (let ny = 0; ny < NORM; ny++) {
        for (let nx = 0; nx < NORM; nx++) {
          const sx = Math.floor((nx - ox) / scale) + minX;
          const sy = Math.floor((ny - oy) / scale) + minY;
          if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY && mask[sy * w + sx]) out[ny * NORM + nx] = 1;
        }
      }
      return { norm: out, aspect: bw / bh, bw, bh, area };
    }

    static templates() {
      if (this._templates) return this._templates;
      const list = [];
      const S = 90;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      for (const [name, img] of Object.entries(templateBitmaps)) {
        ctx.clearRect(0, 0, S, S);
        ctx.drawImage(img, 0, 0, S, S);
        let d;
        try { d = ctx.getImageData(0, 0, S, S).data; } catch (e) { continue; }
        const mask = new Uint8Array(S * S);
        for (let i = 0; i < S * S; i++) mask[i] = d[i * 4 + 3] > 100 ? 1 : 0;
        const n = this.normalizeMask(mask, S, S);
        if (n) list.push({ type: name.slice(-1), ...n });
      }
      if (list.length === TEMPLATE_SOURCES.length) this._templates = list;
      return list;
    }

    static matchType(n) {
      let best = { type: 'p', score: -Infinity };
      for (const t of this.templates()) {
        let inter = 0, uni = 0;
        for (let i = 0; i < n.norm.length; i++) {
          const a = n.norm[i], b = t.norm[i];
          if (a & b) inter++;
          if (a | b) uni++;
        }
        const score = inter / Math.max(1, uni) - Math.abs(Math.log(n.aspect / t.aspect)) * 0.6;
        if (score > best.score) best = { type: t.type, score };
      }
      return best.type;
    }

    /** Main recognition routine. Returns { fen, bounds, turn, inCheck }. */
    static async recognize(img) {
      await templatesReady;
      let W = img.naturalWidth || img.width;
      let H = img.naturalHeight || img.height;
      // Downscale very large images for speed
      const k = Math.min(1, 900 / Math.max(W, H));
      W = Math.round(W * k); H = Math.round(H * k);

      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const all = ctx.getImageData(0, 0, W, H).data;

      const b = this.findBoardBounds(this.toGray(all, W, H), W, H);
      const sq = b.sqSize;

      const grid = [];
      for (let r = 0; r < 8; r++) {
        const row = [];
        for (let c = 0; c < 8; c++) {
          // Inset a little so slivers of neighboring squares don't pollute the mask
          const inset = Math.ceil(sq * 0.04);
          const sx = Math.round(b.x + c * sq) + inset, sy = Math.round(b.y + r * sq) + inset;
          const s = Math.max(4, Math.floor(sq) - inset * 2);
          row.push(this.classifySquare(ctx.getImageData(sx, sy, s, s).data, s));
        }
        grid.push(row);
      }

      this.fixOrientation(grid);
      this.normalizeKings(grid);

      const placement = grid.map(row => {
        let str = '', empty = 0;
        for (const p of row) {
          if (!p) { empty++; continue; }
          if (empty) { str += empty; empty = 0; }
          str += p.color === 'w' ? p.type.toUpperCase() : p.type;
        }
        return str + (empty || '');
      }).join('/');

      let inCheck = null, turn = 'w';
      try { if (new Chess(`${placement} b - - 0 1`).in_check()) { inCheck = 'b'; turn = 'b'; } } catch (e) {}
      if (!inCheck) {
        try { if (new Chess(`${placement} w - - 0 1`).in_check()) inCheck = 'w'; } catch (e) {}
      }

      const bounds = { x: b.x / k, y: b.y / k, width: b.width / k, height: b.height / k, sqSize: sq / k };
      return { fen: `${placement} ${turn} - - 0 1`, bounds, turn, inCheck };
    }

    /** Classifies one square image: null (empty) or { type, color }. */
    static classifySquare(data, s) {
      const bg = this.squareBackground(data, s, s);
      const mask = this.pieceMask(data, s, s, bg);
      const n = this.normalizeMask(mask, s, s);
      if (!n) return null;
      // Reject coordinate labels, dots, and highlight remnants
      if (n.area < s * s * 0.08 || n.bh < s * 0.35 || n.bw < s * 0.2) return null;
      // A blob spanning the whole square is image noise, not a piece
      if (n.bw >= s * 0.97 && n.bh >= s * 0.97) return null;

      let bright = 0, dark = 0;
      for (let i = 0; i < s * s; i++) {
        if (!mask[i]) continue;
        const p = i * 4;
        const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        if (lum > 150) bright++;
        else if (lum < 110) dark++;
      }
      // White pieces have thick dark outlines, black pieces only thin light details
      const color = bright > dark * 0.5 ? 'w' : 'b';
      return { type: this.matchType(n), color };
    }

    /** If the screenshot is from Black's perspective, rotate the grid 180°. */
    static fixOrientation(grid) {
      let wSum = 0, wN = 0, bSum = 0, bN = 0;
      grid.forEach((row, r) => row.forEach(p => {
        if (!p) return;
        if (p.color === 'w') { wSum += r; wN++; } else { bSum += r; bN++; }
      }));
      if (wN && bN && wSum / wN < bSum / bN) {
        grid.reverse();
        grid.forEach(row => row.reverse());
      }
    }

    /** Ensures at most one king per side. */
    static normalizeKings(grid) {
      const seen = { w: 0, b: 0 };
      for (const row of grid) for (const p of row) {
        if (p && p.type === 'k' && ++seen[p.color] > 1) p.type = 'q';
      }
    }
  }

  /* ═══════════════════════════════════════════════════════
     Sanitization & FEN Helpers
     ═══════════════════════════════════════════════════════ */

  function sanitizeFen(rawFen, activeTurn = 'w') {
    if (!rawFen) return null;
    let clean = rawFen.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();
    const match = clean.match(/([rnbqkpRNBQKP1-8/]{15,71})/);
    if (!match) return null;

    const placement = match[1];
    const ranks = placement.split('/');
    if (ranks.length !== 8) return null;

    for (const rank of ranks) {
      let count = 0;
      for (const ch of rank) {
        if (/[1-8]/.test(ch)) count += parseInt(ch, 10);
        else if (/[rnbqkpRNBQKP]/.test(ch)) count += 1;
        else return null;
      }
      if (count !== 8) return null;
    }

    const turn = (activeTurn === 'b') ? 'b' : 'w';
    const test = new Chess();

    const candidate1 = `${placement} ${turn} - - 0 1`;
    if (test.load(candidate1)) return candidate1;

    const candidate2 = `${placement} ${turn} KQkq - 0 1`;
    if (test.load(candidate2)) return candidate2;

    return null;
  }

  /* ═══════════════════════════════════════════════════════
     ImageScanController
     ═══════════════════════════════════════════════════════ */

  class ImageScanController {
    constructor() {
      this.dialog = null;
      this.currentFile = null;
      this.currentImage = null;
      this.currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      this.chosenTurn = 'w';
      this.targetMode = 'coach';
      this.playerColor = 'w';
      this.selectedPalettePiece = null;
    }

    init() {
      if (document.getElementById('scanDialog')) {
        this.dialog = document.getElementById('scanDialog');
        return;
      }

      const d = document.createElement('dialog');
      d.id = 'scanDialog';
      d.className = 'puzzle-dialog scan-dialog';
      d.innerHTML = `
        <div class="scan-modal-inner">
          <div class="scan-header">
            <div>
              <span class="eyebrow">CHESS POSITION SCANNER</span>
              <h2>📷 Upload Chess Board Image</h2>
            </div>
            <button class="btn btn-ghost scan-close-btn" id="scanCloseIcon" aria-label="Close dialog">✕</button>
          </div>
          <p class="scan-intro">Drop or paste any chessboard screenshot. The computer vision engine auto-detects the board boundaries and pieces instantly on your device.</p>

          <!-- Dropzone -->
          <div class="scan-dropzone" id="scanDropzone" tabindex="0" role="button" aria-label="Upload or drop chess board image">
            <div class="scan-drop-content">
              <span class="scan-drop-icon">🖼️</span>
              <p class="scan-drop-main"><strong>Drop a chess board screenshot here</strong> or click to choose</p>
              <p class="scan-drop-hint">Supports PNG, JPG, WEBP · Or paste from clipboard (<kbd>Ctrl+V</kbd>)</p>
            </div>
            <input type="file" id="scanFileInput" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          </div>

          <!-- Side-by-side Workspace -->
          <div class="scan-workspace" id="scanWorkspace" hidden>
            <!-- Left: Uploaded image cropped to board -->
            <div class="scan-pane scan-image-pane">
              <div class="scan-pane-header">
                <strong>Your Board Image</strong>
                <button class="btn btn-ghost btn-sm" id="scanNewImageBtn">Change image</button>
              </div>
              <div class="scan-img-container" id="scanImgContainer">
                <canvas id="scanCroppedCanvas" class="scan-cropped-canvas"></canvas>
              </div>
            </div>

            <!-- Right: Interactive recognized board -->
            <div class="scan-pane scan-board-pane">
              <div class="scan-pane-header">
                <strong>Recognized Position</strong>
                <span id="scanStatusBadge" class="scan-badge">✓ Detected</span>
              </div>

              <!-- Interactive 8x8 Board -->
              <div class="scan-board-wrapper">
                <div class="scan-mini-board" id="scanMiniBoard"></div>
              </div>

              <!-- Piece Palette for Quick Corrections -->
              <div class="scan-palette-wrap">
                <span class="muted tiny">Click square to edit, or select a piece to place:</span>
                <div class="scan-palette-items" id="scanPaletteItems">
                  <button type="button" class="scan-pal-btn" data-piece="wp" title="White Pawn"><img src="${PIECE_IMAGES.wp}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="wn" title="White Knight"><img src="${PIECE_IMAGES.wn}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="wb" title="White Bishop"><img src="${PIECE_IMAGES.wb}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="wr" title="White Rook"><img src="${PIECE_IMAGES.wr}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="wq" title="White Queen"><img src="${PIECE_IMAGES.wq}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="wk" title="White King"><img src="${PIECE_IMAGES.wk}"></button>
                  <span class="scan-pal-sep"></span>
                  <button type="button" class="scan-pal-btn" data-piece="bp" title="Black Pawn"><img src="${PIECE_IMAGES.bp}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="bn" title="Black Knight"><img src="${PIECE_IMAGES.bn}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="bb" title="Black Bishop"><img src="${PIECE_IMAGES.bb}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="br" title="Black Rook"><img src="${PIECE_IMAGES.br}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="bq" title="Black Queen"><img src="${PIECE_IMAGES.bq}"></button>
                  <button type="button" class="scan-pal-btn" data-piece="bk" title="Black King"><img src="${PIECE_IMAGES.bk}"></button>
                  <button type="button" class="scan-pal-btn scan-pal-trash" data-piece="clear" title="Clear square">✕</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Configuration Controls -->
          <div class="scan-config-card" id="scanConfigCard" hidden>
            <!-- Turn Selector: Which side goes first -->
            <div class="scan-option-group">
              <label class="scan-label" id="scanTurnLabel">Whose turn is it next? (Who moves first?)</label>
              <div class="scan-turn-toggle">
                <button type="button" class="scan-turn-btn active" data-turn="w">
                  <span class="turn-dot white-dot"></span> White to move
                </button>
                <button type="button" class="scan-turn-btn" data-turn="b">
                  <span class="turn-dot black-dot"></span> Black to move
                </button>
              </div>
            </div>

            <!-- Destination Mode Selector -->
            <div class="scan-option-group">
              <label class="scan-label">Where do you want to play?</label>
              <div class="scan-mode-toggle">
                <button type="button" class="scan-mode-btn active" data-mode="coach">
                  <strong>🎓 Coach Play</strong>
                  <span class="small muted">Stockfish engine evaluation, bot play, coach feedback</span>
                </button>
                <button type="button" class="scan-mode-btn" data-mode="free">
                  <strong>♟️ Free Play</strong>
                  <span class="small muted">Sandbox board, explore moves freely, toggle bot</span>
                </button>
              </div>
            </div>

            <!-- Coach Play Color Sub-Option -->
            <div class="scan-option-group" id="scanCoachColorGroup">
              <label class="scan-label">In Coach Play, you play as:</label>
              <div class="scan-color-toggle">
                <button type="button" class="scan-color-btn active" data-color="w">♔ White</button>
                <button type="button" class="scan-color-btn" data-color="b">♚ Black</button>
              </div>
            </div>

            <!-- Actions -->
            <div class="scan-apply-actions">
              <button id="scanApplyBtn" class="btn btn-primary btn-lg">Place on Board & Analyze →</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(d);
      this.dialog = d;
      this.bindEvents();
    }

    bindEvents() {
      const d = this.dialog;
      const dropzone = d.querySelector('#scanDropzone');
      const fileInput = d.querySelector('#scanFileInput');
      const closeBtn = d.querySelector('#scanCloseIcon');
      const newImgBtn = d.querySelector('#scanNewImageBtn');
      const applyBtn = d.querySelector('#scanApplyBtn');

      dropzone.onclick = () => fileInput.click();
      dropzone.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click();
        }
      };

      fileInput.onchange = () => {
        if (fileInput.files[0]) this.handleFile(fileInput.files[0]);
      };

      // Drag and drop
      ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, e => {
          e.preventDefault();
          dropzone.classList.add('hover');
        });
      });
      ['dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, () => dropzone.classList.remove('hover'));
      });
      dropzone.addEventListener('drop', e => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (f && f.type.startsWith('image/')) this.handleFile(f);
      });

      // Clipboard paste
      d.addEventListener('paste', e => this.handlePaste(e));
      window.addEventListener('paste', e => {
        if (this.dialog.open) this.handlePaste(e);
      });

      newImgBtn.onclick = () => fileInput.click();

      // Turn selection
      d.querySelectorAll('.scan-turn-btn').forEach(btn => {
        btn.onclick = () => {
          d.querySelectorAll('.scan-turn-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.chosenTurn = btn.dataset.turn;
          this.updateTurnInFen();
        };
      });

      // Destination mode
      d.querySelectorAll('.scan-mode-btn').forEach(btn => {
        btn.onclick = () => {
          d.querySelectorAll('.scan-mode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.targetMode = btn.dataset.mode;
          d.querySelector('#scanCoachColorGroup').hidden = (this.targetMode !== 'coach');
        };
      });

      // Player color
      d.querySelectorAll('.scan-color-btn').forEach(btn => {
        btn.onclick = () => {
          d.querySelectorAll('.scan-color-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.playerColor = btn.dataset.color;
        };
      });

      // Piece palette selection
      d.querySelectorAll('.scan-pal-btn').forEach(btn => {
        btn.onclick = () => {
          if (btn.classList.contains('active')) {
            btn.classList.remove('active');
            this.selectedPalettePiece = null;
          } else {
            d.querySelectorAll('.scan-pal-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.selectedPalettePiece = btn.dataset.piece;
          }
        };
      });

      // Mini-board square clicks
      d.querySelector('#scanMiniBoard').addEventListener('click', e => {
        const sqBtn = e.target.closest('[data-sq]');
        if (!sqBtn) return;
        const sq = sqBtn.dataset.sq;
        this.onSquareClick(sq);
      });

      applyBtn.onclick = () => this.applyPositionToBoard();
      closeBtn.onclick = () => this.close();
    }

    handlePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            this.handleFile(file);
            return;
          }
        }
      }
    }

    async handleFile(file) {
      this.currentFile = file;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;

      await new Promise(r => { img.onload = r; img.onerror = r; });
      this.currentImage = img;

      this.dialog.querySelector('#scanDropzone').hidden = true;
      this.dialog.querySelector('#scanWorkspace').hidden = false;
      this.dialog.querySelector('#scanConfigCard').hidden = false;

      // Run computer vision engine
      try {
        const res = await BoardVisionEngine.recognize(img);
        if (res && res.fen) {
          // Render cropped board image on the left canvas
          this.renderCroppedCanvas(img, res.bounds);

          this.chosenTurn = res.turn || 'w';
          if (res.inCheck) {
            this.dialog.querySelector('#scanTurnLabel').innerHTML =
              `Whose turn is it next? <strong style="color:#e0524f">(${res.inCheck === 'w' ? 'White' : 'Black'} is in check!)</strong>`;
          } else {
            this.dialog.querySelector('#scanTurnLabel').textContent = 'Whose turn is it next? (Who moves first?)';
          }

          this.setFen(res.fen);
        }
      } catch (err) {
        console.error('Board recognition error:', err);
      }
    }

    renderCroppedCanvas(img, bounds) {
      const canvas = this.dialog.querySelector('#scanCroppedCanvas');
      if (!canvas) return;
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        bounds.x, bounds.y, bounds.width, bounds.height,
        0, 0, bounds.width, bounds.height
      );
    }

    setFen(fen) {
      const sanitized = sanitizeFen(fen, this.chosenTurn) || fen;
      this.currentFen = sanitized;
      const g = new Chess();
      if (g.load(sanitized)) {
        this.chosenTurn = g.turn();
        this.dialog.querySelectorAll('.scan-turn-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.turn === this.chosenTurn);
        });
      }
      this.renderMiniBoard();
    }

    updateTurnInFen() {
      const sanitized = sanitizeFen(this.currentFen, this.chosenTurn);
      if (sanitized) {
        this.currentFen = sanitized;
        this.renderMiniBoard();
      }
    }

    renderMiniBoard() {
      const container = this.dialog.querySelector('#scanMiniBoard');
      if (!container) return;
      container.innerHTML = '';

      const g = new Chess();
      g.load(this.currentFen);

      for (let r = 8; r >= 1; r--) {
        for (let f = 0; f < 8; f++) {
          const fileChar = String.fromCharCode(97 + f);
          const sq = fileChar + r;
          const isDark = (f + r) % 2 === 0;

          const sqBtn = document.createElement('button');
          sqBtn.type = 'button';
          sqBtn.className = `scan-mini-sq ${isDark ? 'dark' : 'light'}`;
          sqBtn.dataset.sq = sq;
          sqBtn.title = sq;

          // Rank label
          if (f === 0) {
            const rLabel = document.createElement('span');
            rLabel.className = 'scan-sq-coord rank';
            rLabel.textContent = r;
            sqBtn.appendChild(rLabel);
          }
          // File label
          if (r === 1) {
            const fLabel = document.createElement('span');
            fLabel.className = 'scan-sq-coord file';
            fLabel.textContent = fileChar;
            sqBtn.appendChild(fLabel);
          }

          const p = g.get(sq);
          if (p) {
            const key = p.color + p.type;
            const img = document.createElement('img');
            img.src = PIECE_IMAGES[key];
            img.alt = key;
            sqBtn.appendChild(img);
          }

          container.appendChild(sqBtn);
        }
      }
    }

    onSquareClick(sq) {
      const g = new Chess();
      if (!g.load(this.currentFen)) return;

      if (this.selectedPalettePiece) {
        if (this.selectedPalettePiece === 'clear') {
          g.remove(sq);
        } else {
          const color = this.selectedPalettePiece[0];
          const type = this.selectedPalettePiece[1];
          g.put({ type, color }, sq);
        }
      } else {
        if (g.get(sq)) g.remove(sq);
      }

      this.currentFen = g.fen();
      this.updateTurnInFen();
    }

    applyPositionToBoard() {
      const finalFen = sanitizeFen(this.currentFen, this.chosenTurn);
      if (!finalFen) {
        alert('Please make sure both kings are on the board before proceeding.');
        return;
      }

      this.close();

      if (this.targetMode === 'coach') {
        if (window.trainer?._switchMode) window.trainer._switchMode('coach');
        if (window.app?.loadFen) window.app.loadFen(finalFen, this.playerColor);
      } else {
        if (window.trainer?._switchMode) window.trainer._switchMode('play');
        if (window.freePlay?.fromFen) {
          window.freePlay.fromFen(finalFen, 'both');
          window.freePlay.message = `Position loaded (${this.chosenTurn === 'w' ? 'White' : 'Black'} to move). Analyze and play from here!`;
          window.freePlay.render();
        }
      }
    }

    open(mode = 'coach') {
      this.init();
      this.targetMode = mode;
      this.dialog.querySelectorAll('.scan-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
      this.dialog.querySelector('#scanCoachColorGroup').hidden = (mode !== 'coach');
      this.dialog.showModal();
    }

    close() {
      if (this.dialog?.open) this.dialog.close();
    }
  }

  window.ImageScan = new ImageScanController();
})();

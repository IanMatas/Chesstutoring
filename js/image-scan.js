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

  /* Preload template images */
  const templateBitmaps = {};
  Object.entries(PIECE_IMAGES).forEach(([name, url]) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    templateBitmaps[name] = img;
  });

  /* ═══════════════════════════════════════════════════════
     Computer Vision Engine
     ═══════════════════════════════════════════════════════ */

  class BoardVisionEngine {
    /**
     * Finds the exact bounding box of the 8x8 chessboard inside any image.
     */
    static findBoardBounds(canvas, ctx) {
      const W = canvas.width;
      const H = canvas.height;
      const imgData = ctx.getImageData(0, 0, W, H).data;

      const midY = Math.floor(H / 2);
      const midX = Math.floor(W / 2);

      // A chessboard square has green, brown, blue, cream, or light grey colors.
      // Outside UI margins/bars are dark grey (R,G,B < 60) or solid background.
      function isBoardPixel(x, y) {
        if (x < 0 || x >= W || y < 0 || y >= H) return false;
        const idx = (y * W + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);

        // Board colors: cream (lum > 160), green (g > r && g > 75), brown/wood (r > 100 && sat > 25), blue, etc.
        return lum > 140 || (g > 85 && g > b) || (r > 90 && sat > 25) || (b > 85 && b > r);
      }

      let x0 = 0, x1 = W - 1;
      let y0 = 0, y1 = H - 1;

      // Scan horizontally across multiple lines to find left & right board edge
      for (let x = 0; x < W - 50; x++) {
        let boardHits = 0;
        for (let dy = -80; dy <= 80; dy += 20) {
          if (isBoardPixel(x, midY + dy)) boardHits++;
        }
        if (boardHits >= 4) { x0 = x; break; }
      }

      for (let x = W - 1; x >= 50; x--) {
        let boardHits = 0;
        for (let dy = -80; dy <= 80; dy += 20) {
          if (isBoardPixel(x, midY + dy)) boardHits++;
        }
        if (boardHits >= 4) { x1 = x; break; }
      }

      // Scan vertically across multiple lines to find top & bottom board edge
      for (let y = 0; y < H - 50; y++) {
        let boardHits = 0;
        for (let dx = -80; dx <= 80; dx += 20) {
          if (isBoardPixel(midX + dx, y)) boardHits++;
        }
        if (boardHits >= 4) { y0 = y; break; }
      }

      for (let y = H - 1; y >= 50; y--) {
        let boardHits = 0;
        for (let dx = -80; dx <= 80; dx += 20) {
          if (isBoardPixel(midX + dx, y)) boardHits++;
        }
        if (boardHits >= 4) { y1 = y; break; }
      }

      const boardW = x1 - x0 + 1;
      const boardH = y1 - y0 + 1;

      // In a real chessboard, width and height are nearly identical
      const size = Math.min(boardW, boardH);

      return {
        x: x0,
        y: y0,
        width: size,
        height: size,
        sqSize: size / 8
      };
    }

    /**
     * Main recognition routine. Returns { fen, bounds, turn, inCheck }.
     */
    static recognize(img) {
      const W = img.naturalWidth || img.width;
      const H = img.naturalHeight || img.height;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);

      const bounds = this.findBoardBounds(canvas, ctx);
      const sq = bounds.sqSize;

      // Sample canonical light and dark square colors from known squares
      // a8 (r=0, c=0) is dark, b8 (r=0, c=1) is light
      const darkColor = this.sampleSquareCorner(ctx, bounds.x + 0 * sq, bounds.y + 0 * sq, sq);
      const lightColor = this.sampleSquareCorner(ctx, bounds.x + 1 * sq, bounds.y + 0 * sq, sq);

      const grid = [];

      for (let r = 0; r < 8; r++) {
        const row = [];
        for (let c = 0; c < 8; c++) {
          const sx = bounds.x + c * sq;
          const sy = bounds.y + r * sq;
          const isLight = (r + c) % 2 === 0;
          const expectedBg = isLight ? lightColor : darkColor;

          const piece = this.classifySquare(ctx, sx, sy, sq, expectedBg, r, c);
          row.push(piece);
        }
        grid.push(row);
      }

      this.normalizeKings(grid);

      // Build FEN string
      const fenRanks = [];
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        let str = '';
        for (let c = 0; c < 8; c++) {
          const p = grid[r][c];
          if (!p) {
            empty++;
          } else {
            if (empty > 0) { str += empty; empty = 0; }
            str += (p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase());
          }
        }
        if (empty > 0) str += empty;
        fenRanks.push(str);
      }

      const placement = fenRanks.join('/');

      // Check if either king is in check
      let inCheck = null;
      let turn = 'w';

      try {
        const gB = new Chess(`${placement} b - - 0 1`);
        if (gB.in_check()) {
          inCheck = 'b';
          turn = 'b';
        }
      } catch (e) {}

      if (!inCheck) {
        try {
          const gW = new Chess(`${placement} w - - 0 1`);
          if (gW.in_check()) {
            inCheck = 'w';
            turn = 'w';
          }
        } catch (e) {}
      }

      const fen = `${placement} ${turn} - - 0 1`;
      return { fen, bounds, turn, inCheck };
    }

    /**
     * Samples the corner pixel of a square to get its true background color.
     */
    static sampleSquareCorner(ctx, sx, sy, sq) {
      const offset = Math.max(3, Math.floor(sq * 0.08));
      const p = ctx.getImageData(Math.floor(sx + offset), Math.floor(sy + offset), 1, 1).data;
      return { r: p[0], g: p[1], b: p[2] };
    }

    /**
     * Inspects a single square to classify empty vs occupied and piece type.
     */
    static classifySquare(ctx, sx, sy, sq, expectedBg, r, c) {
      const step = 2;
      const margin = Math.floor(sq * 0.10);
      const w = Math.floor(sq - margin * 2);
      const h = Math.floor(sq - margin * 2);

      const data = ctx.getImageData(Math.floor(sx + margin), Math.floor(sy + margin), w, h).data;

      let fg = 0;
      let isWhite = 0;
      let isBlack = 0;

      let minY = h, maxY = 0, minX = w, maxX = 0;
      const rowCounts = new Array(h).fill(0);
      const colCounts = new Array(w).fill(0);

      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const idx = (y * w + x) * 4;
          const pr = data[idx];
          const pg = data[idx + 1];
          const pb = data[idx + 2];

          const diff = Math.abs(pr - expectedBg.r) + Math.abs(pg - expectedBg.g) + Math.abs(pb - expectedBg.b);

          // Pixel differs significantly from square background
          if (diff > 55) {
            fg++;
            rowCounts[y]++;
            colCounts[x]++;

            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;

            // Pure white body vs dark body
            if (pr > 225 && pg > 225 && pb > 225) isWhite++;
            else if (pr < 95 && pg < 95 && pb < 95) isBlack++;
          }
        }
      }

      const pH = Math.max(1, maxY - minY);
      const pW = Math.max(1, maxX - minX);

      // Minimum piece thresholds to eliminate coordinate labels, surrender flags, and badges
      if (fg < 110 || (isWhite < 30 && isBlack < 30) || pH < sq * 0.40) {
        return null;
      }

      const color = (isWhite > isBlack) ? 'w' : 'b';

      // Shape Analysis
      let type = 'p';

      // 1. Pawn: Narrow body, small height
      if (pW <= sq * 0.56 && pH <= sq * 0.72) {
        type = 'p';
      } else {
        // Asymmetry (Knight snout)
        const midX = Math.floor((minX + maxX) / 2);
        let left = 0, right = 0;
        for (let x = minX; x < midX; x++) left += colCounts[x] || 0;
        for (let x = midX; x <= maxX; x++) right += colCounts[x] || 0;
        const asym = Math.abs(left - right) / Math.max(1, fg);

        // Top width vs base width (Rook flat top)
        const topY = minY + Math.floor(pH * 0.20);
        const baseY = maxY - Math.floor(pH * 0.20);
        let topW = 0, baseW = 0;
        for (let y = minY; y <= topY; y++) if ((rowCounts[y] || 0) > topW) topW = rowCounts[y];
        for (let y = baseY; y <= maxY; y++) if ((rowCounts[y] || 0) > baseW) baseW = rowCounts[y];

        // Apex cross check (King vs Queen)
        const apexY = Math.min(h - 1, minY + 5);
        const apexW = rowCounts[apexY] || 0;

        if (asym > 0.15) {
          type = 'n'; // Knight
        } else if ((topW / Math.max(1, baseW)) > 0.80 && pH <= sq * 0.76) {
          type = 'r'; // Rook
        } else if (pH >= sq * 0.74) {
          // King cross is narrow (< 24), Queen crown spikes are wide (> 28)
          if (apexW < 24) type = 'k';
          else type = 'q';
        } else if (pW >= sq * 0.65) {
          type = 'q';
        } else {
          type = 'b'; // Bishop
        }
      }

      return { type, color };
    }

    /**
     * Ensures legal king count (exactly 1 white king and 1 black king).
     */
    static normalizeKings(grid) {
      let wKing = 0, bKing = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = grid[r][c];
          if (p && p.type === 'k') {
            if (p.color === 'w') {
              wKing++;
              if (wKing > 1) p.type = 'q';
            } else {
              bKing++;
              if (bKing > 1) p.type = 'q';
            }
          }
        }
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
        const res = BoardVisionEngine.recognize(img);
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

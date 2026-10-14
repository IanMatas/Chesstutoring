// sounds.js — Chess Sound Effects Manager
// Generates all chess sounds using the Web Audio API (no external files needed)

const ChessSounds = (() => {
    'use strict';

    let audioCtx = null;
    let enabled = true;
    let volume = 0.5;

    function getCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    /* ── Helper: play a tone sequence ── */
    function playTone(freq, duration, type = 'sine', gainVal = 0.3, delay = 0) {
        if (!enabled) return;
        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(gainVal * volume, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
    }

    /* ── Helper: noise burst (for captures/impacts) ── */
    function playNoise(duration, gainVal = 0.15) {
        if (!enabled) return;
        const ctx = getCtx();
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Low-pass filter for a warmer thud
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(gainVal * volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start();
    }

    /* ── Helper: click sound (wooden piece placement) ── */
    function playClick(pitch = 1200, dur = 0.08) {
        if (!enabled) return;
        const ctx = getCtx();

        // Short percussive click
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(pitch, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(pitch * 0.4, ctx.currentTime + dur);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25 * volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur);

        // Add a subtle click transient
        playNoise(0.03, 0.08);
    }

    /* ══════════════════════════════════════════════════════
       PUBLIC SOUND EFFECTS
       ══════════════════════════════════════════════════════ */

    const sounds = {
        /** Standard piece move — wooden thock */
        move() {
            playClick(1400, 0.06);
        },

        /** Piece capture — heavier impact */
        capture() {
            playClick(800, 0.1);
            playNoise(0.12, 0.2);
            // Low thud
            playTone(200, 0.15, 'sine', 0.15);
        },

        /** Check — sharp alert */
        check() {
            playClick(1800, 0.05);
            playTone(880, 0.12, 'triangle', 0.2, 0.03);
            playTone(1100, 0.1, 'triangle', 0.15, 0.08);
        },

        /** Checkmate — dramatic fanfare */
        checkmate() {
            playTone(523, 0.2, 'triangle', 0.25);        // C5
            playTone(659, 0.2, 'triangle', 0.25, 0.15);  // E5
            playTone(784, 0.2, 'triangle', 0.25, 0.3);   // G5
            playTone(1047, 0.4, 'triangle', 0.3, 0.45);  // C6
        },

        /** Game draw — gentle resolution */
        draw() {
            playTone(440, 0.25, 'sine', 0.15);
            playTone(392, 0.3, 'sine', 0.12, 0.2);
        },

        /** Castle — double click */
        castle() {
            playClick(1200, 0.06);
            setTimeout(() => playClick(1400, 0.06), 80);
        },

        /** Promotion — ascending shimmer */
        promote() {
            playTone(523, 0.12, 'triangle', 0.2);
            playTone(659, 0.12, 'triangle', 0.2, 0.08);
            playTone(784, 0.12, 'triangle', 0.2, 0.16);
            playTone(1047, 0.2, 'triangle', 0.25, 0.24);
        },

        /** Piece select — soft tap */
        select() {
            playTone(1200, 0.04, 'sine', 0.08);
        },

        /** Illegal move attempt — dull thud */
        illegal() {
            playTone(200, 0.15, 'square', 0.1);
            playNoise(0.08, 0.05);
        },

        /** Brilliant move — sparkle */
        brilliant() {
            playTone(1047, 0.1, 'triangle', 0.2);
            playTone(1318, 0.1, 'triangle', 0.18, 0.06);
            playTone(1568, 0.15, 'triangle', 0.2, 0.12);
            playTone(2093, 0.2, 'triangle', 0.15, 0.2);
        },

        /** Blunder — ominous low tone */
        blunder() {
            playTone(220, 0.3, 'sawtooth', 0.08);
            playTone(185, 0.35, 'sawtooth', 0.06, 0.05);
        },

        /** Mistake — warning descend */
        mistake() {
            playTone(440, 0.12, 'triangle', 0.12);
            playTone(350, 0.15, 'triangle', 0.1, 0.08);
        },

        /** New game — fresh start chime */
        newGame() {
            playTone(523, 0.1, 'triangle', 0.15);
            playTone(659, 0.1, 'triangle', 0.15, 0.08);
            playTone(784, 0.15, 'triangle', 0.18, 0.16);
        },

        /** Hint — gentle notification */
        hint() {
            playTone(880, 0.08, 'sine', 0.1);
            playTone(1100, 0.1, 'sine', 0.12, 0.06);
        },

        /** Navigation click — tiny tick */
        navigate() {
            playTone(1000, 0.03, 'sine', 0.06);
        },

        /** Training step correct — success ding */
        correct() {
            playTone(880, 0.1, 'triangle', 0.15);
            playTone(1100, 0.12, 'triangle', 0.18, 0.08);
        },

        /** Training step wrong — soft buzz */
        wrong() {
            playTone(300, 0.15, 'square', 0.06);
            playTone(280, 0.12, 'square', 0.05, 0.05);
        },

        /** Training complete — celebration */
        complete() {
            playTone(523, 0.12, 'triangle', 0.18);
            playTone(659, 0.12, 'triangle', 0.18, 0.1);
            playTone(784, 0.12, 'triangle', 0.18, 0.2);
            playTone(1047, 0.25, 'triangle', 0.22, 0.3);
            playTone(1318, 0.3, 'triangle', 0.15, 0.45);
        },

        /** Mode switch tab click */
        tabSwitch() {
            playTone(800, 0.04, 'sine', 0.06);
            playTone(1000, 0.04, 'sine', 0.06, 0.03);
        },

        /** Undo move */
        undo() {
            playTone(600, 0.08, 'sine', 0.08);
            playTone(500, 0.1, 'sine', 0.06, 0.04);
        },

        /* ── Control ── */
        setEnabled(val) { enabled = !!val; },
        isEnabled() { return enabled; },
        setVolume(val) { volume = Math.max(0, Math.min(1, val)); },
        getVolume() { return volume; },

        /** Play the appropriate sound for a chess move object */
        playMoveSound(moveObj) {
            if (!moveObj) { this.move(); return; }
            if (moveObj.san && moveObj.san.includes('#')) { this.checkmate(); return; }
            if (moveObj.flags && moveObj.flags.includes('p')) { this.promote(); return; }
            if (moveObj.flags && (moveObj.flags.includes('k') || moveObj.flags.includes('q'))) { this.castle(); return; }
            if (moveObj.san && moveObj.san.includes('+')) { this.check(); return; }
            if (moveObj.captured) { this.capture(); return; }
            this.move();
        },

        /** Play classification sound after analysis */
        playClassificationSound(cl) {
            if (cl === 'brilliant') this.brilliant();
            else if (cl === 'blunder') this.blunder();
            else if (cl === 'mistake') this.mistake();
        }
    };

    // Ensure AudioContext is created on first user interaction
    const initOnce = () => {
        getCtx();
        document.removeEventListener('click', initOnce);
        document.removeEventListener('keydown', initOnce);
    };
    document.addEventListener('click', initOnce);
    document.addEventListener('keydown', initOnce);

    return sounds;
})();

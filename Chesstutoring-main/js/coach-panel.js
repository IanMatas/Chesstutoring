/* Coach Play's side panel: one lesson at a time, tied to a three-step thinking routine.
   It renders the state the game is in; the game flow itself stays in app.js. */
(() => {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const T = () => window.ChessTeach;

  function openPractice(practice) {
    if (!practice) return;
    if (practice.kind === 'pattern') {
      window.trainer._switchMode('patterns');
      window.patterns?.start(practice.lesson);
    } else if (practice.kind === 'mode') window.trainer._switchMode(practice.mode);
    else {
      if (window.learning) window.learning.filter = 'recommended';
      window.trainer._switchMode('puzzles');
    }
  }

  // The lesson card shared by Coach Play, the study board and game review.
  // spoilerFree: keep the better move hidden while the player is still invited to find it.
  function lessonCard(lesson, { level = T().profile.level, actions = '', note = '', compact = false, spoilerFree = false } = {}) {
    if (!lesson) return '';
    const details = T().LEVELS[level].details && !spoilerFree;
    const why = spoilerFree && lesson.teaser ? lesson.teaser : lesson.why;
    const c = lesson.concept;
    const habit = c
      ? `<div class="tc-habit"><span class="tc-habit-label">${lesson.routine ? `Habit · Step ${lesson.routine.step}: ${esc(lesson.routine.title)}` : `Principle · ${esc(c.name)}`}</span><p>${esc(c.rule)}</p>${c.practice ? `<button class="tc-link" data-coach="practice" data-concept="${esc(c.id)}">${esc(c.practice.label)} →</button>` : ''}</div>`
      : '';
    const engine = details && (lesson.bestLine || lesson.replyLine)
      ? `<details class="tc-details"><summary>Engine details</summary>
           <p>Evaluation for the player who moved: <strong>${esc(T().formatCp(lesson.cpBefore))}</strong> before, <strong>${esc(T().formatCp(lesson.cpAfter))}</strong> after.</p>
           ${lesson.bestLine ? `<p>Engine’s line: <span class="tc-line">${esc(lesson.bestLine)}</span></p>` : ''}
           ${lesson.replyLine && lesson.isMistake ? `<p>After your move: <span class="tc-line">${esc(lesson.replyLine)}</span></p>` : ''}
           <p class="tc-fine">Engine scores are estimates from a short search.</p>
         </details>`
      : '';
    return `<article class="tc-card tc-${lesson.verdict}">
      <header class="tc-card-head"><span class="tc-chip tc-chip-${lesson.verdict}">${esc(T().verdictLabel(lesson.verdict, level))}</span><span class="tc-move">${esc(lesson.moveLabel)}</span></header>
      <h3 class="tc-headline">${esc(lesson.headline)}</h3>
      ${why ? `<p class="tc-why">${esc(why)}</p>` : ''}
      ${lesson.also && !spoilerFree ? `<p class="tc-also">${esc(lesson.also)}</p>` : ''}
      ${lesson.better && !compact && !spoilerFree ? `<p class="tc-better"><strong>Better:</strong> ${esc(lesson.better)}</p>` : ''}
      ${compact ? '' : habit}
      ${note ? `<p class="tc-note">${note}</p>` : ''}
      ${actions ? `<div class="tc-actions">${actions}</div>` : ''}
      ${compact ? '' : engine}
    </article>`;
  }

  class CoachPanel {
    constructor(app) {
      this.app = app;
      this.el = document.getElementById('coachContent');
      this.el.addEventListener('click', (e) => this.click(e));
      this.levelSelect = document.getElementById('coachLevel');
      this.pauseToggle = document.getElementById('coachPause');
      this.levelSelect?.addEventListener('change', () => { T().profile.setLevel(this.levelSelect.value); this.syncControls(); this.refresh(); });
      this.pauseToggle?.addEventListener('change', () => { T().profile.setPause(this.pauseToggle.checked); });
      this.revealed = {};
      this.syncControls();
    }

    syncControls() {
      if (this.levelSelect) this.levelSelect.value = T().profile.level;
      if (this.pauseToggle) this.pauseToggle.checked = T().profile.data.pause;
    }

    set(html) {
      this.el.innerHTML = html;
      this.el.scrollTop = 0;
    }

    /* ── States ─────────────────────────────────────────── */
    welcome(kind = 'start') {
      const app = this.app, profile = T().profile;
      this.app._setAnnotations(null);
      if (!profile.chosen) {
        this.set(`<section class="tc-welcome">
          <h3>How well do you know chess?</h3>
          <p>I’ll explain your moves in a way that fits. You can change this anytime.</p>
          <div class="tc-levels">
            <button class="tc-level" data-level="beginner"><strong>Beginner</strong><span>I know how the pieces move. Keep it simple and point out dangers.</span></button>
            <button class="tc-level" data-level="intermediate"><strong>Intermediate</strong><span>I play games but blunder pieces. Make me find the answer.</span></button>
            <button class="tc-level" data-level="advanced"><strong>Advanced</strong><span>Only stop me for real blunders. Show engine details.</span></button>
          </div>
        </section>`);
        return;
      }
      const color = app.playerColor === 'w' ? 'White' : 'Black';
      const title = kind === 'new' ? 'New game — you play ' + color + '.' : kind === 'undo' ? 'Move taken back.' : `You play ${color}.`;
      const focus = profile.top(1)[0];
      this.set(`<section class="tc-welcome">
        <h3>${esc(title)}</h3>
        <p>Strong players ask the same three questions before every move. Make them a habit:</p>
        ${this.routineList()}
        <p class="tc-fine">${profile.data.pause ? 'If a move has a problem, I’ll pause the game so you can find a better one.' : 'Pausing on mistakes is off — the bot replies right away.'}</p>
        ${focus ? `<div class="tc-focus"><span class="tc-habit-label">Your focus lately</span><p><strong>${esc(focus.name)}</strong> came up ${focus.count} time${focus.count > 1 ? 's' : ''}. ${esc(focus.rule)}</p>${focus.practice ? `<button class="tc-link" data-coach="practice" data-concept="${esc(focus.id)}">${esc(focus.practice.label)} →</button>` : ''}</div>` : ''}
      </section>`);
    }

    routineList() {
      return `<ol class="tc-steps">${T().ROUTINE.map((r) => `<li><strong>${esc(r.title)}</strong><span>${esc(r.question)}</span></li>`).join('')}</ol>`;
    }

    thinking(text) {
      const busy = `<p class="tc-busy" role="status"><span class="tc-spinner" aria-hidden="true"></span>${esc(text)}</p>`;
      const existing = this.el.querySelector('.tc-busy');
      if (existing) existing.outerHTML = busy;
      else this.el.insertAdjacentHTML('afterbegin', busy);
    }

    lesson(md, state = 'final', extra = {}) {
      const L = md.lesson;
      if (!L) return this.set(`<article class="tc-card"><p>${esc(md.san)}</p></article>`);
      let actions = '', note = '';
      if (state === 'paused') {
        note = 'The bot is waiting. Can you find a better move?';
        actions = `<button class="btn btn-primary" data-coach="retry">Try a better move</button>
          ${L.replyUci ? '<button class="btn btn-secondary" data-coach="why">Show me why</button>' : ''}
          <button class="btn btn-ghost" data-coach="continue">Continue with my move</button>`;
      } else if (L.isMistake && L.bestUci) {
        actions = `${L.replyUci ? '<button class="btn btn-secondary" data-coach="why">Show me why</button>' : ''}
          <button class="btn btn-secondary" data-coach="better">Show the better move</button>`;
      }
      if (state === 'history') note = 'You are looking at an earlier move. Use ⏭ to return to the game.';
      let html = '';
      if (state === 'success' && extra.original) {
        const o = extra.original.lesson;
        html = `<article class="tc-card tc-success"><header class="tc-card-head"><span class="tc-chip tc-chip-best">Well found</span><span class="tc-move">${esc(L.moveLabel)}</span></header>
          <h3 class="tc-headline">${esc(L.headline.replace(/^(Best move|Good move|Great move) — /, 'Yes — '))}</h3>
          <p class="tc-why">Your first try, ${esc(o.san)}, had a problem: ${esc(o.headline.charAt(0).toLowerCase() + o.headline.slice(1))} This time you found a better move.</p>
          ${o.concept ? `<div class="tc-habit"><span class="tc-habit-label">${o.routine ? `Habit · Step ${o.routine.step}: ${esc(o.routine.title)}` : `Principle · ${esc(o.concept.name)}`}</span><p>${esc(o.concept.rule)}</p></div>` : ''}
        </article>`;
      } else html = lessonCard(L, { actions, note, spoilerFree: state === 'paused' });
      this.set(html);
      this.app._setAnnotations(state === 'paused' || (L.isMistake && state !== 'success') ? { fen: L.fenAfter, arrows: L.arrows, marks: L.marks } : null);
    }

    retry(r) {
      const o = r.original.lesson, shown = o.hints.slice(0, r.hints);
      const last = r.last;
      this.set(`<article class="tc-card tc-retry">
        <header class="tc-card-head"><span class="tc-chip tc-chip-retry">Try again</span><span class="tc-move">instead of ${esc(o.moveLabel)}</span></header>
        <h3 class="tc-headline">Find a better move.</h3>
        <p class="tc-why">The problem with ${esc(o.san)}: ${esc(o.headline.charAt(0).toLowerCase() + o.headline.slice(1))}${o.teaser ? ` ${esc(o.teaser)}` : ''}</p>
        ${last ? `<p class="tc-feedback" role="status"><strong>Not quite — ${esc(last.san)}:</strong> ${esc(last.headline)} ${esc(last.why || '')}</p>` : ''}
        ${shown.length ? `<ol class="tc-hints">${shown.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>` : ''}
        ${o.concept ? `<div class="tc-habit"><span class="tc-habit-label">${o.routine ? `Habit · Step ${o.routine.step}: ${esc(o.routine.title)}` : `Principle · ${esc(o.concept.name)}`}</span><p>${esc(o.concept.rule)}</p></div>` : ''}
        <div class="tc-actions">
          ${r.hints < o.hints.length ? `<button class="btn btn-secondary" data-coach="hint">${r.hints ? 'Another hint' : 'Give me a hint'}</button>` : ''}
          ${r.hints < o.hints.length ? '<button class="btn btn-secondary" data-coach="answer">Show me the answer</button>' : ''}
          <button class="btn btn-ghost" data-coach="keep">Keep my original move</button>
        </div>
      </article>`);
      const marks = {}, arrows = [];
      if (r.hints >= 2 && o.hintSquares?.[0]) marks[o.hintSquares[0]] = 'hint';
      if (r.hints >= 3 && o.hintSquares?.length === 2) arrows.push({ from: o.hintSquares[0], to: o.hintSquares[1], color: 'good' });
      this.app._setAnnotations({ fen: o.fenBefore, arrows, marks });
    }

    turn(botMd) {
      const app = this.app, index = app.moveData.indexOf(botMd);
      const prev = index > 0 ? app.moveData[index - 1] : null;
      const reveal = T().LEVELS[T().profile.level].reveal;
      this.notes = T().routineNotes(botMd.fenAfter, app.playerColor, 'the bot');
      this.revealed = { 1: reveal, 2: reveal };
      const recap = prev && prev.isPlayer && prev.lesson
        ? `<details class="tc-recap"${prev.lesson.isMistake ? ' open' : ''}><summary><span class="tc-chip tc-chip-${prev.lesson.verdict}">${esc(T().verdictLabel(prev.lesson.verdict, T().profile.level))}</span> Your move ${esc(prev.lesson.moveLabel)}</summary>${lessonCard(prev.lesson, { compact: !prev.lesson.isMistake })}</details>`
        : '';
      this.set(`${recap}<section class="tc-turn">
          <p class="tc-bot-note">${esc(botMd.note || `The bot played ${botMd.san}.`)}</p>
          <div class="tc-routine"><h4>Before you move</h4><ol class="tc-steps tc-live">${this.stepsHtml()}</ol></div>
        </section>`);
      this.paintNotes();
    }

    stepsHtml() {
      const n = this.notes, step = (i, title, body) => `<li data-step="${i}"><strong>${title}</strong>${body}</li>`;
      const reveal = (i, text) => (this.revealed[i] ? `<span>${esc(text)}</span>` : `<span class="tc-ask">${esc(T().ROUTINE[i - 1].question)} <button class="tc-link" data-coach="reveal" data-step="${i}">Show me</button></span>`);
      return step(1, 'Their threat', reveal(1, n.threat))
        + step(2, 'Your forcing moves', reveal(2, n.forcing))
        + step(3, 'Blunder check', '<span>Before you let go: is the piece safe on its new square, and what checks can they give?</span>');
    }

    paintNotes() {
      const n = this.notes;
      if (!n) return;
      const arrows = [], marks = {};
      if (this.revealed[1]) { arrows.push(...n.arrows); Object.entries(n.marks).forEach(([sq, kind]) => { if (kind !== 'target') marks[sq] = kind; }); }
      if (this.revealed[2]) Object.entries(n.marks).forEach(([sq, kind]) => { if (kind === 'target') marks[sq] = kind; });
      this.app._setAnnotations(arrows.length || Object.keys(marks).length ? { fen: this.app.game.fen(), arrows, marks } : null);
    }

    history(md) {
      if (md.isPlayer) return this.lesson(md, 'history');
      this.app._setAnnotations(null);
      this.set(`<section class="tc-turn"><p class="tc-bot-note">${esc(md.note || `The bot played ${md.san}.`)}</p><p class="tc-note">You are looking at an earlier move. Use ⏭ to return to the game.</p></section>`);
    }

    hint(text, label) {
      const box = `<aside class="tc-hint-box" role="status"><span class="tc-habit-label">${esc(label)}</span><p>${esc(text)}</p></aside>`;
      const existing = this.el.querySelector('.tc-hint-box');
      if (existing) existing.outerHTML = box;
      else this.el.insertAdjacentHTML('afterbegin', box);
      this.el.scrollTop = 0;
    }

    gameOver({ title, message, summary, concepts, saved }) {
      this.app._setAnnotations(null);
      this.lastGameOver = { title, message, summary, concepts, saved };
      this.set(`<section class="tc-gameover">
        <span class="eyebrow">GAME OVER</span>
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        ${summary}
        ${concepts.length ? `<h4>What to work on</h4><ul class="tc-lessons">${concepts.map((c) => `<li><strong>${esc(c.name)}</strong>${c.count > 1 ? ` <span class="tc-count">×${c.count}</span>` : ''}<p>${esc(c.rule)}</p>${c.practice ? `<button class="tc-link" data-coach="practice" data-concept="${esc(c.id)}">${esc(c.practice.label)} →</button>` : ''}</li>`).join('')}</ul>` : '<p class="tc-fine">No mistakes worth a lesson this game. Nice work.</p>'}
        <div class="tc-actions">
          <button class="btn btn-primary" data-coach="review">Review this game move by move</button>
          ${saved ? '<button class="btn btn-secondary" data-coach="moments">Practice your mistakes</button>' : ''}
          <button class="btn btn-secondary" data-coach="new">New game</button>
          <button class="btn btn-ghost" data-coach="undo">Take back a move</button>
        </div>
      </section>`);
    }

    refresh() {
      const app = this.app;
      this.syncControls();
      if (app.retry) return this.retry(app.retry);
      if (app.pending) return this.lesson(app.pending.md, 'paused');
      if (!app.moveData.length) return this.welcome();
      if (!app._atEnd()) {
        const md = app.moveData[app.viewIndex - 1];
        return md ? this.history(md) : this.welcome();
      }
      if (app.over && this.lastGameOver) return this.gameOver(this.lastGameOver);
      const last = app.moveData[app.moveData.length - 1];
      return last.isPlayer ? this.lesson(last, 'final') : this.turn(last);
    }

    /* ── Actions ────────────────────────────────────────── */
    click(e) {
      const level = e.target.closest('[data-level]');
      if (level) {
        T().profile.setLevel(level.dataset.level);
        this.syncControls();
        this.refresh();
        return;
      }
      const b = e.target.closest('[data-coach]');
      if (!b || b.disabled) return;
      const app = this.app, action = b.dataset.coach;
      const md = app.pending?.md || app.moveData[app.viewIndex - 1] || app.moveData[app.moveData.length - 1];
      const lessonMd = md && !md.isPlayer ? app.moveData[app.moveData.indexOf(md) - 1] : md;
      switch (action) {
        case 'retry': app._startRetry(); break;
        case 'continue': app._continueAfterPlayer(); break;
        case 'keep': app._keepOriginal(); break;
        case 'hint': app._retryHint(); break;
        case 'answer': app._retryAnswer(); break;
        case 'why': if (lessonMd) app._showLessonLine(lessonMd, 'played'); break;
        case 'better': if (lessonMd) app._showLessonLine(lessonMd, 'best'); break;
        case 'reveal':
          this.revealed[b.dataset.step] = true;
          this.el.querySelector('.tc-live').innerHTML = this.stepsHtml();
          this.paintNotes();
          break;
        case 'practice': {
          const id = b.dataset.concept, c = T().CONCEPTS[id];
          openPractice(c && T().PRACTICE[c.practice]);
          break;
        }
        case 'review': window.gameReview?.openFromCoach(); break;
        case 'moments': if (window.learning) window.learning.filter = 'mistakes'; window.trainer._switchMode('puzzles'); break;
        case 'new': app._showModal(); break;
        case 'undo': app._undo(); break;
      }
    }
  }

  window.CoachPanel = CoachPanel;
  window.CoachCards = { lessonCard, openPractice, esc };
})();

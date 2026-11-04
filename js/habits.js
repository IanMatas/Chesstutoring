/* My habits: a dashboard built from the coach profile's mistake history and the
   puzzle review schedule. Read-only — it never changes saved progress. */
(() => {
  'use strict';
  const DAY = 86400000;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const STEPS = {
    1: { title: 'Their threat', advice: 'Before every move, ask what your opponent’s last move attacks.' },
    2: { title: 'My forcing moves', advice: 'Look at every check, capture and threat for your side before quiet moves.' },
    3: { title: 'Blunder check', advice: 'Before you let go of a piece, check every capture and check your opponent could answer with.' },
    0: { title: 'Principles', advice: 'Follow opening and endgame principles: develop, castle, activate your king late in the game.' },
  };

  const countIn = (history, from, to) => history.filter((h) => h.t >= from && h.t < to);
  function trend(now, history, id) {
    const recent = countIn(history, now - 14 * DAY, now + 1).filter((h) => !id || h.c === id).length;
    const before = countIn(history, now - 28 * DAY, now - 14 * DAY).filter((h) => !id || h.c === id).length;
    if (!before && !recent) return { text: '—', cls: '' };
    if (!before) return { text: 'new', cls: 'hb-flat' };
    const change = Math.round(((recent - before) / before) * 100);
    if (change <= -10) return { text: `↓ ${-change}%`, cls: 'hb-good' };
    if (change >= 10) return { text: `↑ ${change}%`, cls: 'hb-bad' };
    return { text: 'steady', cls: 'hb-flat' };
  }

  class Habits {
    get el() { return document.getElementById('habitsMode'); }
    onMode(mode) {
      this.el.hidden = mode !== 'habits';
      if (mode === 'habits') this.render();
    }
    analyze(now = Date.now()) {
      const T = window.ChessTeach;
      const history = T.profile.data.history;
      const month = countIn(history, now - 30 * DAY, now + 1);
      const concepts = {};
      for (const h of month) concepts[h.c] = (concepts[h.c] || 0) + 1;
      const top = Object.entries(concepts).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([id, count]) => ({ id, count, ...T.CONCEPTS[id], practice: T.PRACTICE[T.CONCEPTS[id].practice], trend: trend(now, history, id) }));
      const steps = { 1: 0, 2: 0, 3: 0, 0: 0 };
      for (const h of month) steps[T.CONCEPTS[h.c].step]++;
      const weakStep = [1, 2, 3].sort((a, b) => steps[b] - steps[a])[0];
      const weeks = Array.from({ length: 8 }, (_, i) => {
        const end = now - (7 - i) * 7 * DAY;
        return countIn(history, end - 7 * DAY, end + 1).length;
      });
      const store = window.learning?.store.data;
      const due = store ? store.moments.filter((m) => store.results[m.id]?.due <= now || !store.results[m.id]).length : 0;
      return { total: month.length, top, steps, weakStep: steps[weakStep] ? weakStep : null, weeks, due,
        saved: store?.moments.length || 0, games: T.profile.data.games.length, trend: trend(now, history) };
    }
    plan(a) {
      const items = [];
      if (a.due) items.push({ text: `Re-solve ${Math.min(a.due, 10)} of your own game moments`, action: 'due' });
      if (a.top[0]) items.push({ text: `${a.top[0].practice.label} — your most common mistake is “${a.top[0].name}”`, action: 'practice:0' });
      if (a.weakStep != null) items.push({ text: `Play 2 Coach Play games with pause on, focusing on step ${a.weakStep}: ${STEPS[a.weakStep].title}`, action: 'coach' });
      items.push({ text: 'Review one finished game move by move', action: 'review' });
      if (a.top[1]) items.push({ text: `${a.top[1].practice.label} (“${a.top[1].name}”)`, action: 'practice:1' });
      return items;
    }
    render() {
      const a = this.analyze();
      this.data = a;
      if (!a.total && !a.saved) {
        this.el.innerHTML = `<div class="hb-head"><span class="eyebrow">YOUR HABITS</span><h1>See what holds your game back.</h1></div>
          <div class="empty-practice"><h3>No habits to show yet</h3><p>Play a Coach Play game or review a game. Every mistake is named and saved here, so you can see your patterns, which thinking step you skip and whether you’re improving.</p>
          <button class="btn btn-primary" data-habit="coach">Play a Coach Play game</button> <button class="btn btn-secondary" data-habit="review">Review a game</button></div>`;
        return this.bind();
      }
      const maxStep = Math.max(1, ...Object.values(a.steps));
      const maxWeek = Math.max(1, ...a.weeks);
      const weak = a.weakStep != null ? STEPS[a.weakStep] : null;
      this.el.innerHTML = `
        <div class="hb-head"><span class="eyebrow">YOUR HABITS · LAST 30 DAYS</span><h1>See what holds your game back.</h1>
          <p class="muted">Built from every mistake the coach and game review named. Saved on this browser.</p></div>
        <div class="hb-stats">
          <div><strong>${a.total}</strong><span>mistakes named</span></div>
          <div><strong class="${a.trend.cls}">${esc(a.trend.text)}</strong><span>last 2 weeks vs the 2 before</span></div>
          <div><strong>${a.games}</strong><span>games reviewed</span></div>
          <div><strong>${a.due}</strong><span>of ${a.saved} game moments ready to re-solve</span></div>
        </div>
        ${weak ? `<section class="hb-insight"><span class="eyebrow">THE STEP YOU SKIP MOST</span><h2>Step ${a.weakStep}: ${weak.title}</h2><p>${weak.advice}</p></section>` : ''}
        <div class="hb-grid">
          <section class="hb-card"><div class="section-heading"><h2>Thinking routine</h2><span>mistakes per step</span></div>
            ${[1, 2, 3, 0].map((s) => `<div class="hb-bar ${s === a.weakStep ? 'hb-weak' : ''}"><span>${s ? `${s}. ` : ''}${STEPS[s].title}</span><div><i style="width:${(a.steps[s] / maxStep) * 100}%"></i></div><b>${a.steps[s]}</b></div>`).join('')}
          </section>
          <section class="hb-card"><div class="section-heading"><h2>Mistakes per week</h2><span>last 8 weeks</span></div>
            <div class="hb-weeks">${a.weeks.map((n, i) => `<div title="${n} mistakes"><i style="height:${(n / maxWeek) * 100}%"></i><span>${i === 7 ? 'now' : `-${7 - i}w`}</span></div>`).join('')}</div>
          </section>
        </div>
        <section class="learning-progress"><div class="section-heading"><h2>Your recurring mistakes</h2><span>trend: last 2 weeks vs the 2 before</span></div>
          <div class="hb-habits">${a.top.map((c, i) => `<div class="hb-habit"><div class="hb-habit-top"><strong>${esc(c.name)}</strong><span class="${c.trend.cls}">${esc(c.trend.text)}</span></div>
            <p class="hb-count">${c.count}× · ${c.step ? `step ${c.step}: ${STEPS[c.step].title}` : 'principles'}</p><p class="muted">${esc(c.rule)}</p>
            <button class="btn btn-secondary" data-habit="practice:${i}">${esc(c.practice.label)}</button></div>`).join('')}</div>
        </section>
        <section class="learning-progress"><div class="section-heading"><h2>This week’s plan</h2><span>picked from your mistakes</span></div>
          <ol class="hb-plan">${this.plan(a).map((p) => `<li><span>${esc(p.text)}</span><button class="btn btn-secondary" data-habit="${p.action}">Start</button></li>`).join('')}</ol>
        </section>`;
      this.bind();
    }
    bind() {
      this.el.querySelectorAll('[data-habit]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.habit)));
    }
    act(action) {
      const [kind, i] = action.split(':');
      if (kind === 'practice') return window.CoachCards.openPractice(this.data.top[+i].practice);
      if (kind === 'due') { if (window.learning) window.learning.filter = 'mistakes'; return window.trainer._switchMode('puzzles'); }
      window.trainer._switchMode(kind);
    }
  }
  window.habits = new Habits();
})();

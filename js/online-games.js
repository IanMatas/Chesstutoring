/* Import recent games by username from Chess.com (public APIs, no login),
   then open the chosen one in Game review with your side already picked. */
(() => {
  'use strict';
  const KEY = 'chess-tutor.online.v1';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tag = (pgn, name) => (pgn.match(new RegExp(`\\[${name} "([^"]*)"\\]`)) || [])[1] || '';

  async function chesscom(user) {
    const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`;
    const res = await fetch(base);
    if (res.status === 404) throw Error(`No Chess.com player called “${user}”.`);
    if (!res.ok) throw Error('Chess.com did not answer. Try again in a minute.');
    const archives = (await res.json()).archives || [];
    const pgns = [];
    // Newest month first, reaching back until there are 20 games.
    for (const url of archives.reverse().slice(0, 3)) {
      const month = await (await fetch(url)).json();
      pgns.push(...(month.games || []).filter((g) => g.pgn && g.rules === 'chess').reverse().map((g) => g.pgn));
      if (pgns.length >= 20) break;
    }
    return pgns.slice(0, 20);
  }

  class OnlineGames {
    constructor() {
      this.el = document.getElementById('onlineImport');
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) {}
      this.el.innerHTML = `<form class="og-form">
          <strong>Import your games</strong>
          <span class="og-site">Chess.com</span>
          <input id="ogUser" placeholder="Username" autocomplete="off" required aria-label="Username">
          <button class="btn btn-primary" type="submit">Get my games</button>
        </form><p class="og-status" role="status"></p><div class="og-list"></div>`;
      this.user = this.el.querySelector('#ogUser');
      if (saved.user) this.user.value = saved.user;
      this.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); this.fetch(); });
      this.el.querySelector('.og-list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-og]');
        if (b) this.open(+b.dataset.og);
      });
    }
    status(text) { this.el.querySelector('.og-status').textContent = text; }
    async fetch() {
      const user = this.user.value.trim();
      if (!user) return;
      try { localStorage.setItem(KEY, JSON.stringify({ user })); } catch (_) {}
      this.status('Loading your games…');
      this.el.querySelector('.og-list').innerHTML = '';
      try {
        this.games = await chesscom(user);
        this.name = user.toLowerCase();
        this.status(this.games.length ? `${this.games.length} recent games. Pick one to review.` : 'No standard games found for this player.');
        this.render();
      } catch (err) { this.status(err.message || 'Could not load games.'); }
    }
    sideOf(pgn) { return tag(pgn, 'White').toLowerCase() === this.name ? 'w' : tag(pgn, 'Black').toLowerCase() === this.name ? 'b' : null; }
    render() {
      this.el.querySelector('.og-list').innerHTML = this.games.map((pgn, i) => {
        const side = this.sideOf(pgn), opp = side === 'b' ? tag(pgn, 'White') : tag(pgn, 'Black');
        const result = tag(pgn, 'Result'), won = (result === '1-0' && side === 'w') || (result === '0-1' && side === 'b');
        const outcome = result === '1/2-1/2' ? 'Draw' : !side || result === '*' ? result : won ? 'Win' : 'Loss';
        return `<button class="og-game" data-og="${i}"><span class="og-${outcome.toLowerCase()}">${esc(outcome)}</span>
          <strong>${side === 'b' ? '♚' : '♔'} vs ${esc(opp)}</strong><small>${esc(tag(pgn, 'Date').replace(/\./g, '-'))} · ${esc(tag(pgn, 'TimeControl') || tag(pgn, 'Event'))}</small></button>`;
      }).join('');
    }
    open(i) {
      const pgn = this.games[i];
      window.gameReview.importPGN(pgn, this.sideOf(pgn) || undefined);
    }
  }
  document.addEventListener('DOMContentLoaded', () => { window.onlineGames = new OnlineGames(); });
})();

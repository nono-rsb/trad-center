/* Trad Center — championnat de la semaine
 * Du lundi 0 h au dimanche 23 h 59 (heure de Paris), le joueur qui a gagné le plus d'argent
 * (envois entre amis exclus) remporte 500 €, versés automatiquement à sa prochaine ouverture du jeu.
 * Le gain est publié dans le profil sous un champ propre à chaque semaine (wk_AAAAMMJJ du lundi).
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net;
  const S = () => G.state;
  const W = TC.Weekly = { PRIZE: 500 };

  // Date et jour de la semaine à Paris, quel que soit le fuseau du téléphone
  function paris(ts) {
    const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(new Date(ts)).forEach(x => { p[x.type] = x.value; });
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd };
  }
  W.weekOf = function (ts) {
    const p = paris(ts);
    const mon = new Date(Date.UTC(p.y, p.m - 1, p.d - p.wd));
    const id = mon.toISOString().slice(0, 10).replace(/-/g, '');
    const left = ((7 - p.wd) * 86400 - (p.h * 3600 + p.mi * 60 + p.s)) * 1000;
    return { id, field: 'wk_' + id, left };
  };
  W.current = () => W.weekOf(Date.now());
  W.previous = () => W.weekOf(Date.now() - 7 * 86400000);

  // Suivi de la semaine en cours dans la partie : patrimoine de départ + flux extérieurs exclus
  function wk() {
    const c = W.current();
    if (!S().week || S().week.id !== c.id) { S().week = { id: c.id, start: G.netWorth(), flow: 0 }; G.save(); }
    return S().week;
  }
  W.flow = eur => { wk().flow += eur; };
  W.gain = () => { const w = wk(); return Math.round((G.netWorth() - w.start - w.flow) * 100) / 100; };

  // Classement d'une semaine (profils qui ont publié un gain pour cette semaine)
  const cache = {};
  W.board = async function (field, maxAge = 60000) {
    const db = N.db(); if (!db) return [];
    const c = cache[field]; if (c && Date.now() - c.at < maxAge) return c.rows;
    const snap = await db.collection('users').orderBy(field, 'desc').limit(25).get();
    const rows = snap.docs.map(d => Object.assign(N.prof(d.id, d.data()), { gain: d.data()[field] })).filter(u => !u.bot && typeof u.gain === 'number').slice(0, 10);
    cache[field] = { at: Date.now(), rows };
    return rows;
  };

  // Lundi : le champion de la semaine passée encaisse sa prime
  W.checkPrize = async function () {
    if (!N.user || !N.db()) return;
    const prev = W.previous();
    try {
      const top = await W.board(prev.field, 0); // toujours frais pour la prime
      W.lastChamp = top[0] && top[0].gain > 0 ? top[0] : null;
      const paid = S().weeklyPaid || (S().weeklyPaid = {});
      if (W.lastChamp && W.lastChamp.uid === N.user.uid && !paid[prev.id]) {
        paid[prev.id] = Date.now();
        S().cash += W.PRIZE; W.flow(W.PRIZE); // la prime ne compte pas dans la nouvelle semaine
        S().log.unshift({ t: Date.now(), kind: 'bonus', eur: W.PRIZE, asset: 'Champion de la semaine 🏆' });
        G.save(true);
        TC.sound('kaching'); TC.confetti(220);
        TC.modal(`<div class="center"><div class="big-emoji">🏆</div><h2>Champion de la semaine !</h2>
          <p>Tu as gagné <b>${fmt.eur(top[0].gain)}</b> la semaine dernière, plus que tous les autres joueurs.</p>
          <p>Ta récompense : <b>+${fmt.eur(W.PRIZE)}</b> 🎉</p>
          <div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>Encaisser 💰</button></div></div>`);
        if (TC.App) TC.App.after();
      }
    } catch (e) { console.warn('weekly', e); }
  };

  /* ---------- Bloc « Semaine » de l'onglet Amis ---------- */
  W.render = async function (el) {
    const c = W.current(); const g = W.gain();
    const d = Math.floor(c.left / 86400000), h = Math.floor(c.left / 3600000) % 24, m = Math.floor(c.left / 60000) % 60;
    el.innerHTML = `<div class="wk-head"><div><b>🏆 Championnat de la semaine</b><small>Le plus gros gain de la semaine remporte <b>${fmt.eur(W.PRIZE)}</b></small></div>
      <div class="wk-left">⏳ ${d ? d + ' j ' : ''}${h} h ${String(m).padStart(2, '0')}</div></div>
      <div class="nbox">Ton gain cette semaine : <b class="${g >= 0 ? 'up' : 'down'}">${g >= 0 ? '+' : ''}${fmt.eur(g)}</b> <small>(les envois entre amis ne comptent pas)</small></div>
      ${W.lastChamp ? `<div class="wk-last">👑 Champion de la semaine dernière : <b>${esc(W.lastChamp.pseudo)}</b> (+${fmt.eur(W.lastChamp.gain)})</div>` : ''}
      <div class="board" id="wk-board"><div class="empty">Chargement…</div></div>`;
    try {
      const rows = await W.board(c.field, 15000); const b = el.querySelector('#wk-board'); if (!b) return;
      b.innerHTML = rows.length ? rows.map((r, i) => `<div class="brow ${r.uid === N.user.uid ? 'me' : ''}"><span class="pos">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${TC.Style.avatar(r, 's')}<b>${esc(r.pseudo || '')}${TC.Style.badge(r)}</b><small>${i === 0 ? '+' + fmt.eur(W.PRIZE) + ' si ça tient' : ''}</small><span class="bnw ${r.gain >= 0 ? 'up' : 'down'}">${r.gain >= 0 ? '+' : ''}${fmt.eur(r.gain, true)}</span></div>`).join('') : '<div class="empty">Personne n\'a encore joué cette semaine : fonce !</div>';
    } catch (e) { const b = el.querySelector('#wk-board'); if (b) b.innerHTML = '<div class="empty">Classement indisponible</div>'; }
  };

  N.on(t => { if (t === 'linked') W.checkPrize(); });
  setInterval(() => { wk(); W.checkPrize(); }, 10 * 60000);
  wk();
})();

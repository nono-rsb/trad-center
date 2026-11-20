/* Trad Center — envie de revenir chaque jour (sans argent réel, sans pousser au hasard) :
 *  • 3 missions du jour   • série de jours 🔥 avec récompenses qui grandissent
 *  • XP et niveau         • saison du mois : 30 paliers (argent, coffre, cadres exclusifs)
 *  • un événement par jour de la semaine   • « Premiers pas » pour les nouveaux joueurs
 */
(function () {
  const { esc, fmt } = TC;
  const G = TC.Game, S = () => G.state;
  const P = TC.Progress = {};

  /* ---------- Dates (heure de Paris) ---------- */
  const fmtP = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  function paris(ts) { const o = {}; fmtP.formatToParts(new Date(ts)).forEach(x => { o[x.type] = x.value; }); return { id: o.year + o.month + o.day, month: o.year + o.month, wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(o.weekday) }; }
  const today = () => paris(Date.now()), yesterday = () => paris(Date.now() - 86400000).id;

  /* ---------- Événement du jour ---------- */
  P.EVENTS = [
    { k: 'nofee', e: '💸', t: 'Lundi sans frais', d: 'Frais de trading à 0 % toute la journée.' },
    { k: 'duel', e: '⚔️', t: 'Mardi des duels', d: 'Le duel gagné rapporte 200 € au lieu de 100 €.' },
    { k: 'xp2', e: '⚡', t: 'Mercredi XP ×2', d: 'Toute l\'expérience gagnée compte double.' },
    { k: 'btc', e: '₿', t: 'Jeudi Bitcoin', d: 'Chaque ordre sur le Bitcoin rapporte 3× plus d\'XP.' },
    { k: 'missions', e: '🎯', t: 'Vendredi missions ×2', d: 'L\'argent des missions du jour est doublé.' },
    { k: 'bonus2', e: '🎁', t: 'Week-end bonus ×2', d: 'Le bonus quotidien est doublé samedi et dimanche.' },
    { k: 'bonus2', e: '🎁', t: 'Week-end bonus ×2', d: 'Le bonus quotidien est doublé samedi et dimanche.' },
  ];
  P.event = () => P.EVENTS[today().wd];
  const ev = k => P.event().k === k;
  // lundi : pas de frais
  ['buy', 'sell', 'open', 'close'].forEach(fn => { const f = G[fn]; G[fn] = function () { if (!ev('nofee')) return f.apply(G, arguments); const a = G.FEE_SPOT, b = G.FEE_LEV; G.FEE_SPOT = 0; G.FEE_LEV = 0; try { return f.apply(G, arguments); } finally { G.FEE_SPOT = a; G.FEE_LEV = b; } }; });
  // week-end : bonus quotidien ×2
  const baseClaim = G.claimBonus;
  G.claimBonus = function () { if (!ev('bonus2')) return baseClaim.apply(G, arguments); const b = G.BONUS; G.BONUS = b * 2; try { return baseClaim.apply(G, arguments); } finally { G.BONUS = b; } };

  /* ---------- État ---------- */
  function st() {
    const s = S().prog || (S().prog = {});
    s.xp = s.xp || 0; s.sxp = s.sxp || {}; s.tiers = s.tiers || {}; s.streak = s.streak || { n: 0, last: '', claimed: '' }; s.onb = s.onb || {};
    return s;
  }
  const after = () => { if (TC.App) TC.App.after(); P.chip(); };
  function pay(eur, label) { S().cash += eur; if (TC.Weekly) TC.Weekly.flow(eur); S().log.unshift({ t: Date.now(), kind: 'bonus', eur, asset: label }); }

  /* ---------- XP, niveau, saison ---------- */
  const need = l => 100 + 25 * l; // XP pour passer du niveau l au niveau l+1
  P.level = function (xp) { xp = xp == null ? st().xp : xp; let l = 1; while (xp >= need(l)) { xp -= need(l); l++; } return l; };
  P.levelProgress = function () { let xp = st().xp, l = 1; while (xp >= need(l)) { xp -= need(l); l++; } return { l, cur: xp, need: need(l) }; };
  P.TIER_XP = 150; P.TIERS = 30;
  const FRAMES = { 5: 'fr_s_bronze', 10: 'fr_s_argent', 15: 'fr_s_or', 20: 'fr_s_diamant', 30: 'fr_s_legende' };
  P.reward = t => t === 30 ? { cash: 1000, frame: FRAMES[30], label: '1 000 € + cadre Légende' } : t === 25 ? { cash: 300, chest: 1, label: '300 € + coffre offert' } : FRAMES[t] ? { cash: 20 * t, frame: FRAMES[t], label: `${20 * t} € + cadre ${TC.Style && TC.Style.byId[FRAMES[t]] ? TC.Style.byId[FRAMES[t]].name : ''}` } : { cash: 15 * t, label: `${15 * t} €` };
  P.xp = function (n, why) {
    if (!n) return;
    if (ev('xp2')) n *= 2;
    const s = st(), m = today().month, lv0 = P.level();
    s.xp += n; s.sxp[m] = (s.sxp[m] || 0) + n;
    const lv = P.level();
    if (lv > lv0) { TC.toast(`⭐ Niveau ${lv} atteint !`, 'ach', 5000); TC.sound('ach'); TC.confetti(90); }
    // paliers de saison gagnés
    const tier = Math.min(P.TIERS, Math.floor(s.sxp[m] / P.TIER_XP)), done = s.tiers[m] || 0;
    for (let t = done + 1; t <= tier; t++) {
      const r = P.reward(t); pay(r.cash, `🏆 Saison : palier ${t}`);
      if (r.frame && TC.Style) { const o = S().style || (S().style = { owned: {}, look: {} }); (o.owned || (o.owned = {}))[r.frame] = Date.now(); }
      if (r.chest) giveChest();
      TC.toast(`🏆 Palier ${t} de la saison : ${esc(r.label)}`, 'ach', 6000);
    }
    if (tier > done) { s.tiers[m] = tier; TC.sound('kaching'); }
    G.save(); after();
  };
  function giveChest() { // coffre offert : un tirage du coffre de la Boutique, sans payer
    const L = TC.Chest && TC.Chest.LOOT; if (!L) return pay(100, '🎁 Coffre offert');
    let r = Math.random() * 100, l = L[0]; for (const x of L) { if ((r -= x.p) < 0) { l = x; break; } }
    if (l.item && TC.shopById[l.item]) { S().owned.push({ uid: S().nextId++, item: l.item, price: TC.shopById[l.item].price, t: Date.now() }); TC.toast(`🎁 Coffre offert : <b>${esc(l.label)}</b> !`, 'ach', 7000); }
    else { pay(l.cash || l.btc || 20, '🎁 Coffre offert : ' + l.label); TC.toast(`🎁 Coffre offert : <b>${esc(l.label)}</b> !`, 'ach', 7000); }
    TC.confetti(140);
  }

  /* ---------- Série de jours 🔥 ---------- */
  P.streakReward = n => n % 30 === 0 ? { cash: 300, frame: 'fr_flamme', label: '300 € + cadre Flamme (rare)' } : n % 7 === 0 ? { cash: 50, chest: 1, label: '50 € + coffre offert' } : { cash: 5 + 5 * Math.min(n, 10), label: `${5 + 5 * Math.min(n, 10)} €` };
  function touchStreak() {
    const s = st().streak, d = today().id;
    if (s.last === d) return;
    s.n = s.last === yesterday() ? s.n + 1 : 1; s.last = d; G.save();
  }
  P.canClaimStreak = () => st().streak.last === today().id && st().streak.claimed !== today().id;
  P.claimStreak = function () {
    if (!P.canClaimStreak()) return;
    const s = st().streak, r = P.streakReward(s.n); s.claimed = today().id;
    pay(r.cash, `🔥 Série de ${s.n} jour${s.n > 1 ? 's' : ''}`);
    if (r.frame) { const o = S().style || (S().style = { owned: {}, look: {} }); (o.owned || (o.owned = {}))[r.frame] = Date.now(); }
    if (r.chest) giveChest();
    TC.sound('kaching'); TC.toast(`🔥 Série de ${s.n} jour${s.n > 1 ? 's' : ''} : <b>${esc(r.label)}</b>`, 'ach', 6000);
    G.save(true); P.xp(25);
  };

  /* ---------- Missions du jour ---------- */
  const M = {
    trades: { t: 'Passe 3 ordres (achat ou vente)', n: 3 }, crypto: { t: 'Achète une crypto', n: 1 }, stock: { t: 'Achète une action ou un indice', n: 1 },
    profit: { t: 'Vends quelque chose avec un bénéfice', n: 1 }, gain5: { t: 'Réalise +5 % sur une vente', n: 1 }, bonus: { t: 'Récupère ton bonus quotidien 🎁', n: 1 },
    gift: { t: 'Envoie de l\'argent à un ami', n: 1, social: 1 }, item: { t: 'Achète un objet dans la Boutique', n: 1 }, rent: { t: 'Encaisse tes loyers', n: 1, rent: 1 },
    play: { t: 'Joue 10 minutes', n: 10 }, fav: { t: 'Ajoute un actif à tes favoris ⭐', n: 1 }, duel: { t: 'Lance ou accepte un duel ⚔️', n: 1, social: 1 },
  };
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function day() {
    const s = st(), d = today().id;
    if (!s.day || s.day.id !== d) {
      const friends = TC.Net && TC.Net.friends && TC.Net.friends.length, rent = G.rentPerHour && G.rentPerHour() > 0;
      const pool = Object.keys(M).filter(k => (!M[k].social || friends) && (!M[k].rent || rent));
      const pick = []; let h = hash(d + ((TC.Net && TC.Net.user && TC.Net.user.uid) || 'local'));
      while (pick.length < 3 && pool.length) { const i = h % pool.length; pick.push(pool.splice(i, 1)[0]); h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0; }
      s.day = { id: d, ms: pick.map(k => ({ k, v: 0, done: false })), all: false };
      G.save();
    }
    return s.day;
  }
  P.missionCash = () => Math.min(100, 10 + 2 * P.level()) * (ev('missions') ? 2 : 1);
  function progress(k, inc) {
    const d = day(); let changed = false;
    d.ms.forEach(m => {
      if (m.k !== k || m.done) return;
      m.v = Math.min(M[k].n, m.v + (inc || 1)); changed = true;
      if (m.v >= M[k].n) {
        m.done = true; const eur = P.missionCash();
        pay(eur, '🎯 Mission : ' + M[k].t); TC.sound('cash');
        TC.toast(`🎯 Mission accomplie : ${esc(M[k].t)} · <b>+${fmt.eur(eur)}</b> · +40 XP`, 'ach', 5000);
        P.xp(40);
      }
    });
    if (changed && !d.all && d.ms.every(m => m.done)) { d.all = true; TC.toast('🏅 Les 3 missions du jour sont faites ! +60 XP', 'ach', 5000); TC.confetti(120); P.xp(60); }
    if (changed) { G.save(); after(); }
  }
  P.progress = progress;

  /* ---------- Premiers pas (nouveaux joueurs) ---------- */
  const ONB = [['buy1', 'Achète ton premier actif (le Bitcoin par exemple)'], ['sell1', 'Revends-le (avec un bénéfice, c\'est encore mieux)'], ['bonus', 'Récupère ton bonus quotidien 🎁'], ['avatar', 'Crée ton avatar (touche ton avatar → 🧑 Avatar)'], ['friend', 'Ajoute un ami (onglet Amis)']];
  P.onbActive = () => { const o = st().onb; return !o.done && (Date.now() - (S().created || 0) < 21 * 86400000 || ((S().stats || {}).trades || 0) < 5); };
  function onb(k) {
    const o = st().onb; if (o.done || o[k] || !P.onbActive()) return;
    o[k] = Date.now(); pay(5, '👣 Premiers pas'); TC.toast(`👣 Premier pas réussi : ${esc((ONB.find(x => x[0] === k) || [])[1] || '')} · +5 €`, 'ok', 5000);
    if (ONB.every(([id]) => o[id])) { o.done = Date.now(); pay(25, '👣 Premiers pas terminés'); TC.toast('🎓 Premiers pas terminés : +25 € ! Tu connais les bases, à toi de jouer.', 'ach', 7000); TC.confetti(160); }
    G.save(); P.xp(20);
  }

  /* ---------- Écoute du jeu ---------- */
  G.on((type, d) => {
    d = d || {};
    if (type === 'trade' && TC.Bot && TC.Bot.auto) return; // ordre passé par le bot : ne compte pas
    if (type === 'trade') {
      const a = d.id && TC.assetById && TC.assetById[d.id];
      if (['buy', 'sell', 'open', 'close'].includes(d.kind)) { progress('trades'); P.xp(d.id === 'BTC' && ev('btc') ? 15 : 5); }
      if (d.kind === 'buy') { if (a && a.cat === 'crypto') progress('crypto'); if (a && a.cat !== 'crypto' && a.cat !== 'fx') progress('stock'); onb('buy1'); }
      if (d.kind === 'sell' || d.kind === 'close') {
        onb('sell1');
        if ((d.pnl || 0) > 0) progress('profit');
        const l = S().log[0]; if (l && l.pnl > 0 && l.eur - l.pnl > 0 && l.pnl / (l.eur - l.pnl) >= 0.05) progress('gain5');
      }
      if (d.kind === 'send') { progress('gift'); P.xp(10); }
    }
    if (type === 'item' && d.kind === 'buy') { progress('item'); P.xp(15); }
    if (type === 'rent') progress('rent');
    if (type === 'bonus') { progress('bonus'); onb('bonus'); P.xp(5); }
  });
  const fav = G.toggleFav; G.toggleFav = function (id) { const was = (S().fav || []).includes(id); const r = fav.apply(G, arguments); if (!was) progress('fav'); return r; };
  // temps de jeu, avatar, amis : vérifiés régulièrement
  let lastT = Date.now();
  setInterval(() => {
    const now = Date.now(), dt = now - lastT; lastT = now;
    if (document.hidden || dt > 120000) return;
    touchStreak(); day();
    const s = st(); s.playAcc = (s.playAcc || 0) + dt; if (s.playAcc >= 60000) { s.playAcc -= 60000; progress('play'); }
    if (S().style && S().style.look && S().style.look.av) onb('avatar');
    if (TC.Net && ((TC.Net.friends || []).length || (TC.Net.outgoing || []).length)) onb('friend');
  }, 20000);

  /* ---------- Bouton 🔥 en haut + fenêtre ---------- */
  P.chip = function () {
    const b = document.getElementById('b-prog'); if (!b) return;
    const s = st(), d = day(), todo = d.ms.filter(m => !m.done).length;
    b.querySelector('span').textContent = s.streak.n || '';
    b.classList.toggle('dot', P.canClaimStreak() || (P.onbActive() && !s.onb.done));
    b.title = `Série de ${s.streak.n} jour(s) · ${todo} mission(s) à faire`;
  };
  P.open = function () {
    touchStreak();
    const s = st(), d = day(), e = P.event(), lp = P.levelProgress(), m = today().month, sxp = s.sxp[m] || 0, tier = Math.min(P.TIERS, Math.floor(sxp / P.TIER_XP));
    const next = tier < P.TIERS ? P.reward(tier + 1) : null, sr = P.streakReward(s.streak.n), o = s.onb;
    const daysLeft = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + 1, 1) - n; })();
    const html = `<h2>🔥 Chaque jour</h2><div class="pg">
      <div class="pg-ev"><span>${e.e}</span><div><b>Aujourd'hui : ${esc(e.t)}</b><small>${esc(e.d)}</small></div></div>
      ${P.onbActive() && !o.done ? `<div class="pg-sec"><h4>👣 Premiers pas <small>+5 € par étape, +25 € à la fin</small></h4>${ONB.map(([k, t]) => `<div class="pg-m ${o[k] ? 'ok' : ''}"><i>${o[k] ? '✅' : '⬜'}</i><span>${esc(t)}</span></div>`).join('')}</div>` : ''}
      <div class="pg-sec pg-streak"><div class="pg-flame">🔥<b>${s.streak.n}</b></div><div><b>Série de ${s.streak.n} jour${s.streak.n > 1 ? 's' : ''}</b><small>Reviens chaque jour pour la faire grandir. Récompense du jour : ${esc(sr.label)}. Jour 7 : coffre offert · jour 30 : cadre Flamme.</small></div>
        ${P.canClaimStreak() ? '<button class="btn btn-gold" data-pgstreak>Récupérer</button>' : '<span class="pg-done">✓ Récupéré</span>'}</div>
      <div class="pg-sec"><h4>🎯 Missions du jour <small>${fmt.eur(P.missionCash())} + 40 XP chacune</small></h4>${d.ms.map(x => `<div class="pg-m ${x.done ? 'ok' : ''}"><i>${x.done ? '✅' : '🎯'}</i><span>${esc(M[x.k].t)}</span><em>${Math.floor(x.v)}/${M[x.k].n}</em><b class="pg-bar"><u style="width:${Math.min(100, x.v / M[x.k].n * 100)}%"></u></b></div>`).join('')}
        <p class="hint">${d.all ? '🏅 Toutes faites ! Reviens demain pour 3 nouvelles missions.' : 'Les 3 faites : +60 XP de bonus. Nouvelles missions chaque jour à minuit.'}</p></div>
      <div class="pg-sec"><h4>⭐ Niveau ${lp.l}</h4><div class="pg-xp"><b class="pg-bar"><u style="width:${lp.cur / lp.need * 100}%"></u></b><small>${lp.cur} / ${lp.need} XP</small></div>
        <p class="hint">XP : ordre 5 · objet 15 · mission 40 · série 25 · duel gagné 100. Ton niveau s'affiche à côté de ton pseudo.</p></div>
      <div class="pg-sec"><h4>🏆 Saison de ${new Date().toLocaleDateString('fr-FR', { month: 'long' })} <small>palier ${tier}/${P.TIERS} · fin dans ${Math.ceil(daysLeft / 86400000)} j</small></h4>
        <div class="pg-xp"><b class="pg-bar"><u style="width:${tier >= P.TIERS ? 100 : (sxp % P.TIER_XP) / P.TIER_XP * 100}%"></u></b><small>${next ? `Prochain palier : <b>${esc(next.label)}</b>` : '🏆 Saison terminée à 100 % !'}</small></div>
        <div class="pg-tiers">${Array.from({ length: P.TIERS }, (_, i) => { const t = i + 1, r = P.reward(t); return `<span class="${t <= tier ? 'ok' : ''} ${r.frame || r.chest ? 'big' : ''}" title="${esc(r.label)}">${t <= tier ? '✓' : r.frame ? '🖼️' : r.chest ? '🎁' : t}</span>`; }).join('')}</div>
        <p class="hint">Chaque XP gagnée ce mois-ci fait avancer la saison. Les cadres de saison sont exclusifs : on ne peut pas les acheter.</p></div></div>`;
    const md = TC.modal(html, { cls: 'wide' });
    const sb = md.el.querySelector('[data-pgstreak]'); if (sb) sb.onclick = () => { P.claimStreak(); P.open(); };
  };
  document.addEventListener('click', e => { if (e.target.closest('[data-prog]')) P.open(); });

  // au démarrage : série, missions, événement du jour (une fois par jour), premiers pas pour les nouveaux
  setTimeout(() => {
    touchStreak(); day(); P.chip();
    const s = st(), d = today().id;
    if (s.evSeen !== d) { s.evSeen = d; G.save(); const e = P.event(); setTimeout(() => TC.toast(`${e.e} <b>${esc(e.t)}</b> : ${esc(e.d)} <button class="btn btn-sm" data-prog>Voir</button>`, 'info', 8000), 4000); }
    if (P.onbActive() && !s.onb.shown) { // nouveau joueur : on montre les premiers pas dès que l'écran est libre (intro, nouveautés…)
      let tries = 0; const t = setInterval(() => {
        if (++tries > 40) return clearInterval(t);
        if (!S().seenIntro || document.querySelector('#modal.open') || document.body.classList.contains('gated')) return;
        clearInterval(t); s.onb.shown = Date.now(); G.save(); P.open();
      }, 3000);
    }
  }, 2500);
  setInterval(() => P.chip(), 30000);
})();

/* Trad Center — 🗺️ Trad City : la carte de la ville
 * Chaque joueur a son terrain : son bâtiment grandit avec son patrimoine, ses commerces s'affichent autour.
 * Les plus riches sont au centre, près de la Bourse ; le n°1 est le Maire.
 * Les commerces s'achètent avec l'argent du jeu, rapportent une recette chaque heure (caisse plafonnée à 24 h)
 * et s'améliorent jusqu'au niveau 5. Revente à 70 % de ce qui a été investi.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const C = TC.City = {};
  C.RATE = 0.08;        // recette par heure = 8 % de tout ce qui a été investi (achat + améliorations) : remboursé en ~12 h à chaque niveau
  C.UP = 0.75;          // amélioration niveau n → n+1 : 75 % du prix × n
  C.MAX_LVL = 5;
  C.CAP_H = 24;         // la caisse se remplit au maximum pendant 24 h
  C.RESALE = 0.7;
  C.BIZ = [
    { id: 'citron',   e: '🍋', name: 'Stand de citronnade',      price: 25 },
    { id: 'bonbons',  e: '🍬', name: 'Distributeur de bonbons',  price: 120 },
    { id: 'boulange', e: '🥐', name: 'Boulangerie',              price: 900 },
    { id: 'kebab',    e: '🌯', name: 'Kebab',                    price: 2500 },
    { id: 'barbier',  e: '💈', name: 'Barbier',                  price: 6000 },
    { id: 'jeux',     e: '🎮', name: 'Boutique de jeux vidéo',   price: 15000 },
    { id: 'sport',    e: '🏋️', name: 'Salle de sport',           price: 40000 },
    { id: 'cafe',     e: '☕', name: 'Café branché',             price: 90000 },
    { id: 'sushi',    e: '🍣', name: 'Restaurant japonais',      price: 250000 },
    { id: 'garage',   e: '🚗', name: 'Concession auto',          price: 800000 },
    { id: 'hotel',    e: '🏨', name: 'Hôtel 5 étoiles',          price: 4e6 },
    { id: 'casino',   e: '🎰', name: 'Casino',                   price: 25e6 },
    { id: 'banque',   e: '🏦', name: 'Banque privée',            price: 150e6 },
  ];
  C.byId = {}; C.BIZ.forEach(b => { C.byId[b.id] = b; });
  // bâtiment du terrain selon le patrimoine
  C.TIERS = [
    [0, '⛺', 'Tente'], [100, '🛖', 'Cabane'], [1000, '🏠', 'Maison'], [1e4, '🏡', 'Villa'],
    [1e5, '🏢', 'Immeuble'], [1e6, '🏬', 'Tour'], [1e7, '🏙️', 'Gratte-ciel'], [1e8, '🏰', 'Palais'], [1e9, '🗼', 'Tour du milliardaire'],
  ];
  // Résidences à acheter : c'est elles qu'on voit sur la carte (b = modèle 3D)
  C.HOMES = [
    { id: 'tente', e: '⛺', name: 'Tente', price: 0, b: 0 },
    { id: 'cabane', e: '🛖', name: 'Cabane en bois', price: 300, b: 1 },
    { id: 'maison', e: '🏠', name: 'Maison', price: 5000, b: 2 },
    { id: 'villa', e: '🏡', name: 'Villa avec piscine', price: 60000, b: 3 },
    { id: 'manoir', e: '🏯', name: 'Manoir', price: 400000, b: 'manor' },
    { id: 'immeuble', e: '🏢', name: 'Immeuble', price: 1.5e6, b: 4 },
    { id: 'tour', e: '🏬', name: 'Tour', price: 8e6, b: 5 },
    { id: 'gratteciel', e: '🏙️', name: 'Gratte-ciel', price: 40e6, b: 6 },
    { id: 'palais', e: '🏰', name: 'Palais doré', price: 200e6, b: 7 },
    { id: 'goat', e: '🗼', name: 'Tour du milliardaire', price: 1e9, b: 8 },
  ];
  C.homeById = {}; C.HOMES.forEach(h => { C.homeById[h.id] = h; });
  C.TRADE_IN = 0.7; // l'ancienne résidence est reprise à 70 %
  C.myHome = () => C.homeById[S().home] || C.HOMES[0];
  C.home = p => p && p.me ? C.myHome() : C.homeById[p && p.city && p.city.home] || C.HOMES[0];
  const interiorTier = h => h.b === 'manor' ? 5 : h.b;
  C.homeCost = id => Math.round((C.homeById[id].price - C.myHome().price * C.TRADE_IN) * 100) / 100; // négatif : on te rend la différence
  C.buyHome = async function (id) {
    const h = C.homeById[id], cur = C.myHome(); if (!h || h === cur) return;
    const cost = C.homeCost(id);
    if (S().cash < cost) return TC.toast(`Il te faut ${fmt.eur(cost)} de cash`, 'bad');
    if (!(await TC.confirm(`${h.e} ${esc(h.name)}`, `Prix : <b>${fmt.eur(h.price)}</b>${cur.price ? `<br>Reprise de ta ${esc(cur.name.toLowerCase())} : −${fmt.eur(cur.price * C.TRADE_IN)}` : ''}<br><br>${cost >= 0 ? `À payer : <b>${fmt.eur(cost)}</b>` : `On te rend : <b>${fmt.eur(-cost)}</b>`}. Ta nouvelle résidence apparaît tout de suite sur la carte.`, cost >= 0 ? 'Acheter 🔑' : 'Déménager 🔑', 'btn-gold'))) return;
    S().cash -= cost; S().home = id; if (cost > 0) S().stats.spent = (S().stats.spent || 0) + cost;
    S().log.unshift({ t: Date.now(), kind: cost >= 0 ? 'item' : 'itemsell', asset: `${h.e} Résidence : ${h.name}`, eur: Math.abs(cost) });
    G.save(true); if (N && N.flush) N.flush();
    TC.sound('kaching'); TC.confetti(160); TC.haptic && TC.haptic([30, 40, 30]);
    TC.toast(`🔑 Bienvenue dans ton ${esc(h.name.toLowerCase())} !`, 'ok', 5000);
    after();
  };
  C.tier = nw => { let t = C.TIERS[0], i = 0; C.TIERS.forEach((x, k) => { if ((nw || 0) >= x[0]) { t = x; i = k; } }); return { e: t[1], name: t[2], i }; };

  function st() { const c = S().city || (S().city = { biz: {}, last: Date.now(), earned: 0 }); c.biz = c.biz || {}; return c; }
  const lvl = id => (st().biz[id] || {}).lvl || 0;
  C.income = id => lvl(id) ? C.invOf(id, lvl(id)) * C.RATE : 0; // proportionnel à l'investissement total
  C.perHour = () => Object.keys(st().biz).reduce((t, id) => t + (C.byId[id] ? C.income(id) : 0), 0);
  C.pending = () => C.perHour() * Math.min(C.CAP_H, Math.max(0, Date.now() - st().last) / 3600000);
  C.full = () => C.perHour() > 0 && Date.now() - st().last >= C.CAP_H * 3600000;
  C.upCost = id => { const n = lvl(id); return n ? C.byId[id].price * C.UP * n : C.byId[id].price; };
  C.value = () => Object.entries(st().biz).reduce((t, [id, x]) => t + (x.inv || 0) * C.RESALE, 0);
  C.count = () => Object.keys(st().biz).length;

  // les commerces comptent dans le patrimoine
  const baseNW = G.netWorth;
  G.netWorth = () => baseNW() + (S().city ? C.value() : 0) + (S().home && C.homeById[S().home] ? C.homeById[S().home].price * C.TRADE_IN : 0);

  function log(e) { S().log.unshift(Object.assign({ t: Date.now() }, e)); if (S().log.length > 300) S().log.length = 300; }

  C.collect = function (quiet) {
    const r = Math.floor(C.pending() * 100) / 100; const c = st();
    c.last = Date.now();
    if (r <= 0) return 0;
    const t = TC.Tax ? TC.Tax.on(r) : { net: r, tax: 0, rate: 0 };
    S().cash += r; c.earned = (c.earned || 0) + r; if (TC.Tax && t.tax) TC.Tax.owe(t.tax, 'commerces'); // l'impôt est à payer soi-même (3 jours)
    log({ kind: 'biz', asset: t.tax ? `Recette des commerces (impôt à payer : ${fmt.eur(t.tax)})` : 'Recette des commerces', eur: r });
    G.save(true);
    if (!quiet) { TC.sound('kaching'); TC.toast(`💰 +${fmt.eur(r)} encaissés${t.tax ? ` · 🏛️ ${fmt.eur(t.tax)} d'impôt à payer sous 3 jours` : ''}`, 'ok', 5000); }
    return r;
  };
  C.buy = function (id) {
    const b = C.byId[id]; if (!b) return;
    const n = lvl(id); if (n >= C.MAX_LVL) return TC.toast('Déjà au niveau maximum ⭐', 'info');
    const cost = C.upCost(id);
    if (S().cash < cost) return TC.toast(`Il te faut ${fmt.eur(cost)} de cash`, 'bad');
    C.collect(true);
    S().cash -= cost;
    const x = st().biz[id] || (st().biz[id] = { lvl: 0, inv: 0, at: Date.now() });
    x.lvl++; x.inv += cost; S().stats.spent = (S().stats.spent || 0) + cost;
    log({ kind: 'item', asset: `${b.e} ${b.name}${x.lvl > 1 ? ' (niveau ' + x.lvl + ')' : ''}`, eur: cost });
    if (!S().ach.first_biz) { S().ach.first_biz = Date.now(); TC.toast('🏆 Succès : Entrepreneur', 'ok'); }
    if (C.count() === C.BIZ.length && !S().ach.biz_all) { S().ach.biz_all = Date.now(); TC.toast('🏆 Succès : Empire commercial', 'ok'); }
    G.save(true); TC.sound('kaching'); if (n === 0) TC.confetti(90);
    TC.toast(n === 0 ? `${b.e} ${esc(b.name)} acheté ! Il rapporte ${fmt.eur(C.income(id))} / heure.` : `${b.e} ${esc(b.name)} passe au niveau ${x.lvl} ⭐`, 'ok', 5000);
    after();
  };
  C.sell = async function (id) {
    const b = C.byId[id], x = st().biz[id]; if (!x) return;
    const v = Math.round(x.inv * C.RESALE * 100) / 100;
    if (!(await TC.confirm('Revendre ce commerce ?', `${b.e} <b>${esc(b.name)}</b> (niveau ${x.lvl}) sera revendu <b>${fmt.eur(v)}</b> (70 % de ce que tu as investi).`, 'Revendre', 'btn-sell'))) return;
    C.collect(true);
    delete st().biz[id]; S().cash += v;
    log({ kind: 'itemsell', asset: `${b.e} ${b.name}`, eur: v });
    G.save(true); TC.toast(`${b.e} ${esc(b.name)} revendu ${fmt.eur(v)}`, 'ok'); after();
  };
  // ce que voient les autres joueurs sur la carte
  C.pub = () => {
    const o = {}, at = {}; Object.entries(st().biz).forEach(([id, x]) => { o[id] = x.lvl; at[id] = x.at || 0; });
    const own = [...new Set(S().owned.slice().sort((a, b) => b.price - a.price).map(x => x.item))].slice(0, 16);
    const deco = (S().deco || []).slice(0, 40).map(d => [d.k, d.x, d.z, d.r || 0]);
    return { biz: o, at, own, home: S().home || 'tente', deco };
  };

  /* ---------- Rachat du commerce d'un autre joueur ----------
   * L'acheteur paie 2 × ce que le commerce a coûté (niveaux compris) et le récupère au même niveau.
   * Le paiement est noté dans son propre profil (champ tk_<uid du vendeur>) ; le vendeur l'encaisse
   * automatiquement à sa prochaine ouverture du jeu, et reçoit une notification.
   * Un commerce acheté ou racheté depuis moins de 24 h est protégé. */
  C.PROTECT = 24 * 3600000; C.TAKE_MULT = 2; C.TAX = 0.01;
  C.mandateStart = () => Date.now() - (7 * 86400000 - TC.Weekly.current().left);
  C.invOf = (id, l) => { const p = C.byId[id].price; let t = p; for (let n = 1; n < l; n++) t += p * C.UP * n; return t; };
  C.takePrice = (id, l) => Math.round(C.invOf(id, l) * C.TAKE_MULT * 100) / 100;
  C.takeBlock = function (p, id) {
    const l = ((p.city && p.city.biz) || {})[id]; if (!l) return 'Plus disponible';
    if (!N || !N.user || !N.profile) return 'Crée un compte pour racheter';
    if (p.me) return null;
    if (lvl(id)) return 'Tu as déjà ce commerce';
    if (C.elected && p.uid === C.elected.uid) return '👑 Protégé : c\'est le Maire';
    const at = ((p.city && p.city.at) || {})[id] || 0;
    if (Date.now() - at < C.PROTECT) return '🛡️ Protégé encore ' + fmt.dur(C.PROTECT - (Date.now() - at));
    return null;
  };
  C.takeover = async function (p, id) {
    const b = C.byId[id], l = p.city.biz[id], price = C.takePrice(id, l);
    const why = C.takeBlock(p, id); if (why) return TC.toast(why, 'bad');
    const mayor = C.elected && C.elected.uid !== N.user.uid && C.elected.uid !== p.uid ? C.elected : null;
    const tax = mayor ? Math.round(price * C.TAX * 100) / 100 : 0, total = price + tax;
    if (S().cash < total) return TC.toast(`Il te faut ${fmt.eur(total)} de cash`, 'bad');
    if (!(await TC.confirm('Racheter ce commerce ?', `${b.e} <b>${esc(b.name)}</b> niveau ${l} de <b>${esc(p.pseudo)}</b> pour <b>${fmt.eur(price)}</b> (2 × son prix)${tax ? ` + <b>${fmt.eur(tax)}</b> de taxe pour le Maire ${esc(mayor.pseudo)} 👑` : ''}.<br><br>${esc(p.pseudo)} touchera ${fmt.eur(price)}. Il rapportera <b>${fmt.eur(C.invOf(id, l) * C.RATE)} / heure</b> et sera protégé 24 h.`, 'Racheter 🤝', 'btn-gold'))) return;
    C.collect(true);
    S().cash -= total;
    st().biz[id] = { lvl: l, inv: price, at: Date.now(), from: p.uid };
    log({ kind: 'item', asset: `${b.e} ${b.name} racheté à ${p.pseudo}`, eur: price });
    try {
      const ref = N.db().collection('users').doc(N.user.uid), f = 'tk_' + p.uid;
      const snap = await ref.get();
      const arr = (((snap.data() || {})[f]) || []).filter(e => Date.now() - e.at < 7 * 86400000).slice(-9);
      arr.push({ id: Math.random().toString(36).slice(2, 12), biz: id, lvl: l, pay: price, at: Date.now() });
      const upd = { [f]: arr, updatedAt: Date.now() };
      if (tax) { const tf = 'tx_' + mayor.uid; upd[tf] = (((snap.data() || {})[tf]) || []).filter(e => Date.now() - e.at < 7 * 86400000).slice(-19).concat([{ id: Math.random().toString(36).slice(2, 12), eur: tax, at: Date.now() }]); }
      await ref.update(upd);
    } catch (e) {
      S().cash += total; delete st().biz[id]; S().log.shift(); G.save(true);
      return TC.toast('Rachat impossible : ' + N.errMsg(e), 'bad');
    }
    if (p.city && p.city.biz) delete p.city.biz[id];
    if (!S().ach.first_biz) S().ach.first_biz = Date.now();
    G.save(true); N.flush(); N.notifyPlayer(p.uid, 'takeover', { eur: price, biz: b.name });
    TC.sound('kaching'); TC.confetti(120);
    TC.toast(`🤝 ${b.e} ${esc(b.name)} racheté à ${esc(p.pseudo)} !`, 'ok', 6000);
    after();
  };
  // côté vendeur : encaisser les rachats faits par les autres
  let tkBusy = false;
  C.checkTakeovers = async function () {
    if (tkBusy || !N || !N.user || !N.db()) return; tkBusy = true;
    try {
      const f = 'tk_' + N.user.uid;
      const snap = await N.db().collection('users').where(f, '!=', null).get();
      const seen = st().tkSeen || (st().tkSeen = {}); const got = [];
      snap.docs.forEach(d => {
        if (TC.Admin && TC.Admin.isBanned(d.id)) return;
        const who = N.prof(d.id, d.data()).pseudo || 'Un joueur';
        (d.data()[f] || []).forEach(e => {
          if (!e || !e.id || seen[e.id] || !C.byId[e.biz]) return;
          seen[e.id] = Date.now();
          const x = st().biz[e.biz]; if (!x || (x.at || 0) > e.at) return; // déjà revendu, ou racheté depuis
          if (C.elected && C.elected.uid === N.user.uid && e.at >= C.mandateStart()) return; // le Maire est protégé
          C.collect(true);
          delete st().biz[e.biz];
          const pay = Math.max(0, Math.min(+e.pay || 0, C.takePrice(e.biz, C.MAX_LVL)));
          S().cash += pay;
          log({ kind: 'biz', asset: `${C.byId[e.biz].e} ${C.byId[e.biz].name} racheté par ${who}`, eur: pay });
          got.push({ who, b: C.byId[e.biz], pay });
        });
      });
      Object.keys(seen).forEach(k => { if (Date.now() - seen[k] > 10 * 86400000) delete seen[k]; });
      if (got.length) {
        G.save(true); N.flush(); TC.sound('kaching');
        TC.modal(`<div class="center"><div class="big-emoji">🤝</div><h2>On a racheté ${got.length > 1 ? 'tes commerces' : 'ton commerce'} !</h2>
          ${got.map(g => `<p>${g.b.e} <b>${esc(g.b.name)}</b> racheté par <b>${esc(g.who)}</b> : <b class="up">+${fmt.eur(g.pay)}</b></p>`).join('')}
          <p class="muted">Tu peux en racheter un autre, ou reprendre le sien dans 24 h (onglet Ville).</p>
          <div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>Encaisser 💰</button></div></div>`);
        if (TC.App) TC.App.after();
      }
    } catch (e) { console.warn('rachats', e); }
    tkBusy = false;
  };

  /* ---------- Élection du maire (chaque semaine) ----------
   * Chaque joueur avec un compte vote une fois par semaine (il peut changer d'avis jusqu'au dimanche soir).
   * Le vote est rangé dans son profil (champ vote_<semaine>). Lundi, l'élu devient Maire : couronne sur la carte et 300 €. */
  C.ELECT_PRIZE = 300;
  const W = () => TC.Weekly;
  const tallies = {};
  C.tally = async function (weekId, maxAge = 30000) {
    const c = tallies[weekId]; if (c && Date.now() - c.at < maxAge) return c.rows;
    if (!N || !N.db() || !N.user) return [];
    const f = 'vote_' + weekId;
    const snap = await N.db().collection('users').where(f, '>', '').get();
    const count = {};
    snap.docs.forEach(d => { const v = d.data()[f]; if (d.data().bot || v === d.id || (TC.Admin && TC.Admin.isBanned(d.id))) return; count[v] = (count[v] || 0) + 1; });
    const ids = Object.keys(count).filter(u => !(TC.Admin && TC.Admin.isBanned(u)) && u !== TC.ADMIN_UID && u !== TC.CLAUDE_UID); // créateur et Claude : non éligibles
    const profs = await Promise.all(ids.map(u => (roster().find(x => x.uid === u) ? Promise.resolve(roster().find(x => x.uid === u)) : N.db().collection('users').doc(u).get().then(s => s.exists ? N.prof(u, s.data()) : null).catch(() => null))));
    const rows = ids.map((u, i) => ({ uid: u, votes: count[u], p: profs[i] })).filter(r => r.p).sort((a, b) => b.votes - a.votes || (b.p.nw || 0) - (a.p.nw || 0));
    tallies[weekId] = { at: Date.now(), rows };
    return rows;
  };
  C.elected = null;
  C.mayorUid = function () {
    const r = roster();
    if (C.elected && r.some(x => x.uid === C.elected.uid)) return C.elected.uid;
    return r[0] && (r[0].nw || 0) > 0 ? r[0].uid : null;
  };
  C.myVote = () => N && N.profile ? N.profile['vote_' + W().current().id] || null : null;
  C.vote = async function (uid) {
    if (!N || !N.user || !N.profile) return TC.toast('Crée un compte pour voter', 'bad');
    if (uid === N.user.uid) return TC.toast('Tu ne peux pas voter pour toi 😄', 'info');
    const f = 'vote_' + W().current().id;
    try {
      await N.db().collection('users').doc(N.user.uid).update({ [f]: uid, updatedAt: Date.now() });
      N.profile[f] = uid; delete tallies[W().current().id];
      const p = roster().find(x => x.uid === uid);
      TC.sound('ach'); TC.toast(`🗳️ Vote enregistré pour ${esc((p && p.pseudo) || 'ce joueur')} !`, 'ok');
    } catch (e) { TC.toast(N.errMsg(e), 'bad'); }
  };
  C.checkElection = async function () {
    if (!N || !N.user || !N.db() || !W()) return;
    try {
      const prev = W().previous(); const rows = await C.tally(prev.id, 0);
      if (rows[0] && !rows[0].p.me) { try { const sn = await N.db().collection('users').doc(rows[0].uid).get(); if (sn.exists) rows[0].p = N.prof(rows[0].uid, sn.data()); } catch (e) { } }
      C.elected = rows[0] ? { uid: rows[0].uid, pseudo: rows[0].p.pseudo, votes: rows[0].votes, week: prev.id, p: rows[0].p } : null;
      if (TC.Mayor) TC.Mayor.refresh();
      const paid = st().mayorPaid || (st().mayorPaid = {});
      if (C.elected && C.elected.uid === N.user.uid && !paid[prev.id]) {
        paid[prev.id] = Date.now(); S().cash += C.ELECT_PRIZE; if (TC.Weekly) TC.Weekly.flow(C.ELECT_PRIZE);
        log({ kind: 'bonus', asset: 'Élu Maire de Trad City 👑', eur: C.ELECT_PRIZE }); G.save(true);
        TC.sound('kaching'); TC.confetti(220);
        TC.modal(`<div class="center"><div class="big-emoji">👑</div><h2>Tu es élu Maire de Trad City !</h2>
          <p>${C.elected.votes} joueur${C.elected.votes > 1 ? 's ont' : ' a'} voté pour toi cette semaine.</p><p>Ta couronne brille sur la carte et tu gagnes <b>+${fmt.eur(C.ELECT_PRIZE)}</b> 🎉</p>
          <div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>Merci les électeurs 🙌</button></div></div>`);
        if (TC.App) TC.App.after();
      }
      if (UI().tab === 'city') C.render();
    } catch (e) { console.warn('élection', e); }
  };

  function after() { if (TC.App) TC.App.after(); if (UI().tab === 'city') C.render(); }
  const UI = () => TC.UI || {};

  /* ---------- Joueurs sur la carte ---------- */
  let players = null, loadedAt = 0, loading = false;
  async function loadPlayers(force) {
    if (!N || !N.user || !N.profile || !N.db()) return;
    if (loading || (!force && players && Date.now() - loadedAt < 60000)) return;
    loading = true;
    try {
      const snap = await N.db().collection('users').orderBy('nw', 'desc').limit(60).get();
      const list = snap.docs.map(d => N.prof(d.id, d.data())).filter(u => !u.bot && !u.deleted && !(TC.Admin && TC.Admin.isBanned(u.uid)));
      (N.friends || []).forEach(f => { if (!list.some(u => u.uid === f.uid)) list.push(f); });
      players = list; loadedAt = Date.now();
    } catch (e) { console.warn('city', e); players = players || []; }
    loading = false;
    if (UI().tab === 'city') C.render();
  }
  function meAsPlayer() {
    const m = TC.Style ? TC.Style.mine() : {};
    return Object.assign({}, N && N.profile ? N.profile : { pseudo: 'Toi', avatar: m.avatar }, { uid: N && N.user ? N.user.uid : 'me', nw: G.netWorth(), city: C.pub(), look: m.look, plusUntil: m.plusUntil, me: true });
  }
  C.roster = () => roster();
  function roster() {
    const me = meAsPlayer();
    const list = (players || []).filter(u => u.uid !== me.uid).concat([me]);
    return list.sort((a, b) => (b.nw || 0) - (a.nw || 0));
  }

  /* ---------- Rendu ---------- */
  const LANDMARKS = [
    { id: 'bourse', e: '🏛️', name: 'Bourse', go: 'markets' },
    { id: 'conc',   e: '🏎️', name: 'Concession', go: 'car' },
    { id: 'agence', e: '🔑', name: 'Agence immo', go: 'estate' },
    { id: 'bijou',  e: '💎', name: 'Bijouterie', go: 'luxury' },
    { id: 'coffre', e: '🎁', name: 'Coffre', go: 'chest' },
    { id: 'labo',   e: '🤖', name: 'Labo du bot', go: 'portfolio' },
    { id: 'mairie', e: '🏤', name: 'Mairie', go: 'mairie' },
    { id: 'parc',   e: '🌳', name: 'Parc', go: 'parc' },
  ];
  function lotHtml(p, i) {
    const t = Object.assign({ i: typeof C.home(p).b === 'number' ? C.home(p).b : 5 }, C.home(p));
    const biz = Object.entries((p.city && p.city.biz) || {}).filter(([id]) => C.byId[id]).sort((a, b) => C.byId[b[0]].price - C.byId[a[0]].price);
    const friend = !p.me && N && (N.friends || []).some(f => f.uid === p.uid);
    const mayor = p.uid === C.mayorUid();
    return `<button class="lot t${t.i} ${p.me ? 'me' : ''} ${friend ? 'fr' : ''} ${mayor ? 'mayor' : ''}" data-lot="${esc(p.uid)}">
      ${mayor ? '<i class="lot-crown">👑</i>' : ''}
      <span class="lot-av">${TC.Style ? TC.Style.avatar(p, 's') : esc(p.avatar || '👤')}</span>
      <span class="lot-b">${t.e}</span>
      <span class="lot-biz">${biz.slice(0, 4).map(([id]) => C.byId[id].e).join('')}${biz.length > 4 ? '<small>+' + (biz.length - 4) + '</small>' : ''}</span>
      <span class="lot-n">${p.me ? 'Toi' : esc(p.pseudo || '?')}${TC.Style ? TC.Style.badge(p) : ''}</span>
      <small class="lot-nw">${fmt.eur(p.nw || 0, true)}</small></button>`;
  }
  function landHtml(l) { return `<button class="lot land${TC.Hunt && TC.Hunt.hunting() ? ' dig' : ''}" data-land="${l.id}"><span class="lot-b">${l.e}</span><span class="lot-n">${l.name}</span></button>`; }

  function mapHtml() {
    const r = roster();
    // centre-ville : les monuments mélangés aux plus riches, puis les quartiers
    const tiles = []; let li = 0;
    r.forEach((p, i) => {
      if (i % 2 === 0 && li < LANDMARKS.length) tiles.push(landHtml(LANDMARKS[li++]));
      tiles.push(lotHtml(p, i));
    });
    while (li < LANDMARKS.length) tiles.push(landHtml(LANDMARKS[li++]));
    const h = +new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false });
    const night = h < 7 || h >= 20;
    const guest = !N || !N.enabled || !N.user || !N.profile;
    return `<div class="city-map ${night ? 'night' : ''}">
      <div class="city-sky"><b>🗺️ Trad City</b><span>${night ? '🌙 La ville dort… ou trade' : '☀️ ' + r.length + ' habitant' + (r.length > 1 ? 's' : '')}</span></div>
      <div class="city-grid">${tiles.join('')}</div>
      <i class="city-car c1">🚕</i><i class="city-car c2">🚌</i><i class="city-car c3">🏎️</i>
      ${guest ? `<p class="city-guest">👥 Crée un compte (onglet Amis) pour voir les autres joueurs et leurs bâtiments.</p>` : players == null ? '<p class="city-guest">Chargement des habitants…</p>' : ''}
    </div>`;
  }

  function homeHtml() {
    const cur = C.myHome();
    return `<div class="panel home-p"><h3>🔑 Ma résidence <small>${cur.e} ${esc(cur.name)}</small></h3>
      <p class="muted">C'est ta résidence qu'on voit sur la carte. En changeant, l'ancienne est reprise à 70 %.</p>
      <div class="homes">${C.HOMES.map(h => { const own = h === cur, cost = C.homeCost(h.id);
        return `<button class="home ${own ? 'own' : ''}" ${own ? 'disabled' : `data-home="${h.id}"`}><span>${h.e}</span><b>${esc(h.name)}</b><small>${own ? '✓ chez toi' : h.price ? fmt.eur(h.price, true) : 'gratuit'}</small>${own ? '' : cost >= 0 ? `<i class="${S().cash >= cost ? '' : 'down'}">à payer ${fmt.eur(cost, true)}</i>` : `<i>on te rend ${fmt.eur(-cost, true)}</i>`}</button>`; }).join('')}</div></div>`;
  }
  function bizHtml() {
    const c = st(), ph = C.perHour(), pend = C.pending();
    const cards = C.BIZ.map(b => {
      const n = lvl(b.id), cost = C.upCost(b.id), can = S().cash >= cost;
      const inc = C.invOf(b.id, Math.max(1, n)) * C.RATE;
      const next = n && n < C.MAX_LVL ? cost * C.RATE : 0;
      return `<div class="biz ${n ? 'own' : ''}"><span class="biz-e">${b.e}</span>
        <div class="biz-i"><b>${esc(b.name)}</b>${n ? `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(C.MAX_LVL - n)}</span>` : ''}
          <small>${n ? `Rapporte <b class="up">${fmt.eur(inc)}</b> / h` : `Prix ${fmt.eur(b.price)} · rapporte ${fmt.eur(inc)} / h`}</small></div>
        <div class="biz-a">${n < C.MAX_LVL ? `<button class="btn btn-sm ${n ? '' : 'btn-gold'}" data-biz="${b.id}" ${can ? '' : 'disabled'}>${n ? `⬆️ Niv. ${n + 1} · ${fmt.eur(cost, true)}` : `Acheter ${fmt.eur(cost, true)}`}</button>` : '<span class="muted">Niveau max ⭐</span>'}
          ${n ? `<button class="btn btn-sm btn-ghost" data-bizsell="${b.id}" title="Revendre">♻️</button>` : ''}</div>
        ${next ? `<em class="biz-next">+${fmt.eur(next)} / h au niveau suivant</em>` : ''}</div>`;
    }).join('');
    return `<div class="panel caisse ${C.full() ? 'full' : ''}"><div><h3>🏪 Mes commerces</h3>
        <p class="muted">${C.count() ? `${C.count()} commerce${C.count() > 1 ? 's' : ''} · <b class="up">${fmt.eur(ph)} / heure</b> · déjà gagné ${fmt.eur(c.earned || 0)}` : 'Achète ton premier commerce : il te rapporte de l\'argent chaque heure, même quand tu ne joues pas.'}</p></div>
      ${C.count() ? `<div class="caisse-r"><span>Dans la caisse</span><b id="city-pend">${fmt.eur(pend)}</b><small class="taxl" data-taxinfo>🏛️ impôt ${TC.Tax ? TC.Tax.pct(TC.Tax.rate()) : '0 %'} ⓘ</small>${C.full() ? '<small class="down">Caisse pleine ! Encaisse vite</small>' : `<small>se remplit pendant ${C.CAP_H} h max</small>`}<button class="btn btn-gold" id="city-collect" ${pend < 0.01 ? 'disabled' : ''}>💰 Encaisser</button></div>` : ''}</div>
      <div class="biz-grid">${cards}</div>
      <p class="hint">Recette : 8 % par heure de tout ce que tu as investi dans le commerce : chaque achat et chaque amélioration est remboursé en 12 h environ. Revente à 70 % de ce que tu as investi. Les commerces comptent dans ton patrimoine.</p>`;
  }

  /* ---------- Vue 3D ---------- */
  let view2d = false; try { view2d = localStorage.getItem('tradcenter.city2d') === '1'; } catch (e) { }
  const nightNow = () => { const h = +new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }); return h < 7 || h >= 20; };
  function data3d() {
    const r = roster();
    const players = r.map((p, i) => {
      const top = p.topItem && TC.shopById[p.topItem];
      const isCar = top && top.type === 'car';
      return { uid: p.uid, pseudo: p.pseudo || '?', tier: C.home(p).b, avatar: p.me ? (TC.Style ? TC.Style.mine().avatar : p.avatar) : p.avatar, biz: (p.city && p.city.biz) || {}, me: !!p.me, mayor: p.uid === C.mayorUid(), tag: p.clanTag || null,
        friend: !p.me && N && (N.friends || []).some(f => f.uid === p.uid), plus: TC.Style ? TC.Style.isPlus(p) : false,
        look: p.me ? (TC.Style ? TC.Style.mine().look : p.look) : p.look,
        car: isCar ? { color: parseInt(String(top.grad && top.grad[0] || '#d00000').replace('#', ''), 16), style: TC.City3D && TC.City3D.vstyle ? TC.City3D.vstyle(top) : null } : null };
    });
    return { players, landmarks: LANDMARKS, biz: C.byId, night: nightNow() };
  }
  function map3dHtml() {
    const r = roster(); const guest = !N || !N.enabled || !N.user || !N.profile;
    const inn = TC.City3D && TC.City3D.insideOf && TC.City3D.insideOf(), wk = TC.Walk && TC.Walk.on();
    if (wk) return `<div class="city3d walking" id="city3d-host"><div class="c3-load">🚶 On sort se balader…</div>${TC.Walk.hud()}</div>`;
    if (inn) return `<div class="city3d" id="city3d-host"><div class="c3-load">🏠 On ouvre la porte…</div>
      <div class="c3-top"><b>🏠 ${inn.me ? 'Chez toi' : 'Chez ' + esc(inn.pseudo)}</b><span>${esc(inn.homeName || '')}</span></div>
      <div class="c3-hud"><button data-c3="out">⬅️ Ville</button></div>
      <div class="c3-help">☝️ Glisse pour faire le tour · 🤏 pince pour zoomer</div></div>`;
    return `<div class="city3d" id="city3d-host"><div class="c3-load">🏗️ Construction de Trad City…</div>
      <div class="c3-top"><b>🗺️ Trad City</b><span>${r.length} habitant${r.length > 1 ? 's' : ''}</span></div>
      <div class="c3-hud">${TC.Walk ? '<button data-c3="walk" class="c3-walk">🚶 Balade</button>' : ''}<button data-c3="me">📍 Moi</button><button data-c3="mayor">👑 Maire</button><button data-c3="night">${TC.City3D && TC.City3D.ready && TC.City3D.isNight() ? '☀️' : '🌙'}</button><button data-c3="2d">2D</button></div>
      <div class="c3-help">☝️ Glisse pour tourner · 🤏 pince pour zoomer · touche un bâtiment</div>
      ${guest ? '<p class="city-guest c3-guest">👥 Crée un compte (onglet Amis) pour voir les autres joueurs.</p>' : ''}</div>`;
  }
  if (TC.City3D) TC.City3D.onFail = () => { if (UI().tab === 'city') setTimeout(() => C.render(), 0); };
  function onPick3d(own) { if (own.uid) lotModal(own.uid); else if (own.land === 'market') { if (TC.Walk) TC.Walk.shop(); } else if (own.land) landmark(own.land); }
  function voteBar() {
    if (!N || !N.enabled) return '';
    const v = C.myVote && C.myVote(), who = v && roster().find(x => x.uid === v);
    return `<div class="vote-bar"><span>🗳️</span><div><b>Élection du Maire</b><small>${!N.user || !N.profile ? 'Crée un compte pour voter' : who ? 'Ton vote : ' + esc(who.pseudo || '?') + ' · tu peux changer jusqu\'à dimanche' : 'Tu n\'as pas encore voté cette semaine'}</small></div><button class="btn btn-sm ${v ? '' : 'btn-gold'}" data-land="mairie">${v ? 'Mairie' : 'Voter'}</button></div>`;
  }
  C.render = function () {
    const root = $('#tab-city'); if (!root) return;
    const use3d = !view2d && TC.City3D && TC.City3D.supported() && !TC.City3D.failed;
    const v3 = TC.City3D, why = v3 && (!v3.supported() ? 'WebGL désactivé sur ce navigateur' : v3.failed ? v3.error || 'erreur inconnue' : null);
    root.innerHTML = (TC.Mayor ? TC.Mayor.banner() : '') + voteBar() + (use3d ? map3dHtml() : (why ? `<div class="nbox c3-err">⚠️ La 3D n'a pas pu s'afficher sur cet appareil : <b>${esc(why)}</b>. Voici la carte en 2D. <button class="btn btn-sm" data-c3="retry">🔄 Réessayer la 3D</button></div>` : '') + mapHtml().replace('<div class="city-sky">', '<div class="city-sky">' + (v3 && v3.supported() && !v3.failed ? '<button class="c3-back" data-c3="3d">🧊 Vue 3D</button>' : ''))) + homeHtml() + bizHtml();
    if (use3d) {
      TC.City3D.load().then(ok => {
        const host = $('#city3d-host'); if (!host) return;
        if (!ok) return C.render();
        try { TC.City3D.mount(host, data3d(), onPick3d); } catch (e) { return C.render(); }
        host.classList.add('ready');
        // contrôle : si rien n'est dessiné après quelques secondes, on bascule en 2D en expliquant pourquoi
        setTimeout(() => { if (UI().tab === 'city' && $('#city3d-host') && TC.City3D.ready && !TC.City3D.failed && !TC.City3D.drawn() && !document.hidden) { TC.City3D.failed = true; TC.City3D.error = 'aucune image affichée'; C.render(); } }, 6000);
      }).catch(e => { TC.City3D.failed = true; TC.City3D.error = String(e && e.message || e); C.render(); });
    }
    loadPlayers();
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-c3]'); if (!b) return;
    const a = b.dataset.c3, V3 = TC.City3D;
    if (a === 'retry') { V3.retry(); view2d = false; try { localStorage.setItem('tradcenter.city2d', '0'); } catch (x) { } return C.render(); }
    if (a === '2d' || a === '3d') { view2d = a === '2d'; try { localStorage.setItem('tradcenter.city2d', view2d ? '1' : '0'); } catch (x) { } return C.render(); }
    if (a === 'me') return V3.focus(N && N.user ? N.user.uid : 'me');
    if (a === 'mayor') { const m = C.mayorUid(); if (m) V3.focus(m); return; }
    if (a === 'out') { V3.exit(); return C.render(); }
    if (a === 'walk') { if (TC.Walk) TC.Walk.start(); return; }
    if (a === 'night') { V3.setNight(!V3.isNight()); C.render(); }
  });
  C.live = function () {
    const el = $('#city-pend'); if (el) el.textContent = fmt.eur(C.pending());
    const b = $('#city-collect'); if (b) b.disabled = C.pending() < 0.01;
    $$biz();
  };
  function $$biz() { document.querySelectorAll('[data-biz]').forEach(b => { b.disabled = S().cash < C.upCost(b.dataset.biz); }); }

  /* ---------- Fiche d'un terrain ---------- */
  C.lotModal = uid => lotModal(uid);
  function lotModal(uid) {
    const p = roster().find(x => x.uid === uid); if (!p) return;
    const i = roster().indexOf(p), t = C.home(p), isMayor = p.uid === C.mayorUid(), voted = C.myVote() === p.uid;
    const can3d = TC.City3D && TC.City3D.ready && !TC.City3D.failed && $('#city3d-host');
    const biz = Object.entries((p.city && p.city.biz) || {}).filter(([id]) => C.byId[id]).sort((a, b) => C.byId[b[0]].price - C.byId[a[0]].price);
    const top = p.topItem && TC.shopById[p.topItem];
    const friend = N && (N.friends || []).find(f => f.uid === p.uid);
    const asked = N && (N.outgoing || []).some(r => r.to === p.uid);
    const md = TC.modal(`<div class="lot-card"><div class="lot-big">${t.e}</div>
        ${TC.Style ? TC.Style.avatar(p, 'xl') : ''}
        <h2>${TC.Clan ? TC.Clan.badge(p) : ''}${p.me ? 'Ton terrain' : esc(p.pseudo || '?')} ${TC.Style ? TC.Style.badge(p) : ''}</h2>
        <p class="muted">${isMayor ? '👑 Maire de Trad City · ' : ''}${esc(t.name)} · n°${i + 1} de la ville</p>
        ${can3d ? `<button class="btn btn-gold btn-xl lot-visit" data-visit="${esc(p.uid)}">🏠 ${p.me ? 'Entrer chez moi' : 'Visiter sa maison'}</button>` : ''}
        <div class="kv"><span>Patrimoine</span><b>${fmt.eur(p.nw || 0)}</b><span>Rang</span><b>${esc(p.rank || G.rank(p.nw || 0).r[1])}</b>
          <span>⏱️ Temps de jeu</span><b>${p.me ? TC.Play.fmt(TC.Play.ms()) : p.playMs ? TC.Play.fmt(p.playMs) : 'pas encore compté'}</b>
          <span>📅 Joue depuis le</span><b>${TC.Play.date(p.me ? TC.Play.since() : (p.playSince || p.createdAt))}</b>
          ${top ? `<span>Plus bel objet</span><b>${top.emoji} ${esc(top.brand + ' ' + top.model)}</b>` : ''}${p.items ? `<span>Objets</span><b>${p.items}</b>` : ''}</div>
        <h4>🏪 Commerces</h4>${biz.length ? `<div class="lot-takes">${biz.map(([id, l]) => { const why = p.me ? null : C.takeBlock(p, id), pr = C.takePrice(id, l);
          return `<div class="take"><span>${C.byId[id].e} ${esc(C.byId[id].name)} <b>${'★'.repeat(l)}</b></span>${p.me ? '' : why ? `<small>${esc(why)}</small>` : `<button class="btn btn-sm btn-gold" data-take="${id}" ${S().cash >= pr ? '' : 'disabled'}>Racheter ${fmt.eur(pr, true)}</button>`}</div>`; }).join('')}</div>` : '<p class="muted">Aucun commerce pour l\'instant.</p>'}
        ${!p.me && N && N.user && N.profile ? `<button class="btn ${voted ? 'btn-ghost' : ''} lot-vote" data-vote="${esc(p.uid)}" ${voted ? 'disabled' : ''}>${voted ? '✅ Ton vote de Maire va à ce joueur' : '🗳️ Voter pour ce joueur comme Maire'}</button>` : ''}
        <div class="modal-actions">${p.me ? '<button class="btn btn-gold" data-close>OK</button>'
          : friend ? `<button class="btn btn-gold" data-citysend="${esc(p.uid)}">💸 Lui envoyer de l'argent</button>`
          : N && N.user ? `<button class="btn btn-gold" data-cityadd="${esc(p.pseudo)}" ${asked ? 'disabled' : ''}>${asked ? 'Demande envoyée' : '➕ Ajouter en ami'}</button>` : ''}</div></div>`, { cls: 'lot-modal' });
    md.el.querySelectorAll('[data-take]').forEach(x => { x.onclick = () => { md.close(); C.takeover(p, x.dataset.take); }; });
    const vb = md.el.querySelector('[data-vote]'); if (vb) vb.onclick = async () => { vb.disabled = true; await C.vote(p.uid); vb.textContent = '✅ Ton vote de Maire va à ce joueur'; };
    const vi = md.el.querySelector('[data-visit]'); if (vi) vi.onclick = () => { md.close(); C.visit(p); };
    const s = md.el.querySelector('[data-citysend]');
    if (s) s.onclick = () => { md.close(); if (TC.Social && TC.Social.sendModal) TC.Social.sendModal(friend); };
    const a = md.el.querySelector('[data-cityadd]');
    if (a) a.onclick = async () => {
      a.disabled = true;
      try { const r = await N.addFriend(a.dataset.cityadd); TC.toast(r === 'accepted' ? 'Vous êtes maintenant amis 🤝' : 'Demande d\'ami envoyée ✉️', 'ok'); a.textContent = 'Demande envoyée'; }
      catch (e) { a.disabled = false; TC.toast(N.errMsg(e), 'bad'); }
    };
  }
  C.mairie = () => mairie();
  async function mairie() {
    const cur = W().current(), d = Math.floor(cur.left / 86400000), h = Math.floor(cur.left / 3600000) % 24;
    const mu = C.mayorUid(), m = roster().find(x => x.uid === mu);
    const logged = N && N.user && N.profile;
    const md = TC.modal(`<div class="lot-card mairie"><div class="lot-big">🏤</div><h2>Mairie de Trad City</h2>
      <p>${m ? `Maire actuel : <b>${m.me ? 'toi' : esc(m.pseudo || '?')}</b> 👑 ${C.elected && C.elected.uid === mu ? `(élu avec ${C.elected.votes} voix)` : '(le plus riche, en attendant une élection)'}` : 'Pas encore de maire.'}</p>
      <div class="nbox">🗳️ <b>Élection de la semaine</b> · fin dans ${d ? d + ' j ' : ''}${h} h<br><small>Chaque joueur a 1 voix (pas pour lui-même). Lundi, l'élu devient Maire : couronne sur la carte et <b>+${fmt.eur(C.ELECT_PRIZE)}</b>.</small></div>
      ${TC.Mayor ? TC.Mayor.html() : ''}
      <h4>📊 Résultats en direct</h4><div class="elect" id="elect-res"><div class="empty">${logged ? 'Dépouillement…' : 'Crée un compte pour voir et voter.'}</div></div>
      ${logged ? `<h4>Voter pour…</h4><div class="elect-c">${roster().filter(x => !x.me).slice(0, 30).map(x => `<button class="btn btn-sm ${C.myVote() === x.uid ? 'btn-gold' : ''}" data-vote="${esc(x.uid)}">${esc(x.avatar || '👤')} ${esc(x.pseudo || '?')}${TC.Mayor ? TC.Mayor.promiseTag(x) : ''}${C.myVote() === x.uid ? ' ✅' : ''}</button>`).join('') || '<p class="muted">Personne d\'autre en ville pour l\'instant.</p>'}</div>` : ''}
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Fermer</button></div></div>`, { cls: 'lot-modal' });
    md.el.querySelectorAll('[data-vote]').forEach(b => { b.onclick = async () => { await C.vote(b.dataset.vote); md.close(); mairie(); }; });
    if (TC.Mayor) TC.Mayor.wire(md, () => { md.close(); mairie(); });
    if (!logged) return;
    try {
      const rows = await C.tally(cur.id); const el = md.el.querySelector('#elect-res'); if (!el) return;
      const tot = rows.reduce((t, r) => t + r.votes, 0);
      el.innerHTML = rows.length ? rows.slice(0, 8).map((r, i) => `<div class="er"><span>${['🥇', '🥈', '🥉'][i] || i + 1}</span><b>${esc(r.p.pseudo || '?')}${r.uid === N.user.uid ? ' (toi)' : ''}</b><i style="width:${Math.round(r.votes / tot * 100)}%"></i><em>${r.votes} voix</em></div>`).join('') : '<div class="empty">Aucun vote pour l\'instant : sois le premier !</div>';
    } catch (e) { const el = md.el.querySelector('#elect-res'); if (el) el.innerHTML = '<div class="empty">Résultats indisponibles</div>'; }
  }
  // Visite de la maison en 3D
  C.houseInfo = function (p) {
    const own = p.me ? [...new Set(S().owned.slice().sort((a, b) => b.price - a.price).map(x => x.item))].slice(0, 16) : ((p.city && p.city.own) || (p.topItem ? [p.topItem] : []));
    const deco = p.me ? (S().deco || []) : ((p.city && p.city.deco) || []).map(a => Array.isArray(a) ? { k: a[0], x: a[1], z: a[2], r: a[3] } : a);
    return { uid: p.uid, pseudo: p.pseudo || '?', avatar: p.me ? (TC.Style && TC.Style.mine().avatar) : p.avatar, look: p.me ? (TC.Style && TC.Style.mine().look) : p.look, tier: interiorTier(C.home(p)), homeName: C.home(p).name, nw: p.nw || 0, own, deco, me: !!p.me };
  };
  C.visit = function (p) {
    if (!TC.City3D || !TC.City3D.ready) return;
    if (TC.Walk && TC.Walk.on()) return TC.Walk.enterHouse(p);
    TC.City3D.enter(C.houseInfo(p));
    C.render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  function landmark(id) {
    const l = LANDMARKS.find(x => x.id === id); if (!l) return;
    if (TC.Hunt && TC.Hunt.dig(id)) return; // chasse au trésor en cours : on fouille le monument
    if (l.go === 'parc') { TC.toast(TC.season && TC.season.noel ? '🎄 Le sapin de la ville brille dans le parc !' : '🌳 Un banc, des pigeons… et tout le monde parle du Bitcoin.', 'info'); return; }
    if (l.go === 'mairie') return mairie();
    if (l.go === 'chest') { UI().shopType = 'chest'; TC.App.setTab('shop'); return; }
    TC.App.setTab(l.go);
  }

  document.addEventListener('click', e => {
    const t = e.target;
    const lot = t.closest('[data-lot]'); if (lot) return lotModal(lot.dataset.lot);
    const land = t.closest('[data-land]'); if (land) return landmark(land.dataset.land);
    const hm = t.closest('[data-home]'); if (hm) return C.buyHome(hm.dataset.home);
    const b = t.closest('[data-biz]'); if (b) return C.buy(b.dataset.biz);
    const s = t.closest('[data-bizsell]'); if (s) return C.sell(s.dataset.bizsell);
    if (t.closest('#city-collect')) { C.collect(); after(); }
  });
  if (N && N.on) N.on(ev => { if (ev === 'linked') { players = null; C.checkTakeovers(); C.checkElection(); } });
  setInterval(() => { if (!document.hidden) { C.checkTakeovers(); C.checkElection(); } }, 5 * 60000);
})();

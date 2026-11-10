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
  C.RATE = 0.02;        // recette par heure = 2 % du prix par niveau (rentabilisé en ~2 jours)
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
  C.tier = nw => { let t = C.TIERS[0], i = 0; C.TIERS.forEach((x, k) => { if ((nw || 0) >= x[0]) { t = x; i = k; } }); return { e: t[1], name: t[2], i }; };

  function st() { const c = S().city || (S().city = { biz: {}, last: Date.now(), earned: 0 }); c.biz = c.biz || {}; return c; }
  const lvl = id => (st().biz[id] || {}).lvl || 0;
  C.income = id => { const b = C.byId[id]; return b.price * C.RATE * lvl(id); };
  C.perHour = () => Object.keys(st().biz).reduce((t, id) => t + (C.byId[id] ? C.income(id) : 0), 0);
  C.pending = () => C.perHour() * Math.min(C.CAP_H, Math.max(0, Date.now() - st().last) / 3600000);
  C.full = () => C.perHour() > 0 && Date.now() - st().last >= C.CAP_H * 3600000;
  C.upCost = id => { const n = lvl(id); return n ? C.byId[id].price * C.UP * n : C.byId[id].price; };
  C.value = () => Object.entries(st().biz).reduce((t, [id, x]) => t + (x.inv || 0) * C.RESALE, 0);
  C.count = () => Object.keys(st().biz).length;

  // les commerces comptent dans le patrimoine
  const baseNW = G.netWorth;
  G.netWorth = () => baseNW() + (S().city ? C.value() : 0);

  function log(e) { S().log.unshift(Object.assign({ t: Date.now() }, e)); if (S().log.length > 300) S().log.length = 300; }

  C.collect = function (quiet) {
    const r = Math.floor(C.pending() * 100) / 100; const c = st();
    c.last = Date.now();
    if (r <= 0) return 0;
    S().cash += r; c.earned = (c.earned || 0) + r;
    log({ kind: 'biz', asset: 'Recette des commerces', eur: r });
    G.save(true);
    if (!quiet) { TC.sound('kaching'); TC.toast(`💰 +${fmt.eur(r)} encaissés dans tes commerces`, 'ok'); }
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
  C.pub = () => { const o = {}; Object.entries(st().biz).forEach(([id, x]) => { o[id] = x.lvl; }); return { biz: o }; };

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
      const list = snap.docs.map(d => N.prof(d.id, d.data())).filter(u => !u.bot && !(TC.Admin && TC.Admin.isBanned(u.uid)));
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
    const t = C.tier(p.nw);
    const biz = Object.entries((p.city && p.city.biz) || {}).filter(([id]) => C.byId[id]).sort((a, b) => C.byId[b[0]].price - C.byId[a[0]].price);
    const friend = !p.me && N && (N.friends || []).some(f => f.uid === p.uid);
    const mayor = i === 0 && (p.nw || 0) > 0;
    return `<button class="lot t${t.i} ${p.me ? 'me' : ''} ${friend ? 'fr' : ''} ${mayor ? 'mayor' : ''}" data-lot="${esc(p.uid)}">
      ${mayor ? '<i class="lot-crown">👑</i>' : ''}
      <span class="lot-av">${TC.Style ? TC.Style.avatar(p, 's') : esc(p.avatar || '👤')}</span>
      <span class="lot-b">${t.e}</span>
      <span class="lot-biz">${biz.slice(0, 4).map(([id]) => C.byId[id].e).join('')}${biz.length > 4 ? '<small>+' + (biz.length - 4) + '</small>' : ''}</span>
      <span class="lot-n">${p.me ? 'Toi' : esc(p.pseudo || '?')}${TC.Style ? TC.Style.badge(p) : ''}</span>
      <small class="lot-nw">${fmt.eur(p.nw || 0, true)}</small></button>`;
  }
  function landHtml(l) { return `<button class="lot land" data-land="${l.id}"><span class="lot-b">${l.e}</span><span class="lot-n">${l.name}</span></button>`; }

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

  function bizHtml() {
    const c = st(), ph = C.perHour(), pend = C.pending();
    const cards = C.BIZ.map(b => {
      const n = lvl(b.id), cost = C.upCost(b.id), can = S().cash >= cost;
      const inc = b.price * C.RATE * Math.max(1, n);
      const next = n && n < C.MAX_LVL ? b.price * C.RATE : 0;
      return `<div class="biz ${n ? 'own' : ''}"><span class="biz-e">${b.e}</span>
        <div class="biz-i"><b>${esc(b.name)}</b>${n ? `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(C.MAX_LVL - n)}</span>` : ''}
          <small>${n ? `Rapporte <b class="up">${fmt.eur(inc)}</b> / h` : `Prix ${fmt.eur(b.price)} · rapporte ${fmt.eur(inc)} / h`}</small></div>
        <div class="biz-a">${n < C.MAX_LVL ? `<button class="btn btn-sm ${n ? '' : 'btn-gold'}" data-biz="${b.id}" ${can ? '' : 'disabled'}>${n ? `⬆️ Niv. ${n + 1} · ${fmt.eur(cost, true)}` : `Acheter ${fmt.eur(cost, true)}`}</button>` : '<span class="muted">Niveau max ⭐</span>'}
          ${n ? `<button class="btn btn-sm btn-ghost" data-bizsell="${b.id}" title="Revendre">♻️</button>` : ''}</div>
        ${next ? `<em class="biz-next">+${fmt.eur(next)} / h au niveau suivant</em>` : ''}</div>`;
    }).join('');
    return `<div class="panel caisse ${C.full() ? 'full' : ''}"><div><h3>🏪 Mes commerces</h3>
        <p class="muted">${C.count() ? `${C.count()} commerce${C.count() > 1 ? 's' : ''} · <b class="up">${fmt.eur(ph)} / heure</b> · déjà gagné ${fmt.eur(c.earned || 0)}` : 'Achète ton premier commerce : il te rapporte de l\'argent chaque heure, même quand tu ne joues pas.'}</p></div>
      ${C.count() ? `<div class="caisse-r"><span>Dans la caisse</span><b id="city-pend">${fmt.eur(pend)}</b>${C.full() ? '<small class="down">Caisse pleine ! Encaisse vite</small>' : `<small>se remplit pendant ${C.CAP_H} h max</small>`}<button class="btn btn-gold" id="city-collect" ${pend < 0.01 ? 'disabled' : ''}>💰 Encaisser</button></div>` : ''}</div>
      <div class="biz-grid">${cards}</div>
      <p class="hint">Recette : 2 % du prix par heure et par niveau (rentabilisé en 2 jours environ). Revente à 70 % de ce que tu as investi. Les commerces comptent dans ton patrimoine.</p>`;
  }

  /* ---------- Vue 3D ---------- */
  let view2d = false; try { view2d = localStorage.getItem('tradcenter.city2d') === '1'; } catch (e) { }
  const nightNow = () => { const h = +new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }); return h < 7 || h >= 20; };
  function data3d() {
    const r = roster();
    const players = r.map((p, i) => {
      const top = p.topItem && TC.shopById[p.topItem];
      const isCar = top && top.type === 'car';
      return { uid: p.uid, pseudo: p.pseudo || '?', tier: C.tier(p.nw).i, biz: (p.city && p.city.biz) || {}, me: !!p.me, mayor: i === 0 && (p.nw || 0) > 0,
        friend: !p.me && N && (N.friends || []).some(f => f.uid === p.uid), plus: TC.Style ? TC.Style.isPlus(p) : false,
        car: isCar ? { color: parseInt(String(top.grad && top.grad[0] || '#d00000').replace('#', ''), 16) } : null };
    });
    return { players, landmarks: LANDMARKS, biz: C.byId, night: nightNow() };
  }
  function map3dHtml() {
    const r = roster(); const guest = !N || !N.enabled || !N.user || !N.profile;
    return `<div class="city3d" id="city3d-host"><div class="c3-load">🏗️ Construction de Trad City…</div>
      <div class="c3-top"><b>🗺️ Trad City</b><span>${r.length} habitant${r.length > 1 ? 's' : ''}</span></div>
      <div class="c3-hud"><button data-c3="me">📍 Moi</button><button data-c3="mayor">👑 Maire</button><button data-c3="night">${TC.City3D && TC.City3D.ready && TC.City3D.isNight() ? '☀️' : '🌙'}</button><button data-c3="2d">2D</button></div>
      <div class="c3-help">☝️ Glisse pour tourner · 🤏 pince pour zoomer · touche un bâtiment</div>
      ${guest ? '<p class="city-guest c3-guest">👥 Crée un compte (onglet Amis) pour voir les autres joueurs.</p>' : ''}</div>`;
  }
  if (TC.City3D) TC.City3D.onFail = () => { if (UI().tab === 'city') setTimeout(() => C.render(), 0); };
  function onPick3d(own) { if (own.uid) lotModal(own.uid); else if (own.land) landmark(own.land); }
  C.render = function () {
    const root = $('#tab-city'); if (!root) return;
    const use3d = !view2d && TC.City3D && TC.City3D.supported() && !TC.City3D.failed;
    const v3 = TC.City3D, why = v3 && (!v3.supported() ? 'WebGL désactivé sur ce navigateur' : v3.failed ? v3.error || 'erreur inconnue' : null);
    root.innerHTML = (use3d ? map3dHtml() : (why ? `<div class="nbox c3-err">⚠️ La 3D n'a pas pu s'afficher sur cet appareil : <b>${esc(why)}</b>. Voici la carte en 2D. <button class="btn btn-sm" data-c3="retry">🔄 Réessayer la 3D</button></div>` : '') + mapHtml().replace('<div class="city-sky">', '<div class="city-sky">' + (v3 && v3.supported() && !v3.failed ? '<button class="c3-back" data-c3="3d">🧊 Vue 3D</button>' : ''))) + bizHtml();
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
    if (a === 'mayor') { const m = roster()[0]; if (m) V3.focus(m.uid); return; }
    if (a === 'night') { V3.setNight(!V3.isNight()); C.render(); }
  });
  C.live = function () {
    const el = $('#city-pend'); if (el) el.textContent = fmt.eur(C.pending());
    const b = $('#city-collect'); if (b) b.disabled = C.pending() < 0.01;
    $$biz();
  };
  function $$biz() { document.querySelectorAll('[data-biz]').forEach(b => { b.disabled = S().cash < C.upCost(b.dataset.biz); }); }

  /* ---------- Fiche d'un terrain ---------- */
  function lotModal(uid) {
    const p = roster().find(x => x.uid === uid); if (!p) return;
    const i = roster().indexOf(p), t = C.tier(p.nw);
    const biz = Object.entries((p.city && p.city.biz) || {}).filter(([id]) => C.byId[id]).sort((a, b) => C.byId[b[0]].price - C.byId[a[0]].price);
    const top = p.topItem && TC.shopById[p.topItem];
    const friend = N && (N.friends || []).find(f => f.uid === p.uid);
    const asked = N && (N.outgoing || []).some(r => r.to === p.uid);
    const md = TC.modal(`<div class="lot-card"><div class="lot-big">${t.e}</div>
        ${TC.Style ? TC.Style.avatar(p, 'xl') : ''}
        <h2>${p.me ? 'Ton terrain' : esc(p.pseudo || '?')} ${TC.Style ? TC.Style.badge(p) : ''}</h2>
        <p class="muted">${i === 0 ? '👑 Maire de Trad City · ' : ''}${esc(t.name)} · n°${i + 1} de la ville</p>
        <div class="kv"><span>Patrimoine</span><b>${fmt.eur(p.nw || 0)}</b><span>Rang</span><b>${esc(p.rank || G.rank(p.nw || 0).r[1])}</b>
          ${top ? `<span>Plus bel objet</span><b>${top.emoji} ${esc(top.brand + ' ' + top.model)}</b>` : ''}${p.items ? `<span>Objets</span><b>${p.items}</b>` : ''}</div>
        <h4>🏪 Commerces</h4>${biz.length ? `<div class="lot-bizl">${biz.map(([id, l]) => `<span>${C.byId[id].e} ${esc(C.byId[id].name)} <b>${'★'.repeat(l)}</b></span>`).join('')}</div>` : '<p class="muted">Aucun commerce pour l\'instant.</p>'}
        <div class="modal-actions">${p.me ? '<button class="btn btn-gold" data-close>OK</button>'
          : friend ? `<button class="btn btn-gold" data-citysend="${esc(p.uid)}">💸 Lui envoyer de l'argent</button>`
          : N && N.user ? `<button class="btn btn-gold" data-cityadd="${esc(p.pseudo)}" ${asked ? 'disabled' : ''}>${asked ? 'Demande envoyée' : '➕ Ajouter en ami'}</button>` : ''}</div></div>`, { cls: 'lot-modal' });
    const s = md.el.querySelector('[data-citysend]');
    if (s) s.onclick = () => { md.close(); if (TC.Social && TC.Social.sendModal) TC.Social.sendModal(friend); };
    const a = md.el.querySelector('[data-cityadd]');
    if (a) a.onclick = async () => {
      a.disabled = true;
      try { const r = await N.addFriend(a.dataset.cityadd); TC.toast(r === 'accepted' ? 'Vous êtes maintenant amis 🤝' : 'Demande d\'ami envoyée ✉️', 'ok'); a.textContent = 'Demande envoyée'; }
      catch (e) { a.disabled = false; TC.toast(N.errMsg(e), 'bad'); }
    };
  }
  function landmark(id) {
    const l = LANDMARKS.find(x => x.id === id); if (!l) return;
    if (l.go === 'parc') { TC.toast(TC.season && TC.season.noel ? '🎄 Le sapin de la ville brille dans le parc !' : '🌳 Un banc, des pigeons… et tout le monde parle du Bitcoin.', 'info'); return; }
    if (l.go === 'mairie') {
      const r = roster(), m = r[0];
      TC.modal(`<div class="lot-card"><div class="lot-big">🏤</div><h2>Mairie de Trad City</h2>
        <p>${m ? `Le Maire est <b>${m.me ? 'toi' : esc(m.pseudo || '?')}</b> 👑, le plus riche de la ville avec <b>${fmt.eur(m.nw || 0)}</b>.` : 'Pas encore de maire.'}</p>
        <p class="muted">Deviens le plus riche pour prendre sa place. Et chaque lundi, le n°1 de la semaine gagne 500 € (onglet Amis).</p>
        <div class="modal-actions"><button class="btn btn-gold" data-close>OK</button></div></div>`, { cls: 'lot-modal' });
      return;
    }
    if (l.go === 'chest') { UI().shopType = 'chest'; TC.App.setTab('shop'); return; }
    TC.App.setTab(l.go);
  }

  document.addEventListener('click', e => {
    const t = e.target;
    const lot = t.closest('[data-lot]'); if (lot) return lotModal(lot.dataset.lot);
    const land = t.closest('[data-land]'); if (land) return landmark(land.dataset.land);
    const b = t.closest('[data-biz]'); if (b) return C.buy(b.dataset.biz);
    const s = t.closest('[data-bizsell]'); if (s) return C.sell(s.dataset.bizsell);
    if (t.closest('#city-collect')) { C.collect(); after(); }
  });
  if (N && N.on) N.on(ev => { if (ev === 'linked') players = null; });
})();

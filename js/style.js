/* Trad Center — style de l'avatar (articles de marque) + abonnement Trad Center+ (badge vérifié ✓)
 * Tout se paie en argent du jeu. Les articles sont cosmétiques (non revendables) et visibles par les autres joueurs.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, S = () => G.state;
  const ST = TC.Style = {};
  ST.SLOTS = {
    body:   { label: 'Avatar',    icon: '🧑' },
    face:   { label: 'Emoji',     icon: '😎' },
    hat:    { label: 'Tête',      icon: '🧢' },
    eyes:   { label: 'Lunettes',  icon: '🕶️' },
    neck:   { label: 'Cou',       icon: '🔗' },
    outfit: { label: 'Tenue',     icon: '🧥' },
    wrist:  { label: 'Poignet',   icon: '⌚' },
    feet:   { label: 'Pieds',     icon: '👟' },
    frame:  { label: 'Cadre',     icon: '🖼️' },
    icon:   { label: 'Icône',     icon: '📱' },
    creator: { label: 'Créateur', icon: '👑', creator: true },
  };
  /* ---------- Créateur du jeu : badge vérifié multicolore + bonus (réservé au compte TC.ADMIN_UID) ---------- */
  const isCreatorUid = uid => !!uid && uid === TC.ADMIN_UID;
  ST.isCreator = () => !!(TC.Net && TC.Net.user && isCreatorUid(TC.Net.user.uid));
  ST.CBADGES = [['arcenciel', '🌈 Arc-en-ciel'], ['or', '🥇 Or'], ['diamant', '💎 Diamant'], ['neon', '💜 Néon'], ['feu', '🔥 Feu'], ['galaxie', '🌌 Galaxie']];
  /* Argent illimité : c'est l'état normal du compte du créateur (1 000 milliards, rechargés tout seuls).
   * Il reste libre de donner de l'argent à qui il veut. Il est hors concours partout. */
  ST.INF = 1e12;
  ST.infinite = () => ST.isCreator();
  function refill() {
    if (!ST.infinite() || S().cash >= ST.INF) return;
    const d = ST.INF - S().cash; S().cash = ST.INF; if (TC.Weekly) TC.Weekly.flow(d); // la recharge ne compte pas comme un gain
  }
  setInterval(refill, 1500); G.on(() => refill()); if (TC.Net && TC.Net.on) TC.Net.on(t => { if (t === 'linked') { refill(); after(); } });
  ST.CREATOR_PERKS = [
    ['✓', 'Badge vérifié multicolore', 'Animé, à côté de ton pseudo partout dans le jeu, avec la mention CRÉATEUR. Personne d\'autre ne peut l\'avoir.'],
    ['👑', 'Halo du créateur', 'Cadre exclusif arc-en-ciel animé autour de ton avatar.'],
    ['♾️', 'Trad Center+ à vie', 'Tous les avantages du vérifié, sans abonnement ni renouvellement.'],
    ['♾️', 'Argent illimité', '1 000 milliards d\'euros qui se rechargent tout seuls. Tu peux en donner à qui tu veux.'],
    ['🏁', 'Hors concours partout', 'Classement mondial, championnat de la semaine, course de Noël, élection du Maire, clans : les prix et les places reviennent aux joueurs.'],
    ['🎁', 'Bonus quotidien ×3', 'Au lieu de ×1,5 pour les membres Trad Center+.'],
    ['🛍️', 'Tout le style gratuit', 'Casquettes, lunettes, chaînes, tenues, cadres : tout est offert.'],
    ['🤖', 'Bot de trading offert', 'La licence du bot est gratuite pour toi.'],
    ['🏷️', 'Trad Occaz sans frais', 'Pas de Protection acheteurs sur tes achats d\'occasion.'],
  ];
  ST.ITEMS = [
    { id: 'h_newera', slot: 'hat', brand: 'New Era', name: 'Casquette 59FIFTY', price: 45, e: '🧢' },
    { id: 'h_lacoste', slot: 'hat', brand: 'Lacoste', name: 'Bob', price: 70, e: '👒' },
    { id: 'h_lv', slot: 'hat', brand: 'Louis Vuitton', name: 'Haut-de-forme', price: 1200, e: '🎩' },
    { id: 'h_crown', slot: 'hat', brand: 'Trad Center', name: 'Couronne royale', price: 250000, e: '👑' },
    { id: 'e_rayban', slot: 'eyes', brand: 'Ray-Ban', name: 'Wayfarer', price: 170, e: '🕶️' },
    { id: 'e_oakley', slot: 'eyes', brand: 'Oakley', name: 'Masque de ski', price: 220, e: '🥽' },
    { id: 'e_cartier', slot: 'eyes', brand: 'Cartier', name: 'Lunettes Santos', price: 1800, e: '👓' },
    { id: 'n_burberry', slot: 'neck', brand: 'Burberry', name: 'Écharpe', price: 480, e: '🧣' },
    { id: 'n_gold', slot: 'neck', brand: 'Joaillier', name: 'Chaîne en or', price: 3000, e: '🔗' },
    { id: 'n_tiffany', slot: 'neck', brand: 'Tiffany & Co.', name: 'Collier diamants', price: 25000, e: '💎' },
    { id: 'o_nike', slot: 'outfit', brand: 'Nike', name: 'Jogging rouge', price: 90, e: '🔴', ring: '#e5352b' },
    { id: 'o_lacoste', slot: 'outfit', brand: 'Lacoste', name: 'Survêtement vert', price: 250, e: '🟢', ring: '#1f9a55' },
    { id: 'o_moncler', slot: 'outfit', brand: 'Moncler', name: 'Doudoune noire', price: 1400, e: '⚫', ring: '#15151c' },
    { id: 'o_dior', slot: 'outfit', brand: 'Dior', name: 'Costume', price: 4500, e: '🟣', ring: '#3b2a5c' },
    { id: 'w_casio', slot: 'wrist', brand: 'Casio', name: 'G-Shock', price: 120, e: '⌚' },
    { id: 'w_rolex', slot: 'wrist', brand: 'Rolex', name: 'Daytona', price: 35000, e: '⌚', gold: true },
    { id: 'f_af1', slot: 'feet', brand: 'Nike', name: 'Air Force 1', price: 120, e: '👟' },
    { id: 'f_jordan', slot: 'feet', brand: 'Jordan', name: 'Air Jordan 1', price: 180, e: '👟', red: true },
    { id: 'f_louboutin', slot: 'feet', brand: 'Christian Louboutin', name: 'Mocassins', price: 900, e: '👞' },
    { id: 'fr_neon', slot: 'frame', brand: 'Cadre', name: 'Néon Vice', price: 2500, e: '🌴', fr: 'neon' },
    { id: 'fr_gold', slot: 'frame', brand: 'Cadre', name: 'Or massif', price: 5000, e: '🥇', fr: 'gold' },
    { id: 'fr_rainbow', slot: 'frame', brand: 'Cadre', name: 'Arc-en-ciel', price: 10000, e: '🌈', fr: 'rainbow' },
    { id: 'fr_diamond', slot: 'frame', brand: 'Cadre', name: 'Diamant', price: 50000, e: '💠', fr: 'diamond' },
    { id: 'fr_plus', slot: 'frame', brand: 'Trad Center+', name: 'Cadre vérifié', price: 0, e: '✓', fr: 'plus', plus: true },
    { id: 'fr_creator', slot: 'frame', brand: 'Créateur', name: 'Halo du créateur', price: 0, e: '👑', fr: 'creator', creator: true },
  ];
  ST.byId = {}; ST.ITEMS.forEach(i => { ST.byId[i.id] = i; });
  ST.FACES = ['🦁', '🐺', '🦊', '🐯', '🦈', '🐋', '🐉', '🦅', '🐂', '🐎', '👑', '💎', '🚀', '🔥', '😎', '🤑', '🐸', '🐶', '🐱', '🦄', '🤠', '🥷', '🧑‍🚀', '🤖', '👽', '🐵', '🐼', '🐧'];
  ST.PLUS_PRICE = 999; ST.PLUS_DAYS = 30;

  function st() { const s = S().style || (S().style = { owned: {}, look: {} }); s.owned = s.owned || {}; s.look = s.look || {}; return s; }
  ST.isPlus = p => !!(p && ((p.plusUntil && p.plusUntil > Date.now()) || isCreatorUid(p.uid)));
  ST.mine = () => ({ uid: TC.Net && TC.Net.user ? TC.Net.user.uid : null, avatar: (TC.Net && TC.Net.profile && TC.Net.profile.avatar) || S().face || '😎', look: st().look, plusUntil: (S().plus || {}).until || 0 });

  /* ---------- Rendu d'un avatar (utilisé partout) ---------- */
  ST.avatar = function (p, size = 's') {
    p = p || {}; const look = p.look || {};
    const it = k => look[k] && ST.byId[look[k]];
    const fr = it('frame'), out = it('outfit');
    const plusOk = fr && fr.creator ? isCreatorUid(p.uid) : fr && fr.plus ? ST.isPlus(p) : true;
    if (look.av && TC.Avatar) return `<span class="av av-${size} av-art ${fr && plusOk ? 'fr-' + fr.fr : ''}">${TC.Avatar.svg(look.av, look)}</span>`;
    const parts = [];
    if (it('hat')) parts.push(`<i class="av-hat">${it('hat').e}</i>`);
    if (it('eyes')) parts.push(`<i class="av-eyes">${it('eyes').e}</i>`);
    if (it('neck')) parts.push(`<i class="av-neck">${it('neck').e}</i>`);
    if (size === 'xl') { if (it('wrist')) parts.push(`<i class="av-wrist ${it('wrist').gold ? 'gold' : ''}">${it('wrist').e}</i>`); if (it('feet')) parts.push(`<i class="av-feet ${it('feet').red ? 'red' : ''}">${it('feet').e}</i>`); }
    return `<span class="av av-${size} ${fr && plusOk ? 'fr-' + fr.fr : ''}" style="${out ? '--ring:' + out.ring : ''}"><span class="av-b">${esc(p.avatar || '👤')}</span>${parts.join('')}</span>`;
  };
  ST.badge = p => (p && isCreatorUid(p.uid) ? `<span class="vbadge cr cr-${esc(((p.look || {}).cb) || 'arcenciel')}" title="Créateur de Trad Center">✓</span><span class="crtag">CRÉATEUR</span>`
    : ST.isPlus(p) ? '<span class="vbadge" title="Membre Trad Center+ (vérifié)">✓</span>' + (p && p.uid && p.uid === TC.CLAUDE_UID ? '<span class="aitag" title="Claude, l\'assistant IA du créateur">IA</span>' : '') : '') + (p && p.bot ? '<span class="botbadge" title="Robot officiel du jeu">BOT</span>' : '');

  /* ---------- Achats ---------- */
  function spend(eur, label) { S().cash -= eur; if (TC.Weekly) TC.Weekly.flow(-eur); S().log.unshift({ t: Date.now(), kind: 'item', eur, asset: label }); G.save(true); }
  ST.buy = function (id) {
    const i = ST.byId[id]; if (!i || i.plus || i.creator || st().owned[id]) return;
    if (ST.isCreator()) { st().owned[id] = Date.now(); st().look[i.slot] = id; G.save(true); TC.sound('kaching'); TC.toast(`👑 ${esc(i.brand)} ${esc(i.name)} offert au créateur et porté !`, 'ok'); return after(); }
    if (S().cash < i.price) return TC.toast(`Il te manque ${fmt.eur(i.price - S().cash)}`, 'bad');
    spend(i.price, `${i.brand} ${i.name}`); st().owned[id] = Date.now(); st().look[i.slot] = id; G.save(true);
    TC.sound('kaching'); TC.toast(`🛍️ ${esc(i.brand)} ${esc(i.name)} achetée et portée !`, 'ok'); after();
  };
  ST.equip = function (id) {
    const i = ST.byId[id]; if (!i) return;
    if (i.creator ? !ST.isCreator() : i.plus ? !ST.isPlus(ST.mine()) : !st().owned[id] && !ST.isCreator()) return;
    st().look[i.slot] = st().look[i.slot] === id ? null : id; G.save(true); after();
  };
  function after() { if (TC.App) TC.App.after(); if (TC.Net && TC.Net.queueSync) TC.Net.queueSync(); }

  /* ---------- Abonnement Trad Center+ ---------- */
  ST.subscribe = function () {
    const p = S().plus || (S().plus = { until: 0, auto: true });
    if ((p.until || 0) > Date.now()) return; // déjà abonné (un badge offert n'empêche pas de s'abonner)
    if (S().cash < ST.PLUS_PRICE) return TC.toast(`Il te faut ${fmt.eur(ST.PLUS_PRICE)} de cash`, 'bad');
    spend(ST.PLUS_PRICE, 'Abonnement Trad Center+ (1 mois)');
    p.until = Date.now() + ST.PLUS_DAYS * 86400000; p.auto = true; st().look.frame = 'fr_plus'; G.save(true);
    TC.sound('kaching'); TC.confetti(160);
    TC.modal(`<div class="center"><div class="big-emoji"><span class="vbadge xl">✓</span></div><h2>Bienvenue dans Trad Center+</h2><p>Ton badge vérifié ✓ s'affiche maintenant à côté de ton pseudo, partout.</p><p>Renouvellement automatique dans ${ST.PLUS_DAYS} jours (${fmt.eur(ST.PLUS_PRICE)} de cash).</p><div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>Trop stylé ✓</button></div></div>`);
    after();
  };
  ST.toggleAuto = function () { const p = S().plus || (S().plus = { until: 0, auto: true }); p.auto = !p.auto; G.save(true); };
  // renouvellement mensuel automatique
  function renew() {
    const p = S().plus; if (!p || !p.until || p.until > Date.now() || p.ended) return;
    const cost = ST.PLUS_PRICE + 100 * (p.sponsors || []).length; // + 100 € par ami parrainé
    if (p.auto && S().cash >= cost) {
      spend(cost, 'Renouvellement Trad Center+' + ((p.sponsors || []).length ? ` (+${(p.sponsors || []).length} parrainage(s))` : ''));
      p.until = Math.max(p.until, Date.now() - 86400000) + ST.PLUS_DAYS * 86400000; G.save(true);
      TC.toast(`✓ Trad Center+ renouvelé pour ${ST.PLUS_DAYS} jours (−${fmt.eur(cost)})`, 'info', 6000);
    } else {
      p.ended = Date.now(); p.sponsors = []; if (st().look.frame === 'fr_plus') st().look.frame = null; G.save(true);
      TC.toast(p.auto ? `Trad Center+ terminé : il te manquait ${fmt.eur(cost - S().cash)} pour le renouveler.` : 'Ton abonnement Trad Center+ est terminé.', 'bad', 7000);
    }
    if (TC.PlusGift) TC.PlusGift.publish();
    after();
  }
  // le bonus quotidien est augmenté de 50 % pour les membres
  const baseClaim = G.claimBonus;
  G.claimBonus = function () {
    const plus = ST.isPlus(ST.mine()), base = G.BONUS;
    if (plus) G.BONUS = Math.round(base * (ST.isCreator() ? 3 : 1.5));
    try { return baseClaim.apply(G, arguments); } finally { G.BONUS = base; }
  };

  /* ---------- Cabine d'essayage ---------- */
  let tab = 'body';
  ST.open = function (slot) {
    if (slot) tab = slot;
    const prevCard = document.querySelector('#modal.open .modal-card.wide'), keepTop = prevCard ? prevCard.scrollTop : 0;
    const me = ST.mine(), plus = ST.isPlus(me), p = S().plus || {};
    if (tab === 'creator' && !ST.isCreator()) tab = 'body';
    const items = tab === 'face' || tab === 'body' || tab === 'creator' || tab === 'icon' ? null : ST.ITEMS.filter(i => i.slot === tab && (!i.creator || ST.isCreator()));
    const cb = st().look.cb || 'arcenciel';
    const grid = tab === 'icon' ? (TC.AppIcon ? TC.AppIcon.panel() : '') : tab === 'creator' ? `<div class="cr-tab"><div class="cr-hero"><span class="vbadge cr cr-${cb} xl">✓</span><div><b>Créateur de Trad Center</b><small>Ton badge est unique : il ne peut s'afficher que sur ton compte.</small></div></div>
        <h4>Couleur de ton badge</h4><div class="cr-badges">${ST.CBADGES.map(([k, l]) => `<button data-cb="${k}" class="${cb === k ? 'on' : ''}"><span class="vbadge cr cr-${k}">✓</span>${l}</button>`).join('')}</div>
        <div class="cr-inf"><b>♾️ Argent illimité</b><small>Toujours actif : 1 000 milliards d'euros, rechargés tout seuls. Tu peux en donner à qui tu veux.</small></div>
        <button class="btn ${st().look.frame === 'fr_creator' ? 'btn-ghost' : 'btn-gold'}" data-eq="fr_creator">${st().look.frame === 'fr_creator' ? 'Retirer le halo du créateur' : '👑 Porter le halo du créateur'}</button>
        <h4>Tes bonus</h4><div class="news">${ST.CREATOR_PERKS.map(([i, t, d]) => `<div class="news-i"><span>${i === '✓' ? `<span class="vbadge cr cr-${cb}">✓</span>` : i}</span><div><b>${t}</b><small>${d}</small></div></div>`).join('')}</div></div>`
      : tab === 'body' ? (TC.Avatar ? TC.Avatar.editor(st().look.av, st().look) : '') : tab === 'face'
      ? `<div class="avatars">${ST.FACES.map(f => `<button class="avatar big ${me.avatar === f ? 'on' : ''}" data-face="${f}">${f}</button>`).join('')}</div><p class="hint">Le visage est gratuit.</p>`
      : `<div class="st-grid">${items.map(i => {
          const own = i.creator ? ST.isCreator() : i.plus ? plus : !!st().owned[i.id] || ST.isCreator(), worn = st().look[i.slot] === i.id;
          return `<div class="st-item ${worn ? 'worn' : ''} ${i.plus ? 'plus' : ''}"><span class="st-e" style="${i.ring ? 'color:' + i.ring : ''}">${i.e}</span><small>${esc(i.brand)}</small><b>${esc(i.name)}</b>
            ${i.plus ? (plus ? `<button class="btn btn-sm ${worn ? 'btn-ghost' : 'btn-gold'}" data-eq="${i.id}">${worn ? 'Retirer' : 'Porter'}</button>` : `<button class="btn btn-sm" data-plusgo="1">Réservé Trad Center+</button>`)
              : own ? `<button class="btn btn-sm ${worn ? 'btn-ghost' : 'btn-gold'}" data-eq="${i.id}">${worn ? 'Retirer' : 'Porter'}</button>`
              : `<button class="btn btn-sm ${S().cash >= i.price ? 'btn-gold' : ''}" data-buy="${i.id}" ${S().cash >= i.price ? '' : 'disabled'}>${fmt.eur(i.price)}</button>`}</div>`;
        }).join('')}</div>`;
    const md = TC.modal(`<h2>🎨 Mon style</h2>
      <div class="st-preview">${ST.avatar(me, 'xl')}<div><b class="st-name">${esc((TC.Net && TC.Net.profile && TC.Net.profile.pseudo) || 'Toi')} ${ST.badge(me)}</b><small>Cash : ${fmt.eur(S().cash)}</small>
        <div class="st-plus">${plus && !((p.until || 0) > Date.now()) ? `<span class="vbadge">✓</span> Vérifié offert${S().plusGift && S().plusGift.from ? ' par ' + esc(S().plusGift.from) : ''} jusqu'au ${new Date(me.plusUntil).toLocaleDateString('fr-FR')}`
          : plus ? `<span class="vbadge">✓</span> Trad Center+ jusqu'au ${new Date(p.until).toLocaleDateString('fr-FR')} · <label><input type="checkbox" id="st-auto" ${p.auto !== false ? 'checked' : ''}> renouvellement auto</label> <button class="btn btn-sm btn-plus" data-pgopen>🎁 Offrir le vérifié</button>`
          : `<button class="btn btn-sm btn-plus" data-plusgo="1"><span class="vbadge">✓</span> Devenir vérifié : ${fmt.eur(ST.PLUS_PRICE)}/mois</button>`}</div></div></div>
      <div class="seg st-tabs">${Object.entries(ST.SLOTS).filter(([, v]) => !v.creator || ST.isCreator()).map(([k, v]) => `<button data-stab="${k}" class="${k === tab ? 'active' : ''}">${v.icon}<span>${v.label}</span></button>`).join('')}</div>
      ${grid}
      <p class="hint">Articles cosmétiques (non revendables), payés avec l'argent du jeu et visibles par tes amis dans les classements.</p>`, { cls: 'wide' });
    const card = md.el.querySelector('.modal-card'); if (keepTop) card.scrollTop = keepTop;
    const setAv = v => { st().look.av = v; G.save(true); after(); ST.open(); };
    card.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.avcolor; if (k) setAv(Object.assign({}, st().look.av || TC.Avatar.random(), { [k]: e.target.value })); });
    card.addEventListener('click', async e => {
      const b = e.target.closest('button, input'); if (!b) return;
      if (b.dataset.cb) { st().look.cb = b.dataset.cb; G.save(true); after(); return ST.open(); }
      if (b.dataset.avcat) { TC.Avatar.setCat(b.dataset.avcat); return ST.open(); }
      if (b.dataset.avk) return setAv(Object.assign({}, st().look.av || {}, { [b.dataset.avk]: b.dataset.avv }));
      if (b.dataset.avrand !== undefined) return setAv(TC.Avatar.random());
      if (b.dataset.avemoji !== undefined) return setAv(null);
      if (b.dataset.stab) { tab = b.dataset.stab; return ST.open(); }
      if (b.dataset.buy) { ST.buy(b.dataset.buy); return ST.open(); }
      if (b.dataset.eq) { ST.equip(b.dataset.eq); return ST.open(); }
      if (b.dataset.face) {
        S().face = b.dataset.face; st().look.av = null;
        if (TC.Net && TC.Net.profile) { try { await TC.Net.setAvatar(b.dataset.face); } catch (er) { } }
        G.save(true); after(); return ST.open();
      }
      if (b.dataset.plusgo) return ST.plusInfo();
      if (b.id === 'st-auto') { ST.toggleAuto(); }
    });
  };
  ST.plusInfo = function () {
    const plus = ((S().plus || {}).until || 0) > Date.now(); // abonnement personnel (pas un badge offert)
    const md = TC.modal(`<div class="center"><div class="big-emoji"><span class="vbadge xl">✓</span></div><h2>Trad Center+</h2>
      <p><b>${fmt.eur(ST.PLUS_PRICE)} / mois</b> (argent du jeu), renouvelé automatiquement si tu as assez de cash. Tu peux l'arrêter quand tu veux.</p></div>
      <div class="news">
        <div class="news-i"><span><span class="vbadge">✓</span></span><div><b>Badge vérifié</b><small>À côté de ton pseudo : amis, classements, demandes d'ami.</small></div></div>
        <div class="news-i"><span>🖼️</span><div><b>Cadre exclusif « vérifié »</b><small>Un halo bleu animé autour de ton avatar.</small></div></div>
        <div class="news-i"><span>📱</span><div><b>Logo de l'écran d'accueil au choix</b><small>Or, Diamant, Néon, Arc-en-ciel, Bitcoin… (Mon style → 📱 Icône).</small></div></div>
        <div class="news-i"><span>🎁</span><div><b>Bonus quotidien +50 %</b><small>15 € par jour au lieu de 10 € (30 € en décembre).</small></div></div>
        <div class="news-i"><span>🤝</span><div><b>Offre le vérifié à tes amis</b><small>1 semaine offerte à 3 amis chaque mois, ou parraine un ami pour 100 € de plus par mois.</small></div></div>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Plus tard</button>${plus ? '<button class="btn btn-plus" data-pgopen>🎁 Offrir le vérifié</button>' : `<button class="btn btn-plus" id="plus-go" ${S().cash >= ST.PLUS_PRICE ? '' : 'disabled'}>${S().cash >= ST.PLUS_PRICE ? 'S\'abonner' : 'Il te faut ' + fmt.eur(ST.PLUS_PRICE)}</button>`}</div>`);
    const go = md.el.querySelector('#plus-go'); if (go) go.onclick = () => ST.subscribe();
  };

  document.addEventListener('click', e => { if (e.target.closest('[data-style]')) ST.open(e.target.closest('[data-style]').dataset.style || null); });
  setTimeout(renew, 3000); setInterval(renew, 10 * 60000);
})();

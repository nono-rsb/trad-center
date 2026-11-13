/* Trad Center — 🚶 balade dans Trad City (à taille humaine)
 * Ordinateur : ZQSD (ou WASD / flèches) marcher · Maj courir · souris regarder (clic dans la ville) · V vue 1re / 3e personne
 *   E entrer / ouvrir la porte · F monter / descendre d'un véhicule · G garage · B déco (chez soi) · X ranger un objet · I sac · R infos du terrain.
 * Téléphone : joystick, glisser pour regarder, boutons à l'écran.
 * Véhicules : ceux qu'on a achetés dans le jeu (même silhouette et couleur que le modèle), à faire venir depuis le garage.
 * Maisons : on entre par la porte (qu'on ouvre et ferme), on se promène dedans, on y pose des meubles achetés (déco).
 * Attractions payantes : grande roue (4 €), stand de tir (3 €, pistolet de foire, cibles). Trad Market : boissons et snacks.
 * Paiement : l'ordinateur affiche un QR code, on le scanne avec son VRAI téléphone (Trad Banque → 📷 Payer) connecté au même compte.
 * Tout est en argent du jeu.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const W = TC.Walk = {};
  const V = () => TC.City3D;
  const r2 = v => Math.round(v * 100) / 100;
  const touch = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };

  W.PRODUCTS = [
    { id: 'rush', e: '⚡', name: 'Bull Rush', sub: 'boisson énergisante 25 cl', p: 1.9, en: 15, drink: 1, boost: 1 },
    { id: 'eau', e: '💧', name: 'Eau minérale', sub: 'bouteille 50 cl', p: 0.8, en: 5, drink: 1 },
    { id: 'cola', e: '🥤', name: 'Trad Cola', sub: 'canette 33 cl', p: 1.4, en: 8, drink: 1 },
    { id: 'chips', e: '🥔', name: 'Chips Krunch', sub: 'sachet 135 g', p: 1.7, en: 12 },
    { id: 'choco', e: '🍫', name: 'Barre Chocobar', sub: 'chocolat caramel', p: 1.1, en: 10 },
    { id: 'bonbons', e: '🍬', name: 'Bonbons Mix', sub: 'sachet 200 g', p: 2.3, en: 10 },
    { id: 'croissant', e: '🥐', name: 'Croissant', sub: 'pur beurre', p: 1.0, en: 15 },
    { id: 'pizza', e: '🍕', name: 'Part de pizza', sub: 'sortie du four', p: 2.9, en: 30 },
    { id: 'sandwich', e: '🥪', name: 'Sandwich jambon-beurre', sub: 'baguette fraîche', p: 3.5, en: 40 },
    { id: 'glace', e: '🍦', name: 'Cornet vanille', sub: 'glace', p: 2.2, en: 12 },
  ];
  const byId = Object.fromEntries(W.PRODUCTS.map(p => [p.id, p]));
  W.DECO = [
    { k: 'canape', e: '🛋️', name: 'Canapé 3 places', p: 450 }, { k: 'fauteuil', e: '💺', name: 'Fauteuil club', p: 220 },
    { k: 'table', e: '🪵', name: 'Table en chêne', p: 260 }, { k: 'chaise', e: '🪑', name: 'Chaise', p: 70 },
    { k: 'lit', e: '🛏️', name: 'Lit king size', p: 900 }, { k: 'tele', e: '📺', name: 'Télé géante', p: 1200 },
    { k: 'arcade', e: '🕹️', name: 'Borne d\'arcade', p: 1500 }, { k: 'frigo', e: '🧊', name: 'Frigo américain', p: 800 },
    { k: 'enceinte', e: '🔊', name: 'Enceinte colonne', p: 350 }, { k: 'biblio', e: '📚', name: 'Bibliothèque', p: 420 },
    { k: 'lampe', e: '💡', name: 'Lampadaire', p: 90 }, { k: 'plante', e: '🪴', name: 'Plante', p: 45 },
    { k: 'tapis', e: '🟥', name: 'Tapis persan', p: 300 }, { k: 'sapin', e: '🎄', name: 'Sapin', p: 120 },
    { k: 'peluche', e: '🧸', name: 'Peluche géante', p: 0, prize: 1 },
  ];
  const decoById = Object.fromEntries(W.DECO.map(d => [d.k, d]));
  const st = () => { const s = S(); if (!s.walk || typeof s.walk !== 'object') s.walk = { en: 100, bag: {}, boost: 0 }; if (!s.walk.bag) s.walk.bag = {}; if (!s.walk.inv) s.walk.inv = {}; return s.walk; };
  const NAMES = { market: 'le Trad Market 🛒', roue: 'la grande roue 🎡', tir: 'le stand de tir 🎯', bourse: 'la Bourse', conc: 'la Concession', agence: 'l\'Agence immo', bijou: 'la Bijouterie', coffre: 'le Coffre', labo: 'le Labo du bot', mairie: 'la Mairie', parc: 'le Parc' };
  const myUid = () => N && N.user ? N.user.uid : 'me';

  let on = false, tickT = null, saveAt = 0, warned = 0;
  W.on = () => on;

  /* ---------- Interface ---------- */
  W.hud = function () {
    const w = st();
    return `<div class="wk-hud">
      <div class="wk-top"><b>🚶 Trad City</b><span id="wk-cash">${fmt.eur(S().cash)}</span><span class="wk-en" id="wk-en"><i style="width:${Math.max(0, w.en)}%"></i><em>⚡ ${Math.round(w.en)}</em></span><span class="wk-gap"></span>
        <button data-wkk="KeyV" title="Vue 1re / 3e personne (V)">👁️ Vue</button><button data-wkk="KeyG" title="Garage (G)">🔑 Garage</button><button data-wkk="KeyB" id="wk-deco" hidden title="Déco (B)">🛋️ Déco</button><button data-wkk="KeyI" title="Sac (I)">🎒 Sac</button><button data-wk="exit">✕ Quitter</button></div>
      <div class="wk-cross" id="wk-cross" hidden></div>
      <div class="wk-speed" id="wk-speed" hidden><b>0</b><small>km/h</small></div>
      <div class="wk-game" id="wk-game" hidden></div>
      <div class="wk-prompts" id="wk-prompts"></div>
      <div class="wk-help" id="wk-help">${touch() ? '🕹️ Joystick pour marcher · glisse l\'écran pour regarder · touche les boutons qui apparaissent' : '<b>ZQSD</b> marcher · <b>Maj</b> courir · <b>clique</b> puis souris pour regarder · <b>V</b> vue 1re personne · <b>E</b> entrer · <b>F</b> véhicule · <b>G</b> garage · <b>I</b> sac · <b>Échap</b> libère la souris'}</div>
      <div class="wk-joy" id="wk-joy"><i></i></div><button class="wk-run" data-wk="run">🏃</button><button class="wk-fire" data-wk="fire" hidden>🔫</button>
    </div>`;
  };
  function avatarOpt() {
    const uid = N && N.user ? N.user.uid : null, mine = TC.Style ? TC.Style.mine() : {};
    const cars = [...new Set(S().owned.map(o => o.item))].map(id => TC.shopById[id]).filter(i => i && i.type === 'car').sort((a, b) => b.price - a.price);
    return { uid, avatar: mine.avatar || (N && N.profile && N.profile.avatar), look: mine.look, vehicle: cars[0] || null };
  }
  W.start = function () {
    const v = V(); if (!v || !v.ready || v.failed) return TC.toast('La ville 3D doit être affichée pour se balader.', 'bad');
    if (v.insideOf && v.insideOf()) v.exit(true);
    on = true; document.body.classList.add('wk-on');
    if (TC.City) TC.City.render();
    v.walk(true, avatarOpt());
    v.onBump = sp => { sfx('bump', sp); };
    v.onDoor = open => sfx(open ? 'open' : 'close');
    clearInterval(tickT); tickT = setInterval(tick, 150);
    if (!st().seen2) { st().seen2 = 1; G.save(); TC.toast('🚶 Bienvenue à Trad City ! <b>V</b> : vue 1re personne · <b>F</b> : monter dans ta voiture · <b>E</b> devant une maison pour entrer.', 'info', 8000); }
  };
  W.stop = function () {
    if (!on) return; on = false; clearInterval(tickT); tickT = null;
    document.body.classList.remove('wk-on'); engine(0, null);
    const v = V(); if (v) v.walk(false);
    G.save();
    if (TC.City) TC.City.render();
  };
  function exitLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { } const v = V(); if (v && v.walkState) v.walkState.keys = {}; }
  W.enterHouse = function (p) {
    const v = V(); if (!v || !TC.City || !TC.City.houseInfo) return;
    const info = TC.City.houseInfo(p);
    if (v.enterHouse(info)) { sfx('open'); setTimeout(() => sfx('close'), 650); TC.toast(info.me ? '🏠 Bienvenue chez toi ! <b>B</b> pour la déco, <b>E</b> près de la porte pour l\'ouvrir.' : `🏠 Chez ${esc(info.pseudo)}. <b>E</b> près de la porte pour ressortir.`, 'info', 5000); }
  };

  // invites à l'écran (et sur le téléphone : boutons)
  function prompts(v) {
    const k = v.walkState, out = [];
    if (k.mode === 'drive') { out.push(['KeyF', 'F', k.kmh > 11 ? 'Ralentis pour descendre' : 'Descendre du véhicule']); if (!touch()) out.push(['Space', '␣', 'Frein à main']); return out; }
    if (k.mode === 'ride') { out.push(['Escape', 'Échap', 'Descendre de la grande roue']); return out; }
    if (k.mode === 'tir') return out;
    if (v.decoPlacing && v.decoPlacing()) { out.push(['KeyE', 'E', 'Poser ici'], ['KeyR', 'R', 'Tourner'], ['KeyX', 'X', 'Annuler']); return out; }
    const h = v.house && v.house();
    if (h) {
      if (k.nearDoor) out.push(['KeyE', 'E', v.doorOpen() ? 'Fermer la porte' : 'Ouvrir la porte']);
      if (h.me) { out.push(['KeyB', 'B', 'Déco : poser un meuble']); if (v.decoNear() >= 0) out.push(['KeyX', 'X', 'Ranger cet objet']); }
      return out;
    }
    if (k.nearVeh) out.push(['KeyF', 'F', 'Monter : ' + (k.nearVeh.item.brand + ' ' + k.nearVeh.item.model)]);
    const n = v.nearInfo && v.nearInfo();
    if (n && n.land) out.push(['KeyE', 'E', n.land === 'market' ? 'Entrer dans le Trad Market 🛒' : n.land === 'roue' ? 'Faire un tour de grande roue 🎡 (4 €)' : n.land === 'tir' ? 'Jouer au stand de tir 🎯 (3 €)' : 'Entrer dans ' + (NAMES[n.land] || 'le bâtiment')]);
    else if (n && n.uid) {
      const me = n.uid === myUid(), p = TC.City && TC.City.roster && TC.City.roster().find(x => x.uid === n.uid);
      out.push(['KeyE', 'E', me ? 'Entrer chez toi 🏠' : 'Entrer chez ' + (p && p.pseudo ? p.pseudo : 'ce joueur') + ' 🏠'], ['KeyR', 'R', me ? 'Ton terrain' : 'Infos du terrain']);
    }
    return out;
  }
  let lastPr = '';
  function tick() {
    const v = V(); if (!v || !v.walkState) return;
    if (TC.UI && TC.UI.tab !== 'city') return W.stop();
    const k = v.walkState, w = st(), now = Date.now();
    if (k.dist || k.runDist) {
      const boosted = now < (w.boost || 0);
      w.en = Math.max(0, w.en - k.dist * 0.012 - (boosted ? 0 : k.runDist * 0.02));
      k.dist = k.runDist = 0;
      if (now - saveAt > 6000) { saveAt = now; G.save(); }
    }
    const boosted = now < (w.boost || 0);
    k.speed = boosted ? 1.4 : w.en <= 0 ? 0.6 : 1; k.canRun = boosted || w.en > 0;
    if (w.en < 25 && w.en > 0 && warned !== 1) { warned = 1; TC.toast('🍔 Tu commences à avoir faim : passe au 🛒 Trad Market, à côté de la Bourse.', 'info', 6000); }
    if (w.en <= 0 && warned !== 2) { warned = 2; TC.toast('😵 Plus d\'énergie : tu marches au ralenti. Mange quelque chose (🎒 Sac) !', 'bad', 7000); }
    if (w.en >= 25) warned = 0;
    const en = $('#wk-en'); if (en) { en.querySelector('i').style.width = Math.max(0, w.en) + '%'; en.querySelector('em').textContent = (boosted ? '🏃 ' : '⚡ ') + Math.round(w.en); en.classList.toggle('low', w.en < 25); en.classList.toggle('boost', boosted); }
    const cash = $('#wk-cash'); if (cash) cash.textContent = fmt.eur(S().cash);
    const sp = $('#wk-speed'); if (sp) { sp.hidden = k.mode !== 'drive'; if (k.mode === 'drive') sp.querySelector('b').textContent = Math.round(k.kmh); }
    const cr = $('#wk-cross'); if (cr) cr.hidden = !(k.fp || k.mode === 'tir');
    const dc = $('#wk-deco'); if (dc) { const h = v.house && v.house(); dc.hidden = !(h && h.me); }
    const fire = document.querySelector('.wk-fire'); if (fire) fire.hidden = k.mode !== 'tir';
    const gm = $('#wk-game'); if (gm) { gm.hidden = !(k.mode === 'ride' || k.mode === 'tir'); if (k.mode === 'ride') gm.innerHTML = `🎡 Grande roue · encore <b>${Math.ceil(k.rideLeft || 0)} s</b> · regarde la ville !`; }
    engine(k.mode === 'drive' ? k.kmh : 0, k.mode === 'drive' && k.veh ? k.veh.mesh.userData.vs : null);
    const pr = $('#wk-prompts'); if (!pr) return;
    const list = prompts(v), key = JSON.stringify(list) + touch();
    if (key !== lastPr || !pr.firstChild && list.length) { lastPr = key; pr.innerHTML = list.map(([code, kb, txt]) => `<button class="wk-prompt" data-wkk="${code}">${touch() ? '' : `<kbd>${kb}</kbd>`}<span>${esc(txt)}</span></button>`).join(''); }
  }

  /* ---------- Actions ---------- */
  function act(code) {
    const v = V(); if (!v || !on) return;
    const k = v.walkState, h = v.house && v.house();
    if (code === 'KeyV') { v.setView(!k.fp); return; }
    if (code === 'KeyI') return W.bag();
    if (code === 'KeyG') return garage();
    if (k.mode === 'tir') { if (code === 'Space') shoot(); return; }
    if (k.mode === 'ride') { if (code === 'Escape') v.rideEnd(); return; }
    if (code === 'KeyF') { if (k.mode === 'drive') { if (!v.exitVehicle()) TC.toast('Ralentis pour descendre.', 'info', 2000); else sfx('door'); } else if (v.enterVehicle()) sfx('door'); return; }
    if (k.mode === 'drive') return;
    if (v.decoPlacing && v.decoPlacing()) {
      if (code === 'KeyR') return v.decoRotate();
      if (code === 'KeyX' || code === 'Escape') { v.decoCancel(); return; }
      if (code === 'KeyE') { const d = v.decoConfirm(); if (d) placeDeco(d); }
      return;
    }
    if (h) {
      if (code === 'KeyE' && k.nearDoor) return v.toggleDoor();
      if (code === 'KeyB' && h.me) return decoMenu();
      if (code === 'KeyX' && h.me) { const i = v.decoNear(); if (i >= 0) removeDeco(i); }
      return;
    }
    if (code === 'KeyE') return W.use();
    if (code === 'KeyR') { const n = v.nearInfo(); if (n && n.uid && TC.City.lotModal) { exitLock(); TC.City.lotModal(n.uid); } }
  }
  W.use = function () {
    const v = V(); if (!v) return; const n = v.nearInfo && v.nearInfo(); if (!n) return;
    exitLock();
    if (n.land === 'market') return W.shop();
    if (n.land === 'roue') return roue();
    if (n.land === 'tir') return tirGame();
    if (n.uid) { const p = TC.City.roster().find(x => x.uid === n.uid); if (p) return W.enterHouse(p); }
    v.openNear();
  };

  /* ---------- Garage : faire venir un de ses véhicules ---------- */
  function garage() {
    exitLock();
    const v = V(), cars = [...new Set(S().owned.map(o => o.item))].map(id => TC.shopById[id]).filter(i => i && i.type === 'car').sort((a, b) => b.price - a.price);
    const md = TC.modal(`<div class="wk-shop"><h2>🔑 Mon garage</h2>
      ${cars.length ? `<p class="muted">Choisis un véhicule : il arrive à côté de toi. Monte avec <b>F</b>.</p><div class="wk-prods">${cars.map(c => `<div class="wk-prod"><span class="wk-pe">${c.emoji}</span><div class="wk-pn"><b>${esc(c.brand + ' ' + c.model)}</b><small>${esc(Object.entries(c.specs || {}).slice(0, 2).map(([a, b]) => a + ' ' + b).join(' · '))}</small></div><button class="btn btn-sm btn-gold" data-veh="${esc(c.id)}">Faire venir</button></div>`).join('')}</div>`
        : '<div class="empty">Tu n\'as pas encore de véhicule. Achète une trottinette, un scooter ou une voiture dans l\'onglet 🛍️ Boutique, puis reviens ici !</div>'}
      <div class="modal-actions"><button class="btn" data-close>Fermer</button></div></div>`, { cls: 'wk-modal' });
    md.el.querySelectorAll('[data-veh]').forEach(b => { b.onclick = () => { if (v.house && v.house()) return TC.toast('Sors de la maison d\'abord 🙂', 'info'); const it = TC.shopById[b.dataset.veh]; v.spawnVehicle(it); md.close(); sfx('door'); TC.toast(`${it.emoji} ${esc(it.brand + ' ' + it.model)} est garé(e) à côté de toi. Appuie sur <b>F</b> pour monter.`, 'ok', 5000); }; });
  }

  /* ---------- 🛒 Trad Market ---------- */
  W.shop = function () {
    exitLock();
    const cart = {};
    const md = TC.modal(`<div class="wk-shop"><h2>🛒 Trad Market</h2><p class="muted">Boissons, snacks et sandwichs. Tout va dans ton sac 🎒 et te redonne de l'énergie ⚡ pour marcher et courir.</p>
      <div class="wk-prods">${W.PRODUCTS.map(p => `<div class="wk-prod"><span class="wk-pe">${p.e}</span><div class="wk-pn"><b>${esc(p.name)}</b><small>${esc(p.sub)} · ⚡ +${p.en}${p.boost ? ' · 🏃 sprint 90 s' : ''}</small></div><b class="wk-pp">${fmt.eur(p.p)}</b><div class="wk-q"><button data-q="${p.id}" data-d="-1">−</button><span id="wk-q-${p.id}">0</span><button data-q="${p.id}" data-d="1">+</button></div></div>`).join('')}</div>
      <div class="wk-tot"><span>Total</span><b id="wk-tot">${fmt.eur(0)}</b></div>
      <p class="hint">Solde : ${fmt.eur(S().cash)}. Tu paies en scannant le QR code avec ton téléphone.</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Sortir</button><button class="btn btn-gold" id="wk-pay" disabled>💳 Payer</button></div></div>`, { cls: 'wk-modal' });
    const total = () => r2(Object.entries(cart).reduce((t, [id, n]) => t + byId[id].p * n, 0));
    md.el.querySelectorAll('[data-q]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.q; cart[id] = Math.max(0, Math.min(20, (cart[id] || 0) + +b.dataset.d));
        md.el.querySelector('#wk-q-' + id).textContent = cart[id];
        const t = total(), pay = md.el.querySelector('#wk-pay');
        md.el.querySelector('#wk-tot').textContent = fmt.eur(t);
        pay.disabled = !(t > 0); pay.textContent = t > 0 ? '💳 Payer ' + fmt.eur(t) : '💳 Payer';
        TC.sound('click');
      };
    });
    md.el.querySelector('#wk-pay').onclick = () => {
      const t = total(); if (!(t > 0)) return;
      if (t > S().cash) return TC.toast('Solde insuffisant.', 'bad');
      md.close();
      const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ p: byId[id], n }));
      const label = lines.map(l => (l.n > 1 ? l.n + '× ' : '') + l.p.name).join(', ');
      W.pay({ shop: 'Trad Market', label, total: t, onPaid: () => { const w = st(); lines.forEach(l => { w.bag[l.p.id] = (w.bag[l.p.id] || 0) + l.n; }); TC.toast(`🛒 Merci ! ${esc(label)} dans ton sac 🎒 (touche <b>I</b> pour manger ou boire).`, 'ok', 7000); } });
    };
  };

  let qrLoad = null;
  function loadQR() { return qrLoad || (qrLoad = new Promise((res, rej) => { if (window.qrcode) return res(); const s = document.createElement('script'); s.src = 'js/vendor/qr/qrcode.js'; s.onload = res; s.onerror = () => { qrLoad = null; rej(new Error('QR')); }; document.head.appendChild(s); })); }
  function qrSvg(text) { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }

  // caisse : QR à scanner avec son téléphone (ou paiement sur l'ordinateur)
  W.pay = async function ({ shop, label, total, onPaid }) {
    total = r2(total);
    if (total > S().cash) return TC.toast('Solde insuffisant.', 'bad');
    exitLock();
    const db = N && N.enabled && N.user && N.profile && !N.profile.guest && N.db && N.db();
    const uid = db ? N.user.uid : null, pid = Math.random().toString(36).slice(2, 10);
    let done = false, unsub = null, timer = null, until = Date.now() + 180000, url = null, err = null;
    if (db) {
      try {
        await loadQR();
        await db.collection('users').doc(uid).update({ pay: { id: pid, eur: total, shop, items: String(label).slice(0, 200), at: Date.now(), until, solde: r2(S().cash - total) } });
        url = new URL('bank.html', location.href).href + '#pay=' + uid + '.' + pid;
      } catch (e) { err = e; console.warn('paiement', e); }
    }
    const qr = url ? `<div class="wk-qr">${qrSvg(url)}</div>
        <p class="wk-how"><b>📱 Prends ton téléphone</b> : ouvre <b>Trad Banque → 📷 Payer</b> (ou l'appareil photo) et vise ce code.</p>
        <p class="hint">Ton téléphone doit être connecté au même compte Trad Center que cet ordinateur. Code valable <b id="wk-left">3:00</b>.</p>`
      : `<p class="wk-how">${err ? '⚠️ Le paiement par téléphone ne répond pas pour l\'instant.' : '👤 Pour payer avec ton téléphone, crée un compte (onglet Amis) et connecte-toi avec le même compte sur ton téléphone.'}</p>`;
    const md = TC.modal(`<div class="wk-paybox"><h2>💳 ${esc(shop)}</h2>
        <div class="wk-term" id="wk-term"><div class="wk-leds"><i></i><i></i><i></i><i></i></div><div class="wk-lcd"><small>${esc(shop)} · caisse</small><b>${fmt.eur(total)}</b><span id="wk-lcd">${url ? 'Scannez pour payer' : 'Présentez votre carte'}</span></div></div>
        <p class="wk-ticket">${esc(label)}</p>${qr}
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn ${url ? 'btn-sm' : 'btn-gold'}" id="wk-here">${url ? 'Payer sur l\'ordinateur' : '💳 Payer ' + fmt.eur(total)}</button></div></div>`,
      { cls: 'wk-modal', onClose: () => { if (unsub) unsub(); clearInterval(timer); if (!done && uid && url) clearPay(uid); } });
    const lcd = t => { const e = md.el.querySelector('#wk-lcd'); if (e) e.textContent = t; };
    const term = () => md.el.querySelector('#wk-term');
    async function paid(phone) {
      if (done) return; done = true; if (unsub) unsub(); clearInterval(timer);
      const tm = term(); if (tm) tm.classList.add('reading'); lcd(phone ? '📱 Paiement reçu du téléphone…' : 'Lecture de la carte…');
      await new Promise(r => setTimeout(r, 650));
      if (total > S().cash) { TC.sound('bipko'); if (tm) tm.classList.add('ko'); lcd('REFUSÉ : solde insuffisant'); if (uid && url) clearPay(uid); return; }
      S().cash = r2(S().cash - total);
      S().log.unshift({ t: Date.now(), kind: 'shop', eur: total, asset: shop + ' : ' + label }); if (S().log.length > 300) S().log.length = 300;
      G.save(true);
      TC.sound('bip'); if (tm) tm.classList.add('ok'); lcd('PAIEMENT ACCEPTÉ ✓');
      if (uid && url) clearPay(uid);
      if (TC.App && TC.App.after) TC.App.after();
      setTimeout(() => { TC.sound('kaching'); md.close(); if (onPaid) onPaid(); }, 1200);
    }
    md.el.querySelector('#wk-here').onclick = () => paid(false);
    if (url) {
      unsub = db.collection('users').doc(uid).onSnapshot(s => { const p = s.exists && s.data().pay; if (p && p.id === pid && p.ok === pid) paid(true); }, e => console.warn('paiement', e));
      timer = setInterval(() => {
        const left = Math.max(0, Math.ceil((until - Date.now()) / 1000)), el = md.el.querySelector('#wk-left');
        if (el) el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        if (!left && !done) { clearInterval(timer); if (unsub) unsub(); unsub = null; lcd('Code expiré'); clearPay(uid); const q = md.el.querySelector('.wk-qr'); if (q) q.classList.add('off'); }
      }, 1000);
    }
  };
  function clearPay(uid) { try { N.db().collection('users').doc(uid).update({ pay: firebase.firestore.FieldValue.delete() }).catch(() => { }); } catch (e) { } }

  /* ---------- 🎡 Grande roue ---------- */
  function roue() {
    W.pay({ shop: 'Grande roue', label: '1 tour de grande roue (1 min)', total: 4, onPaid: () => {
      const v = V(); if (!v || !on) return;
      if (v.rideStart(() => { TC.toast('🎡 Fin du tour. À bientôt !', 'info', 3000); })) TC.toast('🎡 C\'est parti pour un tour ! Bouge la souris (ou glisse) pour regarder la ville.', 'ok', 5000);
    } });
  }

  /* ---------- 🎯 Stand de tir ---------- */
  function tirGame() {
    W.pay({ shop: 'Stand de tir', label: '25 plombs · 40 secondes', total: 3, onPaid: () => {
      const v = V(); if (!v || !on) return;
      const gm = $('#wk-game');
      v.tirStart({ len: 40, ammo: 25,
        onUpdate: i => { const g = $('#wk-game'); if (g) g.innerHTML = `🎯 <b>${i.score}</b> pts · 🔫 ${i.ammo} plombs · ⏱️ ${i.left} s`; },
        onEnd: i => {
          const xp = Math.min(60, Math.round(i.score / 4)); if (xp && TC.Progress && TC.Progress.xp) TC.Progress.xp(xp);
          const w = st(), day = new Date().toDateString(); let prize = '';
          if (i.hits >= 12 && w.plushDay !== day) { w.plushDay = day; w.inv.peluche = (w.inv.peluche || 0) + 1; prize = '<br>🧸 Tu gagnes une <b>peluche géante</b> ! Pose-la chez toi (🛋️ Déco).'; G.save(true); }
          TC.modal(`<div class="center"><div class="big-emoji">🎯</div><h2>Score : ${i.score} points</h2><p>${i.hits} cibles touchées sur ${i.shots} tirs.${xp ? ` <b>+${xp} XP</b>` : ''}${prize}</p><div class="modal-actions"><button class="btn btn-gold" data-close>OK</button></div></div>`);
          if (i.hits >= 12) TC.confetti(120);
        } });
      if (gm) gm.hidden = false;
      TC.toast(touch() ? '🎯 Touche les cibles pour tirer ! Les canards 🦆 valent 25 points.' : '🎯 Clique dans la ville pour viser à la souris, puis clique (ou Espace) pour tirer. Les canards 🦆 valent 25 points.', 'ok', 6000);
    } });
  }
  function shoot(cx, cy) { const v = V(); if (!v) return; const got = v.tirShoot(cx, cy); if (got == null) return; sfx('shot'); if (got) setTimeout(() => sfx('ding'), 80); }

  /* ---------- 🛋️ Déco de la maison ---------- */
  function decoMenu() {
    exitLock();
    const w = st(), inv = w.inv;
    const md = TC.modal(`<div class="wk-shop"><h2>🛋️ Déco de ta maison</h2><p class="muted">Achète un meuble puis pose-le où tu veux : il apparaît devant toi, <b>R</b> pour tourner, <b>E</b> pour poser. Tes amis le verront quand ils viendront chez toi.</p>
      <div class="wk-prods">${W.DECO.filter(d => !d.prize || inv[d.k]).map(d => `<div class="wk-prod"><span class="wk-pe">${d.e}</span><div class="wk-pn"><b>${esc(d.name)}</b><small>${inv[d.k] ? `${inv[d.k]} à poser` : d.prize ? 'gagné au stand de tir' : fmt.eur(d.p)}</small></div>${inv[d.k] ? `<button class="btn btn-sm btn-gold" data-dput="${d.k}">Poser</button>` : `<button class="btn btn-sm" data-dbuy="${d.k}" ${S().cash >= d.p ? '' : 'disabled'}>Acheter ${fmt.eur(d.p, true)}</button>`}</div>`).join('')}</div>
      <p class="hint">${(S().deco || []).length} / 40 objets posés. Pour en enlever un, approche-toi et appuie sur <b>X</b> (il retourne dans ta réserve).</p>
      <div class="modal-actions"><button class="btn" data-close>Fermer</button></div></div>`, { cls: 'wk-modal' });
    md.el.querySelectorAll('[data-dbuy]').forEach(b => { b.onclick = () => { const d = decoById[b.dataset.dbuy]; if (S().cash < d.p) return TC.toast('Solde insuffisant.', 'bad'); S().cash = r2(S().cash - d.p); S().log.unshift({ t: Date.now(), kind: 'shop', eur: d.p, asset: '🛋️ Déco : ' + d.name }); inv[d.k] = (inv[d.k] || 0) + 1; G.save(true); TC.sound('kaching'); md.close(); startPlace(d.k); }; });
    md.el.querySelectorAll('[data-dput]').forEach(b => { b.onclick = () => { md.close(); startPlace(b.dataset.dput); }; });
  }
  function startPlace(k) {
    if ((S().deco || []).length >= 40) return TC.toast('Maximum 40 objets dans la maison. Range-en un avec X.', 'bad');
    const v = V(); if (v.decoStart(k)) TC.toast('🛋️ Place l\'objet : avance ou tourne-toi, <b>R</b> pour le faire pivoter, <b>E</b> pour le poser.', 'info', 6000);
  }
  function placeDeco(d) {
    const w = st(); if (!(w.inv[d.k] > 0)) return;
    w.inv[d.k]--; if (!w.inv[d.k]) delete w.inv[d.k];
    (S().deco || (S().deco = [])).push(d); G.save(true);
    V().setDeco(S().deco); sfx('place');
  }
  function removeDeco(i) {
    const list = S().deco || []; const d = list[i]; if (!d) return;
    list.splice(i, 1); const w = st(); w.inv[d.k] = (w.inv[d.k] || 0) + 1; G.save(true);
    V().setDeco(list); sfx('place'); TC.toast(`${(decoById[d.k] || {}).e || '📦'} Rangé dans ta réserve (🛋️ Déco pour le reposer).`, 'info', 3500);
  }

  /* ---------- 🎒 Sac ---------- */
  W.bag = function () {
    exitLock();
    const w = st(), list = W.PRODUCTS.filter(p => w.bag[p.id] > 0), boosted = Date.now() < (w.boost || 0);
    const md = TC.modal(`<div class="wk-shop"><h2>🎒 Ton sac</h2>
      <div class="wk-en big ${w.en < 25 ? 'low' : ''}"><i style="width:${Math.max(0, w.en)}%"></i><em>⚡ Énergie ${Math.round(w.en)} / 100${boosted ? ' · 🏃 sprint boosté' : ''}</em></div>
      ${list.length ? `<div class="wk-prods">${list.map(p => `<div class="wk-prod"><span class="wk-pe">${p.e}</span><div class="wk-pn"><b>${esc(p.name)}</b><small>× ${w.bag[p.id]} · ⚡ +${p.en}${p.boost ? ' · 🏃 sprint 90 s' : ''}</small></div><button class="btn btn-sm btn-gold" data-eat="${p.id}">${p.drink ? 'Boire' : 'Manger'}</button></div>`).join('')}</div>`
        : '<div class="empty">Ton sac est vide. Passe au 🛒 Trad Market, à côté de la Bourse !</div>'}
      <p class="hint">Marcher fatigue un peu, courir beaucoup plus. Sans énergie, tu marches au ralenti.</p>
      <div class="modal-actions"><button class="btn" data-close>Fermer</button></div></div>`, { cls: 'wk-modal' });
    md.el.querySelectorAll('[data-eat]').forEach(b => { b.onclick = () => { eat(b.dataset.eat); W.bag(); }; });
  };
  function eat(id) {
    const p = byId[id], w = st(); if (!p || !(w.bag[id] > 0)) return;
    w.bag[id]--; if (!w.bag[id]) delete w.bag[id];
    w.en = Math.min(100, w.en + p.en); if (p.boost) w.boost = Date.now() + 90000;
    G.save(); TC.sound('buy');
    TC.toast(`${p.e} ${p.drink ? 'Glou glou' : 'Miam'} ! ⚡ +${p.en}${p.boost ? ' · 🏃 sprint boosté pendant 90 s' : ''}`, 'ok', 3500);
  }

  /* ---------- Sons (synthétisés) : moteur, tir, porte ---------- */
  let ac = null, eng = null;
  function ctx() { if (!G.state.sound) return null; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch (e) { return null; } }
  function noise(c, dur, freq, q, vol, type) { const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2); const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(c.destination); s.start(); }
  function tone(c, f1, f2, dur, vol, type) { const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f1, c.currentTime); o.frequency.exponentialRampToValueAtTime(f2, c.currentTime + dur); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur + .02); }
  function sfx(kind, x) {
    const c = ctx(); if (!c) return;
    if (kind === 'shot') { noise(c, .18, 1800, .7, .5, 'lowpass'); tone(c, 220, 60, .12, .25, 'square'); }
    else if (kind === 'ding') tone(c, 1320, 1280, .35, .12, 'triangle');
    else if (kind === 'open') { tone(c, 180, 320, .5, .05, 'sawtooth'); noise(c, .25, 600, 2, .08); }
    else if (kind === 'close') { noise(c, .15, 220, 1, .4, 'lowpass'); tone(c, 120, 60, .15, .2); }
    else if (kind === 'door') { noise(c, .12, 300, 1, .35, 'lowpass'); }
    else if (kind === 'place') { noise(c, .1, 400, 1, .3, 'lowpass'); }
    else if (kind === 'bump') { noise(c, .3, 250, .6, Math.min(.8, (x || 10) / 30), 'lowpass'); }
  }
  function engine(kmh, vs) {
    if (!vs || !on) { if (eng) { try { eng.g.gain.setTargetAtTime(0, eng.c.currentTime, .1); const e = eng; setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch (x) { } }, 400); } catch (e) { } eng = null; } return; }
    const c = ctx(); if (!c) return;
    const electric = vs === 'kick' || (V().walkState.veh && /tesla|taycan/i.test(V().walkState.veh.item.brand + V().walkState.veh.item.model));
    if (!eng || eng.vs !== vs) {
      engine(0, null);
      const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = electric ? 'sine' : 'sawtooth'; o2.type = electric ? 'sine' : 'square'; f.type = 'lowpass'; f.frequency.value = electric ? 2000 : 420; g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(c.destination); o.start(); o2.start();
      eng = { c, o, o2, g, vs, electric };
    }
    const sport = /super|hyper|sport|gt|moto/.test(vs), base = eng.electric ? 300 : sport ? 55 : 38, gear = eng.electric ? kmh : (kmh % 60);
    eng.o.frequency.setTargetAtTime(base + gear * (eng.electric ? 9 : sport ? 3.2 : 2.4) + kmh * .4, c.currentTime, .08);
    eng.o2.frequency.setTargetAtTime((base + gear * 2) * .5, c.currentTime, .08);
    eng.g.gain.setTargetAtTime(eng.electric ? .015 + kmh / 9000 : .03 + Math.min(.05, kmh / 4000), c.currentTime, .1);
  }

  /* ---------- Clavier, souris, joystick ---------- */
  const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'];
  const ACT = ['KeyE', 'KeyF', 'KeyV', 'KeyG', 'KeyB', 'KeyX', 'KeyR', 'KeyI', 'Enter'];
  const typing = e => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
  const modalOpen = () => { const m = $('#modal'); return !!(m && m.classList.contains('open')); };
  document.addEventListener('keydown', e => {
    if (!on || typing(e) || modalOpen()) return;
    const v = V(); if (!v || !v.walkState) return;
    if (e.code === 'Space') { e.preventDefault(); if (v.walkState.mode === 'tir') { if (!e.repeat) act('Space'); return; } }
    if (MOVE.includes(e.code)) { v.walkState.keys[e.code] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); return; }
    if (e.code === 'Escape') { if (v.walkState.mode === 'ride' || (v.decoPlacing && v.decoPlacing())) act('Escape'); return; }
    if (ACT.includes(e.code) && !e.repeat) { e.preventDefault(); act(e.code === 'Enter' ? 'KeyE' : e.code); }
  });
  document.addEventListener('keyup', e => { const v = V(); if (v && v.walkState) delete v.walkState.keys[e.code]; });
  window.addEventListener('blur', () => { const v = V(); if (v && v.walkState) v.walkState.keys = {}; });
  document.addEventListener('mousemove', e => {
    const v = V(); if (!on || !v || document.pointerLockElement !== v.canvas()) return;
    const k = v.walkState; k.yaw -= e.movementX * .0024; k.pitch = k.fp || k.mode === 'tir' || k.mode === 'ride' ? Math.max(-1.3, Math.min(1.3, k.pitch + e.movementY * .0022)) : Math.max(.02, Math.min(1.2, k.pitch + e.movementY * .0022)); k.lookAt = Date.now() + 1500;
  });
  document.addEventListener('pointerlockchange', () => { const h = $('#wk-help'); if (h) h.classList.toggle('locked', !!document.pointerLockElement); });
  document.addEventListener('mousedown', e => {
    const v = V(); if (!on || !v || e.button !== 0) return;
    if (document.pointerLockElement === v.canvas()) { if (v.walkState.mode === 'tir') shoot(); else if (v.decoPlacing && v.decoPlacing()) act('KeyE'); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-wk], [data-wkk]');
    if (b) {
      if (b.dataset.wkk) return act(b.dataset.wkk);
      const a = b.dataset.wk;
      if (a === 'exit') return W.stop();
      if (a === 'run') { const v = V(); if (v) { v.walkState.joy.run = !v.walkState.joy.run; b.classList.toggle('on', v.walkState.joy.run); } return; }
      if (a === 'fire') return shoot();
    }
    const v = V();
    if (on && v && v.canvas && e.target === v.canvas()) {
      if (v.walkState.mode === 'tir' && (touch() || !document.pointerLockElement) && touch()) return shoot(e.clientX, e.clientY);
      if (!touch() && !document.pointerLockElement) { try { const p = v.canvas().requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (x) { } }
    }
  });
  let joyId = null, joyC = null;
  document.addEventListener('pointerdown', e => {
    const j = e.target.closest && e.target.closest('.wk-joy'); if (!j || !on) return;
    e.preventDefault(); joyId = e.pointerId; const r = j.getBoundingClientRect(); joyC = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2, el: j };
    joyMove(e);
  });
  function joyMove(e) {
    const v = V(); if (!v || !joyC) return;
    let dx = (e.clientX - joyC.x) / joyC.r, dy = (e.clientY - joyC.y) / joyC.r; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    v.walkState.joy.x = dx; v.walkState.joy.y = dy;
    const knob = joyC.el.querySelector('i'); if (knob) knob.style.transform = `translate(${dx * joyC.r * .6}px, ${dy * joyC.r * .6}px)`;
  }
  document.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
  const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; const v = V(); if (v) { v.walkState.joy.x = 0; v.walkState.joy.y = 0; } const knob = joyC && joyC.el.querySelector('i'); if (knob) knob.style.transform = ''; joyC = null; };
  document.addEventListener('pointerup', joyEnd); document.addEventListener('pointercancel', joyEnd);
})();

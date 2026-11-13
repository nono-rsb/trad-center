/* Trad Center — 🚶 balade à pied dans Trad City + 🛒 Trad Market
 * Ordinateur : ZQSD (ou WASD / flèches) pour marcher, Maj pour courir, souris pour regarder (clic dans la ville), E pour entrer, I pour le sac.
 * Téléphone : joystick + glisser pour regarder.
 * Trad Market : boissons et snacks (argent du jeu) qui vont dans le sac et redonnent de l'énergie ⚡ (on se fatigue en marchant).
 * Paiement : l'ordinateur affiche un QR code, on le scanne avec son VRAI téléphone (Trad Banque → 📷 Payer, ou l'appareil photo)
 * connecté au même compte. Le téléphone valide (users/{uid}.pay.ok), l'ordinateur encaisse : c'est lui qui garde la partie.
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
  const st = () => { const s = S(); if (!s.walk || typeof s.walk !== 'object') s.walk = { en: 100, bag: {}, boost: 0 }; if (!s.walk.bag) s.walk.bag = {}; return s.walk; };
  const NAMES = { market: 'le Trad Market 🛒', bourse: 'la Bourse', conc: 'la Concession', agence: 'l\'Agence immo', bijou: 'la Bijouterie', coffre: 'le Coffre', labo: 'le Labo du bot', mairie: 'la Mairie', parc: 'le Parc' };

  let on = false, tickT = null, saveAt = 0, warned = 0;
  W.on = () => on;

  /* ---------- Interface (dans la vue 3D, plein écran) ---------- */
  W.hud = function () {
    const w = st();
    return `<div class="wk-hud">
      <div class="wk-top"><b>🚶 Trad City</b><span id="wk-cash">${fmt.eur(S().cash)}</span><span class="wk-en" id="wk-en"><i style="width:${Math.max(0, w.en)}%"></i><em>⚡ ${Math.round(w.en)}</em></span><span class="wk-gap"></span><button data-wk="bag">🎒 Sac</button><button data-wk="exit">✕ Quitter</button></div>
      <button class="wk-prompt" id="wk-prompt" data-wk="use" hidden><kbd>E</kbd><span></span></button>
      <div class="wk-help" id="wk-help">${touch() ? '🕹️ Joystick pour marcher · glisse l\'écran pour regarder · 🏃 pour courir' : '<b>ZQSD</b> ou flèches : marcher · <b>Maj</b> : courir · <b>clique</b> dans la ville puis bouge la souris pour regarder · <b>E</b> : entrer · <b>I</b> : ton sac · <b>Échap</b> : libérer la souris'}</div>
      <div class="wk-joy" id="wk-joy"><i></i></div><button class="wk-run" data-wk="run">🏃</button>
    </div>`;
  };
  function avatarOpt() {
    const uid = N && N.user ? N.user.uid : null;
    return { uid, avatar: TC.Style ? TC.Style.mine().avatar : (N && N.profile && N.profile.avatar) };
  }
  W.start = function () {
    const v = V(); if (!v || !v.ready || v.failed) return TC.toast('La ville 3D doit être affichée pour se balader.', 'bad');
    if (v.insideOf && v.insideOf()) v.exit(true);
    on = true; document.body.classList.add('wk-on');
    if (TC.City) TC.City.render();
    v.walk(true, avatarOpt());
    clearInterval(tickT); tickT = setInterval(tick, 200);
    if (!st().seen) { st().seen = 1; G.save(); TC.toast('🚶 Bienvenue en balade ! Le 🛒 Trad Market est juste à côté de la Bourse.', 'info', 6000); }
  };
  W.stop = function () {
    if (!on) return; on = false; clearInterval(tickT); tickT = null;
    document.body.classList.remove('wk-on');
    const v = V(); if (v) v.walk(false);
    G.save();
    if (TC.City) TC.City.render();
  };
  function exitLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { } const v = V(); if (v && v.walkState) v.walkState.keys = {}; }

  // énergie, vitesse, invite « E · Entrer »
  function tick() {
    const v = V(); if (!v || !v.walkState) return;
    if (TC.UI && TC.UI.tab !== 'city') return W.stop();
    const k = v.walkState, w = st(), now = Date.now();
    if (k.dist || k.runDist) {
      const boosted = now < (w.boost || 0);
      w.en = Math.max(0, w.en - k.dist * 0.008 - (boosted ? 0 : k.runDist * 0.012));
      k.dist = k.runDist = 0;
      if (now - saveAt > 6000) { saveAt = now; G.save(); }
    }
    const boosted = now < (w.boost || 0);
    k.speed = boosted ? 1.45 : w.en <= 0 ? 0.6 : 1; k.canRun = boosted || w.en > 0;
    if (w.en < 25 && w.en > 0 && warned !== 1) { warned = 1; TC.toast('🍔 Tu commences à avoir faim : passe au 🛒 Trad Market, à côté de la Bourse.', 'info', 6000); }
    if (w.en <= 0 && warned !== 2) { warned = 2; TC.toast('😵 Plus d\'énergie : tu marches au ralenti et tu ne peux plus courir. Mange quelque chose !', 'bad', 7000); }
    if (w.en >= 25) warned = 0;
    const en = $('#wk-en'); if (en) { en.querySelector('i').style.width = Math.max(0, w.en) + '%'; en.querySelector('em').textContent = (boosted ? '🏃 ' : '⚡ ') + Math.round(w.en); en.classList.toggle('low', w.en < 25); en.classList.toggle('boost', boosted); }
    const cash = $('#wk-cash'); if (cash) cash.textContent = fmt.eur(S().cash);
    const pr = $('#wk-prompt'); if (!pr) return;
    const n = v.nearInfo && v.nearInfo();
    if (!n) { pr.hidden = true; return; }
    let txt;
    if (n.land) txt = n.land === 'market' ? 'Entrer dans le Trad Market 🛒' : 'Entrer dans ' + (NAMES[n.land] || 'le bâtiment');
    else { const me = N && N.user && n.uid === N.user.uid, p = TC.City && TC.City.roster && TC.City.roster().find(x => x.uid === n.uid); txt = me ? 'Ton terrain 🏠' : 'Le terrain de ' + (p && p.pseudo ? p.pseudo : 'ce joueur'); }
    pr.hidden = false; pr.querySelector('span').textContent = txt; pr.querySelector('kbd').hidden = touch();
  }
  W.use = function () {
    const v = V(); if (!v) return; const n = v.nearInfo && v.nearInfo(); if (!n) return;
    exitLock();
    if (n.land === 'market') return W.shop();
    v.openNear();
  };

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
      md.close(); checkout(Object.assign({}, cart));
    };
  };

  let qrLoad = null;
  function loadQR() { return qrLoad || (qrLoad = new Promise((res, rej) => { if (window.qrcode) return res(); const s = document.createElement('script'); s.src = 'js/vendor/qr/qrcode.js'; s.onload = res; s.onerror = () => { qrLoad = null; rej(new Error('QR')); }; document.head.appendChild(s); })); }
  function qrSvg(text) { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }

  // caisse : QR à scanner avec son téléphone
  async function checkout(cart) {
    const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ p: byId[id], n }));
    const total = r2(lines.reduce((t, l) => t + l.p.p * l.n, 0));
    const label = lines.map(l => (l.n > 1 ? l.n + '× ' : '') + l.p.name).join(', ');
    const db = N && N.enabled && N.user && N.profile && !N.profile.guest && N.db && N.db();
    const uid = db ? N.user.uid : null, pid = Math.random().toString(36).slice(2, 10);
    let done = false, unsub = null, timer = null, until = Date.now() + 180000, url = null, err = null;
    if (db) {
      try {
        await loadQR();
        await db.collection('users').doc(uid).update({ pay: { id: pid, eur: total, shop: 'Trad Market', items: label.slice(0, 200), at: Date.now(), until, solde: r2(S().cash - total) } });
        url = new URL('bank.html', location.href).href + '#pay=' + uid + '.' + pid;
      } catch (e) { err = e; console.warn('paiement', e); }
    }
    const qr = url ? `<div class="wk-qr">${qrSvg(url)}</div>
        <p class="wk-how"><b>📱 Prends ton téléphone</b> : ouvre <b>Trad Banque → 📷 Payer</b> (ou l'appareil photo) et vise ce code.</p>
        <p class="hint">Ton téléphone doit être connecté au même compte Trad Center que cet ordinateur. Code valable <b id="wk-left">3:00</b>.</p>`
      : `<p class="wk-how">${err ? '⚠️ Le paiement par téléphone ne répond pas pour l\'instant.' : '👤 Pour payer avec ton téléphone, crée un compte (onglet Amis) et connecte-toi avec le même compte sur ton téléphone.'}</p>`;
    const md = TC.modal(`<div class="wk-paybox"><h2>🛒 Trad Market</h2>
        <div class="wk-term" id="wk-term"><div class="wk-leds"><i></i><i></i><i></i><i></i></div><div class="wk-lcd"><small>Trad Market · caisse 1</small><b>${fmt.eur(total)}</b><span id="wk-lcd">${url ? 'Scannez pour payer' : 'Présentez votre carte'}</span></div></div>
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
      const w = st(); lines.forEach(l => { w.bag[l.p.id] = (w.bag[l.p.id] || 0) + l.n; });
      S().log.unshift({ t: Date.now(), kind: 'shop', eur: total, asset: '🛒 Trad Market : ' + label }); if (S().log.length > 300) S().log.length = 300;
      G.save(true);
      TC.sound('bip'); if (tm) tm.classList.add('ok'); lcd('PAIEMENT ACCEPTÉ ✓');
      if (uid && url) clearPay(uid);
      if (TC.App && TC.App.after) TC.App.after();
      setTimeout(() => { TC.sound('kaching'); md.close(); TC.toast(`🛒 Merci ! ${esc(label)} dans ton sac 🎒 (touche <b>I</b> ou 🎒 Sac pour manger ou boire).`, 'ok', 7000); }, 1300);
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
  }
  function clearPay(uid) { try { N.db().collection('users').doc(uid).update({ pay: firebase.firestore.FieldValue.delete() }).catch(() => { }); } catch (e) { } }

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

  /* ---------- Clavier, souris, joystick ---------- */
  const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
  const typing = e => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
  const modalOpen = () => { const m = $('#modal'); return !!(m && m.classList.contains('open')); };
  document.addEventListener('keydown', e => {
    if (!on || typing(e) || modalOpen()) return;
    const v = V(); if (!v || !v.walkState) return;
    if (MOVE.includes(e.code)) { v.walkState.keys[e.code] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); return; }
    if (e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); return W.use(); }
    if (e.code === 'KeyI') { e.preventDefault(); return W.bag(); }
  });
  document.addEventListener('keyup', e => { const v = V(); if (v && v.walkState) delete v.walkState.keys[e.code]; });
  window.addEventListener('blur', () => { const v = V(); if (v && v.walkState) v.walkState.keys = {}; });
  document.addEventListener('mousemove', e => {
    const v = V(); if (!on || !v || document.pointerLockElement !== v.canvas()) return;
    const k = v.walkState; k.yaw -= e.movementX * .0025; k.pitch = Math.max(.02, Math.min(1.2, k.pitch + e.movementY * .002));
  });
  document.addEventListener('pointerlockchange', () => { const h = $('#wk-help'); if (h) h.classList.toggle('locked', !!document.pointerLockElement); });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-wk]');
    if (b) {
      const a = b.dataset.wk;
      if (a === 'exit') return W.stop();
      if (a === 'bag') return W.bag();
      if (a === 'use') return W.use();
      if (a === 'run') { const v = V(); if (v) { v.walkState.joy.run = !v.walkState.joy.run; b.classList.toggle('on', v.walkState.joy.run); } return; }
    }
    const v = V();
    if (on && v && v.canvas && e.target === v.canvas() && !touch() && !document.pointerLockElement) { try { const p = v.canvas().requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (x) { } }
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

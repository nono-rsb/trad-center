/* Trad Center — notifications
 *  - Dans l'appli (ouverte ou en arrière-plan) : détection en direct des gros mouvements et alertes de prix.
 *  - Appli fermée : notifications Web Push envoyées par le serveur (GitHub Actions, scripts/notify.mjs),
 *    pour les envois reçus, les demandes d'ami, les gros mouvements et les alertes personnalisées.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, D = TC.Data, N = TC.Net;
  const S = () => G.state;
  const NT = TC.Notif = {};

  // Seuils (en %) : identiques côté serveur (scripts/notify.mjs)
  const MAJOR = ['BTC', 'ETH'];
  NT.TH = {
    hour: { major: 3, crypto: 6, index: 1.5, stock: 4, commodity: 3, fx: 1 },
    day: { major: 5, crypto: 10, index: 2.5, stock: 6, commodity: 4, fx: 1.5 },
  };
  const group = a => a.cat === 'crypto' ? (MAJOR.includes(a.id) ? 'major' : 'crypto') : a.cat;

  function prefs() {
    if (!S().notif) S().notif = { transfers: true, prices: 'normal', alerts: [] };
    return S().notif;
  }
  NT.prefs = prefs;
  const supported = () => 'Notification' in window && 'serviceWorker' in navigator;
  const pushSupported = () => supported() && 'PushManager' in window;
  // Clé publique publiée par le serveur de notifications dans son profil (pseudo réservé « tradcenter_bot »)
  let vapid = null;
  NT.serverKey = async function () {
    if (vapid) return vapid;
    const db = N.db(); if (!db) return null;
    try {
      const u = await db.collection('usernames').doc('tradcenter_bot').get(); if (!u.exists) return null;
      const p = await db.collection('users').doc(u.data().uid).get();
      vapid = p.exists && p.data().bot && p.data().vapid || null;
    } catch (e) { }
    return vapid;
  };
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const deviceId = () => { let d = localStorage.getItem('tradcenter.device'); if (!d) { d = Math.random().toString(36).slice(2, 12); try { localStorage.setItem('tradcenter.device', d); } catch (e) { } } return d; };
  NT.subscribed = () => !!localStorage.getItem('tradcenter.pushsub');

  /* ---------------- Affichage d'une notification ---------------- */
  NT.show = async function (title, body, tag, url, toastType = 'info') {
    if (!document.hidden) TC.toast(`<b>${esc(title)}</b>${body ? '<br>' + esc(body) : ''}`, toastType, 6000);
    if (!supported() || Notification.permission !== 'granted') return;
    if (!document.hidden) return; // appli à l'écran : le message suffit
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const opts = { body, tag, renotify: !!tag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: url || './' } };
      if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
    } catch (e) { }
  };

  /* ---------------- Détection en direct des gros mouvements ---------------- */
  const hist = {}; // id -> [[t, prixEUR]]
  const firedKey = 'tradcenter.notif.fired';
  let fired = {}; try { fired = JSON.parse(localStorage.getItem(firedKey) || '{}'); } catch (e) { }
  function once(key, cooldownMs) {
    const now = Date.now();
    if (fired[key] && now - fired[key] < cooldownMs) return false;
    fired[key] = now;
    for (const k in fired) if (now - fired[k] > 3 * 86400000) delete fired[k];
    try { localStorage.setItem(firedKey, JSON.stringify(fired)); } catch (e) { }
    return true;
  }
  const today = () => new Date().toISOString().slice(0, 10);

  function scan() {
    const pr = prefs(); const now = Date.now();
    TC.ASSETS.forEach(a => {
      const p = D.prices[a.id]; if (!p || p.price == null || (p.status !== 'live' && p.status !== 'delayed')) return;
      const e = D.eur(a.id); if (!e) return;
      const h = hist[a.id] || (hist[a.id] = []);
      h.push([now, e]); while (h.length && now - h[0][0] > 65 * 60000) h.shift();
      // alertes personnalisées : évaluées ici seulement si le serveur ne s'en charge pas
      checkAlerts(a, e);
      if (pr.prices === 'off') return;
      const k = pr.prices === 'sensible' ? 0.5 : 1;
      const g = group(a);
      // mouvement sur 1 h
      if (h.length > 4 && now - h[0][0] > 55 * 60000) {
        const ch = (e - h[0][1]) / h[0][1] * 100;
        if (Math.abs(ch) >= NT.TH.hour[g] * k) {
          const dir = ch > 0 ? 'up' : 'down';
          if (once(`${a.id}:h:${dir}`, 3 * 3600000)) moveNotif(a, ch, e, 'en 1 h', dir);
        }
      }
      // mouvement sur la journée / 24 h
      const ch24 = D.change(a.id);
      if (!p.closed && Math.abs(ch24) >= NT.TH.day[g] * k) {
        const dir = ch24 > 0 ? 'up' : 'down';
        if (once(`${a.id}:d:${dir}:${today()}`, 86400000)) moveNotif(a, ch24, e, a.cat === 'crypto' ? 'en 24 h' : 'aujourd\'hui', dir);
      }
    });
  }
  function moveNotif(a, ch, e, when, dir) {
    const t = `${dir === 'up' ? '🚀' : '📉'} ${a.name} ${fmt.pct(ch)} ${when}`;
    NT.show(t, `Cours : ${fmt.eur(e)}. ${dir === 'up' ? 'Grosse hausse' : 'Grosse chute'} en cours.`, `move-${a.id}-${dir}`, `?a=${a.id}`, dir === 'up' ? 'ok' : 'bad');
    TC.sound(dir === 'up' ? 'win' : 'lose');
  }
  function checkAlerts(a, e) {
    const pr = prefs(); let changed = false;
    pr.alerts = pr.alerts.filter(al => {
      if (al.asset !== a.id) return true;
      const hit = al.op === '>' ? e >= al.price : e <= al.price;
      if (!hit) return true;
      if (!NT.subscribed() || !document.hidden) { NT.show(`🎯 ${a.name} ${al.op === '>' ? 'a dépassé' : 'est passé sous'} ${fmt.eur(al.price)}`, `Cours actuel : ${fmt.eur(e)}`, `alert-${al.id}`, `?a=${a.id}`, 'ok'); TC.sound('ach'); }
      changed = true; return false;
    });
    if (changed) { G.save(); NT.syncPrefs(); }
  }

  /* ---------------- Abonnement Web Push (appli fermée) ---------------- */
  function b64ToU8(s) { const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
  const me = () => N.db().collection('users').doc(N.user.uid);
  const field = () => 'push.' + deviceId();

  // Préparés à l'avance : sur iPhone, l'abonnement doit partir tout de suite après le toucher
  let swReg = null;
  if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(r => { swReg = r; }).catch(() => { });

  NT.enable = async function () {
    if (!supported()) throw new Error(isIOS() && !standalone() ? 'ios-install' : 'unsupported');
    let perm = Notification.permission;
    if (perm !== 'granted') perm = await Notification.requestPermission(); // ne pas redemander si déjà accordé (iOS répond « refusé »)
    if (perm !== 'granted') throw new Error('denied');
    if (pushSupported() && N.user && N.profile) {
      try { await NT.subscribe(); }
      catch (e) { console.warn('push', e); NT.pushError = ((e && (e.name || e.code)) || 'erreur') + (e && e.message ? ' : ' + e.message : ''); return 'local'; }
    }
    NT.pushError = null;
    return true;
  };
  // Journal de l'activation, enregistré dans le profil pour le dépannage
  function trace(step, err) {
    NT.lastStep = step + (err ? ' ✗ ' + err : '');
    try {
      if (N.user && N.db()) me().update({ pushDebug: { step, err: err || null, ua: navigator.userAgent.slice(0, 160), standalone: standalone(), perm: supported() ? Notification.permission : 'n/a', at: Date.now() } }).catch(() => { });
    } catch (e) { }
  }
  const withTimeout = (p, ms, step) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé (' + step + ')')), ms))]);

  NT.subscribe = async function () {
    trace('début');
    const key = vapid || await withTimeout(NT.serverKey(), 10000, 'clé serveur');
    if (!key) { trace('clé serveur', 'absente'); throw new Error('serveur de notifications pas encore activé'); }
    let reg = swReg;
    if (!reg) { try { reg = await withTimeout(navigator.serviceWorker.ready, 10000, 'service worker'); } catch (e) { trace('service worker', e.message); throw e; } }
    let sub;
    try {
      if (localStorage.getItem('tradcenter.pushkey') && localStorage.getItem('tradcenter.pushkey') !== key) {
        const old = await reg.pushManager.getSubscription(); if (old) await old.unsubscribe().catch(() => { });
      }
      try { sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) }), 20000, 'abonnement Apple/Google'); }
      catch (e) {
        if (/délai/.test(e.message)) throw e;
        const old = await reg.pushManager.getSubscription();
        if (!old) throw e;
        await old.unsubscribe().catch(() => { });
        sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) }), 20000, 'abonnement Apple/Google');
      }
    } catch (e) { trace('abonnement', (e.name || '') + ' ' + e.message); throw e; }
    trace('abonné, enregistrement');
    const pr = prefs();
    try {
      await withTimeout(me().update({ [field()]: { sub: JSON.parse(JSON.stringify(sub)), prefs: { transfers: pr.transfers !== false, prices: pr.prices || 'normal' }, alerts: pr.alerts || [], at: Date.now() }, updatedAt: Date.now() }), 15000, 'enregistrement');
    } catch (e) { trace('enregistrement', (e.code || '') + ' ' + e.message); throw e; }
    trace('terminé');
    try { localStorage.setItem('tradcenter.pushsub', '1'); localStorage.setItem('tradcenter.pushkey', key); } catch (e) { }
  };
  NT.syncPrefs = async function () {
    if (!NT.subscribed() || !N.user || !N.db()) return;
    const pr = prefs();
    try { await me().update({ [field() + '.prefs']: { transfers: pr.transfers !== false, prices: pr.prices || 'normal' }, [field() + '.alerts']: pr.alerts || [], [field() + '.at']: Date.now(), updatedAt: Date.now() }); } catch (e) { }
  };
  NT.pullAlerts = async function () { };
  NT.disablePush = async function () {
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) { }
    try { if (N.user) await me().update({ [field()]: firebase.firestore.FieldValue.delete() }); } catch (e) { }
    try { localStorage.removeItem('tradcenter.pushsub'); } catch (e) { }
  };

  /* ---------------- Fenêtre de réglages ---------------- */
  NT.open = async function () {
    await NT.pullAlerts();
    const pr = prefs();
    const perm = supported() ? Notification.permission : 'unsupported';
    let status;
    const ios = isIOS(), sa = standalone();
    const android = /android/i.test(navigator.userAgent);
    if (ios && !sa) status = `<div class="nbox warn">📲 <b>Sur iPhone, les notifications ne marchent que dans l'appli installée</b>, jamais dans Safari ou Chrome.<br>
        1. Dans Safari, touchez Partager ⬆️ → « Sur l'écran d'accueil » → Ajouter.<br>
        2. Fermez le navigateur et ouvrez Trad Center <b>depuis la nouvelle icône</b>.<br>
        3. Reconnectez-vous (l'appli installée a sa propre mémoire), puis 🔔 → Activer.<br>
        (iOS 16.4 minimum : Réglages → Général → Informations → Version.)</div><button class="btn btn-sm" data-n="install">Voir comment installer</button>`;
    else if (!supported()) status = '<div class="nbox warn">Ce navigateur ne gère pas les notifications. Utilisez Chrome (Android) ou l\'appli installée (iPhone).</div>';
    else if (perm === 'denied') status = `<div class="nbox warn">🔕 <b>Le téléphone bloque les notifications de Trad Center.</b><br>${ios
      ? 'Ouvrez <b>Réglages → Notifications → Trad Center</b> et activez « Autoriser les notifications », puis rouvrez l\'appli.'
      : android ? 'Dans Chrome : touchez l\'icône à gauche de l\'adresse (ou ⋮ → ℹ️ Infos) → <b>Autorisations → Notifications → Autoriser</b>. Si l\'appli est installée : Paramètres Android → Applications → Trad Center → Notifications.'
      : 'Autorisez les notifications pour ce site dans les réglages du navigateur (icône à gauche de l\'adresse).'}</div>`;
    else if (perm !== 'granted') status = '<div class="nbox">🔔 Recevez une notification pour les envois d\'argent, les grosses hausses et chutes, et vos alertes de prix.</div><button class="btn btn-gold btn-xl" data-n="enable">🔔 Activer les notifications</button>';
    else status = (NT.pushError ? `<div class="nbox warn">⚠️ Le serveur de notifications a refusé l'abonnement (${esc(NT.pushError)}). Les notifications marchent quand l'appli est ouverte.</div>` : '') + `<div class="nbox ok">✅ Notifications activées${NT.subscribed() ? ' — <b>même appli fermée</b>' : ' (appli ouverte)'}.</div>
      ${!NT.subscribed() && pushSupported() && N.user && N.profile ? '<button class="btn btn-gold" data-n="enable">📡 Recevoir aussi quand l\'appli est fermée</button>' : ''}
      ${!N.user && N.enabled ? '<p class="hint">Connectez-vous (onglet 👥 Amis) pour les recevoir aussi quand l\'appli est fermée et être prévenu des envois.</p>' : ''}`;
    const key = await NT.serverKey();
    const diag = `<p class="diag">Diagnostic : ${ios ? 'iPhone' : android ? 'Android' : 'ordinateur'} · appli installée : ${sa ? 'oui' : 'non'} · autorisation : ${supported() ? perm : 'indisponible'} · push : ${pushSupported() ? 'oui' : 'non'} · compte : ${N.user ? 'oui' : 'non'} · serveur : ${key ? 'prêt' : 'non'} · abonné : ${NT.subscribed() ? 'oui' : 'non'}${NT.lastStep ? ' · étape : ' + esc(NT.lastStep) : ''} · v11</p>`;
    const opts = TC.ASSETS.map(a => `<option value="${a.id}">${a.id} — ${esc(a.name)}</option>`).join('');
    const md = TC.modal(`<h2>🔔 Notifications</h2><div class="modal-body">${status}
      <h4>Que voulez-vous recevoir ?</h4>
      <label class="tgl"><input type="checkbox" id="n-tr" ${pr.transfers !== false ? 'checked' : ''}><span>💸 Envois d'argent / crypto reçus et demandes d'ami</span></label>
      <div class="fld">📈 Grosses hausses et chutes des marchés
        <div class="seg seg-3" id="n-pr"><button data-v="off" class="${pr.prices === 'off' ? 'active' : ''}">Aucune</button><button data-v="normal" class="${pr.prices === 'normal' ? 'active' : ''}">Grosses</button><button data-v="sensible" class="${pr.prices === 'sensible' ? 'active' : ''}">Sensible</button></div>
        <small>Grosses : Bitcoin/Ethereum ±3 % en 1 h ou ±5 % en 24 h, autres cryptos ±6 %/±10 %, actions ±4 %/±6 %, indices ±1,5 %/±2,5 %. Sensible : moitié moins.</small></div>
      <h4>🎯 Mes alertes de prix</h4>
      <div id="n-alerts"></div>
      <div class="nalert-add"><select id="n-asset" class="sel">${opts}</select>
        <div class="hint">Me prévenir quand le prix atteint :</div>
        <div class="inp"><input id="n-price" type="number" step="any" inputmode="decimal" placeholder="Prix"><span>€</span></div>
        <button class="btn btn-gold" data-n="add">Ajouter l'alerte</button></div>
      ${perm === 'granted' ? '<button class="btn btn-ghost btn-sm" data-n="test">Envoyer une notification de test</button>' : ''}
      ${NT.subscribed() ? '<button class="btn btn-ghost btn-sm" data-n="off">Ne plus recevoir quand l\'appli est fermée</button>' : ''}
      ${diag}</div>`, { cls: 'wide' });
    const el = md.el;
    const sel = el.querySelector('#n-asset'); sel.value = TC.UI.sel;
    const fillPrice = () => { const p = D.eur(sel.value); el.querySelector('#n-price').placeholder = p ? 'actuel : ' + fmt.num(p, p < 1 ? 6 : 2) : 'Prix'; };
    sel.onchange = fillPrice; fillPrice();
    const renderAlerts = () => {
      el.querySelector('#n-alerts').innerHTML = pr.alerts.length ? pr.alerts.map(al => { const a = TC.assetById[al.asset]; return `<div class="req"><span>${a ? esc(a.name) : al.asset}</span><span class="muted">${al.op === '>' ? 'au-dessus de' : 'sous'} <b>${fmt.eur(al.price)}</b> · actuel ${fmt.eur(D.eur(al.asset))}</span><button class="btn btn-sm btn-ghost" data-del="${al.id}">✕</button></div>`; }).join('') : '<div class="hint">Aucune alerte. Exemple : « Prévenez-moi si le Bitcoin dépasse 100 000 € ».</div>';
    };
    renderAlerts();
    const save = () => { G.save(); NT.syncPrefs(); };
    el.querySelector('#n-tr').onchange = e => { pr.transfers = e.target.checked; save(); };
    el.querySelector('#n-pr').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; pr.prices = b.dataset.v; el.querySelectorAll('#n-pr button').forEach(x => x.classList.toggle('active', x === b)); save(); };
    el.querySelector('.modal-card').addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.del) { pr.alerts = pr.alerts.filter(a => a.id !== b.dataset.del); save(); renderAlerts(); return; }
      const n = b.dataset.n;
      if (n === 'add') {
        const price = +el.querySelector('#n-price').value; const asset = sel.value;
        if (!(price > 0)) { TC.toast('Entrez un prix', 'bad'); return; }
        const cur = D.eur(asset);
        const realOp = cur && price < cur ? '<' : '>'; // hausse ou baisse selon le cours actuel
        pr.alerts.push({ id: Math.random().toString(36).slice(2, 9), asset, op: realOp, price });
        if (pr.alerts.length > 20) pr.alerts.shift();
        el.querySelector('#n-price').value = ''; save(); renderAlerts();
        TC.toast(`🎯 Alerte ajoutée : ${asset} ${realOp === '>' ? 'au-dessus de' : 'sous'} ${fmt.eur(price)}`, 'ok');
        return;
      }
      if (n === 'enable') {
        b.disabled = true; b.textContent = '⏳ Activation…';
        try {
          const r = await NT.enable(); md.close();
          if (r === 'local') TC.toast('⚠️ Abonnement appli fermée impossible : ' + esc(NT.pushError || '') + '. Envoyez une capture de 🔔 à Claude.', 'bad', 10000);
          else TC.toast('🔔 Notifications activées !', 'ok');
          NT.open();
        }
        catch (er) {
          b.disabled = false; b.textContent = '🔔 Réessayer';
          TC.toast(er.message === 'denied' ? '🔕 Le téléphone a refusé les notifications : ouvrez 🔔 pour voir comment les autoriser.' : er.message === 'ios-install' ? '📲 Installez d\'abord l\'appli sur l\'écran d\'accueil.' : '⚠️ Impossible d\'activer : ' + (er.message || er), 'bad', 6000);
        }
        return;
      }
      if (n === 'test') { const reg = await navigator.serviceWorker.getRegistration(); if (reg) reg.showNotification('🔔 Test Trad Center', { body: 'Les notifications fonctionnent !', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'test' }); return; }
      if (n === 'off') { await NT.disablePush(); md.close(); TC.toast('Notifications appli fermée désactivées', 'info'); return; }
      if (n === 'install') { md.close(); $('#b-install').click(); }
    });
  };

  /* ---------------- Branchements ---------------- */
  setInterval(scan, 30000);
  setTimeout(scan, 20000);
  N.on((type, d) => {
    if (type === 'received' && prefs().transfers !== false && document.hidden) {
      NT.show(`💸 ${d.fromPseudo} vous a envoyé ${d.kind === 'cash' ? fmt.eur(d.eur) : fmt.qty(d.qty) + ' ' + d.asset}`, d.msg ? `« ${d.msg} »` : '', 'transfer', '?tab=social');
    }
    if (type === 'linked' && supported() && Notification.permission === 'granted' && pushSupported() && !NT.subscribed()) NT.subscribe().catch(() => { });
    if (type === 'linked' && NT.subscribed() && supported() && Notification.permission === 'granted') NT.subscribe().catch(() => { });
  });
  document.addEventListener('click', e => { if (e.target.closest('#b-notif')) NT.open(); });
})();

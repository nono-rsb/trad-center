/* Trad Center — mode en ligne : comptes e-mail, sauvegarde cloud, amis, envois d'argent / crypto, classement.
 * Backend : Firebase Authentication + Cloud Firestore (voir js/config.js et firebase/firestore.rules).
 */
(function () {
  const N = TC.Net = {
    enabled: !!TC.FIREBASE, ready: false, user: null, profile: null, needPseudo: false,
    friends: [], incoming: [], outgoing: [], board: null, boardScope: 'week', error: null,
  };
  const G = TC.Game;
  const subs = [];
  N.on = f => subs.push(f);
  const emit = (type, data) => subs.forEach(f => { try { f(type, data); } catch (e) { console.error(e); } });
  N.AVATARS = ['🦁', '🐺', '🦊', '🐯', '🦈', '🐋', '🐉', '🦅', '🐂', '🐎', '👑', '💎', '🚀', '🔥', '😎', '🤑', '🐸', '🐶', '🐱', '🦄'];

  let auth = null, db = null, unsubs = [], syncT = null, linked = false;
  const pairId = (a, b) => a < b ? a + '_' + b : b + '_' + a;
  // Pseudo affiché : lettres (accents compris), chiffres et _ ; identifiant unique : sans accents, en minuscules
  const PSEUDO_RE = /^[\p{L}0-9_]{3,16}$/u;
  const KEY_RE = /^[a-z0-9_]{3,16}$/;
  const keyOf = p => (p || '').trim().replace(/^@/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[œ]/gi, 'oe').replace(/[æ]/gi, 'ae').replace(/ß/g, 'ss').toLowerCase();
  const PSEUDO_ERR = 'Pseudo : 3 à 16 caractères, lettres, chiffres ou _ (pas d\'espace ni de symbole).';
  function checkPseudo(p) {
    p = (p || '').trim().replace(/\s+/g, '_');
    if (!PSEUDO_RE.test(p) || !KEY_RE.test(keyOf(p))) throw userErr(PSEUDO_ERR);
    return p;
  }
  N.keyOf = keyOf;
  // Profil tel qu'affiché : un pseudo changé (displayName) remplace le pseudo d'origine
  const prof = (id, data) => Object.assign({ uid: id }, data, { pseudo: (data && data.displayName) || (data && data.pseudo) });
  N.prof = prof;
  N.db = () => db;
  // Demande au serveur de notifications de prévenir un autre joueur (même appli fermée).
  // Le message est rangé dans la « boîte d'envoi » de son propre profil ; le serveur rédige le texte lui-même.
  N.notifyPlayer = async function (to, kind, extra) {
    if (!db || !N.user) return;
    try {
      const ref = db.collection('users').doc(N.user.uid);
      const snap = await ref.get();
      const now = Date.now();
      const box = ((snap.exists && snap.data().outbox) || []).filter(m => now - m.at < 24 * 3600000).slice(-29);
      box.push(Object.assign({ id: Math.random().toString(36).slice(2, 12), to, kind, at: now }, extra || {}));
      await ref.update({ outbox: box, updatedAt: now });
    } catch (e) { console.warn('notify', e); }
  };
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script ' + src)); document.head.appendChild(s); });
  }

  N.errMsg = function (e) {
    const c = (e && (e.code || e.message)) || '';
    const M = {
      'auth/email-already-in-use': 'Cette adresse e-mail a déjà un compte. Connectez-vous.',
      'auth/invalid-email': 'Adresse e-mail invalide.',
      'auth/weak-password': 'Mot de passe trop faible (6 caractères minimum).',
      'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
      'auth/invalid-login-credentials': 'E-mail ou mot de passe incorrect.',
      'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
      'auth/user-not-found': 'Aucun compte avec cette adresse e-mail.',
      'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
      'auth/network-request-failed': 'Pas de connexion internet.',
      'auth/missing-password': 'Entrez un mot de passe.',
      'permission-denied': 'Action refusée par le serveur.',
      'unavailable': 'Serveur injoignable, réessayez.',
    };
    for (const k in M) if (c.includes(k)) return M[k];
    return e && e.userMsg ? e.userMsg : 'Erreur : ' + (e && e.message ? e.message : c);
  };
  const userErr = msg => Object.assign(new Error(msg), { userMsg: msg });

  /* ---------------- Initialisation ---------------- */
  N.init = async function () {
    if (!N.enabled) return;
    try {
      if (!window.firebase) {
        await loadScript('js/vendor/firebase/firebase-app-compat.js');
        await loadScript('js/vendor/firebase/firebase-auth-compat.js');
        await loadScript('js/vendor/firebase/firebase-firestore-compat.js');
      }
      firebase.initializeApp(TC.FIREBASE);
      auth = firebase.auth(); db = firebase.firestore();
      auth.languageCode = 'fr';
      if (TC.FIREBASE_EMULATOR) {
        auth.useEmulator('http://' + TC.FIREBASE_EMULATOR + ':9099', { disableWarnings: true });
        db.useEmulator(TC.FIREBASE_EMULATOR, 8080);
      }
      auth.onAuthStateChanged(onAuth);
    } catch (e) {
      console.error(e); N.error = 'Impossible de charger le mode en ligne'; N.ready = true; emit('change');
    }
  };

  async function onAuth(user) {
    unsubs.forEach(u => u()); unsubs = []; linked = false;
    N.user = user; N.profile = null; N.needPseudo = false; N.friends = []; N.incoming = []; N.outgoing = [];
    if (!user) { N.ready = true; emit('change'); return; }
    if (N.creating) { N.ready = true; return; } // l'inscription en cours s'occupe du reste
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      if (!snap.exists) { N.needPseudo = true; N.ready = true; emit('change'); return; }
      N.profile = prof(user.uid, snap.data());
      N.ready = true; emit('change');
      await linkSave();
    } catch (e) { console.error(e); N.error = N.errMsg(e); N.ready = true; emit('change'); }
  }

  /* ---------------- Comptes ---------------- */
  N.pseudoFree = async function (pseudo) {
    const s = await db.collection('usernames').doc(keyOf(pseudo)).get();
    return !s.exists;
  };
  async function createProfile(uid, pseudo) {
    pseudo = checkPseudo(pseudo);
    const lower = keyOf(pseudo);
    const prof = { pseudo, pseudoLower: lower, avatar: N.AVATARS[Math.floor(Math.random() * N.AVATARS.length)], nw: G.netWorth(), rank: G.rank().r[1], items: 0, topItem: null, createdAt: Date.now(), updatedAt: Date.now() };
    const b = db.batch();
    b.set(db.collection('usernames').doc(lower), { uid });
    b.set(db.collection('users').doc(uid), prof);
    try { await b.commit(); } catch (e) {
      if (String(e.code).includes('permission-denied')) throw userErr('Ce pseudo est déjà pris.');
      throw e;
    }
    return prof;
  }
  N.signUp = async function (email, pw, pseudo) {
    pseudo = checkPseudo(pseudo);
    if (!(await N.pseudoFree(pseudo))) throw userErr('Ce pseudo est déjà pris.');
    N.creating = true;
    try {
      const cred = await auth.createUserWithEmailAndPassword(email.trim(), pw);
      try { N.profile = await createProfile(cred.user.uid, pseudo); await applyReferral(); }
      catch (e) { N.needPseudo = true; emit('change'); throw e; }
      N.needPseudo = false;
      try { await cred.user.sendEmailVerification(); } catch (e) { }
      emit('change');
      await linkSave();
    } finally { N.creating = false; }
  };
  N.choosePseudo = async function (pseudo) {
    pseudo = checkPseudo(pseudo);
    if (!(await N.pseudoFree(pseudo))) throw userErr('Ce pseudo est déjà pris.');
    N.profile = await createProfile(N.user.uid, pseudo); await applyReferral();
    N.needPseudo = false; emit('change');
    await linkSave();
  };
  N.signIn = (email, pw) => auth.signInWithEmailAndPassword(email.trim(), pw);
  N.resetPassword = email => auth.sendPasswordResetEmail(email.trim());
  N.resendVerification = () => N.user.sendEmailVerification();
  N.refreshUser = async () => { await N.user.reload(); N.user = auth.currentUser; emit('change'); };
  N.signOut = async function () {
    await N.flush();
    await auth.signOut();
    G.reset(false); // l'appareil repart sur une partie invité ; la partie du compte reste en ligne
    location.reload();
  };
  // Changer de pseudo : le nouveau nom est réservé dans « usernames » (unique), puis l'ancien est libéré.
  // Le pseudo d'origine du profil ne change pas (règles Firestore) : le nouveau va dans displayName.
  N.PSEUDO_COOLDOWN = 24 * 3600000;
  N.changePseudo = async function (p) {
    p = checkPseudo(p);
    const uid = N.user.uid, key = keyOf(p);
    const oldKey = N.profile.nameKey || N.profile.pseudoLower;
    if (p === N.profile.pseudo) throw userErr('C\'est déjà ton pseudo.');
    const last = N.profile.pseudoChangedAt || 0;
    if (Date.now() - last < N.PSEUDO_COOLDOWN) throw userErr('Tu pourras rechanger de pseudo dans ' + TC.fmt.dur(N.PSEUDO_COOLDOWN - (Date.now() - last)) + '.');
    const ref = db.collection('users').doc(uid);
    if (key !== oldKey) {
      try { await db.collection('usernames').doc(key).set({ uid }); } // échoue si le pseudo appartient déjà à quelqu'un
      catch (e) { if (String(e.code).includes('permission-denied')) throw userErr('Ce pseudo est déjà pris.'); throw e; }
      try { await ref.update({ displayName: p, nameKey: key, pseudoChangedAt: Date.now(), updatedAt: Date.now() }); }
      catch (e) { await db.collection('usernames').doc(key).delete().catch(() => { }); throw e; }
      if (oldKey) await db.collection('usernames').doc(oldKey).delete().catch(() => { });
    } else {
      await ref.update({ displayName: p, pseudoChangedAt: Date.now(), updatedAt: Date.now() }); // même nom, accents ou majuscules
    }
    Object.assign(N.profile, { pseudo: p, displayName: p, nameKey: key, pseudoChangedAt: Date.now() });
    emit('change');
  };

  N.setAvatar = async function (a) {
    await db.collection('users').doc(N.user.uid).update({ avatar: a, updatedAt: Date.now() });
    N.profile.avatar = a; emit('change');
  };

  /* ---------------- Sauvegarde cloud ---------------- */
  function pristine(s) { return !s.log.length && !s.owned.length && Math.abs(s.cash - G.START_CASH) < 1e-9; }
  function applyCloud(state) {
    G.adopt(state);
    location.reload();
  }
  async function linkSave() {
    const uid = N.user.uid; const local = G.state;
    const snap = await db.collection('saves').doc(uid).get();
    if (!snap.exists) {
      if (local.owner && local.owner !== uid) { G.reset(true); }
      G.state.owner = uid; linked = true; G.save(true); await N.flush(); startListeners(); emit('linked'); return;
    }
    const cloud = JSON.parse(snap.data().state);
    cloud.owner = uid;
    if (local.owner === uid) {
      if ((cloud.updatedAt || 0) > (local.updatedAt || 0) + 1000) return applyCloud(cloud);
    } else if (local.owner || pristine(local)) {
      return applyCloud(cloud);
    } else {
      const choice = await emitAsk(cloud, local);
      if (choice === 'cloud') return applyCloud(cloud);
      local.owner = uid;
    }
    linked = true; G.save(true); await N.flush(); startListeners(); emit('linked');
  }
  function emitAsk(cloud, local) { return new Promise(res => emit('askSave', { cloud, local, res })); }

  N.queueSync = function () {
    if (!linked || !N.user) return;
    clearTimeout(syncT); syncT = setTimeout(N.flush, 4000);
  };
  N.flush = async function () {
    clearTimeout(syncT);
    if (!linked || !N.user || !db) return;
    const s = G.state; const nw = G.netWorth();
    const top = s.owned.slice().sort((a, b) => b.price - a.price)[0];
    try {
      await db.collection('saves').doc(N.user.uid).set({ state: JSON.stringify(s), updatedAt: s.updatedAt || Date.now(), nw });
      const pub = { nw, rank: G.rank(nw).r[1], items: s.owned.length, topItem: top ? top.item : null, updatedAt: Date.now() };
      if (TC.Weekly) pub[TC.Weekly.current().field] = TC.Weekly.gain();
      if (TC.Style) { const m = TC.Style.mine(); pub.look = m.look || {}; pub.plusUntil = m.plusUntil || 0; }
      if (TC.Xmas && TC.Xmas.raceGain() != null) { pub.xmasGain = TC.Xmas.raceGain(); pub.xmasYear = new Date().getFullYear(); }
      await db.collection('users').doc(N.user.uid).update(pub);
      Object.assign(N.profile || {}, pub);
      N.lastSync = Date.now(); emit('synced');
    } catch (e) { console.warn('sync', e); }
  };
  window.addEventListener('pagehide', () => { if (linked) N.flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && linked) N.flush(); });

  /* ---------------- Écoutes temps réel ---------------- */
  function startListeners() {
    const uid = N.user.uid;
    unsubs.push(db.collection('friendships').where('members', 'array-contains', uid).onSnapshot(async snap => {
      const ids = snap.docs.map(d => d.data().members.find(m => m !== uid));
      N.friends = await loadProfiles(ids);
      emit('change');
    }, e => console.warn(e)));
    unsubs.push(db.collection('friendRequests').where('to', '==', uid).onSnapshot(snap => {
      const before = N.incoming.length;
      N.incoming = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      if (N.incoming.length > before && before >= 0 && N._reqInit) emit('request', N.incoming[N.incoming.length - 1]);
      N._reqInit = true; emit('change');
    }, e => console.warn(e)));
    unsubs.push(db.collection('friendRequests').where('from', '==', uid).onSnapshot(snap => {
      N.outgoing = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); emit('change');
    }, e => console.warn(e)));
    unsubs.push(db.collection('transfers').where('to', '==', uid).where('claimed', '==', false).onSnapshot(snap => {
      snap.docChanges().forEach(ch => { if (ch.type === 'added') claim(ch.doc.ref); });
    }, e => console.warn(e)));
    const t = setInterval(() => { if (N.friends.length) loadProfiles(N.friends.map(f => f.uid)).then(f => { N.friends = f; emit('change'); }); }, 60000);
    unsubs.push(() => clearInterval(t));
  }
  async function loadProfiles(ids) {
    const out = await Promise.all(ids.map(id => db.collection('users').doc(id).get().then(s => s.exists ? prof(id, s.data()) : null).catch(() => null)));
    return out.filter(Boolean).sort((a, b) => (b.nw || 0) - (a.nw || 0));
  }
  const claiming = new Set();
  async function claim(ref) {
    if (claiming.has(ref.id)) return; claiming.add(ref.id);
    try {
      const data = await db.runTransaction(async tx => {
        const s = await tx.get(ref);
        if (!s.exists || s.data().claimed) return null;
        tx.update(ref, { claimed: true, claimedAt: Date.now() });
        return s.data();
      });
      if (data) { G.receive(data); emit('received', data); N.flush(); }
    } catch (e) { console.warn('claim', e); }
    claiming.delete(ref.id);
  }

  /* ---------------- Amis ---------------- */
  N.addFriend = async function (pseudo) {
    pseudo = (pseudo || '').trim().replace(/^@/, '');
    if (!pseudo) throw userErr('Entrez un pseudo.');
    const k = keyOf(pseudo);
    if (!KEY_RE.test(k)) throw userErr(`Aucun joueur nommé « ${pseudo} ».`);
    const u = await db.collection('usernames').doc(k).get();
    if (!u.exists) throw userErr(`Aucun joueur nommé « ${pseudo} ».`);
    const other = u.data().uid; const me = N.user.uid;
    if (other === me) throw userErr('C\'est vous 😄');
    if (N.friends.some(f => f.uid === other)) throw userErr('Vous êtes déjà amis.');
    const reverse = N.incoming.find(r => r.from === other);
    if (reverse) { await N.accept(reverse); return 'accepted'; }
    const op = await db.collection('users').doc(other).get();
    await db.collection('friendRequests').doc(me + '_' + other).set({ from: me, to: other, fromPseudo: N.profile.pseudo, fromAvatar: N.profile.avatar, toPseudo: op.exists ? prof(other, op.data()).pseudo : pseudo, createdAt: Date.now() });
    N.notifyPlayer(other, 'friend');
    return 'sent';
  };
  N.accept = async function (req) {
    const me = N.user.uid; const b = db.batch();
    b.set(db.collection('friendships').doc(pairId(req.from, me)), { members: [req.from, me], createdAt: Date.now() });
    b.delete(db.collection('friendRequests').doc(req.id));
    await b.commit();
    N.notifyPlayer(req.from, 'accept');
  };
  N.decline = req => db.collection('friendRequests').doc(req.id).delete();
  N.removeFriend = uid => db.collection('friendships').doc(pairId(uid, N.user.uid)).delete();

  /* ---------------- Envois ---------------- */
  N.send = async function (friend, kind, asset, amount, msg) {
    const t = G.takeForTransfer(kind, asset, amount);
    if (!t.ok) throw userErr(t.msg);
    try {
      await db.collection('transfers').add({
        from: N.user.uid, to: friend.uid, fromPseudo: N.profile.pseudo, fromAvatar: N.profile.avatar, toPseudo: friend.pseudo,
        kind: t.kind, asset: t.asset, qty: t.qty, eur: t.eur, msg: (msg || '').slice(0, 120), createdAt: Date.now(), claimed: false,
      });
    } catch (e) { G.refundTransfer(t); throw e; }
    G.logSent(t, friend.pseudo);
    N.flush();
    N.notifyPlayer(friend.uid, 'transfer', { asset: t.asset || null, qty: t.qty, eur: t.eur, msg: (msg || '').slice(0, 120) });
    return t;
  };

  /* ---------------- Parrainage ---------------- */
  N.REF_BONUS = 20;
  N.inviteLink = () => location.origin + location.pathname + '?ref=' + encodeURIComponent(N.user.uid);
  // Nouveau joueur arrivé par un lien : on note le parrain et on lui envoie une demande d'ami
  async function applyReferral() {
    let ref = null; try { ref = localStorage.getItem('tradcenter.ref'); } catch (e) { }
    if (!ref || !N.user || !N.profile || ref === N.user.uid || N.profile.referredBy) return;
    if (Date.now() - (N.profile.createdAt || 0) > 24 * 3600000) return; // seulement pour un compte tout neuf
    try {
      const p = await db.collection('users').doc(ref).get(); if (!p.exists || p.data().bot) return;
      await db.collection('users').doc(N.user.uid).update({ referredBy: ref, updatedAt: Date.now() });
      N.profile.referredBy = ref;
      await db.collection('friendRequests').doc(N.user.uid + '_' + ref).set({ from: N.user.uid, to: ref, fromPseudo: N.profile.pseudo, fromAvatar: N.profile.avatar, toPseudo: prof(ref, p.data()).pseudo, createdAt: Date.now() });
      N.notifyPlayer(ref, 'friend');
    } catch (e) { console.warn('ref', e); }
  }
  // Appelé quand le filleul a activé les notifications : le parrain peut toucher sa prime
  N.referralDone = async function () {
    if (!N.profile || !N.profile.referredBy || N.profile.refOk) return;
    try {
      await db.collection('users').doc(N.user.uid).update({ refOk: true, updatedAt: Date.now() });
      N.profile.refOk = true;
      N.notifyPlayer(N.profile.referredBy, 'referral');
    } catch (e) { console.warn('ref', e); }
  };
  // Le parrain encaisse 20 € par filleul validé (une seule fois chacun)
  N.checkReferrals = async function () {
    if (!db || !N.user || !linked) return;
    try {
      const snap = await db.collection('users').where('referredBy', '==', N.user.uid).get();
      const paid = G.state.refPaid || (G.state.refPaid = {});
      N.referrals = snap.docs.map(d => ({ uid: d.id, pseudo: prof(d.id, d.data()).pseudo, ok: !!d.data().refOk, paid: !!paid[d.id] }));
      for (const d of snap.docs) {
        if (!d.data().refOk || paid[d.id]) continue;
        paid[d.id] = Date.now();
        G.state.cash += N.REF_BONUS;
        G.state.log.unshift({ t: Date.now(), kind: 'bonus', eur: N.REF_BONUS, who: prof(d.id, d.data()).pseudo });
        G.save(true);
        emit('referral', { pseudo: prof(d.id, d.data()).pseudo, eur: N.REF_BONUS });
      }
      emit('change');
    } catch (e) { console.warn('ref', e); }
  };
  N.on(t => { if (t === 'linked') { N.checkReferrals(); applyReferral(); } });
  setInterval(() => N.checkReferrals(), 120000);

  /* ---------------- Noël ---------------- */
  // Père Noël secret : 25 € offerts par la banque du jeu (le donneur ne paie rien)
  N.santaGift = async function (friend, amount, msg) {
    await db.collection('transfers').add({ from: N.user.uid, to: friend.uid, fromPseudo: N.profile.pseudo, fromAvatar: '🎅', toPseudo: friend.pseudo, kind: 'cash', asset: null, qty: amount, eur: amount, msg: msg || '🎅 Cadeau du Père Noël secret', createdAt: Date.now(), claimed: false });
    N.notifyPlayer(friend.uid, 'santa', { eur: amount });
  };
  N.loadXmasBoard = async function () {
    const y = new Date().getFullYear();
    const snap = await db.collection('users').orderBy('xmasGain', 'desc').limit(30).get();
    N.xmasBoard = snap.docs.map(d => prof(d.id, d.data())).filter(u => !u.bot && u.xmasYear === y && !(TC.Admin && TC.Admin.isBanned(d.id))).slice(0, 10);
    N.xmasChamp = N.xmasBoard.length ? N.xmasBoard[0].uid : null;
    return N.xmasBoard;
  };

  /* ---------------- Classement ---------------- */
  N.loadBoard = async function (scope) {
    N.boardScope = scope;
    if (scope === 'friends') { N.board = null; emit('change'); return; }
    const snap = await db.collection('users').orderBy('nw', 'desc').limit(50).get();
    N.board = snap.docs.map(d => prof(d.id, d.data())).filter(u => !u.bot && !(TC.Admin && TC.Admin.isBanned(d.id)));
    emit('change');
  };
})();

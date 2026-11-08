/* Trad Center — mode en ligne : comptes e-mail, sauvegarde cloud, amis, envois d'argent / crypto, classement.
 * Backend : Firebase Authentication + Cloud Firestore (voir js/config.js et firebase/firestore.rules).
 */
(function () {
  const N = TC.Net = {
    enabled: !!TC.FIREBASE, ready: false, user: null, profile: null, needPseudo: false,
    friends: [], incoming: [], outgoing: [], board: null, boardScope: 'friends', error: null,
  };
  const G = TC.Game;
  const subs = [];
  N.on = f => subs.push(f);
  const emit = (type, data) => subs.forEach(f => { try { f(type, data); } catch (e) { console.error(e); } });
  N.AVATARS = ['🦁', '🐺', '🦊', '🐯', '🦈', '🐋', '🐉', '🦅', '🐂', '🐎', '👑', '💎', '🚀', '🔥', '😎', '🤑', '🐸', '🐶', '🐱', '🦄'];

  let auth = null, db = null, unsubs = [], syncT = null, linked = false;
  const pairId = (a, b) => a < b ? a + '_' + b : b + '_' + a;
  const PSEUDO_RE = /^[a-zA-Z0-9_]{3,16}$/;
  N.db = () => db;
  // Demande au serveur de notifications de prévenir un autre joueur (même appli fermée)
  N.pushTo = function (to, title, body, tag, url) {
    if (!db || !N.user) return;
    db.collection('pushQueue').add({ from: N.user.uid, to, title: title.slice(0, 90), body: body.slice(0, 280), tag: tag || '', url: url || '', createdAt: Date.now() }).catch(e => console.warn('push', e));
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
      N.profile = snap.data();
      N.ready = true; emit('change');
      await linkSave();
    } catch (e) { console.error(e); N.error = N.errMsg(e); N.ready = true; emit('change'); }
  }

  /* ---------------- Comptes ---------------- */
  N.pseudoFree = async function (pseudo) {
    const s = await db.collection('usernames').doc(pseudo.toLowerCase()).get();
    return !s.exists;
  };
  async function createProfile(uid, pseudo) {
    if (!PSEUDO_RE.test(pseudo)) throw userErr('Pseudo : 3 à 16 caractères (lettres, chiffres, _).');
    const lower = pseudo.toLowerCase();
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
    pseudo = (pseudo || '').trim();
    if (!PSEUDO_RE.test(pseudo)) throw userErr('Pseudo : 3 à 16 caractères (lettres, chiffres, _).');
    if (!(await N.pseudoFree(pseudo))) throw userErr('Ce pseudo est déjà pris.');
    N.creating = true;
    try {
      const cred = await auth.createUserWithEmailAndPassword(email.trim(), pw);
      try { N.profile = await createProfile(cred.user.uid, pseudo); }
      catch (e) { N.needPseudo = true; emit('change'); throw e; }
      N.needPseudo = false;
      try { await cred.user.sendEmailVerification(); } catch (e) { }
      emit('change');
      await linkSave();
    } finally { N.creating = false; }
  };
  N.choosePseudo = async function (pseudo) {
    pseudo = (pseudo || '').trim();
    if (!(await N.pseudoFree(pseudo))) throw userErr('Ce pseudo est déjà pris.');
    N.profile = await createProfile(N.user.uid, pseudo);
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
    const out = await Promise.all(ids.map(id => db.collection('users').doc(id).get().then(s => s.exists ? Object.assign({ uid: id }, s.data()) : null).catch(() => null)));
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
    const u = await db.collection('usernames').doc(pseudo.toLowerCase()).get();
    if (!u.exists) throw userErr(`Aucun joueur nommé « ${pseudo} ».`);
    const other = u.data().uid; const me = N.user.uid;
    if (other === me) throw userErr('C\'est vous 😄');
    if (N.friends.some(f => f.uid === other)) throw userErr('Vous êtes déjà amis.');
    const reverse = N.incoming.find(r => r.from === other);
    if (reverse) { await N.accept(reverse); return 'accepted'; }
    const op = await db.collection('users').doc(other).get();
    await db.collection('friendRequests').doc(me + '_' + other).set({ from: me, to: other, fromPseudo: N.profile.pseudo, fromAvatar: N.profile.avatar, toPseudo: op.exists ? op.data().pseudo : pseudo, createdAt: Date.now() });
    N.pushTo(other, `👋 ${N.profile.pseudo} veut être votre ami`, 'Acceptez sa demande dans l\'onglet Amis.', 'friend', '?tab=social');
    return 'sent';
  };
  N.accept = async function (req) {
    const me = N.user.uid; const b = db.batch();
    b.set(db.collection('friendships').doc(pairId(req.from, me)), { members: [req.from, me], createdAt: Date.now() });
    b.delete(db.collection('friendRequests').doc(req.id));
    await b.commit();
    N.pushTo(req.from, `🤝 ${N.profile.pseudo} a accepté votre demande d'ami`, 'Vous pouvez maintenant vous envoyer de l\'argent et des cryptos.', 'friend', '?tab=social');
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
    const what = t.kind === 'cash' ? TC.fmt.eur(t.eur) : TC.fmt.qty(t.qty) + ' ' + t.asset + ' (' + TC.fmt.eur(t.eur) + ')';
    N.pushTo(friend.uid, `💸 ${N.profile.pseudo} vous a envoyé ${what}`, msg ? `« ${msg.slice(0, 120)} »` : 'Ouvrez Trad Center pour en profiter !', 'transfer', '?tab=social');
    return t;
  };

  /* ---------------- Classement ---------------- */
  N.loadBoard = async function (scope) {
    N.boardScope = scope;
    if (scope === 'friends') { N.board = null; emit('change'); return; }
    const snap = await db.collection('users').orderBy('nw', 'desc').limit(50).get();
    N.board = snap.docs.map(d => Object.assign({ uid: d.id }, d.data()));
    emit('change');
  };
})();

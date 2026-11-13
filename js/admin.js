/* Trad Center — mode créateur (réservé au compte du créateur, TC.ADMIN_UID)
 * Ouverture : code secret dans 🎮 Codes de triche. Ne s'ouvre que sur le compte du créateur.
 * Liste des joueurs, fiche détaillée (cash, actifs, positions, paris, historique, codes…),
 * signaux suspects, blocage / déblocage. Les joueurs bloqués voient « Compte suspendu »
 * et disparaissent des classements. Nécessite les règles Firestore à jour (lecture des parties).
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net;
  const A = TC.Admin = { bans: {} };
  A.isAdmin = () => !!(N.user && N.user.uid === TC.ADMIN_UID);
  const banRef = () => N.db().collection('admin').doc('bans');

  /* ---------- Liste des bannis (tous les joueurs la lisent) ---------- */
  A.loadBans = async function () {
    if (!N.db() || !N.user) return;
    try { const s = await banRef().get(); A.bans = (s.exists && s.data().users) || {}; A.allow = (s.exists && s.data().allow) || {}; } catch (e) { }
    await A.loadBot();
    A.enforce();
  };
  /* ---------- Sentinelle, le robot modérateur (compte du serveur, certifié et marqué BOT) ----------
   * Son profil public contient ses signalements (modReports) et ses sanctions (modBlocks), que tous les joueurs lisent. */
  A.bot = null; A.botBlocks = {};
  A.loadBot = async function () {
    try {
      const db = N.db(); if (!db) return;
      if (!A.botUid) { const n = await db.collection('usernames').doc('tradcenter_bot').get(); A.botUid = n.exists ? n.data().uid : null; }
      if (!A.botUid) return;
      const p = await db.collection('users').doc(A.botUid).get();
      if (p.exists) { const first = !A.bot; A.bot = N.prof(A.botUid, p.data()); A.botBlocks = A.bot.modBlocks || {}; if (first && TC.Social && TC.UI && TC.UI.tab === 'social') TC.Social.render(); }
      // compte de Claude (assistant IA du créateur) : son uid est publié par Sentinelle, donc impossible à imiter
      if (A.bot && A.bot.claudeUid) {
        TC.CLAUDE_UID = A.bot.claudeUid;
        const c = await db.collection('users').doc(TC.CLAUDE_UID).get();
        if (c.exists) { const first = !A.claude; A.claude = N.prof(TC.CLAUDE_UID, c.data()); if (first && TC.Social && TC.UI && TC.UI.tab === 'social') TC.Social.render(); }
      }
    } catch (e) { }
  };
  A.botBlocked = uid => { const b = uid && A.botBlocks[uid]; return b && (!b.until || b.until > Date.now()) ? b : null; };
  // blocage « jusqu'au changement de pseudo » : levé dès que le joueur ne porte plus le pseudo refusé
  A.renamedAway = function (uid, b) {
    if (!b || b.need !== 'pseudo') return false;
    const p = N.user && uid === N.user.uid ? N.profile && N.profile.pseudo : ((typeof users !== 'undefined' && users.find(x => x.uid === uid)) || {}).pseudo;
    return !!p && p !== b.pseudo;
  };
  A.isBanned = uid => !!(uid && ((A.bans[uid] && !A.renamedAway(uid, A.bans[uid])) || A.botBlocked(uid)));
  const modRef = () => N.db().collection('admin').doc('mod');
  A.undoBot = async uid => { await modRef().set({ undo: { [uid]: Date.now() } }, { merge: true }); delete A.botBlocks[uid]; };
  A.botName = () => (A.bot && A.bot.pseudo) || 'Sentinelle';
  // fiche publique du robot (onglet Amis)
  A.botCard = function () {
    const b = A.bot; if (!b) return '';
    const nb = Object.keys(A.botBlocks).filter(u => A.botBlocked(u)).length;
    return `<div class="panel sentinel">${TC.Style ? TC.Style.avatar(b, 'm') : '🤖'}<div class="sn-txt"><b>${esc(b.pseudo)}${TC.Style ? TC.Style.badge(b) : ''}</b><small>${esc(b.botRole || 'Modérateur officiel')} · ${b.modRound && Date.now() - b.modRound < 3 * 3600000 ? '🟢 en service' : '⚪ en pause'}</small>
      <p>Je surveille le jeu jour et nuit : triche, doubles comptes, insultes, fausses demandes de récompense. Ceux qui ne respectent pas les règles sont suspendus.</p>
      <div class="sn-stats"><span><b>${b.modTotal || 0}</b> signalement${(b.modTotal || 0) > 1 ? 's' : ''}</span><span><b>${nb}</b> compte${nb > 1 ? 's' : ''} suspendu${nb > 1 ? 's' : ''}</span>${b.modRound ? `<span>dernière ronde ${fmt.time(b.modRound)}</span>` : ''}</div></div></div>`;
  };
  // fiche de Claude (onglet Amis) : qui il est, ses paris pour le fun
  A.claudeCard = function () {
    const c = A.claude; if (!c) return '';
    const g = c.cb || { cash: 10, bets: [], wins: 0, losses: 0 }, bets = (g.bets || []).slice().reverse().slice(0, 4);
    const friend = (N.friends || []).some(f => f.uid === c.uid), asked = (N.outgoing || []).some(r => r.to === c.uid);
    const NAME = id => (TC.assetById && TC.assetById[id] && TC.assetById[id].name) || id;
    return `<div class="panel sentinel claude">${TC.Style ? TC.Style.avatar(c, 'm') : '🧡'}<div class="sn-txt"><b>${esc(c.pseudo)}${TC.Style ? TC.Style.badge(c) : ''}</b><small>${esc(c.role || 'Assistant IA du créateur')}</small>
      <p>Salut ! Je suis Claude, l'IA qui aide le créateur à fabriquer Trad Center. Je réponds aux questions ❓ et j'ajoute au jeu les idées justes. Et je parie un peu, pour le fun 🎲 (hors concours).</p>
      <div class="sn-stats"><span><b>${fmt.eur(c.nw != null ? c.nw : g.cash)}</b></span><span><b>${g.wins || 0}</b> gagné${(g.wins || 0) > 1 ? 's' : ''} · <b>${g.losses || 0}</b> perdu${(g.losses || 0) > 1 ? 's' : ''}</span></div>
      ${(c.recv || []).length ? `<p class="hint">💸 Merci pour vos dons : ${(c.recv || []).slice(-3).reverse().map(r => `<b>${esc(r.from)}</b> ${fmt.eur(r.eur)}`).join(' · ')}</p>` : ''}
      ${bets.length ? `<div class="cl-bets">${bets.map(b => `<div><span>${b.dir === 'up' ? '📈' : '📉'} ${esc(NAME(b.a))}</span><small>${fmt.eur(b.stake)} · ${fmt.time(b.at)}</small><b class="${b.res === 'win' ? 'up' : b.res === 'lose' ? 'down' : ''}">${b.res === 'win' ? '+' + fmt.eur(b.gain) : b.res === 'lose' ? fmt.eur(b.gain) : '⏳ en cours'}</b></div>`).join('')}</div>` : '<p class="hint">Mon premier pari arrive bientôt…</p>'}
      <div class="cl-act">${friend ? '<span class="hint">🤝 On est amis</span>' : asked ? '<span class="hint">✉️ Demande envoyée, j\'accepte vite</span>' : '<button class="btn btn-sm btn-gold" data-addclaude>➕ Ajouter Claude en ami</button>'}<button class="btn btn-sm" data-qa>❓ Me poser une question</button></div></div></div>`;
  };
  document.addEventListener('click', async e => {
    if (!e.target.closest('[data-addclaude]') || !A.claude) return;
    try { await N.addFriend(A.claude.pseudo); TC.toast('✉️ Demande envoyée à Claude : il accepte à son prochain passage', 'ok', 6000); } catch (x) { TC.toast(N.errMsg ? N.errMsg(x) : 'Impossible', 'bad'); }
  });
  A.enforce = function () {
    const me = N.user && N.user.uid;
    const lock = $('#banned');
    const dup = me && N.profile && N.profile.dupOf && N.profile.dupOf.length && !A.allowed(me) && !A.isBanned(me) && !A.isAdmin();
    if (dup) {
      if (lock) return;
      const el = document.createElement('div'); el.id = 'banned';
      el.innerHTML = `<div class="bn-in"><div class="big-emoji">👥</div><h1>Double compte détecté</h1>
        <p>Un autre compte${A.dupNames && A.dupNames.length ? ` (<b>${A.dupNames.map(esc).join(', ')}</b>)` : ''} a déjà joué sur cet appareil. Un seul compte par joueur est autorisé : ce nouveau compte est bloqué.</p>
        <p class="muted">Compte perdu, frère ou sœur sur le même téléphone ? Contacte le créateur du jeu : il peut débloquer ce compte.</p>
        <button class="btn" id="bn-out">Se déconnecter</button></div>`;
      document.body.appendChild(el);
      el.querySelector('#bn-out').onclick = () => N.signOut();
      return;
    }
    const bb = me && !A.bans[me] && !A.isAdmin() && A.botBlocked(me);
    if (bb) {
      if (lock && lock.dataset.k === 'bot' + bb.at) return;
      if (lock) lock.remove();
      const el = document.createElement('div'); el.id = 'banned'; el.dataset.k = 'bot' + bb.at;
      el.innerHTML = `<div class="bn-in"><div class="big-emoji">🤖</div><h1>Compte suspendu</h1>
        <p><b>${esc(A.botName())}</b> ${TC.Style ? TC.Style.badge(A.bot || { bot: true }) : ''}, le robot modérateur du jeu, a suspendu ton compte.</p>
        <div class="nbox warn">${esc(bb.reason || '')}</div>
        ${bb.need === 'pseudo' ? `<p>Choisis un nouveau pseudo correct :</p><div class="bn-ren"><input id="bn-ps" maxlength="20" placeholder="Nouveau pseudo"><button class="btn btn-buy" id="bn-ok">Changer</button></div>
          <p class="muted">Le robot vérifie ton nouveau pseudo et débloque ton compte dans les 10 minutes.</p>`
          : `<p>Fin de la suspension : <b>${fmt.time(bb.until)}</b>.</p>`}
        <p class="muted">Erreur ? Contacte le créateur du jeu : il peut annuler la décision du robot.</p>
        <button class="btn btn-ghost" id="bn-out">Se déconnecter</button></div>`;
      document.body.appendChild(el);
      el.querySelector('#bn-out').onclick = () => N.signOut();
      const ok = el.querySelector('#bn-ok');
      if (ok) ok.onclick = async () => {
        ok.disabled = true;
        try { await N.changePseudo(el.querySelector('#bn-ps').value); TC.toast('✏️ Pseudo changé : le robot va vérifier et débloquer ton compte.', 'ok', 8000); el.querySelector('.bn-ren').innerHTML = `<div class="nbox ok">✅ Nouveau pseudo : <b>${esc(N.profile.pseudo)}</b>. Déblocage dans les 10 minutes.</div>`; }
        catch (e) { TC.toast(N.errMsg(e), 'bad'); ok.disabled = false; }
      };
      return;
    }
    const ab = me && A.bans[me] && !A.isAdmin() && !A.renamedAway(me, A.bans[me]) ? A.bans[me] : null;
    if (ab && ab.need === 'pseudo') { // le créateur exige un nouveau pseudo
      if (lock && lock.dataset.k === 'ren' + ab.at) return;
      if (lock) lock.remove();
      const el = document.createElement('div'); el.id = 'banned'; el.dataset.k = 'ren' + ab.at;
      el.innerHTML = `<div class="bn-in"><div class="big-emoji">✏️</div><h1>Change ton pseudo</h1>
        <p>Le créateur du jeu a bloqué ton compte tant que tu gardes le pseudo <b>${esc(ab.pseudo || '')}</b>.</p>
        ${ab.reason ? `<div class="nbox warn">${esc(ab.reason)}</div>` : ''}
        <p>Choisis un pseudo correct (pas de choses bizarres) pour rejouer tout de suite :</p>
        <div class="bn-ren"><input id="bn-ps" maxlength="20" placeholder="Nouveau pseudo"><button class="btn btn-buy" id="bn-ok">Changer</button></div>
        <button class="btn btn-ghost" id="bn-out">Se déconnecter</button></div>`;
      document.body.appendChild(el);
      el.querySelector('#bn-out').onclick = () => N.signOut();
      el.querySelector('#bn-ok').onclick = async e => {
        e.target.disabled = true;
        try { await N.changePseudo(el.querySelector('#bn-ps').value); TC.toast(`✅ Nouveau pseudo : <b>${esc(N.profile.pseudo)}</b>. Bon jeu !`, 'ok', 6000); A.enforce(); }
        catch (x) { TC.toast(x.userMsg || x.message, 'bad', 6000); e.target.disabled = false; }
      };
      return;
    }
    if (ab) {
      if (lock && !lock.dataset.k) return;
      if (lock) lock.remove();
      const el = document.createElement('div'); el.id = 'banned';
      el.innerHTML = `<div class="bn-in"><div class="big-emoji">⛔</div><h1>Compte suspendu</h1>
        <p>Ton compte a été suspendu par le créateur du jeu${A.bans[me].reason ? ` : « ${esc(A.bans[me].reason)} »` : ''}.</p>
        <p class="muted">Si tu penses que c'est une erreur, contacte-le.</p>
        <button class="btn" id="bn-out">Se déconnecter</button></div>`;
      document.body.appendChild(el);
      el.querySelector('#bn-out').onclick = () => N.signOut();
    } else if (lock) lock.remove();
  };
  /* ---------- Doubles comptes ----------
   * Chaque appareil a un identifiant (tradcenter.device), noté dans le profil (devs).
   * Si un AUTRE compte, créé avant, a déjà joué sur cet appareil, le compte le plus récent est bloqué
   * automatiquement (dupOf dans son profil). Le créateur peut l'autoriser (compte perdu, frère/sœur…)
   * ou le bloquer définitivement depuis le mode créateur. */
  const devId = () => { let d = null; try { d = localStorage.getItem('tradcenter.device'); if (!d) { d = Math.random().toString(36).slice(2, 12); localStorage.setItem('tradcenter.device', d); } } catch (e) { } return d || 'nodevice'; };
  A.allowed = uid => !!(A.allow && A.allow[uid]);
  A.checkDup = async function () {
    if (!N.user || !N.profile || !N.db() || A.isAdmin()) return;
    const uid = N.user.uid, dev = devId();
    const guestNow = N.profile.guest || (N.user && N.user.isAnonymous); // un invité n'est jamais bloqué comme double compte
    try {
      const ref = N.db().collection('users').doc(uid);
      const devs = N.profile.devs || [];
      if (!devs.includes(dev)) { const nd = devs.concat(dev).slice(-8); await ref.update({ devs: nd, updatedAt: Date.now() }); N.profile.devs = nd; }
      if (A.allowed(uid)) { if (N.profile.dupOf) { await ref.update({ dupOf: null }); N.profile.dupOf = null; } return A.enforce(); }
      const snap = await N.db().collection('users').where('devs', 'array-contains', dev).get();
      const mine = N.profile.createdAt || 0;
      if (guestNow) return A.enforce();
      // les comptes invités ne comptent pas : un invité qui crée ensuite son vrai compte n'est pas un tricheur
      const older = snap.docs.filter(d => d.id !== uid && d.id !== TC.ADMIN_UID && !d.data().bot && !d.data().guest && (d.data().createdAt || 0) < mine).map(d => ({ uid: d.id, pseudo: N.prof(d.id, d.data()).pseudo }));
      const dup = older.length ? older.map(o => o.uid) : null;
      if (JSON.stringify(dup) !== JSON.stringify(N.profile.dupOf || null)) { await ref.update({ dupOf: dup, updatedAt: Date.now() }); N.profile.dupOf = dup; }
      A.dupNames = older.map(o => o.pseudo);
    } catch (e) { console.warn('doublon', e); }
    A.enforce();
  };
  N.on(t => { if (t === 'linked') { A.loadBans().then(A.checkDup); A.checkGifts(); } });
  setInterval(() => { if (!document.hidden) { A.loadBans(); A.checkGifts(); } }, 5 * 60000);

  /* ---------- Cadeaux du créateur (ex. rendre l'argent d'un compte perdu) ----------
   * Le créateur ajoute { id, to, eur, msg, at } dans admin/gifts ; le joueur concerné l'encaisse
   * automatiquement à sa prochaine ouverture du jeu (une seule fois par cadeau). */
  const giftRef = () => N.db().collection('admin').doc('gifts');
  let giftBusy = false;
  A.checkGifts = async function () {
    if (giftBusy || !N.db() || !N.user) return; giftBusy = true;
    try {
      const s = await giftRef().get(); const list = (s.exists && s.data().list) || [];
      const S = G.state, seen = S.giftSeen || (S.giftSeen = {}); const got = [];
      list.forEach(g => {
        if (!g || g.to !== N.user.uid || !g.id || seen[g.id]) return;
        seen[g.id] = Date.now();
        if (g.claim && TC.Share && TC.Share.decided) TC.Share.decided(g.claim, !g.refused);
        if (g.fine) { // correction du créateur : retrait discret (pas d'alerte), visible dans le relevé
          const cut = Math.max(0, Math.min(+g.eur || 0, S.cash)); if (!cut) return;
          S.cash -= cut; if (TC.Weekly) TC.Weekly.flow(-cut);
          S.log.unshift({ t: Date.now(), kind: 'fine', eur: cut, asset: '🛡️ Correction du créateur' }); G.save(true); if (N.flush) N.flush();
          return;
        }
        if (g.refused) { TC.toast('📣 Ta demande de récompense a été refusée. Tu peux renvoyer une meilleure capture (bouton 📣 en bas).', 'bad', 8000); return; }
        const eur = Math.max(0, Math.min(+g.eur || 0, 1e9)); if (!eur) return;
        S.cash += eur; if (TC.Weekly) TC.Weekly.flow(eur);
        S.log.unshift({ t: Date.now(), kind: 'bonus', eur, asset: 'Cadeau du créateur 🎁' });
        got.push({ eur, msg: g.msg });
      });
      if (got.length) {
        G.save(true); if (N.flush) N.flush(); TC.sound('kaching'); TC.confetti(200);
        const tot = got.reduce((t, g) => t + g.eur, 0);
        TC.modal(`<div class="center"><div class="big-emoji">🎁</div><h2>Cadeau du créateur du jeu !</h2>
          <p>Tu reçois <b class="up">+${fmt.eur(tot)}</b> 🎉</p>${got.filter(g => g.msg).map(g => `<p class="muted">« ${esc(g.msg)} »</p>`).join('')}
          <div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>Merci ! 💰</button></div></div>`);
        if (TC.App) TC.App.after();
      }
    } catch (e) { }
    giftBusy = false;
  };
  A.gift = async function (uid, pseudo, eur, msg, extra) {
    if (!A.isAdmin()) return;
    eur = Math.round(+eur * 100) / 100;
    if (!(eur > 0) && !(extra && extra.refused)) return TC.toast('Montant invalide', 'bad');
    const g = Object.assign({ id: Math.random().toString(36).slice(2, 12), to: uid, eur, msg: String(msg || '').slice(0, 120), at: Date.now(), pseudo: pseudo || '' }, extra || {});
    const s = await giftRef().get(); const list = ((s.exists && s.data().list) || []).filter(x => Date.now() - x.at < 60 * 86400000).slice(-199);
    list.push(g);
    await giftRef().set({ list });
    if (eur > 0 && !g.fine) N.notifyPlayer(uid, 'gift', { eur });
    return g;
  };

  /* ---------- Panneau créateur ---------- */
  let users = [], filter = '';
  function flags(u) {
    const f = [];
    if ((u.nw || 0) > 100000 && !(u.items > 0)) f.push('💰 grosse fortune');
    if (u.weekGainFlag) f.push('📈 gain hebdo énorme');
    const wk = TC.Weekly && u[TC.Weekly.current().field];
    if (typeof wk === 'number' && wk > 50000) f.push('📈 +' + fmt.eur(wk, true) + ' cette semaine');
    if (u.plusUntil > Date.now() && (u.nw || 0) < 1000) f.push('✓ abonné mais pauvre');
    return f;
  }
  A.open = async function () {
    if (!A.isAdmin()) return;
    const md = TC.modal(`<h2>🛡️ Mode créateur</h2><div class="adm"><div class="adm-bar"><input id="adm-q" placeholder="Rechercher un joueur…" value="${esc(filter)}"><button class="btn btn-sm" id="adm-reload">↻</button><button class="btn btn-sm" data-qadmin>❓ Questions</button></div><div id="adm-list" class="adm-list"><div class="empty">Chargement…</div></div></div>`, { cls: 'wide' });
    const load = async () => {
      try {
        await A.loadBans();
        const s = await N.db().collection('users').get();
        users = s.docs.map(d => N.prof(d.id, d.data())).filter(u => !u.bot).sort((a, b) => (b.nw || 0) - (a.nw || 0));
        // ménage : les joueurs qui ont changé de pseudo après un blocage « nouveau pseudo » sont débloqués pour de bon
        const done = Object.keys(A.bans).filter(id => A.renamedAway(id, A.bans[id]));
        if (done.length) { const upd = {}; done.forEach(id => { upd[id] = firebase.firestore.FieldValue.delete(); delete A.bans[id]; }); banRef().set({ users: upd }, { merge: true }).catch(() => { }); }
        try { const sv = A.botUid ? await N.db().collection('saves').doc(A.botUid).get() : null; mod = (sv && sv.exists && sv.data().modReports) || []; } catch (e) { mod = []; }
        try { const m = await modRef().get(); modDone = (m.exists && m.data().done) || {}; } catch (e) { modDone = {}; }
        try { const gs = await giftRef().get(); decided = {}; ((gs.exists && gs.data().list) || []).forEach(g => { if (g.claim) decided[g.claim] = 1; }); } catch (e) { }
        render();
      } catch (e) { $('#adm-list').innerHTML = `<div class="empty">Erreur : ${esc(N.errMsg(e))}</div>`; }
    };
    let decided = {}, mod = [], modDone = {};
    const modSeen = () => G.state.modSeen || (G.state.modSeen = {});
    const modHtml = () => {
      const L = mod.filter(r => !modSeen()[r.id] && !modDone[r.id]).slice().reverse();
      const nb = Object.keys(A.botBlocks).filter(u => A.botBlocked(u)).length;
      const st = r => r.action ? `<i class="adm-tag ${/^🤖/.test(r.action) ? 'ban' : ''}">${esc(r.action)}</i>` : r.type && /^(fortune|mot-)/.test(r.type) ? `<i class="adm-tag">⏳ ${esc(A.botName())} agit à ${fmt.time(r.at + 3 * 3600000)} si tu ne fais rien</i>` : '';
      return `<div class="adm-mod"><h4>🤖 Rapport de ${esc(A.botName())} ${L.length ? `(${L.length})` : ''}</h4>
        <p class="hint">Le robot surveille les joueurs toutes les 10 minutes. Coche ✓ ce que tu as vérifié : sinon, il sanctionne lui-même au bout de 3 h.${nb ? ` <b>${nb} joueur(s) suspendu(s) par le robot.</b>` : ''}</p>
        ${L.length ? L.map(r => `<div class="adm-claim"><div><b>${esc(r.kind)}</b><small>${esc(r.pseudo)} · ${esc(r.detail || '')} · ${fmt.time(r.at)}</small>${st(r)}</div>
        <button class="btn btn-sm" data-u="${esc(r.uid)}" data-modsee="1">Voir</button><button class="btn btn-sm btn-ghost" data-modok="${esc(r.id)}" title="Vérifié : le robot ne sanctionnera pas">✓</button></div>`).join('') : '<p class="hint">Rien à signaler 👍</p>'}</div>`;
    };
    const claimsHtml = () => {
      const R = (TC.Share && TC.Share.REWARDS) || {};
      const pend = [];
      users.forEach(u => (u.shareClaims || []).forEach(c => { if (!decided[c.id] && R[c.kind]) pend.push({ u, c }); }));
      pend.sort((a, b) => a.c.at - b.c.at);
      return pend.length ? `<div class="adm-claims"><h4>📣 Demandes de récompense (${pend.length})</h4>${pend.map(({ u, c }) => `<div class="adm-claim"><div><b>${esc(u.pseudo || '?')}</b><small>${R[c.kind].e} ${esc(R[c.kind].label)} · ${fmt.time(c.at)}</small></div><b>${fmt.eur(c.eur)}</b>
        <button class="btn btn-sm" data-cproof="${esc(c.id)}" data-u="${esc(u.uid)}">👁️</button><button class="btn btn-sm btn-buy" data-cok="${esc(c.id)}" data-u="${esc(u.uid)}">✅</button><button class="btn btn-sm btn-sell" data-cno="${esc(c.id)}" data-u="${esc(u.uid)}">❌</button></div>`).join('')}</div>` : '';
    };
    const render = () => {
      const q = filter.toLowerCase();
      const rows = users.filter(u => !q || (u.pseudo || '').toLowerCase().includes(q));
      $('#adm-list').innerHTML = modHtml() + claimsHtml() + `<p class="hint">${users.length} joueur(s) · ${Object.keys(A.bans).length} bloqué(s) par toi</p>` + rows.map(u => {
        const fl = flags(u), ban = A.isBanned(u.uid);
        return `<button class="adm-row ${ban ? 'ban' : ''}" data-u="${u.uid}">${TC.Style ? TC.Style.avatar(u, 's') : ''}<b>${esc(u.pseudo || '?')}${TC.Style ? TC.Style.badge(u) : ''}</b>
          <span class="adm-nw">${fmt.eur(u.nw || 0, true)}</span><small>${u.updatedAt ? 'vu ' + fmt.time(u.updatedAt) : ''}${u.playMs ? ' · ⏱️ ' + TC.Play.fmt(u.playMs) : ''}</small>
          ${ban ? '<i class="adm-tag ban">BLOQUÉ</i>' : ''}${u.dupOf && u.dupOf.length && !A.allowed(u.uid) ? '<i class="adm-tag ban">👥 DOUBLE COMPTE</i>' : ''}${fl.map(x => `<i class="adm-tag">${esc(x)}</i>`).join('')}</button>`;
      }).join('');
    };
    md.el.querySelector('#adm-q').oninput = e => { filter = e.target.value; render(); };
    md.el.querySelector('#adm-reload').onclick = load;
    md.el.querySelector('#adm-list').addEventListener('click', async e => {
      const mk = e.target.closest('[data-modok]');
      if (mk) { const id = mk.dataset.modok; modSeen()[id] = Date.now(); modDone[id] = Date.now(); G.save(); render(); modRef().set({ done: { [id]: Date.now() } }, { merge: true }).catch(x => TC.toast('Erreur : ' + N.errMsg(x), 'bad')); return; }
      const ms = e.target.closest('[data-modsee]'); if (ms) return A.player(ms.dataset.u);
      const pv = e.target.closest('[data-cproof]');
      if (pv) { // la capture est dans la sauvegarde privée du joueur (lisible par le créateur)
        pv.disabled = true;
        try {
          const s = await N.db().collection('saves').doc(pv.dataset.u).get(); const st = s.exists ? JSON.parse(s.data().state) : {};
          const img = st.proofs && st.proofs[pv.dataset.cproof]; const u = users.find(x => x.uid === pv.dataset.u);
          const box = document.createElement('div'); box.className = 'pf-view'; box.innerHTML = img ? `<img src="${img}" alt="Preuve"><b>${esc(u ? u.pseudo : '')}</b><small>Touche pour fermer</small>` : '<b>Pas de capture trouvée</b><small>Le joueur n\'a peut-être pas encore synchronisé sa partie. Réessaie dans une minute.</small>';
          box.onclick = () => box.remove(); document.body.appendChild(box);
        } catch (x) { TC.toast('Erreur : ' + N.errMsg(x), 'bad'); }
        pv.disabled = false; return;
      }
      const ok = e.target.closest('[data-cok]'), no = e.target.closest('[data-cno]');
      if (ok || no) {
        const b = ok || no, cid = b.dataset.cok || b.dataset.cno, u = users.find(x => x.uid === b.dataset.u), c = u && (u.shareClaims || []).find(x => x.id === cid); if (!c) return;
        b.disabled = true;
        try {
          if (ok) { await A.gift(u.uid, u.pseudo, c.eur, 'Merci pour ton partage 📣', { claim: c.id }); TC.toast(`✅ ${fmt.eur(c.eur)} envoyés à ${esc(u.pseudo)}`, 'ok'); }
          else { await A.gift(u.uid, u.pseudo, 0, '', { claim: c.id, refused: true }); TC.toast('Demande refusée', 'info'); }
          decided[c.id] = 1; render();
        } catch (x) { TC.toast('Erreur : ' + N.errMsg(x), 'bad'); b.disabled = false; }
        return;
      }
      const r = e.target.closest('.adm-row[data-u]'); if (r) A.player(r.dataset.u);
    });
    load();
  };

  A.player = async function (uid) {
    const u = users.find(x => x.uid === uid) || { uid };
    const md = TC.modal(`<h2>🛡️ ${esc(u.pseudo || uid)}</h2><div id="adm-p" class="adm"><div class="empty">Chargement de la partie…</div></div>`, { cls: 'wide' });
    let st = null, err = null;
    try { const s = await N.db().collection('saves').doc(uid).get(); st = s.exists ? JSON.parse(s.data().state) : null; } catch (e) { err = e; }
    const ban = A.bans[uid], bb = A.botBlocked(uid);
    let html = `${bb ? `<div class="nbox warn">🤖 Suspendu par ${esc(A.botName())} ${bb.until ? 'jusqu\'au ' + fmt.time(bb.until) : 'jusqu\'au changement de pseudo'} : ${esc(bb.reason || '')}
        <button class="btn btn-sm btn-buy" id="adm-unbot">Annuler la sanction du robot</button></div>` : ''}<div class="adm-actions">${ban ? `<span class="adm-tag ban">${ban.need === 'pseudo' ? '✏️ BLOQUÉ JUSQU\'AU NOUVEAU PSEUDO' : 'BLOQUÉ'} le ${fmt.time(ban.at)}${ban.reason ? ' : ' + esc(ban.reason) : ''}</span><button class="btn btn-buy" id="adm-unban">Débloquer</button>`
      : `<input id="adm-reason" placeholder="Raison (facultatif)"><button class="btn btn-sell" id="adm-ban" ${uid === TC.ADMIN_UID ? 'disabled' : ''}>⛔ Bloquer</button><button class="btn" id="adm-ren" ${uid === TC.ADMIN_UID ? 'disabled' : ''}>✏️ Bloquer jusqu'au nouveau pseudo</button>`}<button class="btn btn-ghost" id="adm-back">← Liste</button></div>
      ${u.dupOf && u.dupOf.length ? `<div class="nbox ${A.allowed(uid) ? 'ok' : 'warn'}">👥 Double compte : cet appareil a déjà servi à ${u.dupOf.map(x => { const o = users.find(y => y.uid === x); return '<b>' + esc(o ? o.pseudo : x) + '</b>'; }).join(', ')}. ${A.allowed(uid) ? 'Tu l\'as autorisé.' : 'Ce compte est bloqué automatiquement.'}
        <button class="btn btn-sm ${A.allowed(uid) ? 'btn-ghost' : 'btn-buy'}" id="adm-allow">${A.allowed(uid) ? 'Retirer l\'autorisation' : '✅ Autoriser ce compte'}</button></div>` : ''}
      <div class="adm-gift"><b>🎁 Donner de l'argent</b> <small>(ne te coûte rien ; il le reçoit à sa prochaine ouverture du jeu)</small>
        <div class="adm-actions"><input id="adm-geur" type="number" min="1" step="1" placeholder="Montant en €" inputmode="decimal"><input id="adm-gmsg" placeholder="Message (facultatif)" maxlength="120"><button class="btn btn-gold" id="adm-gift">Envoyer</button></div></div>
      <div class="adm-gift"><b>➖ Retirer de l'argent</b> <small>(sur son cash, à sa prochaine ouverture du jeu, sans alerte ; une ligne « Correction du créateur » apparaît dans son relevé)</small>
        <div class="adm-actions"><input id="adm-feur" type="number" min="1" step="1" placeholder="Montant en €" inputmode="decimal"><input id="adm-freason" placeholder="Raison (pour toi)" maxlength="120"><button class="btn btn-sell" id="adm-fine">Retirer</button></div></div>`;
    if (err) html += `<div class="nbox warn">Impossible de lire sa partie (${esc(N.errMsg(err))}). As-tu publié les nouvelles règles Firebase ?</div>`;
    else if (!st) html += `<div class="nbox">Pas de partie enregistrée en ligne.</div>`;
    else {
      const px = id => TC.Data.eur(id) || 0;
      const hold = Object.entries(st.holdings || {}).map(([id, h]) => ({ id, qty: h.qty, cost: h.cost, val: h.qty * px(id) }));
      const holdVal = hold.reduce((t, h) => t + h.val, 0);
      const bonus = (st.log || []).filter(l => l.kind === 'bonus').reduce((t, l) => t + (l.eur || 0), 0);
      const trades = (st.stats && st.stats.trades) || 0;
      const sus = [];
      if (st.cash > 5000 && trades < 5) sus.push('Beaucoup de cash avec presque aucun trade');
      if (bonus > 2000) sus.push('Beaucoup d\'argent venant de bonus / codes : ' + fmt.eur(bonus));
      if ((st.positions || []).some(p => p.lev >= 50)) sus.push('Levier x50+ en cours');
      html += `${sus.length ? `<div class="nbox warn">🚩 ${sus.map(esc).join('<br>🚩 ')}</div>` : '<div class="nbox ok">Rien de suspect détecté.</div>'}
        <div class="kv"><span>Cash</span><b>${fmt.eur(st.cash)}</b><span>Actifs (cours actuel)</span><b>${fmt.eur(holdVal)}</b>
          <span>Ordres passés</span><b>${trades}</b><span>Paris gagnés / perdus</span><b>${(st.stats || {}).betsWon || 0} / ${(st.stats || {}).betsLost || 0}</b>
          <span>Liquidations</span><b>${(st.stats || {}).liquidations || 0}</b><span>Bonus / codes / cadeaux</span><b>${fmt.eur(bonus)}</b>
          <span>Coffres ouverts</span><b>${st.chests ? st.chests.opened + ' (' + fmt.eur(st.chests.won) + ' gagnés)' : 0}</b><span>Codes de triche</span><b>${esc(Object.keys(st.cheats || {}).join(', ') || 'aucun')}</b>
          <span>Bot</span><b>${st.bot && st.bot.unlocked ? (st.bot.on ? 'actif' : 'en pause') + ', ' + fmt.eur(st.bot.pnl || 0) : 'non'}</b><span>Partie créée</span><b>${st.created ? new Date(st.created).toLocaleDateString('fr-FR') : '?'}</b><span>Temps de jeu</span><b>${st.playMs ? TC.Play.fmt(st.playMs) : 'pas encore compté'}</b></div>
        <h4>📦 Actifs</h4>${hold.length ? hold.sort((a, b) => b.val - a.val).map(h => `<div class="adm-line"><b>${esc(h.id)}</b><span>${fmt.qty(h.qty)}</span><span>payé ${fmt.eur(h.cost)}</span><b>${fmt.eur(h.val)}</b></div>`).join('') : '<div class="hint">Aucun</div>'}
        <h4>⚡ Positions à levier</h4>${(st.positions || []).length ? st.positions.map(p => `<div class="adm-line"><b>${esc(p.asset)}</b><span>${p.side} x${p.lev}</span><span>marge ${fmt.eur(p.margin)}</span><span>entrée ${fmt.eur(p.entry)}</span></div>`).join('') : '<div class="hint">Aucune</div>'}
        <h4>🎲 Paris en cours</h4>${(st.bets || []).length ? st.bets.map(b => `<div class="adm-line"><b>${esc(b.asset)}</b><span>${b.dir === 'up' ? 'hausse' : 'baisse'}</span><span>${fmt.eur(b.stake)}</span><span>fin ${fmt.time(b.end)}</span></div>`).join('') : '<div class="hint">Aucun</div>'}
        <h4>🏆 Objets</h4><div class="hint">${(st.owned || []).map(o => esc(TC.shopById[o.item] ? TC.shopById[o.item].brand + ' ' + TC.shopById[o.item].model : o.item)).join(' · ') || 'Aucun'}</div>
        <h4>📜 Historique (50 derniers)</h4><div class="adm-log">${(st.log || []).slice(0, 50).map(l => `<div><small>${fmt.time(l.t)}</small> <b>${esc(l.kind)}</b> ${esc(l.asset || l.item || l.who || '')} ${l.dir ? esc(l.dir) : ''} ${l.lev ? 'x' + l.lev : ''} <span>${fmt.eur(l.eur || 0)}</span>${l.pnl != null ? ` <i class="${l.pnl >= 0 ? 'up' : 'down'}">${l.pnl >= 0 ? '+' : ''}${fmt.eur(l.pnl)}</i>` : ''}</div>`).join('')}</div>`;
    }
    const box = md.el.querySelector('#adm-p'); box.innerHTML = html;
    const b1 = box.querySelector('#adm-ban'), b2 = box.querySelector('#adm-unban');
    const b3 = box.querySelector('#adm-ren');
    if (b3) b3.onclick = async () => {
      if (!(await TC.confirm('Exiger un nouveau pseudo ?', `<b>${esc(u.pseudo || uid)}</b> est bloqué tant qu'il garde ce pseudo. Il peut en choisir un autre directement sur l'écran de blocage, et il est débloqué tout de suite.`, 'Bloquer', 'btn-sell'))) return A.player(uid);
      const reason = ((box.querySelector('#adm-reason') || {}).value || 'Pseudo non autorisé : choisis un pseudo correct, sans choses bizarres.').slice(0, 120);
      try { await banRef().set({ users: { [uid]: { at: Date.now(), reason, pseudo: u.pseudo || '', need: 'pseudo' } } }, { merge: true }); A.bans[uid] = { at: Date.now(), reason, pseudo: u.pseudo || '', need: 'pseudo' }; TC.toast('✏️ Joueur bloqué jusqu\'à ce qu\'il change de pseudo', 'ok', 6000); }
      catch (e) { TC.toast('Erreur : ' + N.errMsg(e), 'bad', 8000); }
      A.player(uid);
    };
    if (b1) b1.onclick = async () => {
      if (!(await TC.confirm('Bloquer ce joueur ?', `<b>${esc(u.pseudo || uid)}</b> ne pourra plus jouer et disparaîtra des classements.`, 'Bloquer', 'btn-sell'))) return A.player(uid);
      const reason = (box.querySelector('#adm-reason') || {}).value || '';
      try { await banRef().set({ users: { [uid]: { at: Date.now(), reason: reason.slice(0, 120), pseudo: u.pseudo || '' } } }, { merge: true }); A.bans[uid] = { at: Date.now(), reason }; TC.toast('⛔ Joueur bloqué', 'ok'); }
      catch (e) { TC.toast('Erreur : ' + N.errMsg(e) + ' (règles Firebase publiées ?)', 'bad', 8000); }
      A.player(uid);
    };
    if (b2) b2.onclick = async () => {
      try { await banRef().set({ users: { [uid]: firebase.firestore.FieldValue.delete() } }, { merge: true }); delete A.bans[uid]; if (A.botBlocks[uid]) await A.undoBot(uid); TC.toast('✅ Joueur débloqué', 'ok'); }
      catch (e) { TC.toast('Erreur : ' + N.errMsg(e), 'bad'); }
      A.player(uid);
    };
    box.querySelector('#adm-back').onclick = () => A.open();
    const ub = box.querySelector('#adm-unbot');
    if (ub) ub.onclick = async () => {
      try { await A.undoBot(uid); TC.toast('✅ Sanction du robot annulée', 'ok'); } catch (e) { TC.toast('Erreur : ' + N.errMsg(e), 'bad'); }
      A.player(uid);
    };
    const al = box.querySelector('#adm-allow');
    if (al) al.onclick = async () => {
      const on = !A.allowed(uid);
      try { await banRef().set({ allow: { [uid]: on ? { at: Date.now(), pseudo: u.pseudo || '' } : firebase.firestore.FieldValue.delete() } }, { merge: true }); if (on) (A.allow || (A.allow = {}))[uid] = true; else delete A.allow[uid]; TC.toast(on ? '✅ Compte autorisé : il pourra jouer à sa prochaine ouverture du jeu' : 'Autorisation retirée', 'ok', 6000); }
      catch (e) { TC.toast('Erreur : ' + N.errMsg(e), 'bad'); }
      A.player(uid);
    };
    box.querySelector('#adm-fine').onclick = async () => {
      const eur = +box.querySelector('#adm-feur').value, why = box.querySelector('#adm-freason').value;
      if (!(eur > 0)) return TC.toast('Entre un montant', 'bad');
      if (!(await TC.confirm('Retirer de l\'argent ?', `<b>−${fmt.eur(eur)}</b> sur le cash de <b>${esc(u.pseudo || uid)}</b> (au plus ce qu'il a).<br><small>Il ne reçoit pas d'alerte, mais la correction apparaît dans son relevé.</small>`, 'Retirer', 'btn-sell'))) return A.player(uid);
      try { await A.gift(uid, u.pseudo, eur, why, { fine: true }); TC.toast(`➖ ${fmt.eur(eur)} seront retirés à ${esc(u.pseudo || '')} à sa prochaine ouverture du jeu`, 'ok', 7000); }
      catch (x) { TC.toast('Erreur : ' + N.errMsg(x), 'bad', 8000); }
      A.player(uid);
    };
    box.querySelector('#adm-gift').onclick = async e => {
      const eur = +box.querySelector('#adm-geur').value, msg = box.querySelector('#adm-gmsg').value;
      if (!(eur > 0)) return TC.toast('Entre un montant', 'bad');
      if (!(await TC.confirm('Offrir de l\'argent ?', `<b>${fmt.eur(eur)}</b> pour <b>${esc(u.pseudo || uid)}</b>${msg ? `<br>« ${esc(msg)} »` : ''}`, 'Offrir 🎁', 'btn-gold'))) return A.player(uid);
      try { await A.gift(uid, u.pseudo, eur, msg); TC.toast(`🎁 ${fmt.eur(eur)} envoyés à ${esc(u.pseudo || '')} : il les recevra à sa prochaine ouverture du jeu`, 'ok', 7000); }
      catch (x) { TC.toast('Erreur : ' + N.errMsg(x), 'bad', 8000); }
      A.player(uid);
    };
  };
})();

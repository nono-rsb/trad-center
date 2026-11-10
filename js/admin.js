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
    try { const s = await banRef().get(); A.bans = (s.exists && s.data().users) || {}; } catch (e) { }
    A.enforce();
  };
  A.isBanned = uid => !!(uid && A.bans[uid]);
  A.enforce = function () {
    const me = N.user && N.user.uid;
    const lock = $('#banned');
    if (me && A.isBanned(me) && !A.isAdmin()) {
      if (lock) return;
      const el = document.createElement('div'); el.id = 'banned';
      el.innerHTML = `<div class="bn-in"><div class="big-emoji">⛔</div><h1>Compte suspendu</h1>
        <p>Ton compte a été suspendu par le créateur du jeu${A.bans[me].reason ? ` : « ${esc(A.bans[me].reason)} »` : ''}.</p>
        <p class="muted">Si tu penses que c'est une erreur, contacte-le.</p>
        <button class="btn" id="bn-out">Se déconnecter</button></div>`;
      document.body.appendChild(el);
      el.querySelector('#bn-out').onclick = () => N.signOut();
    } else if (lock) lock.remove();
  };
  N.on(t => { if (t === 'linked') { A.loadBans(); A.checkGifts(); } });
  setInterval(() => { A.loadBans(); A.checkGifts(); }, 2 * 60000);

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
  A.gift = async function (uid, pseudo, eur, msg) {
    if (!A.isAdmin()) return;
    eur = Math.round(+eur * 100) / 100;
    if (!(eur > 0)) return TC.toast('Montant invalide', 'bad');
    const g = { id: Math.random().toString(36).slice(2, 12), to: uid, eur, msg: String(msg || '').slice(0, 120), at: Date.now(), pseudo: pseudo || '' };
    const s = await giftRef().get(); const list = ((s.exists && s.data().list) || []).filter(x => Date.now() - x.at < 60 * 86400000).slice(-199);
    list.push(g);
    await giftRef().set({ list });
    N.notifyPlayer(uid, 'gift', { eur });
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
    const md = TC.modal(`<h2>🛡️ Mode créateur</h2><div class="adm"><div class="adm-bar"><input id="adm-q" placeholder="Rechercher un joueur…" value="${esc(filter)}"><button class="btn btn-sm" id="adm-reload">↻</button></div><div id="adm-list" class="adm-list"><div class="empty">Chargement…</div></div></div>`, { cls: 'wide' });
    const load = async () => {
      try {
        await A.loadBans();
        const s = await N.db().collection('users').get();
        users = s.docs.map(d => N.prof(d.id, d.data())).filter(u => !u.bot).sort((a, b) => (b.nw || 0) - (a.nw || 0));
        render();
      } catch (e) { $('#adm-list').innerHTML = `<div class="empty">Erreur : ${esc(N.errMsg(e))}</div>`; }
    };
    const render = () => {
      const q = filter.toLowerCase();
      const rows = users.filter(u => !q || (u.pseudo || '').toLowerCase().includes(q));
      $('#adm-list').innerHTML = `<p class="hint">${users.length} joueur(s) · ${Object.keys(A.bans).length} bloqué(s)</p>` + rows.map(u => {
        const fl = flags(u), ban = A.isBanned(u.uid);
        return `<button class="adm-row ${ban ? 'ban' : ''}" data-u="${u.uid}">${TC.Style ? TC.Style.avatar(u, 's') : ''}<b>${esc(u.pseudo || '?')}${TC.Style ? TC.Style.badge(u) : ''}</b>
          <span class="adm-nw">${fmt.eur(u.nw || 0, true)}</span><small>${u.updatedAt ? 'vu ' + fmt.time(u.updatedAt) : ''}${u.playMs ? ' · ⏱️ ' + TC.Play.fmt(u.playMs) : ''}</small>
          ${ban ? '<i class="adm-tag ban">BLOQUÉ</i>' : ''}${fl.map(x => `<i class="adm-tag">${esc(x)}</i>`).join('')}</button>`;
      }).join('');
    };
    md.el.querySelector('#adm-q').oninput = e => { filter = e.target.value; render(); };
    md.el.querySelector('#adm-reload').onclick = load;
    md.el.querySelector('#adm-list').addEventListener('click', e => { const r = e.target.closest('[data-u]'); if (r) A.player(r.dataset.u); });
    load();
  };

  A.player = async function (uid) {
    const u = users.find(x => x.uid === uid) || { uid };
    const md = TC.modal(`<h2>🛡️ ${esc(u.pseudo || uid)}</h2><div id="adm-p" class="adm"><div class="empty">Chargement de la partie…</div></div>`, { cls: 'wide' });
    let st = null, err = null;
    try { const s = await N.db().collection('saves').doc(uid).get(); st = s.exists ? JSON.parse(s.data().state) : null; } catch (e) { err = e; }
    const ban = A.bans[uid];
    let html = `<div class="adm-actions">${ban ? `<span class="adm-tag ban">BLOQUÉ le ${fmt.time(ban.at)}${ban.reason ? ' : ' + esc(ban.reason) : ''}</span><button class="btn btn-buy" id="adm-unban">Débloquer</button>`
      : `<input id="adm-reason" placeholder="Raison (facultatif)"><button class="btn btn-sell" id="adm-ban" ${uid === TC.ADMIN_UID ? 'disabled' : ''}>⛔ Bloquer</button>`}<button class="btn btn-ghost" id="adm-back">← Liste</button></div>
      <div class="adm-gift"><b>🎁 Donner de l'argent</b> <small>(ne te coûte rien ; il le reçoit à sa prochaine ouverture du jeu)</small>
        <div class="adm-actions"><input id="adm-geur" type="number" min="1" step="1" placeholder="Montant en €" inputmode="decimal"><input id="adm-gmsg" placeholder="Message (facultatif)" maxlength="120"><button class="btn btn-gold" id="adm-gift">Envoyer</button></div></div>`;
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
    if (b1) b1.onclick = async () => {
      if (!(await TC.confirm('Bloquer ce joueur ?', `<b>${esc(u.pseudo || uid)}</b> ne pourra plus jouer et disparaîtra des classements.`, 'Bloquer', 'btn-sell'))) return A.player(uid);
      const reason = (box.querySelector('#adm-reason') || {}).value || '';
      try { await banRef().set({ users: { [uid]: { at: Date.now(), reason: reason.slice(0, 120), pseudo: u.pseudo || '' } } }, { merge: true }); A.bans[uid] = { at: Date.now(), reason }; TC.toast('⛔ Joueur bloqué', 'ok'); }
      catch (e) { TC.toast('Erreur : ' + N.errMsg(e) + ' (règles Firebase publiées ?)', 'bad', 8000); }
      A.player(uid);
    };
    if (b2) b2.onclick = async () => {
      try { await banRef().set({ users: { [uid]: firebase.firestore.FieldValue.delete() } }, { merge: true }); delete A.bans[uid]; TC.toast('✅ Joueur débloqué', 'ok'); }
      catch (e) { TC.toast('Erreur : ' + N.errMsg(e), 'bad'); }
      A.player(uid);
    };
    box.querySelector('#adm-back').onclick = () => A.open();
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

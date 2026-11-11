/* Trad Center — clans
 * Créer un clan (500 €) : nom, tag unique de 2 à 5 caractères, emblème, ouvert ou sur demande.
 * Le chef garde la fiche du clan dans son profil (clanDef) ; chaque membre note clanId/clanTag dans le sien.
 * Le tag est réservé dans « usernames » (clé clan_<tag>) pour qu'il soit unique.
 * Chaque semaine, le clan qui a gagné le plus (somme des gains de ses membres) fait gagner 100 € à chaque membre.
 * Aucune règle Firestore à modifier : chacun n'écrit que dans son propre profil.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const CL = TC.Clan = { PRICE: 500, PRIZE: 100, MAX: 30, GOAL: 10000 }; // GOAL : cagnotte pour être vérifié
  CL.EMBLEMS = ['🛡️', '🐺', '🦁', '🐉', '🦅', '🦈', '🔥', '⚡', '💎', '👑', '🚀', '🐂', '🌙', '⚔️', '🏴‍☠️', '🎯'];
  const db = () => N.db(), me = () => N.user && N.user.uid;
  const W = () => TC.Weekly;
  const TAG_RE = /^[A-Z0-9]{2,5}$/;
  const tagKey = t => 'clan_' + t.toLowerCase();
  async function updMe(o) { o.updatedAt = Date.now(); await db().collection('users').doc(me()).update(o); Object.assign(N.profile, o); }
  CL.badge = p => p && p.clanTag ? `<i class="ctag">[${esc(p.clanTag)}]</i>` : '';

  /* ---------- Lecture ---------- */
  const valid = (def, u) => !!def && def.id === u.clanId && !(def.kicked || []).includes(u.uid) && (def.open || u.uid === def.id || (def.invites || []).includes(u.uid));
  let cache = { at: 0, clans: null };
  // tous les clans (fiche du chef + membres valides), triés par gains de la semaine
  CL.loadAll = async function (maxAge = 20000) {
    if (cache.clans && Date.now() - cache.at < maxAge) return cache.clans;
    const [defs, mem] = await Promise.all([
      db().collection('users').where('clanDef.tag', '>', '').get(),
      db().collection('users').where('clanId', '>', '').get(),
    ]);
    const banned = uid => TC.Admin && TC.Admin.isBanned(uid);
    const members = mem.docs.map(d => N.prof(d.id, d.data())).filter(u => !u.bot && !banned(u.uid));
    const wf = W() ? W().current().field : null, pf = W() ? W().previous().field : null;
    const clans = defs.docs.map(d => {
      const def = Object.assign({}, d.data().clanDef, { id: d.id });
      const list = members.filter(u => valid(def, u));
      const fund = list.reduce((t, u) => t + (u.clanFund && u.clanFund.id === def.id ? Math.max(0, +u.clanFund.eur || 0) : 0), 0);
      return { def, members: list, fund, verified: !!def.verified, nw: list.reduce((t, u) => t + (u.nw || 0), 0),
        week: list.reduce((t, u) => t + (typeof u[wf] === 'number' ? u[wf] : 0), 0),
        prev: list.filter(u => (u.clanSince || 0) < Date.now() - (7 * 86400000 - W().current().left)).reduce((t, u) => t + (typeof u[pf] === 'number' ? u[pf] : 0), 0) };
    }).filter(c => !banned(c.def.id) && c.members.some(u => u.uid === c.def.id)).sort((a, b) => b.week - a.week || b.nw - a.nw);
    cache = { at: Date.now(), clans };
    return clans;
  };
  CL.mine = async function (maxAge) {
    const id = N.profile && N.profile.clanId; if (!id) return null;
    const all = await CL.loadAll(maxAge);
    return all.find(c => c.def.id === id) || null;
  };

  /* ---------- Actions ---------- */
  CL.create = async function (name, tag, emoji, open) {
    name = String(name || '').replace(/\s+/g, ' ').trim(); tag = String(tag || '').toUpperCase().trim();
    if (name.length < 3 || name.length > 20) throw new Error('Le nom doit faire entre 3 et 20 caractères.');
    if (!TAG_RE.test(tag)) throw new Error('Le tag doit faire 2 à 5 lettres ou chiffres (ex : LOUP).');
    if (TC.Mayor && !TC.Mayor.clean(name + ' ' + tag)) throw new Error('Pas de gros mots dans le nom du clan.');
    if (N.profile.clanId) throw new Error('Quitte d\'abord ton clan actuel.');
    if (S().cash < CL.PRICE) throw new Error(`Il te faut ${fmt.eur(CL.PRICE)} de cash.`);
    try { await db().collection('usernames').doc(tagKey(tag)).set({ uid: me() }); } // échoue si le tag est déjà pris
    catch (e) { if (String(e.code).includes('permission-denied')) throw new Error('Ce tag est déjà pris par un autre clan.'); throw e; }
    const def = { name, tag, emoji: CL.EMBLEMS.includes(emoji) ? emoji : '🛡️', open: !!open, at: Date.now(), invites: [], kicked: [] };
    try { await updMe({ clanDef: def, clanId: me(), clanTag: tag, clanSince: Date.now(), clanReq: null }); }
    catch (e) { await db().collection('usernames').doc(tagKey(tag)).delete().catch(() => { }); throw e; }
    S().cash -= CL.PRICE; if (W()) W().flow(-CL.PRICE);
    S().log.unshift({ t: Date.now(), kind: 'item', eur: CL.PRICE, asset: `Création du clan ${def.emoji} [${tag}]` }); G.save(true);
    cache.at = 0; TC.sound('kaching'); TC.confetti(140);
  };
  CL.join = async function (c) {
    if (N.profile.clanId) throw new Error('Quitte d\'abord ton clan actuel.');
    if (c.members.length >= CL.MAX) throw new Error('Ce clan est complet.');
    const ok = c.def.open && !(c.def.kicked || []).includes(me());
    if (ok || (c.def.invites || []).includes(me())) { await updMe({ clanId: c.def.id, clanTag: c.def.tag, clanSince: Date.now(), clanReq: null }); cache.at = 0; TC.sound('ach'); return 'joined'; }
    await updMe({ clanReq: c.def.id }); N.notifyPlayer(c.def.id, 'clanreq', { tag: c.def.tag }); return 'asked';
  };
  CL.cancelReq = () => updMe({ clanReq: null });
  CL.leave = async function () {
    const def = N.profile.clanDef;
    if (def && N.profile.clanId === me()) { // le chef qui part dissout le clan
      await updMe({ clanDef: null, clanId: null, clanTag: null, clanSince: null });
      await db().collection('usernames').doc(tagKey(def.tag)).delete().catch(() => { });
    } else await updMe({ clanId: null, clanTag: null, clanSince: null, clanFund: null });
    cache.at = 0;
  };
  // ✅ Cagnotte de vérification : chaque membre met ce qu'il veut ; à 10 000 €, le chef valide le badge (définitif)
  CL.give = async function (eur) {
    eur = Math.floor(+eur * 100) / 100;
    if (!(eur >= 1)) throw new Error('Mets au moins 1 €.');
    if (S().cash < eur) throw new Error(`Il te faut ${fmt.eur(eur)} de cash.`);
    const id = N.profile.clanId; if (!id) throw new Error('Tu n\'es dans aucun clan.');
    const prev = N.profile.clanFund && N.profile.clanFund.id === id ? +N.profile.clanFund.eur || 0 : 0;
    await updMe({ clanFund: { id, eur: Math.round((prev + eur) * 100) / 100 } });
    S().cash -= eur; if (W()) W().flow(-eur);
    S().log.unshift({ t: Date.now(), kind: 'item', eur, asset: `Cagnotte du clan [${N.profile.clanTag || ''}] ✅` }); G.save(true);
    cache.at = 0; TC.sound('kaching');
    if (N.profile.clanId === me()) await CL.verifyCheck();
  };
  CL.verifyCheck = async function () {
    if (!N.profile || !N.profile.clanDef || N.profile.clanId !== me() || N.profile.clanDef.verified) return;
    const m = await CL.mine(0); if (m && m.fund >= CL.GOAL) { await setDef({ verified: Date.now() }); TC.confetti(260); TC.toast('✅ Ton clan est maintenant VÉRIFIÉ !', 'ok', 7000); }
  };
  async function setDef(patch) { const def = Object.assign({}, N.profile.clanDef, patch); await updMe({ clanDef: def }); cache.at = 0; }
  CL.accept = async function (uid) {
    const d = N.profile.clanDef; await setDef({ invites: [...new Set((d.invites || []).concat(uid))].slice(-60), kicked: (d.kicked || []).filter(x => x !== uid) });
    N.notifyPlayer(uid, 'clanok', { tag: d.tag });
  };
  CL.kick = async function (uid) { const d = N.profile.clanDef; await setDef({ kicked: [...new Set((d.kicked || []).concat(uid))].slice(-60), invites: (d.invites || []).filter(x => x !== uid) }); };
  CL.toggleOpen = () => setDef({ open: !N.profile.clanDef.open });

  // côté membre : demande acceptée → on entre ; exclu ou clan dissous → on sort
  CL.sync = async function () {
    if (!N.user || !N.profile || !db()) return;
    try {
      const p = N.profile;
      if (p.clanReq && !p.clanId) {
        const s = await db().collection('users').doc(p.clanReq).get(); const def = s.exists && s.data().clanDef;
        if (!def) await updMe({ clanReq: null });
        else if ((def.invites || []).includes(me())) { await updMe({ clanId: p.clanReq, clanTag: def.tag, clanSince: Date.now(), clanReq: null }); TC.sound('ach'); TC.toast(`🛡️ Bienvenue dans le clan ${esc(def.emoji)} [${esc(def.tag)}] ${esc(def.name)} !`, 'ok', 6000); }
      } else if (p.clanId && p.clanId !== me()) {
        const s = await db().collection('users').doc(p.clanId).get(); const def = s.exists && s.data().clanDef;
        const ok = def && valid(Object.assign({}, def, { id: p.clanId }), { uid: me(), clanId: p.clanId });
        if (!ok) { await updMe({ clanId: null, clanTag: null, clanSince: null, clanFund: null }); TC.toast(def ? '🛡️ Tu as été exclu de ton clan.' : '🛡️ Ton clan a été dissous.', 'info', 6000); }
        else if (def.tag !== p.clanTag) await updMe({ clanTag: def.tag });
      }
      await CL.checkPrize();
      await CL.verifyCheck();
    } catch (e) { console.warn('clan', e); }
    if (TC.UI && TC.UI.tab === 'social' && TC.Social) TC.Social.render();
  };
  // lundi : chaque membre du meilleur clan de la semaine passée touche sa prime
  CL.checkPrize = async function () {
    if (!W() || !N.profile || !N.profile.clanId) return;
    const prev = W().previous(); const paid = S().clanPaid || (S().clanPaid = {});
    if (paid[prev.id]) return;
    const all = await CL.loadAll(0);
    const best = all.slice().sort((a, b) => b.prev - a.prev)[0];
    if (!best || best.prev <= 0 || best.def.id !== N.profile.clanId) return;
    const meM = best.members.find(u => u.uid === me()); if (!meM) return;
    paid[prev.id] = Date.now(); S().cash += CL.PRIZE; W().flow(CL.PRIZE);
    S().log.unshift({ t: Date.now(), kind: 'bonus', eur: CL.PRIZE, asset: `Clan de la semaine [${best.def.tag}] 🛡️` }); G.save(true);
    TC.sound('kaching'); TC.confetti(200);
    TC.modal(`<div class="center"><div class="big-emoji">${esc(best.def.emoji)}</div><h2>Ton clan a gagné la semaine !</h2>
      <p>[${esc(best.def.tag)}] ${esc(best.def.name)} a gagné <b>+${fmt.eur(best.prev)}</b> la semaine dernière, plus que tous les autres clans.</p>
      <p>Ta part : <b class="up">+${fmt.eur(CL.PRIZE)}</b> 🎉</p><div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>Encaisser 💰</button></div></div>`);
    if (TC.App) TC.App.after();
  };

  /* ---------- Onglet Amis : bloc « Clan » ---------- */
  CL.block = function () {
    if (!N.user || !N.profile) return '';
    setTimeout(fill, 0);
    return `<div class="panel clan"><div class="board-head"><h3>🛡️ Clans</h3></div><div id="clan-zone"><div class="empty">Chargement…</div></div></div>`;
  };
  async function fill() {
    const el = $('#clan-zone'); if (!el) return;
    let all; try { all = await CL.loadAll(); } catch (e) { el.innerHTML = `<div class="empty">Clans indisponibles (${esc(N.errMsg(e))})</div>`; return; }
    const el2 = $('#clan-zone'); if (!el2) return;
    const myId = N.profile.clanId, mine = myId && all.find(c => c.def.id === myId);
    const rank = c => all.indexOf(c) + 1;
    const ranking = `<h4>🏆 Classement des clans <small>(gains de la semaine · +${fmt.eur(CL.PRIZE)} par membre pour le n°1)</small></h4>
      ${all.length ? `<div class="board">${all.slice(0, 15).map((c, i) => `<div class="brow clan-row ${c.def.id === myId ? 'me' : ''}" data-clan="${esc(c.def.id)}"><span class="pos">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="cemb">${esc(c.def.emoji)}</span><b>[${esc(c.def.tag)}] ${esc(c.def.name)}${c.verified ? ' <i class="cverif" title="Clan vérifié">✓</i>' : ''}</b><small>${c.members.length} membre${c.members.length > 1 ? 's' : ''} · ${c.def.open ? 'ouvert' : 'sur demande'}</small><span class="bnw ${c.week >= 0 ? 'up' : 'down'}">${c.week >= 0 ? '+' : ''}${fmt.eur(c.week, true)}</span></div>`).join('')}</div>` : '<div class="empty">Aucun clan pour l\'instant : crée le premier !</div>'}`;
    if (!mine) {
      const req = N.profile.clanReq && all.find(c => c.def.id === N.profile.clanReq);
      el2.innerHTML = `<p class="muted">Rejoins un clan pour jouer en équipe : chaque semaine, le clan qui gagne le plus d'argent fait gagner <b>${fmt.eur(CL.PRIZE)}</b> à chacun de ses membres.</p>
        ${req ? `<div class="nbox">⏳ Demande envoyée à ${esc(req.def.emoji)} [${esc(req.def.tag)}] ${esc(req.def.name)}. <button class="btn btn-sm btn-ghost" data-clanact="cancel">Annuler</button></div>` : ''}
        <button class="btn btn-gold" data-clanact="create" ${S().cash >= CL.PRICE ? '' : 'disabled'}>🛡️ Créer mon clan · ${fmt.eur(CL.PRICE)}</button>
        <p class="hint">Touche un clan du classement pour le voir et le rejoindre.</p>${ranking}`;
    } else {
      const d = mine.def, chief = d.id === me();
      let reqs = [];
      if (chief) { try { const s = await db().collection('users').where('clanReq', '==', me()).get(); reqs = s.docs.map(x => N.prof(x.id, x.data())).filter(u => !u.clanId); } catch (e) { } }
      const el3 = $('#clan-zone'); if (!el3) return;
      const wf = W() ? W().current().field : null;
      el3.innerHTML = `<div class="clan-head"><span class="cemb big">${esc(d.emoji)}</span><div><h3>[${esc(d.tag)}] ${esc(d.name)}${mine.verified ? ' <i class="cverif">✓</i>' : ''}</h3>
          <small>${mine.members.length} / ${CL.MAX} membres · ${d.open ? '🔓 ouvert à tous' : '🔒 sur demande'} · n°${rank(mine)} des clans</small></div></div>
        <div class="kv"><span>Gains de la semaine</span><b class="${mine.week >= 0 ? 'up' : 'down'}">${mine.week >= 0 ? '+' : ''}${fmt.eur(mine.week)}</b><span>Patrimoine total</span><b>${fmt.eur(mine.nw)}</b></div>
        ${verifBlock(mine)}
        ${chief && reqs.length ? `<h4>📨 Demandes pour entrer</h4>${reqs.map(u => `<div class="brow"><span class="pos">✋</span>${TC.Style.avatar(u, 's')}<b>${esc(u.pseudo || '?')}</b><small>${fmt.eur(u.nw || 0, true)}</small><span><button class="btn btn-sm btn-gold" data-clanact="accept" data-u="${esc(u.uid)}">Accepter</button></span></div>`).join('')}` : ''}
        <h4>👥 Membres</h4><div class="board">${mine.members.slice().sort((a, b) => (b.nw || 0) - (a.nw || 0)).map(u => `<div class="brow ${u.uid === me() ? 'me' : ''}"><span class="pos">${u.uid === d.id ? '👑' : '🛡️'}</span>${TC.Style.avatar(u, 's')}<b>${esc(u.pseudo || '?')}</b><small>${wf && typeof u[wf] === 'number' ? (u[wf] >= 0 ? '+' : '') + fmt.eur(u[wf], true) + ' cette semaine' : ''}</small><span class="bnw">${fmt.eur(u.nw || 0, true)}${chief && u.uid !== me() ? ` <button class="btn btn-sm btn-ghost" data-clanact="kick" data-u="${esc(u.uid)}" title="Exclure">✕</button>` : ''}</span></div>`).join('')}</div>
        <div class="modal-actions left">${chief ? `<button class="btn btn-sm" data-clanact="open">${d.open ? '🔒 Passer sur demande' : '🔓 Ouvrir à tous'}</button>` : ''}<button class="btn btn-sm btn-ghost" data-clanact="leave">${chief ? '💥 Dissoudre le clan' : '🚪 Quitter le clan'}</button></div>
        ${ranking}`;
    }
  }
  function verifBlock(c) {
    if (c.verified) return `<div class="cv-box ok">✅ <b>Clan vérifié</b> depuis le ${new Date(c.def.verified).toLocaleDateString('fr-FR')} : tout le monde voit que c'est un vrai clan actif.</div>`;
    const wf = c.members.filter(u => u.clanFund && u.clanFund.id === c.def.id && u.clanFund.eur > 0).sort((a, b) => b.clanFund.eur - a.clanFund.eur);
    const pct = Math.min(100, c.fund / CL.GOAL * 100);
    return `<div class="cv-box"><b>✅ Faire vérifier le clan</b>
      <small>Remplissez ensemble la cagnotte de ${fmt.eur(CL.GOAL, true)} : chaque membre met ce qu'il veut. Une fois pleine, le clan reçoit le badge ✓ pour toujours.</small>
      <div class="cv-bar"><i style="width:${pct.toFixed(1)}%"></i><span>${fmt.eur(c.fund, true)} / ${fmt.eur(CL.GOAL, true)}</span></div>
      ${wf.length ? `<div class="cv-who">${wf.map(u => `<span>${esc(u.pseudo || '?')} <b>${fmt.eur(u.clanFund.eur, true)}</b></span>`).join('')}</div>` : ''}
      <div class="cv-give">${[10, 50, 100, 500, 1000].map(v => `<button class="btn btn-sm" data-clanact="give" data-v="${v}" ${S().cash >= v ? '' : 'disabled'}>${fmt.eur(v, true)}</button>`).join('')}<button class="btn btn-sm btn-gold" data-clanact="give" data-v="custom">Autre…</button></div>
      <small class="muted">L'argent mis dans la cagnotte est dépensé (il ne revient pas si tu quittes le clan avant qu'il soit vérifié).</small></div>`;
  }
  function createModal() {
    let emoji = '🐺';
    const md = TC.modal(`<h2>🛡️ Créer mon clan</h2><div class="modal-body">
      <label class="fld">Nom du clan<div class="inp"><input id="cl-name" maxlength="20" placeholder="ex : Les Loups de la Bourse"></div></label>
      <label class="fld">Tag (2 à 5 lettres, unique)<div class="inp"><input id="cl-tag" maxlength="5" placeholder="LOUP" style="text-transform:uppercase"></div></label>
      <div class="fld">Emblème<div class="cl-embs">${CL.EMBLEMS.map(e => `<button class="cl-emb ${e === emoji ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div></div>
      <label class="tgl"><input type="checkbox" id="cl-open" checked><span>🔓 Ouvert à tous (sinon, les joueurs demandent et tu acceptes)</span></label>
      <div class="auth-err" id="cl-err"></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="cl-ok">Créer · ${fmt.eur(CL.PRICE)}</button></div></div>`);
    md.el.querySelectorAll('.cl-emb').forEach(b => b.onclick = () => { emoji = b.dataset.e; md.el.querySelectorAll('.cl-emb').forEach(x => x.classList.toggle('on', x === b)); });
    md.el.querySelector('#cl-ok').onclick = async e => {
      const b = e.target; b.disabled = true;
      try { await CL.create(md.el.querySelector('#cl-name').value, md.el.querySelector('#cl-tag').value, emoji, md.el.querySelector('#cl-open').checked); md.close(); TC.toast('🛡️ Clan créé ! Invite tes amis à le rejoindre.', 'ok', 6000); if (TC.Social) TC.Social.render(); if (TC.App) TC.App.after(); }
      catch (x) { md.el.querySelector('#cl-err').textContent = x.userMsg || x.message || N.errMsg(x); b.disabled = false; }
    };
  }
  async function clanModal(id) {
    const all = await CL.loadAll(); const c = all.find(x => x.def.id === id); if (!c) return;
    const d = c.def, mineId = N.profile.clanId, asked = N.profile.clanReq === id;
    const md = TC.modal(`<div class="center"><div class="big-emoji">${esc(d.emoji)}</div><h2>[${esc(d.tag)}] ${esc(d.name)}${c.verified ? ' <i class="cverif">✓</i>' : ''}</h2>
      ${c.verified ? '<p class="cv-ok">✅ Clan vérifié : un vrai clan actif</p>' : `<p class="muted">Cagnotte de vérification : ${fmt.eur(c.fund, true)} / ${fmt.eur(CL.GOAL, true)}</p>`}
      <p class="muted">${c.members.length} / ${CL.MAX} membres · ${d.open ? '🔓 ouvert à tous' : '🔒 sur demande'} · n°${all.indexOf(c) + 1} des clans</p></div>
      <div class="kv"><span>Gains de la semaine</span><b>${fmt.eur(c.week)}</b><span>Patrimoine total</span><b>${fmt.eur(c.nw)}</b></div>
      <h4>👥 Membres</h4><div class="board">${c.members.slice().sort((a, b) => (b.nw || 0) - (a.nw || 0)).map(u => `<div class="brow"><span class="pos">${u.uid === d.id ? '👑' : '🛡️'}</span>${TC.Style.avatar(u, 's')}<b>${esc(u.pseudo || '?')}</b><small></small><span class="bnw">${fmt.eur(u.nw || 0, true)}</span></div>`).join('')}</div>
      <div class="modal-actions">${mineId === id ? '<button class="btn btn-gold" data-close>C\'est mon clan 🛡️</button>'
        : mineId ? '<button class="btn btn-ghost" data-close>Tu es déjà dans un clan</button>'
        : asked ? '<button class="btn btn-ghost" disabled>⏳ Demande envoyée</button>'
        : `<button class="btn btn-gold" id="cl-join">${d.open || (d.invites || []).includes(me()) ? '🛡️ Rejoindre' : '✋ Demander à entrer'}</button>`}</div>`);
    const j = md.el.querySelector('#cl-join');
    if (j) j.onclick = async () => {
      j.disabled = true;
      try { const r = await CL.join(c); md.close(); TC.toast(r === 'joined' ? `🛡️ Bienvenue dans [${esc(d.tag)}] ${esc(d.name)} !` : '✋ Demande envoyée : le chef doit l\'accepter.', 'ok', 6000); if (TC.Social) TC.Social.render(); }
      catch (x) { TC.toast(x.userMsg || x.message || N.errMsg(x), 'bad'); j.disabled = false; }
    };
  }
  document.addEventListener('click', async e => {
    const row = e.target.closest('[data-clan]'); if (row && !e.target.closest('button')) return clanModal(row.dataset.clan);
    const b = e.target.closest('[data-clanact]'); if (!b) return;
    const a = b.dataset.clanact;
    if (a === 'create') return createModal();
    b.disabled = true;
    try {
      if (a === 'cancel') await CL.cancelReq();
      if (a === 'give') {
        let v = b.dataset.v;
        if (v === 'custom') { v = prompt('Combien mettre dans la cagnotte du clan ? (€)', '20'); if (v == null) { b.disabled = false; return; } v = String(v).replace(',', '.'); }
        await CL.give(+v); TC.toast(`✅ +${fmt.eur(+v)} dans la cagnotte du clan, merci !`, 'ok');
      }
      if (a === 'accept') { await CL.accept(b.dataset.u); TC.toast('✅ Joueur accepté : il rejoint le clan à sa prochaine ouverture du jeu.', 'ok', 6000); }
      if (a === 'kick') { if (!(await TC.confirm('Exclure ce joueur ?', 'Il quittera le clan.', 'Exclure', 'btn-sell'))) { b.disabled = false; return; } await CL.kick(b.dataset.u); }
      if (a === 'open') await CL.toggleOpen();
      if (a === 'leave') {
        const chief = N.profile.clanId === me();
        if (!(await TC.confirm(chief ? 'Dissoudre le clan ?' : 'Quitter le clan ?', chief ? 'Tous les membres seront libérés et le tag redeviendra disponible. Les 500 € ne sont pas remboursés.' : 'Tu pourras en rejoindre un autre.', chief ? 'Dissoudre' : 'Quitter', 'btn-sell'))) { b.disabled = false; return; }
        await CL.leave();
      }
    } catch (x) { TC.toast(x.userMsg || x.message || N.errMsg(x), 'bad'); }
    cache.at = 0; if (TC.Social) TC.Social.render();
  });

  N.on(t => { if (t === 'linked') CL.sync(); });
  setInterval(() => { if (!document.hidden) CL.sync(); }, 6 * 60000);
})();

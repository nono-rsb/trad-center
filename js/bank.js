/* Trad Banque — l'appli bancaire de Trad Center (même compte, même argent que le jeu)
 * Accueil (carte 3D, solde), Virements entre amis, Trad Drop (virement instantané par code entre deux téléphones),
 * Relevé de compte, Conseiller bancaire (réponses calculées à partir de ta vraie partie).
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const B = TC.Bank = { tab: 'home' };
  const root = () => $('#bank');
  const me = () => N.user && N.user.uid;
  const pseudo = () => (N.profile && N.profile.pseudo) || 'toi';

  /* ---------- Relevé : sens et libellé de chaque opération ---------- */
  const IN = { sell: 1, itemsell: 1, rent: 1, biz: 1, recv: 1, close: 1, liq: 1, betres: 1 };
  const LBL = { buy: '📈 Achat', sell: '📉 Vente', open: '⚡ Position levier', close: '✅ Clôture levier', liq: '💀 Liquidation', bet: '🎲 Pari', betres: '🎲 Pari terminé', item: '🛍️ Achat', itemsell: '♻️ Revente', rent: '🏠 Loyers', biz: '🏪 Commerces', bonus: '🎁 Bonus', send: '📤 Virement émis', recv: '📥 Virement reçu' };
  function op(l) {
    let sign = IN[l.kind] ? 1 : -1;
    if (l.kind === 'bonus') sign = (l.eur || 0) >= 0 ? 1 : -1;
    const amt = Math.abs(l.eur || 0) * sign;
    const what = l.kind === 'send' ? 'à ' + (l.who || '?') : l.kind === 'recv' ? 'de ' + (l.who || '?') : l.item && TC.shopById[l.item] ? TC.shopById[l.item].brand + ' ' + TC.shopById[l.item].model : (l.asset || '');
    return { t: l.t, label: LBL[l.kind] || l.kind, what, amt, msg: l.msg };
  }
  const opRow = o => `<div class="bk-op"><div><b>${esc(o.label)}</b><small>${esc(o.what)}${o.msg ? ' · « ' + esc(o.msg) + ' »' : ''}</small></div><div class="bk-amt ${o.amt >= 0 ? 'in' : 'out'}">${o.amt >= 0 ? '+' : '−'}${fmt.eur(Math.abs(o.amt))}<small>${fmt.time(o.t)}</small></div></div>`;

  /* ---------- Écrans ---------- */
  function login() {
    return `<div class="bk-login"><div class="bk-logo">🏦</div><h1>Trad Banque</h1><p>La banque de ton compte Trad Center.</p>
      <label class="fld">E-mail<div class="inp"><input id="bk-email" type="email" autocomplete="email" placeholder="vous@exemple.fr"></div></label>
      <label class="fld">Mot de passe<div class="inp pw"><input id="bk-pw" type="password" autocomplete="current-password"><button type="button" class="eye" data-eye="bk-pw">👁️</button></div></label>
      <div class="auth-err" id="bk-err"></div>
      <button class="btn btn-gold btn-xl" id="bk-login">Se connecter</button>
      <button class="btn btn-ghost btn-sm" id="bk-forgot">Mot de passe oublié ?</button>
      <p class="hint">Pas encore de compte ? <a href="./">Crée-le dans le jeu Trad Center</a>.</p></div>`;
  }
  function home() {
    const nw = G.netWorth(), ops = S().log.slice(0, 6).map(op);
    const wk = Date.now() - 7 * 86400000, recent = S().log.filter(l => l.t >= wk).map(op);
    const tin = recent.filter(o => o.amt > 0).reduce((t, o) => t + o.amt, 0), tout = recent.filter(o => o.amt < 0).reduce((t, o) => t - o.amt, 0);
    return `<div class="bk-hello">Bonjour ${esc(pseudo())} 👋</div>
      <div id="bk-card"></div>
      <div class="bk-bal"><div><small>Solde disponible</small><b>${fmt.eur(S().cash)}</b></div><div><small>Patrimoine total</small><b>${fmt.eur(nw)}</b></div></div>
      <div class="bk-quick"><button data-go="send">💸<span>Virement</span></button><button data-go="drop">📲<span>Trad Drop</span></button><button data-go="history">📜<span>Relevé</span></button><button data-go="advisor">💬<span>Conseiller</span></button></div>
      <div class="bk-panel"><h3>7 derniers jours</h3><div class="bk-flow"><div><small>Entrées</small><b class="in">+${fmt.eur(tin)}</b></div><div><small>Sorties</small><b class="out">−${fmt.eur(tout)}</b></div></div></div>
      <div class="bk-panel"><h3>Dernières opérations <button class="bk-link" data-go="history">Tout voir</button></h3>${ops.length ? ops.map(opRow).join('') : '<div class="empty">Aucune opération pour l\'instant.</div>'}</div>
      <a class="btn bk-game" href="./">🎮 Retour au jeu Trad Center</a>`;
  }
  function send() {
    const fr = N.friends || [];
    return `<h2 class="bk-h">💸 Virement</h2>
      <div class="bk-panel"><h3>Bénéficiaire</h3>${fr.length ? `<div class="bk-bens">${fr.map(f => `<button class="bk-ben ${B.to === f.uid ? 'on' : ''}" data-ben="${esc(f.uid)}">${TC.Style ? TC.Style.avatar(f, 's') : esc(f.avatar || '👤')}<span>${esc(f.pseudo || '?')}</span></button>`).join('')}</div>`
        : '<div class="empty">Aucun bénéficiaire : ajoute des amis dans le jeu, ou utilise le Trad Drop 📲.</div>'}
        <div class="bk-add"><input id="bk-addp" placeholder="Ajouter un bénéficiaire (pseudo)"><button class="btn btn-sm" id="bk-add">Ajouter</button></div></div>
      <div class="bk-panel"><h3>Montant</h3><div class="bk-amtin"><input id="bk-amt" type="number" inputmode="decimal" min="1" step="0.01" placeholder="0,00"><span>€</span></div>
        <small class="muted">Disponible : ${fmt.eur(S().cash)}</small>
        <div class="bk-qamt">${[10, 50, 100, 500].map(v => `<button data-amt="${v}">${v} €</button>`).join('')}</div>
        <input id="bk-msg" maxlength="120" placeholder="Message (facultatif)" class="bk-msg"></div>
      <button class="btn btn-gold btn-xl bk-full" id="bk-send">Envoyer le virement</button>
      <p class="hint">Le virement est instantané : ton ami reçoit l'argent et une notification.</p>`;
  }
  function history() {
    const ops = S().log.slice(0, 150).map(op);
    return `<h2 class="bk-h">📜 Relevé de compte</h2><div class="bk-panel">${ops.length ? ops.map(opRow).join('') : '<div class="empty">Aucune opération.</div>'}</div>`;
  }

  /* ---------- Trad Drop : virement instantané entre deux téléphones ---------- */
  let drop = null; // { mode: 'recv', code, until } ou { mode: 'send', target }
  function dropScreen() {
    if (drop && drop.mode === 'recv') {
      const left = Math.max(0, Math.ceil((drop.until - Date.now()) / 1000));
      return `<h2 class="bk-h">📲 Trad Drop</h2><div class="bk-radar"><i></i><i></i><i></i><span>${TC.Style ? TC.Style.avatar(Object.assign({}, N.profile, TC.Style.mine()), 'l') : ''}</span></div>
        <p class="bk-center">Donne ce code à la personne qui t'envoie de l'argent :</p>
        <div class="bk-code">${drop.code.split('').map(c => `<b>${c}</b>`).join('')}</div>
        <p class="bk-center muted">Valable encore <b id="bk-left">${left}</b> s · reste sur cet écran</p>
        ${drop.got ? `<div class="bk-got">💸 Reçu <b>+${fmt.eur(drop.got.eur)}</b> de ${esc(drop.got.from)} !</div>` : ''}
        <button class="btn btn-ghost bk-full" id="bk-dstop">Arrêter</button>`;
    }
    if (drop && drop.mode === 'send' && drop.target) {
      const t = drop.target;
      return `<h2 class="bk-h">📲 Trad Drop</h2><div class="bk-found">${TC.Style ? TC.Style.avatar(t, 'l') : ''}<b>${esc(t.pseudo || '?')}</b><small>trouvé à proximité ✨</small></div>
        <div class="bk-panel"><div class="bk-amtin"><input id="bk-damt" type="number" inputmode="decimal" min="1" step="0.01" placeholder="0,00"><span>€</span></div><small class="muted">Disponible : ${fmt.eur(S().cash)}</small>
        <input id="bk-dmsg" maxlength="120" placeholder="Message (facultatif)" class="bk-msg"></div>
        <button class="btn btn-gold btn-xl bk-full" id="bk-dsend">📲 Envoyer instantanément</button><button class="btn btn-ghost bk-full" id="bk-dstop">Annuler</button>`;
    }
    return `<h2 class="bk-h">📲 Trad Drop</h2><p class="bk-center">Un virement instantané entre deux téléphones, comme un AirDrop pour ton argent.</p>
      <div class="bk-drop2"><button class="bk-dbig" id="bk-drecv">📥<b>Recevoir</b><small>Affiche un code à 4 chiffres</small></button>
        <div class="bk-dbig in"><span>📤</span><b>Envoyer</b><small>Tape le code de l'autre téléphone</small><input id="bk-dcode" inputmode="numeric" maxlength="4" placeholder="• • • •"><button class="btn btn-gold" id="bk-dfind">Chercher</button></div></div>
      <p class="hint">Si vous n'êtes pas encore amis, vous le devenez automatiquement : il suffit que l'autre téléphone affiche son code.</p>`;
  }
  async function startRecv() {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    drop = { mode: 'recv', code, until: Date.now() + 3 * 60000 };
    await N.db().collection('users').doc(me()).update({ drop: { code, until: drop.until }, updatedAt: Date.now() });
    render();
  }
  async function stopDrop() {
    if (drop && drop.mode === 'recv') { try { await N.db().collection('users').doc(me()).update({ drop: null }); } catch (e) { } }
    drop = null; render();
  }
  async function findCode(code) {
    if (!/^\d{4}$/.test(code)) throw new Error('Le code fait 4 chiffres.');
    const s = await N.db().collection('users').where('drop.code', '==', code).get();
    const hits = s.docs.filter(d => d.id !== me() && (d.data().drop || {}).until > Date.now()).map(d => N.prof(d.id, d.data()));
    if (!hits.length) throw new Error('Aucun téléphone avec ce code. Vérifie que l\'autre personne est bien sur « Recevoir ».');
    drop = { mode: 'send', target: hits[0], code }; render();
  }
  const waitFriend = (uid, ms) => new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => { const f = (N.friends || []).find(x => x.uid === uid); if (f || Date.now() - t0 > ms) { clearInterval(iv); res(f || null); } }, 700); });
  async function dropSend(amount, msg) {
    const t = drop.target; amount = +amount;
    if (!(amount > 0)) throw new Error('Entre un montant.');
    if (amount > S().cash) throw new Error('Solde insuffisant.');
    let f = (N.friends || []).find(x => x.uid === t.uid);
    if (!f) { // pas encore amis : demande marquée du code, acceptée automatiquement par le téléphone qui reçoit
      const ref = N.db().collection('friendRequests').doc(me() + '_' + t.uid);
      try { await ref.delete(); } catch (e) { }
      await ref.set({ from: me(), to: t.uid, fromPseudo: N.profile.pseudo, fromAvatar: N.profile.avatar, toPseudo: t.pseudo, createdAt: Date.now(), drop: drop.code });
      f = await waitFriend(t.uid, 30000);
      if (!f) throw new Error('L\'autre téléphone n\'a pas répondu. Il doit rester sur l\'écran « Recevoir ».');
    }
    await N.send(f, 'cash', null, amount, msg || '📲 Trad Drop');
  }
  // côté réception : accepter tout seul les demandes faites avec notre code
  function autoAccept() {
    if (!drop || drop.mode !== 'recv' || drop.until < Date.now()) return;
    (N.incoming || []).filter(r => r.drop === drop.code && !drop.accepted?.[r.from]).forEach(r => {
      (drop.accepted || (drop.accepted = {}))[r.from] = 1; N.accept(r).catch(e => console.warn('drop', e));
    });
  }

  /* ---------- Conseiller bancaire ---------- */
  const chat = [];
  const ADV = '👩‍💼';
  function advise(topic) {
    const s = S(), nw = G.netWorth(), cash = s.cash, inv = G.spotValue() + G.levValue() + G.betsValue();
    const t = TC.Card ? TC.Card.tier(nw) : null, nx = t ? TC.Card.TIERS[TC.Card.TIERS.indexOf(t) + 1] : null;
    const rate = TC.Tax ? TC.Tax.rate(nw) : 0, lev = s.positions.length, bizN = TC.City ? TC.City.count() : 0, ph = TC.City ? TC.City.perHour() : 0, rent = G.rentPerHour();
    switch (topic) {
      case 'bilan': {
        const parts = [`Ton patrimoine est de <b>${fmt.eur(nw)}</b>, dont <b>${fmt.eur(cash)}</b> de cash disponible et <b>${fmt.eur(inv)}</b> placés.`];
        if (cash > nw * 0.7 && nw > 50) parts.push('Plus de 70 % de ton argent dort en cash : il ne te rapporte rien. Pense à en placer une partie (commerces, immobilier ou marchés).');
        if (lev) parts.push(`Tu as ${lev} position(s) à levier ouvertes : surveille-les, une forte baisse peut tout liquider.`);
        if (bizN) parts.push(`Tes ${bizN} commerce(s) rapportent ${fmt.eur(ph)} par heure (avant impôt).`);
        if (!bizN && cash >= 25) parts.push('Tu n\'as aucun commerce : c\'est le revenu le plus régulier du jeu (remboursé en ~12 h). Onglet Ville du jeu.');
        return parts.join('<br><br>');
      }
      case 'carte': return t && nx ? `Tu as la carte <b>${t.icon} ${t.name}</b>. Pour passer <b>${nx.icon} ${nx.name}</b>, il te faut <b>${fmt.eur(nx.min)}</b> de patrimoine, soit encore <b>${fmt.eur(Math.max(0, nx.min - nw))}</b>.` : `Tu as la carte <b>🐐 GOAT</b>, la plus haute. Respect.`;
      case 'placer': return cash < 25 ? 'Ton cash est faible. Commence par récupérer ton bonus quotidien 🎁, puis achète un petit commerce (la citronnade à 25 € se rembourse en 12 h).'
        : `Avec ${fmt.eur(cash)} de cash, une répartition prudente : environ <b>50 %</b> en commerces ou immobilier (revenus réguliers), <b>30 %</b> sur des actifs solides (Bitcoin, indices comme le CAC 40) et <b>20 %</b> gardés en cash pour saisir les occasions. Évite de tout mettre au même endroit.`;
      case 'impots': return `Ton taux d'impôt sur les revenus (commerces et loyers) est de <b>${TC.Tax ? TC.Tax.pct(rate) : '0 %'}</b>. Tu as déjà payé <b>${fmt.eur((s.stats && s.stats.taxes) || 0)}</b> d'impôts. Sous 10 000 € de patrimoine, c'est 0 %.`;
      case 'revenus': return `Revenus passifs : commerces <b>${fmt.eur(ph)}/h</b>, loyers <b>${fmt.eur(rent)}/h</b>, soit environ <b>${fmt.eur((ph + rent) * 24)}</b> par jour avant impôt. Pense à encaisser : la caisse des commerces est plafonnée à 24 h et les loyers à 48 h.`;
      case 'risque': return 'Règles d\'or : ne mets jamais tout sur un seul actif, utilise un stop-loss, évite le levier élevé (x10 = une baisse de 10 % efface tout), et ne parie pas plus de 5 % de ton argent d\'un coup.';
      case 'bot': { const b = s.bot; return b && b.unlocked ? `Ton bot est ${b.on ? '<b>allumé</b>' : 'en pause'}, avec un budget de ${fmt.eur(b.budget)} et un résultat de <b>${fmt.eur(b.pnl || 0)}</b>. Pour limiter les risques, active la pause automatique sur perte du jour (Réglages avancés).` : 'Tu n\'as pas encore le bot de trading (100 € dans Portefeuille). Il trade à ta place pendant que le jeu est ouvert, mais il peut aussi perdre.'; }
      case 'virement': return 'Pour un virement : onglet 💸 Virement, choisis un ami et un montant. Pour un ami à côté de toi, le 📲 Trad Drop est plus rapide : il affiche un code, tu le tapes, c\'est envoyé.';
      default: return 'Je peux t\'aider sur : ton bilan, ta carte, où placer ton argent, tes impôts, tes revenus, les risques, le bot ou les virements. Choisis un sujet ci-dessous 👇';
    }
  }
  const TOPICS = [['bilan', '📊 Mon bilan'], ['placer', '💡 Où placer mon argent ?'], ['carte', '💳 Ma prochaine carte'], ['revenus', '🏪 Mes revenus'], ['impots', '🏛️ Mes impôts'], ['risque', '⚠️ Limiter les risques'], ['bot', '🤖 Mon bot'], ['virement', '💸 Faire un virement']];
  function guess(q) {
    q = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const map = [['impot', 'impots'], ['tax', 'impots'], ['carte', 'carte'], ['gold', 'carte'], ['silver', 'carte'], ['diamond', 'carte'], ['goat', 'carte'], ['plac', 'placer'], ['invest', 'placer'], ['epargn', 'placer'], ['risque', 'risque'], ['levier', 'risque'], ['perd', 'risque'], ['bot', 'bot'], ['virement', 'virement'], ['envoy', 'virement'], ['drop', 'virement'], ['revenu', 'revenus'], ['commerce', 'revenus'], ['loyer', 'revenus'], ['bilan', 'bilan'], ['compte', 'bilan'], ['argent', 'bilan']];
    const m = map.find(([k]) => q.includes(k)); return m ? m[1] : null;
  }
  function ask(topic, label) {
    chat.push({ who: 'me', txt: esc(label) }); chat.push({ who: 'adv', typing: true }); render();
    setTimeout(() => { chat.pop(); chat.push({ who: 'adv', txt: advise(topic) }); render(); const c = $('.bk-chat'); if (c) c.scrollTop = c.scrollHeight; }, 700);
  }
  function advisor() {
    if (!chat.length) chat.push({ who: 'adv', txt: `Bonjour ${esc(pseudo())}, je suis Camille, ta conseillère Trad Banque. Comment puis-je t'aider ?` });
    return `<h2 class="bk-h">💬 Ma conseillère</h2><div class="bk-chat">${chat.map(m => m.who === 'adv' ? `<div class="bkm bka"><span>${ADV}</span><p>${m.typing ? '<i class="dots"><b></b><b></b><b></b></i>' : m.txt}</p></div>` : `<div class="bkm bkme"><p>${m.txt}</p></div>`).join('')}</div>
      <div class="bk-topics">${TOPICS.map(([k, l]) => `<button data-ask="${k}">${l}</button>`).join('')}</div>
      <div class="bk-ask"><input id="bk-q" placeholder="Pose ta question…" maxlength="140"><button class="btn btn-gold" id="bk-qgo">➤</button></div>
      <p class="hint">Conseils pour le jeu uniquement (argent fictif), pas un conseil financier réel.</p>`;
  }

  /* ---------- Rendu ---------- */
  const NAV = [['home', '🏠', 'Accueil'], ['send', '💸', 'Virement'], ['drop', '📲', 'Drop'], ['history', '📜', 'Relevé'], ['advisor', '💬', 'Conseiller']];
  function render() {
    const r = root(); if (!r) return;
    if (!N.ready) { r.innerHTML = '<div class="bk-login"><div class="bk-logo">🏦</div><p>Connexion…</p></div>'; return; }
    if (!N.user || !N.profile) { r.innerHTML = login(); bindLogin(); return; }
    const scroll = B.tab === 'advisor';
    const body = B.tab === 'send' ? send() : B.tab === 'drop' ? dropScreen() : B.tab === 'history' ? history() : B.tab === 'advisor' ? advisor() : home();
    r.innerHTML = `<header class="bk-top"><b>🏦 Trad Banque</b><span>${TC.Style ? TC.Style.avatar(Object.assign({}, N.profile, TC.Style.mine()), 's') : ''}</span></header><main class="bk-main">${body}</main>
      <nav class="bk-nav">${NAV.map(([k, i, l]) => `<button data-tab="${k}" class="${B.tab === k ? 'on' : ''}"><i>${i}</i><span>${l}</span></button>`).join('')}</nav>`;
    if (B.tab === 'home' && TC.Card) TC.Card.mountInto($('#bk-card'));
    if (scroll) { const c = $('.bk-chat'); if (c) c.scrollTop = c.scrollHeight; }
  }
  function bindLogin() {
    const go = $('#bk-login'); if (!go) return;
    go.onclick = async () => { go.disabled = true; $('#bk-err').textContent = ''; try { await N.signIn($('#bk-email').value, $('#bk-pw').value); } catch (e) { $('#bk-err').textContent = N.errMsg(e); go.disabled = false; } };
    $('#bk-forgot').onclick = async () => { const em = $('#bk-email').value; if (!em) return ($('#bk-err').textContent = 'Entre d\'abord ton e-mail.'); try { await N.resetPassword(em); TC.toast('📧 E-mail de réinitialisation envoyé', 'ok'); } catch (e) { $('#bk-err').textContent = N.errMsg(e); } };
  }

  document.addEventListener('click', async e => {
    const t = e.target;
    const nav = t.closest('[data-tab]'); if (nav) { B.tab = nav.dataset.tab; if (B.tab !== 'drop' && drop && drop.mode === 'send') drop = null; render(); window.scrollTo(0, 0); return; }
    const go = t.closest('[data-go]'); if (go) { B.tab = go.dataset.go; render(); window.scrollTo(0, 0); return; }
    const ben = t.closest('[data-ben]'); if (ben) { B.to = ben.dataset.ben; render(); return; }
    const qa = t.closest('[data-amt]'); if (qa) { $('#bk-amt').value = qa.dataset.amt; return; }
    const a = t.closest('[data-ask]'); if (a) return ask(a.dataset.ask, a.textContent);
    const b = t.closest('button'); if (!b || !b.id) return;
    const busy = async fn => { b.disabled = true; try { await fn(); } catch (x) { TC.toast(x.userMsg || x.message || N.errMsg(x), 'bad', 6000); } if (document.body.contains(b)) b.disabled = false; };
    if (b.id === 'bk-send') return busy(async () => {
      const f = (N.friends || []).find(x => x.uid === B.to); if (!f) throw new Error('Choisis un bénéficiaire.');
      const amt = +$('#bk-amt').value; if (!(amt > 0)) throw new Error('Entre un montant.');
      if (!(await TC.confirm('Confirmer le virement', `<b>${fmt.eur(amt)}</b> à <b>${esc(f.pseudo)}</b>`, 'Envoyer', 'btn-gold'))) return;
      await N.send(f, 'cash', null, amt, $('#bk-msg').value);
      TC.sound('kaching'); TC.toast(`✅ Virement de ${fmt.eur(amt)} envoyé à ${esc(f.pseudo)}`, 'ok', 6000); B.tab = 'home'; render();
    });
    if (b.id === 'bk-add') return busy(async () => { const r = await N.addFriend($('#bk-addp').value); TC.toast(r === 'accepted' ? '🤝 Bénéficiaire ajouté' : '✉️ Demande envoyée : il apparaîtra dès qu\'il aura accepté', 'ok', 6000); });
    if (b.id === 'bk-drecv') return busy(startRecv);
    if (b.id === 'bk-dstop') return busy(stopDrop);
    if (b.id === 'bk-dfind') return busy(() => findCode($('#bk-dcode').value.trim()));
    if (b.id === 'bk-dsend') return busy(async () => {
      const amt = +$('#bk-damt').value; const who = drop.target.pseudo;
      b.textContent = '📲 Envoi…'; await dropSend(amt, $('#bk-dmsg').value);
      TC.sound('kaching'); TC.confetti(140); TC.toast(`📲 ${fmt.eur(amt)} envoyés à ${esc(who)} !`, 'ok', 6000); drop = null; B.tab = 'home'; render();
    });
    if (b.id === 'bk-qgo') { const q = $('#bk-q').value.trim(); if (q) ask(guess(q), q); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'bk-q') $('#bk-qgo').click(); });

  // temps réel
  N.on((type, d) => {
    if (type === 'askSave') d.res('cloud'); // la banque garde toujours la partie du compte
    if (type === 'received') {
      TC.sound('kaching'); TC.confetti(120);
      TC.toast(`📥 Virement reçu : <b>+${fmt.eur(d.eur)}</b> de ${esc(d.fromPseudo)}`, 'ok', 7000);
      if (drop && drop.mode === 'recv') drop.got = { eur: d.eur, from: d.fromPseudo };
    }
    autoAccept();
    if (type === 'change' || type === 'linked' || type === 'received' || type === 'synced') { const typing = document.activeElement && document.activeElement.tagName === 'INPUT'; if (!typing && !document.querySelector('.cc.drag')) render(); }
  });
  setInterval(() => {
    if (drop && drop.mode === 'recv') { const el = $('#bk-left'); const left = Math.max(0, Math.ceil((drop.until - Date.now()) / 1000)); if (el) el.textContent = left; if (!left) stopDrop(); autoAccept(); }
  }, 1000);
  G.on(() => { if (B.tab === 'home' && !document.querySelector('.cc.drag')) { const bal = $('.bk-bal b'); if (bal) bal.textContent = fmt.eur(S().cash); } });

  N.init(); TC.Data.start(); render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();

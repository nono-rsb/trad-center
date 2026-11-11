/* Trad Center — interface du mode en ligne (compte, amis, envois, classement) */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, UI = TC.UI;
  const S = () => G.state;
  const SO = TC.Social = { authMode: 'signup' };

  function keepInputs(root) { const k = {}; root.querySelectorAll('input[id]').forEach(i => { if (i.value && i.type !== 'password') k[i.id] = i.value; }); return k; }
  function restore(k) { for (const id in k) { const el = document.getElementById(id); if (el) el.value = k[id]; } }

  SO.headerBtn = function () {
    const b = $('#b-account'); if (!b) return;
    b.hidden = !N.enabled;
    b.textContent = N.profile ? N.profile.avatar : '👤';
    b.title = N.profile ? N.profile.pseudo : 'Se connecter';
    const nb = $('#nb-social'); const n = N.incoming.length;
    if (nb) { nb.textContent = n || ''; nb.style.display = n ? '' : 'none'; }
  };

  SO.render = function () {
    const root = $('#tab-social'); if (!root) return;
    const k = keepInputs(root);
    root.innerHTML = body();
    restore(k);
    SO.headerBtn();
  };

  function body() {
    if (!N.enabled) return `<div class="panel social-off"><div class="big-emoji">👥</div><h2>Mode en ligne bientôt disponible</h2>
      <p>Les comptes, les amis et les envois d'argent ont besoin d'un serveur. Le propriétaire du jeu doit encore activer Firebase (gratuit) : voir <b>FIREBASE.md</b> dans le dépôt.</p>
      <p class="hint">En attendant, votre partie est sauvegardée sur cet appareil.</p></div>`;
    if (N.error && !N.user) return `<div class="panel empty big">⚠️ ${esc(N.error)}</div>`;
    if (!N.ready) return `<div class="panel empty big">Connexion…</div>`;
    if (!N.user) return authForm();
    if (N.needPseudo) return `<div class="panel auth"><h2>Choisissez votre pseudo</h2><p>C'est le nom que verront vos amis.</p>
      <label class="fld">Pseudo<div class="inp"><input id="a-pseudo2" maxlength="16" placeholder="ex : LoupDeBourse" autocomplete="nickname"></div></label>
      <button class="btn btn-gold btn-xl" data-soc="pseudo">Valider</button><p class="hint">3 à 16 caractères : lettres, chiffres, _</p>
      <button class="btn btn-ghost btn-sm" data-soc="logout">Se déconnecter</button></div>`;
    if (!N.profile) return `<div class="panel empty big">Chargement du profil…</div>`;
    return profileCard() + (TC.Share && TC.Share.block ? TC.Share.block() : '') + (TC.Clan ? TC.Clan.block() : '') + inviteBlock() + friendsBlock() + boardBlock() + historyBlock();
  }

  function authForm() {
    const up = SO.authMode === 'signup';
    return `<div class="panel auth">
      <div class="center"><img src="icons/icon-192.png" class="install-icon" alt="">${document.body.classList.contains('gated') ? '<p class="gate-hi">👋 Bienvenue sur <b>Trad Center</b> ! Crée ton compte, connecte-toi ou joue en invité pour commencer avec 10 €.</p>' : ''}<h2>${up ? 'Créer mon compte' : 'Connexion'}</h2>
      <p>${up ? 'Sauvegardez votre partie en ligne, ajoutez vos amis, envoyez-leur de l\'argent ou des bitcoins et comparez vos fortunes.' : 'Retrouvez votre partie sur tous vos appareils.'}</p>
      ${up && localStorage.getItem('tradcenter.ref') ? '<p class="nbox ok">🎁 Vous avez été invité : créez votre compte puis activez les notifications 🔔 pour offrir 20 € à votre ami.</p>' : ''}</div>
      <div class="seg seg-2"><button data-soc="mode-signup" class="${up ? 'active' : ''}">Créer un compte</button><button data-soc="mode-login" class="${up ? '' : 'active'}">J'ai déjà un compte</button></div>
      ${up ? `<label class="fld">Pseudo<div class="inp"><input id="a-pseudo" maxlength="16" placeholder="ex : LoupDeBourse" autocomplete="nickname"></div></label>` : ''}
      <label class="fld">Adresse e-mail<div class="inp"><input id="a-email" type="email" placeholder="vous@exemple.fr" autocomplete="email"></div></label>
      <label class="fld">Mot de passe<div class="inp pw"><input id="a-pw" type="password" placeholder="6 caractères minimum" autocomplete="${up ? 'new-password' : 'current-password'}"><button type="button" class="eye" data-eye="a-pw" aria-label="Afficher le mot de passe">👁️</button></div></label>
      <div class="auth-err" id="a-err"></div>
      <button class="btn btn-gold btn-xl" data-soc="${up ? 'signup' : 'login'}">${up ? 'Créer mon compte' : 'Se connecter'}</button>
      ${document.body.classList.contains('gated') ? '<button class="btn btn-ghost gate-guest" data-guest>👤 Jouer en invité</button><p class="hint gate-gh">En invité, ta partie reste sur cet appareil : pas d\'amis, pas de classement ni de ville en ligne. Tu pourras créer ton compte plus tard (onglet Amis).</p>' : ''}
      <p class="hint">En créant un compte, tu acceptes les <a href="confidentialite.html">conditions d'utilisation et la politique de confidentialité</a>.</p>
      ${up ? `<p class="hint">Votre partie actuelle (${fmt.eur(G.netWorth())}) sera rattachée au compte. Un e-mail de confirmation vous sera envoyé.</p>` : `<button class="btn btn-ghost btn-sm" data-soc="forgot">Mot de passe oublié ?</button>`}
    </div>`;
  }

  function profileCard() {
    const p = N.profile; const u = N.user;
    return `<div class="panel profile">
      <button class="av-btn" data-style="" title="Personnaliser mon avatar">${TC.Style.avatar(Object.assign({}, p, TC.Style.mine()), 'l')}<i>🎨</i></button>
      <div class="pinfo"><h2>${esc(p.pseudo)}${TC.Style.badge(TC.Style.mine())} <button class="btn btn-sm btn-ghost" data-soc="rename" title="Changer de pseudo">✏️</button></h2>
        <div class="muted">${esc(u.email || '')} ${u.emailVerified ? '<span class="st st-live">VÉRIFIÉ</span>' : '<span class="st st-sim">NON VÉRIFIÉ</span>'}</div>
        ${u.emailVerified ? '' : `<div class="verify">📧 Confirmez votre adresse via le lien reçu par e-mail. <button class="btn btn-sm" data-soc="resend">Renvoyer</button> <button class="btn btn-sm" data-soc="checkverify">C'est fait</button></div>`}
        <div class="playtime">⏱️ <b>${TC.Play.fmt(TC.Play.ms())}</b> de jeu · joue depuis le ${TC.Play.date(TC.Play.since())}</div>
        <div class="muted small">${G.rank().r[2]} ${G.rank().r[1]} · ${fmt.eur(G.netWorth())} · ${N.lastSync ? '☁️ sauvegardé ' + new Date(N.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '☁️ synchronisation…'}</div></div>
      <div class="pactions"><button class="btn btn-sm" data-soc="share">📤 Inviter</button><button class="btn btn-sm btn-ghost" data-soc="logout">Déconnexion</button></div>
    </div>`;
  }

  function inviteBlock() {
    const r = N.referrals || []; const ok = r.filter(x => x.ok).length;
    return `<div class="panel invite"><div class="inv-top"><div class="big-emoji">🎁</div><div><h3>Invite tes amis : +${N.REF_BONUS} € par ami</h3>
      <p>Envoie ton lien. Dès que ton ami <b>crée son compte</b> et <b>active les notifications</b>, tu gagnes <b>${N.REF_BONUS} €</b> et vous devenez amis automatiquement.</p></div></div>
      <div class="inv-link"><input readonly value="${esc(N.inviteLink())}"><button class="btn btn-gold" data-soc="share">📤 Partager</button><button class="btn" data-soc="copylink">📋</button></div>
      ${r.length ? `<div class="inv-list">${r.map(x => `<span class="${x.ok ? 'up' : 'muted'}">${x.ok ? '✅' : '⏳'} ${esc(x.pseudo || '')}${x.ok ? '' : ' (notifications pas encore activées)'}</span>`).join('')}</div>` : ''}
      <p class="hint">${ok} ami(s) validé(s) · ${fmt.eur(ok * N.REF_BONUS)} gagnés</p></div>`;
  }

  function friendsBlock() {
    const inc = N.incoming.map(r => `<div class="req"><span class="avatar">${r.fromAvatar || '👤'}</span><b>${esc(r.fromPseudo)}</b><span class="muted">veut être votre ami</span>
      <button class="btn btn-sm btn-buy" data-acc="${r.id}">Accepter</button><button class="btn btn-sm btn-ghost" data-dec="${r.id}">Refuser</button></div>`).join('');
    const out = N.outgoing.map(r => `<div class="req"><span class="muted">⏳ Demande envoyée à</span><b>${esc(r.toPseudo || '')}</b><button class="btn btn-sm btn-ghost" data-dec="${r.id}">Annuler</button></div>`).join('');
    const fr = N.friends.map(f => {
      const it = f.topItem && TC.shopById[f.topItem]; const src = it && TC.img(it.id);
      return `<div class="friend">
        <div class="f-vis">${src ? `<img src="${src}" alt="" referrerpolicy="no-referrer">` : it ? `<span>${it.emoji}</span>` : ''}</div>
        ${TC.Style.avatar(f, 'm')}
        <div class="f-info"><b>${esc(f.pseudo)}${TC.Style.badge(f)}</b><small>${esc(f.rank || '')} · ${f.items || 0} objet(s)${it ? ' · ' + esc(it.brand + ' ' + it.model) : ''}</small></div>
        <div class="f-nw">${fmt.eur(f.nw || 0, true)}</div>
        <div class="f-act"><button class="btn btn-sm btn-gold" data-send="${f.uid}">💸 Envoyer</button><button class="btn btn-sm btn-ghost" data-unfriend="${f.uid}" title="Retirer">✕</button></div>
      </div>`;
    }).join('');
    return `<div class="panel"><h3>👥 Mes amis <small>(${N.friends.length})</small></h3>
      <div class="addf"><div class="inp"><span>@</span><input id="f-add" maxlength="16" placeholder="Pseudo de votre ami"></div><button class="btn btn-gold" data-soc="add">Ajouter</button></div>
      <p class="hint">Votre pseudo à partager : <b class="copy" data-soc="copy">@${esc(N.profile.pseudo)}</b></p>
      ${inc ? `<h4>Demandes reçues</h4>${inc}` : ''}${out ? `<h4>En attente</h4>${out}` : ''}
      ${fr ? `<div class="friends">${fr}</div>` : '<div class="empty">Pas encore d\'amis. Ajoutez-les avec leur pseudo, ou invitez-les avec le bouton 📤 Inviter !</div>'}</div>`;
  }

  function boardBlock() {
    if (N.boardScope === 'week' && TC.Weekly) {
      setTimeout(() => { const el = document.getElementById('wk-zone'); if (el) TC.Weekly.render(el); }, 0);
      return `<div class="panel"><div class="board-head"><h3>🏆 Classement</h3>${boardSeg()}</div><div id="wk-zone"></div></div>`;
    }
    const friendsScope = N.boardScope === 'friends';
    const meRow = Object.assign({ uid: N.user.uid }, N.profile, TC.Style.mine(), { nw: G.netWorth(), rank: G.rank().r[1] });
    let rows = friendsScope ? N.friends.concat([meRow]) : (N.board || []).map(r => r.uid === N.user.uid ? meRow : r);
    rows = rows.slice().sort((a, b) => (b.nw || 0) - (a.nw || 0));
    const medal = i => ['🥇', '🥈', '🥉'][i] || (i + 1);
    return `<div class="panel"><div class="board-head"><h3>🏆 Classement</h3>${boardSeg()}</div>
      ${!friendsScope && !N.board ? '<div class="empty">Chargement…</div>' : `<div class="board">${rows.map((r, i) => `<div class="brow ${r.uid === N.user.uid ? 'me' : ''}"><span class="pos">${medal(i)}</span>${TC.Style.avatar(r, 's')}<b>${TC.Clan ? TC.Clan.badge(r) : ''}${esc(r.pseudo || '')}${TC.Style.badge(r)}${N.xmasChamp && N.xmasChamp === r.uid ? ' <span class="champ" title="Champion de Noël">🏆🎄</span>' : ''}</b><small>${esc(r.rank || '')}</small><span class="bnw">${fmt.eur(r.nw || 0, true)}</span></div>`).join('')}</div>`}</div>`;
  }

  function boardSeg() {
    const sc = N.boardScope;
    return `<div class="seg"><button data-board="week" class="${sc === 'week' ? 'active' : ''}">Semaine 💰</button><button data-board="friends" class="${sc === 'friends' ? 'active' : ''}">Amis</button><button data-board="world" class="${sc === 'world' ? 'active' : ''}">Monde</button></div>`;
  }

  function historyBlock() {
    const L = S().log.filter(l => l.kind === 'send' || l.kind === 'recv').slice(0, 30);
    if (!L.length) return '';
    return `<div class="panel"><h3>💸 Envois et réceptions</h3>${L.map(l => `<div class="tx ${l.kind}"><span>${l.kind === 'recv' ? '📥' : '📤'}</span>
      <div><b>${l.kind === 'recv' ? 'De ' : 'À '}${esc(l.who || '')}</b>${l.msg ? `<small>« ${esc(l.msg)} »</small>` : ''}<small>${fmt.time(l.t)}</small></div>
      <b class="${l.kind === 'recv' ? 'up' : 'down'}">${l.kind === 'recv' ? '+' : '−'}${l.asset ? fmt.qty(l.qty) + ' ' + l.asset + ' · ' : ''}${fmt.eur(l.eur)}</b></div>`).join('')}</div>`;
  }

  /* ---------------- Fenêtre d'envoi ---------------- */
  SO.sendModal = f => sendModal(f);
  function sendModal(friend) {
    const holds = Object.keys(S().holdings).filter(id => S().holdings[id].qty > 0);
    let kind = 'cash';
    const md = TC.modal(`<h2>💸 Envoyer à ${esc(friend.avatar || '')} ${esc(friend.pseudo)}</h2><div class="modal-body">
      <div class="seg seg-2" id="s-kind"><button data-k="cash" class="active">💶 Euros</button><button data-k="asset" ${holds.length ? '' : 'disabled'}>🪙 Crypto / actions</button></div>
      <div id="s-assetw" hidden><label class="fld">Actif<select id="s-asset" class="sel">${holds.map(id => `<option value="${id}">${id} — ${fmt.qty(S().holdings[id].qty)} (${fmt.eur(G.holdingValue(id))})</option>`).join('')}</select></label></div>
      <label class="fld"><span id="s-lab">Montant</span><div class="inp"><input id="s-amt" type="number" min="0" step="any" inputmode="decimal" placeholder="0"><span id="s-unit">€</span></div></label>
      <div class="quick" id="s-quick"><button data-p="10">10 %</button><button data-p="25">25 %</button><button data-p="50">50 %</button><button data-p="100">Max</button></div>
      <div class="avail" id="s-avail"></div>
      <label class="fld">Message (optionnel)<div class="inp"><input id="s-msg" maxlength="120" placeholder="Joyeux anniversaire 🎂"></div></label>
      <div class="auth-err" id="s-err"></div>
      </div><div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="s-go">Envoyer</button></div>`);
    const el = md.el;
    const upd = () => {
      const a = el.querySelector('#s-asset').value; const amt = +el.querySelector('#s-amt').value || 0;
      el.querySelector('#s-assetw').hidden = kind !== 'asset';
      el.querySelector('#s-unit').textContent = kind === 'cash' ? '€' : a;
      el.querySelector('#s-lab').textContent = kind === 'cash' ? 'Montant' : 'Quantité';
      const v = kind === 'cash' ? amt : amt * (TC.Data.eur(a) || 0);
      el.querySelector('#s-avail').innerHTML = kind === 'cash' ? `Cash disponible : <b>${fmt.eur(S().cash)}</b>` : `Détenu : <b>${fmt.qty((S().holdings[a] || {}).qty || 0)} ${a}</b>${amt ? ` · valeur envoyée ≈ <b>${fmt.eur(v)}</b>` : ''}`;
      el.querySelector('#s-go').textContent = amt > 0 ? `Envoyer ${kind === 'cash' ? fmt.eur(amt) : fmt.qty(amt) + ' ' + a}` : 'Envoyer';
    };
    el.querySelector('#s-kind').onclick = e => { const b = e.target.closest('button[data-k]'); if (!b || b.disabled) return; kind = b.dataset.k; el.querySelectorAll('#s-kind button').forEach(x => x.classList.toggle('active', x === b)); el.querySelector('#s-amt').value = ''; upd(); };
    el.querySelector('#s-quick').onclick = e => { const b = e.target.closest('button'); if (!b) return; const p = +b.dataset.p / 100; const a = el.querySelector('#s-asset').value;
      el.querySelector('#s-amt').value = kind === 'cash' ? +(Math.floor(S().cash * p * 100) / 100).toFixed(2) : (p === 1 ? S().holdings[a].qty : +(S().holdings[a].qty * p).toPrecision(8)); upd(); };
    el.querySelector('#s-amt').oninput = upd; el.querySelector('#s-asset').onchange = () => { el.querySelector('#s-amt').value = ''; upd(); };
    el.querySelector('#s-go').onclick = async () => {
      const btn = el.querySelector('#s-go'); btn.disabled = true;
      try {
        const t = await N.send(friend, kind, el.querySelector('#s-asset').value, el.querySelector('#s-amt').value, el.querySelector('#s-msg').value);
        md.close(); TC.sound('cash'); TC.confetti(80);
        TC.toast(`📤 ${t.kind === 'cash' ? fmt.eur(t.eur) : fmt.qty(t.qty) + ' ' + t.asset} envoyé(s) à ${esc(friend.pseudo)} !`, 'ok');
        TC.App && TC.App.after();
      } catch (e) { el.querySelector('#s-err').textContent = N.errMsg(e); btn.disabled = false; }
    };
    upd();
  }

  function renameModal() {
    const md = TC.modal(`<h2>✏️ Changer de pseudo</h2><div class="modal-body">
      <p>Pseudo actuel : <b>${esc(N.profile.pseudo)}</b></p>
      <label class="fld">Nouveau pseudo<div class="inp"><input id="r-pseudo" maxlength="16" placeholder="ex : LoupDeBourse" autocomplete="nickname" value="${esc(N.profile.pseudo)}"></div></label>
      <div class="auth-err" id="r-msg"></div>
      <p class="hint">3 à 16 caractères : lettres (accents acceptés), chiffres ou _. Chaque pseudo est unique. Tu peux en changer une fois par jour ; ton ancien pseudo redevient libre.</p></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="r-go">Valider</button></div>`);
    const inp = md.el.querySelector('#r-pseudo'), msg = md.el.querySelector('#r-msg'), go = md.el.querySelector('#r-go');
    inp.focus(); inp.select();
    let t = null, seq = 0;
    inp.oninput = () => {
      clearTimeout(t); const v = inp.value.trim(); const my = ++seq;
      msg.className = 'auth-err'; msg.textContent = '';
      if (v.length < 3) return;
      t = setTimeout(async () => {
        const k = N.keyOf(v);
        if (k === (N.profile.nameKey || N.profile.pseudoLower)) return;
        try { const free = await N.pseudoFree(v); if (my !== seq) return; msg.className = free ? 'auth-err ok-t' : 'auth-err'; msg.textContent = free ? '✅ Disponible' : '❌ Déjà pris'; } catch (e) { }
      }, 350);
    };
    const save = async () => {
      go.disabled = true;
      try { await N.changePseudo(inp.value); md.close(); TC.toast(`✏️ Tu t'appelles maintenant <b>${esc(N.profile.pseudo)}</b>`, 'ok'); TC.sound('ach'); SO.render(); N.flush(); }
      catch (e) { msg.className = 'auth-err'; msg.textContent = N.errMsg(e); go.disabled = false; }
    };
    go.onclick = save; inp.onkeydown = e => { if (e.key === 'Enter') save(); };
  }

  function avatarModal() {
    const md = TC.modal(`<h2>Choisir un avatar</h2><div class="avatars">${N.AVATARS.map(a => `<button class="avatar big" data-av="${a}">${a}</button>`).join('')}</div>`);
    md.el.querySelector('.avatars').onclick = async e => { const b = e.target.closest('[data-av]'); if (!b) return; md.close(); try { await N.setAvatar(b.dataset.av); } catch (er) { TC.toast(N.errMsg(er), 'bad'); } };
  }

  /* ---------------- Événements ---------------- */
  const errBox = m => { const e = $('#a-err'); if (e) e.textContent = m; else TC.toast('⛔ ' + m, 'bad'); };
  async function busy(btn, fn) { if (btn) btn.disabled = true; try { await fn(); } catch (e) { errBox(N.errMsg(e)); } finally { if (btn && document.body.contains(btn)) btn.disabled = false; } }

  document.addEventListener('click', async e => {
    const b = e.target.closest('button, .copy'); if (!b) return;
    if (b.id === 'b-account') { TC.App.setTab('social'); return; }
    const a = b.dataset.soc;
    if (a === 'mode-signup' || a === 'mode-login') { SO.authMode = a === 'mode-signup' ? 'signup' : 'login'; SO.render(); return; }
    if (a === 'signup') return busy(b, () => N.signUp($('#a-email').value, $('#a-pw').value, $('#a-pseudo').value).then(() => TC.toast('🎉 Compte créé ! Un e-mail de confirmation vous a été envoyé.', 'ok', 6000)));
    if (a === 'login') return busy(b, () => N.signIn($('#a-email').value, $('#a-pw').value));
    if (a === 'forgot') return busy(b, async () => { const em = $('#a-email').value; if (!em) throw Object.assign(new Error(), { userMsg: 'Entrez d\'abord votre adresse e-mail.' }); await N.resetPassword(em); TC.toast('📧 E-mail de réinitialisation envoyé.', 'ok'); });
    if (a === 'pseudo') return busy(b, () => N.choosePseudo($('#a-pseudo2').value));
    if (a === 'logout') { if (await TC.confirm('Se déconnecter ?', 'Votre partie reste sauvegardée sur votre compte. Cet appareil repartira sur une partie invité à 10 €.', 'Déconnexion')) busy(b, N.signOut); return; }
    if (a === 'resend') return busy(b, async () => { await N.resendVerification(); TC.toast('📧 E-mail renvoyé.', 'ok'); });
    if (a === 'checkverify') return busy(b, async () => { await N.refreshUser(); TC.toast(N.user.emailVerified ? '✅ Adresse vérifiée !' : 'Pas encore vérifiée : cliquez le lien dans l\'e-mail.', N.user.emailVerified ? 'ok' : 'info'); });
    if (a === 'avatar') return avatarModal();
    if (a === 'rename') return renameModal();
    if (a === 'add') return busy(b, async () => { const r = await N.addFriend($('#f-add').value); $('#f-add').value = ''; TC.toast(r === 'accepted' ? '🤝 Vous êtes maintenant amis !' : '📨 Demande d\'ami envoyée.', 'ok'); });
    if (a === 'copy' || a === 'share' || a === 'copylink') {
      const url = N.inviteLink();
      const text = `Rejoins-moi sur Trad Center 📈 : pars de 10 € et deviens assez riche pour une Lamborghini ! Crée ton compte avec mon lien :`;
      if (a === 'share' && navigator.share) { try { await navigator.share({ title: 'Trad Center', text, url }); } catch (er) { } return; }
      try { await navigator.clipboard.writeText(a === 'copy' ? '@' + N.profile.pseudo : text + ' ' + url); TC.toast('📋 Copié !', 'ok'); } catch (er) { }
      return;
    }
    if (b.dataset.acc) { const r = N.incoming.find(x => x.id === b.dataset.acc); return busy(b, async () => { await N.accept(r); TC.toast(`🤝 ${esc(r.fromPseudo)} est maintenant votre ami !`, 'ok'); TC.sound('ach'); }); }
    if (b.dataset.dec) { const r = N.incoming.concat(N.outgoing).find(x => x.id === b.dataset.dec); return busy(b, () => N.decline(r)); }
    if (b.dataset.unfriend) { const f = N.friends.find(x => x.uid === b.dataset.unfriend); if (await TC.confirm('Retirer cet ami ?', `Retirer <b>${esc(f.pseudo)}</b> de vos amis ?`, 'Retirer', 'btn-sell')) busy(b, () => N.removeFriend(f.uid)); return; }
    if (b.dataset.send) { const f = N.friends.find(x => x.uid === b.dataset.send); if (f) sendModal(f); return; }
    if (b.dataset.board) { N.boardScope = b.dataset.board; SO.render(); if (b.dataset.board === 'world') busy(null, () => N.loadBoard('world')); return; }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const map = { 'a-pw': SO.authMode === 'signup' ? 'signup' : 'login', 'f-add': 'add', 'a-pseudo2': 'pseudo' };
    const act = map[e.target.id]; if (act) { const btn = document.querySelector(`[data-soc="${act}"]`); if (btn) btn.click(); }
  });

  // Accès au jeu réservé aux joueurs connectés : sans compte, seul l'écran de connexion est visible
  let gated = false;
  SO.gated = () => gated;
  function gate() {
    let guest = false; try { guest = localStorage.getItem('tradcenter.guest') === '1'; } catch (e) { }
    const need = !!(N.enabled && N.ready && !N.error && ((!N.user && !guest) || N.needPseudo));
    if (need === gated) return;
    gated = need;
    document.body.classList.toggle('gated', need);
    if (TC.App) TC.App.setTab(need ? 'social' : 'markets');
  }
  N.on(() => gate());
  SO.playGuest = function () { try { localStorage.setItem('tradcenter.guest', '1'); } catch (e) { } gate(); };
  document.addEventListener('click', e => { if (e.target.closest('[data-guest]')) SO.playGuest(); });

  N.on((type, d) => {
    if (type === 'change' || type === 'synced') { if (UI.tab === 'social' && !(type === 'synced' && document.activeElement && document.activeElement.closest && document.activeElement.closest('#tab-social'))) SO.render(); SO.headerBtn(); }
    if (type === 'received') {
      TC.toast(`<div class="t-ach"><span>${esc(d.fromAvatar || '💸')}</span><div><small>Vous avez reçu</small><b>${d.kind === 'cash' ? fmt.eur(d.eur) : fmt.qty(d.qty) + ' ' + esc(d.asset) + ' (' + fmt.eur(d.eur) + ')'}</b> de ${esc(d.fromPseudo)}${d.msg ? `<br><i>« ${esc(d.msg)} »</i>` : ''}</div></div>`, 'ach', 8000);
      TC.sound('kaching'); TC.confetti(120); TC.App && TC.App.after();
    }
    if (type === 'referral') {
      TC.toast(`<div class="t-ach"><span>🎁</span><div><small>Parrainage validé</small><b>+${fmt.eur(d.eur)}</b> : ${esc(d.pseudo)} a rejoint Trad Center grâce à toi !</div></div>`, 'ach', 8000);
      TC.sound('kaching'); TC.confetti(120); TC.App && TC.App.after();
    }
    if (type === 'request') { TC.toast(`👋 ${esc(d.fromPseudo)} vous demande en ami ! (onglet Amis)`, 'info', 6000); TC.sound('ach'); }
    if (type === 'askSave') {
      const { cloud, local, res } = d; let done = false;
      const nwOf = s => { const keep = G.state; G.state = Object.assign({}, keep, s); const v = G.netWorth(); G.state = keep; return v; };
      const md = TC.modal(`<h2>☁️ Deux parties trouvées</h2><div class="modal-body"><p>Ce compte a déjà une partie en ligne. Laquelle garder ?</p>
        <div class="choose"><button class="btn" data-ch="cloud">☁️ Partie du compte<br><b>${fmt.eur(nwOf(cloud))}</b></button><button class="btn" data-ch="local">📱 Partie de cet appareil<br><b>${fmt.eur(nwOf(local))}</b></button></div>
        <p class="hint">L'autre partie sera remplacée.</p></div>`, { onClose: () => { if (!done) res('cloud'); } });
      md.el.querySelector('.choose').onclick = e => { const b = e.target.closest('[data-ch]'); if (!b) return; done = true; md.close(); res(b.dataset.ch); };
    }
  });
})();

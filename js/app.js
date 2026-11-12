/* Trad Center — orchestration : événements, boucles, notifications */
(function () {
  const { $, $$, fmt, esc } = TC;
  const N = TC.Net;
  const G = TC.Game, D = TC.Data, UI = TC.UI;
  const S = () => G.state;

  function notify(r, okType = 'ok') {
    if (!r) return;
    if (r.ok) TC.toast(r.msg, r.pnl != null ? (r.pnl >= 0 ? 'ok' : 'bad') : okType);
    else { TC.toast('⛔ ' + r.msg, 'bad'); TC.sound('click'); }
  }
  function afterAction() {
    UI.header(); UI.orderLive(); UI.chartHead(); UI.chartLines(); UI.refreshTab(); checkAch(); checkBroke();
    G.sampleNW();
  }
  function checkAch() {
    G.checkAchievements().forEach((a, i) => setTimeout(() => {
      TC.toast(`<div class="t-ach"><span>${a.icon}</span><div><small>Succès débloqué</small><b>${a.name}</b></div></div>`, 'ach', 5000);
      TC.sound('ach');
    }, i * 700));
  }
  let brokeShown = false;
  function checkBroke() {
    if (!G.isBroke() || brokeShown) return;
    brokeShown = true;
    const md = TC.modal(`<div class="center"><div class="big-emoji">💸</div><h2>Faillite !</h2>
      <p>Votre patrimoine est tombé à ${fmt.eur(G.netWorth())}. Les marchés sont cruels…</p>
      <p>Vous pouvez attendre votre bonus quotidien (${fmt.dur(G.bonusReadyIn())}) ou repartir de zéro avec <b>10 €</b>. Vos succès sont conservés.</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Attendre</button><button class="btn btn-gold" id="b-restart">Recommencer avec 10 €</button></div></div>`, { onClose: () => { brokeShown = false; } });
    md.el.querySelector('#b-restart').onclick = () => { G.reset(true); md.close(); location.reload(); };
  }

  /* ---------------- Sélection d'actif ---------------- */
  function select(id) {
    if (!TC.assetById[id]) return;
    UI.sel = id;
    $$('#m-list .mrow').forEach(r => r.classList.toggle('sel', r.dataset.id === id));
    UI.chartHead(); UI.order(); UI.loadChart();
    try { localStorage.setItem('tradcenter.sel', id); } catch (e) { }
  }
  function setTab(t) {
    if (document.body.classList.contains('gated')) t = 'social'; // pas de compte : connexion d'abord
    if (['car', 'estate', 'luxury'].includes(t)) { UI.shopType = t; t = 'shop'; }
    if (t === 'ach') t = 'collection';
    UI.tab = t;
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t));
    UI.refreshTab();
    if (t === 'markets') setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
    window.scrollTo({ top: 0 });
  }
  TC.goto = id => { setTab('markets'); select(id); };
  TC.App = { setTab, after: () => afterAction(), snow: f => snow(f) };

  /* ---------------- Événements ---------------- */
  document.addEventListener('click', async e => {
    const t = e.target;
    const b = t.closest('button');
    if (t.closest('#tabs button')) return setTab(t.closest('#tabs button').dataset.tab);
    const fav = t.closest('[data-fav]');
    if (fav) { e.stopPropagation(); G.toggleFav(fav.dataset.fav); UI.list(); UI.chartHead(); return; }
    const row = t.closest('.mrow');
    if (row) { select(row.dataset.id); if (innerWidth < 900) $('.chartp').scrollIntoView({ behavior: 'smooth' }); return; }
    if (t.closest('#m-cats button')) { UI.cat = t.closest('button').dataset.cat; UI.cats(); UI.list(); return; }
    if (t.closest('#c-tf button')) { UI.tf = t.closest('button').dataset.tf; UI.tfButtons(); UI.loadChart(); return; }
    if (t.closest('#c-type button')) { const ty = t.closest('button').dataset.type; $$('#c-type button').forEach(x => x.classList.toggle('active', x.dataset.type === ty)); TC.Chart.setType(ty); UI.chartLines(); return; }
    if (t.closest('#o-mode button')) { UI.mode = t.closest('button').dataset.mode; UI.order(); return; }
    if (t.closest('#o-spotside button')) { UI.spotSide = t.closest('button').dataset.side; UI.order(); return; }
    if (t.closest('#o-levside button')) { UI.levSide = t.closest('button').dataset.side; UI.order(); return; }
    if (t.closest('#o-betdur button')) { UI.betDur = +t.closest('button').dataset.dur; UI.order(); return; }
    if (b && b.dataset.lev) { UI.lev = +b.dataset.lev; UI.order(); return; }
    const quick = t.closest('.quick[data-target] button');
    if (quick) {
      const q = quick.parentElement; const inp = $('#' + q.dataset.target); const pct = +quick.dataset.p / 100;
      if (q.dataset.base === 'cash') inp.value = +(Math.floor(S().cash * pct * 100) / 100).toFixed(2);
      else { const h = S().holdings[UI.sel]; inp.value = h ? (pct === 1 ? h.qty : +(h.qty * pct).toPrecision(8)) : 0; }
      UI.orderLive(); return;
    }
    if (b && b.id === 'o-go') {
      let r;
      if (UI.mode === 'spot' && UI.spotSide === 'buy') r = G.buy(UI.sel, $('#o-amt').value);
      else if (UI.mode === 'spot') { const h = S().holdings[UI.sel]; let q = +$('#o-qty').value; if (h && q > h.qty) q = h.qty; r = G.sell(UI.sel, q); }
      else if (UI.mode === 'lev') {
        const amt = +$('#o-amt').value;
        if (UI.lev >= 50 && amt > 0 && !(await TC.confirm('⚠️ Levier x' + UI.lev, `Avec un levier x${UI.lev}, un mouvement de seulement <b>${fmt.num(90 / UI.lev, 2)} %</b> contre vous suffit pour perdre toute la marge. On y va ?`, 'Je prends le risque', 'btn-sell'))) return;
        r = G.open(UI.sel, UI.levSide, amt, UI.lev, $('#o-sl') && $('#o-sl').value, $('#o-tp') && $('#o-tp').value);
      }
      notify(r);
      if (r.ok) { TC.sound(UI.mode === 'spot' && UI.spotSide === 'sell' ? 'sell' : 'buy'); UI.order(); afterAction(); }
      return;
    }
    if (b && b.dataset.bet) {
      const r = G.bet(UI.sel, b.dataset.bet, $('#o-amt').value, UI.betDur);
      notify(r); if (r.ok) { TC.sound('buy'); UI.order(); afterAction(); }
      return;
    }
    if (b && b.dataset.close) {
      const r = G.close(+b.dataset.close); notify(r);
      if (r.ok) { TC.sound(r.pnl >= 0 ? 'win' : 'lose'); afterAction(); }
      return;
    }
    if (b && b.dataset.goto) return TC.goto(b.dataset.goto);
    if (t.closest('#gta') && !TC.season.noel) { TC.goto('TTWO'); return; } // bandeau GTA VI → action Take-Two (Rockstar)
    if (b && b.dataset.sellall) {
      const id = b.dataset.sellall; const h = S().holdings[id]; if (!h) return;
      if (!(await TC.confirm('Tout vendre ?', `Vendre <b>${fmt.qty(h.qty)} ${id}</b> pour environ <b>${fmt.eur(G.holdingValue(id) * (1 - G.feeSpot()))}</b> ?`, 'Vendre', 'btn-sell'))) return;
      const r = G.sell(id, h.qty); notify(r); if (r.ok) { TC.sound('sell'); afterAction(); }
      return;
    }
    if (b && b.dataset.shop) { UI.shop(b.dataset.shop); return; }
    if (t.closest('#goalbar')) { setTab('shop'); return; }
    if (b && b.dataset.sort) { UI.shopSort = b.dataset.sort; UI.refreshTab(); return; }
    if (b && b.dataset.goal) { S().goal = b.dataset.goal; G.save(); UI.header(); UI.refreshTab(); TC.toast('🎯 Nouvel objectif défini', 'info'); return; }
    if (b && b.dataset.buyitem) {
      const it = TC.shopById[b.dataset.buyitem];
      if (!(await TC.confirm(`${it.emoji} ${it.brand} ${it.model}`, `${TC.itemVis(it, 'modal-vis')}Acheter pour <b>${fmt.eur(it.price)}</b> ?<br><small>${TC.SHOP_TYPES[it.type].note}</small>`, 'Acheter 🔑', 'btn-gold'))) return;
      const r = G.buyItem(it.id); notify(r);
      if (r.ok) { TC.sound('cash'); TC.confetti(); celebrate(it); afterAction(); }
      return;
    }
    if (b && b.dataset.sellitem) {
      const o = S().owned.find(x => x.uid === +b.dataset.sellitem); if (!o) return; const it = TC.shopById[o.item];
      if (!(await TC.confirm('Revendre ?', `Revendre <b>${it.brand} ${it.model}</b> pour <b>${fmt.eur(G.itemResale(o))}</b> ?`, 'Revendre', 'btn-sell'))) return;
      const r = G.sellItem(o.uid); notify(r); if (r.ok) { TC.sound('sell'); afterAction(); }
      return;
    }
    if (b && b.id === 'b-rent') { const r = G.collectRent(); if (r > 0) { TC.toast(`🏠 +${fmt.eur(r)} de loyers encaissés`, 'ok'); TC.sound('cash'); afterAction(); } return; }
    if (b && b.id === 'b-bonus') { const r = G.claimBonus(); notify(r); if (r.ok) { TC.sound('cash'); TC.confetti(60); afterAction(); } return; }
    if (b && b.id === 'b-sound') { S().sound = !S().sound; G.save(); UI.header(); if (S().sound) TC.sound('click'); return; }
    if (b && b.id === 'b-help') return help();
    if (b && b.id === 'b-install') return install();
    if (b && b.id === 'b-settings') return settings();
    if (b && b.dataset.guestsave) return settings();
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'm-search') { UI.q = e.target.value; UI.list(); }
    if (e.target.id === 'o-lev') { UI.lev = +e.target.value; $('#o-levv').textContent = 'x' + UI.lev; const go = $('#o-go'); if (go) go.textContent = (UI.levSide === 'long' ? 'Ouvrir Long' : 'Ouvrir Short') + ' x' + UI.lev; $$('.lev-quick button').forEach(x => x.classList.toggle('active', +x.dataset.lev === UI.lev)); UI.orderLive(); }
    if (['o-amt', 'o-qty'].includes(e.target.id)) UI.orderLive();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && ['o-amt', 'o-qty', 'o-sl', 'o-tp'].includes(e.target.id)) { const go = $('#o-go'); if (go) go.click(); }
    if (e.key === 'Escape') { const m = $('#modal'); if (m.classList.contains('open')) m.click(); }
  });

  function celebrate(it) {
    TC.modal(`<div class="center">${TC.itemVis(it, 'modal-vis xl')}
      <h2>${it.brand} ${it.model}</h2><p>est désormais à vous ! Retrouvez-la dans votre <b>Collection</b>.</p>
      ${it.type === 'estate' ? `<p>🏠 Ce bien vous rapporte <b>${fmt.eur(it.price * TC.RENT_RATE_PER_HOUR)}</b> de loyer chaque heure.</p>` : ''}
      <div class="modal-actions"><button class="btn btn-gold" data-close>Génial ! 🎉</button></div></div>`);
  }

  function help() {
    TC.modal(`<div class="center"><img src="icons/icon-192.png" class="install-icon" alt=""><h2>Bienvenue sur Trad Center</h2></div>
      <div class="modal-body help steps">
        <div class="step"><span>1</span><div><b>Tu commences avec 10 €</b><small>Les prix sont les vrais : Bitcoin, Tesla, CAC 40…</small></div></div>
        <div class="step"><span>2</span><div><b>Achète quand ça va monter</b><small>Choisis un actif dans Marchés, touche Acheter. Revends quand tu as gagné.</small></div></div>
        <div class="step"><span>3</span><div><b>Offre-toi des voitures et des maisons</b><small>Dans la Boutique : de la trottinette à la Bugatti. Les maisons rapportent un loyer.</small></div></div>
        <div class="step"><span>🎁</span><div><b>+${G.BONUS} € chaque jour, +20 € par ami invité</b><small>Bouton 🎁 en haut, et ton lien d'invitation dans Amis.</small></div></div>
      </div><div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>C'est parti 🚀</button></div>`, { cls: 'wide', onClose: () => { if (!S().seenIntro) { S().seenIntro = true; G.save(); } } });
  }

  /* ---------------- Compte à rebours : sortie de GTA VI (19 novembre 2026, heure locale) ---------------- */
  const GTA_DATE = new Date(2026, 10, 19, 0, 0, 0);
  const box = (v, l) => `<span class="gta-box"><b>${String(v).padStart(2, '0')}</b><i>${l}</i></span>`;
  const countdown = ms => { const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `<div class="gta-cd">${box(d, 'jours')}${box(h, 'h')}${box(m, 'min')}${box(s, 's')}</div>`; };
  // En décembre : compte à rebours jusqu'à Noël, puis jusqu'au Nouvel An
  function noelBanner(el) {
    const now = new Date(), y = now.getMonth() === 11 ? now.getFullYear() : new Date().getFullYear();
    const xmas = new Date(y, 11, 25), ny = new Date(y + 1, 0, 1);
    if (now < xmas) el.innerHTML = `<span class="gta-palm">🎄</span><div class="gta-txt"><small>Noël dans</small><span class="gta-date">25.12.${y}</span></div>${countdown(xmas - now)}<span class="gta-palm r">🎁</span>`;
    else if (now.getDate() === 25) el.innerHTML = `<span class="gta-palm">🎅</span><div class="gta-txt"><small>Trad Center vous souhaite un</small><b class="gta-out">JOYEUX NOËL 🎄</b></div><span class="gta-palm r">🎁</span>`;
    else el.innerHTML = `<span class="gta-palm">🎆</span><div class="gta-txt"><small>Nouvel An dans</small><span class="gta-date">01.01.${y + 1}</span></div>${countdown(ny - now)}<span class="gta-palm r">🥂</span>`;
  }
  // Action de la maison mère de Rockstar Games, cliquable depuis le bandeau
  function ttwoChip() {
    const p = D.eur('TTWO'), c = D.change('TTWO');
    return p ? `<button class="ttwo-chip" data-goto="TTWO" title="Trader l'action Take-Two (Rockstar Games)">R★ <b>${fmt.eur(p)}</b> <i class="${c >= 0 ? 'up' : 'down'}">${fmt.pct(c)}</i></button>` : `<button class="ttwo-chip" data-goto="TTWO">R★ Trader l'action</button>`;
  }
  function gta() {
    const el = $('#gta'); if (!el) return;
    if (TC.season.noel) { el.title = 'Joyeuses fêtes !'; return noelBanner(el); }
    const ms = GTA_DATE - Date.now();
    if (ms <= 0) { el.innerHTML = `<span class="gta-palm">🌴</span><div class="gta-txt"><small>Grand Theft Auto VI · Rockstar Games</small><b class="gta-out">EST SORTI 🎉</b></div><span class="gta-ttwo">${ttwoChip()}</span><span class="gta-palm r">🌴</span>`; return; }
    el.innerHTML = `<span class="gta-palm">🌴</span><div class="gta-txt"><small>Sortie de GTA VI</small><span class="gta-date">Rockstar Games · 19.11.2026</span></div>
      ${countdown(ms)}<span class="gta-ttwo">${ttwoChip()}</span><span class="gta-palm r">🌴</span>`;
  }

  /* ---------------- Neige (thème de Noël) ---------------- */
  function snow(force) {
    if (document.getElementById('snow')) return;
    if ((!TC.season.noel && !force) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas'); c.id = 'snow'; document.body.appendChild(c);
    const ctx = c.getContext('2d'); let W, H, flakes = [];
    const resize = () => { const r = devicePixelRatio || 1; W = innerWidth; H = innerHeight; c.width = W * r; c.height = H * r; c.style.width = W + 'px'; c.style.height = H + 'px'; ctx.setTransform(r, 0, 0, r, 0, 0); };
    resize(); addEventListener('resize', resize);
    const n = innerWidth < 600 ? 55 : 110;
    for (let i = 0; i < n; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2.4 + 0.8, s: Math.random() * 0.6 + 0.35, w: Math.random() * Math.PI * 2 });
    (function loop() {
      if (!document.hidden) {
        ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,255,255,.85)';
        for (const f of flakes) {
          f.y += f.s; f.w += 0.01; f.x += Math.sin(f.w) * 0.35;
          if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
          ctx.globalAlpha = 0.35 + f.r / 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        }
      }
      requestAnimationFrame(loop);
    })();
  }
  function noelWelcome() {
    if (!TC.season.noel) return;
    const key = 'tradcenter.noel.' + new Date().getFullYear();
    if (!TC.season.preview && localStorage.getItem(key)) return;
    if ($('#modal').classList.contains('open')) { setTimeout(noelWelcome, 4000); return; }
    if (!TC.season.preview) try { localStorage.setItem(key, '1'); } catch (e) { }
    TC.modal(`<div class="center"><div class="big-emoji">🎄</div><h2>C'est Noël sur Trad Center !</h2>
      <p>Jusqu'au 31 décembre, ton <b>bonus quotidien est doublé : 20 € par jour</b> 🎁</p>
      <p>🗓️ <b>Calendrier de l'Avent</b> : une case à ouvrir chaque jour jusqu'au 24.<br>🏆 <b>Course de Noël</b> : le plus gros gain du mois devient Champion.<br>🎅 Le <b>25</b> : cadeau sous le sapin, Père Noël secret, pari x3 et un traîneau en édition limitée.</p>
      <p><b>Touche le bandeau en haut</b> pour tout voir.</p>
      <div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>Joyeuses fêtes ! ✨</button></div></div>`);
  }

  /* ---------------- Annonces (fichier announce.json du site) ---------------- */
  async function announce() {
    try {
      const a = await (await fetch('announce.json?t=' + Date.now(), { cache: 'no-store' })).json();
      if (!a || !a.id || localStorage.getItem('tradcenter.announce') === a.id) return;
      if (a.silent) { localStorage.setItem('tradcenter.announce', a.id); return; } // notification seulement (l'événement s'affiche tout seul)
      if ($('#modal').classList.contains('open')) { setTimeout(announce, 5000); return; }
      localStorage.setItem('tradcenter.announce', a.id);
      TC.modal(`<div class="center"><div class="big-emoji">${a.emoji || '📣'}</div><h2>${TC.esc(a.title)}</h2>
        ${a.text ? `<p>${TC.esc(a.text)}</p>` : ''}
        ${Array.isArray(a.items) ? `<div class="news">${a.items.map(i => `<div class="news-i"><span>${TC.esc(i.icon || '✨')}</span><div><b>${TC.esc(i.title)}</b>${i.text ? `<small>${TC.esc(i.text)}</small>` : ''}</div></div>`).join('')}</div>` : ''}
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Plus tard</button><button class="btn btn-gold" id="b-ann">${TC.esc(a.button || 'OK')}</button></div></div>`);
      $('#b-ann').onclick = () => { $('#modal').click(); if (a.tab === 'shop') UI.shopType = 'chest'; if (a.tab) setTab(a.tab); if (a.share && TC.Share) setTimeout(() => TC.Share.popup(true), 350); };
    } catch (e) { }
  }

  /* ---------------- Installation (écran d'accueil) ---------------- */
  let deferredPrompt = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#b-install').hidden = false; });
  window.addEventListener('appinstalled', () => { $('#b-install').hidden = true; TC.toast('📲 Trad Center est installé sur votre écran d\'accueil !', 'ok'); });
  async function install() {
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    TC.modal(`<div class="center"><img src="icons/icon-192.png" class="install-icon" alt=""><h2>Mettre Trad Center sur l'écran d'accueil</h2></div>
      <div class="modal-body help">${ios ? `
        <p><b>Sur iPhone / iPad (Safari) :</b></p>
        <p>1. Touchez le bouton <b>Partager</b> <span class="kbd">⬆️</span> en bas de Safari.</p>
        <p>2. Choisissez <b>« Sur l'écran d'accueil »</b> <span class="kbd">➕</span>.</p>
        <p>3. Touchez <b>Ajouter</b>. L'icône Trad Center apparaît comme une vraie appli, en plein écran.</p>` : `
        <p><b>Sur Android (Chrome) :</b> menu <span class="kbd">⋮</span> → <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>.</p>
        <p><b>Sur ordinateur (Chrome / Edge) :</b> icône d'installation <span class="kbd">⊕</span> à droite de la barre d'adresse.</p>`}
      </div><div class="modal-actions"><button class="btn btn-gold" data-close>OK</button></div>`);
  }

  function changePw() {
    const md = TC.modal(`<h2>🔑 Changer mon mot de passe</h2><div class="modal-body">
      <label class="fld">Mot de passe actuel<div class="inp pw"><input id="pw-old" type="password" autocomplete="current-password"><button type="button" class="eye" data-eye="pw-old" aria-label="Afficher">👁️</button></div></label>
      <label class="fld">Nouveau mot de passe<div class="inp pw"><input id="pw-new" type="password" autocomplete="new-password" placeholder="6 caractères minimum"><button type="button" class="eye" data-eye="pw-new" aria-label="Afficher">👁️</button></div></label>
      <div class="auth-err" id="pw-err"></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="pw-ok">Enregistrer</button></div>
      <p class="hint">Touche 👁️ pour voir ce que tu tapes. Mot de passe actuel oublié ? Utilise « Mot de passe oublié » dans les paramètres.</p></div>`);
    md.el.querySelector('#pw-ok').onclick = async e => {
      const b = e.target; b.disabled = true; const err = md.el.querySelector('#pw-err'); err.textContent = '';
      try { await N.changePassword(md.el.querySelector('#pw-old').value, md.el.querySelector('#pw-new').value); md.close(); TC.toast('✅ Mot de passe changé', 'ok'); }
      catch (x) { err.textContent = /wrong-password|invalid-credential|invalid-login/.test(String(x.code || x.message)) ? 'Mot de passe actuel incorrect.' : N.errMsg(x); b.disabled = false; }
    };
  }
  // bouton 👁️ : afficher / masquer le mot de passe pendant qu'on le tape
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-eye]'); if (!b) return;
    e.preventDefault(); const i = document.getElementById(b.dataset.eye); if (!i) return;
    i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? '👁️' : '🙈';
  });
  function settings() {
    const h = D.health;
    const md = TC.modal(`<h2>⚙️ Paramètres</h2><div class="modal-body">
      <h4>Sources de données</h4>
      <div class="kv"><span>Crypto (Binance)</span><b>${h.binance}</b><span>Bourse (Yahoo Finance)</span><b>${h.yahoo}</b><span>Devises</span><b>${D.fxStatus}</b><span>1 € =</span><b>${fmt.num(D.fx.USD, 4)} $</b></div>
      <p class="hint">Si votre réseau bloque une source, le jeu utilise le dernier cours connu puis une simulation (badge SIM) jusqu'au retour de la connexion.</p>
      <div class="modal-actions left"><button class="btn" id="b-help2">❔ Aide</button><button class="btn" id="b-notif2">🔔 Notifications</button></div>
      ${N && N.isGuest && N.isGuest() ? `<h4>👤 Mon compte</h4><div class="kv"><span>Pseudo</span><b>${esc((N.profile && N.profile.pseudo) || '')} <span class="guesttag">Invité</span></b></div>
      <p class="hint">Tu joues en invité : tu es dans les classements et le championnat, mais sans e-mail ta partie est perdue si tu changes de téléphone ou vides ton navigateur. Crée ton compte : tu gardes tout (argent, objets, amis).</p>
      <label class="fld">E-mail<div class="inp"><input id="g-email" type="email" autocomplete="email" placeholder="toi@exemple.fr"></div></label>
      <label class="fld">Mot de passe (6 caractères min.)<div class="inp pw"><input id="g-pw" type="password" autocomplete="new-password"><button type="button" class="eye" data-eye="g-pw">👁️</button></div></label>
      <div class="auth-err" id="g-err"></div>
      <button class="btn btn-gold logout-btn" id="b-upgrade">✅ Créer mon compte (je garde ma partie)</button>
      <button class="btn btn-ghost btn-sm" id="b-login">🔐 J'ai déjà un compte : me connecter</button>` : N && N.user && N.user.email ? `<h4>👤 Mon compte</h4>
      <div class="kv"><span>Pseudo</span><b>${esc((N.profile && N.profile.pseudo) || '')}</b><span>E-mail</span><b>${esc(N.user.email)}</b><span>Mot de passe</span><b>••••••••</b></div>
      <p class="hint">🔒 Ton mot de passe n'est jamais enregistré en clair, même pas par le jeu : personne ne peut le lire. Si tu l'as oublié, change-le ou reçois un e-mail pour le réinitialiser.</p>
      <div class="modal-actions left"><button class="btn" id="b-pw">🔑 Changer mon mot de passe</button><button class="btn btn-ghost" id="b-pwmail">📧 Mot de passe oublié</button></div>
      <button class="btn btn-sell logout-btn" id="b-logout">🚪 Se déconnecter</button>
      <button class="btn btn-ghost btn-sm del-btn" id="b-delacc">🗑️ Supprimer mon compte</button>` : N && N.enabled ? `<h4>👤 Mon compte</h4><p class="hint">Tu joues en invité : ta partie n'est que sur cet appareil.</p><button class="btn btn-gold logout-btn" id="b-login">🔐 Se connecter ou créer un compte</button>` : ''}
      <h4>Jeu</h4>
      <button class="btn" id="b-cheat">🎮 Entrer un code de triche</button>
      <label class="tgl"><input type="checkbox" id="s-expert" ${S().expert ? 'checked' : ''}><span>⚡ Mode expert : trading à levier (x2 à x100, plus risqué)</span></label>
      <h4>Application</h4>
      <button class="btn" id="b-install2">📲 Installer sur l'écran d'accueil</button>
      <h4>Son et vibrations</h4>
      <button class="btn" id="b-sound2">${S().sound ? '🔊 Activés — couper' : '🔇 Coupés — activer'}</button>
      <h4>🎵 Musique de fond</h4>
      <label class="tgl"><input type="checkbox" id="s-music" ${S().music !== false ? 'checked' : ''}><span>Petite musique lounge pendant que tu joues</span></label>
      <label class="mus-vol">🔈<input type="range" id="s-musvol" min="5" max="100" step="5" value="${TC.Music ? TC.Music.vol() : 35}" aria-label="Volume de la musique">🔊</label>
      <h4>Sauvegarde</h4>
      <div class="modal-actions left"><button class="btn" id="b-export">📤 Exporter</button><button class="btn" id="b-import">📥 Importer</button></div>
      <h4>🔒 Confidentialité</h4>
      <p class="hint">Ce que le jeu fait de tes données, tes droits et les règles du jeu.</p>
      <a class="btn" href="confidentialite.html">📄 Confidentialité et conditions</a>
      <h4>Zone dangereuse</h4>
      <button class="btn btn-sell" id="b-reset">🗑️ Recommencer une partie à 10 €</button>
      </div>`);
    const pwb = md.el.querySelector('#b-pw'); if (pwb) pwb.onclick = () => changePw();
    const da = md.el.querySelector('#b-delacc'); if (da) da.onclick = () => {
      const m2 = TC.modal(`<h2>🗑️ Supprimer mon compte</h2><div class="modal-body">
        <p>Ta partie, ton argent, tes objets, tes amis et ton adresse e-mail seront <b>définitivement effacés</b>. C'est irréversible.</p>
        <p class="hint">Astuce : tu peux d'abord exporter ta sauvegarde (Paramètres → Sauvegarde → Exporter).</p>
        <label class="fld">Ton mot de passe, pour confirmer<div class="inp pw"><input id="del-pw" type="password" autocomplete="current-password"><button type="button" class="eye" data-eye="del-pw">👁️</button></div></label>
        <label class="fld">Écris <b>SUPPRIMER</b><div class="inp"><input id="del-ok" autocomplete="off"></div></label>
        <div class="auth-err" id="del-err"></div>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-sell" id="del-go">Supprimer définitivement</button></div></div>`);
      m2.el.querySelector('#del-go').onclick = async e => {
        const b = e.target, err = m2.el.querySelector('#del-err');
        if (m2.el.querySelector('#del-ok').value.trim().toUpperCase() !== 'SUPPRIMER') { err.textContent = 'Écris SUPPRIMER pour confirmer.'; return; }
        b.disabled = true; err.textContent = '';
        try { await N.deleteAccount(m2.el.querySelector('#del-pw').value); } catch (x) { err.textContent = x.userMsg || N.errMsg(x); b.disabled = false; }
      };
    };
    const li = md.el.querySelector('#b-login'); if (li) li.onclick = async () => {
      if (N.isGuest && N.isGuest()) { // se connecter à un autre compte : la partie invité serait perdue
        if (!(await TC.confirm('Se connecter à un autre compte ?', 'Ta partie d\'invité sera <b>perdue</b> (crée plutôt ton compte pour la garder).', 'Continuer', 'btn-sell'))) return;
        try { localStorage.removeItem('tradcenter.guest'); } catch (e) { } try { await N.signOut(); } catch (e) { location.reload(); } return;
      }
      try { localStorage.removeItem('tradcenter.guest'); } catch (e) { } location.reload();
    };
    const up = md.el.querySelector('#b-upgrade'); if (up) up.onclick = async () => {
      const err = md.el.querySelector('#g-err'); err.textContent = ''; up.disabled = true;
      try { await N.upgradeGuest(md.el.querySelector('#g-email').value, md.el.querySelector('#g-pw').value); md.close(); TC.toast('✅ Compte créé ! Ta partie est sauvegardée avec ton e-mail.', 'ok', 6000); TC.sound('ach'); }
      catch (e) { err.textContent = e.userMsg || (N.errMsg ? N.errMsg(e) : e.message); up.disabled = false; }
    };
    const lo = md.el.querySelector('#b-logout'); if (lo) lo.onclick = async () => {
      if (!(await TC.confirm('Se déconnecter ?', 'Ta partie reste sauvegardée sur ton compte : tu la retrouveras en te reconnectant. Cet appareil revient à l\'écran de connexion.', 'Se déconnecter', 'btn-sell'))) return;
      try { localStorage.removeItem('tradcenter.guest'); } catch (e) { }
      try { await N.signOut(); } catch (e) { TC.toast(N.errMsg(e), 'bad'); }
    };
    const pwm = md.el.querySelector('#b-pwmail'); if (pwm) pwm.onclick = async () => { try { await N.resetPassword(N.user.email); TC.toast('📧 E-mail envoyé à ' + esc(N.user.email) + ' : suis le lien pour choisir un nouveau mot de passe.', 'ok', 7000); } catch (e) { TC.toast(N.errMsg(e), 'bad'); } };
    md.el.querySelector('#b-install2').onclick = () => install();
    md.el.querySelector('#b-cheat').onclick = () => TC.Cheats.open();
    md.el.querySelector('#s-expert').onchange = e => { S().expert = e.target.checked; G.save(); UI.order(); TC.toast(e.target.checked ? '⚡ Mode expert activé : onglet Levier disponible' : 'Mode expert désactivé', 'info'); };
    md.el.querySelector('#b-help2').onclick = () => help();
    md.el.querySelector('#b-notif2').onclick = () => TC.Notif.open();
    md.el.querySelector('#b-sound2').onclick = e => { S().sound = !S().sound; G.save(); UI.header(); e.target.textContent = S().sound ? '🔊 Activés — couper' : '🔇 Coupés — activer'; };
    md.el.querySelector('#s-music').onchange = e => TC.Music.setOn(e.target.checked);
    const mv = md.el.querySelector('#s-musvol'); mv.oninput = () => TC.Music.setVol(+mv.value); mv.onchange = () => G.save();
    md.el.querySelector('#b-reset').onclick = async () => {
      if (await TC.confirm('Tout effacer ?', 'Votre argent, vos positions et vos biens seront perdus. Les succès sont conservés.', 'Recommencer', 'btn-sell')) { G.reset(true); location.reload(); }
    };
    md.el.querySelector('#b-export').onclick = () => {
      const blob = new Blob([JSON.stringify(S())], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tradcenter-sauvegarde.json'; a.click();
    };
    md.el.querySelector('#b-import').onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
      i.onchange = async () => { try { const j = JSON.parse(await i.files[0].text()); if (j.v !== 1) throw 0; localStorage.setItem('tradcenter.save.v1', JSON.stringify(j)); location.reload(); } catch (e) { TC.toast('Fichier invalide', 'bad'); } };
      i.click();
    };
  }

  /* ---------------- Boucles ---------------- */
  let dirty = false, fxDirty = false;
  D.on(id => {
    if (id === '__health') { UI.databar(); return; }
    if (id === '__fx') { fxDirty = true; dirty = true; return; }
    const p = D.prices[id]; if (p) p._dirty = true;
    dirty = true;
    // positions : contrôle immédiat liquidation / SL / TP
    if (S().positions.some(x => x.asset === id)) {
      G.checkPositions(id).forEach(r => {
        if (!r.ok) return;
        TC.toast((r.tag ? r.tag + ' — ' : '') + r.msg, r.pnl >= 0 ? 'ok' : 'bad', 5000);
        TC.sound(r.pnl >= 0 ? 'win' : 'lose');
        afterAction();
      });
    }
    if (id === UI.sel) TC.Chart.tick(D.eur(id));
  });

  setInterval(() => {
    if (!dirty) return; dirty = false;
    UI.listUpdate(fxDirty); fxDirty = false;
    for (const id in D.prices) D.prices[id]._dirty = false;
    UI.chartPrice(); UI.orderLive(); UI.header();
  }, 400);

  let slow = 0;
  setInterval(async () => {
    slow++;
    UI.tickerUpdate(); UI.chartHead();
    if (slow % 2 === 0) UI.databar();
    // paris arrivés à échéance
    const res = await G.checkBets();
    res.forEach(r => {
      const a = r.bet.asset;
      if (r.result === 'win') { TC.toast(`🎯 Pari gagné sur ${a} ! ${fmt.eur(r.bet.start)} → ${fmt.eur(r.end)} : <b>+${fmt.eur(r.pnl)}</b>`, 'ok', 6000); TC.sound('win'); }
      else if (r.result === 'lose') { TC.toast(`❌ Pari perdu sur ${a}. ${fmt.eur(r.bet.start)} → ${fmt.eur(r.end)} : ${fmt.eur(r.pnl)}`, 'bad', 6000); TC.sound('lose'); }
      else TC.toast(`↔️ Égalité sur ${a} : mise remboursée`, 'info');
    });
    if (res.length) afterAction();
    UI.orderLive();
    if (UI.tab !== 'markets' && (slow % 2 === 0 || UI.tab === 'collection')) UI.liveTab();
    UI.header();
    if (slow % 30 === 0) { G.sampleNW(); G.save(); checkAch(); }
    checkBroke();
  }, 1000);

  /* ---------------- Démarrage ---------------- */
  function boot() {
    // le bouton d'installation est dans les réglages
    TC.Net.init();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
    TC.onImages(() => { if (['shop', 'collection'].includes(UI.tab)) UI.refreshTab(); UI.header(); });
    gta(); setInterval(gta, 1000); snow();
    if (TC.season.noel) { setTimeout(noelWelcome, 1800); const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = '#0b1d1a'; }
    setTimeout(() => TC.loadImages(), 300);
    try { const s = localStorage.getItem('tradcenter.sel'); if (s && TC.assetById[s]) UI.sel = s; } catch (e) { }
    // liens ouverts depuis une notification : ?a=BTC ou ?tab=social
    const qs = new URLSearchParams(location.search);
    if (qs.get('a') && TC.assetById[qs.get('a')]) UI.sel = qs.get('a');
    if (qs.get('tab')) setTimeout(() => setTab(qs.get('tab')), 0);
    if (qs.get('ref')) { try { if (!localStorage.getItem('tradcenter.ref')) localStorage.setItem('tradcenter.ref', qs.get('ref').slice(0, 64)); } catch (e) { } }
    if (qs.toString()) history.replaceState(null, '', location.pathname);
    setTimeout(announce, 2500);
    TC.Chart.init($('#chart'));
    UI.cats(); UI.list(); UI.tfButtons(); UI.ticker(); UI.databar();
    UI.chartHead(); UI.order(); UI.header();
    D.start();
    // premier chargement du graphique une fois les prix arrivés
    let tries = 0;
    const waitPrice = setInterval(() => {
      if (D.eur(UI.sel) != null || ++tries > 40) { clearInterval(waitPrice); UI.loadChart(); UI.chartHead(); UI.order(); }
    }, 500);
    // loyers accumulés pendant l'absence
    const pend = G.pendingRent();
    if (pend >= 0.01) setTimeout(() => TC.toast(`🏠 ${fmt.eur(pend)} de loyers vous attendent dans votre Collection`, 'info', 6000), 1500);
    if (!S().seenIntro) setTimeout(help, 400);
    setInterval(guestNudge, 60000);
  }
  /* Invité qui progresse : rappel discret (au plus une fois par jour) de créer son compte pour ne pas perdre sa partie */
  function guestNudge() {
    const N = TC.Net;
    if (document.hidden || !N || !N.isGuest || !N.isGuest() || $('#modal.open') || document.body.classList.contains('gated')) return;
    const nw = G.netWorth(), trades = (S().stats && S().stats.trades) || 0;
    if (nw < 25 && trades < 5) return; // rien d'important à perdre pour l'instant
    let last = 0; try { last = +localStorage.getItem('tradcenter.guestnudge') || 0; } catch (e) { }
    if (Date.now() - last < 24 * 3600000) return;
    try { localStorage.setItem('tradcenter.guestnudge', String(Date.now())); } catch (e) { }
    TC.toast(`💾 Ta partie d'invité (${fmt.eur(nw)}) disparaît si tu changes de téléphone. <button class="btn btn-sm btn-gold" data-guestsave="1">Créer mon compte</button>`, 'info', 12000);
  }
  boot();
})();

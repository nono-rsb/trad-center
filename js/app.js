/* Trad Center — orchestration : événements, boucles, notifications */
(function () {
  const { $, $$, fmt } = TC;
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
    UI.tab = t;
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t));
    UI.refreshTab();
    if (t === 'markets') setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
    window.scrollTo({ top: 0 });
  }
  TC.goto = id => { setTab('markets'); select(id); };
  TC.App = { setTab, after: () => afterAction() };

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
    if (b && b.dataset.sellall) {
      const id = b.dataset.sellall; const h = S().holdings[id]; if (!h) return;
      if (!(await TC.confirm('Tout vendre ?', `Vendre <b>${fmt.qty(h.qty)} ${id}</b> pour environ <b>${fmt.eur(G.holdingValue(id) * (1 - G.FEE_SPOT))}</b> ?`, 'Vendre', 'btn-sell'))) return;
      const r = G.sell(id, h.qty); notify(r); if (r.ok) { TC.sound('sell'); afterAction(); }
      return;
    }
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
    TC.modal(`<h2>📈 Bienvenue sur Trad Center</h2>
      <div class="modal-body help">
        <p>Vous démarrez avec <b>10 €</b>. Votre mission : devenir assez riche pour vous offrir une <b>Porsche</b>, une <b>Lamborghini</b>, une <b>Ferrari</b>… puis des villas, des yachts et des jets.</p>
        <h4>📊 Des cours 100 % réels</h4>
        <p>Les prix sont ceux des vrais marchés, en direct : Bitcoin, Ethereum et ~20 cryptos (Binance, temps réel), CAC 40, S&amp;P 500, Nasdaq, DAX…, actions (Tesla, Apple, LVMH, Ferrari…), or, pétrole et devises (Yahoo Finance, BCE). Tout est converti en euros au taux de change réel. Les marchés boursiers ferment le soir et le week-end, les cryptos tournent 24 h/24.</p>
        <h4>💵 Comptant</h4><p>Achetez et revendez. Vous gagnez si le prix monte. Risque limité à votre mise.</p>
        <h4>⚡ Levier (x1 à x100)</h4><p><b>Long</b> = vous pariez sur la hausse, <b>Short</b> = sur la baisse. Le levier multiplie vos gains et vos pertes. Si la perte atteint 90 % de la marge : liquidation.</p>
        <h4>🎲 Paris</h4><p>Le prix sera-t-il plus haut ou plus bas dans 1, 5, 15 ou 60 minutes ? Gagné = mise x1,9.</p>
        <h4>🛍️ Boutique</h4><p>Avec votre cash, achetez voitures, immobilier et objets de luxe. L'immobilier vous verse un <b>loyer chaque heure</b>, même quand le jeu est fermé (48 h max). Tout peut être revendu.</p>
        <h4>🎁 Bonus</h4><p>Chaque jour, récupérez 10 € gratuits.</p>
        <p class="hint">Votre partie est sauvegardée automatiquement dans ce navigateur. Aucun argent réel n'est en jeu.</p>
      </div><div class="modal-actions"><button class="btn btn-gold" data-close>C'est parti ! 🚀</button></div>`, { cls: 'wide', onClose: () => { if (!S().seenIntro) { S().seenIntro = true; G.save(); } } });
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

  function settings() {
    const h = D.health;
    const md = TC.modal(`<h2>⚙️ Paramètres</h2><div class="modal-body">
      <h4>Sources de données</h4>
      <div class="kv"><span>Crypto (Binance)</span><b>${h.binance}</b><span>Bourse (Yahoo Finance)</span><b>${h.yahoo}</b><span>Devises</span><b>${D.fxStatus}</b><span>1 € =</span><b>${fmt.num(D.fx.USD, 4)} $</b></div>
      <p class="hint">Si votre réseau bloque une source, le jeu utilise le dernier cours connu puis une simulation (badge SIM) jusqu'au retour de la connexion.</p>
      <div class="modal-actions left"><button class="btn" id="b-help2">❔ Aide</button><button class="btn" id="b-notif2">🔔 Notifications</button></div>
      <h4>Application</h4>
      <button class="btn" id="b-install2">📲 Installer sur l'écran d'accueil</button>
      <h4>Son et vibrations</h4>
      <button class="btn" id="b-sound2">${S().sound ? '🔊 Activés — couper' : '🔇 Coupés — activer'}</button>
      <h4>Sauvegarde</h4>
      <div class="modal-actions left"><button class="btn" id="b-export">📤 Exporter</button><button class="btn" id="b-import">📥 Importer</button></div>
      <h4>Zone dangereuse</h4>
      <button class="btn btn-sell" id="b-reset">🗑️ Recommencer une partie à 10 €</button>
      </div>`);
    md.el.querySelector('#b-install2').onclick = () => install();
    md.el.querySelector('#b-help2').onclick = () => help();
    md.el.querySelector('#b-notif2').onclick = () => TC.Notif.open();
    md.el.querySelector('#b-sound2').onclick = e => { S().sound = !S().sound; G.save(); UI.header(); e.target.textContent = S().sound ? '🔊 Activés — couper' : '🔇 Coupés — activer'; };
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
    if (!standalone()) $('#b-install').hidden = false;
    TC.Net.init();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
    TC.onImages(() => { if (['car', 'estate', 'luxury', 'collection'].includes(UI.tab)) UI.refreshTab(); UI.header(); });
    setTimeout(() => TC.loadImages(), 300);
    try { const s = localStorage.getItem('tradcenter.sel'); if (s && TC.assetById[s]) UI.sel = s; } catch (e) { }
    // liens ouverts depuis une notification : ?a=BTC ou ?tab=social
    const qs = new URLSearchParams(location.search);
    if (qs.get('a') && TC.assetById[qs.get('a')]) UI.sel = qs.get('a');
    if (qs.get('tab')) setTimeout(() => setTab(qs.get('tab')), 0);
    if (qs.toString()) history.replaceState(null, '', location.pathname);
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
  }
  boot();
})();

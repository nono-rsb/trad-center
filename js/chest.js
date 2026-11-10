/* Trad Center — coffre à roulette (Boutique → 🎁 Coffre)
 * Coût : 100 € de cash du jeu. Une bande de lots défile puis s'arrête sur le gain.
 * Chances affichées dans le jeu ; retour moyen ≈ 96 € pour 100 € (comme un vrai jeu de hasard, on perd un peu en moyenne).
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, S = () => G.state;
  const CH = TC.Chest = { PRICE: 100 };
  const RAR = {
    common:    { label: 'Commun',     color: '#9aa4b8' },
    rare:      { label: 'Rare',       color: '#3d9bff' },
    epic:      { label: 'Épique',     color: '#b45cff' },
    legendary: { label: 'Légendaire', color: '#ffc531' },
    mythic:    { label: 'Mythique',   color: '#ff3d8b' },
  };
  // p en pourcentage (total 100)
  CH.LOOT = [
    { id: 'c20',  p: 34,   rar: 'common',    icon: '💵', label: '20 €',          cash: 20 },
    { id: 'c50',  p: 26,   rar: 'common',    icon: '💵', label: '50 €',          cash: 50 },
    { id: 'c80',  p: 15,   rar: 'common',    icon: '💶', label: '80 €',          cash: 80 },
    { id: 'c120', p: 11,   rar: 'rare',      icon: '💶', label: '120 €',         cash: 120 },
    { id: 'c200', p: 7,    rar: 'rare',      icon: '💰', label: '200 €',         cash: 200 },
    { id: 'btc',  p: 4,    rar: 'rare',      icon: '₿',  label: '50 € de Bitcoin', btc: 50 },
    { id: 'c500', p: 2,    rar: 'epic',      icon: '💎', label: '500 €',         cash: 500 },
    { id: 'c1k',  p: 0.7,  rar: 'legendary', icon: '👑', label: '1 000 €',       cash: 1000 },
    { id: 'vespa',p: 0.25, rar: 'legendary', icon: '🛵', label: 'Vespa Primavera', item: 'vespa' },
    { id: 'jack', p: 0.05, rar: 'mythic',    icon: '🎰', label: 'JACKPOT 10 000 €', cash: 10000 },
  ];
  CH.ev = () => CH.LOOT.reduce((t, l) => t + l.p / 100 * (l.cash || l.btc || (l.item ? TC.shopById[l.item].price : 0)), 0);

  function roll() {
    let r = Math.random() * 100;
    for (const l of CH.LOOT) { if ((r -= l.p) < 0) return l; }
    return CH.LOOT[0];
  }
  const tile = l => `<div class="ct" style="--rc:${RAR[l.rar].color}"><span>${l.icon}</span><b>${esc(l.label)}</b><i>${RAR[l.rar].label}</i></div>`;

  /* ---------- Vue dans la Boutique ---------- */
  CH.render = function (root) {
    const cash = S().cash, can = cash >= CH.PRICE;
    const st = S().chests || { opened: 0, won: 0 };
    root.innerHTML = `
      <div class="chest-hero panel">
        <div class="chest-box ${can ? 'ready' : ''}">🧰</div>
        <div class="chest-info"><h2>Coffre Trad Center</h2>
          <p>Ouvre le coffre, la roulette défile… et tu gagnes l'objet sur lequel elle s'arrête : de 20 € jusqu'au <b>jackpot de 10 000 €</b>, du Bitcoin ou même une Vespa.</p>
          <button class="btn btn-gold btn-xl" id="chest-open" ${can ? '' : 'disabled'}>Ouvrir pour ${fmt.eur(CH.PRICE)}</button>
          <small>${can ? 'Cash disponible : ' + fmt.eur(cash) : 'Il te faut ' + fmt.eur(CH.PRICE) + ' de cash'}${st.opened ? ` · ${st.opened} coffre(s) ouvert(s), ${fmt.eur(st.won)} gagnés` : ''}</small>
        </div>
      </div>
      <div id="chest-stage" class="panel chest-stage" hidden><div class="chest-marker"></div><div class="chest-strip" id="chest-strip"></div></div>
      <div class="panel"><h3>🎲 Contenu et chances</h3><div class="chest-odds">${CH.LOOT.map(l => `<div class="co" style="--rc:${RAR[l.rar].color}"><span>${l.icon}</span><b>${esc(l.label)}</b><i>${RAR[l.rar].label}</i><em>${String(l.p).replace('.', ',')} %</em></div>`).join('')}</div>
        <p class="hint">En moyenne, un coffre rend environ ${fmt.eur(CH.ev())} pour ${fmt.eur(CH.PRICE)} : c'est du hasard, on peut gagner gros… ou perdre. C'est de l'argent du jeu, jamais du vrai.</p></div>`;
    root.querySelector('#chest-open').onclick = () => CH.open(root);
  };

  /* ---------- Ouverture + roulette ---------- */
  let spinning = false;
  CH.isSpinning = () => spinning;
  CH.open = function (root) {
    if (spinning) return;
    if (S().cash < CH.PRICE) return TC.toast('Il te faut ' + fmt.eur(CH.PRICE) + ' de cash', 'bad');
    spinning = true;
    S().cash -= CH.PRICE; G.save(true); TC.UI.header(); // pas de rafraîchissement complet : la roulette doit rester à l'écran
    const win = roll();
    // bande : lots aléatoires, le gagnant en position 48
    const N = 56, W_IDX = 48;
    const strip = Array.from({ length: N }, (_, i) => i === W_IDX ? win : roll());
    // un peu de suspense : un lot rare juste après le gagnant
    if (win.rar === 'common') strip[W_IDX + 1] = CH.LOOT[6 + Math.floor(Math.random() * 4)];
    const stage = root.querySelector('#chest-stage'), el = root.querySelector('#chest-strip');
    stage.hidden = false; el.innerHTML = strip.map(tile).join('');
    el.style.transition = 'none'; el.style.transform = 'translateX(0)';
    root.querySelector('#chest-open').disabled = true;
    root.querySelector('.chest-box').classList.add('opening');
    stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => {
      const tw = el.children[0].getBoundingClientRect().width + 8; // largeur d'une case + écart
      const center = stage.clientWidth / 2;
      const target = W_IDX * tw + tw / 2 - center + (Math.random() - 0.5) * tw * 0.6;
      const DUR = 6200;
      el.style.transition = `transform ${DUR}ms cubic-bezier(.08,.6,.12,1)`;
      el.style.transform = `translateX(${-target}px)`;
      // tic-tic à chaque case qui passe sous le repère
      let last = -1; const t0 = performance.now();
      (function tick() {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        const idx = Math.floor((-m.m41 + center) / tw);
        if (idx !== last) { last = idx; click(); }
        if (performance.now() - t0 < DUR + 100) requestAnimationFrame(tick);
      })();
      setTimeout(() => finish(root, win, el.children[W_IDX]), DUR + 250);
    });
  };

  let ac = null;
  function click() {
    if (!S().sound) return;
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = 1400; g.gain.setValueAtTime(0.03, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.04); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.05); } catch (e) { }
  }

  function finish(root, win, node) {
    if (node) node.classList.add('win');
    let value = 0;
    if (win.cash) { S().cash += win.cash; value = win.cash; }
    else if (win.btc) {
      const p = TC.Data.eur('BTC');
      if (p) { const h = S().holdings.BTC || { qty: 0, cost: 0 }; h.qty += win.btc / p; h.cost += win.btc; S().holdings.BTC = h; } else S().cash += win.btc;
      value = win.btc;
    } else if (win.item) { const it = TC.shopById[win.item]; S().owned.push({ uid: S().nextId++, item: it.id, price: it.price, t: Date.now() }); value = it.price; }
    const st = S().chests || (S().chests = { opened: 0, won: 0 }); st.opened++; st.won += value;
    if (['legendary', 'mythic'].includes(win.rar)) S().luckyChest = true;
    S().log.unshift({ t: Date.now(), kind: 'bonus', eur: value, asset: 'Coffre : ' + win.label, pnl: value - CH.PRICE });
    G.save(true);
    const big = ['epic', 'legendary', 'mythic'].includes(win.rar);
    TC.sound(big ? 'kaching' : value >= CH.PRICE ? 'win' : 'buy'); if (big || value >= CH.PRICE) TC.confetti(big ? 260 : 90);
    TC.UI.header();
    setTimeout(() => {
      spinning = false;
      TC.modal(`<div class="center"><div class="chest-win" style="--rc:${RAR[win.rar].color}"><span>${win.icon}</span></div>
        <small class="rar" style="color:${RAR[win.rar].color}">${RAR[win.rar].label.toUpperCase()}</small><h2>${esc(win.label)}</h2>
        <p>${win.item ? 'Elle t\'attend dans ta Collection 🛵' : win.btc ? 'Ajouté à ton portefeuille, il suivra le vrai cours du Bitcoin.' : value >= CH.PRICE ? 'Bien joué, tu es gagnant !' : 'Pas de chance cette fois… retente ta chance !'}</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>OK</button><button class="btn btn-gold" id="chest-again" ${S().cash >= CH.PRICE ? '' : 'disabled'}>Rouvrir (${fmt.eur(CH.PRICE)})</button></div></div>`, { onClose: () => { if (TC.App) TC.App.after(); if (TC.UI.tab === 'shop' && TC.UI.shopType === 'chest') TC.UI.shop('chest'); } });
      const again = $('#chest-again'); if (again) again.onclick = () => { $('#modal').click(); setTimeout(() => CH.open($('#tab-shop')), 60); };
    }, 700);
  }
})();

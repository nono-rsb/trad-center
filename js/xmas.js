/* Trad Center — événement de Noël (actif en décembre, aperçu : ?theme=noel&jour=N sans gains)
 *  1. Calendrier de l'Avent (1er → 24) : une case par jour, 5 € × le numéro du jour, case manquée = perdue
 *  2. Cadeau sous le sapin (25) : cash, Bitcoin ou, très rarement, une voiture
 *  3. Père Noël secret (25) : offrir 25 € (payés par la banque du jeu) à un ami
 *  4. Course de Noël (1er → 24) : plus gros gain du mois, badge 🏆🎄 au champion
 *  5. Traîneau du Père Noël : édition limitée, achetable le 25 (Boutique → Luxe)
 *  6. Succès « Joyeux Noël » (jouer le 25) et « Calendrier complet »
 *  7. Pari spécial du 25 : le Bitcoin finira-t-il la journée plus haut qu'à minuit ? Gain x3
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, D = TC.Data;
  const S = () => G.state;
  const X = TC.Xmas = {};
  const preview = () => TC.season.preview;
  X.day = () => (TC.season.noel ? TC.season.day : 0);
  X.isDay = d => X.day() === d;
  const year = () => new Date().getFullYear();
  const ADVENT = d => d * 5;
  const SANTA = 25, BET_X = 3;

  let pv = null; // état d'aperçu, jamais sauvegardé
  function xs() {
    if (preview()) return pv || (pv = { year: 0, advent: {} });
    if (!S().xmas || S().xmas.year !== year()) S().xmas = { year: year(), advent: {} };
    return S().xmas;
  }
  function credit(eur, label) {
    if (preview()) return;
    S().cash += eur;
    S().log.unshift({ t: Date.now(), kind: 'bonus', eur, asset: label });
    G.save(true);
  }
  const party = (n = 140) => { TC.sound('kaching'); TC.confetti(n); };
  const after = () => { if (TC.App) TC.App.after(); };

  /* ---------- 1. Calendrier de l'Avent ---------- */
  X.openAdvent = function (d) {
    const s = xs();
    if (d !== X.day() || d > 24 || s.advent[d]) return;
    s.advent[d] = Date.now();
    credit(ADVENT(d), `Calendrier de l'Avent (${d} déc.)`);
    if (!preview()) G.save(true);
    party(90);
    TC.toast(`🗓️ Case du ${d} décembre : <b>+${fmt.eur(ADVENT(d))}</b>${preview() ? ' (aperçu)' : ''}`, 'ach', 6000);
    after(); X.open();
  };

  /* ---------- 2. Cadeau sous le sapin ---------- */
  function rollGift() {
    const r = Math.random();
    if (r < 0.02) { const r2 = Math.random(); return { kind: 'car', item: r2 < 0.6 ? 'clio' : r2 < 0.9 ? 'model3' : '911' }; }
    if (r < 0.17) return { kind: 'btc', eur: 25 };
    return { kind: 'cash', eur: Math.round(50 + Math.pow(Math.random(), 2) * 450) };
  }
  X.openGift = function () {
    const s = xs(); if (!X.isDay(25) || s.gift) return;
    const g = rollGift(); s.gift = g;
    if (!preview()) {
      if (g.kind === 'car') { S().owned.push({ uid: S().nextId++, item: g.item, price: TC.shopById[g.item].price, t: Date.now() }); S().log.unshift({ t: Date.now(), kind: 'bonus', eur: 0, asset: 'Cadeau de Noël : ' + TC.shopById[g.item].model }); }
      else if (g.kind === 'btc' && D.eur('BTC')) { const p = D.eur('BTC'), h = S().holdings.BTC || { qty: 0, cost: 0 }; h.qty += g.eur / p; h.cost += g.eur; S().holdings.BTC = h; S().log.unshift({ t: Date.now(), kind: 'bonus', eur: g.eur, asset: 'Cadeau de Noël en Bitcoin' }); }
      else { g.kind = g.kind === 'btc' ? 'cash' : g.kind; S().cash += g.eur; S().log.unshift({ t: Date.now(), kind: 'bonus', eur: g.eur, asset: 'Cadeau de Noël' }); }
      G.save(true);
    }
    const it = g.kind === 'car' && TC.shopById[g.item];
    const box = $('#xg-box');
    if (box) { box.classList.add('open'); }
    setTimeout(() => {
      party(g.kind === 'car' ? 260 : 160);
      TC.modal(`<div class="center"><div class="big-emoji">${g.kind === 'car' ? it.emoji : g.kind === 'btc' ? '₿' : '💶'}</div>
        <h2>${g.kind === 'car' ? '🚨 GROS LOT ! 🚨' : 'Joyeux Noël !'}</h2>
        <p>Le Père Noël t'offre <b>${g.kind === 'car' ? it.brand + ' ' + it.model : g.kind === 'btc' ? fmt.eur(g.eur) + ' de Bitcoin' : fmt.eur(g.eur)}</b>${preview() ? ' (aperçu : rien n\'est crédité)' : ''} 🎁</p>
        ${g.kind === 'car' ? '<p>Elle t\'attend dans ta Collection.</p>' : g.kind === 'btc' ? '<p>Il suivra le vrai cours du Bitcoin : garde-le ou revends-le !</p>' : ''}
        <div class="modal-actions"><button class="btn btn-gold btn-xl" id="xg-back">Voir l'événement 🎄</button></div></div>`);
      $('#xg-back').onclick = () => X.open();
      after();
    }, 900);
  };

  /* ---------- 3. Père Noël secret ---------- */
  X.santa = async function (uid) {
    const s = xs(); if (!X.isDay(25) || s.santa) return;
    const f = (N.friends || []).find(x => x.uid === uid); if (!f) return;
    if (preview()) { s.santa = f.pseudo; TC.toast('🎅 Aperçu : le cadeau n\'est pas envoyé', 'info'); return X.open(); }
    try { await N.santaGift(f, SANTA); s.santa = f.pseudo; G.save(true); party(80); TC.toast(`🎅 Tu as offert ${fmt.eur(SANTA)} à ${esc(f.pseudo)} (c'est le Père Noël qui paie !)`, 'ok', 6000); X.open(); }
    catch (e) { TC.toast('⛔ ' + N.errMsg(e), 'bad'); }
  };

  /* ---------- 4. Course de Noël ---------- */
  X.raceGain = function () {
    if (preview() || !TC.season.noel) return null;
    const d = X.day(), s = xs();
    if (d < 1 || d > 24) return null; // classement figé après le 24
    if (s.start == null) { s.start = G.netWorth(); G.save(); }
    return Math.round((G.netWorth() - s.start) * 100) / 100;
  };

  /* ---------- 7. Pari spécial du 25 ---------- */
  const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  X.placeBet = async function (dir, stake) {
    const s = xs(); stake = +stake;
    if (!X.isDay(25) || s.bet) return;
    if (new Date().getHours() >= 20) return TC.toast('Les paris sont fermés après 20 h', 'bad');
    if (!(stake >= 1)) return TC.toast('Mise minimum : 1 €', 'bad');
    if (stake > S().cash) return TC.toast('Cash insuffisant', 'bad');
    if (preview()) return TC.toast('Aperçu : pari non enregistré', 'info');
    const m0 = midnight();
    let start = await D.priceAt('BTC', m0); if (start == null) start = D.eur('BTC');
    if (start == null) return TC.toast('Prix du Bitcoin indisponible', 'bad');
    S().cash -= stake;
    s.bet = { dir, stake, start, end: m0 + 86400000 - 60000, at: Date.now() };
    S().log.unshift({ t: Date.now(), kind: 'bet', asset: 'BTC', dir, eur: stake, price: start, minutes: 0 });
    G.save(true); TC.sound('buy'); after(); X.open();
  };
  async function resolveBet() {
    const s = preview() ? null : (S().xmas && S().xmas.year === year() ? S().xmas : null);
    const b = s && s.bet; if (!b || b.result || Date.now() < b.end) return;
    let end = await D.priceAt('BTC', b.end);
    if (end == null) { // à défaut, un vrai cours actuel (pas un prix en cache ni simulé)
      const q = D.prices.BTC; if (!q || (q.status !== 'live' && q.status !== 'delayed')) return;
      end = D.eur('BTC');
    }
    if (end == null) return;
    const push = Math.abs(end - b.start) / b.start < 1e-9;
    const win = !push && (end > b.start) === (b.dir === 'up');
    b.result = push ? 'push' : win ? 'win' : 'lose'; b.final = end;
    const pay = push ? b.stake : win ? b.stake * BET_X : 0;
    S().cash += pay;
    if (win) S().stats.betsWon++; else if (!push) S().stats.betsLost++;
    S().log.unshift({ t: Date.now(), kind: 'betres', asset: 'BTC', dir: b.dir, eur: pay, price: end, start: b.start, pnl: pay - b.stake, result: b.result });
    G.save(true);
    TC.toast(push ? '🎄 Pari de Noël : égalité, mise remboursée.' : win ? `🎄 Pari de Noël gagné ! <b>+${fmt.eur(b.stake * BET_X)}</b>` : '🎄 Pari de Noël perdu… Le Bitcoin n\'a pas suivi.', win ? 'ach' : push ? 'info' : 'bad', 8000);
    if (win) party(); after();
  }

  /* ---------- Fenêtre de l'événement ---------- */
  X.open = async function () {
    if (!TC.season.noel) return;
    const d = X.day(), s = xs();
    let html = `<h2>🎄 Événement de Noël</h2>${preview() ? `<div class="nbox warn">👀 Aperçu du ${d} décembre : rien n'est crédité. Change le jour avec <b>?theme=noel&jour=25</b>.</div>` : ''}`;
    // calendrier
    if (d > 24) { const n = Object.keys(s.advent).length; html += `<div class="nbox">🗓️ Calendrier de l'Avent terminé : <b>${n}/24</b> case(s) ouverte(s), ${fmt.eur(Object.keys(s.advent).reduce((t, k) => t + ADVENT(+k), 0))} gagnés.</div>`; }
    else html += `<h4>🗓️ Calendrier de l'Avent</h4><div class="advent">${Array.from({ length: 24 }, (_, i) => {
      const n = i + 1, opened = s.advent[n], today = n === d && !opened, past = n < d && !opened;
      return `<button class="adv ${opened ? 'done' : today ? 'today' : past ? 'missed' : 'locked'}" ${today ? `data-adv="${n}"` : 'disabled'}>
        <b>${n}</b><i>${opened ? '✅' : today ? '🎁' : past ? '✖' : '🔒'}</i><small>${fmt.eur(ADVENT(n))}</small></button>`;
    }).join('')}</div><p class="hint">Une case par jour du 1er au 24 : plus on avance, plus elle rapporte. Case manquée = perdue !</p>`;
    // le 25
    if (d === 25) {
      html += `<h4>🎁 Le cadeau sous le sapin</h4>` + (s.gift
        ? `<div class="nbox ok">Déjà ouvert : ${s.gift.kind === 'car' ? TC.shopById[s.gift.item].brand + ' ' + TC.shopById[s.gift.item].model + ' 🚗' : fmt.eur(s.gift.eur) + (s.gift.kind === 'btc' ? ' de Bitcoin' : '')}</div>`
        : `<div class="xgift"><div id="xg-box" class="xg-box">🎁</div><button class="btn btn-gold btn-xl" data-x="gift">Ouvrir mon cadeau</button><small>Cash, Bitcoin… ou 1 chance sur 50 de gagner une voiture !</small></div>`);
      const fr = N.friends || [];
      html += `<h4>🎅 Père Noël secret</h4>` + (s.santa ? `<div class="nbox ok">Tu as offert ${fmt.eur(SANTA)} à <b>${esc(s.santa)}</b>. Merci Père Noël !</div>`
        : !N.user ? `<div class="nbox">Connecte-toi (onglet Amis) pour offrir ${fmt.eur(SANTA)} à un ami, gratuitement.</div>`
        : !fr.length ? `<div class="nbox">Ajoute un ami pour lui offrir ${fmt.eur(SANTA)} gratuitement.</div>`
        : `<div class="nbox">Offre <b>${fmt.eur(SANTA)}</b> à un ami : c'est le Père Noël qui paie, pas toi ! (une seule fois)</div><div class="xsanta"><select id="x-friend" class="sel">${fr.map(f => `<option value="${f.uid}">${esc(f.avatar || '')} ${esc(f.pseudo)}</option>`).join('')}</select><button class="btn btn-gold" data-x="santa">Offrir 🎅</button></div>`);
      const b = s.bet; const open = new Date().getHours() < 20 || preview();
      html += `<h4>🎲 Pari spécial de Noël (gain x${BET_X})</h4>` + (b
        ? `<div class="nbox">${b.dir === 'up' ? '📈 Plus haut' : '📉 Plus bas'} · mise ${fmt.eur(b.stake)} · Bitcoin à minuit : ${fmt.eur(b.start)}${b.result ? ` → ${fmt.eur(b.final)} : <b class="${b.result === 'win' ? 'up' : 'down'}">${b.result === 'win' ? 'gagné +' + fmt.eur(b.stake * BET_X) : b.result === 'push' ? 'égalité, remboursé' : 'perdu'}</b>` : ' · résultat à 23 h 59'}</div>`
        : open ? `<div class="nbox">Le Bitcoin finira-t-il le 25 <b>plus haut qu'à minuit</b> ? Réponse à 23 h 59. Gain <b>x${BET_X}</b>. Paris ouverts jusqu'à 20 h.</div>
          <div class="inp"><input id="x-stake" type="number" min="1" step="any" inputmode="decimal" placeholder="Mise"><span>€</span></div>
          <div class="bet-btns"><button class="btn btn-buy" data-x="up">📈 Plus haut</button><button class="btn btn-sell" data-x="down">📉 Plus bas</button></div>`
        : `<div class="nbox">Les paris de Noël sont fermés (après 20 h).</div>`);
      html += `<h4>🛷 Édition limitée</h4><div class="nbox">Le <b>Traîneau du Père Noël</b> est en vente aujourd'hui seulement (Boutique → Luxe, ${fmt.eur(TC.shopById.traineau.price)}).</div><button class="btn" data-x="shop">Voir le traîneau</button>`;
    } else if (d < 25) {
      html += `<h4>🎅 Le 25 décembre</h4><div class="nbox">Cadeau sous le sapin, Père Noël secret entre amis, pari spécial x${BET_X} et le Traîneau du Père Noël en édition limitée. Reviens le 25 !</div>`;
    }
    // course
    html += `<h4>🏆 Course de Noël ${d <= 24 ? '(jusqu\'au 24)' : '(terminée)'}</h4><p class="hint">Le plus gros gain depuis le 1er décembre devient <b>Champion de Noël 🏆🎄</b> dans le classement.</p>`;
    const g = X.raceGain(); if (g != null) html += `<div class="nbox">Ton gain de décembre : <b class="${g >= 0 ? 'up' : 'down'}">${g >= 0 ? '+' : ''}${fmt.eur(g)}</b></div>`;
    html += `<div id="x-race" class="board"><div class="empty">${N.user ? 'Chargement…' : 'Connecte-toi pour participer au classement.'}</div></div>`;
    const md = TC.modal(`<div class="xmas-hub">${html}</div>`, { cls: 'wide' });
    md.el.querySelector('.modal-card').addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      if (btn.dataset.adv) return X.openAdvent(+btn.dataset.adv);
      const a = btn.dataset.x;
      if (a === 'gift') return X.openGift();
      if (a === 'santa') return X.santa($('#x-friend').value);
      if (a === 'up' || a === 'down') return X.placeBet(a, $('#x-stake').value);
      if (a === 'shop') { md.close(); UI.shopType = 'luxury'; TC.App.setTab('shop'); }
    });
    if (N.user && N.loadXmasBoard) {
      try {
        const rows = await N.loadXmasBoard(); const el = $('#x-race'); if (!el) return;
        el.innerHTML = rows.length ? rows.map((r, i) => `<div class="brow ${r.uid === N.user.uid ? 'me' : ''}"><span class="pos">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="avatar">${r.avatar || '👤'}</span><b>${esc(r.pseudo || '')}</b><small></small><span class="bnw ${r.xmasGain >= 0 ? 'up' : 'down'}">${r.xmasGain >= 0 ? '+' : ''}${fmt.eur(r.xmasGain || 0, true)}</span></div>`).join('') : '<div class="empty">Personne encore : sois le premier !</div>';
      } catch (e) { const el = $('#x-race'); if (el) el.innerHTML = '<div class="empty">Classement indisponible</div>'; }
    }
  };
  const UI = TC.UI;

  /* ---------- Démarrage ---------- */
  function init() {
    if (!TC.season.noel) return;
    const d = X.day(), s = xs();
    const gtaEl = $('#gta'); if (gtaEl) { gtaEl.classList.add('clickable'); gtaEl.addEventListener('click', () => X.open()); }
    if (d === 25 && !preview() && !s.played25) { s.played25 = true; G.save(true); setTimeout(after, 500); }
    if (d >= 1 && d <= 24 && !s.advent[d]) {
      if (gtaEl) gtaEl.classList.add('pulse');
      setTimeout(() => TC.toast('🗓️ Ta case du calendrier de l\'Avent t\'attend ! Touche le bandeau en haut.', 'ach', 7000), 4500);
    }
    if (d === 25 && !s.gift) setTimeout(function tryOpen() { if ($('#modal').classList.contains('open')) return setTimeout(tryOpen, 3000); X.open(); }, 3500);
    setTimeout(resolveBet, 8000); setInterval(resolveBet, 60000);
    N.on(t => { if (t === 'linked' && N.loadXmasBoard) N.loadXmasBoard().then(() => { if (UI.tab === 'social' && TC.Social) TC.Social.render(); }).catch(() => { }); });
  }
  init();
})();

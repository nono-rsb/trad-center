/* Trad Center — bot de trading (licence 100 € d'argent du jeu)
 * Stratégie « suivi de tendance » : achète ce qui monte (15 min et 1 h), revend vite en gain (take-profit),
 * coupe les pertes (stop-loss) et suit la hausse (stop suiveur). En mode audacieux, il parie aussi.
 * Aucun bot ne peut garantir un gain : il peut perdre. Il ne fonctionne que pendant que le jeu est ouvert.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, D = TC.Data, S = () => G.state;
  const B = TC.Bot = { PRICE: 100 };
  const MODES = {
    prudent:   { label: '🛡️ Prudent',    tp: 0.02,  sl: 0.01,  trail: 0.006, maxPos: 2, th: 0.0025, bet: 0, rsiMax: 68 },
    equilibre: { label: '⚖️ Équilibré',  tp: 0.035, sl: 0.018, trail: 0.01,  maxPos: 3, th: 0.002,  bet: 0.01, rsiMax: 74 },
    audacieux: { label: '🔥 Audacieux',  tp: 0.06,  sl: 0.03,  trail: 0.015, maxPos: 4, th: 0.0012, bet: 0.02, rsiMax: 80 },
  };
  B.MODES = MODES;
  function st() { const b = S().bot || (S().bot = { unlocked: false, on: false, budget: 50, mode: 'equilibre', pos: {}, acts: [], pnl: 0, trades: 0 }); b.pos = b.pos || {}; b.acts = b.acts || []; return b; }

  /* ---------- Historique des prix vus par le bot ---------- */
  const hist = {}; // id -> [[t, prix €]]
  function record0() {
    const now = Date.now();
    TC.ASSETS.forEach(a => {
      const p = D.prices[a.id]; if (!p || p.price == null || p.closed || (p.status !== 'live' && p.status !== 'delayed')) return;
      const e = D.eur(a.id); if (!e) return;
      const h = hist[a.id] || (hist[a.id] = []); h.push([now, e]);
      while (h.length && now - h[0][0] > 75 * 60000) h.shift();
    });
  }
  function ret(id, minutes) {
    const h = hist[id]; if (!h || h.length < 2) return null;
    const now = Date.now(), target = now - minutes * 60000;
    if (h[0][0] > target + 60000) return null; // pas assez de recul
    let past = h[0]; for (const x of h) { if (x[0] <= target) past = x; else break; }
    return h[h.length - 1][1] / past[1] - 1;
  }
  // amorçage : 2 h de cours à la minute pour les cryptos (Binance), le bot peut décider tout de suite
  let seeded = false;
  async function seed() {
    if (seeded) return; seeded = true;
    for (const a of TC.ASSETS.filter(a => a.src === 'binance')) {
      try {
        const r = await D.history(a.id, '1H'); if (!r.real) continue;
        hist[a.id] = r.bars.map(b => [b.time * 1000, b.close]).concat(hist[a.id] || []);
      } catch (e) { }
    }
  }

  function act(txt) { const b = st(); b.acts.unshift({ t: Date.now(), txt }); b.acts.length = Math.min(b.acts.length, 40); }

  /* ---------- Indicateurs ---------- */
  // RSI sur 14 points espacés d'une minute : > 70 = surchauffe (risque de rechute), < 30 = survendu
  function rsi(id) {
    const h = hist[id]; if (!h || h.length < 10) return null;
    const pts = []; let next = h[h.length - 1][0];
    for (let i = h.length - 1; i >= 0 && pts.length < 15; i--) if (h[i][0] <= next) { pts.unshift(h[i][1]); next = h[i][0] - 60000; }
    if (pts.length < 8) return null;
    let up = 0, dn = 0; for (let i = 1; i < pts.length; i++) { const d = pts[i] - pts[i - 1]; if (d > 0) up += d; else dn -= d; }
    if (!dn) return 100; return 100 - 100 / (1 + up / dn);
  }
  // agitation récente (écart moyen d'une minute à l'autre) : sert à régler le stop-loss sur chaque actif
  function vol(id) {
    const h = hist[id]; if (!h || h.length < 6) return null;
    const pts = h.slice(-30); let t = 0; for (let i = 1; i < pts.length; i++) t += Math.abs(pts[i][1] / pts[i - 1][1] - 1);
    return t / (pts.length - 1);
  }
  const MARKETS = { all: { label: '🌍 Tout', ok: a => a.cat !== 'fx' }, crypto: { label: '₿ Crypto', ok: a => a.cat === 'crypto' }, stocks: { label: '🏛️ Bourse', ok: a => a.cat !== 'crypto' && a.cat !== 'fx' } };
  B.MARKETS = MARKETS;
  const dayId = () => new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  function today(b) { if (!b.day || b.day.id !== dayId()) b.day = { id: dayId(), pnl: 0, trades: 0 }; return b.day; }
  function record(b, res, why) {
    const pnl = res.pnl || 0; b.pnl += pnl; b.trades++;
    b.wins = (b.wins || 0) + (pnl > 0 ? 1 : 0); b.losses = (b.losses || 0) + (pnl <= 0 ? 1 : 0);
    b.best = Math.max(b.best || 0, pnl); b.worst = Math.min(b.worst || 0, pnl);
    const d = today(b); d.pnl += pnl; d.trades++;
    (b.curve || (b.curve = [])).push(Math.round(b.pnl * 100) / 100); if (b.curve.length > 60) b.curve.shift();
    if (b.reinvest) b.budget = Math.max(1, Math.round((b.budget + pnl) * 100) / 100);
    if (b.notify) TC.toast(`🤖 ${pnl >= 0 ? '🟢' : '🔴'} ${why} : ${pnl >= 0 ? '+' : ''}${fmt.eur(pnl)}`, pnl >= 0 ? 'ok' : 'bad');
  }
  function guard(b) { // limites du jour : le bot se met en pause tout seul
    const d = today(b);
    if (b.dayLoss && d.pnl <= -b.budget * b.dayLoss) { b.on = false; act(`🛑 Pause : perte du jour de ${fmt.eur(-d.pnl)} (limite ${Math.round(b.dayLoss * 100)} % du budget)`); TC.toast('🤖 Bot en pause : limite de perte du jour atteinte. Il te protège 🛡️', 'bad', 6000); return true; }
    if (b.dayGoal && d.pnl >= b.budget * b.dayGoal) { b.on = false; act(`🎯 Pause : objectif du jour atteint (+${fmt.eur(d.pnl)})`); TC.toast(`🤖 Objectif du jour atteint : +${fmt.eur(d.pnl)} 🎯 Le bot se repose.`, 'ok', 6000); TC.sound('kaching'); return true; }
    return false;
  }

  /* ---------- Décisions ---------- */
  let lastBet = 0;
  function tick() {
    record0();
    const b = st(); if (!b.unlocked || !b.on) return;
    if (guard(b)) { G.save(); if (TC.App) TC.App.after(); return; }
    const m = MODES[b.mode] || MODES.equilibre;
    // 1. ventes
    for (const id of Object.keys(b.pos)) {
      const pos = b.pos[id], p = D.eur(id), q = D.prices[id];
      if (!p || (q && q.closed)) continue;
      pos.peak = Math.max(pos.peak || pos.entry, p);
      const r = p / pos.entry - 1, age = Date.now() - pos.at, v = vol(id) || 0;
      const sl = Math.max(m.sl, v * 6), trail = Math.max(m.trail, v * 4); // stops adaptés à l'agitation de l'actif
      const R = rsi(id);
      let why = null;
      if (r >= m.tp) why = 'objectif atteint';
      else if (r <= -sl) why = 'stop-loss';
      else if (r > 0.004 && p < pos.peak * (1 - trail)) why = 'la hausse s\'essouffle';
      else if (r > 0.005 && R != null && R > 82) why = 'surchauffe (RSI ' + Math.round(R) + ')';
      else if (age > 3 * 3600000) why = 'trop long';
      if (!why) continue;
      const h = S().holdings[id]; const qty = Math.min(pos.qty, h ? h.qty : 0);
      delete b.pos[id]; (b.cool || (b.cool = {}))[id] = Date.now();
      if (qty <= 0) continue;
      const res = G.sell(id, qty);
      if (res.ok) { record(b, res, `Vend ${id}`); act(`${res.pnl >= 0 ? '🟢' : '🔴'} Vend ${id} (${why}) : ${res.pnl >= 0 ? '+' : ''}${fmt.eur(res.pnl)}`); }
    }
    if (guard(b)) { G.save(); if (TC.App) TC.App.after(); return; }
    // 2. achats : tendance confirmée sur 15 min et 1 h, sans surchauffe
    const invested = Object.values(b.pos).reduce((t, x) => t + x.cost, 0);
    const free = Math.min(b.budget - invested, S().cash);
    const mk = MARKETS[b.markets] || MARKETS.all;
    if (Object.keys(b.pos).length < m.maxPos && free >= 1) {
      const cool = b.cool || {};
      const cands = TC.ASSETS.filter(a => mk.ok(a) && !b.pos[a.id] && !(cool[a.id] && Date.now() - cool[a.id] < 10 * 60000)).map(a => {
        const q = D.prices[a.id]; if (!q || q.closed || q.status !== 'live' && q.status !== 'delayed') return null;
        const r15 = ret(a.id, 15), r60 = ret(a.id, 60) ?? ret(a.id, 30); if (r15 == null || r60 == null) return null;
        const c24 = D.change(a.id), R = rsi(a.id);
        if (r15 < m.th || r60 <= 0 || c24 < -2) return null;
        if (R != null && R > m.rsiMax && r15 > m.th * 4) return null; // flambée trop brutale : on attend qu'elle retombe
        return { a, R, score: r15 * 2 + r60 + c24 / 1000 - (R != null && R > 60 ? (R - 60) / 4000 : 0) };
      }).filter(Boolean).sort((x, y) => y.score - x.score);
      const pick = cands[0];
      if (pick) {
        const size = Math.floor(Math.min(free, b.budget / m.maxPos) * 100) / 100;
        const before = (S().holdings[pick.a.id] || { qty: 0 }).qty;
        const res = size >= 1 ? G.buy(pick.a.id, size) : { ok: false };
        if (res.ok) {
          const qty = S().holdings[pick.a.id].qty - before;
          b.pos[pick.a.id] = { qty, cost: size, entry: D.eur(pick.a.id), peak: D.eur(pick.a.id), at: Date.now() };
          act(`🛒 Achète ${pick.a.id} pour ${fmt.eur(size)} (tendance ${fmt.pct(ret(pick.a.id, 15) * 100)} en 15 min${pick.R != null ? ', RSI ' + Math.round(pick.R) : ''})`);
          if (b.notify) TC.toast(`🤖 🛒 Achète ${pick.a.id} pour ${fmt.eur(size)}`, 'info');
        }
      }
    }
    // 3. paris (équilibré / audacieux), au plus un toutes les 10 minutes, seulement si la tendance est nette
    if (m.bet && b.bets !== false && Date.now() - lastBet > 10 * 60000) {
      const r15 = ret('BTC', 15), R = rsi('BTC');
      if (r15 != null && Math.abs(r15) > 0.0015 && !(r15 > 0 && R > 78) && !(r15 < 0 && R != null && R < 22)) {
        const stake = Math.max(1, Math.round(b.budget * m.bet * 100) / 100);
        if (S().cash >= stake) { const res = G.bet('BTC', r15 > 0 ? 'up' : 'down', stake, 5); if (res.ok) { lastBet = Date.now(); act(`🎲 Parie ${fmt.eur(stake)} sur BTC ${r15 > 0 ? 'à la hausse' : 'à la baisse'} (5 min)`); } }
      }
    }
    G.save();
  }

  /* ---------- Commandes ---------- */
  B.unlock = function () {
    const b = st(); if (b.unlocked) return;
    if (S().cash < B.PRICE) return TC.toast(`Il te faut ${fmt.eur(B.PRICE)} de cash`, 'bad');
    S().cash -= B.PRICE; if (TC.Weekly) TC.Weekly.flow(-B.PRICE);
    S().log.unshift({ t: Date.now(), kind: 'item', eur: B.PRICE, asset: 'Licence du bot de trading 🤖' });
    b.unlocked = true; b.budget = Math.max(1, Math.min(50, Math.floor(S().cash))); G.save(true);
    TC.sound('kaching'); TC.confetti(100); TC.toast('🤖 Bot de trading débloqué ! Choisis son budget puis allume-le.', 'ok', 6000);
    seed(); if (TC.App) TC.App.after();
  };
  B.toggle = function () { const b = st(); b.on = !b.on; if (b.on && b.day) { const d = today(b); if ((b.dayLoss && d.pnl <= -b.budget * b.dayLoss) || (b.dayGoal && d.pnl >= b.budget * b.dayGoal)) { d.pnl = 0; } } G.save(true); act(b.on ? '▶️ Bot allumé' : '⏸️ Bot en pause'); if (b.on) { seed(); setTimeout(tick, 1500); } if (TC.App) TC.App.after(); };
  B.setBudget = function (v) { const b = st(); b.budget = Math.max(1, Math.round(v * 100) / 100); G.save(true); if (TC.App) TC.App.after(); };
  B.setMode = function (k) { if (!MODES[k]) return; st().mode = k; G.save(true); if (TC.App) TC.App.after(); };
  B.set = function (k, v) { st()[k] = v; G.save(true); if (TC.App) TC.App.after(); };
  B.sellAll = function () {
    const b = st(); let n = 0;
    for (const id of Object.keys(b.pos)) { const h = S().holdings[id]; const qty = Math.min(b.pos[id].qty, h ? h.qty : 0); delete b.pos[id]; if (qty > 0) { const r = G.sell(id, qty); if (r.ok) { record(b, r, `Vend ${id}`); n++; } } }
    b.on = false; act(`⏹️ Tout revendu (${n} position(s)), bot arrêté`); G.save(true); if (TC.App) TC.App.after();
  };

  /* ---------- Panneau (onglet Portefeuille) ---------- */
  B.panel = function () {
    const b = st();
    if (!b.unlocked) return `<div class="panel bot locked"><div class="bot-head"><span class="bot-ic">🤖</span><div><h3>Bot de trading</h3>
      <p class="muted">Il surveille les marchés à ta place : il achète ce qui monte, évite ce qui a trop monté, revend dès qu'il a gagné et coupe vite les pertes.</p></div></div>
      <button class="btn btn-gold btn-xl" data-bot="unlock" ${S().cash >= B.PRICE ? '' : 'disabled'}>Débloquer le bot : ${fmt.eur(B.PRICE)}</button>
      <p class="hint">⚠️ Aucun bot ne peut garantir de gagner, même ceux des pros : il peut aussi perdre. Il ne tourne que quand le jeu est ouvert.</p></div>`;
    const m = MODES[b.mode] || MODES.equilibre;
    const pos = Object.entries(b.pos);
    const invested = pos.reduce((t, [, x]) => t + x.cost, 0);
    const warm = !Object.keys(hist).some(k => ret(k, 15) != null);
    const d = today(b), n = (b.wins || 0) + (b.losses || 0), wr = n ? Math.round((b.wins || 0) / n * 100) : null;
    const pct = v => v ? Math.round(v * 100) + ' %' : 'Aucune';
    return `<div class="panel bot ${b.on ? 'on' : ''}"><div class="bot-head"><span class="bot-ic">🤖</span><div><h3>Bot de trading <span class="bot-st">${b.on ? '● EN MARCHE' : '⏸ EN PAUSE'}</span></h3>
        <p class="muted">${b.on ? (warm ? '⏳ Il observe le marché quelques minutes avant d\'agir…' : 'Il surveille les marchés toutes les 30 secondes.') : 'Allume-le pour qu\'il trade à ta place.'}</p></div>
        <button class="btn ${b.on ? '' : 'btn-gold'}" data-bot="toggle">${b.on ? 'Pause' : 'Allumer'}</button></div>
      <div class="bot-sum"><div><small>Aujourd'hui</small><b class="${d.pnl >= 0 ? 'up' : 'down'}">${d.pnl >= 0 ? '+' : ''}${fmt.eur(d.pnl)}</b></div>
        <div><small>Depuis le début</small><b class="${b.pnl >= 0 ? 'up' : 'down'}">${b.pnl >= 0 ? '+' : ''}${fmt.eur(b.pnl)}</b></div>
        <div><small>Trades gagnants</small><b>${wr == null ? '—' : wr + ' %'}</b></div>
        <div class="bot-curve">${TC.spark(b.curve && b.curve.length ? [0].concat(b.curve) : [0, 0], 90, 30)}</div></div>
      <div class="bot-row"><span>Mode</span><div class="seg">${Object.entries(MODES).map(([k, v]) => `<button data-botmode="${k}" class="${k === b.mode ? 'active' : ''}">${v.label}</button>`).join('')}</div></div>
      <div class="bot-row"><span>Marchés</span><div class="seg">${Object.entries(MARKETS).map(([k, v]) => `<button data-botset="markets" data-v="${k}" class="${k === (b.markets || 'all') ? 'active' : ''}">${v.label}</button>`).join('')}</div></div>
      <div class="bot-row"><span>Budget max <b>${fmt.eur(b.budget)}</b></span><div class="quick bot-q">${[10, 25, 50, 100, 250].map(v => `<button data-botbud="${v}">${v} €</button>`).join('')}<button data-botbud="max">Max</button></div></div>
      ${pos.length ? `<div class="bot-pos">${pos.map(([id, x]) => { const p = D.eur(id); const r = p ? p / x.entry - 1 : 0; return `<span>${esc(id)} <b class="${r >= 0 ? 'up' : 'down'}">${fmt.pct(r * 100)}</b></span>`; }).join('')}<small>${fmt.eur(invested)} investis</small></div>` : ''}
      ${b.acts.length ? `<div class="bot-acts">${b.acts.slice(0, 5).map(a => `<div><small>${new Date(a.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small> ${esc(a.txt)}</div>`).join('')}</div>` : ''}
      <details class="bot-adv"><summary>⚙️ Réglages avancés</summary>
        <div class="bot-row"><span>🛑 Pause si perte du jour</span><div class="seg">${[0, .05, .1, .2].map(v => `<button data-botset="dayLoss" data-v="${v}" class="${(b.dayLoss || 0) === v ? 'active' : ''}">${v ? '−' + pct(v) : 'Jamais'}</button>`).join('')}</div></div>
        <div class="bot-row"><span>🎯 Pause si gain du jour</span><div class="seg">${[0, .05, .1, .25].map(v => `<button data-botset="dayGoal" data-v="${v}" class="${(b.dayGoal || 0) === v ? 'active' : ''}">${v ? '+' + pct(v) : 'Jamais'}</button>`).join('')}</div></div>
        <label class="tgl"><input type="checkbox" data-botchk="reinvest" ${b.reinvest ? 'checked' : ''}><span>♻️ Réinvestir les gains (le budget grandit avec les gains, et baisse avec les pertes)</span></label>
        <label class="tgl"><input type="checkbox" data-botchk="bets" ${b.bets !== false ? 'checked' : ''}><span>🎲 Autoriser les paris (modes Équilibré et Audacieux)</span></label>
        <label class="tgl"><input type="checkbox" data-botchk="notify" ${b.notify ? 'checked' : ''}><span>🔔 M'afficher chaque achat et vente</span></label>
        <div class="kv bot-kv"><span>Trades</span><b>${b.trades}</b><span>Meilleur / pire</span><b><span class="up">+${fmt.eur(b.best || 0)}</span> / <span class="down">${fmt.eur(b.worst || 0)}</span></b><span>Règles</span><b>+${(m.tp * 100).toFixed(1)} % / −${(m.sl * 100).toFixed(1)} % (ajustées à chaque actif)</b></div>
        <button class="btn btn-sm btn-ghost" data-bot="sellall">Tout revendre et arrêter</button></details>
      <p class="hint">⚠️ Aucun bot ne peut garantir de gagner : il peut aussi perdre. Il ne tourne que quand le jeu est ouvert.</p></div>`;
  };
  document.addEventListener('click', e => {
    const x = e.target.closest('[data-bot],[data-botmode],[data-botbud],[data-botset]'); if (!x) return;
    if (x.dataset.bot === 'unlock') return B.unlock();
    if (x.dataset.bot === 'toggle') return B.toggle();
    if (x.dataset.bot === 'sellall') return B.sellAll();
    if (x.dataset.botmode) return B.setMode(x.dataset.botmode);
    if (x.dataset.botset) { const v = x.dataset.v; return B.set(x.dataset.botset, isNaN(+v) ? v : +v); }
    if (x.dataset.botbud) return B.setBudget(x.dataset.botbud === 'max' ? S().cash : +x.dataset.botbud);
  });
  document.addEventListener('change', e => { const x = e.target.closest('[data-botchk]'); if (x) B.set(x.dataset.botchk, x.checked); });
  // garder « Réglages avancés » ouvert quand le panneau se redessine
  let advOpen = false;
  document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('bot-adv')) advOpen = e.target.open; }, true);
  if (TC.UI && TC.UI.portfolio) { const old = TC.UI.portfolio; TC.UI.portfolio = function () { const r = old.apply(this, arguments); const d = document.querySelector('.bot-adv'); if (d && advOpen) d.open = true; return r; }; }

  setInterval(tick, 30000); setTimeout(() => { record0(); if (st().on) seed(); }, 5000);
  B._tick = tick; B._hist = hist; B._ind = { ret, rsi, vol }; // tests
})();

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
    prudent:   { label: '🛡️ Prudent',    tp: 0.02,  sl: 0.01,  trail: 0.006, maxPos: 2, th: 0.0025, bet: 0 },
    equilibre: { label: '⚖️ Équilibré',  tp: 0.035, sl: 0.018, trail: 0.01,  maxPos: 3, th: 0.002,  bet: 0.01 },
    audacieux: { label: '🔥 Audacieux',  tp: 0.06,  sl: 0.03,  trail: 0.015, maxPos: 4, th: 0.0012, bet: 0.02 },
  };
  B.MODES = MODES;
  function st() { const b = S().bot || (S().bot = { unlocked: false, on: false, budget: 50, mode: 'equilibre', pos: {}, acts: [], pnl: 0, trades: 0 }); b.pos = b.pos || {}; b.acts = b.acts || []; return b; }

  /* ---------- Historique des prix vus par le bot ---------- */
  const hist = {}; // id -> [[t, prix €]]
  function record() {
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

  function act(txt) { const b = st(); b.acts.unshift({ t: Date.now(), txt }); b.acts.length = Math.min(b.acts.length, 30); }

  /* ---------- Décisions ---------- */
  let lastBet = 0;
  function tick() {
    record();
    const b = st(); if (!b.unlocked || !b.on) return;
    const m = MODES[b.mode] || MODES.equilibre;
    // 1. ventes
    for (const id of Object.keys(b.pos)) {
      const pos = b.pos[id], p = D.eur(id), q = D.prices[id];
      if (!p || (q && q.closed)) continue;
      pos.peak = Math.max(pos.peak || pos.entry, p);
      const r = p / pos.entry - 1, age = Date.now() - pos.at;
      let why = null;
      if (r >= m.tp) why = 'objectif atteint';
      else if (r <= -m.sl) why = 'stop-loss';
      else if (r > 0.004 && p < pos.peak * (1 - m.trail)) why = 'la hausse s\'essouffle';
      else if (age > 3 * 3600000) why = 'trop long';
      if (!why) continue;
      const h = S().holdings[id]; const qty = Math.min(pos.qty, h ? h.qty : 0);
      delete b.pos[id]; (b.cool || (b.cool = {}))[id] = Date.now(); // pas de rachat immédiat du même actif
      if (qty <= 0) continue;
      const res = G.sell(id, qty);
      if (res.ok) { b.pnl += res.pnl || 0; b.trades++; act(`${res.pnl >= 0 ? '🟢' : '🔴'} Vend ${id} (${why}) : ${res.pnl >= 0 ? '+' : ''}${fmt.eur(res.pnl)}`); }
    }
    // 2. achats
    const invested = Object.values(b.pos).reduce((t, x) => t + x.cost, 0);
    const free = Math.min(b.budget - invested, S().cash);
    if (Object.keys(b.pos).length < m.maxPos && free >= 1) {
      const cool = b.cool || {};
      const cands = TC.ASSETS.filter(a => a.cat !== 'fx' && !b.pos[a.id] && !(cool[a.id] && Date.now() - cool[a.id] < 10 * 60000)).map(a => {
        const q = D.prices[a.id]; if (!q || q.closed || q.status !== 'live' && q.status !== 'delayed') return null;
        const r15 = ret(a.id, 15), r60 = ret(a.id, 60) ?? ret(a.id, 30); if (r15 == null || r60 == null) return null;
        const c24 = D.change(a.id);
        if (r15 < m.th || r60 <= 0 || c24 < -2) return null;
        return { a, score: r15 * 2 + r60 + c24 / 1000 };
      }).filter(Boolean).sort((x, y) => y.score - x.score);
      const pick = cands[0];
      if (pick) {
        const size = Math.floor(Math.min(free, b.budget / m.maxPos) * 100) / 100;
        const before = (S().holdings[pick.a.id] || { qty: 0 }).qty;
        const res = size >= 1 ? G.buy(pick.a.id, size) : { ok: false };
        if (res.ok) {
          const qty = S().holdings[pick.a.id].qty - before;
          b.pos[pick.a.id] = { qty, cost: size, entry: D.eur(pick.a.id), peak: D.eur(pick.a.id), at: Date.now() };
          act(`🛒 Achète ${pick.a.id} pour ${fmt.eur(size)} (tendance ${fmt.pct(ret(pick.a.id, 15) * 100)} en 15 min)`);
        }
      }
    }
    // 3. paris (équilibré / audacieux), au plus un toutes les 10 minutes
    if (m.bet && Date.now() - lastBet > 10 * 60000) {
      const r15 = ret('BTC', 15);
      if (r15 != null && Math.abs(r15) > 0.0015) {
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
  B.toggle = function () { const b = st(); b.on = !b.on; G.save(true); act(b.on ? '▶️ Bot allumé' : '⏸️ Bot en pause'); if (b.on) { seed(); setTimeout(tick, 1500); } if (TC.App) TC.App.after(); };
  B.setBudget = function (v) { const b = st(); b.budget = Math.max(1, Math.round(v * 100) / 100); G.save(true); if (TC.App) TC.App.after(); };
  B.setMode = function (k) { if (!MODES[k]) return; st().mode = k; G.save(true); if (TC.App) TC.App.after(); };
  B.sellAll = function () {
    const b = st(); let n = 0;
    for (const id of Object.keys(b.pos)) { const h = S().holdings[id]; const qty = Math.min(b.pos[id].qty, h ? h.qty : 0); delete b.pos[id]; if (qty > 0) { const r = G.sell(id, qty); if (r.ok) { b.pnl += r.pnl || 0; b.trades++; n++; } } }
    b.on = false; act(`⏹️ Tout revendu (${n} position(s)), bot arrêté`); G.save(true); if (TC.App) TC.App.after();
  };

  /* ---------- Panneau (onglet Portefeuille) ---------- */
  B.panel = function () {
    const b = st();
    if (!b.unlocked) return `<div class="panel bot locked"><div class="bot-head"><span class="bot-ic">🤖</span><div><h3>Bot de trading</h3>
      <p class="muted">Il surveille les marchés à ta place : il achète ce qui monte, revend dès qu'il a gagné, coupe vite les pertes, et peut parier.</p></div></div>
      <button class="btn btn-gold btn-xl" data-bot="unlock" ${S().cash >= B.PRICE ? '' : 'disabled'}>Débloquer le bot : ${fmt.eur(B.PRICE)}</button>
      <p class="hint">⚠️ Aucun bot ne peut garantir de gagner, même ceux des pros : il suit les tendances et peut aussi perdre. Il ne tourne que quand le jeu est ouvert.</p></div>`;
    const m = MODES[b.mode] || MODES.equilibre;
    const pos = Object.entries(b.pos);
    const invested = pos.reduce((t, [, x]) => t + x.cost, 0);
    const warm = !Object.keys(hist).some(k => ret(k, 15) != null);
    return `<div class="panel bot ${b.on ? 'on' : ''}"><div class="bot-head"><span class="bot-ic">🤖</span><div><h3>Bot de trading <span class="bot-st">${b.on ? '● EN MARCHE' : '⏸ EN PAUSE'}</span></h3>
        <p class="muted">${b.on ? (warm ? '⏳ Il observe le marché quelques minutes avant d\'agir…' : 'Il surveille les marchés toutes les 30 secondes.') : 'Allume-le pour qu\'il trade à ta place.'}</p></div>
        <button class="btn ${b.on ? '' : 'btn-gold'}" data-bot="toggle">${b.on ? 'Pause' : 'Allumer'}</button></div>
      <div class="bot-row"><span>Mode</span><div class="seg">${Object.entries(MODES).map(([k, v]) => `<button data-botmode="${k}" class="${k === b.mode ? 'active' : ''}">${v.label}</button>`).join('')}</div></div>
      <div class="bot-row"><span>Budget max <b>${fmt.eur(b.budget)}</b></span><div class="quick bot-q">${[10, 25, 50, 100, 250].map(v => `<button data-botbud="${v}">${v} €</button>`).join('')}<button data-botbud="max">Max</button></div></div>
      <div class="kv bot-kv"><span>Gain réalisé</span><b class="${b.pnl >= 0 ? 'up' : 'down'}">${b.pnl >= 0 ? '+' : ''}${fmt.eur(b.pnl)}</b><span>Trades</span><b>${b.trades}</b>
        <span>Investi en ce moment</span><b>${fmt.eur(invested)}</b><span>Règles</span><b>+${(m.tp * 100).toFixed(1)} % / −${(m.sl * 100).toFixed(1)} %</b></div>
      ${pos.length ? `<div class="bot-pos">${pos.map(([id, x]) => { const p = D.eur(id); const r = p ? p / x.entry - 1 : 0; return `<span>${esc(id)} <b class="${r >= 0 ? 'up' : 'down'}">${fmt.pct(r * 100)}</b></span>`; }).join('')}</div>` : ''}
      ${b.acts.length ? `<div class="bot-acts">${b.acts.slice(0, 6).map(a => `<div><small>${new Date(a.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small> ${esc(a.txt)}</div>`).join('')}</div>` : ''}
      <div class="bot-row"><button class="btn btn-sm btn-ghost" data-bot="sellall">Tout revendre et arrêter</button></div>
      <p class="hint">⚠️ Aucun bot ne peut garantir de gagner : il peut aussi perdre. Il ne tourne que quand le jeu est ouvert.</p></div>`;
  };
  document.addEventListener('click', e => {
    const x = e.target.closest('[data-bot],[data-botmode],[data-botbud]'); if (!x) return;
    if (x.dataset.bot === 'unlock') return B.unlock();
    if (x.dataset.bot === 'toggle') return B.toggle();
    if (x.dataset.bot === 'sellall') return B.sellAll();
    if (x.dataset.botmode) return B.setMode(x.dataset.botmode);
    if (x.dataset.botbud) return B.setBudget(x.dataset.botbud === 'max' ? S().cash : +x.dataset.botbud);
  });

  setInterval(tick, 30000); setTimeout(() => { record(); if (st().on) seed(); }, 5000);
  B._tick = tick; B._hist = hist; // tests
})();

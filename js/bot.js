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
    prudent:   { label: '🛡️ Prudent',    tp: 0.02,  sl: 0.01,  trail: 0.006, maxPos: 2, th: 0.0015, bet: 0,    rsiMax: 68 },
    equilibre: { label: '⚖️ Équilibré',  tp: 0.035, sl: 0.018, trail: 0.01,  maxPos: 3, th: 0.0008, bet: 0.05, rsiMax: 74 },
    audacieux: { label: '🔥 Audacieux',  tp: 0.06,  sl: 0.03,  trail: 0.015, maxPos: 4, th: 0.0004, bet: 0.1,  rsiMax: 80 },
    investisseur: { label: '💎 Investisseur', invest: true, tp: 0, sl: 0, trail: 0, maxPos: 0, th: 0, bet: 0, rsiMax: 0 },
  };
  /* ---------- Mode Investisseur : la méthode des gestionnaires prudents ----------
   * Portefeuille diversifié (actions mondiales, Europe, technologie, or, Bitcoin, Ethereum).
   * Filtre de tendance : on garde un actif seulement tant que son cours est au-dessus de sa moyenne des 50 derniers jours ;
   * sinon on le met de côté en cash (ça évite le gros des krachs). Rééquilibrage quand un poids dérive.
   * Peu de trades, donc peu de frais. C'est la stratégie qui a historiquement le plus de chances d'être gagnante sur plusieurs mois. */
  const BASKET = [['SP500', 0.25], ['NASDAQ', 0.15], ['STOXX50', 0.1], ['CAC40', 0.1], ['GOLD', 0.15], ['BTC', 0.15], ['ETH', 0.1]];
  const MA_DAYS = 50;
  const daily = {}; // id -> { at, closes: [] } (cours de clôture quotidiens réels)
  async function loadDaily(id, tf) {
    const c = daily[id + (tf || '')]; if (c && Date.now() - c.at < 6 * 3600000) return c.bars;
    const r = await D.history(id, tf || '6M'); if (!r.real || r.bars.length < MA_DAYS + 5) return null;
    daily[id + (tf || '')] = { at: Date.now(), bars: r.bars }; return r.bars;
  }
  const ma = (arr, n) => arr.slice(-n).reduce((t, v) => t + v, 0) / Math.min(n, arr.length);
  async function trendOk(id) { const bars = await loadDaily(id); if (!bars) return null; const p = D.eur(id) || bars[bars.length - 1].close; return p > ma(bars.map(b => b.close), MA_DAYS); }
  let invBusy = false;
  async function investTick(b) {
    if (invBusy) return; invBusy = true;
    try {
      const port = b.port || (b.port = {});
      const val = id => { const h = S().holdings[id], p = D.eur(id); return port[id] && h && p ? Math.min(port[id].qty, h.qty) * p : 0; };
      const total = Math.min(b.budget, BASKET.reduce((t, [id]) => t + val(id), 0) + S().cash);
      for (const [id, w] of BASKET) {
        if (!live(id)) continue; // marché fermé : on attend l'ouverture
        const ok = await trendOk(id); if (ok == null) continue;
        const target = ok ? total * w : 0, cur = val(id), diff = target - cur;
        if (!ok && cur > 0.5) { // sous sa moyenne 50 jours : on se protège
          const pos = port[id], h = S().holdings[id], qty = Math.min(pos.qty, h ? h.qty : 0);
          const res = G.sell(id, qty); delete port[id];
          if (res.ok) { record(b, res, `Protège ${id}`); act(`🛡️ ${id} passe sous sa moyenne 50 jours : mis de côté (${res.pnl >= 0 ? '+' : ''}${fmt.eur(res.pnl)})`); }
        } else if (ok && diff > Math.max(1, target * 0.2) && S().cash >= 1) { // en dessous de son poids : on complète
          const eur = Math.floor(Math.min(diff, S().cash, b.budget) * 100) / 100; if (eur < 1) continue;
          const before = (S().holdings[id] || { qty: 0 }).qty, res = G.buy(id, eur);
          if (res.ok) { const q = S().holdings[id].qty - before, pos = port[id] || (port[id] = { qty: 0, cost: 0 }); pos.qty += q; pos.cost += eur; act(`💎 Investit ${fmt.eur(eur)} dans ${id} (objectif ${Math.round(w * 100)} %, tendance de fond haussière)`); }
        } else if (ok && -diff > Math.max(2, target * 0.25)) { // trop gros après une forte hausse : on encaisse une partie
          const p = D.eur(id), pos = port[id], qty = Math.min(pos.qty, -diff / p);
          const cost = pos.cost * qty / pos.qty, res = G.sell(id, qty);
          if (res.ok) { pos.qty -= qty; pos.cost -= cost; record(b, res, `Rééquilibre ${id}`); act(`⚖️ ${id} a beaucoup monté : encaisse ${fmt.eur(qty * p)} (${res.pnl >= 0 ? '+' : ''}${fmt.eur(res.pnl)})`); }
        }
      }
      b.invAt = Date.now(); G.save();
    } catch (e) { console.warn('bot investisseur', e); }
    invBusy = false;
  }
  // Test honnête sur 1 an de vrais cours : la même règle appliquée jour par jour
  B.backtest = async function () {
    const series = {};
    for (const [id] of BASKET) { const bars = await loadDaily(id, '1A'); if (bars) series[id] = bars; }
    const ids = Object.keys(series); if (ids.length < 3) throw new Error('Cours historiques indisponibles pour le moment, réessaie plus tard.');
    const days = [...new Set(ids.flatMap(id => series[id].map(b => Math.floor(b.time / 86400))))].sort((a, z) => a - z);
    const px = {}; ids.forEach(id => { px[id] = {}; let last = null; const m = {}; series[id].forEach(b => { m[Math.floor(b.time / 86400)] = b.close; }); days.forEach(d => { if (m[d] != null) last = m[d]; px[id][d] = last; }); });
    const W = {}; BASKET.forEach(([id, w]) => { if (series[id]) W[id] = w; }); const sw = Object.values(W).reduce((t, v) => t + v, 0); Object.keys(W).forEach(k => { W[k] /= sw; });
    let cash = 100, qty = {}, curve = [], hold = [];
    const start = MA_DAYS; const h0 = {}; ids.forEach(id => { h0[id] = px[id][days[start]]; });
    for (let i = start; i < days.length; i++) {
      const d = days[i]; let value = cash; ids.forEach(id => { value += (qty[id] || 0) * (px[id][d] || 0); });
      ids.forEach(id => {
        const hist = days.slice(Math.max(0, i - MA_DAYS), i).map(x => px[id][x]).filter(v => v != null), p = px[id][d]; if (!p || hist.length < 20) return;
        const ok = p > hist.reduce((t, v) => t + v, 0) / hist.length, target = ok ? value * W[id] : 0, cur = (qty[id] || 0) * p, diff = target - cur;
        if (Math.abs(diff) > Math.max(0.5, value * W[id] * 0.2) || (!ok && cur > 0)) { const f = Math.abs(diff) * G.FEE_SPOT; cash -= diff + f; qty[id] = (qty[id] || 0) + diff / p; }
      });
      value = cash; ids.forEach(id => { value += (qty[id] || 0) * px[id][d]; }); curve.push(value);
      hold.push(ids.reduce((t, id) => t + 100 * W[id] * (px[id][d] / h0[id]), 0));
    }
    const win = n => { let w = 0, c = 0; for (let i = n; i < curve.length; i++) { c++; if (curve[i] > curve[i - n]) w++; } return c ? Math.round(w / c * 100) : null; };
    let peak = -Infinity, dd = 0; curve.forEach(v => { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); });
    let pk2 = -Infinity, dd2 = 0; hold.forEach(v => { pk2 = Math.max(pk2, v); dd2 = Math.min(dd2, v / pk2 - 1); });
    const r = { at: Date.now(), days: curve.length, ret: curve[curve.length - 1] / 100 - 1, dd, holdRet: hold[hold.length - 1] / 100 - 1, holdDd: dd2, w1: win(7), w4: win(30), w12: win(90), curve: curve.filter((_, i) => i % 3 === 0) };
    st().bt = r; G.save(); return r;
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
    const list = TC.ASSETS.filter(a => a.cat !== 'fx').sort((x, y) => (x.src === 'binance' ? 0 : 1) - (y.src === 'binance' ? 0 : 1));
    for (const a of list) {
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
  const live = id => { const q = D.prices[id]; return q && !q.closed && (q.status === 'live' || q.status === 'delayed'); };
  // mémoire : après 2 pertes d'affilée sur un actif, le bot le laisse de côté 1 h
  function mem(b, id) { const mm = b.mem || (b.mem = {}); return mm[id] || (mm[id] = { streak: 0, until: 0 }); }
  function learn(b, id, pnl) { const x = mem(b, id); if (pnl > 0) x.streak = 0; else if (++x.streak >= 2) { x.until = Date.now() + 3600000; x.streak = 0; act(`🧠 Met ${id} de côté 1 h (2 pertes d'affilée)`); } }
  const blocked = (b, id) => (b.cool && b.cool[id] && Date.now() - b.cool[id] < 10 * 60000) || mem(b, id).until > Date.now();
  // climat du marché crypto : si le Bitcoin chute fort, pas d'achat de crypto
  function cryptoStorm() { const r = ret('BTC', 60); return r != null && r < -0.012; }

  function sellPart(b, id, qty, why) {
    const res = G.sell(id, qty);
    if (res.ok) { record(b, res, `Vend ${id}`); learn(b, id, res.pnl || 0); act(`${res.pnl >= 0 ? '🟢' : '🔴'} Vend ${id} (${why}) : ${res.pnl >= 0 ? '+' : ''}${fmt.eur(res.pnl)}`); }
    return res;
  }
  function tick() {
    record0();
    const b = st(); if (!b.unlocked || !b.on) return;
    if (guard(b)) { G.save(); if (TC.App) TC.App.after(); return; }
    const m = MODES[b.mode] || MODES.equilibre;
    if (m.invest) { if (!b.invAt || Date.now() - b.invAt > 10 * 60000) investTick(b); return; }
    // 1. ventes et protection des gains
    for (const id of Object.keys(b.pos)) {
      const pos = b.pos[id], p = D.eur(id), q = D.prices[id];
      if (!p || (q && q.closed)) continue;
      pos.peak = Math.max(pos.peak || pos.entry, p);
      const r = p / pos.entry - 1, age = Date.now() - pos.at, v = vol(id) || 0;
      const sl = Math.max(m.sl, v * 6), trail = Math.max(m.trail, v * 4); // stops adaptés à l'agitation de l'actif
      const R = rsi(id), h = S().holdings[id], have = Math.min(pos.qty, h ? h.qty : 0);
      if (have <= 0) { delete b.pos[id]; continue; }
      // stop au prix d'achat dès +1 % : un trade gagnant ne doit pas finir perdant
      if (!pos.be && r >= Math.max(0.01, m.tp / 3)) { pos.be = true; act(`🛡️ ${id} : stop remonté au prix d'achat (${fmt.pct(r * 100)})`); }
      // vente de la moitié à mi-objectif, le reste continue avec le stop suiveur
      if (!pos.half && r >= m.tp / 2 && have * p >= 2) {
        const res = sellPart(b, id, have / 2, 'moitié encaissée');
        if (res.ok) { pos.half = true; pos.qty = have / 2; pos.cost /= 2; pos.be = true; }
        continue;
      }
      let why = null;
      if (r >= m.tp * (pos.half ? 1.6 : 1)) why = 'objectif atteint';
      else if (r <= -sl) why = 'stop-loss';
      else if (pos.be && r <= 0.003) why = 'stop au prix d\'achat';
      else if (r > 0.004 && p < pos.peak * (1 - trail)) why = 'la hausse s\'essouffle';
      else if (r > 0.005 && R != null && R > 82) why = 'surchauffe (RSI ' + Math.round(R) + ')';
      else if (age > (pos.half ? 6 : 3) * 3600000) why = 'trop long';
      if (!why) continue;
      delete b.pos[id]; (b.cool || (b.cool = {}))[id] = Date.now();
      sellPart(b, id, have, why);
    }
    if (guard(b)) { G.save(); if (TC.App) TC.App.after(); return; }
    // 2. achats : score de tendance (15 min, 1 h, 5 min, 24 h), sans flambée ni marché en chute
    const invested = Object.values(b.pos).reduce((t, x) => t + x.cost, 0);
    const free = Math.min(b.budget - invested, S().cash);
    const mk = MARKETS[b.markets] || MARKETS.all;
    const storm = cryptoStorm();
    if (Object.keys(b.pos).length < m.maxPos && free >= 1) {
      const pool = TC.ASSETS.filter(a => mk.ok(a) && !b.pos[a.id] && !blocked(b, a.id) && live(a.id) && !(storm && a.cat === 'crypto'));
      const cands = pool.map(a => {
        const r5 = ret(a.id, 5), r15 = ret(a.id, 15), r60 = ret(a.id, 60) ?? ret(a.id, 30); if (r15 == null || r60 == null) return null;
        const c24 = D.change(a.id), R = rsi(a.id);
        if (r15 < m.th || r60 < -m.th || c24 < -3) return null;
        if (r5 != null && r5 < -m.th) return null; // la hausse est en train de se retourner
        if (R != null && R > m.rsiMax && r15 > m.th * 4) return null; // flambée trop brutale : on attend qu'elle retombe
        const conf = Math.min(1, (r15 / (m.th * 3)) * .5 + (r60 > 0 ? .3 : 0) + (r5 != null && r5 > 0 ? .2 : 0));
        return { a, R, conf, score: r15 * 2 + r60 + (r5 || 0) + c24 / 1000 - (R != null && R > 60 ? (R - 60) / 4000 : 0) };
      }).filter(Boolean).sort((x, y) => y.score - x.score);
      let pick = cands[0];
      // rien qui monte franchement : achat « rebond » sur un actif survendu qui reste en hausse sur 24 h
      if (!pick) {
        const dips = pool.map(a => {
          const R = rsi(a.id), c24 = D.change(a.id), r5 = ret(a.id, 5); if (R == null || R > 30 || !(c24 > 0)) return null;
          if (r5 != null && r5 < 0) return null; // il faut que ça commence à remonter
          return { a, R, dip: true, conf: .5, score: (30 - R) + c24 };
        }).filter(Boolean).sort((x, y) => y.score - x.score);
        pick = dips[0];
      }
      if (pick) {
        // taille selon la confiance et le risque : on risque ~1,5 % du budget au stop-loss
        const v = vol(pick.a.id) || 0, slp = Math.max(m.sl, v * 6);
        const byRisk = b.budget * 0.015 / slp, slot = b.budget / m.maxPos;
        const size = Math.floor(Math.min(free, slot, Math.max(slot * .4, byRisk)) * (0.6 + .4 * (pick.conf || .5)) * 100) / 100;
        const before = (S().holdings[pick.a.id] || { qty: 0 }).qty;
        const res = size >= 1 ? G.buy(pick.a.id, size) : { ok: false };
        if (res.ok) {
          const qty = S().holdings[pick.a.id].qty - before;
          b.pos[pick.a.id] = { qty, cost: size, entry: D.eur(pick.a.id), peak: D.eur(pick.a.id), at: Date.now() };
          act(pick.dip ? `🛒 Achète ${pick.a.id} pour ${fmt.eur(size)} (rebond : survendu, RSI ${Math.round(pick.R)})` : `🛒 Achète ${pick.a.id} pour ${fmt.eur(size)} (tendance ${fmt.pct(ret(pick.a.id, 15) * 100)} en 15 min, confiance ${Math.round((pick.conf || 0) * 100)} %)`);
          if (b.notify) TC.toast(`🤖 🛒 Achète ${pick.a.id} pour ${fmt.eur(size)}`, 'info');
        }
      }
    }
    // 3. paris : tendance nette ET dans le même sens sur 15 min et 1 h, actif varié
    if (m.bet && b.bets !== false && Date.now() - lastBet > 10 * 60000) {
      const opts = TC.ASSETS.filter(a => mk.ok(a) && a.id !== b.lastBetAsset && live(a.id) && !(mem(b, a.id).until > Date.now())).map(a => {
        const r15 = ret(a.id, 15), r60 = ret(a.id, 60) ?? ret(a.id, 30), r5 = ret(a.id, 5), R = rsi(a.id);
        if (r15 == null || r60 == null || Math.abs(r15) < 0.001) return null;
        if (Math.sign(r15) !== Math.sign(r60) || (r5 != null && Math.sign(r5) !== Math.sign(r15))) return null;
        if ((r15 > 0 && R != null && R > 80) || (r15 < 0 && R != null && R < 20)) return null; // trop tendu : risque de retournement
        return { a, r15, k: Math.abs(r15) + Math.abs(r60) / 2 };
      }).filter(Boolean).sort((x, y) => y.k - x.k);
      const o = opts[0];
      if (o) {
        const stake = Math.max(1, Math.round(b.budget * m.bet * Math.min(1, o.k / 0.006 + .4) * 100) / 100), mins = o.a.cat === 'crypto' ? 5 : 15;
        if (S().cash >= stake) { const res = G.bet(o.a.id, o.r15 > 0 ? 'up' : 'down', stake, mins); if (res.ok) { lastBet = Date.now(); b.lastBetAsset = o.a.id; act(`🎲 Parie ${fmt.eur(stake)} sur ${o.a.id} ${o.r15 > 0 ? 'à la hausse' : 'à la baisse'} (${mins} min)`); } }
      }
    }
    G.save();
  }

  /* ---------- Commandes ---------- */
  B.unlock = function () {
    const b = st(); if (b.unlocked) return;
    const price = TC.Style && TC.Style.isCreator && TC.Style.isCreator() ? 0 : B.PRICE; // offert au créateur du jeu
    if (S().cash < price) return TC.toast(`Il te faut ${fmt.eur(price)} de cash`, 'bad');
    if (price) { S().cash -= price; if (TC.Weekly) TC.Weekly.flow(-price); S().log.unshift({ t: Date.now(), kind: 'item', eur: price, asset: 'Licence du bot de trading 🤖' }); }
    b.unlocked = true; b.budget = Math.max(1, Math.min(50, Math.floor(S().cash))); G.save(true);
    TC.sound('kaching'); TC.confetti(100); TC.toast('🤖 Bot de trading débloqué ! Choisis son budget puis allume-le.', 'ok', 6000);
    seed(); if (TC.App) TC.App.after();
  };
  B.toggle = function () { const b = st(); b.on = !b.on; if (b.on && b.day) { const d = today(b); if ((b.dayLoss && d.pnl <= -b.budget * b.dayLoss) || (b.dayGoal && d.pnl >= b.budget * b.dayGoal)) { d.pnl = 0; } } G.save(true); act(b.on ? '▶️ Bot allumé' : '⏸️ Bot en pause'); if (b.on) { seed(); setTimeout(tick, 1500); } if (TC.App) TC.App.after(); };
  B.setBudget = function (v) { const b = st(); b.budget = Math.max(1, Math.round(v * 100) / 100); G.save(true); if (TC.App) TC.App.after(); };
  function closeAll(b, which) {
    const book = which === 'port' ? (b.port || {}) : b.pos; let n = 0;
    for (const id of Object.keys(book)) { const h = S().holdings[id]; const qty = Math.min(book[id].qty, h ? h.qty : 0); delete book[id]; if (qty > 0) { const r = G.sell(id, qty); if (r.ok) { record(b, r, `Vend ${id}`); n++; } } }
    return n;
  }
  B.setMode = function (k) {
    if (!MODES[k]) return; const b = st(), was = (MODES[b.mode] || {}).invest;
    if (was && !MODES[k].invest && Object.keys(b.port || {}).length) act(`🔁 Portefeuille investisseur revendu (${closeAll(b, 'port')} ligne(s))`);
    if (!was && MODES[k].invest && Object.keys(b.pos).length) act(`🔁 Positions de trading revendues (${closeAll(b, 'pos')})`);
    b.mode = k; b.invAt = 0; G.save(true); if (TC.App) TC.App.after(); if (b.on) setTimeout(tick, 500);
  };
  B.set = function (k, v) { st()[k] = v; G.save(true); if (TC.App) TC.App.after(); };
  B.sellAll = function () {
    const b = st(); const n = closeAll(b, 'pos') + closeAll(b, 'port');
    b.on = false; act(`⏹️ Tout revendu (${n} position(s)), bot arrêté`); G.save(true); if (TC.App) TC.App.after();
  };

  const pc = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1).replace('.', ',') + ' %';
  function investBlock(b) {
    const port = Object.entries(b.port || {}), r = b.bt;
    return `<div class="bot-inv"><p class="muted">💎 <b>Investisseur</b> : il répartit ton budget sur ${BASKET.map(x => x[0]).join(', ')}, garde seulement ce qui est en tendance de fond haussière (au-dessus de la moyenne 50 jours) et met le reste à l'abri en cash. Peu de trades, pas de pari. C'est fait pour gagner sur des semaines et des mois, pas en 5 minutes.</p>
      ${port.length ? `<div class="bot-pos">${port.map(([id, x]) => { const p = D.eur(id), v = p ? x.qty * p : 0, g = x.cost ? v / x.cost - 1 : 0; return `<span>${esc(id)} <b class="${g >= 0 ? 'up' : 'down'}">${pc(g)}</b></span>`; }).join('')}</div>` : ''}
      <div class="bot-bt">${r ? `<b>📊 Test sur ${r.days} jours de vrais cours</b>
          <div class="bot-bt-g"><div><small>Résultat</small><b class="${r.ret >= 0 ? 'up' : 'down'}">${pc(r.ret)}</b></div><div><small>Pire baisse</small><b class="down">${pc(r.dd)}</b></div><div><small>Sans le bot</small><b>${pc(r.holdRet)}</b><small>baisse max ${pc(r.holdDd)}</small></div></div>
          <div class="bot-curve">${TC.spark(r.curve, 260, 44)}</div>
          <p>Chance de finir gagnant si tu le laisses : <b>1 semaine ${r.w1} %</b> · <b>1 mois ${r.w4} %</b> · <b>3 mois ${r.w12} %</b></p>
          <p class="hint">Calculé sur le passé réel : ce n'est pas une promesse pour le futur.</p>` : '<p class="hint">Teste la stratégie sur la dernière année de vrais cours pour voir ses chances réelles.</p>'}
        <button class="btn btn-sm" data-bot="backtest">📊 ${r ? 'Refaire le test' : 'Tester sur 1 an de vrais cours'}</button></div></div>`;
  }

  /* ---------- Panneau (onglet Portefeuille) ---------- */
  B.panel = function () {
    const b = st();
    if (!b.unlocked) return `<div class="panel bot locked"><div class="bot-head"><span class="bot-ic">🤖</span><div><h3>Bot de trading</h3>
      <p class="muted">Il surveille tous les marchés à ta place. Mode 💎 Investisseur : portefeuille diversifié qui se protège des krachs, testé sur 1 an de vrais cours. Modes trading : tendances, rebonds, stop-loss et prise de gains automatiques.</p></div></div>
      ${TC.Style && TC.Style.isCreator && TC.Style.isCreator() ? '<button class="btn btn-gold btn-xl" data-bot="unlock">👑 Débloquer le bot (offert au créateur)</button>' : `<button class="btn btn-gold btn-xl" data-bot="unlock" ${S().cash >= B.PRICE ? '' : 'disabled'}>Débloquer le bot : ${fmt.eur(B.PRICE)}</button>`}
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
      ${m.invest ? '' : `<div class="bot-row"><span>Marchés</span><div class="seg">${Object.entries(MARKETS).map(([k, v]) => `<button data-botset="markets" data-v="${k}" class="${k === (b.markets || 'all') ? 'active' : ''}">${v.label}</button>`).join('')}</div></div>`}
      <div class="bot-row"><span>Budget max <b>${fmt.eur(b.budget)}</b></span><div class="quick bot-q">${[10, 25, 50, 100, 250].map(v => `<button data-botbud="${v}">${v} €</button>`).join('')}<button data-botbud="max">Max</button></div></div>
      ${m.invest ? investBlock(b) : ''}
      ${pos.length ? `<div class="bot-pos">${pos.map(([id, x]) => { const p = D.eur(id); const r = p ? p / x.entry - 1 : 0; return `<span>${esc(id)} <b class="${r >= 0 ? 'up' : 'down'}">${fmt.pct(r * 100)}</b></span>`; }).join('')}<small>${fmt.eur(invested)} investis</small></div>` : ''}
      ${b.acts.length ? `<div class="bot-acts">${b.acts.slice(0, 5).map(a => `<div><small>${new Date(a.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small> ${esc(a.txt)}</div>`).join('')}</div>` : ''}
      <details class="bot-adv"><summary>⚙️ Réglages avancés</summary>
        <div class="bot-row"><span>🛑 Pause si perte du jour</span><div class="seg">${[0, .05, .1, .2].map(v => `<button data-botset="dayLoss" data-v="${v}" class="${(b.dayLoss || 0) === v ? 'active' : ''}">${v ? '−' + pct(v) : 'Jamais'}</button>`).join('')}</div></div>
        <div class="bot-row"><span>🎯 Pause si gain du jour</span><div class="seg">${[0, .05, .1, .25].map(v => `<button data-botset="dayGoal" data-v="${v}" class="${(b.dayGoal || 0) === v ? 'active' : ''}">${v ? '+' + pct(v) : 'Jamais'}</button>`).join('')}</div></div>
        <label class="tgl"><input type="checkbox" data-botchk="reinvest" ${b.reinvest ? 'checked' : ''}><span>♻️ Réinvestir les gains (le budget grandit avec les gains, et baisse avec les pertes)</span></label>
        <label class="tgl"><input type="checkbox" data-botchk="bets" ${b.bets !== false ? 'checked' : ''}><span>🎲 Autoriser les paris (modes Équilibré et Audacieux)</span></label>
        <label class="tgl"><input type="checkbox" data-botchk="notify" ${b.notify ? 'checked' : ''}><span>🔔 M'afficher chaque achat et vente</span></label>
        <div class="kv bot-kv"><span>Trades</span><b>${b.trades}</b><span>Meilleur / pire</span><b><span class="up">+${fmt.eur(b.best || 0)}</span> / <span class="down">${fmt.eur(b.worst || 0)}</span></b><span>Règles</span><b>${m.invest ? 'Diversifié, moyenne 50 jours, rééquilibrage' : `+${(m.tp * 100).toFixed(1)} % / −${(m.sl * 100).toFixed(1)} % (ajustées à chaque actif)`}</b></div>
        <button class="btn btn-sm btn-ghost" data-bot="sellall">Tout revendre et arrêter</button></details>
      <p class="hint">⚠️ Aucun bot ne peut garantir de gagner : il peut aussi perdre. Il ne tourne que quand le jeu est ouvert.</p></div>`;
  };
  document.addEventListener('click', e => {
    const x = e.target.closest('[data-bot],[data-botmode],[data-botbud],[data-botset]'); if (!x) return;
    if (x.dataset.bot === 'unlock') return B.unlock();
    if (x.dataset.bot === 'toggle') return B.toggle();
    if (x.dataset.bot === 'sellall') return B.sellAll();
    if (x.dataset.bot === 'backtest') { x.disabled = true; x.textContent = '⏳ Test en cours…'; B.backtest().then(() => { TC.toast('📊 Test terminé', 'ok'); if (TC.App) TC.App.after(); }).catch(e => { TC.toast(e.message, 'bad'); x.disabled = false; }); return; }
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

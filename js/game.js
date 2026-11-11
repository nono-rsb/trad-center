/* Trad Center — moteur de jeu (portefeuille, levier, paris, achats) */
(function () {
  const G = TC.Game = {};
  const KEY = 'tradcenter.save.v1';
  G.FEE_SPOT = 0.001;    // 0,1 % par ordre au comptant
  G.FEE_LEV = 0.0005;    // 0,05 % du notionnel à l'ouverture et à la clôture
  G.MAINT = 0.9;         // liquidation quand la perte atteint 90 % de la marge
  G.BET_PAYOUT = 2;      // gain x2 sur un pari réussi (mise doublée)
  G.BET_DURATIONS = [[1, '1 min'], [5, '5 min'], [15, '15 min'], [60, '1 h']];
  G.START_CASH = 10;
  G.BONUS = TC.season && TC.season.noel && !TC.season.preview ? 20 : 10; // doublé en décembre
  G.BONUS_EVERY = 24 * 3600 * 1000;

  const listeners = [];
  G.on = f => listeners.push(f);
  const emit = (type, data) => listeners.forEach(f => { try { f(type, data); } catch (e) { console.error(e); } });

  function fresh() {
    return {
      v: 1, cash: G.START_CASH, holdings: {}, positions: [], bets: [], owned: [], log: [], nw: [],
      ach: {}, fav: ['BTC', 'ETH', 'CAC40', 'TSLA'], goal: 'huracan',
      stats: { trades: 0, liquidations: 0, betsWon: 0, betsLost: 0, bestTrade: 0, fees: 0, rent: 0, resets: 0, peak: G.START_CASH, spent: 0 },
      created: Date.now(), lastRent: Date.now(), lastBonus: 0, sound: true, music: true, nextId: 1, seenIntro: false,
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1) { const f = fresh(); return Object.assign(f, s, { stats: Object.assign(f.stats, s.stats || {}) }); }
    } catch (e) { }
    return fresh();
  }
  G.state = load();
  const S = () => G.state;
  let saveT = null;
  G.save = function (now) {
    clearTimeout(saveT);
    G.state.updatedAt = Date.now();
    const w = () => { try { localStorage.setItem(KEY, JSON.stringify(G.state)); } catch (e) { } };
    if (TC.Net && TC.Net.queueSync) TC.Net.queueSync();
    if (now) w(); else saveT = setTimeout(w, 400);
  };
  window.addEventListener('beforeunload', () => { try { localStorage.setItem(KEY, JSON.stringify(G.state)); } catch (e) { } });

  // Remplace la partie par une autre (ex. sauvegarde en ligne), sans toucher à sa date
  G.adopt = function (st) {
    const f = fresh();
    G.state = Object.assign(f, st, { stats: Object.assign(f.stats, st.stats || {}) });
    try { localStorage.setItem(KEY, JSON.stringify(G.state)); } catch (e) { }
  };

  G.reset = function (keepAch) {
    const old = G.state;
    G.state = fresh();
    G.state.seenIntro = true;
    G.state.sound = old.sound; G.state.music = old.music; G.state.musicVol = old.musicVol;
    if (keepAch) { G.state.ach = old.ach; G.state.stats.resets = (old.stats.resets || 0) + 1; }
    G.save(true); emit('reset');
  };

  const px = id => TC.Data.eur(id);
  const uid = () => S().nextId++;
  function log(entry) {
    S().log.unshift(Object.assign({ t: Date.now() }, entry));
    if (S().log.length > 300) S().log.length = 300;
  }
  function err(msg) { return { ok: false, msg }; }

  /* ---------------- VALORISATION ---------------- */
  G.holdingValue = id => { const h = S().holdings[id]; const p = px(id); return h && p ? h.qty * p : (h ? h.lastVal || 0 : 0); };
  G.posPnl = (pos, p) => { p = p == null ? px(pos.asset) : p; if (p == null) return pos.lastPnl || 0; return pos.side === 'long' ? pos.qty * (p - pos.entry) : pos.qty * (pos.entry - p); };
  G.posValue = pos => Math.max(0, pos.margin + G.posPnl(pos));
  G.itemResale = o => { const it = TC.shopById[o.item]; return o.price * (TC.SHOP_TYPES[it.type].resale); };
  G.spotValue = () => Object.keys(S().holdings).reduce((s, id) => s + G.holdingValue(id), 0);
  G.levValue = () => S().positions.reduce((s, p) => s + G.posValue(p), 0);
  G.betsValue = () => S().bets.reduce((s, b) => s + b.stake, 0);
  G.itemsValue = () => S().owned.reduce((s, o) => s + G.itemResale(o), 0);
  G.netWorth = () => S().cash + G.spotValue() + G.levValue() + G.betsValue() + G.itemsValue();
  G.rank = (nw) => { nw = nw == null ? G.netWorth() : nw; let r = TC.RANKS[0], next = null; for (let i = 0; i < TC.RANKS.length; i++) { if (nw >= TC.RANKS[i][0]) { r = TC.RANKS[i]; next = TC.RANKS[i + 1] || null; } } return { r, next }; };
  G.prestige = () => S().owned.reduce((s, o) => s + Math.round(Math.sqrt(o.price) / 3), 0);

  /* ---------------- SPOT ---------------- */
  G.buy = function (id, eur) {
    const p = px(id); const a = TC.assetById[id];
    if (!p) return err('Prix indisponible pour le moment');
    eur = +eur;
    if (!(eur > 0)) return err('Montant invalide');
    if (eur < 0.1) return err('Montant minimum : 0,10 €');
    if (eur > S().cash + 1e-9) return err('Fonds insuffisants');
    eur = Math.min(eur, S().cash);
    const fee = eur * G.FEE_SPOT;
    const qty = (eur - fee) / p;
    const h = S().holdings[id] || { qty: 0, cost: 0 };
    h.qty += qty; h.cost += eur; h.lastVal = h.qty * p;
    S().holdings[id] = h;
    S().cash -= eur;
    S().stats.trades++; S().stats.fees += fee;
    log({ kind: 'buy', asset: id, qty, price: p, eur, fee });
    G.save(); emit('trade', { kind: 'buy', id });
    return { ok: true, msg: `Achat de ${TC.fmt.qty(qty)} ${a.id} à ${TC.fmt.eur(p)}` };
  };

  G.sell = function (id, qty) {
    const p = px(id); const a = TC.assetById[id]; const h = S().holdings[id];
    if (!h || h.qty <= 0) return err('Vous ne détenez pas cet actif');
    if (!p) return err('Prix indisponible pour le moment');
    qty = +qty;
    if (!(qty > 0)) return err('Quantité invalide');
    if (qty >= h.qty * 0.9999) qty = h.qty;
    const gross = qty * p; const fee = gross * G.FEE_SPOT; const proceeds = gross - fee;
    const costPart = h.cost * qty / h.qty;
    const pnl = proceeds - costPart;
    h.qty -= qty; h.cost -= costPart;
    if (h.qty <= 1e-12 || h.qty * p < 0.001) delete S().holdings[id]; else h.lastVal = h.qty * p;
    S().cash += proceeds;
    S().stats.trades++; S().stats.fees += fee;
    if (pnl > S().stats.bestTrade) S().stats.bestTrade = pnl;
    log({ kind: 'sell', asset: id, qty, price: p, eur: proceeds, fee, pnl });
    G.save(); emit('trade', { kind: 'sell', id, pnl });
    return { ok: true, pnl, msg: `Vente de ${TC.fmt.qty(qty)} ${a.id} : ${TC.fmt.eur(proceeds)} (${pnl >= 0 ? '+' : ''}${TC.fmt.eur(pnl)})` };
  };

  /* ---------------- LEVIER ---------------- */
  G.liqPrice = (side, entry, lev) => side === 'long' ? entry * (1 - G.MAINT / lev) : entry * (1 + G.MAINT / lev);

  G.open = function (id, side, margin, lev, sl, tp) {
    const p = px(id); const a = TC.assetById[id];
    if (!p) return err('Prix indisponible pour le moment');
    margin = +margin; lev = Math.round(+lev);
    if (!(margin > 0)) return err('Marge invalide');
    if (margin < 0.5) return err('Marge minimum : 0,50 €');
    if (lev < 1 || lev > 100) return err('Levier entre x1 et x100');
    if (margin > S().cash + 1e-9) return err('Fonds insuffisants');
    margin = Math.min(margin, S().cash);
    sl = sl ? +sl : null; tp = tp ? +tp : null;
    if (side === 'long') { if (sl && sl >= p) return err('Le stop-loss doit être sous le prix actuel'); if (tp && tp <= p) return err('Le take-profit doit être au-dessus du prix actuel'); }
    else { if (sl && sl <= p) return err('Le stop-loss doit être au-dessus du prix actuel'); if (tp && tp >= p) return err('Le take-profit doit être sous le prix actuel'); }
    const fee = margin * lev * G.FEE_LEV;
    const m = margin - fee;
    const qty = m * lev / p;
    const pos = { id: uid(), asset: id, side, lev, margin: m, entry: p, qty, sl, tp, liq: G.liqPrice(side, p, lev), t: Date.now(), lastPnl: 0 };
    S().positions.push(pos);
    S().cash -= margin;
    S().stats.trades++; S().stats.fees += fee;
    log({ kind: 'open', asset: id, side, lev, eur: margin, price: p, fee });
    G.save(); emit('trade', { kind: 'open', id, side, lev });
    return { ok: true, msg: `${side === 'long' ? 'Long' : 'Short'} x${lev} sur ${a.id} ouvert à ${TC.fmt.eur(p)}` };
  };

  G.close = function (posId, reason) {
    const i = S().positions.findIndex(p => p.id === posId); if (i < 0) return err('Position introuvable');
    const pos = S().positions[i]; const p = px(pos.asset);
    if (p == null) return err('Prix indisponible');
    let pnl = G.posPnl(pos, p);
    let back;
    if (reason === 'liq') { back = 0; pnl = -pos.margin; S().stats.liquidations++; }
    else {
      const fee = pos.qty * p * G.FEE_LEV;
      back = Math.max(0, pos.margin + pnl - fee); pnl = back - pos.margin; S().stats.fees += fee;
    }
    S().positions.splice(i, 1);
    S().cash += back;
    if (pnl > S().stats.bestTrade) S().stats.bestTrade = pnl;
    log({ kind: reason === 'liq' ? 'liq' : 'close', asset: pos.asset, side: pos.side, lev: pos.lev, eur: back, price: p, pnl, reason });
    G.save(); emit('trade', { kind: reason === 'liq' ? 'liq' : 'close', id: pos.asset, pnl, reason });
    return { ok: true, pnl, msg: reason === 'liq' ? `💀 Liquidé sur ${pos.asset} (x${pos.lev})` : `Position ${pos.asset} clôturée : ${pnl >= 0 ? '+' : ''}${TC.fmt.eur(pnl)}` };
  };

  G.checkPositions = function (assetId) {
    const res = [];
    S().positions.slice().forEach(pos => {
      if (assetId && pos.asset !== assetId) return;
      const p = px(pos.asset); if (p == null) return;
      pos.lastPnl = G.posPnl(pos, p);
      const L = pos.side === 'long';
      if ((L && p <= pos.liq) || (!L && p >= pos.liq)) res.push(G.close(pos.id, 'liq'));
      else if (pos.sl && ((L && p <= pos.sl) || (!L && p >= pos.sl))) res.push(Object.assign(G.close(pos.id, 'sl'), { tag: 'Stop-loss' }));
      else if (pos.tp && ((L && p >= pos.tp) || (!L && p <= pos.tp))) res.push(Object.assign(G.close(pos.id, 'tp'), { tag: 'Take-profit' }));
    });
    return res;
  };

  /* ---------------- PARIS ---------------- */
  G.bet = function (id, dir, stake, minutes) {
    const p = px(id); const a = TC.assetById[id]; const q = TC.Data.prices[id];
    if (!p) return err('Prix indisponible');
    if (q && q.closed) return err('Marché fermé : le prix ne bouge pas, pari impossible');
    stake = +stake;
    if (!(stake > 0)) return err('Mise invalide');
    if (stake < 0.1) return err('Mise minimum : 0,10 €');
    if (stake > S().cash + 1e-9) return err('Fonds insuffisants');
    stake = Math.min(stake, S().cash);
    const b = { id: uid(), asset: id, dir, stake, start: p, t: Date.now(), end: Date.now() + minutes * 60000, minutes };
    S().bets.push(b); S().cash -= stake;
    log({ kind: 'bet', asset: id, dir, eur: stake, price: p, minutes });
    G.save(); emit('trade', { kind: 'bet', id });
    return { ok: true, msg: `Pari ${dir === 'up' ? '📈 hausse' : '📉 baisse'} sur ${a.id} (${minutes} min) : ${TC.fmt.eur(stake)}` };
  };

  const resolving = new Set();
  G.checkBets = async function () {
    const out = [];
    const due = S().bets.filter(b => Date.now() >= b.end && !resolving.has(b.id));
    for (const b of due) {
      resolving.add(b.id);
      let p = null;
      if (Date.now() - b.end > 90000) p = await TC.Data.priceAt(b.asset, b.end); // résolution exacte après une absence
      if (p == null) p = px(b.asset);
      resolving.delete(b.id);
      if (p == null) continue;
      const i = S().bets.findIndex(x => x.id === b.id); if (i < 0) continue;
      S().bets.splice(i, 1);
      let result, pay = 0;
      if (Math.abs(p - b.start) / b.start < 1e-9) { result = 'push'; pay = b.stake; }
      else if ((p > b.start) === (b.dir === 'up')) { result = 'win'; pay = b.stake * (S().jackpot ? 3 : G.BET_PAYOUT); S().jackpot = false; S().stats.betsWon++; }
      else { result = 'lose'; S().stats.betsLost++; }
      S().cash += pay;
      const pnl = pay - b.stake;
      if (pnl > S().stats.bestTrade) S().stats.bestTrade = pnl;
      log({ kind: 'betres', asset: b.asset, dir: b.dir, eur: pay, price: p, pnl, result, start: b.start });
      out.push({ bet: b, result, pnl, end: p });
      emit('trade', { kind: 'betres', id: b.asset, result, pnl });
    }
    if (out.length) G.save();
    return out;
  };

  /* ---------------- BOUTIQUE ---------------- */
  G.buyItem = function (itemId) {
    const it = TC.shopById[itemId]; if (!it) return err('Article introuvable');
    if (it.limited === 'xmas' && !(TC.Xmas && TC.Xmas.isDay(25) && !TC.season.preview)) return err('Édition limitée : disponible uniquement le 25 décembre');
    if (S().cash + 1e-9 < it.price) return err(`Il vous manque ${TC.fmt.eur(it.price - S().cash)} en cash`);
    G.collectRent();
    S().cash -= it.price; S().stats.spent += it.price;
    S().owned.push({ uid: uid(), item: itemId, price: it.price, t: Date.now() });
    log({ kind: 'item', item: itemId, eur: it.price });
    G.save(); emit('item', { kind: 'buy', item: itemId });
    return { ok: true, msg: `Félicitations ! ${it.brand} ${it.model} est à vous 🎉` };
  };
  G.sellItem = function (ouid) {
    const i = S().owned.findIndex(o => o.uid === ouid); if (i < 0) return err('Introuvable');
    G.collectRent();
    const o = S().owned[i]; const it = TC.shopById[o.item]; const v = G.itemResale(o);
    S().owned.splice(i, 1); S().cash += v;
    log({ kind: 'itemsell', item: o.item, eur: v });
    G.save(); emit('item', { kind: 'sell', item: o.item });
    return { ok: true, msg: `${it.brand} ${it.model} revendu(e) ${TC.fmt.eur(v)}` };
  };

  /* ---------------- LOYERS ---------------- */
  G.rentPerHour = () => S().owned.reduce((s, o) => TC.shopById[o.item].type === 'estate' ? s + o.price * TC.RENT_RATE_PER_HOUR : s, 0);
  G.pendingRent = () => { const h = Math.min(TC.RENT_MAX_HOURS, (Date.now() - S().lastRent) / 3600000); return G.rentPerHour() * h; };
  G.collectRent = function () {
    const r = G.pendingRent(); S().lastRent = Date.now();
    if (r > 0) {
      const t = TC.Tax ? TC.Tax.on(r) : { net: r, tax: 0 };
      S().cash += r; S().stats.rent += r; if (TC.Tax && t.tax) TC.Tax.owe(t.tax, 'loyers'); // impôt à payer soi-même
      log({ kind: 'rent', eur: r, asset: t.tax ? `impôt à payer : ${TC.fmt.eur(t.tax)}` : undefined }); G.save(); emit('rent', r);
      return r;
    }
    return r;
  };

  /* ---------------- BONUS ---------------- */
  G.bonusReadyIn = () => Math.max(0, S().lastBonus + G.BONUS_EVERY - Date.now());
  G.claimBonus = function () {
    if (G.bonusReadyIn() > 0) return err('Bonus pas encore disponible');
    S().lastBonus = Date.now(); S().cash += G.BONUS;
    log({ kind: 'bonus', eur: G.BONUS }); G.save(); emit('bonus');
    return { ok: true, msg: `+${TC.fmt.eur(G.BONUS)} de bonus quotidien !` };
  };

  G.isBroke = () => G.netWorth() < 0.1 && !S().positions.length && !S().bets.length && G.bonusReadyIn() > 0;

  /* ---------------- HISTORIQUE PATRIMOINE ---------------- */
  G.sampleNW = function () {
    const nw = G.netWorth(); const arr = S().nw;
    const t = Math.floor(Date.now() / 1000);
    if (arr.length && t - arr[arr.length - 1][0] < 30) arr[arr.length - 1][1] = nw;
    else arr.push([t, nw]);
    if (arr.length > 3000) arr.splice(0, arr.length - 3000);
    if (nw > S().stats.peak) S().stats.peak = nw;
  };

  /* ---------------- SUCCÈS ---------------- */
  G.checkAchievements = function () {
    const s = S(), nw = G.netWorth(), got = [];
    const own = t => s.owned.some(o => { const it = TC.shopById[o.item]; return t(it); });
    const has = {
      first_trade: s.stats.trades > 0,
      first_profit: s.log.some(l => (l.kind === 'sell' || l.kind === 'close') && l.pnl > 0),
      double: nw >= 20, nw100: nw >= 100, nw1k: nw >= 1000, nw10k: nw >= 1e4, nw100k: nw >= 1e5, nw1m: nw >= 1e6, nw1b: nw >= 1e9,
      lev10: s.log.some(l => l.kind === 'open' && l.lev >= 10),
      lev100: s.log.some(l => l.kind === 'open' && l.lev >= 100),
      short: s.log.some(l => l.kind === 'open' && l.side === 'short'),
      liquidated: s.stats.liquidations > 0,
      bet_win: s.stats.betsWon > 0, bet5: s.stats.betsWon >= 5,
      diversified: Object.keys(s.holdings).length >= 5,
      first_vehicle: own(it => it.type === 'car'),
      porsche: own(it => it.brand === 'Porsche'),
      lambo: own(it => it.brand === 'Lamborghini'),
      ferrari: own(it => it.brand === 'Ferrari'),
      bugatti: own(it => it.brand === 'Bugatti'),
      first_estate: own(it => it.type === 'estate'),
      landlord: s.owned.filter(o => TC.shopById[o.item].type === 'estate').length >= 5,
      rolex: own(it => it.brand === 'Rolex'),
      yacht: own(it => /yacht/i.test(it.model)),
      jet: own(it => /jet/i.test(it.model)),
      collector: s.owned.length >= 10,
      phoenix: s.stats.resets > 0,
      lucky: !!s.luckyChest,
      xmas: !!(s.xmas && s.xmas.played25),
      advent: !!(s.xmas && s.xmas.advent && Object.keys(s.xmas.advent).length >= 24),
    };
    TC.ACHIEVEMENTS.forEach(a => { if (has[a.id] && !s.ach[a.id]) { s.ach[a.id] = Date.now(); got.push(a); } });
    if (got.length) G.save();
    return got;
  };

  /* ---------------- TRANSFERTS ENTRE AMIS ---------------- */
  // Retire du portefeuille ce qui va être envoyé. Renvoie le contenu du transfert.
  G.takeForTransfer = function (kind, asset, amount) {
    amount = +amount;
    if (!(amount > 0)) return err('Montant invalide');
    if (kind === 'cash') {
      if (amount < 0.01) return err('Minimum : 0,01 €');
      if (amount > S().cash + 1e-9) return err('Cash insuffisant');
      amount = Math.min(amount, S().cash);
      S().cash -= amount;
      return { ok: true, kind, asset: null, qty: amount, eur: amount };
    }
    const h = S().holdings[asset]; const p = px(asset);
    if (!h || h.qty <= 0) return err('Vous ne détenez pas cet actif');
    if (!p) return err('Prix indisponible pour le moment');
    if (amount > h.qty * 1.0001) return err('Quantité insuffisante');
    const qty = Math.min(amount, h.qty);
    const costPart = h.cost * qty / h.qty;
    h.qty -= qty; h.cost -= costPart;
    if (h.qty <= 1e-12) delete S().holdings[asset];
    return { ok: true, kind, asset, qty, eur: qty * p, cost: costPart };
  };
  // Remet en place un envoi qui a échoué
  G.refundTransfer = function (t) {
    if (t.kind === 'cash') S().cash += t.qty;
    else { const h = S().holdings[t.asset] || { qty: 0, cost: 0 }; h.qty += t.qty; h.cost += t.cost || t.eur; S().holdings[t.asset] = h; }
    G.save(); emit('trade', { kind: 'refund' });
  };
  G.logSent = function (t, toPseudo) {
    if (TC.Weekly) TC.Weekly.flow(-(t.eur || 0));
    log({ kind: 'send', asset: t.asset, qty: t.kind === 'cash' ? null : t.qty, eur: t.eur, who: toPseudo });
    S().stats.sent = (S().stats.sent || 0) + t.eur;
    G.save(true); emit('trade', { kind: 'send' });
  };
  G.receive = function (t) {
    if (TC.Weekly) TC.Weekly.flow(t.eur || 0);
    if (t.kind === 'cash') S().cash += t.qty;
    else if (TC.assetById[t.asset]) { const h = S().holdings[t.asset] || { qty: 0, cost: 0 }; h.qty += t.qty; h.cost += t.eur; S().holdings[t.asset] = h; }
    else S().cash += t.eur;
    log({ kind: 'recv', asset: t.asset, qty: t.kind === 'cash' ? null : t.qty, eur: t.eur, who: t.fromPseudo, msg: t.msg });
    S().stats.received = (S().stats.received || 0) + t.eur;
    G.save(true); emit('trade', { kind: 'recv' });
  };

  G.toggleFav = function (id) {
    const f = S().fav; const i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.push(id);
    G.save();
  };
})();

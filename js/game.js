/* Trad Center — moteur de jeu (portefeuille, levier, paris, achats) */
(function () {
  const G = TC.Game = {};
  const KEY = 'tradcenter.save.v1';
  G.FEE_SPOT = 0.001;    // 0,1 % par ordre au comptant
  G.FEE_LEV = 0.0005;    // 0,05 % du notionnel à l'ouverture et à la clôture
  // Frais réellement appliqués : taux de base (éventuellement changé par le Maire) × effet « fees » des événements (js/events.js)
  /* Grande fortune : plus on est riche, plus le jeu est dur. Rien avant 1 Md€, puis de plus en plus (niveau 1 vers 32 Md€).
   *  - frais de trading multipliés jusqu'à ×5 ;
   *  - impact sur le marché : un gros ordre fait bouger le prix contre soi (jusqu'à 8 % de l'ordre) ;
   *  - paris : au-delà de 10 M€, le gain d'un pari réussi baisse (jusqu'à x1,1) ;
   *  - impôt quotidien sur la fortune (js/tax.js). */
  G.rich = () => { const nw = G.netWorth(); return nw < 1e9 ? 0 : Math.min(1, Math.log10(nw / 1e9) / 1.5); };
  G.impact = eur => { const r = G.rich(); return r > 0 ? Math.min(0.08, (eur || 0) / 2e10 * (1 + 2 * r)) : 0; };
  const evFees = () => (TC.Events ? TC.Events.mult('fees') : 1);
  G.feeSpot = eur => G.FEE_SPOT * evFees() * (1 + 4 * G.rich()) + G.impact(eur);
  G.feeLev = notional => G.FEE_LEV * evFees() * (1 + 4 * G.rich()) + G.impact(notional) / 2;
  G.betPayout = stake => { const r = G.rich(); return r > 0 && stake > 1e7 ? Math.max(1.1, G.BET_PAYOUT - 0.45 * Math.log10(stake / 1e7) * (0.5 + r / 2)) : G.BET_PAYOUT; };
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
    G.state.updatedAt = Math.max(Date.now(), G.state.updatedAt || 0); // jamais en arrière : deux horloges différentes (PC / tél) ne doivent pas se croire « plus anciennes » en boucle
    const w = () => { try { localStorage.setItem(KEY, JSON.stringify(G.state)); } catch (e) { } };
    if (TC.Net && TC.Net.queueSync) (now && TC.Net.flushSoon ? TC.Net.flushSoon : TC.Net.queueSync)();
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
  /* Cours fiables : en direct ou différé. Les cours simulés (réseau qui bloque les sources, Temps d'écran…) et le vieux cache
   * ne servent qu'à l'affichage : on ne trade pas dessus, ils ne liquident rien, et le patrimoine garde la dernière valeur réelle. */
  const real = id => { const q = TC.Data.prices[id]; return !!(q && q.price != null && (q.status === 'live' || q.status === 'delayed')); };
  G.realPrice = real;
  const pxv = id => { const q = TC.Data.prices[id]; return q && q.status === 'sim' ? null : px(id); };
  const NOREAL = 'Cours indisponibles sur ton réseau (le Wi-Fi bloque les sources de prix) : impossible de trader pour l\'instant. Essaie avec les données mobiles ou une autre connexion, ou réessaie dans quelques minutes.';
  const uid = () => S().nextId++;
  function log(entry) {
    S().log.unshift(Object.assign({ t: Date.now() }, entry));
    if (S().log.length > 300) S().log.length = 300;
  }
  function err(msg) { return { ok: false, msg }; }

  /* ---------------- VALORISATION ---------------- */
  G.holdingValue = id => { const h = S().holdings[id]; const p = pxv(id); return h && p ? h.qty * p : (h ? h.lastVal || 0 : 0); };
  G.posPnl = (pos, p) => { p = p == null ? pxv(pos.asset) : p; if (p == null) return pos.lastPnl || 0; return pos.side === 'long' ? pos.qty * (p - pos.entry) : pos.qty * (pos.entry - p); };
  G.posValue = pos => Math.max(0, pos.margin + G.posPnl(pos));
  G.itemResale = o => { const it = TC.shopById[o.item]; return o.price * (TC.SHOP_TYPES[it.type].resale); };
  G.spotValue = () => Object.keys(S().holdings).reduce((s, id) => s + G.holdingValue(id), 0);
  G.levValue = () => S().positions.reduce((s, p) => s + G.posValue(p), 0);
  G.betsValue = () => S().bets.reduce((s, b) => s + b.stake, 0);
  G.itemsValue = () => S().owned.reduce((s, o) => s + G.itemResale(o), 0);
  G.occValue = () => ((S().occ && S().occ.inv) || []).reduce((s, x) => s + (x.status === 'own' || x.status === 'listed' || x.status === 'transit' ? (x.fake ? 0 : x.cote * 0.8) : x.status === 'sold' ? x.soldPrice || 0 : 0), 0); // articles Trad Occaz (revente rapide)
  G.netWorth = () => S().cash + G.spotValue() + G.levValue() + G.betsValue() + G.itemsValue() + G.occValue();
  G.rank = (nw) => { nw = nw == null ? G.netWorth() : nw; let r = TC.RANKS[0], next = null; for (let i = 0; i < TC.RANKS.length; i++) { if (nw >= TC.RANKS[i][0]) { r = TC.RANKS[i]; next = TC.RANKS[i + 1] || null; } } return { r, next }; };
  G.prestige = () => S().owned.reduce((s, o) => s + Math.round(Math.sqrt(o.price) / 3), 0);

  /* ---------------- SPOT ---------------- */
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

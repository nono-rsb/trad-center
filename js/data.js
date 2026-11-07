/* Trad Center — flux de prix réels
 *  - Crypto : Binance (WebSocket temps réel) → secours CoinGecko
 *  - Bourse / indices / matières : Yahoo Finance (via proxy CORS public)
 *  - Devises : Yahoo Finance + Frankfurter (BCE) + open.er-api
 *  - Si une source est injoignable : dernier prix connu (cache), puis simulation clairement signalée (badge SIM)
 */
(function () {
  const D = TC.Data = {
    prices: {},          // id -> { price, prev, ccy, status, t, high, low, closed, spark: [] }
    fx: { EUR: 1, USD: 1.16, USDT: 1.16, GBP: 0.87, JPY: 178, CHF: 0.93, CAD: 1.62, AUD: 1.77, CNY: 8.3 },
    fxPrev: {},
    fxStatus: 'loading',
    health: { binance: 'loading', yahoo: 'loading', fx: 'loading' },
    subs: [],
  };
  const PRICE_CACHE = 'tradcenter.prices.v1';
  const now = () => Date.now();

  D.on = f => D.subs.push(f);
  function emit(id) { for (const f of D.subs) { try { f(id); } catch (e) { console.error(e); } } }

  D.toEUR = function (v, ccy) {
    if (v == null) return null;
    if (ccy === 'EUR') return v;
    if (ccy === 'GBp') return v / 100 / D.fx.GBP;
    const r = D.fx[ccy] || (ccy === 'USDT' ? D.fx.USD : null);
    return r ? v / r : v;
  };
  D.eur = function (id) {
    const p = D.prices[id];
    if (!p || p.price == null) return null;
    return D.toEUR(p.price, p.ccy);
  };
  D.prevEur = function (id) {
    const p = D.prices[id];
    if (!p || p.prev == null) return null;
    return D.toEUR(p.prev, p.ccy);
  };
  D.change = function (id) {
    const p = D.prices[id];
    if (!p || p.price == null || !p.prev) return 0;
    return (p.price - p.prev) / p.prev * 100;
  };
  D.isTradable = function (id) {
    const p = D.prices[id];
    return !!(p && p.price != null && p.price > 0);
  };

  function set(id, patch) {
    const a = TC.assetById[id];
    const cur = D.prices[id] || { ccy: a.ccy, spark: [] };
    const old = cur.price;
    Object.assign(cur, patch);
    if (cur.price != null && cur.price !== old) {
      cur.dir = old == null ? 0 : (cur.price > old ? 1 : -1);
      cur.spark.push(cur.price);
      if (cur.spark.length > 80) cur.spark.shift();
    }
    cur.t = patch.t || now();
    D.prices[id] = cur;
    emit(id);
  }
  D.set = set;

  async function fetchJSON(url, timeout = 9000) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      return JSON.parse(txt);
    } finally { clearTimeout(to); }
  }
  D.fetchJSON = fetchJSON;

  /* ================= CACHE ================= */
  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(PRICE_CACHE) || 'null');
      if (!c) return;
      if (c.fx) Object.assign(D.fx, c.fx);
      for (const id in c.p) {
        if (!TC.assetById[id]) continue;
        const v = c.p[id];
        D.prices[id] = { price: v.price, prev: v.prev, ccy: v.ccy, status: 'cache', t: v.t, spark: [v.price], closed: true };
      }
    } catch (e) { }
  }
  function saveCache() {
    try {
      const p = {};
      for (const id in D.prices) {
        const v = D.prices[id];
        if (v.price != null && v.status !== 'sim') p[id] = { price: v.price, prev: v.prev, ccy: v.ccy, t: v.t };
      }
      localStorage.setItem(PRICE_CACHE, JSON.stringify({ p, fx: D.fx, at: now() }));
    } catch (e) { }
  }

  /* ================= BINANCE ================= */
  const BIN_REST = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
  const BIN_WS = ['wss://data-stream.binance.vision/stream?streams=', 'wss://stream.binance.com:9443/stream?streams=', 'wss://stream.binance.com:443/stream?streams='];
  let binHost = 0, wsHost = 0, ws = null, wsAlive = 0, binPollTimer = null;
  const cryptos = TC.ASSETS.filter(a => a.src === 'binance');
  const bySym = {};
  cryptos.forEach(a => { bySym[a.bin] = a; });

  async function binREST(path, timeout) {
    let err;
    for (let k = 0; k < BIN_REST.length; k++) {
      const i = (binHost + k) % BIN_REST.length;
      try { const j = await fetchJSON(BIN_REST[i] + path, timeout); binHost = i; return j; } catch (e) { err = e; }
    }
    throw err || new Error('binance');
  }
  D.binREST = binREST;

  function applyBinTicker(sym, last, open, high, low) {
    last = +last; open = +open;
    if (!isFinite(last) || last <= 0) return;
    if (sym === 'EURUSDT') {
      D.fx.USDT = last;
      if (D.fxStatus !== 'live-yahoo') { D.fx.USD = last; updateFxAssets(); }
      if (open) D.fxPrev.USDT = open;
      emit('__fx');
      return;
    }
    const a = bySym[sym];
    if (!a) return;
    set(a.id, { price: last, prev: open || last, high: +high, low: +low, status: 'live', closed: false, ccy: 'USDT' });
  }

  async function initBinance() {
    const syms = cryptos.map(a => a.bin).concat(['EURUSDT']);
    let ok = false;
    try {
      const arr = await binREST('/api/v3/ticker/24hr?type=MINI&symbols=' + encodeURIComponent(JSON.stringify(syms)));
      arr.forEach(t => applyBinTicker(t.symbol, t.lastPrice, t.openPrice, t.highPrice, t.lowPrice));
      ok = true;
    } catch (e) {
      // un symbole invalide fait échouer la requête groupée → on tente un par un
      const res = await Promise.allSettled(syms.map(s => binREST('/api/v3/ticker/24hr?type=MINI&symbol=' + s, 7000)
        .then(t => applyBinTicker(t.symbol, t.lastPrice, t.openPrice, t.highPrice, t.lowPrice))));
      ok = res.some(r => r.status === 'fulfilled');
    }
    D.health.binance = ok ? 'live' : 'down';
    emit('__health');
    connectWS();
    if (!ok) startCoinGecko();
  }

  function connectWS() {
    const streams = cryptos.map(a => a.bin.toLowerCase() + '@miniTicker').concat(['eurusdt@miniTicker']).join('/');
    let opened = false;
    try { ws = new WebSocket(BIN_WS[wsHost] + streams); } catch (e) { return wsFail(); }
    const openTimer = setTimeout(() => { if (!opened) { try { ws.close(); } catch (e) { } } }, 8000);
    ws.onopen = () => { opened = true; clearTimeout(openTimer); D.health.binance = 'live'; emit('__health'); stopBinPoll(); };
    ws.onmessage = ev => {
      wsAlive = now();
      try {
        const m = JSON.parse(ev.data); const d = m.data || m;
        if (d && d.s) applyBinTicker(d.s, d.c, d.o, d.h, d.l);
      } catch (e) { }
    };
    ws.onclose = () => { clearTimeout(openTimer); if (!opened) wsHost = (wsHost + 1) % BIN_WS.length; wsFail(); };
    ws.onerror = () => { };
  }
  let wsRetry = 0;
  function wsFail() {
    ws = null;
    startBinPoll();
    wsRetry++;
    setTimeout(connectWS, Math.min(30000, 2000 * wsRetry));
  }
  function startBinPoll() {
    if (binPollTimer) return;
    binPollTimer = setInterval(async () => {
      try {
        const syms = cryptos.map(a => a.bin).concat(['EURUSDT']);
        const arr = await binREST('/api/v3/ticker/24hr?type=MINI&symbols=' + encodeURIComponent(JSON.stringify(syms)), 6000);
        arr.forEach(t => applyBinTicker(t.symbol, t.lastPrice, t.openPrice, t.highPrice, t.lowPrice));
        D.health.binance = 'live';
      } catch (e) {
        if (D.health.binance !== 'coingecko') D.health.binance = 'down';
        startCoinGecko();
      }
      emit('__health');
    }, 5000);
  }
  function stopBinPoll() { if (binPollTimer) { clearInterval(binPollTimer); binPollTimer = null; } }

  // watchdog : si le WebSocket se tait trop longtemps on le relance
  setInterval(() => { if (ws && wsAlive && now() - wsAlive > 30000) { try { ws.close(); } catch (e) { } wsAlive = 0; } }, 10000);

  /* ================= COINGECKO (secours crypto) ================= */
  let cgTimer = null;
  function startCoinGecko() {
    if (cgTimer) return;
    const run = async () => {
      if (D.health.binance === 'live') return;
      try {
        const ids = cryptos.map(a => a.cg).join(',');
        const j = await fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=eur&include_24hr_change=true');
        cryptos.forEach(a => {
          const r = j[a.cg]; if (!r || !r.eur) return;
          const ch = r.eur_24h_change || 0;
          set(a.id, { price: r.eur, prev: r.eur / (1 + ch / 100), ccy: 'EUR', status: 'delayed', closed: false });
        });
        D.health.binance = 'coingecko'; emit('__health');
      } catch (e) { }
    };
    run(); cgTimer = setInterval(run, 60000);
  }

  /* ================= YAHOO FINANCE ================= */
  const PROXIES = [
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
    u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u),
    u => 'https://thingproxy.freeboard.io/fetch/' + u,
    u => u, // direct (fonctionne si le navigateur / une extension autorise le CORS)
  ];
  let proxIdx = +(localStorage.getItem('tradcenter.proxy') || 0) % PROXIES.length;
  const YHOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

  async function yfetch(path, timeout = 10000) {
    let err;
    for (let k = 0; k < PROXIES.length; k++) {
      const i = (proxIdx + k) % PROXIES.length;
      const host = YHOSTS[k % 2];
      try {
        const j = await fetchJSON(PROXIES[i](host + path), timeout);
        if (j && (j.chart || j.spark || typeof j === 'object')) {
          if (i !== proxIdx) { proxIdx = i; try { localStorage.setItem('tradcenter.proxy', i); } catch (e) { } }
          return j;
        }
      } catch (e) { err = e; }
    }
    throw err || new Error('yahoo');
  }
  D.yfetch = yfetch;

  const lastNN = arr => { if (!arr) return null; for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };

  function parseSpark(j) {
    const out = {};
    if (j && j.spark && j.spark.result) {
      j.spark.result.forEach(r => {
        const resp = r.response && r.response[0]; if (!resp) return;
        const m = resp.meta || {};
        const closes = (resp.indicators && resp.indicators.quote && resp.indicators.quote[0] && resp.indicators.quote[0].close) || [];
        const ts = resp.timestamp || [];
        out[r.symbol] = { price: m.regularMarketPrice != null ? m.regularMarketPrice : lastNN(closes), prev: m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, t: (m.regularMarketTime || ts[ts.length - 1] || 0) * 1000, closes, period: m.currentTradingPeriod };
      });
    } else if (j && typeof j === 'object') {
      for (const k in j) {
        const r = j[k]; if (!r || !Array.isArray(r.close)) continue;
        out[k] = { price: lastNN(r.close), prev: r.chartPreviousClose != null ? r.chartPreviousClose : r.previousClose, t: (r.timestamp ? r.timestamp[r.timestamp.length - 1] : 0) * 1000, closes: r.close };
      }
    }
    return out;
  }

  function parseChartMeta(j) {
    const r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r) return null;
    const m = r.meta || {}; const q = r.indicators && r.indicators.quote && r.indicators.quote[0];
    return { price: m.regularMarketPrice != null ? m.regularMarketPrice : lastNN(q && q.close), prev: m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, t: (m.regularMarketTime || 0) * 1000, high: m.regularMarketDayHigh, low: m.regularMarketDayLow, period: m.currentTradingPeriod, closes: q && q.close };
  }

  const yAssets = TC.ASSETS.filter(a => a.src === 'yahoo');
  const fxAssets = TC.ASSETS.filter(a => a.src === 'fx');
  const ySymMap = {}; yAssets.forEach(a => { ySymMap[a.y] = a; });
  const fxSymMap = {}; fxAssets.forEach(a => { fxSymMap[a.y] = a; });

  function isOpen(q) {
    // Marché considéré ouvert si la dernière cotation a moins de 20 minutes
    return q.t && (now() - q.t) < 20 * 60 * 1000;
  }

  function applyYahoo(sym, q) {
    if (!q || q.price == null || !isFinite(q.price)) return;
    if (fxSymMap[sym]) {
      const a = fxSymMap[sym];
      D.fx[a.code] = q.price;
      if (q.prev) D.fxPrev[a.code] = q.prev;
      D.fxStatus = 'live-yahoo';
      updateFxAssets('delayed');
      return;
    }
    const a = ySymMap[sym]; if (!a) return;
    const patch = { price: q.price, prev: q.prev || q.price, status: 'delayed', closed: !isOpen(q), t: q.t || now() };
    if (q.high) patch.high = q.high; if (q.low) patch.low = q.low;
    set(a.id, patch);
  }

  // renvoie 'ok' | 'empty' (le proxy répond mais pas de données) | 'down' (aucun proxy ne répond)
  async function yahooBatch(syms) {
    const qs = 'symbols=' + encodeURIComponent(syms.join(',')) + '&range=1d&interval=5m';
    let reachable = false;
    for (const ver of ['v8', 'v7']) {
      try {
        const j = await yfetch('/' + ver + '/finance/spark?' + qs, 8000);
        reachable = true;
        const out = parseSpark(j);
        if (Object.keys(out).length) { for (const s in out) applyYahoo(s, out[s]); return 'ok'; }
      } catch (e) { }
      if (!reachable) return 'down';
    }
    // dernier recours : un graphique par symbole
    let any = false;
    for (const s of syms) {
      try {
        const j = await yfetch('/v8/finance/chart/' + encodeURIComponent(s) + '?range=1d&interval=5m', 8000);
        const q = parseChartMeta(j); if (q) { applyYahoo(s, q); any = true; }
      } catch (e) { }
    }
    return any ? 'ok' : 'empty';
  }

  let yRunning = false;
  async function pollYahoo() {
    if (yRunning) return; yRunning = true;
    const syms = yAssets.map(a => a.y).concat(fxAssets.map(a => a.y));
    const chunks = []; for (let i = 0; i < syms.length; i += 15) chunks.push(syms.slice(i, i + 15));
    let ok = false;
    for (const c of chunks) {
      const r = await yahooBatch(c);
      if (r === 'ok') ok = true;
      if (r === 'down') break; // aucun proxy joignable : inutile d'insister ce tour-ci
    }
    D.health.yahoo = ok ? 'live' : 'down';
    emit('__health');
    yRunning = false;
  }

  /* ================= DEVISES ================= */
  function updateFxAssets(status) {
    fxAssets.forEach(a => {
      const r = D.fx[a.code]; if (!r) return;
      const prevR = D.fxPrev[a.code] || r;
      const st = status || (D.prices[a.id] && D.prices[a.id].status) || 'delayed';
      set(a.id, { price: 1 / r, prev: 1 / prevR, ccy: 'EUR', status: st === 'cache' ? 'delayed' : st, closed: false });
    });
  }
  D.updateFxAssets = updateFxAssets;

  async function initFX() {
    const codes = ['USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY'];
    const srcs = [
      async () => { const j = await fetchJSON('https://api.frankfurter.dev/v1/latest?base=EUR'); return j.rates; },
      async () => { const j = await fetchJSON('https://api.frankfurter.app/latest?from=EUR'); return j.rates; },
      async () => { const j = await fetchJSON('https://open.er-api.com/v6/latest/EUR'); return j.rates; },
    ];
    for (const s of srcs) {
      try {
        const rates = await s();
        if (rates && rates.USD) {
          codes.forEach(c => { if (rates[c] && D.fxStatus !== 'live-yahoo') D.fx[c] = rates[c]; });
          if (!D.fx.USDT || D.health.binance !== 'live') D.fx.USDT = D.fx.USD;
          D.health.fx = 'live';
          if (D.fxStatus !== 'live-yahoo') { D.fxStatus = 'daily'; updateFxAssets('delayed'); }
          emit('__fx'); emit('__health');
          // cours de la veille pour la variation
          try {
            const d = new Date(Date.now() - 86400000 * 1.5).toISOString().slice(0, 10);
            const j = await fetchJSON('https://api.frankfurter.dev/v1/' + d + '?base=EUR');
            codes.forEach(c => { if (j.rates[c] && !D.fxPrev[c]) D.fxPrev[c] = j.rates[c]; });
            if (D.fxStatus === 'daily') updateFxAssets('delayed');
          } catch (e) { }
          return;
        }
      } catch (e) { }
    }
    D.health.fx = D.fxStatus === 'live-yahoo' ? 'live' : 'down';
    emit('__health');
  }

  /* ================= SIMULATION DE SECOURS ================= */
  const VOL = { crypto: 0.0009, stock: 0.0004, index: 0.00025, commodity: 0.0004, fx: 0.00006 };
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function simTick() {
    TC.ASSETS.forEach(a => {
      const p = D.prices[a.id];
      const realSourceDown =
        (a.src === 'binance' && D.health.binance === 'down') ||
        (a.src === 'yahoo' && D.health.yahoo === 'down') ||
        (a.src === 'fx' && D.health.fx === 'down' && D.health.yahoo === 'down');
      if (!p || p.price == null) {
        if (!realSourceDown) return;
        let ref = a.ref; let ccy = a.ccy;
        if (a.src === 'fx') { ref = 1 / (D.fx[a.code] || 1); ccy = 'EUR'; }
        set(a.id, { price: ref, prev: ref, ccy, status: 'sim', closed: false });
        return;
      }
      if (p.status === 'sim' || (p.status === 'cache' && realSourceDown)) {
        const np = p.price * Math.exp(VOL[a.cat] * gauss() * 2);
        set(a.id, { price: np, status: 'sim', closed: false, prev: p.prev || p.price });
      }
    });
  }

  D.anySim = () => Object.values(D.prices).some(p => p.status === 'sim');

  /* ================= HISTORIQUE (graphiques) ================= */
  TC.TF = {
    '1H': { label: '1H', bin: ['1m', 120], y: ['1d', '1m'], sec: 60 },
    '1J': { label: '1J', bin: ['5m', 288], y: ['1d', '5m'], sec: 300 },
    '1S': { label: '1S', bin: ['1h', 168], y: ['5d', '30m'], sec: 3600 },
    '1M': { label: '1M', bin: ['4h', 180], y: ['1mo', '60m'], sec: 14400 },
    '6M': { label: '6M', bin: ['1d', 182], y: ['6mo', '1d'], sec: 86400 },
    '1A': { label: '1A', bin: ['1d', 365], y: ['1y', '1d'], sec: 86400 },
    '5A': { label: '5A', bin: ['1w', 260], y: ['5y', '1wk'], sec: 604800 },
  };

  D.history = async function (id, tfKey) {
    const a = TC.assetById[id]; const tf = TC.TF[tfKey];
    const p = D.prices[id];
    if (a.src === 'binance' && D.health.binance !== 'down' && D.health.binance !== 'coingecko') {
      try {
        const k = await binREST('/api/v3/klines?symbol=' + a.bin + '&interval=' + tf.bin[0] + '&limit=' + tf.bin[1]);
        const f = 1 / (D.fx.USDT || D.fx.USD);
        return { real: true, bars: k.map(r => ({ time: Math.floor(r[0] / 1000), open: r[1] * f, high: r[2] * f, low: r[3] * f, close: r[4] * f })) };
      } catch (e) { }
    }
    if (a.src === 'yahoo' || a.src === 'fx') {
      try {
        const j = await yfetch('/v8/finance/chart/' + encodeURIComponent(a.y) + '?range=' + tf.y[0] + '&interval=' + tf.y[1], 12000);
        const r = j.chart.result[0]; const q = r.indicators.quote[0];
        const bars = [];
        const inv = a.src === 'fx';
        const f = inv ? 1 : D.toEUR(1, a.ccy);
        r.timestamp.forEach((t, i) => {
          let o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
          if (o == null || c == null || h == null || l == null) return;
          if (inv) { [o, h, l, c] = [1 / o, 1 / l, 1 / h, 1 / c]; }
          bars.push({ time: t, open: o * f, high: h * f, low: l * f, close: c * f });
        });
        if (bars.length > 2) return { real: true, bars };
      } catch (e) { }
    }
    // historique simulé (signalé dans l'interface)
    const cur = D.eur(id) || 1; const n = tf.bin[1]; const vol = VOL[a.cat] * Math.sqrt(tf.sec / 3) * 1.2;
    const bars = []; let c = cur; const end = Math.floor(now() / 1000 / tf.sec) * tf.sec;
    for (let i = 0; i < n; i++) {
      const o = c / Math.exp(vol * gauss());
      const h = Math.max(o, c) * (1 + Math.abs(gauss()) * vol * 0.5);
      const l = Math.min(o, c) * (1 - Math.abs(gauss()) * vol * 0.5);
      bars.unshift({ time: end - i * tf.sec, open: o, high: h, low: l, close: c });
      c = o;
    }
    return { real: false, bars };
  };

  // Prix à un instant donné (pour résoudre les paris de façon exacte)
  D.priceAt = async function (id, ts) {
    const a = TC.assetById[id];
    if (a.src === 'binance' && D.health.binance === 'live') {
      try {
        const k = await binREST('/api/v3/klines?symbol=' + a.bin + '&interval=1m&startTime=' + Math.floor(ts / 60000) * 60000 + '&limit=1', 6000);
        if (k && k[0]) return +k[0][1] / (D.fx.USDT || D.fx.USD);
      } catch (e) { }
    }
    return null;
  };

  /* ================= DÉMARRAGE ================= */
  D.start = function () {
    loadCache();
    // le cache s'affiche immédiatement, les sources réelles prennent le relais
    Object.keys(D.prices).forEach(emit);
    initBinance();
    initFX();
    pollYahoo();
    setInterval(pollYahoo, 45000);
    setInterval(initFX, 30 * 60000);
    setInterval(saveCache, 20000);
    window.addEventListener('beforeunload', saveCache);
    // après 15 s, ce qui n'a pas pu être chargé passe en simulation signalée
    setTimeout(() => {
      ['binance', 'yahoo', 'fx'].forEach(k => { if (D.health[k] === 'loading') D.health[k] = 'down'; });
      emit('__health');
      simTick();
      setInterval(simTick, 2000);
    }, 15000);
  };
})();

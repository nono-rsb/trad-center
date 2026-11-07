/* Trad Center — graphique (TradingView Lightweight Charts, avec repli canvas) */
(function () {
  const C = TC.Chart = {};
  const TZ = -new Date().getTimezoneOffset() * 60; // affichage à l'heure locale
  let chart = null, series = null, type = 'candle', el = null, bars = [], tfSec = 300, lines = [], fallback = null;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function precisionFor(v) {
    const a = Math.abs(v || 1);
    if (a >= 1000) return 2; if (a >= 1) return a >= 100 ? 2 : 3;
    return Math.min(10, -Math.floor(Math.log10(a)) + 3);
  }

  C.init = function (container) {
    el = container;
    if (window.LightweightCharts) {
      chart = LightweightCharts.createChart(el, {
        autoSize: true,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: css('--muted') || '#8b93a7', fontFamily: 'Inter, system-ui, sans-serif' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
        timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
        crosshair: { mode: 0 },
        localization: { locale: 'fr-FR', priceFormatter: p => TC.fmt.num(p, precisionFor(p)) + ' €' },
      });
      makeSeries();
    } else {
      fallback = document.createElement('canvas');
      fallback.className = 'fallback-chart';
      el.appendChild(fallback);
      new ResizeObserver(drawFallback).observe(el);
    }
  };

  function makeSeries() {
    if (series) { chart.removeSeries(series); lines = []; }
    const up = css('--up') || '#16c784', down = css('--down') || '#ea3943';
    if (type === 'candle') series = chart.addCandlestickSeries({ upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
    else series = chart.addAreaSeries({ lineColor: css('--accent') || '#f0b90b', topColor: 'rgba(240,185,11,0.35)', bottomColor: 'rgba(240,185,11,0.02)', lineWidth: 2 });
  }

  const shift = b => ({ time: b.time + TZ, open: b.open, high: b.high, low: b.low, close: b.close, value: b.close });

  C.setType = function (t) { type = t; if (chart) { makeSeries(); C.setData(bars, tfSec); } else drawFallback(); };

  C.setData = function (data, sec) {
    bars = data.slice(); tfSec = sec;
    if (chart) {
      const p = precisionFor(bars.length ? bars[bars.length - 1].close : 1);
      series.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: Math.pow(10, -p) } });
      series.setData(bars.map(shift));
      chart.timeScale().fitContent();
    } else drawFallback();
  };

  C.tick = function (price) {
    if (!bars.length || price == null) return;
    const nowSec = Math.floor(Date.now() / 1000);
    let last = bars[bars.length - 1];
    if (nowSec >= last.time + tfSec) {
      const t = Math.floor(nowSec / tfSec) * tfSec;
      last = { time: t, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price };
      bars.push(last);
    } else {
      last.close = price; last.high = Math.max(last.high, price); last.low = Math.min(last.low, price);
    }
    if (chart) { try { series.update(shift(last)); } catch (e) { } } else drawFallback();
  };

  C.setLines = function (defs) {
    if (!chart) return;
    lines.forEach(l => { try { series.removePriceLine(l); } catch (e) { } });
    lines = defs.map(d => series.createPriceLine({ price: d.price, color: d.color, lineWidth: 1, lineStyle: d.style == null ? 2 : d.style, axisLabelVisible: true, title: d.title }));
  };

  function drawFallback() {
    if (!fallback) return;
    const w = el.clientWidth, h = el.clientHeight, dpr = devicePixelRatio || 1;
    fallback.width = w * dpr; fallback.height = h * dpr; fallback.style.width = w + 'px'; fallback.style.height = h + 'px';
    const ctx = fallback.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    if (bars.length < 2) return;
    const cl = bars.map(b => b.close), mn = Math.min(...bars.map(b => b.low)), mx = Math.max(...bars.map(b => b.high)), r = mx - mn || 1;
    const pad = 8, rw = 70, X = i => pad + i / (bars.length - 1) * (w - pad * 2 - rw), Y = v => pad + (1 - (v - mn) / r) * (h - pad * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.fillStyle = css('--muted'); ctx.font = '11px Inter, sans-serif';
    for (let i = 0; i <= 4; i++) { const v = mn + r * i / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - rw, y); ctx.stroke(); ctx.fillText(TC.fmt.num(v, precisionFor(v)), w - rw + 6, y + 4); }
    const up = cl[cl.length - 1] >= cl[0];
    const col = up ? (css('--up') || '#16c784') : (css('--down') || '#ea3943');
    if (type === 'candle') {
      const bw = Math.max(1, (w - pad * 2 - rw) / bars.length * 0.7);
      bars.forEach((b, i) => { const c = b.close >= b.open ? css('--up') : css('--down'); ctx.strokeStyle = c; ctx.fillStyle = c; const x = X(i); ctx.beginPath(); ctx.moveTo(x, Y(b.high)); ctx.lineTo(x, Y(b.low)); ctx.stroke(); const y1 = Y(Math.max(b.open, b.close)), y2 = Y(Math.min(b.open, b.close)); ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1)); });
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
      ctx.beginPath(); cl.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.lineTo(X(cl.length - 1), h); ctx.lineTo(X(0), h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    }
  }

  /* ---------- Graphique du patrimoine ---------- */
  let nwChart = null, nwSeries = null, nwCanvas = null, nwEl = null, nwData = [];
  C.nw = function (container, data) {
    nwData = data;
    if (window.LightweightCharts) {
      if (!nwChart || nwEl !== container) {
        if (nwChart) { try { nwChart.remove(); } catch (e) { } }
        nwEl = container; container.innerHTML = '';
        nwChart = LightweightCharts.createChart(container, {
          autoSize: true,
          layout: { background: { type: 'solid', color: 'transparent' }, textColor: css('--muted') },
          grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
          rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true },
          localization: { locale: 'fr-FR', priceFormatter: p => TC.fmt.eur(p, true) },
          handleScroll: false, handleScale: false,
        });
        nwSeries = nwChart.addAreaSeries({ lineColor: css('--accent'), topColor: 'rgba(240,185,11,0.35)', bottomColor: 'rgba(240,185,11,0.02)', lineWidth: 2 });
      }
      const seen = new Set(); const pts = [];
      data.forEach(([t, v]) => { const tt = t + TZ; if (!seen.has(tt)) { seen.add(tt); pts.push({ time: tt, value: v }); } });
      nwSeries.setData(pts); nwChart.timeScale().fitContent();
    } else {
      if (!nwCanvas || nwEl !== container) { nwEl = container; container.innerHTML = ''; nwCanvas = document.createElement('canvas'); container.appendChild(nwCanvas); }
      const w = container.clientWidth, h = container.clientHeight; nwCanvas.width = w; nwCanvas.height = h;
      const ctx = nwCanvas.getContext('2d'); if (data.length < 2) return;
      const vs = data.map(d => d[1]), mn = Math.min(...vs), mx = Math.max(...vs), r = mx - mn || 1;
      ctx.beginPath(); vs.forEach((v, i) => { const x = i / (vs.length - 1) * w, y = h - 6 - (v - mn) / r * (h - 12); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.stroke();
    }
  };
})();

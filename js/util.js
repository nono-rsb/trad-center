/* Trad Center — utilitaires : formatage, sons, confettis, notifications */
(function () {
  const nf = (min, max) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
  const cache = {};
  const N = (min, max) => cache[min + '-' + max] || (cache[min + '-' + max] = nf(min, max));

  function digitsFor(v) {
    const a = Math.abs(v);
    if (a === 0) return 2;
    if (a >= 1000) return 2;
    if (a >= 1) return a >= 100 ? 2 : 3;
    // petits prix (PEPE, SHIB…) : 4 chiffres significatifs
    return Math.min(12, Math.max(4, -Math.floor(Math.log10(a)) + 3));
  }
  TC.fmt = {
    eur(v, short) {
      if (v == null || !isFinite(v)) return '—';
      if (short && Math.abs(v) >= 1e6) return TC.fmt.compact(v) + ' €';
      const d = Math.abs(v) >= 1 || v === 0 ? 2 : digitsFor(v);
      return N(Math.min(2, d), d).format(v) + ' €';
    },
    price(v, ccy) {
      if (v == null || !isFinite(v)) return '—';
      const d = digitsFor(v);
      const sym = { EUR: '€', USD: '$', USDT: '$', GBP: '£', GBp: 'p', JPY: '¥', CHF: 'CHF' }[ccy] || ccy || '€';
      return N(Math.min(2, d), d).format(v) + ' ' + sym;
    },
    num(v, d = 2) { return v == null || !isFinite(v) ? '—' : N(d, d).format(v); },
    qty(v) {
      if (v == null || !isFinite(v)) return '—';
      const a = Math.abs(v);
      const d = a >= 1000 ? 2 : a >= 1 ? 4 : Math.min(10, Math.max(6, -Math.floor(Math.log10(a || 1)) + 4));
      return N(0, d).format(v);
    },
    pct(v, sign = true) { if (v == null || !isFinite(v)) return '—'; return (sign && v > 0 ? '+' : '') + N(2, 2).format(v) + ' %'; },
    compact(v) { return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 }).format(v); },
    dur(ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
      if (h) return `${h} h ${String(m).padStart(2, '0')}`;
      return `${m}:${String(ss).padStart(2, '0')}`;
    },
    time(t) { return new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); },
  };

  /* ---------- Saison : thème de Noël du 1er au 31 décembre (aperçu : ?theme=noel) ---------- */
  TC.season = (() => {
    let q = null, j = 0; try { const u = new URLSearchParams(location.search); q = u.get('theme'); j = +u.get('jour') || 0; } catch (e) { }
    const now = new Date();
    // aperçu : ?theme=noel&jour=N (rien n'est crédité)
    if (q === 'noel') return { noel: true, preview: true, day: j >= 1 && j <= 31 ? j : (now.getMonth() === 11 ? now.getDate() : 1) };
    return { noel: now.getMonth() === 11, preview: false, get day() { const d = new Date(); return d.getMonth() === 11 ? d.getDate() : 0; } };
  })();
  if (TC.season.noel) document.documentElement.classList.add('noel');

  TC.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  TC.$ = (s, r = document) => r.querySelector(s);
  TC.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Sons (WebAudio, aucun fichier) ---------- */
  let ac = null;
  function tone(freq, start, dur, type = 'sine', vol = 0.08) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, ac.currentTime + start);
    g.gain.linearRampToValueAtTime(vol, ac.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(ac.currentTime + start); o.stop(ac.currentTime + start + dur + 0.05);
  }
  TC.sound = function (kind) {
    if (!TC.Game || !TC.Game.state.sound) return;
    try { if (navigator.vibrate && kind !== 'click') navigator.vibrate(kind === 'lose' ? [40, 60, 40] : kind === 'cash' || kind === 'ach' || kind === 'win' ? [20, 40, 20, 40, 60] : 15); } catch (e) { }
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { return; }
    if (kind === 'kaching') return kaching();
    const seq = {
      buy: [[523, 0, .12], [784, .08, .18]],
      sell: [[784, 0, .12], [523, .08, .18]],
      win: [[523, 0, .1], [659, .08, .1], [784, .16, .1], [1047, .24, .3]],
      lose: [[330, 0, .2, 'sawtooth', .05], [220, .15, .35, 'sawtooth', .05]],
      cash: [[1319, 0, .08, 'square', .04], [1760, .06, .08, 'square', .04], [2093, .12, .25, 'triangle', .06]],
      click: [[900, 0, .04, 'square', .02]],
      ach: [[784, 0, .1], [988, .1, .1], [1175, .2, .1], [1568, .3, .4]],
    }[kind] || [];
    seq.forEach(s => tone(s[0], s[1], s[2], s[3], s[4]));
  };

  /* ---------- « Ka-ching » : tiroir-caisse + clochette + pièces (son original synthétisé) ---------- */
  function kachingInto(C, out) {
    const noise = dur => { const n = Math.floor(C.sampleRate * dur), b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const src = C.createBufferSource(); src.buffer = b; return src; };
    const burst = (t, dur, freq, q, vol) => { // bruit filtré : mécanisme, pièces
      const src = noise(dur), f = C.createBiquadFilter(), g = C.createGain();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(out); src.start(t); src.stop(t + dur + 0.02);
    };
    const bell = (t, base, vol, dur) => { // clochette métallique : partiels inharmoniques
      [[1, 1], [2.76, 0.55], [5.4, 0.3], [8.93, 0.18], [1.5, 0.25]].forEach(([r, a]) => {
        const o = C.createOscillator(), g = C.createGain();
        o.type = 'sine'; o.frequency.value = base * r;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * a, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur / Math.sqrt(r));
        o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
      });
    };
    const t = C.currentTime + 0.02;
    burst(t, 0.06, 1800, 1.2, 0.5);          // « ka » : le tiroir qui s'ouvre
    burst(t + 0.015, 0.09, 600, 2, 0.35);
    bell(t + 0.07, 1568, 0.22, 1.4);          // « ching » : deux coups de clochette
    bell(t + 0.17, 2093, 0.18, 1.6);
    for (let i = 0; i < 7; i++) burst(t + 0.2 + i * 0.045 + Math.random() * 0.02, 0.05, 5000 + Math.random() * 3000, 8, 0.12); // pièces
  }
  TC.kachingInto = kachingInto;
  let master = null;
  function kaching() {
    if (!master) { master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination); }
    kachingInto(ac, master);
  }

  /* ---------- Notifications ---------- */
  TC.toast = function (msg, type = 'info', ms = 3800) {
    const box = TC.$('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
  };

  /* ---------- Fenêtre modale ---------- */
  TC.modal = function (html, opts = {}) {
    const m = TC.$('#modal');
    m.innerHTML = `<div class="modal-card ${opts.cls || ''}"><button class="modal-x" aria-label="Fermer">✕</button>${html}</div>`;
    m.classList.add('open');
    const close = () => { m.classList.remove('open'); m.innerHTML = ''; if (opts.onClose) opts.onClose(); };
    m.onclick = e => { if (e.target === m || e.target.closest('.modal-x') || e.target.closest('[data-close]')) close(); };
    return { el: m, close };
  };
  TC.confirm = function (title, body, okLabel = 'Confirmer', okCls = 'btn-primary') {
    return new Promise(res => {
      let done = false;
      const md = TC.modal(`<h2>${title}</h2><div class="modal-body">${body}</div>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn ${okCls}" data-ok>${okLabel}</button></div>`,
        { onClose: () => { if (!done) res(false); } });
      md.el.querySelector('[data-ok]').onclick = () => { done = true; md.close(); res(true); };
    });
  };

  /* ---------- Confettis ---------- */
  TC.confetti = function (n = 160) {
    const c = TC.$('#confetti'); const ctx = c.getContext('2d');
    c.width = innerWidth; c.height = innerHeight;
    const cols = ['#ffd166', '#06d6a0', '#ef476f', '#118ab2', '#f78c6b', '#ffffff', '#c77dff'];
    const ps = Array.from({ length: n }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight / 3, vx: (Math.random() - .5) * 16, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 3, c: cols[Math.random() * cols.length | 0], a: Math.random() * 6, va: (Math.random() - .5) * .4 }));
    let f = 0;
    (function loop() {
      ctx.clearRect(0, 0, c.width, c.height);
      ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .35; p.vx *= .99; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); });
      if (++f < 200) requestAnimationFrame(loop); else ctx.clearRect(0, 0, c.width, c.height);
    })();
  };

  /* ---------- Mini graphique (sparkline SVG) ---------- */
  TC.spark = function (arr, w = 64, h = 22) {
    if (!arr || arr.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
    const mn = Math.min(...arr), mx = Math.max(...arr), r = mx - mn || 1;
    const pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`).join(' ');
    const up = arr[arr.length - 1] >= arr[0];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${up ? 'var(--up)' : 'var(--down)'}" stroke-width="1.5" points="${pts}"/></svg>`;
  };
})();

/* Trad Center — Trad City en 3D (Three.js r149, chargé seulement quand on ouvre l'onglet Ville)
 * Bâtiments modélisés selon le patrimoine de chaque joueur, commerces autour, monuments, voitures qui roulent,
 * jour / nuit à l'heure de Paris, neige en décembre. Un doigt : tourner. Deux doigts : zoom et déplacement. Toucher : ouvrir.
 */
(function () {
  const V = TC.City3D = { ready: false, failed: false };
  let T = null; // THREE
  let renderer, scene, camera, canvas, host, clock;
  let world = null, sig = '', running = false, onPick = null;
  const pickables = [], animated = [], cars = [], labels = [], blinkers = [];
  let snow = null, stars = null, sun, hemi, night = false, forcedNight = null;
  const S = 32, BLOCK = 24; // pas de la grille (bloc + route), taille d'un bloc
  let N = 3, HALF = 48, lotPos = {};

  /* ---------- Chargement ---------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); }); }
  function fail(msg) { console.warn('3D', msg); V.error = msg; V.failed = true; running = false; if (V.onFail) V.onFail(msg); }
  V.retry = () => { V.failed = false; V.error = null; sig = ''; };
  V.drawn = () => !!(renderer && renderer.info.render.calls > 0);
  // test fait une seule fois : chaque test crée un contexte WebGL, et iOS coupe les plus anciens au-delà d'une limite
  let sup = null;
  V.supported = function () {
    if (sup != null) return sup;
    try {
      const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl');
      sup = !!gl; const ext = gl && gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    } catch (e) { sup = false; }
    return sup;
  };
  let loading = null;
  V.load = function () {
    if (V.ready) return Promise.resolve(true); if (V.failed) return Promise.resolve(false);
    return loading || (loading = (async () => {
      try {
        if (!window.THREE) await loadScript('js/vendor/three.min.js');
        if (!window.THREE) throw new Error('moteur 3D non chargé');
        T = window.THREE; init(); V.ready = true; return true;
      } catch (e) { console.warn('3D', e); V.error = String(e && e.message || e); V.failed = true; loading = null; return false; }
    })());
  };

  /* ---------- Utilitaires ---------- */
  function rng(seed) { let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const mats = {};
  function M(key, opts) { return mats[key] || (mats[key] = new T.MeshStandardMaterial(opts)); }
  function col(c, extra) { return M('c' + c + (extra ? JSON.stringify(extra) : ''), Object.assign({ color: c, roughness: .75, metalness: .05 }, extra || {})); }
  function mesh(geo, mat, x, y, z, shadow = true) { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (shadow) { m.castShadow = true; m.receiveShadow = true; } return m; }
  const box = (w, h, d, mat, x, y, z) => mesh(new T.BoxGeometry(w, h, d), mat, x, (y || 0) + h / 2, z);
  const cyl = (rt, rb, h, mat, x, y, z, seg = 16) => mesh(new T.CylinderGeometry(rt, rb, h, seg), mat, x, (y || 0) + h / 2, z);
  function gable(w, h, d, mat, x, y, z) { // toit à deux pans
    const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
    const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
    return mesh(g, mat, x, y, z);
  }
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; }

  // façades à fenêtres : texture de jour + carte des fenêtres allumées la nuit
  const facades = {};
  function facade(kind) {
    if (facades[kind]) return facades[kind];
    const r = rng(kind);
    const glass = kind === 'glass' || kind === 'gold';
    const base = { glass: '#5d86b8', gold: '#b38a3c', brick: '#b8664a', white: '#eceae4', cream: '#e8d6b0', grey: '#9aa3ad' }[kind] || '#ccc';
    const win = glass ? (kind === 'gold' ? '#f1d18a' : '#a9d2ff') : '#3b5878';
    const map = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      if (glass) { g.fillStyle = win; for (let y = 2; y < h; y += 8) g.fillRect(0, y, w, 6); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, 3); }
      else { g.fillStyle = win; for (let y = 6; y < h; y += 16) for (let x = 6; x < w; x += 16) g.fillRect(x, y, 8, 9); }
    });
    const em = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      if (glass) { for (let y = 2; y < h; y += 8) for (let x = 0; x < w; x += 8) if (r() < .45) { g.fillStyle = r() < .8 ? '#ffd889' : '#bfe3ff'; g.fillRect(x, y, 8, 6); } }
      else { for (let y = 6; y < h; y += 16) for (let x = 6; x < w; x += 16) if (r() < .55) { g.fillStyle = '#ffd27a'; g.fillRect(x, y, 8, 9); } }
    });
    [map, em].forEach(t => { t.wrapS = t.wrapT = T.RepeatWrapping; });
    return (facades[kind] = { map, em, glass });
  }
  const winMats = [];
  function windowed(kind, w, h, d) { // matériau de façade adapté à la taille
    const f = facade(kind);
    const map = f.map.clone(), em = f.em.clone(); map.needsUpdate = em.needsUpdate = true;
    const sx = Math.max(1, Math.round(w / 4)), sy = Math.max(1, Math.round(h / 4));
    map.repeat.set(sx, sy); em.repeat.set(sx, sy);
    const m = new T.MeshStandardMaterial({ map, emissiveMap: em, emissive: night ? 0xffffff : 0x000000, emissiveIntensity: .9, roughness: f.glass ? .25 : .8, metalness: f.glass ? .55 : .05 });
    winMats.push(m); return m;
  }
  function tower(kind, w, h, d, x, y, z) {
    const side = windowed(kind, w, h, d), top = col(kind === 'glass' ? 0x3d4f66 : kind === 'gold' ? 0x6b5320 : 0x707780);
    const m = mesh(new T.BoxGeometry(w, h, d), [side, side, top, top, side, side], x, (y || 0) + h / 2, z);
    return m;
  }

  function label(text, opts = {}) {
    const fs = 44, pad = 18;
    const c = document.createElement('canvas'); const g = c.getContext('2d');
    g.font = `800 ${fs}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    const w = Math.ceil(g.measureText(text).width) + pad * 2, h = fs + pad * 1.3;
    c.width = w; c.height = h;
    g.font = `800 ${fs}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    const bg = opts.bg || 'rgba(20,12,35,.78)';
    g.fillStyle = bg; const r = h / 2; g.beginPath(); g.moveTo(r, 0); g.lineTo(w - r, 0); g.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(r, h); g.arc(r, r, r, Math.PI / 2, Math.PI * 1.5); g.fill();
    if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 5; g.stroke(); }
    g.fillStyle = opts.color || '#fff'; g.textBaseline = 'middle'; g.fillText(text, pad, h / 2 + 2);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    const k = (opts.scale || 1) * 0.055; sp.scale.set(w * k, h * k, 1); sp.renderOrder = 10;
    sp.userData.base = sp.scale.clone();
    return sp;
  }
  function emojiSprite(e, size = 4) {
    const t = canvasTex(128, 128, g => { g.font = '100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 72); });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true })); sp.scale.set(size, size, 1); return sp;
  }

  /* ---------- Bâtiments des joueurs (selon le palier de patrimoine) ---------- */
  const BUILD = [
    function tent(g, r) { // 0 : tente + feu de camp
      const c = mesh(new T.ConeGeometry(3, 3.6, 4), col([0xff8a3d, 0x4fb3ff, 0x9b5de5][r() * 3 | 0]), 0, 1.8, 0); c.rotation.y = Math.PI / 4; g.add(c);
      g.add(cyl(.5, .6, .3, col(0x5b3a1e), 3.5, 0, 2));
      const f = mesh(new T.ConeGeometry(.45, 1, 6), col(0xffa020, { emissive: 0xff6a00, emissiveIntensity: 1 }), 3.5, .8, 2, false); g.add(f); animated.push(t => { f.scale.y = 1 + Math.sin(t * 9) * .2; });
      return 4.5;
    },
    function cabin(g, r) { // 1 : cabane en bois
      g.add(box(5, 3.2, 4.5, col(0x8a5a32))); g.add(gable(6, 2.2, 5.3, col(0x5b3a1e), 0, 3.2, 0));
      g.add(box(1.1, 2, .1, col(0x3b2412), 0, 0, 2.3)); g.add(box(.9, .9, .1, col(0xffe08a, { emissive: night ? 0xffb347 : 0, emissiveIntensity: .8 }), 1.6, 1.4, 2.3));
      return 6.2;
    },
    function house(g, r) { // 2 : maison avec toit rouge et jardin
      const wall = col([0xf3efe6, 0xf6e2c0, 0xdde8f0][r() * 3 | 0]);
      g.add(box(7, 4.2, 6, wall)); g.add(gable(7.8, 3, 6.6, col([0xc0392b, 0x8e3b2f, 0x34495e][r() * 3 | 0]), 0, 4.2, 0));
      g.add(box(1.3, 2.4, .12, col(0x6d3f22), 0, 0, 3.02));
      [-2.3, 2.3].forEach(x => g.add(box(1.3, 1.2, .12, col(0x9fd0ff, { emissive: night ? 0xffc867 : 0, emissiveIntensity: .7 }), x, 1.8, 3.02)));
      g.add(box(1, 2.2, 1, col(0x8a8f96), 2.2, 5.2, -1.2));
      hedge(g, 9.5);
      return 8.5;
    },
    function villa(g, r) { // 3 : villa moderne + piscine + palmiers
      const w = col(0xf8f8f5);
      g.add(box(9, 3.4, 6, w, -.5, 0, -1.5)); g.add(box(5.5, 3.2, 5, w, 1.5, 3.4, -2));
      g.add(box(9.6, .35, 6.6, col(0x2d3436), -.5, 3.4, -1.5)); g.add(box(6, .35, 5.6, col(0x2d3436), 1.5, 6.6, -2));
      g.add(box(8.6, 2.4, .1, col(0x7fb7e6, { metalness: .6, roughness: .15, emissive: night ? 0xffd28a : 0, emissiveIntensity: .5 }), -.5, .4, 1.52));
      const pool = mesh(new T.BoxGeometry(6, .2, 3), col(0x2ec4ff, { emissive: 0x0a5a8a, emissiveIntensity: .35, roughness: .1 }), -1, .12, 4.2, false); g.add(pool);
      [[4.5, 4.5], [-5, 5]].forEach(([x, z]) => palm(g, x, z));
      return 9;
    },
    function apartments(g, r) { // 4 : immeuble
      const kind = ['brick', 'cream', 'white'][r() * 3 | 0];
      g.add(tower(kind, 9, 15, 8)); g.add(box(9.6, .5, 8.6, col(0x5f6670), 0, 15, 0));
      g.add(box(2.5, 2, 2.5, col(0x8a8f96), 2, 15.5, -1.5)); g.add(cyl(.9, .9, 2.2, col(0x6d7680), -2.5, 15.5, 1.5, 10));
      g.add(box(3, 2.4, .2, col(0x2d3436), 0, 0, 4.05));
      return 18;
    },
    function office(g, r) { // 5 : tour avec retraits
      g.add(tower('grey', 10, 18, 10)); g.add(tower('glass', 8, 12, 8, 0, 18, 0)); g.add(box(5, 2, 5, col(0x4b5563), 0, 30, 0));
      g.add(box(4, 3, .2, col(0x111827), 0, 0, 5.05));
      return 33;
    },
    function skyscraper(g, r) { // 6 : gratte-ciel + antenne clignotante
      g.add(tower('glass', 11, 26, 11)); g.add(tower('glass', 9, 16, 9, 0, 26, 0)); g.add(tower('glass', 6.5, 10, 6.5, 0, 42, 0));
      g.add(cyl(.18, .3, 9, col(0xb0b8c4, { metalness: .8, roughness: .3 }), 0, 52, 0, 8));
      const b = mesh(new T.SphereGeometry(.5, 10, 8), new T.MeshBasicMaterial({ color: 0xff2a2a }), 0, 61.3, 0, false); g.add(b); blinkers.push(b);
      g.add(box(5, 3.5, .2, col(0x0f172a), 0, 0, 5.55));
      return 63;
    },
    function palace(g, r) { // 7 : palais à coupoles dorées
      const stone = col(0xf1e6cf), gold = col(0xe8b923, { metalness: .85, roughness: .25 });
      g.add(box(13, .8, 11, col(0xd8ccb2))); g.add(box(11, 7, 9, stone, 0, .8, 0)); g.add(box(11.6, .6, 9.6, col(0xcab78e), 0, 7.8, 0));
      for (let i = -2; i <= 2; i++) g.add(cyl(.38, .42, 6.2, col(0xffffff), i * 2.2, .8, 4.9, 12));
      g.add(cyl(2.6, 2.6, 2.2, stone, 0, 8.4, 0, 24));
      const dome = mesh(new T.SphereGeometry(2.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), gold, 0, 10.6, 0); g.add(dome);
      g.add(cyl(.12, .12, 2, gold, 0, 13.2, 0, 6));
      [[-5.5, -4.5], [5.5, -4.5], [-5.5, 4.5], [5.5, 4.5]].forEach(([x, z]) => { g.add(cyl(1, 1, 9, stone, x, 0, z, 14)); g.add(mesh(new T.ConeGeometry(1.25, 2.6, 14), gold, x, 10.3, z)); });
      return 15.5;
    },
    function billionaire(g, r) { // 8 : tour torsadée dorée + flèche
      const n = 26, kind = 'gold';
      for (let i = 0; i < n; i++) { const s = 10 - i * .17; const sl = tower(i % 2 ? kind : 'glass', s, 3.2, s, 0, i * 3.2, 0); sl.rotation.y = i * .07; g.add(sl); }
      const top = n * 3.2;
      g.add(mesh(new T.ConeGeometry(2.4, 14, 8), col(0xf5d061, { metalness: .9, roughness: .2 }), 0, top + 7, 0));
      const b = mesh(new T.SphereGeometry(.55, 10, 8), new T.MeshBasicMaterial({ color: 0xff3030 }), 0, top + 14.3, 0, false); g.add(b); blinkers.push(b);
      return top + 16;
    },
  ];
  function hedge(g, s) { const m = col(0x2e8b3a); [[0, s / 2], [0, -s / 2]].forEach(([x, z]) => g.add(box(s, .8, .5, m, x, 0, z))); [[s / 2, 0], [-s / 2, 0]].forEach(([x, z]) => g.add(box(.5, .8, s, m, x, 0, z))); }
  function palm(g, x, z) {
    const t = cyl(.22, .32, 5, col(0x8b6b45), x, 0, z, 8); t.rotation.z = .08; g.add(t);
    const leaf = col(0x2fa84f);
    for (let i = 0; i < 6; i++) { const l = box(3.2, .12, .8, leaf, 0, 0, 0); l.position.set(x + Math.cos(i) * 1.3, 5, z + Math.sin(i) * 1.3); l.rotation.y = -i; l.rotation.z = -.35; g.add(l); }
  }
  function tree(g, x, z, s = 1, xmas) {
    g.add(cyl(.25 * s, .35 * s, 1.6 * s, col(0x6b4a2b), x, 0, z, 8));
    const leaf = col(xmas ? 0x1f6f3a : [0x3fa34d, 0x2f8f46, 0x58b85c][Math.abs(x * 7 + z * 3 | 0) % 3]);
    if (xmas) { for (let i = 0; i < 3; i++) g.add(mesh(new T.ConeGeometry((2.4 - i * .6) * s, 2.6 * s, 10), leaf, x, (1.6 + i * 1.5 + 1.3) * s, z)); return; }
    g.add(mesh(new T.SphereGeometry(1.5 * s, 10, 8), leaf, x, 2.6 * s, z));
  }

  /* ---------- Voitures 3D ---------- */
  function car(color, sport) {
    const g = new T.Group();
    const paint = col(color, { metalness: .6, roughness: .3 }), glass = col(0x1b2836, { metalness: .5, roughness: .1 }), tire = col(0x151515);
    if (sport) {
      g.add(box(2.2, .6, 4.6, paint, 0, .35, 0));
      const cab = box(1.8, .55, 2, glass, 0, .95, -.2); g.add(cab);
      g.add(box(2.2, .12, .5, paint, 0, 1.05, -2.1)); // aileron
    } else {
      g.add(box(2, .8, 4.2, paint, 0, .35, 0)); g.add(box(1.8, .75, 2.3, glass, 0, 1.15, -.2));
    }
    const wg = new T.CylinderGeometry(.42, .42, .35, 14);
    [[-1.05, 1.4], [1.05, 1.4], [-1.05, -1.4], [1.05, -1.4]].forEach(([x, z]) => { const w = new T.Mesh(wg, tire); w.rotation.z = Math.PI / 2; w.position.set(x, .42, z); g.add(w); });
    const hl = new T.MeshBasicMaterial({ color: 0xfff6cc }), tl = new T.MeshBasicMaterial({ color: 0xff2020 });
    [-.65, .65].forEach(x => { g.add(mesh(new T.BoxGeometry(.4, .18, .05), hl, x, .6, 2.12, false)); g.add(mesh(new T.BoxGeometry(.4, .16, .05), tl, x, .6, -2.12, false)); });
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  const CAR_COLORS = [0xd62828, 0xf77f00, 0xfcbf49, 0x2a9d8f, 0x264653, 0xffffff, 0x111111, 0x3a86ff, 0x8338ec, 0x06d6a0, 0xc0c0c0];

  /* ---------- Commerces ---------- */
  const BIZ_COLORS = { citron: 0xffd23f, bonbons: 0xff6fb5, boulange: 0xd9a066, kebab: 0xe63946, barbier: 0x457b9d, jeux: 0x7b2ff7, sport: 0x2a9d8f, cafe: 0x6f4e37, sushi: 0x111111, garage: 0x3a86ff, hotel: 0xb08d57, casino: 0xc1121f, banque: 0x2b2d42 };
  function shop(id, lvl, e) {
    const g = new T.Group(), c = BIZ_COLORS[id] || 0x999999;
    const big = ['hotel', 'casino', 'banque', 'garage'].includes(id);
    if (id === 'citron') { // petit stand avec parasol
      g.add(box(2.4, 1.2, 1.4, col(0xfff3c4))); g.add(cyl(.06, .06, 2.6, col(0x777777), 0, 1.2, 0, 6));
      g.add(mesh(new T.ConeGeometry(2, .8, 12), col(c), 0, 4, 0));
    } else if (big) {
      const h = 6 + lvl * 1.2;
      g.add(tower(id === 'banque' ? 'grey' : id === 'hotel' ? 'cream' : 'glass', 6, h, 5.5));
      g.add(box(6.4, .8, 5.9, col(c, id === 'casino' ? { emissive: c, emissiveIntensity: .6 } : null), 0, h, 0));
      if (id === 'banque') for (let i = -1; i <= 1; i++) g.add(cyl(.3, .3, 3, col(0xffffff), i * 1.8, 0, 3.1, 10));
    } else {
      const h = 2.8 + lvl * .35;
      g.add(box(4.6, h, 4, col(0xf1ede4))); g.add(box(4.8, .3, 4.2, col(0x6b6f76), 0, h, 0));
      const aw = box(4.8, .25, 1.4, col(c), 0, 0, 0); aw.position.set(0, h * .62, 2.5); aw.rotation.x = .35; g.add(aw);
      g.add(box(3.6, 1.4, .08, col(0x9fd0ff, { emissive: night ? 0xffd27a : 0, emissiveIntensity: .6 }), 0, .4, 2.02));
    }
    const sp = emojiSprite(e, big ? 3.4 : 2.6); sp.position.set(0, big ? 8.5 + lvl * 1.2 : 5.2, 0); g.add(sp);
    return g;
  }

  /* ---------- Monuments ---------- */
  const LAND = {
    bourse(g) {
      const stone = col(0xf2ead8);
      g.add(box(16, 1, 12, col(0xd9cfb8))); g.add(box(15, .6, 11, col(0xe6dcc4), 0, 1, 0));
      g.add(box(13, 8, 7, stone, 0, 1.6, -1.5));
      for (let i = 0; i < 6; i++) g.add(cyl(.5, .55, 7, col(0xffffff), -5.5 + i * 2.2, 1.6, 3.2, 14));
      g.add(box(14, 1, 3, stone, 0, 8.6, 2.5)); g.add(gable(14, 3, 3, stone, 0, 9.6, 2.5));
      // panneau de cotation lumineux
      g.add(box(10, 1.4, .2, new T.MeshBasicMaterial({ color: 0x10351f }), 0, 6.4, 2.3));
      return 13;
    },
    conc(g) {
      g.add(box(15, .3, 11, col(0x2b2f36)));
      const gl = new T.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: .32, metalness: .9, roughness: .05 });
      g.add(mesh(new T.BoxGeometry(14, 6, 10), gl, 0, 3.3, 0, false)); g.add(box(14.4, .5, 10.4, col(0x1f2933), 0, 6.3, 0));
      const a = car(0xffc300, true); a.position.set(-3, .3, 0); a.rotation.y = .6; g.add(a);
      const b = car(0xd00000, true); b.position.set(3, .3, 0); b.rotation.y = -.5; g.add(b);
      animated.push(t => { a.rotation.y = .6 + t * .4; });
      return 9;
    },
    agence(g) { g.add(tower('white', 9, 8, 8)); g.add(box(9.6, .5, 8.6, col(0x2b6cb0), 0, 8, 0)); const k = emojiSprite('🔑', 4); k.position.set(0, 11, 0); g.add(k); return 12; },
    bijou(g) {
      g.add(box(9, 6, 8, col(0x111111, { metalness: .4, roughness: .3 }))); g.add(box(9.4, .5, 8.4, col(0xd4af37, { metalness: .9, roughness: .2 }), 0, 6, 0));
      const d = mesh(new T.OctahedronGeometry(2, 0), new T.MeshStandardMaterial({ color: 0x9be7ff, metalness: .3, roughness: .05, emissive: 0x2a6f8a, emissiveIntensity: .5 }), 0, 10, 0); g.add(d);
      animated.push(t => { d.rotation.y = t; d.position.y = 10 + Math.sin(t * 2) * .4; });
      return 13;
    },
    coffre(g) {
      const red = col(0xd62839), gold = col(0xf4c430, { metalness: .8, roughness: .25 });
      g.add(box(7, 6, 7, red)); g.add(box(7.4, 1.4, 7.4, red, 0, 6, 0));
      g.add(box(7.5, 7.5, 1, gold, 0, 0, 0)); g.add(box(1, 7.5, 7.5, gold, 0, 0, 0));
      const bow = mesh(new T.TorusGeometry(1.2, .4, 10, 20), gold, -1.1, 8.3, 0); const bow2 = bow.clone(); bow2.position.x = 1.1; g.add(bow, bow2);
      animated.push(t => { g.rotation.y = Math.sin(t * .7) * .15; });
      return 11;
    },
    labo(g) {
      g.add(cyl(5, 5.4, 3, col(0xe8edf2), 0, 0, 0, 28));
      g.add(mesh(new T.SphereGeometry(5, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0xb8e1ff, metalness: .6, roughness: .1, transparent: true, opacity: .85 }), 0, 3, 0));
      const ant = cyl(.15, .15, 3, col(0x888888), 0, 8, 0, 6); g.add(ant);
      const b = mesh(new T.SphereGeometry(.45, 10, 8), new T.MeshBasicMaterial({ color: 0x33ff99 }), 0, 11.2, 0, false); g.add(b); blinkers.push(b);
      return 13;
    },
    mairie(g) {
      const stone = col(0xf0e2c4);
      g.add(box(14, 7, 8, stone, 0, 0, -1)); g.add(box(14.6, .6, 8.6, col(0x445566), 0, 7, -1));
      g.add(box(3.6, 9, 3.6, stone, 0, 7, -1)); const roof = mesh(new T.ConeGeometry(2.8, 3.5, 4), col(0x445566), 0, 17.7, -1); roof.rotation.y = Math.PI / 4; g.add(roof);
      const clock = mesh(new T.CylinderGeometry(1.2, 1.2, .2, 24), new T.MeshBasicMaterial({ color: 0xffffff }), 0, 13, .85, false); clock.rotation.x = Math.PI / 2; g.add(clock);
      const hand = box(.15, 1, .1, col(0x111111), 0, 0, 0); hand.position.set(0, 13, 1); g.add(hand); animated.push(t => { hand.rotation.z = -t * .5; });
      g.add(cyl(.08, .08, 4, col(0x777777), 0, 19.4, -1, 6));
      [0x0055a4, 0xffffff, 0xef4135].forEach((c, i) => { const f = box(.7, 1.2, .05, col(c), .35 + i * .7, 22, -1); g.add(f); });
      for (let i = -2; i <= 2; i++) g.add(box(1.2, 1.8, .1, col(0x9fd0ff, { emissive: night ? 0xffd27a : 0, emissiveIntensity: .6 }), i * 2.6, 3, 3.02));
      return 24;
    },
    parc(g) {
      g.add(mesh(new T.CylinderGeometry(3.2, 3.4, .8, 28), col(0xbfc5cc), 0, .4, 0));
      const water = mesh(new T.CylinderGeometry(2.8, 2.8, .2, 28), new T.MeshStandardMaterial({ color: 0x46b8ff, emissive: 0x0c4a7a, emissiveIntensity: .4, roughness: .1 }), 0, .85, 0, false); g.add(water);
      const jet = mesh(new T.ConeGeometry(.6, 3, 12, 1, true), new T.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: .7 }), 0, 2.4, 0, false); g.add(jet);
      animated.push(t => { jet.scale.y = 1 + Math.sin(t * 4) * .15; });
      const xm = TC.season && TC.season.noel;
      [[-7, -7], [7, -7], [-7, 7], [7, 7], [0, -8], [-8, 0], [8, 0]].forEach(([x, z], i) => tree(g, x, z, 1 + (i % 3) * .2));
      if (xm) { tree(g, 0, 6, 2.2, true); const st = emojiSprite('⭐', 2.5); st.position.set(0, 13.5, 6); g.add(st); }
      [[-4, 6], [4, -6]].forEach(([x, z]) => g.add(box(2.4, .5, .8, col(0x8b5a2b), x, .4, z)));
      return 8;
    },
  };

  /* ---------- Scène ---------- */
  function init() {
    canvas = document.createElement('canvas'); canvas.className = 'city3d-cv';
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.outputEncoding = T.sRGBEncoding; renderer.shadowMap.enabled = true; renderer.shadowMap.type = mobile ? T.PCFShadowMap : T.PCFSoftShadowMap;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('contexte 3D perdu (mémoire du téléphone)'); });
    renderer.toneMapping = T.NoToneMapping;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(45, 1, 1, 3000);
    hemi = new T.HemisphereLight(0xdcefff, 0x5a7a3a, .6); scene.add(hemi);
    sun = new T.DirectionalLight(0xfff1d6, 1.25); sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.bias = -.0005; scene.add(sun); scene.add(sun.target);
    clock = new T.Clock();
    controls();
    window.addEventListener('resize', resize);
  }
  function resize() { if (!host || !renderer) return; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  function clearWorld() {
    if (!world) return;
    scene.remove(world);
    world.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isSprite) { o.material.map && o.material.map.dispose(); o.material.dispose(); } });
    winMats.forEach(m => { m.map && m.map.dispose(); m.emissiveMap && m.emissiveMap.dispose(); m.dispose(); }); winMats.length = 0;
    pickables.length = animated.length = cars.length = labels.length = blinkers.length = 0;
    world = null; snow = null; stars = null; lotPos = {};
  }

  function setSky() {
    const day = new T.Color(0x9fd3ff), nightC = new T.Color(0x0b1030);
    scene.background = night ? nightC : day;
    scene.fog = new T.Fog(night ? 0x0b1030 : 0xbfe3ff, HALF * 2.2, HALF * 5.5);
    hemi.intensity = night ? .3 : .6; hemi.color.set(night ? 0x5566aa : 0xcfe8ff);
    sun.intensity = night ? .25 : 1.0; sun.color.set(night ? 0x8899ff : 0xfff1d6);
    sun.position.set(HALF * .9, HALF * 1.6, HALF * .6); sun.target.position.set(0, 0, 0);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -HALF - 20; sc.right = sc.top = HALF + 20; sc.near = 1; sc.far = HALF * 5; sc.updateProjectionMatrix();
    winMats.forEach(m => { m.emissive.set(night ? 0xffffff : 0x000000); });
  }

  // positions des blocs, du centre vers l'extérieur
  function slots(count) {
    N = Math.max(3, Math.ceil(Math.sqrt(count + 1))); if (N % 2 === 0) N++;
    HALF = N * S / 2;
    const out = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = (i - (N - 1) / 2) * S, z = (j - (N - 1) / 2) * S; out.push({ x, z, d: Math.hypot(x, z) + (Math.abs(x) + Math.abs(z)) * .01 + i * .001 }); }
    return out.sort((a, b) => a.d - b.d);
  }

  function build(data) {
    clearWorld();
    world = new T.Group(); scene.add(world);
    night = forcedNight != null ? forcedNight : data.night;
    const noel = !!(TC.season && TC.season.noel);
    const items = [{ land: 'bourse' }];
    // monuments mélangés aux plus riches, comme sur la carte 2D
    let li = 1; const L = data.landmarks;
    data.players.forEach((p, i) => { if (i % 2 === 0 && li < L.length) items.push({ land: L[li++].id }); items.push({ p, i }); });
    while (li < L.length) items.push({ land: L[li++].id });
    const pos = slots(items.length);
    setSky();

    // sol : île, eau, routes, trottoirs
    const W = N * S + 16;
    const sea = mesh(new T.PlaneGeometry(4000, 4000), new T.MeshStandardMaterial({ color: night ? 0x0c2340 : 0x2f8fd8, roughness: .2, metalness: .3 }), 0, -1.2, 0, false); sea.rotation.x = -Math.PI / 2; world.add(sea);
    const sand = mesh(new T.BoxGeometry(W + 24, 1.2, W + 24), col(noel ? 0xf4f6fa : 0xe9d7a5), 0, -1.2, 0, false); sand.receiveShadow = true; world.add(sand);
    const asphalt = mesh(new T.BoxGeometry(W, .2, W), col(0x3a3d44, { roughness: .95 }), 0, -.15, 0, false); asphalt.receiveShadow = true; world.add(asphalt);
    const dash = canvasTex(64, 8, (g, w, h) => { g.fillStyle = '#3a3d44'; g.fillRect(0, 0, w, h); g.fillStyle = '#f5d76e'; g.fillRect(4, 3, 26, 2); });
    dash.wrapS = T.RepeatWrapping; dash.repeat.set(W / 8, 1);
    const roadMat = new T.MeshStandardMaterial({ map: dash, roughness: .9 }); winMats.push(roadMat);
    for (let k = 0; k <= N; k++) {
      const c = (k - N / 2) * S;
      const a = mesh(new T.PlaneGeometry(W, 1.2), roadMat, 0, .06, c, false); a.rotation.x = -Math.PI / 2; a.receiveShadow = true; world.add(a);
      const b = mesh(new T.PlaneGeometry(W, 1.2), roadMat, c, .06, 0, false); b.rotation.x = -Math.PI / 2; b.rotation.z = Math.PI / 2; b.receiveShadow = true; world.add(b);
    }
    const walk = col(0xc9ccd2), grass = col(noel ? 0xeef3f8 : 0x4caf50, { roughness: 1 }), plaza = col(0xe6dfd0);
    // lampadaires aux carrefours
    const lampMat = new T.MeshBasicMaterial({ color: night ? 0xfff0b0 : 0xdddddd });
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      if ((i + j) % 2) continue;
      const x = (i - N / 2) * S + 5, z = (j - N / 2) * S + 5;
      world.add(cyl(.12, .15, 5, col(0x444b55), x, 0, z, 6)); world.add(mesh(new T.SphereGeometry(.45, 8, 6), lampMat, x, 5.2, z, false));
    }

    items.forEach((it, k) => {
      const s = pos[k]; if (!s) return;
      const g = new T.Group(); g.position.set(s.x, 0, s.z); world.add(g);
      const r = rng(it.p ? it.p.uid : it.land);
      g.add(box(BLOCK, .35, BLOCK, walk, 0, 0, 0));
      const top = box(BLOCK - 2, .1, BLOCK - 2, it.land === 'bourse' || it.land === 'mairie' ? plaza : grass, 0, .35, 0); top.castShadow = false; g.add(top);
      const b = new T.Group(); b.position.y = .45; g.add(b);
      let h;
      if (it.land) {
        h = LAND[it.land](b);
        b.userData.pick = { land: it.land };
        const name = (data.landmarks.find(l => l.id === it.land) || { name: 'Bourse' }).name;
        const lb = label(name, { bg: 'rgba(255,255,255,.88)', color: '#1e1b2e', scale: .9 }); lb.position.set(s.x, h + 3, s.z); world.add(lb); labels.push(lb);
        lotPos[it.land] = { x: s.x, z: s.z, h };
      } else {
        const p = it.p;
        h = BUILD[Math.min(BUILD.length - 1, p.tier)](b, r);
        b.rotation.y = 0;
        b.userData.pick = { uid: p.uid };
        // commerces aux coins du bloc
        const biz = Object.entries(p.biz || {}).filter(([id]) => data.biz[id]).sort((a, c) => data.biz[c[0]].price - data.biz[a[0]].price).slice(0, 4);
        [[-8.2, -8.2], [8.2, -8.2], [-8.2, 8.2], [8.2, 8.2]].forEach(([x, z], n) => {
          if (biz[n]) { const sh = shop(biz[n][0], biz[n][1], data.biz[biz[n][0]].e); sh.position.set(x, .45, z); sh.rotation.y = z > 0 ? 0 : Math.PI; sh.userData.pick = { uid: p.uid }; g.add(sh); }
          else if (r() < .55) tree(g, x, z, .8 + r() * .4, noel && r() < .3);
        });
        // sa plus belle voiture garée devant
        if (p.car) { const c = car(p.car.color, true); c.position.set(-2.5, .45, 9.6); c.rotation.y = Math.PI / 2; g.add(c); }
        const txt = (p.mayor ? '👑 ' : '') + (p.me ? 'Toi' : p.pseudo) + (p.plus ? ' ✓' : '');
        const lb = label(txt, p.me ? { bg: 'rgba(255,200,40,.95)', color: '#2a1a00', scale: 1.1 } : p.mayor ? { bg: 'rgba(255,215,90,.92)', color: '#2a1a00', scale: 1.15, border: '#fff' } : p.friend ? { bg: 'rgba(40,110,230,.9)', scale: .95 } : {});
        lb.position.set(s.x, h + 3.2, s.z); world.add(lb); labels.push(lb);
        lotPos[p.uid] = { x: s.x, z: s.z, h };
        if (p.mayor) { // palais du Maire : dalle dorée, tapis rouge, drapeaux, projecteurs
          const gold = col(0xf5c518, { metalness: .85, roughness: .25 });
          [[0, -10.6, BLOCK - 2, .7], [0, 10.6, BLOCK - 2, .7], [-10.6, 0, .7, BLOCK - 2], [10.6, 0, .7, BLOCK - 2]].forEach(([x, z, w, d]) => g.add(box(w, .5, d, gold, x, .35, z)));
          g.add(box(2.6, .08, 8, col(0xc1121f), 0, .45, 8));
          [-3, 3].forEach(x => { g.add(cyl(.1, .1, 7, col(0xdddddd), x, .45, 9.5, 6)); [0x0055a4, 0xffffff, 0xef4135].forEach((c, k) => g.add(box(.6, 1.1, .05, col(c), x + .3 + k * .6, 6.2, 9.5))); g.add(mesh(new T.SphereGeometry(.22, 8, 6), gold, x, 7.5, 9.5)); });
          [[-9, -9], [9, -9], [-9, 9], [9, 9]].forEach(([x, z]) => { const l = mesh(new T.CylinderGeometry(.3, 2.2, 40, 16, 1, true), new T.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: night ? .16 : .05, depthWrite: false }), x, 20.5, z, false); l.rotation.z = x > 0 ? -.12 : .12; g.add(l); });
        }
        if (p.mayor) { const cr = emojiSprite('👑', 5); cr.position.set(s.x, h + 7.5, s.z); world.add(cr); animated.push(t => { cr.position.y = h + 7.5 + Math.sin(t * 2) * .6; }); }
      }
      b.traverse(o => { if (o.isMesh) pickables.push(o); });
      g.traverse(o => { if (o.isMesh && !o.userData.pickOwner) o.userData.pickOwner = it.land ? { land: it.land } : { uid: it.p.uid }; });
    });

    // voitures qui circulent
    const nCars = Math.min(40, 8 + N * 3);
    const rc = rng('cars' + N);
    for (let i = 0; i < nCars; i++) {
      const sport = rc() < .3, c = car(CAR_COLORS[rc() * CAR_COLORS.length | 0], sport);
      const k = rc() * (N + 1) | 0, line = (k - N / 2) * S, dir = rc() < .5 ? 1 : -1, axis = rc() < .5 ? 'x' : 'z';
      const lane = dir * 1.8;
      const o = { g: c, axis, dir, line: line + lane, t: (rc() - .5) * W, v: (sport ? 16 : 9) + rc() * 6, W };
      c.rotation.y = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      world.add(c); cars.push(o);
    }
    // nuages
    for (let i = 0; i < 7; i++) {
      const cl = new T.Group(); const m = new T.MeshStandardMaterial({ color: night ? 0x3a4466 : 0xffffff, transparent: true, opacity: .9, roughness: 1 });
      for (let j = 0; j < 5; j++) cl.add(mesh(new T.SphereGeometry(4 + rc() * 3, 10, 8), m, j * 4 - 8, rc() * 2, rc() * 3, false));
      cl.position.set((rc() - .5) * W * 1.5, 70 + rc() * 30, (rc() - .5) * W * 1.5); world.add(cl);
      const v = 2 + rc() * 3; animated.push((t, dt) => { cl.position.x += v * dt; if (cl.position.x > W) cl.position.x = -W; });
    }
    // étoiles la nuit, neige en décembre
    if (night) {
      const g = new T.BufferGeometry(), a = [];
      for (let i = 0; i < 700; i++) { const th = rc() * Math.PI * 2, ph = rc() * Math.PI * .45, R = 900; a.push(Math.cos(th) * Math.sin(ph) * R, Math.cos(ph) * R * .6 + 60, Math.sin(th) * Math.sin(ph) * R); }
      g.setAttribute('position', new T.Float32BufferAttribute(a, 3));
      stars = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })); world.add(stars);
    }
    if (inside) world.visible = false;
    if (noel) {
      const g = new T.BufferGeometry(), a = []; for (let i = 0; i < 1500; i++) a.push((rc() - .5) * W, rc() * 90, (rc() - .5) * W);
      g.setAttribute('position', new T.Float32BufferAttribute(a, 3));
      snow = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: .6, transparent: true, opacity: .9 })); world.add(snow);
    }
  }

  /* ---------- Intérieur d'une maison (vue « maison de poupée », murs côté caméra masqués) ---------- */
  let inside = null, insideInfo = null, savedCam = null, room = { W: 20, D: 14 };
  const walls = [], animIn = [];
  function chartTex(up) {
    return canvasTex(256, 144, (g, w, h) => {
      g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.08)'; for (let y = 20; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      let v = h * .7; g.strokeStyle = up ? '#16c784' : '#ea3943'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, v);
      for (let x = 0; x <= w; x += 8) { v += (Math.random() - (up ? .62 : .38)) * 14; v = Math.max(18, Math.min(h - 10, v)); g.lineTo(x, v); }
      g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.fillText(up ? 'BTC  +4,2 %' : 'CAC40  -1,3 %', 10, 28);
    });
  }
  function picture(e, txt) {
    const t = canvasTex(160, 128, (g, w, h) => {
      g.fillStyle = '#d4af37'; g.fillRect(0, 0, w, h); g.fillStyle = '#fdfaf2'; g.fillRect(8, 8, w - 16, h - 16);
      g.font = '62px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, w / 2, 56);
      g.fillStyle = '#333'; g.font = 'bold 13px sans-serif'; g.fillText(String(txt).slice(0, 20), w / 2, 106);
    });
    return new T.Mesh(new T.PlaneGeometry(2.6, 2.1), new T.MeshBasicMaterial({ map: t }));
  }
  function furniture(g, info) {
    const t = info.tier, { W, D } = room, lux = t >= 6;
    const wood = col(t <= 1 ? 0x6b4423 : 0x8b5a2b), fabric = col(lux ? 0x5b2333 : t >= 3 ? 0x34495e : 0x8e6e53);
    // lit
    const bx = -W / 2 + 3, bz = -D / 2 + 3.2, bw = t >= 4 ? 4.4 : 3;
    g.add(box(bw + .4, .6, 5, wood, bx, 0, bz)); g.add(box(bw, .6, 4.6, col(0xffffff), bx, .6, bz + .1));
    g.add(box(bw, .5, 2.6, col(lux ? 0xd4af37 : 0x3b82f6), bx, .9, bz + 1)); g.add(box(bw * .8, .4, .9, col(0xf5f5f5), bx, 1.2, bz - 1.6));
    g.add(box(bw + .4, 2.2, .3, wood, bx, 0, bz - 2.6));
    // télé avec un graphique de bourse
    const tvz = -D / 2 + .7;
    g.add(box(4.2, .9, 1, col(0x222222), 1, 0, tvz));
    const scr = new T.Mesh(new T.PlaneGeometry(4.6, 2.6), new T.MeshBasicMaterial({ map: chartTex(true) })); scr.position.set(1, 2.6, tvz + .2); g.add(scr);
    g.add(box(4.8, 2.9, .15, col(0x111111), 1, 1.15, tvz + .05));
    // canapé + table basse
    const sz = D * .18;
    g.add(box(5.4, .9, 2, fabric, 1, 0, sz)); g.add(box(5.4, 1.4, .6, fabric, 1, .9, sz + .8));
    [-2.8, 2.8].forEach(x => g.add(box(.5, 1.4, 2, fabric, 1 + x, 0, sz)));
    g.add(box(2.6, .6, 1.4, col(lux ? 0xffffff : 0x5d4037), 1, 0, sz - 2.4));
    g.add(box(W * .42, .05, D * .38, col(lux ? 0x7a1f2b : 0x3b6ea5), 1, 0, sz - 1.4)); // tapis
    // plantes et lampe
    [[-W / 2 + 1.2, D / 2 - 1.2], [W / 2 - 1.2, -D / 2 + 1.2]].forEach(([x, z]) => { g.add(cyl(.5, .4, .9, col(0xc0573b), x, 0, z, 10)); g.add(mesh(new T.SphereGeometry(.9, 10, 8), col(0x2e8b3a), x, 1.6, z)); });
    g.add(cyl(.08, .08, 3.4, col(0x333333), -W / 2 + 1.2, 0, 0, 6));
    g.add(mesh(new T.ConeGeometry(.7, .8, 14, 1, true), col(0xfff3c4, { emissive: night ? 0xffd27a : 0x000000, emissiveIntensity: .8, side: T.DoubleSide }), -W / 2 + 1.2, 3.6, 0));
    if (t === 0) { // tente : sac de couchage et feu
      g.add(box(1.4, .3, 3.4, col(0x2e86de), -1, 0, 0));
      const f = mesh(new T.ConeGeometry(.5, 1.2, 6), col(0xffa020, { emissive: 0xff6a00, emissiveIntensity: 1 }), 2, .6, 2, false); g.add(f); animIn.push(tt => { f.scale.y = 1 + Math.sin(tt * 9) * .25; });
    }
    // bureau de trader avec écrans
    if (t >= 2) {
      const dx = W / 2 - 2.2, dz = -D * .1;
      g.add(box(1.6, 1.4, 4.2, col(0x2d3436), dx, 0, dz)); g.add(box(1, 1, 1, col(0x111111), dx - 1.6, 0, dz));
      const n = t >= 5 ? 3 : t >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) { const m = new T.Mesh(new T.PlaneGeometry(1.8, 1.1), new T.MeshBasicMaterial({ map: chartTex(i !== 1) })); m.position.set(dx + .2, 2.2, dz + (i - (n - 1) / 2) * 1.35); m.rotation.y = -Math.PI / 2; g.add(m); }
    }
    // aquarium
    if (t >= 4) {
      const ax = -W / 2 + 1.1, az = D * .05;
      g.add(box(1.4, 1, 4, col(0x222222), ax, 0, az));
      g.add(mesh(new T.BoxGeometry(1.3, 1.8, 3.8), new T.MeshStandardMaterial({ color: 0x4fc3f7, transparent: true, opacity: .45, emissive: 0x0a4a7a, emissiveIntensity: .4 }), ax, 1.9, az, false));
      ['🐠', '🐟', '🐡'].forEach((e, i) => { const f = emojiSprite(e, .9); g.add(f); animIn.push(tt => { f.position.set(ax, 1.6 + i * .45, az + Math.sin(tt * (.6 + i * .2) + i) * 1.4); }); });
    }
    // piano à queue
    if (t >= 5) { const px = -W * .22, pz = D / 2 - 3; g.add(box(3, 1, 3.6, col(0x0a0a0a, { roughness: .2, metalness: .3 }), px, 1, pz)); g.add(box(3, .15, .5, col(0xffffff), px, 1.9, pz - 1.9)); [[-1.2, -1.4], [1.2, -1.4], [0, 1.4]].forEach(([x, z]) => g.add(cyl(.12, .12, 1, col(0x111111), px + x, 0, pz + z, 6))); }
    // jacuzzi
    if (t >= 6) { const jx = W / 2 - 3, jz = D / 2 - 3; g.add(cyl(2.3, 2.3, 1.1, col(0xffffff), jx, 0, jz, 24)); const wv = mesh(new T.CylinderGeometry(2, 2, .1, 24), new T.MeshStandardMaterial({ color: 0x2ec4ff, emissive: 0x0a5a8a, emissiveIntensity: .5 }), jx, 1.1, jz, false); g.add(wv); animIn.push(tt => { wv.position.y = 1.05 + Math.sin(tt * 3) * .04; }); }
    // coffre-fort et lingots d'or (selon la fortune)
    if (t >= 3) {
      const sx = W / 2 - 1.6, sz2 = D / 2 - (t >= 6 ? 7 : 2);
      g.add(box(2, 2.4, 2, col(0x4a4f57, { metalness: .7, roughness: .35 }), sx, 0, sz2)); g.add(cyl(.4, .4, .2, col(0xd4af37, { metalness: .9 }), sx - 1.05, 1.2, sz2, 12));
      const gold = col(0xf5c518, { metalness: .9, roughness: .2, emissive: 0x3a2a00, emissiveIntensity: .3 });
      const nBars = Math.min(36, Math.floor(Math.log10(Math.max(10, info.nw || 10)) * 4));
      for (let i = 0; i < nBars; i++) { const row = Math.floor(i / 6), c = i % 6; const layer = Math.floor(row / 2); g.add(box(.9, .35, .45, gold, sx - 2.6 - (c % 3) * 1, layer * .36, sz2 - .6 + (row % 2) * .55 + Math.floor(c / 3) * 1.2)); }
    }
    // taureau doré de Wall Street
    if (t >= 7) {
      const gx = -W * .25, gz = -D * .05, gm = col(0xd4af37, { metalness: .95, roughness: .2 });
      g.add(box(3.2, .6, 1.6, col(0x222222), gx, 0, gz)); g.add(box(2.6, 1.4, 1.2, gm, gx, .9, gz)); g.add(box(1, 1, 1, gm, gx + 1.6, 1.3, gz));
      [[-1, -.4], [-1, .4], [1, -.4], [1, .4]].forEach(([x, z]) => g.add(box(.3, .9, .3, gm, gx + x, .6, gz + z)));
      [-.35, .35].forEach(z => { const h = mesh(new T.ConeGeometry(.15, .9, 8), gm, gx + 2.2, 2.1, gz + z); h.rotation.z = -1; g.add(h); });
    }
  }
  function interior(info) {
    const g = new T.Group(); const t = info.tier;
    room = { W: 16 + t * 2.2, D: 12 + t * 1.6 };
    const { W, D } = room, H = 5.5 + (t >= 5 ? 1.5 : 0), lux = t >= 6;
    const floor = box(W, .4, D, t <= 1 ? col(0x7a5230) : t <= 4 ? col(0xc8a27a) : col(0xf2efe9, { roughness: .25, metalness: .1 }), 0, -.4, 0); g.add(floor);
    const wallMat = t === 0 ? col(0xff9a4d) : lux ? col(0x1f2a44) : col(0xf3eadb);
    const skyMat = new T.MeshBasicMaterial({ color: night ? 0x121a40 : 0x9fd3ff });
    [[0, -D / 2, W, 'z', [0, -1]], [0, D / 2, W, 'z', [0, 1]], [-W / 2, 0, D, 'x', [-1, 0]], [W / 2, 0, D, 'x', [1, 0]]].forEach(([x, z, len, ax, n]) => {
      const w = ax === 'z' ? box(len, H, .35, wallMat, x, 0, z) : box(.35, H, len, wallMat, x, 0, z);
      w.userData.n = n; w.userData.half = ax === 'z' ? D / 2 : W / 2;
      // fenêtres (enfants du mur : elles disparaissent avec lui)
      for (const off of [-len / 4, len / 4]) {
        const win = new T.Mesh(new T.PlaneGeometry(2.8, 2), skyMat); const k = n[0] || n[1];
        if (ax === 'z') { win.position.set(off, .6, -k * .2); win.rotation.y = k > 0 ? Math.PI : 0; } else { win.position.set(-k * .2, .6, off); win.rotation.y = k > 0 ? -Math.PI / 2 : Math.PI / 2; }
        w.add(win);
      }
      if (lux) { const trim = box(ax === 'z' ? len : .4, .25, ax === 'z' ? .4 : len, col(0xd4af37, { metalness: .9, roughness: .2 }), 0, 0, 0); trim.position.set(0, H / 2, 0); w.add(trim); }
      g.add(w); walls.push(w);
    });
    furniture(g, info);
    // biens immobiliers en tableaux, objets de luxe sur des socles
    const items = (info.own || []).map(id => TC.shopById[id]).filter(Boolean);
    const estates = items.filter(i => i.type === 'estate').slice(0, 4), luxe = items.filter(i => i.type === 'luxury').slice(0, 6), autos = items.filter(i => i.type === 'car').slice(0, 4);
    const back = walls[0];
    estates.forEach((it, i) => { const p = picture(it.emoji, it.model); p.position.set(-W / 2 + 6 + i * 3.2, .9, .2); back.add(p); });
    luxe.forEach((it, i) => {
      const x = -W / 2 + 2.5 + i * 2.4, z = D / 2 - 1.6;
      g.add(cyl(.6, .7, 1.2, col(0xffffff, { roughness: .3 }), x, 0, z, 16));
      const sp = emojiSprite(it.emoji, 1.5); g.add(sp); animIn.push(tt => { sp.position.set(x, 2 + Math.sin(tt * 2 + i) * .15, z); });
    });
    // le propriétaire au milieu de son salon
    const av = emojiSprite(info.avatar || '😎', 3); g.add(av); animIn.push(tt => { av.position.set(-1.5, 2 + Math.sin(tt * 2) * .2, D * .02); });
    // garage avec ses voitures
    if (autos.length) {
      const gz = D / 2 + 7;
      g.add(box(Math.max(14, autos.length * 6), .3, 9, col(0x4a4f57), 0, -.3, gz));
      autos.forEach((it, i) => {
        const c = car(parseInt(String(it.grad[0]).replace('#', ''), 16) || 0xd00000, true); const x = (i - (autos.length - 1) / 2) * 6;
        c.position.set(x, 0, gz); c.scale.setScalar(1.4); g.add(c);
        const lb = label(it.brand + ' ' + it.model, { scale: .3 }); lb.position.set(x, 3.4, gz); g.add(lb);
      });
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    return g;
  }
  V.enter = function (info) {
    if (!V.ready || !world) return;
    V.exit(true);
    savedCam = Object.assign({}, cam, { goal: null });
    insideInfo = info; world.visible = false;
    inside = interior(info); scene.add(inside);
    scene.fog = null; scene.background = new T.Color(night ? 0x0d0b1e : 0x2a2140);
    const m = Math.max(room.W, room.D);
    Object.assign(cam, { tx: 0, ty: 2, tz: 0, r: m * 1.45, ph: .95, th: .6, goal: null, idle: 0 });
  };
  V.exit = function (silent) {
    if (!inside) return;
    scene.remove(inside);
    inside.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !Array.isArray(o.material) && o.material.map && (o.isSprite || o.material.isMeshBasicMaterial)) { o.material.map.dispose(); o.material.dispose(); } });
    inside = null; insideInfo = null; walls.length = 0; animIn.length = 0;
    if (world) world.visible = true;
    setSky();
    if (savedCam) Object.assign(cam, savedCam); savedCam = null;
  };
  V.insideOf = () => insideInfo;

  /* ---------- Caméra : un doigt pour tourner, deux pour zoomer / déplacer ---------- */
  const cam = { th: .8, ph: 1.0, r: 140, tx: 0, ty: 4, tz: 0, goal: null, idle: 0 };
  function applyCam() {
    cam.ph = Math.max(.25, Math.min(1.42, cam.ph)); cam.r = inside ? Math.max(8, Math.min(Math.max(room.W, room.D) * 3, cam.r)) : Math.max(25, Math.min(HALF * 4.5, cam.r));
    const lim = inside ? room.W / 2 : HALF + 10; cam.tx = Math.max(-lim, Math.min(lim, cam.tx)); cam.tz = Math.max(-lim, Math.min(lim, cam.tz));
    camera.position.set(cam.tx + cam.r * Math.sin(cam.ph) * Math.sin(cam.th), cam.r * Math.cos(cam.ph), cam.tz + cam.r * Math.sin(cam.ph) * Math.cos(cam.th));
    camera.position.y += cam.ty - 4; camera.lookAt(cam.tx, cam.ty, cam.tz);
  }
  function controls() {
    const pts = new Map(); let last = null, down = null, moved = 0;
    const pan = (dx, dy) => { const k = cam.r / 600; const s = Math.sin(cam.th), c = Math.cos(cam.th); cam.tx -= (dx * c + dy * s) * k; cam.tz -= (-dx * s + dy * c) * k; };
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); down = { x: e.clientX, y: e.clientY, t: Date.now(), btn: e.button, shift: e.shiftKey }; moved = 0; last = null; cam.goal = null; cam.idle = 0; });
    canvas.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) {
        if (down && (down.btn === 2 || down.shift)) pan(dx, dy); else { cam.th -= dx * .006; cam.ph -= dy * .005; }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (last) { cam.r *= last.d / d; pan(mx - last.mx, my - last.my); }
        last = { d, mx, my };
      }
      cam.idle = 0;
    });
    const up = e => {
      pts.delete(e.pointerId); last = null;
      if (down && pts.size === 0 && moved < 8 && Date.now() - down.t < 400) pick(e);
      if (pts.size === 0) down = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { pts.delete(e.pointerId); last = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.r *= Math.exp(e.deltaY * .0012); cam.goal = null; cam.idle = 0; }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  const ray = () => new T.Raycaster();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    const v = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = ray(); rc.setFromCamera(v, camera);
    const hit = rc.intersectObjects(world ? world.children : [], true).find(h => h.object.userData.pickOwner);
    if (!hit) return;
    const own = hit.object.userData.pickOwner;
    const key = own.uid || own.land; V.focus(key, true);
    if (onPick) setTimeout(() => onPick(own), 450);
  }
  V.focus = function (key, keep) {
    const p = lotPos[key]; if (!p) return;
    cam.goal = { tx: p.x, tz: p.z, ty: Math.max(4, Math.min(45, p.h * .45)), r: Math.max(45, Math.min(170, p.h * 2 + 35)) }; cam.idle = 0;
  };
  V.setNight = function (v) { forcedNight = v; sig = ''; };
  V.isNight = () => night;

  /* ---------- Boucle ---------- */
  function loop() {
    if (!running) return;
    if (!canvas.isConnected || document.hidden || (TC.UI && TC.UI.tab !== 'city')) { running = false; return; }
    requestAnimationFrame(loop);
    const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
    cam.idle += dt;
    if (cam.goal) { const g = cam.goal, k = Math.min(1, dt * 3); cam.tx += (g.tx - cam.tx) * k; cam.tz += (g.tz - cam.tz) * k; cam.r += (g.r - cam.r) * k; cam.ty += ((g.ty || 4) - cam.ty) * k; if (Math.abs(g.tx - cam.tx) + Math.abs(g.tz - cam.tz) + Math.abs(g.r - cam.r) < .5) cam.goal = null; }
    else if (cam.idle > 6) cam.th += dt * .05; // rotation lente quand on ne touche à rien
    applyCam();
    if (inside) { animIn.forEach(f => f(t, dt)); walls.forEach(w => { const n = w.userData.n; w.visible = (camera.position.x * n[0] + camera.position.z * n[1]) < w.userData.half + 2; }); }
    else animated.forEach(f => f(t, dt));
    blinkers.forEach((b, i) => { b.visible = ((t + i * .3) % 1.4) < .7; });
    cars.forEach(c => {
      c.t += c.v * c.dir * dt; const lim = c.W / 2 + 6;
      if (c.t > lim) c.t = -lim; if (c.t < -lim) c.t = lim;
      if (c.axis === 'x') c.g.position.set(c.t, .1, c.line); else c.g.position.set(c.line, .1, c.t);
    });
    if (snow) { const a = snow.geometry.attributes.position; for (let i = 1; i < a.array.length; i += 3) { a.array[i] -= dt * 6; if (a.array[i] < 0) a.array[i] = 90; } a.needsUpdate = true; }
    // les étiquettes lointaines s'effacent pour ne pas encombrer
    if (!inside) labels.forEach(l => { const d = l.position.distanceTo(camera.position); const o = Math.max(0, Math.min(1, (HALF * 3.2 - d) / (HALF * 1.2))); l.material.opacity = Math.max(.12, o); });
    try { renderer.render(scene, camera); } catch (e) { fail('rendu : ' + (e.message || e)); }
  }

  /* ---------- API pour city.js ---------- */
  V.mount = function (el, data, pickCb) {
    host = el; onPick = pickCb;
    if (canvas.parentNode !== el) el.appendChild(canvas);
    const s = JSON.stringify([data.players.map(p => [p.uid, p.tier, p.biz, p.me, p.mayor, p.friend, p.pseudo, p.plus, p.car && p.car.color]), data.night, forcedNight]);
    if (s !== sig) {
      const first = !sig; sig = s;
      try { build(data); } catch (e) { sig = ''; fail('construction : ' + (e.message || e)); throw e; }
      if (first) { const me = data.players.find(p => p.me); cam.r = Math.min(HALF * 3, 170); cam.tx = 0; cam.tz = 0; if (me) setTimeout(() => V.focus(me.uid), 900); }
    }
    resize();
    if (!running) { running = true; clock.getDelta(); requestAnimationFrame(loop); }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && host && canvas && canvas.isConnected && !running && TC.UI && TC.UI.tab === 'city') { running = true; clock.getDelta(); requestAnimationFrame(loop); } });
})();

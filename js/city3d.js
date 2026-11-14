/* Trad Center — Trad City en 3D (Three.js r149, chargé seulement quand on ouvre l'onglet Ville)
 * Bâtiments modélisés selon le patrimoine de chaque joueur, commerces autour, monuments, voitures qui roulent,
 * jour / nuit à l'heure de Paris, neige en décembre. Un doigt : tourner. Deux doigts : zoom et déplacement. Toucher : ouvrir.
 * Mode balade (V.walk) : on se promène à pied, à la 3e personne (clavier + souris sur ordinateur, joystick sur téléphone),
 * avec collisions contre les bâtiments, voitures qui s'arrêtent devant le piéton, et le Trad Market (épicerie) près de la Bourse.
 */
(function () {
  const V = TC.City3D = { ready: false, failed: false };
  let T = null; // THREE
  let renderer, scene, camera, canvas, host, clock;
  let world = null, sig = '', running = false, onPick = null;
  const pickables = [], animated = [], cars = [], labels = [], blinkers = [];
  let snow = null, stars = null, sun, hemi, night = false, forcedNight = null;
  const S = 32, BLOCK = 24; // pas de la grille (bloc + route), taille d'un bloc
  let N = 3, HALF = 48, lotPos = {}, isMobile = false, sky = null;

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
  function col(c, extra) { return M('c' + c + (extra ? JSON.stringify(extra) : ''), Object.assign({ color: c, roughness: .75, metalness: .05, envMapIntensity: .45 }, extra || {})); }
  function mesh(geo, mat, x, y, z, shadow = true) { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (shadow) { m.castShadow = true; m.receiveShadow = true; } return m; }
  const box = (w, h, d, mat, x, y, z) => mesh(new T.BoxGeometry(w, h, d), mat, x, (y || 0) + h / 2, z);
  const cyl = (rt, rb, h, mat, x, y, z, seg = 16) => mesh(new T.CylinderGeometry(rt, rb, h, seg), mat, x, (y || 0) + h / 2, z);
  function gable(w, h, d, mat, x, y, z) { // toit à deux pans
    const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
    const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
    return mesh(g, mat, x, y, z);
  }
  function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; }

  // façades réalistes : une texture = un étage × 2 fenêtres (encadrements, appuis, reflets), carte des fenêtres allumées la nuit
  const facades = {};
  function facade(kind) {
    if (facades[kind]) return facades[kind];
    const r = rng(kind), S2 = 256;
    const glass = kind === 'glass' || kind === 'gold';
    const base = { glass: '#4f77a8', gold: '#a8823a', brick: '#a65a40', white: '#ece9e2', cream: '#e3cfa6', grey: '#9aa3ad' }[kind] || '#ccc';
    const map = canvasTex(S2, S2, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      if (glass) {
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, kind === 'gold' ? '#f3d796' : '#bfe0ff'); gr.addColorStop(.45, kind === 'gold' ? '#b8913f' : '#4d7fb8'); gr.addColorStop(1, kind === 'gold' ? '#e2c27a' : '#8fbde8');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = kind === 'gold' ? '#5c4718' : '#28374a'; for (let x = 0; x <= w; x += w / 4) g.fillRect(x - 2, 0, 4, h); g.fillRect(0, h - 22, w, 22); g.fillRect(0, 0, w, 3);
        g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.moveTo(0, h * .7); g.lineTo(w * .55, 0); g.lineTo(w * .75, 0); g.lineTo(w * .2, h * .7); g.fill();
      } else {
        if (kind === 'brick') { for (let y = 0; y < h; y += 8) for (let x = (y / 8 % 2) * 10; x < w; x += 20) { g.fillStyle = `hsl(14, ${38 + r() * 14}%, ${36 + r() * 10}%)`; g.fillRect(x, y, 19, 7); } }
        else { for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${r() * .04})`; g.fillRect(r() * w, r() * h, 2, 2); } }
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h - 10, w, 4); // bandeau d'étage
        [[34, 46], [146, 46]].forEach(([x, y]) => {
          g.fillStyle = kind === 'brick' ? '#f1ece4' : '#ffffff'; g.fillRect(x - 6, y - 6, 88, 152); // encadrement
          const gr = g.createLinearGradient(x, y, x + 76, y + 140); gr.addColorStop(0, '#9cc6ea'); gr.addColorStop(.5, '#3c5c7e'); gr.addColorStop(1, '#6f97bd');
          g.fillStyle = gr; g.fillRect(x, y, 76, 140);
          g.fillStyle = '#f4f4f4'; g.fillRect(x + 36, y, 4, 140); g.fillRect(x, y + 60, 76, 4);
          g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 4, y + 4, 10, 54);
          g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 8, y + 146, 92, 8); // appui
        });
      }
    });
    const em = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      if (glass) { for (let y = 0; y < h - 6; y += 16) for (let x = 0; x < w; x += 16) if (r() < .5) { g.fillStyle = r() < .8 ? '#ffd889' : '#bfe3ff'; g.fillRect(x + 1, y, 14, 15); } }
      else [[8, 11], [36, 11]].forEach(([x, y]) => { if (r() < .6) { g.fillStyle = r() < .85 ? '#ffd27a' : '#cfe6ff'; g.fillRect(x + 1, y + 1, 18, 34); } });
    });
    [map, em].forEach(t => { t.wrapS = t.wrapT = T.RepeatWrapping; });
    return (facades[kind] = { map, em, glass });
  }
  const winMats = [];
  function windowed(kind, w, h, d) { // matériau de façade adapté à la taille (un motif ≈ 6 m de large, un étage = 3,2 m)
    const f = facade(kind);
    const map = f.map.clone(), em = f.em.clone(); map.needsUpdate = em.needsUpdate = true;
    const sx = Math.max(1, Math.round(w / 6)), sy = Math.max(1, Math.round(h / 3.2));
    map.repeat.set(sx, sy); em.repeat.set(sx, sy);
    const m = new T.MeshStandardMaterial({ map, emissiveMap: em, emissive: night ? 0xffffff : 0x000000, emissiveIntensity: .9, roughness: f.glass ? .12 : .85, metalness: f.glass ? .6 : .02, envMapIntensity: f.glass ? 1.2 : .4 });
    winMats.push(m); return m;
  }
  function tower(kind, w, h, d, x, y, z) {
    const side = windowed(kind, w, h, d), top = col(kind === 'glass' ? 0x3d4f66 : kind === 'gold' ? 0x6b5320 : 0x707780);
    const m = mesh(new T.BoxGeometry(w, h, d), [side, side, top, top, side, side], x, (y || 0) + h / 2, z);
    return m;
  }
  // détails d'immeuble : hall d'entrée vitré avec auvent, climatiseurs et château d'eau sur le toit, acrotère
  function bldgDetails(g, w, h, d, opt = {}) {
    const z = d / 2, dark = col(0x2b2f36), glassM = col(0x9fd0ff, { metalness: .6, roughness: .08, emissive: night ? 0xffe0a0 : 0, emissiveIntensity: .5 });
    g.add(box(Math.min(5, w * .45), 2.8, .12, glassM, 0, 0, z + .03)); g.add(box(Math.min(5, w * .45) + .4, .25, 1.6, dark, 0, 3, z + .75));
    [-1, 1].forEach(s => g.add(cyl(.06, .06, 3, col(0xb8bec7, { metalness: .9 }), s * (Math.min(5, w * .45) / 2 + .1), 0, z + 1.45, 8)));
    if (opt.sign) { const sg = new T.Mesh(new T.PlaneGeometry(Math.min(5, w * .45), .5), signTex(opt.sign, '#1e2430')); sg.position.set(0, 3.42, z + 1.56); g.add(sg); }
    g.add(box(w + .1, .6, .2, col(0x6b717a), 0, h, z - .05)); g.add(box(w + .1, .6, .2, col(0x6b717a), 0, h, -z + .05));
    for (let i = 0; i < Math.max(1, Math.round(w / 5)); i++) g.add(box(1.2, .8, .9, col(0xc9ced6, { metalness: .4 }), -w / 2 + 1.5 + i * 2.6, h, -d / 4));
    if (h > 14) { g.add(cyl(1, 1, 1.8, col(0x8b5a2b), w / 4, h + .9, d / 5, 12)); [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]].forEach(([a, b]) => g.add(cyl(.05, .05, .9, dark, w / 4 + a, h, d / 5 + b, 6))); }
    if (opt.balconies) for (let y = 3.2; y < h - 1; y += 3.2) { g.add(box(w * .9, .12, 1.1, col(0xdedad2), 0, y, z + .55)); g.add(box(w * .9, .9, .05, col(0x6d7680, { metalness: .5, roughness: .3, transparent: true, opacity: .55 }), 0, y + .12, z + 1.08)); }
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
      g.add(tower(kind, 9, 15, 8)); g.add(box(9.6, .5, 8.6, col(0x5f6670), 0, 15, 0)); bldgDetails(g, 9, 15, 8, { balconies: true });
      g.add(box(2.5, 2, 2.5, col(0x8a8f96), 2, 15.5, -1.5)); g.add(cyl(.9, .9, 2.2, col(0x6d7680), -2.5, 15.5, 1.5, 10));
      g.add(box(3, 2.4, .2, col(0x2d3436), 0, 0, 4.05));
      return 18;
    },
    function office(g, r) { // 5 : tour avec retraits
      g.add(tower('grey', 10, 18, 10)); bldgDetails(g, 10, 18, 10); g.add(tower('glass', 8, 12, 8, 0, 18, 0)); g.add(box(5, 2, 5, col(0x4b5563), 0, 30, 0));
      g.add(box(4, 3, .2, col(0x111827), 0, 0, 5.05));
      return 33;
    },
    function skyscraper(g, r) { // 6 : gratte-ciel + antenne clignotante
      g.add(tower('glass', 11, 26, 11)); bldgDetails(g, 11, 26, 11); g.add(tower('glass', 9, 16, 9, 0, 26, 0)); g.add(tower('glass', 6.5, 10, 6.5, 0, 42, 0));
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
  // Manoir : grande bâtisse en pierre, toits d'ardoise, tourelles, perron et allée
  function manor(g, r) {
    const stone = col(0xd9cdb4), slate = col(0x3d4655), white = col(0xffffff), win = col(0x9fd0ff, { emissive: night ? 0xffd27a : 0, emissiveIntensity: .7 });
    g.add(box(14, .4, 9, col(0xbfb39a), 0, 0, -1));
    g.add(box(12, 6, 7, stone, 0, .4, -1)); g.add(gable(12.8, 3.4, 7.6, slate, 0, 6.4, -1));
    g.add(box(4, 5, 4.2, stone, 0, .4, 3.3)); g.add(gable(4.6, 2.6, 4.6, slate, 0, 5.4, 3.3)); // avant-corps
    [-6.4, 6.4].forEach(x => { g.add(cyl(1.6, 1.7, 8.4, stone, x, .4, -1, 18)); g.add(mesh(new T.ConeGeometry(2, 3.6, 18), slate, x, 10.6, -1)); });
    for (let i = -2; i <= 2; i++) if (i) { g.add(box(1.1, 1.5, .12, win, i * 2.3, 1.6, 2.52)); g.add(box(1.1, 1.5, .12, win, i * 2.3, 4.2, 2.52)); }
    g.add(box(1.6, 2.6, .15, col(0x5b3a1e), 0, .4, 5.42)); g.add(box(2.2, .25, .4, white, 0, 3.1, 5.5));
    [[-1.4, 5.6], [1.4, 5.6]].forEach(([x, z]) => g.add(cyl(.22, .22, 2.8, white, x, .4, z, 10)));
    g.add(box(3.2, .3, 1.6, col(0xcfc5b0), 0, 0, 6.2)); g.add(box(2.6, .08, 4, col(0xd8c9a3), 0, .05, 8.4)); // perron et allée
    [-3.5, 3.5].forEach(x => g.add(cyl(.9, .9, 1.4, col(0x2e8b3a), x, 0, 7.2, 10)));
    g.add(cyl(.08, .08, 3, col(0x777777), 0, 9.8, -1, 6)); g.add(box(1.2, .8, .05, col(0x7a1f2b), .6, 12, -1));
    return 13;
  }
  // personnage 3D à taille humaine (1,80 m) : bras, coudes, mains, jambes, genoux, pieds ; visage et tenue tirés de l'avatar
  const SKINS = ['#ffe3cc', '#f9d0b0', '#eab38f', '#d6a06f', '#b67d52', '#8f5c3b', '#6b4029', '#47291a'];
  const HAIRS = ['#17110e', '#3b2416', '#6a4126', '#a2683b', '#d6a25a', '#1a1a1a'];
  const hexN = (c, d) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); return m ? parseInt(m[1], 16) : d; };
  function faceTex(av, emoji, skin) { // texture de la tête : visage dessiné sur la sphère (u = 0,25 : face avant)
    return canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = skin; g.fillRect(0, 0, w, h);
      const cx = w * .25;
      if (!av) { g.font = '58px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji || '🙂', cx, h * .52); return; }
      const ec = av.ec || '#3b2416', sleepy = av.eyes === 'endormi';
      [-1, 1].forEach(s => {
        const x = cx + s * 12, y = h * .44;
        if (sleepy || (av.eyes === 'clin' && s > 0)) { g.strokeStyle = '#2a1a12'; g.lineWidth = 2.4; g.beginPath(); g.arc(x, y, 5, .15 * Math.PI, .85 * Math.PI); g.stroke(); }
        else { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, 6.5, 5, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = ec; g.beginPath(); g.arc(x, y + .5, 3.6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x, y + .5, 1.7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.fillRect(x + .6, y - 1.6, 1.4, 1.4); }
        if (av.brows !== 'aucun') { g.strokeStyle = av.hc || '#3b2416'; g.lineWidth = av.brows === 'epais' ? 3.4 : 2.2; g.beginPath(); const tilt = av.brows === 'colere' ? s * 2.5 : av.brows === 'surpris' ? -2 : 0; g.moveTo(x - 6, y - 9 - tilt); g.lineTo(x + 6, y - 9 + tilt); g.stroke(); }
      });
      g.fillStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.ellipse(cx, h * .56, 3, 2, 0, 0, Math.PI * 2); g.fill(); // nez
      const my = h * .69; g.strokeStyle = '#7a2e2e'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath();
      if (av.mouth === 'o') { g.fillStyle = '#5a1d1d'; g.arc(cx, my, 3.4, 0, Math.PI * 2); g.fill(); }
      else if (av.mouth === 'neutre') { g.moveTo(cx - 7, my); g.lineTo(cx + 7, my); g.stroke(); }
      else if (av.mouth === 'dents' || av.mouth === 'langue') { g.fillStyle = '#5a1d1d'; g.arc(cx, my - 2, 8, 0, Math.PI); g.fill(); g.fillStyle = av.mouth === 'langue' ? '#e05a6a' : '#fff'; g.fillRect(cx - 6, my - 2, 12, av.mouth === 'langue' ? 5 : 2.5); }
      else { g.arc(cx, my - 5, 8, .2 * Math.PI, .8 * Math.PI); g.stroke(); }
      if (av.beard && av.beard !== 'aucune') { g.fillStyle = av.beard === 'ombre' ? 'rgba(40,25,15,.28)' : (av.hc || '#3b2416'); if (av.beard === 'moustache') g.fillRect(cx - 9, my - 7, 18, 3.5); else if (av.beard === 'bouc') g.fillRect(cx - 5, my + 4, 10, 8); else { g.beginPath(); g.ellipse(cx, my + 4, 22, 13, 0, 0, Math.PI); g.fill(); } }
      if (av.extra === 'joues') { g.fillStyle = 'rgba(255,90,110,.28)'; [-1, 1].forEach(s => { g.beginPath(); g.arc(cx + s * 17, h * .6, 5, 0, Math.PI * 2); g.fill(); }); }
    });
  }
  function person(emoji, color, me, look, seed) {
    const av = look && look.av, r = rng(seed || emoji || 'p');
    const skin = (av && av.sk) || SKINS[(r() * SKINS.length) | 0], hairC = (av && av.hc) || HAIRS[(r() * HAIRS.length) | 0];
    const suit = av && av.cloth === 'costume';
    const shirtC = av && av.cc ? hexN(av.cc, color) : color;
    const mSkin = col(hexN(skin, 0xeab38f), { roughness: .6 }), mShirt = col(suit ? 0x1f2430 : shirtC, { roughness: .85 }), mPants = col(suit ? 0x1f2430 : [0x2c3e5a, 0x222831, 0x5b4636, 0x3d405b][(r() * 4) | 0], { roughness: .9 });
    const mShoe = col(suit ? 0x0d0d0d : [0xf2f2f2, 0x1a1a1a, 0x7a4b2a][(r() * 3) | 0], { roughness: .5 }), mHair = col(hexN(hairC, 0x3b2416), { roughness: .8 });
    const g = new T.Group(), cap = (rad, len, m) => new T.Mesh(new T.CapsuleGeometry(rad, len, 4, 10), m);
    const hips = new T.Group(); hips.position.y = .95; g.add(hips);
    const pel = new T.Mesh(new T.BoxGeometry(.32, .2, .2), mPants); hips.add(pel);
    const spine = new T.Group(); spine.position.y = .06; hips.add(spine);
    const torso = cap(.165, .26, mShirt); torso.position.y = .27; torso.scale.set(1.18, 1, .72); spine.add(torso);
    if (suit) { const tie = new T.Mesh(new T.BoxGeometry(.05, .28, .02), col(av.cc ? hexN(av.cc, 0xc0392b) : 0xc0392b)); tie.position.set(0, .3, .125); spine.add(tie); const shirt = new T.Mesh(new T.BoxGeometry(.1, .3, .02), col(0xffffff)); shirt.position.set(0, .3, .12); spine.add(shirt); }
    if (av && av.cloth === 'hoodie') { const hood = new T.Mesh(new T.TorusGeometry(.12, .045, 6, 12), mShirt); hood.rotation.x = Math.PI / 2; hood.position.set(0, .5, -.05); spine.add(hood); }
    const neck = new T.Mesh(new T.CylinderGeometry(.055, .06, .1, 8), mSkin); neck.position.y = .5; spine.add(neck);
    const head = new T.Group(); head.position.y = .64; spine.add(head);
    const skull = new T.Mesh(new T.SphereGeometry(.118, 20, 14), new T.MeshStandardMaterial({ map: faceTex(av, emoji, skin), roughness: .6 })); skull.scale.set(.95, 1.08, 1); head.add(skull);
    [-1, 1].forEach(s => { const ear = new T.Mesh(new T.SphereGeometry(.028, 8, 6), mSkin); ear.position.set(s * .11, 0, -.005); ear.scale.set(.6, 1, .8); head.add(ear); });
    const hs = av ? av.hair : ['court', 'raie', 'long', 'pics', 'rase'][(r() * 5) | 0];
    if (hs !== 'rase' && hs !== 'chauve') {
      const big = hs === 'afro' ? 1.35 : hs === 'boucles' ? 1.12 : 1.03;
      const top = new T.Mesh(new T.SphereGeometry(.124 * big, 18, 10, 0, Math.PI * 2, 0, Math.PI * (hs === 'afro' ? .62 : .5)), mHair); top.position.set(0, .012, -.008); top.scale.set(.98, 1.1, 1.04); head.add(top);
      if (hs === 'long' || hs === 'queue') { const back = new T.Mesh(new T.BoxGeometry(.22, hs === 'long' ? .3 : .22, .06), mHair); back.position.set(0, -.08, -.1); head.add(back); }
      if (hs === 'chignon') { const bun = new T.Mesh(new T.SphereGeometry(.05, 10, 8), mHair); bun.position.set(0, .12, -.06); head.add(bun); }
      if (hs === 'pics' || hs === 'crete') for (let i = 0; i < 5; i++) { const sp = new T.Mesh(new T.ConeGeometry(.03, .08, 6), mHair); sp.position.set(hs === 'crete' ? 0 : (i - 2) * .04, .13, (i - 2) * .025); head.add(sp); }
    }
    const J = { hips, spine, head };
    [-1, 1].forEach(s => {
      const sh = new T.Group(); sh.position.set(s * .225, .43, 0); spine.add(sh);
      const ua = cap(.052, .2, mShirt); ua.position.y = -.14; sh.add(ua);
      const el = new T.Group(); el.position.y = -.28; sh.add(el);
      const fa = cap(.045, .18, suit ? mShirt : mSkin); fa.position.y = -.12; el.add(fa);
      const hand = new T.Group(); hand.position.y = -.25; el.add(hand);
      const palm = new T.Mesh(new T.BoxGeometry(.07, .08, .03), mSkin); palm.position.y = -.03; hand.add(palm);
      for (let fi = 0; fi < 4; fi++) { const fg = cap(.01, .045, mSkin); fg.position.set(-.026 + fi * .0175, -.095, .002); hand.add(fg); }
      const thb = cap(.012, .035, mSkin); thb.position.set(-s * .04, -.045, .02); thb.rotation.z = s * .6; hand.add(thb);
      const hip = new T.Group(); hip.position.set(s * .095, -.06, 0); hips.add(hip);
      const th = cap(.075, .3, mPants); th.position.y = -.21; hip.add(th);
      const kn = new T.Group(); kn.position.y = -.43; hip.add(kn);
      const sn = cap(.06, .3, mPants); sn.position.y = -.2; kn.add(sn);
      const ft = new T.Mesh(new T.BoxGeometry(.1, .07, .25), mShoe); ft.position.set(0, -.43, .045); kn.add(ft);
      const sole = new T.Mesh(new T.BoxGeometry(.105, .025, .26), col(0xf0f0f0)); sole.position.set(0, -.47, .045); kn.add(sole);
      J[s < 0 ? 'L' : 'R'] = { sh, el, hip, kn, hand };
    });
    if (me) { const ring = mesh(new T.TorusGeometry(.42, .035, 8, 28), new T.MeshBasicMaterial({ color: 0xffd23f }), 0, .03, 0, false); ring.rotation.x = Math.PI / 2; g.add(ring); g.userData.ring = ring; }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    let pose = null;
    function set(ph, amp, run, t) {
      const s = Math.sin(ph), c = Math.cos(ph), A = run ? .85 : .5, K = run ? 1.5 : .85, B = run ? .8 : .45;
      J.L.hip.rotation.x = -s * A * amp; J.R.hip.rotation.x = s * A * amp;
      J.L.kn.rotation.x = Math.max(0, c) * K * amp + .05; J.R.kn.rotation.x = Math.max(0, -c) * K * amp + .05;
      J.L.sh.rotation.x = s * B * amp; J.R.sh.rotation.x = -s * B * amp;
      J.L.el.rotation.x = J.R.el.rotation.x = -(run ? 1.3 : .25) * amp - .08;
      J.L.sh.rotation.z = -.06; J.R.sh.rotation.z = .06;
      hips.position.y = .95 - (run ? .05 : 0) * amp + Math.abs(c) * (run ? .05 : .025) * amp;
      spine.rotation.x = (run ? .2 : .04) * amp; spine.rotation.y = s * .08 * amp; hips.rotation.y = -s * .06 * amp;
      const br = Math.sin(t * 2.2) * .012 * (1 - amp); torso.scale.y = 1 + br; head.rotation.x = -spine.rotation.x * .6;
      J.L.hip.rotation.z = J.R.hip.rotation.z = 0;
      if (pose === 'sit') { [J.L, J.R].forEach(j => { j.hip.rotation.x = -1.45; j.kn.rotation.x = 1.35; j.sh.rotation.x = -.95; j.el.rotation.x = -.35; }); hips.position.y = .95; spine.rotation.x = .1; }
      if (pose === 'ride') { [J.L, J.R].forEach((j, i) => { j.hip.rotation.x = -.9; j.kn.rotation.x = 1.2; j.hip.rotation.z = (i ? -1 : 1) * .12; j.sh.rotation.x = -1.05; j.el.rotation.x = -.3; }); spine.rotation.x = .25; hips.position.y = .95; }
      if (pose === 'stand') { [J.L, J.R].forEach(j => { j.hip.rotation.x = 0; j.kn.rotation.x = .05; j.sh.rotation.x = -.8; j.el.rotation.x = -.6; }); hips.position.y = .95; spine.rotation.x = .08; }
      if (pose === 'aim') { J.R.sh.rotation.x = -1.5; J.R.el.rotation.x = 0; J.L.sh.rotation.x = -1.35; J.L.sh.rotation.z = .45; J.L.el.rotation.x = -.35; }
    }
    let ph = 0;
    g.userData.walk = (t, k) => set(t * 5 + k, 1, false, t);
    g.userData.still = t => set(0, 0, false, t || 0);
    g.userData.step = (dt, speed, run, t) => { ph += dt * (run ? 11 : 7.5) * Math.min(1.4, speed / (run ? 6.5 : 3.2)); set(ph, Math.min(1, speed / 1.2), run, t); };
    g.userData.pose = p => { pose = p; };
    g.userData.joints = J;
    return g;
  }
  const SKIN = [0xe63946, 0x3a86ff, 0x2a9d8f, 0xf4a261, 0x8338ec, 0x06d6a0, 0xff006e, 0x264653, 0xffbe0b];
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

  /* ---------- Véhicules 3D : silhouette selon le modèle acheté, couleurs du modèle ---------- */
  const VSTYLE = { kart: 'kart', bumper: 'bumper', 'scooter-elec': 'kick', vespa: 'scooter', mt07: 'moto', clio: 'hatch', golfr: 'hatch', model3: 'sedan', taycan: 'sedan', m3: 'sedan', conti: 'gt', g63: 'g', urus: 'suv', puro: 'suv', cullinan: 'suv', '911': 'sport', gt3rs: 'sportw', roma: 'gt', db12: 'gt', r8: 'super', huracan: 'super', sto: 'superw', '296': 'super', '750s': 'super', sf90: 'super', revuelto: 'super', f40: 'superw', utopia: 'super', jesko: 'superw', chiron: 'hyper', tourbillon: 'hyper' };
  V.vstyle = it => VSTYLE[it.id] || (it.emoji === '🛴' ? 'kick' : it.emoji === '🛵' ? 'scooter' : it.emoji === '🏍️' ? 'moto' : it.emoji === '🚙' ? 'suv' : it.price > 150000 ? 'super' : it.price > 60000 ? 'sport' : 'hatch');
  const PROF = { // profil vu de côté : [x (vers l'avant), y] en mètres
    hatch: { L: 4.05, W: 1.78, wb: 2.55, wr: .32, ly: .62, body: [[-2.02, .3], [-2.05, .86], [-1.75, 1.0], [1.3, 1.0], [1.95, .82], [2.02, .55], [2.0, .3]], cab: [[-1.9, .98], [-1.68, 1.46], [.15, 1.49], [.98, .99]] },
    sedan: { L: 4.7, W: 1.85, wb: 2.85, wr: .33, ly: .62, body: [[-2.35, .32], [-2.38, .82], [-2.0, .95], [1.6, .95], [2.3, .72], [2.36, .5], [2.3, .32]], cab: [[-1.78, .93], [-1.1, 1.42], [.45, 1.44], [1.28, .94]] },
    gt: { L: 4.75, W: 1.95, wb: 2.8, wr: .34, ly: .6, body: [[-2.38, .3], [-2.4, .78], [-2.0, .88], [1.7, .86], [2.35, .62], [2.4, .42], [2.35, .3]], cab: [[-1.62, .86], [-.7, 1.28], [.25, 1.3], [1.18, .85]] },
    sport: { L: 4.5, W: 1.85, wb: 2.45, wr: .33, ly: .6, body: [[-2.25, .3], [-2.28, .8], [-1.9, .9], [1.4, .86], [2.2, .58], [2.27, .4], [2.2, .3]], cab: [[-1.98, .9], [-.9, 1.3], [.2, 1.3], [1.08, .85]] },
    super: { L: 4.55, W: 2.0, wb: 2.65, wr: .34, ly: .55, body: [[-2.27, .28], [-2.3, .85], [-1.6, .9], [1.0, .82], [2.25, .48], [2.28, .3]], cab: [[-1.52, .88], [-.65, 1.18], [.25, 1.18], [1.08, .81]] },
    hyper: { L: 4.6, W: 2.05, wb: 2.7, wr: .35, ly: .58, body: [[-2.3, .28], [-2.32, .9], [-1.4, .98], [1.1, .85], [2.27, .5], [2.3, .3]], cab: [[-1.32, .96], [-.5, 1.2], [.35, 1.2], [1.12, .84]] },
    suv: { L: 5.0, W: 2.0, wb: 3.0, wr: .42, ly: .88, body: [[-2.48, .45], [-2.5, 1.1], [-2.2, 1.18], [1.9, 1.15], [2.45, .95], [2.5, .6], [2.45, .45]], cab: [[-2.32, 1.16], [-2.12, 1.86], [.9, 1.88], [1.58, 1.14]] },
    g: { L: 4.85, W: 1.98, wb: 2.9, wr: .42, ly: .9, body: [[-2.42, .48], [-2.45, 1.15], [2.38, 1.15], [2.42, .48]], cab: [[-2.32, 1.13], [-2.3, 1.96], [1.0, 1.96], [1.24, 1.13]] },
  };
  function twoWheel(color, style) {
    const g = new T.Group(), paint = col(color, { metalness: .5, roughness: .3 }), dark = col(0x1c1c1c, { roughness: .7 }), metal = col(0xb8bec7, { metalness: .9, roughness: .3 });
    const wheels = [];
    if (style === 'kick') {
      [.42, -.42].forEach(z => { const w = wheel(.11, .05, 0x2b2b2b); w.position.set(0, .11, z); g.add(w); wheels.push(w); });
      g.add(box(.16, .05, .82, dark, 0, .12, 0)); g.add(box(.17, .04, .22, paint, 0, .16, -.28));
      const stem = mesh(new T.CylinderGeometry(.022, .022, 1.02, 8), metal, 0, .66, .47); stem.rotation.x = -.1; g.add(stem);
      const bar = mesh(new T.CylinderGeometry(.018, .018, .52, 8), dark, 0, 1.16, .52); bar.rotation.z = Math.PI / 2; g.add(bar);
      Object.assign(g.userData, { seat: .17, pose: 'stand', len: .95, wid: .5, eye: 1.78 });
    } else if (style === 'scooter') {
      [.66, -.62].forEach(z => { const w = wheel(.2, .1); w.position.set(0, .2, z); g.add(w); wheels.push(w); });
      g.add(extrudeSide([[-.88, .22], [-.92, .62], [-.62, .8], [-.12, .72], [.28, .42], [.5, .45], [.58, 1.02], [.74, 1.02], [.82, .42], [.74, .22]], .44, paint, .05));
      g.add(box(.3, .12, .6, col(0x5a3a22, { roughness: .6 }), 0, .8, -.42));
      const bar = mesh(new T.CylinderGeometry(.02, .02, .62, 8), metal, 0, 1.08, .66); bar.rotation.z = Math.PI / 2; g.add(bar);
      g.add(mesh(new T.SphereGeometry(.07, 10, 8), new T.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff2c0, emissiveIntensity: .6 }), 0, 1.0, .8, false));
      Object.assign(g.userData, { seat: .86, pose: 'ride', len: 1.85, wid: .7, eye: 1.62 });
    } else if (style === 'kart') {
      [[.48, .52], [-.48, .52], [.5, -.5], [-.5, -.5]].forEach(([x, z]) => { const w = wheel(z > 0 ? .13 : .15, .18, 0x333333); w.position.set(x, z > 0 ? .13 : .15, z); g.add(w); wheels.push(w); });
      g.add(box(.9, .06, 1.5, dark, 0, .08, 0)); g.add(box(1.05, .16, .3, paint, 0, .1, .8)); g.add(box(.75, .14, .22, paint, 0, .1, -.82));
      [-1, 1].forEach(s => g.add(box(.14, .12, 1.0, paint, s * .5, .1, 0)));
      g.add(box(.44, .4, .1, dark, 0, .14, -.32)); g.add(box(.44, .06, .4, dark, 0, .14, -.12));
      const sw = mesh(new T.TorusGeometry(.13, .02, 6, 16), dark, 0, .5, .36); sw.rotation.x = -.9; g.add(sw);
      Object.assign(g.userData, { seat: .2, pose: 'sit', len: 1.75, wid: 1.15, eye: 1.0, lean: false });
    } else if (style === 'bumper') {
      const ring = new T.Mesh(new T.TorusGeometry(.95, .16, 10, 28), dark); ring.rotation.x = Math.PI / 2; ring.position.y = .24; ring.scale.set(1, 1.25, 1); g.add(ring);
      const tub = mesh(new T.CylinderGeometry(.9, .95, .4, 28), paint, 0, .1, 0); tub.scale.set(1, 1, 1.25); g.add(tub);
      const cowl = mesh(new T.SphereGeometry(.85, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, .5, .45); cowl.scale.set(1, .55, .7); g.add(cowl);
      g.add(box(.6, .5, .12, dark, 0, .5, -.6)); g.add(box(.6, .08, .5, dark, 0, .5, -.35));
      const sw = mesh(new T.TorusGeometry(.14, .025, 6, 16), dark, 0, .85, .25); sw.rotation.x = -.9; g.add(sw);
      g.add(cyl(.02, .02, 3.9, col(0x888888, { metalness: .8 }), 0, .5, -.75, 6));
      Object.assign(g.userData, { seat: .55, pose: 'sit', len: 2.3, wid: 1.9, eye: 1.4, lean: false });
    } else {
      [.74, -.7].forEach(z => { const w = wheel(.31, .14, 0x2a2a2a); w.position.set(0, .31, z); g.add(w); wheels.push(w); });
      g.add(extrudeSide([[-.55, .58], [-.48, .82], [.08, .98], [.46, .92], [.58, .64], [.05, .52]], .34, paint, .05));
      g.add(box(.28, .1, .6, dark, 0, .84, -.42)); g.add(box(.3, .32, .44, col(0x2b2b2b, { metalness: .6 }), 0, .3, -.02));
      [-1, 1].forEach(s => { const f = mesh(new T.CylinderGeometry(.03, .03, .78, 8), metal, s * .1, .62, .58); f.rotation.x = .38; g.add(f); });
      const bar = mesh(new T.CylinderGeometry(.02, .02, .7, 8), dark, 0, 1.06, .5); bar.rotation.z = Math.PI / 2; g.add(bar);
      const ex = mesh(new T.CylinderGeometry(.05, .06, .5, 10), metal, .16, .38, -.55); ex.rotation.x = Math.PI / 2 - .2; g.add(ex);
      g.add(mesh(new T.SphereGeometry(.08, 10, 8), new T.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff2c0, emissiveIntensity: .6 }), 0, .95, .72, false));
      Object.assign(g.userData, { seat: .88, pose: 'ride', len: 2.05, wid: .8, eye: 1.64 });
    }
    g.userData.wheels = wheels; g.userData.vs = style; g.userData.bike = true;
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function extrudeSide(pts, width, mat, bev, smooth) {
    const sh = new T.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
    if (smooth && pts.length > 3) { sh.splineThru(pts.slice(1, -1).map(p => new T.Vector2(p[0], p[1]))); sh.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); }
    else pts.slice(1).forEach(([x, y]) => sh.lineTo(x, y));
    sh.lineTo(pts[0][0], pts[0][1]);
    const d = Math.max(.02, width - bev * 2), geo = new T.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 12 });
    geo.rotateY(-Math.PI / 2); geo.translate(d / 2, 0, 0); geo.computeVertexNormals();
    const m = new T.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function wheel(r, w, rimC) {
    const g = new T.Group();
    const tire = new T.Mesh(new T.CylinderGeometry(r, r, w, 24), col(0x121212, { roughness: .92 })); tire.rotation.z = Math.PI / 2; g.add(tire);
    const side = new T.Mesh(new T.TorusGeometry(r * .82, r * .16, 8, 24), col(0x1d1d1d, { roughness: .8 })); side.rotation.y = Math.PI / 2; side.position.x = w / 2 - .01; g.add(side); const side2 = side.clone(); side2.position.x = -w / 2 + .01; g.add(side2);
    const rimM = col(rimC || 0xd3d8df, { metalness: .95, roughness: .18 });
    const rim = new T.Mesh(new T.CylinderGeometry(r * .62, r * .62, w + .03, 18), rimM); rim.rotation.z = Math.PI / 2; g.add(rim);
    for (let i = 0; i < 5; i++) { const sp = new T.Mesh(new T.BoxGeometry(w + .05, r * .95, r * .12), col(0x9ca3ad, { metalness: .9, roughness: .3 })); sp.rotation.x = i / 5 * Math.PI; g.add(sp); }
    const hub = new T.Mesh(new T.CylinderGeometry(r * .18, r * .18, w + .07, 10), col(0x2b2b2b)); hub.rotation.z = Math.PI / 2; g.add(hub);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  let plateN = 100;
  function plateTex() { const n = 'TC-' + (plateN++) + '-' + String.fromCharCode(65 + plateN % 26) + String.fromCharCode(65 + (plateN * 7) % 26); return canvasTex(128, 32, (c, w, h) => { c.fillStyle = '#f7f7f7'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d4fbf'; c.fillRect(0, 0, 12, h); c.fillRect(w - 12, 0, 12, h); c.fillStyle = '#111'; c.font = 'bold 20px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n, w / 2, h / 2 + 1); }); }
  function car(color, sport, style) {
    style = style || (sport ? 'sport' : 'hatch');
    if (style === 'kick' || style === 'scooter' || style === 'moto' || style === 'kart' || style === 'bumper') return twoWheel(color, style);
    const wing = /w$/.test(style), key = style.replace(/w$/, ''), P = PROF[key] || PROF.hatch, smooth = key !== 'g';
    const g = new T.Group();
    const paint = col(color, { metalness: .65, roughness: .22, envMapIntensity: 1.3 }), glass = col(0x0e1620, { metalness: .9, roughness: .04, envMapIntensity: 1.6 }), dark = col(0x161616, { roughness: .75 }), chrome = col(0xe6e9ee, { metalness: 1, roughness: .12 });
    g.add(extrudeSide(P.body, P.W, paint, .09, smooth));
    const cab = extrudeSide(P.cab, P.W - .26, glass, .05, smooth); g.add(cab);
    // toit couleur carrosserie, montants, baguette chromée
    const rx0 = Math.min(P.cab[1][0], P.cab[2][0]) + .06, rx1 = Math.max(P.cab[1][0], P.cab[2][0]) - .06, ry = Math.min(P.cab[1][1], P.cab[2][1]);
    g.add(box(P.W - .3, .05, rx1 - rx0, paint, 0, ry + .005, (rx0 + rx1) / 2));
    [-1, 1].forEach(s => {
      g.add(box(.03, .04, P.cab[3][0] - P.cab[0][0] - .2, chrome, s * (P.W / 2 - .12), P.cab[0][1] + .02, (P.cab[0][0] + P.cab[3][0]) / 2));
      g.add(box(.05, (ry - P.cab[0][1]) * .92, .1, paint, s * (P.W / 2 - .14), P.cab[0][1], (rx0 + rx1) / 2 - .1));
    });
    g.add(box(P.W - .16, .14, P.L - .7, dark, 0, .2, 0));
    const wb = P.wb / 2, tr = P.W / 2 - .14, wheels = [];
    [[-tr, wb], [tr, wb], [-tr, -wb], [tr, -wb]].forEach(([x, z]) => {
      const w = wheel(P.wr, .26, /super|hyper|sport|gt/.test(key) ? 0x2b2d31 : null); w.position.set(x, P.wr, z); g.add(w); wheels.push(w);
      const arch = new T.Mesh(new T.TorusGeometry(P.wr + .08, .06, 6, 18, Math.PI), dark); arch.rotation.y = Math.PI / 2; arch.position.set(x + Math.sign(x) * .1, P.wr, z); g.add(arch);
    });
    const hl = new T.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff2c0, emissiveIntensity: night ? 1.4 : .45, metalness: .3, roughness: .1 }), tl = new T.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff0000, emissiveIntensity: night ? 1.2 : .45 });
    const fz = Math.max(...P.body.map(p => p[0])), rz = Math.min(...P.body.map(p => p[0]));
    [-1, 1].forEach(s => {
      g.add(mesh(new T.BoxGeometry(.46, .1, .1), hl, s * (P.W / 2 - .34), P.ly, fz + .04, false));
      g.add(mesh(new T.BoxGeometry(.5, .09, .08), tl, s * (P.W / 2 - .32), P.ly + .08, rz - .04, false));
      const mir = box(.18, .1, .14, paint, s * (P.W / 2 + .06), P.cab[0][1] + .05, P.cab[3][0] - .3); g.add(mir);
      g.add(box(.12, .03, .02, chrome, s * (P.W / 2 - .02), P.cab[0][1] - .18, (P.cab[0][0] + P.cab[3][0]) / 2 + .3)); // poignée
    });
    g.add(box(P.W * (key === 'suv' || key === 'g' ? .6 : .45), key === 'super' || key === 'hyper' ? .12 : .22, .05, dark, 0, P.ly - .2, fz + .07)); // calandre
    const pl = new T.MeshBasicMaterial({ map: plateTex() });
    [[fz + .1, 0], [rz - .1, Math.PI]].forEach(([z, ry2]) => { const p = new T.Mesh(new T.PlaneGeometry(.52, .13), pl); p.position.set(0, P.ly - .22, z); p.rotation.y = ry2; g.add(p); });
    if (/super|hyper|sport|gt/.test(key)) [-.3, .3].forEach(x => { const ex = mesh(new T.CylinderGeometry(.05, .05, .15, 10), chrome, x, .3, rz - .02); ex.rotation.x = Math.PI / 2; g.add(ex); });
    if (wing) { [-.5, .5].forEach(x => g.add(box(.06, .32, .1, dark, x, P.body[1][1], rz + .35))); g.add(box(P.W - .1, .05, .42, dark, 0, P.body[1][1] + .32, rz + .3)); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData = { wheels, vs: style, len: P.L, wid: P.W, eye: P.cab[1][1] - .18, seatX: .4 };
    return g;
  }
  const CAR_COLORS = [0xd62828, 0xf77f00, 0xfcbf49, 0x2a9d8f, 0x264653, 0xffffff, 0x111111, 0x3a86ff, 0x8338ec, 0x06d6a0, 0xc0c0c0];
  const TRAFFIC = ['hatch', 'hatch', 'sedan', 'sedan', 'suv', 'sport', 'gt', 'g'];

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

  /* ---------- Quartiers de remplissage (la ville est plus grande que le nombre de joueurs) ---------- */
  const fair = {};
  function signTex(txt, bg, fg) { return new T.MeshBasicMaterial({ map: canvasTex(256, 64, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg || '#fff'; c.font = 'bold 30px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2 + 2); }) }); }
  function storefront(g, x, z, w, kind) {
    const S2 = { boul: ['🥖 Boulangerie', '#c47f2c'], cafe: ['☕ Café', '#6b4226'], pizza: ['🍕 Pizzeria', '#c0392b'], phar: ['💊 Pharmacie', '#1f9d55'], coif: ['💈 Coiffeur', '#2f6bff'], tacos: ['🌮 Tacos', '#e67e22'], sport: ['👟 Sneakers', '#111111'], phone: ['📱 Téléphonie', '#7a3fd0'] }[kind];
    const h = 3.6;
    g.add(box(w, h, 5, col(0xf1ede4), x, 0, z)); g.add(box(w + .2, .3, 5.2, col(0x6b6f76), x, h, z));
    g.add(box(w - .8, 2.2, .08, col(0x9fd0ff, { emissive: night ? 0xffd27a : 0, emissiveIntensity: .6, roughness: .2 }), x, .3, z + 2.52));
    const aw = box(w, .2, 1.3, col(parseInt(S2[1].slice(1), 16)), 0, 0, 0); aw.position.set(x, 2.9, z + 3); aw.rotation.x = .3; g.add(aw);
    const sg = new T.Mesh(new T.PlaneGeometry(w - .6, .6), signTex(S2[0], S2[1])); sg.position.set(x, 3.3, z + 2.56); g.add(sg);
  }
  const FILL = [
    function apts(g, r) {
      const kind = ['brick', 'cream', 'white', 'grey'][r() * 4 | 0], fl = 3 + (r() * 4 | 0), h = fl * 3.1;
      g.add(tower(kind, 14, h, 9, 0, 0, -3)); const gg = new T.Group(); gg.position.z = -3; g.add(gg); bldgDetails(gg, 14, h, 9, { balconies: r() < .5 });
      g.add(box(13.6, 2.6, .1, col(0x9fd0ff, { emissive: night ? 0xffd27a : 0, emissiveIntensity: .5 }), 0, .3, 1.55));
      const aw = box(14, .2, 1.4, col([0x1f9d55, 0xc0392b, 0x2f6bff][r() * 3 | 0]), 0, 0, 0); aw.position.set(0, 3, 2.2); aw.rotation.x = .3; g.add(aw);
      for (let i = 0; i < 3; i++) tree(g, -7 + i * 7, 8.5, .8);
      return h + 1;
    },
    function shopsRow(g, r) {
      const ks = ['boul', 'cafe', 'pizza', 'phar', 'coif', 'tacos', 'sport', 'phone'].sort(() => r() - .5);
      [-6.5, 0, 6.5].forEach((x, i) => storefront(g, x, -3, 6, ks[i]));
      [-8, 8].forEach(x => { g.add(box(1.6, .45, .5, col(0x8b5a2b), x, 0, 5)); });
      tree(g, 0, 6.5, .9);
      return 5;
    },
    function parking(g, r) {
      g.add(box(22, .06, 22, col(0x3f434a, { roughness: .95 }), 0, 0, 0));
      for (let i = 0; i < 7; i++) { g.add(box(.12, .02, 4.6, col(0xffffff), -9 + i * 3, .06, -6.5)); g.add(box(.12, .02, 4.6, col(0xffffff), -9 + i * 3, .06, 6.5)); }
      for (let i = 0; i < 6; i++) { if (r() < .3) continue; const c = car(CAR_COLORS[r() * CAR_COLORS.length | 0], false, TRAFFIC[r() * TRAFFIC.length | 0]); c.position.set(-7.5 + i * 3, 0, (i % 2 ? 6.5 : -6.5)); c.rotation.y = i % 2 ? Math.PI : 0; g.add(c); }
      const p = mesh(new T.CylinderGeometry(.1, .1, 4, 6), col(0x666b73), 9.5, 2, 9.5); g.add(p); g.add(box(1.4, 1.4, .08, signTex('P', '#1f5fd1'), 9.5, 4, 9.5));
      return 3;
    },
    function basket(g, r) {
      g.add(box(15, .08, 26 - 6, col(0xd9692b, { roughness: .9 }), 0, 0, 0));
      g.add(box(13, .09, 18, col(0x1f6fb2, { roughness: .9 }), 0, 0, 0));
      [[0, -8.2], [0, 8.2]].forEach(([x, z], i) => { const s = i ? -1 : 1; g.add(cyl(.08, .08, 3.2, col(0x555555), x, 0, z - s * .6, 8)); g.add(box(1.8, 1.1, .06, col(0xffffff), x, 2.9, z - s * .2)); const ring = mesh(new T.TorusGeometry(.23, .02, 6, 16), col(0xff5a1f), x, 3.05, z + s * .1); ring.rotation.x = Math.PI / 2; g.add(ring); });
      for (let i = 0; i < 2; i++) { const b = mesh(new T.SphereGeometry(.12, 12, 10), col(0xe8681f), -2 + i * 4, .12, 2 - i * 3); g.add(b); }
      return 4;
    },
    function garden(g, r) {
      for (let i = 0; i < 9; i++) tree(g, -8 + (i % 3) * 8 + (r() - .5) * 2, -8 + (i / 3 | 0) * 8 + (r() - .5) * 2, .8 + r() * .5);
      [[-3, 3], [3, -3]].forEach(([x, z]) => { g.add(box(2, .45, .6, col(0x8b5a2b), x, .1, z)); g.add(box(2, .5, .1, col(0x8b5a2b), x, .55, z - .3)); });
      g.add(cyl(1.6, 1.7, .5, col(0xbfc5cc), 0, 0, 0, 20)); g.add(mesh(new T.CylinderGeometry(1.4, 1.4, .1, 20), col(0x46b8ff, { emissive: 0x0c4a7a, emissiveIntensity: .4 }), 0, .5, 0, false));
      return 4;
    },
  ];

  /* ---------- Déco des maisons (objets qu'on achète et qu'on pose chez soi) ---------- */
  const DECO = {
    canape(g) { const f = col(0x34495e); g.add(box(2.2, .45, .9, f, 0, 0, 0)); g.add(box(2.2, .6, .25, f, 0, .45, -.33)); [-1, 1].forEach(s => g.add(box(.22, .65, .9, f, s * 1, 0, 0))); [-.5, .5].forEach(x => g.add(box(.9, .15, .65, col(0x4a6583), x, .45, .08))); },
    fauteuil(g) { const f = col(0x8e3b2f); g.add(box(.9, .45, .85, f)); g.add(box(.9, .6, .2, f, 0, .45, -.33)); [-1, 1].forEach(s => g.add(box(.18, .65, .85, f, s * .4, 0, 0))); },
    table(g) { const w = col(0x8b5a2b); g.add(box(1.6, .06, .9, w, 0, .72, 0)); [[-.72, -.38], [.72, -.38], [-.72, .38], [.72, .38]].forEach(([x, z]) => g.add(box(.07, .72, .07, w, x, 0, z))); },
    chaise(g) { const w = col(0x6d4c2f); g.add(box(.45, .05, .45, w, 0, .45, 0)); g.add(box(.45, .5, .05, w, 0, .5, -.2)); [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]].forEach(([x, z]) => g.add(box(.04, .45, .04, w, x, 0, z))); },
    lampe(g) { g.add(cyl(.18, .2, .05, col(0x222222), 0, 0, 0, 12)); g.add(cyl(.025, .025, 1.6, col(0x333333), 0, .05, 0, 6)); g.add(mesh(new T.ConeGeometry(.28, .32, 16, 1, true), col(0xfff3c4, { emissive: 0xffd27a, emissiveIntensity: .9, side: T.DoubleSide }), 0, 1.72, 0)); },
    plante(g) { g.add(cyl(.22, .17, .45, col(0xc0573b), 0, 0, 0, 12)); [[0, .9, 0, .32], [.15, .75, .1, .22], [-.14, .7, -.08, .24]].forEach(([x, y, z, rr]) => g.add(mesh(new T.SphereGeometry(rr, 10, 8), col(0x2e8b3a), x, y, z))); },
    tapis(g) { g.add(box(2.4, .02, 1.6, col(0x7a1f2b), 0, 0, 0)); g.add(box(2.1, .025, 1.3, col(0xd4af37), 0, 0, 0)); g.add(box(1.8, .03, 1.0, col(0x7a1f2b), 0, 0, 0)); },
    tele(g) { g.add(box(1.8, .5, .45, col(0x222222))); const s = new T.Mesh(new T.PlaneGeometry(1.9, 1.08), new T.MeshBasicMaterial({ map: chartTex(true) })); s.position.set(0, 1.15, .02); g.add(s); g.add(box(2, 1.2, .06, col(0x111111), 0, .55, -.02)); },
    arcade(g) { g.add(box(.75, 1.8, .7, col(0x2b1d5c))); const s = new T.Mesh(new T.PlaneGeometry(.55, .45), new T.MeshBasicMaterial({ map: canvasTex(128, 104, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#39ff14'; c.font = 'bold 16px monospace'; c.fillText('TRAD', 36, 40); c.fillText('ARCADE', 26, 64); c.fillStyle = '#ff2fd6'; c.fillRect(54, 78, 10, 10); }) })); s.position.set(0, 1.35, .36); s.rotation.x = -.2; g.add(s); g.add(box(.7, .08, .3, col(0x111111), 0, .95, .4)); },
    frigo(g) { g.add(box(.8, 1.9, .7, col(0xf2f2f2, { metalness: .3, roughness: .3 }))); g.add(box(.04, .5, .04, col(0x999999), .3, 1.1, .37)); g.add(box(.04, .3, .04, col(0x999999), .3, .5, .37)); },
    enceinte(g) { g.add(box(.5, 1.2, .45, col(0x151515))); [.35, .85].forEach((y, i) => { const c = mesh(new T.CylinderGeometry(i ? .1 : .17, i ? .1 : .17, .04, 16), col(0x333333), 0, y, .23); c.rotation.x = Math.PI / 2; g.add(c); }); },
    biblio(g) { const w = col(0x6b4423); g.add(box(1.4, 2, .35, w)); for (let i = 0; i < 4; i++) { g.add(box(1.3, .04, .32, col(0x4a2f17), 0, .45 + i * .45, .01)); for (let j = 0; j < 8; j++) g.add(box(.1, .32, .22, col([0xc0392b, 0x2980b9, 0x27ae60, 0xf1c40f, 0x8e44ad][(i * 3 + j) % 5]), -.55 + j * .15, .5 + i * .45, .02)); } },
    lit(g) { const w = col(0x5d3a1a); g.add(box(1.8, .45, 2.2, w)); g.add(box(1.7, .25, 2.05, col(0xffffff), 0, .45, .05)); g.add(box(1.7, .12, 1.3, col(0x3b82f6), 0, .7, .4)); g.add(box(1.8, 1.1, .1, w, 0, 0, -1.05)); [-.45, .45].forEach(x => g.add(box(.6, .14, .35, col(0xf5f5f5), x, .72, -.75))); },
    peluche(g) { const b = col(0x9b6b3d, { roughness: 1 }); g.add(mesh(new T.SphereGeometry(.55, 14, 12), b, 0, .55, 0)); g.add(mesh(new T.SphereGeometry(.38, 14, 12), b, 0, 1.3, 0)); [-1, 1].forEach(s => { g.add(mesh(new T.SphereGeometry(.13, 10, 8), b, s * .28, 1.6, 0)); g.add(mesh(new T.SphereGeometry(.18, 10, 8), b, s * .45, .75, .15)); g.add(mesh(new T.SphereGeometry(.2, 10, 8), b, s * .25, .2, .35)); g.add(mesh(new T.SphereGeometry(.04, 6, 6), col(0x111111), s * .12, 1.36, .33)); }); g.add(mesh(new T.SphereGeometry(.07, 8, 6), col(0x111111), 0, 1.24, .37)); },
    sapin(g) { tree(g, 0, 0, .55, true); },
  };
  function decoMesh(k) { const g = new T.Group(); (DECO[k] || DECO.plante)(g); g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); g.userData.deco = k; return g; }

  /* ---------- Chantier : la maison se construit petit à petit (fondations, murs, toit, finitions) ---------- */
  function site(b, r, make, f) {
    const tmp = new T.Group(), hh = make(tmp), bb = new T.Box3().setFromObject(tmp);
    const sx = Math.max(3, bb.max.x - bb.min.x), sz = Math.max(3, bb.max.z - bb.min.z), cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2, H = Math.max(2.5, Math.min(bb.max.y, 64));
    const conc = col(0xb9b6ae, { roughness: .95 }), steel = col(0xb8bec7, { metalness: .7, roughness: .4 }), orange = col(0xff7a1a), plank = col(0x9c7a4c);
    b.add(box(sx + 1.6, .25, sz + 1.6, conc, cx, 0, cz));
    let top = .3;
    if (f < .1) { // fondations : fers à béton, mini-pelle
      for (let x = -sx / 2; x <= sx / 2; x += 1.5) for (let z = -sz / 2; z <= sz / 2; z += 1.5) b.add(box(.06, .9, .06, orange, cx + x, .25, cz + z));
      const ex = new T.Group(); ex.add(box(1.6, .8, 2.2, col(0xffbe0b), 0, .3, 0)); ex.add(box(1.4, .3, 2.6, col(0x222222), 0, 0, 0)); const arm = box(.25, .25, 2.4, col(0xffbe0b), 0, 1.2, 1.4); arm.rotation.x = -.5; ex.add(arm); ex.position.set(cx + sx / 2 + 2, 0, cz + 2); b.add(ex);
      top = 1.2;
    } else if (f < .75) { // murs qui montent, puis charpente
      const k = f < .45 ? (f - .1) / .35 * .75 : .75 + (f - .45) / .3 * .25, wh = Math.max(.8, H * k);
      [[0, -sz / 2, sx, .3], [0, sz / 2, sx, .3], [-sx / 2, 0, .3, sz], [sx / 2, 0, .3, sz]].forEach(([x, z, w, d]) => b.add(box(w, wh, d, conc, cx + x, .25, cz + z)));
      if (f >= .45 && H < 14) for (let x = -sx / 2; x <= sx / 2 + .01; x += 1) { const beam = box(.12, .12, sz + .6, plank, cx + x, wh + .25, cz); b.add(beam); }
      top = wh;
    } else { b.add(tmp); top = H; } // finitions : le bâtiment est là, encore sous échafaudages
    const sh = Math.min(top + 1, 30);
    for (let y = 0; y < sh; y += 2) {
      [[-sx / 2 - .8, null], [sx / 2 + .8, null]].forEach(([x]) => b.add(box(.1, .1, sz + 1.6, steel, cx + x, y + 2, cz)));
      b.add(box(sx + 1.6, .08, .9, plank, cx, y + 2, cz + sz / 2 + .8));
    }
    for (let x = -sx / 2 - .8; x <= sx / 2 + .81; x += 2) [-sz / 2 - .8, sz / 2 + .8].forEach(z => b.add(box(.08, sh, .08, steel, cx + x, .25, cz + z)));
    if (H > 10) { // grue
      const gx = cx + sx / 2 + 3.5, gz = cz - sz / 2, mh = H + 8;
      b.add(box(.9, mh, .9, col(0xffbe0b), gx, 0, gz));
      const jib = new T.Group(); jib.position.set(gx, mh, gz); b.add(jib);
      jib.add(box(18, .6, .6, col(0xffbe0b), 5, 0, 0)); jib.add(box(3, 1.2, 1.2, conc, -4.5, -.6, 0)); jib.add(box(.05, 6, .05, col(0x333333), 10, -6, 0));
      animated.push(t => { jib.rotation.y = Math.sin(t * .12) * 1.2; });
    }
    for (let x = -10; x <= 10; x += 2.5) [-10.5, 10.5].forEach(z => { if (z > 0 && Math.abs(x) < 3) return; b.add(box(2.2, .9, .12, (x / 2.5) % 2 ? orange : col(0xffffff), x, 0, z)); });
    for (let z = -10; z <= 10; z += 2.5) [-10.5, 10.5].forEach(x => b.add(box(.12, .9, 2.2, (z / 2.5) % 2 ? orange : col(0xffffff), x, 0, z)));
    return Math.max(top, hh * .3) + 2;
  }

  /* ---------- Monuments ---------- */
  const LAND = {
    residence(g) { // 🏢 Résidence Trad Tower : on y achète des appartements
      const H = 22 * 3.2;
      g.add(tower('white', 14, H, 12, 0, 0, -2));
      const gg = new T.Group(); gg.position.z = -2; g.add(gg); bldgDetails(gg, 14, H, 12, { balconies: true, sign: 'RÉSIDENCE TRAD TOWER' });
      [-5.5, 5.5].forEach(x => tree(g, x, 8, .7)); g.add(box(3.2, .05, 6, col(0xd8d2c4), 0, 0, 7.5));
      fair.residence = { g };
      return H + 3;
    },
    kart(g) { // 🏎️ circuit de karting : anneau autour d'un îlot, murs de pneus
      g.add(box(23.4, .03, 23.4, col(0x2a2d33, { roughness: .95 }), 0, 0, 0));
      g.add(box(10, .1, 10, col(0x4caf50, { roughness: 1 }), 0, 0, 0));
      const tg = new T.CylinderGeometry(.33, .33, .3, 12), tm = new T.MeshStandardMaterial({ roughness: .9 }), pts = [];
      const ring = (half, step) => { for (let a = -half; a < half; a += step) pts.push([a, -half], [half, a], [-a, half], [-half, -a]); };
      ring(5.3, .72); ring(11.5, .72);
      const im = new T.InstancedMesh(tg, tm, pts.length * 2), m4 = new T.Matrix4(), c3 = new T.Color();
      pts.forEach(([x, z], i) => [0, .3].forEach((y, k) => { m4.makeTranslation(x, .15 + y, z); im.setMatrixAt(i * 2 + k, m4); im.setColorAt(i * 2 + k, c3.set((i + k) % 3 === 0 ? 0xd62839 : (i + k) % 3 === 1 ? 0xffffff : 0x111111)); }));
      im.castShadow = true; im.userData.noCol = true; g.add(im);
      const inv = new T.MeshBasicMaterial({ visible: false });
      [[5.3, 10.6], [11.5, 23]].forEach(([hf, len]) => [[0, -hf, len, .5], [0, hf, len, .5], [-hf, 0, .5, len], [hf, 0, .5, len]].forEach(([x, z, w, d]) => g.add(mesh(new T.BoxGeometry(w, 1.4, d), inv, x, .7, z, false))));
      const chk = new T.Mesh(new T.PlaneGeometry(5.8, 1), new T.MeshStandardMaterial({ map: canvasTex(128, 22, (c, w, h) => { for (let x = 0; x < w; x += 11) for (let y = 0; y < h; y += 11) { c.fillStyle = ((x + y) / 11) % 2 ? '#111' : '#fff'; c.fillRect(x, y, 11, 11); } }) }));
      chk.rotation.x = -Math.PI / 2; chk.position.set(8.4, .04, 0); g.add(chk);
      [5.7, 11.1].forEach(x => g.add(cyl(.1, .1, 3.6, col(0xdddddd), x, 0, 0, 8)));
      const ban = new T.Mesh(new T.PlaneGeometry(5.6, .9), signTex('🏁 TRAD KART · 5 €', '#d62839')); ban.position.set(8.4, 3.4, 0); ban.rotation.y = Math.PI / 2; g.add(ban); const ban2 = ban.clone(); ban2.rotation.y = -Math.PI / 2; g.add(ban2);
      fair.kart = { g };
      return 5;
    },
    autos(g) { // 💥 auto-tamponneuses : piste couverte avec filet électrique
      g.add(box(21, .12, 17, col(0x7d858f, { metalness: .6, roughness: .35 }), 0, 0, 0));
      const inv = new T.MeshBasicMaterial({ visible: false }), rail = col(0xffbe0b);
      [[0, -8.3, 21, .4], [0, 8.3, 21, .4], [-10.3, 0, .4, 17], [10.3, 0, .4, 17]].forEach(([x, z, w, d]) => { g.add(box(w, .45, d, rail, x, .12, z)); g.add(mesh(new T.BoxGeometry(w, 1.4, d), inv, x, .7, z, false)); });
      [[-10, -8], [10, -8], [-10, 8], [10, 8]].forEach(([x, z]) => g.add(cyl(.18, .18, 5.2, col(0xd62839), x, 0, z, 10)));
      const roof = box(21.6, .35, 17.6, col(0x1e3a8a), 0, 5.2, 0); roof.castShadow = false; g.add(roof);
      const net = new T.Mesh(new T.PlaneGeometry(20, 16, 20, 16), new T.MeshBasicMaterial({ color: 0x999999, wireframe: true })); net.rotation.x = Math.PI / 2; net.position.y = 5.1; g.add(net);
      const bulbs = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff5ec4, emissiveIntensity: night ? 1.5 : .5 });
      for (let i = 0; i < 24; i++) { const b = mesh(new T.SphereGeometry(.12, 8, 6), bulbs, -10.5 + i * .91, 5.1, 8.85, false); g.add(b); if (i % 2) blinkers.push(b); }
      const sg = new T.Mesh(new T.PlaneGeometry(8, 1.2), signTex('💥 AUTO-TAMPONNEUSES · 3 €', '#ff006e')); sg.position.set(0, 6.1, 8.9); g.add(sg);
      for (let i = 0; i < 4; i++) { const c = car([0xe63946, 0x06d6a0, 0xffbe0b, 0x8338ec][i], false, 'bumper'); c.position.set(-6 + i * 4, .12, -5 + (i % 2) * 3); c.rotation.y = i; c.userData.noCol = true; g.add(c); }
      fair.autos = { g };
      return 6.5;
    },
    manege(g) { // 🎠 manège de chevaux de bois
      const gold = col(0xe8b923, { metalness: .8, roughness: .3 });
      g.add(cyl(6.4, 6.6, .45, col(0xd8ccb2), 0, 0, 0, 40));
      const rot = new T.Group(); rot.position.y = .45; g.add(rot);
      rot.add(mesh(new T.CylinderGeometry(6, 6, .2, 40), col(0x7a1f2b), 0, .1, 0)); rot.add(cyl(.5, .5, 5, gold, 0, 0, 0, 16));
      const stripes = canvasTex(256, 32, (c, w, h) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#d62839'; c.fillRect(i * 16, 0, 16, h); } });
      const roofM = new T.Mesh(new T.ConeGeometry(7, 2.6, 32, 1), new T.MeshStandardMaterial({ map: stripes, roughness: .6 })); roofM.position.y = 6.3; rot.add(roofM);
      rot.add(mesh(new T.CylinderGeometry(7, 7, .5, 32, 1, true), new T.MeshStandardMaterial({ color: 0xffbe0b, side: T.DoubleSide }), 0, 4.75, 0));
      const horses = [], HC = [0xffffff, 0xf3e1c2, 0x8b5a2b, 0x222222];
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, hg = new T.Group(), m = col(HC[i % 4], { roughness: .4 }), sad = col([0xd62839, 0x3a86ff, 0x06d6a0, 0x8338ec][i % 4]);
        rot.add(cyl(.05, .05, 4.8, gold, Math.cos(a) * 4.6, 0, Math.sin(a) * 4.6, 8));
        hg.add(mesh(new T.CapsuleGeometry(.28, .8, 4, 10), m, 0, 0, 0));
        const body = hg.children[0]; body.rotation.x = Math.PI / 2;
        const neck = mesh(new T.CapsuleGeometry(.14, .45, 4, 8), m, 0, .35, .45); neck.rotation.x = -.6; hg.add(neck);
        hg.add(mesh(new T.BoxGeometry(.2, .22, .45, 1, 1, 1), m, 0, .62, .68));
        hg.add(box(.5, .08, .55, sad, 0, .26, -.05));
        [[-.15, .35], [.15, .35], [-.15, -.35], [.15, -.35]].forEach(([x, z], k) => { const l = mesh(new T.CylinderGeometry(.05, .04, .7, 6), m, x, -.45, z); l.rotation.x = k < 2 ? -.5 : .5; hg.add(l); });
        hg.position.set(Math.cos(a) * 4.6, 1.6, Math.sin(a) * 4.6); hg.rotation.y = -a; rot.add(hg); horses.push(hg);
      }
      animated.push(t => { rot.rotation.y = t * .55; horses.forEach((h, i) => { h.position.y = 1.6 + Math.sin(t * 2.2 + i) * .35; }); });
      const sg = label('🎠 Manège · 2 €', { scale: .12, bg: 'rgba(214,40,57,.95)' }); sg.material.depthTest = true; sg.position.set(8.5, 2.4, 9); g.add(sg);
      fair.manege = { g, horses };
      return 8;
    },
    roue(g) { // 🎡 grande roue (attraction payante)
      const steel = col(0xe9eef5, { metalness: .6, roughness: .35 }), R = 9, cy = 11.2;
      g.add(box(18, .25, 9, col(0xd5dbe2)));
      [-1.4, 1.4].forEach(z => [-1, 1].forEach(s => { const L = Math.hypot(4.8, cy), leg = mesh(new T.CylinderGeometry(.16, .24, L, 8), steel, s * 2.4, cy / 2, z); leg.rotation.z = s * Math.atan(4.8 / cy); g.add(leg); }));
      const axle = mesh(new T.CylinderGeometry(.35, .35, 3.4, 12), steel, 0, cy, 0); axle.rotation.x = Math.PI / 2; g.add(axle);
      const wh = new T.Group(); wh.position.set(0, cy, 0); g.add(wh);
      const bulbs = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd27a, emissiveIntensity: night ? 1.4 : .2, metalness: .3 });
      [-.7, .7].forEach(z => { const rim = new T.Mesh(new T.TorusGeometry(R, .12, 8, 64), steel); rim.position.z = z; wh.add(rim); const rim2 = new T.Mesh(new T.TorusGeometry(R * .55, .08, 6, 48), steel); rim2.position.z = z; wh.add(rim2); const lights = new T.Mesh(new T.TorusGeometry(R + .16, .06, 6, 64), bulbs); lights.position.z = z; wh.add(lights); });
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, sp = new T.Mesh(new T.BoxGeometry(.08, R, .08), steel); sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); sp.rotation.z = a - Math.PI / 2; wh.add(sp); }
      const cabs = [], CC = [0xe63946, 0xffbe0b, 0x3a86ff, 0x06d6a0, 0x8338ec, 0xff006e];
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, c = new T.Group(); c.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); wh.add(c);
        const k = col(CC[i % CC.length], { roughness: .4 });
        const cab = new T.Group(); cab.position.y = -1.05; c.add(cab);
        cab.add(box(1.7, .12, 1.5, k, 0, -.75, 0)); cab.add(box(1.7, .55, 1.5, k, 0, -.75, 0).translateY(0)); cab.add(box(1.8, .14, 1.6, k, 0, .62, 0));
        [[-.8, -.7], [.8, -.7], [-.8, .7], [.8, .7]].forEach(([x, z]) => cab.add(box(.06, 1.35, .06, steel, x, -.72, z)));
        c.add(box(.06, .5, .06, steel, 0, -.4, 0));
        c.userData.cab = cab; cabs.push(c);
      }
      g.add(box(2.4, 2.4, 2, col(0xffbe0b), 6.5, 0, 3.2)); const tk = label('🎡 Grande roue · 4 €', { scale: .5, bg: 'rgba(230,57,70,.95)' }); tk.position.set(6.5, 3.4, 3.2); tk.material.depthTest = true; g.add(tk);
      animated.push(t => { wh.rotation.z = t * (Math.PI * 2 / 60); cabs.forEach(c => { c.rotation.z = -wh.rotation.z; }); });
      fair.roue = { g, wh, cabs, R, cy };
      return cy + R + 2;
    },
    tir(g) { // 🎯 stand de tir forain (attraction payante)
      const blue = col(0x1e3a8a), wood = col(0x8b5a2b), metal = col(0xb8bec7, { metalness: .8, roughness: .3 });
      g.add(box(13, .25, 8, col(0x6b4f3a)));
      g.add(box(12.4, 4.6, .3, blue, 0, .25, -3.4));
      [-6.05, 6.05].forEach(x => g.add(box(.3, 4.6, 6.6, blue, x, .25, -.25)));
      for (let i = 0; i < 12; i++) { const s = box(1.05, .18, 3.4, col(i % 2 ? 0xffffff : 0xd62839), -5.78 + i * 1.05, 4.75, 1.1); s.rotation.x = -.22; g.add(s); }
      g.add(box(12.4, .25, 6.8, col(0xd62839), 0, 4.8, -.2));
      g.add(box(11.6, 1.05, .7, wood, 0, .25, 2.6)); g.add(box(11.8, .08, .9, col(0x5d3a1a), 0, 1.3, 2.6));
      const sign = new T.Mesh(new T.PlaneGeometry(8, 1.3), new T.MeshBasicMaterial({ map: canvasTex(512, 84, (c, w, h) => { c.fillStyle = '#ffbe0b'; c.fillRect(0, 0, w, h); c.fillStyle = '#7a1020'; c.font = 'bold 50px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🎯 STAND DE TIR · 3 €', w / 2, h / 2 + 3); }) }));
      sign.position.set(0, 5.9, 2.85); g.add(sign);
      [1.6, 2.55, 3.5].forEach(y => g.add(box(11.6, .06, .06, metal, 0, y - .03, -3.15)));
      ['🧸', '🦄', '🐻', '🐶'].forEach((e, i) => { const sp = emojiSprite(e, 1.1); sp.position.set(i < 2 ? -5.3 : 5.3, 1.6 + (i % 2) * 1.3, -2); g.add(sp); });
      const bulbs = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe08a, emissiveIntensity: night ? 1.4 : .3 });
      for (let i = 0; i < 14; i++) { const b = mesh(new T.SphereGeometry(.09, 8, 6), bulbs, -6 + i * .92, 4.55, 2.85, false); g.add(b); if (i % 2) blinkers.push(b); }
      fair.tir = { g };
      return 6.5;
    },
    market(g) { // 🛒 Trad Market : supérette (vitrine, auvent vert, enseigne, caddies)
      const wall = col(0xf4f1ea), green = col(0x1f9d55), glass = col(0x9fd0ff, { emissive: night ? 0xffe2a0 : 0, emissiveIntensity: .7, roughness: .2 });
      g.add(box(15, 6, 9, wall, 0, 0, -1.5)); g.add(box(15.4, .6, 9.4, col(0x5d636b), 0, 6, -1.5));
      g.add(box(13, 3.4, .15, glass, 0, .3, 3.05)); // vitrine
      g.add(box(2.6, 3, .2, col(0x2b2f36), 0, .3, 3.12)); // portes coulissantes
      const aw = box(15.4, .3, 2, green, 0, 0, 0); aw.position.set(0, 4.3, 3.9); aw.rotation.x = .28; g.add(aw);
      const sign = new T.Mesh(new T.PlaneGeometry(9, 1.5), new T.MeshBasicMaterial({ map: canvasTex(512, 86, (c, w, h) => { c.fillStyle = '#1f9d55'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 54px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🛒 TRAD MARKET', w / 2, h / 2 + 3); }) }));
      sign.position.set(0, 5.2, 3.2); g.add(sign);
      [[-5.5, 5.4], [-4.8, 5.4], [5.2, 5.6]].forEach(([x, z]) => { const c = new T.Group(), wire = new T.MeshStandardMaterial({ color: 0xc8ced6, metalness: .8, roughness: .3, wireframe: true }); c.add(mesh(new T.BoxGeometry(.55, .4, .85, 3, 2, 4), wire, 0, .62, 0)); c.add(box(.5, .03, .8, col(0x9aa1aa, { metalness: .8 }), 0, .42, 0)); const h = mesh(new T.CylinderGeometry(.015, .015, .55, 6), col(0xe63946), 0, 1.0, -.48); h.rotation.z = Math.PI / 2; g.add(h); h.position.set(x, 1.0, z - .48); [[-.22, -.35], [.22, -.35], [-.22, .35], [.22, .35]].forEach(([a, b]) => { c.add(cyl(.012, .012, .36, col(0x888888), a, .06, b, 6)); c.add(mesh(new T.SphereGeometry(.05, 8, 6), col(0x222222), a, .05, b)); }); c.position.set(x, 0, z); g.add(c); });
      g.add(box(1.4, 1.6, .9, col(0xd62839), 6.6, 0, 4.6)); // frigo à boissons dehors
      return 8;
    },
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
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .9; isMobile = mobile;
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
    world = null; snow = null; stars = null; lotPos = {}; colliders.length = 0; blockPos.length = 0; meWalker = null;
  }

  /* ---------- Reflets (carte d'environnement) : carrosseries et vitres qui reflètent le ciel ---------- */
  let envNight = null;
  function makeEnv() {
    if (envNight === night || !renderer) return; envNight = night;
    try {
      const pm = new T.PMREMGenerator(renderer), es = new T.Scene();
      es.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.ShaderMaterial({ side: T.BackSide, uniforms: { top: { value: new T.Color(night ? 0x0a1030 : 0x3d8fe0) }, bot: { value: new T.Color(night ? 0x1a2040 : 0xe8f2ff) }, gr: { value: new T.Color(night ? 0x101015 : 0x7d837a) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bot; uniform vec3 gr; varying vec3 vP; void main(){ vec3 c = vP.y > 0. ? mix(bot, top, pow(vP.y, .6)) : mix(bot, gr, pow(-vP.y, .35)); gl_FragColor = vec4(c, 1.); }' })));
      if (!night) { const s = new T.Mesh(new T.SphereGeometry(5, 12, 8), new T.MeshBasicMaterial({ color: 0xfff6e0 })); s.position.set(28, 30, 18); es.add(s); }
      const rt = pm.fromScene(es, .02); if (scene.environment) scene.environment.dispose(); scene.environment = rt.texture; pm.dispose();
    } catch (e) { console.warn('env', e); }
  }

  /* ---------- Rues : passages piétons, feux tricolores, bancs, poubelles, piétons qui se promènent ---------- */
  const tlMats = [];
  function streets(rc) {
    const W2 = N * S / 2, stripes = [], m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(1, 1, 1), p = new T.Vector3();
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const cx = (i - N / 2) * S, cz = (j - N / 2) * S;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
        const ax = cx + dx * 5.6, az = cz + dz * 5.6; if (Math.abs(ax) > W2 || Math.abs(az) > W2) return;
        for (let k = -3; k <= 3; k++) stripes.push(dx ? [ax, cz + k * 1.05, 0] : [cx + k * 1.05, az, Math.PI / 2]);
      });
      if ((i + j) % 2 === 1 && i > 0 && j > 0 && i < N && j < N) trafficLight(cx + 4.4, cz + 4.4);
    }
    const im = new T.InstancedMesh(new T.PlaneGeometry(2.6, .55), new T.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .8 }), stripes.length);
    stripes.forEach(([x, z, r], i) => { q.setFromEuler(new T.Euler(-Math.PI / 2, 0, r)); p.set(x, .075, z); m4.compose(p, q, sc); im.setMatrixAt(i, m4); });
    im.receiveShadow = true; im.userData.noCol = true; world.add(im);
    // bancs et poubelles devant chaque pâté
    blockPos.forEach((b, i) => {
      if (rc() < .5) { const g = new T.Group(); g.add(box(1.8, .08, .45, col(0x8b5a2b), 0, .45, 0)); g.add(box(1.8, .4, .06, col(0x8b5a2b), 0, .55, -.2)); [-.8, .8].forEach(x => g.add(box(.06, .45, .4, col(0x2b2f36), x, 0, 0))); g.position.set(b.x - 5 + rc() * 2, .42, b.z + BLOCK / 2 - .55); g.rotation.y = Math.PI; world.add(g); }
      if (rc() < .5) world.add(cyl(.28, .24, .95, col(0x2e7d32), b.x + 6, .42, b.z + BLOCK / 2 - .5, 12));
    });
  }
  function trafficLight(x, z) {
    if (!tlMats.length) [0xff2020, 0xffa000, 0x20ff60].forEach(c => tlMats.push(new T.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0 })));
    const g = new T.Group(), dark = col(0x2b2f36);
    g.add(cyl(.08, .1, 4.2, dark, 0, 0, 0, 8)); g.add(box(.08, .08, 2.6, dark, 0, 4.1, -1.3));
    const head = new T.Group(); head.position.set(0, 3.55, -2.5); g.add(head);
    head.add(box(.34, .95, .3, dark, 0, 0, 0)); tlMats.forEach((m, k) => head.add(mesh(new T.SphereGeometry(.1, 10, 8), m, 0, .74 - k * .3, .17, false)));
    g.position.set(x, .42, z); world.add(g);
  }
  function stepLights(t) { if (!tlMats.length) return; const c = t % 16, s = c < 7 ? 2 : c < 9 ? 1 : 0; tlMats.forEach((m, k) => { m.emissiveIntensity = k === s ? 2 : 0; m.color.set(k === s ? 0xffffff : 0x222222); }); }
  function pedestrians(rc) {
    const n = isMobile ? 6 : 14, P2 = BLOCK / 2 - .7, per = P2 * 8;
    for (let i = 0; i < n; i++) {
      const bp = blockPos[(rc() * blockPos.length) | 0]; if (!bp) continue;
      const look = TC.Avatar && TC.Avatar.random ? { av: TC.Avatar.random() } : null;
      const pr = person('🙂', CAR_COLORS[(rc() * CAR_COLORS.length) | 0], false, look, 'ped' + i); pr.userData.noCol = true; world.add(pr);
      let s = rc() * per, px = 0, pz = 0, face = 0; const dir = rc() < .5 ? 1 : -1, v = 1.1 + rc() * .5;
      animated.push((t, dt) => {
        const near = Wk.on && Math.hypot(pr.position.x - Wk.x, pr.position.z - Wk.z) < 1.1;
        const sp = near ? 0 : v; s = ((s + sp * dt * dir) % per + per) % per;
        const seg = Math.floor(s / (P2 * 2)), u = s % (P2 * 2) - P2;
        const x = seg === 0 ? u : seg === 1 ? P2 : seg === 2 ? -u : -P2, z = seg === 0 ? P2 : seg === 1 ? -u : seg === 2 ? -P2 : u;
        const nx = bp.x + x, nz = bp.z + z; if (Math.hypot(nx - px, nz - pz) > .001) face = Math.atan2(nx - px, nz - pz); px = nx; pz = nz;
        pr.position.set(nx, .42, nz); pr.rotation.y = face; pr.userData.step(dt, sp, false, t);
      });
    }
  }

  function setSky() {
    makeEnv();
    const day = new T.Color(0x9fd3ff), nightC = new T.Color(0x0b1030);
    if (!sky) {
      sky = new T.Mesh(new T.SphereGeometry(1100, 32, 16), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new T.Color() }, bot: { value: new T.Color() } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.5 + .05, 0., 1.); gl_FragColor = vec4(mix(bot, top, pow(h, .65)), 1.0); }' }));
      sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
    }
    sky.visible = true; sky.material.uniforms.top.value.set(night ? 0x050822 : 0x3d8fe0); sky.material.uniforms.bot.value.set(night ? 0x1b2350 : 0xcfe9ff);
    scene.background = night ? nightC : day;
    scene.fog = new T.Fog(night ? 0x141a3c : 0xcfe9ff, HALF * 2.2, HALF * 5.5);
    hemi.groundColor.set(0x5a7a3a); hemi.intensity = night ? .22 : .32; hemi.color.set(night ? 0x5566aa : 0xcfe8ff);
    sun.intensity = night ? .25 : 1.0; sun.color.set(night ? 0x8899ff : 0xfff1d6);
    sun.position.set(HALF * .9, HALF * 1.6, HALF * .6); sun.target.position.set(0, 0, 0);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -HALF - 20; sc.right = sc.top = HALF + 20; sc.near = 1; sc.far = HALF * 5; sc.updateProjectionMatrix();
    winMats.forEach(m => { m.emissive.set(night ? 0xffffff : 0x000000); });
  }

  // positions des blocs, du centre vers l'extérieur
  function slots(count) {
    N = Math.max(isMobile ? 5 : 7, Math.ceil(Math.sqrt(count + 1))); if (N % 2 === 0) N++;
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
    const items = [{ land: 'bourse' }, { land: 'market' }];
    // monuments mélangés aux plus riches, comme sur la carte 2D
    let li = 1; const L = data.landmarks;
    data.players.forEach((p, i) => { if (i % 2 === 0 && li < L.length) items.push({ land: L[li++].id }); items.push({ p, i }); });
    while (li < L.length) items.push({ land: L[li++].id });
    items.push({ land: 'roue' }, { land: 'tir' }, { land: 'residence' }, { land: 'kart' }, { land: 'manege' }, { land: 'autos' });
    const pos = slots(items.length);
    for (let k = items.length; k < pos.length; k++) items.push({ fill: k });
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
      const r = rng(it.p ? it.p.uid : it.land || 'fill' + k);
      g.add(box(BLOCK, .35, BLOCK, walk, 0, 0, 0));
      const top = box(BLOCK - 2, .1, BLOCK - 2, it.land === 'bourse' || it.land === 'mairie' || it.land === 'roue' || it.land === 'tir' || it.land === 'manege' || it.land === 'residence' || (it.fill != null && k % 3 === 0) ? plaza : grass, 0, .35, 0); top.castShadow = false; g.add(top);
      const b = new T.Group(); b.position.y = .45; g.add(b);
      let h;
      if (it.fill != null) { FILL[(r() * FILL.length) | 0](b, r); return; }
      if (it.land) {
        h = LAND[it.land](b);
        b.userData.pick = { land: it.land };
        const name = it.land === 'market' ? '🛒 Trad Market' : it.land === 'roue' ? '🎡 Grande roue' : it.land === 'tir' ? '🎯 Stand de tir' : it.land === 'residence' ? '🏢 Résidence Trad Tower' : it.land === 'kart' ? '🏎️ Karting' : it.land === 'manege' ? '🎠 Manège' : it.land === 'autos' ? '💥 Auto-tamponneuses' : (data.landmarks.find(l => l.id === it.land) || { name: 'Bourse' }).name;
        const lb = label(name, { bg: 'rgba(255,255,255,.88)', color: '#1e1b2e', scale: .9 }); lb.position.set(s.x, h + 3, s.z); world.add(lb); labels.push(lb);
        lotPos[it.land] = { x: s.x, z: s.z, h };
      } else {
        const p = it.p;
        const make = gg => p.tier === 'manor' ? manor(gg, r) : BUILD[Math.max(0, Math.min(BUILD.length - 1, +p.tier || 0))](gg, r);
        const bf = p.bld && p.bld.d ? (Date.now() - p.bld.s) / p.bld.d : 1;
        h = bf < 1 ? site(b, r, make, Math.max(0, bf)) : make(b);
        if (bf < 1) { const sl = label('🏗️ Chantier ' + Math.floor(Math.max(0, bf) * 100) + ' %', { bg: 'rgba(255,122,26,.95)', scale: .7 }); sl.position.set(s.x, h + 1.5, s.z); world.add(sl); labels.push(sl); }
        // le joueur en 3D, qui fait les cent pas devant sa résidence
        const pr = person(p.avatar, SKIN[(r() * SKIN.length) | 0], p.me, p.look, p.uid), k = r() * 6;
        pr.position.set(3, .45, 8); pr.userData.noCol = true; g.add(pr); if (p.me) meWalker = pr;
        animated.push(t => { const x = Math.sin(t * .35 + k) * 4.2; const dir = Math.cos(t * .35 + k); pr.position.x = x; pr.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; pr.userData.walk(t, k); });
        b.rotation.y = 0;
        b.userData.pick = { uid: p.uid };
        // commerces aux coins du bloc
        const biz = Object.entries(p.biz || {}).filter(([id]) => data.biz[id]).sort((a, c) => data.biz[c[0]].price - data.biz[a[0]].price).slice(0, 4);
        [[-8.2, -8.2], [8.2, -8.2], [-8.2, 8.2], [8.2, 8.2]].forEach(([x, z], n) => {
          if (biz[n]) { const sh = shop(biz[n][0], biz[n][1], data.biz[biz[n][0]].e); sh.position.set(x, .45, z); sh.rotation.y = z > 0 ? 0 : Math.PI; sh.userData.pick = { uid: p.uid }; g.add(sh); }
          else if (r() < .55) tree(g, x, z, .8 + r() * .4, noel && r() < .3);
        });
        // sa plus belle voiture garée devant
        if (p.car) { const c = car(p.car.color, true, p.car.style); c.position.set(-2.5, .45, 9.6); c.rotation.y = Math.PI / 2; g.add(c); }
        const txt = (p.mayor ? '👑 ' : '') + (p.tag ? '[' + p.tag + '] ' : '') + (p.me ? 'Toi' : p.pseudo) + (p.plus ? ' ✓' : '');
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
      const sport = rc() < .3, c = car(CAR_COLORS[rc() * CAR_COLORS.length | 0], sport, TRAFFIC[rc() * TRAFFIC.length | 0]);
      const k = rc() * (N + 1) | 0, line = (k - N / 2) * S, dir = rc() < .5 ? 1 : -1, axis = rc() < .5 ? 'x' : 'z';
      const lane = dir * 1.8;
      const o = { g: c, axis, dir, line: line + lane, t: (rc() - .5) * W, v: (sport ? 16 : 9) + rc() * 6, W };
      c.rotation.y = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      c.userData.noCol = true; world.add(c); cars.push(o);
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
    pos.slice(0, items.length).forEach(s => blockPos.push({ x: s.x, z: s.z }));
    streets(rng('rues' + N)); pedestrians(rng('pietons' + N));
    if (!inside) computeColliders();
    if (meWalker) meWalker.visible = !Wk.on;
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
  function skylineTex() { return canvasTex(256, 160, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, night ? '#0b1033' : '#5aa8ff'); gr.addColorStop(1, night ? '#2a2f5a' : '#d8ecff'); c.fillStyle = gr; c.fillRect(0, 0, w, h); const r = rng('sky'); for (let x = 0; x < w; x += 14 + r() * 10) { const bh = 30 + r() * 90, bw = 10 + r() * 16; c.fillStyle = night ? '#141a33' : '#7b8aa0'; c.fillRect(x, h - bh, bw, bh); c.fillStyle = night ? '#ffd27a' : '#c9dcf0'; for (let y = h - bh + 4; y < h - 4; y += 7) for (let xx = x + 2; xx < x + bw - 3; xx += 5) if (r() < (night ? .4 : .7)) c.fillRect(xx, y, 2, 3); } }); }
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
  function interior(info, walkIn) {
    const g = new T.Group(); const t = info.tier;
    room = { W: 16 + t * 2.2, D: 12 + t * 1.6 };
    const { W, D } = room, H = 5.5 + (t >= 5 ? 1.5 : 0), lux = t >= 6;
    const floor = box(W, .4, D, t <= 1 ? col(0x7a5230) : t <= 4 ? col(0xc8a27a) : col(0xf2efe9, { roughness: .25, metalness: .1 }), 0, -.4, 0); g.add(floor);
    const wallMat = t === 0 ? col(0xff9a4d) : lux ? col(0x1f2a44) : col(0xf3eadb);
    const skyMat = info.apt ? new T.MeshBasicMaterial({ map: skylineTex() }) : new T.MeshBasicMaterial({ color: night ? 0x121a40 : 0x9fd3ff });
    [[0, -D / 2, W, 'z', [0, -1]], [0, D / 2, W, 'z', [0, 1]], [-W / 2, 0, D, 'x', [-1, 0]], [W / 2, 0, D, 'x', [1, 0]]].forEach(([x, z, len, ax, n]) => {
      if (walkIn && n[1] === 1) { // mur de façade avec une vraie porte qui s'ouvre
        const fw = new T.Group(), gap = 2.3, DH = 4.3, seg = (W - gap) / 2;
        fw.add(box(seg, H, .35, wallMat, -(gap / 2 + seg / 2), 0, z)); fw.add(box(seg, H, .35, wallMat, gap / 2 + seg / 2, 0, z)); fw.add(box(gap, H - DH, .35, wallMat, 0, DH, z));
        [-1, 1].forEach(sd => { const win = new T.Mesh(new T.PlaneGeometry(2.8, 2), skyMat); win.position.set(sd * W / 4, 2.6, z - .19); win.rotation.y = Math.PI; fw.add(win); });
        const pivot = new T.Group(); pivot.position.set(-gap / 2, 0, z); const panel = box(gap - .04, DH - .04, .1, col(0x6d3f22, { roughness: .6 }), gap / 2, 0, 0); pivot.add(panel);
        [1.1, 2.6].forEach(y => pivot.add(box(gap - .5, .9, .04, col(0x5a3219, { roughness: .6 }), gap / 2, y, .07)));
        const knob = mesh(new T.SphereGeometry(.09, 10, 8), col(0xd4af37, { metalness: .9, roughness: .2 }), gap - .3, 2.0, -.1); pivot.add(knob); const knob2 = knob.clone(); knob2.position.z = .1; pivot.add(knob2);
        fw.add(pivot); door = { pivot, panel, open: false, shut: true };
        fw.userData.n = n; fw.userData.half = D / 2; g.add(fw); walls.push(fw); return;
      }
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
      let x = -W / 2 + 2.5 + i * 2.4; const z = D / 2 - 1.6; if (walkIn && Math.abs(x) < 1.8) x += 3.6;
      g.add(cyl(.6, .7, 1.2, col(0xffffff, { roughness: .3 }), x, 0, z, 16));
      const sp = emojiSprite(it.emoji, 1.5); g.add(sp); animIn.push(tt => { sp.position.set(x, 2 + Math.sin(tt * 2 + i) * .15, z); });
    });
    // le propriétaire au milieu de son salon
    if (walkIn) {
      const ceil = box(W, .25, D, col(0xf7f3ec), 0, H, 0); ceil.castShadow = false; g.add(ceil);
      [[-W / 4, 0], [W / 4, 0]].forEach(([x, z]) => { const l = new T.PointLight(0xfff1dd, .55, 0); l.position.set(x, H - .6, z); g.add(l); g.add(mesh(new T.SphereGeometry(.22, 10, 8), new T.MeshBasicMaterial({ color: 0xfff6dd }), x, H - .25, z, false)); });
      if (info.apt) { g.add(box(W + 10, .1, 8, col(0x8a7f74), 0, -.1, D / 2 + 4)); g.add(box(W + 10, H, .3, col(0xe9e4da), 0, 0, D / 2 + 8)); }
      else { const out = box(W + 30, .1, 14, col(0x4caf50, { roughness: 1 }), 0, -.1, D / 2 + 7.2); g.add(out); g.add(box(4, .12, 14, col(0xc9ccd2), 0, -.08, D / 2 + 7.2)); }
      g.add(box(1.4, .03, .8, col(0x7a5230), 0, 0, D / 2 - .7));
    } else { const av = emojiSprite(info.avatar || '😎', 3); g.add(av); animIn.push(tt => { av.position.set(-1.5, 2 + Math.sin(tt * 2) * .2, D * .02); }); }
    // garage avec ses voitures
    if (autos.length && !walkIn) {
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
    inside = interior(info); scene.add(inside); buildDeco(info.deco); if (sky) sky.visible = false;
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
      if (Wk.on) { if (pts.size === 1) { Wk.yaw -= dx * .006; Wk.pitch = Wk.fp ? Math.max(-1.3, Math.min(1.3, Wk.pitch + dy * .004)) : Math.max(.02, Math.min(1.2, Wk.pitch + dy * .004)); Wk.lookAt = Date.now() + 1500; } return; }
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
      if (down && pts.size === 0 && moved < 8 && Date.now() - down.t < 400 && !Wk.on) pick(e);
      if (pts.size === 0) down = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { pts.delete(e.pointerId); last = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); if (Wk.on) { Wk.d = Math.max(2, Math.min(12, Wk.d * Math.exp(e.deltaY * .0012))); return; } cam.r *= Math.exp(e.deltaY * .0012); cam.goal = null; cam.idle = 0; }, { passive: false });
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

  /* ---------- Balade : à pied, en véhicule, dans les maisons, attractions ---------- */
  const Wk = V.walkState = { on: false, mode: 'walk', x: 0, y: 0, z: 0, yaw: Math.PI, pitch: .26, d: 4.6, fp: false, keys: {}, joy: { x: 0, y: 0, run: false }, speed: 1, canRun: true, dist: 0, runDist: 0, near: null, nearVeh: null, nearDoor: false, moving: false, face: 0, veh: null, kmh: 0, lookAt: 0 };
  const colliders = [], blockPos = []; let meWalker = null, avatarW = null, avatarOpt = {};
  const parkG = { list: [] }; let parkRoot = null;
  function computeColliders() { // boîtes vues du dessus de tout ce qui est solide (ville, ou intérieur de la maison)
    colliders.length = 0;
    const root = inside || world; if (!root) return;
    const minTop = inside ? .3 : 1.1, minH = inside ? .25 : .9;
    root.updateMatrixWorld(true);
    const bb = new T.Box3();
    (function visit(o) {
      if (o.userData && o.userData.noCol) return;
      if (o.isMesh && !(o.material && o.material.isMeshBasicMaterial && o.material.transparent)) {
        bb.setFromObject(o);
        if (bb.max.y > minTop && bb.min.y < 2 && bb.max.y - bb.min.y > minH && bb.max.x - bb.min.x < 60 && bb.max.z - bb.min.z < 60) colliders.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, y1: bb.max.y });
      }
      o.children.forEach(visit);
    })(root);
  }
  V.refreshColliders = computeColliders;
  function hit(x, z, r) { for (const c of colliders) if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true; return false; }
  function vehHit(x, z, r, skip) { // véhicules garés et circulation
    if (inside) return false;
    for (const v of parkG.list) { if (v === skip) continue; const L = (v.mesh.userData.len || 4) / 2, Wd = (v.mesh.userData.wid || 1.8) / 2, dx = x - v.x, dz = z - v.z, s = Math.sin(v.yaw), c = Math.cos(v.yaw); const lz = dx * s + dz * c, lx = dx * c - dz * s; if (Math.abs(lz) < L + r && Math.abs(lx) < Wd + r) return true; }
    if (race) for (const a of extra) if (Math.hypot(x - a.m.position.x, z - a.m.position.z) < .9 + r) return true;
    for (const c of cars) { const cx = c.axis === 'x' ? c.t : c.line, cz = c.axis === 'x' ? c.line : c.t, L = 2.4, Wd = 1.0, ax = c.axis === 'x'; const dx = Math.abs(x - cx), dz = Math.abs(z - cz); if ((ax ? dx < L + r && dz < Wd + r : dz < L + r && dx < Wd + r)) return true; }
    return false;
  }
  function inBox(x, y, z) { for (const c of colliders) if (y < c.y1 && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true; return false; }
  function ground(x, z) { if (inside) return 0;
    const A = lotPos.autos; if (A && Math.abs(x - A.x) < 10.6 && Math.abs(z - A.z) < 8.6) return .57; for (const b of blockPos) if (Math.abs(x - b.x) < BLOCK / 2 && Math.abs(z - b.z) < BLOCK / 2) return .42; return .05; }
  const limit = () => inside ? Math.max(room.W, room.D) : HALF + 16;
  function lookDir(out) { const cp = Math.cos(Wk.pitch); out.set(Math.sin(Wk.yaw) * cp, -Math.sin(Wk.pitch), Math.cos(Wk.yaw) * cp); return out; }
  const _v = new (function () { this.x = 0; this.y = 0; this.z = 0; this.set = function (a, b, c) { this.x = a; this.y = b; this.z = c; return this; }; })();
  function placeCamera(px, py, pz, eye, dist, minD) {
    if (Wk.fp) { lookDir(_v); camera.position.set(px, py + eye, pz); camera.lookAt(px + _v.x, py + eye + _v.y, pz + _v.z); return; }
    const sy = Math.sin(Wk.yaw), cy = Math.cos(Wk.yaw), pit = Math.max(.02, Wk.pitch), cp = Math.cos(pit), sp = Math.sin(pit), ty = py + eye * .92;
    let d = dist;
    for (let q = .6; q <= dist; q += .3) { if (inBox(px - sy * cp * q, ty + sp * q, pz - cy * cp * q)) { d = Math.max(minD || .9, q - .4); break; } }
    camera.position.set(px - sy * cp * d, ty + sp * d, pz - cy * cp * d); camera.lookAt(px, ty, pz);
  }
  function shadowsFollow(x, z) { const s = sun.shadow.camera, R2 = inside ? 30 : 42; if (s.right !== R2) { s.left = s.bottom = -R2; s.right = s.top = R2; s.updateProjectionMatrix(); } sun.position.set(x + 40, 90, z + 28); sun.target.position.set(x, 0, z); }

  function walkStep(dt, t) {
    const k = Wk.keys, j = Wk.joy;
    let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - j.y, s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + j.x;
    const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
    const run = (k.ShiftLeft || k.ShiftRight || j.run) && Wk.canRun && !inside, v = (run ? 7.2 : 3.4) * Wk.speed * Math.min(1, len);
    const sy = Math.sin(Wk.yaw), cy = Math.cos(Wk.yaw);
    const mx = (sy * f - cy * s), mz = (cy * f + sy * s), ml = Math.hypot(mx, mz) || 1;
    Wk.moving = len > .05;
    const r = .32;
    if (Wk.moving) {
      const step = v * dt, dx = mx / ml * step, dz = mz / ml * step, lim = limit(), was = hit(Wk.x, Wk.z, r) || vehHit(Wk.x, Wk.z, r);
      const nx = Math.max(-lim, Math.min(lim, Wk.x + dx)); if (was || !(hit(nx, Wk.z, r) || vehHit(nx, Wk.z, r))) Wk.x = nx;
      const nz = Math.max(-lim, Math.min(lim + (door && door.open ? 3 : 0), Wk.z + dz)); if (was || !(hit(Wk.x, nz, r) || vehHit(Wk.x, nz, r))) Wk.z = nz;
      Wk.dist += step; if (run) Wk.runDist += step;
      const want = Math.atan2(dx, dz); let da = want - Wk.face; da = Math.atan2(Math.sin(da), Math.cos(da)); Wk.face += da * Math.min(1, dt * 12);
    }
    if (Wk.fp) Wk.face = Wk.yaw;
    avatarW.userData.step(dt, Wk.moving ? v : 0, run, t);
    Wk.y += (ground(Wk.x, Wk.z) - Wk.y) * Math.min(1, dt * 14);
    avatarW.position.set(Wk.x, Wk.y, Wk.z); avatarW.rotation.y = Wk.face; avatarW.visible = !Wk.fp;
    placeCamera(Wk.x, Wk.y, Wk.z, 1.66, Wk.d);
    if (inside) { // dans la maison : la porte, la sortie
      Wk.nearDoor = Math.hypot(Wk.x - 0, Wk.z - room.D / 2) < 1.7;
      if (door && door.open && Wk.z > room.D / 2 + .35) { V.exitHouse(); return; }
      Wk.near = null; Wk.nearVeh = null; return;
    }
    let best = null, bd = 1e9;
    Object.entries(lotPos).forEach(([key, p]) => { const dd = Math.hypot(Wk.x - p.x, Wk.z - p.z); if (dd < bd) { bd = dd; best = key; } });
    Wk.near = bd < BLOCK / 2 + 3 ? best : null;
    let bv = null, bvd = 3.4; parkG.list.forEach(p => { const dd = Math.hypot(Wk.x - p.x, Wk.z - p.z); if (dd < bvd) { bvd = dd; bv = p; } });
    Wk.nearVeh = bv;
  }

  /* --- véhicules --- */
  const VSPEC = { kick: [7, 2.6], scooter: [15, 2.4], moto: [30, 2.3], hatch: [27, 1.9], sedan: [32, 1.8], gt: [38, 1.8], sport: [40, 1.95], sportw: [41, 2.0], super: [46, 2.0], superw: [47, 2.05], hyper: [52, 1.9], suv: [32, 1.7], g: [30, 1.6] };
  V.spawnVehicle = function (item, where) {
    if (!world) return null;
    const style = V.vstyle(item), color = parseInt(String((item.grad && item.grad[0]) || '#d00000').replace('#', ''), 16) || 0xd00000;
    const mesh2 = car(color, false, style);
    const kmh = parseFloat(String((item.specs && item.specs['Vitesse max']) || '').replace(/[^0-9.]/g, '')) || 0;
    const base = VSPEC[style] || VSPEC.hatch, vmax = kmh ? Math.max(6, Math.min(54, kmh / 3.6 * .5)) : base[0];
    let x, z, yaw;
    if (where && where.x != null) ({ x, z, yaw } = where);
    else { const s = Math.sin(Wk.face), c = Math.cos(Wk.face); x = Wk.x - c * 2.6; z = Wk.z + s * 2.6; yaw = Wk.face; }
    const v = { item, mesh: mesh2, color, x, z, yaw, spd: 0, vmax, acc: vmax / (style.startsWith('super') || style === 'hyper' ? 3.2 : style === 'kick' ? 2.5 : 5), turn: base[1], steer: 0 };
    mesh2.position.set(x, ground(x, z), z); mesh2.rotation.y = yaw; parkRoot.add(mesh2); parkG.list.push(v);
    if (parkG.list.length > 4) { const old = parkG.list.find(p => p !== Wk.veh); if (old) V.removeVehicle(old); }
    return v;
  };
  V.removeVehicle = function (v) { parkRoot.remove(v.mesh); v.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); }); parkG.list = parkG.list.filter(p => p !== v); };
  V.enterVehicle = function () {
    const v = Wk.nearVeh; if (!v || Wk.mode !== 'walk' || inside) return false;
    Wk.veh = v; Wk.mode = 'drive'; v.spd = 0;
    if (v.mesh.userData.bike) { avatarW.userData.pose(v.mesh.userData.pose); v.mesh.add(avatarW); avatarW.position.set(0, v.mesh.userData.seat - (v.mesh.userData.pose === 'stand' ? 0 : .9), v.mesh.userData.pose === 'stand' ? -.05 : -.32); avatarW.rotation.set(0, 0, 0); avatarW.visible = !Wk.fp; }
    else avatarW.visible = false;
    Wk.yaw = v.yaw; Wk.pitch = .22; return true;
  };
  V.exitVehicle = function (force) {
    const v = Wk.veh; if (!v) return false;
    if (!force && (Wk.lock || Math.abs(v.spd) > 3)) return false;
    v.spd = 0; Wk.mode = 'walk'; Wk.veh = null;
    if (avatarW.parent !== scene) { v.mesh.remove(avatarW); scene.add(avatarW); }
    avatarW.userData.pose(null);
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw), off = (v.mesh.userData.wid || 1) / 2 + .7;
    let ok = false; for (const side of [1, -1]) { const x = v.x + c * off * side, z = v.z - s * off * side; if (!hit(x, z, .32) && !vehHit(x, z, .32, v)) { Wk.x = x; Wk.z = z; ok = true; break; } }
    if (!ok) { Wk.x = v.x - s * ((v.mesh.userData.len || 4) / 2 + .8); Wk.z = v.z - c * ((v.mesh.userData.len || 4) / 2 + .8); }
    Wk.face = v.yaw; return true;
  };
  function driveStep(dt, t) {
    const v = Wk.veh, k = Wk.keys, j = Wk.joy, md = v.mesh.userData;
    const thr = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - j.y;
    const st = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0) - j.x;
    if (thr > .05) v.spd = v.spd < 0 ? Math.min(0, v.spd + 22 * dt) : Math.min(v.vmax, v.spd + v.acc * thr * dt * (1 - v.spd / v.vmax * .5));
    else if (thr < -.05) v.spd = v.spd > .2 ? Math.max(0, v.spd - 22 * dt) : Math.max(-v.vmax * .25, v.spd - v.acc * .6 * -thr * dt);
    else { v.spd *= Math.pow(.6, dt); if (Math.abs(v.spd) < .15) v.spd = 0; }
    if (k.Space) v.spd *= Math.pow(.08, dt);
    v.steer += (st - v.steer) * Math.min(1, dt * 6);
    const grip = Math.min(1, Math.abs(v.spd) / 3.5) * Math.sign(v.spd || 1);
    v.yaw += v.steer * v.turn * grip * dt * (1 - Math.min(.55, Math.abs(v.spd) / 60));
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw), L = (md.len || 4) / 2, Wd = (md.wid || 1.8) / 2;
    const nx = v.x + s * v.spd * dt, nz = v.z + c * v.spd * dt, lim = HALF + 16;
    const blocked = p => { for (const q of [-1, 0, 1]) { const px = p[0] + s * (L - Wd * .7) * q, pz = p[1] + c * (L - Wd * .7) * q; if (hit(px, pz, Wd * .85) || vehHit(px, pz, Wd * .6, v)) return true; } return Math.abs(p[0]) > lim || Math.abs(p[1]) > lim; };
    if (blocked([nx, nz])) { if (Math.abs(v.spd) > 6 && V.onBump) V.onBump(Math.abs(v.spd)); v.spd = -v.spd * .25; }
    else { v.x = nx; v.z = nz; }
    const gy = ground(v.x, v.z);
    v.mesh.position.set(v.x, gy, v.z); v.mesh.rotation.y = v.yaw;
    if (md.bike) avatarW.visible = !Wk.fp;
    if (md.bike && md.lean !== false) v.mesh.rotation.z = -v.steer * Math.min(.35, Math.abs(v.spd) / 40);
    (md.wheels || []).forEach((w, i) => { w.children.forEach(o => { o.rotation.x += v.spd * dt / 0.33; }); if (w.position.z > 0) w.rotation.y = v.steer * .45; });
    Wk.x = v.x; Wk.z = v.z; Wk.y = gy; Wk.kmh = Math.abs(v.spd) * 3.6;
    if (md.bike) avatarW.userData.step(dt, 0, false, t);
    if (Date.now() > Wk.lookAt) { let dy = v.yaw - Wk.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); Wk.yaw += dy * Math.min(1, dt * 3); }
    if (Wk.fp) { const ex = md.bike ? 0 : (md.seatX || .4), eh = md.eye || 1.2; camera.position.set(v.x + c * ex - s * (md.bike ? -.1 : .1), gy + eh, v.z - s * ex - c * (md.bike ? -.1 : .1)); lookDir(_v); camera.lookAt(camera.position.x + _v.x, camera.position.y + _v.y, camera.position.z + _v.z); }
    else placeCamera(v.x, gy, v.z, md.bike ? 1.7 : 1.6, md.bike ? 4.5 : Math.max(5.5, (md.len || 4) * 1.35), 2);
    Wk.near = null; Wk.nearVeh = null;
  }

  /* --- maisons : on entre par la porte, on ouvre et on ferme --- */
  let door = null, houseInfo = null, decoG = null, ghost = null;
  V.enterHouse = function (info) {
    if (!V.ready || !world || inside) return false;
    houseInfo = info; insideInfo = info; world.visible = false; parkRoot.visible = false;
    const raw = interior(info, true), SC = .5; raw.scale.setScalar(SC); room = { W: room.W * SC, D: room.D * SC };
    inside = new T.Group(); inside.add(raw); scene.add(inside); buildDeco(info.deco);
    if (!info.me) { const pr = person(info.avatar, 0x3a86ff, false, info.look, info.uid); pr.position.set(-.8, 0, -.5); pr.rotation.y = .5; pr.userData.noCol = true; inside.add(pr); animIn.push(tt => pr.userData.still(tt)); }
    scene.fog = null; scene.background = new T.Color(night ? 0x0d0b1e : 0x9fd3ff);
    if (sky) sky.visible = false; hemi.groundColor.set(0xcfc6b8);
    Wk.prevFp = Wk.fp; Wk.fp = true; Wk.x = 0; Wk.z = room.D / 2 - .9; Wk.y = 0; Wk.yaw = Math.PI; Wk.face = Math.PI; Wk.pitch = .05;
    computeColliders(); return true;
  };
  V.exitHouse = function () {
    if (!inside || !houseInfo) return;
    const info = houseInfo; V.decoCancel();
    scene.remove(inside); inside.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    inside = null; insideInfo = null; houseInfo = null; door = null; decoG = null; walls.length = 0; animIn.length = 0;
    world.visible = true; parkRoot.visible = true; setSky();
    const p = lotPos[info.uid] || { x: 0, z: 0 };
    Wk.x = p.x; Wk.z = p.z + BLOCK / 2 + 1.2; Wk.yaw = 0; Wk.face = 0; Wk.fp = !!Wk.prevFp; Wk.pitch = .26;
    computeColliders();
    if (V.onHouse) V.onHouse(false);
  };
  V.house = () => houseInfo;
  V.toggleDoor = function () { if (!door) return; door.open = !door.open; if (V.onDoor) V.onDoor(door.open); };
  V.doorOpen = () => !!(door && door.open);
  function stepDoor(dt) {
    if (!door) return;
    const want = door.open ? 1.75 : 0, a = door.pivot.rotation.y, na = a + (want - a) * Math.min(1, dt * 7);
    door.pivot.rotation.y = na;
    const shut = Math.abs(na) < .05;
    if (shut !== door.shut) { door.shut = shut; door.pivot.userData.noCol = !shut; computeColliders(); }
  }
  function buildDeco(list) {
    if (!inside) return;
    if (decoG) inside.remove(decoG);
    decoG = new T.Group(); inside.add(decoG);
    const sc = houseInfo ? 1 : 2, W = room.W / sc, D = room.D / sc; decoG.scale.setScalar(sc); // vue « maison de poupée » : pièce 2 × plus grande
    (list || []).slice(0, 60).forEach((d, i) => { if (!d || !DECO[d.k]) return; const m = decoMesh(d.k); m.position.set(Math.max(-W / 2 + .6, Math.min(W / 2 - .6, +d.x || 0)), 0, Math.max(-D / 2 + .6, Math.min(D / 2 - 1.6, +d.z || 0))); m.rotation.y = (+d.r || 0) * Math.PI / 2; m.userData.idx = i; decoG.add(m); });
  }
  V.setDeco = function (list) { buildDeco(list); computeColliders(); };
  V.decoNear = function () { if (!decoG) return -1; let bi = -1, bd = 2.2; decoG.children.forEach(m => { const d = Math.hypot(m.position.x - Wk.x, m.position.z - Wk.z); if (d < bd) { bd = d; bi = m.userData.idx; } }); return bi; };
  V.decoStart = function (k) {
    V.decoCancel(); if (!inside || !DECO[k]) return false;
    ghost = decoMesh(k); ghost.userData.noCol = true; ghost.userData.r = 0;
    ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .55; o.castShadow = false; } });
    inside.add(ghost); return true;
  };
  V.decoRotate = () => { if (ghost) { ghost.userData.r = (ghost.userData.r + 1) % 4; ghost.rotation.y = ghost.userData.r * Math.PI / 2; } };
  V.decoCancel = () => { if (ghost && ghost.parent) ghost.parent.remove(ghost); ghost = null; };
  V.decoPlacing = () => !!ghost;
  V.decoConfirm = function () { if (!ghost) return null; const r = { k: ghost.userData.deco, x: Math.round(ghost.position.x * 4) / 4, z: Math.round(ghost.position.z * 4) / 4, r: ghost.userData.r }; V.decoCancel(); return r; };
  function stepGhost() {
    if (!ghost) return; const s = Math.sin(Wk.yaw), c = Math.cos(Wk.yaw), { W, D } = room;
    ghost.position.set(Math.max(-W / 2 + .6, Math.min(W / 2 - .6, Math.round((Wk.x + s * 2) * 4) / 4)), 0, Math.max(-D / 2 + .6, Math.min(D / 2 - 1.6, Math.round((Wk.z + c * 2) * 4) / 4)));
  }

  /* --- attractions : grande roue, stand de tir --- */
  let ride = null, tir = null, gun = null;
  V.rideStart = function (onEnd) {
    const F = fair.roue; if (!F || inside) return false;
    F.g.updateMatrixWorld(true);
    let best = null, by = 1e9; const wp = new T.Vector3();
    F.cabs.forEach(c => { c.userData.cab.getWorldPosition(wp); if (wp.y < by) { by = wp.y; best = c; } });
    ride = { cab: best, t0: clock.elapsedTime, onEnd, back: { x: Wk.x, z: Wk.z } };
    Wk.mode = 'ride'; Wk.rideKind = 'roue'; Wk.prevFp = Wk.fp; Wk.fp = true; avatarW.visible = false; Wk.pitch = .1;
    return true;
  };
  V.rideEnd = function () { if (!ride) return; const r = ride; ride = null; Wk.mode = 'walk'; Wk.fp = !!Wk.prevFp; Wk.x = r.back.x; Wk.z = r.back.z; if (r.onEnd) r.onEnd(); };
  function rideStep(dt, t) {
    const wp = new T.Vector3(); (ride.cab ? ride.cab.userData.cab : ride.horse).getWorldPosition(wp);
    const ey = ride.cab ? -.1 : 1.3;
    lookDir(_v); camera.position.set(wp.x, wp.y + ey, wp.z + (ride.cab ? .2 : 0)); camera.lookAt(wp.x + _v.x, wp.y + ey + _v.y, wp.z + (ride.cab ? .2 : 0) + _v.z);
    Wk.rideLeft = Math.max(0, (ride.len || 60) - (clock.elapsedTime - ride.t0));
    if (Wk.rideLeft <= 0) V.rideEnd();
  }
  function makeGun() {
    const g = new T.Group(), m = col(0x2a2d33, { metalness: .85, roughness: .3 }), grip = col(0x3b2a1d, { roughness: .7 }), skin = col(0xd6a06f, { roughness: .6 });
    g.add(box(.034, .036, .19, m, 0, 0, -.11)); g.add(box(.03, .022, .2, col(0x3a3e45, { metalness: .9, roughness: .25 }), 0, .03, -.11));
    const gr = box(.032, .1, .045, grip, 0, -.1, -.005); gr.rotation.x = -.25; g.add(gr);
    const bar = mesh(new T.CylinderGeometry(.008, .008, .05, 8), m, 0, .02, -.225); bar.rotation.x = Math.PI / 2; g.add(bar);
    g.add(box(.006, .012, .01, m, 0, .046, -.19)); g.add(box(.012, .03, .03, m, 0, -.03, -.04));
    const hand = mesh(new T.SphereGeometry(.045, 12, 10), skin, .004, -.07, .0); hand.scale.set(.9, 1.2, 1.25); g.add(hand);
    const arm = mesh(new T.CylinderGeometry(.035, .04, .3, 10), skin, .02, -.1, .16); arm.rotation.x = 1.25; g.add(arm);
    const fl = mesh(new T.SphereGeometry(.03, 8, 6), new T.MeshBasicMaterial({ color: 0xffd27a }), 0, .02, -.27, false); fl.visible = false; g.add(fl); g.userData.flash = fl;
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    return g;
  }
  V.tirStart = function (opt) {
    const F = fair.tir; if (!F || inside) return false;
    F.g.updateMatrixWorld(true);
    const o = new T.Vector3(0, 0, 0); F.g.localToWorld(o);
    const targets = [], tg = new T.Group(); tg.position.copy(o); scene.add(tg);
    const tex = canvasTex(128, 128, (c, w) => { [['#d62839', 64], ['#fff', 50], ['#d62839', 36], ['#fff', 22], ['#111', 10]].forEach(([cc, r]) => { c.fillStyle = cc; c.beginPath(); c.arc(w / 2, w / 2, r, 0, Math.PI * 2); c.fill(); }); });
    const duck = canvasTex(128, 128, (c, w) => { c.font = '100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🦆', w / 2, w / 2 + 6); });
    [1.6, 2.55, 3.5].forEach((y, row) => { for (let i = 0; i < 4; i++) { const isDuck = (row + i) % 3 === 0; const t2 = new T.Mesh(new T.CircleGeometry(.3, 24), new T.MeshBasicMaterial({ map: isDuck ? duck : tex, transparent: true, side: T.DoubleSide })); const p = new T.Group(); p.add(t2); t2.position.y = .3; p.position.set(-5 + i * 2.8, y, -3.05); tg.add(p); targets.push({ p, m: t2, row, x: -5 + i * 2.8, v: (row % 2 ? -1 : 1) * (1.4 + row * .5), down: 0, pts: isDuck ? 25 : 10 }); } });
    gun = makeGun(); camera.add(gun); gun.position.set(.16, -.15, -.32); gun.rotation.y = .06; if (camera.parent !== scene) scene.add(camera);
    tir = { tg, targets, t0: clock.elapsedTime, len: opt.len || 40, ammo: opt.ammo || 25, score: 0, hits: 0, shots: 0, onUpdate: opt.onUpdate, onEnd: opt.onEnd, back: { x: Wk.x, z: Wk.z }, recoil: 0, flash: 0 };
    Wk.mode = 'tir'; Wk.prevFp = Wk.fp; Wk.fp = true; avatarW.visible = false;
    Wk.x = o.x; Wk.z = o.z + 4.3; Wk.y = .42; Wk.yaw = Math.PI; Wk.pitch = -.02;
    return true;
  };
  V.tirShoot = function (cx, cy) {
    if (!tir || tir.ammo <= 0) return null;
    tir.ammo--; tir.shots++; tir.recoil = 1; tir.flash = .06;
    const rc = new T.Raycaster(), v2 = new T.Vector2(0, 0);
    if (cx != null && !document.pointerLockElement) { const r = canvas.getBoundingClientRect(); v2.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); }
    rc.setFromCamera(v2, camera);
    const live = tir.targets.filter(x => !x.down).map(x => x.m), h = rc.intersectObjects(live, false)[0];
    let got = 0;
    if (h) { const tg = tir.targets.find(x => x.m === h.object); tg.down = 1.4; tir.hits++; got = tg.pts; tir.score += got; }
    if (tir.onUpdate) tir.onUpdate(tirInfo());
    if (tir.ammo <= 0) setTimeout(() => V.tirEnd(), 700);
    return got;
  };
  const tirInfo = () => tir ? { score: tir.score, hits: tir.hits, shots: tir.shots, ammo: tir.ammo, left: Math.max(0, Math.ceil(tir.len - (clock.elapsedTime - tir.t0))) } : null;
  V.tirEnd = function () {
    if (!tir) return; const r = tir, info = tirInfo(); tir = null;
    scene.remove(r.tg); r.tg.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    if (gun) { camera.remove(gun); gun = null; }
    Wk.mode = 'walk'; Wk.fp = !!Wk.prevFp; Wk.x = r.back.x; Wk.z = r.back.z;
    if (r.onEnd) r.onEnd(info);
  };
  function tirStep(dt, t) {
    tir.targets.forEach(x => {
      x.x += x.v * dt; if (x.x > 5.6) x.x = -5.6; if (x.x < -5.6) x.x = 5.6; x.p.position.x = x.x;
      if (x.down > 0) { x.down -= dt; x.p.rotation.x = Math.min(Math.PI / 2, x.p.rotation.x + dt * 12); if (x.down <= 0) x.down = 0; } else x.p.rotation.x = Math.max(0, x.p.rotation.x - dt * 6);
    });
    if (gun) { tir.recoil = Math.max(0, tir.recoil - dt * 8); gun.position.z = -.32 + tir.recoil * .04; gun.rotation.x = tir.recoil * .35; tir.flash -= dt; gun.userData.flash.visible = tir.flash > 0; }
    placeCamera(Wk.x, Wk.y, Wk.z, 1.62, 1);
    if (tirInfo().left <= 0) V.tirEnd(); else if (tir && tir.onUpdate && ((t * 4) | 0) !== tir.lastTick) { tir.lastTick = (t * 4) | 0; tir.onUpdate(tirInfo()); }
  }

  /* --- amis en direct : avatars qui se déplacent, véhicules, bulles de chat --- */
  const others = new Map(); let othersRoot = null;
  function bubble(text) { const b = label(String(text).slice(0, 60), { bg: 'rgba(255,255,255,.96)', color: '#14141f', scale: .065 }); b.material.depthTest = true; return b; }
  V.setOthers = function (list) {
    if (!othersRoot) { othersRoot = new T.Group(); scene.add(othersRoot); }
    const seen = new Set(), now = Date.now();
    list.forEach(o => {
      seen.add(o.uid); let e = others.get(o.uid);
      if (!e) {
        const p = person(o.avatar || '🙂', 0x3a86ff, false, o.look, o.uid); p.userData.noCol = true;
        const lb = label('👥 ' + (o.pseudo || '?'), { scale: .075, bg: 'rgba(40,110,230,.92)' }); lb.material.depthTest = true; lb.position.y = 2.25; p.add(lb);
        othersRoot.add(p); e = { g: p, x: o.x, z: o.z, r: o.r || 0, mt: 0, bub: null }; others.set(o.uid, e);
      }
      e.tx = o.x; e.tz = o.z; e.tr = o.r || 0; e.m = o.m;
      const vk = o.m === 'drive' && o.v ? o.v.join(':') : '';
      if (vk !== (e.vk || '')) {
        if (e.veh) { othersRoot.remove(e.veh); e.veh = null; }
        e.vk = vk;
        if (vk) { e.veh = car(+o.v[1] || 0xd00000, false, o.v[0]); othersRoot.add(e.veh); if (e.veh.userData.bike) { e.g.userData.pose(e.veh.userData.pose); e.veh.add(e.g); e.g.position.set(0, e.veh.userData.seat - (e.veh.userData.pose === 'stand' ? 0 : .9), -.3); e.g.rotation.set(0, 0, 0); } else e.g.visible = false; }
        if (!vk) { if (e.g.parent !== othersRoot) othersRoot.add(e.g); e.g.userData.pose(null); e.g.visible = true; }
      }
      if (o.msg && o.mt && o.mt !== e.mt && now - o.mt < 15000) { e.mt = o.mt; if (e.bub) e.g.remove(e.bub); e.bub = bubble(o.msg); e.bub.position.y = 2.65; e.g.add(e.bub); e.bubUntil = now + 8000; }
    });
    others.forEach((e, uid) => { if (!seen.has(uid)) { othersRoot.remove(e.g); if (e.veh) othersRoot.remove(e.veh); others.delete(uid); } });
  };
  V.othersCount = () => others.size;
  V.nearFriend = () => { let best = null, bd = 4; others.forEach((e, uid) => { const d = Math.hypot(e.x - Wk.x, e.z - Wk.z); if (d < bd) { bd = d; best = uid; } }); return best; };
  let myBub = null, myBubUntil = 0;
  V.say = function (text) { if (!avatarW) return; if (myBub) myBub.parent && myBub.parent.remove(myBub); myBub = bubble(text); myBub.position.y = 2.65; avatarW.add(myBub); myBubUntil = Date.now() + 8000; };
  function stepOthers(dt, t) {
    if (!othersRoot) return; othersRoot.visible = !inside;
    const now = Date.now();
    others.forEach(e => {
      const px = e.x, pz = e.z, k = Math.min(1, dt * 2.5);
      e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k;
      let dr = e.tr - e.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); e.r += dr * Math.min(1, dt * 5);
      const sp = Math.hypot(e.x - px, e.z - pz) / Math.max(dt, .001), gy = ground(e.x, e.z);
      if (e.veh) { e.veh.position.set(e.x, gy, e.z); e.veh.rotation.y = e.r; (e.veh.userData.wheels || []).forEach(w => w.children.forEach(o => { o.rotation.x += sp * dt / .33; })); if (e.veh.userData.bike) e.g.userData.step(dt, 0, false, t); }
      else { e.g.position.set(e.x, gy, e.z); e.g.rotation.y = e.r; e.g.userData.step(dt, sp > .3 ? sp : 0, sp > 5, t); }
      if (e.bub && now > e.bubUntil) { e.g.remove(e.bub); e.bub = null; }
    });
    if (myBub && now > myBubUntil) { myBub.parent && myBub.parent.remove(myBub); myBub = null; }
  }

  /* --- 🏎️ karting : 3 tours contre 2 pilotes, chrono --- */
  const extra = []; let race = null, bump = null;
  V.raceStart = function (opt) {
    if (!fair.kart || inside || Wk.mode !== 'walk' || !lotPos.kart) return false;
    const c = lotPos.kart, R0 = 8.4;
    const me = V.spawnVehicle({ id: 'kart', brand: 'Trad', model: 'Kart', grad: ['#e63946'], emoji: '🏎️' }, { x: c.x + R0, z: c.z + 1.6, yaw: Math.PI });
    me.vmax = 13; me.acc = 7.5; me.turn = 2.7;
    const ai = [[0x3a86ff, 9.6, 9.2], [0xffbe0b, 7.6, 8.6]].map(([cc, rr, sp], i) => {
      const m = car(cc, false, 'kart'), drv = person('😎', cc, false, TC.Avatar && TC.Avatar.random ? { av: TC.Avatar.random() } : null, 'ai' + i);
      drv.userData.pose('sit'); drv.position.set(0, .2 - .9, -.32); m.add(drv); scene.add(m);
      const a = { m, drv, ang: .45 + i * .3, r: rr, w: sp / rr, dist: 0 }; extra.push(a); return a;
    });
    race = { c, t0: clock.elapsedTime + 3, laps: opt.laps || 3, lap: 0, total: 0, last: Math.atan2(1.6, R0), lapT0: clock.elapsedTime + 3, best: 0, ai, me, onEnd: opt.onEnd, onLap: opt.onLap, back: { x: Wk.x, z: Wk.z } };
    Wk.nearVeh = me; V.enterVehicle(); Wk.lock = true; Wk.yaw = Math.PI;
    return true;
  };
  function raceStep(dt) {
    const r = race, v = Wk.veh; if (!v) return;
    const now = clock.elapsedTime, go = now > r.t0;
    if (!go) v.spd = 0;
    r.ai.forEach(a => {
      if (go) { a.ang -= a.w * dt; a.dist += a.w * dt; }
      const x = r.c.x + Math.cos(a.ang) * a.r, z = r.c.z + Math.sin(a.ang) * a.r;
      a.m.position.set(x, .44, z); a.m.rotation.y = Math.atan2(Math.sin(a.ang), -Math.cos(a.ang));
      (a.m.userData.wheels || []).forEach(w => w.children.forEach(o => { o.rotation.x += a.w * a.r * dt / .14; }));
    });
    const ang = Math.atan2(v.z - r.c.z, v.x - r.c.x); let d = ang - r.last; d = Math.atan2(Math.sin(d), Math.cos(d)); r.last = ang;
    if (go) r.total += -d;
    const done = Math.floor(Math.max(0, r.total) / (Math.PI * 2));
    if (done > r.lap) { const lt = now - r.lapT0; r.lapT0 = now; r.lap = done; r.best = r.best ? Math.min(r.best, lt) : lt; if (r.onLap) r.onLap(r.lap, lt); if (r.lap >= r.laps) { V.raceEnd(); return; } }
    r.info = { lap: Math.min(r.lap + 1, r.laps), laps: r.laps, time: Math.max(0, now - r.t0), best: r.best, pos: 1 + r.ai.filter(a => a.dist > r.total).length, count: r.ai.length + 1, countdown: Math.max(0, Math.ceil(r.t0 - now)) };
  }
  V.raceInfo = () => race && race.info;
  V.raceEnd = function (abandon) {
    const r = race; if (!r) return; race = null; Wk.lock = false;
    const res = { time: clock.elapsedTime - r.t0, best: r.best, pos: 1 + r.ai.filter(a => a.dist > r.total).length, laps: r.lap };
    r.ai.forEach(a => { scene.remove(a.m); }); extra.length = 0;
    if (Wk.veh) { Wk.veh.spd = 0; V.exitVehicle(true); } V.removeVehicle(r.me);
    Wk.x = r.back.x; Wk.z = r.back.z; Wk.mode = 'walk';
    if (r.onEnd) r.onEnd(abandon ? null : res);
  };

  /* --- 💥 auto-tamponneuses : 60 s, on compte les chocs --- */
  V.bumpStart = function (opt) {
    if (!fair.autos || inside || Wk.mode !== 'walk' || !lotPos.autos) return false;
    const c = lotPos.autos;
    const me = V.spawnVehicle({ id: 'bumper', brand: 'Auto', model: 'tamponneuse', grad: ['#3a86ff'], emoji: '💥' }, { x: c.x, z: c.z + 4, yaw: Math.PI });
    me.vmax = 6.5; me.acc = 7; me.turn = 3.2;
    fair.autos.g.children.forEach(o => { if (o.userData && o.userData.vs === 'bumper') o.visible = false; });
    const ai = [0xe63946, 0x06d6a0, 0xffbe0b, 0x8338ec, 0xff006e].map((cc, i) => {
      const m = car(cc, false, 'bumper'), drv = person('😎', cc, false, TC.Avatar && TC.Avatar.random ? { av: TC.Avatar.random() } : null, 'b' + i);
      drv.userData.pose('sit'); drv.position.set(0, .55 - .9, -.3); m.add(drv); scene.add(m);
      const a = { m, drv, x: c.x - 7 + i * 3.5, z: c.z - 4 + (i % 2) * 3, vx: (Math.random() - .5) * 6, vz: (Math.random() - .5) * 6 }; return a;
    });
    bump = { c, ai, me, t0: clock.elapsedTime, len: opt.len || 60, hits: 0, onEnd: opt.onEnd, onHit: opt.onHit, back: { x: Wk.x, z: Wk.z } };
    Wk.nearVeh = me; V.enterVehicle(); Wk.lock = true; Wk.yaw = Math.PI;
    return true;
  };
  function bumpStep(dt) {
    const b = bump, v = Wk.veh; if (!v) return;
    const hx = 9.2, hz = 7.2;
    b.ai.forEach((a, i) => {
      a.x += a.vx * dt; a.z += a.vz * dt;
      if (Math.abs(a.x - b.c.x) > hx) { a.x = b.c.x + Math.sign(a.x - b.c.x) * hx; a.vx *= -1; }
      if (Math.abs(a.z - b.c.z) > hz) { a.z = b.c.z + Math.sign(a.z - b.c.z) * hz; a.vz *= -1; }
      const sp = Math.hypot(a.vx, a.vz); if (sp < 2.5) { a.vx += (Math.random() - .5) * 2; a.vz += (Math.random() - .5) * 2; } if (sp > 6) { a.vx *= .98; a.vz *= .98; }
      b.ai.forEach((o, j) => { if (j <= i) return; const dx = o.x - a.x, dz = o.z - a.z, d = Math.hypot(dx, dz); if (d < 2.1 && d > 0) { const nx = dx / d, nz = dz / d, p = (a.vx - o.vx) * nx + (a.vz - o.vz) * nz; if (p > 0) { a.vx -= p * nx; a.vz -= p * nz; o.vx += p * nx; o.vz += p * nz; } a.x -= nx * (2.1 - d) / 2; o.x += nx * (2.1 - d) / 2; a.z -= nz * (2.1 - d) / 2; o.z += nz * (2.1 - d) / 2; } });
      const dx = a.x - v.x, dz = a.z - v.z, d = Math.hypot(dx, dz);
      if (d < 2.15 && d > 0) {
        const nx = dx / d, nz = dz / d, mv = Math.sin(v.yaw) * v.spd * nx + Math.cos(v.yaw) * v.spd * nz;
        if (mv > 1.2 && !a.cool) { b.hits++; a.cool = .6; if (b.onHit) b.onHit(b.hits, mv); }
        a.vx += nx * Math.max(2, mv * 1.1); a.vz += nz * Math.max(2, mv * 1.1); v.spd *= -.35;
        a.x += nx * (2.15 - d); a.z += nz * (2.15 - d);
      }
      if (a.cool) a.cool = Math.max(0, a.cool - dt);
      a.m.position.set(a.x, .57, a.z); const want = Math.atan2(a.vx, a.vz); let dr = want - a.m.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); a.m.rotation.y += dr * Math.min(1, dt * 4);
    });
    v.x = Math.max(b.c.x - hx, Math.min(b.c.x + hx, v.x)); v.z = Math.max(b.c.z - hz, Math.min(b.c.z + hz, v.z));
    b.info = { hits: b.hits, left: Math.max(0, Math.ceil(b.len - (clock.elapsedTime - b.t0))) };
    if (b.info.left <= 0) V.bumpEnd();
  }
  V.bumpInfo = () => bump && bump.info;
  V.bumpEnd = function () {
    const b = bump; if (!b) return; bump = null; Wk.lock = false;
    b.ai.forEach(a => scene.remove(a.m));
    fair.autos.g.children.forEach(o => { if (o.userData && o.userData.vs === 'bumper') o.visible = true; });
    if (Wk.veh) { Wk.veh.spd = 0; V.exitVehicle(true); } V.removeVehicle(b.me);
    Wk.x = b.back.x; Wk.z = b.back.z; Wk.mode = 'walk';
    if (b.onEnd) b.onEnd({ hits: b.hits });
  };
  /* --- 🎠 manège --- */
  V.carouselStart = function (onEnd) {
    const F = fair.manege; if (!F || inside || Wk.mode !== 'walk') return false;
    ride = { horse: F.horses[0], t0: clock.elapsedTime, len: 40, onEnd, back: { x: Wk.x, z: Wk.z } };
    Wk.mode = 'ride'; Wk.rideKind = 'manege'; Wk.prevFp = Wk.fp; Wk.fp = true; avatarW.visible = false; Wk.pitch = .05;
    return true;
  };

  function stepAll(dt, t) {
    if (Wk.mode === 'drive' && Wk.veh) driveStep(dt, t);
    else if (Wk.mode === 'ride' && ride) rideStep(dt, t);
    else if (Wk.mode === 'tir' && tir) tirStep(dt, t);
    else { Wk.mode = 'walk'; walkStep(dt, t); }
    if (race) raceStep(dt); if (bump) bumpStep(dt);
    stepDoor(dt); stepGhost(); stepOthers(dt, t);
    shadowsFollow(Wk.x, Wk.z);
  }
  V.walk = function (on, opt = {}) {
    if (!V.ready) return false;
    if (on) {
      if (inside) V.exit(true);
      avatarOpt = opt;
      if (avatarW) scene.remove(avatarW);
      avatarW = person(opt.avatar || '😎', opt.color || 0x3a86ff, true, opt.look, opt.uid || 'me'); scene.add(avatarW);
      if (!parkRoot) { parkRoot = new T.Group(); scene.add(parkRoot); }
      const p = (opt.uid && lotPos[opt.uid]) || lotPos.market || { x: 0, z: 0 };
      Wk.x = p.x; Wk.z = p.z + BLOCK / 2 + 1.5; Wk.y = .05; Wk.yaw = Math.PI; Wk.face = Math.PI; Wk.keys = {}; Wk.joy = { x: 0, y: 0, run: false }; Wk.mode = 'walk'; Wk.pitch = .26;
      Wk.on = true; avatarW.visible = true; if (meWalker) meWalker.visible = false;
      camera.near = .08; camera.far = 1800; camera.fov = 62; camera.updateProjectionMatrix();
      if (opt.vehicle && !parkG.list.length) V.spawnVehicle(opt.vehicle, { x: p.x + 5, z: p.z + BLOCK / 2 + 2.6, yaw: Math.PI / 2 });
    } else {
      if (race) V.raceEnd(true); if (bump) V.bumpEnd(); if (tir) V.tirEnd(); if (ride) { ride = null; } if (Wk.veh) { Wk.veh.spd = 0; V.exitVehicle(); } if (houseInfo) V.exitHouse();
      Wk.on = false; Wk.keys = {}; Wk.mode = 'walk'; if (avatarW) avatarW.visible = false; if (meWalker) meWalker.visible = true;
      camera.near = 1; camera.far = 3000; camera.fov = 45; camera.updateProjectionMatrix(); setSky();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
    setTimeout(resize, 30); return true;
  };
  V.setView = fp => { Wk.fp = fp; Wk.pitch = fp ? 0 : .26; };
  V.canvas = () => canvas;
  V.nearInfo = () => { const k = Wk.near; if (!k) return null; return k in LAND ? { land: k } : { uid: k }; };
  V.openNear = () => { const n = V.nearInfo(); if (n && onPick) onPick(n); return n; };
  V.resize = () => resize();

  /* ---------- Boucle ---------- */
  function loop() {
    if (!running) return;
    if (!canvas.isConnected || document.hidden || (TC.UI && TC.UI.tab !== 'city')) { running = false; return; }
    requestAnimationFrame(loop);
    const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
    cam.idle += dt;
    if (Wk.on) stepAll(dt, t);
    else if (cam.goal) { const g = cam.goal, k = Math.min(1, dt * 3); cam.tx += (g.tx - cam.tx) * k; cam.tz += (g.tz - cam.tz) * k; cam.r += (g.r - cam.r) * k; cam.ty += ((g.ty || 4) - cam.ty) * k; if (Math.abs(g.tx - cam.tx) + Math.abs(g.tz - cam.tz) + Math.abs(g.r - cam.r) < .5) cam.goal = null; }
    else if (cam.idle > 6) cam.th += dt * .05; // rotation lente quand on ne touche à rien
    if (!Wk.on) applyCam();
    if (sky) sky.position.copy(camera.position);
    if (inside) { animIn.forEach(f => f(t, dt)); if (!Wk.on) walls.forEach(w => { const n = w.userData.n; w.visible = (camera.position.x * n[0] + camera.position.z * n[1]) < w.userData.half + 2; }); }
    else animated.forEach(f => f(t, dt));
    stepLights(t);
    blinkers.forEach((b, i) => { b.visible = ((t + i * .3) % 1.4) < .7; });
    cars.forEach(c => {
      if (Wk.on) { // le piéton devant la voiture : elle s'arrête
        const along = ((c.axis === 'x' ? Wk.x : Wk.z) - c.t) * c.dir, lat = Math.abs((c.axis === 'x' ? Wk.z : Wk.x) - c.line);
        if (lat < 1.8 && along > 0 && along < 7) return;
      }
      c.t += c.v * c.dir * dt; const lim = c.W / 2 + 6;
      if (c.t > lim) c.t = -lim; if (c.t < -lim) c.t = lim;
      if (c.axis === 'x') c.g.position.set(c.t, .1, c.line); else c.g.position.set(c.line, .1, c.t);
    });
    if (snow) { const a = snow.geometry.attributes.position; for (let i = 1; i < a.array.length; i += 3) { a.array[i] -= dt * 6; if (a.array[i] < 0) a.array[i] = 90; } a.needsUpdate = true; }
    // les étiquettes lointaines s'effacent pour ne pas encombrer
    if (!inside) labels.forEach(l => { l.visible = !Wk.on; if (Wk.on) return; const d = l.position.distanceTo(camera.position); const o = Math.max(0, Math.min(1, (HALF * 3.2 - d) / (HALF * 1.2))); l.material.opacity = Math.max(.12, o); });
    try { renderer.render(scene, camera); } catch (e) { fail('rendu : ' + (e.message || e)); }
  }

  /* ---------- API pour city.js ---------- */
  V.mount = function (el, data, pickCb) {
    host = el; onPick = pickCb;
    if (canvas.parentNode !== el) el.appendChild(canvas);
    const s = JSON.stringify([data.players.map(p => [p.uid, p.tier, p.biz, p.me, p.mayor, p.friend, p.pseudo, p.plus, p.car && p.car.color, p.bld && p.bld.d ? Math.min(20, Math.floor((Date.now() - p.bld.s) / p.bld.d * 20)) : -1]), data.night, forcedNight]);
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

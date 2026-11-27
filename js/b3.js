/* Trad Center — couche « B3 » : l'API de Three.js (celle qu'utilise city3d.js) dessinée par Babylon.js.
 * Même repère (main droite, y vers le haut), mêmes géométries, mêmes matériaux standard : la ville 3D garde son code,
 * mais c'est Babylon.js qui fait le rendu (PBR, ombres, tone mapping ACES, bloom, anti-crénelage).
 * Chargé seulement quand on ouvre l'onglet Ville, juste après js/vendor/babylon.js. */
(function () {
  const B = window.BABYLON; if (!B) return;
  const T = window.B3 = {};
  T.FrontSide = 0; T.BackSide = 1; T.DoubleSide = 2; T.RepeatWrapping = 1000; T.sRGBEncoding = 3001; T.PCFShadowMap = 1; T.PCFSoftShadowMap = 2; T.ACESFilmicToneMapping = 4;
  let SC = null; // scène Babylon courante
  const CCW = B.Material.CounterClockWiseSideOrientation;

  /* ---------- Maths ---------- */
  class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } clone() { return new Vector2(this.x, this.y); } copy(v) { this.x = v.x; this.y = v.y; return this; } }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } setScalar(s) { this.x = this.y = this.z = s; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; } sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; } length() { return Math.hypot(this.x, this.y, this.z); }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); } normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  }
  class Euler { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(e) { this.x = e.x; this.y = e.y; this.z = e.z; return this; } }
  class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    setFromEuler(e) { // ordre XYZ, comme Three.js
      const c1 = Math.cos(e.x / 2), c2 = Math.cos(e.y / 2), c3 = Math.cos(e.z / 2), s1 = Math.sin(e.x / 2), s2 = Math.sin(e.y / 2), s3 = Math.sin(e.z / 2);
      this.x = s1 * c2 * c3 + c1 * s2 * s3; this.y = c1 * s2 * c3 - s1 * c2 * s3; this.z = c1 * c2 * s3 + s1 * s2 * c3; this.w = c1 * c2 * c3 - s1 * s2 * s3; return this;
    }
  }
  class Matrix4 {
    constructor() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
    identity() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; return this; }
    makeTranslation(x, y, z) { this.identity(); const e = this.elements; e[12] = x; e[13] = y; e[14] = z; return this; }
    compose(p, q, s) {
      const e = this.elements, x = q.x, y = q.y, z = q.z, w = q.w, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
      e[0] = (1 - (yy + zz)) * s.x; e[1] = (xy + wz) * s.x; e[2] = (xz - wy) * s.x; e[3] = 0; e[4] = (xy - wz) * s.y; e[5] = (1 - (xx + zz)) * s.y; e[6] = (yz + wx) * s.y; e[7] = 0;
      e[8] = (xz + wy) * s.z; e[9] = (yz - wx) * s.z; e[10] = (1 - (xx + yy)) * s.z; e[11] = 0; e[12] = p.x; e[13] = p.y; e[14] = p.z; e[15] = 1; return this;
    }
    multiplyMatrices(a, b) { // a * b (colonne majeure)
      const A = a.elements, Bm = b.elements, o = new Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = A[r] * Bm[c * 4] + A[4 + r] * Bm[c * 4 + 1] + A[8 + r] * Bm[c * 4 + 2] + A[12 + r] * Bm[c * 4 + 3];
      this.elements = o; return this;
    }
    applyToVec(v, out) { const e = this.elements; out.set(e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12], e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13], e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]); return out; }
  }
  class Color {
    constructor(hex) { this.r = 1; this.g = 1; this.b = 1; this._cb = null; if (hex !== undefined) this.set(hex); }
    set(v) { if (v && typeof v === 'object') { this.r = v.r; this.g = v.g; this.b = v.b; } else { v = +v || 0; this.r = ((v >> 16) & 255) / 255; this.g = ((v >> 8) & 255) / 255; this.b = (v & 255) / 255; } if (this._cb) this._cb(); return this; }
    setHex(h) { return this.set(h); } copy(c) { return this.set(c); } clone() { return new Color(this); }
    lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; if (this._cb) this._cb(); return this; }
    getHex() { return (Math.round(this.r * 255) << 16) | (Math.round(this.g * 255) << 8) | Math.round(this.b * 255); }
    toB3() { return new B.Color3(this.r, this.g, this.b); }
  }
  T.Vector2 = Vector2; T.Vector3 = Vector3; T.Euler = Euler; T.Quaternion = Quaternion; T.Matrix4 = Matrix4; T.Color = Color;
  T.Clock = class { constructor() { this.last = performance.now(); this.elapsedTime = 0; } getDelta() { const n = performance.now(), d = (n - this.last) / 1000; this.last = n; this.elapsedTime += d; return d; } };

  /* ---------- Géométries (mêmes algorithmes que Three.js : sommets, normales, UV, sens des faces) ---------- */
  class BufferGeometry {
    constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; this._meshes = new Set(); this.attributes = {}; this.type = 'BufferGeometry'; }
    setAttribute(name, a) { if (name === 'position') { this.pos = a.array; this.attributes.position = a; } return this; }
    translate(x, y, z) { for (let i = 0; i < this.pos.length; i += 3) { this.pos[i] += x; this.pos[i + 1] += y; this.pos[i + 2] += z; } this._dirty(); return this; }
    rotateY(a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < this.pos.length; i += 3) { const x = this.pos[i], z = this.pos[i + 2]; this.pos[i] = x * c + z * s; this.pos[i + 2] = -x * s + z * c; } this._rotN('y', c, s); this._dirty(); return this; }
    rotateX(a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < this.pos.length; i += 3) { const y = this.pos[i + 1], z = this.pos[i + 2]; this.pos[i + 1] = y * c - z * s; this.pos[i + 2] = y * s + z * c; } this._rotN('x', c, s); this._dirty(); return this; }
    _rotN(ax, c, s) { const n = this.nor; for (let i = 0; i < n.length; i += 3) { if (ax === 'y') { const x = n[i], z = n[i + 2]; n[i] = x * c + z * s; n[i + 2] = -x * s + z * c; } else { const y = n[i + 1], z = n[i + 2]; n[i + 1] = y * c - z * s; n[i + 2] = y * s + z * c; } } }
    computeVertexNormals() { // géométrie sans index : chaque triangle garde sa normale (ombrage facetté, comme Three.js)
      const p = this.pos, n = this.nor = new Array(p.length).fill(0);
      if (!this.idx.length) { for (let i = 0; i < p.length; i += 9) { const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2], bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2]; let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; for (let k = 0; k < 9; k += 3) { n[i + k] = nx; n[i + k + 1] = ny; n[i + k + 2] = nz; } } }
      else { const I = this.idx; for (let i = 0; i < I.length; i += 3) { const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3; const ax = p[b] - p[a], ay = p[b + 1] - p[a + 1], az = p[b + 2] - p[a + 2], bx = p[c] - p[a], by = p[c + 1] - p[a + 1], bz = p[c + 2] - p[a + 2]; const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; [a, b, c].forEach(k => { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }); } for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; } }
      this._dirty(); return this;
    }
    _dirty() { this._meshes.forEach(m => m._refreshGeo()); }
    bounds() { if (this._bb) return this._bb; const p = this.pos; let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], p[i + k]); b[k] = Math.max(b[k], p[i + k]); } return (this._bb = { min: a, max: b }); }
    dispose() { this._meshes.forEach(m => m._release()); }
    pack() { // tableaux typés : 2 à 3 fois moins de mémoire que des tableaux JS de nombres
      if (!(this.pos instanceof Float32Array)) this.pos = Float32Array.from(this.pos);
      if (!(this.nor instanceof Float32Array)) this.nor = Float32Array.from(this.nor);
      if (!(this.uv instanceof Float32Array)) this.uv = Float32Array.from(this.uv);
      if (!(this.idx instanceof Uint32Array) && !(this.idx instanceof Uint16Array)) { const n = this.idx.length || this.pos.length / 3; if (!this.idx.length) { this.idx = new Uint32Array(n); for (let i = 0; i < n; i++) this.idx[i] = i; } else this.idx = (this.pos.length / 3 > 65535 ? Uint32Array : Uint16Array).from(this.idx); }
    }
    vertexData() { this.pack(); const vd = new B.VertexData(); vd.positions = this.pos; vd.normals = this.nor.length ? this.nor : null; vd.uvs = this.uv.length ? this.uv : null; vd.indices = this.idx; return vd; }
  }
  T.BufferGeometry = BufferGeometry; T.Float32BufferAttribute = class { constructor(a, n) { this.array = a; this.itemSize = n; this._cb = null; } set needsUpdate(v) { if (v && this._cb) this._cb(); } get needsUpdate() { return false; } };
  const gv = (g, x, y, z, nx, ny, nz, u, v) => { g.pos.push(x, y, z); g.nor.push(nx, ny, nz); g.uv.push(u, v); return g.pos.length / 3 - 1; };
  T.BoxGeometry = class extends BufferGeometry {
    constructor(w = 1, h = 1, d = 1, ws = 1, hs = 1, ds = 1) {
      super(); const g = this; g.groups = [];
      const plane = (u, v, wd, udir, vdir, W, H, D, gx, gy) => { // buildPlane de Three.js
        const gw = W / gx, gh = H / gy, hw = W / 2, hh = H / 2, hd = D / 2, base = g.pos.length / 3, i0 = g.idx.length;
        const A = { x: 0, y: 1, z: 2 };
        for (let iy = 0; iy <= gy; iy++) for (let ix = 0; ix <= gx; ix++) {
          const p = [0, 0, 0]; p[A[u]] = (ix * gw - hw) * udir; p[A[v]] = (iy * gh - hh) * vdir; p[A[wd]] = hd; const n = [0, 0, 0]; n[A[wd]] = D > 0 ? 1 : -1;
          g.pos.push(p[0], p[1], p[2]); g.nor.push(n[0], n[1], n[2]); g.uv.push(ix / gx, 1 - iy / gy);
        }
        for (let iy = 0; iy < gy; iy++) for (let ix = 0; ix < gx; ix++) { const a = base + ix + (gx + 1) * iy, b = base + ix + (gx + 1) * (iy + 1), c = base + (ix + 1) + (gx + 1) * (iy + 1), dd = base + (ix + 1) + (gx + 1) * iy; g.idx.push(a, b, dd, b, c, dd); }
        g.groups.push({ start: i0, count: g.idx.length - i0, materialIndex: g.groups.length });
      };
      plane('z', 'y', 'x', -1, -1, d, h, w, ds, hs); plane('z', 'y', 'x', 1, -1, d, h, -w, ds, hs); plane('x', 'z', 'y', 1, 1, w, d, h, ws, ds); plane('x', 'z', 'y', 1, -1, w, d, -h, ws, ds); plane('x', 'y', 'z', 1, -1, w, h, d, ws, hs); plane('x', 'y', 'z', -1, -1, w, h, -d, ws, hs);
    }
  };
  T.PlaneGeometry = class extends BufferGeometry {
    constructor(w = 1, h = 1, ws = 1, hs = 1) { super(); const gw = w / ws, gh = h / hs; for (let iy = 0; iy <= hs; iy++) for (let ix = 0; ix <= ws; ix++) gv(this, ix * gw - w / 2, -(iy * gh - h / 2), 0, 0, 0, 1, ix / ws, 1 - iy / hs); for (let iy = 0; iy < hs; iy++) for (let ix = 0; ix < ws; ix++) { const a = ix + (ws + 1) * iy, b = ix + (ws + 1) * (iy + 1), c = ix + 1 + (ws + 1) * (iy + 1), d = ix + 1 + (ws + 1) * iy; this.idx.push(a, b, d, b, c, d); } }
  };
  T.SphereGeometry = class extends BufferGeometry {
    constructor(r = 1, ws = 32, hs = 16, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) {
      super(); ws = Math.max(3, Math.floor(ws)); hs = Math.max(2, Math.floor(hs)); const te = Math.min(ts + tl, Math.PI), grid = []; let k = 0;
      for (let iy = 0; iy <= hs; iy++) { const row = [], v = iy / hs; let uo = 0; if (iy === 0 && ts === 0) uo = .5 / ws; else if (iy === hs && te === Math.PI) uo = -.5 / ws;
        for (let ix = 0; ix <= ws; ix++) { const u = ix / ws, x = -r * Math.cos(ps + u * pl) * Math.sin(ts + v * tl), y = r * Math.cos(ts + v * tl), z = r * Math.sin(ps + u * pl) * Math.sin(ts + v * tl), l = Math.hypot(x, y, z) || 1; gv(this, x, y, z, x / l, y / l, z / l, u + uo, 1 - v); row.push(k++); } grid.push(row); }
      for (let iy = 0; iy < hs; iy++) for (let ix = 0; ix < ws; ix++) { const a = grid[iy][ix + 1], b = grid[iy][ix], c = grid[iy + 1][ix], d = grid[iy + 1][ix + 1]; if (iy !== 0 || ts > 0) this.idx.push(a, b, d); if (iy !== hs - 1 || te < Math.PI) this.idx.push(b, c, d); }
    }
  };
  class CylinderGeometry extends BufferGeometry {
    constructor(rt = 1, rb = 1, h = 1, rs = 8, hs = 1, open = false, ts = 0, tl = Math.PI * 2) {
      super(); rs = Math.floor(rs); hs = Math.floor(hs); const g = this, grid = []; let idx = 0; const slope = (rb - rt) / h;
      for (let y = 0; y <= hs; y++) { const row = [], v = y / hs, r = v * (rb - rt) + rt; for (let x = 0; x <= rs; x++) { const u = x / rs, th = u * tl + ts, st = Math.sin(th), ct = Math.cos(th); const n = new Vector3(st, slope, ct).normalize(); gv(g, r * st, -v * h + h / 2, r * ct, n.x, n.y, n.z, u, 1 - v); row.push(idx++); } grid.push(row); }
      for (let x = 0; x < rs; x++) for (let y = 0; y < hs; y++) { const a = grid[y][x], b = grid[y + 1][x], c = grid[y + 1][x + 1], d = grid[y][x + 1]; if (rt > 0 || y !== 0) g.idx.push(a, b, d); if (rb > 0 || y !== hs - 1) g.idx.push(b, c, d); }
      if (!open) for (const top of [true, false]) { const r = top ? rt : rb; if (r <= 0) continue; const sign = top ? 1 : -1, cs = []; for (let x = 1; x <= rs; x++) cs.push(gv(g, 0, h / 2 * sign, 0, 0, sign, 0, .5, .5)); const ring = []; for (let x = 0; x <= rs; x++) { const u = x / rs, th = u * tl + ts, ct = Math.cos(th), st = Math.sin(th); ring.push(gv(g, r * st, h / 2 * sign, r * ct, 0, sign, 0, ct * .5 + .5, st * .5 * sign + .5)); } for (let x = 0; x < rs; x++) { const c = cs[x], i = ring[x]; if (top) g.idx.push(i, i + 1 - 0, c); else g.idx.push(i + 1, i, c); } }
    }
  }
  T.CylinderGeometry = CylinderGeometry;
  T.ConeGeometry = class extends CylinderGeometry { constructor(r = 1, h = 1, rs = 8, hs = 1, open = false) { super(0, r, h, rs, hs, open); } };
  T.CircleGeometry = class extends BufferGeometry { constructor(r = 1, s = 8) { super(); gv(this, 0, 0, 0, 0, 0, 1, .5, .5); for (let i = 0; i <= s; i++) { const a = i / s * Math.PI * 2; gv(this, r * Math.cos(a), r * Math.sin(a), 0, 0, 0, 1, (Math.cos(a) + 1) / 2, (Math.sin(a) + 1) / 2); } for (let i = 1; i <= s; i++) this.idx.push(i, i + 1, 0); } };
  T.TorusGeometry = class extends BufferGeometry {
    constructor(r = 1, tube = .4, rs = 12, ts = 48, arc = Math.PI * 2) {
      super(); for (let j = 0; j <= rs; j++) for (let i = 0; i <= ts; i++) { const u = i / ts * arc, v = j / rs * Math.PI * 2, x = (r + tube * Math.cos(v)) * Math.cos(u), y = (r + tube * Math.cos(v)) * Math.sin(u), z = tube * Math.sin(v), cx = r * Math.cos(u), cy = r * Math.sin(u), n = new Vector3(x - cx, y - cy, z).normalize(); gv(this, x, y, z, n.x, n.y, n.z, i / ts, j / rs); }
      for (let j = 1; j <= rs; j++) for (let i = 1; i <= ts; i++) { const a = (ts + 1) * j + i - 1, b = (ts + 1) * (j - 1) + i - 1, c = (ts + 1) * (j - 1) + i, d = (ts + 1) * j + i; this.idx.push(a, b, d, b, c, d); }
    }
  };
  T.CapsuleGeometry = class extends BufferGeometry { // révolution d'un profil : hémisphère haut, cylindre, hémisphère bas
    constructor(r = 1, len = 1, cs = 4, rs = 8) {
      super(); const prof = []; // [rayon, y, nr, ny]
      for (let i = 0; i <= cs; i++) { const a = i / cs * Math.PI / 2; prof.push([r * Math.sin(a), len / 2 + r * Math.cos(a), Math.sin(a), Math.cos(a)]); }
      for (let i = 0; i <= cs; i++) { const a = Math.PI / 2 + i / cs * Math.PI / 2; prof.push([r * Math.sin(a), -len / 2 + r * Math.cos(a), Math.sin(a), Math.cos(a)]); }
      prof.forEach((p, j) => { for (let i = 0; i <= rs; i++) { const th = i / rs * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); gv(this, p[0] * s, p[1], p[0] * c, p[2] * s, p[3], p[2] * c, i / rs, 1 - j / (prof.length - 1)); } });
      for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < rs; i++) { const a = j * (rs + 1) + i, b = (j + 1) * (rs + 1) + i, c = (j + 1) * (rs + 1) + i + 1, d = j * (rs + 1) + i + 1; this.idx.push(a, b, d, b, c, d); }
    }
  };
  T.OctahedronGeometry = class extends BufferGeometry {
    constructor(r = 1) { super(); const V = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]], F = [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 3], [1, 3, 4], [1, 4, 2]]; F.forEach(f => f.forEach(i => this.pos.push(...V[i]))); this.computeVertexNormals(); this.uv = new Array(F.length * 6).fill(0); }
  };
  class Shape { // contour 2D : moveTo / lineTo / splineThru (courbe de Catmull-Rom)
    constructor() { this.pts = []; }
    moveTo(x, y) { this.pts.push(new Vector2(x, y)); return this; } lineTo(x, y) { this.pts.push(new Vector2(x, y)); return this; }
    splineThru(list) { const P = [this.pts[this.pts.length - 1], ...list], seg = 12; for (let i = 0; i < P.length - 1 + 1; i++) { const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[Math.min(P.length - 1, i + 1)], p3 = P[Math.min(P.length - 1, i + 2)]; if (i >= P.length - 1) break; for (let s = 1; s <= seg; s++) { const t = s / seg, t2 = t * t, t3 = t2 * t; const f = (a, b, c, d) => .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); this.pts.push(new Vector2(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y))); } } return this; }
    points() { const p = this.pts.slice(); if (p.length > 1 && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-6) p.pop(); return p; }
  }
  T.Shape = Shape;
  function triangulate(pts) { // découpage en oreilles d'un polygone simple (indices)
    const n = pts.length, V = [], area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % n]; return s + (p.x * q.y - q.x * p.y); }, 0); for (let i = 0; i < n; i++) V.push(area > 0 ? i : n - 1 - i);
    const out = [], cross = (a, b, c) => (pts[b].x - pts[a].x) * (pts[c].y - pts[a].y) - (pts[b].y - pts[a].y) * (pts[c].x - pts[a].x);
    const inTri = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    let guard = 0; while (V.length > 3 && guard++ < 5000) { let cut = false; for (let i = 0; i < V.length; i++) { const a = V[(i + V.length - 1) % V.length], b = V[i], c = V[(i + 1) % V.length]; if (cross(a, b, c) <= 1e-12) continue; let ok = true; for (const p of V) { if (p === a || p === b || p === c) continue; if (inTri(p, a, b, c)) { ok = false; break; } } if (ok) { out.push(a, b, c); V.splice(i, 1); cut = true; break; } } if (!cut) break; }
    if (V.length === 3) out.push(V[0], V[1], V[2]); return { tri: out, ccw: area > 0 };
  }
  T.ExtrudeGeometry = class extends BufferGeometry {
    constructor(shape, o = {}) {
      super(); const depth = o.depth == null ? 1 : o.depth, bev = o.bevelEnabled !== false && (o.bevelThickness || o.bevelSize) ? true : false, bt = bev ? (o.bevelThickness == null ? .2 : o.bevelThickness) : 0, bs = bev ? (o.bevelSize == null ? bt - .1 : o.bevelSize) : 0, segs = bev ? Math.max(1, o.bevelSegments == null ? 3 : o.bevelSegments) : 0;
      let P = shape.points(); const tr = triangulate(P); if (!tr.ccw) P = P.slice().reverse(); const n = P.length;
      const dirs = P.map((p, i) => { const a = P[(i + n - 1) % n], b = P[(i + 1) % n]; let e1x = p.x - a.x, e1y = p.y - a.y, e2x = b.x - p.x, e2y = b.y - p.y; const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1; e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2; const n1 = [e1y, -e1x], n2 = [e2y, -e2x]; let bx = n1[0] + n2[0], by = n1[1] + n2[1]; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl; const k = 1 / Math.max(.3, bx * n1[0] + by * n1[1]); return [bx * k, by * k]; });
      const layers = []; for (let b = 0; b < segs; b++) { const t = b / segs; layers.push({ z: -bt * Math.cos(t * Math.PI / 2), off: bs * Math.sin(t * Math.PI / 2) }); }
      layers.push({ z: 0, off: bs }); layers.push({ z: depth, off: bs }); for (let b = segs - 1; b >= 0; b--) { const t = b / segs; layers.push({ z: depth + bt * Math.cos(t * Math.PI / 2), off: bs * Math.sin(t * Math.PI / 2) }); }
      const ring = L => P.map((p, i) => [p.x + dirs[i][0] * L.off, p.y + dirs[i][1] * L.off, L.z]);
      const rings = layers.map(ring), pos = this.pos, tri = (a, b, c) => pos.push(...a, ...b, ...c);
      for (let l = 0; l < rings.length - 1; l++) for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = rings[l][i], b = rings[l][j], c = rings[l + 1][j], d = rings[l + 1][i]; tri(a, b, c); tri(a, c, d); }
      const cap = (R, front) => { for (let i = 0; i < tr.tri.length; i += 3) { const a = tr.tri[i], b = tr.tri[i + 1], c = tr.tri[i + 2]; if (front) tri(R[a], R[c], R[b]); else tri(R[a], R[b], R[c]); } };
      cap(rings[0], true); cap(rings[rings.length - 1], false);
      this.computeVertexNormals(); this.uv = new Array(pos.length / 3 * 2).fill(0);
    }
  };

  /* ---------- Textures ---------- */
  class Texture { constructor() { this.wrapS = this.wrapT = 0; this.repeat = new Vector2(1, 1); this.encoding = 0; this.anisotropy = 1; this._bt = null; this.flipY = true; }
    set needsUpdate(v) { if (v && this._bt) { this._apply(); if (this._bt.update) this._bt.update(); } }
    bt() { if (this._bt) return this._bt; this._bt = this._make(); this._apply(); return this._bt; }
    _apply() { const t = this._bt; if (!t) return; t.uScale = this.repeat.x; t.vScale = this.repeat.y; t.wrapU = t.wrapV = this.wrapS === T.RepeatWrapping ? B.Texture.WRAP_ADDRESSMODE : B.Texture.CLAMP_ADDRESSMODE; t.anisotropicFilteringLevel = Math.max(1, this.anisotropy); }
    dispose() { if (this._bt) { this._bt.dispose(); this._bt = null; } } }
  T.CanvasTexture = class extends Texture {
    constructor(canvas) { super(); this.image = canvas; this.hasAlpha = true; }
    _make() { const d = new B.DynamicTexture('tx', this.image, SC, true, B.Texture.TRILINEAR_SAMPLINGMODE); d.hasAlpha = this.hasAlpha; d.gammaSpace = false; d.update(true); return d; }
    clone() { const t = new T.CanvasTexture(this.image); t.wrapS = this.wrapS; t.wrapT = this.wrapT; t.repeat.copy(this.repeat); t.anisotropy = this.anisotropy; return t; }
    set needsUpdate(v) { if (v && this._bt) { this._apply(); this._bt.update(true); } }
  };

  /* ---------- Matériaux ---------- */
  const watch = (m, c) => { c._cb = () => m._sync(); return c; };
  class Material {
    constructor(o = {}) { this._o = o; this.transparent = !!o.transparent; this._opacity = o.opacity == null ? 1 : o.opacity; this.side = o.side || 0; this.depthWrite = o.depthWrite !== false; this._depthTest = o.depthTest !== false; this.fog = o.fog !== false; this.visible = o.visible !== false; this.wireframe = !!o.wireframe; this._map = o.map || null; this._bm = null; this.isMaterial = true; }
    get opacity() { return this._opacity; } set opacity(v) { this._opacity = v; this._sync(); }
    get map() { return this._map; } set map(v) { this._map = v; this._rebuild(); }
    get depthTest() { return this._depthTest; } set depthTest(v) { this._depthTest = v; this._sync(); }
    bm() { if (!this._bm) { this._bm = this._build(); this._bm.sideOrientation = CCW; this._sync(); } return this._bm; }
    _rebuild() { if (this._bm) { this._bm.dispose(false, false); this._bm = null; this._users && this._users.forEach(m => m._useMat()); } }
    dispose() { if (this._bm) { this._bm.dispose(false, false); this._bm = null; } }
    // plus aucun objet ne s'en sert : on libère le matériau Babylon et ses textures (recréés à la demande s'il resservait)
    _free() { this.dispose(); [this._map, this._emap].forEach(t => { if (t && t._mats) { t._mats.delete(this); if (!t._mats.size) t.dispose(); } }); }
    _tex(t) { (t._mats || (t._mats = new Set())).add(this); return t.bt(); }
    clone() { const c = new this.constructor(Object.assign({}, this._o)); this._copyTo(c); return c; }
    _copyTo(c) { c.transparent = this.transparent; c._opacity = this._opacity; c.side = this.side; c._map = this._map; if (this.color) c.color.copy(this.color); if (this.emissive) { c.emissive.copy(this.emissive); c.emissiveIntensity = this.emissiveIntensity; } if (c.roughness !== undefined) { c.roughness = this.roughness; c.metalness = this.metalness; } }
    _common(m) {
      m.backFaceCulling = this.side !== 2; m.alpha = this.transparent ? this._opacity : 1; m.disableDepthWrite = !this.depthWrite; m.wireframe = this.wireframe; m.fogEnabled = this.fog;
      m.depthFunction = this._depthTest ? 0 : B.Constants.ALWAYS;
    }
  }
  T.MeshStandardMaterial = class extends Material {
    constructor(o = {}) { super(o); this.isMeshStandardMaterial = true; this.color = watch(this, new Color(o.color == null ? 0xffffff : o.color)); this.emissive = watch(this, new Color(o.emissive || 0)); this.emissiveIntensity = o.emissiveIntensity == null ? 1 : o.emissiveIntensity; this.roughness = o.roughness == null ? 1 : o.roughness; this.metalness = o.metalness == null ? 0 : o.metalness; this.envMapIntensity = o.envMapIntensity == null ? 1 : o.envMapIntensity; this._emap = o.emissiveMap || null; }
    get emissiveMap() { return this._emap; } set emissiveMap(v) { this._emap = v; this._rebuild(); }
    _build() { return new B.PBRMaterial('pbr', SC); }
    _sync() {
      const m = this._bm; if (!m) return; this._common(m);
      m.albedoColor = this.color.toB3(); m.metallic = this.metalness * .45; m.roughness = Math.max(.04, this.roughness); m.environmentIntensity = this.envMapIntensity * T.envK;
      m.emissiveColor = new B.Color3(this.emissive.r * this.emissiveIntensity, this.emissive.g * this.emissiveIntensity, this.emissive.b * this.emissiveIntensity);
      if (this._map) { m.albedoTexture = this._tex(this._map); if (this.transparent) { m.useAlphaFromAlbedoTexture = true; m.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND; } }
      else { m.albedoTexture = null; m.transparencyMode = this.transparent && this._opacity < 1 ? B.PBRMaterial.PBRMATERIAL_ALPHABLEND : B.PBRMaterial.PBRMATERIAL_OPAQUE; }
      if (this._emap) m.emissiveTexture = this._tex(this._emap); else m.emissiveTexture = null;
      m.twoSidedLighting = this.side === 2; m.directIntensity = 1; m.specularIntensity = 1;
    }
  };
  T.MeshBasicMaterial = class extends Material {
    constructor(o = {}) { super(o); this.isMeshBasicMaterial = true; this.color = watch(this, new Color(o.color == null ? 0xffffff : o.color)); }
    _build() { const m = new B.StandardMaterial('bas', SC); m.disableLighting = true; m.diffuseColor = new B.Color3(0, 0, 0); m.specularColor = new B.Color3(0, 0, 0); return m; }
    _sync() {
      const m = this._bm; if (!m) return; this._common(m); m.emissiveColor = this.color.toB3().toGammaSpace();
      m.emissiveTexture = null; m.opacityTexture = null; if (this._map) { m.diffuseTexture = this._tex(this._map); m.emissiveColor = this.color.toB3().toGammaSpace(); m.useAlphaFromDiffuseTexture = this.transparent; } else m.diffuseTexture = null;
    }
  };
  T.SpriteMaterial = class extends T.MeshBasicMaterial { constructor(o = {}) { super(o); this.isSpriteMaterial = true; this.transparent = o.transparent !== false; }
    _rebuild() { super._rebuild(); if (this._spr) this._spr.forEach(s => { if (s._n && !s._n.isDisposed()) s._n.material = this.bm(); }); }
    dispose() { if (this._spr) this._spr.forEach(s => { if (s._n && !s._n.isDisposed()) s._n.dispose(false, false); }); super.dispose(); } };

  /* ---------- Objets : arbre d'objets Three.js, un nœud Babylon derrière chacun ---------- */
  let uidN = 1;
  class Object3D {
    constructor() { this.uuid = uidN++; this.userData = {}; this.children = []; this.parent = null; this.position = new Vector3(); this.rotation = new Euler(); this.scale = new Vector3(1, 1, 1); this._vis = true; this.renderOrder = 0; this.frustumCulled = true; this.matrixWorld = new Matrix4(); this._n = this._mkNode(); this._on(false); this._c = [NaN, 0, 0, 0, 0, 0, 1, 1, 1]; }
    _mkNode() { return new B.TransformNode('g', SC); }
    get visible() { return this._vis; } set visible(v) { this._vis = !!v; this._on(this._attached); }
    _on(att) { this._attached = att; const ok = att && this._vis && this._okMat !== false; if (this._n && !this._n.isDisposed()) this._n.setEnabled(ok); }
    add(...os) { for (const o of os) { if (!o || o === this) continue; if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); if (o._n) o._n.parent = this._bnode(); o._on(true); o._ensure && o._ensure(); } return this; }
    _bnode() { return this._n; }
    _ensure() { if (this._n && this._n.isDisposed && this._n.isDisposed() && this._mkNode) { this._n = this._mkNode(); this._c = [NaN, 0, 0, 0, 0, 0, 1, 1, 1]; if (this.parent && this._n) this._n.parent = this.parent._bnode(); this._on(true); } this.children.forEach(c => { c._ensure && c._ensure(); if (c._n && !c._n.isDisposed()) c._n.parent = this._bnode(); }); }
    remove(...os) { for (const o of os) { const i = this.children.indexOf(o); if (i < 0) continue; this.children.splice(i, 1); o.parent = null; if (o._n && !o._n.isDisposed()) o._n.parent = null; o._on(false); setTimeout(() => { if (!o.parent) T.free(o); }, 4000); } return this; }
    traverse(f) { f(this); for (let i = 0; i < this.children.length; i++) this.children[i].traverse(f); }
    clone() { const c = this._cloneSelf(); c.position.copy(this.position); c.rotation.copy(this.rotation); c.scale.copy(this.scale); c.userData = Object.assign({}, this.userData); this.children.forEach(k => c.add(k.clone())); return c; }
    _cloneSelf() { return new Group(); }
    translateY(d) { this.position.y += d; return this; }
    lookAt(x, y, z) { const t = typeof x === 'object' ? x : { x, y, z }; this._look = t; const p = this.position, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z; this.rotation.y = Math.atan2(dx, dz); this.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz)); this.rotation.z = 0; }
    updateMatrixWorld() { const q = new Quaternion().setFromEuler(this.rotation), l = new Matrix4().compose(this.position, q, this.scale); this.matrixWorld = this.parent && this.parent.matrixWorld ? new Matrix4().multiplyMatrices(this.parent.matrixWorld, l) : l; this.children.forEach(c => c.updateMatrixWorld()); }
    _world() { // matrice monde : produit des matrices locales de la chaîne de parents (sans parcourir tout l'arbre)
      const l = new Matrix4().compose(this.position, new Quaternion().setFromEuler(this.rotation), this.scale);
      return this.parent && this.parent._world ? new Matrix4().multiplyMatrices(this.parent._world(), l) : l;
    }
    localToWorld(v) { return this._world().applyToVec(v, v); }
    getWorldPosition(out) { const e = this._world().elements; out.set(e[12], e[13], e[14]); return out; }
    _syncSelf() { const p = this.position, r = this.rotation, s = this.scale, c = this._c, n = this._n; if (!n) return; if (p.x !== c[0] || p.y !== c[1] || p.z !== c[2]) { n.position.set(p.x, p.y, p.z); c[0] = p.x; c[1] = p.y; c[2] = p.z; } if (r.x !== c[3] || r.y !== c[4] || r.z !== c[5]) { const q = new Quaternion().setFromEuler(r); if (!n.rotationQuaternion) n.rotationQuaternion = new B.Quaternion(); n.rotationQuaternion.set(q.x, q.y, q.z, q.w); c[3] = r.x; c[4] = r.y; c[5] = r.z; } if (s.x !== c[6] || s.y !== c[7] || s.z !== c[8]) { n.scaling.set(s.x, s.y, s.z); c[6] = s.x; c[7] = s.y; c[8] = s.z; } }
    _sync() { this._syncSelf(); for (let i = 0; i < this.children.length; i++) this.children[i]._sync(); }
  }
  class Group extends Object3D { constructor() { super(); this.isGroup = true; } }
  T.Object3D = Object3D; T.Group = Group;
  // libère les nœuds Babylon d'un sous-arbre retiré de la scène (ils seront recréés si on le rajoute)
  T.free = function (o) { o.traverse(x => { if (x._inst) { try { x._inst.dispose(); } catch (e) { } x._inst = null; } if (x.isMesh) { x._release(); } else if (x.isSprite) { x._release(); } else if (x._n && x._n.dispose && !x._n.isDisposed() && !x.isLight && !x.isCamera) x._n.dispose(false, false); }); };
  const CAST = new Set();
  class Mesh extends Object3D {
    constructor(geo, mat) { super(); this.isMesh = true; this.geometry = geo || new BufferGeometry(); this._mat = mat || new T.MeshBasicMaterial(); this._cast = false; this._recv = false; this._fc = true; this._build(); }
    _mkNode() { return null; }
    _build() { const g = this.geometry; const m = new B.Mesh('m', SC); this._n = m; g.vertexData().applyToMesh(m, false); m.metadata = this; m.isPickable = true; g._meshes.add(this); this._c = [NaN, 0, 0, 0, 0, 0, 1, 1, 1]; this._useMat(); m.receiveShadows = this._recv; if (this._cast) this._castOn(true); m.alwaysSelectAsActiveMesh = this._fc === false; this._on(this._attached === true); }
    _useMat() {
      const mt = this._mat, arr = Array.isArray(mt), list = arr ? mt : [mt];
      list.forEach(x => { if (!x || !x.bm) throw new Error('matériau invalide : ' + typeof x + ' sur ' + (this.geometry && this.geometry.constructor.name)); (x._users || (x._users = new Set())).add(this); });
      this._okMat = list[0].visible !== false;
      if (arr && this.geometry.groups) { const mm = new B.MultiMaterial('mm', SC); list.forEach(x => mm.subMaterials.push(x.bm())); const n = this.geometry.pos.length / 3; this._n.subMeshes = []; this.geometry.groups.forEach(g => new B.SubMesh(g.materialIndex, 0, n, g.start, g.count, this._n)); this._n.material = mm; }
      else { this._n.material = list[0].bm(); if (this._n.material.wireframe !== list[0].wireframe) this._n.material.wireframe = list[0].wireframe; }
      this._on(this._attached === true);
    }
    _ensure() { if (!this._n || this._n.isDisposed()) { this._build(); if (this.parent) this._n.parent = this.parent._bnode(); this._on(true); } }
    get material() { return this._mat; } set material(m) { this._mat = m; if (this._n && !this._n.isDisposed()) this._useMat(); }
    get castShadow() { return this._cast; } set castShadow(v) { v = !!v; if (v === this._cast) return; this._cast = v; if (this._n && !this._n.isDisposed()) this._castOn(v); }
    _castOn(v) { if (v) CAST.add(this._n); else CAST.delete(this._n); const g = T.shadowGen; if (!g) return; if (v) g.addShadowCaster(this._n); else g.removeShadowCaster(this._n); }
    get frustumCulled() { return this._fc !== false; } set frustumCulled(v) { this._fc = v; if (this._n && !this._n.isDisposed()) this._n.alwaysSelectAsActiveMesh = !v; }
    get receiveShadow() { return this._recv; } set receiveShadow(v) { this._recv = !!v; if (this._n && !this._n.isDisposed()) this._n.receiveShadows = this._recv; }
    _refreshGeo() { if (this._n && !this._n.isDisposed()) this.geometry.vertexData().applyToMesh(this._n, false); }
    _release() {
      if (this._n) { CAST.delete(this._n); if (!this._n.isDisposed()) this._n.dispose(false, false); }
      this.geometry._meshes.delete(this);
      (Array.isArray(this._mat) ? this._mat : [this._mat]).forEach(x => { if (x && x._users) { x._users.delete(this); if (!x._users.size && x._free) x._free(); } });
    }
    _syncSelf() { if (!this._n || this._n.isDisposed()) return; super._syncSelf(); }
    _cloneSelf() { const c = new Mesh(this.geometry, this._mat); c.castShadow = this._cast; c.receiveShadow = this._recv; return c; }
  }
  T.Mesh = Mesh;
  T.InstancedMesh = class extends Mesh {
    constructor(geo, mat, count) { super(geo, mat); this.count = count; this._mx = new Float32Array(count * 16); this._cl = null; this.isInstancedMesh = true; for (let i = 0; i < count; i++) { this._mx[i * 16] = this._mx[i * 16 + 5] = this._mx[i * 16 + 10] = this._mx[i * 16 + 15] = 1; } this._thin(); }
    _thin() { const m = this._n; m.thinInstanceSetBuffer('matrix', this._mx, 16, false); if (this._cl) m.thinInstanceSetBuffer('color', this._cl, 4, false); m.thinInstanceRefreshBoundingInfo(true); }
    setMatrixAt(i, m4) { this._mx.set(m4.elements, i * 16); this._dirty = true; }
    setColorAt(i, c) { if (!this._cl) { this._cl = new Float32Array(this.count * 4).fill(1); } this._cl[i * 4] = c.r; this._cl[i * 4 + 1] = c.g; this._cl[i * 4 + 2] = c.b; this._dirty = true; }
    _ensure() { super._ensure(); }
    _syncSelf() { super._syncSelf(); if (this._dirty && this._n) { this._dirty = false; this._thin(); } }
  };
  T.Sprite = class extends Object3D {
    constructor(mat) { super(); this.isSprite = true; this.material = mat; this._build(); }
    _mkNode() { return null; }
    _build() { const m = B.MeshBuilder.CreatePlane('sp', { size: 1, sideOrientation: B.Mesh.DOUBLESIDE }, SC); m.billboardMode = B.AbstractMesh.BILLBOARDMODE_ALL; m.isPickable = false; m.material = this.material.bm(); m.material.backFaceCulling = false; m.renderingGroupId = this.material._depthTest ? 0 : 1; this._n = m; m.metadata = this; (this.material._spr = this.material._spr || new Set()).add(this); this._on(this._attached === true); }
    _ensure() { if (!this._n || this._n.isDisposed()) { this._build(); if (this.parent) this._n.parent = this.parent._bnode(); this._on(true); } }
    _release() { if (this._n && !this._n.isDisposed()) this._n.dispose(false, false); const mt = this.material; if (mt && mt._spr) { mt._spr.delete(this); if (!mt._spr.size && mt._free) mt._free(); } }
    _syncSelf() { super._syncSelf(); const m = this._n; if (m && m.renderingGroupId !== (this.material._depthTest ? 0 : 1)) m.renderingGroupId = this.material._depthTest ? 0 : 1; if (m && this.material._bm && m.material !== this.material._bm) m.material = this.material._bm; }
  };

  /* ---------- Points (étoiles, neige) ---------- */
  T.PointsMaterial = class extends Material {
    constructor(o = {}) { super(o); this.color = watch(this, new Color(o.color == null ? 0xffffff : o.color)); this.size = o.size || 1; this.sizeAttenuation = o.sizeAttenuation !== false; this.transparent = !!o.transparent; }
    _build() { const m = new B.StandardMaterial('pts', SC); m.disableLighting = true; m.pointsCloud = true; m.diffuseColor = new B.Color3(0, 0, 0); m.specularColor = new B.Color3(0, 0, 0); return m; }
    _sync() { const m = this._bm; if (!m) return; this._common(m); m.emissiveColor = this.color.toB3(); m.pointSize = this.sizeAttenuation ? Math.max(2.5, this.size * 4) : Math.max(1.5, this.size * 1.5); }
  };
  T.Points = class extends Object3D {
    constructor(geo, mat) { super(); this.isPoints = true; this.geometry = geo; this.material = mat; geo._pts = this; this._build(); }
    _mkNode() { return null; }
    _build() { const g = this.geometry, m = new B.Mesh('pts', SC), n = g.pos.length / 3, ix = new Array(n); for (let i = 0; i < n; i++) ix[i] = i; const vd = new B.VertexData(); vd.positions = Array.from(g.pos); vd.indices = ix; vd.applyToMesh(m, true); m.material = this.material.bm(); m.isPickable = false; m.alwaysSelectAsActiveMesh = true; this._n = m;
      const a = g.attributes.position; if (a) a._cb = () => { if (this._n && !this._n.isDisposed()) this._n.updateVerticesData(B.VertexBuffer.PositionKind, Array.from(g.pos)); }; this._on(this._attached === true); }
    _ensure() { if (!this._n || this._n.isDisposed()) { this._build(); if (this.parent) this._n.parent = this.parent._bnode(); this._on(true); } }
    _release() { if (this._n && !this._n.isDisposed()) this._n.dispose(false, false); }
  };
  { const gd = BufferGeometry.prototype.dispose; BufferGeometry.prototype.dispose = function () { gd.call(this); if (this._pts) this._pts._release(); }; }

  /* ---------- Ciel : dégradé peint sur la sphère (remplace le ShaderMaterial de Three.js) ---------- */
  T.ShaderMaterial = class extends Material {
    constructor(o = {}) { super(o); this.uniforms = o.uniforms || {}; this.fog = false; this.depthWrite = false; this.side = 1; Object.values(this.uniforms).forEach(u => { if (u.value && u.value instanceof Color) u.value._cb = () => this._sync(); }); }
    _build() { const m = new B.StandardMaterial('sky', SC); m.disableLighting = true; m.backFaceCulling = false; m.fogEnabled = false; m.diffuseColor = new B.Color3(0, 0, 0); m.specularColor = new B.Color3(0, 0, 0); this._dt = new B.DynamicTexture('skyg', { width: 8, height: 256 }, SC, false); m.emissiveTexture = this._dt; m.disableDepthWrite = true; return m; }
    _sync() {
      const m = this._bm; if (!m || !this._dt) return; const top = this.uniforms.top.value, bot = this.uniforms.bot.value, c = this._dt.getContext(), H = 256;
      for (let y = 0; y < H; y++) { const v = 1 - y / (H - 1), yy = -Math.cos(Math.PI * v) , h = Math.max(0, Math.min(1, yy * 1.5 + .05)), k = Math.pow(h, .65); c.fillStyle = `rgb(${Math.round((bot.r + (top.r - bot.r) * k) * 255)},${Math.round((bot.g + (top.g - bot.g) * k) * 255)},${Math.round((bot.b + (top.b - bot.b) * k) * 255)})`; c.fillRect(0, y, 8, 1); }
      this._dt.update(true); m.sideOrientation = CCW; m.fogEnabled = false;
    }
  };

  /* ---------- Reflets : ciel de secours (carte d'environnement dessinée, pour les carrosseries et les vitres) ---------- */
  T.makeEnv = function (night) {
    const hex = (c) => '#' + c.toString(16).padStart(6, '0'), top = night ? 0x141c48 : 0x7db4ee, bot = night ? 0x2a3562 : 0xf4f8ff, gr = night ? 0x1a1a22 : 0xb4b9b0, faces = [];
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); return c.toDataURL(); };
    const side = (sun) => mk(g => { const gd = g.createLinearGradient(0, 0, 0, 64); gd.addColorStop(0, hex(top)); gd.addColorStop(.5, hex(bot)); gd.addColorStop(.5, hex(gr)); gd.addColorStop(1, hex(gr)); g.fillStyle = gd; g.fillRect(0, 0, 64, 64); if (sun) { g.fillStyle = '#fff6e0'; g.beginPath(); g.arc(42, 18, 7, 0, 7); g.fill(); } });
    faces.push(side(!night), mk(g => { g.fillStyle = hex(top); g.fillRect(0, 0, 64, 64); }), side(false), side(false), mk(g => { g.fillStyle = hex(gr); g.fillRect(0, 0, 64, 64); }), side(false));
    const old = SC.environmentTexture; const t = B.CubeTexture.CreateFromImages(faces, SC, false); SC.environmentTexture = t; if (old) setTimeout(() => old.dispose(), 500);
  };

  /* ---------- Modèles glTF / GLB (voitures) : un fichier = plusieurs voitures qui partagent une palette de couleurs ----------
   * La carrosserie est recolorée en remplaçant la couleur de carrosserie dans la palette ; les rayures, vitres et pneus gardent la leur. */
  T.models = {};
  const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(url)); i.src = url; });
  // o : { url, atlas (palette JPG/PNG), cars: { nom du maillage : { body: [r, g, b] couleur de carrosserie dans la palette } } }
  T.loadModelPack = async function (key, o) {
    const cont = await B.SceneLoader.LoadAssetContainerAsync('', o.url, SC);
    const img = await loadImg(o.atlas), c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const P = { cont, pal: g.getImageData(0, 0, c.width, c.height), cars: {}, vars: {}, base: cont.materials[0] };
    // mesure de chaque voiture (taille réelle, centre, dessous), à l'échelle et à l'orientation d'origine : longueur le long de z, avant vers +z
    const probe = new B.TransformNode('probe', SC);
    Object.entries(o.cars).forEach(([name, cfg]) => {
      const src = cont.meshes.find(m => m.name === name); if (!src) return;
      const m = src.clone('probe_' + name, probe); m.setEnabled(true); probe.computeWorldMatrix(true); m.computeWorldMatrix(true);
      const bb = m.getHierarchyBoundingVectors(true), sz = bb.max.subtract(bb.min);
      P.cars[name] = Object.assign({}, cfg, { src, len: sz.z, wid: sz.x, h: sz.y, cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2, y0: bb.min.y });
      m.dispose();
    });
    probe.dispose(); T.models[key] = P; return P;
  };
  function variant(P, name, color) { // matériau recoloré (partagé par toutes les voitures de ce modèle et de cette couleur)
    const k = name + '#' + color; if (P.vars[k]) return P.vars[k];
    const cfg = P.cars[name], m = P.base.clone('v' + k), im = new ImageData(new Uint8ClampedArray(P.pal.data), P.pal.width, P.pal.height), d = im.data, b = cfg.body, r = (color >> 16) & 255, gg = (color >> 8) & 255, bb = color & 255, tol = cfg.tol || 18;
    // les pixels de la palette qui ont la couleur de carrosserie du modèle prennent la couleur voulue
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - b[0]) < tol && Math.abs(d[i + 1] - b[1]) < tol && Math.abs(d[i + 2] - b[2]) < tol) { d[i] = r; d[i + 1] = gg; d[i + 2] = bb; }
    const cv = document.createElement('canvas'); cv.width = P.pal.width; cv.height = P.pal.height; cv.getContext('2d').putImageData(im, 0, 0);
    const dt = new B.DynamicTexture('pal' + k, cv, SC, true, B.Texture.TRILINEAR_SAMPLINGMODE); dt.gammaSpace = false; dt.invertY = false; dt.update(false);
    m.albedoTexture = dt; m.metallicTexture = null; m.metallic = .1; m.roughness = .55; m.environmentIntensity = T.envK; m.sideOrientation = CCW;
    return (P.vars[k] = m);
  }
  T.hasModel = key => !!T.models[key];
  // renvoie un Group Three.js : voiture à l'échelle (longueur L en mètres), posée sur le sol, centrée, avant vers +z
  T.cloneCar = function (key, name, color, L) {
    const P = T.models[key], cfg = P.cars[name], g = new Group(), s = L / cfg.len, inner = new B.TransformNode('car_in', SC), m = cfg.src.clone('car_' + name, inner);
    m.setEnabled(true); m.isPickable = false; m.receiveShadows = true; m.material = variant(P, name, color); CAST.add(m); if (T.shadowGen) T.shadowGen.addShadowCaster(m);
    inner.scaling.setAll(s); inner.position.set(-cfg.cx * s, -cfg.y0 * s, -cfg.cz * s); inner.parent = g._n;
    g._inst = { dispose() { try { m.dispose(); inner.dispose(); } catch (e) { } } };
    g.userData.wheels = []; g.userData.len = L; g.userData.wid = cfg.wid * s; g.userData.h = cfg.h * s; return g;
  };

  /* ---------- Lumières, caméra, scène ---------- */
  class Light extends Object3D { constructor() { super(); this.isLight = true; this.color = new Color(0xffffff); this.intensity = 1; } _mkNode() { return null; } _on(a) { this._attached = a; if (this._bl) this._bl.setEnabled(a && this._vis); } }
  T.HemisphereLight = class extends Light {
    constructor(sky, ground, i) { super(); this.color.set(sky); this.groundColor = new Color(ground); this.intensity = i; this._bl = new B.HemisphericLight('h', new B.Vector3(0, 1, 0), SC); this._bl.specular = new B.Color3(0, 0, 0); this._on(false); }
    _syncSelf() { const l = this._bl; l.diffuse = this.color.toB3(); l.groundColor = this.groundColor.toB3(); l.intensity = this.intensity * T.hemiK; }
  };
  T.DirectionalLight = class extends Light {
    constructor(c, i) { super(); this.color.set(c); this.intensity = i; this.target = new Object3D(); this._castS = false; this.shadow = { mapSize: { x: 1024, y: 1024, set(x, y) { this.x = x; this.y = y; } }, bias: 0, camera: { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 200, updateProjectionMatrix() { } } }; this._bl = new B.DirectionalLight('sun', new B.Vector3(0, -1, 0), SC); this._bl.specular = new B.Color3(1, 1, 1); this._bl.autoUpdateExtends = false; this._bl.autoCalcShadowZBounds = false; this._on(false); }
    get castShadow() { return this._castS; } set castShadow(v) { this._castS = !!v; }
    _mkGen() { const sm = this.shadow.mapSize.x || 1024, g = new B.ShadowGenerator(sm, this._bl); if (T.mobile) g.usePoissonSampling = true; else { g.usePercentageCloserFiltering = true; g.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM; } g.bias = 0.0006; g.normalBias = 0.02; g.setDarkness(0.15); T.shadowGen = g; this._gen = g; CAST.forEach(m => g.addShadowCaster(m)); return g; }
    _syncSelf() {
      const l = this._bl, p = this.position, t = this.target.position; l.diffuse = this.color.toB3(); l.intensity = this.intensity * T.sunK;
      l.position.set(p.x, p.y, p.z); const d = new B.Vector3(t.x - p.x, t.y - p.y, t.z - p.z); if (d.lengthSquared() > 1e-8) l.direction = d.normalize();
      const c = this.shadow.camera; l.orthoLeft = c.left; l.orthoRight = c.right; l.orthoTop = c.top; l.orthoBottom = c.bottom; l.shadowMinZ = c.near; l.shadowMaxZ = c.far;
      if (this._castS && !this._gen) this._mkGen();
    }
  };
  T.PointLight = class extends Light {
    constructor(c, i) { super(); this.color.set(c); this.intensity = i; this._bl = new B.PointLight('pl', new B.Vector3(0, 0, 0), SC); this._bl.specular = new B.Color3(0, 0, 0); this._on(false); }
    _syncSelf() { const l = this._bl; let o = this; const w = this.getWorldPosition(new Vector3()); l.position.set(w.x, w.y, w.z); l.diffuse = this.color.toB3(); l.intensity = this.intensity * T.pointK; l.range = 30; }
  };
  T.Fog = class { constructor(c, n, f) { this.color = new Color(c); this.near = n; this.far = f; } };
  T.PerspectiveCamera = class extends Object3D {
    constructor(fov = 45, aspect = 1, near = .1, far = 1000) { super(); this.isCamera = true; this._fov = fov; this.aspect = aspect; this._near = near; this._far = far; this._bc = new B.FreeCamera('cam', new B.Vector3(0, 0, 0), SC); this._bc.inputs.clear(); T.camera = this; this._bc.rotationQuaternion = new B.Quaternion(); this._bc.fov = fov * Math.PI / 180; this._bc.minZ = near; this._bc.maxZ = far; this._n = this._bc; this._look = null; this._c = [NaN, 0, 0, 0, 0, 0, 1, 1, 1]; }
    _bnode() { return this._bc; }
    get fov() { return this._fov; } set fov(v) { this._fov = v; this._bc.fov = v * Math.PI / 180; }
    get near() { return this._near; } set near(v) { this._near = v; this._bc.minZ = v; }
    get far() { return this._far; } set far(v) { this._far = v; this._bc.maxZ = v; }
    updateProjectionMatrix() { }
    _on() { }
    lookAt(x, y, z) { this._look = typeof x === 'object' ? { x: x.x, y: x.y, z: x.z } : { x, y, z }; }
    _syncSelf() {
      const b = this._bc, p = this.position; b.position.set(p.x, p.y, p.z);
      if (this._look) { // regard vers la cible (-z local → cible), haut = +y
        const f = new B.Vector3(this._look.x - p.x, this._look.y - p.y, this._look.z - p.z); if (f.lengthSquared() < 1e-10) return; f.normalize();
        let up = new B.Vector3(0, 1, 0); if (Math.abs(f.y) > .9999) up = new B.Vector3(0, 0, -1);
        const z = f.scale(-1), x = B.Vector3.Cross(up, z).normalize(), y = B.Vector3.Cross(z, x);
        const m = B.Matrix.FromValues(x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1); B.Quaternion.FromRotationMatrixToRef(m, b.rotationQuaternion);
      }
    }
  };
  T.Scene = class extends Object3D {
    constructor() { super(); this._attached = true; this._bg = null; this._fog = null; this.background = null; T.scene = this; }
    _mkNode() { SC = this._bs = new B.Scene(B.EngineStore.LastCreatedEngine); this._bs.useRightHandedSystem = true; this._bs.skipPointerMovePicking = true; this._bs.autoClear = true; this._bs.setRenderingAutoClearDepthStencil(1, true, true, true); return new B.TransformNode('root', SC); }
    _on() { }
    get background() { return this._bg; } set background(c) { this._bg = c; const k = c || { r: 0, g: 0, b: 0 }; this._bs.clearColor = new B.Color4(k.r, k.g, k.b, 1); }
    get fog() { return this._fog; } set fog(f) { this._fog = f; const s = this._bs; if (!f) { s.fogMode = B.Scene.FOGMODE_NONE; return; } s.fogMode = B.Scene.FOGMODE_LINEAR; s.fogColor = f.color.toB3(); s.fogStart = f.near; s.fogEnd = f.far; }
  };

  /* ---------- Sélection (clic) ---------- */
  T.Raycaster = class {
    setFromCamera(v, cam) { this._v = v; this._cam = cam; }
    intersectObjects(list, rec) {
      const e = SC.getEngine(), w = e.getRenderWidth(), h = e.getRenderHeight(), x = (this._v.x + 1) / 2 * w, y = (1 - this._v.y) / 2 * h;
      cam_sync(this._cam); const ray = SC.createPickingRay(x, y, B.Matrix.Identity(), this._cam._bc);
      const hits = SC.multiPickWithRay(ray, m => m.metadata && m.metadata.isMesh && m.isEnabled()) || [];
      const inList = o => { for (let n = o; n; n = n.parent) if (list.indexOf(n) >= 0) return true; return false; };
      return hits.filter(hh => hh.hit && hh.pickedMesh && hh.pickedMesh.metadata && inList(hh.pickedMesh.metadata)).sort((a, b) => a.distance - b.distance).map(hh => ({ object: hh.pickedMesh.metadata, distance: hh.distance, point: hh.pickedPoint }));
    }
  };
  function cam_sync(c) { c._syncSelf(); c._bc.computeWorldMatrix(true); }

  /* ---------- Boîtes englobantes ---------- */
  T.Box3 = class {
    constructor() { this.min = new Vector3(1e9, 1e9, 1e9); this.max = new Vector3(-1e9, -1e9, -1e9); }
    setFromObject(o) { this.min.set(1e9, 1e9, 1e9); this.max.set(-1e9, -1e9, -1e9); const v = new Vector3();
      o.traverse(m => { if (!m.isMesh) return; const b = m.geometry.bounds(); if (b.min[0] > b.max[0]) return; const W = m._world(); for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]); W.applyToVec(v, v); this.min.set(Math.min(this.min.x, v.x), Math.min(this.min.y, v.y), Math.min(this.min.z, v.z)); this.max.set(Math.max(this.max.x, v.x), Math.max(this.max.y, v.y), Math.max(this.max.z, v.z)); } });
      return this; }
  };

  /* ---------- Rendu ---------- */
  T.envK = .6; T.hemiK = 1.3; T.sunK = 1.3; T.pointK = 3;
  // Rendu : tone mapping ACES, contraste, bloom (lueur des fenêtres et des lampes la nuit), anti-crénelage MSAA
  T.look = function (scene, camera, mobile) {
    const bs = scene._bs, ip = bs.imageProcessingConfiguration; ip.toneMappingEnabled = false; ip.exposure = 1.0; ip.contrast = 1.0;
    T.mobile = !!mobile;
  };
  T.WebGLRenderer = class {
    constructor(o) { this.canvas = o.canvas; this.engine = new B.Engine(o.canvas, o.antialias !== false, { stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); this.info = { render: { get calls() { return T._eng ? T._eng._drawCalls.current : 0; } } }; T._eng = this.engine; this.shadowMap = {}; this._pr = 1; this.domElement = o.canvas; }
    setPixelRatio(r) { this._pr = r; this.engine.setHardwareScalingLevel(1 / r); }
    setSize() { this.engine.resize(); }
    render(scene, camera) { scene._sync(); camera._syncSelf(); const bs = scene._bs; bs.activeCamera = camera._bc; bs.render(); }
  };
})();

// Trad Center — serveur de notifications push (exécuté par GitHub Actions toutes les ~5 min)
//  1. Envoie les notifications en attente (envois d'argent, demandes d'ami) : collection pushQueue
//  2. Détecte les gros mouvements de marché (crypto via Binance, bourse via Yahoo Finance)
//  3. Déclenche les alertes de prix personnalisées
// Secret requis : PUSH_SECRET = un mot de passe inventé par le propriétaire (secret GitHub).
// Toutes les clés en sont dérivées : compte Firebase du serveur et clés VAPID des notifications.
// Aucune règle Firestore spéciale : le serveur est un joueur « invisible » (profil bot:true).
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, doc, getDoc, writeBatch, updateDoc, query, where } from 'firebase/firestore/lite';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = process.env.PAGE_URL || 'https://nono-rsb.github.io/trad-center/';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Charge la config et le catalogue du jeu (mêmes fichiers que le site)
const ctx = {}; ctx.window = ctx;
for (const f of ['js/config.js', 'js/catalog.js']) vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
const TC = ctx.TC;

// Seuils en % (identiques à js/notify.js)
const MAJOR = ['BTC', 'ETH'];
const TH = { hour: { major: 3, crypto: 6, index: 1.5, stock: 4, commodity: 3, fx: 1 }, day: { major: 5, crypto: 10, index: 2.5, stock: 6, commodity: 4, fx: 1.5 } };
const group = a => a.cat === 'crypto' ? (MAJOR.includes(a.id) ? 'major' : 'crypto') : a.cat;
const nf = d => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: Math.min(2, d), maximumFractionDigits: d });
const eur = v => { const a = Math.abs(v); const d = a >= 1 ? 2 : Math.min(10, -Math.floor(Math.log10(a || 1)) + 3); return nf(d).format(v) + ' €'; };
const pct = v => (v > 0 ? '+' : '') + nf(2).format(v) + ' %';

async function getJSON(url, timeout = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (TradCenter notifier)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ---------------- Prix ---------------- */
async function prices() {
  const out = {}; // id -> { eur, h1 (variation 1 h en %), d (variation jour/24 h en %), open (marché ouvert) }
  const hosts = ['https://data-api.binance.vision', 'https://api.binance.com'];
  const bin = async p => { for (const h of hosts) { try { return await getJSON(h + p); } catch (e) { } } throw new Error('binance ' + p); };
  let usdt = null;
  try { usdt = +(await bin('/api/v3/ticker/price?symbol=EURUSDT')).price; } catch (e) { log('EURUSDT', e.message); }
  for (const a of TC.ASSETS.filter(a => a.src === 'binance')) {
    try {
      const [t, k] = await Promise.all([bin('/api/v3/ticker/24hr?symbol=' + a.bin), bin('/api/v3/klines?symbol=' + a.bin + '&interval=5m&limit=13')]);
      const last = +t.lastPrice, f = 1 / (usdt || 1.16);
      out[a.id] = { eur: last * f, d: +t.priceChangePercent, h1: (last - +k[0][1]) / +k[0][1] * 100, open: true };
    } catch (e) { log('crypto', a.id, e.message); }
  }
  // Bourse, indices, matières premières : Yahoo Finance
  const fx = { EUR: 1, USD: 1.16, GBP: 0.87, JPY: 178 };
  for (const [c, s] of [['USD', 'EURUSD=X'], ['GBP', 'EURGBP=X'], ['JPY', 'EURJPY=X']]) {
    try { const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=5m`); fx[c] = j.chart.result[0].meta.regularMarketPrice; } catch (e) { }
  }
  for (const a of TC.ASSETS.filter(a => a.src === 'yahoo')) {
    try {
      const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.y)}?range=1d&interval=5m`);
      const r = j.chart.result[0], m = r.meta;
      const closes = (r.indicators.quote[0].close || []).filter(v => v != null);
      const price = m.regularMarketPrice, prev = m.chartPreviousClose || m.previousClose;
      const open = m.regularMarketTime && Date.now() / 1000 - m.regularMarketTime < 20 * 60;
      const hAgo = closes.length > 12 ? closes[closes.length - 13] : null;
      out[a.id] = { eur: price / (fx[a.ccy] || 1), d: prev ? (price - prev) / prev * 100 : 0, h1: hAgo ? (price - hAgo) / hAgo * 100 : 0, open };
    } catch (e) { log('yahoo', a.id, e.message); }
  }
  return out;
}

/* ---------------- Événements de marché ---------------- */
function marketEvents(px, fired) {
  const ev = []; const now = Date.now(); const day = new Date().toISOString().slice(0, 10);
  for (const a of TC.ASSETS) {
    const p = px[a.id]; if (!p || !p.open) continue;
    const g = group(a);
    for (const [kind, ch, when] of [['h', p.h1, 'en 1 h'], ['d', p.d, a.cat === 'crypto' ? 'en 24 h' : 'aujourd\'hui']]) {
      const th = TH[kind === 'h' ? 'hour' : 'day'][g];
      const abs = Math.abs(ch || 0); if (abs < th / 2) continue;
      const level = abs >= th ? 'normal' : 'sensible';
      const dir = ch > 0 ? 'up' : 'down';
      const key = kind === 'h' ? `${a.id}:h:${dir}:${level}` : `${a.id}:d:${dir}:${level}:${day}`;
      const cooldown = kind === 'h' ? 3 * 3600000 : 86400000;
      if (fired[key] && now - fired[key] < cooldown) continue;
      fired[key] = now;
      ev.push({ level, title: `${dir === 'up' ? '🚀' : '📉'} ${a.name} ${pct(ch)} ${when}`, body: `Cours : ${eur(p.eur)}. ${dir === 'up' ? 'Grosse hausse' : 'Grosse chute'} en cours.`, tag: `move-${a.id}-${dir}`, url: `?a=${a.id}` });
    }
  }
  for (const k in fired) if (now - fired[k] > 3 * 86400000) delete fired[k];
  return ev;
}

/* ---------------- Semaine (heure de Paris, comme dans js/weekly.js) ---------------- */
function weekOf(ts) {
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(ts)).forEach(x => { p[x.type] = x.value; });
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  const id = new Date(Date.UTC(+p.year, +p.month - 1, +p.day - wd)).toISOString().slice(0, 10).replace(/-/g, '');
  const left = ((7 - wd) * 86400 - (+p.hour * 3600 + +p.minute * 60 + +p.second)) * 1000;
  return { id, field: 'wk_' + id, left };
}

/* ---------------- Clés dérivées du mot de passe ---------------- */
function derive(pass) {
  const h = label => crypto.createHmac('sha256', pass).update(label).digest();
  let seed = h('tradcenter-vapid-v1'), i = 0;
  const ecdh = crypto.createECDH('prime256v1');
  for (;;) { try { ecdh.setPrivateKey(seed); break; } catch (e) { seed = h('tradcenter-vapid-v1-' + (++i)); } }
  return {
    vapidPrivate: seed.toString('base64url'),
    vapidPublic: ecdh.getPublicKey().toString('base64url'),
    botEmail: 'push-server@trad-center.firebaseapp.com',
    botPassword: h('tradcenter-bot-v1').toString('base64url').slice(0, 32),
  };
}

/* ---------------- Mémoire (cache GitHub Actions) ---------------- */
const STATE_FILE = path.join(ROOT, 'scripts', 'state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return {}; } }
function saveState(st) { fs.writeFileSync(STATE_FILE, JSON.stringify(st)); }
function prune(map, maxAge) { const now = Date.now(); for (const k in map) if (now - map[k] > maxAge) delete map[k]; }

/* ---------------- Envoi ---------------- */
async function main() {
  const pass = (process.env.PUSH_SECRET || '').trim();
  if (!pass) { log('PUSH_SECRET absent : rien à faire (voir NOTIFICATIONS.md)'); return; }
  if (!TC.FIREBASE) { log('Firebase non configuré'); return; }
  const K = derive(pass);
  webpush.setVapidDetails(PAGE, K.vapidPublic, K.vapidPrivate);

  const app = initializeApp(process.env.EMULATOR ? { ...TC.FIREBASE, projectId: process.env.EMULATOR } : TC.FIREBASE);
  const auth = getAuth(app), db = getFirestore(app);
  if (process.env.EMULATOR) { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8080); }

  // Connexion (création du compte au premier lancement)
  let cred;
  try { cred = await signInWithEmailAndPassword(auth, K.botEmail, K.botPassword); }
  catch (e) {
    if (!/user-not-found|invalid-credential|invalid-login/.test(e.code || '')) throw e;
    try { cred = await createUserWithEmailAndPassword(auth, K.botEmail, K.botPassword); log('compte du serveur créé'); }
    catch (e2) { log('Impossible de créer le compte du serveur (mot de passe PUSH_SECRET changé ?)', e2.code); return; }
  }
  const botUid = cred.user.uid;

  // Profil du serveur : publie la clé publique des notifications (lue par l'appli)
  const meRef = doc(db, 'users', botUid);
  const mine = await getDoc(meRef);
  if (!mine.exists()) {
    const taken = await getDoc(doc(db, 'usernames', 'tradcenter_bot'));
    if (taken.exists() && taken.data().uid !== botUid) { log('Le pseudo réservé tradcenter_bot est déjà pris'); return; }
    const b = writeBatch(db);
    if (!taken.exists()) b.set(doc(db, 'usernames', 'tradcenter_bot'), { uid: botUid });
    b.set(meRef, { pseudo: 'Trad Center', pseudoLower: 'tradcenter_bot', bot: true, avatar: '🔔', vapid: K.vapidPublic, nw: 0, rank: '', items: 0, topItem: null, createdAt: Date.now(), updatedAt: Date.now() });
    await b.commit(); log('profil du serveur publié');
  } else if (mine.data().vapid !== K.vapidPublic) {
    await updateDoc(meRef, { vapid: K.vapidPublic, updatedAt: Date.now() }); log('clé publique mise à jour');
  }
  // Identité publique du robot : « Sentinelle », certifié à vie et marqué BOT dans le jeu (c'est lui le modérateur).
  try {
    const now0 = Date.now(), cur = (await getDoc(meRef)).data() || {};
    const want = { avatar: '🤖', plusUntil: 4102444800000, botRole: 'Modérateur officiel' };
    if (!cur.displayName || cur.avatar !== want.avatar || cur.plusUntil !== want.plusUntil) {
      let name = null;
      for (const [n, k] of [['Sentinelle', 'sentinelle'], ['SentinelleBot', 'sentinellebot']]) {
        const r = doc(db, 'usernames', k), t = await getDoc(r);
        if (t.exists() && t.data().uid !== botUid) continue;
        if (!t.exists()) { const b = writeBatch(db); b.set(r, { uid: botUid }); await b.commit(); }
        name = { displayName: n, nameKey: k }; break;
      }
      await updateDoc(meRef, { ...want, ...(name || {}), updatedAt: now0 }); log('identité du robot :', name ? name.displayName : '(pseudo pris)');
    }
  } catch (e) { log('identité robot', e.message); }

  // 🧑‍💻 Compte de Claude, l'assistant IA du créateur : un vrai compte joueur (pas un robot), vérifié à vie.
  // Il accepte les demandes d'ami et ses réponses aux questions sont signées à son nom. L'uid est publié par Sentinelle
  // (profil de confiance) pour que l'appli le reconnaisse : un joueur qui s'appellerait « Claude » ne peut pas l'imiter.
  let claude = null;
  try {
    const capp = initializeApp(process.env.EMULATOR ? { ...TC.FIREBASE, projectId: process.env.EMULATOR } : TC.FIREBASE, 'claude');
    const cauth = getAuth(capp), cdb = getFirestore(capp);
    if (process.env.EMULATOR) { connectAuthEmulator(cauth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(cdb, '127.0.0.1', 8080); }
    const cEmail = 'claude@trad-center.firebaseapp.com', cPass = crypto.createHmac('sha256', pass).update('tradcenter-claude-v1').digest('base64url').slice(0, 32);
    let cc; try { cc = await signInWithEmailAndPassword(cauth, cEmail, cPass); } catch (e) { cc = await createUserWithEmailAndPassword(cauth, cEmail, cPass); log('compte de Claude créé'); }
    const cUid = cc.user.uid, cRef = doc(cdb, 'users', cUid), now1 = Date.now();
    const look = { av: { sk: '#f2c9a5', head: 'ovale', eyes: 'normal', ec: '#3b2416', brows: 'fins', nose: 'petit', mouth: 'sourire', hair: 'raie', hc: '#3b2416', beard: 'aucune', cloth: 'colroule', cc: '#d97757', bg: '#f5ead8', extra: 'aucun' }, frame: 'fr_plus' };
    const want = { plusUntil: 4102444800000, look, role: 'Assistant IA du créateur', avatar: '🧡' };
    if (!(await getDoc(cRef)).exists()) {
      for (const [n, k] of [['Claude', 'claude'], ['Claude_IA', 'claude_ia']]) {
        const r = doc(cdb, 'usernames', k), t = await getDoc(r);
        if (t.exists() && t.data().uid !== cUid) continue;
        const b = writeBatch(cdb);
        if (!t.exists()) b.set(r, { uid: cUid });
        b.set(cRef, { pseudo: n, pseudoLower: k, nw: 10, rank: 'Fauché', items: 0, topItem: null, createdAt: now1, updatedAt: now1, ...want });
        await b.commit(); log('profil de Claude publié :', n); break;
      }
    } else {
      const c = (await getDoc(cRef)).data();
      if (c.plusUntil !== want.plusUntil || c.role !== want.role) await updateDoc(cRef, { ...want, updatedAt: now1 });
    }
    if ((await getDoc(cRef)).exists()) {
      claude = { uid: cUid, db: cdb, ref: cRef };
      if (((await getDoc(meRef)).data() || {}).claudeUid !== cUid) await updateDoc(meRef, { claudeUid: cUid, updatedAt: Date.now() });
      log('compte de Claude prêt');
    }
  } catch (e) { log('compte de Claude', e.code || e.message); }
  // Claude accepte les demandes d'ami (et prévient le joueur par notification)
  async function claudeFriends() {
    if (!claude) return;
    try {
      const reqs = await getDocs(query(collection(claude.db, 'friendRequests'), where('to', '==', claude.uid)));
      if (reqs.empty) return;
      const b = writeBatch(claude.db), box = (((await getDoc(claude.ref)).data() || {}).outbox || []).filter(m => Date.now() - m.at < 24 * 3600000).slice(-20);
      reqs.docs.forEach(d => {
        const from = d.data().from; if (!from) return;
        b.set(doc(claude.db, 'friendships', from < claude.uid ? from + '_' + claude.uid : claude.uid + '_' + from), { members: [from, claude.uid], createdAt: Date.now() });
        b.delete(d.ref); box.push({ id: crypto.randomBytes(5).toString('hex'), to: from, kind: 'accept', at: Date.now() });
      });
      b.update(claude.ref, { outbox: box, updatedAt: Date.now() });
      await b.commit(); log('Claude a accepté', reqs.size, 'demande(s) d\'ami');
    } catch (e) { log('amis de Claude', e.code || e.message); }
  }

  // 💸 Virements reçus par Claude : encaissés par le serveur (Claude n'a pas d'appli ouverte), ajoutés à son argent,
  // notés sur sa fiche, et le joueur reçoit un merci. Une ligne « Claude a reçu » apparaît dans le journal du passage.
  async function claudeTransfers() {
    if (!claude) return;
    try {
      const q = await getDocs(query(collection(claude.db, 'transfers'), where('to', '==', claude.uid), where('claimed', '==', false)));
      if (q.empty) return;
      const cur = (await getDoc(claude.ref)).data() || {}, g = Object.assign({ cash: 10, bets: [], wins: 0, losses: 0, bonusDay: '' }, cur.cb || {});
      const recv = (cur.recv || []).slice(-19), box = (cur.outbox || []).filter(m => Date.now() - m.at < 24 * 3600000).slice(-20);
      for (const d of q.docs) {
        const t = d.data(), eur = Math.max(0, +t.eur || 0);
        const b = writeBatch(claude.db); b.update(d.ref, { claimed: true, claimedAt: Date.now() }); await b.commit();
        g.cash = Math.round((g.cash + eur) * 100) / 100;
        recv.push({ from: t.fromPseudo || '?', eur, kind: t.kind, asset: t.asset || null, msg: String(t.msg || '').slice(0, 120), at: Date.now() });
        box.push({ id: crypto.randomBytes(5).toString('hex'), to: t.from, kind: 'thanks', eur, at: Date.now() });
        log(`Claude a reçu ${eur} € de ${t.fromPseudo || '?'}${t.asset ? ' (' + t.asset + ')' : ''}${t.msg ? ' : « ' + String(t.msg).slice(0, 80) + ' »' : ''}`);
      }
      const nw = Math.round((g.cash + g.bets.filter(b => !b.res).reduce((s, b) => s + b.stake, 0)) * 100) / 100;
      await updateDoc(claude.ref, { cb: g, nw, recv, outbox: box, updatedAt: Date.now() });
    } catch (e) { log('virements de Claude', e.code || e.message); }
  }

  // 🎲 Claude parie pour le fun avec les vrais cours : plus haut ou plus bas, 10 % de son argent, gain x2 (règles du jeu).
  // Un pari à la fois, d'au moins 20 min, réglé au passage suivant du serveur avec le cours du moment. Hors concours.
  const CLAUDE_PICKS = ['BTC', 'ETH', 'SOL', 'XRP', 'CAC40', 'SP500', 'NASDAQ', 'GOLD', 'TSLA', 'NVDA', 'AAPL', 'TTWO'];
  async function claudeBets(px) {
    if (!claude || !px) return;
    try {
      const cur = (await getDoc(claude.ref)).data() || {}, g = Object.assign({ cash: 10, bets: [], wins: 0, losses: 0, bonusDay: '' }, cur.cb || {});
      const now = Date.now(), day = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
      let changed = false;
      for (const b of g.bets.filter(b => !b.res && now >= b.end)) { // règlement
        const p = px[b.a]; if (!p || !p.open || !p.eur) continue;
        const up = p.eur > b.p0, win = p.eur !== b.p0 && (b.dir === 'up') === up;
        b.p1 = p.eur; b.res = win ? 'win' : 'lose'; b.gain = win ? b.stake : -b.stake;
        if (win) { g.cash += b.stake * 2; g.wins++; } else g.losses++;
        changed = true; log('pari de Claude', b.a, b.res, b.gain);
      }
      if (g.cash < 1 && g.bonusDay !== day) { g.cash += 10; g.bonusDay = day; changed = true; } // bonus quotidien, comme tout le monde
      if (!g.bets.some(b => !b.res) && g.cash >= 1) { // nouveau pari : l'actif qui bouge le plus, dans le sens de la dernière heure
        const opts = CLAUDE_PICKS.map(id => ({ id, p: px[id] })).filter(x => x.p && x.p.open && x.p.eur && isFinite(x.p.h1)).sort((a, b) => Math.abs(b.p.h1) - Math.abs(a.p.h1)).slice(0, 4);
        const o = opts[Math.floor(Math.random() * opts.length)];
        if (o) {
          const stake = Math.max(1, Math.round(g.cash * 0.1 * 100) / 100);
          g.cash -= stake;
          g.bets.push({ id: crypto.randomBytes(4).toString('hex'), a: o.id, dir: o.p.h1 >= 0 ? 'up' : 'down', stake, p0: o.p.eur, at: now, end: now + (+process.env.CLAUDE_BET_MS || 20 * 60000) });
          changed = true; log('Claude parie', stake, '€ sur', o.id, o.p.h1 >= 0 ? 'hausse' : 'baisse');
        }
      }
      if (!changed) return;
      g.cash = Math.round(g.cash * 100) / 100; g.bets = g.bets.slice(-12);
      const nw = Math.round((g.cash + g.bets.filter(b => !b.res).reduce((t, b) => t + b.stake, 0)) * 100) / 100;
      await updateDoc(claude.ref, { cb: g, nw, updatedAt: Date.now() });
    } catch (e) { log('paris de Claude', e.code || e.message); }
  }

  const st = loadState(); st.fired = st.fired || {}; st.done = st.done || {}; st.alerts = st.alerts || {}; st.dead = st.dead || {};
  let lastPx = null, sentTotal = 0, verbose = true;
  // Profils gardés en mémoire : relecture complète toutes les 6 h, sinon seulement les profils modifiés (forfait gratuit)
  const cache = new Map(); let fullAt = 0, since = 0;
  // La liste des joueurs est gardée d'un passage à l'autre (sinon chaque passage relit tout le monde),
  // chiffrée avec PUSH_SECRET : la mémoire des Actions d'un dépôt public peut être lue par d'autres workflows.
  const ckey = crypto.createHash('sha256').update('tc-users-cache:' + (process.env.PUSH_SECRET || '')).digest();
  const enc = o => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', ckey, iv); const d = Buffer.concat([c.update(JSON.stringify(o)), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString('base64')).join('.'); };
  const dec = t => { const [iv, tag, d] = t.split('.').map(x => Buffer.from(x, 'base64')); const c = crypto.createDecipheriv('aes-256-gcm', ckey, iv); c.setAuthTag(tag); return JSON.parse(Buffer.concat([c.update(d), c.final()]).toString()); };
  try {
    if (st.uc && process.env.PUSH_SECRET) { const o = dec(st.uc); if (o && Date.now() - o.fullAt < 6 * 3600000) { o.users.forEach(u => cache.set(u.uid, u)); fullAt = o.fullAt; since = o.since; log('profils en mémoire :', cache.size); } }
  } catch (e) { log('mémoire des profils illisible, relecture complète'); }
  const keepUsers = () => { if (process.env.PUSH_SECRET && cache.size) st.uc = enc({ fullAt, since, users: [...cache.values()] }); };
  async function loadUsers() {
    const now = Date.now();
    const docs = now - fullAt > 6 * 3600000
      ? (fullAt = now, cache.clear(), (await getDocs(collection(db, 'users'))).docs)
      : (await getDocs(query(collection(db, 'users'), where('updatedAt', '>', since - 120000)))).docs;
    since = now;
    docs.forEach(d => { const x = d.data(); cache.set(d.id, { uid: d.id, ...x, pseudo: x.displayName || x.pseudo }); });
    return [...cache.values()].filter(u => !u.bot);
  }
  async function tick(withPrices) {
    let sent = 0;
    await claudeFriends(); await claudeTransfers();
    const users = await loadUsers();
    const pseudo = {}; users.forEach(u => { pseudo[u.uid] = u.pseudo; });
    const subs = [];
    users.forEach(u => Object.entries(u.push || {}).forEach(([dev, p]) => { if (p && p.sub && p.sub.endpoint && !st.dead[p.sub.endpoint]) subs.push({ uid: u.uid, dev, ...p }); }));
    if (verbose) log(users.length, 'joueur(s),', subs.length, 'appareil(s) abonné(s)');

    const push = async (s, payload) => {
      try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' }); sent++; return true; }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { st.dead[s.sub.endpoint] = Date.now(); s.dead = true; log('abonnement expiré', s.uid.slice(0, 6)); }
        else log('push', s.uid.slice(0, 6), e.statusCode || e.message);
        return false;
      }
    };

    // 1. Messages entre joueurs (boîtes d'envoi des profils)
    const fmtAmt = m => m.asset ? `${nf(8).format(m.qty)} ${m.asset} (${eur(m.eur || 0)})` : eur(m.eur || m.qty || 0);
    for (const u of users) {
      const box = (u.outbox || []).filter(m => m && m.id && !st.done[m.id] && Date.now() - (m.at || 0) < 24 * 3600000).slice(-20);
      for (const m of box) {
        st.done[m.id] = Date.now();
        if (u.uid === TC.ADMIN_UID && m.kind === 'transfer' && m.to) (st.cgift || (st.cgift = {}))[m.to] = Date.now(); // don du créateur : pas de la triche
        const from = pseudo[u.uid] || 'Un ami';
        if (m.kind === 'speech') { // discours du Maire élu : à tous, au plus un toutes les 6 h
          const prevId = weekOf(Date.now() - 7 * 86400000).id; st.speechAt = st.speechAt || {};
          if (!st.election || st.election[prevId] !== u.uid || Date.now() - (st.speechAt[u.uid] || 0) < 6 * 3600000) continue;
          st.speechAt[u.uid] = Date.now();
          const text = String(m.text || '').slice(0, 140);
          for (const s of subs.filter(s => !s.dead && s.uid !== u.uid)) await push(s, { title: `📢 Discours du Maire ${from} 👑`, body: `« ${text} »`, tag: 'speech', url: '?tab=city' });
          continue;
        }
        let msg;
        if (m.kind === 'transfer') msg = { title: `💸 ${from} vous a envoyé ${fmtAmt(m)}`, body: m.msg ? `« ${String(m.msg).slice(0, 120)} »` : 'Ouvrez Trad Center pour en profiter !', tag: 'transfer', url: '?tab=social' };
        else if (m.kind === 'friend') msg = { title: `👋 ${from} veut être votre ami`, body: 'Acceptez sa demande dans l\'onglet Amis.', tag: 'friend', url: '?tab=social' };
        else if (m.kind === 'santa') msg = { title: `🎅 ${from} t'a offert un cadeau de Noël !`, body: `${eur(m.eur || 25)} t'attendent dans Trad Center. Joyeux Noël !`, tag: 'santa', url: '?tab=social' };
        else if (m.kind === 'referral') msg = { title: `🎁 +20 € ! ${from} a rejoint Trad Center grâce à toi`, body: 'Ouvre l\'appli pour encaisser ta prime de parrainage.', tag: 'referral', url: '?tab=social' };
        else if (m.kind === 'gift' && u.uid === TC.ADMIN_UID) msg = { title: `🎁 Cadeau du créateur : +${eur(m.eur || 0)} !`, body: 'Ouvre Trad Center pour le recevoir.', tag: 'gift', url: './' };
        else if (m.kind === 'claim' && m.to === TC.ADMIN_UID) msg = { title: `📣 ${from} réclame ${eur(m.eur || 0)}`, body: `${String(m.label || '').slice(0, 40)} · Vérifie et valide dans ton mode créateur.`, tag: 'claim', url: './' };
        else if (m.kind === 'plusgift') msg = m.sponsor ? { title: `✓ ${from} te parraine : tu es vérifié !`, body: 'Ton badge vérifié reste actif tant que ton parrain est abonné.', tag: 'plus', url: './' } : { title: `🎁 ${from} t'offre le badge vérifié ✓`, body: 'Une semaine de Trad Center+ offerte : ouvre le jeu pour l\'afficher.', tag: 'plus', url: './' };
        else if (m.kind === 'clanreq') msg = { title: `✋ ${from} veut rejoindre ton clan [${String(m.tag || '').slice(0, 5)}]`, body: 'Accepte sa demande dans l\'onglet Amis.', tag: 'clan', url: '?tab=social' };
        else if (m.kind === 'clanok') msg = { title: `🛡️ Bienvenue dans le clan [${String(m.tag || '').slice(0, 5)}] !`, body: `${from} a accepté ta demande. Ouvre le jeu pour entrer dans le clan.`, tag: 'clan', url: '?tab=social' };
        else if (m.kind === 'takeover') msg = { title: `🤝 ${from} a racheté ton ${String(m.biz || 'commerce').slice(0, 40)}`, body: `+${eur(m.eur || 0)} pour toi ! Ouvre Trad City pour encaisser… ou racheter un autre commerce.`, tag: 'takeover', url: '?tab=city' };
      else if (m.kind === 'thanks') msg = { title: `🧡 Claude a bien reçu tes ${eur(m.eur || 0)}`, body: 'Merci beaucoup ! Je vais les faire fructifier avec mes paris 🎲', tag: 'thanks', url: '?tab=social' };
      else if (m.kind === 'duelinv') msg = { title: `⚔️ ${from} te défie en duel !`, body: '24 h pour gagner plus que lui : 100 € pour le vainqueur. Accepte dans l\'onglet Amis.', tag: 'duel', url: '?tab=social' };
        else if (m.kind === 'duelok') msg = { title: `⚔️ ${from} a accepté ton duel !`, body: 'C\'est parti pour 24 h : fais mieux que lui.', tag: 'duel', url: '?tab=social' };
        else if (m.kind === 'duelres') msg = { title: `⚔️ ${from} a gagné votre duel`, body: 'Prends ta revanche dans l\'onglet Amis !', tag: 'duel', url: '?tab=social' };
      else if (m.kind === 'accept') msg = { title: `🤝 ${from} a accepté votre demande d'ami`, body: 'Vous pouvez maintenant vous envoyer de l\'argent et des cryptos.', tag: 'friend', url: '?tab=social' };
        else continue;
        for (const s of subs.filter(s => s.uid === m.to && !s.dead && (!s.prefs || s.prefs.transfers !== false))) await push(s, msg);
      }
    }

    // Annonce à tous les joueurs abonnés (fichier announce.json, une seule fois par annonce)
    try {
      const ann = JSON.parse(fs.readFileSync(path.join(ROOT, 'announce.json'), 'utf8'));
      st.ann = st.ann || {};
      if (ann && ann.id && ann.push) {
        for (const s of subs.filter(s => !s.dead)) {
          const k = ann.id + ':' + s.sub.endpoint.slice(-40);
          if (st.ann[k]) continue;
          st.ann[k] = Date.now();
          await push(s, { title: ann.push.title, body: ann.push.body, tag: 'announce', url: ann.tab ? '?tab=' + ann.tab : './' });
        }
      }
    } catch (e) { }

    // ❓ Questions des joueurs : le créateur est prévenu des nouvelles, le joueur des réponses (créateur ou Claude)
    try {
      st.qa = st.qa || {}; let ans = {};
      try { ans = JSON.parse(fs.readFileSync(path.join(ROOT, 'answers.json'), 'utf8')).answers || {}; } catch (e) { }
      try { const d = await getDoc(doc(db, 'admin', 'qa')); if (d.exists()) Object.assign(ans, d.data()); } catch (e) { }
      const adminSubs = subs.filter(s => s.uid === TC.ADMIN_UID && !s.dead);
      for (const u of users) for (const x of (u.ask || [])) {
        if (!x || !x.id) continue;
        const qk = 'q:' + x.id, ak = 'a:' + x.id, a = ans[x.id];
        if (!st.qa[qk]) { st.qa[qk] = Date.now(); if (Date.now() - (x.t || 0) < 86400000 && u.uid !== TC.ADMIN_UID && !a) for (const s of adminSubs) await push(s, { title: `❓ Question de ${u.pseudo || 'un joueur'}`, body: String(x.q || '').slice(0, 140), tag: 'qa-new', url: '?qa=admin' }); }
        if (a && a.a && !st.qa[ak]) { st.qa[ak] = Date.now(); if (Date.now() - (a.t || Date.now()) < 7 * 86400000) for (const s of subs.filter(s => s.uid === u.uid && !s.dead)) await push(s, { title: '💬 Réponse à ta question', body: String(a.a).slice(0, 140), tag: 'qa', url: '?qa=1' }); }
      }
      prune(st.qa, 60 * 86400000);
      // Boîte de réception de Claude : les questions sans réponse (sans pseudo ni identifiant, coordonnées masquées)
      // sont publiées sur la branche qa-inbox du dépôt, que Claude lit lors de ses réveils programmés.
      const mask = t => String(t || '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-mail masqué]').replace(/(\+?\d[\d .-]{7,}\d)/g, '[numéro masqué]').replace(/https?:\/\/\S+/g, '[lien masqué]').slice(0, 300);
      const inbox = [];
      for (const u of users) for (const x of (u.ask || [])) if (x && x.id && !ans[x.id] && Date.now() - (x.t || 0) < 14 * 86400000 && u.uid !== TC.ADMIN_UID) inbox.push({ id: x.id, type: x.k === 'idee' ? 'idee' : x.k === 'bug' ? 'bug' : 'question', q: mask(x.q), t: x.t });
      inbox.sort((a, b) => a.t - b.t);
      fs.writeFileSync(path.join(ROOT, 'scripts', 'qa-inbox.json'), JSON.stringify({ info: 'Questions des joueurs sans réponse (anonymes). Réponses : answers.json sur main.', updated: inbox.length ? Math.max(...inbox.map(x => x.t)) : 0, questions: inbox }, null, 2));
    } catch (e) { log('questions', e.message); }

    // Championnat de la semaine : annonce du champion le lundi (une fois par semaine)
    try {
      const prev = weekOf(Date.now() - 7 * 86400000), cur = weekOf(Date.now());
      st.weekly = st.weekly || {};
      if (!st.weekly[prev.id] && 7 * 86400000 - cur.left > 5 * 60000) { // au moins 5 min après lundi 0 h
        let bans = {}; try { const b = await getDoc(doc(db, 'admin', 'bans')); bans = (b.exists() && b.data().users) || {}; } catch (e) { }
        const top = users.filter(u => !bans[u.uid] && u.uid !== TC.ADMIN_UID && (!claude || u.uid !== claude.uid) && typeof u[prev.field] === 'number' && u[prev.field] > 0).sort((a, b) => b[prev.field] - a[prev.field])[0];
        st.weekly[prev.id] = top ? top.uid : 'aucun';
        if (top) {
          log('champion de la semaine', prev.id, top.pseudo);
          for (const s of subs.filter(s => !s.dead)) {
            const me = s.uid === top.uid;
            await push(s, me ? { title: '🏆 Tu es le champion de la semaine !', body: `+${eur(top[prev.field])} de gain. Ouvre l'appli pour encaisser tes 500 € !`, tag: 'weekly', url: '?tab=social' }
              : { title: `🏆 ${top.pseudo} est le champion de la semaine`, body: `+${eur(top[prev.field])} de gain et 500 € de prime. Nouvelle semaine, nouvelle chance !`, tag: 'weekly', url: '?tab=social' });
          }
        }
      }
    } catch (e) { log('hebdo', e.message); }

    // 🤖 Modérateur automatique : repère triche, doubles comptes, propos interdits et demandes abusives.
    // Il ne bloque personne : il fait un rapport au créateur (mode créateur) et le prévient par notification.
    try {
      st.mod = st.mod || { hist: {}, seen: {} };
      const H = st.mod.hist, SEEN = st.mod.seen, now = Date.now(), day = new Date().toISOString().slice(0, 10);
      const reports = [];
      const eu = n => Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' €';
      const flag = (key, u, kind, detail, type) => { if (SEEN[key]) return; SEEN[key] = now; reports.push({ id: crypto.randomBytes(5).toString('hex'), at: now, uid: u.uid, pseudo: u.pseudo || '?', kind, detail, type }); };
      const BAD = /\b(con+(nar+d?e?|ne)?s?|pute?s?|salope?s?|encul[ée]e?s?|ntm|fdp|pd|connasse|batard|bâtard|merde|nique|ta m[eè]re|enfoir[ée]e?s?|tg|ftg|sale (noir|arabe|juif|blanc)|nazi|hitler)\b/i;
      const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[0@]/g, 'o').replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/\$/g, 's');
      // mots collés (« NiqueTaMere ») : on compare aussi le texte sans espaces ni symboles
      const GLUED = /(niquet(a|on|es)|tamere|tonpere|filsdepute|enculee?|salope|connasse|batard|enfoiree?|fdp|nazi|hitler|pedophile)/;
      const isBad = t => BAD.test(norm(t)) || GLUED.test(norm(t).toLowerCase().replace(/[^a-z]/g, ''));
      const live = users.filter(u => !u.deleted && u.uid !== TC.ADMIN_UID && (!claude || u.uid !== claude.uid)); // le créateur (argent illimité) et Claude ne sont pas surveillés
      const devOwners = {};
      for (const u of live) {
        const nw = +u.nw || 0;
        const gifted = st.cgift && Date.now() - (st.cgift[u.uid] || 0) < 7 * 86400000; // a reçu un don du créateur cette semaine
        // 1. fortune qui explose sans raison apparente (x10 en moins de 2 h, au-delà de 20 000 €)
        const h = (H[u.uid] || []).filter(x => now - x[0] < 2 * 3600000); h.push([now, nw]); H[u.uid] = h.slice(-30);
        const low = Math.min(...h.map(x => x[1]));
        if (!gifted && nw > 20000 && low > 0 && nw > low * 10) flag(`${u.uid}:fortune:${day}`, u, '💰 Fortune suspecte', `de ${eu(low)} à ${eu(nw)} en moins de 2 h`, 'fortune');
        if (!gifted && nw > 1e10) flag(`${u.uid}:enorme`, u, '💰 Fortune démesurée', `${Math.round(nw / 1e9)} milliards d'euros`, 'fortune');
        // 2. gain de la semaine énorme
        const wk = weekOf(now).field;
        if (!gifted && typeof u[wk] === 'number' && u[wk] > 1e6) flag(`${u.uid}:wk:${wk}`, u, '📈 Gain de semaine énorme', `+${eu(u[wk])} cette semaine`, 'fortune');
        // 3. mots interdits (pseudo, clan, discours du maire)
        const texts = [['pseudo', u.pseudo], ['clan', u.clanDef && u.clanDef.name], ['clan', u.clanDef && u.clanDef.tag], ['discours', u.speech && u.speech.text]].filter(x => x[1]);
        const bad = texts.find(x => isBad(x[1]));
        if (bad) flag(`${u.uid}:mot:${norm(bad[1]).slice(0, 40)}`, u, '🤬 Propos interdits', `${bad[0]} : « ${String(bad[1]).slice(0, 80)} »`, 'mot-' + bad[0]);
        // 4. demandes de récompense en rafale (plus de 3 du même type en 24 h)
        const cl = (u.shareClaims || []).filter(c => now - c.at < 86400000);
        const per = {}; cl.forEach(c => { per[c.kind] = (per[c.kind] || 0) + 1; });
        Object.entries(per).forEach(([k, n]) => { if (n > 3) flag(`${u.uid}:claims:${k}:${day}`, u, '📣 Demandes abusives', `${n} demandes « ${k} » en 24 h`, 'claims'); });
        // 5. appareils partagés (doubles comptes)
        if (!u.guest) (u.devs || []).forEach(d => { (devOwners[d] || (devOwners[d] = [])).push(u); }); // invités exclus
      }
      Object.values(devOwners).filter(l => l.length > 1).forEach(l => {
        const ids = l.map(u => u.uid).sort().join('+');
        flag(`dup:${ids}`, l[l.length - 1], '👥 Plusieurs comptes, même appareil', l.map(u => u.pseudo).join(', '), 'dup');
      });
      Object.keys(H).forEach(k => { if (!H[k].length || now - H[k][H[k].length - 1][0] > 86400000) delete H[k]; });
      Object.keys(SEEN).forEach(k => { if (now - SEEN[k] > 14 * 86400000) delete SEEN[k]; });
      // Sanctions automatiques : si le créateur n'a rien décidé au bout de 3 h, Sentinelle agit elle-même.
      // Fortune suspecte : blocage 24 h (7 jours en cas de récidive). Pseudo interdit : bloqué jusqu'à ce qu'il le change.
      // Clan ou discours interdit : 24 h. Doubles comptes (déjà bloqués par le jeu) et demandes de récompense (validées par le créateur) : simple signalement.
      // Le créateur peut tout annuler (admin/mod.undo) ; un signalement qu'il a coché (admin/mod.done) n'est jamais sanctionné.
      const AUTO = +process.env.MOD_AUTO_MS || 3 * 3600000;
      // signalements : dans la sauvegarde privée du robot (lisible seulement par lui et le créateur) ; sanctions : dans son profil public
      const svRef = doc(db, 'saves', botUid);
      const md = (await getDoc(meRef)).data() || {}, sv = (await getDoc(svRef)).data() || {};
      const all = (sv.modReports || md.modReports || []).concat(reports).slice(-60);
      const blocks = Object.assign({}, md.modBlocks || {});
      let adm = {}, bans = {};
      try { const m = await getDoc(doc(db, 'admin', 'mod')); adm = m.exists() ? m.data() : {}; } catch (e) { }
      try { const b = await getDoc(doc(db, 'admin', 'bans')); bans = (b.exists() && b.data().users) || {}; } catch (e) { }
      const done = adm.done || {}, undo = adm.undo || {}, strikes = st.mod.strikes || (st.mod.strikes = {});
      const byUid = Object.fromEntries(live.map(u => [u.uid, u]));
      let changed = reports.length > 0; const acted = [];
      for (const r of all) {
        if (r.acted || done[r.id] || now - r.at < AUTO) continue;
        r.acted = now; changed = true;
        const u = byUid[r.uid];
        if (!u) { r.action = 'Joueur introuvable'; continue; }
        if ((undo[r.uid] || 0) > r.at) { r.action = 'Annulé par le créateur'; continue; }
        if (bans[r.uid]) { r.action = 'Déjà bloqué par le créateur'; continue; }
        let b = null;
        if (r.type === 'fortune') { const n = strikes[r.uid] = (strikes[r.uid] || 0) + 1; const d = n > 1 ? 7 : 1; b = { until: now + d * 86400000, reason: `${r.kind.replace(/^\S+\s/, '')} (${r.detail}). Vérification en cours.`, label: `bloqué ${d === 1 ? '24 h' : '7 jours'}` }; }
        else if (r.type === 'mot-pseudo') { if (!isBad(u.pseudo)) { r.action = 'Déjà corrigé par le joueur'; continue; } b = { until: 0, need: 'pseudo', reason: 'Ton pseudo contient des mots interdits. Change-le pour débloquer ton compte.', label: 'bloqué jusqu\'au changement de pseudo' }; }
        else if (r.type === 'mot-clan' || r.type === 'mot-discours') b = { until: now + 86400000, reason: `Propos interdits dans ${r.type === 'mot-clan' ? 'le nom de ton clan' : 'ton discours de maire'}.`, label: 'bloqué 24 h' };
        else { r.action = 'Signalement seulement'; continue; }
        const label = b.label; delete b.label;
        blocks[r.uid] = { at: now, rid: r.id, kind: r.type, pseudo: u.pseudo || '', ...b };
        r.action = '🤖 ' + label[0].toUpperCase() + label.slice(1); acted.push({ r, u, b });
      }
      // levée des sanctions : durée finie, pseudo corrigé, annulation du créateur
      for (const [uid, bk] of Object.entries(blocks)) {
        const u = byUid[uid];
        const lift = !u || (undo[uid] || 0) > bk.at || (bk.until && bk.until < now) || (bk.need === 'pseudo' && !isBad(u.pseudo));
        if (lift) { delete blocks[uid]; changed = true; log('sanction levée :', bk.pseudo); }
      }
      if (changed || md.modReports || !md.modRound || now - md.modRound > 3600000) {
        const b = writeBatch(db);
        if (changed || md.modReports) b.set(svRef, { modReports: all, updatedAt: now }, { merge: true });
        b.update(meRef, { modBlocks: blocks, modReports: null, modRound: now, modTotal: (md.modTotal || 0) + reports.length, updatedAt: now });
        await b.commit();
      }
      const admin = TC.ADMIN_UID;
      if (reports.length) {
        log('modération :', reports.length, 'signalement(s)');
        for (const s of subs.filter(s => s.uid === admin && !s.dead)) await push(s, { title: `🤖 Sentinelle : ${reports.length} signalement${reports.length > 1 ? 's' : ''}`, body: reports.slice(0, 3).map(r => `${r.kind} : ${r.pseudo}`).join(' · ') + ' (j\'agis dans 3 h si tu ne fais rien)', tag: 'mod', url: './' });
      }
      for (const { r, u, b } of acted) {
        log('sanction :', u.pseudo, r.action);
        for (const s of subs.filter(s => s.uid === u.uid && !s.dead)) await push(s, { title: '🤖 Sentinelle a suspendu ton compte', body: b.reason, tag: 'mod', url: './' });
      }
      if (acted.length) for (const s of subs.filter(s => s.uid === admin && !s.dead)) await push(s, { title: `🤖 Sentinelle a agi : ${acted.length} sanction${acted.length > 1 ? 's' : ''}`, body: acted.slice(0, 3).map(x => `${x.u.pseudo} : ${x.r.action.replace('🤖 ', '')}`).join(' · '), tag: 'mod2', url: './' });
    } catch (e) { log('modération', e.message); }

    // Objectif 100 joueurs : une notification par jour (vers 18 h, heure de Paris) pour inviter à partager
    try {
      const parisH = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
      const day = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date());
      if (parisH >= 18 && st.shareDay !== day) {
        st.shareDay = day;
        const n = users.length, left = Math.max(0, 100 - n);
        const msg = left ? { title: `🎁 Plus que ${left} joueur${left > 1 ? 's' : ''} avant la grosse surprise !`, body: `On est ${n} sur Trad Center. Partage ton lien : à 100 joueurs, surprise pour tout le monde (et +20 € par ami inscrit).`, tag: 'share', url: '?share=1' }
          : { title: '🎉 On est plus de 100 joueurs !', body: 'Merci ! Continue d\'inviter tes amis : +20 € pour chaque ami inscrit avec ton lien.', tag: 'share', url: '?share=1' };
        log('rappel partage', n, 'joueurs');
        for (const s of subs.filter(s => !s.dead)) await push(s, msg);
      }
    } catch (e) { log('partage', e.message); }

    // Élection du maire : résultat le lundi (une fois par semaine)
    try {
      const prev = weekOf(Date.now() - 7 * 86400000), cur = weekOf(Date.now()), f = 'vote_' + prev.id;
      st.election = st.election || {};
      if (!st.election[prev.id] && 7 * 86400000 - cur.left > 5 * 60000) {
        let bans = {}; try { const b = await getDoc(doc(db, 'admin', 'bans')); bans = (b.exists() && b.data().users) || {}; } catch (e) { }
        const count = {};
        users.forEach(u => { const v = u[f]; if (typeof v === 'string' && v && v !== u.uid && !u.bot && !bans[u.uid] && !bans[v] && v !== TC.ADMIN_UID && (!claude || v !== claude.uid)) count[v] = (count[v] || 0) + 1; }); // créateur et Claude non éligibles
        const nw = {}; users.forEach(u => { nw[u.uid] = u.nw || 0; });
        const win = Object.keys(count).filter(u => pseudo[u]).sort((a, b) => count[b] - count[a] || nw[b] - nw[a])[0];
        st.election[prev.id] = win || 'aucun';
        if (win) {
          log('maire élu', prev.id, pseudo[win], count[win]);
          for (const s of subs.filter(s => !s.dead)) {
            await push(s, s.uid === win ? { title: '👑 Tu es élu Maire de Trad City !', body: `${count[win]} voix. Ouvre l'appli pour encaisser tes 300 € et voir ta couronne.`, tag: 'mayor', url: '?tab=city' }
              : { title: `👑 ${pseudo[win]} est élu Maire de Trad City`, body: `Avec ${count[win]} voix. Nouvelle élection cette semaine : va voter à la Mairie !`, tag: 'mayor', url: '?tab=city' });
          }
        }
      }
    } catch (e) { log('élection', e.message); }

    // 2 et 3. Marchés et alertes (seulement si quelqu'un est abonné)
    const live = subs.filter(s => !s.dead);
    if (withPrices && (live.length || claude)) { try { lastPx = process.env.MOCK_PRICES ? JSON.parse(process.env.MOCK_PRICES) : await prices(); log(Object.keys(lastPx).length, 'cours récupérés'); } catch (e) { log('cours', e.message); } }
    if (claude && withPrices) await claudeBets(lastPx);
    if (live.length && withPrices) {
      if (!lastPx) { lastPx = process.env.MOCK_PRICES ? JSON.parse(process.env.MOCK_PRICES) : await prices(); log(Object.keys(lastPx).length, 'cours récupérés'); }
      const px = lastPx;
      const events = marketEvents(px, st.fired);
      if (events.length) log('mouvements :', events.map(e => e.title).join(' | '));
      for (const s of live) {
        const lvl = (s.prefs && s.prefs.prices) || 'normal';
        if (lvl !== 'off') {
          const mine = events.filter(e => lvl === 'sensible' || e.level === 'normal');
          for (const e of mine.slice(0, 3)) await push(s, e);
          if (mine.length > 3) await push(s, { title: `📊 ${mine.length - 3} autre(s) gros mouvement(s)`, body: mine.slice(3, 6).map(e => e.title).join(' · '), tag: 'moves', url: './' });
        }
        for (const al of s.alerts || []) {
          const key = s.uid + ':' + al.id; if (st.alerts[key]) continue;
          const p = px[al.asset]; const a = TC.assetById[al.asset];
          if (p && a && (al.op === '>' ? p.eur >= al.price : p.eur <= al.price)) {
            st.alerts[key] = Date.now();
            await push(s, { title: `🎯 ${a.name} ${al.op === '>' ? 'a dépassé' : 'est passé sous'} ${eur(al.price)}`, body: `Cours actuel : ${eur(p.eur)}`, tag: 'alert-' + al.id, url: `?a=${al.asset}` });
          }
        }
      }
    }
    prune(st.done, 3 * 86400000); if (st.cgift) prune(st.cgift, 30 * 86400000); prune(st.alerts, 30 * 86400000); prune(st.dead, 30 * 86400000); if (st.ann) prune(st.ann, 60 * 86400000);
    prune(st.done, 3 * 86400000); prune(st.alerts, 30 * 86400000); prune(st.dead, 30 * 86400000); if (st.ann) prune(st.ann, 60 * 86400000);
    st.lastRun = Date.now(); keepUsers(); saveState(st);
    if (sent || verbose) log('passage terminé,', sent, 'notification(s) envoyée(s)');
    sentTotal += sent;
  }

  // Boucle : messages entre joueurs toutes les 30 s, marchés toutes les 3 min
  const end = Date.now() + (+process.env.LOOP_MINUTES || 0) * 60000;
  let n = 0;
  do {
    try { await tick(n % 6 === 0); } catch (e) { log('erreur passage :', e.code || e.message); }
    verbose = false; n++;
    if (Date.now() + 30000 < end) await new Promise(r => setTimeout(r, 30000));
  } while (Date.now() + 30000 < end);
  log('fin,', sentTotal, 'notification(s) au total');
  if (process.env.LOOP_MINUTES) fs.writeFileSync(path.join(ROOT, 'scripts', '.loop-ok'), '1'); // autorise la relance
}
main().then(() => process.exit(0)).catch(e => { console.error('Erreur :', e); process.exit(0); /* ne pas spammer d'e-mails d'échec */ });

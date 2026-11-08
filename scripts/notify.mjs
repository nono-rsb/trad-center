// Trad Center — serveur de notifications push (exécuté par GitHub Actions toutes les ~5 min)
//  1. Envoie les notifications en attente (envois d'argent, demandes d'ami) : collection pushQueue
//  2. Détecte les gros mouvements de marché (crypto via Binance, bourse via Yahoo Finance)
//  3. Déclenche les alertes de prix personnalisées
// Secret requis : PUSH_SECRET = {"botEmail","botPassword","vapidPublic","vapidPrivate"}
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore/lite';

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

/* ---------------- Envoi ---------------- */
async function main() {
  if (!process.env.PUSH_SECRET) { log('PUSH_SECRET absent : rien à faire (voir NOTIFICATIONS.md)'); return; }
  if (!TC.FIREBASE) { log('Firebase non configuré'); return; }
  const sec = JSON.parse(process.env.PUSH_SECRET);
  webpush.setVapidDetails(PAGE, sec.vapidPublic, sec.vapidPrivate);

  const app = initializeApp(process.env.EMULATOR ? { ...TC.FIREBASE, projectId: process.env.EMULATOR } : TC.FIREBASE);
  const auth = getAuth(app), db = getFirestore(app);
  if (process.env.EMULATOR) { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(db, '127.0.0.1', 8080); }
  await signInWithEmailAndPassword(auth, sec.botEmail, sec.botPassword);

  const subs = (await getDocs(collection(db, 'pushSubs'))).docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  log(subs.length, 'abonnement(s)');
  let sent = 0;
  const push = async (s, payload) => {
    try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' }); sent++; return true; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { log('abonnement expiré, supprimé', s.id); await deleteDoc(s.ref).catch(() => { }); s.dead = true; }
      else log('push', s.id, e.statusCode || e.message);
      return false;
    }
  };

  // 1. File d'attente (envois d'argent, demandes d'ami)
  const queue = (await getDocs(collection(db, 'pushQueue'))).docs;
  for (const q of queue) {
    const m = q.data();
    if (Date.now() - (m.createdAt || 0) < 24 * 3600000) {
      for (const s of subs.filter(s => s.uid === m.to && !s.dead && (!s.prefs || s.prefs.transfers !== false))) await push(s, { title: m.title, body: m.body, tag: m.tag || 'transfer', url: m.url || '?tab=social' });
    }
    await deleteDoc(q.ref);
  }
  if (queue.length) log(queue.length, 'message(s) de la file traités');

  // 2 et 3. Marchés et alertes (seulement si quelqu'un est abonné)
  const live = subs.filter(s => !s.dead);
  if (!live.length) { log('terminé,', sent, 'notification(s)'); return; }
  const stateRef = doc(db, 'pushState', 'main');
  const st = (await getDoc(stateRef)).data() || { fired: {} };
  const px = process.env.MOCK_PRICES ? JSON.parse(process.env.MOCK_PRICES) : await prices();
  log(Object.keys(px).length, 'cours récupérés');
  const events = marketEvents(px, st.fired);
  if (events.length) log('mouvements :', events.map(e => e.title).join(' | '));
  for (const s of live) {
    const lvl = (s.prefs && s.prefs.prices) || 'normal';
    if (lvl !== 'off') {
      const mine = events.filter(e => lvl === 'sensible' || e.level === 'normal');
      for (const e of mine.slice(0, 3)) await push(s, e);
      if (mine.length > 3) await push(s, { title: `📊 ${mine.length - 3} autre(s) gros mouvement(s)`, body: mine.slice(3, 6).map(e => e.title).join(' · '), tag: 'moves', url: './' });
    }
    // alertes personnalisées
    const alerts = s.alerts || []; const keep = [];
    for (const al of alerts) {
      const p = px[al.asset]; const a = TC.assetById[al.asset];
      const hit = p && a && (al.op === '>' ? p.eur >= al.price : p.eur <= al.price);
      if (hit && !s.dead) await push(s, { title: `🎯 ${a.name} ${al.op === '>' ? 'a dépassé' : 'est passé sous'} ${eur(al.price)}`, body: `Cours actuel : ${eur(p.eur)}`, tag: 'alert-' + al.id, url: `?a=${al.asset}` });
      else keep.push(al);
    }
    if (keep.length !== alerts.length && !s.dead) await updateDoc(s.ref, { alerts: keep, lastPush: Date.now() });
  }
  await setDoc(stateRef, { fired: st.fired, lastRun: Date.now() });
  log('terminé,', sent, 'notification(s) envoyée(s)');
}

main().then(() => process.exit(0)).catch(e => { console.error('Erreur :', e); process.exit(0); /* ne pas spammer d'e-mails d'échec */ });

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

  const st = loadState(); st.fired = st.fired || {}; st.done = st.done || {}; st.alerts = st.alerts || {}; st.dead = st.dead || {};
  let lastPx = null, sentTotal = 0, verbose = true;
  // Profils gardés en mémoire : relecture complète toutes les 30 min, sinon seulement les profils modifiés
  const cache = new Map(); let fullAt = 0, since = 0;
  async function loadUsers() {
    const now = Date.now();
    const docs = now - fullAt > 30 * 60000
      ? (fullAt = now, cache.clear(), (await getDocs(collection(db, 'users'))).docs)
      : (await getDocs(query(collection(db, 'users'), where('updatedAt', '>', since - 120000)))).docs;
    since = now;
    docs.forEach(d => { const x = d.data(); cache.set(d.id, { uid: d.id, ...x, pseudo: x.displayName || x.pseudo }); });
    return [...cache.values()].filter(u => !u.bot);
  }
  async function tick(withPrices) {
    let sent = 0;
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

    // Championnat de la semaine : annonce du champion le lundi (une fois par semaine)
    try {
      const prev = weekOf(Date.now() - 7 * 86400000), cur = weekOf(Date.now());
      st.weekly = st.weekly || {};
      if (!st.weekly[prev.id] && 7 * 86400000 - cur.left > 5 * 60000) { // au moins 5 min après lundi 0 h
        let bans = {}; try { const b = await getDoc(doc(db, 'admin', 'bans')); bans = (b.exists() && b.data().users) || {}; } catch (e) { }
        const top = users.filter(u => !bans[u.uid] && typeof u[prev.field] === 'number' && u[prev.field] > 0).sort((a, b) => b[prev.field] - a[prev.field])[0];
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
        users.forEach(u => { const v = u[f]; if (typeof v === 'string' && v && v !== u.uid && !u.bot && !bans[u.uid] && !bans[v]) count[v] = (count[v] || 0) + 1; });
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
    if (live.length && withPrices) {
      if (withPrices || !lastPx) { lastPx = process.env.MOCK_PRICES ? JSON.parse(process.env.MOCK_PRICES) : await prices(); log(Object.keys(lastPx).length, 'cours récupérés'); }
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
    prune(st.done, 3 * 86400000); prune(st.alerts, 30 * 86400000); prune(st.dead, 30 * 86400000); if (st.ann) prune(st.ann, 60 * 86400000);
    prune(st.done, 3 * 86400000); prune(st.alerts, 30 * 86400000); prune(st.dead, 30 * 86400000); if (st.ann) prune(st.ann, 60 * 86400000);
    st.lastRun = Date.now(); saveState(st);
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

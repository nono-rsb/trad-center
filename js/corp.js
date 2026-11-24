/* Trad Center — Entrepreneur : créer, financer et faire grandir sa vraie entreprise, de A à Z.
 * Idée → nom (vérifié) → forme juridique → capital → immatriculation (délai, Kbis) → équipe, produit, marketing →
 * TVA, cotisations, impôt sur les sociétés à chaque clôture → événements (contrôle, cyberattaque, buzz…) → dividendes →
 * monnaie de l'entreprise (SAS) que les amis peuvent acheter → liquidation si la trésorerie reste négative.
 * Tout vit dans state.corp (privé) ; seul un résumé public « co » est publié dans le profil (nom, secteur, valeur, monnaie). */
(function () {
  const C = TC.Corp = {};
  const G = TC.Game, fmt = TC.fmt, esc = TC.esc, S = () => G.state;
  const HOUR = 3600000, DAY = 86400000, WEEK = 7 * DAY;
  const r2 = v => Math.round(v * 100) / 100;
  const net = () => TC.Net;

  C.SECT = {
    tech: { e: '💻', n: 'Application mobile', mul: 1.25, ape: '62.01Z', pitch: 'Une appli que tout le monde télécharge.' },
    resto: { e: '🍽️', n: 'Restaurant', mul: 1.0, ape: '56.10A', pitch: 'Une bonne table, des clients fidèles.' },
    mode: { e: '👕', n: 'Marque de mode', mul: 0.95, ape: '14.13Z', pitch: 'Ta marque de vêtements.' },
    jeu: { e: '🎮', n: 'Studio de jeux vidéo', mul: 1.15, ape: '58.21Z', pitch: 'Tes propres jeux.' },
    nrj: { e: '⚡', n: 'Énergie verte', mul: 0.9, ape: '35.11Z', pitch: 'Panneaux solaires et éoliennes.' },
    fin: { e: '🪙', n: 'Fintech / crypto', mul: 1.3, ape: '66.19B', pitch: 'Paiements et finance de demain.' },
  };
  C.FORM = {
    micro: { n: 'Micro-entreprise', cap: 0, fee: 0, tok: false, emp: false, maxP: 5, info: 'Gratuit et simple. Cotisations 22 % du chiffre d\'affaires, pas de TVA. Pas de salariés, produit limité au niveau 5, pas de monnaie.' },
    sasu: { n: 'SASU', cap: 100, fee: 60, tok: false, emp: true, maxP: 10, info: 'Société à associé unique. Capital 100 €, frais de greffe 60 €. TVA 20 %, impôt sur les sociétés, salariés possibles. Pas de monnaie.' },
    sas: { n: 'SAS', cap: 1000, fee: 200, tok: true, emp: true, maxP: 10, info: 'Société par actions. Capital 1 000 €, frais de greffe 200 €. Tout est possible, y compris créer sa monnaie.' },
  };
  C.LOC = { home: { n: '🏠 Chez toi', h: 0, bonus: 1 }, cowork: { n: '🪑 Coworking', h: 2, bonus: 1.1 }, office: { n: '🏢 Bureaux', h: 10, bonus: 1.25 } };
  C.REG_DELAY = 12 * HOUR; // immatriculation au greffe
  const SAL = 8, CHG = 1.42, TOOLS = 1, TVA = 0.2, COTIS = 0.22, RCPRO = 40, TOKFEE = 500, SUP = 1e6;
  const co = () => S().corp || null;

  /* ---------- Calculs ---------- */
  C.maxEmp = c => C.FORM[c.form].emp ? 2 + 2 * c.P : 0;
  C.revH = function (c) {
    if (c.status !== 'actif') return 0; const now = Date.now();
    const m = c.mods && c.mods.until > now ? c.mods.rev : 1;
    return 12 * C.SECT[c.sec].mul * (0.5 + 0.5 * c.P) * (1 + 0.3 * c.M) * (1 + 0.5 * c.n) * C.LOC[c.loc].bonus * (c.camp > now ? 1.5 : 1) * m;
  };
  C.costH = c => c.n * SAL * CHG + C.LOC[c.loc].h + TOOLS;
  C.profitH = c => C.revH(c) - C.costH(c) - (c.form === 'micro' ? C.revH(c) * COTIS : 0);
  C.costP = c => Math.round(250 * Math.pow(2, c.P));
  C.costM = c => Math.round(150 * Math.pow(1.9, c.M));
  C.valuation = c => c.status === 'liquide' ? 0 : Math.max(50, c.tre + Math.max(0, C.profitH(c)) * 24 * 30 + c.P * 300 + c.n * 200);
  const tokTarget = c => C.valuation(c) / SUP * (1 + 0.02 * c.M);
  const ev = (c, txt) => { c.evlog.unshift({ t: Date.now(), txt }); if (c.evlog.length > 25) c.evlog.length = 25; };
  const dlog = (eur, asset) => { S().log.unshift({ t: Date.now(), kind: 'corp', eur: r2(eur), asset }); if (S().log.length > 300) S().log.length = 300; };

  /* ---------- Création ---------- */
  C.keyOf = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  C.nameErr = function (n) {
    n = (n || '').trim().replace(/\s+/g, ' ');
    if (n.length < 3 || n.length > 30 || !/^[\p{L}\p{N} &'\-.]+$/u.test(n)) return 'Nom : 3 à 30 caractères (lettres, chiffres, espaces, & \' - .).';
    if (TC.Mayor && TC.Mayor.clean && !TC.Mayor.clean(n)) return 'Ce nom n\'est pas autorisé.';
    return '';
  };
  C.nameFree = async function (n) { // « recherche d'antériorité » : aucun autre joueur ne porte déjà ce nom
    const k = C.keyOf(n), db = net() && net().db(); if (!db) return true;
    const s = await db.collection('users').where('co.k', '==', k).limit(1).get();
    return s.empty || s.docs[0].id === (net().user && net().user.uid);
  };
  C.create = function (o) {
    const F = C.FORM[o.form]; if (!F || !C.SECT[o.sec]) return { ok: false, msg: 'Choix invalide.' };
    if (co()) return { ok: false, msg: 'Tu as déjà une entreprise.' };
    const cap = Math.max(F.cap, r2(+o.cap || 0)), need = cap + F.fee;
    if (TC.Tax && TC.Tax.blocked()) return { ok: false, msg: 'Compte bloqué : paie d\'abord tes impôts.' };
    if (S().cash < need) return { ok: false, msg: `Il faut ${fmt.eur(need)} (capital ${fmt.eur(cap)} + frais de greffe ${fmt.eur(F.fee)}).` };
    S().cash -= need; dlog(need, `🏢 Création de ${o.name} (${F.n})`);
    const now = Date.now(), name = o.name.trim().replace(/\s+/g, ' ');
    S().corp = { v: 1, name, key: C.keyOf(name), sec: o.sec, form: o.form, at: now, regAt: now + C.REG_DELAY, status: 'immat', cap, tre: cap,
      tva: 0, P: 1, M: 0, n: 0, loc: 'home', rc: false, camp: 0, dev: null, last: now, close: now + WEEK, per: { ca: 0, ch: 0 }, hist: [], mods: null, neg: 0, evlog: [], divs: 0, tok: null,
      siren: String(Math.floor(1e8 + Math.random() * 9e8)), evlogInit: 1 };
    ev(S().corp, `Dossier déposé au greffe. Capital ${fmt.eur(cap)} bloqué sur le compte professionnel.`);
    G.save(true); return { ok: true };
  };

  /* ---------- Actions ---------- */
  const need = c => c && c.status === 'actif' ? null : 'L\'entreprise n\'est pas encore en activité.';
  C.act = function (k, arg) {
    const c = co(), m = need(c); if (m && k !== 'liquidate') return { ok: false, msg: m };
    switch (k) {
      case 'hire': {
        if (c.n >= C.maxEmp(c)) return { ok: false, msg: C.FORM[c.form].emp ? 'Il te faut un meilleur produit pour recruter plus (niveau ' + (c.P + 1) + ').' : 'Une micro-entreprise ne peut pas recruter. Passe en SASU ou SAS.' };
        if (c.tre < 150) return { ok: false, msg: 'Pas assez de trésorerie (150 € pour le recrutement).' };
        c.tre -= 150; c.per.ch += 150; c.n++; ev(c, 'Nouveau salarié recruté.'); break;
      }
      case 'fire': if (c.n < 1) return { ok: false, msg: 'Personne à licencier.' }; c.tre -= 100; c.per.ch += 100; c.n--; ev(c, 'Un salarié est parti (indemnités 100 €).'); break;
      case 'prod': {
        if (c.dev) return { ok: false, msg: 'Un développement est déjà en cours.' };
        if (c.P >= C.FORM[c.form].maxP) return { ok: false, msg: 'Niveau maximum pour ce statut.' };
        const p = C.costP(c); if (c.tre < p) return { ok: false, msg: `Il faut ${fmt.eur(p)} de trésorerie.` };
        c.tre -= p; c.per.ch += p; c.dev = { to: c.P + 1, at: Date.now() + c.P * 2 * HOUR }; ev(c, `R&D lancée : produit niveau ${c.P + 1} dans ${c.P * 2} h.`); break;
      }
      case 'mkt': {
        if (c.M >= 10) return { ok: false, msg: 'Marketing au maximum.' };
        const p = C.costM(c); if (c.tre < p) return { ok: false, msg: `Il faut ${fmt.eur(p)} de trésorerie.` };
        c.tre -= p; c.per.ch += p; c.M++; ev(c, `Campagne de communication : marketing niveau ${c.M}.`); break;
      }
      case 'camp': { if (c.tre < 300) return { ok: false, msg: 'Il faut 300 €.' }; if (c.camp > Date.now()) return { ok: false, msg: 'Une pub est déjà en cours.' }; c.tre -= 300; c.per.ch += 300; c.camp = Date.now() + 24 * HOUR; ev(c, 'Pub TV et réseaux : ventes ×1,5 pendant 24 h.'); break; }
      case 'loc': { if (!C.LOC[arg]) return { ok: false, msg: 'Local inconnu.' }; c.loc = arg; ev(c, `Déménagement : ${C.LOC[arg].n}.`); break; }
      case 'rc': c.rc = !c.rc; ev(c, c.rc ? 'Assurance RC pro souscrite (40 € par clôture).' : 'Assurance RC pro résiliée.'); break;
      case 'inject': { const a = r2(+arg); if (!(a > 0) || a > S().cash) return { ok: false, msg: 'Montant invalide ou cash insuffisant.' }; S().cash -= a; c.tre += a; c.cap += 0; dlog(a, '🏢 Apport en compte courant'); ev(c, `Apport de ${fmt.eur(a)} en compte courant.`); break; }
      case 'div': {
        const a = r2(+arg); if (!(a > 0)) return { ok: false, msg: 'Montant invalide.' };
        if (a > c.tre - 100) return { ok: false, msg: 'Garde au moins 100 € dans l\'entreprise.' };
        const net1 = r2(a * 0.7); c.tre -= a; c.divs = r2(c.divs + a); S().cash += net1; if (TC.Tax) TC.Tax.pay(r2(a * 0.3));
        dlog(net1, `🏢 Dividendes de ${c.name} (flat tax 30 % : ${fmt.eur(a * 0.3)})`); ev(c, `Dividendes versés : ${fmt.eur(a)} (flat tax 30 %).`); break;
      }
      case 'token': return makeToken(c, arg);
      case 'liquidate': return liquidate(c, 'Liquidation volontaire.');
    }
    G.save(true); return { ok: true };
  };
  function liquidate(c, why) {
    if (!c || c.status === 'liquide') return { ok: false, msg: 'Déjà liquidée.' };
    const back = Math.max(0, r2(c.tre)); c.tre = 0; c.status = 'liquide'; c.n = 0; if (c.tok) c.tok.px = 0;
    if (back > 0) { S().cash += back; dlog(back, `🏢 Boni de liquidation de ${c.name}`); }
    ev(c, why + (back ? ` Boni de ${fmt.eur(back)} récupéré.` : ''));
    S().corpOld = (S().corpOld || 0) + 1; G.save(true); return { ok: true };
  }
  C.restart = function () { const c = co(); if (c && c.status === 'liquide') { S().corp = null; G.save(true); } };
  function makeToken(c, o) {
    const F = C.FORM[c.form]; if (!F.tok) return { ok: false, msg: 'Seule une SAS peut créer sa monnaie.' };
    if (c.tok) return { ok: false, msg: 'Ta monnaie existe déjà.' };
    if (c.P < 2) return { ok: false, msg: 'Il faut un produit de niveau 2 minimum.' };
    const sym = String(o.sym || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5), name = String(o.name || '').trim().slice(0, 24);
    if (sym.length < 3) return { ok: false, msg: 'Symbole : 3 à 5 lettres.' }; if (name.length < 3) return { ok: false, msg: 'Nom de la monnaie : 3 caractères minimum.' };
    if (TC.assetById && TC.assetById[sym]) return { ok: false, msg: 'Ce symbole existe déjà sur les marchés.' };
    if (TC.Mayor && TC.Mayor.clean && !(TC.Mayor.clean(name) && TC.Mayor.clean(sym))) return { ok: false, msg: 'Ce nom n\'est pas autorisé.' };
    if (c.tre < TOKFEE) return { ok: false, msg: `Il faut ${fmt.eur(TOKFEE)} de trésorerie (audit et mise en ligne).` };
    c.tre -= TOKFEE; c.per.ch += TOKFEE; c.tok = { name, sym, sup: SUP, sold: 0, px: tokTarget(c), at: Date.now() };
    ev(c, `Lancement de ${name} (${sym}) : ${SUP.toLocaleString('fr-FR')} jetons créés.`); G.save(true); return { ok: true };
  }

  /* ---------- Boucle : activité heure par heure, clôture hebdomadaire, événements ---------- */
  function events(c) {
    const r = Math.random(); if (r > 0.6) return;
    const pick = Math.floor(Math.random() * 5);
    if (pick === 0) { const cost = Math.max(50, c.tre * 0.05) * (c.rc ? 0.1 : 1); c.tre -= cost; ev(c, `💥 Cyberattaque : −${fmt.eur(cost)}${c.rc ? ' (RC pro : franchise seulement)' : ' (pas d\'assurance !)'}.`); }
    else if (pick === 1 && c.n > 0) { const cost = 150 * c.n * (c.rc ? 0.1 : 1); c.tre -= cost; ev(c, `⚖️ Litige aux prud'hommes : −${fmt.eur(cost)}${c.rc ? ' (RC pro)' : ''}.`); }
    else if (pick === 2) { c.mods = { rev: 0.8, until: Date.now() + 3 * DAY }; ev(c, '🥊 Un concurrent débarque : ventes −20 % pendant 3 jours.'); }
    else if (pick === 3) { c.mods = { rev: 1.8, until: Date.now() + DAY }; ev(c, '🚀 Ça buzze sur les réseaux ! Ventes ×1,8 pendant 24 h.'); }
    else { const g = 300 + 40 * c.P; c.tre += g; ev(c, `🏛️ Subvention Bpifrance : +${fmt.eur(g)}.`); }
  }
  function closing(c) {
    const ca = r2(c.per.ca), ch = r2(c.per.ch); let res = r2(ca - ch), tax = 0, lines = [];
    if (c.form === 'micro') { tax = r2(ca * COTIS); lines.push(`cotisations ${fmt.eur(tax)}`); res = r2(res - 0); }
    else {
      if (c.tva > 0) { const t = r2(c.tva), pen = c.tre < t ? r2(t * 0.1) : 0; c.tre -= t + pen; c.tva = 0; lines.push(`TVA ${fmt.eur(t)}${pen ? ` + majoration ${fmt.eur(pen)}` : ''}`); }
      const b = Math.max(0, res); tax = r2(Math.min(b, 5000) * 0.15 + Math.max(0, b - 5000) * 0.25); if (tax) lines.push(`IS ${fmt.eur(tax)}`);
    }
    if (c.form === 'micro') c.tre -= tax; else c.tre -= tax;
    if (c.rc) { c.tre -= RCPRO; lines.push(`RC pro ${fmt.eur(RCPRO)}`); }
    c.hist.unshift({ t: Date.now(), ca, ch, res, tax }); if (c.hist.length > 12) c.hist.length = 12;
    ev(c, `📒 Clôture : CA ${fmt.eur(ca)}, résultat ${fmt.eur(res)}${lines.length ? ' · ' + lines.join(' · ') : ''}.`);
    c.per = { ca: 0, ch: 0 }; events(c);
    c.neg = c.tre < 0 ? (c.neg || 0) + 1 : 0;
    if (c.neg >= 2) { liquidate(c, '⚠️ Redressement puis liquidation judiciaire : trésorerie négative deux clôtures de suite.'); TC.toast(`⚠️ ${esc(c.name)} est en liquidation judiciaire.`, 'bad', 9000); }
    else if (c.tre < 0) TC.toast(`⚠️ Trésorerie de ${esc(c.name)} négative ! Apporte de l'argent avant la prochaine clôture ou c'est la liquidation.`, 'bad', 9000);
  }
  C.tick = function () {
    const c = co(); if (!c || !G.state) return; const now = Date.now();
    if (c.status === 'immat') { if (now >= c.regAt) { c.status = 'actif'; c.last = now; ev(c, '✅ Kbis reçu ! L\'entreprise est immatriculée (SIREN ' + c.siren + '). Tu peux lancer l\'activité.'); TC.toast(`📄 Kbis reçu : <b>${esc(c.name)}</b> est immatriculée !`, 'ok', 8000); G.save(true); } return; }
    if (c.status !== 'actif') return;
    let h = Math.min(72, (now - c.last) / HOUR); if (h < 0.01) return;
    const steps = Math.max(1, Math.ceil(h)), dt = h / steps;
    for (let i = 0; i < steps; i++) {
      const rev = C.revH(c) * dt, cost = C.costH(c) * dt;
      c.tre += rev * (c.form === 'micro' ? 1 : 1 + TVA) - cost; if (c.form !== 'micro') c.tva += rev * TVA; c.per.ca += rev; c.per.ch += cost;
      if (c.tok) { const t = tokTarget(c), px = c.tok.px * (1 + (Math.random() - 0.5) * 0.02); c.tok.px = Math.max(1e-7, px + (t - px) * 0.2 * dt); }
    }
    c.last = now;
    if (c.dev && now >= c.dev.at) { c.P = c.dev.to; ev(c, `🛠️ Produit niveau ${c.P} livré !`); TC.toast(`🛠️ ${esc(c.name)} : produit niveau ${c.P} livré.`, 'ok', 6000); c.dev = null; }
    if (c.tok && !c.tok.day || c.tok && now - c.tok.day > DAY) { c.tok.day = now; c.tok.px0 = c.tok.px; }
    if (c.tok && c.tok.px0) c.tok.px = Math.min(c.tok.px0 * 1.1, Math.max(c.tok.px0 * 0.9, c.tok.px)); // pas plus de ±10 % par jour
    let k = 0; while (c.status === 'actif' && now >= c.close && k++ < 4) { closing(c); c.close += WEEK; }
    if (c.close < now) c.close = now + WEEK;
    G.save(); if (TC.App && TC.App.after) TC.App.after();
  };
  setInterval(() => { try { C.tick(); } catch (e) { console.warn('corp', e); } }, 60000); setTimeout(() => { try { C.tick(); } catch (e) { } }, 6000);

  /* ---------- Public : profil, patrimoine, jetons des amis ---------- */
  C.pub = function () {
    const c = co(); if (!c) return null;
    return { n: c.name, k: c.key, e: C.SECT[c.sec].e, s: c.sec, f: c.form, v: Math.round(C.valuation(c)), st: c.status, lv: c.P, em: c.n, at: c.at,
      tok: c.tok ? { n: c.tok.name, y: c.tok.sym, px: +c.tok.px.toPrecision(5), sold: Math.round(c.tok.sold), sup: c.tok.sup } : null };
  };
  const hold = () => S().corpHold || (S().corpHold = {});
  C.holdValue = () => Object.values(S().corpHold || {}).reduce((t, h) => t + h.qty * h.px * 0.97, 0);
  { const nw0 = G.netWorth; G.netWorth = () => nw0() + (co() && co().status === 'actif' ? Math.max(0, co().tre) : 0) + C.holdValue(); }
  { const rc0 = G.receive; G.receive = function (t) { rc0.apply(this, arguments); try { const m = /^🪙 ([\d.]+) ([A-Z]{3,5})$/.exec(t.msg || ''), c = co(); if (m && c && c.tok && c.tok.sym === m[2]) { c.tok.sold = Math.min(c.tok.sup * 0.49, c.tok.sold + +m[1]); ev(c, `🪙 ${t.fromPseudo} a investi ${fmt.eur(t.eur)} (${m[1]} ${m[2]}).`); G.save(true); } } catch (e) { } }; }
  C.buy = async function (friend, eur) {
    const c = friend.co, t = c && c.tok; eur = r2(+eur);
    if (!t || c.st !== 'actif') throw new Error('Cette monnaie n\'est pas disponible.');
    if (!(eur >= 1)) throw new Error('Minimum 1 €.');
    const qty = +(eur * 0.99 / t.px).toFixed(4); // 1 % de frais de courtage
    if (t.sold + qty > t.sup * 0.49) throw new Error('Plus de jetons disponibles (le fondateur garde 51 %).');
    await net().send(friend, 'cash', null, eur, `🪙 ${qty} ${t.y}`);
    const h = hold()[friend.uid] || (hold()[friend.uid] = { qty: 0, cost: 0, px: t.px }); h.qty = +(h.qty + qty).toFixed(4); h.cost = r2(h.cost + eur); h.px = t.px; h.sym = t.y; h.name = t.n; h.co = c.n; h.pseudo = friend.pseudo;
    dlog(eur, `🪙 Achat de ${qty} ${t.y} (${c.n})`); G.save(true); return qty;
  };
  C.sell = function (uid) {
    const h = hold()[uid]; if (!h || h.qty <= 0) return { ok: false, msg: 'Rien à vendre.' };
    const v = r2(h.qty * h.px * 0.97); S().cash += v; dlog(v, `🪙 Vente de ${h.qty} ${h.sym} (${h.co})`); delete hold()[uid]; G.save(true); return { ok: true, v };
  };
  C.refreshHold = function () { (net() && net().friends || []).forEach(f => { const h = (S().corpHold || {})[f.uid]; if (h && f.co) h.px = f.co.st === 'liquide' || !f.co.tok ? 0 : f.co.tok.px; }); };
  C.board = async function () {
    const db = net() && net().db(); if (!db) return [];
    if (C._b && Date.now() - C._bt < 60000) return C._b;
    const s = await db.collection('users').where('co.v', '>', 0).orderBy('co.v', 'desc').limit(30).get();
    C._bt = Date.now(); return C._b = s.docs.map(d => net().prof(d.id, d.data()));
  };

  /* ---------- Écrans ---------- */
  const dt = t => new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pxf = v => fmt.eur(v);
  C.panel = function () {
    if (!S().owned) return ''; const c = co();
    if (!c) return `<div class="panel corp-panel"><h3>🏢 Deviens entrepreneur</h3><p class="muted">Crée ta vraie entreprise : nom, statut juridique, Kbis, salariés, TVA, impôts… et même ta propre monnaie. Tes amis pourront investir.</p><button class="btn btn-gold" data-corp="new">🚀 Créer mon entreprise</button> <button class="btn btn-sm" data-corp="market">🌍 Voir les entreprises</button></div>`;
    const st = c.status === 'immat' ? `⏳ Kbis attendu ${dt(c.regAt)}` : c.status === 'liquide' ? '💀 Liquidée' : `${fmt.eur(C.profitH(c) * 24)} / jour`;
    return `<div class="panel corp-panel"><h3>${C.SECT[c.sec].e} ${esc(c.name)} <small>${C.FORM[c.form].n}</small></h3><div class="kv"><span>Trésorerie</span><b>${fmt.eur(c.tre)}</b><span>Résultat</span><b>${st}</b>${c.tok ? `<span>Monnaie ${esc(c.tok.sym)}</span><b>${pxf(c.tok.px)}</b>` : ''}</div><button class="btn btn-gold btn-sm" data-corp="dash">📊 Gérer</button> <button class="btn btn-sm" data-corp="market">🌍 Entreprises</button></div>`;
  };
  const inp = (id, ph) => `<div class="frin"><input id="${id}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="${ph || 'Montant'}"><span>€</span></div>`;
  const shell = (title, cls) => TC.modal(`<h2>${title}</h2><div class="modal-body corp-body"></div><div class="modal-actions"><button class="btn btn-ghost" data-close>Fermer</button></div>`, { cls: 'corp-modal ' + (cls || '') });

  C.wizard = function () {
    const W = { step: 1, sec: 'tech', form: 'sas', name: '', cap: 0 };
    const md = shell('🚀 Créer mon entreprise'), el = md.el, body = () => el.querySelector('.corp-body');
    const draw = () => {
      const b = body(), F = C.FORM[W.form];
      if (W.step === 1) b.innerHTML = `<p class="hint">Étape 1/4 · <b>L'idée</b> : dans quel secteur te lances-tu ?</p><div class="corp-grid">${Object.entries(C.SECT).map(([k, s]) => `<button class="corp-opt ${W.sec === k ? 'on' : ''}" data-sec="${k}"><span>${s.e}</span><b>${s.n}</b><small>${s.pitch}</small></button>`).join('')}</div><button class="btn btn-gold btn-xl" data-next>Suite →</button>`;
      if (W.step === 2) b.innerHTML = `<p class="hint">Étape 2/4 · <b>Le nom</b> de ton entreprise. Un vrai nom, unique : on vérifie qu'aucun autre joueur ne l'a déjà (recherche d'antériorité).</p><div class="frin"><input id="cw-name" maxlength="30" placeholder="ex : Lumio Studio" value="${esc(W.name)}"></div><p class="err" id="cw-err"></p><button class="btn btn-gold btn-xl" data-check>Vérifier la disponibilité →</button>`;
      if (W.step === 3) b.innerHTML = `<p class="hint">Étape 3/4 · <b>Le statut juridique</b></p><div class="corp-grid">${Object.entries(C.FORM).map(([k, f]) => `<button class="corp-opt ${W.form === k ? 'on' : ''}" data-form="${k}"><b>${f.n}</b><small>${f.info}</small></button>`).join('')}</div>${F.cap ? `<label class="hint">Capital social (minimum ${fmt.eur(F.cap)}) : plus il est élevé, plus ta trésorerie de départ est grande.</label>${inp('cw-cap', fmt.eur(F.cap))}` : ''}<button class="btn btn-gold btn-xl" data-next>Suite →</button>`;
      if (W.step === 4) { const cap = Math.max(F.cap, r2(+W.cap || 0)); b.innerHTML = `<p class="hint">Étape 4/4 · <b>Immatriculation</b></p><div class="kv"><span>Nom</span><b>${esc(W.name)}</b><span>Secteur</span><b>${C.SECT[W.sec].e} ${C.SECT[W.sec].n}</b><span>Statut</span><b>${F.n}</b><span>Capital</span><b>${fmt.eur(cap)}</b><span>Frais de greffe</span><b>${fmt.eur(F.fee)}</b><span>Total à payer</span><b>${fmt.eur(cap + F.fee)}</b><span>Ton cash</span><b>${fmt.eur(S().cash)}</b></div><p class="hint">Le capital est versé sur le compte professionnel de l'entreprise. Le dossier part au greffe : le <b>Kbis</b> arrive dans 12 h, puis l'activité démarre.</p><p class="err" id="cw-err"></p><button class="btn btn-gold btn-xl" data-go>📄 Déposer le dossier</button>`; }
      if (W.step > 1) b.insertAdjacentHTML('beforeend', '<button class="btn btn-ghost btn-sm" data-back>← Retour</button>');
    };
    el.onclick = async e => {
      if (e.target === el || e.target.closest('.modal-x') || e.target.closest('[data-close]')) return md.close();
      const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
      if (d.sec) { W.sec = d.sec; draw(); } else if (d.form) { W.form = d.form; draw(); }
      else if (d.back !== undefined) { W.step--; draw(); }
      else if (d.next !== undefined) { if (W.step === 3) W.cap = (el.querySelector('#cw-cap') || {}).value; W.step++; draw(); }
      else if (d.check !== undefined) {
        const n = el.querySelector('#cw-name').value.trim().replace(/\s+/g, ' '), er = el.querySelector('#cw-err'), m = C.nameErr(n); W.name = n;
        if (m) return er.textContent = m; t.disabled = true; t.textContent = 'Recherche en cours…';
        try { if (!(await C.nameFree(n))) { er.textContent = `« ${n} » est déjà pris par une autre entreprise. Choisis un autre nom.`; t.disabled = false; t.textContent = 'Vérifier la disponibilité →'; return; } } catch (x) { }
        W.step = 3; draw();
      } else if (d.go !== undefined) {
        const r = C.create({ name: W.name, sec: W.sec, form: W.form, cap: W.cap });
        if (!r.ok) return el.querySelector('#cw-err').textContent = r.msg;
        md.close(); TC.sound('kaching'); TC.confetti(120); TC.toast(`📄 Dossier de <b>${esc(W.name)}</b> déposé au greffe. Kbis dans 12 h !`, 'ok', 8000); if (net()) net().flush(); if (TC.App && TC.App.after) TC.App.after(); C.dash();
      }
    };
    draw();
  };

  C.dash = function (tab) {
    const c0 = co(); if (!c0) return C.wizard();
    tab = tab || 'home';
    const tabs = [['home', '📊 Bilan'], ['team', '👥 Équipe'], ['prod', '🚀 Produit'], ['books', '📒 Compta'], ['coin', '🪙 Monnaie']];
    const md = shell('', 'corp-dash'), el = md.el;
    const home = c => {
      const F = C.FORM[c.form], S0 = C.SECT[c.sec];
      if (c.status === 'immat') return `<div class="kbis"><b>${esc(c.name.toUpperCase())}</b><small>${F.n} · ${S0.n} · APE ${S0.ape}</small><p>⏳ Dossier d'immatriculation au greffe. Le Kbis arrive le <b>${dt(c.regAt)}</b>.</p><p class="hint">Capital ${fmt.eur(c.cap)} versé sur le compte professionnel. En attendant, tu peux déjà préparer ton business plan 😉</p></div>`;
      if (c.status === 'liquide') return `<div class="kbis dead"><b>${esc(c.name.toUpperCase())}</b><p>💀 Entreprise liquidée.</p><button class="btn btn-gold" data-ac="restart">Repartir de zéro</button></div><div class="corp-log">${c.evlog.map(x => `<div><small>${dt(x.t)}</small> ${x.txt}</div>`).join('')}</div>`;
      return `<div class="kbis"><b>${S0.e} ${esc(c.name.toUpperCase())}</b><small>${F.n} · SIREN ${c.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')} · APE ${S0.ape}</small></div>
        <div class="kv"><span>🏦 Trésorerie</span><b class="${c.tre < 0 ? 'down' : ''}">${fmt.eur(c.tre)}</b><span>💶 Ventes</span><b>${fmt.eur(C.revH(c))} / h</b><span>💸 Charges</span><b>${fmt.eur(C.costH(c))} / h</b><span>📈 Résultat</span><b class="${C.profitH(c) >= 0 ? 'up' : 'down'}">${fmt.eur(C.profitH(c) * 24)} / jour</b><span>🏷️ Valorisation</span><b>${fmt.eur(C.valuation(c), true)}</b><span>📒 Prochaine clôture</span><b>${dt(c.close)}</b></div>
        ${c.tre < 0 ? '<div class="nbox warn">⚠️ Trésorerie négative : apporte de l\'argent avant la prochaine clôture ou c\'est la liquidation.</div>' : ''}
        <h4>Argent</h4>${inp('cd-amt')}<div class="corp-row"><button class="btn btn-sm" data-ac="inject">⬆️ Apporter (compte courant)</button><button class="btn btn-sm" data-ac="div">⬇️ Me verser des dividendes (−30 %)</button></div>
        <h4>Journal</h4><div class="corp-log">${c.evlog.map(x => `<div><small>${dt(x.t)}</small> ${x.txt}</div>`).join('') || '<p class="muted">Rien pour l\'instant.</p>'}</div>
        <button class="btn btn-ghost btn-sm" data-ac="liquidate">Liquider l'entreprise</button>`;
    };
    const team = c => `<div class="kv"><span>Salariés</span><b>${c.n} / ${C.maxEmp(c)}</b><span>Coût par salarié</span><b>${fmt.eur(SAL * CHG)} / h (charges patronales 42 % incluses)</b></div>
      <div class="corp-row"><button class="btn btn-gold btn-sm" data-ac="hire">➕ Recruter (150 €)</button><button class="btn btn-sm" data-ac="fire">➖ Licencier (100 €)</button></div>
      <p class="hint">Chaque salarié augmente tes ventes de 50 %. ${C.FORM[c.form].emp ? 'Plus ton produit est avancé, plus tu peux recruter.' : '⛔ Micro-entreprise : pas de salariés.'}</p>
      <h4>Local</h4><div class="corp-grid">${Object.entries(C.LOC).map(([k, l]) => `<button class="corp-opt ${c.loc === k ? 'on' : ''}" data-ac="loc" data-arg="${k}"><b>${l.n}</b><small>${l.h ? fmt.eur(l.h) + ' / h' : 'Gratuit'} · ventes ×${l.bonus}</small></button>`).join('')}</div>`;
    const prod = c => `<div class="kv"><span>Produit</span><b>niveau ${c.P} / ${C.FORM[c.form].maxP}</b><span>Marketing</span><b>niveau ${c.M} / 10</b></div>
      ${c.dev ? `<p>🛠️ R&D en cours : niveau ${c.dev.to} le ${dt(c.dev.at)}</p>` : ''}
      <div class="corp-row"><button class="btn btn-gold btn-sm" data-ac="prod" ${c.dev ? 'disabled' : ''}>🛠️ R&D · ${fmt.eur(C.costP(c))}</button><button class="btn btn-sm" data-ac="mkt">📣 Marketing · ${fmt.eur(C.costM(c))}</button><button class="btn btn-sm" data-ac="camp">📺 Pub 24 h · 300 €</button></div>
      <p class="hint">Le produit multiplie tes ventes, le marketing aussi. Une pub donne ×1,5 pendant 24 h. ${c.camp > Date.now() ? '<b>📺 Pub en cours.</b>' : ''}</p>
      <label class="fr-chk"><input type="checkbox" data-ac="rc" ${c.rc ? 'checked' : ''}> 🛡️ Assurance RC pro (40 € par clôture) : cyberattaque et litiges ne coûtent que 10 %</label>`;
    const books = c => `<p class="hint">Chaque semaine, clôture des comptes : ${c.form === 'micro' ? 'cotisations sociales 22 % du chiffre d\'affaires' : 'TVA 20 % reversée, puis impôt sur les sociétés (15 % jusqu\'à 5 000 € de bénéfice, 25 % au-delà)'}.</p>
      <div class="kv"><span>Période en cours</span><b>CA ${fmt.eur(c.per.ca)} · charges ${fmt.eur(c.per.ch)}</b>${c.form !== 'micro' ? `<span>TVA à reverser</span><b>${fmt.eur(c.tva)}</b>` : ''}<span>Dividendes versés</span><b>${fmt.eur(c.divs)}</b></div>
      <h4>Bilans</h4>${c.hist.length ? `<table class="corp-tab"><tr><th>Clôture</th><th>CA</th><th>Charges</th><th>Résultat</th><th>Impôt</th></tr>${c.hist.map(x => `<tr><td>${new Date(x.t).toLocaleDateString('fr-FR')}</td><td>${fmt.eur(x.ca, true)}</td><td>${fmt.eur(x.ch, true)}</td><td class="${x.res >= 0 ? 'up' : 'down'}">${fmt.eur(x.res, true)}</td><td>${fmt.eur(x.tax, true)}</td></tr>`).join('')}</table>` : '<p class="muted">Pas encore de clôture.</p>'}`;
    const coin = c => {
      if (!c.tok) return `<p>🪙 Crée ta propre monnaie, comme un Bitcoin : ${SUP.toLocaleString('fr-FR')} jetons que tes amis peuvent acheter. Son prix suit la valeur de ton entreprise (trésorerie, bénéfices, produit). Tu gardes toujours 51 % des jetons.</p>
        <p class="hint">${C.FORM[c.form].tok ? `Conditions : SAS, produit niveau 2 minimum, ${fmt.eur(TOKFEE)} d'audit et de mise en ligne.` : '⛔ Il faut être en SAS.'}</p>
        <div class="frin"><input id="ck-name" maxlength="24" placeholder="Nom (ex : Lumio Coin)"></div><div class="frin"><input id="ck-sym" maxlength="5" placeholder="Symbole (3 à 5 lettres, ex : LUM)"></div><button class="btn btn-gold btn-xl" data-ac="token">🪙 Lancer ma monnaie</button><p class="err" id="ck-err"></p>`;
      const t = c.tok; return `<div class="kbis"><b>🪙 ${esc(t.name)} · ${esc(t.sym)}</b></div><div class="kv"><span>Prix</span><b>${pxf(t.px)}</b><span>Capitalisation</span><b>${fmt.eur(t.px * t.sup, true)}</b><span>Jetons vendus aux amis</span><b>${Math.round(t.sold).toLocaleString('fr-FR')} / ${Math.round(t.sup * 0.49).toLocaleString('fr-FR')}</b></div><p class="hint">Quand un ami achète, l'argent arrive directement dans ton cash. Le prix ne bouge pas de plus de 10 % par jour.</p>`;
    };
    const draw = () => {
      const c = co();
      el.querySelector('.corp-body').innerHTML = `<div class="fr-tabs">${tabs.map(([k, n]) => `<button class="btn btn-sm ${k === tab ? 'btn-gold' : ''}" data-ctab="${k}">${n}</button>`).join('')}</div><div class="corp-pane">${!c ? '' : tab === 'home' || c.status !== 'actif' ? home(c) : tab === 'team' ? team(c) : tab === 'prod' ? prod(c) : tab === 'books' ? books(c) : coin(c)}</div>`;
      el.querySelector('h2').innerHTML = c ? `${C.SECT[c.sec].e} ${esc(c.name)}` : '';
    };
    const done = (r, ok) => { if (!r.ok) { const e = el.querySelector('#ck-err'); if (e) e.textContent = r.msg; return TC.toast(r.msg, 'bad', 5000); } TC.sound('cash'); if (ok) TC.toast(ok, 'ok'); if (TC.App && TC.App.after) TC.App.after(); if (net()) net().flushSoon && net().flushSoon(); draw(); };
    el.onclick = e => {
      if (e.target === el || e.target.closest('.modal-x') || e.target.closest('[data-close]')) return md.close();
      const t = e.target.closest('[data-ctab]'); if (t) { tab = t.dataset.ctab; return draw(); }
      const a = e.target.closest('[data-ac]'); if (!a || a.type === 'checkbox') return; const k = a.dataset.ac, v = id => (el.querySelector('#' + id) || {}).value;
      if (k === 'restart') { C.restart(); md.close(); return C.wizard(); }
      if (k === 'liquidate') return TC.confirm('Liquider ?', 'L\'entreprise sera fermée. Tu récupères la trésorerie restante (boni). Ta monnaie tombe à zéro.', 'Liquider', 'btn-danger').then(ok => ok && done(C.act('liquidate'), '🏢 Entreprise liquidée'));
      done(C.act(k, k === 'token' ? { name: v('ck-name'), sym: v('ck-sym') } : k === 'inject' || k === 'div' ? v('cd-amt') : a.dataset.arg), k === 'token' ? '🪙 Ta monnaie est lancée !' : '');
    };
    el.onchange = e => { if (e.target.dataset.ac === 'rc') done(C.act('rc')); };
    draw();
  };

  C.market = async function () {
    const md = shell('🌍 Entreprises des joueurs'), el = md.el, b = () => el.querySelector('.corp-body');
    b().innerHTML = '<p class="muted">Chargement…</p>';
    let rows = []; try { rows = await C.board(); } catch (e) { b().innerHTML = '<p class="muted">Impossible de charger pour l\'instant.</p>'; return; }
    C.refreshHold(); const friends = new Set(((net() && net().friends) || []).map(f => f.uid)), me = net() && net().user && net().user.uid;
    const H = S().corpHold || {};
    const draw = () => {
      b().innerHTML = (Object.keys(H).length ? `<h4>🪙 Mes jetons</h4>${Object.entries(H).map(([uid, h]) => `<div class="corp-co"><div><b>${esc(h.name)} · ${esc(h.sym)}</b><small>${esc(h.co)} · ${h.qty} jetons · ${fmt.eur(h.qty * h.px * 0.97)} (acheté ${fmt.eur(h.cost)})</small></div><button class="btn btn-sm" data-sell="${esc(uid)}">Vendre</button></div>`).join('')}` : '')
        + `<h4>Classement par valeur</h4>` + (rows.length ? rows.map(r => { const c = r.co, t = c.tok, ok = t && c.st === 'actif' && friends.has(r.uid);
          return `<div class="corp-co"><div><b>${c.e} ${esc(c.n)}</b><small>${esc(r.pseudo || '?')} · ${C.FORM[c.f] ? C.FORM[c.f].n : ''} · valeur ${fmt.eur(c.v, true)}${c.st === 'liquide' ? ' · 💀 liquidée' : ''}${t ? ` · 🪙 ${esc(t.y)} ${pxf(t.px)}` : ''}</small></div>${t && c.st === 'actif' && r.uid !== me ? (ok ? `<button class="btn btn-gold btn-sm" data-inv="${esc(r.uid)}">Investir</button>` : '<small class="muted">Amis seulement</small>') : ''}</div>`; }).join('') : '<p class="muted">Aucune entreprise pour l\'instant. Sois le premier !</p>');
    };
    el.onclick = async e => {
      if (e.target === el || e.target.closest('.modal-x') || e.target.closest('[data-close]')) return md.close();
      const s = e.target.closest('[data-sell]'); if (s) { const r = C.sell(s.dataset.sell); if (r.ok) { TC.sound('cash'); TC.toast(`🪙 Vendu : +${fmt.eur(r.v)}`, 'ok'); if (TC.App && TC.App.after) TC.App.after(); } draw(); return; }
      const i = e.target.closest('[data-inv]'); if (i) {
        const f = rows.find(r => r.uid === i.dataset.inv), t = f.co.tok;
        const md2 = TC.modal(`<h2>🪙 Investir dans ${esc(f.co.n)}</h2><div class="modal-body"><p>${esc(t.n)} (${esc(t.y)}) · prix <b>${pxf(t.px)}</b>. L'argent va directement à ${esc(f.pseudo)}. Frais de courtage 1 %.</p>${inp('iv-amt', 'Montant à investir')}<p class="err" id="iv-err"></p><small class="muted">Ton cash : ${fmt.eur(S().cash)}</small></div><div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="iv-go">Investir</button></div>`);
        md2.el.querySelector('#iv-go').onclick = async () => { try { const q = await C.buy(f, md2.el.querySelector('#iv-amt').value); md2.close(); TC.sound('kaching'); TC.toast(`🪙 ${q} ${t.y} achetés`, 'ok'); if (TC.App && TC.App.after) TC.App.after(); C.market(); } catch (x) { md2.el.querySelector('#iv-err').textContent = x.userMsg || x.message; } };
      }
    };
    draw();
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-corp]'); if (!b) return; const k = b.dataset.corp; if (k === 'new') C.wizard(); else if (k === 'dash') C.dash(); else if (k === 'market') C.market(); });
})();

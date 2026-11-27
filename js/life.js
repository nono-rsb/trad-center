/* Trad Center — « Ma vie » : besoins du personnage (faim, énergie, hygiène) et métier rémunéré.
 * Tout vit dans state.life = { at, hunger, energy, hygiene, sleep: { until }, job: { id, start, end, pay, min }, hrs: { métier: heures }, day: { d, min }, warn }.
 * Les besoins baissent en temps réel (même app fermée, 12 h au plus), se remplissent en mangeant, dormant, se douchant.
 * Un métier = des services de 15 min à 2 h payés à la fin (salaire brut, cotisations 22 %). Aucune pénalité d'argent : un personnage épuisé
 * ou affamé ne peut simplement plus travailler, et touche moins s'il est mal en point. */
(function () {
  const L = TC.Life = {};
  const G = TC.Game, fmt = TC.fmt, esc = TC.esc, S = () => G.state;
  const HOUR = 3600000, MIN = 60000, DAY = 86400000;
  const r2 = v => Math.round(v * 100) / 100, clamp = v => Math.max(0, Math.min(100, v));
  const dlog = (eur, asset) => { S().log.unshift({ t: Date.now(), kind: 'life', eur: r2(eur), asset }); if (S().log.length > 300) S().log.length = 300; };
  const life = () => S().life || (S().life = { at: Date.now(), hunger: 85, energy: 90, hygiene: 85, sleep: null, job: null, hrs: {}, day: { d: '', min: 0 }, warn: 0 });

  L.NEEDS = { hunger: { e: '🍽️', n: 'Faim', c: '#ffb454' }, energy: { e: '⚡', n: 'Énergie', c: '#7cc4ff' }, hygiene: { e: '🚿', n: 'Hygiène', c: '#7be0c3' } };
  // variation par heure : au repos, au travail, en dormant
  const RATE = {
    idle: { hunger: -5, energy: -3, hygiene: -3 },
    work: { hunger: -7, energy: -9, hygiene: -5 },
    sleep: { hunger: -2, energy: 14, hygiene: -1 },
  };
  L.MAX_CATCHUP = 12 * HOUR;
  L.DAY_MAX = 480; // minutes de travail par jour
  L.CHARGES = 0.22;

  L.JOBS = [
    { id: 'livreur', e: '🛵', n: 'Livreur de repas', lvl: 1, min: 15, pay: 24 },
    { id: 'caissier', e: '🛒', n: 'Caissier', lvl: 3, min: 30, pay: 62 },
    { id: 'serveur', e: '🍽️', n: 'Serveur', lvl: 5, min: 30, pay: 80 },
    { id: 'chauffeur', e: '🚕', n: 'Chauffeur VTC', lvl: 8, min: 45, pay: 140 },
    { id: 'dev', e: '💻', n: 'Développeur', lvl: 12, min: 60, pay: 260 },
    { id: 'banquier', e: '🏦', n: 'Banquier', lvl: 18, min: 60, pay: 420 },
    { id: 'avocat', e: '⚖️', n: 'Avocat', lvl: 25, min: 90, pay: 900 },
    { id: 'chirurgien', e: '🩺', n: 'Chirurgien', lvl: 35, min: 120, pay: 2200 },
  ];
  L.job = id => L.JOBS.find(j => j.id === id);
  L.GRADES = [{ h: 0, n: 'Débutant', k: 1 }, { h: 5, n: 'Confirmé', k: 1.15 }, { h: 20, n: 'Senior', k: 1.35 }, { h: 60, n: 'Responsable', k: 1.6 }];
  L.grade = id => { const h = life().hrs[id] || 0; let g = L.GRADES[0]; L.GRADES.forEach(x => { if (h >= x.h) g = x; }); return g; };
  L.level = () => (TC.Progress && TC.Progress.level()) || 1;

  // nourriture, soins : { e, n, cost, hunger, energy, hygiene }
  L.SHOP = [
    { id: 'snack', e: '🥐', n: 'Viennoiserie', cost: 2.5, hunger: 18 },
    { id: 'coffee', e: '☕', n: 'Café', cost: 2, energy: 12, hunger: 2 },
    { id: 'meal', e: '🍔', n: 'Repas', cost: 12, hunger: 50, energy: 4 },
    { id: 'resto', e: '🍽️', n: 'Restaurant', cost: 38, hunger: 90, energy: 8 },
    { id: 'shower', e: '🚿', n: 'Douche', cost: 1.5, hygiene: 70 },
    { id: 'spa', e: '🛁', n: 'Bain & soins', cost: 30, hygiene: 100, energy: 12 },
  ];

  /* ---------- Simulation des besoins ---------- */
  const mode = (l, t) => (l.job && t < l.job.end) ? 'work' : (l.sleep && t < l.sleep.until) ? 'sleep' : 'idle';
  function advance(l, from, to) {
    let t = from, guard = 0;
    while (t < to && guard++ < 6) {
      const m = mode(l, t); let next = to;
      if (m === 'work') next = Math.min(next, l.job.end); else if (m === 'sleep') next = Math.min(next, l.sleep.until);
      else { if (l.job && l.job.end > t && l.job.end < next) next = l.job.end; if (l.sleep && l.sleep.until > t && l.sleep.until < next) next = l.sleep.until; }
      if (next <= t) next = to;
      const h = (next - t) / HOUR, r = RATE[m];
      for (const k in r) l[k] = clamp(l[k] + r[k] * h * (k === 'energy' && m === 'sleep' && !L.hasHome() ? 0.7 : 1));
      t = next;
    }
  }
  L.hasHome = () => S().owned.some(o => TC.shopById[o.item] && TC.shopById[o.item].type === 'estate');

  L.tick = function () {
    if (!G.state || !S().owned) return;
    const l = life(), now = Date.now(); let from = l.at || now;
    if (now - from > L.MAX_CATCHUP) from = now - L.MAX_CATCHUP;
    if (now > from) advance(l, from, now);
    l.at = now;
    // fin de sommeil
    if (l.sleep && now >= l.sleep.until) { l.sleep = null; TC.toast('😴 Tu te réveilles reposé(e).', 'info', 4000); }
    // fin de service : paie
    if (l.job && now >= l.job.end) payJob(l);
    // alertes
    if (now - (l.warn || 0) > 30 * MIN) {
      const low = Object.keys(L.NEEDS).filter(k => l[k] < 15)[0];
      if (low) { l.warn = now; TC.toast(`${L.NEEDS[low].e} <b>${L.NEEDS[low].n}</b> au plus bas ! Ouvre « Ma vie » pour t'en occuper.`, 'bad', 6000); }
    }
    G.save();
  };

  /* ---------- Services ---------- */
  L.mood = () => { const l = life(), m = Math.min(l.hunger, l.energy, l.hygiene); return m >= 70 ? { k: 1.1, t: '😄 En forme (+10 % de salaire)' } : m >= 20 ? { k: 1, t: '🙂 Ça va' } : { k: 0.7, t: '😵 À bout (−30 % de salaire)' }; };
  L.canWork = function (j) {
    const l = life(), now = Date.now(); L.tick();
    if (l.job && now < l.job.end) return { ok: false, msg: 'Tu es déjà en service.' };
    if (l.sleep && now < l.sleep.until) return { ok: false, msg: 'Tu dors. Réveille-toi d\'abord.' };
    if (L.level() < j.lvl) return { ok: false, msg: `Il faut le niveau ${j.lvl}.` };
    if (l.energy < 15) return { ok: false, msg: '⚡ Trop fatigué : dors ou bois un café.' };
    if (l.hunger < 10) return { ok: false, msg: '🍽️ Trop faim pour travailler : mange quelque chose.' };
    if (l.hygiene < 10) return { ok: false, msg: '🚿 Va te laver avant de travailler.' };
    const d = new Date().toISOString().slice(0, 10); if (l.day.d !== d) l.day = { d, min: 0 };
    if (l.day.min + j.min > L.DAY_MAX) return { ok: false, msg: 'Tu as assez travaillé aujourd\'hui (8 h max par jour).' };
    return { ok: true };
  };
  L.pay = id => { const j = L.job(id); return r2(j.pay * L.grade(id).k); };
  L.startJob = function (id) {
    const j = L.job(id), c = L.canWork(j); if (!c.ok) return c;
    const l = life(), now = Date.now(), d = new Date().toISOString().slice(0, 10);
    l.day = { d, min: (l.day.d === d ? l.day.min : 0) + j.min };
    l.job = { id, start: now, end: now + j.min * MIN, min: j.min };
    G.save(true); return { ok: true };
  };
  function payJob(l) {
    const jb = l.job, j = jb && L.job(jb.id); l.job = null; if (!j) return;
    const m = Math.min(l.hunger, l.energy, l.hygiene) >= 70 ? 1.1 : Math.min(l.hunger, l.energy, l.hygiene) >= 20 ? 1 : 0.7;
    const brut = r2(L.pay(j.id) * m), net = r2(brut * (1 - L.CHARGES));
    l.hrs[j.id] = r2((l.hrs[j.id] || 0) + j.min / 60);
    S().cash += net; dlog(net, `${j.e} Salaire ${j.n} (brut ${fmt.eur(brut)})`);
    if (TC.Progress) TC.Progress.xp(Math.max(3, Math.round(j.min / 3)));
    TC.sound && TC.sound('cash');
    TC.toast(`${j.e} Service terminé : <b>+${fmt.eur(net)}</b> net <small>(brut ${fmt.eur(brut)}, cotisations ${Math.round(L.CHARGES * 100)} %)</small>`, 'ok', 7000);
    const g = L.grade(j.id); if (g.h && l.hrs[j.id] - j.min / 60 < g.h) TC.toast(`🎖️ Promotion : <b>${g.n}</b> (salaire ×${g.k})`, 'ach', 6000);
  }
  L.stopJob = function () { const l = life(); if (!l.job) return { ok: false, msg: 'Pas de service en cours.' }; l.job = null; G.save(true); return { ok: true }; };

  L.buy = function (id) {
    const it = L.SHOP.find(x => x.id === id), l = life(); L.tick();
    if (!it) return { ok: false, msg: 'Article inconnu.' };
    if (l.sleep && Date.now() < l.sleep.until) return { ok: false, msg: 'Tu dors.' };
    if (S().cash < it.cost) return { ok: false, msg: `Il faut ${fmt.eur(it.cost)}.` };
    if (['hunger', 'energy', 'hygiene'].every(k => !it[k] || l[k] >= 99.5)) return { ok: false, msg: 'Tu n\'en as pas besoin.' };
    S().cash -= it.cost; ['hunger', 'energy', 'hygiene'].forEach(k => { if (it[k]) l[k] = clamp(l[k] + it[k]); });
    dlog(it.cost, `${it.e} ${it.n}`); G.save(true); return { ok: true };
  };
  L.sleep = function (hours) {
    const l = life(), now = Date.now(); L.tick();
    if (l.job && now < l.job.end) return { ok: false, msg: 'Tu es en service.' };
    if (l.sleep && now < l.sleep.until) return { ok: false, msg: 'Tu dors déjà.' };
    if (l.energy > 92) return { ok: false, msg: 'Tu n\'as pas sommeil.' };
    l.sleep = { until: now + hours * HOUR }; G.save(true); return { ok: true };
  };
  L.wake = function () { const l = life(); if (l.sleep) { L.tick(); l.sleep = null; G.save(true); } return { ok: true }; };

  /* ---------- Écrans ---------- */
  const bar = k => { const v = Math.round(life()[k]), N = L.NEEDS[k]; return `<div class="life-row"><span>${N.e} ${N.n}</span><div class="life-bar"><i style="width:${v}%;background:${v < 20 ? '#ff6b6b' : N.c}"></i></div><b>${v}</b></div>`; };
  const state = () => {
    const l = life(), now = Date.now();
    if (l.sleep && now < l.sleep.until) return `😴 Tu dors (réveil ${fmt.dur(l.sleep.until - now)})`;
    if (l.job && now < l.job.end) { const j = L.job(l.job.id); return `${j.e} En service : ${j.n} (${fmt.dur(l.job.end - now)})`; }
    return L.mood().t;
  };
  L.panel = function () {
    if (!S().owned) return '';
    L.tick();
    return `<div class="panel life-panel"><h3>🧍 Ma vie</h3>${bar('hunger')}${bar('energy')}${bar('hygiene')}<p class="hint">${state()}</p>
      <button class="btn btn-gold btn-sm" data-life="jobs">💼 Métier</button> <button class="btn btn-sm" data-life="needs">🍽️ Besoins</button></div>`;
  };
  L.open = function (tab) {
    tab = tab || 'needs';
    const tabs = [['needs', '🍽️ Besoins'], ['jobs', '💼 Métier']];
    const body = () => {
      const l = life(), now = Date.now(), asleep = l.sleep && now < l.sleep.until;
      if (tab === 'needs') return `<div class="fr-card">${bar('hunger')}${bar('energy')}${bar('hygiene')}<p class="hint">${state()}</p></div>
        <div class="fr-card"><h4>🛒 Manger, boire, se laver</h4><div class="life-shop">${L.SHOP.map(x => `<button class="btn btn-sm" data-lbuy="${x.id}" ${asleep ? 'disabled' : ''}>${x.e} ${x.n}<small>${fmt.eur(x.cost)}</small></button>`).join('')}</div></div>
        <div class="fr-card"><h4>🛏️ Dormir</h4>${asleep ? `<p>😴 Tu dors encore ${fmt.dur(l.sleep.until - now)}.</p><button class="btn btn-sm" data-lwake>☀️ Se réveiller</button>`
          : `<p class="hint">${L.hasHome() ? '🏠 Tu dors chez toi : repos complet.' : '🛋️ Sans logement à toi, tu dors mal (−30 % de récupération). Achète un bien immobilier !'}</p><button class="btn btn-sm" data-lsleep="2">Sieste 2 h</button> <button class="btn btn-sm" data-lsleep="6">6 h</button> <button class="btn btn-sm" data-lsleep="8">Nuit 8 h</button>`}</div>
        <p class="hint">Les besoins baissent même quand le jeu est fermé (12 h au plus). Aucun argent n'est perdu : un personnage à bout travaille juste moins bien, ou plus du tout.</p><p class="err" id="life-err"></p>`;
      const cur = l.job && now < l.job.end ? l.job : null, lv = L.level();
      const d = new Date().toISOString().slice(0, 10), used = l.day.d === d ? l.day.min : 0;
      return `${cur ? (() => { const j = L.job(cur.id); return `<div class="fr-card"><b>${j.e} ${j.n} en cours</b><div class="life-bar big"><i style="width:${Math.round((now - cur.start) / (cur.end - cur.start) * 100)}%;background:#9ad66b"></i></div><p class="hint">Fin du service dans ${fmt.dur(cur.end - now)} · salaire versé automatiquement, même si tu fermes le jeu.</p><button class="btn btn-sm btn-ghost" data-lstop>Abandonner (pas de paie)</button></div>`; })() : ''}
        <p class="hint">Aujourd'hui : <b>${Math.floor(used / 60)} h ${used % 60} min</b> travaillées sur 8 h max · ${L.mood().t}</p>` + L.JOBS.map(j => {
          const g = L.grade(j.id), locked = lv < j.lvl, h = l.hrs[j.id] || 0, nx = L.GRADES.find(x => x.h > h);
          return `<div class="fr-card ${locked ? 'life-lock' : ''}"><b>${j.e} ${j.n}</b> <small>${g.n}</small><p class="hint">Service de ${j.min >= 60 ? (j.min / 60) + ' h' : j.min + ' min'} · <b>${fmt.eur(L.pay(j.id))}</b> brut (${fmt.eur(L.pay(j.id) * (1 - L.CHARGES))} net)${nx ? ` · prochain grade dans ${r2(nx.h - h)} h de service` : ' · grade maximal'}</p>
            ${locked ? `<p class="muted">🔒 Niveau ${j.lvl} requis (tu es niveau ${lv})</p>` : `<button class="btn btn-gold btn-sm" data-lwork="${j.id}" ${cur ? 'disabled' : ''}>▶ Prendre un service</button>`}</div>`;
        }).join('') + '<p class="err" id="life-err"></p>';
    };
    const md = TC.modal(`<h2>🧍 Ma vie</h2><div class="modal-body"><div class="fr-tabs"></div><div class="fr-body"></div></div><div class="modal-actions"><button class="btn btn-ghost" data-close>Fermer</button></div>`, { cls: 'wide' });
    const el = md.el, draw = () => {
      el.querySelector('.fr-tabs').innerHTML = tabs.map(([k, n]) => `<button class="btn btn-sm ${k === tab ? 'btn-gold' : ''}" data-ltab="${k}">${n}</button>`).join('');
      el.querySelector('.fr-body').innerHTML = body();
    };
    const done = (r, ok) => { if (!r.ok) { const e = el.querySelector('#life-err'); if (e) e.textContent = r.msg; return TC.toast(r.msg, 'bad'); } if (ok) TC.toast(ok, 'ok'); if (TC.App && TC.App.after) TC.App.after(); draw(); };
    el.onclick = e => {
      if (e.target === el || e.target.closest('.modal-x') || e.target.closest('[data-close]')) return md.close();
      const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
      if (d.ltab) { tab = d.ltab; draw(); }
      else if (d.lbuy) done(L.buy(d.lbuy));
      else if (d.lsleep) done(L.sleep(+d.lsleep), '😴 Bonne nuit !');
      else if (d.lwake !== undefined) done(L.wake(), '☀️ Réveillé(e)');
      else if (d.lwork) done(L.startJob(d.lwork), '▶ Service commencé');
      else if (d.lstop !== undefined) done(L.stopJob());
    };
    const iv = setInterval(() => { if (!document.body.contains(el)) return clearInterval(iv); L.tick(); const l = life(), n = Date.now(); if (((l.job && n < l.job.end) || (l.sleep && n < l.sleep.until)) && !el.querySelector('#life-err').textContent) draw(); }, 1000);
    draw();
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-life]'); if (b) L.open(b.dataset.life); });

  setInterval(L.tick, 60000); setTimeout(L.tick, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) L.tick(); });
})();

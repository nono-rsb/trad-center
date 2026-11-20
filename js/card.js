/* Trad Center — carte bancaire 3D (en haut du Portefeuille)
 * Glisser pour la faire tourner dans tous les sens, toucher pour la retourner.
 * Son niveau suit le patrimoine : Classic, Silver (10 k€), Or (100 k€), Platine (1 M€), Diamond (10 M€), GOAT (100 M€).
 * Elle vit hors de l'onglet (qui se redessine souvent) pour ne pas être interrompue pendant qu'on la manipule.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const K = TC.Card = {};
  K.TIERS = [
    { id: 'classic', min: 0, name: 'Classic', icon: '💳' },
    { id: 'silver', min: 1e4, name: 'Silver', icon: '🥈' },
    { id: 'gold', min: 1e5, name: 'Or', icon: '🥇' },
    { id: 'platinum', min: 1e6, name: 'Platine', icon: '💠' },
    { id: 'diamond', min: 1e7, name: 'Diamond', icon: '💎' },
    { id: 'goat', min: 1e8, name: 'GOAT', icon: '🐐' },
  ];
  K.tier = nw => { let t = K.TIERS[0]; K.TIERS.forEach(x => { if (nw >= x.min) t = x; }); return t; };
  const next = t => K.TIERS[K.TIERS.indexOf(t) + 1] || null;
  function number() { // numéro de carte stable propre au joueur (fictif)
    const seed = (N && N.user && N.user.uid) || String(S().created || 1);
    let h = 7; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const d = String(h).padStart(10, '7') + String(h * 13 >>> 0).padStart(6, '3');
    return '4' + d.slice(1, 4) + ' ' + d.slice(4, 8) + ' ' + d.slice(8, 12) + ' ' + d.slice(12, 16);
  }
  const holder = () => ((N && N.profile && N.profile.pseudo) || 'JOUEUR INVITÉ').toUpperCase();
  const since = () => { const d = new Date(S().created || Date.now()); return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear() + 5).slice(2); };

  let el = null, rx = -8, ry = 14, drag = null, last = null;
  /* ---------- La carte suit les mouvements du téléphone (gyroscope) ---------- */
  const tilt = { x: 0, y: 0, apply: null }; let flipT = 0;
  let base = null, tgt = { x: 0, y: 0 }, raf = 0;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  function orient(e) {
    if (e.beta == null || e.gamma == null || calm.matches) return;
    const b = e.beta, g = e.gamma;
    base = base ? { b: base.b * 0.985 + b * 0.015, g: base.g * 0.985 + g * 0.015 } : { b, g }; // position « neutre » qui suit lentement la façon de tenir le téléphone
    const cl = v => Math.max(-28, Math.min(28, v));
    tgt = { x: cl(-(b - base.b) * 0.9), y: cl((g - base.g) * 0.9) };
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step() {
    raf = 0;
    tilt.x += (tgt.x - tilt.x) * 0.25; tilt.y += (tgt.y - tilt.y) * 0.25;
    if (tilt.apply) tilt.apply();
    if (Math.abs(tgt.x - tilt.x) + Math.abs(tgt.y - tilt.y) > 0.05) raf = requestAnimationFrame(step);
  }
  K.motion = async function () { // iPhone : autorisation à demander pendant un toucher
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || K.motionOn) return;
    K.motionOn = true; // l'écoute est déjà en place ; sans autorisation, aucun événement n'arrive : sans risque
    try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission(); } catch (e) { }
  };
  window.addEventListener('deviceorientation', orient); // Android : marche souvent sans rien demander
  { const once = () => { document.removeEventListener('touchend', once); document.removeEventListener('click', once); K.motion(); }; document.addEventListener('touchend', once, { passive: true }); document.addEventListener('click', once); }
  const snap = v => Math.round((v - 14) / 180) * 180 + 14; // face avant ou arrière, légèrement inclinée
  /* ---------- Habillages « Briques » : créatures en briques (dessins originaux), plots, reflet holographique ----------
   * Inspiré de l'Expo Briques d'Alès (9 et 10 janvier) : des sculptures en briques, vues de face, symétriques.
   * Chaque créature est une grille de « briques » (une lettre = une couleur), dessinée en SVG avec un plot sur chaque brique. */
  const mirror = half => half.map(r => r + r.slice(0, -1).split('').reverse().join('')); // 7 colonnes -> 13, symétrique
  const ART = {
    orange: { // petit dino à crêtes
      pal: { o: '#ff8a1f', y: '#ffd23f', b: '#ffe3b0', w: '#ffffff', k: '#1b1b1b', r: '#ff5d7a' },
      rows: mirror(['...y..y', '...y..y', '..ooooo', '.oooooo', '.ookooo', '.ookooo', '.oooooo', '.oorrrr', '.oowrwr', '..orrrr', '..ooooo', '.oobbbb', '.oobbbb', '.oobbbb', '..oo...']),
    },
    blue: { // orque ronde
      pal: { n: '#2f9bff', a: '#1b5fc2', b: '#ffffff', w: '#ffffff', k: '#1b1b1b', r: '#ff7a9a' },
      rows: mirror(['.....nn', '...nnnn', '..nnnnn', '.nnnnnn', '.nnknnn', '.nnknnn', '.nnnnnn', '.nnnnrr', '.nnnnnn', '..nbbbb', '.nnbbbb', 'annbbbb', 'annbbbb', '.nnbbbb', '..nnn..']),
    },
    yellow: { // poussin
      pal: { y: '#ffd93d', g: '#f2a500', o: '#ff7a1a', w: '#ffffff', k: '#1b1b1b', p: '#ff7a9a' },
      rows: mirror(['....y.y', '....yyy', '..yyyyy', '.yyyyyy', '.yykyyy', '.yykyyy', '.yyyyyy', '.pyyooo', '.yyyyoo', '..yyyyy', '.yyyyyy', 'gyyyyyy', 'gyyyyyy', '.gyyyyy', '..oo...']),
    },
  };
  function brickSvg(a) { // une brique = un carré de 10 avec un plot en relief ; l'ensemble donne un effet « sculpture »
    const S = 10, h = a.rows.length, w = a.rows[0].length; let out = '';
    a.rows.forEach((r, y) => r.split('').forEach((c, x) => {
      const col = a.pal[c]; if (!col) return;
      const X = x * S, Y = y * S;
      out += `<rect x="${X}" y="${Y}" width="${S}" height="${S}" fill="${col}" stroke="rgba(0,0,0,.22)" stroke-width=".7"/>` +
        `<rect x="${X + .35}" y="${Y + S - 2}" width="${S - .7}" height="1.65" fill="rgba(0,0,0,.2)"/>` +
        `<circle cx="${X + S / 2}" cy="${Y + S / 2 - .3}" r="2.7" fill="rgba(255,255,255,.3)" stroke="rgba(0,0,0,.2)" stroke-width=".6"/>` +
        `<circle cx="${X + S / 2 - .8}" cy="${Y + S / 2 - 1.2}" r=".9" fill="rgba(255,255,255,.6)"/>`;
    }));
    return `<svg viewBox="0 0 ${w * S} ${h * S}" shape-rendering="geometricPrecision" aria-hidden="true">${out}</svg>`;
  }

  /* ---------- Choix de l'habillage de la carte + pub de l'Expo Briques ---------- */
  K.SKINS = [
    { id: '', name: 'Classique', sub: 'Selon ton niveau' },
    { id: 'orange', name: 'Briques Orange', sub: 'Le petit dino' },
    { id: 'blue', name: 'Briques Bleu', sub: "L'orque" },
    { id: 'yellow', name: 'Briques Jaune', sub: 'Le poussin' },
    { id: 'affiche', name: "Affiche de l'expo", sub: 'Les vraies sculptures' },
  ];
  K.skin = () => { const s = S().cardSkin; return (ART[s] || s === 'affiche') ? s : ''; };
  K.setSkin = function (id) {
    S().cardSkin = (ART[id] || id === 'affiche') ? id : ''; G.save(true);
    document.querySelectorAll('.cc').forEach(c => skinCard(c)); // toutes les cartes visibles (Portefeuille, Trad Banque…)
    if (id) { TC.sound('ach'); TC.confetti(90); }
  };
  function skinCard(card) {
    const sk = K.skin(), key = sk || '-';
    if (card.dataset.skin === key) return;
    card.dataset.skin = key;
    ['orange', 'blue', 'yellow'].forEach(x => card.classList.toggle('sk-' + x, x === sk));
    card.classList.toggle('sk-brick', !!ART[sk]); card.classList.toggle('sk-poster', sk === 'affiche');
    const art = card.querySelector('.cc-art'); if (!art) return;
    art.innerHTML = ART[sk] ? brickSvg(ART[sk]) + '<i>✦</i><i>✦</i><i>✦</i><i>✦</i>' : '';
    if (ART[sk]) { art.classList.remove('pop'); void art.offsetWidth; art.classList.add('pop'); } // les briques « s'assemblent »
  }
  K.skinPicker = function () {
    const cur = K.skin();
    const md = TC.modal(`<div class="skin-pick"><h2>🎨 Style de ma carte</h2><p class="muted">Gratuit pour tout le monde : la carte garde ton niveau (${esc(K.tier(G.netWorth()).name)}), seul son habillage change.</p>
      <div class="skin-grid">${K.SKINS.map(s => `<button class="skin-opt ${s.id === cur ? 'on' : ''}" data-skin="${s.id}">
        <div class="cc-mini ${s.id === 'affiche' ? 'sk-poster' : s.id ? 'sk-brick sk-' + s.id : ''}"><div class="cc-art">${ART[s.id] ? brickSvg(ART[s.id]) : s.id ? '' : '<span class="cc-mini-tc">TC</span>'}</div>${s.id ? '<div class="cc-foil"></div>' : ''}</div>
        <b>${esc(s.name)}</b><small>${esc(s.sub)}</small></button>`).join('')}</div>
      <div class="modal-actions"><button class="btn" data-close>Fermer</button></div></div>`, { cls: 'wide' });
    md.el.querySelectorAll('[data-skin]').forEach(b => { b.onclick = () => { K.setSkin(b.dataset.skin); md.el.querySelectorAll('[data-skin]').forEach(x => x.classList.toggle('on', x === b)); }; });
  };

  // Pub : Expo Briques d'Alès (informations de l'affiche de l'événement)
  K.EXPO = { name: "L'Expo Briques", when: '9 & 10 janvier', place: 'Alès', venue: 'Espace Alès Cazot', hours: '10h – 18h', price: 'Entrée 4 €', end: new Date(2027, 0, 11).getTime() };
  K.promoOn = () => Date.now() < K.EXPO.end;
  K.expo = function () {
    const E = K.EXPO;
    const md = TC.modal(`<div class="expo"><span class="expo-ad">📣 Publicité</span>
      <img class="expo-poster" src="icons/expo-poster.jpg" alt="Affiche de ${esc(E.name)} à ${esc(E.place)}, les 9 et 10 janvier">
      <p class="expo-info"><b>${esc(E.when)}</b> · ${esc(E.place)}<br>${esc(E.hours)} · ${esc(E.venue)} · <b>${esc(E.price)}</b></p>
      <button class="btn btn-gold btn-xl" id="expo-skin">🎨 Habiller ma carte aux couleurs de l'expo</button>
      <small class="expo-note">Affiche de l'événement. Vérifie les infos auprès des organisateurs avant d'y aller.</small>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Fermer</button></div></div>`, { cls: 'expo-modal' });
    md.el.querySelector('#expo-skin').onclick = () => { md.close(); K.skinPicker(); };
  };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-expo]')) return K.expo();
    if (e.target.closest('[data-skinpick]')) return K.skinPicker();
  });

  function build() {
    const zone = document.createElement('div'); zone.id = 'card-zone';
    zone.innerHTML = `<div class="cc-stage"><div class="cc" id="cc">
        <div class="cc-face cc-front"><div class="cc-shine"></div><div class="cc-art"></div><div class="cc-foil"></div>
          <div class="cc-top"><b class="cc-brand">TRAD<span>CENTER</span></b><span class="cc-tier" id="cc-tier"></span></div>
          <div class="cc-chip"></div><span class="cc-nfc">)))</span>
          <div class="cc-num" id="cc-num"></div>
          <div class="cc-bot"><div><small>TITULAIRE</small><b id="cc-holder"></b></div><div><small>EXPIRE</small><b id="cc-exp"></b></div><div class="cc-logo">TC</div></div>
        </div>
        <div class="cc-face cc-back"><div class="cc-strip"></div>
          <div class="cc-sign"><span id="cc-sign"></span><b>***</b></div>
          <div class="cc-info"><div><small>Cash disponible</small><b id="cc-cash"></b></div><div><small>Patrimoine</small><b id="cc-nw"></b></div></div>
          <div class="cc-next" id="cc-next"></div>
        </div></div></div>
      <p class="cc-hint">☝️ Glisse pour la faire tourner · touche pour la retourner</p>
      <div class="cc-tools"><button class="btn btn-sm" data-skinpick>🎨 Style de la carte</button></div>${K.promoOn() ? `<button class="cc-promo" data-expo><img class="cc-promo-img" src="icons/expo-poster.jpg" alt=""> <span><b>Expo Briques</b> · 9 &amp; 10 janvier · Alès</span> <em>Voir →</em></button>` : ''}`;
    const card = zone.querySelector('#cc');
    const apply = () => { const X = rx + (drag ? 0 : tilt.x), Y = ry + (drag ? 0 : tilt.y); card.style.transform = `rotateX(${X.toFixed(2)}deg) rotateY(${Y.toFixed(2)}deg)`; card.style.setProperty('--sx', (50 + Y * 1.2) + '%'); card.style.setProperty('--sy', (50 - X * 1.5) + '%'); };
    tilt.apply = () => { if (!drag && zone.isConnected && Date.now() - flipT > 650) { card.classList.add('tilting'); apply(); } };
    card.addEventListener('pointerdown', e => { card.classList.remove('tilting'); card.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: 0 }; last = drag; card.classList.add('drag'); });
    card.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
      drag.moved += Math.abs(dx) + Math.abs(dy);
      ry += dx * 0.6; rx = Math.max(-75, Math.min(75, rx - dy * 0.6)); apply();
    });
    const end = () => {
      if (!drag) return; card.classList.remove('drag');
      if (drag.moved < 8) { ry = snap(ry) + 180; TC.sound('click'); } // toucher : retourner la carte
      else ry = snap(ry); // lâcher : elle se remet face avant ou face arrière
      rx = -8; drag = null; flipT = Date.now(); card.classList.remove('tilting'); apply();
    };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
    apply();
    return zone;
  }
  let lastTier = null;
  K.update = function () {
    if (!el) return;
    const t = fill(el), idx = K.TIERS.indexOf(t);
    if (lastTier != null && idx > lastTier) { TC.sound('kaching'); TC.confetti(220); TC.toast(`${t.icon} Nouvelle carte ${t.name} débloquée !`, 'ok', 6000); }
    lastTier = idx; S().cardTier = Math.max(S().cardTier || 0, idx);
  };
  // face avant seule, sans manipulation (paiement sans contact de Trad Banque)
  K.face = function () {
    const z = build(); fill(z);
    const st = z.querySelector('.cc-stage').cloneNode(true); // copie sans les gestes (tourner, retourner)
    const c = st.querySelector('#cc'); c.style.transform = ''; c.classList.add('cc-static');
    st.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
    return st;
  };
  function fill(el) {
    const nw = G.netWorth(), t = K.tier(nw), n = next(t);
    const card = el.querySelector('#cc');
    K.TIERS.forEach(x => card.classList.toggle('t-' + x.id, x === t));
    skinCard(card);
    el.querySelector('#cc-tier').textContent = t.icon + ' ' + t.name.toUpperCase();
    el.querySelector('#cc-num').textContent = number();
    el.querySelector('#cc-holder').textContent = holder();
    el.querySelector('#cc-sign').textContent = (N && N.profile && N.profile.pseudo) || 'Invité';
    el.querySelector('#cc-exp').textContent = since();
    el.querySelector('#cc-cash').textContent = fmt.eur(S().cash);
    el.querySelector('#cc-nw').textContent = fmt.eur(nw);
    el.querySelector('#cc-next').innerHTML = n ? `<small>Prochaine carte : ${n.icon} ${n.name} à ${fmt.eur(n.min, true)}</small><div class="cc-bar"><i style="width:${Math.min(100, Math.max(0, (nw - t.min) / (n.min - t.min) * 100)).toFixed(1)}%"></i></div>`
      : '<small>🐐 Niveau ultime atteint : tu n\'as pas fini le jeu, mais tu es le GOAT.</small>';
    return t;
  }
  // dans une autre page (appli Trad Banque) : la carte se place où on veut
  K.mountInto = function (box) { if (!el) { el = build(); lastTier = S().cardTier != null ? S().cardTier : null; } el.classList.add('show'); box.appendChild(el); K.update(); };
  function mount() {
    const pane = document.getElementById('tab-portfolio'); if (!pane) return;
    el = build(); pane.parentNode.insertBefore(el, pane);
    const acts = document.createElement('div'); acts.className = 'cc-actions';
    acts.innerHTML = '<a class="btn" href="bank.html">🏦 Ouvrir Trad Banque</a><a class="btn" href="occaz.html">🏷️ Trad Occaz</a><button class="btn btn-gold" data-bankinstall>📲 Sur l\'écran d\'accueil</button>'; el.appendChild(acts);
    lastTier = S().cardTier != null ? S().cardTier : null;
    K.update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  setInterval(() => { if (((TC.UI && TC.UI.tab === 'portfolio') || (el && el.classList.contains('show'))) && !drag) K.update(); }, 2000);
})();

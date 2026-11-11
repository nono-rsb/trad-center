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
  const snap = v => Math.round((v - 14) / 180) * 180 + 14; // face avant ou arrière, légèrement inclinée
  function build() {
    const zone = document.createElement('div'); zone.id = 'card-zone';
    zone.innerHTML = `<div class="cc-stage"><div class="cc" id="cc">
        <div class="cc-face cc-front"><div class="cc-shine"></div>
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
      <p class="cc-hint">☝️ Glisse pour la faire tourner · touche pour la retourner</p>`;
    const card = zone.querySelector('#cc');
    const apply = () => { card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; card.style.setProperty('--sx', (50 + ry * 1.2) + '%'); card.style.setProperty('--sy', (50 - rx * 1.5) + '%'); };
    card.addEventListener('pointerdown', e => { card.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: 0 }; last = drag; card.classList.add('drag'); });
    card.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
      drag.moved += Math.abs(dx) + Math.abs(dy);
      ry += dx * 0.6; rx = Math.max(-75, Math.min(75, rx - dy * 0.6)); apply();
    });
    const end = () => {
      if (!drag) return; card.classList.remove('drag');
      if (drag.moved < 8) { ry = snap(ry) + 180; TC.sound('click'); } // toucher : retourner la carte
      else ry = snap(ry); // lâcher : elle se remet face avant ou face arrière
      rx = -8; drag = null; apply();
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

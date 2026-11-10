/* Trad Center — temps de jeu
 * Compte le temps pendant lequel le jeu est ouvert ET affiché à l'écran (pas en arrière-plan).
 * Enregistré dans la partie (playMs) et publié sur le profil pour les autres joueurs.
 */
(function () {
  const G = TC.Game, S = () => G.state;
  const P = TC.Play = {};
  let last = Date.now();
  function tick() {
    const now = Date.now();
    if (!document.hidden) S().playMs = (S().playMs || 0) + Math.max(0, Math.min(now - last, 60000)); // au plus 1 min par pas (veille, etc.)
    last = now;
  }
  setInterval(tick, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { tick(); G.save(true); } else last = Date.now(); });
  window.addEventListener('pagehide', tick);
  P.ms = () => { tick(); return S().playMs || 0; };
  P.since = () => S().created || Date.now();
  P.fmt = ms => {
    const m = Math.floor((ms || 0) / 60000);
    if (m < 1) return 'moins d\'1 min';
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' h ' + String(m % 60).padStart(2, '0');
    return Math.floor(h / 24) + ' j ' + (h % 24) + ' h';
  };
  P.date = t => t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
})();

/* Trad Center — icône de l'écran d'accueil au choix (avantage des membres vérifiés ✓).
 * Chaque icône a son manifeste (manifest-icon-<nom>.webmanifest, même appli : même start_url) et son image iPhone.
 * Le choix est gardé sur l'appareil ; un petit script dans <head> l'applique avant que le navigateur lise le manifeste.
 * Un téléphone ne laisse pas un site changer une icône déjà posée : sur iPhone il faut la reposer ;
 * sur Android, Chrome met souvent l'icône à jour tout seul en quelques jours (ou on la repose).
 */
(function () {
  const { esc } = TC;
  const IC = TC.AppIcon = {};
  const KEY = 'tradcenter.icon';
  IC.LIST = [['classique', 'Classique', 'icons/icon-192.png'], ['or', 'Or'], ['diamant', 'Diamant'], ['neon', 'Néon'], ['noir', 'Noir'], ['arcenciel', 'Arc-en-ciel'], ['rose', 'Rose'], ['emeraude', 'Émeraude'], ['feu', 'Feu'], ['bitcoin', 'Bitcoin']]
    .map(([k, n, img]) => ({ k, n, img: img || `icons/alt/${k}-192.png` }));
  IC.current = () => { try { return localStorage.getItem(KEY) || 'classique'; } catch (e) { return 'classique'; } };
  const plus = () => TC.Style && TC.Style.isPlus(TC.Style.mine());
  function apply(k) {
    const man = document.querySelector('link[rel=manifest]'), apple = document.querySelector('link[rel=apple-touch-icon]');
    if (man) man.href = k === 'classique' ? 'manifest.webmanifest' : `manifest-icon-${k}.webmanifest`;
    if (apple) apple.href = k === 'classique' ? 'icons/apple-touch-icon.png' : `icons/alt/${k}-180.png`;
  }
  IC.set = function (k) {
    if (!IC.LIST.some(x => x.k === k)) return;
    if (k !== 'classique' && !plus()) { if (TC.Style) TC.Style.plusInfo(); return; }
    try { if (k === 'classique') localStorage.removeItem(KEY); else localStorage.setItem(KEY, k); } catch (e) { }
    apply(k); IC.howTo(k);
  };
  IC.howTo = function (k) {
    const it = IC.LIST.find(x => x.k === k) || IC.LIST[0];
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), android = /Android/.test(navigator.userAgent);
    const steps = ios ? `<ol><li>Supprime l'icône Trad Center actuelle de ton écran d'accueil (appui long → Supprimer l'app). Ta partie est gardée sur ton compte.</li><li>Ouvre le jeu dans <b>Safari</b>, touche <b>Partager</b> ⬆️ puis <b>« Sur l'écran d'accueil »</b>.</li><li>La nouvelle icône ${esc(it.n)} apparaît 🎉</li></ol>`
      : android ? `<ol><li>Chrome met souvent l'icône à jour <b>tout seul en quelques jours</b>.</li><li>Pour l'avoir tout de suite : supprime l'icône actuelle (appui long → Désinstaller ; ta partie est gardée sur ton compte), puis Chrome → ⋮ → <b>« Installer l'application »</b>.</li></ol>`
      : `<p>Sur ton téléphone, reposer l'appli sur l'écran d'accueil affichera la nouvelle icône.</p>`;
    TC.modal(`<div class="center"><img class="ai-big" src="${it.img}" alt=""><h2>Icône ${esc(it.n)} choisie</h2></div>
      <div class="modal-body"><p class="hint">Un téléphone ne laisse pas un site changer une icône déjà posée sur l'écran d'accueil : il faut la reposer une fois.</p>${steps}
      <div class="modal-actions"><button class="btn btn-gold" data-close>Compris</button></div></div>`);
  };
  // onglet « 📱 Icône » de Mon style
  IC.panel = function () {
    const cur = IC.current(), ok = plus();
    return `<div class="ai-tab">${ok ? '<p class="hint">Avantage vérifié ✓ : choisis le logo de Trad Center sur ton écran d\'accueil.</p>' : '<div class="nbox">🔒 Réservé aux membres vérifiés ✓ (Trad Center+). <button class="btn btn-sm btn-plus" data-plusgo="1"><span class="vbadge">✓</span> Devenir vérifié</button></div>'}
      <div class="ai-grid">${IC.LIST.map(x => `<button class="ai-it ${cur === x.k ? 'on' : ''} ${!ok && x.k !== 'classique' ? 'lock' : ''}" data-appicon="${x.k}"><img src="${x.img}" alt="" loading="lazy"><span>${esc(x.n)}${!ok && x.k !== 'classique' ? ' 🔒' : cur === x.k ? ' ✓' : ''}</span></button>`).join('')}</div></div>`;
  };
  // plus vérifié : retour à l'icône classique
  function check() { if (IC.current() !== 'classique' && TC.Net && TC.Net.ready && TC.Net.profile && !plus()) { try { localStorage.removeItem(KEY); } catch (e) { } apply('classique'); } }
  if (TC.Net && TC.Net.on) TC.Net.on(t => { if (t === 'linked') setTimeout(check, 3000); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-appicon]'); if (b) { IC.set(b.dataset.appicon); if (document.querySelector('.ai-tab') && TC.Style && IC.current() === b.dataset.appicon && b.dataset.appicon === 'classique') TC.Style.open('icon'); } });
})();

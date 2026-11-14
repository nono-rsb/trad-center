/* Trad Center — installer Trad Banque sur l'écran d'accueil (iPhone et Android)
 * Depuis le jeu installé, la banque s'ouvre DANS le jeu (pas de bouton Partager) : on guide donc
 * l'utilisateur pour l'ouvrir dans Safari / Chrome et l'ajouter comme une appli à part.
 */
(function () {
  const BI = TC.BankInstall = {};
  const url = () => new URL('bank.html', location.href).href;
  const ios = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  BI.onBankPage = () => /bank\.html/.test(location.pathname);
  BI.installed = () => BI.onBankPage() && standalone();
  let prompt = null;
  window.addEventListener('beforeinstallprompt', e => { if (BI.onBankPage()) { e.preventDefault(); prompt = e; } });
  BI.open = async function () {
    // Android / Chrome sur la page de la banque : vraie installation en un toucher
    if (prompt) { prompt.prompt(); const r = await prompt.userChoice.catch(() => null); prompt = null; if (r && r.outcome === 'accepted') TC.toast('🏦 Trad Banque installée sur ton écran d\'accueil !', 'ok', 6000); return; }
    const inSafariOnBank = BI.onBankPage() && !standalone();
    const steps = ios()
      ? (inSafariOnBank
        ? ['Touche le bouton <b>Partager</b> <span class="bi-ic">⬆️</span> (en bas de Safari)', 'Choisis <b>Sur l\'écran d\'accueil</b> <span class="bi-ic">➕</span>', 'Touche <b>Ajouter</b> : l\'icône 🏦 Trad Banque apparaît à côté du jeu']
        : ['Touche <b>Copier le lien</b> ci-dessous', 'Ouvre <b>Safari</b> et colle le lien dans la barre d\'adresse', 'Touche <b>Partager</b> <span class="bi-ic">⬆️</span> puis <b>Sur l\'écran d\'accueil</b> <span class="bi-ic">➕</span>', 'Touche <b>Ajouter</b> : l\'icône 🏦 Trad Banque apparaît à côté du jeu'])
      : (BI.onBankPage() && !standalone()
        ? ['Touche le menu <b>⋮</b> de Chrome', 'Choisis <b>Installer l\'application</b> (ou « Ajouter à l\'écran d\'accueil »)', 'Confirme : l\'icône 🏦 Trad Banque apparaît']
        : ['Touche <b>Copier le lien</b> ci-dessous', 'Ouvre <b>Chrome</b> et colle le lien', 'Menu <b>⋮</b> → <b>Installer l\'application</b>']);
    const md = TC.modal(`<div class="center"><img src="icons/bank-180.png" alt="" class="bi-icon"><h2>Trad Banque sur ton écran d'accueil</h2>
      <p class="muted">Une appli à part, avec sa propre icône, à côté du jeu.</p></div>
      <ol class="bi-steps">${steps.map(s => `<li>${s}</li>`).join('')}</ol>
      ${inSafariOnBank ? '' : `<div class="bi-link"><input readonly value="${url()}"><button class="btn btn-gold" id="bi-copy">Copier le lien</button></div>`}
      <div class="modal-actions"><button class="btn btn-ghost" data-close>OK</button>${!BI.onBankPage() && !standalone() ? '<a class="btn" href="bank.html">Ouvrir Trad Banque</a>' : ''}</div>`);
    const c = md.el.querySelector('#bi-copy');
    if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(url()); c.textContent = '✓ Copié !'; } catch (e) { md.el.querySelector('.bi-link input').select(); document.execCommand('copy'); c.textContent = '✓ Copié !'; } };
  };
  document.addEventListener('click', e => { if (e.target.closest('[data-bankinstall]')) { e.preventDefault(); BI.open(); } });
})();

/* Trad Center — appli ordinateur (Electron) : repère l'appli (?desktop=<version>), propose la nouvelle version quand l'appli elle-même change,
 * et propose le téléchargement dans les Paramètres. Le jeu se met à jour tout seul (c'est le site) : rien à réinstaller à chaque nouveauté. */
(function () {
  const BASE = 'https://github.com/nono-rsb/trad-center/releases/download/desktop/';
  const D = TC.Desk = { API: 'https://api.github.com/repos/nono-rsb/trad-center/releases/tags/desktop', BASE };
  let code = 0;
  try { const m = /[?&]desktop=(\d+)/.exec(location.search); if (m) { code = +m[1]; localStorage.setItem('tc.desk', String(code)); } else code = +localStorage.getItem('tc.desk') || 0; } catch (e) { }
  D.code = code; D.installed = code > 0;
  if (D.installed) document.documentElement.classList.add('desktop-app');
  const ua = navigator.userAgent || '', plat = /Win/i.test(ua) ? 'win' : /Mac/i.test(ua) && !/iPhone|iPad/.test(ua) ? 'mac' : /Linux/i.test(ua) && !/Android/i.test(ua) ? 'linux' : '';
  D.os = plat;
  D.file = plat === 'win' ? 'Trad-Center-Windows.exe' : plat === 'mac' ? 'Trad-Center-Mac-arm64.dmg' : plat === 'linux' ? 'Trad-Center-Linux.AppImage' : '';
  D.canInstall = !!plat && !/Mobi/i.test(ua);
  async function check() {
    if (!D.installed) return;
    try {
      const r = await fetch(D.API, { headers: { Accept: 'application/vnd.github+json' } }); if (!r.ok) return;
      const latest = parseInt((await r.json()).name, 10); if (!(latest > D.code)) return;
      let skip = null; try { skip = localStorage.getItem('tc.desk.skip'); } catch (e) { }
      if (skip === String(latest)) return;
      const md = TC.modal(`<h2>🖥️ Nouvelle version de l'appli</h2><div class="modal-body"><p>Une nouvelle version de l'appli Trad Center pour ordinateur est disponible (version ${latest}). Le jeu, lui, est déjà à jour.</p></div>
        <div class="modal-actions"><button class="btn btn-ghost" id="desk-later">Plus tard</button><a class="btn btn-gold" href="desktop.html">⬇️ Télécharger</a></div>`);
      md.el.querySelector('#desk-later').onclick = () => { try { localStorage.setItem('tc.desk.skip', String(latest)); } catch (e) { } md.close(); };
    } catch (e) { }
  }
  setTimeout(check, 20000);
  D.settingsHtml = () => D.installed
    ? `<h4>🖥️ Appli ordinateur</h4><p class="hint">Tu utilises l'appli (version ${D.code}). <b>F11</b> : plein écran · <b>Ctrl +</b> / <b>Ctrl −</b> : zoom · <b>Ctrl 0</b> : zoom normal.</p>`
    : D.canInstall ? `<h4>🖥️ Appli ordinateur</h4><p class="hint">Le jeu en grand, en plein écran, avec la carte graphique à fond, et toujours à jour. <a class="btn btn-sm btn-gold" href="desktop.html">⬇️ Télécharger</a></p>` : '';
})();

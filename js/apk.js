/* Trad Center — appli Android : propose une nouvelle version de l'APK quand il y en a une.
 * L'appli ouvre le site avec ?apk=<numéro de version> ; on le retient, puis on compare au numéro de la release « android ».
 * Le jeu lui-même se met à jour tout seul (c'est le site) : cette fenêtre n'apparaît que si l'appli elle-même a changé. */
(function () {
  const A = TC.Apk = { URL: 'https://github.com/nono-rsb/trad-center/releases/download/android/trad-center.apk', API: 'https://api.github.com/repos/nono-rsb/trad-center/releases/tags/android' };
  let code = 0;
  try { const m = /[?&]apk=(\d+)/.exec(location.search); if (m) { code = +m[1]; localStorage.setItem('tc.apk', String(code)); } else code = +localStorage.getItem('tc.apk') || 0; } catch (e) { }
  A.code = code; A.installed = code > 0;
  async function check() {
    if (!A.installed) return;
    try {
      const r = await fetch(A.API, { headers: { Accept: 'application/vnd.github+json' } }); if (!r.ok) return;
      const j = await r.json(), latest = parseInt(j.name, 10), a = (j.assets || []).find(x => /\.apk$/i.test(x.name));
      if (!(latest > code) || !a) return;
      let skip = null; try { skip = localStorage.getItem('tc.apk.skip'); } catch (e) { }
      if (skip === String(latest)) return;
      const md = TC.modal(`<h2>📲 Nouvelle version de l'appli</h2><div class="modal-body"><p>Une nouvelle version de l'appli Android Trad Center est disponible (version ${latest}). Le jeu, lui, est déjà à jour : c'est seulement l'appli.</p>
        <p class="hint">Télécharge le fichier, ouvre-le, puis touche « Installer » : ton compte et ta partie ne changent pas.</p></div>
        <div class="modal-actions"><button class="btn btn-ghost" id="apk-later">Plus tard</button><a class="btn btn-gold" href="${a.browser_download_url}">⬇️ Télécharger</a></div>`);
      md.el.querySelector('#apk-later').onclick = () => { try { localStorage.setItem('tc.apk.skip', String(latest)); } catch (e) { } md.close(); };
    } catch (e) { }
  }
  setTimeout(check, 15000);
  // bouton dans les Paramètres
  A.settingsHtml = () => A.installed
    ? `<h4>📲 Appli Android</h4><p class="hint">Tu utilises l'appli Android (version ${A.code}). Le jeu se met à jour tout seul. <a href="android.html">Détails</a></p>`
    : `<h4>📲 Appli Android</h4><p class="hint">Installe Trad Center comme une vraie appli sur ton téléphone Android : il se met à jour tout seul. <a class="btn btn-sm btn-gold" href="android.html">Installer l'appli</a></p>`;
})();

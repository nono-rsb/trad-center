/* Trad Center — jeu en pause (maintenance) : si maintenance.json contient { "on": true }, un écran couvre le jeu avec le message.
 * Pour réouvrir le jeu : mettre "on": false (ou supprimer le fichier) et publier. Le créateur garde un bouton pour continuer.
 * En cas d'erreur réseau, on garde le dernier état connu ; sans état connu, le jeu reste ouvert. */
(function () {
  const P = TC.Pause = { on: false };
  const KEY = 'tc.pause';
  let box = null, last = null;
  const isAdmin = () => !!(TC.Net && TC.Net.user && TC.Net.user.uid === TC.ADMIN_UID);
  function show(m) {
    P.on = true; document.documentElement.classList.add('paused');
    if (!box) {
      box = document.createElement('div'); box.id = 'pause';
      box.innerHTML = '<div class="pause-card"><div class="pause-e"></div><h1></h1><p></p><div class="pause-dots"><i></i><i></i><i></i></div><button class="btn btn-sm btn-ghost" id="pause-adm">🔑 Accès créateur</button></div>';
      document.body.appendChild(box);
      box.querySelector('#pause-adm').onclick = () => { P.pending = Date.now(); hide(); };
    }
    box.querySelector('.pause-e').textContent = m.emoji || '🛠️';
    box.querySelector('h1').textContent = m.title || 'Mise à jour en cours';
    box.querySelector('p').textContent = m.text || 'Le jeu est en pause. Reviens bientôt !';
    box.hidden = false;
  }
  function hide() { P.on = false; document.documentElement.classList.remove('paused'); if (box) box.hidden = true; }
  function apply(m) {
    last = m;
    if (m && m.on && !P.bypass && !P.pending) show(m); else if (!(m && m.on)) hide();
  }
  async function check() {
    try {
      const r = await fetch('maintenance.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.status === 404) { try { localStorage.removeItem(KEY); } catch (e) { } return apply(null); }
      if (!r.ok) throw 0;
      const m = await r.json(); try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { } apply(m);
    } catch (e) { try { const m = JSON.parse(localStorage.getItem(KEY)); if (m) apply(m); } catch (x) { } }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 60000);
  // accès créateur : on laisse le temps de se connecter ; si le compte n'est pas celui du créateur, l'écran de pause revient
  try { if (localStorage.getItem('tc.pause.adm') === '1') P.bypass = true; } catch (e) { }
  setInterval(() => {
    if (!last || !last.on) return;
    const u = TC.Net && TC.Net.user;
    if (isAdmin()) { if (!P.bypass) { P.bypass = true; P.pending = 0; try { localStorage.setItem('tc.pause.adm', '1'); } catch (e) { } } if (box) box.hidden = true; return; }
    if (P.bypass && u) { P.bypass = false; try { localStorage.removeItem('tc.pause.adm'); } catch (e) { } show(last); return; }       // connecté, mais pas créateur
    if (P.pending && (u || Date.now() - P.pending > 180000)) { P.pending = 0; show(last); }                                          // autre compte ou trop long
  }, 1500);
  if (document.body) check(); else document.addEventListener('DOMContentLoaded', check);
})();

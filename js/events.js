/* Trad Center — événements programmés (happy hour, défis…), voir EVENTS.md
 * La liste vient de events.json (début / fin en heure de Paris, avec le décalage +01:00 l'hiver, +02:00 l'été).
 * Pendant un événement : bandeau en haut du jeu + effets lus par le moteur via TC.Events.mult('<effet>').
 * Effets connus : fees (multiplicateur des frais de trading, comptant et levier : 0 = offerts, 0.5 = moitié prix).
 */
(function () {
  const EV = TC.Events = { list: [] };
  const EFFECTS = { fees: [0, 1] }; // bornes de sécurité de chaque effet (une faute de frappe ne peut pas casser l'économie)
  const t = d => { const x = Date.parse(d); return isNaN(x) ? null : x; };

  EV.active = (now = Date.now()) => EV.list.filter(e => e.s <= now && now < e.e);
  EV.next = (now = Date.now(), within = 6 * 3600000) => EV.list.filter(e => e.s > now && e.s - now <= within).sort((a, b) => a.s - b.s)[0] || null;
  EV.mult = function (key) {
    let m = 1;
    for (const e of EV.active()) { const v = e.effects && e.effects[key]; if (typeof v === 'number' && isFinite(v)) m *= v; }
    const b = EFFECTS[key]; return b ? Math.min(b[1], Math.max(b[0], m)) : m;
  };

  function parse(json) {
    const arr = (json && Array.isArray(json.events)) ? json.events : [];
    return arr.map(e => ({ ...e, s: t(e.start), e: t(e.end) })).filter(e => e.id && e.s && e.e && e.e > e.s && e.title);
  }
  const hhmm = ts => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)).replace(':', ' h ');
  function left(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : m + ' min';
  }
  const esc = s => TC.esc ? TC.esc(s) : String(s);

  // Bandeau sous la barre d'objectif
  let lastActive = '';
  EV.render = function () {
    let el = document.getElementById('ev-banner');
    const now = Date.now(), a = EV.active(now)[0], n = a ? null : EV.next(now);
    if (!a && !n) { if (el) el.remove(); lastActive = ''; return; }
    if (!el) {
      el = document.createElement('button'); el.id = 'ev-banner'; el.type = 'button';
      const anchor = document.getElementById('goalbar') || document.querySelector('.topbar');
      if (!anchor || !anchor.parentNode) return;
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
      el.onclick = ev => {
        const cur = el._ev; if (!cur) return;
        if (ev.target.closest('.ev-share')) { ev.stopPropagation(); return EV.share(cur); }
        const b = document.querySelector('#tabs [data-tab="' + (cur.tab || 'markets') + '"]'); if (b) b.click();
      };
    }
    const e = a || n; el._ev = e; // l'événement affiché (le bandeau peut passer de « bientôt » à « en cours »)
    el.className = 'ev-banner' + (a ? ' on' : ' soon');
    el.innerHTML = `<span class="ev-ic">${esc(e.emoji || '🎉')}</span><span class="ev-t"><b>${esc(e.title)}</b><small>${esc(e.text || '')}</small></span>`
      + `<span class="ev-time">${a ? 'encore ' + left(e.e - now) : 'à ' + hhmm(e.s)}</span>`
      + `<span class="ev-share" role="button" aria-label="Inviter des amis à l'événement" title="Inviter des amis">📤</span>`;
    if (a && lastActive !== a.id) { // l'événement vient de commencer pendant la partie : petit signal
      if (lastActive !== '' || !sessionStorageSeen(a.id)) { if (TC.toast) TC.toast(`${esc(a.emoji || '🎉')} <b>${esc(a.title)}</b> : c'est parti jusqu'à ${hhmm(a.e)} !`, 'ok', 6000); }
      lastActive = a.id;
      if (TC.UI && TC.UI.order) try { TC.UI.order(); } catch (x) { }
    }
    if (!a && lastActive) { lastActive = ''; if (TC.UI && TC.UI.order) try { TC.UI.order(); } catch (x) { } }
  };
  // Inviter ses amis à l'événement : texte + lien de parrainage (ou lien du jeu pour un invité)
  EV.share = async function (e) {
    const N = TC.Net, now = Date.now();
    let url = location.origin + location.pathname;
    try { if (N && N.user && N.inviteLink) url = N.inviteLink(); } catch (x) { }
    const when = e.s <= now ? 'jusqu\'à ' + hhmm(e.e) : 'ce soir à ' + hhmm(e.s);
    const text = `${e.emoji || '🎉'} ${e.title} sur Trad Center, ${when} ! Viens jouer avec moi (gratuit, vrais cours de la Bourse et des cryptos) :`;
    try { if (navigator.share) { await navigator.share({ title: 'Trad Center', text, url }); return; } } catch (x) { if (x && x.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + ' ' + url); if (TC.toast) TC.toast('📋 Invitation copiée : colle-la à tes amis !', 'ok'); }
    catch (x) { if (TC.toast) TC.toast('Partage impossible sur ce navigateur', 'bad'); }
  };
  function sessionStorageSeen(id) {
    try { if (sessionStorage.getItem('tradcenter.ev') === id) return true; sessionStorage.setItem('tradcenter.ev', id); } catch (e) { }
    return false;
  }

  EV.load = async function () {
    try {
      const r = await fetch('events.json', { cache: 'no-cache' });
      if (r.ok) EV.list = parse(await r.json());
    } catch (e) { /* hors ligne : on garde la liste connue */ }
    EV.render();
  };
  EV._parse = parse; // pour les tests

  EV.load();
  setInterval(EV.render, 30000);
  setInterval(() => { if (!document.hidden) EV.load(); }, 10 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) EV.load(); });
})();

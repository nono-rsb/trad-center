/* Trad Center — offrir le badge vérifié (Trad Center+)
 * Un abonné peut : offrir 1 semaine de vérifié à 3 amis par mois d'abonnement,
 * et parrainer des amis (+100 € par mois chacun sur son propre abonnement) : ils restent vérifiés tant qu'il paie.
 * Le donneur publie dans son profil : plusGiftTo (liste) et plusGifts { uid: date de fin }.
 * Le bénéficiaire lit ces profils et affiche le badge jusqu'à la date de fin.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, ST = TC.Style, S = () => G.state;
  const PG = TC.PlusGift = { WEEK_GIFTS: 3, WEEK: 7 * 86400000, SPONSOR: 100 };
  const plus = () => S().plus || (S().plus = { until: 0, auto: true });
  const me = () => N && N.user && N.user.uid;

  // le badge offert compte comme un abonnement dans tout le jeu
  const baseMine = ST.mine;
  ST.mine = () => { const m = baseMine(); const g = (S().plusGift && S().plusGift.until) || 0; if (g > m.plusUntil) m.plusUntil = g; return m; };

  const periodStart = () => (plus().until || 0) - ST.PLUS_DAYS * 86400000;
  PG.left = () => PG.WEEK_GIFTS - (plus().gifts || []).filter(g => g.at >= periodStart()).length;
  PG.sponsors = () => (plus().sponsors || []);
  PG.ownPlus = () => (plus().until || 0) > Date.now();

  // publie la liste des bénéficiaires dans le profil
  PG.publish = async function () {
    if (!N || !N.user || !N.db()) return;
    const map = {}, now = Date.now(), p = plus();
    (p.gifts || []).forEach(g => { if (g.until > now) map[g.to] = Math.max(map[g.to] || 0, g.until); });
    if (PG.ownPlus()) PG.sponsors().forEach(s => { map[s.to] = Math.max(map[s.to] || 0, p.until); });
    try { await N.db().collection('users').doc(me()).update({ plusGiftTo: Object.keys(map), plusGifts: map, updatedAt: Date.now() }); } catch (e) { console.warn('plusgift', e); }
  };
  PG.giveWeek = async function (f) {
    if (!PG.ownPlus()) throw new Error('Réservé aux membres Trad Center+.');
    if (PG.left() <= 0) throw new Error('Tu as déjà offert tes 3 semaines ce mois-ci.');
    const p = plus(); p.gifts = (p.gifts || []).filter(g => g.at > Date.now() - 90 * 86400000);
    const cur = p.gifts.filter(g => g.to === f.uid && g.until > Date.now()).reduce((t, g) => Math.max(t, g.until), Date.now());
    p.gifts.push({ to: f.uid, pseudo: f.pseudo, at: Date.now(), until: cur + PG.WEEK }); G.save(true);
    await PG.publish(); N.notifyPlayer(f.uid, 'plusgift', { days: 7 });
  };
  PG.sponsor = async function (f) {
    if (!PG.ownPlus()) throw new Error('Réservé aux membres Trad Center+.');
    const p = plus(); p.sponsors = p.sponsors || [];
    if (p.sponsors.some(s => s.to === f.uid)) throw new Error('Tu parraines déjà ce joueur.');
    if (S().cash < PG.SPONSOR) throw new Error(`Il te faut ${fmt.eur(PG.SPONSOR)} de cash.`);
    S().cash -= PG.SPONSOR; if (TC.Weekly) TC.Weekly.flow(-PG.SPONSOR);
    S().log.unshift({ t: Date.now(), kind: 'item', eur: PG.SPONSOR, asset: `Parrainage vérifié de ${f.pseudo}` });
    p.sponsors.push({ to: f.uid, pseudo: f.pseudo, since: Date.now() }); G.save(true);
    await PG.publish(); N.notifyPlayer(f.uid, 'plusgift', { sponsor: true });
  };
  PG.unsponsor = async function (uid) { const p = plus(); p.sponsors = (p.sponsors || []).filter(s => s.to !== uid); G.save(true); await PG.publish(); };

  // côté bénéficiaire : lire les badges offerts
  PG.sync = async function () {
    if (!N || !N.user || !N.db()) return;
    try {
      const snap = await N.db().collection('users').where('plusGiftTo', 'array-contains', me()).get();
      let best = 0, from = null;
      snap.docs.forEach(d => { if (TC.Admin && TC.Admin.isBanned(d.id)) return; const u = (d.data().plusGifts || {})[me()] || 0; if (u > best) { best = u; from = N.prof(d.id, d.data()).pseudo; } });
      const old = (S().plusGift && S().plusGift.until) || 0;
      S().plusGift = best > Date.now() ? { until: best, from } : null;
      if (best > Date.now() && best > old + 60000 && old < Date.now()) {
        TC.sound('kaching'); TC.confetti(160);
        TC.toast(`<span class="vbadge">✓</span> ${esc(from || 'Un ami')} t'offre le badge vérifié jusqu'au ${new Date(best).toLocaleDateString('fr-FR')} !`, 'ok', 8000);
      }
      if (best !== old) { G.save(true); if (TC.App) TC.App.after(); if (N.queueSync) N.queueSync(); }
    } catch (e) { console.warn('plusgift', e); }
  };

  /* ---------- Fenêtre « Offrir le vérifié » ---------- */
  PG.open = function () {
    const friends = (N && N.friends) || [];
    const sp = PG.sponsors(), left = PG.left(), own = PG.ownPlus();
    const gifts = (plus().gifts || []).filter(g => g.until > Date.now());
    const md = TC.modal(`<h2><span class="vbadge">✓</span> Offrir le vérifié</h2><div class="modal-body">
      ${own ? '' : '<div class="nbox warn">Réservé aux membres Trad Center+ : abonne-toi d\'abord.</div>'}
      <div class="kv"><span>🎁 Semaines offertes restantes</span><b>${Math.max(0, left)} / ${PG.WEEK_GIFTS} ce mois-ci</b><span>🤝 Parrainages</span><b>${sp.length} (+${fmt.eur(PG.SPONSOR * sp.length)}/mois)</b></div>
      <p class="hint">🎁 <b>1 semaine offerte</b> : gratuit, 3 par mois d'abonnement. 🤝 <b>Parrainage</b> : ton ami reste vérifié tant que tu es abonné, pour ${fmt.eur(PG.SPONSOR)} de plus par mois.</p>
      <h4>Tes amis</h4>${friends.length ? `<div class="board">${friends.map(f => {
        const isSp = sp.some(s => s.to === f.uid), g = gifts.find(x => x.to === f.uid);
        return `<div class="brow"><span class="pos">${ST.isPlus(f) ? '<span class="vbadge">✓</span>' : '·'}</span>${ST.avatar(f, 's')}<b>${esc(f.pseudo || '?')}</b><small>${isSp ? '🤝 parrainé' : g ? '🎁 jusqu\'au ' + new Date(g.until).toLocaleDateString('fr-FR') : ''}</small>
          <span class="pg-act">${isSp ? `<button class="btn btn-sm btn-ghost" data-pg="unsp" data-u="${esc(f.uid)}">Arrêter</button>` : `<button class="btn btn-sm" data-pg="week" data-u="${esc(f.uid)}" ${own && left > 0 ? '' : 'disabled'}>🎁 1 semaine</button><button class="btn btn-sm btn-plus" data-pg="sp" data-u="${esc(f.uid)}" ${own && S().cash >= PG.SPONSOR ? '' : 'disabled'}>🤝 +${fmt.eur(PG.SPONSOR, true)}/mois</button>`}</span></div>`;
      }).join('')}</div>` : '<div class="empty">Ajoute des amis (onglet Amis) pour leur offrir le badge.</div>'}</div>`, { cls: 'wide' });
    md.el.querySelectorAll('[data-pg]').forEach(b => b.onclick = async () => {
      const f = friends.find(x => x.uid === b.dataset.u); if (!f) return; b.disabled = true;
      try {
        if (b.dataset.pg === 'week') { await PG.giveWeek(f); TC.toast(`🎁 ${esc(f.pseudo)} est vérifié pendant 1 semaine !`, 'ok'); }
        if (b.dataset.pg === 'sp') { if (!(await TC.confirm('Parrainer ce joueur ?', `<b>${esc(f.pseudo)}</b> restera vérifié tant que tu es abonné. Ton abonnement coûtera <b>${fmt.eur(PG.SPONSOR)} de plus par mois</b> (${fmt.eur(PG.SPONSOR)} payés maintenant).`, 'Parrainer', 'btn-plus'))) return PG.open(); await PG.sponsor(f); TC.sound('kaching'); TC.toast(`🤝 Tu parraines ${esc(f.pseudo)} : badge vérifié tant que tu es abonné !`, 'ok'); }
        if (b.dataset.pg === 'unsp') { await PG.unsponsor(f.uid); TC.toast('Parrainage arrêté.', 'info'); }
      } catch (e) { TC.toast(e.message || N.errMsg(e), 'bad'); }
      if (TC.App) TC.App.after(); PG.open();
    });
  };
  document.addEventListener('click', e => { if (e.target.closest('[data-pgopen]')) PG.open(); });
  if (N && N.on) N.on(t => { if (t === 'linked') { PG.sync(); PG.publish(); } });
  setInterval(() => { if (!document.hidden) PG.sync(); }, 10 * 60000);
})();

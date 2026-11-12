/* Trad Center — duels entre amis ⚔️
 * « Je te défie : celui qui gagne le plus en 24 h gagne 100 € » (200 € le mardi des duels). Pas de mise : la prime vient du jeu.
 * Gain du duel = patrimoine − patrimoine de départ − argent reçu/envoyé (comme le championnat : les dons ne comptent pas).
 * Chacun publie l'état de son duel dans son profil (dl) ; l'autre le lit via sa liste d'amis. Un duel à la fois, 1 prime par jour.
 */
(function () {
  const { esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const D = TC.Duel = { PRIZE: 100, LEN: 24 * 3600000 };
  const me = () => N.user && N.user.uid;
  const cur = () => S().duel || null;
  const set = d => { S().duel = d; G.save(true); if (N.flushSoon) N.flushSoon(); render(); };
  const prize = () => TC.Progress && TC.Progress.event().k === 'duel' ? D.PRIZE * 2 : D.PRIZE;
  const friend = uid => (N.friends || []).find(f => f.uid === uid);
  const nwNow = () => G.netWorth();

  // les flux extérieurs (dons, primes, achats de licences…) ne comptent pas dans le gain du duel
  if (TC.Weekly && TC.Weekly.flow) { const f = TC.Weekly.flow; TC.Weekly.flow = function (eur) { const d = cur(); if (d && d.state === 'on' && Date.now() < d.end) d.flow = (d.flow || 0) + eur; return f.apply(this, arguments); }; }
  const gain = d => Math.round((nwNow() - (d.base || 0) - (d.flow || 0)) * 100) / 100;

  // ce qui est publié dans le profil
  D.pub = function () {
    const d = cur(); if (!d) return null;
    if (d.state === 'on' && Date.now() < d.end) d.g = gain(d); // gain figé à la fin du duel
    return { id: d.id, vs: d.vs, state: d.state, at: d.at || 0, start: d.start || 0, end: d.end || 0, g: d.g || 0, fin: d.end && Date.now() >= d.end ? 1 : 0 }; // fin : publie une dernière fois le score à la fin
  };

  /* ---------- Actions ---------- */
  D.invite = async function (uid) {
    const f = friend(uid); if (!f) return;
    const d = cur(); if (d && (d.state === 'inv' || d.state === 'on')) return TC.toast('Tu as déjà un duel en cours.', 'bad');
    if (f.dl && f.dl.state === 'on' && Date.now() < f.dl.end) return TC.toast(`${esc(f.pseudo)} est déjà en duel.`, 'bad');
    if (!(await TC.confirm('⚔️ Défier ' + esc(f.pseudo) + ' ?', `Pendant 24 h, celui qui gagne le plus d'argent remporte <b>${fmt.eur(prize())}</b> offerts par le jeu. Pas de mise, les dons ne comptent pas.`, 'Défier ⚔️', 'btn-gold'))) return;
    set({ id: me().slice(0, 5) + Date.now().toString(36), vs: uid, vsP: f.pseudo, state: 'inv', at: Date.now(), role: 'ch' });
    if (N.flush) await N.flush();
    N.notifyPlayer(uid, 'duelinv');
    TC.toast(`⚔️ Défi envoyé à ${esc(f.pseudo)} : le duel commence dès qu'il accepte.`, 'ok', 6000);
    if (TC.Progress) TC.Progress.progress('duel');
  };
  D.accept = async function (uid) {
    const f = friend(uid); if (!f || !f.dl || f.dl.vs !== me() || f.dl.state !== 'inv') return;
    const d = cur(); if (d && d.state === 'on' && Date.now() < d.end) return TC.toast('Tu as déjà un duel en cours.', 'bad');
    const now = Date.now();
    set({ id: f.dl.id, vs: uid, vsP: f.pseudo, state: 'on', start: now, end: now + D.LEN, base: nwNow(), flow: 0, g: 0, role: 'op' });
    if (N.flush) await N.flush();
    N.notifyPlayer(uid, 'duelok');
    TC.sound('ach'); TC.toast(`⚔️ Duel lancé contre ${esc(f.pseudo)} : 24 h pour gagner le plus !`, 'ok', 6000);
    if (TC.Progress) TC.Progress.progress('duel');
  };
  D.refuse = function (uid) { const f = friend(uid); if (!f || !f.dl) return; set({ id: f.dl.id, vs: uid, vsP: f.pseudo, state: 'no', at: Date.now() }); };
  D.cancel = function () { const d = cur(); if (d && d.state === 'inv') { set(null); TC.toast('Défi annulé', 'info'); } };

  /* ---------- Suivi ---------- */
  let busy = false;
  async function tick() {
    if (busy || !N.user || !N.db()) return; busy = true;
    try {
      const d = cur(), now = Date.now();
      if (d && d.state === 'inv') {
        const f = friend(d.vs), dl = f && f.dl;
        if (dl && dl.id === d.id && dl.state === 'on') { Object.assign(d, { state: 'on', start: dl.start, end: dl.end, base: nwNow(), flow: 0, g: 0 }); set(d); TC.sound('ach'); TC.toast(`⚔️ ${esc(d.vsP)} a accepté ton duel ! Fin ${fmt.time(d.end)}.`, 'ok', 7000); }
        else if (dl && dl.id === d.id && dl.state === 'no') { set(null); TC.toast(`${esc(d.vsP)} a refusé ton duel.`, 'info', 5000); }
        else if (now - d.at > D.LEN) set(null);
      }
      if (d && d.state === 'on') {
        if (now < d.end) d.g = gain(d);
        else { // fin : on compare avec le gain publié par l'autre
          if (N.flush) await N.flush(); // mon score final d'abord
          const snap = await N.db().collection('users').doc(d.vs).get(); const dl = snap.exists && snap.data().dl;
          // l'autre n'a pas encore publié son score final : on attend qu'il ouvre le jeu (2 h au plus)
          if (snap.exists && (snap.data().updatedAt || 0) < d.end && now - d.end < 2 * 3600000) { busy = false; return; }
          const other = dl && dl.id === d.id ? +dl.g || 0 : 0, mine = d.g || 0;
          d.state = 'done'; d.res = mine > other ? 'win' : mine < other ? 'lose' : 'tie'; d.og = other;
          const day = new Date().toDateString(), paid = S().duelPaid || (S().duelPaid = {});
          if (d.res === 'win' && !paid[day]) {
            paid[day] = d.id; const p = prize();
            S().cash += p; if (TC.Weekly) TC.Weekly.flow(p);
            S().log.unshift({ t: now, kind: 'bonus', eur: p, asset: `⚔️ Duel gagné contre ${d.vsP}` });
            TC.sound('kaching'); TC.confetti(200);
            TC.modal(`<div class="center"><div class="big-emoji">⚔️🏆</div><h2>Duel gagné !</h2><p>Toi <b class="up">${fmt.eur(mine)}</b> contre ${esc(d.vsP)} <b>${fmt.eur(other)}</b></p><p>Ta prime : <b>+${fmt.eur(p)}</b></p><div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>Encaisser 💰</button></div></div>`);
            N.notifyPlayer(d.vs, 'duelres', { win: false });
            if (TC.Progress) TC.Progress.xp(100);
          } else if (d.res === 'win') TC.toast(`⚔️ Duel gagné contre ${esc(d.vsP)} (prime déjà reçue aujourd'hui : une par jour).`, 'ok', 7000);
          else { TC.toast(d.res === 'tie' ? `⚔️ Égalité contre ${esc(d.vsP)} !` : `⚔️ Duel perdu contre ${esc(d.vsP)} (${fmt.eur(mine)} contre ${fmt.eur(other)}). Revanche ?`, 'info', 8000); if (TC.Progress) TC.Progress.xp(30); }
          set(d);
        }
      }
    } catch (e) { console.warn('duel', e); }
    busy = false;
  }

  /* ---------- Affichage (onglet Amis) ---------- */
  D.block = function () {
    if (!N.user) return '';
    const d = cur(), now = Date.now();
    const inv = (N.friends || []).filter(f => f.dl && f.dl.vs === me() && f.dl.state === 'inv' && now - f.dl.at < D.LEN && !(d && d.id === f.dl.id));
    let html = inv.map(f => `<div class="duel-inv">${TC.Style ? TC.Style.avatar(f, 's') : ''}<div><b>⚔️ ${esc(f.pseudo)} te défie !</b><small>24 h, le plus gros gain remporte ${fmt.eur(prize())}</small></div><button class="btn btn-sm btn-gold" data-duelok="${esc(f.uid)}">Accepter</button><button class="btn btn-sm btn-ghost" data-duelno="${esc(f.uid)}">Non</button></div>`).join('');
    if (d && d.state === 'inv') html += `<div class="duel-inv"><span class="duel-ic">⏳</span><div><b>Défi envoyé à ${esc(d.vsP)}</b><small>Le duel commence quand il accepte.</small></div><button class="btn btn-sm btn-ghost" data-duelcancel>Annuler</button></div>`;
    if (d && d.state === 'on') {
      const f = friend(d.vs), og = f && f.dl && f.dl.id === d.id ? +f.dl.g || 0 : 0, g = now < d.end ? gain(d) : d.g || 0, lead = g >= og;
      const left = Math.max(0, d.end - now), h = Math.floor(left / 3600000), m = Math.floor(left / 60000) % 60;
      html += `<div class="duel-on ${lead ? 'lead' : ''}"><h4>⚔️ Duel contre ${esc(d.vsP)} <small>${now < d.end ? `fin dans ${h} h ${String(m).padStart(2, '0')}` : 'résultat en cours…'}</small></h4>
        <div class="duel-sc"><div><small>Toi</small><b class="${g >= 0 ? 'up' : 'down'}">${g >= 0 ? '+' : ''}${fmt.eur(g)}</b></div><span>${lead ? '🔥' : '😬'}</span><div><small>${esc(d.vsP)}</small><b class="${og >= 0 ? 'up' : 'down'}">${og >= 0 ? '+' : ''}${fmt.eur(og)}</b></div></div>
        <p class="hint">Prime : ${fmt.eur(prize())}. Le score de ${esc(d.vsP)} se met à jour quand il joue.</p></div>`;
    }
    if (d && d.state === 'done' && now - d.end < 86400000) html += `<div class="duel-inv"><span class="duel-ic">${d.res === 'win' ? '🏆' : d.res === 'tie' ? '🤝' : '💀'}</span><div><b>Duel ${d.res === 'win' ? 'gagné' : d.res === 'tie' ? 'nul' : 'perdu'} contre ${esc(d.vsP)}</b><small>${fmt.eur(d.g || 0)} contre ${fmt.eur(d.og || 0)}</small></div><button class="btn btn-sm btn-gold" data-duel="${esc(d.vs)}">Revanche</button></div>`;
    return html ? `<div class="panel duels">${html}</div>` : '';
  };
  function render() { if (TC.Social && TC.UI && TC.UI.tab === 'social' && !(document.activeElement && document.activeElement.tagName === 'INPUT')) TC.Social.render(); }

  document.addEventListener('click', e => {
    const t = e.target, a = (k) => { const el = t.closest('[data-' + k + ']'); return el ? el.getAttribute('data-' + k) : null; };
    let v;
    if ((v = a('duel')) !== null) { if (cur() && cur().state === 'done') S().duel = null; return D.invite(v); }
    if ((v = a('duelok')) !== null) return D.accept(v);
    if ((v = a('duelno')) !== null) return D.refuse(v);
    if (t.closest('[data-duelcancel]')) return D.cancel();
  });
  N.on(t => { if (t === 'change' || t === 'linked') tick(); });
  setInterval(() => { if (!document.hidden) tick(); }, 30000);
})();

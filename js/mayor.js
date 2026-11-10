/* Trad Center — pouvoirs du Maire de Trad City (élu chaque semaine, mandat = la semaine suivante)
 * 1. Taxe : 1 % de chaque rachat de commerce (payé en plus par l'acheteur, encaissé automatiquement par le Maire).
 * 3. Discours : un message de 140 caractères affiché à tous les joueurs, avec notification (3 par semaine).
 * 4. Protection : ses commerces ne peuvent pas être rachetés pendant son mandat (dans js/city.js).
 * 5. Palais : son bâtiment est décoré en 3D (dans js/city3d.js).
 * 6. Promesses : chaque candidat annonce l'événement qu'il lancera s'il gagne ; l'élu l'active pour tout le monde.
 * Tout passe par le profil de chacun (aucune règle Firestore à changer).
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, C = TC.City, S = () => G.state;
  const W = () => TC.Weekly;
  const MY = TC.Mayor = { SPEECH_MAX: 140, SPEECHES: 3 };

  MY.EVENTS = {
    biz50:  { e: '🏪', name: 'Commerces +50 %',        desc: 'Tous les commerces rapportent 50 % de plus' },
    bonus2: { e: '🎁', name: 'Bonus quotidien doublé', desc: 'Le bonus 🎁 de chaque jour est doublé' },
    fees0:  { e: '💸', name: 'Zéro frais de trading',  desc: 'Acheter et vendre ne coûte plus aucun frais' },
    chest:  { e: '🎰', name: 'Coffre à 90 €',          desc: 'Le coffre à roulette coûte 90 € au lieu de 100 €' },
    rent2:  { e: '🏠', name: 'Loyers doublés',          desc: 'L\'immobilier rapporte deux fois plus de loyer' },
  };
  const base = { rate: C.RATE, bonus: G.BONUS, fs: G.FEE_SPOT, fl: G.FEE_LEV, chest: TC.Chest ? TC.Chest.PRICE : 100, rent: TC.RENT_RATE_PER_HOUR };
  MY.active = null;
  function apply(ev) {
    if (ev === MY.active) return;
    // les recettes et loyers en cours sont encaissés au taux d'avant
    try { C.collect(true); G.collectRent(); } catch (e) { }
    C.RATE = base.rate; G.BONUS = base.bonus; G.FEE_SPOT = base.fs; G.FEE_LEV = base.fl; if (TC.Chest) TC.Chest.PRICE = base.chest; TC.RENT_RATE_PER_HOUR = base.rent;
    if (ev === 'biz50') C.RATE = base.rate * 1.5;
    if (ev === 'bonus2') G.BONUS = base.bonus * 2;
    if (ev === 'fees0') { G.FEE_SPOT = 0; G.FEE_LEV = 0; }
    if (ev === 'chest' && TC.Chest) TC.Chest.PRICE = 90;
    if (ev === 'rent2') TC.RENT_RATE_PER_HOUR = base.rent * 2;
    MY.active = MY.EVENTS[ev] ? ev : null;
    if (TC.UI && TC.UI.header) TC.UI.header();
  }

  const curId = () => W().current().id;
  const mandate = () => (C.elected && C.elected.week === W().previous().id) ? C.elected : null;
  MY.isMe = () => !!(mandate() && N.user && mandate().uid === N.user.uid);
  MY.promiseOf = p => p && p['promise_' + curId()];
  MY.promiseTag = p => { const e = MY.EVENTS[MY.promiseOf(p)]; return e ? ' ' + e.e : ''; };
  MY.speech = () => { const m = mandate(); const sp = m && m.p && m.p.speech; return sp && sp.week === curId() && sp.text ? sp : null; };

  /* ---------- Rafraîchi après chaque dépouillement (js/city.js) ---------- */
  MY.refresh = function () {
    const m = mandate();
    apply(m && m.p ? m.p['promise_' + m.week] : null);
    const sp = MY.speech();
    if (sp && !MY.isMe()) {
      const seen = S().speechSeen || 0;
      if (sp.at > seen) {
        S().speechSeen = sp.at; G.save();
        TC.modal(`<div class="center"><div class="big-emoji">📢</div><h2>Discours du Maire</h2>
          <p class="speech">« ${esc(sp.text)} »</p><p class="muted">— ${esc(m.pseudo)} 👑, Maire de Trad City</p>
          <div class="modal-actions"><button class="btn btn-gold" data-close>👏 Bravo</button></div></div>`);
      }
    }
    MY.checkTaxes();
  };

  /* ---------- 1. Taxe : le Maire encaisse ---------- */
  let busy = false;
  MY.checkTaxes = async function () {
    if (busy || !N.user || !N.db()) return; busy = true;
    try {
      const f = 'tx_' + N.user.uid;
      const snap = await N.db().collection('users').where(f, '!=', null).get();
      const seen = S().taxSeen || (S().taxSeen = {}); let tot = 0, n = 0;
      snap.docs.forEach(d => (d.data()[f] || []).forEach(e => {
        if (!e || !e.id || seen[e.id]) return; seen[e.id] = Date.now();
        const v = Math.max(0, Math.min(+e.eur || 0, 1e7)); tot += v; n++;
      }));
      Object.keys(seen).forEach(k => { if (Date.now() - seen[k] > 10 * 86400000) delete seen[k]; });
      if (tot > 0) {
        S().cash += tot; S().log.unshift({ t: Date.now(), kind: 'bonus', eur: tot, asset: `Taxe du Maire 👑 (${n} rachat${n > 1 ? 's' : ''})` });
        G.save(true); TC.sound('kaching'); TC.toast(`👑 Taxe du Maire : +${fmt.eur(tot)} (${n} rachat${n > 1 ? 's' : ''} en ville)`, 'ok', 6000);
        if (TC.App) TC.App.after();
      } else if (n) G.save();
    } catch (e) { console.warn('taxe', e); }
    busy = false;
  };

  /* ---------- 3. Discours ---------- */
  const BAD = /\b(con+(nar+d?e?|ne)?s?|pute?s?|salope?s?|encul[ée]e?s?|ntm|fdp|pd|connasse|batard|bâtard|merde|nique|ta m[eè]re|enfoir[ée]e?s?|tg|ftg|sale (noir|arabe|juif|blanc)|nazi|hitler)\b/i;
  MY.clean = t => !BAD.test(t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[0@]/g, 'o').replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/\$/g, 's'));
  MY.speak = async function (text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!MY.isMe()) return TC.toast('Seul le Maire peut faire un discours', 'bad');
    if (text.length < 3) return TC.toast('Ton discours est trop court', 'bad');
    if (text.length > MY.SPEECH_MAX) return TC.toast(`${MY.SPEECH_MAX} caractères maximum`, 'bad');
    if (!MY.clean(text)) return TC.toast('🚫 Pas de gros mots dans un discours de Maire !', 'bad');
    const cnt = S().speeches || (S().speeches = {}); const k = curId();
    if ((cnt[k] || 0) >= MY.SPEECHES) return TC.toast(`Tu as déjà fait ${MY.SPEECHES} discours cette semaine`, 'bad');
    try {
      const sp = { text, week: k, at: Date.now() };
      await N.db().collection('users').doc(N.user.uid).update({ speech: sp, updatedAt: Date.now() });
      N.profile.speech = sp; if (C.elected && C.elected.p) C.elected.p.speech = sp;
      cnt[k] = (cnt[k] || 0) + 1; G.save(true);
      N.notifyPlayer('*', 'speech', { text });
      TC.sound('ach'); TC.toast('📢 Discours publié ! Tous les joueurs vont le recevoir.', 'ok', 5000);
      return true;
    } catch (e) { TC.toast(N.errMsg(e), 'bad'); }
  };

  /* ---------- 6. Promesse de campagne ---------- */
  MY.promise = async function (ev) {
    if (!N.user || !N.profile) return TC.toast('Crée un compte pour être candidat', 'bad');
    if (!MY.EVENTS[ev]) return;
    const f = 'promise_' + curId();
    try {
      await N.db().collection('users').doc(N.user.uid).update({ [f]: ev, updatedAt: Date.now() });
      N.profile[f] = ev; TC.toast(`${MY.EVENTS[ev].e} Ta promesse : ${MY.EVENTS[ev].name}. Fais campagne auprès de tes amis !`, 'ok', 5000);
    } catch (e) { TC.toast(N.errMsg(e), 'bad'); }
  };

  /* ---------- Affichage ---------- */
  MY.banner = function () {
    const m = mandate(); if (!m) return '';
    const ev = MY.EVENTS[MY.active], sp = MY.speech();
    return `<div class="mayor-bar" data-land="mairie"><span class="mb-crown">👑</span><div><b>${MY.isMe() ? 'Tu es le Maire de Trad City' : 'Maire : ' + esc(m.pseudo)}</b>
      ${ev ? `<small>${ev.e} Événement de la semaine : <b>${ev.name}</b></small>` : ''}${sp ? `<small class="mb-sp">📢 « ${esc(sp.text)} »</small>` : ''}</div><span class="mb-go">›</span></div>`;
  };
  MY.html = function () {
    const m = mandate(), me = MY.isMe(), ev = MY.EVENTS[MY.active], sp = MY.speech();
    const logged = N.user && N.profile;
    const mine = logged ? N.profile['promise_' + curId()] : null;
    const left = MY.SPEECHES - ((S().speeches || {})[curId()] || 0);
    return `${m ? `<div class="mpow"><b>👑 Pouvoirs du Maire cette semaine</b>
        <div>💸 Touche <b>1 %</b> de chaque rachat de commerce en ville</div>
        <div>🛡️ Ses commerces ne peuvent pas être rachetés</div>
        <div>🏛️ Son bâtiment devient un palais sur la carte</div>
        <div>${ev ? `${ev.e} Promesse tenue : <b>${ev.name}</b> pour tout le monde` : '🤷 Aucune promesse de campagne cette fois'}</div>
        ${sp ? `<div class="speech">📢 « ${esc(sp.text)} »</div>` : ''}</div>` : ''}
      ${me ? `<div class="mspeak"><b>📢 Ton discours</b> <small>(${left} restant${left > 1 ? 's' : ''} cette semaine, envoyé à tous en notification)</small>
        <textarea id="m-speech" maxlength="${MY.SPEECH_MAX}" rows="2" placeholder="Ex : Cette semaine, tout le monde achète du Bitcoin !"></textarea>
        <button class="btn btn-gold" data-mspeak ${left > 0 ? '' : 'disabled'}>Publier le discours</button></div>` : ''}
      ${logged ? `<div class="mprom"><b>🗳️ Ta promesse de campagne</b> <small>Si tu es élu, elle s'active pour tout le monde la semaine suivante.</small>
        <div class="mprom-l">${Object.entries(MY.EVENTS).map(([k, e]) => `<button class="btn btn-sm ${mine === k ? 'btn-gold' : ''}" data-mprom="${k}" title="${esc(e.desc)}">${e.e} ${e.name}</button>`).join('')}</div></div>` : ''}`;
  };
  MY.wire = function (md, reopen) {
    const b = md.el.querySelector('[data-mspeak]');
    if (b) b.onclick = async () => { b.disabled = true; const ok = await MY.speak(md.el.querySelector('#m-speech').value); if (ok) reopen(); else b.disabled = false; };
    md.el.querySelectorAll('[data-mprom]').forEach(x => { x.onclick = async () => { await MY.promise(x.dataset.mprom); reopen(); }; });
  };
})();

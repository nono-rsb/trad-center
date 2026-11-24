/* Trad Center — « Vie en France » : taxe foncière, assurances, virements avec délai, portefeuille en ligne TradPay (type PayPal).
 * Tout est stocké dans l'état du joueur : state.fr = { fonc: { at, auto }, ins: { hab, auto }, chk, pay, payOut: [] }.
 * Le créateur (concours) en est exempt, comme de l'impôt sur la grande fortune. L'argent des taxes et des primes sort du jeu. */
(function () {
  const F = TC.Fr = {};
  const G = TC.Game, fmt = TC.fmt, esc = TC.esc, S = () => G.state;
  const HOUR = 3600000, DAY = 86400000, WEEK = 7 * DAY;
  const r2 = v => Math.round(v * 100) / 100;
  const fr = () => S().fr || (S().fr = { fonc: { at: 0, auto: false }, ins: {}, chk: 0, pay: 0, payOut: [] });
  const exempt = () => !!(TC.Net && TC.Net.user && TC.Net.user.uid === TC.ADMIN_UID);
  const dlog = (eur, asset) => { S().log.unshift({ t: Date.now(), kind: 'fr', eur: r2(eur), asset }); if (S().log.length > 300) S().log.length = 300; };

  /* ---------- Délais de virement : 1 jour ouvré (rien ne circule le week-end) ---------- */
  F.INSTANT_FEE = 0.01; F.INSTANT_MIN = 0.5; // virement instantané : 1 %, 0,50 € minimum
  F.arrival = function (from) {
    from = from || Date.now(); const d = new Date(from + DAY), wk = new Date(from).getDay(); let late = wk === 0 || wk === 6;
    if (d.getDay() === 6) { d.setDate(d.getDate() + 2); late = true; } else if (d.getDay() === 0) { d.setDate(d.getDate() + 1); late = true; }
    if (late) d.setHours(9, 0, 0, 0); // week-end : lundi 9 h
    return d.getTime();
  };
  F.fee = amount => r2(Math.max(F.INSTANT_MIN, amount * F.INSTANT_FEE));
  // mode : 'instant' (1 %, tout de suite) ou 'sepa' (gratuit, 1 jour ouvré). Rien : comme avant (tout de suite, gratuit, ex. Trad Drop).
  F.quote = (amount, mode) => mode === 'sepa' ? { fee: 0, availAt: F.arrival() } : mode === 'instant' ? { fee: F.fee(amount), availAt: 0 } : { fee: 0, availAt: 0 };
  F.fmtWhen = t => new Date(t).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  F.charge = function (fee, what) { if (!(fee > 0)) return; S().cash = Math.max(0, S().cash - fee); dlog(fee, what || '🏦 Frais de virement instantané'); G.save(true); };

  /* ---------- Taxe foncière : 3 % de la valeur de tes biens immobiliers par semaine, 7 jours pour payer ---------- */
  F.FONC = 0.03;
  const estates = () => S().owned.filter(o => TC.shopById[o.item] && TC.shopById[o.item].type === 'estate');
  const cars = () => S().owned.filter(o => TC.shopById[o.item] && TC.shopById[o.item].type === 'car');
  F.foncAmount = () => r2(estates().reduce((t, o) => t + o.price, 0) * F.FONC);
  function foncCheck() {
    const f = fr().fonc, now = Date.now(); if (exempt()) return;
    if (!f.at) { f.at = now; return; }
    const weeks = Math.min(4, Math.floor((now - f.at) / WEEK)); if (weeks < 1) return;
    f.at += weeks * WEEK; const amt = r2(F.foncAmount() * weeks);
    if (!(amt > 0)) return;
    TC.Tax.owe(amt, 'taxe foncière', WEEK);
    TC.toast(`🏛️ Avis de taxe foncière : <b>${fmt.eur(amt)}</b> à payer sous 7 jours.`, 'bad', 7000);
    if (f.auto && S().cash >= TC.Tax.due()) { const r = TC.Tax.payAll(); if (r.ok && r.paid) TC.toast(`🏦 Prélèvement automatique : ${fmt.eur(r.paid)}`, 'info', 5000); }
  }

  /* ---------- Assurances : prime d'une semaine payée d'avance, 24 h de carence, franchise en cas de sinistre ---------- */
  F.INS = {
    hab: { e: '🏠', name: 'Assurance habitation', rate: 0.015, items: estates, p: 0.02, ev: ['Cambriolage', 'Dégât des eaux', 'Incendie', 'Tempête'], what: 'tes maisons et appartements' },
    auto: { e: '🚗', name: 'Assurance auto', rate: 0.028, items: cars, p: 0.03, ev: ['Accrochage', 'Vol', 'Vandalisme', 'Panne moteur'], what: 'tes voitures' },
  };
  F.CARENCE = DAY; F.FRANCHISE = 0.05;
  const val = o => G.itemResale(o);
  F.premium = k => r2(F.INS[k].items().reduce((t, o) => t + val(o), 0) * F.INS[k].rate);
  F.covered = (k, t) => { const c = fr().ins[k]; return !!(c && c.from + F.CARENCE <= t && t <= c.paidUntil); };
  F.subscribe = function (k) {
    const I = F.INS[k], prem = F.premium(k); if (!I.items().length) return { ok: false, msg: `Tu n'as rien à assurer (${I.what}).` };
    if (S().cash < prem) return { ok: false, msg: `Il faut ${fmt.eur(prem)} pour la première semaine.` };
    S().cash -= prem; dlog(prem, `${I.e} ${I.name} (1 semaine)`); const now = Date.now();
    fr().ins[k] = { from: now, paidUntil: now + WEEK, on: true }; G.save(true); return { ok: true, prem };
  };
  F.cancel = k => { const c = fr().ins[k]; if (c) { c.on = false; G.save(true); } };
  function insRenew() {
    const f = fr(), now = Date.now();
    Object.keys(F.INS).forEach(k => {
      const c = f.ins[k]; if (!c || !c.on) return;
      let n = 0;
      while (c.on && c.paidUntil < now && n++ < 4) {
        const prem = F.premium(k);
        if (!(prem > 0) || S().cash < prem) { c.on = false; TC.toast(`⚠️ ${F.INS[k].name} résiliée : prime de ${fmt.eur(prem)} impayée.`, 'bad', 8000); break; }
        S().cash -= prem; c.paidUntil += WEEK; dlog(prem, `${F.INS[k].e} ${F.INS[k].name} (1 semaine)`);
      }
    });
  }
  // sinistres : tirage chaque heure écoulée (7 jours au plus, même si le jeu était fermé)
  function sinistres() {
    const f = fr(), now = Date.now(); if (exempt()) { f.chk = now; return; }
    if (!f.chk) { f.chk = now; return; }
    const hours = Math.min(168, Math.floor((now - f.chk) / HOUR)); if (hours < 1) return;
    const t0 = f.chk; f.chk += hours * HOUR; let n = 0;
    for (let i = 1; i <= hours && n < 3; i++) {
      const t = t0 + i * HOUR;
      for (const k of Object.keys(F.INS)) {
        const I = F.INS[k], list = I.items(); if (!list.length || n >= 3) continue;
        if (Math.random() >= 1 - Math.pow(1 - I.p, 1 / 24)) continue;
        const o = list[Math.floor(Math.random() * list.length)], it = TC.shopById[o.item];
        const dmg = r2(val(o) * (0.03 + Math.random() * 0.12)), ins = F.covered(k, t);
        const cost = Math.min(S().cash, ins ? Math.max(20, Math.min(dmg, dmg * F.FRANCHISE)) : dmg);
        S().cash -= cost; n++;
        const ev = I.ev[Math.floor(Math.random() * I.ev.length)];
        dlog(cost, `${I.e} Sinistre : ${ev} (${it.brand} ${it.model})${ins ? ' · franchise' : ' · non assuré'}`);
        TC.toast(ins ? `${I.e} ${ev} : ${esc(it.brand + ' ' + it.model)}, dégâts ${fmt.eur(dmg)}. Ton assurance paie : tu ne règles que la franchise (${fmt.eur(cost)}).` : `${I.e} ${ev} : ${esc(it.brand + ' ' + it.model)}, dégâts ${fmt.eur(dmg)}… et tu n'es pas assuré ! −${fmt.eur(cost)}`, ins ? 'info' : 'bad', 9000);
      }
    }
  }

  /* ---------- TradPay : portefeuille en ligne (comme PayPal) ----------
   * Alimenter depuis le compte : tout de suite, gratuit. Retirer vers le compte : gratuit en 1 jour ouvré, ou tout de suite pour 1,5 %.
   * Envoyer à un ami depuis TradPay : instantané et gratuit (« entre proches »). Le solde TradPay compte dans le patrimoine. */
  F.OUT_FEE = 0.015;
  F.balance = () => (S().fr && S().fr.pay) || 0;
  F.pending = () => ((S().fr && S().fr.payOut) || []).reduce((t, x) => t + x.amt, 0);
  { const nw0 = G.netWorth; G.netWorth = () => nw0() + F.balance() + F.pending(); } // l'argent en route et dans TradPay reste dans le patrimoine
  F.topUp = function (amt) {
    amt = r2(+amt); if (!(amt >= 0.01)) return { ok: false, msg: 'Montant invalide.' };
    if (TC.Tax && TC.Tax.guard && TC.Tax.blocked()) return { ok: false, msg: 'Compte bloqué : paie d\'abord tes impôts.' };
    if (amt > S().cash + 1e-9) return { ok: false, msg: 'Cash insuffisant.' };
    S().cash -= amt; fr().pay = r2(fr().pay + amt); dlog(amt, '💙 Alimentation TradPay'); G.save(true); return { ok: true };
  };
  F.withdraw = function (amt, mode) {
    amt = r2(+amt); if (!(amt >= 0.01)) return { ok: false, msg: 'Montant invalide.' };
    if (amt > F.balance() + 1e-9) return { ok: false, msg: 'Solde TradPay insuffisant.' };
    fr().pay = r2(fr().pay - amt);
    if (mode === 'instant') { const fee = r2(Math.max(0.5, amt * F.OUT_FEE)); const net = Math.max(0, amt - fee); S().cash += net; dlog(net, `💙 Retrait TradPay instantané (frais ${fmt.eur(fee)})`); }
    else { fr().payOut.push({ at: F.arrival(), amt }); }
    G.save(true); return { ok: true };
  };
  function payOutDue() {
    const f = fr(), now = Date.now(); const due = f.payOut.filter(x => x.at <= now); if (!due.length) return;
    f.payOut = f.payOut.filter(x => x.at > now); const t = r2(due.reduce((s, x) => s + x.amt, 0));
    S().cash += t; dlog(t, '💙 Retrait TradPay reçu'); TC.toast(`💙 Retrait TradPay arrivé sur ton compte : <b>+${fmt.eur(t)}</b>`, 'ok', 6000);
  }
  F.sendFriend = async function (friend, amt, msg) {
    amt = r2(+amt); if (!(amt >= 0.01)) throw new Error('Montant invalide.');
    if (amt > F.balance() + 1e-9) throw new Error('Solde TradPay insuffisant.');
    fr().pay = r2(fr().pay - amt); S().cash += amt; // TradPay → compte, puis envoi immédiat
    try { await TC.Net.send(friend, 'cash', null, amt, msg || '💙 TradPay'); } catch (e) { S().cash -= amt; fr().pay = r2(fr().pay + amt); G.save(true); throw e; }
  };

  /* ---------- Boucle ---------- */
  F.check = function () {
    if (!G.state || !S().owned) return;
    try { fr(); foncCheck(); insRenew(); sinistres(); payOutDue(); G.save(); if (TC.App && TC.App.after) TC.App.after(); } catch (e) { console.warn('fr', e); }
  };
  setInterval(F.check, 60000); setTimeout(F.check, 5000);

  /* ---------- Écrans ---------- */
  const inp = (id, ph) => `<div class="frin"><input id="${id}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="${ph || 'Montant'}"><span>€</span></div>`;
  F.panel = function () {
    if (!S().owned) return '';
    const f = fr(), pay = F.balance() + F.pending(), has = estates().length || cars().length || pay > 0 || TC.Tax.due() > 0;
    if (!has) return '';
    const insOn = Object.keys(F.INS).filter(k => F.covered(k, Date.now()) || (f.ins[k] && f.ins[k].on)).length;
    return `<div class="panel fr-panel"><h3>🇫🇷 Vie en France</h3>
      <div class="kv"><span>🏛️ Taxe foncière</span><b>${F.foncAmount() ? fmt.eur(F.foncAmount()) + ' / semaine' : 'aucun bien'}</b><span>🛡️ Assurances</span><b>${insOn} / 2</b><span>💙 TradPay</span><b>${fmt.eur(pay)}</b></div>
      <button class="btn btn-sm" data-fr="ins">🛡️ Assurances</button> <button class="btn btn-sm" data-fr="fonc">🏛️ Taxe foncière</button> <button class="btn btn-sm" data-fr="pay">💙 TradPay</button></div>`;
  };
  F.open = function (tab) {
    tab = tab || 'ins';
    const tabs = [['ins', '🛡️ Assurances'], ['fonc', '🏛️ Foncière'], ['pay', '💙 TradPay']];
    const body = () => {
      const f = fr();
      if (tab === 'ins') return Object.keys(F.INS).map(k => {
        const I = F.INS[k], c = f.ins[k], on = c && c.on, prem = F.premium(k), cov = F.covered(k, Date.now());
        return `<div class="fr-card"><b>${I.e} ${I.name}</b><p class="hint">Couvre ${I.what}. Prime : <b>${fmt.eur(prem)}</b> par semaine (payée d'avance, ${(I.rate * 100).toFixed(1).replace('.', ',')} % de la valeur). Franchise : ${F.FRANCHISE * 100} % des dégâts.</p>
          ${on ? `<p>${cov ? '✅ Tu es couvert' : '⏳ Carence : couvert à partir de ' + F.fmtWhen(c.from + F.CARENCE)} · prochaine prime le ${new Date(c.paidUntil).toLocaleDateString('fr-FR')}</p><button class="btn btn-sm btn-ghost" data-frcancel="${k}">Résilier</button>`
            : `<p class="muted">${I.items().length ? 'Pas assurée : en cas de sinistre, tu paies tout.' : 'Rien à assurer pour l\'instant.'}</p><button class="btn btn-gold btn-sm" data-frsub="${k}" ${I.items().length ? '' : 'disabled'}>Souscrire · ${fmt.eur(prem)}</button>`}</div>`;
      }).join('') + `<p class="hint">Des sinistres arrivent au hasard (cambriolage, incendie, accrochage…). Il y a <b>24 h de carence</b> après la souscription. Si ta prime n'est pas payable, le contrat est résilié.</p>`;
      if (tab === 'fonc') {
        const X = TC.Tax, nx = f.fonc.at ? f.fonc.at + WEEK : 0;
        return `<div class="fr-card"><b>🏛️ Taxe foncière</b><p class="hint">Chaque semaine, tu reçois un avis : <b>${F.FONC * 100} %</b> de la valeur de tes biens immobiliers. Tu as <b>7 jours</b> pour payer, sinon +10 % de majoration et compte bloqué.</p>
          <div class="kv"><span>Biens immobiliers</span><b>${estates().length}</b><span>Prochain avis</span><b>${F.foncAmount() ? fmt.eur(F.foncAmount()) : '—'}${nx && F.foncAmount() ? ' le ' + new Date(nx).toLocaleDateString('fr-FR') : ''}</b><span>Déjà à payer</span><b>${fmt.eur(X.due())}</b></div>
          <label class="fr-chk"><input type="checkbox" id="fr-auto" ${f.fonc.auto ? 'checked' : ''}> 🏦 Prélèvement automatique (payé tout seul quand l'avis arrive, si tu as assez de cash)</label>
          ${X.due() ? '<button class="btn btn-gold" data-frtax>Payer mes impôts</button>' : ''}</div>`;
      }
      const net = TC.Net, fr0 = (net && net.friends) || [];
      return `<div class="fr-card"><b>💙 TradPay</b> <p class="hint">Ton portefeuille en ligne, comme PayPal.</p>
        <div class="kv"><span>Solde TradPay</span><b>${fmt.eur(F.balance())}</b>${F.pending() ? `<span>Retrait en route</span><b>${fmt.eur(F.pending())}</b>` : ''}<span>Cash du compte</span><b>${fmt.eur(S().cash)}</b></div>
        <h4>Alimenter</h4>${inp('fr-top')}<button class="btn btn-sm" data-frtop>Ajouter à TradPay (gratuit, tout de suite)</button>
        <h4>Retirer vers mon compte</h4>${inp('fr-out')}<button class="btn btn-sm" data-frout="sepa">Gratuit · 1 jour ouvré</button> <button class="btn btn-sm" data-frout="instant">Tout de suite · 1,5 %</button>
        ${(f.payOut || []).length ? `<p class="hint">${f.payOut.map(x => `${fmt.eur(x.amt)} arrivent le ${F.fmtWhen(x.at)}`).join('<br>')}</p>` : ''}
        <h4>Envoyer à un ami</h4>${fr0.length ? `<select id="fr-to">${fr0.map(x => `<option value="${esc(x.uid)}">${esc(x.pseudo || '?')}</option>`).join('')}</select>` : '<p class="muted">Ajoute des amis pour leur envoyer de l\'argent.</p>'}
        ${fr0.length ? inp('fr-snd') + '<button class="btn btn-gold btn-sm" data-frsnd>💙 Envoyer (gratuit, tout de suite)</button>' : ''}<p class="err" id="fr-err"></p></div>`;
    };
    const md = TC.modal(`<h2>🇫🇷 Vie en France</h2><div class="modal-body"><div class="fr-tabs"></div><div class="fr-body"></div></div><div class="modal-actions"><button class="btn btn-ghost" data-close>Fermer</button></div>`, { cls: 'fr-modal' });
    const el = md.el, draw = () => {
      el.querySelector('.fr-tabs').innerHTML = tabs.map(([k, n]) => `<button class="btn btn-sm ${k === tab ? 'btn-gold' : ''}" data-frtab="${k}">${n}</button>`).join('');
      el.querySelector('.fr-body').innerHTML = body();
    };
    const done = (r, ok) => { if (!r.ok) { const e = el.querySelector('#fr-err'); if (e) e.textContent = r.msg; return TC.toast(r.msg, 'bad'); } TC.sound('cash'); if (ok) TC.toast(ok, 'ok'); if (TC.App && TC.App.after) TC.App.after(); draw(); };
    el.onclick = async e => {
      if (e.target === el || e.target.closest('.modal-x') || e.target.closest('[data-close]')) return md.close();
      const t = e.target.closest('button'); if (!t) return; const d = t.dataset, v = id => +(el.querySelector('#' + id) || {}).value;
      try {
        if (d.frtab) { tab = d.frtab; draw(); }
        else if (d.frsub) done(F.subscribe(d.frsub), '🛡️ Contrat souscrit. Couvert dans 24 h.');
        else if (d.frcancel) { F.cancel(d.frcancel); draw(); }
        else if (d.frtax) { md.close(); TC.Tax.payModal(); }
        else if (d.frtop) done(F.topUp(v('fr-top')), '💙 Ajouté à TradPay');
        else if (d.frout) done(F.withdraw(v('fr-out'), d.frout), d.frout === 'instant' ? '💙 Retrait reçu' : '💙 Retrait programmé (1 jour ouvré)');
        else if (d.frsnd) { const f = ((TC.Net && TC.Net.friends) || []).find(x => x.uid === el.querySelector('#fr-to').value); if (!f) return; t.disabled = true; await F.sendFriend(f, v('fr-snd')); done({ ok: true }, '💙 Envoyé à ' + f.pseudo); }
      } catch (x) { done({ ok: false, msg: x.userMsg || x.message || 'Erreur' }); }
      if (t && document.body.contains(t)) t.disabled = false;
    };
    el.onchange = e => { if (e.target.id === 'fr-auto') { fr().fonc.auto = e.target.checked; G.save(true); } };
    draw();
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-fr]'); if (b) F.open(b.dataset.fr); });
})();

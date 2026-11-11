/* Trad Center — impôt progressif sur les revenus passifs (recettes des commerces et loyers)
 * Barème par tranches de patrimoine, comme l'impôt français : 0 %, 11 %, 30 %, 41 %, 45 %.
 * Le taux appliqué est le taux MOYEN du barème (calcul tranche par tranche) : il monte en douceur
 * avec la richesse, sans effet de seuil, et tend vers 45 % sans jamais le dépasser.
 * L'argent des impôts sort du jeu (il freine l'inflation des très riches).
 */
(function () {
  const X = TC.Tax = {};
  X.BRACKETS = [[10e3, 0], [100e3, 0.11], [1e6, 0.30], [10e6, 0.41], [Infinity, 0.45]];
  X.MAX = 0.45;
  X.rate = function (nw) {
    nw = Math.max(0, nw == null ? TC.Game.netWorth() : nw); if (!nw) return 0;
    let tax = 0, prev = 0;
    for (const [top, r] of X.BRACKETS) { const part = Math.min(nw, top) - prev; if (part <= 0) break; tax += part * r; prev = top; }
    return Math.min(X.MAX, tax / nw);
  };
  // { gross, tax, net, rate } pour un revenu brut
  X.on = function (gross) {
    const rate = X.rate(); const tax = Math.round(gross * rate * 100) / 100;
    return { gross, tax, net: Math.round((gross - tax) * 100) / 100, rate };
  };
  X.pct = r => (Math.round(r * 1000) / 10).toString().replace('.', ',') + ' %';
  X.paid = s => (s && s.stats && s.stats.taxes) || 0;
  X.pay = function (tax) { const st = TC.Game.state.stats; st.taxes = (st.taxes || 0) + tax; };

  /* ---------- Impôts à payer soi-même ----------
   * Chaque impôt dû a 3 jours pour être payé. Passé ce délai : majoration de 10 % et compte bloqué
   * (plus aucun achat, pari, virement, commerce, coffre…) jusqu'au paiement. Revendre reste possible. */
  X.DELAY = 3 * 86400000; X.LATE = 0.10;
  const S = () => TC.Game.state;
  const bills = () => (S().taxBills || (S().taxBills = []));
  X.owe = function (amt, what) {
    amt = Math.round(amt * 100) / 100; if (!(amt > 0)) return;
    const today = new Date().toDateString(), b = bills();
    const last = b[b.length - 1];
    if (last && !last.late && new Date(last.at).toDateString() === today) last.amt = Math.round((last.amt + amt) * 100) / 100; // un avis par jour
    else b.push({ amt, at: Date.now(), what: what || 'revenus' });
    TC.Game.save(); X.bar();
  };
  X.due = () => Math.round(bills().reduce((t, b) => t + b.amt, 0) * 100) / 100;
  X.deadline = () => bills().length ? Math.min(...bills().map(b => b.at)) + X.DELAY : null;
  X.blocked = function () {
    let changed = false;
    bills().forEach(b => { if (!b.late && Date.now() > b.at + X.DELAY) { b.late = true; b.amt = Math.round(b.amt * (1 + X.LATE) * 100) / 100; changed = true; } });
    if (changed) { TC.Game.save(true); setTimeout(X.bar, 0); }
    return bills().some(b => b.late);
  };
  X.payAll = function () {
    const due = X.due(); if (!due) return { ok: true, paid: 0 };
    const cash = S().cash; if (cash <= 0) return { ok: false, msg: 'Pas de cash : revends des actifs ou des objets pour payer.' };
    let left = Math.min(cash, due), paid = 0;
    const b = bills().sort((x, y) => (y.late ? 1 : 0) - (x.late ? 1 : 0) || x.at - y.at); // d'abord les impôts en retard
    while (b.length && left > 0) { const x = b[0], p = Math.min(x.amt, left); x.amt = Math.round((x.amt - p) * 100) / 100; left -= p; paid += p; if (x.amt <= 0.004) b.shift(); }
    paid = Math.round(paid * 100) / 100;
    S().cash -= paid; X.pay(paid); // payer ses impôts compte dans les gains de la semaine (comme avant, quand ils étaient retenus)
    S().log.unshift({ t: Date.now(), kind: 'item', eur: paid, asset: '🏛️ Paiement des impôts' });
    TC.Game.save(true); X.bar();
    return { ok: true, paid, rest: X.due() };
  };
  X.payModal = function () {
    const fmt = TC.fmt, due = X.due(), bl = X.blocked(), dl = X.deadline();
    const md = TC.modal(`<h2>🏛️ Mes impôts</h2><div class="modal-body">
      ${bl ? '<div class="nbox warn">⛔ <b>Compte bloqué</b> : des impôts n\'ont pas été payés à temps (+10 % de majoration). Tu ne peux plus rien acheter ni dépenser tant qu\'ils ne sont pas réglés.</div>' : ''}
      <div class="kv"><span>À payer</span><b>${fmt.eur(due)}</b>${!bl && dl ? `<span>Avant le</span><b>${new Date(dl).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</b>` : ''}<span>Cash disponible</span><b>${fmt.eur(S().cash)}</b><span>Déjà payés</span><b>${fmt.eur(X.paid(S()))}</b></div>
      ${bills().length ? `<div class="tax-bills">${bills().map(b => `<div><span>${new Date(b.at).toLocaleDateString('fr-FR')} · ${TC.esc(b.what)}${b.late ? ' <i class="down">en retard +10 %</i>' : ''}</span><b>${fmt.eur(b.amt)}</b></div>`).join('')}</div>` : '<p class="muted">Tu ne dois rien aux impôts 👍</p>'}
      ${due && S().cash < due ? `<p class="hint">Il te manque ${fmt.eur(due - S().cash)} : revends des actifs, des objets ou un commerce pour avoir du cash.</p>` : ''}
      <p class="hint">Les impôts portent sur les recettes des commerces et les loyers (taux ${X.pct(X.rate())} pour ton patrimoine). Tu as 3 jours pour payer chaque avis.</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Fermer</button>${due ? `<button class="btn btn-gold" id="tax-pay" ${S().cash > 0 ? '' : 'disabled'}>${S().cash >= due ? 'Payer ' + fmt.eur(due) : 'Payer ce que je peux (' + fmt.eur(S().cash) + ')'}</button>` : ''}</div></div>`);
    const b = md.el.querySelector('#tax-pay');
    if (b) b.onclick = () => { const r = X.payAll(); md.close(); if (r.ok && r.paid) { TC.sound('kaching'); TC.toast(r.rest ? `🏛️ ${fmt.eur(r.paid)} payés, reste ${fmt.eur(r.rest)}` : `✅ Impôts payés (${fmt.eur(r.paid)}). Merci !`, 'ok', 5000); } else if (!r.ok) TC.toast(r.msg, 'bad'); if (TC.App) TC.App.after(); if (TC.Bank && TC.Bank.refresh) TC.Bank.refresh(); };
  };
  // bandeau en haut de l'écran tant qu'il reste des impôts à payer
  X.bar = function () {
    if (!document.body) return;
    let el = document.getElementById('tax-bar'); const due = X.due();
    if (!due) { if (el) el.remove(); return; }
    const bl = X.blocked(), dl = X.deadline();
    if (!el) { el = document.createElement('button'); el.id = 'tax-bar'; el.onclick = () => X.payModal(); document.body.prepend(el); }
    el.className = bl ? 'blocked' : '';
    el.innerHTML = bl ? `⛔ <b>Compte bloqué</b> · impôts impayés : ${TC.fmt.eur(due)} · <u>Payer</u>` : `🏛️ Impôts à payer : <b>${TC.fmt.eur(due)}</b> · avant le ${new Date(dl).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · <u>Payer</u>`;
  };
  X.guard = function () { // à appeler avant toute dépense
    if (!X.blocked()) return null;
    const msg = '⛔ Compte bloqué : paie d\'abord tes impôts';
    TC.toast(msg + ' (bandeau rouge en haut).', 'bad', 5000); setTimeout(X.payModal, 300);
    return msg;
  };
  // blocage des dépenses du jeu (revendre reste possible)
  const G = TC.Game;
  ['buy', 'open', 'bet', 'buyItem', 'takeForTransfer'].forEach(k => { const f = G[k]; if (!f) return; G[k] = function () { const m = X.guard(); if (m) return { ok: false, msg: m }; return f.apply(this, arguments); }; });
  // et des autres dépenses (modules chargés après celui-ci)
  function wrapLater() {
    const toast = [['City', 'buy'], ['City', 'takeover'], ['Chest', 'open'], ['Style', 'buy'], ['Style', 'subscribe'], ['Bot', 'unlock']];
    const thr = [['Clan', 'create'], ['Clan', 'give'], ['PlusGift', 'sponsor'], ['PlusGift', 'giveWeek']];
    toast.forEach(([m, k]) => { const o = TC[m]; if (!o || !o[k] || o[k].__tax) return; const f = o[k]; o[k] = function () { if (X.guard()) return; return f.apply(this, arguments); }; o[k].__tax = 1; });
    thr.forEach(([m, k]) => { const o = TC[m]; if (!o || !o[k] || o[k].__tax) return; const f = o[k]; o[k] = function () { const msg = X.guard(); if (msg) return Promise.reject(new Error(msg)); return f.apply(this, arguments); }; o[k].__tax = 1; });
    X.bar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrapLater); else setTimeout(wrapLater, 0);
  setInterval(X.bar, 60000);
  X.info = function () {
    const fmt = TC.fmt, me = TC.Game.netWorth();
    const ex = [5e3, 50e3, 500e3, 5e6, 50e6, 1e9];
    TC.modal(`<h2>🏛️ Impôt sur les revenus</h2><div class="modal-body">
      <p>Les recettes des <b>commerces</b> et les <b>loyers</b> sont imposés selon ton patrimoine. Plus tu es riche, plus le taux monte, jusqu'à <b>45 % maximum</b>.</p>
      <div class="nbox">Ton taux actuel : <b>${X.pct(X.rate(me))}</b> (patrimoine ${fmt.eur(me, true)})</div>
      <h4>Barème par tranche de patrimoine</h4>
      <div class="kv"><span>Jusqu'à 10 000 €</span><b>0 %</b><span>10 000 € à 100 000 €</span><b>11 %</b><span>100 000 € à 1 M€</span><b>30 %</b><span>1 M€ à 10 M€</span><b>41 %</b><span>Au-delà de 10 M€</span><b>45 %</b></div>
      <h4>Taux réellement appliqué</h4>
      <div class="kv">${ex.map(v => `<span>Patrimoine ${fmt.eur(v, true)}</span><b>${X.pct(X.rate(v))}</b>`).join('')}</div>
      <p class="hint">Comme pour le vrai impôt, chaque tranche n'est taxée qu'à son propre taux : le taux monte en douceur, gagner plus ne fait jamais perdre d'argent. Impôts déjà payés : <b>${fmt.eur(X.paid(TC.Game.state))}</b>.</p>
      <div class="modal-actions"><button class="btn btn-gold" data-close>OK</button></div></div>`);
  };
  document.addEventListener('click', e => { if (e.target.closest('[data-taxinfo]')) X.info(); });
})();

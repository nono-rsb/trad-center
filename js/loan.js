/* Trad Center — prêts de la banque (argent du jeu), avec intérêts.
 * Un prêt à la fois. Montant maximum selon le patrimoine (la moitié, entre 50 € et 1 000 000 €).
 * Durées : 1 jour (+5 %), 3 jours (+12 %), 7 jours (+25 %). On rembourse quand on veut, sinon prélèvement automatique à l'échéance.
 * Pas assez de cash à l'échéance : ce qui manque reste dû avec une pénalité de 10 %, et pas de nouveau prêt tant que ce n'est pas réglé.
 * La dette est retirée du patrimoine : emprunter ne fait pas monter au classement (les intérêts, eux, font baisser).
 */
(function () {
  const { esc, fmt } = TC;
  const G = TC.Game, S = () => G.state;
  const L = TC.Loan = {};
  L.PLANS = [{ days: 1, rate: 0.05 }, { days: 3, rate: 0.12 }, { days: 7, rate: 0.25 }];
  L.PENALTY = 0.10;
  const cur = () => S().loan || null;
  L.debt = () => { const l = cur(); return l ? Math.max(0, Math.round((l.due - l.paid) * 100) / 100) : 0; };
  // le patrimoine compte la dette en moins
  const nw0 = G.netWorth; G.netWorth = () => nw0() - L.debt();
  L.max = () => Math.floor(Math.max(50, Math.min(1e6, (G.netWorth() + L.debt()) * 0.5)));
  const r2 = v => Math.round(v * 100) / 100;
  function log(kind, eur, asset) { S().log.unshift({ t: Date.now(), kind, eur, asset }); if (S().log.length > 300) S().log.length = 300; }
  const after = () => { if (TC.App) TC.App.after(); if (TC.Bank) TC.Bank.refresh(); };

  L.take = function (amount, plan) {
    amount = Math.floor(+amount); const p = L.PLANS[plan];
    if (cur()) throw new Error(cur().late ? 'Rembourse d\'abord ton prêt en retard.' : 'Tu as déjà un prêt en cours.');
    if (!p) throw new Error('Choisis une durée.');
    if (!(amount >= 10)) throw new Error('Minimum 10 €.');
    if (amount > L.max()) throw new Error(`Maximum ${fmt.eur(L.max())} (la moitié de ton patrimoine).`);
    const now = Date.now();
    S().loan = { p: amount, rate: p.rate, days: p.days, due: r2(amount * (1 + p.rate)), paid: 0, at: now, end: now + p.days * 86400000, late: false };
    S().cash += amount; log('loan', amount, `🏦 Prêt Trad Banque (${p.days} j, +${Math.round(p.rate * 100)} %)`);
    G.save(true); TC.sound('kaching'); after();
    return S().loan;
  };
  L.repay = function (amount) {
    const l = cur(); if (!l) return;
    const left = L.debt(); amount = r2(Math.min(left, amount == null ? left : +amount, S().cash));
    if (!(amount > 0)) throw new Error('Pas assez de cash pour rembourser.');
    S().cash -= amount; l.paid = r2(l.paid + amount); log('repay', amount, '🏦 Remboursement du prêt');
    if (L.debt() <= 0.004) { S().loan = null; (S().loanHist || (S().loanHist = [])).unshift({ p: l.p, due: l.due, at: l.at, done: Date.now(), late: !!l.late }); TC.toast('✅ Prêt remboursé en entier. Tu peux en demander un nouveau.', 'ok', 5000); }
    G.save(true); after();
  };
  // échéance : prélèvement automatique
  function check() {
    const l = cur(); if (!l || Date.now() < l.end || l.late) return;
    const left = L.debt(), take = r2(Math.min(left, Math.max(0, S().cash)));
    if (take > 0) { S().cash -= take; l.paid = r2(l.paid + take); log('repay', take, '🏦 Prélèvement automatique du prêt'); }
    if (L.debt() <= 0.004) { S().loan = null; TC.toast(`🏦 Ton prêt est arrivé à échéance : ${fmt.eur(take)} prélevés. Il est remboursé.`, 'info', 7000); }
    else {
      l.late = Date.now(); const pen = r2(L.debt() * L.PENALTY); l.due = r2(l.due + pen);
      TC.toast(`⚠️ Prêt en retard : il te manque ${fmt.eur(L.debt())} (pénalité de ${fmt.eur(pen)} incluse). Rembourse dans Trad Banque.`, 'bad', 9000);
    }
    G.save(true); after();
  }
  setInterval(check, 30000); setTimeout(check, 3000);

  /* ---------- Trad Banque : bloc « Prêt » de l'accueil ---------- */
  L.panel = function () {
    const l = cur();
    if (!l) return `<div class="bk-panel bk-loan"><h3>🏦 Prêt</h3><p class="muted">Besoin de cash ? Emprunte jusqu'à <b>${fmt.eur(L.max())}</b>. Intérêts : 1 jour +5 %, 3 jours +12 %, 7 jours +25 %.</p><button class="btn btn-gold bk-full" data-loan>Demander un prêt</button></div>`;
    const left = L.debt(), ms = l.end - Date.now(), pct = Math.min(100, l.paid / l.due * 100);
    return `<div class="bk-panel bk-loan ${l.late ? 'late' : ''}"><h3>🏦 Prêt en cours <small>${l.late ? '⚠️ EN RETARD' : ms > 0 ? 'échéance ' + fmt.time(l.end) : ''}</small></h3>
      <div class="bk-flow"><div><small>Emprunté</small><b>${fmt.eur(l.p)}</b></div><div><small>Reste à rembourser</small><b class="out">${fmt.eur(left)}</b></div></div>
      <div class="bk-lbar"><i style="width:${pct}%"></i></div>
      <p class="hint">${l.late ? 'Pénalité de 10 % ajoutée. Pas de nouveau prêt tant que ce n\'est pas remboursé.' : `Total à rembourser ${fmt.eur(l.due)} (intérêts ${fmt.eur(l.due - l.p)}). Prélevé automatiquement à l'échéance s'il n'est pas remboursé avant.`}</p>
      <div class="bk-qamt"><button data-repay="all">Tout rembourser</button>${left > 20 ? `<button data-repay="half">La moitié</button>` : ''}</div></div>`;
  };
  L.open = function () {
    let plan = 1;
    const md = TC.modal(`<h2>🏦 Demander un prêt</h2><div class="modal-body">
      <p>Tu peux emprunter jusqu'à <b>${fmt.eur(L.max())}</b> (la moitié de ton patrimoine).</p>
      <div class="bk-amtin"><input id="ln-amt" type="number" inputmode="numeric" min="10" step="1" placeholder="Montant" value="${Math.min(100, L.max())}"><span>€</span></div>
      <div class="bk-qamt">${[0.25, 0.5, 1].map(k => `<button data-lk="${Math.floor(L.max() * k)}">${fmt.eur(Math.floor(L.max() * k), true)}</button>`).join('')}</div>
      <div class="seg ln-plans">${L.PLANS.map((p, i) => `<button data-lp="${i}" class="${i === plan ? 'active' : ''}">${p.days} jour${p.days > 1 ? 's' : ''}<small>+${Math.round(p.rate * 100)} %</small></button>`).join('')}</div>
      <div class="kv" id="ln-sum"></div>
      <p class="hint">Si tu n'as pas assez de cash à l'échéance, ce qui manque reste dû avec <b>10 % de pénalité</b>. Emprunter ne fait pas monter ton patrimoine : la dette est comptée en moins.</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="ln-go">Emprunter</button></div></div>`);
    const amt = md.el.querySelector('#ln-amt'), sum = md.el.querySelector('#ln-sum');
    const upd = () => { const a = Math.floor(+amt.value || 0), p = L.PLANS[plan]; sum.innerHTML = `<span>Tu reçois</span><b>${fmt.eur(a)}</b><span>Intérêts</span><b class="out">${fmt.eur(r2(a * p.rate))}</b><span>Tu rembourses</span><b>${fmt.eur(r2(a * (1 + p.rate)))}</b><span>Avant le</span><b>${fmt.time(Date.now() + p.days * 86400000)}</b>`; };
    amt.oninput = upd; upd();
    md.el.querySelectorAll('[data-lk]').forEach(b => { b.onclick = () => { amt.value = b.dataset.lk; upd(); }; });
    md.el.querySelectorAll('[data-lp]').forEach(b => { b.onclick = () => { plan = +b.dataset.lp; md.el.querySelectorAll('[data-lp]').forEach(x => x.classList.toggle('active', x === b)); upd(); }; });
    md.el.querySelector('#ln-go').onclick = () => { try { const l = L.take(amt.value, plan); md.close(); TC.toast(`🏦 ${fmt.eur(l.p)} versés sur ton compte. À rembourser : ${fmt.eur(l.due)} avant le ${fmt.time(l.end)}.`, 'ok', 7000); } catch (e) { TC.toast(e.message, 'bad'); } };
  };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-loan]')) return L.open();
    const r = e.target.closest('[data-repay]'); if (!r) return;
    try { L.repay(r.dataset.repay === 'half' ? r2(L.debt() / 2) : null); } catch (x) { TC.toast(x.message, 'bad'); }
  });
})();

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

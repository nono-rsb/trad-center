/* Trad Center — le trading (marchés, ordres, levier, paris, bot) a été retiré du jeu.
 * Pour que personne n'y perde rien : tout ce qui était investi (actifs, positions à levier, paris en cours) est converti en cash
 * à sa dernière valeur connue, sans frais. Le patrimoine reste identique. Les actifs reçus d'un ami plus tard sont convertis de même. */
(function () {
  const G = TC.Game, fmt = TC.fmt, S = () => G.state;
  const r2 = v => Math.round(v * 100) / 100;
  function convert() {
    const s = S(); if (!s || !s.holdings) return;
    let total = 0, n = 0;
    Object.keys(s.holdings).forEach(id => {
      const h = s.holdings[id], v = G.holdingValue(id) || h.lastVal || h.cost || 0; total += v; n++; delete s.holdings[id];
    });
    (s.positions || []).splice(0).forEach(p => { total += G.posValue(p) || p.margin || 0; n++; });
    (s.bets || []).splice(0).forEach(b => { total += b.stake || 0; n++; });
    if (s.bot && s.bot.on) s.bot.on = false;
    if (!n) return;
    total = r2(total); s.cash += total;
    s.log.unshift({ t: Date.now(), kind: 'life', eur: total, asset: '📈 Fin du trading : placements convertis en cash' }); if (s.log.length > 300) s.log.length = 300;
    G.save(true);
    if (total >= 0.01) TC.toast(`📈 Le trading a été retiré du jeu. Tes placements ont été convertis en cash : <b>+${fmt.eur(total)}</b> (ton patrimoine ne change pas).`, 'info', 9000);
    if (TC.App && TC.App.after) TC.App.after();
  }
  setInterval(() => { try { convert(); } catch (e) { console.warn('notrade', e); } }, 20000);
  setTimeout(() => { try { convert(); } catch (e) { console.warn('notrade', e); } }, 3000);
})();

/* Trad Center — événement pour rire : « Votez-vous pour Teddy Riner ? »
 * Grande page plein écran avec une caricature dessinée (dessin original), OUI / NON.
 * OUI : +50 € · NON : −20 € (argent du jeu, jamais sous 0), une seule fois par joueur.
 * Gains/pertes exclus du championnat de la semaine. Sondage pour rire : aucun vrai vote derrière.
 */
(function () {
  const { $, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const EV = 'teddy-2026-11', YES = 50, NO = 20;
  const T = TC.Teddy = {};

  async function tally() {
    try {
      const db = N.db(); if (!db || !N.user) return null;
      const [y, n] = await Promise.all(['oui', 'non'].map(v => db.collection('users').where('teddyVote', '==', v).get().then(s => s.size)));
      return { y, n };
    } catch (e) { return null; }
  }

  async function vote(v, page) {
    if (S().events && S().events[EV]) return;
    (S().events || (S().events = {}))[EV] = v;
    const amt = v === 'oui' ? YES : -Math.min(NO, S().cash);
    S().cash += amt; if (TC.Weekly) TC.Weekly.flow(amt);
    S().log.unshift({ t: Date.now(), kind: 'bonus', eur: amt, asset: 'Vote Teddy Riner : ' + v });
    G.save(true); if (TC.App) TC.App.after();
    if (N.user && N.db()) { try { await N.db().collection('users').doc(N.user.uid).update({ teddyVote: v, updatedAt: Date.now() }); } catch (e) { } }
    if (v === 'oui') { TC.sound('kaching'); TC.confetti(220); } else { TC.sound('lose'); page.classList.add('quake'); }
    const t = await tally();
    page.querySelector('.td-vote').innerHTML = `
      <div class="td-res ${v}">${v === 'oui' ? `🥋 Excellent choix ! <b>+${fmt.eur(YES)}</b>` : `😤 Mauvaise réponse… <b>−${fmt.eur(-amt)}</b>`}</div>
      ${t && t.y + t.n ? `<div class="td-bar"><i style="width:${Math.round(t.y / (t.y + t.n) * 100)}%"></i></div><small>${Math.round(t.y / (t.y + t.n) * 100)} % de OUI · ${t.y + t.n} vote(s)</small>` : ''}
      <button class="btn btn-gold btn-xl" id="td-close">Retour au jeu</button>`;
    page.querySelector('#td-close').onclick = () => close(page);
  }
  function close(page) { page.classList.remove('in'); setTimeout(() => page.remove(), 400); }

  T.show = function (force) {
    if (!force && S().events && S().events[EV]) return;
    if ($('#teddy')) return;
    const page = document.createElement('div'); page.id = 'teddy';
    const voted = S().events && S().events[EV];
    page.innerHTML = `<div class="td-in">
      <div class="td-tag">🥋 ÉVÉNEMENT SPÉCIAL</div>
      <h1>VOTEZ-VOUS POUR<br><span>TEDDY RINER</span> ?</h1>
      <img src="icons/teddy.svg" alt="Caricature de Teddy Riner" class="td-img">
      <div class="td-name">TEDDY RINER</div>
      <div class="td-vote">${voted ? `<div class="td-res">Tu as déjà voté : <b>${voted.toUpperCase()}</b></div><button class="btn btn-gold btn-xl" id="td-close">Retour au jeu</button>`
        : `<div class="td-btns"><button class="td-yes" data-v="oui">OUI ✅</button><button class="td-no" data-v="non">NON ❌</button></div>`}</div>
      <small class="td-note">Sondage pour rire, dessin humoristique.</small></div>`;
    document.body.appendChild(page);
    requestAnimationFrame(() => page.classList.add('in'));
    page.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) vote(b.dataset.v, page); if (e.target.id === 'td-close') close(page); });
  };

  // apparaît une fois, quand aucune autre fenêtre n'est ouverte
  setTimeout(function wait() { if ($('#modal').classList.contains('open')) return setTimeout(wait, 3000); T.show(); }, 4000);
})();

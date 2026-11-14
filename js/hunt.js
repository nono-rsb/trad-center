/* Trad Center — 🗺️ chasse au trésor sur la carte de Trad City (événement programmé, voir EVENTS.md)
 * Pendant un événement qui a un champ "hunt" (events.json), un trésor est caché dans un des monuments de la carte.
 * La cachette est différente pour chaque joueur (tirée de l'id de l'événement + uid) : inutile de se la passer.
 * Fouiller un mauvais monument donne un indice. Trouvé : petite prime, une seule fois par événement,
 * réservée aux vrais comptes (pas invité, pas double compte) et exclue du championnat de la semaine.
 */
(function () {
  const { esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const H = TC.Hunt = { MAX: 50 }; // prime plafonnée : une faute de frappe dans events.json ne peut pas casser l'économie
  const SPOTS = ['bourse', 'conc', 'agence', 'bijou', 'coffre', 'labo', 'mairie', 'parc']; // = monuments de js/city.js
  const NAMES = { bourse: 'la Bourse', conc: 'la Concession', agence: 'l\'Agence immo', bijou: 'la Bijouterie', coffre: 'le Coffre', labo: 'le Labo du bot', mairie: 'la Mairie', parc: 'le Parc' };
  const RIDDLES = {
    bourse: 'Là où les cours montent et descendent toute la journée…',
    conc: 'Ça sent le pneu neuf et les moteurs qui rugissent…',
    agence: 'On y garde les clés de toutes les maisons de la ville…',
    bijou: 'Ça brille, ça scintille… et c\'est hors de prix.',
    coffre: 'On l\'ouvre en croisant les doigts pour tomber sur du rare…',
    labo: 'Un robot y fait des calculs jour et nuit…',
    mairie: 'Le bureau de celui qui porte la couronne…',
    parc: 'Des arbres, un banc et beaucoup de pigeons…',
  };

  H.event = () => TC.Events ? TC.Events.active().find(e => e.hunt && typeof e.hunt === 'object') || null : null;
  H.prize = e => { const p = +((e && e.hunt && e.hunt.prize) || 0); return isFinite(p) ? Math.max(0, Math.min(H.MAX, p)) : 0; };
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  H.spot = e => SPOTS[hash(e.id + ':' + (N && N.user ? N.user.uid : 'invite')) % SPOTS.length];
  const found = e => !!(S().hunt && S().hunt[e.id]);
  H.hunting = () => { const e = H.event(); return !!e && !found(e); };
  // vrai compte : pas invité, pas marqué double compte
  function why() {
    if (!N || !N.enabled || !N.user || !N.profile) return 'Crée ton compte (onglet Amis) pour garder le trésor !';
    if (N.profile.guest) return 'Tu joues en invité : crée ton compte (onglet Amis) pour garder le trésor !';
    if (N.profile.dupOf && N.profile.dupOf.length) return 'Ce compte est lié à un autre compte du même appareil : pas de trésor.';
    return null;
  }

  // Appelé par la carte quand on touche un monument. Renvoie true si la fouille remplace l'action normale.
  H.dig = function (id) {
    const e = H.event(); if (!e || found(e) || !SPOTS.includes(id)) return false;
    const st = S().huntDig || (S().huntDig = {});
    if (st.id !== e.id) { st.id = e.id; st.n = 0; }
    st.n++;
    const spot = H.spot(e);
    if (id !== spot) {
      if (TC.sound) TC.sound('click');
      TC.toast(`🔍 Rien dans ${esc(NAMES[id])}… 🧭 Indice : <i>${esc(RIDDLES[spot])}</i>`, 'info', 6500);
      return true;
    }
    const no = why();
    if (no) { TC.toast(`💎 Tu as trouvé le trésor dans ${esc(NAMES[id])} ! ${esc(no)}`, 'info', 8000); return true; }
    const p = H.prize(e);
    (S().hunt || (S().hunt = {}))[e.id] = Date.now();
    if (p > 0) {
      S().cash += p; if (TC.Weekly) TC.Weekly.flow(p); // la prime ne compte pas dans le championnat (ni dans les duels)
      S().log.unshift({ t: Date.now(), kind: 'bonus', eur: p, asset: '💎 Trésor de Trad City' });
    }
    G.save(true);
    if (TC.Progress && TC.Progress.xp) try { TC.Progress.xp(50); } catch (x) { }
    if (TC.sound) TC.sound('kaching'); if (TC.confetti) TC.confetti(180);
    TC.modal(`<div class="center"><div class="big-emoji">💎</div><h2>Trésor trouvé !</h2>
      <p>Il était caché dans <b>${esc(NAMES[id])}</b>, trouvé en <b>${st.n}</b> fouille${st.n > 1 ? 's' : ''}.</p>
      ${p > 0 ? `<p>Ta récompense : <b>+${fmt.eur(p)}</b> et <b>+50 XP</b> 🎉</p><p class="hint">Chaque joueur a sa propre cachette. La prime ne compte pas dans le championnat.</p>` : ''}
      <div class="modal-actions"><button class="btn btn-gold btn-xl" data-close>Super 💰</button></div></div>`);
    if (TC.App && TC.App.after) TC.App.after();
    return true;
  };
})();

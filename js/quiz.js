/* Trad Center — quiz finance éclair (pop-up, disponible 2 heures)
 * 10 questions, +15 € par bonne réponse, +50 € de bonus pour un sans-faute. Une seule fois par joueur.
 * Gains exclus du championnat de la semaine. Après chaque réponse, une courte explication.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, S = () => G.state;
  const Q = TC.Quiz = {};
  const ID = 'quiz-finance-2026-11-11';
  const END = Date.parse('2026-11-11T14:30:00+01:00'); // disparaît à 14 h 30 (heure de Paris)
  const PER = 15, PERFECT = 50;
  const over = () => Date.now() >= END;
  const QUESTIONS = [
    { q: 'Que représente le CAC 40 ?', a: ['Les 40 plus grandes entreprises cotées à la Bourse de Paris', 'Une taxe de 40 % sur les gains', 'Les 40 plus grandes banques du monde', 'Une cryptomonnaie française'], x: 'Le CAC 40 est l\'indice phare de la Bourse de Paris : il suit 40 grandes entreprises françaises (LVMH, TotalEnergies, Airbus…).' },
    { q: 'Qu\'est-ce qu\'un dividende ?', a: ['Une part des bénéfices versée aux actionnaires', 'Une amende de la Bourse', 'Le prix d\'une action', 'Un prêt bancaire'], x: 'Quand une entreprise fait des bénéfices, elle peut en reverser une partie à ses actionnaires : c\'est le dividende.' },
    { q: 'En quelle année le Bitcoin a-t-il été lancé ?', a: ['2009', '2001', '2014', '2017'], x: 'Le Bitcoin a été lancé en janvier 2009 par un créateur anonyme, Satoshi Nakamoto.' },
    { q: 'À quoi sert la diversification d\'un portefeuille ?', a: ['À réduire le risque', 'À payer moins d\'impôts', 'À gagner à coup sûr', 'À acheter plus vite'], x: 'Mettre son argent dans plusieurs placements différents évite de tout perdre si l\'un d\'eux s\'effondre.' },
    { q: 'Un marché qui baisse longtemps est appelé…', a: ['Un marché baissier (« bear market », l\'ours)', 'Un marché haussier (« bull market », le taureau)', 'Un marché noir', 'Un krach éclair'], x: 'L\'ours frappe vers le bas avec ses pattes : marché qui baisse. Le taureau donne des coups de cornes vers le haut : marché qui monte.' },
    { q: 'L\'inflation est de 3 % et ton épargne rapporte 1 %. Ton pouvoir d\'achat…', a: ['Baisse', 'Augmente', 'Ne change pas', 'Double'], x: 'Les prix montent plus vite que ton argent : avec la même somme, tu peux acheter un peu moins chaque année.' },
    { q: 'Avec un levier x10, si le prix baisse de 10 %…', a: ['Tu perds toute ta mise', 'Tu perds 1 %', 'Tu perds 10 %', 'Tu gagnes 10 %'], x: 'Le levier multiplie les gains ET les pertes : 10 % de baisse × 10 = 100 % de ta mise perdue. C\'est la liquidation.' },
    { q: 'Qui fixe les taux d\'intérêt directeurs de la zone euro ?', a: ['La Banque centrale européenne (BCE)', 'Le président de la République', 'La Bourse de Paris', 'Les banques privées'], x: 'La BCE, basée à Francfort, fixe les taux directeurs pour lutter contre l\'inflation dans les pays qui utilisent l\'euro.' },
    { q: 'Acheter une obligation, c\'est…', a: ['Prêter de l\'argent à un État ou une entreprise contre des intérêts', 'Devenir propriétaire d\'une entreprise', 'Acheter une cryptomonnaie', 'Payer une amende'], x: 'Une obligation est un prêt : l\'émetteur te verse des intérêts puis te rembourse. Une action, elle, fait de toi un copropriétaire.' },
    { q: 'Les « intérêts composés », c\'est…', a: ['Gagner des intérêts sur les intérêts déjà gagnés', 'Des intérêts payés deux fois par an', 'Une arnaque bancaire', 'Des intérêts sans risque'], x: 'Tes gains s\'ajoutent au capital et rapportent à leur tour : avec le temps, l\'argent grossit de plus en plus vite.' },
  ];

  const st = () => (S().events || (S().events = {}));
  const done = () => !!st()[ID];
  const left = () => { const ms = END - Date.now(), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60; return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };
  function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

  let i = 0, score = 0, page = null;
  function close() { if (!page) return; page.classList.remove('in'); const p = page; page = null; setTimeout(() => p.remove(), 350); chip(); }
  function render() {
    const box = page.querySelector('.qz-body');
    if (i >= QUESTIONS.length) return finish(box);
    const item = QUESTIONS[i], opts = shuffle(item.a.map((t, k) => ({ t, ok: k === 0 })));
    box.innerHTML = `<div class="qz-prog"><i style="width:${i / QUESTIONS.length * 100}%"></i></div>
      <div class="qz-n">Question ${i + 1} / ${QUESTIONS.length} · ${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''}</div>
      <h2>${esc(item.q)}</h2>
      <div class="qz-opts">${opts.map(o => `<button class="qz-o" data-ok="${o.ok ? 1 : 0}">${esc(o.t)}</button>`).join('')}</div>
      <div class="qz-x"></div>`;
    box.querySelectorAll('.qz-o').forEach(b => b.onclick = () => {
      if (box.dataset.answered) return; box.dataset.answered = 1;
      const ok = b.dataset.ok === '1'; if (ok) score++;
      box.querySelectorAll('.qz-o').forEach(o => { o.disabled = true; if (o.dataset.ok === '1') o.classList.add('good'); });
      if (!ok) b.classList.add('bad');
      TC.sound(ok ? 'win' : 'lose');
      box.querySelector('.qz-x').innerHTML = `<p><b>${ok ? '✅ Bonne réponse ! +' + fmt.eur(PER) : '❌ Raté.'}</b> ${esc(item.x)}</p><button class="btn btn-gold btn-xl qz-next">${i + 1 < QUESTIONS.length ? 'Question suivante →' : 'Voir mon résultat 🏆'}</button>`;
      box.querySelector('.qz-next').onclick = () => { delete box.dataset.answered; i++; render(); };
    });
  }
  function finish(box) {
    const perfect = score === QUESTIONS.length, gain = score * PER + (perfect ? PERFECT : 0);
    if (!done()) {
      st()[ID] = { score, at: Date.now() };
      if (gain) { S().cash += gain; if (TC.Weekly) TC.Weekly.flow(gain); S().log.unshift({ t: Date.now(), kind: 'bonus', eur: gain, asset: `Quiz finance : ${score}/${QUESTIONS.length}` }); }
      G.save(true); if (TC.App) TC.App.after();
      if (TC.Net && TC.Net.user && TC.Net.db()) TC.Net.db().collection('users').doc(TC.Net.user.uid).update({ quizScore: score, quizId: ID, updatedAt: Date.now() }).catch(() => { });
    }
    if (gain) TC.sound('kaching'); if (perfect) TC.confetti(240);
    const msg = perfect ? 'Sans-faute ! Tu es un vrai trader 🧠' : score >= 7 ? 'Très bien joué !' : score >= 4 ? 'Pas mal, tu progresses !' : 'La finance, ça s\'apprend : retente ta chance au prochain quiz !';
    box.innerHTML = `<div class="qz-end"><div class="big-emoji">${perfect ? '🏆' : score >= 7 ? '🥇' : score >= 4 ? '👍' : '📚'}</div>
      <h2>${score} / ${QUESTIONS.length}</h2><p>${msg}</p>
      ${gain ? `<p class="qz-gain">+${fmt.eur(gain)}${perfect ? ` <small>(dont ${fmt.eur(PERFECT)} de bonus sans-faute)</small>` : ''}</p>` : ''}
      <button class="btn btn-gold btn-xl" id="qz-close">Retour au jeu</button></div>`;
    box.querySelector('#qz-close').onclick = close;
  }
  Q.show = function () {
    if (over() || page) return;
    if ($('#qz-chip')) $('#qz-chip').remove();
    page = document.createElement('div'); page.id = 'quiz';
    page.innerHTML = `<div class="qz-in"><button class="qz-x-btn" aria-label="Fermer">✕</button>
      <div class="qz-tag">🧠 QUIZ FINANCE · encore ${left()}</div>
      <div class="qz-body">${done() ? '' : `<h1>Quiz éclair de la finance</h1>
        <p>10 questions sur la Bourse, les cryptos et l'argent.<br><b>+${fmt.eur(PER)}</b> par bonne réponse, <b>+${fmt.eur(PERFECT)}</b> de bonus si tu fais 10/10.</p>
        <p class="muted">Une seule tentative, disponible pendant encore ${left()}.</p>
        <button class="btn btn-gold btn-xl" id="qz-go">C'est parti 🚀</button>`}</div></div>`;
    document.body.appendChild(page);
    requestAnimationFrame(() => page.classList.add('in'));
    page.querySelector('.qz-x-btn').onclick = close;
    if (done()) { const r = st()[ID]; page.querySelector('.qz-body').innerHTML = `<div class="qz-end"><div class="big-emoji">✅</div><h2>Déjà fait : ${r.score} / ${QUESTIONS.length}</h2><p>Rendez-vous au prochain quiz !</p><button class="btn btn-gold btn-xl" id="qz-close">OK</button></div>`; page.querySelector('#qz-close').onclick = close; return; }
    page.querySelector('#qz-go').onclick = () => { i = 0; score = 0; render(); };
  };
  // petit bouton pour revenir au quiz si on l'a fermé avant la fin
  function chip() {
    if (over() || done() || page || $('#qz-chip')) return;
    const c = document.createElement('button'); c.id = 'qz-chip'; c.innerHTML = `🧠 Quiz finance · <b>${left()}</b>`;
    c.onclick = () => Q.show(); document.body.appendChild(c);
  }
  // apparaît tout seul (quand aucune autre fenêtre n'est ouverte), puis disparaît à l'heure de fin
  setTimeout(function wait() {
    if (over() || done()) return;
    if ($('#modal').classList.contains('open') || $('#teddy')) return setTimeout(wait, 3000);
    Q.show();
  }, 5000);
  const timer = setInterval(() => {
    const c = $('#qz-chip'); if (c && !over()) c.innerHTML = `🧠 Quiz finance · <b>${left()}</b>`;
    if (!over()) return;
    clearInterval(timer); if (c) c.remove();
    if (page && !page.querySelector('.qz-end')) close();
  }, 30000);
})();

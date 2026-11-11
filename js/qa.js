/* Trad Center — onglet Questions : les joueurs posent une question, signalent un bug ou proposent une idée.
 * 1. Réponse automatique tout de suite quand la question porte sur une fonction connue du jeu.
 * 2. Le créateur voit toutes les questions dans son mode créateur et peut répondre (admin/qa).
 * 3. Les questions transmises à Claude reçoivent leur réponse via le fichier answers.json du site :
 *    idée juste = faite et annoncée ; sinon, explication de pourquoi ce n'est pas possible.
 * Le joueur est prévenu par notification quand une réponse arrive.
 */
(function () {
  const { esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const Q = TC.QA = {};
  const KINDS = { q: ['❓', 'Question'], idee: ['💡', 'Idée / modification'], bug: ['🐞', 'Bug'] };
  const st = () => S().qa || (S().qa = []);

  /* ---------- Réponses automatiques (fonctions du jeu) ---------- */
  const FAQ = [
    [['argent reel', 'vrai argent', 'retirer', 'paypal', 'carte bancaire', 'payer en vrai', 'vrais euros'], 'Tout l\'argent de Trad Center est fictif : on ne peut ni en mettre ni en retirer pour de vrai. Les cours des marchés, eux, sont réels.'],
    [['bonus', 'quotidien', 'cadeau du jour'], 'Le bonus quotidien 🎁 (en haut à droite) donne 10 € chaque jour (15 € avec le badge vérifié). Reviens chaque jour pour l\'encaisser.'],
    [['bot', 'robot de trading', 'trader a ma place'], 'Le bot de trading se débloque dans l\'onglet Portefeuille (100 €). Le mode 💎 Investisseur est le plus prudent ; le bouton « Tester sur 1 an de vrais cours » montre ses vraies chances. Aucun bot ne garantit de gagner.'],
    [['levier', 'liquid', 'x100', 'position short', 'position long'], 'Le levier (mode expert dans Paramètres) multiplie les gains ET les pertes. Avec x10, une baisse de 10 % efface toute ta mise (liquidation). Commence petit et utilise un stop-loss.'],
    [['impot', 'taxe', 'bloque', 'bandeau rouge'], 'Les impôts portent sur les revenus des commerces et des loyers. Paie-les avant la date limite (bandeau en haut), sinon ton compte est bloqué et la somme augmente de 10 %.'],
    [['banque', 'virement', 'envoyer de l argent', 'trad banque'], 'Trad Banque (Portefeuille → 🏦) sert à faire des virements à tes amis, voir ton relevé et parler à la conseillère. Le Trad Drop envoie de l\'argent en approchant deux téléphones.'],
    [['drop', 'qr', 'sans contact', 'camera', 'ma main'], 'Trad Drop : ton ami touche « Recevoir », toi « Envoyer », puis tu vises son QR code. Avec « Payer avec ma carte », ta carte apparaît dans ta main à la caméra : pose-la sur son téléphone.'],
    [['face id', 'empreinte', 'securite'], 'Active Face ID (ou l\'empreinte) dans Trad Banque → Sécurité : chaque paiement te le demandera. Ton visage ne quitte jamais ton téléphone.'],
    [['occaz', 'vinted', 'revendre', 'occasion', 'contrefacon'], 'Trad Occaz (Portefeuille → 🏷️) : achète des articles d\'occasion, négocie et revends-les plus cher. Méfie-toi des prix trop bas vendus par un nouveau membre : contrefaçon possible (litige dans l\'heure).'],
    [['avatar', 'personnage', 'coiffure', 'style'], 'Touche ton avatar → onglet 🧑 Avatar pour créer ton personnage (gratuit). Les articles de marque s\'achètent dans les autres onglets de « Mon style ».'],
    [['verifie', 'badge', 'trad center+', 'trad center plus'], 'Le badge vérifié ✓ s\'obtient avec Trad Center+ (999 € d\'argent du jeu par mois) : badge, cadre, bonus quotidien +50 %. Tu peux aussi l\'offrir à tes amis.'],
    [['championnat', 'semaine', '500'], 'Championnat de la semaine : le joueur qui gagne le plus d\'argent du lundi au dimanche remporte 500 €. Les envois entre amis ne comptent pas. Le créateur du jeu est hors concours.'],
    [['maire', 'election', 'vote', 'ville', 'trad city'], 'Dans Trad City, chaque semaine les joueurs votent pour le Maire. Le Maire fixe une taxe, fait des discours et protège des quartiers.'],
    [['clan'], 'Les clans se créent dans l\'onglet Amis. Le chef choisit le nom et le tag ; les membres cumulent leurs gains de la semaine.'],
    [['commerce', 'loyer', 'immobilier', 'revenu passif'], 'Les commerces (Trad City) et l\'immobilier (Boutique) rapportent de l\'argent chaque heure, même jeu fermé (24 à 48 h max). Pense à encaisser et à payer tes impôts.'],
    [['notification', 'notif'], 'Active les notifications avec 🔔 en haut : virements reçus, demandes d\'ami, alertes de prix. Sur iPhone, ajoute d\'abord le jeu à l\'écran d\'accueil.'],
    [['mot de passe', 'connexion', 'connecter'], 'Paramètres ⚙️ → Mon compte : « Changer mon mot de passe » ou « Mot de passe oublié » (un e-mail t\'est envoyé).'],
    [['supprimer', 'effacer mon compte'], 'Paramètres ⚙️ → Mon compte → Supprimer mon compte. C\'est définitif.'],
    [['pseudo', 'changer de nom', 'renommer'], 'Onglet Amis → ✏️ à côté de ton pseudo. Un changement toutes les 24 h.'],
    [['triche', 'cheat', 'hack', 'arnaque', 'sentinelle', 'suspendu', 'banni'], 'Sentinelle 🤖 surveille le jeu (triche, doubles comptes, insultes). Si ton compte est suspendu, la raison s\'affiche ; pour contester, pose une question ici.'],
    [['musique', 'le son', 'couper le son'], 'Paramètres ⚙️ → Musique de fond : coupe-la ou règle son volume.'],
    [['installer', 'ecran d accueil', 'appli'], 'Paramètres ⚙️ → Application → « Installer sur l\'écran d\'accueil ». Sur iPhone : Safari → Partager → « Sur l\'écran d\'accueil ».'],
  ];
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ');
  // un mot-clé doit commencer un mot (« impot » trouve « impots », mais « son » ne trouve pas « maison »)
  Q.auto = function (txt) { const t = ' ' + norm(txt).replace(/\s+/g, ' ') + ' '; let best = null, n = 0; FAQ.forEach(([keys, a]) => { const m = keys.filter(k => t.includes(' ' + norm(k).trim())).length; if (m > n) { n = m; best = a; } }); return best; };

  /* ---------- Réponses du créateur (admin/qa) et de Claude (answers.json) ---------- */
  let answers = {}, loadedAt = 0;
  Q.load = async function (force) {
    if (!force && Date.now() - loadedAt < 5 * 60000) return answers;
    loadedAt = Date.now(); const out = {};
    try { const j = await (await fetch('answers.json?t=' + Date.now(), { cache: 'no-store' })).json(); Object.entries(j.answers || {}).forEach(([id, a]) => { out[id] = Object.assign({ by: 'claude' }, a); }); } catch (e) { }
    try { if (N && N.db() && N.user) { const d = await N.db().collection('admin').doc('qa').get(); if (d.exists) Object.entries(d.data()).forEach(([id, a]) => { if (a && a.a) out[id] = Object.assign({ by: 'creator' }, a); }); } } catch (e) { }
    answers = out;
    // nouvelle réponse : petite alerte
    const seen = S().qaSeen || (S().qaSeen = {}); let fresh = 0;
    st().forEach(x => { if (answers[x.id] && !seen[x.id]) { seen[x.id] = Date.now(); fresh++; } });
    if (fresh) { G.save(); TC.toast(`💬 ${fresh > 1 ? fresh + ' nouvelles réponses' : 'Nouvelle réponse'} à tes questions <button class="btn btn-sm" data-qa>Voir</button>`, 'ok', 8000); }
    return answers;
  };
  const who = a => a.by === 'creator' ? '👑 Le créateur' : '🤖 Claude (assistant du créateur)';
  const STATUS = { fait: '✅ Fait', refuse: '🚫 Pas possible', reponse: '💬 Réponse', prevu: '🛠️ Prévu' };

  /* ---------- Envoyer ---------- */
  Q.ask = async function (kind, text) {
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 300);
    if (text.length < 5) throw new Error('Écris ta question (5 caractères minimum).');
    if (TC.Admin && TC.Admin.isBanned && N.user && TC.Admin.isBanned(N.user.uid)) throw new Error('Compte suspendu.');
    const recent = st().filter(x => Date.now() - x.t < 3600000).length; if (recent >= 5) throw new Error('5 questions maximum par heure : attends un peu.');
    const id = (N.user ? N.user.uid.slice(0, 6) : 'invite') + Date.now().toString(36);
    const item = { id, k: KINDS[kind] ? kind : 'q', q: text, t: Date.now(), auto: kind === 'q' ? Q.auto(text) : null };
    st().unshift(item); S().qa = st().slice(0, 40); G.save(true);
    if (N && N.db() && N.user) { // dans le profil public : le créateur et son assistant peuvent la lire
      const ask = st().filter(x => !x.local).slice(0, 8).map(({ id, k, q, t }) => ({ id, k, q, t }));
      await N.db().collection('users').doc(N.user.uid).update({ ask, askAt: Date.now() });
    } else item.local = true;
    return item;
  };

  /* ---------- Fenêtre « Questions » ---------- */
  let kind = 'q';
  Q.open = async function () {
    const draw = () => {
      const list = st();
      const md = TC.modal(`<h2>❓ Questions</h2><div class="qa">
        <p class="hint">Pose une question sur le jeu, signale un bug ou propose une idée. Les réponses arrivent ici (et en notification).</p>
        <div class="seg qa-kinds">${Object.entries(KINDS).map(([k, [i, l]]) => `<button data-qk="${k}" class="${k === kind ? 'active' : ''}">${i} ${l}</button>`).join('')}</div>
        <textarea id="qa-text" maxlength="300" placeholder="${kind === 'idee' ? 'Ton idée ou la modification que tu voudrais…' : kind === 'bug' ? 'Qu\'est-ce qui ne marche pas ? Sur quel écran ?' : 'Ta question…'}"></textarea>
        <div class="qa-auto" id="qa-auto"></div>
        <button class="btn btn-gold btn-xl" id="qa-send">Envoyer</button>
        <h4>Mes questions</h4>${list.length ? list.map(x => {
          const a = answers[x.id];
          return `<div class="qa-item"><div class="qa-q"><span>${KINDS[x.k] ? KINDS[x.k][0] : '❓'}</span><p>${esc(x.q)}</p><small>${fmt.time(x.t)}</small></div>
            ${x.auto ? `<div class="qa-a auto"><b>⚡ Réponse automatique</b><p>${esc(x.auto)}</p></div>` : ''}
            ${a ? `<div class="qa-a"><b>${who(a)}${a.status ? ' · ' + (STATUS[a.status] || '') : ''}</b><p>${esc(a.a)}</p></div>` : `<div class="qa-wait">⏳ ${x.local ? 'Connecte-toi pour l\'envoyer au créateur' : 'Transmise au créateur, réponse bientôt'}</div>`}</div>`;
        }).join('') : '<div class="empty">Aucune question pour l\'instant.</div>'}</div>`, { cls: 'wide' });
      const ta = md.el.querySelector('#qa-text'), box = md.el.querySelector('#qa-auto');
      ta.oninput = () => { const a = kind === 'q' && ta.value.length > 6 ? Q.auto(ta.value) : null; box.innerHTML = a ? `<b>⚡ Peut-être la réponse :</b> ${esc(a)}` : ''; };
      md.el.querySelectorAll('[data-qk]').forEach(b => { b.onclick = () => { kind = b.dataset.qk; draw(); }; });
      md.el.querySelector('#qa-send').onclick = async e => {
        e.target.disabled = true;
        try { const it = await Q.ask(kind, ta.value); TC.toast(it.auto ? '⚡ Réponse automatique ajoutée. Ta question est aussi transmise.' : '📨 Envoyé ! Tu seras prévenu de la réponse.', 'ok', 5000); draw(); }
        catch (x) { TC.toast(x.message || 'Envoi impossible', 'bad'); e.target.disabled = false; }
      };
    };
    draw(); await Q.load(true); if (document.querySelector('#modal.open .qa')) draw();
  };

  /* ---------- Mode créateur : toutes les questions des joueurs ---------- */
  Q.admin = async function () {
    if (!(TC.Admin && TC.Admin.isAdmin())) return;
    const md = TC.modal('<h2>❓ Questions des joueurs</h2><div class="qa"><div class="empty">Chargement…</div></div>', { cls: 'wide' });
    const snap = await N.db().collection('users').orderBy('askAt', 'desc').limit(60).get();
    await Q.load(true);
    const rows = []; snap.docs.forEach(d => { const u = N.prof(d.id, d.data()); (u.ask || []).forEach(x => rows.push({ u, x })); });
    rows.sort((a, b) => b.x.t - a.x.t);
    const open = rows.filter(r => !answers[r.x.id]);
    const forClaude = open.map(r => `[${r.x.id}] ${KINDS[r.x.k] ? KINDS[r.x.k][1] : 'Question'} de ${r.u.pseudo || '?'} : ${r.x.q}`).join('\n');
    md.el.querySelector('.qa').innerHTML = `<p class="hint">${open.length} sans réponse. Réponds toi-même, ou copie-les pour Claude : il répondra, fera les modifications qui lui semblent justes et expliquera les autres.</p>
      ${open.length ? '<button class="btn btn-gold" id="qa-copy">📋 Copier les questions pour Claude</button>' : ''}
      ${rows.length ? rows.map(({ u, x }) => { const a = answers[x.id]; return `<div class="qa-item"><div class="qa-q"><span>${KINDS[x.k] ? KINDS[x.k][0] : '❓'}</span><p><b>${esc(u.pseudo || '?')}</b> : ${esc(x.q)}</p><small>${fmt.time(x.t)}</small></div>
        ${a ? `<div class="qa-a"><b>${who(a)}</b><p>${esc(a.a)}</p></div>` : `<div class="qa-ans"><textarea data-qid="${esc(x.id)}" maxlength="500" placeholder="Ta réponse…">${x.k === 'q' ? esc(Q.auto(x.q) || '') : ''}</textarea><button class="btn btn-sm btn-gold" data-qsend="${esc(x.id)}">Répondre</button></div>`}</div>`; }).join('') : '<div class="empty">Aucune question.</div>'}`;
    const cp = md.el.querySelector('#qa-copy'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText('Questions des joueurs de Trad Center :\n' + forClaude); TC.toast('📋 Copié : colle-le dans ta conversation avec Claude', 'ok', 6000); } catch (e) { prompt('Copie ce texte pour Claude :', forClaude); } };
    md.el.querySelectorAll('[data-qsend]').forEach(b => { b.onclick = async () => {
      const id = b.dataset.qsend, t = md.el.querySelector(`textarea[data-qid="${CSS.escape(id)}"]`).value.trim(); if (!t) return;
      b.disabled = true;
      try { await N.db().collection('admin').doc('qa').set({ [id]: { a: t.slice(0, 500), t: Date.now(), status: 'reponse' } }, { merge: true }); TC.toast('✅ Réponse envoyée (le joueur sera prévenu)', 'ok'); loadedAt = 0; Q.admin(); }
      catch (e) { TC.toast('Envoi impossible', 'bad'); b.disabled = false; }
    }; });
  };

  document.addEventListener('click', e => { if (e.target.closest('[data-qa]')) { e.preventDefault(); Q.open(); } if (e.target.closest('[data-qadmin]')) Q.admin(); });
  const fromPush = new URLSearchParams(location.search).get('qa');
  if (N && N.on) N.on(t => { if (t === 'linked') { if (fromPush) setTimeout(() => (TC.Admin && TC.Admin.isAdmin() && fromPush === 'admin' ? Q.admin() : Q.open()), 1500); else setTimeout(() => Q.load(true), 8000); } });
  setInterval(() => { if (!document.hidden && st().some(x => !answers[x.id])) Q.load(); }, 10 * 60000);
})();

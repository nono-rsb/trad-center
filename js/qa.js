/* Trad Center — onglet Questions : les joueurs posent une question, signalent un bug ou proposent une idée.
 * Pas de réponse automatique : c'est Claude (l'IA qui aide le créateur, compte « Claude ✓ IA ») qui répond, ou le créateur.
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
  const who = a => a.by === 'creator' ? '👑 Le créateur' : '🧡 Claude <span class="vbadge">✓</span><span class="aitag">IA</span>';
  const STATUS = { fait: '✅ Fait', refuse: '🚫 Pas possible', reponse: '💬 Réponse', prevu: '🛠️ Prévu' };

  /* ---------- Envoyer ---------- */
  Q.ask = async function (kind, text) {
    text = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 300);
    if (text.length < 5) throw new Error('Écris ta question (5 caractères minimum).');
    if (TC.Admin && TC.Admin.isBanned && N.user && TC.Admin.isBanned(N.user.uid)) throw new Error('Compte suspendu.');
    const recent = st().filter(x => Date.now() - x.t < 3600000).length; if (recent >= 5) throw new Error('5 questions maximum par heure : attends un peu.');
    const id = (N.user ? N.user.uid.slice(0, 6) : 'invite') + Date.now().toString(36);
    const item = { id, k: KINDS[kind] ? kind : 'q', q: text, t: Date.now() };
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
        <p class="hint">Pose une question sur le jeu, signale un bug ou propose une idée. C'est <b>Claude</b> (l'IA qui aide le créateur) ou le créateur lui-même qui te répond, ici et en notification. Les idées justes sont ajoutées au jeu.<br>🔒 Ta question est transmise sans ton pseudo : n'y mets pas d'infos personnelles (e-mail, téléphone…).</p>
        <div class="seg qa-kinds">${Object.entries(KINDS).map(([k, [i, l]]) => `<button data-qk="${k}" class="${k === kind ? 'active' : ''}">${i} ${l}</button>`).join('')}</div>
        <textarea id="qa-text" maxlength="300" placeholder="${kind === 'idee' ? 'Ton idée ou la modification que tu voudrais…' : kind === 'bug' ? 'Qu\'est-ce qui ne marche pas ? Sur quel écran ?' : 'Ta question…'}"></textarea>
        <button class="btn btn-gold btn-xl" id="qa-send">Envoyer</button>
        <h4>Mes questions</h4>${list.length ? list.map(x => {
          const a = answers[x.id];
          return `<div class="qa-item"><div class="qa-q"><span>${KINDS[x.k] ? KINDS[x.k][0] : '❓'}</span><p>${esc(x.q)}</p><small>${fmt.time(x.t)}</small></div>
            ${a ? `<div class="qa-a"><b>${who(a)}${a.status ? ' · ' + (STATUS[a.status] || '') : ''}</b><p>${esc(a.a)}</p></div>` : `<div class="qa-wait">⏳ ${x.local ? 'Connecte-toi pour l\'envoyer' : 'Transmise à Claude et au créateur, réponse bientôt'}</div>`}</div>`;
        }).join('') : '<div class="empty">Aucune question pour l\'instant.</div>'}</div>`, { cls: 'wide' });
      const ta = md.el.querySelector('#qa-text');
      md.el.querySelectorAll('[data-qk]').forEach(b => { b.onclick = () => { kind = b.dataset.qk; draw(); }; });
      md.el.querySelector('#qa-send').onclick = async e => {
        e.target.disabled = true;
        try { await Q.ask(kind, ta.value); TC.toast('📨 Envoyé à Claude et au créateur ! Tu seras prévenu de la réponse.', 'ok', 5000); draw(); }
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
        ${a ? `<div class="qa-a"><b>${who(a)}</b><p>${esc(a.a)}</p></div>` : `<div class="qa-ans"><textarea data-qid="${esc(x.id)}" maxlength="500" placeholder="Ta réponse…"></textarea><button class="btn btn-sm btn-gold" data-qsend="${esc(x.id)}">Répondre</button></div>`}</div>`; }).join('') : '<div class="empty">Aucune question.</div>'}`;
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

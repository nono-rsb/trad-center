/* Trad Center — objectif 100 joueurs : une fois par jour, un pop-up invite à partager le jeu
 * (compteur de joueurs, barre de progression, lien d'invitation). Une notification quotidienne est
 * envoyée par le serveur (scripts/notify.mjs). À 100 joueurs : grosse surprise.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const SH = TC.Share = { GOAL: 100 };
  // récompenses de partage, validées à la main par le créateur (mode créateur → Demandes de récompense)
  SH.REWARDS = {
    snap_pub: { e: '👻', label: 'Story Snap publique', eur: 400 },
    snap_priv: { e: '🔒', label: 'Story Snap privée', eur: 200 },
    whatsapp: { e: '💬', label: 'Partage WhatsApp', eur: 200 },
  };
  // capture d'écran obligatoire, réduite (≈ 700 px, JPEG) pour rester légère
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const k = Math.min(1, 700 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.62)); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
      img.src = url;
    });
  }
  function askProof(r) {
    return new Promise(resolve => {
      let data = null, done = false;
      const md = TC.modal(`<h2>${r.e} ${r.label}</h2><div class="modal-body">
        <p>Pour recevoir <b>${fmt.eur(r.eur)}</b>, ajoute la <b>capture d'écran</b> de ta ${r.label.toLowerCase()} où l'on voit le lien ou le nom du jeu${r.e === '💬' ? ' (message ou statut WhatsApp)' : ' et ton nom Snap'}.</p>
        <label class="pf-pick"><input type="file" accept="image/*" id="pf-file"><span id="pf-txt">📷 Choisir la capture d'écran</span></label>
        <img id="pf-img" class="pf-img" alt="" hidden>
        <p class="hint">Le créateur vérifie la capture puis te verse l'argent. Une demande par jour pour chaque type, jusqu'à dimanche. Les fausses captures sont refusées.</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="pf-ok" disabled>Envoyer ma demande</button></div></div>`, { onClose: () => { if (!done) resolve(null); } });
      md.el.querySelector('#pf-file').onchange = async e => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        try { data = await shrink(f); const im = md.el.querySelector('#pf-img'); im.src = data; im.hidden = false; md.el.querySelector('#pf-txt').textContent = '📷 Changer de capture'; md.el.querySelector('#pf-ok').disabled = false; }
        catch (x) { TC.toast('Impossible de lire cette image', 'bad'); }
      };
      md.el.querySelector('#pf-ok').onclick = () => { done = true; md.close(); resolve(data); };
    });
  }
  // suivi des demandes : appelé quand le créateur valide (ok) ou refuse (no)
  SH.decided = function (claimId, ok) {
    const m = (S().myClaims || []).find(x => x.id === claimId); if (!m) return;
    m.status = ok ? 'ok' : 'no';
    if (!ok && S().claimDay) delete S().claimDay[m.kind]; // refusée : on peut renvoyer une capture tout de suite
    G.save(true); SH.chip();
  };
  const ST = { wait: '⏳ en attente', ok: '✅ payée', no: '❌ refusée' };
  SH.myClaimsHtml = () => { const L = (S().myClaims || []).slice(0, 6); return L.length ? `<div class="sh-mine"><b>Mes demandes</b>${L.map(m => { const r = SH.REWARDS[m.kind] || {}; return `<div class="${m.status}"><span>${r.e || ''} ${r.label || m.kind} · ${new Date(m.at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span><b>${fmt.eur(m.eur, true)} ${ST[m.status] || ''}</b></div>`; }).join('')}${L.some(m => m.status === 'no') ? '<small>Refusée ? Tu peux renvoyer une meilleure capture (on doit voir le jeu et ton nom).</small>' : ''}</div>` : ''; };
  // encart pour l'onglet Amis
  SH.block = () => !SH.claimOpen() || !N || !N.user ? '' : `<div class="panel sh-panel"><h3>📣 Gagne de l'argent en partageant <small>jusqu'à dimanche</small></h3>
    <div class="sh-claims">${Object.entries(SH.REWARDS).map(([k, r]) => `<button class="btn btn-sm" data-claim="${k}">${r.e} ${r.label} : <b>+${fmt.eur(r.eur, true)}</b></button>`).join('')}</div>
    <small class="muted">Poste le jeu, fais une capture d'écran, puis touche le bouton. Le créateur vérifie et te paie.</small>${SH.myClaimsHtml()}</div>`;
  // petit bouton toujours visible jusqu'à dimanche
  SH.chip = function () {
    let c = document.getElementById('sh-chip');
    if (!SH.claimOpen() || !N || !N.user || document.body.classList.contains('gated')) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('button'); c.id = 'sh-chip'; c.onclick = () => SH.popup(true); document.body.appendChild(c); }
    const wait = (S().myClaims || []).filter(m => m.status === 'wait').length;
    c.innerHTML = wait ? `⏳ ${wait} demande${wait > 1 ? 's' : ''} en attente` : '📣 Story Snap = <b>400 €</b>';
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-claim]'); if (b && !b.closest('.modal')) SH.claim(b.dataset.claim); });
  SH.CLAIM_END = Date.parse('2026-11-15T23:59:59+01:00'); // offre valable jusqu'à dimanche 15 novembre au soir
  SH.claimOpen = () => Date.now() <= SH.CLAIM_END;
  SH.claim = async function (kind) {
    if (!SH.claimOpen()) return TC.toast('📣 L\'offre de partage est terminée (elle durait jusqu\'à dimanche).', 'info', 5000);
    const r = SH.REWARDS[kind]; if (!r || !N || !N.user || !N.profile) return TC.toast('Connecte-toi pour réclamer', 'bad');
    const day = S().claimDay || (S().claimDay = {});
    if (day[kind] === today()) return TC.toast(`Tu as déjà réclamé « ${r.label} » aujourd'hui. Reviens demain !`, 'info', 5000);
    const proof = await askProof(r); if (!proof) return;
    const c = { id: Math.random().toString(36).slice(2, 12), kind, eur: r.eur, at: Date.now(), proof: true };
    // la capture est rangée dans la sauvegarde privée (lisible seulement par le joueur et le créateur)
    const pr = S().proofs || (S().proofs = {}); pr[c.id] = proof;
    Object.keys(pr).sort().slice(0, Math.max(0, Object.keys(pr).length - 4)).forEach(k => delete pr[k]); // garder les 4 dernières
    G.save(true); if (N.flush) await N.flush();
    const list = (N.profile.shareClaims || []).filter(x => Date.now() - x.at < 14 * 86400000).slice(-19).concat(c);
    try { await N.db().collection('users').doc(N.user.uid).update({ shareClaims: list, updatedAt: Date.now() }); N.profile.shareClaims = list; }
    catch (e) { return TC.toast(N.errMsg(e), 'bad'); }
    day[kind] = today();
    (S().myClaims || (S().myClaims = [])).unshift({ id: c.id, kind, eur: r.eur, at: c.at, status: 'wait' }); S().myClaims.length = Math.min(S().myClaims.length, 20);
    G.save(true); SH.chip();
    N.notifyPlayer(TC.ADMIN_UID, 'claim', { label: r.label, eur: r.eur });
    TC.sound('ach'); TC.toast(`📣 Demande envoyée : ${fmt.eur(r.eur)} dès que le créateur a vérifié ta ${r.label.toLowerCase()} !`, 'ok', 6000);
  };
  const today = () => new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

  SH.count = async function () {
    const c = S().playerCount;
    if (c && Date.now() - c.at < 3 * 3600000) return c.n;
    const snap = await N.db().collection('users').get();
    const n = snap.docs.filter(d => !d.data().bot).length;
    S().playerCount = { n, at: Date.now() }; G.save();
    return n;
  };
  SH.share = async function () {
    const link = N && N.user && N.inviteLink ? N.inviteLink() : location.origin + location.pathname;
    const text = '🚀 Viens jouer à Trad Center : trade le Bitcoin et le CAC 40 avec les vrais cours, pars de 10 € et achète des Lamborghini ! On vise 100 joueurs pour débloquer une grosse surprise 🎁';
    try { if (navigator.share) { await navigator.share({ title: 'Trad Center', text, url: link }); return true; } } catch (e) { if (e && e.name === 'AbortError') return false; }
    try { await navigator.clipboard.writeText(text + ' ' + link); TC.toast('📋 Lien copié : colle-le à tes amis !', 'ok'); return true; } catch (e) { prompt('Copie ce lien et envoie-le à tes amis :', link); return true; }
  };
  SH.popup = async function (force) {
    let n = null; try { n = await SH.count(); } catch (e) { }
    const pct = n != null ? Math.min(100, n / SH.GOAL * 100) : 0, done = n != null && n >= SH.GOAL;
    const md = TC.modal(`<div class="center sh-pop"><div class="big-emoji">${done ? '🎉' : '🎁'}</div>
      <h2>${done ? 'On est 100 !' : 'Objectif : 100 joueurs'}</h2>
      <p>${done ? 'La grosse surprise arrive… reste connecté 👀' : `À <b>100 joueurs</b>, une <b>grosse surprise</b> est débloquée pour tout le monde !`}</p>
      ${n != null ? `<div class="sh-bar"><i style="width:${pct.toFixed(1)}%"></i><span>${n} / ${SH.GOAL} joueurs</span></div>` : ''}
      ${!done && n != null ? `<p class="muted">Plus que <b>${SH.GOAL - n}</b> joueur${SH.GOAL - n > 1 ? 's' : ''} !</p>` : ''}
      <p class="sh-bonus">🤝 Et toi, tu gagnes <b>+${fmt.eur((N && N.REF_BONUS) || 20)}</b> pour chaque ami qui s'inscrit avec ton lien.</p>
      ${SH.claimOpen() ? `<div class="sh-claims"><b>📣 Gagne de l'argent en partageant</b><small class="sh-end">⏳ Jusqu'à <b>dimanche 15 novembre</b> au soir</small>${Object.entries(SH.REWARDS).map(([k, r]) => `<button class="btn btn-sm" data-claim="${k}">${r.e} ${r.label} : <b>+${fmt.eur(r.eur, true)}</b></button>`).join('')}
        <small class="muted">Poste le jeu, puis touche le bouton correspondant. Le créateur vérifie et te verse l'argent.</small>${SH.myClaimsHtml()}</div>` : ''}
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Plus tard</button><button class="btn btn-gold btn-xl" id="sh-go">📤 Partager le jeu</button></div></div>`);
    md.el.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => { md.close(); SH.claim(b.dataset.claim); });
    md.el.querySelector('#sh-go').onclick = async () => { if (await SH.share()) { md.close(); S().shareCount = (S().shareCount || 0) + 1; G.save(); } };
  };
  // une fois par jour, quand rien d'autre n'est ouvert
  function maybe() {
    if (!N || !N.user || !N.profile || S().sharePop === today()) return;
    if ($('#modal').classList.contains('open') || $('#teddy') || $('#quiz') || document.body.classList.contains('gated') || document.hidden) return setTimeout(maybe, 15000);
    S().sharePop = today(); G.save(); SH.popup();
  }
  const fromPush = new URLSearchParams(location.search).get('share'); // ouvert depuis la notification
  if (N && N.on) N.on(t => { if (t === 'linked') { if (fromPush) { S().sharePop = today(); setTimeout(() => SH.popup(true), 1500); } else setTimeout(maybe, 25000); } });
  setInterval(maybe, 30 * 60000);
  if (N && N.on) N.on(t => { if (t === 'linked' || t === 'change') SH.chip(); });
  setInterval(() => SH.chip(), 60000);
  document.addEventListener('click', e => { if (e.target.closest('[data-sharepop]')) SH.popup(true); });
})();

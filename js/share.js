/* Trad Center — objectif 100 joueurs : une fois par jour, un pop-up invite à partager le jeu
 * (compteur de joueurs, barre de progression, lien d'invitation). Une notification quotidienne est
 * envoyée par le serveur (scripts/notify.mjs). À 100 joueurs : grosse surprise.
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const SH = TC.Share = { GOAL: 100 };
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
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Plus tard</button><button class="btn btn-gold btn-xl" id="sh-go">📤 Partager le jeu</button></div></div>`);
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
  document.addEventListener('click', e => { if (e.target.closest('[data-sharepop]')) SH.popup(true); });
})();

/* Trad Center — « Ma carte de joueur » : une image à partager (Snap, Insta, WhatsApp…) avec ton rang, ton patrimoine et ton lien d'invitation. */
(function () {
  const { fmt } = TC, G = TC.Game, N = TC.Net;
  const SC = TC.ShareCard = {};
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  SC.draw = function () {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1a1050'); gr.addColorStop(.55, '#2b2f9e'); gr.addColorStop(1, '#0b6cc8'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.03 + (i % 5) * 0.012})`; g.beginPath(); g.arc((i * 337) % W, (i * 211) % H, 20 + (i % 7) * 14, 0, 7); g.fill(); }
    const nw = G.netWorth(), rank = G.rank(nw).r[1], pseudo = (N && N.profile && N.profile.pseudo) || 'Joueur', av = (N && N.profile && N.profile.avatar) || '🦁';
    const co = G.state.corp && G.state.corp.status !== 'liquide' ? G.state.corp : null;
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 64px Inter, system-ui, sans-serif'; g.fillText('TRAD CENTER', W / 2, 130);
    g.fillStyle = '#ffd23f'; g.font = '600 34px Inter, system-ui, sans-serif'; g.fillText('De 10 € à la Bugatti', W / 2, 185);
    g.fillStyle = 'rgba(255,255,255,.12)'; rr(g, 90, 250, W - 180, 640, 44); g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.stroke();
    g.font = '170px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif'; g.fillStyle = '#fff'; g.fillText(av, W / 2, 440);
    g.font = '800 78px Inter, system-ui, sans-serif'; g.fillText(pseudo, W / 2, 560);
    g.fillStyle = '#ffd23f'; g.font = '700 46px Inter, system-ui, sans-serif'; g.fillText(rank, W / 2, 625);
    g.fillStyle = '#fff'; g.font = '800 120px Inter, system-ui, sans-serif'; g.fillText(fmt.eur(nw, true), W / 2, 765);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '500 34px Inter, system-ui, sans-serif'; g.fillText('de patrimoine', W / 2, 815);
    if (co) { g.fillStyle = '#9be7ff'; g.font = '700 38px Inter, system-ui, sans-serif'; g.fillText('🏢 Patron de ' + co.name, W / 2, 870); }
    g.fillStyle = '#fff'; g.font = '700 46px Inter, system-ui, sans-serif'; g.fillText('Rejoins-moi et bats mon score 👇', W / 2, 1000);
    g.fillStyle = '#ffd23f'; rr(g, 140, 1040, W - 280, 120, 60); g.fill();
    g.fillStyle = '#2a1a00'; g.font = '800 40px Inter, system-ui, sans-serif'; g.fillText('nono-rsb.github.io/trad-center', W / 2, 1115);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '500 30px Inter, system-ui, sans-serif'; g.fillText('Jeu gratuit · vrais cours · argent fictif', W / 2, 1240);
    return c;
  };
  SC.share = async function () {
    const c = SC.draw(), blob = await new Promise(r => c.toBlob(r, 'image/png')), link = N && N.user ? N.inviteLink() : location.href;
    const text = `Je suis ${G.rank().r[1]} sur Trad Center avec ${fmt.eur(G.netWorth(), true)} 💰 Viens me défier : ${link}`;
    const file = new File([blob], 'trad-center.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const md = TC.modal(`<h2>🖼️ Ma carte de joueur</h2><div class="modal-body"><img id="sc-img" alt="Ma carte" style="width:100%;border-radius:16px"><p class="hint">Enregistre l'image (appui long) et poste-la en story avec ton lien.</p><div class="inv-link"><input readonly value="${TC.esc(link)}"><button class="btn" id="sc-copy">📋</button></div></div><div class="modal-actions"><button class="btn btn-ghost" data-close>Fermer</button><a class="btn btn-gold" id="sc-dl" download="trad-center.png">⬇️ Télécharger</a></div>`);
    const url = URL.createObjectURL(blob); md.el.querySelector('#sc-img').src = url; md.el.querySelector('#sc-dl').href = url;
    md.el.querySelector('#sc-copy').onclick = () => { try { navigator.clipboard.writeText(text); TC.toast('📋 Message copié', 'ok'); } catch (e) { } };
  };
  document.addEventListener('click', e => { if (e.target.closest('[data-sharecard]')) SC.share(); });
})();

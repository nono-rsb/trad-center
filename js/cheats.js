/* Trad Center — codes de triche
 * À taper dans ⚙️ Réglages → 🎮 Codes, en touchant le logo, ou directement au clavier (ordinateur).
 * Les codes sont stockés sous forme d'empreinte (SHA-256) : ils ne sont pas lisibles dans le code du site.
 * Codes qui donnent de l'argent : une seule fois par joueur, et exclus du championnat de la semaine.
 * Codes promo publics : fichier codes.json (code, montant, date limite).
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, S = () => G.state;
  const C = TC.Cheats = {};
  const HASHES = {
    'f04a089646e1b42ade9eeaf57ec3d40690bd8e6e0d209d01a6c309843f8400d2': 'rain',
    'd6e9d2c87176ef8ef94e7717350d0ce6cd7000883b17dd103c4d5bc19ab9068f': 'jackpot',
    '49e74216925f591b9d7a4f61251287b366cf01325da1291ea58ee34af30e0a6c': 'vice',
    '73ff00983cf344ded37b8740d2488f841ef484b6c5f11a6cedff15bf714937be': 'gold',
    'bae21dba6aaa41388c38af35c3eca84ccdf50e984376e869e3a6cb0771213882': 'disco',
    'e66466530585c790ac8267c942955a2b4fa35a1007d74850f5afce8c010471fc': 'snow',
    '644db12299bba651543800702054dc04e281e473b3a3520cb3a16ec75ae4680a': 'bonus',
    '7a6f7d5ffe1b2e22e43e31eadce518fd1430998ec87c1723a2d38227a6516067': 'welcome',
    '98c6c9b17fb86a15b2d975ec762e3dd6fab959659da7a4d419b6dd4fb092b686': 'lambo',
    'ff2952741a8fee83e34d4c6b4680e2dfd90811679faf74e068a29e0f3e341ae9': 'btc',
    '3fbc06b6d0537e376fa3f97c458a73f8534ac133de9aa18efcef6540f0269211': 'admin',
  };
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  async function sha(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tradcenter:' + s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const used = () => S().cheats || (S().cheats = {});
  const once = k => { if (used()[k]) return false; used()[k] = Date.now(); G.save(true); return true; };
  function giveCash(eur, label) {
    S().cash += eur; if (TC.Weekly) TC.Weekly.flow(eur); // ne compte pas dans le championnat
    S().log.unshift({ t: Date.now(), kind: 'bonus', eur, asset: label }); G.save(true);
    if (TC.App) TC.App.after();
  }
  const ok = (msg, big) => { TC.sound('kaching'); TC.toast(`<div class="t-ach"><span>🎮</span><div><small>Code de triche activé</small><b>${msg}</b></div></div>`, 'ach', 6000); if (big) TC.confetti(160); };
  const nope = msg => { TC.sound('lose'); TC.toast('🎮 ' + msg, 'bad'); };

  /* ---------- Effets ---------- */
  function rainOf(chars, n = 60, dur = 4200) {
    const box = document.createElement('div'); box.className = 'cheat-rain'; document.body.appendChild(box);
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span'); s.textContent = chars[i % chars.length];
      s.style.left = Math.random() * 100 + 'vw'; s.style.animationDelay = Math.random() * 1.8 + 's'; s.style.fontSize = (18 + Math.random() * 22) + 'px'; s.style.animationDuration = (2 + Math.random() * 1.6) + 's';
      box.appendChild(s);
    }
    setTimeout(() => box.remove(), dur);
  }
  function lambo() {
    const el = document.createElement('div'); el.className = 'cheat-lambo'; el.innerHTML = '<span>🏎️💨</span><b>VROOOM</b>';
    document.body.appendChild(el); setTimeout(() => el.remove(), 3200);
  }
  const toggleClass = (cls, key) => { const on = !document.documentElement.classList.contains(cls); document.documentElement.classList.toggle(cls, on); try { on ? localStorage.setItem(key, '1') : localStorage.removeItem(key); } catch (e) { } return on; };

  const EFFECTS = {
    rain() { rainOf(['💸', '💶', '💰', '🤑']); if (once('rain')) { giveCash(25, 'Code : pluie de billets'); ok('Pluie de billets ! +25 €', true); } else ok('Pluie de billets ! (les 25 € ont déjà été pris)'); },
    welcome() { if (!once('welcome')) return nope('Code déjà utilisé'); giveCash(10, 'Code : bienvenue'); ok('Bienvenue ! +10 €', true); },
    btc() {
      if (!once('btc')) return nope('Code déjà utilisé');
      const p = TC.Data.eur('BTC'); if (!p) { delete used().btc; return nope('Prix du Bitcoin indisponible, réessaie'); }
      const h = S().holdings.BTC || { qty: 0, cost: 0 }; h.qty += 15 / p; h.cost += 15; S().holdings.BTC = h;
      if (TC.Weekly) TC.Weekly.flow(15);
      S().log.unshift({ t: Date.now(), kind: 'bonus', eur: 15, asset: 'Code : roi du Bitcoin' }); G.save(true); if (TC.App) TC.App.after();
      rainOf(['₿', '🪙']); ok('Roi du Bitcoin : 15 € de BTC offerts', true);
    },
    jackpot() {
      const k = 'jackpot:' + new Date().toISOString().slice(0, 10);
      if (!once(k)) return nope('Jackpot déjà utilisé aujourd\'hui');
      S().jackpot = true; G.save(true); ok('Jackpot armé : ton prochain pari gagné paie x3 !', true);
    },
    bonus() {
      const wk = 'bonus:' + (TC.Weekly ? TC.Weekly.current().id : new Date().toISOString().slice(0, 10));
      if (G.bonusReadyIn() === 0) return nope('Ton bonus est déjà disponible : touche 🎁 !');
      if (!once(wk)) return nope('Boost fusée déjà utilisé cette semaine');
      S().lastBonus = 0; G.save(true); if (TC.App) TC.App.after(); ok('Boost fusée : bonus quotidien rechargé 🚀', true);
    },
    vice() { const on = toggleClass('vice', 'tradcenter.vice'); rainOf(['🌴', '🌺', '🕶️']); ok(on ? 'Mode Vice activé 🌴' : 'Mode Vice désactivé'); },
    gold() { const on = toggleClass('gold', 'tradcenter.gold'); if (on) rainOf(['🪙', '✨', '👑'], 40); ok(on ? 'Mode Or activé 👑' : 'Mode Or désactivé'); },
    disco() { document.documentElement.classList.add('disco'); setTimeout(() => document.documentElement.classList.remove('disco'), 30000); rainOf(['🪩', '🎶', '✨']); ok('Disco pendant 30 secondes 🪩'); },
    snow() { const c = document.getElementById('snow'); if (c) { c.hidden = !c.hidden; ok(c.hidden ? 'Neige arrêtée' : 'Neige relancée ❄️'); } else { if (TC.App && TC.App.snow) TC.App.snow(true); ok('Il neige ! ❄️'); } },
    lambo() { lambo(); TC.sound('win'); ok('VROOOM 🏎️'); },
  };

  /* ---------- Codes promo publics (codes.json) ---------- */
  async function promo(code) {
    try {
      const j = await (await fetch('codes.json?t=' + Date.now(), { cache: 'no-store' })).json();
      const p = (j.codes || []).find(c => norm(c.code) === code);
      if (!p) return false;
      if (p.until && Date.now() > new Date(p.until + 'T23:59:59').getTime()) { nope('Ce code promo a expiré'); return true; }
      if (!once('promo:' + code)) { nope('Code promo déjà utilisé'); return true; }
      giveCash(+p.cash || 0, 'Code promo ' + code); rainOf(['💸', '🎁']); ok(`${esc(p.label || 'Code promo')} : +${fmt.eur(+p.cash || 0)}`, true);
      return true;
    } catch (e) { return false; }
  }

  C.enter = async function (raw) {
    const code = norm(raw); if (code.length < 3) return false;
    const fx = HASHES[await sha(code)];
    if (fx === 'admin') { if (TC.Admin && TC.Admin.isAdmin()) { setTimeout(() => TC.Admin.open(), 50); return true; } return false; }
    if (fx) { EFFECTS[fx](); return true; }
    if (await promo(code)) return true;
    return false;
  };

  C.open = function () {
    const md = TC.modal(`<div class="center"><div class="big-emoji">🎮</div><h2>Code de triche</h2></div>
      <div class="modal-body"><div class="inp"><input id="ch-in" maxlength="24" placeholder="Tape un code…" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      <p class="hint">Des codes secrets circulent… Certains donnent de l'argent (une seule fois), d'autres changent l'ambiance. Sur ordinateur, tu peux aussi les taper directement au clavier.</p></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Fermer</button><button class="btn btn-gold" id="ch-go">Valider</button></div>`);
    const inp = md.el.querySelector('#ch-in'); inp.focus();
    const go = async () => { const v = inp.value; if (!v.trim()) return; if (await C.enter(v)) { md.close(); } else { inp.value = ''; inp.classList.add('shake'); setTimeout(() => inp.classList.remove('shake'), 500); nope('Code inconnu'); } };
    md.el.querySelector('#ch-go').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  };

  /* ---------- Saisie au clavier façon console (ordinateur) ---------- */
  let buf = '', busy = false;
  document.addEventListener('keydown', async e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.key.length !== 1) return;
    buf = (buf + norm(e.key)).slice(-16);
    if (busy) return; busy = true;
    try {
      for (let n = 4; n <= buf.length; n++) {
        const fx = HASHES[await sha(buf.slice(-n))];
        if (fx === 'admin') { if (TC.Admin && TC.Admin.isAdmin()) { buf = ''; TC.Admin.open(); } break; }
        if (fx) { buf = ''; EFFECTS[fx](); break; }
      }
    } finally { busy = false; }
  });

  // Entrées : toucher le logo, ou le bouton des réglages
  document.addEventListener('click', e => { if (e.target.closest('.brand .logo')) C.open(); });
  // modes visuels mémorisés
  try { if (localStorage.getItem('tradcenter.vice')) document.documentElement.classList.add('vice'); if (localStorage.getItem('tradcenter.gold')) document.documentElement.classList.add('gold'); } catch (e) { }
})();

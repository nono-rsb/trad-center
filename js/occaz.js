/* Trad Occaz — appli d'achat-revente d'occasion pour s'entraîner (même compte, même argent que Trad Center).
 * Des vendeurs et des acheteurs robots : bonnes affaires, annonces trop chères, contrefaçons, négociation,
 * offres au rabais, colis à envoyer, avis. On peut aussi garder ce qu'on achète pour soi (collection perso).
 */
(function () {
  const { $, esc, fmt } = TC;
  const G = TC.Game, N = TC.Net, S = () => G.state;
  const O = TC.Occaz = { tab: 'home', view: null, cat: 'all', q: '' };
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const r2 = v => Math.round(v * 100) / 100, rp = v => v < 20 ? Math.round(v) : v < 200 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10; // prix « humains »
  const MIN = 60000;

  /* ---------- Catalogue (cote d'occasion « très bon état », en euros) ---------- */
  const CATS = [['all', '✨ Tout'], ['sneakers', '👟 Sneakers'], ['mode', '👕 Mode'], ['luxe', '👜 Luxe'], ['montres', '⌚ Montres'], ['tech', '📱 Tech'], ['jeux', '🎮 Jeux & collection'], ['maison', '🛴 Sport & maison']];
  const CAT = [
    // clé, catégorie, marque, modèle, emoji, cote, taille colis (S/M/L), contrefaçons possibles
    ['af1', 'sneakers', 'Nike', 'Air Force 1 blanches', '👟', 55, 'M', 1], ['j1mid', 'sneakers', 'Jordan', '1 Mid', '👟', 85, 'M', 1],
    ['j1high', 'sneakers', 'Jordan', '1 High « Chicago »', '👟', 260, 'M', 1], ['samba', 'sneakers', 'Adidas', 'Samba OG', '👟', 60, 'M', 1],
    ['nb550', 'sneakers', 'New Balance', '550', '👟', 65, 'M', 0], ['dunk', 'sneakers', 'Nike', 'Dunk Low « Panda »', '👟', 75, 'M', 1],
    ['yeezy', 'sneakers', 'Adidas', 'Yeezy Boost 350', '👟', 140, 'M', 1], ['am90', 'sneakers', 'Nike', 'Air Max 90', '👟', 50, 'M', 0],
    ['tn', 'sneakers', 'Nike', 'Air Max Plus TN', '👟', 90, 'M', 1], ['xt6', 'sneakers', 'Salomon', 'XT-6', '👟', 95, 'M', 0],
    ['tee', 'mode', 'Zara', 'T-shirt basique', '👕', 5, 'S', 0], ['pullrl', 'mode', 'Ralph Lauren', 'Pull col rond', '🧶', 35, 'S', 1],
    ['nuptse', 'mode', 'The North Face', 'Doudoune Nuptse 1996', '🧥', 140, 'L', 1], ['carhartt', 'mode', 'Carhartt', 'Veste Detroit', '🧥', 70, 'M', 0],
    ['501', 'mode', 'Levi\'s', 'Jean 501', '👖', 25, 'S', 0], ['tech', 'mode', 'Nike', 'Ensemble Tech Fleece', '🩶', 85, 'M', 1],
    ['lacsurv', 'mode', 'Lacoste', 'Survêtement', '🩳', 70, 'M', 1], ['maillot', 'mode', 'PSG', 'Maillot domicile', '⚽', 35, 'S', 1],
    ['supreme', 'mode', 'Supreme', 'Hoodie Box Logo', '🧥', 220, 'M', 1], ['moncler', 'mode', 'Moncler', 'Doudoune Maya', '🧥', 550, 'L', 1],
    ['polo', 'mode', 'Lacoste', 'Polo classique', '👕', 25, 'S', 1], ['cap', 'mode', 'New Era', 'Casquette 9FORTY', '🧢', 12, 'S', 0],
    ['stussy', 'mode', 'Stüssy', 'T-shirt 8 Ball', '👕', 40, 'S', 1], ['robe', 'mode', 'Sézane', 'Robe fleurie', '👗', 55, 'S', 0],
    ['lvneverfull', 'luxe', 'Louis Vuitton', 'Sac Neverfull MM', '👜', 950, 'M', 1], ['gucciceint', 'luxe', 'Gucci', 'Ceinture GG', '🪢', 220, 'S', 1],
    ['longchamp', 'luxe', 'Longchamp', 'Sac Le Pliage', '👜', 45, 'S', 0], ['rayban', 'luxe', 'Ray-Ban', 'Lunettes Wayfarer', '🕶️', 55, 'S', 1],
    ['burberry', 'luxe', 'Burberry', 'Écharpe en cachemire', '🧣', 190, 'S', 1], ['diorsaddle', 'luxe', 'Dior', 'Sac Saddle', '👜', 1900, 'M', 1],
    ['birkin', 'luxe', 'Hermès', 'Sac Birkin 30', '👜', 11000, 'M', 1], ['sauvage', 'luxe', 'Dior', 'Parfum Sauvage 100 ml (entamé)', '🧴', 60, 'S', 1],
    ['gshock', 'montres', 'Casio', 'G-Shock DW-5600', '⌚', 45, 'S', 0], ['seiko5', 'montres', 'Seiko', '5 Sports automatique', '⌚', 120, 'S', 0],
    ['prx', 'montres', 'Tissot', 'PRX Powermatic 80', '⌚', 380, 'S', 1], ['sub', 'montres', 'Rolex', 'Submariner Date', '⌚', 10500, 'S', 1],
    ['aws', 'montres', 'Apple', 'Watch SE', '⌚', 120, 'S', 0], ['moonswatch', 'montres', 'Omega x Swatch', 'MoonSwatch', '⌚', 230, 'S', 1],
    ['ip13', 'tech', 'Apple', 'iPhone 13 128 Go', '📱', 290, 'S', 0], ['ip15p', 'tech', 'Apple', 'iPhone 15 Pro 256 Go', '📱', 680, 'S', 0],
    ['airpods', 'tech', 'Apple', 'AirPods Pro 2', '🎧', 120, 'S', 1], ['s23', 'tech', 'Samsung', 'Galaxy S23', '📱', 340, 'S', 0],
    ['mba', 'tech', 'Apple', 'MacBook Air M1', '💻', 470, 'M', 0], ['ipad', 'tech', 'Apple', 'iPad 9e génération', '📲', 190, 'M', 0],
    ['ps5', 'tech', 'Sony', 'PlayStation 5', '🎮', 330, 'L', 0], ['switch', 'tech', 'Nintendo', 'Switch OLED', '🎮', 220, 'M', 0],
    ['dualsense', 'tech', 'Sony', 'Manette DualSense', '🎮', 40, 'S', 0], ['jbl', 'tech', 'JBL', 'Enceinte Flip 6', '🔊', 65, 'S', 0],
    ['gopro', 'tech', 'GoPro', 'HERO11 Black', '📷', 190, 'S', 0], ['steamdeck', 'tech', 'Valve', 'Steam Deck 512 Go', '🕹️', 330, 'M', 0],
    ['fc', 'jeux', 'EA Sports', 'EA FC sur PS5', '💿', 28, 'S', 0], ['gta5', 'jeux', 'Rockstar', 'GTA V sur PS4', '💿', 12, 'S', 0],
    ['mk8', 'jeux', 'Nintendo', 'Mario Kart 8 Deluxe', '💿', 32, 'S', 0], ['dracaufeu', 'jeux', 'Pokémon', 'Carte Dracaufeu holo', '🃏', 140, 'S', 1],
    ['lotpkm', 'jeux', 'Pokémon', 'Lot de 100 cartes', '🃏', 25, 'S', 0], ['legofalcon', 'jeux', 'LEGO', 'Faucon Millenium 75257', '🧱', 120, 'L', 0],
    ['onepiece', 'jeux', 'Bandai', 'Figurine One Piece Luffy', '🗿', 30, 'S', 1], ['vinyle', 'jeux', 'Vinyle', 'Album rap français', '💽', 22, 'S', 0],
    ['hp', 'jeux', 'Gallimard', 'Coffret Harry Potter 7 tomes', '📚', 35, 'M', 0], ['trott', 'maison', 'Xiaomi', 'Trottinette électrique 4', '🛴', 210, 'L', 0],
    ['bmx', 'maison', 'Décathlon', 'BMX Wipe 500', '🚲', 120, 'L', 0], ['lampe', 'maison', 'IKEA', 'Lampe de bureau', '💡', 10, 'M', 0],
    ['dyson', 'maison', 'Dyson', 'Sèche-cheveux Supersonic', '💨', 230, 'M', 1], ['skate', 'maison', 'Element', 'Skateboard complet', '🛹', 45, 'L', 0],
    ['ballon', 'maison', 'Adidas', 'Ballon de foot officiel', '⚽', 25, 'M', 1], ['halteres', 'maison', 'Domyos', 'Haltères 2 × 10 kg', '🏋️', 40, 'L', 0],
  ].map(([k, cat, brand, name, e, cote, size, fake]) => ({ k, cat, brand, name, e, cote, size, fake }));
  const BY = {}; CAT.forEach(c => { BY[c.k] = c; });
  const CONDS = [['Neuf avec étiquette', 1.25], ['Neuf sans étiquette', 1.12], ['Très bon état', 1], ['Bon état', 0.82], ['Satisfaisant', 0.6]];
  const SHIP = { S: 2.99, M: 4.49, L: 7.99 };
  const fee = p => r2(0.7 + p * 0.05); // protection acheteurs
  const SIZES = { sneakers: ['40', '41', '42', '43', '44', '45'], mode: ['XS', 'S', 'M', 'L', 'XL'] };
  const HUE = { sneakers: 18, mode: 200, luxe: 38, montres: 260, tech: 215, jeux: 330, maison: 140 };

  /* ---------- Robots ---------- */
  const NAMES = ['julie_75', 'maxdu69', 'sneakhead.lyon', 'clem.vintage', 'yanis_13', 'lea.dressing', 'thomasrevend', 'ines_paris', 'nono.sneakers', 'kev_bdx', 'sarah.mode', 'lucas_59', 'manon.vide.dressing', 'adam.collector', 'chloe_31', 'enzo.retro', 'camille.b', 'rayan_93', 'zoe.friperie', 'hugo.tech', 'mehdi_44', 'emma_nantes', 'jules.vinted.pro', 'lina.chic', 'noah_67', 'sofiane.store', 'anais.luxe', 'theo_06', 'jade.style', 'karim.deals', 'romane_35', 'nathan.gaming', 'eva.secondemain', 'bilal_78', 'margaux.vintage', 'axel.flip'];
  const AVS = ['🧑', '👩', '🧔', '👱', '👩‍🦱', '🧑‍🦰', '👨‍🦲', '👧', '🧑‍🎤', '🦊', '🐱', '🌸', '🔥', '😎'];
  const bot = (fresh) => ({ name: pick(NAMES), av: pick(AVS), rating: fresh ? 0 : r2(rnd(4.3, 5)), n: fresh ? Math.floor(rnd(0, 2)) : Math.floor(rnd(3, 240)) });
  const LOWBALL = ['Bonjour, tu fais {p} ?', 'Salut ! {p} je prends direct', 'Dernier prix ? Je propose {p}', 'C\'est un peu cher… {p} ça te va ?', 'Je te fais une offre à {p} 🙏', 'Hello, possible à {p} ?', '{p} et je paie tout de suite'];
  const QUESTIONS = ['Bonjour, encore dispo ?', 'Possible d\'avoir plus de photos ?', 'Ça taille comment ?', 'Il y a des défauts ?', 'Envoi rapide possible ?'];

  /* ---------- État ---------- */
  function st() {
    const s = S();
    if (!s.occ) s.occ = { inv: [], feed: [], convs: [], orders: [], stats: { bought: 0, sold: 0, spent: 0, earned: 0, profit: 0, rate: 0, rates: 0, fakes: 0 }, last: Date.now(), nid: 1, seen: 0 };
    return s.occ;
  }
  const nid = () => st().nid++;
  function listing() {
    const c = pick(CAT), cond = pick(CONDS), cote = r2(c.cote * cond[1] * rnd(0.92, 1.08));
    let f, fake = false, kind;
    const u = Math.random();
    if (c.fake && c.cote >= 40 && u < 0.07) { f = rnd(0.22, 0.4); fake = true; kind = 'fake'; } // trop beau pour être vrai
    else if (u < 0.22) { f = rnd(0.48, 0.75); kind = 'deal'; } // bonne affaire (vendeur pressé)
    else if (u < 0.7) { f = rnd(0.88, 1.1); kind = 'fair'; }
    else { f = rnd(1.15, 1.65); kind = 'high'; }
    const price = Math.max(1, rp(cote * f));
    const size = SIZES[c.cat] ? pick(SIZES[c.cat]) : null;
    return { id: nid(), k: c.k, cond: cond[0], cote, price, fake, kind, size, seller: bot(fake || Math.random() < 0.12), likes: Math.floor(rnd(0, kind === 'deal' ? 30 : 12)), t: Date.now() - Math.floor(rnd(0, 6 * 3600000)), floor: rnd(kind === 'deal' ? 0.88 : 0.78, 0.97) };
  }
  function fillFeed() { const o = st(); while (o.feed.length < 40) o.feed.unshift(listing()); }
  const item = x => BY[x.k];
  const title = x => `${item(x).brand} ${item(x).name}`;

  /* ---------- Argent ---------- */
  function pay(eur, label) {
    if (S().cash + 1e-9 < eur) throw new Error(`Il te manque ${fmt.eur(eur - S().cash)}.`);
    S().cash -= eur; S().stats.spent = (S().stats.spent || 0) + eur;
    S().log.unshift({ t: Date.now(), kind: 'item', asset: '🏷️ Trad Occaz : ' + label, eur }); if (S().log.length > 300) S().log.length = 300;
  }
  function earn(eur, label) {
    S().cash += eur;
    S().log.unshift({ t: Date.now(), kind: 'itemsell', asset: '🏷️ Trad Occaz : ' + label, eur }); if (S().log.length > 300) S().log.length = 300;
  }
  function notify(txt, type) { st().notes = (st().notes || []).concat({ t: Date.now(), txt }).slice(-30); if (document.visibilityState === 'visible') TC.toast(txt, type || 'info', 5000); }

  /* ---------- Achats ---------- */
  function buyNow(l, price) {
    const total = r2(price + fee(price) + SHIP[item(l).size]);
    pay(total, title(l));
    const o = st();
    o.feed = o.feed.filter(x => x.id !== l.id);
    o.inv.unshift({ id: nid(), k: l.k, cond: l.cond, cote: l.cote, size: l.size, paid: total, fake: l.fake, from: l.seller.name, t: Date.now(), status: 'transit', arrive: Date.now() + rnd(45, 100) * 1000 });
    o.stats.bought++; o.stats.spent += total;
    G.save(); TC.sound('cash');
    return total;
  }
  function sendOffer(l, amount) {
    const o = st();
    const c = { id: nid(), side: 'buy', lid: l.id, l: JSON.parse(JSON.stringify(l)), who: l.seller, msgs: [{ me: 1, t: Date.now(), offer: amount }], state: 'wait', replyAt: Date.now() + rnd(4, 14) * 1000, t: Date.now() };
    o.convs.unshift(c); G.save(); return c;
  }
  function sellerReply(c) {
    const l = c.l, last = c.msgs[c.msgs.length - 1].offer, floor = rp(l.price * l.floor);
    if (last >= floor) { c.state = 'deal'; c.price = last; c.msgs.push({ t: Date.now(), txt: pick(['Ok ça marche 👍', 'Vendu ! Tu peux payer', 'D\'accord pour ' + fmt.eur(last)]), deal: last }); }
    else if (last >= floor * 0.8 && !c.countered) { const p = Math.max(floor, rp((last + l.price) / 2)); c.countered = 1; c.state = 'counter'; c.price = p; c.msgs.push({ t: Date.now(), txt: `Je peux faire ${fmt.eur(p)}, pas moins.`, offer: p }); }
    else { c.state = 'closed'; c.msgs.push({ t: Date.now(), txt: pick(['Désolé, c\'est trop bas.', 'Non merci, prix déjà bas.', 'Je ne descends pas autant, désolé.']) }); }
    c.unread = 1; notify(`💬 ${esc(c.who.name)} a répondu à ton offre`);
  }

  /* ---------- Ventes ---------- */
  const ratio = it => it.price / it.cote;
  function sale(it, price, buyer) {
    const o = st();
    it.status = 'sold'; it.soldPrice = price;
    o.orders.unshift({ id: nid(), iid: it.id, price, buyer, t: Date.now(), deadline: Date.now() + 24 * 3600000 });
    o.convs.filter(c => c.side === 'sell' && c.iid === it.id && c.state === 'open').forEach(c => { c.state = 'closed'; c.msgs.push({ t: Date.now(), txt: '(Article vendu à quelqu\'un d\'autre)' }); });
    notify(`🎉 Vendu ! <b>${esc(title(it))}</b> à ${esc(buyer.name)} pour ${fmt.eur(price)}. Envoie le colis (Profil).`, 'ok');
    TC.sound('kaching');
  }
  function botOffer(it) {
    const o = st(), b = bot(false);
    if (o.convs.some(c => c.side === 'sell' && c.iid === it.id && c.state === 'open' && c.who.name === b.name)) return;
    const max = rp(it.cote * rnd(0.82, 1.06)), offer = Math.max(1, rp(Math.min(it.price, max) * rnd(0.55, 0.88)));
    if (offer >= it.price) return;
    o.convs.unshift({ id: nid(), side: 'sell', iid: it.id, who: b, max, msgs: [{ t: Date.now(), txt: pick(LOWBALL).replace('{p}', fmt.eur(offer)), offer }], state: 'open', price: offer, t: Date.now(), unread: 1 });
    notify(`💬 ${esc(b.name)} propose ${fmt.eur(offer)} pour ${esc(title(it))}`);
  }
  function botQuestion(it) {
    const o = st(), b = bot(false);
    o.convs.unshift({ id: nid(), side: 'sell', iid: it.id, who: b, max: rp(it.cote * rnd(0.85, 1.05)), msgs: [{ t: Date.now(), txt: pick(QUESTIONS) }], state: 'open', t: Date.now(), unread: 1, q: 1 });
  }
  function botAnswer(c, counter) {
    const it = st().inv.find(x => x.id === c.iid); if (!it || it.status !== 'listed') return;
    if (counter <= c.max) { c.state = 'done'; c.msgs.push({ t: Date.now(), txt: 'Ok, j\'achète à ' + fmt.eur(counter) + ' 👍' }); sale(it, counter, c.who); }
    else if (counter <= c.max * 1.12 && !c.countered) { c.countered = 1; c.price = c.max; c.msgs.push({ t: Date.now(), txt: `Je peux monter à ${fmt.eur(c.max)}, pas plus.`, offer: c.max }); }
    else { c.state = 'closed'; c.msgs.push({ t: Date.now(), txt: pick(['Trop cher pour moi, bonne journée.', 'Ah non, tant pis.', 'Je vais chercher ailleurs, merci.']) }); }
    c.unread = 1; G.save(); render();
  }

  /* ---------- Simulation (aussi pendant l'absence, jusqu'à 8 h) ---------- */
  const chance = (rate, dt) => Math.random() < 1 - Math.exp(-rate * dt);
  function step(dt) { // dt en minutes
    const o = st();
    o.feed = o.feed.filter(l => l.id === O.view || !chance((l.kind === 'deal' ? 0.05 : l.kind === 'high' ? 0.004 : 0.012), dt)); // vendus à d'autres
    if (o.feed.length < 40 && chance(0.6, dt)) { o.feed.unshift(listing()); fillFeed(); }
    o.inv.filter(it => it.status === 'listed').forEach(it => {
      const r = ratio(it), w = Math.min(1.5, 3 / Math.log10(it.cote + 10));
      const fb = r <= 0.85 ? 3 : r <= 0.95 ? 1.6 : r <= 1.05 ? 1 : r <= 1.15 ? 0.45 : r <= 1.3 ? 0.12 : 0.02;
      it.views = (it.views || 0) + Math.round(dt * rnd(2, 8) * w * (r < 1.2 ? 1.5 : 0.7));
      if (chance(0.25 * w / Math.max(0.6, r), dt)) it.likes = (it.likes || 0) + 1;
      if (chance(0.09 * w * fb, dt)) return sale(it, it.price, bot(false));
      if (chance(0.22 * w * (r > 0.95 ? 1.4 : 0.6), dt)) botOffer(it);
      if (chance(0.04, dt)) botQuestion(it);
    });
    o.convs.filter(c => c.side === 'sell' && c.state === 'open' && Date.now() - c.t > 6 * 3600000).forEach(c => { c.state = 'closed'; });
  }
  function timers() {
    const o = st(), now = Date.now(); let ch = false;
    o.inv.filter(x => x.status === 'transit' && now >= x.arrive).forEach(x => {
      x.status = 'own'; x.got = now; ch = true;
      if (x.fake) { x.fakeSeen = 1; notify(`⚠️ Colis reçu : <b>${esc(title(x))}</b>… c'est une <b>contrefaçon</b> ! Ouvre un litige vite (Profil).`, 'bad'); TC.sound('lose'); }
      else { notify(`📦 Colis reçu : <b>${esc(title(x))}</b> est dans ton dressing`, 'ok'); TC.sound('cash'); }
    });
    o.convs.filter(c => c.side === 'buy' && c.state === 'wait' && now >= c.replyAt).forEach(c => { sellerReply(c); ch = true; });
    o.convs.filter(c => c.side === 'sell' && c.pending && now >= c.pending.at).forEach(c => { const v = c.pending.v; c.pending = null; botAnswer(c, v); ch = true; });
    o.orders.forEach(d => {
      const it = o.inv.find(x => x.id === d.iid);
      if (!d.shipped && now > d.deadline && !d.done) { d.done = 'cancel'; if (it) it.status = 'listed'; o.stats.rate += 1; o.stats.rates++; notify('❌ Commande annulée : colis pas envoyé à temps (avis 1★)', 'bad'); ch = true; }
      if (d.shipped && !d.done && now >= d.deliver) {
        d.done = 'ok'; ch = true;
        const stars = d.shipped - d.t < 3600000 ? 5 : d.shipped - d.t < 6 * 3600000 ? 4 : 3;
        o.stats.rate += stars; o.stats.rates++; o.stats.sold++; o.stats.earned += d.price;
        if (it) { o.stats.profit += d.price - (it.paid || 0); it.status = 'gone'; it.soldAt = now; }
        earn(d.price, it ? title(it) : 'vente');
        notify(`💶 ${esc(d.buyer.name)} a reçu le colis : <b>+${fmt.eur(d.price)}</b> · avis ${'★'.repeat(stars)}`, 'ok'); TC.sound('kaching');
      }
    });
    o.inv = o.inv.filter(x => x.status !== 'gone' || now - x.soldAt < 7 * 86400000).slice(0, 250);
    o.orders = o.orders.filter(d => !d.done || now - d.t < 7 * 86400000).slice(0, 80);
    o.convs = o.convs.filter(c => c.state === 'open' || c.state === 'wait' || c.state === 'deal' || c.state === 'counter' || now - c.t < 3 * 86400000).slice(0, 60);
    return ch;
  }
  function tick() {
    const o = st(), now = Date.now();
    let dt = Math.min(8 * 60, (now - (o.last || now)) / MIN);
    o.last = now;
    const sig = () => o.feed.map(l => l.id).join() + '|' + o.convs.length + '|' + o.orders.length + '|' + o.inv.map(x => x.status + (x.likes || 0)).join();
    const before = sig();
    while (dt > 0) { const d = Math.min(1, dt); step(d); dt -= d; }
    const ch = timers();
    if (ch || sig() !== before) { G.save(); render(true); }
  }

  /* ---------- Rendu ---------- */
  const photo = (x, cls) => { const c = item(x); return `<div class="oz-ph ${cls || ''}" style="--h:${(HUE[c.cat] + (c.k.length * 23) % 40)}"><span>${c.e}</span><i>${esc(c.brand)}</i></div>`; };
  const stars = (r, n) => n ? `<span class="oz-st">★ ${r.toFixed(1)}</span> <small>(${n})</small>` : '<small class="oz-new">Nouveau membre</small>';
  const tile = l => `<button class="oz-tile" data-l="${l.id}">${photo(l)}<div class="oz-tinfo"><b>${fmt.eur(l.price)}</b><small class="oz-incl">${fmt.eur(r2(l.price + fee(l.price)))} incl.</small><span>${esc(item(l).name)}</span><small>${esc(item(l).brand)} · ${esc(l.cond)}${l.size ? ' · ' + l.size : ''}</small><em>♡ ${l.likes}</em></div></button>`;
  function home() {
    const o = st(); fillFeed();
    let list = o.feed.slice();
    if (O.cat !== 'all') list = list.filter(l => item(l).cat === O.cat);
    if (O.q) { const q = O.q.toLowerCase(); list = list.filter(l => (title(l) + ' ' + item(l).cat).toLowerCase().includes(q)); }
    return `${O.tab === 'search' ? `<div class="oz-search"><input id="oz-q" placeholder="Rechercher une marque, un article…" value="${esc(O.q)}"></div>` : `<div class="oz-hero"><b>Achète malin, revends mieux 💡</b><small>Repère les prix sous la cote, négocie, revends au bon prix. Méfie-toi des affaires trop belles.</small></div>`}
      <div class="oz-cats">${CATS.map(([k, l]) => `<button data-cat="${k}" class="${O.cat === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${list.length ? `<div class="oz-grid">${list.map(tile).join('')}</div>` : '<div class="oz-empty">Aucune annonce. Essaie une autre recherche.</div>'}`;
  }
  function comps(l) { // ventes récentes d'articles comparables (étude de marché)
    let seed = l.id * 9301 + 49297; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    return [0, 1, 2].map(i => { const cond = CONDS[Math.floor(r() * 4)]; return { cond: cond[0], p: rp(item(l).cote * cond[1] * (0.88 + r() * 0.24)), d: 1 + Math.floor(r() * 12) }; });
  }
  function detail(l) {
    const c = item(l), ship = SHIP[c.size], f = fee(l.price);
    const desc = l.fake ? 'Neuf jamais porté, prix cassé car je déménage. Pas de retour. Paiement rapide svp.' : pick0(l.id, ['Très peu porté, aucun défaut. Envoi soigné.', 'Acheté l\'an dernier, je vends car je ne m\'en sers plus.', 'Quelques traces d\'usure normales (voir état). Envoi rapide.', 'Comme neuf, avec boîte d\'origine.', 'Vendu car mauvaise taille. Prix négociable raisonnablement.']);
    return `<button class="oz-back" data-back>← Retour</button>${photo(l, 'big')}
      <div class="oz-dpanel"><h2>${fmt.eur(l.price)} <small>${fmt.eur(r2(l.price + f))} avec Protection acheteurs</small></h2>
        <h3>${esc(title(l))}</h3><div class="oz-kv"><span>Marque</span><b>${esc(c.brand)}</b><span>État</span><b>${esc(l.cond)}</b>${l.size ? `<span>Taille</span><b>${l.size}</b>` : ''}<span>Livraison</span><b>Point relais · ${fmt.eur(ship)}</b><span>Ajouté</span><b>${fmt.time(l.t)}</b></div>
        <p class="oz-desc">${esc(desc)}</p>
        <div class="oz-seller"><span class="oz-av">${l.seller.av}</span><div><b>${esc(l.seller.name)}</b><div>${stars(l.seller.rating, l.seller.n)}</div></div></div></div>
      <div class="oz-dpanel"><h3>📊 Ventes récentes d'articles similaires</h3>${comps(l).map(x => `<div class="oz-comp"><span>${esc(x.cond)}</span><b>${fmt.eur(x.p)}</b><small>vendu il y a ${x.d} j</small></div>`).join('')}
        <p class="hint">Compare : c'est comme ça qu'on repère une bonne affaire… ou une arnaque.</p></div>
      <div class="oz-actions"><button class="btn" data-offer="${l.id}">Faire une offre</button><button class="btn btn-gold" data-buy="${l.id}">Acheter</button></div>`;
  }
  function pick0(id, arr) { return arr[id % arr.length]; }
  function sell() {
    const o = st(), own = o.inv.filter(x => x.status === 'own' && !x.fake);
    return `<h2 class="oz-h">➕ Vendre un article</h2>
      <p class="hint">Mets en vente ce que tu as acheté. Plus ton prix est proche (ou sous) la cote, plus ça part vite. Trop cher : les acheteurs vont surtout te faire des offres au rabais.</p>
      ${own.length ? own.map(x => `<div class="oz-row">${photo(x, 'sm')}<div class="oz-rinfo"><b>${esc(title(x))}</b><small>${esc(x.cond)} · payé ${fmt.eur(x.paid)}${x.perso ? ' · ⭐ perso' : ''}</small></div><button class="btn btn-sm btn-gold" data-list="${x.id}">Vendre</button></div>`).join('')
        : '<div class="oz-empty">Ton dressing est vide. Achète d\'abord des articles dans l\'onglet Accueil 🛍️</div>'}`;
  }
  function msgs() {
    const o = st();
    if (O.conv) { const c = o.convs.find(x => x.id === O.conv); if (c) return conv(c); }
    return `<h2 class="oz-h">💬 Messages</h2>${o.convs.length ? o.convs.map(c => {
      const last = c.msgs[c.msgs.length - 1], art = c.side === 'buy' ? c.l : o.inv.find(x => x.id === c.iid);
      return `<button class="oz-crow ${c.unread ? 'unread' : ''}" data-conv="${c.id}"><span class="oz-av">${c.who.av}</span><div><b>${esc(c.who.name)} <small>${c.side === 'buy' ? 'vendeur' : 'acheteur'}</small></b><small>${art ? esc(title(art)) : ''}</small><p>${last.me ? 'Toi : ' : ''}${last.offer && last.me ? 'offre ' + fmt.eur(last.offer) : esc(last.txt || '')}</p></div>${c.unread ? '<i></i>' : ''}</button>`;
    }).join('') : '<div class="oz-empty">Aucun message pour l\'instant.</div>'}`;
  }
  function conv(c) {
    c.unread = 0;
    const o = st(), art = c.side === 'buy' ? c.l : o.inv.find(x => x.id === c.iid);
    let acts = '';
    if (c.side === 'sell' && c.state === 'open' && art && art.status === 'listed') {
      acts = c.pending ? '<p class="hint oz-center">⏳ En attente de sa réponse…</p>'
        : c.price ? `<div class="oz-actions"><button class="btn btn-ghost" data-refuse="${c.id}">Refuser</button><button class="btn" data-counter="${c.id}">Contre-offre</button><button class="btn btn-gold" data-accept="${c.id}">Accepter ${fmt.eur(c.price)}</button></div>`
          : `<div class="oz-actions"><button class="btn" data-reply="${c.id}">Répondre « Oui, toujours dispo ! »</button></div>`;
    }
    if (c.side === 'buy' && (c.state === 'deal' || c.state === 'counter')) acts = `<div class="oz-actions">${c.state === 'counter' ? `<button class="btn btn-ghost" data-drop="${c.id}">Refuser</button>` : ''}<button class="btn btn-gold" data-paydeal="${c.id}">Payer ${fmt.eur(c.price)}</button></div>`;
    if (c.side === 'buy' && c.state === 'wait') acts = '<p class="hint oz-center">⏳ Le vendeur va répondre…</p>';
    return `<button class="oz-back" data-back>← Messages</button>
      <div class="oz-chead"><span class="oz-av">${c.who.av}</span><div><b>${esc(c.who.name)}</b><small>${art ? esc(title(art)) + (c.side === 'sell' && art.price ? ' · en vente ' + fmt.eur(art.price) : c.side === 'buy' ? ' · ' + fmt.eur(c.l.price) : '') : ''}</small></div></div>
      <div class="oz-chat">${c.msgs.map(m => `<div class="ozm ${m.me ? 'me' : ''}"><p>${m.offer && m.me ? `<b class="oz-off">Offre : ${fmt.eur(m.offer)}</b>` : ''}${m.txt ? esc(m.txt) : ''}${m.offer && !m.me ? `<b class="oz-off">${fmt.eur(m.offer)}</b>` : ''}</p></div>`).join('')}</div>${acts}`;
  }
  function profile() {
    const o = st(), s = o.stats, pse = (N.profile && N.profile.pseudo) || 'Toi';
    const listed = o.inv.filter(x => x.status === 'listed'), own = o.inv.filter(x => x.status === 'own' && !x.fake), perso = own.filter(x => x.perso), stock = own.filter(x => !x.perso);
    const transit = o.inv.filter(x => x.status === 'transit'), fakes = o.inv.filter(x => x.status === 'own' && x.fake);
    const toShip = o.orders.filter(d => !d.shipped && !d.done), going = o.orders.filter(d => d.shipped && !d.done);
    const it = d => o.inv.find(x => x.id === d.iid) || { k: 'tee' };
    const row = (x, right) => `<div class="oz-row">${photo(x, 'sm')}<div class="oz-rinfo"><b>${esc(title(x))}</b><small>${right}</small></div>`;
    return `<div class="oz-prof"><span class="oz-av big">${TC.Style ? TC.Style.avatar(Object.assign({}, N.profile, TC.Style.mine()), 'm') : '👤'}</span><div><b>${esc(pse)}</b><div>${s.rates ? `<span class="oz-st">★ ${(s.rate / s.rates).toFixed(1)}</span> <small>(${s.rates} avis)</small>` : '<small>Pas encore d\'avis</small>'}</div></div></div>
      <div class="oz-stats"><div><small>Achats</small><b>${s.bought}</b></div><div><small>Ventes</small><b>${s.sold}</b></div><div><small>Bénéfice</small><b class="${s.profit >= 0 ? 'in' : 'out'}">${s.profit >= 0 ? '+' : ''}${fmt.eur(s.profit)}</b></div></div>
      ${toShip.length ? `<div class="oz-sec warn"><h3>📦 À envoyer (${toShip.length})</h3>${toShip.map(d => row(it(d), `Vendu ${fmt.eur(d.price)} à ${esc(d.buyer.name)} · avant ${new Date(d.deadline).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`) + `<button class="btn btn-sm btn-gold" data-ship="${d.id}">Envoyer</button></div>`).join('')}<p class="hint">Envoie vite : un envoi dans l'heure = avis 5★. Pas d'envoi en 24 h = vente annulée.</p></div>` : ''}
      ${going.length ? `<div class="oz-sec"><h3>🚚 Colis en route vers tes acheteurs</h3>${going.map(d => row(it(d), `${fmt.eur(d.price)} · livré ${new Date(d.deliver).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}, puis argent versé`) + '</div>').join('')}</div>` : ''}
      ${fakes.length ? `<div class="oz-sec warn"><h3>⚠️ Contrefaçons reçues</h3>${fakes.map(x => row(x, `payé ${fmt.eur(x.paid)} à ${esc(x.from)}`) + (Date.now() - x.got < 3600000 ? `<button class="btn btn-sm btn-gold" data-litige="${x.id}">Ouvrir un litige</button>` : '<small class="out">Délai dépassé</small>') + '</div>').join('')}<p class="hint">La Protection acheteurs rembourse une contrefaçon si tu ouvres un litige dans l'heure.</p></div>` : ''}
      ${transit.length ? `<div class="oz-sec"><h3>🚚 Mes achats en livraison</h3>${transit.map(x => row(x, `arrive vers ${new Date(x.arrive).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`) + '</div>').join('')}</div>` : ''}
      <div class="oz-sec"><h3>🏷️ En vente (${listed.length})</h3>${listed.length ? listed.map(x => row(x, `${fmt.eur(x.price)} · 👁️ ${x.views || 0} · ♡ ${x.likes || 0}`) + `<button class="btn btn-sm" data-edit="${x.id}">Modifier</button></div>`).join('') : '<div class="oz-empty sm">Rien en vente.</div>'}</div>
      <div class="oz-sec"><h3>👕 Mon dressing (${stock.length})</h3>${stock.length ? stock.map(x => row(x, `${esc(x.cond)} · payé ${fmt.eur(x.paid)}`) + `<button class="btn btn-sm" data-keep="${x.id}">⭐ Garder</button><button class="btn btn-sm btn-gold" data-list="${x.id}">Vendre</button></div>`).join('') : '<div class="oz-empty sm">Vide.</div>'}</div>
      <div class="oz-sec"><h3>⭐ Ma collection perso (${perso.length})</h3>${perso.length ? perso.map(x => row(x, `${esc(x.cond)} · à moi`) + `<button class="btn btn-sm" data-keep="${x.id}">Retirer</button></div>`).join('') : '<div class="oz-empty sm">Les articles que tu gardes pour toi apparaissent ici.</div>'}</div>
      <a class="btn oz-game" href="./">🎮 Retour au jeu Trad Center</a>`;
  }

  const NAV = [['home', '🏠', 'Accueil'], ['search', '🔍', 'Rechercher'], ['sell', '➕', 'Vendre'], ['msgs', '💬', 'Messages'], ['profile', '👤', 'Profil']];
  function render(soft) {
    const r = $('#occaz'); if (!r) return;
    if (soft && (document.activeElement && document.activeElement.tagName === 'INPUT' || $('#modal.open'))) return;
    if (!N.ready) { r.innerHTML = '<div class="oz-login"><div class="oz-logo">🏷️</div><p>Connexion…</p></div>'; return; }
    if (!N.user || !N.profile) { r.innerHTML = `<div class="oz-login"><div class="oz-logo">🏷️</div><h1>Trad Occaz</h1><p>Achète et revends des articles d'occasion avec l'argent de ton compte Trad Center.</p><a class="btn btn-gold btn-xl" href="./">Se connecter dans le jeu</a></div>`; return; }
    const unread = st().convs.filter(c => c.unread).length, ship = st().orders.filter(d => !d.shipped && !d.done).length;
    let body;
    if (O.view) { const l = st().feed.find(x => x.id === O.view); body = l ? detail(l) : (O.view = null, home()); }
    else body = O.tab === 'sell' ? sell() : O.tab === 'msgs' ? msgs() : O.tab === 'profile' ? profile() : home();
    const y = window.scrollY;
    r.innerHTML = `<header class="oz-top"><b>🏷️ Trad Occaz</b><span class="oz-cash">${fmt.eur(S().cash)}</span></header><main class="oz-main">${body}</main>
      <nav class="oz-nav">${NAV.map(([k, i, l]) => `<button data-tab="${k}" class="${O.tab === k ? 'on' : ''}"><i>${i}${k === 'msgs' && unread ? `<em>${unread}</em>` : k === 'profile' && ship ? `<em>${ship}</em>` : ''}</i><span>${l}</span></button>`).join('')}</nav>`;
    if (soft) window.scrollTo(0, y);
    const c = $('.oz-chat'); if (c) c.scrollTop = c.scrollHeight;
  }
  const go = (tab) => { O.tab = tab; O.view = null; O.conv = null; render(); window.scrollTo(0, 0); };

  /* ---------- Fenêtres ---------- */
  function buyModal(l, price, conv) {
    const c = item(l), f = fee(price), sh = SHIP[c.size], tot = r2(price + f + sh);
    const md = TC.modal(`<h2>🛒 Paiement</h2><div class="modal-body"><div class="oz-sum">${photo(l, 'sm')}<b>${esc(title(l))}</b></div>
      <div class="oz-kv"><span>Article</span><b>${fmt.eur(price)}</b><span>Protection acheteurs</span><b>${fmt.eur(f)}</b><span>Livraison point relais</span><b>${fmt.eur(sh)}</b><span><b>Total</b></span><b>${fmt.eur(tot)}</b></div>
      <p class="hint">Solde : ${fmt.eur(S().cash)}. La Protection acheteurs te rembourse si l'article est une contrefaçon (litige sous 1 h après réception).</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="oz-pay">Payer ${fmt.eur(tot)}</button></div></div>`);
    md.el.querySelector('#oz-pay').onclick = () => {
      try { buyNow(l, price); if (conv) { conv.state = 'paid'; conv.msgs.push({ me: 1, t: Date.now(), txt: 'Payé ✅' }); } md.close(); TC.toast('✅ Acheté ! Le colis arrive dans environ une minute (Profil → livraison).', 'ok', 6000); O.view = null; G.save(); render(); }
      catch (e) { TC.toast(e.message, 'bad'); }
    };
  }
  function offerModal(l) {
    const min = Math.max(1, Math.ceil(l.price * 0.6));
    const md = TC.modal(`<h2>💬 Faire une offre</h2><div class="modal-body"><p>${esc(title(l))} · prix demandé <b>${fmt.eur(l.price)}</b></p>
      <div class="oz-qoff">${[0.9, 0.8, 0.7].map(k => `<button data-k="${rp(l.price * k)}">${fmt.eur(rp(l.price * k))}<small>−${Math.round((1 - k) * 100)} %</small></button>`).join('')}</div>
      <label class="fld">Ton offre (minimum ${fmt.eur(min)})<div class="inp"><input id="oz-off" type="number" inputmode="decimal" min="${min}" step="1" value="${rp(l.price * 0.85)}"></div></label>
      <p class="hint">Une offre trop basse vexe le vendeur. Il peut accepter, refuser ou te faire une contre-offre.</p>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="oz-send">Envoyer l'offre</button></div></div>`);
    md.el.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => { md.el.querySelector('#oz-off').value = b.dataset.k; }; });
    md.el.querySelector('#oz-send').onclick = () => {
      const v = +md.el.querySelector('#oz-off').value;
      if (!(v >= min)) return TC.toast(`Minimum ${fmt.eur(min)} (60 % du prix)`, 'bad');
      if (v >= l.price) return TC.toast('C\'est le prix demandé : achète directement !', 'info');
      const c = sendOffer(l, v); md.close(); O.view = null; O.tab = 'msgs'; O.conv = c.id; render();
    };
  }
  function listModal(x) {
    const lo = rp(x.cote * 0.85), hi = rp(x.cote * 1.1);
    const md = TC.modal(`<h2>🏷️ ${x.status === 'listed' ? 'Modifier l\'annonce' : 'Mettre en vente'}</h2><div class="modal-body"><div class="oz-sum">${photo(x, 'sm')}<b>${esc(title(x))}</b></div>
      <div class="oz-kv"><span>État</span><b>${esc(x.cond)}</b><span>Tu l'as payé</span><b>${fmt.eur(x.paid)}</b><span>Prix conseillé</span><b>${fmt.eur(lo)} – ${fmt.eur(hi)}</b></div>
      <label class="fld">Ton prix<div class="inp"><input id="oz-price" type="number" inputmode="decimal" min="1" step="1" value="${x.price || rp(x.cote * 1.05)}"></div></label>
      <p class="hint" id="oz-pmsg"></p>
      <div class="modal-actions">${x.status === 'listed' ? '<button class="btn btn-ghost" id="oz-unlist">Retirer de la vente</button>' : '<button class="btn btn-ghost" data-close>Annuler</button>'}<button class="btn btn-gold" id="oz-list">${x.status === 'listed' ? 'Enregistrer' : 'Publier l\'annonce'}</button></div></div>`);
    const inp = md.el.querySelector('#oz-price'), msg = md.el.querySelector('#oz-pmsg');
    const upd = () => { const p = +inp.value || 0, r = p / x.cote, m = p - x.paid; msg.innerHTML = `${r <= 0.95 ? '⚡ Prix attractif : ça va partir vite.' : r <= 1.1 ? '👍 Prix juste.' : r <= 1.3 ? '🐢 Un peu cher : attends-toi à des offres au rabais.' : '🧊 Trop cher : ça ne se vendra presque pas.'} Marge : <b class="${m >= 0 ? 'in' : 'out'}">${m >= 0 ? '+' : ''}${fmt.eur(m)}</b>`; };
    inp.oninput = upd; upd();
    md.el.querySelector('#oz-list').onclick = () => { const p = Math.round(+inp.value); if (!(p >= 1)) return TC.toast('Entre un prix', 'bad'); x.price = p; x.status = 'listed'; x.perso = false; x.listedAt = x.listedAt || Date.now(); G.save(); md.close(); TC.toast('🏷️ Annonce en ligne !', 'ok'); render(); };
    const un = md.el.querySelector('#oz-unlist'); if (un) un.onclick = () => { x.status = 'own'; G.save(); md.close(); render(); };
  }
  function counterModal(c) {
    const it = st().inv.find(x => x.id === c.iid);
    const md = TC.modal(`<h2>↔️ Contre-offre</h2><div class="modal-body"><p>${esc(c.who.name)} propose <b>${fmt.eur(c.price)}</b>. Ton annonce : ${fmt.eur(it.price)}.</p>
      <label class="fld">Ton prix<div class="inp"><input id="oz-ct" type="number" inputmode="decimal" step="1" value="${rp((c.price + it.price) / 2)}"></div></label>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-gold" id="oz-ctgo">Envoyer</button></div></div>`);
    md.el.querySelector('#oz-ctgo').onclick = () => { const v = Math.round(+md.el.querySelector('#oz-ct').value); if (!(v > 0)) return; c.msgs.push({ me: 1, t: Date.now(), offer: v }); c.pending = { v, at: Date.now() + rnd(3, 9) * 1000 }; G.save(); md.close(); render(); };
  }

  /* ---------- Clics ---------- */
  document.addEventListener('click', e => {
    const t = e.target, d = k => { const el = t.closest('[data-' + k + ']'); return el ? el.dataset[k] : null; };
    const o = st(), find = id => o.feed.find(x => x.id === +id), inv = id => o.inv.find(x => x.id === +id), cv = id => o.convs.find(x => x.id === +id);
    let v;
    if ((v = d('tab'))) return go(v);
    if (t.closest('[data-back]')) { if (O.conv) O.conv = null; else O.view = null; render(); return; }
    if ((v = d('cat'))) { O.cat = v; render(); return; }
    if ((v = d('l'))) { O.view = +v; render(); window.scrollTo(0, 0); return; }
    if ((v = d('buy'))) { const l = find(v); if (l) buyModal(l, l.price); return; }
    if ((v = d('offer'))) { const l = find(v); if (l) offerModal(l); return; }
    if ((v = d('conv'))) { O.conv = +v; render(); window.scrollTo(0, 0); return; }
    if ((v = d('list')) || (v = d('edit'))) { const x = inv(v); if (x) listModal(x); return; }
    if ((v = d('keep'))) { const x = inv(v); if (x) { x.perso = !x.perso; G.save(); TC.toast(x.perso ? '⭐ Ajouté à ta collection perso' : 'Retiré de ta collection', 'ok'); render(); } return; }
    if ((v = d('ship'))) { const od = o.orders.find(x => x.id === +v); if (od) { od.shipped = Date.now(); od.deliver = Date.now() + rnd(60, 120) * 1000; G.save(); TC.sound('click'); TC.toast('📦 Colis déposé au point relais ! L\'argent arrive à la livraison.', 'ok', 5000); render(); } return; }
    if ((v = d('litige'))) { const x = inv(v); if (x && x.fake && Date.now() - x.got < 3600000) { earn(x.paid, 'remboursement litige'); o.stats.fakes++; o.stats.bought--; o.stats.spent -= x.paid; x.status = 'gone'; x.soldAt = Date.now(); G.save(); TC.sound('cash'); TC.toast(`🛡️ Litige gagné : ${fmt.eur(x.paid)} remboursés. Leçon : une affaire trop belle cache souvent une arnaque.`, 'ok', 8000); render(); } return; }
    if ((v = d('accept'))) { const c = cv(v), it = c && inv(c.iid); if (c && it && it.status === 'listed') { c.state = 'done'; c.msgs.push({ me: 1, t: Date.now(), txt: 'Offre acceptée ✅' }); sale(it, c.price, c.who); G.save(); render(); } return; }
    if ((v = d('refuse'))) { const c = cv(v); if (c) { c.state = 'closed'; c.msgs.push({ me: 1, t: Date.now(), txt: 'Non merci.' }); G.save(); render(); } return; }
    if ((v = d('counter'))) { const c = cv(v); if (c) counterModal(c); return; }
    if ((v = d('reply'))) { const c = cv(v), it = c && inv(c.iid); if (c && it) { c.msgs.push({ me: 1, t: Date.now(), txt: 'Oui, toujours dispo !' }); c.state = 'closed'; if (Math.random() < (ratio(it) <= 1.1 ? 0.5 : 0.15)) setTimeout(() => { if (it.status === 'listed') { c.msgs.push({ t: Date.now(), txt: 'Parfait, j\'achète !' }); sale(it, it.price, c.who); G.save(); render(true); } }, rnd(3, 8) * 1000); G.save(); render(); } return; }
    if ((v = d('paydeal'))) { const c = cv(v); if (c) { const l = find(c.lid); if (!l) { c.state = 'closed'; TC.toast('Trop tard : l\'article a été vendu à quelqu\'un d\'autre.', 'bad'); render(); return; } buyModal(l, c.price, c); } return; }
    if ((v = d('drop'))) { const c = cv(v); if (c) { c.state = 'closed'; c.msgs.push({ me: 1, t: Date.now(), txt: 'Non merci.' }); G.save(); render(); } return; }
  });
  document.addEventListener('input', e => { if (e.target.id === 'oz-q') { O.q = e.target.value; clearTimeout(O.qt); O.qt = setTimeout(() => { render(); const i = $('#oz-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); } });

  O.render = render;
  N.on((type, d) => {
    if (type === 'askSave') d.res('cloud');
    if (type === 'linked' || type === 'synced' || type === 'change') { st(); render(true); }
  });
  N.init(); TC.Data.start(); render();
  setInterval(tick, 3000); setTimeout(tick, 800);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();

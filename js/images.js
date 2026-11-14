/* Trad Center — vraies photos (Wikipedia / Wikimedia Commons, licences libres)
 * Les URL sont résolues depuis le navigateur du joueur via l'API Wikipedia,
 * puis mises en cache 7 jours. Pour chaque objet, plusieurs articles sont essayés
 * dans l'ordre : le premier qui a une photo gagne. Sans réseau → visuel de secours.
 */
(function () {
  TC.WIKI = {
    // ---- véhicules ----
    'scooter-elec': ['Xiaomi Mi Electric Scooter', 'Motorized scooter', 'Kick scooter'],
    vespa: ['Vespa Primavera', 'Vespa'],
    mt07: ['Yamaha MT-07'],
    clio: ['Renault Clio V', 'Renault Clio'],
    model3: ['Tesla Model 3'],
    golfr: ['Volkswagen Golf R', 'Volkswagen Golf Mk8'],
    m3: ['BMW M3 (G80)', 'BMW M3'],
    '911': ['Porsche 911 (992)', 'Porsche 911'],
    r8: ['Audi R8 (Type 4S)', 'Audi R8'],
    taycan: ['Porsche Taycan'],
    g63: ['Mercedes-AMG G 63', 'Mercedes-Benz G-Class (W465)', 'Mercedes-Benz G-Class'],
    roma: ['Ferrari Roma'],
    db12: ['Aston Martin DB12'],
    huracan: ['Lamborghini Huracán'],
    urus: ['Lamborghini Urus'],
    conti: ['Bentley Continental GT'],
    gt3rs: ['Porsche 911 GT3 RS', 'Porsche 911 GT3'],
    '296': ['Ferrari 296 GTB', 'Ferrari 296'],
    sto: ['Lamborghini Huracán STO', 'Lamborghini Huracán'],
    '750s': ['McLaren 750S', 'McLaren 720S'],
    puro: ['Ferrari Purosangue'],
    cullinan: ['Rolls-Royce Cullinan'],
    sf90: ['Ferrari SF90 Stradale'],
    revuelto: ['Lamborghini Revuelto'],
    f40: ['Ferrari F40'],
    utopia: ['Pagani Utopia', 'Pagani Huayra'],
    jesko: ['Koenigsegg Jesko'],
    chiron: ['Bugatti Chiron'],
    tourbillon: ['Bugatti Tourbillon'],
    // ---- immobilier ----
    parking: ['Parking space', 'Parking lot'],
    creuse: ['Longère', 'Creuse'],
    chambre: ['Chambre de bonne', 'Mansard roof'],
    studio: ['Studio apartment', 'Lyon'],
    t3: ['Marseille'],
    nantes: ['Nantes'],
    haussmann: ['Haussmann\'s renovation of Paris', 'Haussmann architecture'],
    manhattan: ['Loft', 'Manhattan'],
    tropez: ['Saint-Tropez'],
    chateau: ['Château Margaux', 'Bordeaux wine'],
    courchevel: ['Courchevel'],
    dubai: ['Palm Jumeirah'],
    monaco: ['Monte Carlo', 'Monaco'],
    ile: ['Private island', 'The Bahamas'],
    tour: ['La Défense'],
    // ---- luxe ----
    airpods: ['iPhone 17 Pro', 'iPhone 16 Pro', 'iPhone'],
    rolex: ['Rolex Submariner'],
    birkin: ['Birkin bag'],
    nautilus: ['Patek Philippe Nautilus', 'Patek Philippe'],
    rm: ['Richard Mille'],
    heli: ['Eurocopter EC130', 'Airbus Helicopters H130'],
    riva: ['Riva Aquarama', 'Riva (shipyard)'],
    citation: ['Cessna CitationJet/M2', 'Cessna Citation'],
    superyacht: ['Superyacht', 'Motor yacht'],
    g700: ['Gulfstream G700', 'Gulfstream G650'],
    club: ['Parc des Princes', 'Stadium'],
    fusee: ['SpaceX Starship', 'Falcon 9'],
  };

  const KEY = 'tradcenter.img.v2';
  const TTL = 7 * 86400000;
  let cache = {};
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && Date.now() - c.at < TTL) cache = c.map || {}; } catch (e) { }
  TC.img = id => (cache[id] && cache[id].src) || null;
  TC.imgPage = id => (cache[id] && cache[id].page) || null;
  const subs = [];
  TC.onImages = f => subs.push(f);

  async function resolve() {
    const need = Object.keys(TC.WIKI).filter(id => !cache[id]);
    if (!need.length) return;
    const titles = [...new Set(need.flatMap(id => TC.WIKI[id]))];
    const thumbs = {}; const map = {};
    for (let i = 0; i < titles.length; i += 45) {
      const chunk = titles.slice(i, i + 45);
      const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=900&pilimit=50&titles=' + encodeURIComponent(chunk.join('|'));
      try {
        const j = await TC.Data.fetchJSON(url, 12000);
        const q = j.query || {};
        (q.normalized || []).forEach(n => { map[n.from] = n.to; });
        (q.redirects || []).forEach(n => { map[n.from] = n.to; });
        Object.values(q.pages || {}).forEach(p => { if (p.thumbnail && p.thumbnail.source) thumbs[p.title] = p.thumbnail.source; });
      } catch (e) { return; } // pas de réseau : on réessaiera au prochain lancement
    }
    const final = t => { let x = t, k = 0; while (map[x] && k++ < 4) x = map[x]; return x; };
    need.forEach(id => {
      for (const t of TC.WIKI[id]) {
        const f = final(t);
        if (thumbs[f]) { cache[id] = { src: thumbs[f], page: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(f.replace(/ /g, '_')) }; return; }
      }
      cache[id] = { src: null };
    });
    try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), map: cache })); } catch (e) { }
    subs.forEach(f => f());
  }
  TC.loadImages = resolve;

  // Visuel d'un article : photo réelle si disponible, sinon dégradé + emoji
  TC.itemVis = function (it, cls = '', extra = '') {
    const src = TC.img(it.id);
    return `<div class="item-vis ${cls} ${src ? 'has-img' : ''}" style="background:linear-gradient(135deg,${it.grad[0]},${it.grad[1]})">
      <span class="vis-emoji">${it.emoji}</span>
      ${src ? `<img src="${src}" alt="${TC.esc(it.brand + ' ' + it.model)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('has-img');this.remove()">` : ''}
      ${extra}</div>`;
  };
})();

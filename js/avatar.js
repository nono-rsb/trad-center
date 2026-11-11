/* Trad Center — vrais avatars dessinés (SVG), personnalisables à 100 %, gratuits.
 * Peau, visage, yeux, sourcils, nez, bouche, cheveux, barbe, vêtement, fond, détails + toutes les couleurs.
 * Les articles de marque achetés dans « Mon style » (casquette, lunettes, chaîne, tenue…) sont dessinés dessus.
 * Stocké dans look.av (profil public), donc visible par tous les joueurs.
 */
(function () {
  const TC = window.TC = window.TC || {};
  const AV = TC.Avatar = {};
  const SKIN = ['#ffe3cc', '#f9d0b0', '#eab38f', '#d6a06f', '#b67d52', '#8f5c3b', '#6b4029', '#47291a'];
  const HAIRC = ['#17110e', '#3b2416', '#6a4126', '#a2683b', '#d6a25a', '#f1d17c', '#b8452b', '#e2e2e2', '#ffffff', '#2f6bff', '#ff4fa3', '#8a4dff', '#21c48b'];
  const EYEC = ['#3b2416', '#6a4126', '#2e7bd6', '#3aa36b', '#7d8c9b', '#a06a2c', '#7a3fd0'];
  const CLOTHC = ['#1f2937', '#ffffff', '#e5352b', '#ff8a2a', '#f5c400', '#1f9a55', '#2f6bff', '#7a3fd0', '#ff4fa3', '#8b5e3c', '#9aa3ad', '#0f766e'];
  const BGC = ['#ffd6a5', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#ffadad', '#2b2d42', '#14213d', '#e9ecef', '#1b4332'];
  const OPTS = {
    head: [['ovale', 'Ovale'], ['rond', 'Rond'], ['carre', 'Carré'], ['long', 'Allongé']],
    eyes: [['normal', 'Normaux'], ['amande', 'Amande'], ['points', 'Points'], ['joyeux', 'Joyeux'], ['endormi', 'Endormis'], ['clin', 'Clin d\'œil'], ['etoiles', 'Étoiles'], ['cils', 'Avec cils']],
    brows: [['fins', 'Fins'], ['epais', 'Épais'], ['colere', 'Sérieux'], ['surpris', 'Surpris'], ['aucun', 'Aucun']],
    nose: [['petit', 'Petit'], ['bouton', 'Bouton'], ['large', 'Large'], ['pointu', 'Pointu']],
    mouth: [['sourire', 'Sourire'], ['dents', 'Grand sourire'], ['neutre', 'Neutre'], ['malin', 'Malin'], ['o', 'Surpris'], ['langue', 'Langue'], ['levres', 'Lèvres']],
    hair: [['court', 'Court'], ['rase', 'Rasé'], ['raie', 'Raie de côté'], ['pics', 'En pics'], ['boucles', 'Bouclé'], ['afro', 'Afro'], ['long', 'Long'], ['chignon', 'Chignon'], ['queue', 'Queue de cheval'], ['crete', 'Crête'], ['tresses', 'Tresses'], ['vagues', 'Waves'], ['chauve', 'Chauve']],
    beard: [['aucune', 'Aucune'], ['ombre', 'Barbe de 3 jours'], ['pleine', 'Pleine'], ['bouc', 'Bouc'], ['moustache', 'Moustache']],
    cloth: [['tshirt', 'T-shirt'], ['hoodie', 'Sweat à capuche'], ['chemise', 'Chemise'], ['costume', 'Costume'], ['maillot', 'Maillot'], ['colroule', 'Col roulé']],
    extra: [['aucun', 'Aucun'], ['rousseur', 'Taches de rousseur'], ['joues', 'Joues roses'], ['boucle', 'Boucle d\'oreille'], ['grain', 'Grain de beauté']],
  };
  AV.OPTS = OPTS;
  const DEF = { sk: SKIN[2], head: 'ovale', eyes: 'normal', ec: EYEC[0], brows: 'fins', nose: 'petit', mouth: 'sourire', hair: 'court', hc: HAIRC[1], beard: 'aucune', cloth: 'tshirt', cc: CLOTHC[6], bg: BGC[3], extra: 'aucun' };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  AV.random = () => ({ sk: pick(SKIN), head: pick(OPTS.head)[0], eyes: pick(OPTS.eyes.slice(0, 6))[0], ec: pick(EYEC), brows: pick(OPTS.brows.slice(0, 4))[0], nose: pick(OPTS.nose)[0], mouth: pick(OPTS.mouth.slice(0, 5))[0], hair: pick(OPTS.hair)[0], hc: pick(HAIRC.slice(0, 8)), beard: Math.random() < 0.35 ? pick(OPTS.beard.slice(1))[0] : 'aucune', cloth: pick(OPTS.cloth)[0], cc: pick(CLOTHC), bg: pick(BGC), extra: Math.random() < 0.3 ? pick(OPTS.extra.slice(1))[0] : 'aucun' });
  const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : null;
  function mix(c, k) { // assombrit (k < 0) ou éclaircit (k > 0) une couleur
    const n = parseInt(c.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- Dessin (viewBox 100 × 100) ---------- */
  function hairBack(s, hc) {
    switch (s) {
      case 'long': return `<path d="M27 42 C26 19 39 13 50 13 C61 13 74 19 73 42 L76 80 C68 83 61 80 59 75 L41 75 C39 80 32 83 24 80 Z" fill="${hc}"/>`;
      case 'afro': return `<circle cx="50" cy="37" r="29" fill="${hc}"/>`;
      case 'chignon': return `<circle cx="50" cy="14" r="9" fill="${hc}"/>`;
      case 'queue': return `<path d="M64 24 C80 26 82 46 74 62 C72 50 70 40 62 32 Z" fill="${hc}"/>`;
      case 'tresses': return [32, 38, 44, 56, 62, 68].map(x => `<rect x="${x - 2}" y="34" width="4.4" height="${x < 50 ? 40 - (44 - x) : 40 - (x - 56)}" rx="2.2" fill="${hc}"/>`).join('');
      case 'boucles': return `<circle cx="31" cy="46" r="7" fill="${hc}"/><circle cx="69" cy="46" r="7" fill="${hc}"/>`;
      default: return '';
    }
  }
  function hairFront(s, hc) {
    const d = mix(hc, -0.25);
    switch (s) {
      case 'court': return `<path d="M30 44 C29 25 40 18 50 18 C61 18 71 25 70 44 C67 34 60 29 50 29 C41 29 34 34 30 44 Z" fill="${hc}"/>`;
      case 'rase': return `<path d="M31 40 C31 25 41 20 50 20 C60 20 69 25 69 40 C64 31 57 28 50 28 C43 28 36 31 31 40 Z" fill="${hc}" opacity=".6"/>`;
      case 'raie': return `<path d="M29 46 C27 24 40 16 52 17 C65 18 73 27 71 46 C69 36 66 31 60 28 C52 33 41 33 34 30 C31 35 30 40 29 46 Z" fill="${hc}"/><path d="M58 18 C57 23 58 26 60 28" stroke="${d}" stroke-width="1" fill="none"/>`;
      case 'pics': return `<path d="M30 41 L31 24 L37 28 L39 15 L45 24 L50 12 L55 24 L61 15 L63 28 L69 24 L70 41 C64 31 57 29 50 29 C43 29 36 31 30 41 Z" fill="${hc}"/>`;
      case 'boucles': return [[33, 32], [38, 25], [45, 21], [52, 20], [59, 22], [65, 27], [68, 34], [31, 39], [42, 27], [55, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.2" fill="${hc}"/>`).join('') + `<circle cx="47" cy="26" r="2" fill="${d}" opacity=".5"/><circle cx="60" cy="29" r="2" fill="${d}" opacity=".5"/>`;
      case 'afro': return `<path d="M31 40 C33 28 42 25 50 25 C58 25 67 28 69 40 C62 33 38 33 31 40 Z" fill="${d}" opacity=".35"/>`;
      case 'long': return `<path d="M29 48 C27 24 40 16 51 17 C64 18 73 27 71 48 C68 36 62 30 55 28 C48 32 38 33 31 36 C30 40 29 44 29 48 Z" fill="${hc}"/>`;
      case 'chignon': case 'queue': return `<path d="M30 42 C29 24 40 18 50 18 C61 18 71 24 70 42 C66 32 60 28 50 28 C41 28 34 32 30 42 Z" fill="${hc}"/><path d="M36 27 C42 23 58 23 64 27" stroke="${d}" stroke-width=".8" fill="none" opacity=".6"/>`;
      case 'crete': return `<path d="M31 40 C31 27 40 22 50 22 C60 22 69 27 69 40" fill="${hc}" opacity=".35"/><path d="M45 30 L44 9 C48 6 52 6 56 9 L55 30 Z" fill="${hc}"/>`;
      case 'tresses': return `<path d="M30 42 C29 24 40 18 50 18 C61 18 71 24 70 42 C66 32 60 28 50 28 C41 28 34 32 30 42 Z" fill="${hc}"/>${[37, 43, 50, 57, 63].map(x => `<path d="M${x} 20 L${x + (x - 50) * 0.12} 30" stroke="${d}" stroke-width="1.1"/>`).join('')}`;
      case 'vagues': return `<path d="M31 40 C31 25 41 20 50 20 C60 20 69 25 69 40 C64 31 57 28 50 28 C43 28 36 31 31 40 Z" fill="${hc}"/>${[24, 28, 32].map(y => `<path d="M36 ${y + 2} Q40 ${y - 1} 44 ${y + 2} T52 ${y + 2} T60 ${y + 2} T66 ${y + 3}" stroke="${d}" stroke-width=".9" fill="none"/>`).join('')}`;
      default: return '';
    }
  }
  function head(s, sk) {
    switch (s) {
      case 'rond': return `<ellipse cx="50" cy="45" rx="20.5" ry="21.5" fill="${sk}"/>`;
      case 'carre': return `<rect x="30.5" y="23" width="39" height="44" rx="12" fill="${sk}"/>`;
      case 'long': return `<ellipse cx="50" cy="45" rx="17.5" ry="24.5" fill="${sk}"/>`;
      default: return `<ellipse cx="50" cy="45" rx="19" ry="23" fill="${sk}"/>`;
    }
  }
  function eyes(s, ec, sk) {
    const one = (x, w) => {
      switch (w) {
        case 'points': return `<circle cx="${x}" cy="46" r="2.2" fill="#1d1d1f"/>`;
        case 'joyeux': return `<path d="M${x - 3.6} 47 Q${x} 42.5 ${x + 3.6} 47" stroke="#1d1d1f" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
        case 'amande': return `<path d="M${x - 4.5} 46 Q${x} 42.6 ${x + 4.5} 46 Q${x} 48.6 ${x - 4.5} 46 Z" fill="#fff"/><circle cx="${x}" cy="45.9" r="1.9" fill="${ec}"/><circle cx="${x}" cy="45.9" r=".9" fill="#111"/>`;
        case 'etoiles': return `<path d="M${x} 42.4 L${x + 1.1} 45 L${x + 3.8} 45.2 L${x + 1.7} 47 L${x + 2.4} 49.6 L${x} 48.2 L${x - 2.4} 49.6 L${x - 1.7} 47 L${x - 3.8} 45.2 L${x - 1.1} 45 Z" fill="#ffc400" stroke="#c98a00" stroke-width=".5"/>`;
        default: return `<ellipse cx="${x}" cy="46" rx="4" ry="3.1" fill="#fff"/><circle cx="${x}" cy="46.2" r="2.1" fill="${ec}"/><circle cx="${x}" cy="46.2" r="1" fill="#111"/><circle cx="${x + .8}" cy="45.3" r=".55" fill="#fff"/>`;
      }
    };
    if (s === 'clin') return one(42, 'normal') + one(58, 'joyeux');
    if (s === 'endormi') return [42, 58].map(x => one(x, 'normal') + `<path d="M${x - 4.4} 46.2 Q${x} 41.5 ${x + 4.4} 46.2 Z" fill="${mix(sk, -0.06)}"/><path d="M${x - 4.4} 46.2 L${x + 4.4} 46.2" stroke="#1d1d1f" stroke-width=".9"/>`).join('');
    if (s === 'cils') return [42, 58].map(x => one(x, 'normal') + `<path d="M${x - 4} 44.6 Q${x} 41.8 ${x + 4} 44.6" stroke="#1d1d1f" stroke-width="1.2" fill="none"/><path d="M${x + (x < 50 ? -4 : 4)} 44.6 l${x < 50 ? -1.6 : 1.6} -1.4" stroke="#1d1d1f" stroke-width="1"/>`).join('');
    return one(42, s) + one(58, s);
  }
  function brows(s, hc) {
    const c = mix(hc, -0.15);
    switch (s) {
      case 'epais': return `<path d="M37 40 Q42 37.6 46.5 39.6" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M53.5 39.6 Q58 37.6 63 40" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
      case 'colere': return `<path d="M37 38.6 L46.5 41" stroke="${c}" stroke-width="2" stroke-linecap="round"/><path d="M53.5 41 L63 38.6" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
      case 'surpris': return `<path d="M37.5 39 Q42 34.8 46.5 38" stroke="${c}" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M53.5 38 Q58 34.8 62.5 39" stroke="${c}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
      case 'aucun': return '';
      default: return `<path d="M37.5 40.4 Q42 38.4 46.5 40" stroke="${c}" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M53.5 40 Q58 38.4 62.5 40.4" stroke="${c}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    }
  }
  function nose(s, sk) {
    const c = mix(sk, -0.22);
    switch (s) {
      case 'bouton': return `<circle cx="50" cy="52.5" r="2" fill="${c}"/>`;
      case 'large': return `<path d="M46.5 53 Q50 56 53.5 53" stroke="${c}" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M50 46 L49.3 51" stroke="${c}" stroke-width="1" />`;
      case 'pointu': return `<path d="M50 46 L47.6 54 L51.4 54" stroke="${c}" stroke-width="1.2" fill="none" stroke-linejoin="round"/>`;
      default: return `<path d="M50.4 47 Q48.4 52.6 50.6 54" stroke="${c}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    }
  }
  function mouth(s) {
    switch (s) {
      case 'dents': return `<path d="M43 58.5 Q50 67 57 58.5 Z" fill="#fff" stroke="#7a2b2b" stroke-width="1.2" stroke-linejoin="round"/>`;
      case 'neutre': return `<path d="M45 60 L55 60" stroke="#7a2b2b" stroke-width="1.6" stroke-linecap="round"/>`;
      case 'malin': return `<path d="M45 60.5 Q51.5 62.5 56 57.5" stroke="#7a2b2b" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      case 'o': return `<ellipse cx="50" cy="60.5" rx="2.8" ry="3.4" fill="#5a1d1d"/>`;
      case 'langue': return `<path d="M43 58.5 Q50 66 57 58.5 Z" fill="#5a1d1d"/><path d="M47 61.5 Q50 67.5 53 61.5 Z" fill="#ff7b93"/>`;
      case 'levres': return `<path d="M44 59.5 Q47 57 50 58.6 Q53 57 56 59.5 Q50 64.5 44 59.5 Z" fill="#d6405a"/>`;
      default: return `<path d="M44 59 Q50 64.5 56 59" stroke="#7a2b2b" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    }
  }
  function beard(s, hc) {
    switch (s) {
      case 'ombre': return `<path d="M31 48 C32 66 40 71 50 71 C60 71 68 66 69 48 C66 58 60 62 50 62 C40 62 34 58 31 48 Z" fill="${hc}" opacity=".28"/>`;
      case 'pleine': return `<path d="M30.5 46 C31 67 40 74 50 74 C60 74 69 67 69.5 46 C66 57 61 57 57 56 C53 55 47 55 43 56 C39 57 34 57 30.5 46 Z" fill="${hc}"/>`;
      case 'bouc': return `<path d="M44 63 C45 70 55 70 56 63 C53 65 47 65 44 63 Z" fill="${hc}"/><path d="M44.5 57 Q50 55 55.5 57" stroke="${hc}" stroke-width="1.8" fill="none"/>`;
      case 'moustache': return `<path d="M43 57.4 Q47 54.4 50 56.4 Q53 54.4 57 57.4 Q53 58.4 50 57.6 Q47 58.4 43 57.4 Z" fill="${hc}"/>`;
      default: return '';
    }
  }
  function extra(s) {
    switch (s) {
      case 'rousseur': return [[39, 52], [41.5, 53.5], [44, 52.3], [56, 52.3], [58.5, 53.5], [61, 52]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".75" fill="#b0643a" opacity=".7"/>`).join('');
      case 'joues': return `<ellipse cx="38" cy="54" rx="4" ry="2.4" fill="#ff7b93" opacity=".35"/><ellipse cx="62" cy="54" rx="4" ry="2.4" fill="#ff7b93" opacity=".35"/>`;
      case 'boucle': return `<circle cx="30.5" cy="55" r="1.8" fill="none" stroke="#f5c400" stroke-width="1.2"/>`;
      case 'grain': return `<circle cx="57" cy="57" r=".9" fill="#3b2416"/>`;
      default: return '';
    }
  }
  // tenue : celle choisie, ou celle de la marque portée (Nike, Lacoste, Moncler, Dior)
  function clothes(s, cc, sk, outId) {
    const OUT = { o_nike: ['hoodie', '#e5352b'], o_lacoste: ['zip', '#1f9a55'], o_moncler: ['doudoune', '#15151c'], o_dior: ['costume', '#3b2a5c'] };
    if (OUT[outId]) [s, cc] = OUT[outId];
    const base = `<path d="M13 101 C15 80 30 72 50 72 C70 72 85 80 87 101 Z" fill="${cc}"/>`, d = mix(cc, -0.22), l = mix(cc, 0.35);
    const neck = `<path d="M43 62 L43 73 Q50 78 57 73 L57 62 Z" fill="${mix(sk, -0.12)}"/>`;
    switch (s) {
      case 'hoodie': return neck + `<path d="M30 76 C34 66 66 66 70 76 C64 72 36 72 30 76 Z" fill="${d}"/>` + base + `<path d="M38 74 Q50 84 62 74" stroke="${d}" stroke-width="3" fill="none"/><path d="M45 79 L44 90 M55 79 L56 90" stroke="${l}" stroke-width="1.2" stroke-linecap="round"/>`;
      case 'chemise': return neck + base + `<path d="M42 72 L50 84 L58 72 L55 71 L50 78 L45 71 Z" fill="#fff"/><path d="M50 84 L50 101" stroke="${d}" stroke-width="1"/><circle cx="50" cy="89" r=".9" fill="${d}"/><circle cx="50" cy="95" r=".9" fill="${d}"/>`;
      case 'costume': return neck + base + `<path d="M43 72 L50 88 L57 72 Z" fill="#fff"/><path d="M48.6 75 L51.4 75 L52.4 88 L50 91 L47.6 88 Z" fill="#c4161c"/><path d="M41 72 L50 92 L38 82 Z M59 72 L50 92 L62 82 Z" fill="${d}"/>`;
      case 'maillot': return neck + base + `<path d="M36 76 L36 101 M44 73 L44 101 M56 73 L56 101 M64 76 L64 101" stroke="${l}" stroke-width="3"/><path d="M43 72 Q50 78 57 72" stroke="${l}" stroke-width="2.4" fill="none"/>`;
      case 'colroule': return base + `<path d="M41 60 L41 75 Q50 79 59 75 L59 60 Q50 63 41 60 Z" fill="${d}"/><path d="M41.5 66 Q50 69 58.5 66 M41.5 70 Q50 73 58.5 70" stroke="${mix(cc, -0.35)}" stroke-width=".8" fill="none"/>`;
      case 'zip': return neck + base + `<path d="M43 71 L43 66 Q50 69 57 66 L57 71 Q50 75 43 71 Z" fill="${d}"/><path d="M50 72 L50 101" stroke="#e8e8e8" stroke-width="1.4"/><path d="M35 82 L37 101 M65 82 L63 101" stroke="#fff" stroke-width="1.6" opacity=".8"/><circle cx="60" cy="84" r="1.6" fill="#fff"/>`;
      case 'doudoune': return neck + base + `<path d="M40 70 Q50 76 60 70 L61 76 Q50 81 39 76 Z" fill="${l}" opacity=".5"/>${[82, 88, 94].map(y => `<path d="M${18 + (y - 80) * 0.3} ${y} Q50 ${y + 4} ${82 - (y - 80) * 0.3} ${y}" stroke="${l}" stroke-width=".9" fill="none" opacity=".55"/>`).join('')}<path d="M50 76 L50 101" stroke="${l}" stroke-width="1" opacity=".6"/>`;
      default: return neck + base + `<path d="M42 72 Q50 79 58 72" stroke="${d}" stroke-width="2" fill="none"/>`;
    }
  }
  function hat(id, hc) {
    switch (id) {
      case 'h_newera': return `<path d="M29 35 C29 18 40 13 50 13 C60 13 71 18 71 35 Z" fill="#1c2b4a"/><path d="M50 35 L81 33 C82 37 70 39 50 38 Z" fill="#14203a"/><circle cx="50" cy="14" r="1.6" fill="#14203a"/><text x="44" y="29" font-size="8" font-weight="900" fill="#fff" font-family="Arial">NY</text>`;
      case 'h_lacoste': return `<path d="M30 33 C30 19 40 15 50 15 C60 15 70 19 70 33 Z" fill="#f3efe4"/><path d="M22 35 C30 30 70 30 78 35 C72 39 28 39 22 35 Z" fill="#e6e0cf"/><path d="M57 27 l4 -1 l-1 2 Z" fill="#1f9a55"/>`;
      case 'h_lv': return `<rect x="36" y="2" width="28" height="28" rx="2" fill="#2a1c12"/><rect x="36" y="22" width="28" height="4" fill="#c8a24a"/><path d="M26 31 C32 28 68 28 74 31 C68 34 32 34 26 31 Z" fill="#21160e"/>`;
      case 'h_crown': return `<path d="M32 24 L34 8 L42 17 L50 5 L58 17 L66 8 L68 24 Z" fill="#ffcc33" stroke="#c98a00" stroke-width="1"/><circle cx="50" cy="13" r="2" fill="#e5352b"/><circle cx="40" cy="20" r="1.5" fill="#2f6bff"/><circle cx="60" cy="20" r="1.5" fill="#21c48b"/>`;
      default: return '';
    }
  }
  function glasses(id) {
    switch (id) {
      case 'e_rayban': return `<path d="M35 42 L47 42 L46 50 L37 50 Z M53 42 L65 42 L63 50 L54 50 Z" fill="#111" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/><path d="M47 44 L53 44" stroke="#111" stroke-width="1.6"/><path d="M37 44 L44 44" stroke="#555" stroke-width=".8" opacity=".6"/>`;
      case 'e_oakley': return `<rect x="31" y="40" width="38" height="11" rx="5.5" fill="url(#avgog)" stroke="#222" stroke-width="1.2"/><path d="M29 44 L31 44 M69 44 L71 44" stroke="#222" stroke-width="3"/>`;
      case 'e_cartier': return `<circle cx="42" cy="46" r="5.4" fill="none" stroke="#c8a24a" stroke-width="1.1"/><circle cx="58" cy="46" r="5.4" fill="none" stroke="#c8a24a" stroke-width="1.1"/><path d="M47.4 45 Q50 43.6 52.6 45" stroke="#c8a24a" stroke-width="1" fill="none"/>`;
      default: return '';
    }
  }
  function neckItem(id) {
    switch (id) {
      case 'n_burberry': return `<path d="M36 70 Q50 80 64 70 L66 76 Q50 86 34 76 Z" fill="#c9a46a"/><path d="M38 72 L62 72 M37 75 L63 75" stroke="#7a3b1e" stroke-width=".7"/><path d="M58 76 L61 92 L55 92 L54 78 Z" fill="#c9a46a"/>`;
      case 'n_gold': return `<path d="M42 72 Q50 84 58 72" stroke="#f5c400" stroke-width="1.8" fill="none" stroke-dasharray="1.6 .6"/><circle cx="50" cy="80" r="2" fill="#f5c400"/>`;
      case 'n_tiffany': return `<path d="M42 72 Q50 82 58 72" stroke="#cfe8ff" stroke-width="1" fill="none"/>${[[44, 75.5], [47, 77.5], [50, 78.3], [53, 77.5], [56, 75.5]].map(([x, y]) => `<path d="M${x} ${y - 1.6} l1.4 1.6 l-1.4 1.6 l-1.4 -1.6 Z" fill="#e8f6ff" stroke="#7cc7ff" stroke-width=".4"/>`).join('')}`;
      default: return '';
    }
  }
  let uid = 0;
  AV.svg = function (av, look) {
    const a = Object.assign({}, DEF, av || {}); look = look || {};
    const sk = hex(a.sk) || DEF.sk, hc = hex(a.hc) || DEF.hc, ec = hex(a.ec) || DEF.ec, cc = hex(a.cc) || DEF.cc, bg = hex(a.bg) || DEF.bg;
    const id = 'av' + (++uid), hatOn = look.hat;
    return `<svg class="av-svg" viewBox="0 0 100 100" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="50" cy="50" r="50"/></clipPath>${look.eyes === 'e_oakley' ? '<linearGradient id="avgog" x1="0" x2="1"><stop offset="0" stop-color="#ff8a2a"/><stop offset=".5" stop-color="#ff4fa3"/><stop offset="1" stop-color="#2f6bff"/></linearGradient>' : ''}</defs>
      <g clip-path="url(#${id})"><rect width="100" height="100" fill="${bg}"/><circle cx="50" cy="40" r="40" fill="#fff" opacity=".18"/>
      ${hatOn ? '' : hairBack(a.hair, hc)}${clothes(a.cloth, cc, sk, look.outfit)}${neckItem(look.neck)}
      <ellipse cx="30.5" cy="48" rx="3.6" ry="5" fill="${mix(sk, -0.08)}"/><ellipse cx="69.5" cy="48" rx="3.6" ry="5" fill="${mix(sk, -0.08)}"/>
      ${head(a.head, sk)}${extra(a.extra)}${beard(a.beard, hc)}${nose(a.nose, sk)}${mouth(a.mouth)}${eyes(a.eyes, ec, sk)}${brows(a.brows, hc)}
      ${hatOn && a.hair !== 'chauve' && a.hair !== 'rase' ? `<path d="M30 40 C30 34 33 31 36 31 L64 31 C67 31 70 34 70 40 C66 36 34 36 30 40 Z" fill="${hc}"/>` : hairFront(a.hair, hc)}
      ${glasses(look.eyes)}${hat(look.hat, hc)}</g></svg>`;
  };

  /* ---------- Éditeur (onglet « Avatar » de Mon style) ---------- */
  const CATS = [['sk', '🎨 Peau', 'color', SKIN], ['head', '🙂 Visage', 'opt'], ['eyes', '👀 Yeux', 'opt'], ['ec', '🔵 Couleur des yeux', 'color', EYEC], ['brows', '〰️ Sourcils', 'opt'], ['nose', '👃 Nez', 'opt'], ['mouth', '👄 Bouche', 'opt'],
    ['hair', '💇 Coiffure', 'opt'], ['hc', '🎨 Couleur des cheveux', 'color', HAIRC], ['beard', '🧔 Barbe', 'opt'], ['cloth', '👕 Vêtement', 'opt'], ['cc', '🎨 Couleur du vêtement', 'color', CLOTHC], ['bg', '🖼️ Fond', 'color', BGC], ['extra', '✨ Détails', 'opt']];
  let cat = 'hair';
  AV.editor = function (cur, look) {
    const a = Object.assign({}, DEF, cur || {}), c = CATS.find(x => x[0] === cat);
    const body = c[2] === 'color'
      ? `<div class="ave-sw">${c[3].map(col => `<button class="${a[cat] === col ? 'on' : ''}" data-avk="${cat}" data-avv="${col}" style="background:${col}" aria-label="${col}"></button>`).join('')}<label class="ave-pick" title="Toutes les couleurs">🌈<input type="color" data-avcolor="${cat}" value="${hex(a[cat]) || '#888888'}"></label></div>`
      : `<div class="ave-opts">${OPTS[cat].map(([v, l]) => `<button class="${a[cat] === v ? 'on' : ''}" data-avk="${cat}" data-avv="${v}">${AV.svg(Object.assign({}, a, { [cat]: v }), look)}<small>${l}</small></button>`).join('')}</div>`;
    return `<div class="ave"><div class="ave-cats">${CATS.map(([k, l]) => `<button data-avcat="${k}" class="${k === cat ? 'on' : ''}">${l}</button>`).join('')}</div>${body}
      <div class="ave-act"><button class="btn btn-sm" data-avrand>🎲 Au hasard</button>${cur ? '<button class="btn btn-sm btn-ghost" data-avemoji>Revenir à l\'emoji</button>' : ''}</div>
      <p class="hint">Gratuit et sans limite. Les articles de marque que tu portes (casquette, lunettes, chaîne, tenue…) s'affichent sur ton personnage.</p></div>`;
  };
  AV.setCat = k => { cat = k; };
})();

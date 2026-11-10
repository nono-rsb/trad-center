/* Trad Center — catalogue des marchés et de la boutique */
window.TC = window.TC || {};

/*
 * Marchés.
 *  src: 'binance' (crypto temps réel), 'yahoo' (bourse, via Yahoo Finance), 'fx' (devises)
 *  ccy: devise de cotation native
 *  ref: prix de référence (devise native) utilisé UNIQUEMENT si aucune source n'est joignable
 */
TC.ASSETS = [
  // ---------- CRYPTO (Binance, temps réel) ----------
  { id: 'BTC',  name: 'Bitcoin',        cat: 'crypto', src: 'binance', bin: 'BTCUSDT',  cg: 'bitcoin',          ccy: 'USDT', ref: 100000, color: '#f7931a', icon: '₿' },
  { id: 'ETH',  name: 'Ethereum',       cat: 'crypto', src: 'binance', bin: 'ETHUSDT',  cg: 'ethereum',         ccy: 'USDT', ref: 3500,   color: '#627eea', icon: 'Ξ' },
  { id: 'SOL',  name: 'Solana',         cat: 'crypto', src: 'binance', bin: 'SOLUSDT',  cg: 'solana',           ccy: 'USDT', ref: 180,    color: '#14f195', icon: 'S' },
  { id: 'BNB',  name: 'BNB',            cat: 'crypto', src: 'binance', bin: 'BNBUSDT',  cg: 'binancecoin',      ccy: 'USDT', ref: 700,    color: '#f3ba2f', icon: 'B' },
  { id: 'XRP',  name: 'XRP',            cat: 'crypto', src: 'binance', bin: 'XRPUSDT',  cg: 'ripple',           ccy: 'USDT', ref: 2.5,    color: '#9aa4b1', icon: 'X' },
  { id: 'DOGE', name: 'Dogecoin',       cat: 'crypto', src: 'binance', bin: 'DOGEUSDT', cg: 'dogecoin',         ccy: 'USDT', ref: 0.2,    color: '#c2a633', icon: 'Ð' },
  { id: 'ADA',  name: 'Cardano',        cat: 'crypto', src: 'binance', bin: 'ADAUSDT',  cg: 'cardano',          ccy: 'USDT', ref: 0.7,    color: '#3468d1', icon: 'A' },
  { id: 'TRX',  name: 'TRON',           cat: 'crypto', src: 'binance', bin: 'TRXUSDT',  cg: 'tron',             ccy: 'USDT', ref: 0.3,    color: '#ef0027', icon: 'T' },
  { id: 'AVAX', name: 'Avalanche',      cat: 'crypto', src: 'binance', bin: 'AVAXUSDT', cg: 'avalanche-2',      ccy: 'USDT', ref: 25,     color: '#e84142', icon: 'A' },
  { id: 'LINK', name: 'Chainlink',      cat: 'crypto', src: 'binance', bin: 'LINKUSDT', cg: 'chainlink',        ccy: 'USDT', ref: 18,     color: '#2a5ada', icon: 'L' },
  { id: 'DOT',  name: 'Polkadot',       cat: 'crypto', src: 'binance', bin: 'DOTUSDT',  cg: 'polkadot',         ccy: 'USDT', ref: 4,      color: '#e6007a', icon: '●' },
  { id: 'LTC',  name: 'Litecoin',       cat: 'crypto', src: 'binance', bin: 'LTCUSDT',  cg: 'litecoin',         ccy: 'USDT', ref: 100,    color: '#345d9d', icon: 'Ł' },
  { id: 'TON',  name: 'Toncoin',        cat: 'crypto', src: 'binance', bin: 'TONUSDT',  cg: 'the-open-network', ccy: 'USDT', ref: 3,      color: '#0098ea', icon: 'T' },
  { id: 'SUI',  name: 'Sui',            cat: 'crypto', src: 'binance', bin: 'SUIUSDT',  cg: 'sui',              ccy: 'USDT', ref: 3.5,    color: '#4da2ff', icon: 'S' },
  { id: 'NEAR', name: 'NEAR Protocol',  cat: 'crypto', src: 'binance', bin: 'NEARUSDT', cg: 'near',             ccy: 'USDT', ref: 3,      color: '#00c08b', icon: 'N' },
  { id: 'UNI',  name: 'Uniswap',        cat: 'crypto', src: 'binance', bin: 'UNIUSDT',  cg: 'uniswap',          ccy: 'USDT', ref: 9,      color: '#ff007a', icon: '🦄' },
  { id: 'ATOM', name: 'Cosmos',         cat: 'crypto', src: 'binance', bin: 'ATOMUSDT', cg: 'cosmos',           ccy: 'USDT', ref: 4.5,    color: '#6f7390', icon: '⚛' },
  { id: 'SHIB', name: 'Shiba Inu',      cat: 'crypto', src: 'binance', bin: 'SHIBUSDT', cg: 'shiba-inu',        ccy: 'USDT', ref: 0.000013, color: '#ffa409', icon: '🐕' },
  { id: 'PEPE', name: 'Pepe',           cat: 'crypto', src: 'binance', bin: 'PEPEUSDT', cg: 'pepe',             ccy: 'USDT', ref: 0.00001,  color: '#3d9a3d', icon: '🐸' },
  { id: 'PAXG', name: 'PAX Gold (1 oz d\'or)', cat: 'crypto', src: 'binance', bin: 'PAXGUSDT', cg: 'pax-gold', ccy: 'USDT', ref: 3800, color: '#e4c26a', icon: 'Au' },

  // ---------- INDICES ----------
  { id: 'CAC40',  name: 'CAC 40',          cat: 'index', src: 'yahoo', y: '^FCHI',     ccy: 'EUR', ref: 8000,  color: '#2f6bff', icon: '🇫🇷' },
  { id: 'SP500',  name: 'S&P 500',         cat: 'index', src: 'yahoo', y: '^GSPC',     ccy: 'USD', ref: 6500,  color: '#b22234', icon: '🇺🇸' },
  { id: 'NASDAQ', name: 'Nasdaq Composite',cat: 'index', src: 'yahoo', y: '^IXIC',     ccy: 'USD', ref: 21000, color: '#0096d6', icon: '🇺🇸' },
  { id: 'DOW',    name: 'Dow Jones',       cat: 'index', src: 'yahoo', y: '^DJI',      ccy: 'USD', ref: 45000, color: '#1f3b73', icon: '🇺🇸' },
  { id: 'DAX',    name: 'DAX 40',          cat: 'index', src: 'yahoo', y: '^GDAXI',    ccy: 'EUR', ref: 24000, color: '#dd0000', icon: '🇩🇪' },
  { id: 'STOXX50',name: 'Euro Stoxx 50',   cat: 'index', src: 'yahoo', y: '^STOXX50E', ccy: 'EUR', ref: 5400,  color: '#003399', icon: '🇪🇺' },
  { id: 'FTSE',   name: 'FTSE 100',        cat: 'index', src: 'yahoo', y: '^FTSE',     ccy: 'GBP', ref: 9000,  color: '#012169', icon: '🇬🇧' },
  { id: 'NIKKEI', name: 'Nikkei 225',      cat: 'index', src: 'yahoo', y: '^N225',     ccy: 'JPY', ref: 45000, color: '#bc002d', icon: '🇯🇵' },

  // ---------- ACTIONS ----------
  { id: 'AAPL', name: 'Apple',          cat: 'stock', src: 'yahoo', y: 'AAPL',    ccy: 'USD', ref: 230,  color: '#a2aaad', icon: '' },
  { id: 'NVDA', name: 'NVIDIA',         cat: 'stock', src: 'yahoo', y: 'NVDA',    ccy: 'USD', ref: 180,  color: '#76b900', icon: 'N' },
  { id: 'MSFT', name: 'Microsoft',      cat: 'stock', src: 'yahoo', y: 'MSFT',    ccy: 'USD', ref: 500,  color: '#00a4ef', icon: '⊞' },
  { id: 'TSLA', name: 'Tesla',          cat: 'stock', src: 'yahoo', y: 'TSLA',    ccy: 'USD', ref: 350,  color: '#e82127', icon: 'T' },
  { id: 'AMZN', name: 'Amazon',         cat: 'stock', src: 'yahoo', y: 'AMZN',    ccy: 'USD', ref: 220,  color: '#ff9900', icon: 'a' },
  { id: 'GOOGL',name: 'Alphabet (Google)', cat: 'stock', src: 'yahoo', y: 'GOOGL', ccy: 'USD', ref: 200,  color: '#4285f4', icon: 'G' },
  { id: 'META', name: 'Meta',           cat: 'stock', src: 'yahoo', y: 'META',    ccy: 'USD', ref: 700,  color: '#0866ff', icon: '∞' },
  { id: 'NFLX', name: 'Netflix',        cat: 'stock', src: 'yahoo', y: 'NFLX',    ccy: 'USD', ref: 1100, color: '#e50914', icon: 'N' },
  { id: 'AMD',  name: 'AMD',            cat: 'stock', src: 'yahoo', y: 'AMD',     ccy: 'USD', ref: 160,  color: '#ed1c24', icon: 'A' },
  { id: 'PLTR', name: 'Palantir',       cat: 'stock', src: 'yahoo', y: 'PLTR',    ccy: 'USD', ref: 150,  color: '#9da5ad', icon: 'P' },
  { id: 'COIN', name: 'Coinbase',       cat: 'stock', src: 'yahoo', y: 'COIN',    ccy: 'USD', ref: 300,  color: '#0052ff', icon: 'C' },
  { id: 'MSTR', name: 'Strategy (MicroStrategy)', cat: 'stock', src: 'yahoo', y: 'MSTR', ccy: 'USD', ref: 350, color: '#d9232e', icon: 'M' },
  { id: 'RACE', name: 'Ferrari N.V.',   cat: 'stock', src: 'yahoo', y: 'RACE',    ccy: 'USD', ref: 450,  color: '#ff2800', icon: '🐎' },
  { id: 'MC',   name: 'LVMH',           cat: 'stock', src: 'yahoo', y: 'MC.PA',   ccy: 'EUR', ref: 550,  color: '#8b6b3e', icon: 'LV' },
  { id: 'RMS',  name: 'Hermès',         cat: 'stock', src: 'yahoo', y: 'RMS.PA',  ccy: 'EUR', ref: 2300, color: '#f37021', icon: 'H' },
  { id: 'OR',   name: 'L\'Oréal',       cat: 'stock', src: 'yahoo', y: 'OR.PA',   ccy: 'EUR', ref: 380,  color: '#1a1a1a', icon: 'L' },
  { id: 'AIR',  name: 'Airbus',         cat: 'stock', src: 'yahoo', y: 'AIR.PA',  ccy: 'EUR', ref: 190,  color: '#00205b', icon: '✈' },
  { id: 'TTE',  name: 'TotalEnergies',  cat: 'stock', src: 'yahoo', y: 'TTE.PA',  ccy: 'EUR', ref: 55,   color: '#ed0000', icon: 'T' },
  { id: 'BNP',  name: 'BNP Paribas',    cat: 'stock', src: 'yahoo', y: 'BNP.PA',  ccy: 'EUR', ref: 75,   color: '#00915a', icon: 'B' },
  { id: 'SAN',  name: 'Sanofi',         cat: 'stock', src: 'yahoo', y: 'SAN.PA',  ccy: 'EUR', ref: 85,   color: '#7a00e6', icon: 'S' },
  { id: 'RNO',  name: 'Renault',        cat: 'stock', src: 'yahoo', y: 'RNO.PA',  ccy: 'EUR', ref: 45,   color: '#ffcc33', icon: '◇' },
  { id: 'STLA', name: 'Stellantis',     cat: 'stock', src: 'yahoo', y: 'STLAP.PA',ccy: 'EUR', ref: 9,    color: '#243782', icon: 'S' },
  { id: 'P911', name: 'Porsche AG',     cat: 'stock', src: 'yahoo', y: 'P911.DE', ccy: 'EUR', ref: 45,   color: '#b12b28', icon: 'P' },
  { id: 'TTWO', name: 'Take-Two (Rockstar Games)', cat: 'stock', src: 'yahoo', y: 'TTWO', ccy: 'USD', ref: 240, color: '#f5a623', icon: 'R★' },
  { id: 'UBI',  name: 'Ubisoft',        cat: 'stock', src: 'yahoo', y: 'UBI.PA',  ccy: 'EUR', ref: 11,   color: '#0070ff', icon: 'U' },

  // ---------- MATIÈRES PREMIÈRES ----------
  { id: 'GOLD',   name: 'Or (once)',        cat: 'commodity', src: 'yahoo', y: 'GC=F', ccy: 'USD', ref: 3900, color: '#d4af37', icon: '🥇' },
  { id: 'SILVER', name: 'Argent (once)',    cat: 'commodity', src: 'yahoo', y: 'SI=F', ccy: 'USD', ref: 45,   color: '#c0c0c0', icon: '🥈' },
  { id: 'WTI',    name: 'Pétrole WTI (baril)', cat: 'commodity', src: 'yahoo', y: 'CL=F', ccy: 'USD', ref: 62, color: '#333333', icon: '🛢' },
  { id: 'BRENT',  name: 'Pétrole Brent (baril)', cat: 'commodity', src: 'yahoo', y: 'BZ=F', ccy: 'USD', ref: 66, color: '#4a4a4a', icon: '🛢' },
  { id: 'NGAS',   name: 'Gaz naturel',      cat: 'commodity', src: 'yahoo', y: 'NG=F', ccy: 'USD', ref: 3.5,  color: '#4fa3e0', icon: '🔥' },
  { id: 'COPPER', name: 'Cuivre (livre)',   cat: 'commodity', src: 'yahoo', y: 'HG=F', ccy: 'USD', ref: 4.8,  color: '#b87333', icon: 'Cu' },

  // ---------- DEVISES (prix d'une unité en euros) ----------
  { id: 'USD', name: 'Dollar américain',   cat: 'fx', src: 'fx', code: 'USD', y: 'EURUSD=X', ccy: 'EUR', color: '#2e7d32', icon: '$' },
  { id: 'GBP', name: 'Livre sterling',     cat: 'fx', src: 'fx', code: 'GBP', y: 'EURGBP=X', ccy: 'EUR', color: '#5c2d91', icon: '£' },
  { id: 'CHF', name: 'Franc suisse',       cat: 'fx', src: 'fx', code: 'CHF', y: 'EURCHF=X', ccy: 'EUR', color: '#d52b1e', icon: '₣' },
  { id: 'JPY', name: 'Yen japonais',       cat: 'fx', src: 'fx', code: 'JPY', y: 'EURJPY=X', ccy: 'EUR', color: '#bc002d', icon: '¥' },
  { id: 'CAD', name: 'Dollar canadien',    cat: 'fx', src: 'fx', code: 'CAD', y: 'EURCAD=X', ccy: 'EUR', color: '#ff0000', icon: 'C$' },
  { id: 'AUD', name: 'Dollar australien',  cat: 'fx', src: 'fx', code: 'AUD', y: 'EURAUD=X', ccy: 'EUR', color: '#00247d', icon: 'A$' },
  { id: 'CNY', name: 'Yuan chinois',       cat: 'fx', src: 'fx', code: 'CNY', y: 'EURCNY=X', ccy: 'EUR', color: '#de2910', icon: '元' },
];

TC.CATS = {
  all:    { label: 'Tout',    icon: '🌍' },
  fav:    { label: 'Favoris', icon: '⭐' },
  crypto: { label: 'Crypto',  icon: '🪙' },
  stock:  { label: 'Actions', icon: '🏢' },
  index:  { label: 'Indices', icon: '📊' },
  other:  { label: 'Or, pétrole, devises', icon: '🛢' },
};

TC.assetById = {};
TC.ASSETS.forEach(a => { TC.assetById[a.id] = a; });

/* ---------------- BOUTIQUE ---------------- */
// type: car | estate | luxury
// Les prix sont des prix publics approximatifs (neuf / marché), en euros.
TC.SHOP = [
  // ======== VÉHICULES ========
  { id: 'scooter-elec', type: 'car', brand: 'Xiaomi', model: 'Trottinette électrique 4', price: 450, emoji: '🛴', grad: ['#2b2b2b','#5a5a5a'], specs: { 'Vitesse max': '25 km/h', Autonomie: '35 km' } },
  { id: 'vespa', type: 'car', brand: 'Vespa', model: 'Primavera 125', price: 5200, emoji: '🛵', grad: ['#7fd1c7','#2f8f83'], specs: { Puissance: '11 ch', 'Vitesse max': '95 km/h' } },
  { id: 'mt07', type: 'car', brand: 'Yamaha', model: 'MT-07', price: 8000, emoji: '🏍️', grad: ['#1b2a4a','#3a5ba0'], specs: { Puissance: '73 ch', 'Vitesse max': '214 km/h' } },
  { id: 'clio', type: 'car', brand: 'Renault', model: 'Clio V', price: 19000, emoji: '🚗', grad: ['#f5c400','#b38f00'], specs: { Puissance: '90 ch', '0-100': '12,2 s' } },
  { id: 'model3', type: 'car', brand: 'Tesla', model: 'Model 3', price: 40000, emoji: '🚘', grad: ['#c9c9c9','#6b6b6b'], specs: { Puissance: '283 ch', '0-100': '6,1 s', Autonomie: '513 km' } },
  { id: 'golfr', type: 'car', brand: 'Volkswagen', model: 'Golf R', price: 57000, emoji: '🚗', grad: ['#1f4fa3','#0b2350'], specs: { Puissance: '333 ch', '0-100': '4,6 s' } },
  { id: 'm3', type: 'car', brand: 'BMW', model: 'M3 Competition', price: 105000, emoji: '🏎️', grad: ['#2d8f4e','#0d3d1f'], specs: { Puissance: '510 ch', '0-100': '3,5 s', 'Vitesse max': '290 km/h' } },
  { id: '911', type: 'car', brand: 'Porsche', model: '911 Carrera', price: 130000, emoji: '🏎️', grad: ['#c0c0c0','#5b5b5b'], specs: { Puissance: '394 ch', '0-100': '4,1 s', 'Vitesse max': '294 km/h' } },
  { id: 'r8', type: 'car', brand: 'Audi', model: 'R8 V10 Performance', price: 185000, emoji: '🏎️', grad: ['#cc1f1f','#4d0b0b'], specs: { Puissance: '620 ch', '0-100': '3,1 s', 'Vitesse max': '331 km/h' } },
  { id: 'taycan', type: 'car', brand: 'Porsche', model: 'Taycan Turbo S', price: 205000, emoji: '⚡', grad: ['#3a86ff','#14325f'], specs: { Puissance: '952 ch', '0-100': '2,4 s' } },
  { id: 'g63', type: 'car', brand: 'Mercedes-AMG', model: 'G 63', price: 205000, emoji: '🚙', grad: ['#111','#444'], specs: { Puissance: '585 ch', '0-100': '4,4 s' } },
  { id: 'roma', type: 'car', brand: 'Ferrari', model: 'Roma Spider', price: 255000, emoji: '🏎️', grad: ['#ff2800','#7a1300'], specs: { Puissance: '620 ch', '0-100': '3,4 s', 'Vitesse max': '320 km/h' } },
  { id: 'db12', type: 'car', brand: 'Aston Martin', model: 'DB12', price: 250000, emoji: '🏎️', grad: ['#0f5c3a','#06281a'], specs: { Puissance: '680 ch', '0-100': '3,6 s', 'Vitesse max': '325 km/h' } },
  { id: 'huracan', type: 'car', brand: 'Lamborghini', model: 'Huracán Tecnica', price: 250000, emoji: '🏎️', grad: ['#9bdc28','#3c5c00'], specs: { Puissance: '640 ch', '0-100': '3,2 s', 'Vitesse max': '325 km/h' } },
  { id: 'urus', type: 'car', brand: 'Lamborghini', model: 'Urus SE', price: 265000, emoji: '🚙', grad: ['#ffb300','#8a5a00'], specs: { Puissance: '800 ch', '0-100': '3,4 s', 'Vitesse max': '312 km/h' } },
  { id: 'conti', type: 'car', brand: 'Bentley', model: 'Continental GT Speed', price: 290000, emoji: '🏎️', grad: ['#2c3e50','#0c1218'], specs: { Puissance: '782 ch', '0-100': '3,2 s' } },
  { id: 'gt3rs', type: 'car', brand: 'Porsche', model: '911 GT3 RS', price: 295000, emoji: '🏁', grad: ['#ffffff','#9aa0a6'], specs: { Puissance: '525 ch', '0-100': '3,2 s', 'Vitesse max': '296 km/h' } },
  { id: '296', type: 'car', brand: 'Ferrari', model: '296 GTB', price: 285000, emoji: '🏎️', grad: ['#ffcc00','#a87b00'], specs: { Puissance: '830 ch', '0-100': '2,9 s', 'Vitesse max': '330 km/h' } },
  { id: 'sto', type: 'car', brand: 'Lamborghini', model: 'Huracán STO', price: 340000, emoji: '🏁', grad: ['#00a2ff','#003b66'], specs: { Puissance: '640 ch', '0-100': '3,0 s', 'Vitesse max': '310 km/h' } },
  { id: '750s', type: 'car', brand: 'McLaren', model: '750S', price: 330000, emoji: '🏎️', grad: ['#ff8000','#7a3d00'], specs: { Puissance: '750 ch', '0-100': '2,8 s', 'Vitesse max': '332 km/h' } },
  { id: 'puro', type: 'car', brand: 'Ferrari', model: 'Purosangue', price: 400000, emoji: '🚙', grad: ['#8b0000','#2a0000'], specs: { Puissance: '725 ch', '0-100': '3,3 s', 'Vitesse max': '310 km/h' } },
  { id: 'cullinan', type: 'car', brand: 'Rolls-Royce', model: 'Cullinan', price: 420000, emoji: '🚙', grad: ['#3b2f5c','#120d1f'], specs: { Puissance: '571 ch', '0-100': '5,2 s' } },
  { id: 'sf90', type: 'car', brand: 'Ferrari', model: 'SF90 Stradale', price: 450000, emoji: '🏎️', grad: ['#ff2800','#3d0a00'], specs: { Puissance: '1000 ch', '0-100': '2,5 s', 'Vitesse max': '340 km/h' } },
  { id: 'revuelto', type: 'car', brand: 'Lamborghini', model: 'Revuelto', price: 560000, emoji: '🏎️', grad: ['#ff5e00','#5a1f00'], specs: { Puissance: '1015 ch', '0-100': '2,5 s', 'Vitesse max': '350 km/h' } },
  { id: 'f40', type: 'car', brand: 'Ferrari', model: 'F40 (collection 1987)', price: 2600000, emoji: '🏆', grad: ['#d40000','#400000'], specs: { Puissance: '478 ch', 'Vitesse max': '324 km/h', Exemplaires: '1 315' } },
  { id: 'utopia', type: 'car', brand: 'Pagani', model: 'Utopia', price: 2900000, emoji: '💎', grad: ['#b8a07e','#3a3022'], specs: { Puissance: '864 ch', 'Vitesse max': '350 km/h', Exemplaires: '99' } },
  { id: 'jesko', type: 'car', brand: 'Koenigsegg', model: 'Jesko Absolut', price: 3200000, emoji: '🚀', grad: ['#e0e0e0','#4a4a4a'], specs: { Puissance: '1600 ch', 'Vitesse max': '> 500 km/h' } },
  { id: 'chiron', type: 'car', brand: 'Bugatti', model: 'Chiron Super Sport', price: 3600000, emoji: '🚀', grad: ['#1a3a8a','#050d24'], specs: { Puissance: '1600 ch', '0-100': '2,4 s', 'Vitesse max': '440 km/h' } },
  { id: 'tourbillon', type: 'car', brand: 'Bugatti', model: 'Tourbillon', price: 3800000, emoji: '👑', grad: ['#0a1f5c','#000'], specs: { Puissance: '1800 ch', '0-100': '2,0 s', 'Vitesse max': '445 km/h' } },

  // ======== IMMOBILIER (rapporte un loyer chaque heure) ========
  { id: 'parking', type: 'estate', brand: 'Paris 11e', model: 'Place de parking', price: 28000, emoji: '🅿️', grad: ['#4a5568','#1a202c'], specs: { Surface: '12 m²' } },
  { id: 'creuse', type: 'estate', brand: 'Creuse', model: 'Longère à rénover', price: 85000, emoji: '🏚️', grad: ['#8d6e63','#3e2723'], specs: { Surface: '110 m²', Terrain: '2 000 m²' } },
  { id: 'chambre', type: 'estate', brand: 'Paris 16e', model: 'Chambre de bonne', price: 110000, emoji: '🛏️', grad: ['#90a4ae','#37474f'], specs: { Surface: '10 m²', Étage: '7e sans ascenseur' } },
  { id: 'studio', type: 'estate', brand: 'Lyon 7e', model: 'Studio étudiant', price: 140000, emoji: '🏢', grad: ['#64b5f6','#0d47a1'], specs: { Surface: '25 m²' } },
  { id: 't3', type: 'estate', brand: 'Marseille 8e', model: 'T3 vue mer', price: 310000, emoji: '🌊', grad: ['#4fc3f7','#01579b'], specs: { Surface: '68 m²', Balcon: 'Oui' } },
  { id: 'nantes', type: 'estate', brand: 'Nantes', model: 'Maison familiale', price: 450000, emoji: '🏡', grad: ['#81c784','#1b5e20'], specs: { Surface: '140 m²', Chambres: '4' } },
  { id: 'haussmann', type: 'estate', brand: 'Paris 8e', model: 'Appartement haussmannien', price: 1600000, emoji: '🏛️', grad: ['#d7ccc8','#5d4037'], specs: { Surface: '120 m²', Moulures: 'Oui' } },
  { id: 'manhattan', type: 'estate', brand: 'New York', model: 'Loft à Manhattan', price: 7500000, emoji: '🗽', grad: ['#78909c','#263238'], specs: { Surface: '280 m²', Vue: 'Central Park' } },
  { id: 'tropez', type: 'estate', brand: 'Saint-Tropez', model: 'Villa avec piscine', price: 9000000, emoji: '🏖️', grad: ['#ffd54f','#ff6f00'], specs: { Surface: '450 m²', Piscine: 'À débordement' } },
  { id: 'chateau', type: 'estate', brand: 'Bordelais', model: 'Château viticole', price: 12000000, emoji: '🏰', grad: ['#7b1fa2','#2a0a38'], specs: { Vignes: '40 ha', Chambres: '14' } },
  { id: 'courchevel', type: 'estate', brand: 'Courchevel 1850', model: 'Chalet skis aux pieds', price: 18000000, emoji: '🏔️', grad: ['#e3f2fd','#64b5f6'], specs: { Surface: '900 m²', Spa: 'Oui' } },
  { id: 'dubai', type: 'estate', brand: 'Dubaï', model: 'Villa Palm Jumeirah', price: 25000000, emoji: '🌴', grad: ['#ffcc80','#e65100'], specs: { Surface: '1 200 m²', Plage: 'Privée' } },
  { id: 'monaco', type: 'estate', brand: 'Monaco', model: 'Penthouse Carré d\'Or', price: 45000000, emoji: '🌇', grad: ['#ef5350','#880e4f'], specs: { Surface: '600 m²', Terrasse: 'Rooftop' } },
  { id: 'ile', type: 'estate', brand: 'Bahamas', model: 'Île privée', price: 60000000, emoji: '🏝️', grad: ['#26c6da','#006064'], specs: { Superficie: '40 ha', Plages: '6' } },
  { id: 'tour', type: 'estate', brand: 'La Défense', model: 'Gratte-ciel de bureaux', price: 650000000, emoji: '🏙️', grad: ['#90caf9','#1a237e'], specs: { Étages: '48', Surface: '90 000 m²' } },

  // ======== LUXE ========
  { id: 'airpods', type: 'luxury', brand: 'Apple', model: 'iPhone Pro Max', price: 1500, emoji: '📱', grad: ['#555','#111'], specs: { Stockage: '1 To' } },
  { id: 'rolex', type: 'luxury', brand: 'Rolex', model: 'Submariner Date', price: 12000, emoji: '⌚', grad: ['#1b5e20','#0a2b0e'], specs: { Boîtier: '41 mm', Matière: 'Oystersteel' } },
  { id: 'birkin', type: 'luxury', brand: 'Hermès', model: 'Sac Birkin 30', price: 30000, emoji: '👜', grad: ['#ff8f00','#8a4500'], specs: { Cuir: 'Togo' } },
  { id: 'nautilus', type: 'luxury', brand: 'Patek Philippe', model: 'Nautilus 5811', price: 150000, emoji: '⌚', grad: ['#1e3a5f','#0a1422'], specs: { Boîtier: '41 mm', Matière: 'Or blanc' } },
  { id: 'rm', type: 'luxury', brand: 'Richard Mille', model: 'RM 11-03', price: 320000, emoji: '⌚', grad: ['#ff1744','#4a0012'], specs: { Matière: 'Carbone TPT' } },
  { id: 'heli', type: 'luxury', brand: 'Airbus', model: 'Hélicoptère H130', price: 3800000, emoji: '🚁', grad: ['#455a64','#102027'], specs: { Places: '7', Vitesse: '287 km/h' } },
  { id: 'riva', type: 'luxury', brand: 'Riva', model: 'Yacht 76\' Perseo', price: 5500000, emoji: '🛥️', grad: ['#0288d1','#01294a'], specs: { Longueur: '23 m', Cabines: '3' } },
  { id: 'citation', type: 'luxury', brand: 'Cessna', model: 'Jet Citation CJ4', price: 11000000, emoji: '🛩️', grad: ['#b0bec5','#37474f'], specs: { Places: '10', Autonomie: '4 000 km' } },
  { id: 'superyacht', type: 'luxury', brand: 'Chantier naval', model: 'Superyacht 60 m', price: 75000000, emoji: '🛳️', grad: ['#e1f5fe','#0277bd'], specs: { Longueur: '60 m', Équipage: '18', Héliport: 'Oui' } },
  { id: 'g700', type: 'luxury', brand: 'Gulfstream', model: 'Jet G700', price: 78000000, emoji: '✈️', grad: ['#eceff1','#546e7a'], specs: { Places: '19', Autonomie: '13 800 km' } },
  { id: 'club', type: 'luxury', brand: 'Football', model: 'Club de 1re division', price: 500000000, emoji: '⚽', grad: ['#43a047','#0b3d0e'], specs: { Stade: '45 000 places' } },
  { id: 'traineau', type: 'luxury', brand: 'Édition limitée Noël', model: 'Traîneau du Père Noël', price: 25000, emoji: '🛷', grad: ['#c62828','#1b5e20'], specs: { Rennes: '9', Disponible: 'le 25 décembre seulement' }, limited: 'xmas' },
  { id: 'fusee', type: 'luxury', brand: 'Espace', model: 'Fusée privée', price: 2000000000, emoji: '🚀', grad: ['#311b92','#000'], specs: { Destination: 'Orbite basse' } },
];

TC.SHOP_TYPES = {
  car:    { label: 'Concession', icon: '🏎️', resale: 0.80, note: 'Revente à 80 % du prix d\'achat' },
  estate: { label: 'Immobilier', icon: '🏠', resale: 0.95, note: 'Rapporte un loyer chaque heure · revente à 95 %' },
  luxury: { label: 'Luxe',       icon: '💎', resale: 0.85, note: 'Revente à 85 % du prix d\'achat' },
};

// Loyer horaire = 0,05 % de la valeur du bien (accéléré pour le jeu)
TC.RENT_RATE_PER_HOUR = 0.0005;
TC.RENT_MAX_HOURS = 48;

TC.shopById = {};
TC.SHOP.forEach(s => { TC.shopById[s.id] = s; });

TC.RANKS = [
  [0, 'Fauché', '🪫'],
  [10, 'Débutant', '🐣'],
  [100, 'Apprenti trader', '📈'],
  [1000, 'Trader du dimanche', '☕'],
  [10000, 'Day trader', '💻'],
  [100000, 'Trader pro', '🦈'],
  [1000000, 'Millionnaire', '💰'],
  [10000000, 'Loup de la finance', '🐺'],
  [100000000, 'Baleine', '🐋'],
  [1000000000, 'Milliardaire', '👑'],
  [10000000000, 'Maître du monde', '🌍'],
];

TC.ACHIEVEMENTS = [
  { id: 'first_trade', icon: '🎬', name: 'Premier pas', desc: 'Passer votre premier ordre' },
  { id: 'first_profit', icon: '💚', name: 'Premier bénéfice', desc: 'Clôturer un trade gagnant' },
  { id: 'double', icon: '✌️', name: 'Doublé', desc: 'Atteindre 20 € de patrimoine' },
  { id: 'nw100', icon: '💯', name: 'Centenaire', desc: 'Atteindre 100 € de patrimoine' },
  { id: 'nw1k', icon: '💵', name: 'Quatre chiffres', desc: 'Atteindre 1 000 €' },
  { id: 'nw10k', icon: '💶', name: 'Ça devient sérieux', desc: 'Atteindre 10 000 €' },
  { id: 'nw100k', icon: '💷', name: 'Six chiffres', desc: 'Atteindre 100 000 €' },
  { id: 'nw1m', icon: '💰', name: 'Millionnaire', desc: 'Atteindre 1 000 000 €' },
  { id: 'nw1b', icon: '👑', name: 'Milliardaire', desc: 'Atteindre 1 000 000 000 €' },
  { id: 'lev10', icon: '🎢', name: 'Montagnes russes', desc: 'Ouvrir une position à levier x10 ou plus' },
  { id: 'lev100', icon: '🔥', name: 'Degen absolu', desc: 'Ouvrir une position à levier x100' },
  { id: 'short', icon: '🐻', name: 'Ours', desc: 'Ouvrir une position short' },
  { id: 'liquidated', icon: '💀', name: 'Rekt', desc: 'Se faire liquider' },
  { id: 'bet_win', icon: '🎯', name: 'Visionnaire', desc: 'Gagner un pari' },
  { id: 'bet5', icon: '🔮', name: 'Oracle', desc: 'Gagner 5 paris' },
  { id: 'diversified', icon: '🧺', name: 'Diversifié', desc: 'Détenir 5 actifs différents en même temps' },
  { id: 'first_vehicle', icon: '🛞', name: 'Permis en poche', desc: 'Acheter votre premier véhicule' },
  { id: 'porsche', icon: '🇩🇪', name: 'Stuttgart', desc: 'Acheter une Porsche' },
  { id: 'lambo', icon: '🐂', name: 'Taureau furieux', desc: 'Acheter une Lamborghini' },
  { id: 'ferrari', icon: '🐎', name: 'Cheval cabré', desc: 'Acheter une Ferrari' },
  { id: 'bugatti', icon: '🚀', name: 'Hypercar', desc: 'Acheter une Bugatti' },
  { id: 'first_estate', icon: '🔑', name: 'Propriétaire', desc: 'Acheter votre premier bien immobilier' },
  { id: 'landlord', icon: '🏘️', name: 'Magnat de l\'immobilier', desc: 'Posséder 5 biens immobiliers' },
  { id: 'rolex', icon: '⌚', name: 'Une Rolex avant 50 ans', desc: 'Acheter une Rolex' },
  { id: 'yacht', icon: '🛥️', name: 'Capitaine', desc: 'Acheter un yacht' },
  { id: 'jet', icon: '✈️', name: 'Jet-setter', desc: 'Acheter un jet privé' },
  { id: 'collector', icon: '🏆', name: 'Collectionneur', desc: 'Posséder 10 objets' },
  { id: 'phoenix', icon: '🐦‍🔥', name: 'Phénix', desc: 'Recommencer après une faillite' },
  { id: 'xmas', icon: '🎅', name: 'Joyeux Noël', desc: 'Jouer le jour de Noël' },
  { id: 'advent', icon: '🗓️', name: 'Calendrier complet', desc: 'Ouvrir les 24 cases du calendrier de l\'Avent' },
];

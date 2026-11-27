/* Trad Center — interface */
(function () {
  const { $, $$, esc, fmt } = TC;
  const G = TC.Game, D = TC.Data;
  const UI = TC.UI = {
    tab: 'portfolio', cat: 'all', q: '', sel: 'BTC', tf: '1J',
    mode: 'spot', spotSide: 'buy', levSide: 'long', lev: 10, betDur: 5, shopSort: 'asc',
  };
  const S = () => G.state;
  const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
  const STATUS = {
    live: ['LIVE', 'live', 'Temps réel'],
    delayed: ['RÉEL', 'delayed', 'Cours réel (délai possible jusqu\'à 15 min)'],
    cache: ['CACHE', 'cache', 'Dernier cours réel connu, en attente de connexion'],
    sim: ['SIM', 'sim', 'Source injoignable : prix simulé à partir du dernier cours connu'],
    loading: ['…', 'loading', 'Chargement'],
  };
  function badge(id) {
    const p = D.prices[id]; const s = STATUS[(p && p.status) || 'loading'];
    const closed = p && p.closed && p.status !== 'sim' && p.status !== 'cache';
    return `<span class="st st-${s[1]}" title="${s[2]}">${s[0]}</span>${closed ? '<span class="st st-closed" title="Marché fermé : dernier cours de clôture">FERMÉ</span>' : ''}`;
  }
  function icon(a, size = '') {
    return `<span class="aicon ${size}" style="--c:${a.color}">${esc(a.icon || a.id[0])}</span>`;
  }

  /* ================= EN-TÊTE ================= */
  let lastNW = null;
  UI.header = function () {
    const nw = G.netWorth();
    const inv = G.spotValue() + G.levValue() + G.betsValue();
    let pnl = 0;
    for (const id in S().holdings) pnl += G.holdingValue(id) - S().holdings[id].cost;
    S().positions.forEach(p => { pnl += G.posPnl(p); });
    const nwEl = $('#s-nw');
    nwEl.textContent = fmt.eur(nw, true);
    if (lastNW != null && Math.abs(nw - lastNW) > 1e-9) flash(nwEl, nw > lastNW);
    lastNW = nw;
    const ch = (nw - G.START_CASH) / G.START_CASH * 100;
    const ch2 = $('#s-nwch'); if (ch2) { ch2.textContent = fmt.pct(ch); ch2.className = cls(ch); }
    $('#s-cash').textContent = TC.Style && TC.Style.infinite && TC.Style.infinite() ? '♾️ Illimité' : fmt.eur(S().cash, true);
    const si = $('#s-inv'); if (si) si.textContent = fmt.eur(inv, true);
    const pe = $('#s-pnl'); if (pe) { pe.textContent = (pnl > 0 ? '+' : '') + fmt.eur(pnl, true); pe.className = cls(pnl); }
    const rk = G.rank(nw); const sr = $('#s-rank'); if (sr) sr.textContent = rk.r[2] + ' ' + rk.r[1];
    const sim = $('#s-sim'); if (sim) sim.hidden = !D.anySim();
    UI._split = { cash: S().cash, inv, items: G.itemsValue(), biz: TC.City ? TC.City.value() : 0, nw };
    const ready = G.bonusReadyIn();
    const bb = $('#b-bonus'); bb.disabled = ready > 0; bb.querySelector('span').textContent = ready > 0 ? '' : ' +' + G.BONUS + ' €'; bb.title = ready > 0 ? 'Prochain bonus dans ' + fmt.dur(ready) : 'Récupérer ' + G.BONUS + ' € gratuits';
    bb.classList.toggle('pulse', ready === 0);
    const np = S().positions.length + S().bets.length; const nb = $('#nb-pos'); nb.textContent = np || ''; nb.style.display = np ? '' : 'none';
    const r = G.pendingRent(); const nr = $('#nb-rent'); nr.textContent = r >= 1 ? '€' : ''; nr.style.display = r >= 1 ? '' : 'none';
    const nab = $('#nb-ach'); if (nab) nab.textContent = Object.keys(S().ach).length + '/' + TC.ACHIEVEMENTS.length;
    UI.goal(nw);
  };
  function flash(el, up) { el.classList.remove('fl-up', 'fl-down'); void el.offsetWidth; el.classList.add(up ? 'fl-up' : 'fl-down'); }

  UI.goal = function (nw) {
    const it = TC.shopById[S().goal]; const el = $('#goalbar');
    if (!it) { el.innerHTML = ''; return; }
    const pct = Math.min(100, nw / it.price * 100);
    const src = TC.img(it.id);
    el.innerHTML = `<span class="g-label">🎯 Objectif</span>${src ? `<img class="g-img" src="${src}" alt="" referrerpolicy="no-referrer">` : ''}<span class="g-item">${src ? '' : it.emoji + ' '}${esc(it.brand)} ${esc(it.model)}</span>
      <div class="g-bar"><i style="width:${Math.max(0.5, pct)}%"></i></div><span class="g-pct">${pct >= 100 ? '✅ Atteint !' : fmt.num(pct, pct < 1 ? 4 : 2) + ' %'}</span>
      <span class="g-price">${fmt.eur(it.price)}</span>`;
  };

  /* ================= PORTEFEUILLE ================= */
  UI.portfolio = function () {
    const s = S(); const nw = G.netWorth();
    const holdIds = Object.keys(s.holdings);
    const cards = [
      ['Patrimoine total', fmt.eur(nw), '💰'],
      ['Cash disponible', fmt.eur(s.cash), '💵'],
      ['Au comptant', fmt.eur(G.spotValue()), '📦'],
      ['Positions à levier', fmt.eur(G.levValue()), '⚡'],
      ['Biens (revente)', fmt.eur(G.itemsValue()), '🏆'],
      ['Record', fmt.eur(s.stats.peak), '🚀'],
    ];
    const rows = holdIds.map(id => {
      const a = TC.assetById[id]; const h = s.holdings[id]; const v = G.holdingValue(id); const pnl = v - h.cost;
      return `<tr><td>${icon(a)} <b>${id}</b> <small>${esc(a.name)}</small></td><td>${fmt.qty(h.qty)}</td><td>${fmt.eur(h.cost / h.qty)}</td><td>${fmt.eur(D.eur(id))}</td><td><b>${fmt.eur(v)}</b></td>
        <td class="${cls(pnl)}">${pnl > 0 ? '+' : ''}${fmt.eur(pnl)}<br><small>${fmt.pct(pnl / h.cost * 100)}</small></td>
        <td><button class="btn btn-sm" data-goto="${id}">Trader</button> <button class="btn btn-sm btn-sell" data-sellall="${id}">Tout vendre</button></td></tr>`;
    }).join('');
    const prow = s.positions.map(x => {
      const a = TC.assetById[x.asset]; const pnl = G.posPnl(x); const p = D.eur(x.asset);
      return `<tr><td>${icon(a)} <b>${x.asset}</b></td><td class="${x.side === 'long' ? 'up' : 'down'}"><b>${x.side === 'long' ? 'LONG' : 'SHORT'} x${x.lev}</b></td><td>${fmt.eur(x.margin)}</td><td>${fmt.eur(x.entry)}</td><td>${fmt.eur(p)}</td><td class="warn-t">${fmt.eur(x.liq)}</td>
        <td class="${cls(pnl)}"><b>${pnl > 0 ? '+' : ''}${fmt.eur(pnl)}</b><br><small>${fmt.pct(pnl / x.margin * 100)}</small></td>
        <td><button class="btn btn-sm" data-goto="${x.asset}">Voir</button> <button class="btn btn-sm btn-sell" data-close="${x.id}">Clôturer</button></td></tr>`;
    }).join('');
    const brow = s.bets.map(b => {
      const p = D.eur(b.asset); const winning = p != null && ((p > b.start) === (b.dir === 'up')) && p !== b.start;
      return `<tr><td><b>${b.asset}</b></td><td>${b.dir === 'up' ? '📈 Hausse' : '📉 Baisse'}</td><td>${fmt.eur(b.stake)}</td><td>${fmt.eur(b.start)}</td><td>${fmt.eur(p)}</td><td class="${winning ? 'up' : 'down'}"><b>${winning ? 'Gagnant' : 'Perdant'}</b></td><td>${fmt.dur(b.end - Date.now())}</td></tr>`;
    }).join('');
    const LOGL = { tax: '🏛️ Impôt', shop: '🛒 Courses', loan: '🏦 Prêt', repay: '🏦 Remboursement', fine: '🛡️ Correction', buy: '🟢 Achat', sell: '🔴 Vente', open: '⚡ Ouverture', close: '✅ Clôture', liq: '💀 Liquidation', bet: '🎲 Pari', betres: '🎲 Résultat pari', item: '🛍️ Achat', itemsell: '♻️ Revente', rent: '🏠 Loyers', biz: '🏪 Commerces', bonus: '🎁 Bonus', send: '📤 Envoi', recv: '📥 Reçu', corp: '🏢 Entreprise', fr: '🇫🇷 Vie quotidienne', life: '🧍 Ma vie' };
    const lrow = s.log.slice(0, 80).map(l => {
      const name = l.item ? (TC.shopById[l.item].brand + ' ' + TC.shopById[l.item].model) : (l.kind === 'send' || l.kind === 'recv') ? (l.asset ? '' : 'Euros') : (l.asset || '');
      let det = '';
      if (l.kind === 'buy' || l.kind === 'sell') det = `${fmt.qty(l.qty)} @ ${fmt.eur(l.price)}`;
      if (l.kind === 'open') det = `${l.side} x${l.lev} @ ${fmt.eur(l.price)}`;
      if (l.kind === 'close' || l.kind === 'liq') det = `${l.side} x${l.lev} @ ${fmt.eur(l.price)}${l.reason === 'sl' ? ' (stop-loss)' : l.reason === 'tp' ? ' (take-profit)' : ''}`;
      if (l.kind === 'bet') det = `${l.dir === 'up' ? 'hausse' : 'baisse'} ${l.minutes} min @ ${fmt.eur(l.price)}`;
      if (l.kind === 'send' || l.kind === 'recv') det = `${l.kind === 'send' ? 'à' : 'de'} ${l.who || ''}${l.asset ? ' · ' + fmt.qty(l.qty) + ' ' + l.asset : ''}`;
      if (l.kind === 'betres') det = `${fmt.eur(l.start)} → ${fmt.eur(l.price)} (${l.result === 'win' ? 'gagné' : l.result === 'push' ? 'égalité' : 'perdu'})`;
      return `<tr><td><small>${fmt.time(l.t)}</small></td><td>${LOGL[l.kind] || l.kind}</td><td><b>${esc(name)}</b> <small>${det}</small></td><td>${fmt.eur(l.eur)}</td><td class="${cls(l.pnl)}">${l.pnl != null ? (l.pnl > 0 ? '+' : '') + fmt.eur(l.pnl) : ''}</td></tr>`;
    }).join('');
    $('#tab-portfolio').innerHTML = (TC.Tax && TC.Tax.fortunePanel ? TC.Tax.fortunePanel() : '') + (TC.Life ? TC.Life.panel() : '') + (TC.Fr ? TC.Fr.panel() : '') + (TC.Corp ? TC.Corp.panel() : '') + `
      <div class="cards">${cards.map(c => `<div class="card"><span>${c[2]}</span><label>${c[0]}</label><b>${c[1]}</b></div>`).join('')}</div>
      <div class="panel"><h3>📈 Évolution de votre patrimoine</h3><div id="nw-chart" class="nw-chart"></div></div>
      ${lrow ? `<div class="panel"><h3>📜 Historique</h3><div class="tw"><table class="log"><tbody>${lrow}</tbody></table></div></div>` : ''}
      <div class="panel stats-panel"><details><summary>📊 Statistiques</summary><div class="kv">
        <span>Frais payés</span><b>${fmt.eur(s.stats.fees)}</b><span>Loyers encaissés (nets)</span><b>${fmt.eur(s.stats.rent)}</b><span>Impôts payés <small class="taxl" data-taxinfo>ⓘ</small></span><b>${fmt.eur(s.stats.taxes || 0)}</b>
        <span>Dépensé en boutique</span><b>${fmt.eur(s.stats.spent)}</b><span>Partie commencée le</span><b>${new Date(s.created).toLocaleDateString('fr-FR')}</b></div></details></div>`;
    G.sampleNW();
    TC.Chart.nw($('#nw-chart'), s.nw.length > 1 ? s.nw : [[Math.floor(s.created / 1000), G.START_CASH], [Math.floor(Date.now() / 1000), nw]]);
  };

  /* ================= BOUTIQUE ================= */
  UI.shopType = 'car';
  const shopSeg = type => `<div class="seg seg-4 shop-tabs" id="shop-tabs">${Object.entries(TC.SHOP_TYPES).map(([k, v]) => `<button data-shop="${k}" class="${k === type ? 'active' : ''}">${v.icon} ${v.label}</button>`).join('')}<button data-shop="chest" class="${type === 'chest' ? 'active' : ''}">🧰 Coffre</button></div>`;
  UI.shop = function (type) {
    type = type || UI.shopType; UI.shopType = type;
    if (type === 'chest' && TC.Chest.isSpinning()) return; // ne pas effacer la roulette en cours
    if (type === 'chest') { $('#tab-shop').innerHTML = shopSeg(type) + '<div id="chest-root"></div>'; TC.Chest.render($('#chest-root')); return; }
    const T = TC.SHOP_TYPES[type]; const cash = S().cash;
    let items = TC.SHOP.filter(i => i.type === type && (!i.limited || TC.season.noel));
    items = items.slice().sort((x, y) => UI.shopSort === 'asc' ? x.price - y.price : y.price - x.price);
    const ownedCount = id => S().owned.filter(o => o.item === id).length;
    $('#tab-shop').innerHTML = `
      ${shopSeg(type)}
      <div class="shop-head"><div><h2>${T.icon} ${T.label}</h2><p>${T.note}${type === 'estate' ? ` · loyer : ${fmt.num(TC.RENT_RATE_PER_HOUR * 100, 2)} % de la valeur par heure (jusqu'à ${TC.RENT_MAX_HOURS} h d'accumulation)` : ''}</p></div>
        <div class="shop-cash">Cash : <b>${fmt.eur(cash)}</b> <div class="seg" data-sort><button data-sort="asc" class="${UI.shopSort === 'asc' ? 'active' : ''}">Prix ↑</button><button data-sort="desc" class="${UI.shopSort === 'desc' ? 'active' : ''}">Prix ↓</button></div></div></div>
      <div class="shop-grid">${items.map(it => {
        const can = cash >= it.price; const pct = Math.min(100, cash / it.price * 100); const n = ownedCount(it.id);
        const rent = type === 'estate' ? `<div class="rent">🏠 Loyer : <b>${fmt.eur(it.price * TC.RENT_RATE_PER_HOUR)}/h</b></div>` : '';
        return `<div class="item ${can ? 'can' : ''}" data-item="${it.id}">
          ${TC.itemVis(it, '', `${n ? `<i class="owned">✔ ${n > 1 ? n + '× ' : ''}possédé</i>` : ''}${S().goal === it.id ? '<i class="isgoal">🎯 Objectif</i>' : ''}${TC.imgPage(it.id) ? `<a class="credit" href="${TC.imgPage(it.id)}" target="_blank" rel="noopener" title="Photo : Wikipedia / Wikimedia Commons">ⓘ</a>` : ''}`)}
          <div class="item-body"><small>${esc(it.brand)}</small><h3>${esc(it.model)}</h3>
            <div class="specs">${Object.entries(it.specs).map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div>${rent}
            <div class="item-price">${fmt.eur(it.price)}</div>
            <div class="prog"><i style="width:${Math.max(0.5, pct)}%"></i></div>
            <div class="prog-l" data-progl>${can ? '✅ Vous pouvez l\'acheter' : `Il manque ${fmt.eur(it.price - cash, true)} · ${fmt.num(pct, pct < 1 ? 3 : 1)} %`}</div>
            ${it.limited ? `<div class="limited">🎄 Édition limitée : achetable le 25 décembre seulement</div>` : ''}
            <div class="item-actions"><button class="btn ${can ? 'btn-gold' : ''}" data-buyitem="${it.id}" ${can && (!it.limited || TC.Xmas && TC.Xmas.isDay(25)) ? '' : 'disabled'}>Acheter</button><button class="btn btn-ghost btn-sm" data-goal="${it.id}" title="Définir comme objectif">🎯</button></div>
          </div></div>`;
      }).join('')}</div>`;
  };

  // mise à jour légère (sans redessiner les photos)
  UI.shopUpdate = function (type) {
    if (type === 'chest') { const b = $('#chest-open'); if (b && !b.closest('.chest-hero').querySelector('.opening')) b.disabled = S().cash < TC.Chest.PRICE; return; }
    const cash = S().cash; const root = $('#tab-shop');
    const cb = root.querySelector('.shop-cash b'); if (cb) cb.textContent = fmt.eur(cash);
    root.querySelectorAll('.item[data-item]').forEach(card => {
      const it = TC.shopById[card.dataset.item]; const can = cash >= it.price; const pct = Math.min(100, cash / it.price * 100);
      card.classList.toggle('can', can);
      card.querySelector('.prog i').style.width = Math.max(0.5, pct) + '%';
      card.querySelector('[data-progl]').textContent = can ? '✅ Vous pouvez l\'acheter' : `Il manque ${fmt.eur(it.price - cash, true)} · ${fmt.num(pct, pct < 1 ? 3 : 1)} %`;
      const btn = card.querySelector('[data-buyitem]'); btn.disabled = !can || (it.limited && !(TC.Xmas && TC.Xmas.isDay(25))); btn.classList.toggle('btn-gold', can);
    });
  };
  UI.liveTab = function () {
    if (UI.tab === 'portfolio') UI.portfolio();
    else if (UI.tab === 'shop') UI.shopUpdate(UI.shopType);
    else if (UI.tab === 'city' && TC.City) TC.City.live();
    else if (UI.tab === 'collection') { const el = $('#rent-pend'); if (el) el.textContent = fmt.eur(G.pendingRent()); const b = $('#b-rent'); if (b) b.disabled = G.pendingRent() < 0.01; }
  };

  /* ================= COLLECTION ================= */
  UI.collection = function () {
    const s = S(); const groups = { car: [], estate: [], luxury: [] };
    s.owned.forEach(o => groups[TC.shopById[o.item].type].push(o));
    const rph = G.rentPerHour(); const pend = G.pendingRent();
    const card = o => {
      const it = TC.shopById[o.item];
      return `<div class="item own">${TC.itemVis(it, 'sm')}
        <div class="item-body"><small>${esc(it.brand)}</small><h3>${esc(it.model)}</h3>
        <div class="specs"><span>Acheté <b>${fmt.eur(o.price)}</b></span><span>Le <b>${new Date(o.t).toLocaleDateString('fr-FR')}</b></span>${it.type === 'estate' ? `<span>Loyer <b>${fmt.eur(o.price * TC.RENT_RATE_PER_HOUR)}/h</b></span>` : ''}</div>
        <button class="btn btn-sm btn-ghost" data-sellitem="${o.uid}">Revendre ${fmt.eur(G.itemResale(o))}</button></div></div>`;
    };
    const star = s.owned.slice().sort((a, b) => b.price - a.price)[0];
    const starIt = star && TC.shopById[star.item];
    const me = TC.Style.mine(), plus = TC.Style.isPlus(me);
    $('#tab-collection').innerHTML = `
      <div class="panel style-card"><button class="av-btn" data-style="">${TC.Style.avatar(me, 'xl')}<i>🎨</i></button>
        <div><h3>🎨 Mon style ${TC.Style.badge(me)}</h3><p class="muted">Casquettes, lunettes, chaînes, sneakers et cadres de grandes marques pour habiller ton avatar.</p>
        <div class="style-actions"><button class="btn btn-gold" data-style="hat">Personnaliser</button>${plus ? '' : `<button class="btn btn-plus" onclick="TC.Style.plusInfo()"><span class="vbadge">✓</span> Devenir vérifié</button>`}</div></div></div>
      ${starIt ? `<div class="hero">${TC.itemVis(starIt, 'hero-vis')}<div class="hero-txt"><small>⭐ Pièce maîtresse</small><h2>${esc(starIt.brand)} ${esc(starIt.model)}</h2><b>${fmt.eur(star.price)}</b></div></div>` : ''}
      <div class="cards">
        <div class="card"><span>🏆</span><label>Objets possédés</label><b>${s.owned.length}</b></div>
        <div class="card"><span>✨</span><label>Prestige</label><b>${fmt.num(G.prestige(), 0)}</b></div>
        <div class="card"><span>💎</span><label>Valeur de revente</label><b>${fmt.eur(G.itemsValue())}</b></div>
        <div class="card"><span>🏠</span><label>Loyers par heure</label><b>${fmt.eur(rph)}</b></div>
      </div>
      ${rph > 0 ? `<div class="panel rentp"><div>🏠 Loyers à encaisser : <b id="rent-pend">${fmt.eur(pend)}</b> <small>(accumulation max ${TC.RENT_MAX_HOURS} h · <span class="taxl" data-taxinfo>🏛️ impôt ${TC.Tax ? TC.Tax.pct(TC.Tax.rate()) : '0 %'} ⓘ</span>)</small></div><button class="btn btn-gold" id="b-rent" ${pend < 0.01 ? 'disabled' : ''}>Encaisser</button></div>` : ''}
      ${s.owned.length ? '' : '<div class="panel empty big">Votre collection est vide.<br>Faites fructifier vos 10 € puis offrez-vous votre première voiture dans la <b>Concession</b> ! 🏎️</div>'}
      ${groups.car.length ? `<div class="panel"><h3>🏎️ Garage</h3><div class="shop-grid">${groups.car.map(card).join('')}</div></div>` : ''}
      ${groups.estate.length ? `<div class="panel"><h3>🏠 Propriétés</h3><div class="shop-grid">${groups.estate.map(card).join('')}</div></div>` : ''}
      ${groups.luxury.length ? `<div class="panel"><h3>💎 Luxe</h3><div class="shop-grid">${groups.luxury.map(card).join('')}</div></div>` : ''}
      <div id="coll-ach"></div>`;
    UI.ach($('#coll-ach'));
  };

  /* ================= SUCCÈS ================= */
  UI.ach = function (root) {
    const s = S(); root = root || $('#coll-ach'); if (!root) return;
    root.innerHTML = `<div class="shop-head"><div><h2>🎖️ Succès</h2><p>${Object.keys(s.ach).length} / ${TC.ACHIEVEMENTS.length} débloqués</p></div></div>
      <div class="ach-grid">${TC.ACHIEVEMENTS.map(a => `<div class="ach ${s.ach[a.id] ? 'on' : ''}"><span>${a.icon}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>${s.ach[a.id] ? `<em>${new Date(s.ach[a.id]).toLocaleDateString('fr-FR')}</em>` : ''}</div></div>`).join('')}</div>
      <div class="panel"><h3>🏅 Rangs</h3><div class="ranks">${TC.RANKS.map(r => `<div class="rk ${G.netWorth() >= r[0] ? 'on' : ''}"><span>${r[2]}</span><b>${r[1]}</b><small>${fmt.eur(r[0], true)}</small></div>`).join('')}</div></div>`;
  };

  // détail : cash (ce qu'on peut dépenser tout de suite) et patrimoine (tout ce qu'on possède)
  document.addEventListener('click', e => {
    if (!e.target.closest('#nw-box')) return;
    const x = UI._split || {}, row = (l, v, h) => `<span>${l}${h ? `<small>${h}</small>` : ''}</span><b>${fmt.eur(v || 0)}</b>`;
    const other = (x.nw || 0) - (x.cash || 0) - (x.inv || 0) - (x.items || 0) - (x.biz || 0);
    TC.modal(`<h2>💰 Mon argent</h2><div class="modal-body">
      <div class="split"><div><label>💵 Cash</label><b>${fmt.eur(x.cash || 0)}</b><small>L'argent disponible tout de suite : pour acheter, parier, envoyer.</small></div>
        <div><label>🏦 Patrimoine</label><b>${fmt.eur(x.nw || 0)}</b><small>Tout ce que tu possèdes, si tu revendais tout maintenant.</small></div></div>
      <h4>Détail du patrimoine</h4>
      <div class="kv split-kv">${row('💵 Cash', x.cash)}${row('📈 Placements', x.inv, 'cryptos, actions, levier, paris')}${row('🏎️ Objets achetés', x.items, 'voitures, maisons, luxe (prix de revente)')}${row('🏪 Commerces', x.biz, 'prix de revente')}${Math.abs(other) > 0.01 ? row('➕ Autres', other) : ''}<span><b>= Patrimoine</b></span><b>${fmt.eur(x.nw || 0)}</b></div>
      <p class="hint">Le patrimoine sert aux classements et à ton rang. Pour acheter, seul le cash compte : revends un placement pour récupérer du cash.</p>
      <div class="modal-actions"><button class="btn btn-gold" data-close>OK</button></div></div>`);
  });
  UI.refreshTab = function () {
    if (UI.tab === 'portfolio') UI.portfolio();
    else if (UI.tab === 'shop') UI.shop();
    else if (UI.tab === 'collection') UI.collection();
    else if (UI.tab === 'social' && TC.Social) TC.Social.render();
    else if (UI.tab === 'city' && TC.City) TC.City.render();
  };
})();

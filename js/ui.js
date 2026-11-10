/* Trad Center — interface */
(function () {
  const { $, $$, esc, fmt } = TC;
  const G = TC.Game, D = TC.Data;
  const UI = TC.UI = {
    tab: 'markets', cat: 'all', q: '', sel: 'BTC', tf: '1J',
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
    const ch2 = $('#s-nwch'); ch2.textContent = fmt.pct(ch); ch2.className = cls(ch);
    $('#s-cash').textContent = fmt.eur(S().cash, true);
    const si = $('#s-inv'); if (si) si.textContent = fmt.eur(inv, true);
    const pe = $('#s-pnl'); if (pe) { pe.textContent = (pnl > 0 ? '+' : '') + fmt.eur(pnl, true); pe.className = cls(pnl); }
    const rk = G.rank(nw); const sr = $('#s-rank'); if (sr) sr.textContent = rk.r[2] + ' ' + rk.r[1];
    const sim = $('#s-sim'); if (sim) sim.hidden = !D.anySim();
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

  /* ================= BANDEAU DÉFILANT ================= */
  UI.ticker = function () {
    const ids = ['BTC', 'ETH', 'SOL', 'CAC40', 'SP500', 'NASDAQ', 'GOLD', 'TSLA', 'NVDA', 'AAPL', 'MC', 'RACE', 'DOGE', 'XRP', 'WTI', 'USD', 'DAX', 'PEPE'];
    const html = ids.map(id => `<span class="tk" data-id="${id}"><b>${id}</b> <span class="tk-p">—</span> <span class="tk-c">—</span></span>`).join('');
    const tk = $('#ticker'); if (tk) tk.innerHTML = html + html;
  };
  UI.tickerUpdate = function () {
    $$('#ticker .tk').forEach(el => {
      const id = el.dataset.id; const p = D.eur(id); const c = D.change(id);
      el.querySelector('.tk-p').textContent = fmt.eur(p);
      const ce = el.querySelector('.tk-c'); ce.textContent = fmt.pct(c); ce.className = 'tk-c ' + cls(c);
    });
  };

  UI.databar = function () {
    const h = D.health;
    const lab = { live: '🟢', delayed: '🟡', coingecko: '🟡', loading: '⏳', down: '🔴' };
    const sim = D.anySim();
    if (!$('#databar')) return;
    $('#databar').innerHTML = `<span>${lab[h.binance] || '⏳'} Crypto ${h.binance === 'live' ? 'temps réel (Binance)' : h.binance === 'coingecko' ? 'CoinGecko (1 min)' : h.binance === 'down' ? 'injoignable' : 'connexion…'}</span>
      <span>${lab[h.yahoo] || '⏳'} Bourse ${h.yahoo === 'live' ? 'Yahoo Finance (MAJ 45 s)' : h.yahoo === 'down' ? 'injoignable' : 'connexion…'}</span>
      <span>${lab[h.fx] || '⏳'} Devises ${D.fxStatus === 'live-yahoo' ? 'Yahoo' : h.fx === 'live' ? 'BCE' : h.fx === 'down' ? 'injoignable' : 'connexion…'}</span>
      ${sim ? '<span class="warn">⚠️ Certaines sources sont injoignables depuis votre réseau : les actifs marqués <b>SIM</b> sont simulés à partir du dernier cours connu.</span>' : ''}`;
  };

  /* ================= LISTE DES MARCHÉS ================= */
  UI.cats = function () {
    $('#m-cats').innerHTML = Object.entries(TC.CATS).map(([k, c]) => `<button data-cat="${k}" class="${UI.cat === k ? 'active' : ''}">${c.icon} ${c.label}</button>`).join('');
  };
  function visibleAssets() {
    const q = UI.q.trim().toLowerCase();
    return TC.ASSETS.filter(a => {
      if (UI.cat === 'fav' && !S().fav.includes(a.id)) return false;
      if (UI.cat === 'other' ? !(a.cat === 'commodity' || a.cat === 'fx') : (UI.cat !== 'all' && UI.cat !== 'fav' && a.cat !== UI.cat)) return false;
      if (q && !(a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.y || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }
  UI.list = function () {
    const list = visibleAssets();
    $('#m-list').innerHTML = list.length ? list.map(a => `
      <div class="mrow ${a.id === UI.sel ? 'sel' : ''}" data-id="${a.id}">
        <button class="fav ${S().fav.includes(a.id) ? 'on' : ''}" data-fav="${a.id}" title="Favori">★</button>
        ${icon(a)}
        <div class="mname"><b>${esc(a.id)}</b><small>${esc(a.name)}</small></div>
        <div class="mspark"></div>
        <div class="mprice"><b class="mp">—</b><small class="mc">—</small></div>
      </div>`).join('') : '<div class="empty">Aucun résultat</div>';
    UI.listUpdate(true);
  };
  UI.listUpdate = function (all) {
    $$('#m-list .mrow').forEach(row => {
      const id = row.dataset.id; const p = D.prices[id];
      if (!all && !(p && p._dirty)) return;
      const e = D.eur(id), c = D.change(id);
      const pe = row.querySelector('.mp'); const old = pe.textContent; pe.textContent = fmt.eur(e);
      if (!all && old !== pe.textContent && p && p.dir) flash(pe, p.dir > 0);
      const ce = row.querySelector('.mc'); ce.innerHTML = `${fmt.pct(c)} ${badge(id)}`; ce.className = 'mc ' + cls(c);
      row.querySelector('.mspark').innerHTML = TC.spark(p && p.spark);
    });
  };

  /* ================= GRAPHIQUE ================= */
  UI.tfButtons = function () {
    $('#c-tf').innerHTML = ['1J', '1S', '1M', '1A'].map(k => `<button data-tf="${k}" class="${UI.tf === k ? 'active' : ''}">${TC.TF[k].label}</button>`).join('');
  };
  UI.chartHead = function () {
    const a = TC.assetById[UI.sel]; const p = D.prices[UI.sel] || {}; const e = D.eur(UI.sel); const c = D.change(UI.sel);
    const native = a.cat === 'fx' ? `1 ${a.code} = ${fmt.num(e, 4)} € · 1 € = ${fmt.num(D.fx[a.code], 4)} ${a.code}` :
      (p.ccy && p.ccy !== 'EUR' ? `${fmt.price(p.price, p.ccy)} · ${esc(a.y || a.bin)}` : esc(a.y || a.bin || ''));
    const ch = D.prevEur(UI.sel); const diff = e != null && ch != null ? e - ch : null;
    $('#c-head').innerHTML = `
      <div class="ch-left">${icon(a, 'lg')}<div><h1>${esc(a.name)} <small>${esc(a.id)}</small> <button class="fav ${S().fav.includes(a.id) ? 'on' : ''}" data-fav="${a.id}">★</button></h1>
        <div class="ch-native">${native} ${badge(UI.sel)}</div></div></div>
      <div class="ch-right"><div class="ch-price" id="c-price">${fmt.eur(e)}</div>
        <div class="ch-change ${cls(c)}">${diff != null ? (diff > 0 ? '+' : '') + fmt.eur(diff) : ''} (${fmt.pct(c)}) <small>${a.cat === 'crypto' ? '24 h' : 'jour'}</small></div></div>`;
    const hold = S().holdings[UI.sel];
    const ps = S().positions.filter(x => x.asset === UI.sel);
    const hi = p.high ? D.toEUR(p.high, p.ccy) : null, lo = p.low ? D.toEUR(p.low, p.ccy) : null;
    $('#c-foot').innerHTML = hold || ps.length ? `
      ${hold ? `<span class="hl">Vous avez <b>${fmt.qty(hold.qty)} ${a.id}</b> = ${fmt.eur(G.holdingValue(a.id))}</span>` : ''}
      ${ps.length ? `<span class="hl">${ps.length} position(s) à levier en cours</span>` : ''}` : `<span>Achetez dès 1 € : si le prix monte, vous gagnez.</span>`;
    void hi; void lo; void ch;
    document.title = `${e != null ? fmt.eur(e) + ' · ' : ''}${a.id} — Trad Center`;
  };
  UI.chartPrice = function () {
    const el = $('#c-price'); if (!el) return;
    const p = D.prices[UI.sel]; const t = fmt.eur(D.eur(UI.sel));
    if (el.textContent !== t) { el.textContent = t; if (p && p.dir) flash(el, p.dir > 0); }
  };
  let chartReq = 0;
  UI.loadChart = async function () {
    const req = ++chartReq; const id = UI.sel, tf = UI.tf;
    $('#c-loading').style.display = 'flex';
    const h = await D.history(id, tf);
    if (req !== chartReq) return;
    $('#c-loading').style.display = 'none';
    TC.Chart.setData(h.bars, TC.TF[tf].sec);
    UI.chartReal = h.real;
    $('#c-note').innerHTML = h.real ? '' : '⚠️ Historique indisponible depuis votre réseau : courbe simulée';
    UI.chartLines();
  };
  UI.chartLines = function () {
    const lines = [];
    const h = S().holdings[UI.sel];
    if (h && h.qty > 0) lines.push({ price: h.cost / h.qty, color: '#8b93a7', title: 'Prix moyen' });
    S().positions.filter(p => p.asset === UI.sel).forEach(p => {
      lines.push({ price: p.entry, color: p.side === 'long' ? '#16c784' : '#ea3943', title: `${p.side === 'long' ? 'Long' : 'Short'} x${p.lev}`, style: 0 });
      lines.push({ price: p.liq, color: '#ff9f1c', title: 'Liquidation' });
      if (p.sl) lines.push({ price: p.sl, color: '#ea3943', title: 'SL' });
      if (p.tp) lines.push({ price: p.tp, color: '#16c784', title: 'TP' });
    });
    TC.Chart.setLines(lines);
  };

  /* ================= PANNEAU D'ORDRE ================= */
  UI.order = function () {
    // conserve les saisies quand le panneau est redessiné (changement de levier, de sens…)
    const keep = {};
    ['o-amt', 'o-sl', 'o-tp'].forEach(k => { const el = $('#' + k); if (el && el.value) keep[k] = el.value; });
    if (UI._orderAsset !== UI.sel) { delete keep['o-sl']; delete keep['o-tp']; }
    UI._orderAsset = UI.sel;
    const a = TC.assetById[UI.sel];
    if (UI.mode === 'lev' && !S().expert) UI.mode = 'spot';
    const m = UI.mode;
    let body = '';
    if (m === 'spot') {
      const h = S().holdings[a.id];
      body = `
        <div class="seg seg-2 side" id="o-spotside"><button data-side="buy" class="${UI.spotSide === 'buy' ? 'active buy' : ''}">Acheter</button><button data-side="sell" class="${UI.spotSide === 'sell' ? 'active sell' : ''}">Vendre</button></div>
        ${UI.spotSide === 'buy' ? `
          <label class="fld">Montant à investir<div class="inp"><input id="o-amt" type="number" min="0" step="any" inputmode="decimal" placeholder="0,00"><span>€</span></div></label>
          <div class="quick" data-target="o-amt" data-base="cash"><button data-p="10">10 %</button><button data-p="25">25 %</button><button data-p="50">50 %</button><button data-p="100">Max</button></div>
          <div class="avail">Disponible : <b>${fmt.eur(S().cash)}</b></div>
          <div class="preview" id="o-prev"></div>
          <button class="btn btn-buy btn-xl" id="o-go">Acheter ${esc(a.id)}</button>` : `
          <label class="fld">Quantité à vendre<div class="inp"><input id="o-qty" type="number" min="0" step="any" inputmode="decimal" placeholder="0"><span>${esc(a.id)}</span></div></label>
          <div class="quick" data-target="o-qty" data-base="hold"><button data-p="25">25 %</button><button data-p="50">50 %</button><button data-p="75">75 %</button><button data-p="100">Tout</button></div>
          <div class="avail">Détenu : <b>${h ? fmt.qty(h.qty) + ' ' + esc(a.id) : '0'}</b>${h ? ` · ${fmt.eur(G.holdingValue(a.id))}` : ''}</div>
          <div class="preview" id="o-prev"></div>
          <button class="btn btn-sell btn-xl" id="o-go" ${h ? '' : 'disabled'}>Vendre ${esc(a.id)}</button>`}
        <p class="hint">Vous ne pouvez pas perdre plus que ce que vous mettez. Frais 0,1 %.</p>`;
    } else if (m === 'lev') {
      body = `
        <div class="seg seg-2 side" id="o-levside"><button data-side="long" class="${UI.levSide === 'long' ? 'active buy' : ''}">📈 Long (hausse)</button><button data-side="short" class="${UI.levSide === 'short' ? 'active sell' : ''}">📉 Short (baisse)</button></div>
        <label class="fld">Marge<div class="inp"><input id="o-amt" type="number" min="0" step="any" inputmode="decimal" placeholder="0,00"><span>€</span></div></label>
        <div class="quick" data-target="o-amt" data-base="cash"><button data-p="10">10 %</button><button data-p="25">25 %</button><button data-p="50">50 %</button><button data-p="100">Max</button></div>
        <div class="fld">Levier <b class="levv" id="o-levv">x${UI.lev}</b>
          <input type="range" id="o-lev" min="1" max="100" value="${UI.lev}" class="lev-range">
          <div class="quick lev-quick">${[2, 5, 10, 25, 50, 100].map(l => `<button data-lev="${l}" class="${UI.lev === l ? 'active' : ''}">x${l}</button>`).join('')}</div></div>
        <details class="sltp"><summary>Stop-loss / Take-profit (optionnel)</summary>
          <label class="fld">Stop-loss (prix €)<div class="inp"><input id="o-sl" type="number" step="any" inputmode="decimal"><span>€</span></div></label>
          <label class="fld">Take-profit (prix €)<div class="inp"><input id="o-tp" type="number" step="any" inputmode="decimal"><span>€</span></div></label>
        </details>
        <div class="avail">Disponible : <b>${fmt.eur(S().cash)}</b></div>
        <div class="preview" id="o-prev"></div>
        <button class="btn ${UI.levSide === 'long' ? 'btn-buy' : 'btn-sell'} btn-xl" id="o-go">${UI.levSide === 'long' ? 'Ouvrir Long' : 'Ouvrir Short'} x${UI.lev}</button>
        <p class="hint">⚠️ Le levier multiplie gains <u>et</u> pertes. Si la perte atteint 90 % de la marge, la position est liquidée.</p>`;
    } else {
      const p = D.prices[a.id];
      const closed = p && p.closed;
      body = `
        <div class="bet-q">Dans <b>${UI.betDur >= 60 ? UI.betDur / 60 + ' h' : UI.betDur + ' min'}</b>, ${esc(a.name)} sera…</div>
        <div class="seg seg-4" id="o-betdur">${G.BET_DURATIONS.map(([m, l]) => `<button data-dur="${m}" class="${UI.betDur === m ? 'active' : ''}">${l}</button>`).join('')}</div>
        <label class="fld">Mise<div class="inp"><input id="o-amt" type="number" min="0" step="any" inputmode="decimal" placeholder="0,00"><span>€</span></div></label>
        <div class="quick" data-target="o-amt" data-base="cash"><button data-p="10">10 %</button><button data-p="25">25 %</button><button data-p="50">50 %</button><button data-p="100">Max</button></div>
        <div class="avail">Disponible : <b>${fmt.eur(S().cash)}</b> · Gain si réussi : <b>x${G.BET_PAYOUT}</b> (10 € misés = ${fmt.eur(10 * G.BET_PAYOUT)} récupérés)</div>
        <div class="bet-btns"><button class="btn btn-buy btn-xl" data-bet="up" ${closed ? 'disabled' : ''}>📈 Plus haut</button><button class="btn btn-sell btn-xl" data-bet="down" ${closed ? 'disabled' : ''}>📉 Plus bas</button></div>
        ${closed ? '<p class="hint warn">Marché fermé : les paris rouvriront à la reprise de la cotation.</p>' : ''}
        <div id="o-bets"></div>
        <p class="hint">Le prix réel à l'échéance est comparé au prix d'entrée. Égalité = mise remboursée.</p>`;
    }
    $('#order').innerHTML = `
      <div class="seg ${S().expert ? 'seg-3' : 'seg-2'} modes" id="o-mode">
        <button data-mode="spot" class="${m === 'spot' ? 'active' : ''}">💵 Acheter / Vendre</button>
        <button data-mode="bet" class="${m === 'bet' ? 'active' : ''}">🎲 Parier</button>
        ${S().expert ? `<button data-mode="lev" class="${m === 'lev' ? 'active' : ''}">⚡ Levier</button>` : ''}
      </div>
      <div class="order-asset">${icon(a)} <b>${esc(a.id)}</b> <span id="o-price">${fmt.eur(D.eur(a.id))}</span></div>
      ${body}
      <div id="o-mypos"></div>`;
    for (const k in keep) { const el = $('#' + k); if (el) el.value = keep[k]; }
    if (keep['o-sl'] || keep['o-tp']) { const d = $('.sltp'); if (d) d.open = true; }
    UI.orderLive();
  };

  UI.orderLive = function () {
    const a = TC.assetById[UI.sel]; const p = D.eur(a.id);
    const op = $('#o-price'); if (op) op.textContent = fmt.eur(p);
    const prev = $('#o-prev');
    const amtEl = $('#o-amt'), qtyEl = $('#o-qty');
    if (prev) {
      if (UI.mode === 'spot' && UI.spotSide === 'buy') {
        const v = +(amtEl && amtEl.value) || 0;
        prev.innerHTML = v > 0 && p ? `Vous recevez ≈ <b>${fmt.qty(v * (1 - G.FEE_SPOT) / p)} ${esc(a.id)}</b><br>Frais : ${fmt.eur(v * G.FEE_SPOT)}` : '';
      } else if (UI.mode === 'spot') {
        const q = +(qtyEl && qtyEl.value) || 0; const h = S().holdings[a.id];
        if (q > 0 && p && h) {
          const gross = q * p, net = gross * (1 - G.FEE_SPOT), cost = h.cost * Math.min(q, h.qty) / h.qty, pnl = net - cost;
          prev.innerHTML = `Vous recevez ≈ <b>${fmt.eur(net)}</b><br>Résultat : <b class="${cls(pnl)}">${pnl > 0 ? '+' : ''}${fmt.eur(pnl)}</b>`;
        } else prev.innerHTML = '';
      } else if (UI.mode === 'lev') {
        const v = +(amtEl && amtEl.value) || 0;
        if (v > 0 && p) {
          const fee = v * UI.lev * G.FEE_LEV, m = v - fee, size = m * UI.lev, liq = G.liqPrice(UI.levSide, p, UI.lev);
          const move1 = size * 0.01;
          prev.innerHTML = `Taille de position : <b>${fmt.eur(size)}</b><br>Prix de liquidation : <b class="warn-t">${fmt.eur(liq)}</b> (${fmt.pct((liq - p) / p * 100)})<br>
            Un mouvement de 1 % = <b>${fmt.eur(move1)}</b> · Frais : ${fmt.eur(fee)}`;
        } else prev.innerHTML = '';
      }
    }
    // mes positions sur cet actif
    const mp = $('#o-mypos');
    if (mp) {
      const ps = S().positions.filter(x => x.asset === a.id);
      const h = S().holdings[a.id];
      let html = '';
      if (h) { const v = G.holdingValue(a.id), pnl = v - h.cost; html += `<div class="mypos"><span>Au comptant</span><b>${fmt.qty(h.qty)} ${esc(a.id)}</b><b class="${cls(pnl)}">${pnl > 0 ? '+' : ''}${fmt.eur(pnl)} (${fmt.pct(pnl / h.cost * 100)})</b></div>`; }
      ps.forEach(x => { const pnl = G.posPnl(x); html += `<div class="mypos"><span class="${x.side === 'long' ? 'up' : 'down'}">${x.side === 'long' ? 'Long' : 'Short'} x${x.lev}</span><b>${fmt.eur(x.margin)}</b><b class="${cls(pnl)}">${pnl > 0 ? '+' : ''}${fmt.eur(pnl)} (${fmt.pct(pnl / x.margin * 100)})</b><button class="btn btn-sm" data-close="${x.id}">Clôturer</button></div>`; });
      mp.innerHTML = html ? `<h4>Mes positions ${esc(a.id)}</h4>${html}` : '';
    }
    const ob = $('#o-bets');
    if (ob) {
      const bs = S().bets.filter(b => b.asset === a.id);
      ob.innerHTML = bs.length ? '<h4>Paris en cours</h4>' + bs.map(b => {
        const winning = p != null && ((p > b.start) === (b.dir === 'up')) && p !== b.start;
        return `<div class="betrow ${winning ? 'win' : 'lose'}"><span>${b.dir === 'up' ? '📈' : '📉'} ${fmt.eur(b.stake)}</span><span>entrée ${fmt.eur(b.start)}</span><b>${winning ? 'Gagnant' : 'Perdant'}</b><span class="cd">${fmt.dur(b.end - Date.now())}</span></div>`;
      }).join('') : '';
    }
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
    const LOGL = { buy: '🟢 Achat', sell: '🔴 Vente', open: '⚡ Ouverture', close: '✅ Clôture', liq: '💀 Liquidation', bet: '🎲 Pari', betres: '🎲 Résultat pari', item: '🛍️ Achat', itemsell: '♻️ Revente', rent: '🏠 Loyers', bonus: '🎁 Bonus', send: '📤 Envoi', recv: '📥 Reçu' };
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
    $('#tab-portfolio').innerHTML = `
      <div class="cards">${cards.map(c => `<div class="card"><span>${c[2]}</span><label>${c[0]}</label><b>${c[1]}</b></div>`).join('')}</div>
      <div class="panel"><h3>📈 Évolution de votre patrimoine</h3><div id="nw-chart" class="nw-chart"></div></div>
      <div class="panel"><h3>📦 Actifs au comptant</h3>${rows ? `<div class="tw"><table><thead><tr><th>Actif</th><th>Quantité</th><th>Prix moyen</th><th>Cours</th><th>Valeur</th><th>+/- value</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Aucun actif. Allez dans <b>Marchés</b> pour investir vos premiers euros !</div>'}</div>
      <div class="panel"><h3>⚡ Positions à levier</h3>${prow ? `<div class="tw"><table><thead><tr><th>Actif</th><th>Sens</th><th>Marge</th><th>Entrée</th><th>Cours</th><th>Liquidation</th><th>P&amp;L</th><th></th></tr></thead><tbody>${prow}</tbody></table></div>` : '<div class="empty">Aucune position ouverte.</div>'}</div>
      ${brow ? `<div class="panel"><h3>🎲 Paris en cours</h3><div class="tw"><table><thead><tr><th>Actif</th><th>Sens</th><th>Mise</th><th>Entrée</th><th>Cours</th><th>État</th><th>Fin dans</th></tr></thead><tbody>${brow}</tbody></table></div></div>` : ''}
      <div class="panel"><h3>📜 Historique</h3>${lrow ? `<div class="tw"><table class="log"><tbody>${lrow}</tbody></table></div>` : '<div class="empty">Rien pour l\'instant.</div>'}</div>
      <div class="panel stats-panel"><h3>📊 Statistiques</h3><div class="kv">
        <span>Ordres passés</span><b>${s.stats.trades}</b><span>Meilleur trade</span><b class="up">${fmt.eur(s.stats.bestTrade)}</b>
        <span>Liquidations</span><b>${s.stats.liquidations}</b><span>Paris gagnés / perdus</span><b>${s.stats.betsWon} / ${s.stats.betsLost}</b>
        <span>Frais payés</span><b>${fmt.eur(s.stats.fees)}</b><span>Loyers encaissés</span><b>${fmt.eur(s.stats.rent)}</b>
        <span>Dépensé en boutique</span><b>${fmt.eur(s.stats.spent)}</b><span>Partie commencée le</span><b>${new Date(s.created).toLocaleDateString('fr-FR')}</b></div></div>`;
    G.sampleNW();
    TC.Chart.nw($('#nw-chart'), s.nw.length > 1 ? s.nw : [[Math.floor(s.created / 1000), G.START_CASH], [Math.floor(Date.now() / 1000), nw]]);
  };

  /* ================= BOUTIQUE ================= */
  UI.shopType = 'car';
  UI.shop = function (type) {
    type = type || UI.shopType; UI.shopType = type;
    const T = TC.SHOP_TYPES[type]; const cash = S().cash;
    let items = TC.SHOP.filter(i => i.type === type && (!i.limited || TC.season.noel));
    items = items.slice().sort((x, y) => UI.shopSort === 'asc' ? x.price - y.price : y.price - x.price);
    const ownedCount = id => S().owned.filter(o => o.item === id).length;
    $('#tab-shop').innerHTML = `
      <div class="seg seg-3 shop-tabs" id="shop-tabs">${Object.entries(TC.SHOP_TYPES).map(([k, v]) => `<button data-shop="${k}" class="${k === type ? 'active' : ''}">${v.icon} ${v.label}</button>`).join('')}</div>
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
    $('#tab-collection').innerHTML = `
      ${starIt ? `<div class="hero">${TC.itemVis(starIt, 'hero-vis')}<div class="hero-txt"><small>⭐ Pièce maîtresse</small><h2>${esc(starIt.brand)} ${esc(starIt.model)}</h2><b>${fmt.eur(star.price)}</b></div></div>` : ''}
      <div class="cards">
        <div class="card"><span>🏆</span><label>Objets possédés</label><b>${s.owned.length}</b></div>
        <div class="card"><span>✨</span><label>Prestige</label><b>${fmt.num(G.prestige(), 0)}</b></div>
        <div class="card"><span>💎</span><label>Valeur de revente</label><b>${fmt.eur(G.itemsValue())}</b></div>
        <div class="card"><span>🏠</span><label>Loyers par heure</label><b>${fmt.eur(rph)}</b></div>
      </div>
      ${rph > 0 ? `<div class="panel rentp"><div>🏠 Loyers à encaisser : <b id="rent-pend">${fmt.eur(pend)}</b> <small>(accumulation max ${TC.RENT_MAX_HOURS} h)</small></div><button class="btn btn-gold" id="b-rent" ${pend < 0.01 ? 'disabled' : ''}>Encaisser</button></div>` : ''}
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

  UI.refreshTab = function () {
    if (UI.tab === 'portfolio') UI.portfolio();
    else if (UI.tab === 'shop') UI.shop();
    else if (UI.tab === 'collection') UI.collection();
    else if (UI.tab === 'social' && TC.Social) TC.Social.render();
  };
})();

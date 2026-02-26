/** @param {NS} ns */
export async function main(ns) {
  // ═══════════════════════════════════════════════════════════════
  //  GHOST OF WALL STREET - Elite Stock Trader for BN8
  //  Supports: 4S data, pre-4S forecast estimation, long & short,
  //            market cycle inversion detection, portfolio mgmt
  // ═══════════════════════════════════════════════════════════════
  ns.disableLog("ALL");
  ns.tail();

  // ─── CONFIG ───────────────────────────────────────────────────
  const CONFIG = {
    reserveCash: 0,            // minimum cash to keep on hand
    maxPortfolioPct: 0.34,     // max % of total worth in one stock
    buyThreshold4S: 0.0001,    // min expected return with 4S data
    sellThreshold4S: 0,        // sell when expected return drops below
    buyThresholdEst: 0.0015,   // min expected return without 4S (conservative)
    sellThresholdEst: 0.0005,  // sell threshold without 4S
    forecastBuyLong: 0.575,    // min forecast to go long
    forecastBuyShort: 0.425,   // max forecast to go short
    forecastSellLong: 0.5,     // sell long when forecast drops to
    forecastSellShort: 0.5,    // sell short when forecast rises to
    commission: 100000,        // $100k per transaction
    tickHistoryLen: 80,        // ticks of price history to keep
    longWindow: 76,            // ticks for long-term forecast estimate
    shortWindow: 10,           // ticks for short-term inversion detect
    inversionDelta: 0.15,      // divergence to flag inversion
    autoBuyAccess: true,       // auto-purchase WSE/TIX/4S when affordable
  };

  // ─── STATE ────────────────────────────────────────────────────
  const stocks = {};
  let has4S = false;
  let hasTIX = false;
  let hasShorts = false;
  let tickCount = 0;
  let totalProfit = 0;
  let sessionStart = Date.now();

  // ─── INIT: Attempt to buy access if needed ────────────────────
  function tryBuyAccess() {
    if (!CONFIG.autoBuyAccess) return;
    const cash = ns.getServerMoneyAvailable("home");
    try {
      if (!ns.stock.hasWSEAccount()) {
        if (cash > 200e6 + CONFIG.reserveCash) ns.stock.purchaseWseAccount();
      }
      if (!ns.stock.hasTIXAPIAccess()) {
        if (cash > 5e9 + CONFIG.reserveCash) ns.stock.purchaseTixApi();
      }
      if (!ns.stock.has4SData()) {
        if (cash > 1e9 + CONFIG.reserveCash) ns.stock.purchase4SMarketData();
      }
      if (!ns.stock.has4SDataTIXAPI()) {
        if (cash > 25e9 + CONFIG.reserveCash) ns.stock.purchase4SMarketDataTixApi();
      }
    } catch (e) { /* access functions may not exist yet */ }
  }

  function checkAccess() {
    try {
      hasTIX = ns.stock.hasTIXAPIAccess();
      has4S = ns.stock.has4SDataTIXAPI();
      // Check if shorts are available (BN8.2+ or SF8.2+)
      hasShorts = true; // assume yes; will catch errors on actual short calls
    } catch { hasTIX = false; }
  }

  // ─── STOCK DATA OBJECT ────────────────────────────────────────
  function initStock(sym) {
    return {
      sym,
      priceHistory: [],
      forecast: 0.5,
      volatility: 0.01,
      estForecast: 0.5,        // estimated forecast from price history
      estForecastShort: 0.5,   // short-window estimate
      longShares: 0,
      longAvgPrice: 0,
      shortShares: 0,
      shortAvgPrice: 0,
      maxShares: 0,
      ticksSinceAction: 999,
      inversionFlag: false,
      totalProfit: 0,
    };
  }

  // ─── FORECAST ESTIMATION (pre-4S) ────────────────────────────
  function estimateForecast(stock) {
    const h = stock.priceHistory;
    if (h.length < 3) return 0.5;

    // Long window: count ups / total
    const longLen = Math.min(CONFIG.longWindow, h.length - 1);
    let longUps = 0;
    for (let i = h.length - longLen; i < h.length; i++) {
      if (h[i] > h[i - 1]) longUps++;
    }
    stock.estForecast = longUps / longLen;

    // Short window: recent trend for inversion detection
    const shortLen = Math.min(CONFIG.shortWindow, h.length - 1);
    let shortUps = 0;
    for (let i = h.length - shortLen; i < h.length; i++) {
      if (h[i] > h[i - 1]) shortUps++;
    }
    stock.estForecastShort = shortUps / shortLen;

    // Inversion detection: long says bullish but short says bearish (or vice versa)
    const delta = Math.abs(stock.estForecast - stock.estForecastShort);
    const crossed = (stock.estForecast > 0.5 && stock.estForecastShort < 0.5) ||
                    (stock.estForecast < 0.5 && stock.estForecastShort > 0.5);
    stock.inversionFlag = crossed && delta > CONFIG.inversionDelta;

    return stock.estForecast;
  }

  // ─── EXPECTED RETURN CALCULATION ──────────────────────────────
  function expectedReturn(stock) {
    const f = has4S ? stock.forecast : stock.estForecast;
    const v = has4S ? stock.volatility : estimateVolatility(stock);
    return v * (f - 0.5);
  }

  function estimateVolatility(stock) {
    const h = stock.priceHistory;
    if (h.length < 2) return 0.01;
    const len = Math.min(20, h.length - 1);
    let sum = 0;
    for (let i = h.length - len; i < h.length; i++) {
      sum += Math.abs(h[i] - h[i - 1]) / h[i - 1];
    }
    return sum / len;
  }

  // ─── PORTFOLIO VALUE ──────────────────────────────────────────
  function totalWorth() {
    let worth = ns.getServerMoneyAvailable("home");
    for (const sym of Object.keys(stocks)) {
      const s = stocks[sym];
      if (s.longShares > 0) {
        worth += ns.stock.getSaleGain(sym, s.longShares, "Long");
      }
      if (s.shortShares > 0) {
        worth += ns.stock.getSaleGain(sym, s.shortShares, "Short");
      }
    }
    return worth;
  }

  // ─── TRADING LOGIC ────────────────────────────────────────────
  function sellPhase() {
    const buyThreshold = has4S ? CONFIG.buyThreshold4S : CONFIG.buyThresholdEst;
    const sellThreshold = has4S ? CONFIG.sellThreshold4S : CONFIG.sellThresholdEst;

    for (const sym of Object.keys(stocks)) {
      const s = stocks[sym];
      const f = has4S ? s.forecast : s.estForecast;
      const er = expectedReturn(s);

      // Sell longs if forecast turned bearish or inversion detected
      if (s.longShares > 0) {
        const shouldSell = f < CONFIG.forecastSellLong || er < sellThreshold || s.inversionFlag;
        if (shouldSell) {
          const gain = ns.stock.getSaleGain(sym, s.longShares, "Long");
          const cost = s.longShares * s.longAvgPrice;
          const profit = gain - cost;
          ns.stock.sellStock(sym, s.longShares);
          s.totalProfit += profit;
          totalProfit += profit;
          s.ticksSinceAction = 0;
          ns.print(`SELL LONG ${sym}: ${ns.formatNumber(s.longShares)} shares | P/L: ${ns.formatNumber(profit)}`);
        }
      }

      // Sell shorts if forecast turned bullish or inversion detected
      if (s.shortShares > 0 && hasShorts) {
        const shouldSell = f > CONFIG.forecastSellShort || er > -sellThreshold || s.inversionFlag;
        if (shouldSell) {
          try {
            const gain = ns.stock.getSaleGain(sym, s.shortShares, "Short");
            const cost = s.shortShares * s.shortAvgPrice;
            const profit = gain - cost;
            ns.stock.sellShort(sym, s.shortShares);
            s.totalProfit += profit;
            totalProfit += profit;
            s.ticksSinceAction = 0;
            ns.print(`SELL SHORT ${sym}: ${ns.formatNumber(s.shortShares)} shares | P/L: ${ns.formatNumber(profit)}`);
          } catch { hasShorts = false; }
        }
      }
    }
  }

  function buyPhase() {
    const cash = ns.getServerMoneyAvailable("home") - CONFIG.reserveCash;
    if (cash < 1e6) return; // not enough to bother

    const tw = totalWorth();
    const maxPerStock = tw * CONFIG.maxPortfolioPct;
    const buyThreshold = has4S ? CONFIG.buyThreshold4S : CONFIG.buyThresholdEst;

    // Rank stocks by expected return
    const ranked = Object.values(stocks)
      .map(s => ({
        sym: s.sym,
        er: expectedReturn(s),
        forecast: has4S ? s.forecast : s.estForecast,
        volatility: has4S ? s.volatility : estimateVolatility(s),
        stock: s,
      }))
      .filter(s => Math.abs(s.er) > buyThreshold && !s.stock.inversionFlag)
      .sort((a, b) => Math.abs(b.er) - Math.abs(a.er));

    let availCash = cash;

    for (const r of ranked) {
      if (availCash < 2e6) break;
      const s = r.stock;

      // Determine current position value
      const currentLongVal = s.longShares > 0 ? ns.stock.getSaleGain(s.sym, s.longShares, "Long") : 0;
      const currentShortVal = s.shortShares > 0 ? ns.stock.getSaleGain(s.sym, s.shortShares, "Short") : 0;
      const currentVal = currentLongVal + currentShortVal;
      const budget = Math.min(availCash, maxPerStock - currentVal);
      if (budget < 2e6) continue;

      if (r.forecast > CONFIG.forecastBuyLong) {
        // BUY LONG
        const price = ns.stock.getAskPrice(r.sym);
        const maxAfford = Math.floor((budget - CONFIG.commission) / price);
        const maxAllowed = s.maxShares - s.longShares;
        const shares = Math.min(maxAfford, maxAllowed);
        if (shares > 0) {
          const cost = ns.stock.getPurchaseCost(r.sym, shares, "Long");
          if (cost <= availCash) {
            ns.stock.buyStock(r.sym, shares);
            availCash -= cost;
            s.ticksSinceAction = 0;
            ns.print(`BUY LONG ${r.sym}: ${ns.formatNumber(shares)} shares @ ${ns.formatNumber(price)} | ER: ${r.er.toFixed(5)}`);
          }
        }
      } else if (r.forecast < CONFIG.forecastBuyShort && hasShorts) {
        // BUY SHORT
        try {
          const price = ns.stock.getBidPrice(r.sym);
          const maxAfford = Math.floor((budget - CONFIG.commission) / price);
          const maxAllowed = s.maxShares - s.shortShares;
          const shares = Math.min(maxAfford, maxAllowed);
          if (shares > 0) {
            const cost = ns.stock.getPurchaseCost(r.sym, shares, "Short");
            if (cost <= availCash) {
              ns.stock.buyShort(r.sym, shares);
              availCash -= cost;
              s.ticksSinceAction = 0;
              ns.print(`BUY SHORT ${r.sym}: ${ns.formatNumber(shares)} shares @ ${ns.formatNumber(price)} | ER: ${r.er.toFixed(5)}`);
            }
          }
        } catch { hasShorts = false; }
      }
    }
  }

  // ─── DASHBOARD ────────────────────────────────────────────────
  function printDashboard() {
    const tw = totalWorth();
    const cash = ns.getServerMoneyAvailable("home");
    const invested = tw - cash;
    const elapsed = ((Date.now() - sessionStart) / 60000).toFixed(1);
    const profitPerMin = totalProfit / Math.max(1, (Date.now() - sessionStart) / 60000);

    ns.clearLog();
    ns.print("╔══════════════════════════════════════════════════════════╗");
    ns.print("║        GHOST OF WALL STREET - Stock Trader              ║");
    ns.print("╠══════════════════════════════════════════════════════════╣");
    ns.print(`║ Mode: ${has4S ? "4S DATA" : "ESTIMATED"} | Shorts: ${hasShorts ? "ON" : "OFF"} | Tick: ${tickCount} | ${elapsed}min`);
    ns.print(`║ Net Worth:  ${ns.formatNumber(tw, 2).padStart(12)}`);
    ns.print(`║ Cash:       ${ns.formatNumber(cash, 2).padStart(12)}`);
    ns.print(`║ Invested:   ${ns.formatNumber(invested, 2).padStart(12)}`);
    ns.print(`║ Session P/L:${ns.formatNumber(totalProfit, 2).padStart(12)} (${ns.formatNumber(profitPerMin, 2)}/min)`);
    ns.print("╠════════╦═══════╦═══════╦════════════╦══════════════════╣");
    ns.print("║ Symbol ║ Fcst  ║ Vol   ║ Position   ║ Unrealized P/L   ║");
    ns.print("╠════════╬═══════╬═══════╬════════════╬══════════════════╣");

    const sorted = Object.values(stocks)
      .filter(s => s.longShares > 0 || s.shortShares > 0)
      .sort((a, b) => {
        const aVal = a.longShares > 0
          ? ns.stock.getSaleGain(a.sym, a.longShares, "Long") - a.longShares * a.longAvgPrice
          : ns.stock.getSaleGain(a.sym, a.shortShares, "Short") - a.shortShares * a.shortAvgPrice;
        const bVal = b.longShares > 0
          ? ns.stock.getSaleGain(b.sym, b.longShares, "Long") - b.longShares * b.longAvgPrice
          : ns.stock.getSaleGain(b.sym, b.shortShares, "Short") - b.shortShares * b.shortAvgPrice;
        return bVal - aVal;
      });

    for (const s of sorted) {
      const f = (has4S ? s.forecast : s.estForecast).toFixed(3);
      const v = (has4S ? s.volatility : estimateVolatility(s)).toFixed(3);
      let posStr, pnl;

      if (s.longShares > 0) {
        posStr = `L:${ns.formatNumber(s.longShares, 0)}`;
        pnl = ns.stock.getSaleGain(s.sym, s.longShares, "Long") - s.longShares * s.longAvgPrice;
      } else {
        posStr = `S:${ns.formatNumber(s.shortShares, 0)}`;
        pnl = ns.stock.getSaleGain(s.sym, s.shortShares, "Short") - s.shortShares * s.shortAvgPrice;
      }
      const inv = s.inversionFlag ? "!" : " ";
      const pnlStr = (pnl >= 0 ? "+" : "") + ns.formatNumber(pnl, 1);
      ns.print(`║ ${(s.sym + inv).padEnd(6)} ║ ${f} ║ ${v} ║ ${posStr.padEnd(10)} ║ ${pnlStr.padStart(16)} ║`);
    }

    if (sorted.length === 0) {
      ns.print("║          No open positions - scanning market...         ║");
    }
    ns.print("╚════════╩═══════╩═══════╩════════════╩══════════════════╝");

    // Show top opportunities
    const opps = Object.values(stocks)
      .filter(s => s.longShares === 0 && s.shortShares === 0)
      .map(s => ({
        sym: s.sym,
        er: expectedReturn(s),
        f: has4S ? s.forecast : s.estForecast,
        inv: s.inversionFlag,
      }))
      .filter(s => Math.abs(s.er) > 0.0001 && !s.inv)
      .sort((a, b) => Math.abs(b.er) - Math.abs(a.er))
      .slice(0, 5);

    if (opps.length > 0) {
      ns.print(" Top Opportunities:");
      for (const o of opps) {
        const dir = o.f > 0.5 ? "LONG " : "SHORT";
        ns.print(`   ${dir} ${o.sym.padEnd(5)} | Forecast: ${o.f.toFixed(3)} | ER: ${o.er.toFixed(5)}`);
      }
    }
  }

  // ─── LIQUIDATE (call with --liquidate flag) ───────────────────
  function liquidateAll() {
    ns.print("LIQUIDATING ALL POSITIONS...");
    for (const sym of Object.keys(stocks)) {
      const s = stocks[sym];
      if (s.longShares > 0) ns.stock.sellStock(sym, s.longShares);
      if (s.shortShares > 0) {
        try { ns.stock.sellShort(sym, s.shortShares); } catch {}
      }
    }
    ns.print("All positions liquidated.");
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAIN LOOP
  // ═══════════════════════════════════════════════════════════════

  // Handle --liquidate flag
  if (ns.args.includes("--liquidate")) {
    checkAccess();
    const symbols = ns.stock.getSymbols();
    for (const sym of symbols) {
      stocks[sym] = initStock(sym);
      const [ls, lap, ss, sap] = ns.stock.getPosition(sym);
      stocks[sym].longShares = ls;
      stocks[sym].longAvgPrice = lap;
      stocks[sym].shortShares = ss;
      stocks[sym].shortAvgPrice = sap;
    }
    liquidateAll();
    return;
  }

  // Auto-buy access on startup
  tryBuyAccess();
  checkAccess();

  if (!hasTIX) {
    ns.tprint("ERROR: No TIX API access. Need $5b for TIX API. Run casino or hack to bootstrap.");
    ns.tprint("Will retry every 30s in case you buy access...");
    while (!hasTIX) {
      await ns.sleep(30000);
      tryBuyAccess();
      checkAccess();
    }
  }

  // Initialize stock data
  const symbols = ns.stock.getSymbols();
  for (const sym of symbols) {
    stocks[sym] = initStock(sym);
    stocks[sym].maxShares = ns.stock.getMaxShares(sym);
  }

  ns.print(`Initialized ${symbols.length} stocks. Mode: ${has4S ? "4S" : "Estimated"}. Let's make money.`);

  // Main trading loop
  while (true) {
    // Sync to market tick
    try {
      await ns.stock.nextUpdate();
    } catch {
      await ns.sleep(6000);
    }

    tickCount++;

    // Periodically try to upgrade access
    if (tickCount % 50 === 0) {
      tryBuyAccess();
      checkAccess();
    }

    // Update all stock data
    for (const sym of symbols) {
      const s = stocks[sym];
      const price = ns.stock.getPrice(sym);

      // Price history
      s.priceHistory.push(price);
      if (s.priceHistory.length > CONFIG.tickHistoryLen) {
        s.priceHistory.shift();
      }

      // Position data
      const [ls, lap, ss, sap] = ns.stock.getPosition(sym);
      s.longShares = ls;
      s.longAvgPrice = lap;
      s.shortShares = ss;
      s.shortAvgPrice = sap;

      // 4S data if available
      if (has4S) {
        s.forecast = ns.stock.getForecast(sym);
        s.volatility = ns.stock.getVolatility(sym);
      } else {
        estimateForecast(s);
      }

      s.ticksSinceAction++;
    }

    // Execute trading strategy
    sellPhase();  // always sell first to free up capital
    buyPhase();

    // Dashboard
    printDashboard();
  }
}

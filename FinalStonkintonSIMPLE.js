// Usage: run FinalStonkintonSIMPLE.js [--liquidate] [--theme classic|neon|matrix|ocean|fire]
import { getTheme, makeColors } from "/lib/themes.js";
import { tryBuyAccess, checkAccess } from "/lib/market.js";
import { estimateForecast, estimateVolatility } from "/lib/estimate.js";
import { totalWorth, sparkline } from "/lib/portfolio.js";
import { logTrade, logSnapshot } from "/lib/logging.js";

/** @param {NS} ns */
export async function main(ns) {
  // ╔══════════════════════════════════════════════════════════╗
  // ║  FinalStonkinton SIMPLE - Conservative Turtle Trader    ║
  // ║  Works with or without 4S data. High-confidence only.   ║
  // ║  Keeps $1m reserve, max 80% deployed, 20% per stock.   ║
  // ╚══════════════════════════════════════════════════════════╝
  ns.disableLog("ALL");
  ns.tail();


  // ═══════════════════════════════════════════════════════════
  // SECTION 1: CONFIGURATION
  // ═══════════════════════════════════════════════════════════

  const COMMISSION    = 100_000;
  const RESERVE_CASH  = 1_000_000;
  const MAX_DEPLOY    = 0.80;
  const MAX_PER_STOCK = 0.20;

  const BUY_LONG      = 0.65;
  const BUY_SHORT     = 0.35;
  const SELL_LONG     = 0.52;
  const SELL_SHORT    = 0.48;
  const MIN_ER        = 0.002;

  const HIST_LEN        = 80;
  const LONG_WINDOW     = 76;
  const SHORT_WINDOW    = 10;
  const INVERSION_DELTA = 0.15;

  const { theme, name: THEME } = getTheme(ns);
  const C = makeColors(theme);


  // ═══════════════════════════════════════════════════════════
  // SECTION 2: STATE
  // ═══════════════════════════════════════════════════════════

  let tickCount       = 0;
  let totalProfit     = 0;
  let totalTradeCount = 0;
  const sessionStart  = Date.now();
  let hasShorts       = true;
  let has4S           = false;

  const history      = {};
  const stockData    = {};
  const recentTrades = [];
  const worthHistory = [];


  // ═══════════════════════════════════════════════════════════
  // SECTION 3: EMERGENCY LIQUIDATE
  // ═══════════════════════════════════════════════════════════

  if (ns.args.includes("--liquidate")) {
    for (const sym of ns.stock.getSymbols()) {
      const [ls, , ss] = ns.stock.getPosition(sym);
      if (ls > 0) ns.stock.sellStock(sym, ls);
      if (ss > 0) try { ns.stock.sellShort(sym, ss); } catch { /* shorts unavailable */ }
    }
    ns.tprint("All positions liquidated.");
    return;
  }


  // ═══════════════════════════════════════════════════════════
  // SECTION 4: MARKET ACCESS
  // ═══════════════════════════════════════════════════════════

  while (true) {
    try { if (ns.stock.hasTIXAPIAccess()) break; } catch { /* not available yet */ }
    tryBuyAccess(ns);
    ns.tprint("Waiting for TIX API access...");
    await ns.sleep(30000);
  }

  function check4S() {
    try {
      has4S = ns.stock.has4SDataTIXAPI();
      if (!has4S) {
        tryBuyAccess(ns);
        has4S = ns.stock.has4SDataTIXAPI();
      }
    } catch { has4S = false; }
  }
  check4S();

  const symbols = ns.stock.getSymbols();
  const maxShares = {};
  for (const sym of symbols) {
    maxShares[sym] = ns.stock.getMaxShares(sym);
    history[sym] = [];
    stockData[sym] = { forecast: 0.5, volatility: 0.01, inversionFlag: false };
  }


  // ═══════════════════════════════════════════════════════════
  // SECTION 5: DATA ENGINE
  // ═══════════════════════════════════════════════════════════

  function updateEstimates(sym) {
    const h = history[sym];
    const sd = stockData[sym];

    if (h.length < 3) {
      sd.forecast = 0.5; sd.volatility = 0.01; sd.inversionFlag = false;
      return;
    }

    const est = estimateForecast(h, LONG_WINDOW, SHORT_WINDOW, INVERSION_DELTA);
    sd.forecast      = est.forecast;
    sd.inversionFlag = est.inversionFlag;
    sd.volatility    = estimateVolatility(h);
  }

  function getForecast(sym) {
    return has4S ? ns.stock.getForecast(sym) : stockData[sym].forecast;
  }
  function getVolatility(sym) {
    return has4S ? ns.stock.getVolatility(sym) : stockData[sym].volatility;
  }
  function getInversion(sym) {
    return stockData[sym].inversionFlag;
  }


  // ═══════════════════════════════════════════════════════════
  // SECTION 6: LOGGING
  // ═══════════════════════════════════════════════════════════

  const LOG_FILE  = "/strats/simple-trade-log.txt";
  const DATA_FILE = "/strats/simple-session-data.txt";

  function doLogTrade(trade) {
    const tw = totalWorth(ns);
    logTrade(ns, LOG_FILE, trade,
      ` | Total:${ns.formatNumber(totalProfit)} | Worth:${ns.formatNumber(tw)}`);
  }

  function doLogSession() {
    const tw = totalWorth(ns);
    const elapsed = (Date.now() - sessionStart) / 60000;
    logSnapshot(ns, DATA_FILE, {
      tick: tickCount, timestamp: Date.now(), has4S,
      worth: tw, cash: ns.getServerMoneyAvailable("home"),
      profit: totalProfit,
      profitPerMin: totalProfit / Math.max(1, elapsed),
      totalTrades: totalTradeCount,
    });
  }


  // ═══════════════════════════════════════════════════════════
  // SECTION 7: DASHBOARD
  // ═══════════════════════════════════════════════════════════

  function printDash() {
    const tw       = totalWorth(ns);
    const cash     = ns.getServerMoneyAvailable("home");
    const invested = tw - cash;
    worthHistory.push(tw);
    if (worthHistory.length > 100) worthHistory.shift();

    const startW    = worthHistory[0];
    const ret       = startW > 0 ? (tw - startW) / startW : 0;
    const elapsed   = ((Date.now() - sessionStart) / 60000).toFixed(1);
    const ppm       = totalProfit / Math.max(1, (Date.now() - sessionStart) / 60000);
    const pph       = ppm * 60;
    const pp24      = ppm * 1440;
    const deployPct = tw > 0 ? (invested / tw * 100).toFixed(1) : "0";
    const wins      = recentTrades.filter(t => t.pnl >= 0).length;
    const losses    = recentTrades.filter(t => t.pnl < 0).length;

    ns.clearLog();

    ns.print("╔═══════════════════════════════════════════════════╗");
    ns.print(`║  ${C.bold("FINAL STONKINTON")} ${C.green("[ TURTLE MODE ]")}`);
    ns.print("╠═══════════════════════════════════════════════════╣");

    ns.print(`║ Tick: ${C.cyan(String(tickCount))} | ${elapsed}min | ${has4S ? C.green("4S") : C.dim("EST")} | Shorts: ${hasShorts ? C.green("ON") : C.red("OFF")} | ${C.dim(THEME)}`);

    ns.print(`║ Worth: ${C.bold(ns.formatNumber(tw, 2))}  ${C.pct(ret)}`);
    ns.print(`║ Cash:  ${ns.formatNumber(cash, 2)}  ${C.dim(deployPct + "% deployed")}`);
    ns.print(`║ P/L:   ${C.plcol(totalProfit, ns.formatNumber(totalProfit, 2))}`);
    ns.print(`║  /min: ${C.plcol(ppm, ns.formatNumber(ppm, 2))}  /hr: ${C.plcol(pph, ns.formatNumber(pph, 2))}  /24hr: ${C.plcol(pp24, ns.formatNumber(pp24, 2))}`);

    if (worthHistory.length > 2) {
      const color = worthHistory[worthHistory.length - 1] >= startW ? C.green : C.red;
      ns.print(`║ ${color(sparkline(worthHistory, 40))}`);
    }

    ns.print("╠════════╦═══════╦════════════╦════════════════════╣");
    ns.print("║ Symbol ║ Fcst  ║ Position   ║ P/L        Return ║");
    ns.print("╠════════╬═══════╬════════════╬════════════════════╣");

    const positions = symbols.map(sym => {
      const [ls, lap, ss, sap] = ns.stock.getPosition(sym);
      if (ls === 0 && ss === 0) return null;
      const f   = getForecast(sym);
      const inv = getInversion(sym);
      let pnl, pos, cost;
      if (ls > 0) {
        pnl  = ns.stock.getSaleGain(sym, ls, "Long") - ls * lap;
        cost = ls * lap;
        pos  = `L:${ns.formatNumber(ls, 0)}`;
      } else {
        pnl  = ns.stock.getSaleGain(sym, ss, "Short") - ss * sap;
        cost = ss * sap;
        pos  = `S:${ns.formatNumber(ss, 0)}`;
      }
      return { sym, f, pos, pnl, ret: cost > 0 ? pnl / cost : 0, inv };
    }).filter(Boolean).sort((x, y) => y.pnl - x.pnl);

    for (const p of positions) {
      const invMark = p.inv ? C.red("!") : " ";
      const pnlStr  = C.plcol(p.pnl, ((p.pnl >= 0 ? "+" : "") + ns.formatNumber(p.pnl, 0)).padStart(10));
      ns.print(`║ ${(p.sym + invMark).padEnd(6)} ║ ${p.f.toFixed(3)} ║ ${p.pos.padEnd(10)} ║ ${pnlStr} ${C.pct(p.ret)} ║`);
    }

    if (positions.length === 0) {
      const msg = !has4S && tickCount < 10
        ? "Building price history..."
        : "Waiting for strong signals...";
      ns.print(`║ ${C.cyan("   " + msg)}                  ║`);
    }
    ns.print("╚════════╩═══════╩════════════╩════════════════════╝");

    if (recentTrades.length > 0) {
      const ratio = wins + losses > 0 ? (wins / (wins + losses) * 100).toFixed(0) + "%" : "n/a";
      ns.print(C.dim(` Recent (W:${C.green(String(wins))} L:${C.red(String(losses))} | ${ratio} | Total: ${totalTradeCount}):`));
      for (const t of [...recentTrades].reverse()) {
        const pnlStr = C.plcol(t.pnl, ((t.pnl >= 0 ? "+" : "") + ns.formatNumber(t.pnl, 1)));
        ns.print(`   ${t.type} ${t.sym.padEnd(5)} ${pnlStr}  ${C.dim("tick " + t.tick)}`);
      }
    }
  }


  // ═══════════════════════════════════════════════════════════
  // SECTION 8: MAIN TRADING LOOP
  // ═══════════════════════════════════════════════════════════

  ns.write(LOG_FILE, `\n=== Session ${new Date().toISOString()} | TURTLE MODE ===\n`, "a");

  while (true) {
    try { await ns.stock.nextUpdate(); } catch { await ns.sleep(6000); }
    tickCount++;

    if (!has4S && tickCount % 50 === 0) check4S();

    for (const sym of symbols) {
      history[sym].push(ns.stock.getPrice(sym));
      if (history[sym].length > HIST_LEN) history[sym].shift();
      updateEstimates(sym);
    }

    if (!has4S && tickCount < 10) { printDash(); continue; }

    const tw             = totalWorth(ns);
    const perStockBudget = tw * MAX_PER_STOCK;
    const tradesBefore   = totalTradeCount;

    // ── SELL ──
    for (const sym of symbols) {
      const [ls, lap, ss, sap] = ns.stock.getPosition(sym);
      const f   = getForecast(sym);
      const inv = getInversion(sym);

      if (ls > 0 && (f < SELL_LONG || inv)) {
        const pnl = ns.stock.getSaleGain(sym, ls, "Long") - ls * lap;
        totalProfit += pnl;
        ns.stock.sellStock(sym, ls);
        recentTrades.push({ sym, type: "L", pnl, tick: tickCount });
        if (recentTrades.length > 5) recentTrades.shift();
        totalTradeCount++;
      }

      if (ss > 0 && hasShorts && (f > SELL_SHORT || inv)) {
        try {
          const pnl = ns.stock.getSaleGain(sym, ss, "Short") - ss * sap;
          totalProfit += pnl;
          ns.stock.sellShort(sym, ss);
          recentTrades.push({ sym, type: "S", pnl, tick: tickCount });
          if (recentTrades.length > 5) recentTrades.shift();
          totalTradeCount++;
        } catch { hasShorts = false; }
      }
    }

    // ── BUY ──
    const cash     = ns.getServerMoneyAvailable("home") - RESERVE_CASH;
    const invested = tw - ns.getServerMoneyAvailable("home");
    const canSpend = Math.min(cash, tw * MAX_DEPLOY - invested);

    if (canSpend > 2e6) {
      const ranked = symbols.map(sym => {
        const f = getForecast(sym);
        const v = getVolatility(sym);
        return { sym, f, er: v * (f - 0.5), inv: getInversion(sym) };
      })
      .filter(item => Math.abs(item.er) > MIN_ER && !item.inv)
      .sort((x, y) => Math.abs(y.er) - Math.abs(x.er));

      let avail = canSpend;

      for (const { sym, f } of ranked) {
        if (avail < 2e6) break;

        const [ls, , ss] = ns.stock.getPosition(sym);
        const curVal = ls > 0
          ? ns.stock.getSaleGain(sym, ls, "Long")
          : (ss > 0 ? ns.stock.getSaleGain(sym, ss, "Short") : 0);
        const spend = Math.min(avail, perStockBudget - curVal);
        if (spend < 2e6) continue;

        if (f > BUY_LONG) {
          const price  = ns.stock.getAskPrice(sym);
          const shares = Math.min(Math.floor((spend - COMMISSION) / price), maxShares[sym] - ls);
          if (shares > 0) {
            const cost = ns.stock.getPurchaseCost(sym, shares, "Long");
            if (cost <= avail) { ns.stock.buyStock(sym, shares); avail -= cost; }
          }
        }
        else if (f < BUY_SHORT && hasShorts) {
          try {
            const price  = ns.stock.getBidPrice(sym);
            const shares = Math.min(Math.floor((spend - COMMISSION) / price), maxShares[sym] - ss);
            if (shares > 0) {
              const cost = ns.stock.getPurchaseCost(sym, shares, "Short");
              if (cost <= avail) { ns.stock.buyShort(sym, shares); avail -= cost; }
            }
          } catch { hasShorts = false; }
        }
      }
    }

    // ── Logging ──
    const newTrades = totalTradeCount - tradesBefore;
    if (newTrades > 0) {
      for (let i = recentTrades.length - newTrades; i < recentTrades.length; i++) {
        if (i >= 0) doLogTrade(recentTrades[i]);
      }
    }
    if (tickCount % 100 === 0) doLogSession();

    printDash();
  }
}

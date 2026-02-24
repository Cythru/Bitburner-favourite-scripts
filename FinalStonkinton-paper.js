// Usage: run FinalStonkinton-paper.js
/** @param {NS} ns */
export async function main(ns) {
  // Paper Trading Lab - Simulates multiple strategies on live market data
  // Runs alongside the real trader using read-only API calls only
  // Graduates winning strategies to /strats/proven.txt
  ns.disableLog("ALL");
  ns.tail();

  const COMMISSION = 100000;
  const GRADUATE_TICKS = 200;
  // +2% above raw 55% to compensate for bid/ask spread optimism in virtual P/L.
  // Virtual sells use getBidPrice directly; real trades use getSaleGain() which
  // accounts for the spread. Paper results are slightly better than real results.
  const GRADUATE_WIN_RATE = 0.57;
  const TICK_HISTORY = 80;

  // Strategy variants to test in parallel
  const STRATEGIES = [
    {
      name: "Aggressive",
      forecastBuyLong: 0.55, forecastBuyShort: 0.45,
      forecastSellLong: 0.50, forecastSellShort: 0.50,
      buyThreshold: 0.00005, maxPct: 0.40,
      shortWindow: 10,
    },
    {
      name: "Moderate",
      forecastBuyLong: 0.575, forecastBuyShort: 0.425,
      forecastSellLong: 0.50, forecastSellShort: 0.50,
      buyThreshold: 0.0001, maxPct: 0.34,
      shortWindow: 10,
    },
    {
      name: "Conservative",
      forecastBuyLong: 0.60, forecastBuyShort: 0.40,
      forecastSellLong: 0.51, forecastSellShort: 0.49,
      buyThreshold: 0.001, maxPct: 0.25,
      shortWindow: 10,
    },
    {
      name: "Turtle",
      forecastBuyLong: 0.65, forecastBuyShort: 0.35,
      forecastSellLong: 0.52, forecastSellShort: 0.48,
      buyThreshold: 0.002, maxPct: 0.20,
      shortWindow: 10,
    },
    {
      name: "Sniper",
      forecastBuyLong: 0.70, forecastBuyShort: 0.30,
      forecastSellLong: 0.55, forecastSellShort: 0.45,
      buyThreshold: 0.003, maxPct: 0.15,
      shortWindow: 10,
    },
    {
      name: "Momentum",
      forecastBuyLong: 0.55, forecastBuyShort: 0.45,
      forecastSellLong: 0.50, forecastSellShort: 0.50,
      buyThreshold: 0.0001, maxPct: 0.34,
      shortWindow: 5,
    },
  ];

  // Shared market state
  let has4S = false;
  let hasShorts = true;
  let tickCount = 0;
  const priceHistory = {};  // sym -> number[]
  const marketData = {};    // sym -> { forecast, volatility, estForecast, maxShares }

  // Per-strategy virtual portfolio
  function createPortfolio(strat) {
    return {
      strat,
      startingCash: 0,
      cash: 0,
      positions: {},    // sym -> { longShares, longAvgPrice, shortShares, shortAvgPrice }
      trades: [],       // { sym, type, shares, entryPrice, exitPrice, pnl, tick }
      peakValue: 0,
      maxDrawdown: 0,
      returns: [],      // per-tick portfolio value for Sharpe calc
    };
  }

  const portfolios = STRATEGIES.map(s => createPortfolio(s));

  function getPosition(port, sym) {
    if (!port.positions[sym]) {
      port.positions[sym] = { longShares: 0, longAvgPrice: 0, shortShares: 0, shortAvgPrice: 0 };
    }
    return port.positions[sym];
  }

  // Estimate forecast from price history (mirrors main trader logic)
  function estimateForecast(sym, shortWindow) {
    const h = priceHistory[sym];
    if (!h || h.length < 3) return { est: 0.5, estShort: 0.5, inversion: false };
    const longLen = Math.min(76, h.length - 1);
    let longUps = 0;
    for (let i = h.length - longLen; i < h.length; i++) {
      if (h[i] > h[i - 1]) longUps++;
    }
    const est = longUps / longLen;

    const sLen = Math.min(shortWindow, h.length - 1);
    let shortUps = 0;
    for (let i = h.length - sLen; i < h.length; i++) {
      if (h[i] > h[i - 1]) shortUps++;
    }
    const estShort = shortUps / sLen;
    const delta = Math.abs(est - estShort);
    const crossed = (est > 0.5 && estShort < 0.5) || (est < 0.5 && estShort > 0.5);
    return { est, estShort, inversion: crossed && delta > 0.15 };
  }

  function estimateVolatility(sym) {
    const h = priceHistory[sym];
    if (!h || h.length < 2) return 0.01;
    const len = Math.min(20, h.length - 1);
    let sum = 0;
    for (let i = h.length - len; i < h.length; i++) {
      sum += Math.abs(h[i] - h[i - 1]) / h[i - 1];
    }
    return sum / len;
  }

  function expectedReturn(sym, forecast) {
    const v = has4S ? marketData[sym].volatility : estimateVolatility(sym);
    return v * (forecast - 0.5);
  }

  // Virtual portfolio value
  function portfolioValue(port) {
    let val = port.cash;
    for (const sym of Object.keys(port.positions)) {
      const p = port.positions[sym];
      const bid = ns.stock.getBidPrice(sym);
      const ask = ns.stock.getAskPrice(sym);
      if (p.longShares > 0) val += p.longShares * bid - COMMISSION;
      if (p.shortShares > 0) val += p.shortShares * (2 * p.shortAvgPrice - ask) - COMMISSION;
    }
    return val;
  }

  // Virtual sell
  function virtualSell(port, sym, type) {
    const p = getPosition(port, sym);
    if (type === "Long" && p.longShares > 0) {
      const exitPrice = ns.stock.getBidPrice(sym);
      const pnl = p.longShares * (exitPrice - p.longAvgPrice) - COMMISSION;
      port.trades.push({ sym, type: "Long", shares: p.longShares, entryPrice: p.longAvgPrice, exitPrice, pnl, tick: tickCount });
      port.cash += p.longShares * exitPrice - COMMISSION;
      p.longShares = 0;
      p.longAvgPrice = 0;
    }
    if (type === "Short" && p.shortShares > 0) {
      const exitPrice = ns.stock.getAskPrice(sym);
      const pnl = p.shortShares * (p.shortAvgPrice - exitPrice) - COMMISSION;
      port.trades.push({ sym, type: "Short", shares: p.shortShares, entryPrice: p.shortAvgPrice, exitPrice, pnl, tick: tickCount });
      port.cash += p.shortShares * (2 * p.shortAvgPrice - exitPrice) - COMMISSION;
      p.shortShares = 0;
      p.shortAvgPrice = 0;
    }
  }

  // Virtual buy
  function virtualBuy(port, sym, type, budget) {
    const p = getPosition(port, sym);
    if (type === "Long") {
      const price = ns.stock.getAskPrice(sym);
      const shares = Math.min(
        Math.floor((budget - COMMISSION) / price),
        marketData[sym].maxShares - p.longShares
      );
      if (shares > 0) {
        const cost = shares * price + COMMISSION;
        if (cost <= port.cash) {
          const totalShares = p.longShares + shares;
          p.longAvgPrice = (p.longAvgPrice * p.longShares + price * shares) / totalShares;
          p.longShares = totalShares;
          port.cash -= cost;
        }
      }
    } else if (type === "Short") {
      const price = ns.stock.getBidPrice(sym);
      const shares = Math.min(
        Math.floor((budget - COMMISSION) / price),
        marketData[sym].maxShares - p.shortShares
      );
      if (shares > 0) {
        const cost = shares * price + COMMISSION;
        if (cost <= port.cash) {
          const totalShares = p.shortShares + shares;
          p.shortAvgPrice = (p.shortAvgPrice * p.shortShares + price * shares) / totalShares;
          p.shortShares = totalShares;
          port.cash -= cost;
        }
      }
    }
  }

  // Run one tick of a strategy's trading logic
  function runStrategy(port) {
    const strat = port.strat;
    const syms = Object.keys(marketData);

    // Sell phase
    for (const sym of syms) {
      const p = getPosition(port, sym);
      const fcData = has4S
        ? { f: marketData[sym].forecast, inv: false }
        : estimateForecast(sym, strat.shortWindow);
      const f = has4S ? fcData.f : fcData.est;
      const inv = has4S ? false : fcData.inversion;
      const er = expectedReturn(sym, f);

      if (p.longShares > 0 && (f < strat.forecastSellLong || er < 0 || inv)) {
        virtualSell(port, sym, "Long");
      }
      if (p.shortShares > 0 && (f > strat.forecastSellShort || er > 0 || inv)) {
        virtualSell(port, sym, "Short");
      }
    }

    // Buy phase
    if (port.cash < 2e6) return;
    const tw = portfolioValue(port);
    const maxPerStock = tw * strat.maxPct;

    const ranked = syms.map(sym => {
      const fcData = has4S
        ? { f: marketData[sym].forecast, inv: false }
        : estimateForecast(sym, strat.shortWindow);
      const f = has4S ? fcData.f : fcData.est;
      const inv = has4S ? false : fcData.inversion;
      return { sym, f, er: expectedReturn(sym, f), inv };
    })
    .filter(r => Math.abs(r.er) > strat.buyThreshold && !r.inv)
    .sort((x, y) => Math.abs(y.er) - Math.abs(x.er));

    for (const r of ranked) {
      if (port.cash < 2e6) break;
      const p = getPosition(port, r.sym);
      const currentVal = p.longShares * ns.stock.getBidPrice(r.sym) + p.shortShares * ns.stock.getAskPrice(r.sym);
      const budget = Math.min(port.cash, maxPerStock - currentVal);
      if (budget < 2e6) continue;

      if (r.f > strat.forecastBuyLong) {
        virtualBuy(port, r.sym, "Long", budget);
      } else if (r.f < strat.forecastBuyShort && hasShorts) {
        virtualBuy(port, r.sym, "Short", budget);
      }
    }
  }

  // Scoring
  function scorePortfolio(port) {
    const val = portfolioValue(port);
    const pnl = val - port.startingCash;
    const wins = port.trades.filter(t => t.pnl > 0).length;
    const total = port.trades.length;
    const winRate = total > 0 ? wins / total : 0;

    // Sharpe-like: mean return / stddev of returns
    let sharpe = 0;
    if (port.returns.length > 2) {
      const diffs = [];
      for (let i = 1; i < port.returns.length; i++) {
        diffs.push((port.returns[i] - port.returns[i - 1]) / port.returns[i - 1]);
      }
      const mean = diffs.reduce((acc, val) => acc + val, 0) / diffs.length;
      const variance = diffs.reduce((acc, val) => acc + (val - mean) ** 2, 0) / diffs.length;
      const std = Math.sqrt(variance);
      sharpe = std > 0 ? mean / std : 0;
    }

    return { pnl, winRate, wins, total, maxDrawdown: port.maxDrawdown, sharpe, value: val };
  }

  // Graduate winning strategies to /strats/proven.txt
  async function checkGraduation() {
    const proven = [];
    for (const port of portfolios) {
      const score = scorePortfolio(port);
      if (tickCount >= GRADUATE_TICKS && score.pnl > 0 && score.winRate >= GRADUATE_WIN_RATE) {
        proven.push({
          name: port.strat.name,
          params: {
            forecastBuyLong: port.strat.forecastBuyLong,
            forecastBuyShort: port.strat.forecastBuyShort,
            forecastSellLong: port.strat.forecastSellLong,
            forecastSellShort: port.strat.forecastSellShort,
            buyThreshold: port.strat.buyThreshold,
            maxPortfolioPct: port.strat.maxPct,
          },
          score: {
            pnl: score.pnl,
            winRate: score.winRate,
            trades: score.total,
            maxDrawdown: score.maxDrawdown,
            sharpe: score.sharpe,
          },
          ticksTested: tickCount,
          graduatedAt: Date.now(),
        });
      }
    }
    if (proven.length > 0) {
      await ns.write("/strats/proven.txt", JSON.stringify(proven, null, 2), "w");
    }
  }

  // Dashboard
  function printDashboard() {
    ns.clearLog();
    ns.print("╔══════════════════════════════════════════════════════════════════╗");
    ns.print("║              PAPER TRADING LAB - Strategy Tester                ║");
    ns.print("║              No real money at risk - read-only mode             ║");
    ns.print("╠══════════════════════════════════════════════════════════════════╣");
    ns.print(`║ Tick: ${tickCount} / ${GRADUATE_TICKS} to graduate | Mode: ${has4S ? "4S DATA" : "ESTIMATED"} | Shorts: ${hasShorts ? "ON" : "OFF"}`);
    ns.print("╠════════════════╦═════════════╦════════╦═════════╦══════╦═══════╣");
    ns.print("║ Strategy       ║ P/L         ║ Win %  ║ Trades  ║ DD   ║ Sharp ║");
    ns.print("╠════════════════╬═════════════╬════════╬═════════╬══════╬═══════╣");

    const scoredPorts = portfolios.map(port => ({ port, score: scorePortfolio(port) }));
    scoredPorts.sort((x, y) => y.score.pnl - x.score.pnl);

    for (const { port, score } of scoredPorts) {
      const name = port.strat.name.padEnd(14);
      const pnl = ns.formatNumber(score.pnl, 1).padStart(11);
      const wr = (score.total > 0 ? (score.winRate * 100).toFixed(1) + "%" : "  n/a").padStart(6);
      const trades = String(score.total).padStart(7);
      const dd = ns.formatNumber(score.maxDrawdown, 0).padStart(4);
      const sh = score.sharpe.toFixed(2).padStart(5);
      const graduated = (tickCount >= GRADUATE_TICKS && score.pnl > 0 && score.winRate >= GRADUATE_WIN_RATE) ? "*" : " ";
      ns.print(`║ ${name}${graduated}║ ${pnl} ║ ${wr} ║ ${trades} ║ ${dd} ║ ${sh} ║`);
    }

    ns.print("╚════════════════╩═════════════╩════════╩═════════╩══════╩═══════╝");
    if (tickCount >= GRADUATE_TICKS) {
      const grads = scoredPorts.filter(s => s.score.pnl > 0 && s.score.winRate >= GRADUATE_WIN_RATE);
      if (grads.length > 0) {
        ns.print(` * = Graduated to /strats/proven.txt (${grads.length} strategies)`);
      } else {
        ns.print(` No strategies met graduation criteria yet (need +P/L and >${GRADUATE_WIN_RATE * 100}% win rate)`);
      }
    } else {
      ns.print(` Collecting data... ${GRADUATE_TICKS - tickCount} ticks until graduation check`);
    }

    // Show top 3 virtual positions across all portfolios
    ns.print("");
    ns.print(" Active Virtual Positions (best strategy):");
    if (scoredPorts.length > 0) {
      const best = scoredPorts[0].port;
      const active = Object.entries(best.positions)
        .filter(([, p]) => p.longShares > 0 || p.shortShares > 0)
        .map(([sym, p]) => {
          if (p.longShares > 0) {
            const pnl = p.longShares * (ns.stock.getBidPrice(sym) - p.longAvgPrice);
            return { sym, dir: "L", shares: p.longShares, pnl };
          }
          const pnl = p.shortShares * (p.shortAvgPrice - ns.stock.getAskPrice(sym));
          return { sym, dir: "S", shares: p.shortShares, pnl };
        })
        .sort((x, y) => y.pnl - x.pnl)
        .slice(0, 5);

      for (const pos of active) {
        const pnlStr = (pos.pnl >= 0 ? "+" : "") + ns.formatNumber(pos.pnl, 1);
        ns.print(`   ${pos.dir} ${pos.sym.padEnd(5)} ${ns.formatNumber(pos.shares, 0).padStart(8)} shares  ${pnlStr}`);
      }
      if (active.length === 0) ns.print("   (none yet - waiting for signals)");
    }
  }

  // ═══ INIT ═══
  let hasTIX = false;
  try { hasTIX = ns.stock.hasTIXAPIAccess(); } catch { /* TIX not available */ }
  if (!hasTIX) {
    ns.tprint("ERROR: Paper trader needs TIX API access to read market data.");
    return;
  }
  try {
    has4S = ns.stock.has4SDataTIXAPI();
  } catch { has4S = false; }

  const symbols = ns.stock.getSymbols();
  for (const sym of symbols) {
    priceHistory[sym] = [];
    marketData[sym] = { forecast: 0.5, volatility: 0.01, estForecast: 0.5, maxShares: ns.stock.getMaxShares(sym) };
  }

  // Set starting cash for all portfolios to current player cash
  const startCash = ns.getServerMoneyAvailable("home");
  for (const port of portfolios) {
    port.cash = startCash;
    port.startingCash = startCash;
    port.peakValue = startCash;
  }

  ns.print(`Paper Trading Lab initialized: ${symbols.length} stocks, ${STRATEGIES.length} strategies`);
  ns.print(`Starting virtual cash: ${ns.formatNumber(startCash)} per strategy`);

  // ═══ MAIN LOOP ═══
  while (true) {
    try {
      await ns.stock.nextUpdate();
    } catch {
      await ns.sleep(6000);
    }
    tickCount++;

    // Update shared market data
    for (const sym of symbols) {
      const price = ns.stock.getPrice(sym);
      priceHistory[sym].push(price);
      if (priceHistory[sym].length > TICK_HISTORY) priceHistory[sym].shift();

      if (has4S) {
        marketData[sym].forecast = ns.stock.getForecast(sym);
        marketData[sym].volatility = ns.stock.getVolatility(sym);
      }
    }

    // Run each strategy
    for (const port of portfolios) {
      runStrategy(port);

      // Track portfolio value for drawdown and Sharpe
      const val = portfolioValue(port);
      port.returns.push(val);
      if (val > port.peakValue) port.peakValue = val;
      const dd = val - port.peakValue;
      if (dd < port.maxDrawdown) port.maxDrawdown = dd;
    }

    // Graduate check every 50 ticks after minimum
    if (tickCount >= GRADUATE_TICKS && tickCount % 50 === 0) {
      await checkGraduation();
    }

    printDashboard();
  }
}

// Usage: run FinalStonkinton.js [--turtle] [--yolo] [--liquidate] [--theme classic|neon|matrix|ocean|fire]
//
// All lib functions are inlined below — no external /lib/ files required.
// Built-in fallbacks are kept as-is for reference but are no longer used by the main path.
//
//   --turtle    conservative mode (high-confidence trades only)
//   --yolo      single-bet gambling mode (10% per bet, 24min loss cooldown)
//   --liquidate emergency sell-all and exit
//   --theme     visual palette: classic | neon | matrix | ocean | fire
//
// Paper trading runs silently in the background during the normal trading loop.
// A compact paper leaderboard is shown at the bottom of the dashboard.

// ── Built-in fallbacks (kept as-is; not used when inlined libs are present) ──
function _fbGetTheme(ns) { const i = ns.args.indexOf("--theme"); return { theme: null, name: i >= 0 ? String(ns.args[i+1]||"classic") : "classic" }; }
function _fbMakeColors() { const id = s => String(s); return { green:id,red:id,cyan:id,yellow:id,mag:id,dim:id,bold:id, pct:v=>(v>=0?"+":"")+(v*100).toFixed(1)+"%", plcol:(_,s)=>String(s) }; }
function _fbTryBuyAccess(ns) { const m=ns.getServerMoneyAvailable("home"); try{if(m>200e6)ns.stock.purchaseWseAccount();}catch{} try{if(m>5e9)ns.stock.purchaseTixApi();}catch{} try{if(m>1e9)ns.stock.purchase4SMarketData();}catch{} try{if(m>25e9)ns.stock.purchase4SMarketDataTixApi();}catch{} }
function _fbCheckAccess(ns) { let t=false,s=false; try{t=ns.stock.hasTIXAPIAccess();}catch{} try{s=ns.stock.has4SDataTIXAPI();}catch{} return{hasTIX:t,has4S:s}; }
async function _fbWaitForTIX(ns) { while(true){_fbTryBuyAccess(ns);try{if(ns.stock.hasTIXAPIAccess())return _fbCheckAccess(ns);}catch{} ns.tprint("Waiting for TIX API...");await ns.sleep(30000);} }
function _fbEstFc(h,lW,sW,iD){const n=h.length;if(n<3)return{forecast:0.5,forecastShort:0.5,inversionFlag:false};const lL=Math.min(lW,n-1),sL=Math.min(sW,n-1),lS=n-lL,sS=n-sL;let lU=0,sU=0;for(let i=lS;i<n;i++){if(h[i]>h[i-1]){lU++;if(i>=sS)sU++;}}const f=lU/lL,fs=sU/sL,x=(f>0.5)!==(fs>0.5);return{forecast:f,forecastShort:fs,inversionFlag:x&&Math.abs(f-fs)>iD};}
function _fbEstVol(h){const n=h.length;if(n<2)return 0.01;const w=Math.min(20,n-1),s=n-w;let sum=0;for(let i=s;i<n;i++)sum+=Math.abs(h[i]-h[i-1])/h[i-1];return sum/w;}
function _fbTotalWorth(ns){let w=ns.getServerMoneyAvailable("home");try{for(const s of ns.stock.getSymbols()){const[l,,sh]=ns.stock.getPosition(s);if(l>0)w+=ns.stock.getSaleGain(s,l,"Long");if(sh>0)w+=ns.stock.getSaleGain(s,sh,"Short");}}catch{}return w;}
function _fbSparkline(data,width=40){if(data.length<2)return"─".repeat(width);let mn=data[0],mx=data[0];for(const v of data){if(v<mn)mn=v;if(v>mx)mx=v;}const r=mx-mn||1,B="▁▂▃▄▅▆▇█";let o="";for(let i=0;i<width;i++){const idx=Math.min(data.length-1,Math.floor(i*(data.length-1)/Math.max(1,width-1)));o+=B[Math.min(7,Math.floor((data[idx]-mn)/r*8))];}return o;}
function _fbLogTrade(ns,f,t,x=""){ns.write(f,`[T${t.tick}] ${t.type} ${t.sym} P/L:${t.pnl>=0?"+":""}${Math.round(t.pnl)}${x}\n`,"a");}
function _fbLogSnap(ns,f,d){ns.write(f,JSON.stringify(d)+"\n","a");}

// ── Inlined: lib/themes.js ──
// ANSI color code map per theme.
const _themes = {
  classic: { pos: "32",   neg: "31",   acc: "36",   hl: "35",   warn: "33"   },
  neon:    { pos: "95",   neg: "93",   acc: "96",   hl: "92",   warn: "91"   },
  matrix:  { pos: "1;92", neg: "2;32", acc: "32",   hl: "92",   warn: "1;33" },
  ocean:   { pos: "96",   neg: "91",   acc: "94",   hl: "97",   warn: "93"   },
  fire:    { pos: "1;33", neg: "31",   acc: "91",   hl: "93",   warn: "35"   },
};

function getTheme(ns) {
  const idx = ns.args.indexOf("--theme");
  const name = idx >= 0 && ns.args[idx + 1]
    ? String(ns.args[idx + 1]).toLowerCase()
    : "classic";
  const matched = _themes[name];
  return { theme: matched || _themes.classic, name: matched ? name : "classic" };
}

function makeColors(th) {
  const posPrefix  = `\x1b[${th.pos}m`;
  const negPrefix  = `\x1b[${th.neg}m`;
  const accPrefix  = `\x1b[${th.acc}m`;
  const hlPrefix   = `\x1b[${th.hl}m`;
  const warnPrefix = `\x1b[${th.warn}m`;
  const reset      = "\x1b[0m";
  return {
    green:  (s) => posPrefix + s + reset,
    red:    (s) => negPrefix + s + reset,
    cyan:   (s) => accPrefix + s + reset,
    mag:    (s) => hlPrefix + s + reset,
    yellow: (s) => warnPrefix + s + reset,
    bold:   (s) => "\x1b[1m" + s + reset,
    dim:    (s) => "\x1b[2m" + s + reset,
    plcol:  (v, s) => (v >= 0 ? posPrefix : negPrefix) + s + reset,
    pct:    (v) => {
      const str = (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
      return (v >= 0 ? posPrefix : negPrefix) + str + reset;
    },
  };
}

// ── Inlined: lib/market.js ──
function tryBuyAccess(ns) {
  const cash = ns.getServerMoneyAvailable("home");
  try {
    if (!ns.stock.hasWSEAccount()   && cash > 200e6)  ns.stock.purchaseWseAccount();
    if (!ns.stock.hasTIXAPIAccess() && cash > 5e9)    ns.stock.purchaseTixApi();
    if (!ns.stock.has4SData()       && cash > 1e9)    ns.stock.purchase4SMarketData();
    if (!ns.stock.has4SDataTIXAPI() && cash > 25e9)   ns.stock.purchase4SMarketDataTixApi();
  } catch {
    // Stock market APIs throw if player hasn't unlocked the stock market yet. Safe to ignore.
  }
}

function checkAccess(ns) {
  try {
    return {
      hasTIX: ns.stock.hasTIXAPIAccess(),
      has4S:  ns.stock.has4SDataTIXAPI(),
    };
  } catch {
    return { hasTIX: false, has4S: false };
  }
}

async function waitForTIX(ns) {
  tryBuyAccess(ns);
  let acc = checkAccess(ns);
  while (!acc.hasTIX) {
    ns.tprint("Waiting for TIX API access...");
    await ns.sleep(30000);
    tryBuyAccess(ns);
    acc = checkAccess(ns);
  }
  return acc;
}

// ── Inlined: lib/estimate.js ──
function estimateForecast(history, longWindow, shortWindow, inversionDelta, volatility) {
  const len = history.length;
  if (len < 3) return { forecast: 0.5, forecastShort: 0.5, forecastMicro: 0.5, inversionFlag: false, inversionEarly: false };

  const longLen  = Math.min(longWindow, len - 1);
  const shortLen = Math.min(shortWindow, len - 1);
  const microLen = Math.min(5, len - 1);

  const longStart  = len - longLen;
  const shortStart = len - shortLen;
  const microStart = len - microLen;

  let longWeightedUps = 0;
  let longWeightTotal = 0;
  for (let i = longStart; i < len; i++) {
    const pos = i - longStart;
    const w   = 1 + (longLen > 1 ? pos / (longLen - 1) : 0);
    longWeightTotal += w;
    if (history[i] > history[i - 1]) longWeightedUps += w;
  }

  let shortUps = 0;
  for (let i = shortStart; i < len; i++) {
    if (history[i] > history[i - 1]) shortUps++;
  }

  let microUps = 0;
  for (let i = microStart; i < len; i++) {
    if (history[i] > history[i - 1]) microUps++;
  }

  const forecast      = longWeightTotal > 0 ? longWeightedUps / longWeightTotal : 0.5;
  const forecastShort = shortUps / shortLen;
  const forecastMicro = microUps / microLen;

  const adaptiveDelta = (volatility != null)
    ? inversionDelta * (1 + Math.min(2, volatility / 0.015))
    : inversionDelta;

  const crossedLongShort = (forecast > 0.5) !== (forecastShort > 0.5);
  const inversionFlag    = crossedLongShort && Math.abs(forecast - forecastShort) > adaptiveDelta;

  const crossedShortMicro = (forecastShort > 0.5) !== (forecastMicro > 0.5);
  const inversionEarly    = crossedLongShort && crossedShortMicro;

  return { forecast, forecastShort, forecastMicro, inversionFlag, inversionEarly };
}

function estimateVolatility(history) {
  const len = history.length;
  if (len < 2) return 0.01;
  const window = Math.min(20, len - 1);
  const start  = len - window;
  const alpha  = 0.25;
  let ewmaVol  = 0;
  for (let i = start; i < len; i++) {
    const pct = Math.abs(history[i] - history[i - 1]) / history[i - 1];
    ewmaVol = alpha * pct + (1 - alpha) * ewmaVol;
  }
  return ewmaVol;
}

function calcMomentum(history) {
  if (history.length < 9) return 0;
  const len   = history.length;
  const start = len - 8;
  let score   = 0;
  for (let i = start; i < len; i++) {
    const weight = 1 + (i - start) * 0.5;
    const mag    = Math.abs(history[i] - history[i - 1]) / history[i - 1];
    const sign   = history[i] > history[i - 1] ? 1 : -1;
    score += mag * weight * sign;
  }
  return score / (0.03 * 22.0);
}

// ── Inlined: lib/portfolio.js ──
function totalWorth(ns) {
  let w = ns.getServerMoneyAvailable("home");
  for (const sym of ns.stock.getSymbols()) {
    const [longShares, , shortShares] = ns.stock.getPosition(sym);
    if (longShares > 0)  w += ns.stock.getSaleGain(sym, longShares, "Long");
    if (shortShares > 0) w += ns.stock.getSaleGain(sym, shortShares, "Short");
  }
  return w;
}

function sparkline(data, width) {
  const len = data.length;
  if (len < 2) return "";
  let min = data[0];
  let max = data[0];
  for (let i = 1; i < len; i++) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const chars = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";
  const step = Math.max(1, Math.floor(len / width));
  let result = "";
  for (let i = 0; i < width; i++) {
    const bucketStart = i * step;
    if (bucketStart >= len) break;
    const bucketEnd = Math.min(bucketStart + step, len);
    let val = data[bucketStart];
    for (let j = bucketStart + 1; j < bucketEnd; j++) {
      if (data[j] > val) val = data[j];
    }
    const idx = Math.min(7, Math.floor(((val - min) / range) * 8));
    result += chars[idx];
  }
  return result;
}

// ── Inlined: lib/logging.js ──
function logTrade(ns, file, trade, extra = "", opts = {}) {
  const { entryPrice, exitPrice, er } = opts;
  let priceInfo = "";
  if (entryPrice != null) priceInfo += `  In:${ns.formatNumber(entryPrice, 2)}`;
  if (exitPrice  != null) priceInfo += ` Out:${ns.formatNumber(exitPrice, 2)}`;
  if (er         != null) priceInfo += ` ER:${(er >= 0 ? "+" : "") + er.toFixed(4)}`;
  const entry = `[T${trade.tick}] ${trade.type} ${trade.sym} ` +
    `P/L:${ns.formatNumber(trade.pnl)}${extra}${priceInfo}\n`;
  ns.write(file, entry, "a");
}

function logSnapshot(ns, file, data) {
  ns.write(file, JSON.stringify(data) + "\n", "a");
}


// ════════════════════════════════════════════════════════════════
// PAPER MODE — runPaperMode(ns)
// Extracted from FinalStonkinton-paper.js.
// Run with: run FinalStonkinton.js --paper
// Simulates 6 strategies on live market data with no real trades.
// Graduates winning strategies (>57% win rate) to /strats/proven.txt
// ════════════════════════════════════════════════════════════════

async function runPaperMode(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  const { theme, name: THEME } = getTheme(ns);
  const C = makeColors(theme);

  const COMMISSION = 100000;
  const GRADUATE_TICKS = 300;  // more cycles = better statistical confidence
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
  function paperEstimateForecast(sym, shortWindow) {
    const h = priceHistory[sym];
    if (!h || h.length < 3) return { est: 0.5, estShort: 0.5, inversion: false };
    const longLen = Math.min(76, h.length - 1);

    // Weighted long-window forecast: matches lib/estimate.js (1.0 -> 2.0 weighting).
    // Critical: paper trader must use the same algorithm as the real trader or
    // graduation win rates are computed against a different signal — paper results
    // won't transfer to live trading.
    let longWeightedUps = 0, longWeightTotal = 0;
    for (let i = h.length - longLen; i < h.length; i++) {
      const pos = i - (h.length - longLen);
      const w   = 1 + (longLen > 1 ? pos / (longLen - 1) : 0);
      longWeightTotal += w;
      if (h[i] > h[i - 1]) longWeightedUps += w;
    }
    const est = longWeightTotal > 0 ? longWeightedUps / longWeightTotal : 0.5;

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

  function paperEstimateVolatility(sym) {
    const h = priceHistory[sym];
    if (!h || h.length < 2) return 0.01;
    const len = Math.min(20, h.length - 1);
    let sum = 0;
    for (let i = h.length - len; i < h.length; i++) {
      sum += Math.abs(h[i] - h[i - 1]) / h[i - 1];
    }
    return sum / len;
  }

  function paperExpectedReturn(sym, forecast) {
    const v = has4S ? marketData[sym].volatility : paperEstimateVolatility(sym);
    return v * (forecast - 0.5);
  }

  // Virtual portfolio value
  function portfolioValue(port) {
    let val = port.cash;
    for (const sym of Object.keys(port.positions)) {
      const p = port.positions[sym];
      const bid = ns.stock.getBidPrice(sym);
      const ask = ns.stock.getAskPrice(sym);
      // No commission deducted here — commission is only charged at sell time,
      // not for holding. Subtracting it here double-counts it against every tick's value.
      if (p.longShares > 0) val += p.longShares * bid;
      if (p.shortShares > 0) val += p.shortShares * (2 * p.shortAvgPrice - ask);
    }
    return val;
  }

  // Virtual sell
  // Apply 0.3% spread penalty to match getSaleGain() in the real trader.
  // Raw getBidPrice/getAskPrice is optimistic — the real trader's getSaleGain()
  // accounts for the bid/ask spread. Without this correction, paper results
  // overstate win rates by ~0.5-1%, causing over-graduation.
  function virtualSell(port, sym, type) {
    const p = getPosition(port, sym);
    if (type === "Long" && p.longShares > 0) {
      const exitPrice = ns.stock.getBidPrice(sym) * 0.997;  // simulate spread
      // Both commissions (buy + sell) counted so win/loss is accurate
      const pnl = p.longShares * (exitPrice - p.longAvgPrice) - 2 * COMMISSION;
      port.trades.push({ sym, type: "Long", shares: p.longShares, entryPrice: p.longAvgPrice, exitPrice, pnl, tick: tickCount });
      port.cash += p.longShares * exitPrice - COMMISSION;
      p.longShares = 0;
      p.longAvgPrice = 0;
    }
    if (type === "Short" && p.shortShares > 0) {
      const exitPrice = ns.stock.getAskPrice(sym) * 1.003;  // simulate spread
      // Both commissions (buy + sell) counted so win/loss is accurate
      const pnl = p.shortShares * (p.shortAvgPrice - exitPrice) - 2 * COMMISSION;
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
        : paperEstimateForecast(sym, strat.shortWindow);
      const f = has4S ? fcData.f : fcData.est;
      const inv = has4S ? false : fcData.inversion;
      const er = paperExpectedReturn(sym, f);

      if (p.longShares > 0 && (f < strat.forecastSellLong || er < 0 || inv)) {
        virtualSell(port, sym, "Long");
      }
      if (p.shortShares > 0 && (f > strat.forecastSellShort || er > 0 || inv)) {
        virtualSell(port, sym, "Short");
      }
    }

    // Buy phase — paper money, so minimum is 2× commission not $1m
    if (port.cash < 2e5) return;
    const tw = portfolioValue(port);
    const maxPerStock = tw * strat.maxPct;

    const ranked = syms.map(sym => {
      const fcData = has4S
        ? { f: marketData[sym].forecast, inv: false }
        : paperEstimateForecast(sym, strat.shortWindow);
      const f = has4S ? fcData.f : fcData.est;
      const inv = has4S ? false : fcData.inversion;
      return { sym, f, er: paperExpectedReturn(sym, f), inv };
    })
    .filter(r => Math.abs(r.er) > strat.buyThreshold && !r.inv)
    .sort((x, y) => Math.abs(y.er) - Math.abs(x.er));

    for (const r of ranked) {
      if (port.cash < 2e5) break;
      const p = getPosition(port, r.sym);
      const currentVal = p.longShares * ns.stock.getBidPrice(r.sym) + p.shortShares * ns.stock.getAskPrice(r.sym);
      const budget = Math.min(port.cash, maxPerStock - currentVal);
      if (budget < 2e5) continue;

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
  function printPaperDashboard() {
    ns.clearLog();
    const LINE = "══════════════════════════════════════════════════════════════════";
    ns.print(`╔${LINE}╗`);
    ns.print(`║  ${C.bold("FINAL STONKINTON")}  ${C.cyan("[ PAPER MODE ]")}${" ".repeat(35)}║`);
    ns.print(`║  ${C.dim("Strategy tester — no real money at risk")}${" ".repeat(27)}║`);
    ns.print(`╠${LINE}╣`);
    const modeStr  = has4S ? C.green("4S DATA") : C.yellow("ESTIMATED");
    const shortStr = hasShorts ? C.green("ON") : C.red("OFF");
    const prog     = tickCount >= GRADUATE_TICKS
      ? C.green(`${tickCount} / ${GRADUATE_TICKS} ✓ GRADUATED`)
      : `${C.cyan(String(tickCount))} / ${C.dim(String(GRADUATE_TICKS))}`;
    ns.print(`║ Tick: ${prog} | Mode: ${modeStr} | Shorts: ${shortStr} | Theme: ${C.dim(THEME)}`);
    ns.print(`╠════════════════╦═════════════╦════════╦═════════╦══════╦═══════╣`);
    ns.print(`║ ${C.bold("Strategy      ")} ║ ${C.bold("P/L        ")} ║ ${C.bold("Win %")} ║ ${C.bold("Trades")} ║ ${C.bold("DD  ")} ║ ${C.bold("Sharp")} ║`);
    ns.print(`╠════════════════╬═════════════╬════════╬═════════╬══════╬═══════╣`);

    const scoredPorts = portfolios.map(port => ({ port, score: scorePortfolio(port) }));
    scoredPorts.sort((x, y) => y.score.pnl - x.score.pnl);

    for (const { port, score } of scoredPorts) {
      const isGrad = tickCount >= GRADUATE_TICKS && score.pnl > 0 && score.winRate >= GRADUATE_WIN_RATE;
      const name     = port.strat.name.padEnd(14);
      const pnlRaw   = ns.formatNumber(score.pnl, 1).padStart(11);
      const pnlStr   = C.plcol(score.pnl, pnlRaw);
      const wrRaw    = (score.total > 0 ? (score.winRate * 100).toFixed(1) + "%" : "  n/a").padStart(6);
      const wrStr    = score.total > 0
        ? (score.winRate >= GRADUATE_WIN_RATE ? C.green(wrRaw) : C.red(wrRaw))
        : C.dim(wrRaw);
      const trades   = String(score.total).padStart(7);
      const dd       = ns.formatNumber(score.maxDrawdown, 0).padStart(4);
      const sh       = score.sharpe.toFixed(2).padStart(5);
      const gradMark = isGrad ? C.green("*") : " ";
      ns.print(`║ ${isGrad ? C.green(name) : name}${gradMark}║ ${pnlStr} ║ ${wrStr} ║ ${trades} ║ ${dd} ║ ${sh} ║`);
    }

    ns.print(`╠${LINE}╣`);
    if (tickCount >= GRADUATE_TICKS) {
      const grads = scoredPorts.filter(s => s.score.pnl > 0 && s.score.winRate >= GRADUATE_WIN_RATE);
      if (grads.length > 0) {
        ns.print(`║ ${C.green("★")} ${C.green(String(grads.length))} ${C.green("strategies graduated")} → ${C.cyan("/strats/proven.txt")}${" ".repeat(20)}║`);
      } else {
        ns.print(`║ ${C.yellow("No strategies met graduation yet")} ${C.dim(`(need +P/L and >${GRADUATE_WIN_RATE * 100}% win rate)`)}  ║`);
      }
    } else {
      const remaining = GRADUATE_TICKS - tickCount;
      const bar = C.cyan("█".repeat(Math.floor((tickCount / GRADUATE_TICKS) * 20))) + C.dim("░".repeat(20 - Math.floor((tickCount / GRADUATE_TICKS) * 20)));
      ns.print(`║ ${bar} ${C.dim(remaining + " ticks to graduation check")}${" ".repeat(10)}║`);
    }

    ns.print(`╠${LINE}╣`);
    ns.print(`║ ${C.bold("Active Virtual Positions")} ${C.dim("(best strategy)")}${" ".repeat(25)}║`);

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
        const pnlRaw = (pos.pnl >= 0 ? "+" : "") + ns.formatNumber(pos.pnl, 1);
        const dirStr = pos.dir === "L" ? C.green("L") : C.red("S");
        ns.print(`║   ${dirStr} ${C.cyan(pos.sym.padEnd(5))} ${ns.formatNumber(pos.shares, 0).padStart(8)} shares  ${C.plcol(pos.pnl, pnlRaw)}${" ".repeat(8)}║`);
      }
      if (active.length === 0) ns.print(`║   ${C.dim("(none yet — waiting for signals)")}${" ".repeat(32)}║`);
    }
    ns.print(`╚${LINE}╝`);
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

  ns.print(`${C.cyan("Paper Trading Lab")} initialized: ${C.bold(String(symbols.length))} stocks, ${C.bold(String(STRATEGIES.length))} strategies`);
  ns.print(`Starting virtual cash: ${C.green(ns.formatNumber(startCash))} per strategy`);

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

    printPaperDashboard();
  }
}


// ════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ════════════════════════════════════════════════════════════════

/** @param {NS} ns */
export async function main(ns) {
  // ╔══════════════════════════════════════════════════════════════╗
  // ║  FinalStonkinton - Multi-Mode Stock Trader                  ║
  // ║                                                             ║
  // ║  3 trading modes in one script:                             ║
  // ║    Normal  — balanced thresholds, buys many stocks          ║
  // ║    Turtle  — conservative, high-confidence trades only      ║
  // ║    YOLO    — single 10% bet at a time, 24min loss cooldown  ║
  // ║                                                             ║
  // ║  Works with or without 4S data (estimates from prices).     ║
  // ║  Always keeps $1m cash reserve for safety.                  ║
  // ║  Auto-buys market access tiers as you earn more money.      ║
  // ╚══════════════════════════════════════════════════════════════╝

  // Suppress built-in Bitburner log spam (sleep, stock API calls, etc.)
  ns.disableLog("ALL");
  // Open a tail window so the dashboard is visible
  ns.ui.openTail();

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: MODE FLAGS + THEME
  // Parse command-line arguments to determine which mode to run.
  // Only one mode should be active at a time.
  // ═══════════════════════════════════════════════════════════════

  const PAPER_STRATEGIES = [
    // ── Core strategies ──
    { name: "Aggressive",   forecastBuyLong: 0.55,  forecastBuyShort: 0.45, forecastSellLong: 0.50, forecastSellShort: 0.50, buyThreshold: 0.00005, maxPct: 0.40, shortWindow: 10 },
    { name: "Moderate",     forecastBuyLong: 0.575, forecastBuyShort: 0.425,forecastSellLong: 0.50, forecastSellShort: 0.50, buyThreshold: 0.0001,  maxPct: 0.34, shortWindow: 10 },
    { name: "Conservative", forecastBuyLong: 0.60,  forecastBuyShort: 0.40, forecastSellLong: 0.51, forecastSellShort: 0.49, buyThreshold: 0.001,   maxPct: 0.25, shortWindow: 10 },
    { name: "Turtle",       forecastBuyLong: 0.65,  forecastBuyShort: 0.35, forecastSellLong: 0.52, forecastSellShort: 0.48, buyThreshold: 0.002,   maxPct: 0.20, shortWindow: 10 },
    { name: "Sniper",       forecastBuyLong: 0.70,  forecastBuyShort: 0.30, forecastSellLong: 0.55, forecastSellShort: 0.45, buyThreshold: 0.003,   maxPct: 0.15, shortWindow: 10 },
    { name: "Momentum",     forecastBuyLong: 0.55,  forecastBuyShort: 0.45, forecastSellLong: 0.50, forecastSellShort: 0.50, buyThreshold: 0.0001,  maxPct: 0.34, shortWindow: 5  },
    // ── Extended strategies ──
    { name: "FastFlip",     forecastBuyLong: 0.58,  forecastBuyShort: 0.42, forecastSellLong: 0.50, forecastSellShort: 0.50, buyThreshold: 0.0002,  maxPct: 0.30, shortWindow: 3  },
    { name: "DeepValue",    forecastBuyLong: 0.72,  forecastBuyShort: 0.28, forecastSellLong: 0.56, forecastSellShort: 0.44, buyThreshold: 0.004,   maxPct: 0.12, shortWindow: 10 },
    { name: "Balanced",     forecastBuyLong: 0.62,  forecastBuyShort: 0.38, forecastSellLong: 0.51, forecastSellShort: 0.49, buyThreshold: 0.0015,  maxPct: 0.28, shortWindow: 8  },
    // ── Theory strategies ──
    { name: "ShortTheory",  forecastBuyLong: 0.99,  forecastBuyShort: 0.42, forecastSellLong: 0.50, forecastSellShort: 0.52, buyThreshold: 0.0001,  maxPct: 0.34, shortWindow: 10, shortOnly: true },
  ];
  const PAPER_COMMISSION   = 100000;
  const PAPER_GRADUATE_TICKS = 300;
  const PAPER_GRADUATE_WR  = 0.57;

  const TURTLE    = ns.args.includes("--turtle");    // conservative mode
  const YOLO      = ns.args.includes("--yolo");       // single-bet gambling mode
  const LIQUIDATE = ns.args.includes("--liquidate");   // emergency sell-all

  // getTheme reads --theme from ns.args, returns { theme, name }
  // makeColors builds an ANSI color helper object from the theme
  const { theme, name: THEME } = getTheme(ns);
  const C = makeColors(theme);


  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: CONFIGURATION
  // These are the "knobs" that control trading behavior.
  // Normal mode uses these defaults directly.
  // Turtle mode overrides them in Section 3 below.
  // ═══════════════════════════════════════════════════════════════

  const CONFIG = {
    // ── Risk management ──
    reserveCash:      1_000_000,  // always keep $1m liquid — never invest last dollar
    maxDeploy:        0.80,       // never invest more than 80% of total worth
    maxPortfolioPct:  0.34,       // max 34% of worth in any single stock (diversification)
    commission:       100_000,    // Bitburner charges $100k per buy/sell transaction

    // ── Buy thresholds ──
    // These control how strong a signal must be before we enter a position.
    // "forecast" = probability the stock goes up next tick (0.5 = coin flip)
    forecastBuyLong:  0.575,      // buy long when forecast > 57.5% (slight edge)
    forecastBuyShort: 0.425,      // buy short when forecast < 42.5%
    buyThreshold4S:   0.0001,     // min expected return with 4S data (very sensitive)
    buyThresholdEst:  0.0015,     // min expected return with estimates (need more edge)

    // ── Sell thresholds ──
    // When to exit positions. Lower than buy thresholds = hysteresis
    // (prevents buy->sell->buy oscillation on marginal signals)
    forecastSellLong:  0.5,       // exit long when forecast drops to coin-flip
    forecastSellShort: 0.5,       // exit short when forecast rises to coin-flip
    sellThreshold4S:   0,         // any negative ER = exit (with 4S data)
    sellThresholdEst:  0.0005,    // small buffer for estimate noise

    // ── Estimation engine parameters ──
    // Used by /lib/estimate.js to build forecasts from price history
    tickHistoryLen:   80,         // how many ticks of prices to remember per stock
    longWindow:       76,         // ticks for main forecast (should be close to cycle length)
    shortWindow:      10,         // ticks for recent-trend / cycle-flip detection
    inversionDelta:   0.15,       // how much long/short windows must disagree to flag a flip

    autoBuyAccess:    true,       // auto-purchase WSE/TIX/4S when affordable

    // ── Stale position exit ──
    // Force-exit positions held for a full market cycle with no meaningful signal.
    // Prevents capital from being stuck in slow-moving stocks.
    staleExitTicks:   75,         // one full cycle length; exit if held this long
    staleNeutralBand: 0.02,       // "neutral" = forecast within 0.02 of 0.5

    // ── Flat market short-circuit ──
    // Skip the buy phase when no stock has a meaningful expected return.
    // Reduces unnecessary API calls during quiet market periods.
    flatBuySkipFloor: 0.0003,     // max |ER| below which market is considered flat
    flatBuySkipTicks: 3,          // consecutive flat ticks required before skipping

    // ── Kelly-adjacent position sizing ──
    // Per-stock allocation = |ER| / (vol^2 * KELLY_K), capped at maxPortfolioPct.
    // High-vol stocks get smaller allocations; high-confidence signals get more.
    KELLY_K:               30,    // Kelly divisor — higher = smaller, more conservative bets

    // ── Early profit-taking ──
    // Exit positions that are up >=5% after 40+ ticks without waiting for neutral forecast.
    // Locks in gains that would likely evaporate over a full cycle.
    STALE_PROFIT_PCT:      0.05,  // minimum gain to trigger early exit (5%)
    STALE_MIN_TICKS_PROFIT: 40,   // minimum age before early profit exit applies

    // ── Portfolio drawdown halt ──
    // Skip new buys if portfolio has fallen >20% from its session peak.
    // Sells are unaffected — positions can still be exited normally.
    MAX_DRAWDOWN_HALT:     0.20,  // drawdown fraction that halts new buys

    // ── Bid-ask spread filter ──
    // Skip buying a stock if the spread eats more than spreadMaxFrac × the per-tick ER.
    // Spread is a ONE-TIME cost; ER compounds every tick. Breakeven hold = spread / (2×ER) ticks.
    // Example: WDS spread=2.18%, ER=0.00496/tick → breakeven ~9 ticks → fine to buy.
    // With typical Bitburner holds of 20-75 ticks, only reject if spread > ~25 ticks of ER.
    // Old value of 3.0 was far too strict — it blocked nearly every trade by assuming 1-tick holds.
    // 50.0 was too loose — allowed trades needing 25 ticks just to recover spread costs.
    // 20.0 is calibrated: only enter if spread breaks even within ~10 ticks, matching typical holds.
    spreadMaxFrac:         20.0,  // skip buy if spread > 20 ticks of ER (breakeven > 10 ticks)

    // ── Momentum blend (no-4S only) ──
    // When we don't have 4S data, nudge the estimated forecast with short-term price
    // momentum. Positive momentum = recent prices rising faster than recent average.
    // Capped via tanh so it never overrides the main forecast signal entirely.
    momentumBlend:         0.04,  // max forecast nudge from momentum (+-0.04 at most)
    momentumWindow:        7,     // ticks per half-window for momentum calculation
  };


  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: TURTLE MODE OVERRIDES
  // In turtle mode, we either load battle-tested parameters from
  // the paper trader (run FinalStonkinton.js --paper saves winners to
  // /strats/proven.txt) or fall back to hardcoded conservative values.
  // ═══════════════════════════════════════════════════════════════

  let provenParams = null;  // stores loaded paper-trader strategy (if any)

  if (TURTLE) {
    // Try loading the best strategy from paper trader results
    try {
      const raw = ns.read("/strats/proven.txt");
      if (raw && raw.length > 2) {
        const strats = JSON.parse(raw);
        if (strats.length > 0) {
          // Sort by profit — use the most profitable proven strategy
          strats.sort((x, y) => y.score.pnl - x.score.pnl);
          provenParams = strats[0];
        }
      }
    } catch { /* file doesn't exist yet — paper trader hasn't run */ }

    if (provenParams && provenParams.score.pnl > 0) {
      // Nudge CONFIG toward proven strategy (50% on startup — we have confidence in this data)
      applyUpgrade(provenParams, 0.5);
    } else {
      // No proven strats available — use hardcoded conservative defaults
      // These are tighter than normal mode (higher confidence required)
      CONFIG.forecastBuyLong  = 0.65;      // need 65% forecast to buy (vs 57.5% normal)
      CONFIG.forecastBuyShort = 0.35;      // need 35% forecast to short (vs 42.5% normal)
      CONFIG.forecastSellLong = 0.52;      // exit earlier than normal (vs 0.5)
      CONFIG.forecastSellShort = 0.48;     // exit earlier than normal (vs 0.5)
      CONFIG.buyThreshold4S   = 0.002;     // need 20x more edge than normal mode
      CONFIG.buyThresholdEst  = 0.003;     // need 2x more edge than normal mode
      CONFIG.maxPortfolioPct  = 0.20;      // max 20% per stock (vs 34% normal)
    }
  }

  // SAFE_CONFIG: locked-in conservative params used as a fallback when
  // performance degrades. These values are intentionally restrictive —
  // they require high confidence before entering any trade, and exit early.
  // Revert logic in recordTrade() will snap CONFIG back to these if we
  // hit 3 consecutive losses OR rolling win rate drops below 45%.
  const SAFE_CONFIG = {
    forecastBuyLong:   0.65,   // only buy long when 65%+ bullish
    forecastBuyShort:  0.35,   // only short when 35%- bearish
    forecastSellLong:  0.52,   // exit long sooner (don't ride reversals)
    forecastSellShort: 0.48,   // exit short sooner
    buyThreshold4S:    0.002,  // much higher bar for 4S edge
    buyThresholdEst:   0.003,  // much higher bar for estimated edge
    maxPortfolioPct:   0.20,   // max 20% exposure per stock
  };

  function applySafeConfig() {
    CONFIG.forecastBuyLong   = SAFE_CONFIG.forecastBuyLong;
    CONFIG.forecastBuyShort  = SAFE_CONFIG.forecastBuyShort;
    CONFIG.forecastSellLong  = SAFE_CONFIG.forecastSellLong;
    CONFIG.forecastSellShort = SAFE_CONFIG.forecastSellShort;
    CONFIG.buyThreshold4S    = SAFE_CONFIG.buyThreshold4S;
    CONFIG.buyThresholdEst   = SAFE_CONFIG.buyThresholdEst;
    CONFIG.maxPortfolioPct   = SAFE_CONFIG.maxPortfolioPct;
  }

  // Nudge CONFIG toward the winning paper strategy's params by `nudge` fraction (0–1).
  // A nudge of 0.25 moves 25% of the way toward the winner each time it fires.
  // Special logic upgrades (EST shorts, etc.) are toggled here based on theory results.
  function applyUpgrade(winner, nudge = 0.25) {
    const p = winner.params;
    const lp = (a, b) => +(a + (b - a) * nudge).toFixed(5);
    const prev = {
      bl: CONFIG.forecastBuyLong, bs: CONFIG.forecastBuyShort,
      thr: CONFIG.buyThresholdEst, pct: CONFIG.maxPortfolioPct,
    };
    CONFIG.forecastBuyLong   = lp(CONFIG.forecastBuyLong,   p.forecastBuyLong);
    CONFIG.forecastBuyShort  = lp(CONFIG.forecastBuyShort,  p.forecastBuyShort);
    CONFIG.forecastSellLong  = lp(CONFIG.forecastSellLong,  p.forecastSellLong);
    CONFIG.forecastSellShort = lp(CONFIG.forecastSellShort, p.forecastSellShort);
    CONFIG.buyThreshold4S    = lp(CONFIG.buyThreshold4S,    p.buyThreshold);
    CONFIG.buyThresholdEst   = lp(CONFIG.buyThresholdEst,   p.buyThreshold);
    CONFIG.maxPortfolioPct   = lp(CONFIG.maxPortfolioPct,   p.maxPortfolioPct);
    // Logic toggle: ShortTheory graduation proves EST shorts are viable
    if (winner.name === "ShortTheory" && winner.score.pnl > 0) {
      estShortsEnabled = true;
      upgradeLog.push(`+EST_SHORTS unlocked by ShortTheory`);
    }
    upgradeLog.push(`[${winner.name} ×${nudge}] BL:${prev.bl.toFixed(3)}→${CONFIG.forecastBuyLong.toFixed(3)} Thr:${prev.thr.toFixed(4)}→${CONFIG.buyThresholdEst.toFixed(4)}`);
    if (upgradeLog.length > 4) upgradeLog.shift();
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: STATE
  // Mutable state that tracks the current session.
  // Everything here resets when the script restarts.
  // ═══════════════════════════════════════════════════════════════

  const stocks         = {};     // sym -> per-stock tracking object (initialized in Section 6)
  let   has4S          = false;  // do we have 4S TIX API? (best data source)
  let   hasTIX         = false;  // do we have TIX API at all? (required to trade)
  let   hasShorts      = true;   // can we short? (fails gracefully if SF not unlocked)
  let   tickCount      = 0;      // how many market ticks since script started
  let   totalProfit    = 0;      // cumulative realized P/L this session
  let   totalTradeCount = 0;     // number of completed trades this session
  let   flatTicks          = 0;      // consecutive ticks with no meaningful market signal
  let   sessionPeakWorth   = 0;      // highest net worth seen this session (for drawdown halt)
  let   totalWins          = 0;      // lifetime winning trades this session
  let   totalLosses        = 0;      // lifetime losing trades this session
  let   totalWonAmt        = 0;      // total $ won across all winning trades
  let   totalLostAmt       = 0;      // total $ lost across all losing trades
  const sessionStart       = Date.now();  // for calculating elapsed time and $/min
  const worthHistory   = [];     // net worth samples for the sparkline graph (last 120)
  const recentTrades   = [];     // last 5 closed trades for dashboard display

  // ── Safety net: auto-revert state ──
  let consecutiveLosses = 0;
  const rollingWindow   = [];
  let safeModeActive    = false;
  let safeModeRevertTick = 0;

  // ── Upgrade engine state ──
  // Paper lab results nudge CONFIG rather than wholesale replacing it.
  let   estShortsEnabled = false;   // ShortTheory graduation can unlock EST shorts
  const upgradeLog       = [];      // rolling log of applied upgrades (shown in dashboard)

  // YOLO mode state — tracks the current single bet and win/loss record
  const yolo = {
    cooldownUntil: 0,            // timestamp — no new bets until this passes (24min after loss)
    wins:      0,                // total winning bets
    losses:    0,                // total losing bets
    totalWon:  0,                // total $ won across all winning bets
    totalLost: 0,                // total $ lost across all losing bets
    activeBet: null,             // current bet: { sym, type, shares, entryPrice, tick }
    history:   [],               // last 20 bet results (P/L amounts) for W/L streak display
  };


  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: EMERGENCY LIQUIDATE
  // When run with --liquidate, sells ALL positions immediately
  // and exits. Use this to cash out before installing augmentations
  // or if the market is tanking and you want out NOW.
  // ═══════════════════════════════════════════════════════════════

  if (LIQUIDATE) {
    try { hasTIX = ns.stock.hasTIXAPIAccess(); } catch { /* */ }
    for (const sym of ns.stock.getSymbols()) {
      const [ls, , ss] = ns.stock.getPosition(sym);
      if (ls > 0) ns.stock.sellStock(sym, ls);     // sell all long shares
      if (ss > 0) try { ns.stock.sellShort(sym, ss); } catch { /* shorts unavailable */ }
    }
    ns.tprint("All positions liquidated.");
    return;  // exit script immediately
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: MARKET ACCESS
  // Ensures we have TIX API before trading. Auto-buys upgrades.
  // Then initializes per-stock tracking objects for all symbols.
  // ═══════════════════════════════════════════════════════════════

  // Try to buy any missing access tiers, then check what we have
  if (CONFIG.autoBuyAccess) tryBuyAccess(ns);
  ({ hasTIX, has4S } = checkAccess(ns));

  // If we don't have TIX API yet, block and wait (retries every 30s)
  if (!hasTIX) {
    ({ hasTIX, has4S } = await waitForTIX(ns));
  }

  // Build the per-stock tracking objects
  // Each stock gets: price history, forecast data, position data, etc.
  const symbols = ns.stock.getSymbols();
  for (const sym of symbols) {
    stocks[sym] = {
      sym,
      priceHistory:    [],       // rolling window of prices (last tickHistoryLen ticks)
      forecast:        0.5,      // 4S forecast (0-1, >0.5 = bullish) — only valid when has4S
      volatility:      0.01,     // 4S volatility — only valid when has4S
      estForecast:     0.5,      // our estimated forecast from price history
      estForecastShort: 0.5,     // short-window forecast for cycle-flip detection
      longShares:      0,        // current long position size (synced from game each tick)
      longAvgPrice:    0,        // average buy price for long position
      shortShares:     0,        // current short position size
      shortAvgPrice:   0,        // average entry price for short position
      maxShares:       ns.stock.getMaxShares(sym),  // Bitburner caps shares per stock
      ticksSinceAction: 999,     // cooldown tracker — avoid rapid re-entry
      positionOpenTick: 0,       // tick when position was first opened (0 = flat)
      inversionFlag:   false,    // true when market cycle flip confirmed (2 ticks)
      inversionSince:  0,        // tickCount when raw inversion first detected (0 = none)
      inversionEarly:  false,    // true when flip is propagating (1-2 ticks before confirmed)
      momentum:        0,        // short-term price momentum: +1 = surging up, -1 = crashing down
      spreadFrac:      0,        // bid-ask spread as fraction of ask price (updated each tick)
    };
  }

  // ── Paper trading state (runs silently alongside real trading) ──
  const paperPortfolios = PAPER_STRATEGIES.map(s => ({
    strat: s,
    startingCash: 0,
    cash: 0,
    positions: {},
    trades: [],
    peakValue: 0,
    maxDrawdown: 0,
    returns: [],
  }));
  let paperInitialized = false;
  let paperTickCount = 0;


  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: DATA ENGINE
  // Bridges the gap between raw price data and trading decisions.
  // runEstimation() feeds price history through /lib/estimate.js
  // to compute forecast + inversion flags.
  // expectedReturn() is THE core metric: ER = volatility * (forecast - 0.5)
  // Positive ER = stock expected to go up, negative = expected to go down.
  // ═══════════════════════════════════════════════════════════════

  // Run the estimation library on a stock's price history
  // and store results back on the stock object.
  // Called every tick for every stock, even with 4S data,
  // because the inversion detector needs continuous data.
  //
  // Inversion confirmation: raw inversionFlag from estimate.js is debounced
  // over 2 ticks to filter single-tick noise. stock.inversionFlag only
  // becomes true after the raw signal persists for >=1 additional tick.
  function runEstimation(stock) {
    // Use simple equal-weight up-tick count (_fbEstFc) — mirrors Bitburner's internal
    // forecast calculation. The weighted-recency version (estimateForecast) amplifies
    // short-term noise and produces false entries without 4S data.
    const est = _fbEstFc(stock.priceHistory, CONFIG.longWindow, CONFIG.shortWindow, CONFIG.inversionDelta);

    stock.estForecast      = est.forecast;
    stock.estForecastShort = est.forecastShort;
    stock.inversionEarly   = false;  // _fbEstFc doesn't compute inversionEarly

    // ── Short-term price momentum ──
    // Compare the mean of the last N ticks vs the N ticks before that.
    // Positive = prices rising faster lately = bullish momentum.
    // Used by expectedReturn() to nudge estimated forecast when we have no 4S data.
    const ph  = stock.priceHistory;
    const mW  = CONFIG.momentumWindow;
    if (ph.length >= mW * 2) {
      let oldSum = 0, newSum = 0;
      for (let i = ph.length - mW * 2; i < ph.length - mW; i++) oldSum += ph[i];
      for (let i = ph.length - mW;     i < ph.length;         i++) newSum += ph[i];
      const oldAvg = oldSum / mW, newAvg = newSum / mW;
      stock.momentum = oldAvg > 0 ? (newAvg - oldAvg) / oldAvg : 0;
    } else {
      stock.momentum = 0;
    }

    // ── 2-tick inversion confirmation ──
    // rawInv fires on the first tick of disagreement.
    // We set inversionFlag=true only after it persists for >=1 more tick.
    // This prevents 1-tick noise spikes from triggering hard exits.
    const rawInv = est.inversionFlag;
    if (rawInv) {
      if (stock.inversionSince === 0) stock.inversionSince = tickCount;
      if (tickCount - stock.inversionSince >= 1) stock.inversionFlag = true;
    } else {
      stock.inversionSince = 0;
      stock.inversionFlag  = false;
    }
  }

  // THE key trading metric. Positive ER = expected profit, negative = expected loss.
  // With 4S: uses the game's exact forecast and volatility numbers.
  // Without 4S: uses our estimated forecast blended with short-term momentum,
  //             plus estimated volatility from price history.
  //
  // Formula: ER = volatility * (forecast - 0.5)
  //   Example: f=0.6, vol=0.02 -> ER = 0.02 * 0.1 = 0.002 = 0.2% expected gain/tick
  //
  // Momentum blend (no-4S only):
  //   We nudge `f` by tanh(momentum * 100) * momentumBlend.
  //   tanh keeps the nudge bounded: never flips the forecast direction on its own.
  //   Effectively: if forecast says bullish AND momentum confirms -> stronger signal.
  //   If forecast says bullish but momentum is negative -> slightly weaker signal.
  function expectedReturn(stock) {
    if (has4S) {
      const f = stock.forecast;
      const v = stock.volatility;
      return v * (f - 0.5);
    }
    // No 4S — use estimated forecast + momentum nudge
    const f   = stock.estForecast;
    const v   = estimateVolatility(stock.priceHistory);
    const nudge = Math.tanh(stock.momentum * 100) * CONFIG.momentumBlend;
    const adjF  = Math.max(0, Math.min(1, f + nudge));  // clamp to [0, 1]
    return v * (adjF - 0.5);
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: TRADE HELPERS
  // Bookkeeping when a trade closes. Tracks P/L and trade history.
  // ═══════════════════════════════════════════════════════════════

  // Called after every sell. Updates running totals and recent trade list.
  // Optional tag is stored on the trade for logging (e.g., " [EARLY]").
  // cost = entry cost of the position, used to compute % return per trade.
  function recordTrade(sym, type, pnl, tag = "", cost = 0) {
    totalProfit += pnl;
    if (pnl >= 0) { totalWins++; totalWonAmt += pnl; consecutiveLosses = 0; }
    else           { totalLosses++; totalLostAmt += Math.abs(pnl); consecutiveLosses++; }
    recentTrades.push({ sym, type, pnl, tick: tickCount, tag, cost });
    if (recentTrades.length > 5) recentTrades.shift();  // keep last 5 for dashboard
    totalTradeCount++;

    // ── Safety net: rolling window check ──
    rollingWindow.push(pnl);
    if (rollingWindow.length > 20) rollingWindow.shift();

    // Trigger safe mode if:
    //   a) 3 consecutive losses in a row, OR
    //   b) rolling win rate dropped below 45% over last 10+ trades
    if (!safeModeActive) {
      const rollingWins = rollingWindow.filter(p => p >= 0).length;
      const rollingWR   = rollingWindow.length > 0 ? rollingWins / rollingWindow.length : 1;
      const tooManyLosses = consecutiveLosses >= 3;
      const lowWinRate    = rollingWindow.length >= 10 && rollingWR < 0.45;

      if (tooManyLosses || lowWinRate) {
        applySafeConfig();
        safeModeActive    = true;
        safeModeRevertTick = tickCount;
        provenParams      = null;  // stop using proven params until recovery confirmed
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 9: SELL PHASE
  // Runs first each tick (before buying). Checks every held position
  // and exits if the signal has weakened or a cycle flip occurred.
  //
  // Exit conditions for longs:
  //   - Forecast dropped below sell threshold (signal died)
  //   - Expected return went negative (losing edge)
  //   - Inversion flag set (market cycle flipped)
  //
  // Exit conditions for shorts: mirror image of longs.
  // ═══════════════════════════════════════════════════════════════

  function sellPhase() {
    // Use different ER thresholds depending on data quality
    // With 4S: sell as soon as ER goes negative (precise data)
    // With estimates: allow small buffer for noise
    const sellThreshold = has4S ? CONFIG.sellThreshold4S : CONFIG.sellThresholdEst;

    for (const sym of Object.keys(stocks)) {
      const s  = stocks[sym];
      const f  = has4S ? s.forecast : s.estForecast;  // current forecast
      const er = expectedReturn(s);                    // current expected return

      // ── Stale position check ──
      // A position is "stale" if it's been open for > one full cycle (75 ticks)
      // and the forecast has returned to neutral — no edge left, free the capital.
      const age   = s.positionOpenTick > 0 ? tickCount - s.positionOpenTick : 0;
      const stale = age > CONFIG.staleExitTicks && Math.abs(f - 0.5) < CONFIG.staleNeutralBand;

      // ── Exit long positions ──
      if (s.longShares > 0) {
        // inversionEarly tightens the sell threshold by 0.01 (exit 1-2 ticks before confirmed flip)
        const effectiveSellLong = CONFIG.forecastSellLong + (s.inversionEarly ? 0.01 : 0);

        // Early profit exit: if up >=5% after 40+ ticks, take the gain now
        let earlyProfit = false;
        if (age > CONFIG.STALE_MIN_TICKS_PROFIT) {
          try {
            const sg   = ns.stock.getSaleGain(sym, s.longShares, "Long");
            const cost = s.longShares * s.longAvgPrice;
            earlyProfit = cost > 0 && (sg - cost) / cost > CONFIG.STALE_PROFIT_PCT;
          } catch { /* API unavailable */ }
        }

        if (f < effectiveSellLong || er < sellThreshold || s.inversionFlag || stale || earlyProfit) {
          // [EARLY] tag: inversionEarly was the deciding factor (would NOT exit at normal threshold)
          const tag = (s.inversionEarly && f >= CONFIG.forecastSellLong && f < effectiveSellLong) ? " [EARLY]" : "";
          // Zero-trust: validate getSaleGain doesn't throw (can fail if position changed)
          try {
            const cost = s.longShares * s.longAvgPrice;
            const pnl  = ns.stock.getSaleGain(sym, s.longShares, "Long") - cost;
            ns.stock.sellStock(sym, s.longShares);
            recordTrade(sym, "L", pnl, tag, cost);
            s.longShares = 0; s.longAvgPrice = 0;  // clear immediately so buyPhase sees correct state
            s.ticksSinceAction = 0;
            s.positionOpenTick = 0;  // position closed — reset age tracker
          } catch { /* position already closed or API unavailable */ }
        }
      }

      // ── Exit short positions ──
      // Shorts profit when price goes DOWN, so conditions are inverted:
      // sell when forecast goes ABOVE threshold (stock recovering)
      if (s.shortShares > 0 && hasShorts) {
        const effectiveSellShort = CONFIG.forecastSellShort - (s.inversionEarly ? 0.01 : 0);

        let earlyProfit = false;
        if (age > CONFIG.STALE_MIN_TICKS_PROFIT) {
          try {
            const sg   = ns.stock.getSaleGain(sym, s.shortShares, "Short");
            const cost = s.shortShares * s.shortAvgPrice;
            earlyProfit = cost > 0 && (sg - cost) / cost > CONFIG.STALE_PROFIT_PCT;
          } catch { /* API unavailable */ }
        }

        if (f > effectiveSellShort || er > -sellThreshold || s.inversionFlag || stale || earlyProfit) {
          const tag = (s.inversionEarly && f <= CONFIG.forecastSellShort && f > effectiveSellShort) ? " [EARLY]" : "";
          try {
            const cost = s.shortShares * s.shortAvgPrice;
            const pnl  = ns.stock.getSaleGain(sym, s.shortShares, "Short") - cost;
            ns.stock.sellShort(sym, s.shortShares);
            recordTrade(sym, "S", pnl, tag, cost);
            s.shortShares = 0; s.shortAvgPrice = 0;  // clear immediately so buyPhase sees correct state
            s.ticksSinceAction = 0;
            s.positionOpenTick = 0;  // position closed — reset age tracker
          } catch { hasShorts = false; }  // SF not unlocked for shorts
        }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 10: BUY PHASE
  // Runs after sell phase. Ranks all stocks by expected return,
  // then buys the strongest signals within risk limits.
  //
  // Risk limits enforced:
  //   1. Reserve cash: always keep $1m liquid
  //   2. Max deployment: never invest > 80% of net worth
  //   3. Per-stock cap: no single stock > 34% of portfolio
  //   4. Commission-aware: subtracts $100k from each purchase budget
  //   5. Inversion filter: won't buy stocks mid-cycle-flip
  // ═══════════════════════════════════════════════════════════════

  function buyPhase() {
    // ── Portfolio drawdown halt ──
    // Skip all new buys if portfolio has fallen >20% from session peak.
    // Prevents deploying capital into a sustained bear cycle.
    // Sells are unaffected — positions can still exit normally.
    const tw = totalWorth(ns);
    if (tw > sessionPeakWorth) sessionPeakWorth = tw;
    if (tw < sessionPeakWorth * (1 - CONFIG.MAX_DRAWDOWN_HALT)) return;

    // ── Flat market short-circuit ──
    // If every stock has negligible expected return, nothing is worth buying.
    // Track consecutive flat ticks and skip after the threshold to save API calls.
    const maxER = Object.values(stocks).reduce((mx, s) => Math.max(mx, Math.abs(expectedReturn(s))), 0);
    if (maxER < CONFIG.flatBuySkipFloor) {
      if (++flatTicks >= CONFIG.flatBuySkipTicks) return;  // market is quiet — skip
    } else {
      flatTicks = 0;  // market has signals — reset counter
    }

    const cash = ns.getServerMoneyAvailable("home") - CONFIG.reserveCash;
    if (cash < 1e6) return;  // not enough after reserve — skip buying

    // tw already computed above for drawdown check
    const buyThreshold = has4S ? CONFIG.buyThreshold4S : CONFIG.buyThresholdEst;
    const invested     = tw - ns.getServerMoneyAvailable("home");  // how much is already in stocks
    const spendable    = Math.min(cash, tw * CONFIG.maxDeploy - invested);  // respect 80% cap
    if (spendable < 1e6) return;

    // Rank all stocks by absolute expected return (strongest signal first)
    // Filter out: weak signals (below threshold) and inverting stocks (mid-flip)
    const ranked = Object.values(stocks)
      .map(s => ({
        sym:      s.sym,
        er:       expectedReturn(s),
        forecast: has4S ? s.forecast : s.estForecast,
        stock:    s,
      }))
      .filter(r => Math.abs(r.er) > buyThreshold && !r.stock.inversionFlag)
      .sort((x, y) => Math.abs(y.er) - Math.abs(x.er));

    let avail = spendable;  // remaining budget (decreases as we buy)

    for (const r of ranked) {
      if (avail < 1e6) break;  // need at least $1m to make a meaningful purchase
      const s = r.stock;

      // ── Kelly-adjacent position sizing ──
      // Fraction = |ER| / (vol^2 * KELLY_K), capped at maxPortfolioPct.
      // High-vol stocks get smaller allocations (more risk per $ invested).
      // High-ER signals get more capital (stronger edge = larger bet justified).
      const vol        = has4S ? s.volatility : estimateVolatility(s.priceHistory);
      const kellyFrac  = vol > 0
        ? Math.min(CONFIG.maxPortfolioPct, Math.abs(r.er) / (vol * vol * CONFIG.KELLY_K))
        : CONFIG.maxPortfolioPct;
      const perStockCap = tw * kellyFrac;

      // Calculate how much room we have for this stock
      // (cap - current position value = remaining budget for this stock)
      const curLongVal  = s.longShares > 0  ? ns.stock.getSaleGain(s.sym, s.longShares, "Long")   : 0;
      const curShortVal = s.shortShares > 0 ? ns.stock.getSaleGain(s.sym, s.shortShares, "Short") : 0;
      const budget = Math.min(avail, perStockCap - curLongVal - curShortVal);
      if (budget < 1e6) continue;

      // ── Bid-ask spread filter ──
      // Skip if the spread cost relative to expected gain is too high.
      // The spread is paid twice (once on entry, once on exit), so it directly
      // reduces realised profit. A spread of 0.002 on an ER of 0.001 means the
      // spread alone would eat 2x our expected gain — not worth entering.
      if (s.spreadFrac > Math.abs(r.er) * CONFIG.spreadMaxFrac) continue;

      // ── Buy long on bullish forecast ──
      if (r.forecast > CONFIG.forecastBuyLong) {
        const price  = ns.stock.getAskPrice(r.sym);  // price we'd pay to buy
        // Calculate shares: (budget - commission) / price, capped by game's maxShares
        const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), s.maxShares - s.longShares);
        if (shares > 0) {
          const cost = ns.stock.getPurchaseCost(r.sym, shares, "Long");  // actual cost including spread
          if (cost <= avail) {
            // Zero-trust: validate buy succeeded before deducting budget
            const boughtAt = ns.stock.buyStock(r.sym, shares);
            if (boughtAt > 0) {
              avail -= cost;
              s.ticksSinceAction = 0;
              if (s.positionOpenTick === 0) s.positionOpenTick = tickCount;  // mark new position
            }
          }
        }
      }
      // ── Short on bearish forecast ──
      // Shorting profits when price drops. We "borrow" shares and sell them,
      // then buy them back later at a lower price. If price goes UP, we lose.
      // Shorts only allowed with 4S data — without exact forecasts, direction
      // estimates are too noisy to short safely.
      else if (r.forecast < CONFIG.forecastBuyShort && hasShorts && (has4S || estShortsEnabled)) {
        try {
          const price  = ns.stock.getBidPrice(r.sym);  // price we'd get selling
          const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), s.maxShares - s.shortShares);
          if (shares > 0) {
            const cost = ns.stock.getPurchaseCost(r.sym, shares, "Short");
            if (cost <= avail) {
              const boughtAt = ns.stock.buyShort(r.sym, shares);
              if (boughtAt > 0) {
                avail -= cost;
                s.ticksSinceAction = 0;
                if (s.positionOpenTick === 0) s.positionOpenTick = tickCount;  // mark new position
              }
            }
          }
        } catch { hasShorts = false; }  // shorting requires Source-File
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 11: YOLO ENGINE
  // A completely different trading strategy: ONE bet at a time.
  // Bets 10% of net worth on the single best opportunity.
  // Sells when forecast flips. 24-minute cooldown after a loss
  // to prevent tilt-trading (revenge trading after bad luck).
  //
  // This mode is intentionally high-risk/high-reward and exists
  // mostly for fun. Use turtle mode for serious trading.
  // ═══════════════════════════════════════════════════════════════

  function yoloBet() {
    // ── Phase 1: Resolve active bet (if we have one) ──
    if (yolo.activeBet) {
      const bet = yolo.activeBet;
      const s   = stocks[bet.sym];
      const f   = has4S ? s.forecast : s.estForecast;

      // Sell when forecast flips against our position direction
      let shouldSell = false;
      if (bet.type === "Long")  shouldSell = f < 0.5 || s.longShares === 0;
      if (bet.type === "Short") shouldSell = f > 0.5 || s.shortShares === 0;

      if (shouldSell) {
        let pnl = 0, tradeCost = 0;
        if (bet.type === "Long" && s.longShares > 0) {
          tradeCost = s.longShares * s.longAvgPrice;
          pnl = ns.stock.getSaleGain(bet.sym, s.longShares, "Long") - tradeCost;
          ns.stock.sellStock(bet.sym, s.longShares);
        } else if (bet.type === "Short" && s.shortShares > 0) {
          try {
            tradeCost = s.shortShares * s.shortAvgPrice;
            pnl = ns.stock.getSaleGain(bet.sym, s.shortShares, "Short") - tradeCost;
            ns.stock.sellShort(bet.sym, s.shortShares);
          } catch { hasShorts = false; }
        }

        recordTrade(bet.sym, bet.type === "Long" ? "L" : "S", pnl, "", tradeCost);

        // Update YOLO scoreboard
        if (pnl >= 0) {
          yolo.wins++;
          yolo.totalWon += pnl;
        } else {
          yolo.losses++;
          yolo.totalLost += Math.abs(pnl);
          // 24-minute cooldown: prevents emotional re-entry after a loss
          yolo.cooldownUntil = Date.now() + 24 * 60 * 1000;
        }
        yolo.history.push(pnl);
        if (yolo.history.length > 20) yolo.history.shift();
        yolo.activeBet = null;  // ready for next bet
      }
      return;  // don't place new bet in the same tick we resolved one
    }

    // ── Phase 2: Cooldown check ──
    if (Date.now() < yolo.cooldownUntil) return;  // still on cooldown from a loss

    // ── Phase 3: Place new bet ──
    // Bet 10% of net worth on the single highest-ER stock
    const tw      = totalWorth(ns);
    const betSize = tw * 0.10;
    if (betSize < 1e6) return;  // too poor to bet meaningfully

    // Find the best opportunity: highest |ER|, no inversion, no existing position
    const best = Object.values(stocks)
      .map(s => ({
        sym:   s.sym,
        er:    expectedReturn(s),
        f:     has4S ? s.forecast : s.estForecast,
        stock: s,
      }))
      .filter(r => Math.abs(r.er) > 0.001 && !r.stock.inversionFlag
                 && r.stock.longShares === 0 && r.stock.shortShares === 0)
      .sort((x, y) => Math.abs(y.er) - Math.abs(x.er))[0];

    if (!best) return;  // no good opportunities right now

    // Place the bet
    if (best.f > 0.5) {
      // Bullish — go long
      const price  = ns.stock.getAskPrice(best.sym);
      const shares = Math.min(Math.floor((betSize - CONFIG.commission) / price), best.stock.maxShares);
      if (shares > 0) {
        const boughtAt = ns.stock.buyStock(best.sym, shares);
        if (boughtAt > 0) {
          yolo.activeBet = { sym: best.sym, type: "Long", shares, entryPrice: price, tick: tickCount };
        }
      }
    } else if (hasShorts) {
      // Bearish — go short
      try {
        const price  = ns.stock.getBidPrice(best.sym);
        const shares = Math.min(Math.floor((betSize - CONFIG.commission) / price), best.stock.maxShares);
        if (shares > 0) {
          const boughtAt = ns.stock.buyShort(best.sym, shares);
          if (boughtAt > 0) {
            yolo.activeBet = { sym: best.sym, type: "Short", shares, entryPrice: price, tick: tickCount };
          }
        }
      } catch { hasShorts = false; }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 12: LOGGING
  // Thin wrappers around /lib/logging.js that add script-specific
  // context (total profit, mode, win/loss counts, etc.)
  // Logs persist across script restarts within the same aug cycle.
  // ═══════════════════════════════════════════════════════════════

  const LOG_FILE  = "/strats/trade-log.txt";          // human-readable trade history
  const DATA_FILE = "/strats/session-data.txt";        // machine-readable JSONL snapshots

  // Log a single completed trade with running totals
  function doLogTrade(trade) {
    const tw = totalWorth(ns);
    logTrade(ns, LOG_FILE, trade,
      `${trade.tag || ""} | Total:${ns.formatNumber(totalProfit)} | Worth:${ns.formatNumber(tw)}`);
  }

  // Snapshot session state every 100 ticks (for performance analysis)
  function doLogSession() {
    const tw      = totalWorth(ns);
    const elapsed = (Date.now() - sessionStart) / 60000;
    const wins    = recentTrades.filter(t => t.pnl >= 0).length;
    const losses  = recentTrades.filter(t => t.pnl < 0).length;
    logSnapshot(ns, DATA_FILE, {
      tick: tickCount, timestamp: Date.now(),
      mode: TURTLE ? "turtle" : (YOLO ? "yolo" : "normal"),
      has4S, worth: tw,
      cash: ns.getServerMoneyAvailable("home"),
      profit: totalProfit,
      profitPerMin: totalProfit / Math.max(1, elapsed),
      totalTrades: totalTradeCount, wins, losses,
    });
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 13: DASHBOARD
  // Renders the live trading display in the tail window.
  // Shows: mode, portfolio summary, sparkline, positions table,
  //        recent trades, top opportunities (or YOLO scoreboard).
  // Redraws completely every tick (clearLog + reprint).
  // ═══════════════════════════════════════════════════════════════

  function printDashboard() {
    // ── Calculate all display values ──
    const tw       = totalWorth(ns);
    const cash     = ns.getServerMoneyAvailable("home");
    const invested = tw - cash;                                         // how much is in stocks
    const elapsed  = ((Date.now() - sessionStart) / 60000).toFixed(1);  // minutes since start
    const startW   = worthHistory.length > 0 ? worthHistory[0] : tw;    // initial worth for return calc
    const ret      = startW > 0 ? (tw - startW) / startW : 0;          // session return percentage

    // Profit rate projections (extrapolated from session average)
    const ppm      = totalProfit / Math.max(1, (Date.now() - sessionStart) / 60000);
    const pph      = ppm * 60;       // per hour
    const pp24     = ppm * 1440;     // per 24 hours

    // Win/loss from recent trades (dashboard only, not lifetime)
    const wins     = recentTrades.filter(t => t.pnl >= 0).length;
    const losses   = recentTrades.filter(t => t.pnl < 0).length;

    // Track net worth for sparkline graph (max 120 samples = 120 ticks ~= 12min)
    worthHistory.push(tw);
    if (worthHistory.length > 120) worthHistory.shift();

    // ── Wipe and redraw everything ──
    ns.clearLog();

    // Mode indicator (color-coded for quick visual identification)
    let modeStr   = "NORMAL";
    let modeColor = C.cyan;
    if (TURTLE) { modeStr = "TURTLE UP";          modeColor = C.green; }
    if (YOLO)   { modeStr = "GO BIG OR GO HOME";  modeColor = C.mag; }
    if (safeModeActive) { modeStr = "⚠ SAFE MODE";  modeColor = C.yellow; }

    // ── Trend velocity (comparing recent vs older portion of sparkline) ──
    let velocityStr = "";
    if (worthHistory.length >= 10) {
      const half = Math.floor(worthHistory.length / 2);
      const oldSlope = (worthHistory[half] - worthHistory[0]) / half;
      const newSlope = (worthHistory[worthHistory.length - 1] - worthHistory[half]) / half;
      if (newSlope > oldSlope * 1.5 && newSlope > 0)      velocityStr = C.green(" ↑↑ accel");
      else if (newSlope > 0 && oldSlope >= 0)             velocityStr = C.green(" ↑  steady");
      else if (newSlope < oldSlope * 1.5 && newSlope < 0) velocityStr = C.red(" ↓↓ accel");
      else if (newSlope < 0)                              velocityStr = C.red(" ↓  steady");
      else                                               velocityStr = C.dim(" → flat");
    }

    // ── Header ──
    const LINE = "═".repeat(62);
    ns.print(`╔${LINE}╗`);
    const modeLabel = `  FINAL STONKINTON  [ ${modeStr} ]`;
    ns.print(`║${C.bold("  FINAL STONKINTON")}  ${modeColor("[ " + modeStr + " ]")}`);
    ns.print(`╠${LINE}╣`);
    // Data tier indicator: shows exactly which market data sources are active
    // ▓▓▓▓ = 4S+TIX (best — game forecasts+vol)  ▓▓▓░ = TIX+momentum  ▓▓░░ = TIX+est  ░░░░ = no data
    const dataBar  = has4S ? C.green("▓▓▓▓ 4S+TIX") : C.yellow("▓▓░░ TIX+EST+MOMO");
    const warmPct  = !has4S ? Math.min(100, Math.round(tickCount / 10 * 100)) : 100;
    const warmStr  = !has4S && warmPct < 100 ? C.dim(` warmup:${warmPct}%`) : "";
    ns.print(`║ DATA: ${dataBar}${warmStr} | Shorts: ${hasShorts ? C.green("ON") : C.red("OFF")} | Tick: ${C.cyan(String(tickCount))} | ${elapsed}min | ${C.dim(THEME)}`);

    // Show proven strategy info in turtle mode (so you know which params loaded)
    if (TURTLE && provenParams) {
      ns.print(`║ ${C.green("Proven strat: " + provenParams.name)} (${provenParams.ticksTested} ticks)`);
    }

    // ── Portfolio summary ──
    ns.print(`╠${LINE}╣`);
    ns.print(`║ Net Worth:  ${C.bold(ns.formatNumber(tw, 2).padStart(14))}  ${C.pct(ret)}${velocityStr}`);
    ns.print(`║ Cash:       ${ns.formatNumber(cash, 2).padStart(14)}  ${C.dim("Invested: " + (tw > 0 ? (invested / tw * 100).toFixed(1) : "0") + "%")}`);
    ns.print(`║ Session P/L:${C.plcol(totalProfit, ns.formatNumber(totalProfit, 2).padStart(14))}`);
    ns.print(`║  /min: ${C.plcol(ppm, ns.formatNumber(ppm, 2).padStart(10))}  /hr: ${C.plcol(pph, ns.formatNumber(pph, 2).padStart(11))}  /24h: ${C.plcol(pp24, ns.formatNumber(pp24, 2))}`);

    // ── Net worth sparkline (mini graph using Unicode block chars) ──
    if (worthHistory.length > 2) {
      const trending = worthHistory[worthHistory.length - 1] >= worthHistory[0];
      const color    = trending ? C.green : C.red;
      const arrow    = trending ? "▲" : "▼";
      ns.print(`║ ${C.dim("NW")} ${color(arrow)} ${color(sparkline(worthHistory, 44))} ${C.dim(worthHistory.length + "T")}`);
    }

    // ── YOLO scoreboard (only shown in YOLO mode) ──
    if (YOLO) {
      ns.print("╠══════════════════════════════════════════════════════════════╣");
      ns.print(`║ ${C.mag(C.bold("YOLO SCOREBOARD"))}`);
      const cdRemain = Math.max(0, (yolo.cooldownUntil - Date.now()) / 60000);
      const status   = cdRemain > 0 ? C.red(`COOLDOWN ${cdRemain.toFixed(1)}min`) : C.green("READY");
      ns.print(`║ ${status}  W: ${C.green(String(yolo.wins))}  L: ${C.red(String(yolo.losses))}`);
      ns.print(`║ Won: ${C.green(ns.formatNumber(yolo.totalWon))} | Lost: ${C.red(ns.formatNumber(yolo.totalLost))} | Net: ${C.plcol(yolo.totalWon - yolo.totalLost, ns.formatNumber(yolo.totalWon - yolo.totalLost))}`);
      if (yolo.wins + yolo.losses > 0) {
        const wr = yolo.wins / (yolo.wins + yolo.losses);
        ns.print(`║ Win Rate: ${C.pct(wr - 0.5)} (${(wr * 100).toFixed(0)}%)`);
      }
      // Visual W/L streak (colored letters)
      if (yolo.history.length > 0) {
        ns.print(`║ ${yolo.history.map(v => v >= 0 ? C.green("W") : C.red("L")).join("")}`);
      }
      // Show current active bet with live P/L
      if (yolo.activeBet) {
        const curPrice = ns.stock.getPrice(yolo.activeBet.sym);
        const chg      = (curPrice - yolo.activeBet.entryPrice) / yolo.activeBet.entryPrice;
        const dir      = yolo.activeBet.type === "Long" ? chg : -chg;  // invert for shorts
        ns.print(`║ ${C.bold("BET:")} ${yolo.activeBet.type} ${yolo.activeBet.sym} ${C.pct(dir)}`);
      }
    }

    // ── Positions table ──
    ns.print("╠════════╦═══════╦═══════╦════════════╦══════════╦═════════╣");
    ns.print("║ Symbol ║ Fcst  ║  Vol  ║ Position   ║ Unrl P/L ║ Return  ║");
    ns.print("╠════════╬═══════╬═══════╬════════════╬══════════╬═════════╣");

    // Build position rows: filter to stocks we actually hold, calculate P/L
    const positions = Object.values(stocks)
      .filter(s => s.longShares > 0 || s.shortShares > 0)
      .map(s => {
        let pnl, cost;
        if (s.longShares > 0) {
          // P/L = what we'd get selling now minus what we paid
          pnl  = ns.stock.getSaleGain(s.sym, s.longShares, "Long") - s.longShares * s.longAvgPrice;
          cost = s.longShares * s.longAvgPrice;
        } else {
          pnl  = ns.stock.getSaleGain(s.sym, s.shortShares, "Short") - s.shortShares * s.shortAvgPrice;
          cost = s.shortShares * s.shortAvgPrice;
        }
        return { ...s, pnl, cost, ret: cost > 0 ? pnl / cost : 0 };
      })
      .sort((x, y) => y.pnl - x.pnl);  // best performers first

    for (const s of positions) {
      const f      = (has4S ? s.forecast : s.estForecast).toFixed(3);
      const v      = (has4S ? s.volatility : estimateVolatility(s.priceHistory)).toFixed(3);
      const pos    = s.longShares > 0 ? `L:${ns.formatNumber(s.longShares, 0)}` : `S:${ns.formatNumber(s.shortShares, 0)}`;
      const inv    = s.inversionFlag ? C.red("!") : (s.inversionEarly ? C.yellow("~") : " ");
      const momo   = !has4S && Math.abs(s.momentum) > 0.001
        ? (s.momentum > 0 ? C.green("↑") : C.red("↓")) : C.dim("·");
      const pnlStr = C.plcol(s.pnl, ((s.pnl >= 0 ? "+" : "") + ns.formatNumber(s.pnl, 0)).padStart(8));
      ns.print(`║ ${(s.sym + inv).padEnd(6)} ║ ${f} ║ ${v} ║ ${momo} ${pos.padEnd(9)} ║ ${pnlStr} ║ ${C.pct(s.ret)} ║`);
    }

    if (positions.length === 0) {
      ns.print(`║ ${C.dim("         No open positions - scanning...")}                   ║`);
    }
    ns.print("╚════════╩═══════╩═══════╩════════════╩══════════╩═════════╝");

    // ── PROJECTIONS panel ──
    // Dedicated section for forward-looking estimates, trade stats, and full trade history.
    ns.print(`╠${LINE}╣`);
    ns.print(`║ ${C.cyan(C.bold(" PROJECTIONS"))}`);
    ns.print(`╠${LINE}╣`);

    // -- Profit rate bars --
    // Show /hr and /24h with a visual fill bar scaled to the best rate seen.
    // Bar width = 20 chars; fill = rate / MAX_RATE_FOR_BAR (auto-scaled)
    const BAR_W = 20;
    const absRates = [Math.abs(ppm), Math.abs(pph), Math.abs(pp24)].filter(v => v > 0);
    const maxRate  = absRates.length > 0 ? Math.max(...absRates) : 1;
    function rateBar(rate) {
      const fill = Math.round(Math.min(1, Math.abs(rate) / maxRate) * BAR_W);
      const col  = rate >= 0 ? C.green : C.red;
      return col("█".repeat(fill) + "░".repeat(BAR_W - fill));
    }
    ns.print(`║  /min  ${rateBar(ppm)}  ${C.plcol(ppm, (ppm >= 0 ? "+" : "") + ns.formatNumber(ppm, 2))}`);
    ns.print(`║  /hr   ${rateBar(pph)}  ${C.plcol(pph, (pph >= 0 ? "+" : "") + ns.formatNumber(pph, 2))}`);
    ns.print(`║  /24h  ${rateBar(pp24)} ${C.plcol(pp24, (pp24 >= 0 ? "+" : "") + ns.formatNumber(pp24, 2))}`);

    // -- Portfolio projections --
    // Estimated portfolio value at +1h and +24h based on current profit rate.
    const proj1h  = tw + pph;
    const proj24h = tw + pp24;
    const pct1h   = tw > 0 ? (pph  / tw) : 0;
    const pct24h  = tw > 0 ? (pp24 / tw) : 0;
    ns.print(`║`);
    ns.print(`║  Proj +1h:  ${C.plcol(proj1h - tw, ns.formatNumber(proj1h, 2).padStart(14))}  ${C.plcol(pct1h, (pct1h >= 0 ? "+" : "") + (pct1h * 100).toFixed(2) + "%")}`);
    ns.print(`║  Proj +24h: ${C.plcol(proj24h - tw, ns.formatNumber(proj24h, 2).padStart(14))}  ${C.plcol(pct24h, (pct24h >= 0 ? "+" : "") + (pct24h * 100).toFixed(2) + "%")}`);

    // -- Safety net status --
    if (safeModeActive) {
      const rollingWins = rollingWindow.filter(p => p >= 0).length;
      const rollingWR   = rollingWindow.length > 0 ? (rollingWins / rollingWindow.length * 100).toFixed(0) : "?";
      const ticksSince  = tickCount - safeModeRevertTick;
      const recoverIn   = Math.max(0, 50 - ticksSince);
      ns.print(`╠${LINE}╣`);
      ns.print(`║ ${C.yellow(C.bold(" ⚠ SAFE MODE"))} ${C.dim("— conservative params active")}`);
      ns.print(`║  Trigger: ${consecutiveLosses >= 3 ? C.red("3 consecutive losses") : C.red("low rolling WR")}   Rolling WR: ${C.plcol(rollingWins / rollingWindow.length - 0.5, rollingWR + "%")}  (${rollingWindow.length} trades)`);
      ns.print(`║  Recovery check in: ${C.cyan(String(recoverIn))} ticks  (needs WR ≥ 55% over last 10)`);
    }

    // ── Upgrade log ──
    if (upgradeLog.length > 0) {
      ns.print(`╠${LINE}╣`);
      ns.print(`║ ${C.cyan(C.bold(" UPGRADES"))}${estShortsEnabled ? C.green("  EST shorts: ON") : ""}`);
      for (const entry of upgradeLog) ns.print(`║  ${C.dim(entry)}`);
    }

    // -- Trade statistics --
    ns.print(`╠${LINE}╣`);
    ns.print(`║ ${C.cyan(C.bold(" TRADES"))}`);
    const lifetimeWR  = totalWins + totalLosses > 0 ? totalWins / (totalWins + totalLosses) : 0;
    const profitFactor = totalLostAmt > 0 ? totalWonAmt / totalLostAmt : (totalWonAmt > 0 ? Infinity : 0);
    const avgTrade    = totalTradeCount > 0 ? totalProfit / totalTradeCount : 0;
    const pfStr       = profitFactor === Infinity ? "∞" : profitFactor.toFixed(2) + "×";
    ns.print(`║  Total: ${C.cyan(String(totalTradeCount))}   W: ${C.green(String(totalWins))}  L: ${C.red(String(totalLosses))}   WR: ${C.plcol(lifetimeWR - 0.5, (lifetimeWR * 100).toFixed(1) + "%")}   PF: ${C.plcol(profitFactor - 1, pfStr)}`);
    ns.print(`║  Avg/trade: ${C.plcol(avgTrade, (avgTrade >= 0 ? "+" : "") + ns.formatNumber(avgTrade, 2))}   Won: ${C.green(ns.formatNumber(totalWonAmt, 2))}   Lost: ${C.red(ns.formatNumber(totalLostAmt, 2))}`);

    // Win/loss ratio bar: shows proportion of wins vs losses visually
    if (totalWins + totalLosses > 0) {
      const wFill = Math.round(lifetimeWR * BAR_W);
      const lFill = BAR_W - wFill;
      ns.print(`║  ${C.green("W")} ${C.green("█".repeat(wFill) + "░".repeat(lFill))} ${C.red("L")}  ${C.green(ns.formatNumber(totalWonAmt, 2))} ${C.dim("vs")} ${C.red(ns.formatNumber(totalLostAmt, 2))}`);
    }

    // -- Last 5 trades (detailed) --
    if (recentTrades.length > 0) {
      ns.print(`╠${LINE}╣`);
      ns.print(`║ ${C.cyan(C.bold(" LAST 5 TRADES"))}`);
      for (const t of [...recentTrades].reverse()) {
        const arrow  = t.pnl >= 0 ? C.green("▲") : C.red("▼");
        const dir    = t.type === "L" ? "Long " : "Short";
        const pnlStr = C.plcol(t.pnl, ((t.pnl >= 0 ? "+" : "") + ns.formatNumber(t.pnl, 2)).padStart(12));
        const retPct = t.cost > 0 ? (t.pnl / t.cost * 100) : 0;
        const retStr = C.plcol(t.pnl, (retPct >= 0 ? "+" : "") + retPct.toFixed(1) + "%");
        const tagStr = t.tag ? C.yellow(t.tag.trim()) : "";
        ns.print(`║  ${arrow} ${dir} ${t.sym.padEnd(5)} ${pnlStr}  ${retStr.padEnd(8)}  ${C.dim("T:" + String(t.tick))} ${tagStr}`);
      }
    }

    // ── Top opportunities radar (not shown in YOLO — one bet at a time) ──
    if (!YOLO) {
      const opps = Object.values(stocks)
        .filter(s => s.longShares === 0 && s.shortShares === 0)
        .map(s => ({ sym: s.sym, er: expectedReturn(s), f: has4S ? s.forecast : s.estForecast, inv: s.inversionFlag, stock: s }))
        .filter(o => Math.abs(o.er) > 0.0001 && !o.inv)
        .sort((x, y) => Math.abs(y.er) - Math.abs(x.er))
        .slice(0, 5);
      if (opps.length > 0) {
        ns.print(`╠${LINE}╣`);
        ns.print(`║ ${C.cyan("RADAR")}  — top unpositioned signals:`);
        for (const o of opps) {
          const dir    = o.f > 0.5 ? C.green("▲ LONG ") : C.red("▼ SHORT");
          const bar    = "█".repeat(Math.round(Math.abs(o.er) * 5000)).padEnd(8, "░");
          const erCol  = o.er > 0 ? C.green(o.er.toFixed(5)) : C.red(o.er.toFixed(5));
          const momo   = !has4S
            ? (o.stock.momentum > 0.001 ? C.green(" ↑") : o.stock.momentum < -0.001 ? C.red(" ↓") : C.dim(" ·"))
            : "";
          const sprd   = o.stock.spreadFrac > 0 ? C.dim(` spr:${(o.stock.spreadFrac * 100).toFixed(2)}%`) : "";
          ns.print(`║  ${dir} ${o.sym.padEnd(5)}  F:${o.f.toFixed(3)}  ER:${erCol}  ${C.dim(bar)}${momo}${sprd}`);
        }
      }
    }
    // ── Paper Lab compact section ──
    if (paperInitialized && paperPortfolios.length > 0) {
      ns.print(`╠${LINE}╣`);
      ns.print(`║ ${C.mag(C.bold(" PAPER LAB"))}  ${C.dim(`${paperTickCount}T / ${PAPER_GRADUATE_TICKS} to graduate`)}`);
      const _pN = paperPortfolios.length;
      const _ss  = Math.floor(paperTickCount / 60) % _pN;
      const _sso = (_ss + Math.floor(_pN / 2)) % _pN;
      const paperScored = paperPortfolios.map((port, pidx) => {
        const wins = port.trades.filter(t => t.pnl > 0).length;
        const total = port.trades.length;
        const wr = total > 0 ? wins / total : 0;
        let pVal = port.cash;
        for (const sym of symbols) {
          const pp = port.positions[sym];
          if (!pp) continue;
          if (pp.longShares > 0) pVal += pp.longShares * ns.stock.getBidPrice(sym);
          if (pp.shortShares > 0) pVal += pp.shortShares * (2 * pp.shortAvgPrice - ns.stock.getAskPrice(sym));
        }
        const pnl = pVal - port.startingCash;
        const isGrad = paperTickCount >= PAPER_GRADUATE_TICKS && pnl > 0 && wr >= PAPER_GRADUATE_WR;
        // Tag: [S!] = short-only, [S] = longs+shorts mixed rotation slot
        const modeTag = port.strat.shortOnly ? "[S!]" : (!has4S && pidx === _ss ? "[S] " : "    ");
        return { name: port.strat.name, pnl, wr, total, isGrad, modeTag };
      }).sort((x, y) => y.pnl - x.pnl);
      for (const s of paperScored) {
        const gradMark = s.isGrad ? C.green(" ★") : "  ";
        const nameStr  = s.isGrad ? C.green(s.name.padEnd(12)) : C.dim(s.name.padEnd(12));
        const pnlStr   = C.plcol(s.pnl, ns.formatNumber(s.pnl, 1).padStart(10));
        const wrRaw    = (s.total > 0 ? (s.wr * 100).toFixed(1) + "%" : "n/a").padStart(6);
        const wrStr    = s.total > 0 ? (s.wr >= PAPER_GRADUATE_WR ? C.green(wrRaw) : C.red(wrRaw)) : C.dim(wrRaw);
        ns.print(`║  ${nameStr} ${pnlStr}  ${wrStr}  ${C.dim(String(s.total) + "T")} ${C.cyan(s.modeTag)}${gradMark}`);
      }
    }
    ns.print(`╚${LINE}╝`);
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 14: MAIN TRADING LOOP
  // The core loop that runs forever (until script is killed).
  // Each iteration = one market tick (~6 seconds in Bitburner).
  //
  // Order of operations each tick:
  //   1. Wait for market tick (nextUpdate or fallback sleep)
  //   2. Periodically upgrade market access
  //   3. Update all stock data (prices, positions, estimates)
  //   4. Warmup check (skip trading if <10 ticks of data)
  //   5. Execute trades (sell first, then buy — or YOLO bet)
  //   6. Log any new trades
  //   7. Periodic session snapshot
  //   8. Redraw dashboard
  // ═══════════════════════════════════════════════════════════════

  // Write session header to log file
  const modeName = TURTLE ? "TURTLE" : (YOLO ? "YOLO" : "NORMAL");
  ns.write(LOG_FILE, `\n=== Session ${new Date().toISOString()} | ${modeName} ===\n`, "a");

  while (true) {
    // Wait for the game's stock market to tick (fires every ~6 seconds)
    // Fallback to sleep if nextUpdate throws (older Bitburner versions)
    try { await ns.stock.nextUpdate(); } catch { await ns.sleep(6000); }
    tickCount++;

    // Every 50 ticks: try to upgrade market access (in case player earned money)
    if (tickCount % 50 === 0) {
      if (CONFIG.autoBuyAccess) tryBuyAccess(ns);
      ({ hasTIX, has4S } = checkAccess(ns));

      // ── Safety net: attempt recovery from safe mode ──
      // If we've been in safe mode for 50+ ticks AND the last 10 trades
      // are looking healthy (WR >= 55%), re-enable the best known params.
      if (safeModeActive && (tickCount - safeModeRevertTick) >= 50) {
        const recent10  = rollingWindow.slice(-10);
        const r10Wins   = recent10.filter(p => p >= 0).length;
        const r10WR     = recent10.length >= 10 ? r10Wins / recent10.length : 0;
        if (r10WR >= 0.55) {
          // Performance has recovered — try loading proven params again
          if (TURTLE) {
            try {
              const raw = ns.read("/strats/proven.txt");
              if (raw && raw.length > 2) {
                const strats = JSON.parse(raw);
                strats.sort((x, y) => y.score.pnl - x.score.pnl);
                if (strats.length > 0 && strats[0].score.pnl > 0) {
                  provenParams = strats[0];
                  applyUpgrade(provenParams, 0.25);
                }
              }
            } catch { /* proven.txt unreadable — stay in safe mode */ }
          }
          consecutiveLosses  = 0;
          safeModeActive     = false;
        }
      }
    }

    // ── Update all stock data ──
    for (const sym of symbols) {
      const s = stocks[sym];

      // Record current price and trim history to window size
      s.priceHistory.push(ns.stock.getPrice(sym));
      if (s.priceHistory.length > CONFIG.tickHistoryLen) s.priceHistory.shift();

      // Sync position data from game (shares owned, avg price paid)
      const [ls, lap, ss, sap] = ns.stock.getPosition(sym);
      s.longShares = ls;  s.longAvgPrice = lap;
      s.shortShares = ss; s.shortAvgPrice = sap;

      // Always run estimation (keeps inversion detection warm even with 4S)
      runEstimation(s);

      // Overlay 4S data when available (more accurate than estimates)
      if (has4S) {
        s.forecast   = ns.stock.getForecast(sym);
        s.volatility = ns.stock.getVolatility(sym);
      }

      // Track bid-ask spread every tick (used in buyPhase spread filter).
      // Spread = cost we pay beyond the fair price on entry + exit.
      // Wide spreads erode edge; narrow spreads are cheap to trade.
      try {
        const ask = ns.stock.getAskPrice(sym);
        const bid = ns.stock.getBidPrice(sym);
        s.spreadFrac = ask > 0 ? (ask - bid) / ask : 0;
      } catch { s.spreadFrac = 0; }

      s.ticksSinceAction++;
    }

    // Initialize paper portfolios before the warmup guard so they're ready
    // as soon as trading starts (paper lab was never showing during warmup).
    if (!paperInitialized && hasTIX) {
      const startCash = totalWorth(ns);
      for (const port of paperPortfolios) {
        port.cash = startCash;
        port.startingCash = startCash;
        port.peakValue = startCash;
      }
      paperInitialized = true;
    }

    // Need ~10 ticks of price data before estimates are usable.
    if (!has4S && tickCount < 10) { printDashboard(); continue; }

    // ── Execute trades ──
    const tradesBefore = totalTradeCount;

    if (YOLO) {
      yoloBet();       // YOLO: one bet at a time
    } else {
      sellPhase();     // Normal/Turtle: sell weak positions first
      buyPhase();      // then buy strong signals with freed cash
    }

    // ── Log any trades that happened this tick ──
    const newTrades = totalTradeCount - tradesBefore;
    if (newTrades > 0) {
      for (let i = recentTrades.length - newTrades; i < recentTrades.length; i++) {
        if (i >= 0) doLogTrade(recentTrades[i]);
      }
    }

    // Snapshot session data every 100 ticks (~10 minutes)
    if (tickCount % 100 === 0) doLogSession();

    // ── Paper trading tick ──
    if (paperInitialized) {
      paperTickCount++;
      for (const port of paperPortfolios) {
        const strat = port.strat;
        // Sell phase
        for (const sym of symbols) {
          const s = stocks[sym];
          const f = has4S ? s.forecast : s.estForecast;
          const inv = s.inversionFlag;
          const er = (has4S ? s.volatility : estimateVolatility(s.priceHistory)) * (f - 0.5);
          const pp = port.positions[sym] || { longShares: 0, longAvgPrice: 0, shortShares: 0, shortAvgPrice: 0 };
          if (pp.longShares > 0 && (f < strat.forecastSellLong || er < 0 || inv)) {
            const exitPrice = ns.stock.getBidPrice(sym) * 0.997;
            const pnl = pp.longShares * (exitPrice - pp.longAvgPrice) - 2 * PAPER_COMMISSION;
            port.trades.push({ pnl, tick: paperTickCount });
            port.cash += pp.longShares * exitPrice - PAPER_COMMISSION;
            pp.longShares = 0; pp.longAvgPrice = 0;
          }
          if (pp.shortShares > 0 && (f > strat.forecastSellShort || er > 0 || inv)) {
            const exitPrice = ns.stock.getAskPrice(sym) * 1.003;
            const pnl = pp.shortShares * (pp.shortAvgPrice - exitPrice) - 2 * PAPER_COMMISSION;
            port.trades.push({ pnl, tick: paperTickCount });
            port.cash += pp.shortShares * (2 * pp.shortAvgPrice - exitPrice) - PAPER_COMMISSION;
            pp.shortShares = 0; pp.shortAvgPrice = 0;
          }
          port.positions[sym] = pp;
        }
        // Buy phase — 100% virtual, ZERO real money moved.
        // Only reads prices (getAskPrice/getBidPrice). Never calls buyStock/buyShort.
        // port.cash is a fake virtual bankroll — modifying it has no effect on real funds.
        if (port.cash >= 2e5) {
          let paperTW = port.cash;
          for (const sym of symbols) {
            const pp = port.positions[sym] || { longShares: 0, longAvgPrice: 0, shortShares: 0, shortAvgPrice: 0 };
            if (pp.longShares > 0) paperTW += pp.longShares * ns.stock.getBidPrice(sym);
            if (pp.shortShares > 0) paperTW += pp.shortShares * (2 * pp.shortAvgPrice - ns.stock.getAskPrice(sym));
          }
          const ranked = symbols.map(sym => {
            const s = stocks[sym];
            const f = has4S ? s.forecast : s.estForecast;
            const er = (has4S ? s.volatility : estimateVolatility(s.priceHistory)) * (f - 0.5);
            return { sym, f, er, inv: s.inversionFlag, maxShares: ns.stock.getMaxShares(sym) };
          }).filter(r => Math.abs(r.er) > strat.buyThreshold && !r.inv)
            .sort((x, y) => Math.abs(y.er) - Math.abs(x.er));
          // In EST mode: cap forecastBuyLong at 0.62 so high-threshold
          // strategies (Turtle 0.65, Sniper 0.70) can still get test trades.
          // Rotate 2 shorts slots every 60 ticks so every strategy cycles
          // through shorts exposure. shortsSlot = longs+shorts mixed.
          // shortsOnlySlot = NO longs, shorts only (pure short strategy test).
          const portIdx = paperPortfolios.indexOf(port);
          const nStrats = paperPortfolios.length;
          const shortsSlot    = Math.floor(paperTickCount / 60) % nStrats;
          const isShortOnly   = !!strat.shortOnly;  // ShortTheory: only ever shorts
          const isShortsMixed = has4S || (!isShortOnly && portIdx === shortsSlot);
          const effectiveBuyLong  = has4S ? strat.forecastBuyLong  : Math.min(strat.forecastBuyLong,  0.62);
          const effectiveBuyShort = has4S ? strat.forecastBuyShort : Math.max(strat.forecastBuyShort, 0.38);
          for (const r of ranked) {
            if (port.cash < 2e5) break;
            const pp = port.positions[r.sym] || { longShares: 0, longAvgPrice: 0, shortShares: 0, shortAvgPrice: 0 };
            const budget = Math.min(port.cash, paperTW * strat.maxPct);
            if (budget < 2e5) continue;
            if (!isShortOnly && r.f > effectiveBuyLong) {
              const price = ns.stock.getAskPrice(r.sym);
              const shares = Math.min(Math.floor((budget - PAPER_COMMISSION) / price), r.maxShares - pp.longShares);
              if (shares > 0 && shares * price + PAPER_COMMISSION <= port.cash) {
                const tot = pp.longShares + shares;
                pp.longAvgPrice = (pp.longAvgPrice * pp.longShares + price * shares) / tot;
                pp.longShares = tot;
                port.cash -= shares * price + PAPER_COMMISSION;
              }
            } else if (r.f < effectiveBuyShort && (isShortsMixed || isShortOnly)) {
              const price = ns.stock.getBidPrice(r.sym);
              const shares = Math.min(Math.floor((budget - PAPER_COMMISSION) / price), r.maxShares - pp.shortShares);
              if (shares > 0 && shares * price + PAPER_COMMISSION <= port.cash) {
                const tot = pp.shortShares + shares;
                pp.shortAvgPrice = (pp.shortAvgPrice * pp.shortShares + price * shares) / tot;
                pp.shortShares = tot;
                port.cash -= shares * price + PAPER_COMMISSION;
              }
            }
            port.positions[r.sym] = pp;
          }
        }
        // Track drawdown
        let pVal = port.cash;
        for (const sym of symbols) {
          const pp = port.positions[sym];
          if (!pp) continue;
          if (pp.longShares > 0) pVal += pp.longShares * ns.stock.getBidPrice(sym);
          if (pp.shortShares > 0) pVal += pp.shortShares * (2 * pp.shortAvgPrice - ns.stock.getAskPrice(sym));
        }
        port.returns.push(pVal);
        if (pVal > port.peakValue) port.peakValue = pVal;
        const dd = pVal - port.peakValue;
        if (dd < port.maxDrawdown) port.maxDrawdown = dd;
      }
      // Graduate check every 50 ticks after minimum
      if (paperTickCount >= PAPER_GRADUATE_TICKS && paperTickCount % 50 === 0) {
        const proven = paperPortfolios.map(port => {
          const wins = port.trades.filter(t => t.pnl > 0).length;
          const total = port.trades.length;
          const wr = total > 0 ? wins / total : 0;
          let pVal = port.cash;
          for (const sym of symbols) {
            const pp = port.positions[sym];
            if (!pp) continue;
            if (pp.longShares > 0) pVal += pp.longShares * ns.stock.getBidPrice(sym);
          }
          const pnl = pVal - port.startingCash;
          if (pnl > 0 && wr >= PAPER_GRADUATE_WR) {
            return { name: port.strat.name, params: { forecastBuyLong: port.strat.forecastBuyLong, forecastBuyShort: port.strat.forecastBuyShort, forecastSellLong: port.strat.forecastSellLong, forecastSellShort: port.strat.forecastSellShort, buyThreshold: port.strat.buyThreshold, maxPortfolioPct: port.strat.maxPct }, score: { pnl, winRate: wr, trades: total, maxDrawdown: port.maxDrawdown }, ticksTested: paperTickCount, graduatedAt: Date.now() };
          }
          return null;
        }).filter(Boolean);
        if (proven.length > 0) {
          await ns.write("/strats/proven.txt", JSON.stringify(proven, null, 2), "w");
          // Upgrade main CONFIG based on the best graduating strategy (25% nudge).
          proven.sort((a, b) => b.score.pnl - a.score.pnl);
          applyUpgrade(proven[0], 0.25);
          // Export to disk via local HTTP so external tools can read results.
          try { await fetch("http://127.0.0.1:12526/proven", { method: "POST", body: JSON.stringify(proven) }); } catch { /* server not running — ignore */ }
        }
      }
    }

    // Redraw the dashboard
    printDashboard();
  }
}

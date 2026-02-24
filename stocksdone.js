// Usage: run stocksdone.js [--turtle] [--yolo] [--momentum] [--sniper] [--spray] [--kelly] [--liquidate] [--theme classic|neon|matrix|ocean|fire]
//
// Modes:
//   (default) Normal  — balanced thresholds, diversified positions
//   --turtle          — conservative, loads paper-trader proven params (or hardcoded safe defaults)
//   --yolo            — single 10% bet at a time, 24-min loss cooldown
//   --momentum        — confirmation entry: only buys when forecast is accelerating in trade direction
//   --sniper          — ultra-high conviction, max 3 positions, 45% per-stock cap, requires 4S+est agreement
//   --spray           — wide diversification, up to 10 positions, accepts weaker signals
//   --kelly           — Kelly criterion sizing: allocates capital proportional to edge/volatility ratio
//
// Shared libraries loaded dynamically with fallbacks (see /lib/ for full docs):
//   themes.js   — color palettes and ANSI helpers
//   market.js   — auto-purchase WSE/TIX/4S access
//   estimate.js — price-history-based forecast estimation
//   portfolio.js — net worth calc and sparkline graphs
//   logging.js  — trade log and session snapshots
// All lib files are optional — if missing, built-in fallbacks activate automatically.

// ── Built-in fallbacks (active when /lib/ files are absent) ──
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

async function _loadLibs(ns) {
  const chk = p => ns.fileExists(p) ? import(p).catch(()=>null) : Promise.resolve(null);
  const [t,m,e,p,l] = await Promise.all([chk("/lib/themes.js"),chk("/lib/market.js"),chk("/lib/estimate.js"),chk("/lib/portfolio.js"),chk("/lib/logging.js")]);
  const missing = [!t&&"/lib/themes.js",!m&&"/lib/market.js",!e&&"/lib/estimate.js",!p&&"/lib/portfolio.js",!l&&"/lib/logging.js"].filter(Boolean);
  if (missing.length) ns.tprint(`WARN: Missing libs — using fallbacks: ${missing.join(", ")}`);
  return {
    getTheme:           t?.getTheme           ?? _fbGetTheme,
    makeColors:         t?.makeColors         ?? _fbMakeColors,
    tryBuyAccess:       m?.tryBuyAccess       ?? _fbTryBuyAccess,
    checkAccess:        m?.checkAccess        ?? _fbCheckAccess,
    waitForTIX:         m?.waitForTIX         ?? _fbWaitForTIX,
    estimateForecast:   e?.estimateForecast   ?? _fbEstFc,
    estimateVolatility: e?.estimateVolatility ?? _fbEstVol,
    totalWorth:         p?.totalWorth         ?? _fbTotalWorth,
    sparkline:          p?.sparkline          ?? _fbSparkline,
    logTrade:           l?.logTrade           ?? _fbLogTrade,
    logSnapshot:        l?.logSnapshot        ?? _fbLogSnap,
  };
}

/** @param {NS} ns */
export async function main(ns) {
  // ╔══════════════════════════════════════════════════════════════╗
  // ║  stocksdone — Multi-Mode Stock Trader                       ║
  // ║                                                             ║
  // ║  7 trading modes in one script:                             ║
  // ║    Normal   — balanced thresholds, buys many stocks         ║
  // ║    Turtle   — conservative, high-confidence trades only     ║
  // ║    YOLO     — single 10% bet at a time, 24min loss cooldown ║
  // ║    Momentum — only buys while forecast is accelerating      ║
  // ║    Sniper   — ultra-high conviction, 3 positions max        ║
  // ║    Spray    — wide diversification, 10 positions            ║
  // ║    Kelly    — mathematically optimal position sizing        ║
  // ║                                                             ║
  // ║  Works with or without 4S data (estimates from prices).     ║
  // ║  Always keeps $1m cash reserve for safety.                  ║
  // ║  Auto-buys market access tiers as you earn more money.      ║
  // ╚══════════════════════════════════════════════════════════════╝

  ns.disableLog("ALL");
  ns.tail();

  const { getTheme, makeColors, tryBuyAccess, checkAccess, waitForTIX,
          estimateForecast, estimateVolatility, totalWorth, sparkline,
          logTrade, logSnapshot } = await _loadLibs(ns);


  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: MODE FLAGS + THEME
  // ═══════════════════════════════════════════════════════════════

  const TURTLE    = ns.args.includes("--turtle");    // conservative mode
  const YOLO      = ns.args.includes("--yolo");      // single-bet gambling mode
  const MOMENTUM  = ns.args.includes("--momentum");  // forecast-acceleration confirmation entry
  const SNIPER    = ns.args.includes("--sniper");    // ultra-high conviction, 3 positions max
  const SPRAY     = ns.args.includes("--spray");     // diversified spray across 10 stocks
  const KELLY     = ns.args.includes("--kelly");     // Kelly criterion position sizing
  const LIQUIDATE = ns.args.includes("--liquidate"); // emergency sell-all

  const { theme, name: THEME } = getTheme(ns);
  const C = makeColors(theme);


  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  const CONFIG = {
    // ── Risk management ──
    reserveCash:      1_000_000,
    maxDeploy:        0.80,
    maxPortfolioPct:  0.34,
    commission:       100_000,

    // ── Buy thresholds ──
    forecastBuyLong:  0.575,
    forecastBuyShort: 0.425,
    buyThreshold4S:   0.0001,
    buyThresholdEst:  0.0015,

    // ── Sell thresholds ──
    forecastSellLong:  0.5,
    forecastSellShort: 0.5,
    sellThreshold4S:   0,
    sellThresholdEst:  0.0005,

    // ── Estimation engine ──
    tickHistoryLen:   80,
    longWindow:       76,
    shortWindow:      10,
    inversionDelta:   0.15,

    autoBuyAccess:    true,

    // ── Stale position exit ──
    staleExitTicks:   75,
    staleNeutralBand: 0.02,

    // ── Flat market short-circuit ──
    flatBuySkipFloor: 0.0003,
    flatBuySkipTicks: 3,

    // ── Momentum mode ──
    // momentumScore = (forecast_now - forecast_N_ticks_ago) / N
    // Positive = bullish acceleration, negative = bearish acceleration
    momentumWindow:   3,          // ticks over which to measure forecast acceleration
    momentumMinScore: 0.003,      // min forecast change per tick to confirm entry signal

    // ── Sniper mode ──
    sniperMaxPositions: 3,        // max concurrent positions
    sniperFcstConfirm:  true,     // require 4S and estimated forecast to agree on direction

    // ── Spray mode ──
    sprayMaxPositions: 10,        // max concurrent positions
  };


  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: TURTLE MODE OVERRIDES
  // ═══════════════════════════════════════════════════════════════

  let provenParams = null;

  if (TURTLE) {
    try {
      const raw = ns.read("/strats/proven.txt");
      if (raw && raw.length > 2) {
        const strats = JSON.parse(raw);
        if (strats.length > 0) {
          strats.sort((x, y) => y.score.pnl - x.score.pnl);
          provenParams = strats[0];
        }
      }
    } catch { /* file doesn't exist yet */ }

    if (provenParams && provenParams.score.pnl > 0) {
      const p = provenParams.params;
      CONFIG.forecastBuyLong  = p.forecastBuyLong;
      CONFIG.forecastBuyShort = p.forecastBuyShort;
      CONFIG.forecastSellLong = p.forecastSellLong;
      CONFIG.forecastSellShort = p.forecastSellShort;
      CONFIG.buyThreshold4S   = p.buyThreshold;
      CONFIG.buyThresholdEst  = p.buyThreshold;
      CONFIG.maxPortfolioPct  = p.maxPortfolioPct;
    } else {
      CONFIG.forecastBuyLong  = 0.65;
      CONFIG.forecastBuyShort = 0.35;
      CONFIG.forecastSellLong = 0.52;
      CONFIG.forecastSellShort = 0.48;
      CONFIG.buyThreshold4S   = 0.002;
      CONFIG.buyThresholdEst  = 0.003;
      CONFIG.maxPortfolioPct  = 0.20;
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 3B: NEW MODE CONFIG OVERRIDES
  // Each new mode shares the same data infrastructure as Normal mode
  // but uses different entry/exit thresholds and position sizing.
  // ═══════════════════════════════════════════════════════════════

  if (MOMENTUM) {
    // Tighter entry thresholds — only buy when forecast is accelerating.
    // The momentumBuyPhase adds an additional filter: momentumScore must
    // exceed momentumMinScore in the trade direction before entry.
    CONFIG.forecastBuyLong   = 0.60;  // need 60% conviction (vs 57.5% normal)
    CONFIG.forecastBuyShort  = 0.40;
    CONFIG.forecastSellLong  = 0.52;  // exit early to protect gains
    CONFIG.forecastSellShort = 0.48;
    CONFIG.maxPortfolioPct   = 0.28;  // 28% per stock (vs 34% normal)
  }

  if (SNIPER) {
    // Extreme thresholds — very few trades, very heavy position sizing.
    // sniperBuy() only enters the single BEST opportunity per tick,
    // and requires BOTH 4S and estimated forecast to agree on direction.
    CONFIG.forecastBuyLong   = 0.70;  // need 70% conviction
    CONFIG.forecastBuyShort  = 0.30;
    CONFIG.forecastSellLong  = 0.52;  // exit earlier to protect large bets
    CONFIG.forecastSellShort = 0.48;
    CONFIG.buyThreshold4S    = 0.004; // 40x higher threshold than Normal
    CONFIG.buyThresholdEst   = 0.006; // 4x higher than Normal
    CONFIG.maxPortfolioPct   = 0.45;  // concentrate 45% in a single sniper shot
  }

  if (SPRAY) {
    // Low thresholds — accept many weak signals, rely on diversification.
    // Warning: commission costs ($100k/trade) eat small positions.
    // Spray works best with a large bankroll (>$500m).
    CONFIG.forecastBuyLong   = 0.55;  // accept slightly-bullish signals
    CONFIG.forecastBuyShort  = 0.45;
    CONFIG.forecastSellLong  = 0.502; // exit almost immediately on reversal
    CONFIG.forecastSellShort = 0.498;
    CONFIG.buyThreshold4S    = 0.00005; // accept very weak 4S signals
    CONFIG.buyThresholdEst   = 0.0008;
    CONFIG.maxPortfolioPct   = 0.12;  // 12% per stock — 10 stocks = 120% cap (unreachable)
  }

  // KELLY: uses Normal thresholds — only position sizing differs.
  // kellyBuyPhase() calculates kelly fraction = |ER| / volatility
  // and allocates budget proportionally rather than equally.


  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: STATE
  // ═══════════════════════════════════════════════════════════════

  const stocks         = {};
  let   has4S          = false;
  let   hasTIX         = false;
  let   hasShorts      = true;
  let   tickCount      = 0;
  let   totalProfit    = 0;
  let   totalTradeCount = 0;
  let   flatTicks      = 0;
  const sessionStart   = Date.now();
  const worthHistory   = [];
  const recentTrades   = [];

  const yolo = {
    cooldownUntil: 0,
    wins:      0,
    losses:    0,
    totalWon:  0,
    totalLost: 0,
    activeBet: null,
    history:   [],
  };


  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: EMERGENCY LIQUIDATE
  // ═══════════════════════════════════════════════════════════════

  if (LIQUIDATE) {
    try { hasTIX = ns.stock.hasTIXAPIAccess(); } catch { /* */ }
    for (const sym of ns.stock.getSymbols()) {
      const [ls, , ss] = ns.stock.getPosition(sym);
      if (ls > 0) ns.stock.sellStock(sym, ls);
      if (ss > 0) try { ns.stock.sellShort(sym, ss); } catch { /* */ }
    }
    ns.tprint("All positions liquidated.");
    return;
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: MARKET ACCESS + STOCK INIT
  // ═══════════════════════════════════════════════════════════════

  if (CONFIG.autoBuyAccess) tryBuyAccess(ns);
  ({ hasTIX, has4S } = checkAccess(ns));

  if (!hasTIX) {
    ({ hasTIX, has4S } = await waitForTIX(ns));
  }

  const symbols = ns.stock.getSymbols();
  for (const sym of symbols) {
    stocks[sym] = {
      sym,
      priceHistory:    [],
      forecast:        0.5,
      volatility:      0.01,
      estForecast:     0.5,
      estForecastShort: 0.5,
      longShares:      0,
      longAvgPrice:    0,
      shortShares:     0,
      shortAvgPrice:   0,
      maxShares:       ns.stock.getMaxShares(sym),
      ticksSinceAction: 999,
      positionOpenTick: 0,
      inversionFlag:   false,
      forecastHistory: [],   // rolling window of forecasts — used by momentumScore()
    };
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: DATA ENGINE
  // ═══════════════════════════════════════════════════════════════

  function runEstimation(stock) {
    const est = estimateForecast(stock.priceHistory, CONFIG.longWindow, CONFIG.shortWindow, CONFIG.inversionDelta);
    stock.estForecast      = est.forecast;
    stock.estForecastShort = est.forecastShort;
    stock.inversionFlag    = est.inversionFlag;
  }

  // Core metric. Positive ER = expected profit per tick, negative = expected loss.
  // ER = volatility * (forecast - 0.5)
  function expectedReturn(stock) {
    const f = has4S ? stock.forecast : stock.estForecast;
    const v = has4S ? stock.volatility : estimateVolatility(stock.priceHistory);
    return v * (f - 0.5);
  }

  // Momentum score: average forecast change per tick over the last N ticks.
  // Positive = forecast trending bullish (rising), negative = trending bearish (falling).
  // Returns 0 if there is insufficient history to measure.
  function momentumScore(stock) {
    const h = stock.forecastHistory;
    const w = CONFIG.momentumWindow;
    if (h.length < w + 1) return 0;
    return (h[h.length - 1] - h[h.length - 1 - w]) / w;
  }

  // Kelly fraction for a stock: measures edge relative to risk.
  // Higher kelly = better bang-per-buck. Used for proportional budget allocation.
  // Formula: |ER| / volatility  (simplified Kelly for binary-like market outcomes)
  function kellyFraction(stock) {
    const er  = expectedReturn(stock);
    const vol = has4S ? stock.volatility : estimateVolatility(stock.priceHistory);
    return vol > 0.001 ? Math.abs(er) / vol : 0;
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: TRADE HELPERS
  // ═══════════════════════════════════════════════════════════════

  function recordTrade(sym, type, pnl) {
    totalProfit += pnl;
    recentTrades.push({ sym, type, pnl, tick: tickCount });
    if (recentTrades.length > 5) recentTrades.shift();
    totalTradeCount++;
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 9: SELL PHASE (shared by Normal, Turtle, Sniper, Spray, Kelly)
  // ═══════════════════════════════════════════════════════════════

  function sellPhase() {
    const sellThreshold = has4S ? CONFIG.sellThreshold4S : CONFIG.sellThresholdEst;

    for (const sym of Object.keys(stocks)) {
      const s  = stocks[sym];
      const f  = has4S ? s.forecast : s.estForecast;
      const er = expectedReturn(s);

      const stale = s.positionOpenTick > 0
        && (tickCount - s.positionOpenTick) > CONFIG.staleExitTicks
        && Math.abs(f - 0.5) < CONFIG.staleNeutralBand;

      if (s.longShares > 0) {
        if (f < CONFIG.forecastSellLong || er < sellThreshold || s.inversionFlag || stale) {
          try {
            const pnl = ns.stock.getSaleGain(sym, s.longShares, "Long") - s.longShares * s.longAvgPrice;
            ns.stock.sellStock(sym, s.longShares);
            recordTrade(sym, "L", pnl);
            s.ticksSinceAction = 0;
            s.positionOpenTick = 0;
          } catch { /* */ }
        }
      }

      if (s.shortShares > 0 && hasShorts) {
        if (f > CONFIG.forecastSellShort || er > -sellThreshold || s.inversionFlag || stale) {
          try {
            const pnl = ns.stock.getSaleGain(sym, s.shortShares, "Short") - s.shortShares * s.shortAvgPrice;
            ns.stock.sellShort(sym, s.shortShares);
            recordTrade(sym, "S", pnl);
            s.ticksSinceAction = 0;
            s.positionOpenTick = 0;
          } catch { hasShorts = false; }
        }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 10: BUY PHASE (Normal / Turtle / Kelly-compatible base)
  // ═══════════════════════════════════════════════════════════════

  function buyPhase() {
    const maxER = Object.values(stocks).reduce((mx, s) => Math.max(mx, Math.abs(expectedReturn(s))), 0);
    if (maxER < CONFIG.flatBuySkipFloor) {
      if (++flatTicks >= CONFIG.flatBuySkipTicks) return;
    } else {
      flatTicks = 0;
    }

    const cash = ns.getServerMoneyAvailable("home") - CONFIG.reserveCash;
    if (cash < 1e6) return;

    const tw           = totalWorth(ns);
    const maxPerStock  = tw * CONFIG.maxPortfolioPct;
    const buyThreshold = has4S ? CONFIG.buyThreshold4S : CONFIG.buyThresholdEst;
    const invested     = tw - ns.getServerMoneyAvailable("home");
    const spendable    = Math.min(cash, tw * CONFIG.maxDeploy - invested);
    if (spendable < 1e6) return;

    const ranked = Object.values(stocks)
      .map(s => ({
        sym:      s.sym,
        er:       expectedReturn(s),
        forecast: has4S ? s.forecast : s.estForecast,
        stock:    s,
      }))
      .filter(r => Math.abs(r.er) > buyThreshold && !r.stock.inversionFlag)
      .sort((x, y) => Math.abs(y.er) - Math.abs(x.er));

    let avail = spendable;

    for (const r of ranked) {
      if (avail < 2e6) break;
      const s = r.stock;

      const curLongVal  = s.longShares > 0  ? ns.stock.getSaleGain(s.sym, s.longShares, "Long")   : 0;
      const curShortVal = s.shortShares > 0 ? ns.stock.getSaleGain(s.sym, s.shortShares, "Short") : 0;
      const budget = Math.min(avail, maxPerStock - curLongVal - curShortVal);
      if (budget < 2e6) continue;

      if (r.forecast > CONFIG.forecastBuyLong) {
        const price  = ns.stock.getAskPrice(r.sym);
        const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), s.maxShares - s.longShares);
        if (shares > 0) {
          const cost = ns.stock.getPurchaseCost(r.sym, shares, "Long");
          if (cost <= avail) {
            const boughtAt = ns.stock.buyStock(r.sym, shares);
            if (boughtAt > 0) {
              avail -= cost;
              s.ticksSinceAction = 0;
              if (s.positionOpenTick === 0) s.positionOpenTick = tickCount;
            }
          }
        }
      } else if (r.forecast < CONFIG.forecastBuyShort && hasShorts) {
        try {
          const price  = ns.stock.getBidPrice(r.sym);
          const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), s.maxShares - s.shortShares);
          if (shares > 0) {
            const cost = ns.stock.getPurchaseCost(r.sym, shares, "Short");
            if (cost <= avail) {
              const boughtAt = ns.stock.buyShort(r.sym, shares);
              if (boughtAt > 0) {
                avail -= cost;
                s.ticksSinceAction = 0;
                if (s.positionOpenTick === 0) s.positionOpenTick = tickCount;
              }
            }
          }
        } catch { hasShorts = false; }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 11: YOLO ENGINE
  // ═══════════════════════════════════════════════════════════════

  function yoloBet() {
    if (yolo.activeBet) {
      const bet = yolo.activeBet;
      const s   = stocks[bet.sym];
      const f   = has4S ? s.forecast : s.estForecast;

      let shouldSell = false;
      if (bet.type === "Long")  shouldSell = f < 0.5 || s.longShares === 0;
      if (bet.type === "Short") shouldSell = f > 0.5 || s.shortShares === 0;

      if (shouldSell) {
        let pnl = 0;
        if (bet.type === "Long" && s.longShares > 0) {
          pnl = ns.stock.getSaleGain(bet.sym, s.longShares, "Long") - s.longShares * s.longAvgPrice;
          ns.stock.sellStock(bet.sym, s.longShares);
        } else if (bet.type === "Short" && s.shortShares > 0) {
          try {
            pnl = ns.stock.getSaleGain(bet.sym, s.shortShares, "Short") - s.shortShares * s.shortAvgPrice;
            ns.stock.sellShort(bet.sym, s.shortShares);
          } catch { hasShorts = false; }
        }

        recordTrade(bet.sym, bet.type === "Long" ? "L" : "S", pnl);

        if (pnl >= 0) {
          yolo.wins++;
          yolo.totalWon += pnl;
        } else {
          yolo.losses++;
          yolo.totalLost += Math.abs(pnl);
          yolo.cooldownUntil = Date.now() + 24 * 60 * 1000;
        }
        yolo.history.push(pnl);
        if (yolo.history.length > 20) yolo.history.shift();
        yolo.activeBet = null;
      }
      return;
    }

    if (Date.now() < yolo.cooldownUntil) return;

    const tw      = totalWorth(ns);
    const betSize = tw * 0.10;
    if (betSize < 2e6) return;

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

    if (!best) return;

    if (best.f > 0.5) {
      const price  = ns.stock.getAskPrice(best.sym);
      const shares = Math.min(Math.floor((betSize - CONFIG.commission) / price), best.stock.maxShares);
      if (shares > 0) {
        ns.stock.buyStock(best.sym, shares);
        yolo.activeBet = { sym: best.sym, type: "Long", shares, entryPrice: price, tick: tickCount };
      }
    } else if (hasShorts) {
      try {
        const price  = ns.stock.getBidPrice(best.sym);
        const shares = Math.min(Math.floor((betSize - CONFIG.commission) / price), best.stock.maxShares);
        if (shares > 0) {
          ns.stock.buyShort(best.sym, shares);
          yolo.activeBet = { sym: best.sym, type: "Short", shares, entryPrice: price, tick: tickCount };
        }
      } catch { hasShorts = false; }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 11B: MOMENTUM TRADING
  //
  // Strategy: only enter when the forecast is accelerating in the
  // trade direction. momentumScore() measures the rate of forecast
  // change over the last N ticks. A positive score means the
  // bullish signal is STRENGTHENING — not just present, but growing.
  //
  // Entry: forecast > threshold AND momentumScore > momentumMinScore
  // Exit:  standard conditions OR momentum reversal (score flips sign)
  //
  // Why this works: buying a rising forecast has better timing than
  // buying a static one. You enter as the signal builds and exit as
  // it starts to decay — often capturing the peak of the move.
  // ═══════════════════════════════════════════════════════════════

  function momentumSellPhase() {
    const sellThreshold = has4S ? CONFIG.sellThreshold4S : CONFIG.sellThresholdEst;

    for (const sym of Object.keys(stocks)) {
      const s  = stocks[sym];
      const f  = has4S ? s.forecast : s.estForecast;
      const er = expectedReturn(s);
      const mo = momentumScore(s);

      const stale = s.positionOpenTick > 0
        && (tickCount - s.positionOpenTick) > CONFIG.staleExitTicks
        && Math.abs(f - 0.5) < CONFIG.staleNeutralBand;

      if (s.longShares > 0) {
        // Exit long when: standard exit OR momentum has turned negative
        // (0.5x threshold: don't exit on tiny wobbles, only clear reversals)
        const moReversed = mo < -CONFIG.momentumMinScore * 0.5;
        if (f < CONFIG.forecastSellLong || er < sellThreshold || s.inversionFlag || stale || moReversed) {
          try {
            const pnl = ns.stock.getSaleGain(sym, s.longShares, "Long") - s.longShares * s.longAvgPrice;
            ns.stock.sellStock(sym, s.longShares);
            recordTrade(sym, "L", pnl);
            s.ticksSinceAction = 0;
            s.positionOpenTick = 0;
          } catch { /* */ }
        }
      }

      if (s.shortShares > 0 && hasShorts) {
        // Exit short when momentum has turned positive
        const moReversed = mo > CONFIG.momentumMinScore * 0.5;
        if (f > CONFIG.forecastSellShort || er > -sellThreshold || s.inversionFlag || stale || moReversed) {
          try {
            const pnl = ns.stock.getSaleGain(sym, s.shortShares, "Short") - s.shortShares * s.shortAvgPrice;
            ns.stock.sellShort(sym, s.shortShares);
            recordTrade(sym, "S", pnl);
            s.ticksSinceAction = 0;
            s.positionOpenTick = 0;
          } catch { hasShorts = false; }
        }
      }
    }
  }

  function momentumBuyPhase() {
    const maxER = Object.values(stocks).reduce((mx, s) => Math.max(mx, Math.abs(expectedReturn(s))), 0);
    if (maxER < CONFIG.flatBuySkipFloor) {
      if (++flatTicks >= CONFIG.flatBuySkipTicks) return;
    } else {
      flatTicks = 0;
    }

    const cash = ns.getServerMoneyAvailable("home") - CONFIG.reserveCash;
    if (cash < 1e6) return;

    const tw          = totalWorth(ns);
    const maxPerStock = tw * CONFIG.maxPortfolioPct;
    const buyThreshold = has4S ? CONFIG.buyThreshold4S : CONFIG.buyThresholdEst;
    const invested    = tw - ns.getServerMoneyAvailable("home");
    const spendable   = Math.min(cash, tw * CONFIG.maxDeploy - invested);
    if (spendable < 1e6) return;

    const ranked = Object.values(stocks)
      .map(s => ({
        sym:      s.sym,
        er:       expectedReturn(s),
        forecast: has4S ? s.forecast : s.estForecast,
        mo:       momentumScore(s),
        stock:    s,
      }))
      .filter(r => {
        if (Math.abs(r.er) <= buyThreshold) return false;
        if (r.stock.inversionFlag) return false;
        // Momentum confirmation filter: forecast must be actively moving toward the trade
        if (r.forecast > CONFIG.forecastBuyLong  && r.mo < CONFIG.momentumMinScore)  return false;
        if (r.forecast < CONFIG.forecastBuyShort && r.mo > -CONFIG.momentumMinScore) return false;
        return true;
      })
      .sort((x, y) => Math.abs(y.er) - Math.abs(x.er));

    let avail = spendable;
    for (const r of ranked) {
      if (avail < 2e6) break;
      const s = r.stock;

      const curLongVal  = s.longShares > 0  ? ns.stock.getSaleGain(s.sym, s.longShares, "Long")   : 0;
      const curShortVal = s.shortShares > 0 ? ns.stock.getSaleGain(s.sym, s.shortShares, "Short") : 0;
      const budget = Math.min(avail, maxPerStock - curLongVal - curShortVal);
      if (budget < 2e6) continue;

      if (r.forecast > CONFIG.forecastBuyLong) {
        const price  = ns.stock.getAskPrice(r.sym);
        const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), s.maxShares - s.longShares);
        if (shares > 0) {
          const cost = ns.stock.getPurchaseCost(r.sym, shares, "Long");
          if (cost <= avail) {
            const boughtAt = ns.stock.buyStock(r.sym, shares);
            if (boughtAt > 0) {
              avail -= cost;
              s.ticksSinceAction = 0;
              if (s.positionOpenTick === 0) s.positionOpenTick = tickCount;
            }
          }
        }
      } else if (r.forecast < CONFIG.forecastBuyShort && hasShorts) {
        try {
          const price  = ns.stock.getBidPrice(r.sym);
          const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), s.maxShares - s.shortShares);
          if (shares > 0) {
            const cost = ns.stock.getPurchaseCost(r.sym, shares, "Short");
            if (cost <= avail) {
              const boughtAt = ns.stock.buyShort(r.sym, shares);
              if (boughtAt > 0) {
                avail -= cost;
                s.ticksSinceAction = 0;
                if (s.positionOpenTick === 0) s.positionOpenTick = tickCount;
              }
            }
          }
        } catch { hasShorts = false; }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 11C: SNIPER MODE
  //
  // Strategy: wait for a very rare, very high-conviction setup,
  // then place a large concentrated bet (up to 45% of worth).
  // Maximum 3 concurrent positions — this is not diversification,
  // this is precision targeting.
  //
  // Entry requirements:
  //   1. ER > 0.004 (40x Normal threshold) — extremely strong signal
  //   2. Forecast > 0.70 / < 0.30 (vs 0.575 / 0.425 in Normal)
  //   3. When 4S available: estimated forecast must agree on direction
  //   4. No inversion flag
  //   5. Fewer than 3 open positions
  //
  // The agreement check (4S + estimated) filters out cases where
  // the official forecast looks great but the price history tells
  // a different story — a common sign of an imminent flip.
  // ═══════════════════════════════════════════════════════════════

  function sniperBuy() {
    const positionCount = Object.values(stocks).filter(s => s.longShares > 0 || s.shortShares > 0).length;
    if (positionCount >= CONFIG.sniperMaxPositions) return;

    const cash = ns.getServerMoneyAvailable("home") - CONFIG.reserveCash;
    if (cash < 2e6) return;

    const tw       = totalWorth(ns);
    const invested = tw - ns.getServerMoneyAvailable("home");
    const spendable = Math.min(cash, tw * CONFIG.maxDeploy - invested);
    if (spendable < 2e6) return;

    const buyThreshold = has4S ? CONFIG.buyThreshold4S : CONFIG.buyThresholdEst;

    // Find the single best opportunity that clears all sniper filters
    const best = Object.values(stocks)
      .filter(s => s.longShares === 0 && s.shortShares === 0 && !s.inversionFlag)
      .map(s => {
        const er  = expectedReturn(s);
        const f4S = has4S ? s.forecast : null;
        const fEst = s.estForecast;
        // Agreement check: 4S and estimated forecast must agree on direction
        const agree = !has4S || !CONFIG.sniperFcstConfirm
          || (f4S > 0.5 && fEst > 0.52)
          || (f4S < 0.5 && fEst < 0.48);
        return { sym: s.sym, er, f: has4S ? s.forecast : s.estForecast, stock: s, agree };
      })
      .filter(r => Math.abs(r.er) > buyThreshold && r.agree)
      .filter(r => r.f > CONFIG.forecastBuyLong || r.f < CONFIG.forecastBuyShort)
      .sort((x, y) => Math.abs(y.er) - Math.abs(x.er))[0];

    if (!best) return;

    const maxPerStock = tw * CONFIG.maxPortfolioPct;
    const budget = Math.min(spendable, maxPerStock);
    if (budget < 2e6) return;

    if (best.f > CONFIG.forecastBuyLong) {
      const price  = ns.stock.getAskPrice(best.sym);
      const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), best.stock.maxShares);
      if (shares > 0) {
        const cost = ns.stock.getPurchaseCost(best.sym, shares, "Long");
        if (cost <= spendable) {
          const boughtAt = ns.stock.buyStock(best.sym, shares);
          if (boughtAt > 0) {
            best.stock.ticksSinceAction = 0;
            if (best.stock.positionOpenTick === 0) best.stock.positionOpenTick = tickCount;
          }
        }
      }
    } else if (best.f < CONFIG.forecastBuyShort && hasShorts) {
      try {
        const price  = ns.stock.getBidPrice(best.sym);
        const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), best.stock.maxShares);
        if (shares > 0) {
          const cost = ns.stock.getPurchaseCost(best.sym, shares, "Short");
          if (cost <= spendable) {
            const boughtAt = ns.stock.buyShort(best.sym, shares);
            if (boughtAt > 0) {
              best.stock.ticksSinceAction = 0;
              if (best.stock.positionOpenTick === 0) best.stock.positionOpenTick = tickCount;
            }
          }
        }
      } catch { hasShorts = false; }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 11D: SPRAY MODE
  //
  // Strategy: buy everything with any positive signal, spread capital
  // thinly across up to 10 stocks simultaneously. Low ER threshold
  // means many trades, but diversification smooths the variance.
  //
  // Best used: large bankroll (>$500m) because commission ($100k/trade)
  // is negligible relative to position size. At low bankrolls, the
  // commission overhead will eat the thin edge.
  //
  // Budget allocation: spendable / remaining_slots per stock.
  // If slots run out, waits for existing positions to close first.
  // ═══════════════════════════════════════════════════════════════

  function sprayBuy() {
    const held = Object.values(stocks).filter(s => s.longShares > 0 || s.shortShares > 0);
    const slotsAvail = CONFIG.sprayMaxPositions - held.length;
    if (slotsAvail <= 0) return;

    const cash = ns.getServerMoneyAvailable("home") - CONFIG.reserveCash;
    if (cash < 1e6) return;

    const tw       = totalWorth(ns);
    const invested = tw - ns.getServerMoneyAvailable("home");
    const spendable = Math.min(cash, tw * CONFIG.maxDeploy - invested);
    if (spendable < 1e6) return;

    const maxPerStock  = tw * CONFIG.maxPortfolioPct;
    const buyThreshold = has4S ? CONFIG.buyThreshold4S : CONFIG.buyThresholdEst;

    // Rank all unowned stocks with any detectable signal
    const candidates = Object.values(stocks)
      .filter(s => s.longShares === 0 && s.shortShares === 0 && !s.inversionFlag)
      .map(s => ({ sym: s.sym, er: expectedReturn(s), f: has4S ? s.forecast : s.estForecast, stock: s }))
      .filter(r => Math.abs(r.er) > buyThreshold
                && (r.f > CONFIG.forecastBuyLong || r.f < CONFIG.forecastBuyShort))
      .sort((x, y) => Math.abs(y.er) - Math.abs(x.er))
      .slice(0, slotsAvail);

    if (candidates.length === 0) return;

    // Split spendable evenly across candidates (capped at maxPerStock)
    const perSlot = Math.min(spendable / candidates.length, maxPerStock);
    let avail = spendable;

    for (const r of candidates) {
      if (avail < 2e6) break;
      const budget = Math.min(avail, perSlot);
      if (budget < 2e6) continue;

      if (r.f > CONFIG.forecastBuyLong) {
        const price  = ns.stock.getAskPrice(r.sym);
        const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), r.stock.maxShares);
        if (shares > 0) {
          const cost = ns.stock.getPurchaseCost(r.sym, shares, "Long");
          if (cost <= avail) {
            const boughtAt = ns.stock.buyStock(r.sym, shares);
            if (boughtAt > 0) {
              avail -= cost;
              r.stock.ticksSinceAction = 0;
              if (r.stock.positionOpenTick === 0) r.stock.positionOpenTick = tickCount;
            }
          }
        }
      } else if (r.f < CONFIG.forecastBuyShort && hasShorts) {
        try {
          const price  = ns.stock.getBidPrice(r.sym);
          const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), r.stock.maxShares);
          if (shares > 0) {
            const cost = ns.stock.getPurchaseCost(r.sym, shares, "Short");
            if (cost <= avail) {
              const boughtAt = ns.stock.buyShort(r.sym, shares);
              if (boughtAt > 0) {
                avail -= cost;
                r.stock.ticksSinceAction = 0;
                if (r.stock.positionOpenTick === 0) r.stock.positionOpenTick = tickCount;
              }
            }
          }
        } catch { hasShorts = false; }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 11E: KELLY CRITERION POSITION SIZING
  //
  // Strategy: allocate capital proportionally to Kelly fractions
  // instead of equal weighting. Stocks with a better edge/risk
  // ratio get bigger positions; marginal signals get less capital.
  //
  // Kelly fraction (simplified): f_i = |ER_i| / volatility_i
  // Budget for stock i = (f_i / sum_all_f) * spendable
  //
  // This is mathematically the allocation that maximizes long-run
  // geometric growth. In practice, full-Kelly is often too aggressive,
  // so positions are still capped at maxPortfolioPct.
  //
  // Why better than equal weighting: a stock with ER=0.003 and vol=0.01
  // (kelly=0.3) gets 3x more capital than one with ER=0.001 and vol=0.01
  // (kelly=0.1). Equal weighting ignores this difference entirely.
  // ═══════════════════════════════════════════════════════════════

  function kellyBuyPhase() {
    const maxER = Object.values(stocks).reduce((mx, s) => Math.max(mx, Math.abs(expectedReturn(s))), 0);
    if (maxER < CONFIG.flatBuySkipFloor) {
      if (++flatTicks >= CONFIG.flatBuySkipTicks) return;
    } else {
      flatTicks = 0;
    }

    const cash = ns.getServerMoneyAvailable("home") - CONFIG.reserveCash;
    if (cash < 1e6) return;

    const tw       = totalWorth(ns);
    const invested = tw - ns.getServerMoneyAvailable("home");
    const spendable = Math.min(cash, tw * CONFIG.maxDeploy - invested);
    if (spendable < 1e6) return;

    const buyThreshold = has4S ? CONFIG.buyThreshold4S : CONFIG.buyThresholdEst;
    const maxPerStock  = tw * CONFIG.maxPortfolioPct;

    // Build candidates with Kelly fractions
    const candidates = Object.values(stocks)
      .map(s => ({
        sym:    s.sym,
        er:     expectedReturn(s),
        f:      has4S ? s.forecast : s.estForecast,
        kelly:  kellyFraction(s),
        stock:  s,
      }))
      .filter(r => {
        if (Math.abs(r.er) < buyThreshold) return false;
        if (r.stock.inversionFlag) return false;
        if (r.f > CONFIG.forecastBuyLong || r.f < CONFIG.forecastBuyShort) return true;
        return false;
      })
      .sort((x, y) => y.kelly - x.kelly);

    if (candidates.length === 0) return;

    // Normalize Kelly fractions to sum to 1 — proportional budget allocation
    const totalKelly = candidates.reduce((s, r) => s + r.kelly, 0);
    let avail = spendable;

    for (const r of candidates) {
      if (avail < 2e6) break;
      const s = r.stock;

      // Proportional Kelly budget, capped at maxPortfolioPct
      const kellyShare   = totalKelly > 0 ? r.kelly / totalKelly : 1 / candidates.length;
      const kellyBudget  = spendable * kellyShare;
      const curLongVal   = s.longShares > 0  ? ns.stock.getSaleGain(s.sym, s.longShares, "Long")   : 0;
      const curShortVal  = s.shortShares > 0 ? ns.stock.getSaleGain(s.sym, s.shortShares, "Short") : 0;
      const budget = Math.min(avail, maxPerStock - curLongVal - curShortVal, kellyBudget);
      if (budget < 2e6) continue;

      if (r.f > CONFIG.forecastBuyLong) {
        const price  = ns.stock.getAskPrice(r.sym);
        const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), s.maxShares - s.longShares);
        if (shares > 0) {
          const cost = ns.stock.getPurchaseCost(r.sym, shares, "Long");
          if (cost <= avail) {
            const boughtAt = ns.stock.buyStock(r.sym, shares);
            if (boughtAt > 0) {
              avail -= cost;
              s.ticksSinceAction = 0;
              if (s.positionOpenTick === 0) s.positionOpenTick = tickCount;
            }
          }
        }
      } else if (r.f < CONFIG.forecastBuyShort && hasShorts) {
        try {
          const price  = ns.stock.getBidPrice(r.sym);
          const shares = Math.min(Math.floor((budget - CONFIG.commission) / price), s.maxShares - s.shortShares);
          if (shares > 0) {
            const cost = ns.stock.getPurchaseCost(r.sym, shares, "Short");
            if (cost <= avail) {
              const boughtAt = ns.stock.buyShort(r.sym, shares);
              if (boughtAt > 0) {
                avail -= cost;
                s.ticksSinceAction = 0;
                if (s.positionOpenTick === 0) s.positionOpenTick = tickCount;
              }
            }
          }
        } catch { hasShorts = false; }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 12: LOGGING
  // ═══════════════════════════════════════════════════════════════

  const LOG_FILE  = "/strats/trade-log.txt";
  const DATA_FILE = "/strats/session-data.txt";

  function doLogTrade(trade) {
    const tw = totalWorth(ns);
    logTrade(ns, LOG_FILE, trade,
      ` | Total:${ns.formatNumber(totalProfit)} | Worth:${ns.formatNumber(tw)}`);
  }

  function doLogSession() {
    const tw      = totalWorth(ns);
    const elapsed = (Date.now() - sessionStart) / 60000;
    const wins    = recentTrades.filter(t => t.pnl >= 0).length;
    const losses  = recentTrades.filter(t => t.pnl < 0).length;
    const mode    = TURTLE ? "turtle" : YOLO ? "yolo" : MOMENTUM ? "momentum"
                  : SNIPER ? "sniper" : SPRAY ? "spray" : KELLY ? "kelly" : "normal";
    logSnapshot(ns, DATA_FILE, {
      tick: tickCount, timestamp: Date.now(),
      mode, has4S, worth: tw,
      cash: ns.getServerMoneyAvailable("home"),
      profit: totalProfit,
      profitPerMin: totalProfit / Math.max(1, elapsed),
      totalTrades: totalTradeCount, wins, losses,
    });
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 13: DASHBOARD
  // ═══════════════════════════════════════════════════════════════

  function printDashboard() {
    const tw       = totalWorth(ns);
    const cash     = ns.getServerMoneyAvailable("home");
    const invested = tw - cash;
    const elapsed  = ((Date.now() - sessionStart) / 60000).toFixed(1);
    const startW   = worthHistory.length > 0 ? worthHistory[0] : tw;
    const ret      = startW > 0 ? (tw - startW) / startW : 0;

    const ppm      = totalProfit / Math.max(1, (Date.now() - sessionStart) / 60000);
    const pph      = ppm * 60;
    const pp24     = ppm * 1440;

    const wins     = recentTrades.filter(t => t.pnl >= 0).length;
    const losses   = recentTrades.filter(t => t.pnl < 0).length;

    worthHistory.push(tw);
    if (worthHistory.length > 120) worthHistory.shift();

    ns.clearLog();

    let modeStr   = "NORMAL";
    let modeColor = C.cyan;
    if (TURTLE)   { modeStr = "TURTLE UP";          modeColor = C.green; }
    if (YOLO)     { modeStr = "GO BIG OR GO HOME";  modeColor = C.mag; }
    if (MOMENTUM) { modeStr = "MOMENTUM";            modeColor = C.yellow; }
    if (SNIPER)   { modeStr = "SNIPER";              modeColor = C.red; }
    if (SPRAY)    { modeStr = "SPRAY & PRAY";        modeColor = C.cyan; }
    if (KELLY)    { modeStr = "KELLY CRITERION";     modeColor = C.green; }

    ns.print("╔══════════════════════════════════════════════════════════════╗");
    ns.print(`║  ${C.bold("STOCKSDONE")}  ${modeColor("[ " + modeStr + " ]")}`);
    ns.print("╠══════════════════════════════════════════════════════════════╣");
    ns.print(`║ ${has4S ? C.green("4S DATA") : C.yellow("ESTIMATED")} | Shorts: ${hasShorts ? C.green("ON") : C.red("OFF")} | Tick: ${C.cyan(String(tickCount))} | ${elapsed}min | ${C.dim(THEME)}`);

    if (TURTLE && provenParams) {
      ns.print(`║ ${C.green("Proven strat: " + provenParams.name)} (${provenParams.ticksTested} ticks)`);
    }

    // ── Mode-specific status line ──
    if (SNIPER) {
      const posCount = Object.values(stocks).filter(s => s.longShares > 0 || s.shortShares > 0).length;
      const confirmStr = CONFIG.sniperFcstConfirm ? C.green("AGREE") : C.dim("OFF");
      ns.print(`║ ${C.red("SNIPER")} Positions: ${posCount}/${CONFIG.sniperMaxPositions} | 4S+Est confirm: ${confirmStr}`);
    }
    if (SPRAY) {
      const posCount = Object.values(stocks).filter(s => s.longShares > 0 || s.shortShares > 0).length;
      ns.print(`║ ${C.cyan("SPRAY")} Positions: ${posCount}/${CONFIG.sprayMaxPositions}`);
    }
    if (KELLY) {
      // Show top Kelly fractions for held positions
      const top = Object.values(stocks)
        .filter(s => s.longShares > 0 || s.shortShares > 0)
        .map(s => ({ sym: s.sym, k: kellyFraction(s) }))
        .sort((x, y) => y.k - x.k).slice(0, 3);
      if (top.length > 0) {
        ns.print(`║ ${C.green("KELLY")} top: ${top.map(t => `${t.sym}=${t.k.toFixed(3)}`).join(" ")}`);
      }
    }

    ns.print("╠══════════════════════════════════════════════════════════════╣");
    ns.print(`║ Net Worth:  ${C.bold(ns.formatNumber(tw, 2).padStart(14))}  ${C.pct(ret)}`);
    ns.print(`║ Cash:       ${ns.formatNumber(cash, 2).padStart(14)}`);
    ns.print(`║ Invested:   ${ns.formatNumber(invested, 2).padStart(14)}  ${C.dim("(" + (tw > 0 ? (invested / tw * 100).toFixed(1) : "0") + "% deployed)")}`);
    ns.print(`║ Session P/L:${C.plcol(totalProfit, ns.formatNumber(totalProfit, 2).padStart(14))}`);
    ns.print(`║  /min: ${C.plcol(ppm, ns.formatNumber(ppm, 2))}  /hr: ${C.plcol(pph, ns.formatNumber(pph, 2))}  /24hr: ${C.plcol(pp24, ns.formatNumber(pp24, 2))}`);

    if (worthHistory.length > 2) {
      const color = worthHistory[worthHistory.length - 1] >= worthHistory[0] ? C.green : C.red;
      ns.print(`║ ${color(sparkline(worthHistory, 40))}`);
    }

    // ── YOLO scoreboard ──
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
      if (yolo.history.length > 0) {
        ns.print(`║ ${yolo.history.map(v => v >= 0 ? C.green("W") : C.red("L")).join("")}`);
      }
      if (yolo.activeBet) {
        const curPrice = ns.stock.getPrice(yolo.activeBet.sym);
        const chg      = (curPrice - yolo.activeBet.entryPrice) / yolo.activeBet.entryPrice;
        const dir      = yolo.activeBet.type === "Long" ? chg : -chg;
        ns.print(`║ ${C.bold("BET:")} ${yolo.activeBet.type} ${yolo.activeBet.sym} ${C.pct(dir)}`);
      }
    }

    // ── Positions table ──
    ns.print("╠════════╦═══════╦═══════╦════════════╦══════════╦═════════╣");
    ns.print("║ Symbol ║ Fcst  ║  Vol  ║ Position   ║ Unrl P/L ║ Return  ║");
    ns.print("╠════════╬═══════╬═══════╬════════════╬══════════╬═════════╣");

    const positions = Object.values(stocks)
      .filter(s => s.longShares > 0 || s.shortShares > 0)
      .map(s => {
        let pnl, cost;
        if (s.longShares > 0) {
          pnl  = ns.stock.getSaleGain(s.sym, s.longShares, "Long") - s.longShares * s.longAvgPrice;
          cost = s.longShares * s.longAvgPrice;
        } else {
          pnl  = ns.stock.getSaleGain(s.sym, s.shortShares, "Short") - s.shortShares * s.shortAvgPrice;
          cost = s.shortShares * s.shortAvgPrice;
        }
        return { ...s, pnl, cost, ret: cost > 0 ? pnl / cost : 0 };
      })
      .sort((x, y) => y.pnl - x.pnl);

    for (const s of positions) {
      const f   = (has4S ? s.forecast : s.estForecast).toFixed(3);
      const v   = (has4S ? s.volatility : estimateVolatility(s.priceHistory)).toFixed(3);
      const pos = s.longShares > 0 ? `L:${ns.formatNumber(s.longShares, 0)}` : `S:${ns.formatNumber(s.shortShares, 0)}`;
      const inv = s.inversionFlag ? C.red("!") : " ";
      const pnlStr = C.plcol(s.pnl, ((s.pnl >= 0 ? "+" : "") + ns.formatNumber(s.pnl, 0)).padStart(8));
      ns.print(`║ ${(s.sym + inv).padEnd(6)} ║ ${f} ║ ${v} ║ ${pos.padEnd(10)} ║ ${pnlStr} ║ ${C.pct(s.ret)} ║`);
    }

    if (positions.length === 0) {
      ns.print(`║ ${C.dim("         No open positions - scanning...")}                   ║`);
    }
    ns.print("╚════════╩═══════╩═══════╩════════════╩══════════╩═════════╝");

    // ── Recent trades ──
    if (recentTrades.length > 0) {
      const ratio = wins + losses > 0 ? (wins / (wins + losses) * 100).toFixed(0) + "%" : "n/a";
      ns.print(C.dim(` Recent (W:${C.green(String(wins))} L:${C.red(String(losses))} | ${ratio} | Total: ${totalTradeCount}):`));
      for (const t of [...recentTrades].reverse()) {
        const pnlStr = C.plcol(t.pnl, ((t.pnl >= 0 ? "+" : "") + ns.formatNumber(t.pnl, 1)));
        ns.print(`   ${t.type} ${t.sym.padEnd(5)} ${pnlStr}  ${C.dim("tick " + t.tick)}`);
      }
    }

    // ── Opportunity radar (mode-specific) ──
    if (!YOLO) {
      if (MOMENTUM) {
        // Show top momentum movers (forecast acceleration)
        const movers = Object.values(stocks)
          .map(s => ({ sym: s.sym, mo: momentumScore(s), f: has4S ? s.forecast : s.estForecast }))
          .filter(r => Math.abs(r.mo) > 0.001)
          .sort((x, y) => Math.abs(y.mo) - Math.abs(x.mo))
          .slice(0, 5);
        if (movers.length > 0) {
          ns.print(C.dim(" Momentum Radar (forecast accel/tick):"));
          for (const m of movers) {
            const arrow = m.mo > 0 ? C.green("↑") : C.red("↓");
            const confirmed = Math.abs(m.mo) >= CONFIG.momentumMinScore ? C.green("✓") : C.dim("·");
            ns.print(`   ${arrow}${confirmed} ${m.sym.padEnd(5)} Fcst:${m.f.toFixed(3)} Δ:${(m.mo*1000).toFixed(2)}‰/t`);
          }
        }
      } else if (KELLY) {
        // Show Kelly fractions for top unowned opportunities
        const opps = Object.values(stocks)
          .filter(s => s.longShares === 0 && s.shortShares === 0 && !s.inversionFlag)
          .map(s => ({ sym: s.sym, er: expectedReturn(s), f: has4S ? s.forecast : s.estForecast, k: kellyFraction(s) }))
          .filter(o => Math.abs(o.er) > (has4S ? CONFIG.buyThreshold4S : CONFIG.buyThresholdEst))
          .sort((x, y) => y.k - x.k)
          .slice(0, 5);
        if (opps.length > 0) {
          ns.print(C.dim(" Kelly Opportunities (f=kelly fraction):"));
          for (const o of opps) {
            const dir = o.f > 0.5 ? C.green("LONG ") : C.red("SHORT");
            ns.print(`   ${dir} ${o.sym.padEnd(5)} Fcst:${o.f.toFixed(3)} ER:${o.er.toFixed(5)} f=${o.k.toFixed(4)}`);
          }
        }
      } else {
        // Normal/Turtle/Sniper/Spray: standard opportunity list
        const opps = Object.values(stocks)
          .filter(s => s.longShares === 0 && s.shortShares === 0)
          .map(s => ({ sym: s.sym, er: expectedReturn(s), f: has4S ? s.forecast : s.estForecast, inv: s.inversionFlag }))
          .filter(o => Math.abs(o.er) > 0.0001 && !o.inv)
          .sort((x, y) => Math.abs(y.er) - Math.abs(x.er))
          .slice(0, 5);
        if (opps.length > 0) {
          ns.print(C.dim(" Top Opportunities:"));
          for (const o of opps) {
            const dir = o.f > 0.5 ? C.green("LONG ") : C.red("SHORT");
            ns.print(`   ${dir} ${o.sym.padEnd(5)} Fcst: ${o.f.toFixed(3)} ER: ${o.er.toFixed(5)}`);
          }
        }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 14: MAIN TRADING LOOP
  // ═══════════════════════════════════════════════════════════════

  const modeName = TURTLE ? "TURTLE" : YOLO ? "YOLO" : MOMENTUM ? "MOMENTUM"
                 : SNIPER ? "SNIPER" : SPRAY ? "SPRAY" : KELLY ? "KELLY" : "NORMAL";
  ns.write(LOG_FILE, `\n=== Session ${new Date().toISOString()} | ${modeName} ===\n`, "a");

  while (true) {
    try { await ns.stock.nextUpdate(); } catch { await ns.sleep(6000); }
    tickCount++;

    if (tickCount % 50 === 0) {
      if (CONFIG.autoBuyAccess) tryBuyAccess(ns);
      ({ hasTIX, has4S } = checkAccess(ns));
    }

    // ── Update all stock data ──
    for (const sym of symbols) {
      const s = stocks[sym];

      s.priceHistory.push(ns.stock.getPrice(sym));
      if (s.priceHistory.length > CONFIG.tickHistoryLen) s.priceHistory.shift();

      const [ls, lap, ss, sap] = ns.stock.getPosition(sym);
      s.longShares = ls;  s.longAvgPrice = lap;
      s.shortShares = ss; s.shortAvgPrice = sap;

      runEstimation(s);

      if (has4S) {
        s.forecast   = ns.stock.getForecast(sym);
        s.volatility = ns.stock.getVolatility(sym);
      }

      // Record forecast history for momentum tracking
      // (push AFTER 4S overlay so history reflects best available forecast)
      const fNow = has4S ? s.forecast : s.estForecast;
      s.forecastHistory.push(fNow);
      if (s.forecastHistory.length > 10) s.forecastHistory.shift();

      s.ticksSinceAction++;
    }

    if (!has4S && tickCount < 10) { printDashboard(); continue; }

    // ── Execute trades — route to the right strategy ──
    const tradesBefore = totalTradeCount;

    if (YOLO) {
      yoloBet();
    } else if (MOMENTUM) {
      momentumSellPhase();
      momentumBuyPhase();
    } else if (SNIPER) {
      sellPhase();
      sniperBuy();
    } else if (SPRAY) {
      sellPhase();
      sprayBuy();
    } else if (KELLY) {
      sellPhase();
      kellyBuyPhase();
    } else {
      sellPhase();   // Normal / Turtle
      buyPhase();
    }

    // ── Log new trades ──
    const newTrades = totalTradeCount - tradesBefore;
    if (newTrades > 0) {
      for (let i = recentTrades.length - newTrades; i < recentTrades.length; i++) {
        if (i >= 0) doLogTrade(recentTrades[i]);
      }
    }

    if (tickCount % 100 === 0) doLogSession();

    printDashboard();
  }
}

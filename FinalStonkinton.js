// Usage: run FinalStonkinton.js [--turtle] [--yolo] [--liquidate] [--theme classic|neon|matrix|ocean|fire]
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
  ns.tail();

  // Load shared libs — falls back to built-in implementations if /lib/ files are missing
  const { getTheme, makeColors, tryBuyAccess, checkAccess, waitForTIX,
          estimateForecast, estimateVolatility, totalWorth, sparkline,
          logTrade, logSnapshot } = await _loadLibs(ns);


  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: MODE FLAGS + THEME
  // Parse command-line arguments to determine which mode to run.
  // Only one mode should be active at a time.
  // ═══════════════════════════════════════════════════════════════

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
    // (prevents buy→sell→buy oscillation on marginal signals)
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
    // Per-stock allocation = |ER| / (vol² × KELLY_K), capped at maxPortfolioPct.
    // High-vol stocks get smaller allocations; high-confidence signals get more.
    KELLY_K:               30,    // Kelly divisor — higher = smaller, more conservative bets

    // ── Early profit-taking ──
    // Exit positions that are up ≥5% after 40+ ticks without waiting for neutral forecast.
    // Locks in gains that would likely evaporate over a full cycle.
    STALE_PROFIT_PCT:      0.05,  // minimum gain to trigger early exit (5%)
    STALE_MIN_TICKS_PROFIT: 40,   // minimum age before early profit exit applies

    // ── Portfolio drawdown halt ──
    // Skip new buys if portfolio has fallen >20% from its session peak.
    // Sells are unaffected — positions can still be exited normally.
    MAX_DRAWDOWN_HALT:     0.20,  // drawdown fraction that halts new buys
  };


  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: TURTLE MODE OVERRIDES
  // In turtle mode, we either load battle-tested parameters from
  // the paper trader (FinalStonkinton-paper.js saves winners to
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
      // Paper-trader-proven parameters — these actually made money in testing
      const p = provenParams.params;
      CONFIG.forecastBuyLong  = p.forecastBuyLong;
      CONFIG.forecastBuyShort = p.forecastBuyShort;
      CONFIG.forecastSellLong = p.forecastSellLong;
      CONFIG.forecastSellShort = p.forecastSellShort;
      CONFIG.buyThreshold4S   = p.buyThreshold;
      CONFIG.buyThresholdEst  = p.buyThreshold;
      CONFIG.maxPortfolioPct  = p.maxPortfolioPct;
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


  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: STATE
  // Mutable state that tracks the current session.
  // Everything here resets when the script restarts.
  // ═══════════════════════════════════════════════════════════════

  const stocks         = {};     // sym → per-stock tracking object (initialized in Section 6)
  let   has4S          = false;  // do we have 4S TIX API? (best data source)
  let   hasTIX         = false;  // do we have TIX API at all? (required to trade)
  let   hasShorts      = true;   // can we short? (fails gracefully if SF not unlocked)
  let   tickCount      = 0;      // how many market ticks since script started
  let   totalProfit    = 0;      // cumulative realized P/L this session
  let   totalTradeCount = 0;     // number of completed trades this session
  let   flatTicks          = 0;      // consecutive ticks with no meaningful market signal
  let   sessionPeakWorth   = 0;      // highest net worth seen this session (for drawdown halt)
  const sessionStart       = Date.now();  // for calculating elapsed time and $/min
  const worthHistory   = [];     // net worth samples for the sparkline graph (last 120)
  const recentTrades   = [];     // last 5 closed trades for dashboard display

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
    };
  }


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
  // becomes true after the raw signal persists for ≥1 additional tick.
  function runEstimation(stock) {
    // Pass estimated volatility to enable adaptive inversion delta.
    // Uses previous-tick vol (ok: estimate.js vol is smooth, single-tick lag negligible).
    const vol = estimateVolatility(stock.priceHistory);
    const est = estimateForecast(stock.priceHistory, CONFIG.longWindow, CONFIG.shortWindow, CONFIG.inversionDelta, vol);

    stock.estForecast      = est.forecast;
    stock.estForecastShort = est.forecastShort;
    stock.inversionEarly   = est.inversionEarly ?? false;  // leading indicator

    // ── 2-tick inversion confirmation ──
    // rawInv fires on the first tick of disagreement.
    // We set inversionFlag=true only after it persists for ≥1 more tick.
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
  // Without 4S: uses our estimated forecast + estimated volatility.
  // Formula: ER = volatility * (forecast - 0.5)
  //   If forecast = 0.6 and volatility = 0.02:
  //   ER = 0.02 * 0.1 = 0.002 = 0.2% expected gain per tick
  function expectedReturn(stock) {
    const f = has4S ? stock.forecast : stock.estForecast;
    const v = has4S ? stock.volatility : estimateVolatility(stock.priceHistory);
    return v * (f - 0.5);
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: TRADE HELPERS
  // Bookkeeping when a trade closes. Tracks P/L and trade history.
  // ═══════════════════════════════════════════════════════════════

  // Called after every sell. Updates running totals and recent trade list.
  // Optional tag is stored on the trade for logging (e.g., " [EARLY]").
  function recordTrade(sym, type, pnl, tag = "") {
    totalProfit += pnl;
    recentTrades.push({ sym, type, pnl, tick: tickCount, tag });
    if (recentTrades.length > 5) recentTrades.shift();  // keep last 5 for dashboard
    totalTradeCount++;
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

        // Early profit exit: if up ≥5% after 40+ ticks, take the gain now
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
            const pnl = ns.stock.getSaleGain(sym, s.longShares, "Long") - s.longShares * s.longAvgPrice;
            ns.stock.sellStock(sym, s.longShares);
            recordTrade(sym, "L", pnl, tag);
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
            const pnl = ns.stock.getSaleGain(sym, s.shortShares, "Short") - s.shortShares * s.shortAvgPrice;
            ns.stock.sellShort(sym, s.shortShares);
            recordTrade(sym, "S", pnl, tag);
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
      if (avail < 2e6) break;  // need at least $2m to make a meaningful purchase
      const s = r.stock;

      // ── Kelly-adjacent position sizing ──
      // Fraction = |ER| / (vol² × KELLY_K), capped at maxPortfolioPct.
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
      if (budget < 2e6) continue;

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
      else if (r.forecast < CONFIG.forecastBuyShort && hasShorts) {
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
    if (betSize < 2e6) return;  // too poor to bet meaningfully

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

    // Track net worth for sparkline graph (max 120 samples = 120 ticks ≈ 12min)
    worthHistory.push(tw);
    if (worthHistory.length > 120) worthHistory.shift();

    // ── Wipe and redraw everything ──
    ns.clearLog();

    // Mode indicator (color-coded for quick visual identification)
    let modeStr   = "NORMAL";
    let modeColor = C.cyan;
    if (TURTLE) { modeStr = "TURTLE UP";          modeColor = C.green; }
    if (YOLO)   { modeStr = "GO BIG OR GO HOME";  modeColor = C.mag; }

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
    ns.print(`║ ${has4S ? C.green("4S DATA") : C.yellow("ESTIMATED")} | Shorts: ${hasShorts ? C.green("ON") : C.red("OFF")} | Tick: ${C.cyan(String(tickCount))} | ${elapsed}min | ${C.dim(THEME)}`);

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
      const f   = (has4S ? s.forecast : s.estForecast).toFixed(3);
      const v   = (has4S ? s.volatility : estimateVolatility(s.priceHistory)).toFixed(3);
      const pos = s.longShares > 0 ? `L:${ns.formatNumber(s.longShares, 0)}` : `S:${ns.formatNumber(s.shortShares, 0)}`;
      const inv = s.inversionFlag ? C.red("!") : " ";  // red "!" = cycle flip warning
      const pnlStr = C.plcol(s.pnl, ((s.pnl >= 0 ? "+" : "") + ns.formatNumber(s.pnl, 0)).padStart(8));
      ns.print(`║ ${(s.sym + inv).padEnd(6)} ║ ${f} ║ ${v} ║ ${pos.padEnd(10)} ║ ${pnlStr} ║ ${C.pct(s.ret)} ║`);
    }

    if (positions.length === 0) {
      ns.print(`║ ${C.dim("         No open positions - scanning...")}                   ║`);
    }
    ns.print("╚════════╩═══════╩═══════╩════════════╩══════════╩═════════╝");

    // ── Recent trades with win/loss ratio ──
    if (recentTrades.length > 0) {
      const ratio = wins + losses > 0 ? (wins / (wins + losses) * 100).toFixed(0) + "%" : "n/a";
      ns.print(C.dim(` Recent (W:${C.green(String(wins))} L:${C.red(String(losses))} | ${ratio} | Total: ${totalTradeCount}):`));
      for (const t of [...recentTrades].reverse()) {
        const pnlStr = C.plcol(t.pnl, ((t.pnl >= 0 ? "+" : "") + ns.formatNumber(t.pnl, 1)));
        ns.print(`   ${t.type} ${t.sym.padEnd(5)} ${pnlStr}  ${C.dim("tick " + t.tick)}`);
      }
    }

    // ── Top opportunities radar (not shown in YOLO — one bet at a time) ──
    if (!YOLO) {
      const opps = Object.values(stocks)
        .filter(s => s.longShares === 0 && s.shortShares === 0)
        .map(s => ({ sym: s.sym, er: expectedReturn(s), f: has4S ? s.forecast : s.estForecast, inv: s.inversionFlag }))
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
          ns.print(`║  ${dir} ${o.sym.padEnd(5)}  F:${o.f.toFixed(3)}  ER:${erCol}  ${C.dim(bar)}`);
        }
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

      s.ticksSinceAction++;
    }

    // Need ~10 ticks of price data before estimates are usable
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

    // Redraw the dashboard
    printDashboard();
  }
}

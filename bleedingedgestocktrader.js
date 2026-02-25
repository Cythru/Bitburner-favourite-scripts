// Usage: run bleedingedgestocktrader.js [--liquidate] [--theme classic|neon|matrix|ocean|fire]
// Lib files loaded dynamically — built-in fallbacks activate if any /lib/ file is absent.

// ── Built-in fallbacks ──
function _fbGetTheme(ns){const i=ns.args.indexOf("--theme");return{theme:null,name:i>=0?String(ns.args[i+1]||"classic"):"classic"};}
function _fbMakeColors(){const id=s=>String(s);return{green:id,red:id,cyan:id,yellow:id,mag:id,dim:id,bold:id,pct:v=>(v>=0?"+":"")+(v*100).toFixed(1)+"%",plcol:(_,s)=>String(s)};}
function _fbTryBuyAccess(ns){const m=ns.getServerMoneyAvailable("home");try{if(m>200e6)ns.stock.purchaseWseAccount();}catch{}try{if(m>5e9)ns.stock.purchaseTixApi();}catch{}try{if(m>1e9)ns.stock.purchase4SMarketData();}catch{}try{if(m>25e9)ns.stock.purchase4SMarketDataTixApi();}catch{}}
function _fbCheckAccess(ns){let t=false,s=false;try{t=ns.stock.hasTIXAPIAccess();}catch{}try{s=ns.stock.has4SDataTIXAPI();}catch{}return{hasTIX:t,has4S:s};}
async function _fbWaitForTIX(ns){while(true){_fbTryBuyAccess(ns);try{if(ns.stock.hasTIXAPIAccess())return _fbCheckAccess(ns);}catch{}ns.tprint("Waiting for TIX API...");await ns.sleep(30000);}}
function _fbEstFc(h,lW,sW,iD){const n=h.length;if(n<3)return{forecast:0.5,forecastShort:0.5,inversionFlag:false};const lL=Math.min(lW,n-1),sL=Math.min(sW,n-1),lS=n-lL,sS=n-sL;let lU=0,sU=0;for(let i=lS;i<n;i++){if(h[i]>h[i-1]){lU++;if(i>=sS)sU++;}}const f=lU/lL,fs=sU/sL,x=(f>0.5)!==(fs>0.5);return{forecast:f,forecastShort:fs,inversionFlag:x&&Math.abs(f-fs)>iD};}
function _fbEstVol(h){const n=h.length;if(n<2)return 0.01;const w=Math.min(20,n-1),s=n-w;let sum=0;for(let i=s;i<n;i++)sum+=Math.abs(h[i]-h[i-1])/h[i-1];return sum/w;}
function _fbCalcMomentum(h){if(h.length<6)return 0;const n=h.length,s=n-5;let sc=0;for(let i=s;i<n;i++){const w=1+(i-s)*0.5;sc+=h[i]>h[i-1]?w:-w;}return sc/10;}
function _fbTotalWorth(ns){let w=ns.getServerMoneyAvailable("home");try{for(const s of ns.stock.getSymbols()){const[l,,sh]=ns.stock.getPosition(s);if(l>0)w+=ns.stock.getSaleGain(s,l,"Long");if(sh>0)w+=ns.stock.getSaleGain(s,sh,"Short");}}catch{}return w;}
function _fbSparkline(data,width=40){if(data.length<2)return"─".repeat(width);let mn=data[0],mx=data[0];for(const v of data){if(v<mn)mn=v;if(v>mx)mx=v;}const r=mx-mn||1,B="▁▂▃▄▅▆▇█";let o="";for(let i=0;i<width;i++){const idx=Math.min(data.length-1,Math.floor(i*(data.length-1)/Math.max(1,width-1)));o+=B[Math.min(7,Math.floor((data[idx]-mn)/r*8))];}return o;}
function _fbLogTrade(ns,f,t,x=""){ns.write(f,`[T${t.tick}] ${t.type} ${t.sym} P/L:${t.pnl>=0?"+":""}${Math.round(t.pnl)}${x}\n`,"a");}
function _fbLogSnap(ns,f,d){ns.write(f,JSON.stringify(d)+"\n","a");}

async function _loadLibs(ns) {
  const chk = p => ns.fileExists(p) ? import(p).catch(()=>null) : Promise.resolve(null);
  const [t,m,e,p,l] = await Promise.all([chk("/lib/themes.js"),chk("/lib/market.js"),chk("/lib/estimate.js"),chk("/lib/portfolio.js"),chk("/lib/logging.js")]);
  const missing=[!t&&"/lib/themes.js",!m&&"/lib/market.js",!e&&"/lib/estimate.js",!p&&"/lib/portfolio.js",!l&&"/lib/logging.js"].filter(Boolean);
  if(missing.length)ns.tprint(`WARN: Missing libs — using fallbacks: ${missing.join(", ")}`);
  return{
    getTheme:t?.getTheme??_fbGetTheme, makeColors:t?.makeColors??_fbMakeColors,
    tryBuyAccess:m?.tryBuyAccess??_fbTryBuyAccess, checkAccess:m?.checkAccess??_fbCheckAccess,
    waitForTIX:m?.waitForTIX??_fbWaitForTIX,
    estimateForecast:e?.estimateForecast??_fbEstFc, estimateVolatility:e?.estimateVolatility??_fbEstVol,
    calcMomentum:e?.calcMomentum??_fbCalcMomentum,
    totalWorth:p?.totalWorth??_fbTotalWorth, sparkline:p?.sparkline??_fbSparkline,
    logTrade:l?.logTrade??_fbLogTrade, logSnapshot:l?.logSnapshot??_fbLogSnap,
  };
}

/** @param {NS} ns */
export async function main(ns) {
  // ╔══════════════════════════════════════════════════════════════╗
  // ║  BLEEDING EDGE - Self-Optimizing Adaptive Stock Trader      ║
  // ║  Blends 4S + price-history estimation for cross-validation  ║
  // ║  Momentum-weighted entry scoring, confidence-based sizing   ║
  // ║  Adaptive thresholds: loosens when winning, tightens on loss║
  // ║  Works with or without 4S data. Keeps $1m reserve.          ║
  // ╚══════════════════════════════════════════════════════════════╝
  ns.disableLog("ALL");
  ns.tail();
  const { getTheme, makeColors, tryBuyAccess, checkAccess, waitForTIX,
          estimateForecast, estimateVolatility, calcMomentum,
          totalWorth, sparkline, logTrade, logSnapshot } = await _loadLibs(ns);


  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: MODE FLAGS + THEME
  // ═══════════════════════════════════════════════════════════════

  const LIQUIDATE = ns.args.includes("--liquidate");
  const { theme, name: THEME } = getTheme(ns);
  const C = makeColors(theme);


  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: CONFIGURATION
  // Starts conservative, adapts over time based on win rate.
  // ═══════════════════════════════════════════════════════════════

  const cfg = {
    reserveCash:      1_000_000,
    maxDeploy:        0.80,
    maxPerStock:      0.25,
    commission:       100_000,

    forecastBuyLong:  0.60,
    forecastBuyShort: 0.40,
    buyThreshold:     0.001,

    forecastSellLong:  0.52,
    forecastSellShort: 0.48,
    sellThreshold:     0,

    histLen:          80,
    longWindow:       76,
    shortWindow:      8,
    inversionDelta:   0.12,
  };


  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: STATE
  // ═══════════════════════════════════════════════════════════════

  const stocks          = {};
  let   has4S           = false;
  let   hasTIX          = false;
  let   hasShorts       = true;
  let   tickCount       = 0;
  let   totalProfit     = 0;
  let   totalTradeCount = 0;
  const sessionStart    = Date.now();
  const worthHistory    = [];
  const recentTrades    = [];
  const allTradePnls    = [];

  const adapt = {
    recentWinRate:  0.5,
    streakCount:    0,
    confidence:     0.5,
    lastAdjustTick: 0,
  };


  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: EMERGENCY LIQUIDATE
  // ═══════════════════════════════════════════════════════════════

  if (LIQUIDATE) {
    for (const sym of ns.stock.getSymbols()) {
      const [ls, , ss] = ns.stock.getPosition(sym);
      if (ls > 0) ns.stock.sellStock(sym, ls);
      if (ss > 0) try { ns.stock.sellShort(sym, ss); } catch { /* shorts unavailable */ }
    }
    ns.tprint("All positions liquidated.");
    return;
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: MARKET ACCESS
  // ═══════════════════════════════════════════════════════════════

  ({ hasTIX, has4S } = await waitForTIX(ns));

  const symbols = ns.stock.getSymbols();
  for (const sym of symbols) {
    stocks[sym] = {
      sym,
      priceHistory:     [],
      forecast4S:       0.5,
      volatility4S:     0.01,
      estForecast:      0.5,
      estForecastShort: 0.5,
      estVolatility:    0.01,
      blendedForecast:  0.5,
      blendedVolatility: 0.01,
      inversionFlag:    false,
      momentum:         0,
      longShares:       0,
      longAvgPrice:     0,
      shortShares:      0,
      shortAvgPrice:    0,
      maxShares:        ns.stock.getMaxShares(sym),
      ticksSinceAction: 999,
      positionOpenTick: 0,       // tick when current position was first opened (0 = flat)
    };
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: DATA ENGINE (estimation + blending + momentum)
  // ═══════════════════════════════════════════════════════════════

  function updateEstimates(s) {
    const h = s.priceHistory;
    if (h.length < 3) {
      s.estForecast = 0.5; s.estForecastShort = 0.5;
      s.estVolatility = 0.01; s.inversionFlag = false;
      s.momentum = 0;
      return;
    }

    const est = estimateForecast(h, cfg.longWindow, cfg.shortWindow, cfg.inversionDelta);
    s.estForecast      = est.forecast;
    s.estForecastShort = est.forecastShort;
    s.inversionFlag    = est.inversionFlag;
    s.estVolatility    = estimateVolatility(h);
    s.momentum         = calcMomentum(h);
  }

  function updateBlended(s) {
    updateEstimates(s);

    if (has4S) {
      s.forecast4S   = ns.stock.getForecast(s.sym);
      s.volatility4S = ns.stock.getVolatility(s.sym);

      const agree = (s.forecast4S > 0.5 && s.estForecast > 0.5) ||
                    (s.forecast4S < 0.5 && s.estForecast < 0.5);

      if (agree) {
        s.blendedForecast = s.forecast4S * 0.7 + s.estForecast * 0.3;
      } else {
        s.blendedForecast = s.forecast4S * 0.85 + 0.5 * 0.15;
      }
      s.blendedVolatility = s.volatility4S;
    } else {
      s.blendedForecast   = s.estForecast;
      s.blendedVolatility = s.estVolatility;
    }
  }

  function expectedReturn(s) {
    return s.blendedVolatility * (s.blendedForecast - 0.5);
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: ADAPTIVE ENGINE
  // ═══════════════════════════════════════════════════════════════

  function recordTrade(pnl) {
    totalProfit += pnl;
    totalTradeCount++;
    allTradePnls.push(pnl);

    if (pnl >= 0) { adapt.streakCount = Math.max(1, adapt.streakCount + 1); }
    else           { adapt.streakCount = Math.min(-1, adapt.streakCount - 1); }

    const recent = allTradePnls.slice(-20);
    adapt.recentWinRate = recent.filter(p => p >= 0).length / recent.length;

    adapt.confidence = Math.max(0.2, Math.min(1.0,
      adapt.recentWinRate * 0.7 + (adapt.streakCount > 0 ? 0.3 : 0)
    ));
  }

  function adaptParameters() {
    if (allTradePnls.length < 5) return;
    if (tickCount - adapt.lastAdjustTick < 50) return;
    adapt.lastAdjustTick = tickCount;

    if (adapt.recentWinRate > 0.65) {
      cfg.forecastBuyLong  = Math.max(0.55, cfg.forecastBuyLong - 0.01);
      cfg.forecastBuyShort = Math.min(0.45, cfg.forecastBuyShort + 0.01);
      cfg.maxPerStock      = Math.min(0.35, cfg.maxPerStock + 0.02);
      cfg.buyThreshold     = Math.max(0.0005, cfg.buyThreshold * 0.9);
    } else if (adapt.recentWinRate < 0.45) {
      cfg.forecastBuyLong  = Math.min(0.70, cfg.forecastBuyLong + 0.01);
      cfg.forecastBuyShort = Math.max(0.30, cfg.forecastBuyShort - 0.01);
      cfg.maxPerStock      = Math.max(0.15, cfg.maxPerStock - 0.02);
      cfg.buyThreshold     = Math.min(0.003, cfg.buyThreshold * 1.1);
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: SELL PHASE
  // ═══════════════════════════════════════════════════════════════

  function sellPhase() {
    for (const sym of Object.keys(stocks)) {
      const s  = stocks[sym];
      const f  = s.blendedForecast;
      const er = expectedReturn(s);

      // Stale exit: position held > one full cycle with neutral signal → free capital
      const stale = s.positionOpenTick > 0
        && (tickCount - s.positionOpenTick) > 75
        && Math.abs(f - 0.5) < 0.02;

      if (s.longShares > 0) {
        if (f < cfg.forecastSellLong || er < cfg.sellThreshold || s.inversionFlag || s.momentum < -0.3 || stale) {
          try {
            const pnl = ns.stock.getSaleGain(sym, s.longShares, "Long") - s.longShares * s.longAvgPrice;
            ns.stock.sellStock(sym, s.longShares);
            recordTrade(pnl);
            recentTrades.push({ sym, type: "L", pnl, tick: tickCount });
            if (recentTrades.length > 10) recentTrades.shift();
            s.longShares = 0; s.longAvgPrice = 0;  // clear immediately so buyPhase sees correct state
            s.ticksSinceAction = 0;
            s.positionOpenTick = 0;
          } catch { /* API unavailable or position already closed */ }
        }
      }

      if (s.shortShares > 0 && hasShorts) {
        if (f > cfg.forecastSellShort || er > -cfg.sellThreshold || s.inversionFlag || s.momentum > 0.3 || stale) {
          try {
            const pnl = ns.stock.getSaleGain(sym, s.shortShares, "Short") - s.shortShares * s.shortAvgPrice;
            ns.stock.sellShort(sym, s.shortShares);
            recordTrade(pnl);
            recentTrades.push({ sym, type: "S", pnl, tick: tickCount });
            if (recentTrades.length > 10) recentTrades.shift();
            s.shortShares = 0; s.shortAvgPrice = 0;  // clear immediately so buyPhase sees correct state
            s.ticksSinceAction = 0;
            s.positionOpenTick = 0;
          } catch { hasShorts = false; }
        }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 9: BUY PHASE
  // ═══════════════════════════════════════════════════════════════

  function buyPhase() {
    const cash = ns.getServerMoneyAvailable("home") - cfg.reserveCash;
    if (cash < 1e6) return;

    const tw        = totalWorth(ns);
    const invested  = tw - ns.getServerMoneyAvailable("home");
    const spendable = Math.min(cash, tw * cfg.maxDeploy - invested);
    if (spendable < 1e6) return;

    const ranked = Object.values(stocks)
      .map(s => {
        const er = expectedReturn(s);
        const f  = s.blendedForecast;
        let momBonus = 1.0;
        if ((f > 0.5 && s.momentum > 0.1) || (f < 0.5 && s.momentum < -0.1)) {
          momBonus = 1.0 + Math.abs(s.momentum) * 0.5;
        }
        return { sym: s.sym, er, f, stock: s, score: Math.abs(er) * momBonus };
      })
      .filter(r => Math.abs(r.er) > cfg.buyThreshold && !r.stock.inversionFlag)
      .sort((x, y) => y.score - x.score);

    let avail = spendable;

    for (const r of ranked) {
      if (avail < 2e6) break;
      const s = r.stock;

      const effectiveMax = tw * cfg.maxPerStock * adapt.confidence;
      const curLongVal   = s.longShares > 0  ? ns.stock.getSaleGain(s.sym, s.longShares, "Long")   : 0;
      const curShortVal  = s.shortShares > 0 ? ns.stock.getSaleGain(s.sym, s.shortShares, "Short") : 0;
      const budget = Math.min(avail, effectiveMax - curLongVal - curShortVal);
      if (budget < 2e6) continue;

      if (r.f > cfg.forecastBuyLong) {
        const price  = ns.stock.getAskPrice(r.sym);
        const shares = Math.min(Math.floor((budget - cfg.commission) / price), s.maxShares - s.longShares);
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
      }
      else if (r.f < cfg.forecastBuyShort && hasShorts) {
        try {
          const price  = ns.stock.getBidPrice(r.sym);
          const shares = Math.min(Math.floor((budget - cfg.commission) / price), s.maxShares - s.shortShares);
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
  // SECTION 10: LOGGING
  // ═══════════════════════════════════════════════════════════════

  const LOG_FILE  = "/strats/bleeding-edge-log.txt";
  const DATA_FILE = "/strats/bleeding-edge-data.txt";

  function doLogTrade(trade) {
    const tw = totalWorth(ns);
    logTrade(ns, LOG_FILE, trade,
      ` Total:${ns.formatNumber(totalProfit)} Worth:${ns.formatNumber(tw)} Conf:${adapt.confidence.toFixed(2)} WR:${adapt.recentWinRate.toFixed(2)}`);
  }

  function doLogSnapshot() {
    logSnapshot(ns, DATA_FILE, {
      tick: tickCount, ts: Date.now(), has4S,
      worth: totalWorth(ns), profit: totalProfit,
      conf: adapt.confidence, winRate: adapt.recentWinRate,
      streak: adapt.streakCount, trades: totalTradeCount,
      params: {
        buyLong: cfg.forecastBuyLong, buyShort: cfg.forecastBuyShort,
        maxPct: cfg.maxPerStock, threshold: cfg.buyThreshold,
      },
    });
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 11: DASHBOARD
  // ═══════════════════════════════════════════════════════════════

  function printDashboard() {
    const tw        = totalWorth(ns);
    const cash      = ns.getServerMoneyAvailable("home");
    const invested  = tw - cash;
    const elapsed   = (Date.now() - sessionStart) / 60000;
    const ppm       = totalProfit / Math.max(1, elapsed);
    const pph       = ppm * 60;
    const pp24      = ppm * 1440;
    const startW    = worthHistory.length > 0 ? worthHistory[0] : tw;
    const ret       = startW > 0 ? (tw - startW) / startW : 0;
    const deployPct = tw > 0 ? (invested / tw * 100).toFixed(1) : "0";
    const wins      = recentTrades.filter(t => t.pnl >= 0).length;
    const losses    = recentTrades.filter(t => t.pnl < 0).length;

    worthHistory.push(tw);
    if (worthHistory.length > 120) worthHistory.shift();

    ns.clearLog();

    ns.print("╔══════════════════════════════════════════════════════════════╗");
    ns.print(`║  ${C.bold("BLEEDING EDGE")} ${C.mag("STOCK TRADER")}  ${C.red("♦")} ${C.yellow("ADAPTIVE")}`);
    ns.print("╠══════════════════════════════════════════════════════════════╣");

    ns.print(`║ ${has4S ? C.green("4S+EST BLEND") : C.yellow("EST ONLY")} | Shorts: ${hasShorts ? C.green("ON") : C.red("OFF")} | Tick: ${C.cyan(String(tickCount))} | ${elapsed.toFixed(1)}min | ${C.dim(THEME)}`);
    ns.print(`║ Confidence: ${C.plcol(adapt.confidence - 0.5, (adapt.confidence * 100).toFixed(0) + "%")} | WinRate: ${C.pct(adapt.recentWinRate - 0.5)} | Streak: ${C.plcol(adapt.streakCount, String(adapt.streakCount))}`);

    ns.print("╠══════════════════════════════════════════════════════════════╣");
    ns.print(`║ Net Worth:  ${C.bold(ns.formatNumber(tw, 2).padStart(14))}  ${C.pct(ret)}`);
    ns.print(`║ Cash:       ${ns.formatNumber(cash, 2).padStart(14)}  ${C.dim(deployPct + "% deployed")}`);
    ns.print(`║ Session P/L:${C.plcol(totalProfit, ns.formatNumber(totalProfit, 2).padStart(14))}`);
    ns.print(`║  /min: ${C.plcol(ppm, ns.formatNumber(ppm, 2))}  /hr: ${C.plcol(pph, ns.formatNumber(pph, 2))}  /24hr: ${C.plcol(pp24, ns.formatNumber(pp24, 2))}`);

    if (worthHistory.length > 2) {
      const color = worthHistory[worthHistory.length - 1] >= worthHistory[0] ? C.green : C.red;
      ns.print(`║ ${color(sparkline(worthHistory, 45))}`);
    }

    ns.print(`║ ${C.dim(`Buy: L>${cfg.forecastBuyLong.toFixed(2)} S<${cfg.forecastBuyShort.toFixed(2)} | MaxPos: ${(cfg.maxPerStock * 100).toFixed(0)}% | MinER: ${cfg.buyThreshold.toFixed(4)}`)}`);

    ns.print("╠════════╦═══════╦══════╦═══════════╦═════════╦════════╦══════╣");
    ns.print("║ Symbol ║ Fcst  ║ Mom  ║ Position  ║ Unrl PL ║ Return ║ Inv  ║");
    ns.print("╠════════╬═══════╬══════╬═══════════╬═════════╬════════╬══════╣");

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
      const f      = s.blendedForecast.toFixed(3);
      const mom    = C.plcol(s.momentum, s.momentum.toFixed(2).padStart(5));
      const pos    = s.longShares > 0 ? `L:${ns.formatNumber(s.longShares, 0)}` : `S:${ns.formatNumber(s.shortShares, 0)}`;
      const pnlStr = C.plcol(s.pnl, ((s.pnl >= 0 ? "+" : "") + ns.formatNumber(s.pnl, 0)).padStart(7));
      const inv    = s.inversionFlag ? C.red("FLIP") : C.green(" ok ");
      ns.print(`║ ${s.sym.padEnd(6)} ║ ${f} ║ ${mom} ║ ${pos.padEnd(9)} ║ ${pnlStr} ║ ${C.pct(s.ret)} ║ ${inv} ║`);
    }

    if (positions.length === 0) {
      ns.print(`║ ${C.dim("         Scanning for high-confidence entries...")}            ║`);
    }
    ns.print("╚════════╩═══════╩══════╩═══════════╩═════════╩════════╩══════╝");

    if (recentTrades.length > 0) {
      const wrStr = allTradePnls.length > 0 ? (adapt.recentWinRate * 100).toFixed(0) + "%" : "n/a";
      ns.print(C.dim(` Trades (W:${C.green(String(wins))} L:${C.red(String(losses))} | ${totalTradeCount} total | Rate: ${wrStr}):`));
      for (const t of [...recentTrades].slice(-5).reverse()) {
        const pnlStr = C.plcol(t.pnl, ((t.pnl >= 0 ? "+" : "") + ns.formatNumber(t.pnl, 1)));
        ns.print(`   ${t.type} ${t.sym.padEnd(5)} ${pnlStr}  ${C.dim("T" + t.tick)}`);
      }
    }

    const opps = Object.values(stocks)
      .filter(s => s.longShares === 0 && s.shortShares === 0 && !s.inversionFlag)
      .map(s => ({ sym: s.sym, er: expectedReturn(s), f: s.blendedForecast, mom: s.momentum }))
      .filter(o => Math.abs(o.er) > 0.0005)
      .sort((x, y) => Math.abs(y.er) - Math.abs(x.er))
      .slice(0, 4);
    if (opps.length > 0) {
      ns.print(C.dim(" Radar:"));
      for (const o of opps) {
        const dir    = o.f > 0.5 ? C.green("L") : C.red("S");
        const momStr = C.plcol(o.mom, o.mom.toFixed(2));
        ns.print(`   ${dir} ${o.sym.padEnd(5)} F:${o.f.toFixed(3)} ER:${o.er.toFixed(4)} Mom:${momStr}`);
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // SECTION 12: MAIN TRADING LOOP
  // ═══════════════════════════════════════════════════════════════

  ns.write(LOG_FILE, `\n=== BLEEDING EDGE Session ${new Date().toISOString()} ===\n`, "a");

  while (true) {
    try { await ns.stock.nextUpdate(); } catch { await ns.sleep(6000); }
    tickCount++;

    if (tickCount % 50 === 0) {
      tryBuyAccess(ns);
      ({ hasTIX, has4S } = checkAccess(ns));
    }

    for (const sym of symbols) {
      const s = stocks[sym];

      s.priceHistory.push(ns.stock.getPrice(sym));
      if (s.priceHistory.length > cfg.histLen) s.priceHistory.shift();

      const [ls, lap, ss, sap] = ns.stock.getPosition(sym);
      s.longShares = ls;  s.longAvgPrice = lap;
      s.shortShares = ss; s.shortAvgPrice = sap;

      updateBlended(s);
      s.ticksSinceAction++;
    }

    if (!has4S && tickCount < 10) { printDashboard(); continue; }

    const tradesBefore = totalTradeCount;

    sellPhase();
    buyPhase();
    adaptParameters();

    const newTrades = totalTradeCount - tradesBefore;
    if (newTrades > 0) {
      for (let i = recentTrades.length - newTrades; i < recentTrades.length; i++) {
        if (i >= 0) doLogTrade(recentTrades[i]);
      }
    }

    if (tickCount % 100 === 0) doLogSnapshot();

    printDashboard();
  }
}

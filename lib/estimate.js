// ╔═══════════════════════════════════════════════════════════╗
// ║  ESTIMATE - Price-history-based market data estimation   ║
// ║  Replaces 4S data when unavailable. Also used for        ║
// ║  cross-validation and cycle-flip detection even WITH 4S. ║
// ║  Exports: estimateForecast(), estimateVolatility(),      ║
// ║           calcMomentum()                                 ║
// ╚═══════════════════════════════════════════════════════════╝

// ── HOW BITBURNER STOCKS WORK ──
//
// Each stock has a hidden "forecast" (probability of going up
// each tick). Every ~75 ticks, the game flips some stocks'
// forecasts (the "market cycle"). 4S data reveals the true
// forecast; without it, we estimate by counting up-ticks.
//
// The estimation approach: if a stock went up 60 out of 76
// recent ticks, we estimate forecast ≈ 0.789 (60/76).
// This converges to the true value over ~20-30 ticks.

// Estimates forecast from raw price history using three time windows.
//
// How it works:
//   1. Long window (e.g., 76 ticks): weighted up-tick count where
//      the newest tick has 2× the weight of the oldest. This halves
//      convergence time after a market cycle flip vs flat counting.
//   2. Short window (e.g., 10 ticks): flat count (unchanged).
//      Inversion detection needs a stable short-window signal;
//      weighting would make it too sensitive to single-tick noise.
//   3. Micro window (5 ticks): flat count. Fastest-reacting signal.
//      When micro disagrees with short AND short disagrees with long,
//      the flip is propagating in real time → inversionEarly fires
//      1-2 ticks before inversionFlag (confirmed flip).
//   4. Inversion detection: if long says bullish but short says
//      bearish (or vice versa), a cycle flip likely just happened.
//      The inversionDelta threshold prevents false positives.
//      Optional volatility arg enables adaptive delta: high-vol
//      stocks get a wider threshold (less noise-triggered exits).
//
// Parameters:
//   history         — array of prices, oldest first
//   longWindow      — ticks for main forecast (76 = standard)
//   shortWindow     — ticks for flip detection (8-10 typical)
//   inversionDelta  — min disagreement to flag a flip (0.12-0.15)
//   volatility      — optional; if provided, widens delta on high-vol stocks
//
// Returns: { forecast, forecastShort, forecastMicro, inversionFlag, inversionEarly }
//   forecast       — estimated probability stock goes up (0-1)
//   forecastShort  — same but short-window flat count
//   forecastMicro  — same but micro-window (5 ticks) flat count
//   inversionFlag  — true if a confirmed market cycle flip is detected
//   inversionEarly — true if flip is propagating (leading indicator, 1-2 ticks early)
export function estimateForecast(history, longWindow, shortWindow, inversionDelta, volatility) {
  const len = history.length;

  // Need at least 3 data points to compute any meaningful trend
  if (len < 3) return { forecast: 0.5, forecastShort: 0.5, forecastMicro: 0.5, inversionFlag: false, inversionEarly: false };

  const longLen  = Math.min(longWindow, len - 1);
  const shortLen = Math.min(shortWindow, len - 1);
  const microLen = Math.min(5, len - 1);          // micro window: 5 ticks

  const longStart  = len - longLen;   // first index for long window
  const shortStart = len - shortLen;  // first index for short window
  const microStart = len - microLen;  // first index for micro window

  // ── Long window: linearly weighted up-tick count ──
  // Weight increases linearly from 1.0 (oldest tick) to 2.0 (newest).
  // After a cycle flip, the recent "against-trend" ticks dominate
  // and pull the forecast through 0.5 roughly twice as fast.
  let longWeightedUps = 0;
  let longWeightTotal = 0;

  for (let i = longStart; i < len; i++) {
    const pos = i - longStart;  // 0 = oldest, longLen-1 = newest
    const w   = 1 + (longLen > 1 ? pos / (longLen - 1) : 0);  // 1.0 → 2.0
    longWeightTotal += w;
    if (history[i] > history[i - 1]) longWeightedUps += w;
  }

  // ── Short window: flat count (inversion detection stability) ──
  let shortUps = 0;
  for (let i = shortStart; i < len; i++) {
    if (history[i] > history[i - 1]) shortUps++;
  }

  // ── Micro window (5 ticks): flat count ──
  // The most recent signal. When this disagrees with short, the flip
  // cascade has already started at the newest ticks.
  let microUps = 0;
  for (let i = microStart; i < len; i++) {
    if (history[i] > history[i - 1]) microUps++;
  }

  const forecast      = longWeightTotal > 0 ? longWeightedUps / longWeightTotal : 0.5;
  const forecastShort = shortUps / shortLen;
  const forecastMicro = microUps / microLen;

  // ── Volatility-adaptive inversion delta ──
  // High-vol stocks move more each tick → random noise can briefly flip
  // short-window counts. Widening the delta on high-vol stocks prevents
  // these noise spikes from triggering premature exits.
  // At vol=0.015 (typical): 1× multiplier (no change)
  // At vol=0.030: 2× multiplier (threshold doubled)
  // At vol=0.045+: 3× multiplier (capped)
  const adaptiveDelta = (volatility != null)
    ? inversionDelta * (1 + Math.min(2, volatility / 0.015))
    : inversionDelta;

  // ── Confirmed inversion detection ──
  // A market cycle flip means the stock's hidden forecast
  // just reversed. The long window (which looks back far)
  // still shows the OLD trend, while the short window
  // (recent ticks only) shows the NEW trend.
  //
  // We detect this when:
  //   1. They disagree on direction (one > 0.5, other < 0.5)
  //   2. The gap exceeds adaptiveDelta (prevents noise triggers)
  const crossedLongShort = (forecast > 0.5) !== (forecastShort > 0.5);
  const inversionFlag    = crossedLongShort && Math.abs(forecast - forecastShort) > adaptiveDelta;

  // ── Early inversion detection (leading indicator) ──
  // Fires 1-2 ticks before the confirmed inversion when the flip
  // cascade is visibly propagating: micro has already flipped, short
  // is flipping, and long hasn't caught up yet.
  // Condition: micro disagrees with short AND short disagrees with long.
  const crossedShortMicro = (forecastShort > 0.5) !== (forecastMicro > 0.5);
  const inversionEarly    = crossedLongShort && crossedShortMicro;

  return {
    forecast,
    forecastShort,
    forecastMicro,
    inversionFlag,
    inversionEarly,
  };
}

// Estimates stock volatility from price history using EWMA.
// Volatility = exponentially-weighted average absolute % change per tick.
//
// EWMA (α=0.25) vs flat average:
//   - Flat average: all 20 ticks weighted equally
//   - EWMA: newest tick gets full α weight, older ticks decay by (1-α)^k
//   - Result: 2-3× faster adaptation to volatility regime changes
//   - A sudden vol spike shows up in the output within 2-3 ticks
//     vs ~10 ticks for a flat average
//
// Processing order: oldest → newest (forward pass) so the most
// recent tick has the highest effective weight in the final result.
//
// Higher volatility = larger expected moves = bigger potential
// profit per trade. The expected return formula uses this:
//   ER = volatility * (forecast - 0.5)
//
// Returns a decimal (e.g., 0.02 = 2% average tick movement).
export function estimateVolatility(history) {
  const len = history.length;
  if (len < 2) return 0.01;  // default 1% if no data

  const window = Math.min(20, len - 1);
  const start  = len - window;
  const alpha  = 0.25;
  let ewmaVol  = 0;

  for (let i = start; i < len; i++) {
    // Absolute percentage change from previous tick.
    // Forward pass means newest tick is processed last → highest weight.
    const pct = Math.abs(history[i] - history[i - 1]) / history[i - 1];
    ewmaVol = alpha * pct + (1 - alpha) * ewmaVol;
  }

  return ewmaVol;
}

// Calculates short-term momentum: are recent ticks strongly
// trending in one direction, with magnitude awareness?
//
// Used by bleeding edge trader to:
//   - Boost buy scores when momentum agrees with forecast
//   - Trigger early sells when momentum reverses hard
//
// Algorithm: magnitude-weighted sum over last 8 ticks.
// Each tick contributes: (|Δprice/price|) * weight * direction
//   - |Δprice/price| = actual size of move (not just +1/-1)
//   - weight increases linearly: 1.0 → 1.5 → 2.0 → ... → 4.5
//   - direction = +1 if up, -1 if down
// This is magnitude-aware: a 3% move scores much higher than a 0.1% move.
//
// Normalized: divided by maxPossibleScore (assumes 3% moves every tick).
// Returns: roughly -1 to +1
//   > 0  = recent upward momentum
//   < 0  = recent downward momentum
//   ≈ 0  = no clear direction or mixed magnitudes
export function calcMomentum(history) {
  if (history.length < 9) return 0;  // need 8 price-change pairs

  const len   = history.length;
  const start = len - 8;
  let score   = 0;

  for (let i = start; i < len; i++) {
    // Weight: 1.0 (oldest of 8) → 4.5 (newest)
    const weight = 1 + (i - start) * 0.5;
    const mag    = Math.abs(history[i] - history[i - 1]) / history[i - 1];
    const sign   = history[i] > history[i - 1] ? 1 : -1;
    score += mag * weight * sign;
  }

  // Normalize: max possible score assumes 3% moves in same direction
  // Weights: 1.0+1.5+2.0+2.5+3.0+3.5+4.0+4.5 = 22.0
  // maxPossibleScore = 0.03 * 22.0 = 0.66
  return score / (0.03 * 22.0);
}

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

// Estimates forecast from raw price history using two time windows.
//
// How it works:
//   1. Long window (e.g., 76 ticks): counts what fraction of
//      recent ticks had price increases. This is our forecast.
//   2. Short window (e.g., 10 ticks): same calc but recent only.
//      Used to detect cycle flips (see below).
//   3. Inversion detection: if long says bullish but short says
//      bearish (or vice versa), a cycle flip likely just happened.
//      The inversionDelta threshold prevents false positives.
//
// Parameters:
//   history         — array of prices, oldest first
//   longWindow      — ticks for main forecast (76 = standard)
//   shortWindow     — ticks for flip detection (8-10 typical)
//   inversionDelta  — min disagreement to flag a flip (0.12-0.15)
//
// Returns: { forecast, forecastShort, inversionFlag }
//   forecast      — estimated probability stock goes up (0-1)
//   forecastShort — same but short-window (for internal use)
//   inversionFlag — true if a market cycle flip is detected
export function estimateForecast(history, longWindow, shortWindow, inversionDelta) {
  const len = history.length;

  // Need at least 3 data points to compute any meaningful trend
  if (len < 3) return { forecast: 0.5, forecastShort: 0.5, inversionFlag: false };

  // ── Single pass over the history tail ──
  // Both windows overlap (short is a subset of long), so we
  // count both in one loop to avoid iterating twice.
  // The loop starts at the long window boundary and checks
  // whether each index also falls within the short window.
  const longLen  = Math.min(longWindow, len - 1);
  const shortLen = Math.min(shortWindow, len - 1);
  const longStart  = len - longLen;   // first index for long window
  const shortStart = len - shortLen;  // first index for short window

  let longUps  = 0;
  let shortUps = 0;

  for (let i = longStart; i < len; i++) {
    // Compare each price to the previous tick
    if (history[i] > history[i - 1]) {
      longUps++;
      // Only count toward short window if we're in its range
      if (i >= shortStart) shortUps++;
    }
  }

  const forecast      = longUps / longLen;
  const forecastShort = shortUps / shortLen;

  // ── Inversion detection ──
  // A market cycle flip means the stock's hidden forecast
  // just reversed. The long window (which looks back far)
  // still shows the OLD trend, while the short window
  // (recent ticks only) shows the NEW trend.
  //
  // We detect this when:
  //   1. They disagree on direction (one > 0.5, other < 0.5)
  //   2. The gap exceeds inversionDelta (prevents noise triggers)
  const crossed = (forecast > 0.5) !== (forecastShort > 0.5);
  const delta   = Math.abs(forecast - forecastShort);

  return {
    forecast,
    forecastShort,
    inversionFlag: crossed && delta > inversionDelta,
  };
}

// Estimates stock volatility from price history.
// Volatility = average absolute percentage change per tick.
//
// Uses the last 20 ticks (enough to smooth noise, recent
// enough to reflect current conditions).
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
  let sum = 0;

  for (let i = start; i < len; i++) {
    // Absolute percentage change from previous tick
    // Division by h[i-1] normalizes across different price scales
    sum += Math.abs(history[i] - history[i - 1]) / history[i - 1];
  }

  return sum / window;
}

// Calculates short-term momentum: are recent ticks strongly
// trending in one direction?
//
// Used by bleeding edge trader to:
//   - Boost buy scores when momentum agrees with forecast
//   - Trigger early sells when momentum reverses hard
//
// Algorithm: weighted sum over last 5 ticks.
// Recent ticks get higher weight (1.0 → 1.5 → 2.0 → 2.5 → 3.0)
// so a reversal in the last 1-2 ticks dominates the score.
//
// Returns: roughly -1 to +1
//   > 0  = recent upward momentum
//   < 0  = recent downward momentum
//   ≈ 0  = no clear direction
export function calcMomentum(history) {
  if (history.length < 6) return 0;

  const len   = history.length;
  const start = len - 5;
  let score = 0;

  for (let i = start; i < len; i++) {
    // Weight increases linearly: tick 0 = 1.0, tick 4 = 3.0
    const weight = 1 + (i - start) * 0.5;
    score += history[i] > history[i - 1] ? weight : -weight;
  }

  // Normalize: max possible score is 1+1.5+2+2.5+3 = 10
  return score / 10;
}

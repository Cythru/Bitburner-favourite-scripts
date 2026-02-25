// ╔═══════════════════════════════════════════════════════════╗
// ║  PORTFOLIO - Net worth calculation and visual helpers    ║
// ║  Exports: totalWorth(ns), sparkline(data, width)        ║
// ╚═══════════════════════════════════════════════════════════╝

// Calculates total net worth: cash + liquidation value of all
// stock positions.
//
// Uses getSaleGain() instead of price * shares because it
// accounts for the bid/ask spread and commission — gives the
// actual amount you'd receive if you sold right now.
//
// This queries live game state each call. Called multiple times
// per tick (dashboard, buy phase, logging) so it's a hot path,
// but the Bitburner API calls are essentially free in-game.
export function totalWorth(ns) {
  let w = ns.getServerMoneyAvailable("home");

  for (const sym of ns.stock.getSymbols()) {
    const [longShares, , shortShares] = ns.stock.getPosition(sym);

    // getSaleGain returns NET proceeds after commission
    if (longShares > 0)  w += ns.stock.getSaleGain(sym, longShares, "Long");
    if (shortShares > 0) w += ns.stock.getSaleGain(sym, shortShares, "Short");
  }

  return w;
}

// Renders an ASCII sparkline graph from numerical data.
// Used in dashboards to show net worth trend over time.
//
// How it works:
//   1. Find min/max of the data (using a loop, not Math.min(...data)
//      which would blow the stack on large arrays)
//   2. Downsample to fit the target width (step = data.length / width)
//   3. Map each value to one of 8 block characters (▁▂▃▄▅▆▇█)
//      based on its position between min and max
//
// Example output: "▁▂▃▃▅▆▇█▇▆▅▃▂▁" (16 chars wide)
//
// Parameters:
//   data  — array of numbers (e.g., net worth over 120 ticks)
//   width — max characters in the output string
//
// Returns: string of block characters, or "" if insufficient data
export function sparkline(data, width) {
  const len = data.length;
  if (len < 2) return "";

  // ── Find min/max with a single loop ──
  // Using Math.min(...data) would spread the array as function
  // arguments, which hits the JS engine's argument limit (~65k)
  // and throws RangeError on large arrays. A loop is O(n) and safe.
  let min = data[0];
  let max = data[0];
  for (let i = 1; i < len; i++) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const range = max - min || 1;  // avoid division by zero if flat

  // Block characters from shortest to tallest (8 levels)
  // Unicode: U+2581 through U+2588 (lower one eighth block → full block)
  const chars = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";

  // ── Downsample to target width ──
  // If we have 120 data points and width=40, step=3 means we
  // take every 3rd point. slice(-width) ensures we show the
  // most recent data if there's still too many after stepping.
  const step = Math.max(1, Math.floor(len / width));

  // Build output string directly (avoid intermediate array + join)
  let result = "";
  let count  = 0;

  for (let i = 0; i < len; i += step) {
    // Map value to 0-7 index into the block character set
    const idx = Math.min(7, Math.floor(((data[i] - min) / range) * 8));
    result += chars[idx];
    count++;
  }

  // If downsampling still left too many chars, trim to width
  // (take the rightmost = most recent data)
  if (count > width) {
    result = result.slice(count - width);
  }

  return result;
}

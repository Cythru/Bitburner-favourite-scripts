// ╔═══════════════════════════════════════════════════════════╗
// ║  LOGGING - Trade log and session snapshot persistence    ║
// ║  Writes to Bitburner's in-game filesystem (/strats/)    ║
// ║  Exports: logTrade(ns, file, trade, extra),             ║
// ║           logSnapshot(ns, file, data)                   ║
// ╚═══════════════════════════════════════════════════════════╝

// ── WHY LOG TRADES? ──
// Bitburner resets on augmentation install. Logs let you:
//   - Compare strategies across sessions
//   - See which stocks/modes are profitable
//   - Feed data to the paper trader for strategy optimization
//
// Files are appended ("a" mode) so they survive across
// script restarts within the same augmentation cycle.

// Logs a single trade event to a text file.
// Format: [T42] L FSIG P/L:+$1.23m | Total:$5.67m | Worth:$100m
// With opts: [T42] L FSIG P/L:+$1.23m | Total:$5.67m | Worth:$100m  In:$45.20 Out:$46.61 ER:+0.0120
//
// Parameters:
//   ns    — Netscript API handle
//   file  — path to log file (e.g., "/strats/trade-log.txt")
//   trade — object with { tick, type, sym, pnl }
//     tick — which market tick this trade happened on
//     type — "L" for long exit, "S" for short exit
//     sym  — stock symbol (e.g., "FSIG", "OMTK")
//     pnl  — profit/loss in dollars (negative = loss)
//   extra — optional suffix string for script-specific data
//           (e.g., " | Total:$5m | Worth:$100m")
//           defaults to "" if not provided
//   opts  — optional object with { entryPrice, exitPrice, er }
//           entryPrice — average price paid on entry
//           exitPrice  — price received on exit
//           er         — expected return at time of exit (signal strength)
//           All fields are optional. Backward compatible (defaults to {}).
export function logTrade(ns, file, trade, extra = "", opts = {}) {
  const { entryPrice, exitPrice, er } = opts;

  // Build price/ER annotation if any opts were provided
  let priceInfo = "";
  if (entryPrice != null) priceInfo += `  In:${ns.formatNumber(entryPrice, 2)}`;
  if (exitPrice  != null) priceInfo += ` Out:${ns.formatNumber(exitPrice, 2)}`;
  if (er         != null) priceInfo += ` ER:${(er >= 0 ? "+" : "") + er.toFixed(4)}`;

  const entry = `[T${trade.tick}] ${trade.type} ${trade.sym} ` +
    `P/L:${ns.formatNumber(trade.pnl)}${extra}${priceInfo}\n`;

  // "a" = append mode. Creates file if it doesn't exist,
  // adds to the end if it does. Never overwrites.
  ns.write(file, entry, "a");
}

// Writes a JSON snapshot of session state to a file.
// One JSON object per line (JSONL format) for easy parsing.
//
// Called every ~100 ticks to create a time series of
// portfolio performance. Each line is independent JSON
// so you can parse line-by-line without loading the whole file.
//
// Parameters:
//   ns   — Netscript API handle
//   file — path to data file (e.g., "/strats/session-data.txt")
//   data — any serializable object (gets JSON.stringified)
//          typically includes: tick, timestamp, worth, profit,
//          has4S, cash, win rate, etc.
//
// Example output line:
//   {"tick":100,"timestamp":1708800000,"worth":1.5e9,"profit":2.3e8}
export function logSnapshot(ns, file, data) {
  ns.write(file, JSON.stringify(data) + "\n", "a");
}

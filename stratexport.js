// Usage: run stratexport.js
// Prints a summary of all strategy data to the terminal before augmentation installs.
// Since /strats/ is wiped on aug install, run this first to capture key metrics.
// Copy the output from the terminal window.
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const sep = "─".repeat(60);

  ns.tprint(sep);
  ns.tprint("  STRATEGY EXPORT  —  " + new Date().toLocaleString());
  ns.tprint("  Copy this output before installing augmentations.");
  ns.tprint(sep);

  // ── Proven strategies ──
  const provenFile = "/strats/proven.txt";
  let proven = [];
  if (ns.fileExists(provenFile)) {
    try {
      const raw = ns.read(provenFile);
      if (raw && raw.length > 2) proven = JSON.parse(raw);
    } catch { ns.tprint("WARN: Could not parse proven.txt"); }
  }

  ns.tprint("");
  ns.tprint("PROVEN STRATEGIES  (" + proven.length + " graduated)");
  ns.tprint(sep);
  if (proven.length === 0) {
    ns.tprint("  None — paper trader has not graduated any strategies yet.");
  } else {
    // Sort by P/L descending
    proven.sort((a, b) => b.score.pnl - a.score.pnl);
    for (const s of proven) {
      const pnl    = ns.formatNumber(s.score.pnl, 2);
      const wr     = (s.score.winRate * 100).toFixed(1) + "%";
      const trades = s.score.trades;
      const sharpe = s.score.sharpe?.toFixed(3) ?? "n/a";
      const ticks  = s.ticksTested;
      ns.tprint(`  [${s.name}]  P/L: ${pnl}  WinRate: ${wr}  Trades: ${trades}  Sharpe: ${sharpe}  Ticks: ${ticks}`);
      const p = s.params;
      ns.tprint(`    BuyL: ${p.forecastBuyLong}  BuyS: ${p.forecastBuyShort}  SellL: ${p.forecastSellLong}  SellS: ${p.forecastSellShort}`);
      ns.tprint(`    BuyThreshold: ${p.buyThreshold}  MaxPct: ${p.maxPortfolioPct}`);
    }
  }

  // ── Trade logs ──
  const logFiles = [
    "/strats/trade-log.txt",
    "/strats/simple-trade-log.txt",
    "/strats/bleeding-edge-log.txt",
  ];

  ns.tprint("");
  ns.tprint("TRADE LOG SUMMARY");
  ns.tprint(sep);
  for (const file of logFiles) {
    if (!ns.fileExists(file)) continue;
    const content = ns.read(file);
    const lines   = content.split("\n").filter(l => l.trim());
    const trades  = lines.filter(l => l.includes("P/L:"));
    const wins    = trades.filter(l => l.includes("P/L:+") || l.match(/P\/L:\d/)).length;
    const last5   = trades.slice(-5);
    ns.tprint(`  ${file}  (${trades.length} trades, ~${wins} wins)`);
    for (const t of last5) ns.tprint("    " + t.trim());
  }

  // ── Session snapshots (last entry per file) ──
  const dataFiles = [
    "/strats/session-data.txt",
    "/strats/simple-session-data.txt",
    "/strats/bleeding-edge-data.txt",
  ];

  ns.tprint("");
  ns.tprint("LAST SESSION SNAPSHOTS");
  ns.tprint(sep);
  for (const file of dataFiles) {
    if (!ns.fileExists(file)) continue;
    const lines = ns.read(file).split("\n").filter(l => l.trim());
    if (lines.length === 0) continue;
    try {
      const last = JSON.parse(lines[lines.length - 1]);
      const worth  = ns.formatNumber(last.worth ?? 0, 2);
      const profit = ns.formatNumber(last.profit ?? 0, 2);
      const tick   = last.tick ?? "?";
      const mode   = last.mode ?? (file.includes("simple") ? "simple" : file.includes("bleeding") ? "bleeding" : "?");
      ns.tprint(`  ${file}`);
      ns.tprint(`    Tick: ${tick}  Mode: ${mode}  Worth: ${worth}  P/L: ${profit}`);
    } catch { ns.tprint(`  ${file} — could not parse last snapshot`); }
  }

  // ── Current net worth ──
  let worth = ns.getServerMoneyAvailable("home");
  try {
    for (const sym of ns.stock.getSymbols()) {
      const [ls, , ss] = ns.stock.getPosition(sym);
      if (ls > 0) worth += ns.stock.getSaleGain(sym, ls, "Long");
      if (ss > 0) worth += ns.stock.getSaleGain(sym, ss, "Short");
    }
  } catch { /* TIX API might not be available */ }

  ns.tprint("");
  ns.tprint("CURRENT STATE");
  ns.tprint(sep);
  ns.tprint("  Net Worth (est): " + ns.formatNumber(worth, 2));
  ns.tprint("  Hack Level: " + ns.getHackingLevel());
  try { ns.tprint("  Has 4S: " + ns.stock.has4SDataTIXAPI()); } catch {}

  ns.tprint(sep);
  ns.tprint("  Export complete. Copy above before installing augs.");
  ns.tprint(sep);
}

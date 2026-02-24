// ╔═══════════════════════════════════════════════════════════╗
// ║  MARKET - Stock market access purchasing and detection   ║
// ║  Auto-buys WSE/TIX/4S when affordable, waits for TIX    ║
// ║  Exports: tryBuyAccess(ns), checkAccess(ns),             ║
// ║           waitForTIX(ns)                                 ║
// ╚═══════════════════════════════════════════════════════════╝

// Bitburner stock market has 4 tiers of access, each unlocking
// more data/features. They must be purchased in order:
//
// 1. WSE Account      ($200m) — basic stock market access
// 2. TIX API          ($5b)   — programmatic trading (REQUIRED)
// 3. 4S Market Data   ($1b)   — raw forecast/volatility numbers
// 4. 4S TIX API       ($25b)  — access 4S data via code
//
// Without 4S, scripts estimate forecast from price history.
// TIX API is the minimum needed — scripts wait for it.

// Attempts to purchase each access tier if affordable.
// Checks are ordered cheapest-first so we buy what we can.
// Wrapped in try/catch because some APIs throw if the
// stock market hasn't been discovered yet in the game.
//
// Called periodically (every ~50 ticks) to auto-upgrade
// as the player earns more money.
export function tryBuyAccess(ns) {
  const cash = ns.getServerMoneyAvailable("home");
  try {
    // WSE account is the gateway — need it before anything else
    if (!ns.stock.hasWSEAccount()   && cash > 200e6)  ns.stock.purchaseWseAccount();

    // TIX API enables programmatic buy/sell — the script can't work without it
    if (!ns.stock.hasTIXAPIAccess() && cash > 5e9)    ns.stock.purchaseTixApi();

    // 4S data gives forecast numbers (without it, we estimate from prices)
    if (!ns.stock.has4SData()       && cash > 1e9)    ns.stock.purchase4SMarketData();

    // 4S TIX API lets us read 4S data in code — the gold standard
    if (!ns.stock.has4SDataTIXAPI() && cash > 25e9)   ns.stock.purchase4SMarketDataTixApi();
  } catch {
    // Stock market APIs throw if player hasn't unlocked the
    // stock market yet (e.g., haven't visited the WSE page).
    // Safe to ignore — we'll retry next tick.
  }
}

// Checks what market data access the player currently has.
// Returns a simple object that scripts destructure into state:
//   { hasTIX, has4S } = checkAccess(ns);
//
// hasTIX = can we call buy/sell/getPosition? (minimum to trade)
// has4S  = can we read getForecast/getVolatility? (better data)
export function checkAccess(ns) {
  try {
    return {
      hasTIX: ns.stock.hasTIXAPIAccess(),
      has4S:  ns.stock.has4SDataTIXAPI(),
    };
  } catch {
    // If the stock namespace isn't available at all, assume nothing
    return { hasTIX: false, has4S: false };
  }
}

// Blocks until TIX API access is available.
// Tries to buy it each loop iteration (in case player earns
// enough while waiting). Prints status to terminal so the
// player knows the script is alive and waiting.
//
// Returns the final access state so callers can immediately
// know if 4S is also available:
//   const { hasTIX, has4S } = await waitForTIX(ns);
export async function waitForTIX(ns) {
  tryBuyAccess(ns);
  let acc = checkAccess(ns);

  while (!acc.hasTIX) {
    // ns.tprint goes to the terminal (not the script's log window)
    // so the player sees it even if the tail window isn't open
    ns.tprint("Waiting for TIX API access...");

    // 30 second poll interval — not too spammy, not too slow
    await ns.sleep(30000);

    // Retry purchase each loop — player may have earned enough
    tryBuyAccess(ns);
    acc = checkAccess(ns);
  }

  return acc;
}

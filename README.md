# Bitburner Scripts — Cythru's Collection

A full suite of automation scripts for Bitburner — stock trading, gang management,
corporation automation, server hacking, and early-game bootstrapping. Built and
refined over multiple playthrough cycles.

---

## What's in Here

| Category | Scripts |
|----------|---------|
| **Stock Trading** | `FinalStonkinton.js`, `FinalStonkintonSIMPLE.js`, `bleedingedgestocktrader.js`, `FinalStonkinton-paper.js`, `stocktrader.js` |
| **Gang Management** | `autogang.js`, `stolengangscript.js` |
| **Corporation** | `autocorporation.js` |
| **Hacking / Servers** | `stolenscript.js`, `maxserverpurchase.js`, `joesgunsattack.js`, `newattack.js`, `genericscript2.js` |
| **Info / Util** | `info.js` |
| **Shared Libraries** | `lib/themes.js`, `lib/market.js`, `lib/estimate.js`, `lib/portfolio.js`, `lib/logging.js` |

---

## Stock Traders

The stock system is the most developed part of this repo. It evolved from a single
monolithic script (`stocktrader.js`) into a full ecosystem over one session.

### Quick Pick

| Situation | Script |
|-----------|--------|
| You want full control with multiple modes | `FinalStonkinton.js` |
| You just want something conservative running | `FinalStonkintonSIMPLE.js` |
| You want to test strategies before committing real money | `FinalStonkinton-paper.js` |
| You want the experimental adaptive edge | `bleedingedgestocktrader.js` |

---

### `FinalStonkinton.js` — Main Trader

The flagship. Three modes, full dashboard, ANSI colour, logging, paper-trader integration.

```
run FinalStonkinton.js [--turtle] [--yolo] [--liquidate] [--theme classic|neon|matrix|ocean|fire]
```

**Modes:**

- **Normal** (default) — balanced thresholds, buys many stocks, 57.5% forecast to enter
- **`--turtle`** — conservative, 65% forecast required; loads battle-tested params from
  `/strats/proven.txt` if the paper trader has graduated any strategies
- **`--yolo`** — one bet at a time, 10% of net worth, 24-minute cooldown after a loss

**Risk controls (always on):**
- `$1m` cash reserve — never invests the last dollar
- `80%` max deployment — keeps cash off the table
- `34%` per-stock cap (20% in turtle) — forced diversification
- Commission-aware sizing — every trade accounts for the `$100k` fee

**`--liquidate`** — emergency sell everything and exit. Use before aug installs.

**Dashboard shows:**
- Net worth, cash, invested %, session P/L
- Profit rate: /min, /hr, /24hr
- Net worth sparkline (▁▂▃▄▅▆▇█) over last 120 ticks
- Live positions table with forecast, unrealized P/L, return %, inversion warning
- Recent trade history (last 5)
- Top 5 opportunities radar

**Themes:** `classic` (default) · `neon` · `matrix` · `ocean` · `fire`

**Logs written to:**
- `/strats/trade-log.txt` — human-readable trade history (appended, survives restarts)
- `/strats/session-data.txt` — JSONL snapshots every 100 ticks

---

### `FinalStonkintonSIMPLE.js` — Lean Turtle Trader

Conservative-only, no mode switching, lower complexity. Good for when you just want
something reliable running without thinking about it.

```
run FinalStonkintonSIMPLE.js [--liquidate] [--theme ...]
```

Same risk controls as FinalStonkinton. Thresholds: 65% forecast to enter, 52% to exit.
Logs to `/strats/simple-trade-log.txt`.

---

### `FinalStonkinton-paper.js` — Paper Trading Lab

Runs 6 strategies in parallel with **virtual portfolios** — no real money at risk.
Reads live market prices but never places real orders. After 200 ticks, strategies
with positive P/L and >55% win rate get written to `/strats/proven.txt`.
FinalStonkinton's turtle mode reads that file on startup.

```
run FinalStonkinton-paper.js
```

**Strategies tested simultaneously:**

| Strategy | Forecast to enter | Max per stock |
|----------|------------------|---------------|
| Aggressive | 55% | 40% |
| Moderate | 57.5% | 34% |
| Conservative | 60% | 25% |
| Turtle | 65% | 20% |
| Sniper | 70% | 15% |
| Momentum | 55% + short window=5 | 34% |

Dashboard shows P/L, win rate, trade count, max drawdown, and Sharpe ratio for all
6 strategies every tick. Graduating strategies are marked with `*`.

Run this alongside the real trader. After 200 ticks, switch to `--turtle` mode in
FinalStonkinton to automatically use the best-performing strategy's parameters.

---

### `bleedingedgestocktrader.js` — Adaptive Experimental Trader

Three features not in any other script:

**1. Adaptive thresholds** — every 50 ticks the script checks its recent win rate
and adjusts its entry/exit thresholds and position sizing automatically:
- Win rate >65% → loosen up, take bigger positions
- Win rate <45% → tighten up, get conservative

**2. Momentum scoring** — weights recent price ticks (last 5) to boost buy ranking
when price momentum agrees with the forecast signal. Also triggers early exits
when momentum reverses hard (>0.3 score flip).

**3. 4S + estimate blending** — when 4S data is available, cross-validates it
against the price-history estimate. When they agree: 70% 4S + 30% estimate.
When they disagree: 85% 4S. Catches cycle flips 1-2 ticks before 4S updates.

```
run bleedingedgestocktrader.js [--liquidate] [--theme ...]
```

Best used when you have 4S data. Still experimental — adaptive bounds have not been
stress-tested. Logs to `/strats/bleeding-edge-log.txt`.

---

### `stocktrader.js` — Original (Ghost of Wall Street)

The v1 monolith this all evolved from. Still functional. Single strategy, no colour,
no logging, no modes, no deployment cap. Kept for reference.

```
run stocktrader.js [--liquidate]
```

---

### How the Market Works (Quick Primer)

Bitburner stocks have a hidden **forecast** — the probability the price goes up each
tick. Every ~75 ticks the game flips some forecasts (the "market cycle").

- **With 4S TIX API** — you can read the exact forecast and volatility numbers.
  Much more accurate. Worth `$25b` total to unlock.
- **Without 4S** — scripts estimate forecast by counting up-ticks over 76 ticks.
  Takes ~20-30 ticks to converge after a cycle flip.

**Expected return formula:** `ER = volatility × (forecast − 0.5)`
Positive ER = expected gain. Negative = expected loss. This is the core buy/sell signal.

**Market access cost ladder:**

| Tier | Cost | What you get |
|------|------|-------------|
| WSE Account | $200m | Can view the stock market |
| TIX API | $5b | Can trade programmatically (required) |
| 4S Market Data | $1b | Forecast/volatility visible in the UI |
| 4S TIX API | $25b | Can read forecast/volatility in code |

All traders auto-buy these as you earn money (`autoBuyAccess: true`).

---

## Gang Management

### `autogang.js` — Elite Gang Manager v8.0

Full gang automation. Dynamic training goals, stagnation detection, equipment
purchasing, ascension, territory warfare, and server purchasing — all in one.

```
run autogang.js
```

**What it does each cycle:**
- Recruits new members instantly whenever slots are open
- Trains members until they hit 92% of the top 3 members' average combat stats
- Detects stagnation (no stat growth in 8 cycles) and forces training
- Ascends members when multiplier gain exceeds 1.85x
- Buys combat-value-weighted equipment (up to 8% of cash per piece)
- Assigns the best productive task based on gang state:
  - Vigilante Justice when wanted penalty is critical
  - Territory Warfare when respect > 200m and win chance > 60%
  - Best crime for the current respect tier otherwise
- Upgrades home RAM (up to 40% of cash) and purchases/upgrades farm servers

Also spawns a 30-second HUD showing money, hack level, gang stats, and territory.

**Respect → task tier:**

| Respect | Task |
|---------|------|
| < 1m | Mug People |
| 1m–5m | Deal Drugs |
| 5m–20m | Strongarm Civilians |
| 20m–100m | Run a Con |
| 100m–500m | Armed Robbery |
| 500m–2b | Human Trafficking |
| > 2b | Terrorism |

---

### `stolengangscript.js` — Override-Mode Gang Script

A more manual gang manager with override flags for forcing specific tasks. Useful
when you need to manually push all members into territory warfare, training, or
want-reduction, without the autogang heuristics getting in the way.

```
run stolengangscript.js [respect|earn|decrease|charisma|hacking|combat|warfare]
```

No arg = normal smart assignment. Pass one arg to override all members to that task type.

---

## Corporation

### `autocorporation.js` — LazyCorp Automation

Full corporation loop. Creates and runs a Tobacco + Pharmaceutical corp automatically.
Expands to all 6 cities, hires and assigns employees, buys materials, makes products,
researches upgrades, and eventually goes public.

```
run autocorporation.js
```

Requires ~`$150b` to start (or use the Bitnode starting bonus). Sleeps 30s between
cycles. Named `LazyCorp` because you never have to touch it.

**Job assignment split:** 40% Operations · 40% Engineering · 10% Management · 5% Business · remainder R&D

**Research priority:** Hi-Tech R&D → Market-TA.I → Market-TA.II → Market-Data Mines → others

**Goes public** at 300 million shares once 2+ products exist.

---

## Hacking / Server Scripts

### `stolenscript.js` — Auto-Nuker

Scans the entire network from home, opens ports with any exe files on hand
(BruteSSH, FTPCrack, RelaySMTP, HTTPWorm, SQLInject), and nukes every accessible
server. Runs in a 30-second loop, perpetually rooting new servers as your hacking
level and tools improve.

```
run stolenscript.js
```

Good to have running constantly in the background from early game onward.

---

### `maxserverpurchase.js` — Dedicated Server Fleet

Buys max-RAM purchased servers and deploys grow/hack/weaken scripts against
`joesguns`. Classic early-mid game farm setup: 9 grow servers, 8 hack servers,
8 weaken servers.

```
run maxserverpurchase.js
```

Requires `grow.js`, `hack.js`, and `weaken.js` to exist on home.

---

### `joesgunsattack.js` — joesguns Farm (v2)

Similar to maxserverpurchase but with hardcoded 256TB RAM and 130k threads.
Buys and deploys grow/hack/weaken servers against `joesguns` in a loop.

```
run joesgunsattack.js
```

---

### `newattack.js` — n00dles Farm (Early Game)

Early-game server deployer targeting `n00dles`. Smaller RAM (proportional to balance).
Has some off-by-one weirdness in the loop — use `maxserverpurchase.js` once you
have real money.

```
run newattack.js
```

---

### `genericscript2.js` — Simple Nuke Loop

The simplest possible version of the auto-nuker concept. Scans home neighbors only
(not the full network). Kept for nostalgia.

```
run genericscript2.js
```

---

### `info.js` — Server Inspector

Prints detailed information about any server: security, money, RAM, hack requirements,
backdoor status, port counts. Useful for deciding whether a server is worth targeting.

```
run info.js <target>
```

---

## Shared Libraries (`/lib/`)

The stock trader scripts share these libraries. Copy the whole `lib/` folder into your
Bitburner home before running any of the FinalStonkinton scripts.

| File | Exports | Description |
|------|---------|-------------|
| `lib/themes.js` | `getTheme(ns)`, `makeColors(theme)` | 5 ANSI colour palettes for dashboards |
| `lib/market.js` | `tryBuyAccess(ns)`, `checkAccess(ns)`, `waitForTIX(ns)` | Market tier purchasing and detection |
| `lib/estimate.js` | `estimateForecast(...)`, `estimateVolatility(history)`, `calcMomentum(history)` | Price-history-based forecast estimation |
| `lib/portfolio.js` | `totalWorth(ns)`, `sparkline(data, width)` | Net worth calc + ASCII graph renderer |
| `lib/logging.js` | `logTrade(ns, file, trade, extra)`, `logSnapshot(ns, file, data)` | Trade log and session data persistence |

---

## Setup

### Installing the stock trader system

1. Copy all files to your Bitburner home (`/`) via the in-game editor or `wget`
2. Copy `lib/` to `/lib/` on home
3. Make sure you have at least TIX API access (`$5b`) — or let the scripts buy it
4. Run the paper trader first to collect strategy data:
   ```
   run FinalStonkinton-paper.js
   ```
5. After 200+ ticks, run the main trader in turtle mode:
   ```
   run FinalStonkinton.js --turtle
   ```
6. Switch to normal mode once you're comfortable:
   ```
   run FinalStonkinton.js
   ```

### Recommended stack for mid-game

```
run stolenscript.js          # auto-nuke everything in the background
run autogang.js              # full gang automation
run FinalStonkinton-paper.js # collect strategy data
run FinalStonkinton.js --turtle --theme neon  # make money
```

### Before installing augmentations

Always liquidate stock positions first — aug installs wipe everything:

```
run FinalStonkinton.js --liquidate
```

---

## File History

| Script | Origin | Status |
|--------|--------|--------|
| `stocktrader.js` | First stock bot written | Superseded, kept for reference |
| `newstonkinking.js` | Early 4S-only stock bot (34 lines) | Superseded |
| `FinalStonkinton.js` | Full rebuild of stocktrader.js | Active |
| `FinalStonkintonSIMPLE.js` | Lean fork of FinalStonkinton | Active |
| `FinalStonkinton-paper.js` | New — paper trading lab | Active |
| `bleedingedgestocktrader.js` | Experimental adaptive branch | Active/Experimental |
| `autogang.js` | Rewrite of stolengangscript.js | Active |
| `stolengangscript.js` | First gang manager (community-sourced) | Legacy |
| `autocorporation.js` | Written from scratch | Active |
| `stolenscript.js` | Community auto-nuker, adapted | Active |
| `maxserverpurchase.js` | Server farm deployer | Active |
| `joesgunsattack.js` | Older joesguns farm | Legacy |
| `newattack.js` | Early n00dles farm | Legacy |
| `genericscript2.js` | Earliest script in the repo | Legacy |
| `info.js` | Server info printer | Utility |

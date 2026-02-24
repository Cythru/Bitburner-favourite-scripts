# Bitburner Stock Trader — Session Patch Notes
**Date:** 2026-02-24
**Session time:** ~7 hours (10:35 → 17:42)

---

## What This Is

A from-scratch rebuild of a Bitburner stock trading system. Started with
`stocktrader.js` (a single monolithic file called "Ghost of Wall Street")
and ended the session with a full multi-file ecosystem: shared libraries,
multiple trader variants, a paper trading lab, and an adaptive experimental
trader. Everything runs inside Bitburner's in-game terminal.

---

## v1 → v2: Ghost of Wall Street → FinalStonkinton

### The Starting Point (`stocktrader.js`)

The original was functional but had clear limitations:

- All logic in one 451-line file — forecast estimation, trading, dashboard, access buying all tangled together
- No cash reserve (`reserveCash: 0`) — could theoretically invest every dollar
- No deployment cap — no limit on how much of net worth goes into stocks
- No colour in the dashboard — plain text only
- No logging — trades vanished when the script restarted
- Shorts were assumed available (would silently fail if they weren't)
- No trading modes — one strategy, no tuning
- No sparkline or historical view — you could only see the current tick

### What Changed in FinalStonkinton

**Architecture overhaul — shared libraries**

The biggest structural change. Five functions that were copied inline got
extracted into `/lib/`:

| Library | What it does |
|---------|-------------|
| `lib/themes.js` | 5 ANSI colour palettes (classic, neon, matrix, ocean, fire) |
| `lib/market.js` | `tryBuyAccess`, `checkAccess`, `waitForTIX` |
| `lib/estimate.js` | `estimateForecast`, `estimateVolatility`, `calcMomentum` |
| `lib/portfolio.js` | `totalWorth`, `sparkline` |
| `lib/logging.js` | `logTrade`, `logSnapshot` |

This means FinalStonkintonSIMPLE and bleedingedge both share the same
estimation and sparkline code. Bug fix in one place = fix everywhere.

**Three trading modes in one script**

- `Normal` — balanced thresholds, buys many stocks at once
- `Turtle` (--turtle) — conservative, high-confidence signals only; tries to load battle-tested params from the paper trader's `proven.txt`
- `YOLO` (--yolo) — single 10% bet at a time, 24-minute loss cooldown

**Risk management added**

- `$1m cash reserve` — never invests the last dollar
- `80% max deployment` — always keeps some cash off the table
- `34% per-stock cap` — forces diversification
- Commission-aware sizing — every buy/sell subtracts $100k from the budget before calculating shares

**Dashboard improvements**

- ANSI colour throughout (green profits, red losses, dim labels)
- Sparkline net worth graph (▁▂▃▄▅▆▇█) over the last 120 ticks
- Colour-coded P/L with +/- sign
- Session return percentage
- Profit rate projection: per-minute, per-hour, per-24hr
- Inversion flag `!` shown inline in position table
- Recent trade history (last 5 trades with tick number)
- Top 5 opportunities radar (not shown in YOLO mode)
- Mode indicator at top (NORMAL / TURTLE UP / GO BIG OR GO HOME)

**Trade logging**

- `/strats/trade-log.txt` — human-readable, append-only, survives restarts
- `/strats/session-data.txt` — JSONL snapshots every 100 ticks for analysis
- Session header written on start: timestamp + mode

**Inversion detection improvement**

The estimation engine now runs every tick even when 4S data is available.
This keeps the inversion detector "warm" so cycle flips are caught faster.
Previously estimation only ran as a fallback.

---

## Paper Trading Lab (`FinalStonkinton-paper.js`)

Entirely new — didn't exist in v1.

Runs 6 strategies in parallel with virtual portfolios (no real money at risk):

| Strategy | Buy Threshold | Max per Stock |
|----------|--------------|---------------|
| Aggressive | 0.55 forecast | 40% |
| Moderate | 0.575 forecast | 34% |
| Conservative | 0.60 forecast | 25% |
| Turtle | 0.65 forecast | 20% |
| Sniper | 0.70 forecast | 15% |
| Momentum | 0.55 + shortWindow=5 | 34% |

After 200 ticks, strategies with positive P/L and >55% win rate get
"graduated" — written to `/strats/proven.txt` as JSON. FinalStonkinton's
Turtle mode reads that file on startup and uses the best-performing
strategy's parameters instead of hardcoded defaults.

The graduation system is the most interesting structural piece: it creates
a feedback loop where the paper trader discovers what works on the live
market and feeds it back into the real trader automatically.

**Dashboard shows:** P/L, win rate, trade count, max drawdown, Sharpe ratio
for all 6 strategies side by side, updated every tick.

---

## Simplified Variant (`FinalStonkintonSIMPLE.js`)

A stripped-down turtle-only trader. Cleaner to read, lower RAM footprint.
Uses the same shared libs as FinalStonkinton. Good for when you just want
the script running without thinking about modes.

Conservative defaults:
- Forecast threshold: 0.65 long / 0.35 short
- Min expected return: 0.002
- Max per stock: 20%

---

## Bleeding Edge (`bleedingedgestocktrader.js`)

The experimental branch. Three features not in any other trader:

**1. Adaptive parameters**

Every 50 ticks (minimum 5 trades), the trader checks its recent win rate
and adjusts thresholds automatically:

- Win rate > 65% → loosen thresholds, allow bigger positions
- Win rate < 45% → tighten thresholds, shrink positions

The bounds prevent it from adapting itself into absurdity
(buy threshold floors at 0.0005, ceiling at 0.003).

**2. Momentum scoring**

`calcMomentum()` weights the last 5 ticks with linearly increasing weights
(1.0 → 1.5 → 2.0 → 2.5 → 3.0). Returns -1 to +1.

Used two ways:
- Buy scoring: momentum that agrees with forecast boosts the stock's rank
- Sell trigger: strong momentum reversal (>0.3) forces early exit

**3. 4S + estimate blending**

When 4S data is available, rather than ignoring the estimate entirely,
the trader cross-validates them:

- Both agree (same direction) → blend 70% 4S + 30% estimate
- Disagree → trust 4S more heavily (85%) + pull toward 0.5

This catches cases where 4S data lags a cycle flip by a tick or two —
the estimate may pick it up first.

---

## What Working on This Was Like

**The good parts:**

The estimation engine was the most satisfying problem. Bitburner's market
runs on a hidden Markov-like cycle: each stock has a true forecast
(probability of going up), and every ~75 ticks some forecasts flip.
Without 4S data you can't see these numbers directly. The solution —
count up-ticks over a long window vs. a short window, flag disagreement
as a flip — is simple but it actually works. The "aha" moment when
inversion detection started catching cycle flips a tick or two before
a loss would have happened was genuinely satisfying.

Extracting the shared libraries felt good too. The original file had
`estimateForecast` and `totalWorth` and `tryBuyAccess` all tangled up
with trading logic and dashboard rendering. Pulling them apart made
each part easier to reason about independently.

The paper trader + graduation pipeline was the most architecturally
interesting piece. Building a feedback loop where a read-only simulation
feeds parameters into the live trader was a clean design. It also meant
the turtle mode can improve itself over time without any manual tuning.

The sparkline was a small thing but looked really good in the dashboard.
The trick of avoiding `Math.min(...data)` because it blows the stack on
large arrays was a neat edge case to solve.

**Things that were interesting to figure out:**

- Why estimation needs to keep running even with 4S: the inversion
  detector needs a continuous price history to compare windows.
  If you only run estimation when 4S is absent, the short window
  goes cold and cycle flips get missed.
- Commission math: you can't just do `shares = budget / price`.
  You have to subtract the $100k commission first, then check
  `getPurchaseCost` which includes bid/ask spread, then verify
  it fits in the remaining budget. Getting this wrong means the
  buy fails silently or overspends.
- The YOLO cooldown: 24 minutes after a loss. This prevents
  tilt-trading (immediately betting again after a bad trade)
  which is a real pattern in the game that kills accounts.

---

## Things to Improve

**Estimation accuracy without 4S:**

The current approach (count up-ticks / total ticks) converges slowly.
After a cycle flip you need ~20-30 ticks before the long-window estimate
reflects the new reality. During that window you're either sitting out
(inversion flag) or possibly trading on stale data. A faster convergence
algorithm would help — weighted recency (recent ticks count more than old
ones) could cut the lag in half.

**The paper trader doesn't model commission drag properly:**

Virtual buys calculate cost as `shares * price + COMMISSION` but virtual
sells don't fully account for the bid/ask spread. Real trades use
`getSaleGain()` which includes spread; the paper trader uses `getBidPrice`
directly. This means paper performance will be slightly optimistic vs.
real-money performance. The graduation criteria could compensate with a
higher required win rate.

**No persistence across augmentation installs:**

Logs are in `/strats/` which gets wiped on aug install. There's no way
to carry session data forward. This isn't solvable inside Bitburner
(it's a game limitation) but it means the graduation system restarts
from scratch every aug cycle. A CSV export to clipboard or something
similar could help track cross-cycle performance.

**bleedingedge adaptive engine is untuned:**

The 50-tick minimum between adjustments and the ±0.01 step size were
chosen arbitrarily. The adaptation bounds (floor/ceiling) also haven't
been tested under adversarial conditions (what happens if it adapts
into a losing streak?). The engine needs more testing before it can
be trusted for serious money.

**No position age tracking:**

Stocks that have been held a long time but aren't moving should probably
be exited to free capital for better opportunities. `ticksSinceAction`
exists but only tracks how long since the last buy/sell, not how long
the current position has been open. A `positionOpenTick` field would
enable time-based exit rules.

**SIMPLE and FinalStonkinton have diverged:**

FinalStonkinton grew features (logging, paper trader integration, YOLO)
while SIMPLE stayed lean. If a bug is fixed in FinalStonkinton's sell
logic it won't automatically apply to SIMPLE. They should either be
kept in sync manually or SIMPLE should be made a thin wrapper around
the same core functions. The shared libs help but the actual buy/sell
logic is still duplicated.

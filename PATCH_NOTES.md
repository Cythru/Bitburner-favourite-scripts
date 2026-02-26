# Sicko Mode — Stock Trading Overhaul Patch Notes

---

## Hotfix v3 — Estimation Algorithm Regression Fix (2026-02-26)

### Root cause of "fat profits → wasting money" (actual fix)

**Previous diagnosis was wrong.** Config values (thresholds, Kelly K, commission, etc.) between old and new scripts were identical. The real cause: the estimation algorithm changed.

- **Old script**: Dynamically imported `lib/estimate.js` at runtime, fell back to `_fbEstFc` (simple equal-weight up-tick counter) because the import chain was always failing silently with "WARN: Missing libs". The fallback algorithm mirrors Bitburner's internal forecast calculation — stable and accurate.
- **New script (broken)**: Inlined `estimateForecast()` with 2× recency-weighted long window. This amplifies short-term noise. Without 4S data, the signal is already noisy — weighting recent ticks more makes it worse. Result: false entries (e.g. APHE entered on a noisy spike, lost −14.6%).

**Fix:** `runEstimation()` now calls `_fbEstFc` directly (the same simple up-tick counter the old script used). `estimateForecast` / EWMA vol remain inlined in the file but are no longer used for trade signals.

---

## Hotfix v2 — Spread Filter Re-tuned + Paper Top-3 Unblocked (2026-02-26)

### Bug: `spreadMaxFrac: 50.0` allowed too many low-quality trades
The previous hotfix overcorrected from 3.0 → 50.0. At 50.0, the script would enter trades needing up to 25 ticks just to recover the spread cost — eating into profit margins on signals that barely had any edge. On a small post-reset portfolio with noisy estimated forecasts, this meant bad trades were being entered.

**Root cause of "fat profits → wasting money":** The script config is identical to the profitable version except the spread filter. Old value of 3.0 worked fine pre-reset with 4S data + high-vol stocks producing large ERs. Post-reset, no 4S and smaller ERs meant 3.0 blocked everything. The overcorrection to 50.0 unblocked trading but let in junk signals.

**Fix:** `spreadMaxFrac: 50.0 → 20.0`. Breakeven within ~10 ticks. Passes strong signals (WDS ER=0.00496, spread=2.18%: breaks even in ~4 ticks ✓). Blocks weak signals with wide spreads (ER=0.001, spread=2%: needs 20 ticks, rejected ✗).

---

### Bug: Paper Conservative/Turtle/Sniper never traded (0T shown)
Paper minimums were set to `$1m`. With a $4.24m portfolio:
- Conservative (25% cap): $1.06m → barely passed
- **Turtle (20% cap): $848k → blocked**
- **Sniper (15% cap): $636k → blocked**

Turtle and Sniper showed `0T / n/a` the entire run, defeating the purpose of the paper lab.

**Fix:** Paper minimums `$1m → $200k` (2× PAPER_COMMISSION). Paper money is virtual so commission overhead is irrelevant — the goal is learning which strategy wins, not optimising for trade efficiency.

---

## Hotfix — Post-Aug Reset Trading Broken (2026-02-26)

### Bug: Spread filter blocked ALL buys after aug reset
`spreadMaxFrac` was set to `3.0`, meaning a stock was skipped if its bid-ask spread exceeded 3× its per-tick expected return. This implicitly assumed a ~1.5-tick hold time. With typical Bitburner spreads of 1–3% and per-tick ERs of 0.1–0.5%, almost every stock failed this check — silently, with no warning in the dashboard. The script would scan, find signals in RADAR, and then buy nothing.

**Why it worked before:** Pre-reset with a large balance and 4S data, high-volatility stocks produced larger ERs (0.5–1.5%/tick), and many passed even at `×3`. Post-reset with estimated data and lower ERs, none did.

**Fix:** `spreadMaxFrac: 3.0 → 50.0`. Spread is a one-time cost; a 2% spread on a 20-tick hold is trivial. Only rejects trades where the spread would take >25 ticks to recover.

---

### Bug: `$2m` minimum buy gate blocked all trades on small post-reset portfolios
Every stock had a hard `if (budget < $2m) continue` gate. With a $4–5m post-reset balance and `maxPortfolioPct = 34%`, the per-stock cap was ~$1.4–1.7m — below the gate. All stocks skipped silently every tick.

**Why it worked before:** Pre-reset with hundreds of millions, per-stock caps were tens of millions, way above $2m.

**Fix:** All buy minimums lowered from `$2m → $1m` across real trader, paper mode, and YOLO. $1m = 10× commission, keeping round-trip overhead at ~20%.

---

### Feature: Auto-revert to SAFE_CONFIG on bad runs
New safety net in `recordTrade()`:
- Tracks `consecutiveLosses` (resets on any win) and a 20-trade rolling window
- Triggers **SAFE MODE** if: 3 consecutive losses OR rolling win rate < 45% over 10+ trades
- Applies conservative locked params: 65%/35% forecast thresholds, 20% max per stock
- Recovery check every 50 ticks: if last 10 trades hit ≥55% WR, reloads proven params and exits safe mode
- Dashboard header shows `⚠ SAFE MODE` in yellow with trigger reason and ticks until next recovery check

---

### Fix: Paper trader initialized with `$0` virtual cash
Paper portfolios were initialized with `ns.getServerMoneyAvailable("home")` — but by the time paper init ran, the real trader had already deployed most cash into positions. Paper portfolios started with near-zero virtual funds and could never buy anything.

**Fix:** Initialize with `totalWorth(ns)` (full net worth including open positions) so paper strategies always have a proper virtual bankroll regardless of real deployment.

---

> **TL;DR:** Sharper signals (3-window flip detection, EWMA vol, magnitude momentum), smarter capital allocation (Kelly sizing replaces flat %-cap), fewer false exits (2-tick inversion confirmation), more aggressive profit-taking (early exit at +5% after 40 ticks), and a portfolio drawdown circuit-breaker. Paper trader now runs 300 ticks and uses the same forecast algorithm as the live trader.

---

## Signal Engine (`lib/estimate.js`)

### Three-window forecast + early flip detection
Added a **micro window** (5 ticks) alongside the existing short (10) and long (76) windows.

- `inversionEarly`: fires when micro disagrees with short **and** short disagrees with long — the flip cascade is visible in real time, 1–2 ticks before the confirmed flag.
- `inversionFlag` (existing): now the *confirmed* flip — requires the 2-tick debounce applied by each trader.

### Volatility-adaptive inversion delta
`estimateForecast()` now accepts an optional `volatility` argument.

- `adaptiveDelta = inversionDelta × (1 + min(2, vol / 0.015))`
- High-vol stocks get a wider threshold — fewer noise-triggered exits.
- Low-vol stocks get a tighter threshold — faster flip detection.

### EWMA volatility (replaces flat 20-tick average)
`estimateVolatility()` now uses exponentially weighted moving average (α = 0.25).

- Most recent tick has the highest effective weight; older ticks decay by (1−α)^k.
- 2–3× faster adaptation when volatility regime changes.

### Extended + magnitude-weighted momentum
`calcMomentum()` now runs over **8 ticks** (was 5) and weights by actual price move size.

- `score += |Δprice/price| × weight × direction`
- Large moves (3%) score proportionally higher than tiny wobbles (0.1%).
- Normalized to −1..+1 assuming 3% max moves.

---

## Capital Allocation

### Kelly-adjacent position sizing (all traders)
Replaced flat `tw × maxPortfolioPct` cap with a per-stock Kelly fraction:

```
kellyFrac = min(maxPortfolioPct, |ER| / (vol² × KELLY_K))
perStockCap = totalWorth × kellyFrac
```

- High-vol stocks get **smaller** allocations automatically.
- High-ER signals get **more** capital.
- `KELLY_K = 30` keeps sizing conservative.

---

## Exit Logic

### Inversion 2-tick confirmation (all traders)
Raw `inversionFlag` is now debounced before triggering sells:

- Tick 1: raw flag fires — record `inversionSince`.
- Tick 2+: flag still firing — `inversionFlag = true`, triggers sell.
- Any tick without flag — reset immediately.

Eliminates hard exits from single-tick noise spikes.

### Early profit-taking (all traders)
New exit condition: if position is up **≥5%** after **40+ ticks**, close it without waiting for forecast neutrality. Prevents gains from evaporating over a slow drift back to neutral.

### inversionEarly threshold tightening (`FinalStonkinton.js` only)
When `inversionEarly` is true, sell threshold tightens by 0.01 (exits 1–2 ticks earlier). Logs `[EARLY]` tag in trade log when this is the deciding factor.

### Portfolio drawdown halt — buys only (`FinalStonkinton.js`)
Tracks `sessionPeakWorth`. If portfolio falls >20% from peak, buy phase is skipped (sells still run normally). Prevents deploying capital into a sustained bear cycle.

---

## Confidence Scaling Fix (`bleedingedgestocktrader.js`)

**Bug fixed:** confidence was multiplicative — at min confidence (0.2) the position cap was 20% of normal, effectively halting trading during losing streaks.

**New formula** (additive):
```
effectiveMax = tw × (maxPerStock × 0.75 + maxPerStock × 0.25 × confidence)
```
At confidence 0.2: **80%** of cap. At 1.0: **100%** of cap.

Also: `allTradePnls` capped at 100 entries (was unbounded).

---

## Paper Trader (`FinalStonkinton-paper.js`)

### Critical: forecast algorithm sync
Paper trader's internal `estimateForecast()` was using a flat up-tick count. Now uses the **1.0→2.0 linearly weighted** version matching `lib/estimate.js`. Without this, graduation win rates were computed against a different signal.

### Spread adjustment for virtual exits
Virtual sells now apply a 0.3% spread penalty (`getBidPrice × 0.997` / `getAskPrice × 1.003`) to match `getSaleGain()` realism. Previously raw bid/ask inflated paper win rates by ~0.5%.

### Graduation threshold: 200 → 300 ticks
More market cycles observed before graduation = better statistical confidence.

---

## Visualization (`lib/portfolio.js`)

### Max-pooling sparkline
Replaced step-sampling with **max-pooling**: each output character now represents the peak in a bucket. Net worth highs are always visible in the chart.

---

## Trade Log (`lib/logging.js`)

### Richer log format
`logTrade()` accepts optional `opts = { entryPrice, exitPrice, er }`:
```
[T42] L FSIG P/L:+$1.23m | Total:$5.67m | Worth:$100m  In:$45.20 Out:$46.61 ER:+0.0120
```
Fully backward compatible.

---

## Pros/Cons vs Best Online Alternative

The most-cited Bitburner stock script is the one from the community wiki / Antalis fork. Here's how this codebase compares:

### Your scripts (pros)
- **3-script ecosystem** — paper lab tests strategies live, promotes winners to turtle mode, main trader runs them. Online scripts are usually a single monolithic file.
- **inversionEarly** leading indicator — no online script I've seen detects the flip cascade at the micro window level.
- **Kelly sizing** — online scripts universally use flat %-caps. Kelly is mathematically optimal for fractional betting.
- **2-tick inversion debounce** — most online scripts act on single-tick inversion, causing unnecessary exits.
- **Bleeding edge 4S+estimate blending** — online scripts either trust 4S fully or estimate-only. Blending catches disagreements.
- **Full theme system + adaptive dashboard** — unique.
- **Zero-trust validation** (validate buyStock return before deducting budget) — rare.

### Online alternative (pros)
- **Simpler** — easier to audit and modify in 5 minutes.
- **No warm-up period** — some scripts act on 4S data immediately without the 10-tick history requirement.
- **Proven track record** — community-tested over many augmentation cycles with reported results.
- **Shorter RAM footprint** — matters early game when RAM is a bottleneck.

### Your scripts (cons)
- **More failure surface** — 7 files, dynamic imports, fallback chain. A subtle bug can be hard to trace.
- **Warm-up required** — 10 ticks before trading with estimates (online scripts start immediately with 4S).
- **Complexity** — Kelly + EWMA + 3-window + blending all interact. A mistuned KELLY_K or inversionDelta can hurt more than a simple script.
- **Paper trader graduation** — adds value but requires running for 300 ticks before turtle mode gets its edge. Overkill early game.

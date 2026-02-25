# Sicko Mode — Stock Trading Overhaul Patch Notes

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

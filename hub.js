// ╔══════════════════════════════════════════════════════════════════╗
// ║  hub.js — ORACLE HUB  Command Center  v1.0                      ║
// ║  Unified dashboard aggregating all game systems into one view.  ║
// ║  Run: run hub.js [--theme classic|neon|matrix|ocean|fire]       ║
// ╚══════════════════════════════════════════════════════════════════╝

/** @param {NS} ns */
export async function main(ns) {
    // ── CLI ──────────────────────────────────────────────────────────
    if (ns.args.includes("--help") || ns.args.includes("-h")) {
        ns.tprint("ORACLE HUB — unified game dashboard");
        ns.tprint("Usage: run hub.js [--theme <name>]");
        ns.tprint("Themes: classic  neon  matrix  ocean  fire");
        ns.tprint("Updates every 5 seconds. Open a tail window to see the dashboard.");
        ns.tprint("Reads: /strats/proven.txt  /data/portfolio.txt");
        ns.tprint("APIs used (gracefully skipped if unavailable):");
        ns.tprint("  ns.stock.*  ns.gang.*  ns.corporation.*  ns.singularity.*");
        return;
    }

    ns.disableLog("ALL");
    ns.tail();

    // ── Theme / color setup ──────────────────────────────────────────
    // Attempt dynamic import of lib/themes.js; fall back to ANSI hardcodes.
    let C = buildFallbackColors();
    try {
        const mod = await import("/lib/themes.js");
        const { theme } = mod.getTheme(ns);
        C = mod.makeColors(theme);
    } catch (_) { /* lib not present — use fallback */ }

    const REFRESH_MS = 5000;
    let tick = 0;

    while (true) {
        tick++;
        const lines = buildDashboard(ns, C, tick);
        ns.clearLog();
        for (const line of lines) ns.print(line);
        await ns.sleep(REFRESH_MS);
    }
}

// ════════════════════════════════════════════════════════════════════
//  DASHBOARD BUILDER
// ════════════════════════════════════════════════════════════════════

function buildDashboard(ns, C, tick) {
    const W = 70; // total inner width between the outer ║ chars

    // ── Gather all data (safe — each block wrapped) ──────────────────
    const player   = safePlayer(ns);
    const stocks   = safeStocks(ns);
    const gang     = safeGang(ns);
    const corp     = safeCorp(ns);
    const hacking  = safeHacking(ns);
    const augs     = safeAugs(ns);

    // ── Build rows ───────────────────────────────────────────────────
    const out = [];

    // Header
    const tickStr  = `tick ${String(tick).padStart(5)}`;
    const title    = "  ORACLE HUB  \u29e1  Command Center  \u29e1  " + tickStr;
    out.push(C.cyan("\u2554" + "\u2550".repeat(W) + "\u2557"));
    out.push(C.cyan("\u2551") + C.bold(C.mag(padMid(title, W))) + C.cyan("\u2551"));

    // Three-column separator row
    const colW = [16, 25, W - 16 - 25 - 2]; // widths of the 3 content cols (2 for the 2 inner ╦)
    out.push(
        C.cyan("\u2560") +
        C.cyan("\u2550".repeat(colW[0])) +
        C.cyan("\u2566") +
        C.cyan("\u2550".repeat(colW[1])) +
        C.cyan("\u2566") +
        C.cyan("\u2550".repeat(colW[2])) +
        C.cyan("\u2563")
    );

    // Three-column header labels
    out.push(
        C.cyan("\u2551") + C.bold(C.acc(" PLAYER         ")) +
        C.cyan("\u2551") + C.bold(C.acc(" STOCKS                   ")) +
        C.cyan("\u2551") + C.bold(C.acc(rpad(" GANG", colW[2]))) +
        C.cyan("\u2551")
    );

    // Row 1: money | NW + change | territory + respect
    const moneyStr   = " " + fmtMoney(player.money);
    const nwLine     = " NW: " + fmtMoney(stocks.netWorth) + " " + C.plcol(stocks.plPct, fmtPct(stocks.plPct));
    const gangTerrLine = " Terr: " + C.plcol(gang.territory - 0.5, fmtPct(gang.territory)) +
                         "  Rep: " + fmtSI(gang.respect);
    out.push(
        C.cyan("\u2551") + lpad(moneyStr, colW[0]) +
        C.cyan("\u2551") + lpad(nwLine, colW[1]) +
        C.cyan("\u2551") + lpad(gangTerrLine, colW[2]) +
        C.cyan("\u2551")
    );

    // Row 2: hack level | positions + deployed | income/sec
    const hackLine   = " Hack: " + C.cyan(String(player.hacking));
    const posLine    = " " + stocks.positions + " pos  " + fmtPct(stocks.deployed) + " dep";
    const incLine    = " Income: " + C.green(fmtMoney(gang.incomeSec) + "/s");
    out.push(
        C.cyan("\u2551") + lpad(hackLine, colW[0]) +
        C.cyan("\u2551") + lpad(posLine, colW[1]) +
        C.cyan("\u2551") + lpad(incLine, colW[2]) +
        C.cyan("\u2551")
    );

    // Row 3: karma | P/L | members trained
    const karmaLine  = " Karma: " + C.plcol(-(player.karma), fmtSI(player.karma));
    const plLine     = " P/L: " + C.plcol(stocks.totalPL, (stocks.totalPL >= 0 ? "+" : "") + fmtMoney(stocks.totalPL));
    const memLine    = " Members: " + gang.trained + "/" + gang.total + " trained";
    out.push(
        C.cyan("\u2551") + lpad(karmaLine, colW[0]) +
        C.cyan("\u2551") + lpad(plLine, colW[1]) +
        C.cyan("\u2551") + lpad(memLine, colW[2]) +
        C.cyan("\u2551")
    );

    // Divider — close the three-column block, open the bottom two-section block
    out.push(
        C.cyan("\u2560") +
        C.cyan("\u2550".repeat(colW[0])) +
        C.cyan("\u2569") +
        C.cyan("\u2550".repeat(colW[1])) +
        C.cyan("\u2569") +
        C.cyan("\u2550".repeat(colW[2])) +
        C.cyan("\u2563")
    );

    // Bottom three sections: HACKING | CORP | AUGMENTS
    const bColW = [Math.floor(W / 3), Math.floor(W / 3), W - 2 * Math.floor(W / 3) - 2];

    out.push(
        C.cyan("\u2551") + C.bold(C.acc(rpad(" HACKING", bColW[0]))) +
        C.cyan("\u2551") + C.bold(C.acc(rpad(" CORP", bColW[1]))) +
        C.cyan("\u2551") + C.bold(C.acc(rpad(" AUGMENTS READY", bColW[2]))) +
        C.cyan("\u2551")
    );

    // Row: threads | corp revenue | count affordable
    const thrLine  = " " + fmtSI(hacking.threads) + " threads";
    const revLine  = " Rev: " + C.green(fmtMoney(corp.revenue) + "/s");
    const augLine  = " " + C.yellow(String(augs.affordable) + " affordable");
    out.push(
        C.cyan("\u2551") + lpad(thrLine, bColW[0]) +
        C.cyan("\u2551") + lpad(revLine, bColW[1]) +
        C.cyan("\u2551") + lpad(augLine, bColW[2]) +
        C.cyan("\u2551")
    );

    // Row: target(s) | corp profit/round | cheapest aug
    const tgtLine  = " " + (hacking.targets.length ? hacking.targets.slice(0, 2).join(", ") : "n/a");
    const profLine = " Profit: " + C.plcol(corp.profit, fmtMoney(corp.profit)) + "/s";
    const cheapLine = " Cheapest: " + (augs.cheapestName
        ? C.cyan(augs.cheapestName) + " (" + fmtMoney(augs.cheapestCost) + ")"
        : C.dim("none yet"));
    out.push(
        C.cyan("\u2551") + lpad(tgtLine, bColW[0]) +
        C.cyan("\u2551") + lpad(profLine, bColW[1]) +
        C.cyan("\u2551") + lpad(cheapLine, bColW[2]) +
        C.cyan("\u2551")
    );

    // Row: $/s estimate | round/divs | --
    const dpsLine  = " Est: " + C.green(fmtMoney(hacking.dps) + "/s");
    const roundLine = " Round " + corp.round + "  Divs: " + corp.divisions;
    const blankLine = "";
    out.push(
        C.cyan("\u2551") + lpad(dpsLine, bColW[0]) +
        C.cyan("\u2551") + lpad(roundLine, bColW[1]) +
        C.cyan("\u2551") + lpad(blankLine, bColW[2]) +
        C.cyan("\u2551")
    );

    out.push(C.cyan("\u255a" + "\u2550".repeat(W) + "\u255d"));

    // Status line beneath the box
    const ts = new Date().toLocaleTimeString();
    out.push(C.dim("  Last update: " + ts + "  |  refresh 5s  |  run hub.js --help"));

    return out;
}

// ════════════════════════════════════════════════════════════════════
//  DATA COLLECTION — each function is fully wrapped in try/catch
// ════════════════════════════════════════════════════════════════════

function safePlayer(ns) {
    try {
        const p = ns.getPlayer();
        return {
            money:   p.money,
            hacking: p.skills.hacking,
            karma:   ns.heart.break(),          // negative number; abs = karma
        };
    } catch (_) {
        return { money: 0, hacking: 0, karma: 0 };
    }
}

function safeStocks(ns) {
    const result = { netWorth: 0, deployed: 0, positions: 0, totalPL: 0, plPct: 0 };
    try {
        if (!ns.stock) return result;
        const syms = ns.stock.getSymbols();
        let totalCost = 0;
        let totalVal  = 0;
        let totalBudget = 0;
        for (const sym of syms) {
            try {
                const pos = ns.stock.getPosition(sym);
                const [lShares, lAvg, sShares, sAvg] = pos;
                const price = ns.stock.getPrice(sym);
                if (lShares > 0) {
                    result.positions++;
                    const cost = lShares * lAvg;
                    const val  = lShares * price;
                    totalCost += cost;
                    totalVal  += val;
                }
                if (sShares > 0) {
                    result.positions++;
                    const cost = sShares * sAvg;
                    const val  = sShares * price;
                    totalCost += cost;
                    totalVal  += val;
                }
            } catch (_) {}
        }
        result.netWorth = totalVal;
        result.totalPL  = totalVal - totalCost;
        result.plPct    = totalCost > 0 ? (totalVal - totalCost) / totalCost : 0;

        // Deployed %: value in positions / (value + home cash proxy)
        // We use netWorth / (netWorth + player money) as a rough deployed fraction
        try {
            const playerMoney = ns.getPlayer().money;
            const total = totalVal + playerMoney;
            result.deployed = total > 0 ? totalVal / total : 0;
        } catch (_) {}
    } catch (_) {}
    return result;
}

function safeGang(ns) {
    const result = { territory: 0, respect: 0, incomeSec: 0, trained: 0, total: 0 };
    try {
        if (!ns.gang || !ns.gang.inGang()) return result;
        const info = ns.gang.getGangInformation();
        result.territory  = info.territory;
        result.respect    = info.respect;
        result.incomeSec  = info.moneyGainRate;
        const names = ns.gang.getMemberNames();
        result.total = names.length;
        // "trained" = members with avg combat stat >= 300
        let trained = 0;
        for (const name of names) {
            try {
                const m = ns.gang.getMemberInformation(name);
                if ((m.str + m.def + m.dex + m.agi) / 4 >= 300) trained++;
            } catch (_) {}
        }
        result.trained = trained;
    } catch (_) {}
    return result;
}

function safeCorp(ns) {
    const result = { revenue: 0, profit: 0, round: 0, divisions: 0 };
    try {
        if (!ns.corporation || !ns.corporation.hasCorporation()) return result;
        const corp = ns.corporation.getCorporation();
        result.revenue   = corp.revenue;
        result.profit    = corp.revenue - corp.expenses;
        result.round     = corp.fundingRound ?? 0;
        result.divisions = corp.divisions.length;
    } catch (_) {}
    return result;
}

function safeHacking(ns) {
    const result = { threads: 0, targets: [], dps: 0 };
    try {
        // Discover running hack scripts for thread count
        const procs = ns.ps("home");
        let totalThreads = 0;
        for (const p of procs) {
            if (p.filename.includes("hack") || p.filename.includes("grow") || p.filename.includes("weaken")) {
                totalThreads += p.threads;
            }
        }
        result.threads = totalThreads;

        // Best targets by money
        const servers = bfsServers(ns);
        const hackLvl = ns.getHackingLevel();
        const viable = servers
            .filter(s => {
                try {
                    return ns.getServerMaxMoney(s) > 1e6 &&
                           ns.getServerRequiredHackingLevel(s) <= hackLvl &&
                           s !== "home" && !s.startsWith("farm-");
                } catch (_) { return false; }
            })
            .map(s => {
                try {
                    return { name: s, money: ns.getServerMaxMoney(s) };
                } catch (_) { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.money - a.money)
            .slice(0, 3);
        result.targets = viable.map(v => v.name);

        // Rough $/s: sum of hackAnalyze * moneyAvail * hackAnalyzeChance across top 3
        let dps = 0;
        for (const v of viable) {
            try {
                const avail = ns.getServerMoneyAvailable(v.name);
                const pct   = ns.hackAnalyze(v.name);          // fraction stolen per thread
                const chance = ns.hackAnalyzeChance(v.name);
                const hackTime = ns.getHackTime(v.name) / 1000; // to seconds
                if (hackTime > 0) {
                    dps += (pct * avail * chance) / hackTime;
                }
            } catch (_) {}
        }
        result.dps = dps;
    } catch (_) {}
    return result;
}

function safeAugs(ns) {
    const result = { affordable: 0, cheapestName: null, cheapestCost: 0 };
    try {
        // Requires singularity. If not available, returns defaults.
        const player   = ns.getPlayer();
        const money    = player.money;
        const factions = player.factions;

        let cheapestCost = Infinity;
        let cheapestName = null;
        let affordable   = 0;
        const seen = new Set();

        for (const faction of factions) {
            try {
                const augs = ns.singularity.getAugmentationsFromFaction(faction);
                for (const aug of augs) {
                    if (seen.has(aug)) continue;
                    seen.add(aug);
                    // Skip already owned
                    try {
                        const owned = ns.singularity.getOwnedAugmentations(true);
                        if (owned.includes(aug)) continue;
                    } catch (_) {}
                    try {
                        const cost = ns.singularity.getAugmentationPrice(aug);
                        if (cost <= money) affordable++;
                        if (cost < cheapestCost) {
                            cheapestCost = cost;
                            cheapestName = aug;
                        }
                    } catch (_) {}
                }
            } catch (_) {}
        }

        result.affordable    = affordable;
        result.cheapestName  = cheapestName;
        result.cheapestCost  = cheapestCost === Infinity ? 0 : cheapestCost;
    } catch (_) {}
    return result;
}

// ════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════

/** BFS server discovery */
function bfsServers(ns) {
    const visited = new Set(["home"]);
    const queue   = ["home"];
    while (queue.length) {
        const cur = queue.shift();
        try {
            for (const n of ns.scan(cur)) {
                if (!visited.has(n)) { visited.add(n); queue.push(n); }
            }
        } catch (_) {}
    }
    return Array.from(visited);
}

/** Format a number as $0.00x */
function fmtMoney(n) {
    if (!isFinite(n)) return "$?";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e15) return sign + "$" + (abs / 1e15).toFixed(2) + "q";
    if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "t";
    if (abs >= 1e9)  return sign + "$" + (abs / 1e9).toFixed(2) + "b";
    if (abs >= 1e6)  return sign + "$" + (abs / 1e6).toFixed(2) + "m";
    if (abs >= 1e3)  return sign + "$" + (abs / 1e3).toFixed(2) + "k";
    return sign + "$" + abs.toFixed(0);
}

/** Format a number with SI suffix (no $ sign) */
function fmtSI(n) {
    if (!isFinite(n)) return "?";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e15) return sign + (abs / 1e15).toFixed(2) + "q";
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + "t";
    if (abs >= 1e9)  return sign + (abs / 1e9).toFixed(2) + "b";
    if (abs >= 1e6)  return sign + (abs / 1e6).toFixed(2) + "m";
    if (abs >= 1e3)  return sign + (abs / 1e3).toFixed(2) + "k";
    return sign + abs.toFixed(0);
}

/** Format a 0-1 fraction as a percentage string */
function fmtPct(v) {
    return (v * 100).toFixed(1) + "%";
}

/**
 * Pad string to exact visible width.
 * NOTE: ANSI escape sequences contain invisible chars; this helper pads
 * the raw string to `w` characters using simple right-padding. Because
 * ANSI codes inflate string.length, we strip them first to measure, then
 * pad appropriately.
 */
function lpad(s, w) {
    const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
    const extra = w - visible.length;
    return extra > 0 ? s + " ".repeat(extra) : s.slice(0, w + (s.length - visible.length));
}

function rpad(s, w) { return lpad(s, w); }

/** Center a string in a field of width w (no ANSI inside s assumed) */
function padMid(s, w) {
    const half = Math.max(0, Math.floor((w - s.length) / 2));
    return " ".repeat(half) + s + " ".repeat(Math.max(0, w - s.length - half));
}

// ── Color object that all helpers accept ────────────────────────────
// Adds .acc() and .dim() on top of what makeColors returns.
// The fallback version uses raw ANSI codes directly.
function buildFallbackColors() {
    const R = "\x1b[0m";
    return {
        green:  (s) => "\x1b[32m"   + s + R,
        red:    (s) => "\x1b[31m"   + s + R,
        cyan:   (s) => "\x1b[36m"   + s + R,
        mag:    (s) => "\x1b[35m"   + s + R,
        yellow: (s) => "\x1b[33m"   + s + R,
        bold:   (s) => "\x1b[1m"    + s + R,
        dim:    (s) => "\x1b[2m"    + s + R,
        acc:    (s) => "\x1b[36m"   + s + R,
        plcol:  (v, s) => (v >= 0 ? "\x1b[32m" : "\x1b[31m") + s + R,
        pct:    (v) => {
            const str = (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
            return (v >= 0 ? "\x1b[32m" : "\x1b[31m") + str + R;
        },
    };
}

/** @param {NS} ns */
export async function main(ns) {
    // autogang.js – ELITE v8.1 (Improved HUD dashboard)
    // - Training goal: Match top 3 members' average combat stats
    // - Stagnation detection: Back to training if stats stagnant >8 cycles (~5-10 mins)
    // - Full gang management every ~6-10 mins (dynamic cycle timing)
    // - Recruiting every cycle (instant)
    // - 30s HUD with full box-drawing dashboard (ganghud.js)
    // - Optimized logic: smarter equip priority, ascend checks, warfare

    ns.disableLog("ALL");
    ns.tail();

    const HOME = "home";
    const MIN_MONEY_TARGET = 1e7;
    const ACTIONS_PER_LOOP = 20;
    const UPGRADE_INTERVAL = 10;            // ~every 6-10 mins
    const HUD_SCRIPT = "ganghud.js";

    const TARGET_FACTION = null;

    const WANTED_THRESHOLD = 0.07;
    const ASCEND_MULTIPLIER = 1.85;
    const TRAIN_GOAL_RATIO = 0.92;          // train until 92% of top 3 avg
    const STAGNATION_CYCLES = 8;            // if no growth in 8 full cycles -> train
    const TERRITORY_GOAL = 0.99;
    const MIN_CLASH_CHANCE = 0.60;
    const RESPECT_FOR_WAR = 2e8;             // earlier warfare

    // Persistent stat tracking (in-memory, survives loops)
    const memberStatsHistory = new Map(); // name -> {prevSum: number, stagnantCycles: number}

    ns.tprint("\u2554" + "\u2550".repeat(34) + "\u2557");
    ns.tprint("\u2551     AUTOGANG ELITE v8.1          \u2551");
    ns.tprint("\u2551 Dynamic training + stagnation    \u2551");
    ns.tprint("\u255a" + "\u2550".repeat(34) + "\u255d");

    if (!ns.scriptRunning(HUD_SCRIPT, HOME)) {
        await ns.write(HUD_SCRIPT, getHudScript(), "w");
        ns.exec(HUD_SCRIPT, HOME, 1);
        ns.tprint("HUD active: " + HUD_SCRIPT);
    }

    ns.killall(HOME, true);
    let loopCount = 0;

    while (true) {
        loopCount++;
        ns.print("\n=== CYCLE " + loopCount + " (" + new Date().toLocaleTimeString() + ") ===");

        // Instant recruiting
        await quickRecruit(ns);

        // Upgrades (~every 6-10 mins)
        if (loopCount % UPGRADE_INTERVAL === 0) await smartUpgrades(ns);

        // Hacking
        const servers = discoverServers(ns);
        const targets = prioritizeTargets(ns, servers, MIN_MONEY_TARGET, TARGET_FACTION);
        let hacks = 0;
        for (const target of targets.slice(0, ACTIONS_PER_LOOP)) {
            if (hacks >= ACTIONS_PER_LOOP) break;
            await smartHack(ns, target);
            hacks++;
            await ns.sleep(randomDelay(5000, 18000));
        }

        // Full gang management (~every 6-10 mins via longer sleep)
        await eliteGangManage(ns, memberStatsHistory, STAGNATION_CYCLES, TRAIN_GOAL_RATIO);

        await ns.share();
        await ns.sleep(randomDelay(40000, 80000));  // avg ~1 min cycle -> full manage every ~6-10 mins
    }
}

// --- INSTANT RECRUIT ---
async function quickRecruit(ns) {
    if (!ns.gang.inGang()) return;

    let recruited = 0;
    while (ns.gang.canRecruitMember()) {
        const uniqueName = `thug-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
        if (ns.gang.recruitMember(uniqueName)) {
            ns.tprint("RECRUITED " + uniqueName + " (" + ns.gang.getMemberNames().length + "/12)");
            recruited++;
        }
        await ns.sleep(150);
    }
}

// --- 30s HUD (box-drawing dashboard) ---
// Returns the full source of ganghud.js as a string.
// The HUD script is written to disk and exec'd as a separate process.
function getHudScript() {
    return `/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tail();

    // ── ANSI helpers ───────────────────────────────────────────────
    const R  = "\x1b[0m";
    const cy = (s) => "\x1b[36m"  + s + R;
    const gn = (s) => "\x1b[32m"  + s + R;
    const rd = (s) => "\x1b[31m"  + s + R;
    const yw = (s) => "\x1b[33m"  + s + R;
    const mg = (s) => "\x1b[35m"  + s + R;
    const bl = (s) => "\x1b[1m"   + s + R;
    const dm = (s) => "\x1b[2m"   + s + R;

    // Pad ANSI string to visible width n
    function pa(s, n) {
        const vis = s.replace(/\x1b\[[0-9;]*m/g, "");
        const extra = n - vis.length;
        return extra > 0 ? s + " ".repeat(extra) : s;
    }
    // Pad plain string to n
    function pp(s, n) {
        s = String(s);
        return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
    }
    // Money formatter
    function fm(v) {
        const abs = Math.abs(v), sg = v < 0 ? "-$" : "$";
        if (abs >= 1e12) return sg + (abs/1e12).toFixed(2) + "t";
        if (abs >= 1e9)  return sg + (abs/1e9).toFixed(2) + "b";
        if (abs >= 1e6)  return sg + (abs/1e6).toFixed(2) + "m";
        if (abs >= 1e3)  return sg + (abs/1e3).toFixed(2) + "k";
        return sg + abs.toFixed(0);
    }
    // SI formatter (no $ sign)
    function si(v) {
        const abs = Math.abs(v), sg = v < 0 ? "-" : "";
        if (abs >= 1e12) return sg + (abs/1e12).toFixed(2) + "t";
        if (abs >= 1e9)  return sg + (abs/1e9).toFixed(2) + "b";
        if (abs >= 1e6)  return sg + (abs/1e6).toFixed(2) + "m";
        if (abs >= 1e3)  return sg + (abs/1e3).toFixed(2) + "k";
        return sg + abs.toFixed(0);
    }
    // Progress bar: filled 0..1 in a field of barW chars
    function bar(frac, barW) {
        const filled = Math.round(Math.min(1, Math.max(0, frac)) * barW);
        return "[" + "#".repeat(filled) + "-".repeat(barW - filled) + "]";
    }

    const W    = 64; // inner width
    const TOP  = cy("\u2554" + "\u2550".repeat(W) + "\u2557");
    const MID  = cy("\u2560" + "\u2550".repeat(W) + "\u2563");
    const BOT  = cy("\u255a" + "\u2550".repeat(W) + "\u255d");
    const ROW  = (c) => cy("\u2551") + pa(c, W) + cy("\u2551");
    const RSEP = (c) => cy("\u2551") + pa(dm(c), W) + cy("\u2551");

    while (true) {
        ns.clearLog();

        const money   = ns.getServerMoneyAvailable("home");
        const hackLvl = ns.getHackingLevel();
        const ts      = new Date().toLocaleTimeString();

        ns.print(TOP);
        const titleStr = " GANG COMMAND  \u29e1  " + ts + " ";
        const tPad = Math.max(0, Math.floor((W - titleStr.length) / 2));
        ns.print(ROW(" ".repeat(tPad) + bl(mg(titleStr))));
        ns.print(MID);

        // Player overview
        ns.print(ROW(" " + bl("PLAYER") + "  Money: " + gn(fm(money)) + "   Hack: " + cy(String(hackLvl))));
        ns.print(MID);

        if (!ns.gang.inGang()) {
            ns.print(ROW("  " + dm("Not in a gang.")));
            ns.print(BOT);
            await ns.sleep(30000);
            continue;
        }

        const info  = ns.gang.getGangInformation();
        const other = ns.gang.getOtherGangInformation();
        const names = ns.gang.getMemberNames();

        // Best and worst opponent for clash
        let bestClash = 0, bestOpp = "", worstClash = 1.0, worstOpp = "";
        for (const g in other) {
            if (g === info.faction) continue;
            const ch = ns.gang.getChanceToWinClash(g);
            if (ch > bestClash) { bestClash = ch; bestOpp = g; }
            if (ch < worstClash) { worstClash = ch; worstOpp = g; }
        }

        // ── Territory section ─────────────────────────────────────
        const terrFrac = info.territory;
        const terrFill = Math.round(terrFrac * 30);
        const terrBar  = bar(terrFrac, 30);
        const terrCol  = terrFrac >= 0.95 ? gn : terrFrac >= 0.5 ? yw : rd;
        ns.print(ROW(" " + bl("TERRITORY  ") + terrCol((terrFrac*100).toFixed(2) + "%") + "  " + terrCol(terrBar)));

        const wantPct = info.wantedPenalty * 100;
        const wantCol = wantPct >= 95 ? gn : wantPct >= 85 ? yw : rd;
        ns.print(ROW("  Faction: " + cy(info.faction) +
            "   Respect: " + mg(si(info.respect)) +
            "   Wanted: " + wantCol(info.wantedLevel.toFixed(1)) +
            " (" + wantCol(wantPct.toFixed(1) + "% eff") + ")"));

        // Income + warfare line
        const incomeCol = info.moneyGainRate > 1e6 ? gn : info.moneyGainRate > 1e4 ? yw : rd;
        const warfareStr = info.territoryWarfareEngaged ? rd("WARFARE ON") : dm("warfare off");
        const clashCol   = bestClash >= 0.6 ? gn : bestClash >= 0.4 ? yw : rd;
        ns.print(ROW("  Income: " + incomeCol(fm(info.moneyGainRate) + "/s") +
            "   " + warfareStr +
            "   Best opp: " + yw(pp(bestOpp || "none", 14)) + clashCol((bestClash*100).toFixed(0) + "% win")));

        ns.print(MID);

        // ── Members table ─────────────────────────────────────────
        ns.print(ROW(" " + bl("MEMBERS") + dm("  Name             Task           Str  Def  Dex  Agi  Prog  Asc")));
        ns.print(RSEP(" " + "\u2500".repeat(W - 1)));

        // Compute top-3 avg for training threshold
        const combatAvgs = names.map(n => {
            try {
                const m = ns.gang.getMemberInformation(n);
                return (m.str + m.def + m.dex + m.agi) / 4;
            } catch (_) { return 0; }
        }).sort((a, b) => b - a);
        const top3Avg = combatAvgs.slice(0, 3).reduce((a, b) => a + b, 0) /
                        Math.min(3, combatAvgs.length) || 100;
        const trainGoal = top3Avg * 0.92;

        for (const name of names) {
            try {
                const m   = ns.gang.getMemberInformation(name);
                const asc = ns.gang.getAscensionResult(name);
                const avgCombat = (m.str + m.def + m.dex + m.agi) / 4;
                const trainPct  = Math.min(1, avgCombat / Math.max(1, trainGoal));

                // Ascension indicator
                const ascAvg  = asc ? (asc.str + asc.def + asc.dex + asc.agi) / 4 : 0;
                const ascFlag = ascAvg >= 1.85 ? gn("ASC!") : ascAvg >= 1.5 ? yw("asc?") : dm("    ");

                // Task column with color
                const taskStr = pp(m.task || "idle", 14);
                const taskCol = m.task && m.task.includes("Train")    ? yw(taskStr)
                              : m.task && m.task.includes("Warfare")  ? rd(taskStr)
                              : gn(taskStr);

                // Training progress bar
                const trainBarStr = bar(trainPct, 5);
                const trainBarCol = trainPct >= 1 ? gn(trainBarStr) : trainPct >= 0.7 ? yw(trainBarStr) : rd(trainBarStr);

                const line = "  " + pp(name, 16) + " " + taskCol +
                    " " + dm(pp(String(Math.floor(m.str)), 4)) +
                    " " + dm(pp(String(Math.floor(m.def)), 4)) +
                    " " + dm(pp(String(Math.floor(m.dex)), 4)) +
                    " " + dm(pp(String(Math.floor(m.agi)), 4)) +
                    "  " + trainBarCol + " " + ascFlag;
                ns.print(ROW(line));
            } catch (_) {}
        }

        // Summary footer
        const training = names.filter(n => {
            try { return ns.gang.getMemberInformation(n).task === "Train Combat"; } catch (_) { return false; }
        }).length;
        const onTask = names.length - training;
        ns.print(MID);
        ns.print(ROW(
            "  Total: " + cy(names.length + "/12") +
            "   Training: " + yw(String(training)) +
            "   On task: "  + gn(String(onTask)) +
            "   Top3 avg: " + mg(Math.floor(top3Avg).toString()) +
            "   Goal: "     + dm(Math.floor(trainGoal).toString())
        ));
        ns.print(BOT);
        await ns.sleep(30000);
    }
}`;
}

// --- ELITE GANG (dynamic training goals + stagnation) ---
async function eliteGangManage(ns, statsHistory, stagnationLimit, goalRatio) {
    if (!ns.gang.inGang()) return;

    const info = ns.gang.getGangInformation();
    const members = ns.gang.getMemberNames();
    const otherGangs = ns.gang.getOtherGangInformation();

    // Global productive task
    let productiveTask = bestCrime(info.respect);
    if (info.wantedPenalty < (1 - WANTED_THRESHOLD)) {
        productiveTask = "Vigilante Justice";
        ns.tprint("Wanted penalty critical -> Vigilante Justice");
    } else if (info.territory < TERRITORY_GOAL && info.respect > RESPECT_FOR_WAR) {
        let bestChance = 0;
        let bestOpp = "";
        for (const gang in otherGangs) {
            if (gang !== info.faction) {
                const chance = ns.gang.getChanceToWinClash(gang);
                if (chance > bestChance) {
                    bestChance = chance;
                    bestOpp = gang;
                }
            }
        }
        if (bestChance >= MIN_CLASH_CHANCE) {
            productiveTask = "Territory Warfare";
            ns.tprint("Territory Warfare (" + (bestChance*100).toFixed(1) + "% vs " + bestOpp + ")");
        }
    }

    // Compute top 3 average combat stats (goal benchmark)
    const combatAverages = members.map(name => {
        const mem = ns.gang.getMemberInformation(name);
        return (mem.str + mem.def + mem.dex + mem.agi) / 4;
    });
    combatAverages.sort((a, b) => b - a);
    const top3Avg = combatAverages.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, combatAverages.length) || 100;

    let actions = {asc: 0, train: 0, equip: 0, task: 0, stagnate: 0};
    for (const name of members) {
        const mem = ns.gang.getMemberInformation(name);

        // Ascend first -- check average combat stat multiplier gain, not asc.respect
        // (asc.respect = respect LOST on ascend, a large number unrelated to ASCEND_MULTIPLIER)
        const asc = ns.gang.getAscensionResult(name);
        if (asc && (asc.str + asc.def + asc.dex + asc.agi) / 4 >= ASCEND_MULTIPLIER) {
            ns.gang.ascendMember(name);
            ns.tprint(name + " ascended (" + asc.respect.toFixed(2) + "x)");
            actions.asc++;
            statsHistory.delete(name);  // reset tracking post-ascend
            continue;
        }

        // Stat stagnation detection
        const currentSum = mem.str + mem.def + mem.dex + mem.agi + mem.cha;
        const history = statsHistory.get(name) || {prevSum: currentSum, stagnantCycles: 0};
        if (currentSum === history.prevSum) {
            history.stagnantCycles++;
        } else {
            history.stagnantCycles = 0;
            history.prevSum = currentSum;
        }
        statsHistory.set(name, history);

        // Training logic: goal-based + stagnation
        const memberAvgCombat = (mem.str + mem.def + mem.dex + mem.agi) / 4;
        const needsTraining = memberAvgCombat < top3Avg * goalRatio ||
                              history.stagnantCycles >= stagnationLimit ||
                              memberAvgCombat < 300;  // new members

        let memberTask = needsTraining ? "Train Combat" : productiveTask;
        if (needsTraining) actions.train++;
        if (needsTraining && history.stagnantCycles >= stagnationLimit) {
            actions.stagnate++;
            ns.print("WARNING: " + name + " stagnant -> forcing training");
        }

        // Equip (high-value first, combat priority)
        const equipList = ns.gang.getEquipmentNames()
            .filter(e => !mem.upgrades.includes(e) && !mem.augmentations.includes(e));
        if (equipList.length > 0) {
            const sorted = equipList.sort((a, b) =>
                (ns.gang.getEquipmentCost(a) / equipmentCombatValue(ns, a)) -
                (ns.gang.getEquipmentCost(b) / equipmentCombatValue(ns, b))
            );
            for (const eq of sorted.slice(0, 6)) {
                const cost = ns.gang.getEquipmentCost(eq);
                if (cost < ns.getServerMoneyAvailable("home") * 0.08) {
                    if (ns.gang.purchaseEquipment(name, eq)) actions.equip++;
                }
            }
        }

        // Assign task (only if changed)
        if (mem.task !== memberTask) {
            ns.gang.setMemberTask(name, memberTask);
            actions.task++;
            if (!needsTraining) ns.print(name + " trained up -> " + memberTask);
        }
    }

    ns.tprint("[GANG] " + productiveTask + " | Top3 Avg Combat: " + top3Avg.toFixed(0) + " | Asc:" + actions.asc + " Train:" + actions.train + " Stagnant:" + actions.stagnate + " Equip:" + actions.equip);
}

// --- OPTIMIZED HELPERS ---
function equipmentCombatValue(ns, eq) {
    const s = ns.gang.getEquipmentStats(eq);
    return (s.str || 0) + (s.def || 0) + (s.dex || 0) + (s.agi || 0);
}

function bestCrime(respect) {
    if (respect < 1e6) return "Mug People";
    if (respect < 5e6) return "Deal Drugs";
    if (respect < 2e7) return "Strongarm Civilians";
    if (respect < 1e8) return "Run a Con";
    if (respect < 5e8) return "Armed Robbery";
    if (respect < 2e9) return "Human Trafficking";
    return "Terrorism";
}

async function smartUpgrades(ns) {
    const money = ns.getServerMoneyAvailable("home");
    let up = 0;
    while (ns.getUpgradeHomeRamCost() < money * 0.4 && ns.upgradeHomeRam()) up++;
    if (up) ns.tprint("Home RAM +" + up);
    let pservs = ns.getPurchasedServers();
    if (pservs.length < 25) {
        const ram = 32;  // higher start
        const cost = ns.getPurchasedServerCost(ram);
        let bought = 0;
        while (cost < money * 0.2 && pservs.length + bought < 25) {
            const name = `farm-${pservs.length + bought}`;
            if (!ns.purchaseServer(name, ram)) break;
            bought++;
        }
        if (bought) ns.tprint("+" + bought + " pservs (" + ram + "GB)");
    }
    if (pservs.length > 0) {
        const maxRam = Math.max(...pservs.map(s => ns.getServerMaxRam(s)));
        const next = maxRam * 2;
        if (next <= (1 << 20)) {
            const totalCost = pservs.reduce((sum, s) => {
                try { return sum + ns.getPurchasedServerUpgradeCost(s, next); } catch { return sum; }
            }, 0);
            if (totalCost < money * 0.8) {
                for (const s of pservs) ns.upgradePurchasedServer(s, next);
                ns.tprint("pservs -> " + next + "GB");
            }
        }
    }
}

function discoverServers(ns) {
    const found = new Set(["home"]);
    const queue = ["home"];
    while (queue.length) {
        const cur = queue.shift();
        for (const neigh of ns.scan(cur)) {
            if (!found.has(neigh)) {
                found.add(neigh);
                queue.push(neigh);
            }
        }
    }
    return Array.from(found);
}

function prioritizeTargets(ns, servers, minMoney, faction) {
    return servers
        .filter(s => ns.getServerMaxMoney(s) >= minMoney &&
                     ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel() * 1.5 &&
                     !s.startsWith("farm-") && s !== "home")
        .map(s => {
            const serv = ns.getServer(s);
            let score = serv.moneyMax * ns.hackAnalyzeChance(s);
            if (faction && serv.organizationName === faction) score *= 12;
            return {name: s, score};
        })
        .sort((a, b) => b.score - a.score)
        .map(o => o.name);
}

async function smartHack(ns, target) {
    const serv = ns.getServer(target);
    if (serv.moneyAvailable / serv.moneyMax < 0.85) await ns.grow(target);
    else await ns.hack(target);
    await ns.weaken(target);
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

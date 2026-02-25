/** @param {NS} ns */
export async function main(ns) {
    // autogang.js – ELITE v8.0 (Dynamic training goals + stagnation detection)
    // - Training goal: Match top 3 members' average combat stats
    // - Stagnation detection: Back to training if stats stagnant >8 cycles (~5-10 mins)
    // - Full gang management every ~6-10 mins (dynamic cycle timing)
    // - Recruiting every cycle (instant)
    // - 30s HUD + detailed tprints
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
    const STAGNATION_CYCLES = 8;            // if no growth in 8 full cycles → train
    const TERRITORY_GOAL = 0.99;
    const MIN_CLASH_CHANCE = 0.60;
    const RESPECT_FOR_WAR = 2e8;             // earlier warfare

    // Persistent stat tracking (in-memory, survives loops)
    const memberStatsHistory = new Map(); // name → {prevSum: number, stagnantCycles: number}

    ns.tprint("╔══════════════════════════════════╗");
    ns.tprint("║     AUTOGANG ELITE v8.0          ║");
    ns.tprint("║ Dynamic training + stagnation    ║");
    ns.tprint("╚══════════════════════════════════╝");

    if (!ns.scriptRunning(HUD_SCRIPT, HOME)) {
        await ns.write(HUD_SCRIPT, getHudScript(), "w");
        ns.exec(HUD_SCRIPT, HOME, 1);
        ns.tprint("📊 HUD active");
    }

    ns.killall(HOME, true);
    let loopCount = 0;

    while (true) {
        loopCount++;
        ns.print(`\n=== CYCLE ${loopCount} (${new Date().toLocaleTimeString()}) ===`);

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
        await ns.sleep(randomDelay(40000, 80000));  // avg ~1 min cycle → full manage every ~6-10 mins
    }
}

// ─── INSTANT RECRUIT ───
async function quickRecruit(ns) {
    if (!ns.gang.inGang()) return;

    let recruited = 0;
    while (ns.gang.canRecruitMember()) {
        const uniqueName = `thug-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
        if (ns.gang.recruitMember(uniqueName)) {
            ns.tprint(`👤 RECRUITED ${uniqueName} (${ns.gang.getMemberNames().length}/12)`);
            recruited++;
        }
        await ns.sleep(150);
    }
}

// ─── 30s HUD ───
function getHudScript() {
    return `/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tail();
    ns.clearLog();
    while (true) {
        const money = ns.getServerMoneyAvailable("home");
        const hackLvl = ns.getHackingLevel();
        let status = "💤 No gang";
        if (ns.gang.inGang()) {
            const info = ns.gang.getGangInformation();
            const other = ns.gang.getOtherGangInformation();
            let bestClash = 0;
            let opponent = "";
            for (const g in other) {
                if (g !== info.faction) {
                    const chance = ns.gang.getChanceToWinClash(g);
                    if (chance > bestClash) {
                        bestClash = chance;
                        opponent = g;
                    }
                }
            }
            status = \`👥 \${ns.gang.getMemberNames().length}/12 | ⭐ Respect: \${ns.nFormat(info.respect,"0.00a")} | ⚖️ Wanted: \${info.wantedLevel.toFixed(1)} | 🗺️ Terr: \${(info.territory*100).toFixed(2)}% (vs \${opponent}: \${(bestClash*100).toFixed(0)}%)\`;
        }
        ns.clearLog();
        ns.print(\`💰 Money: \${ns.nFormat(money, "$0.00a")}\`);
        ns.print(\`⚡ Hack: \${hackLvl}\`);
        ns.print(status);
        ns.print(\`🕒 \${new Date().toLocaleTimeString()}\`);
        await ns.sleep(30000);
    }
}`;
}

// ─── ELITE GANG (dynamic training goals + stagnation) ───
async function eliteGangManage(ns, statsHistory, stagnationLimit, goalRatio) {
    if (!ns.gang.inGang()) return;

    const info = ns.gang.getGangInformation();
    const members = ns.gang.getMemberNames();
    const otherGangs = ns.gang.getOtherGangInformation();

    // Global productive task
    let productiveTask = bestCrime(info.respect);
    if (info.wantedPenalty < (1 - WANTED_THRESHOLD)) {
        productiveTask = "Vigilante Justice";
        ns.tprint("🛡️ Wanted penalty critical → Vigilante Justice");
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
            ns.tprint(`⚔️ Territory Warfare (${(bestChance*100).toFixed(1)}% vs ${bestOpp})`);
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

        // Ascend first — check average combat stat multiplier gain, not asc.respect
        // (asc.respect = respect LOST on ascend, a large number unrelated to ASCEND_MULTIPLIER)
        const asc = ns.gang.getAscensionResult(name);
        if (asc && (asc.str + asc.def + asc.dex + asc.agi) / 4 >= ASCEND_MULTIPLIER) {
            ns.gang.ascendMember(name);
            ns.tprint(`⭐ ${name} ascended (${asc.respect.toFixed(2)}x)`);
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
            ns.print(`⚠️ ${name} stagnant → forcing training`);
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
            if (!needsTraining) ns.print(`✅ ${name} trained up → ${memberTask}`);
        }
    }

    ns.tprint(`[GANG] ${productiveTask} | Top3 Avg Combat: ${top3Avg.toFixed(0)} | Asc:${actions.asc} Train:${actions.train} Stagnant:${actions.stagnate} Equip:${actions.equip}`);
}

// ─── OPTIMIZED HELPERS ───
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
    if (up) ns.tprint(`💾 Home RAM +${up}`);
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
        if (bought) ns.tprint(`🆕 +${bought} pservs (${ram}GB)`);
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
                ns.tprint(`🔄 pservs → ${next}GB`);
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

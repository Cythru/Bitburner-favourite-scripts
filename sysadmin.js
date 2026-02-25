// Usage: run sysadmin.js [--dry] [--no-clean] [--no-hack] [--no-upgrade]
//
// SYSADMIN — Bitburner System Administration Console
// ─────────────────────────────────────────────────────────────────
// Modules (all toggleable via /cfg/sysadmin.json or --flags):
//   OPTIMIZER  — auto-purchase and upgrade home RAM + purchased servers
//   SECURITY   — deploy weaken/grow/hack to all available RAM
//   CLEANUP    — detect and kill orphan processes, remove unused files
//   AUGUPDATES — track augmentation progress (requires SF4)
//
// Zero-trust: every external API call is wrapped in try-catch.
// Config file: /cfg/sysadmin.json  (auto-created with defaults if missing)
//
// --dry      = show what would be done without doing it
// --no-clean = skip orphan cleanup
// --no-hack  = skip security/hacking deployment
// --no-upgrade = skip server purchases and upgrades
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.tail();

  const DRY       = ns.args.includes("--dry");
  const NO_CLEAN  = ns.args.includes("--no-clean");
  const NO_HACK   = ns.args.includes("--no-hack");
  const NO_UPG    = ns.args.includes("--no-upgrade");

  // ── Config ──────────────────────────────────────────────────────
  const CFG_FILE = "/cfg/sysadmin.json";
  const DEFAULT_CFG = {
    optimizer:       true,   // auto-upgrade home RAM + purchased servers
    security:        true,   // HWGW hacking deployment
    cleanup:         true,   // orphan process / file cleanup
    augupdates:      true,   // augmentation tracker
    maxPurchasedRam: 1048576,// max RAM per purchased server (1TB)
    maxPurchasedSvr: 25,     // max purchased server count
    keepScripts: [           // never delete these files
      "sysadmin.js","autogang.js","autocorporation.js","stratexport.js",
      "FinalStonkinton.js","FinalStonkinton-paper.js","FinalStonkintonSIMPLE.js",
      "bleedingedgestocktrader.js","newstonkinking.js","stocktrader.js",
    ],
    hackThreadsPerGB: 1,     // hacking script threads per GB RAM
    weakenFirst:     true,   // weaken all targets before growing/hacking
    sleepMs:         30000,  // main loop interval
  };

  let cfg = { ...DEFAULT_CFG };
  try {
    if (ns.fileExists(CFG_FILE)) {
      const raw = ns.read(CFG_FILE);
      const loaded = JSON.parse(raw);
      cfg = { ...DEFAULT_CFG, ...loaded };
    } else {
      ns.write(CFG_FILE, JSON.stringify(DEFAULT_CFG, null, 2), "w");
    }
  } catch { /* use defaults */ }

  // Apply CLI overrides (zero-trust: always respect explicit flags)
  if (DRY)      { cfg.optimizer = false; cfg.security = false; cfg.cleanup = false; }
  if (NO_CLEAN) cfg.cleanup  = false;
  if (NO_HACK)  cfg.security = false;
  if (NO_UPG)   cfg.optimizer = false;


  // ── Worker script paths ──────────────────────────────────────────
  const W_WEAKEN = "/sysadmin/weaken.js";
  const W_GROW   = "/sysadmin/grow.js";
  const W_HACK   = "/sysadmin/hack.js";

  function ensureWorkers() {
    if (!ns.fileExists(W_WEAKEN)) ns.write(W_WEAKEN, `export async function main(ns){await ns.weaken(ns.args[0]);}`, "w");
    if (!ns.fileExists(W_GROW))   ns.write(W_GROW,   `export async function main(ns){await ns.grow(ns.args[0]);}`,   "w");
    if (!ns.fileExists(W_HACK))   ns.write(W_HACK,   `export async function main(ns){await ns.hack(ns.args[0]);}`,   "w");
  }


  // ── Utility: discover all reachable servers ──────────────────────
  function discoverServers() {
    const found = new Set(["home"]);
    const queue = ["home"];
    while (queue.length) {
      const cur = queue.shift();
      try {
        for (const n of ns.scan(cur)) {
          if (!found.has(n)) { found.add(n); queue.push(n); }
        }
      } catch { /* scan failed on this node */ }
    }
    return [...found];
  }


  // ── OPTIMIZER MODULE ─────────────────────────────────────────────
  function runOptimizer(servers) {
    if (!cfg.optimizer) return { actions: [] };
    const actions = [];
    const money = ns.getServerMoneyAvailable("home");

    // Home RAM upgrade
    try {
      const cost = ns.getUpgradeHomeRamCost();
      if (cost > 0 && cost < money * 0.3) {
        if (!DRY) ns.upgradeHomeRam();
        const newRam = ns.getServerMaxRam("home");
        actions.push(`home RAM → ${ns.formatRam(newRam)}`);
      }
    } catch { /* not available */ }

    // Purchased servers
    try {
      const pservs = ns.getPurchasedServers();
      // Buy new servers if under limit
      if (pservs.length < cfg.maxPurchasedSvr) {
        const cost = ns.getPurchasedServerCost(64);
        if (cost > 0 && cost < money * 0.1) {
          const name = `farm-${pservs.length}`;
          if (!DRY) ns.purchaseServer(name, 64);
          actions.push(`+server ${name} (64GB)`);
        }
      }
      // Upgrade existing servers
      if (pservs.length > 0) {
        const maxRam = pservs.reduce((m, s) => Math.max(m, ns.getServerMaxRam(s)), 0);
        const next = Math.min(maxRam * 2, cfg.maxPurchasedRam);
        if (next > maxRam) {
          const totalCost = pservs.reduce((sum, s) => {
            try { return sum + ns.getPurchasedServerUpgradeCost(s, next); } catch { return sum; }
          }, 0);
          if (totalCost > 0 && totalCost < money * 0.5) {
            if (!DRY) for (const s of pservs) ns.upgradePurchasedServer(s, next);
            actions.push(`farm servers → ${ns.formatRam(next)}`);
          }
        }
      }
    } catch { /* not available */ }

    return { actions };
  }


  // ── SECURITY (HACKING) MODULE ────────────────────────────────────
  function rankTargets(servers) {
    return servers
      .filter(s => {
        try {
          return s !== "home"
            && !s.startsWith("farm-")
            && ns.getServerMaxMoney(s) > 0
            && ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel()
            && ns.hasRootAccess(s);
        } catch { return false; }
      })
      .map(s => {
        try {
          const maxMoney = ns.getServerMaxMoney(s);
          const chance   = ns.hackAnalyzeChance(s);
          return { name: s, score: maxMoney * chance };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }

  function getRootAccess(target) {
    // Zero-trust: try every crack tool, ignore failures
    try { ns.brutessh(target); }   catch {}
    try { ns.ftpcrack(target); }   catch {}
    try { ns.relaysmtp(target); }  catch {}
    try { ns.httpworm(target); }   catch {}
    try { ns.sqlinject(target); }  catch {}
    try { ns.nuke(target); return true; } catch { return false; }
  }

  function runSecurity(servers) {
    if (!cfg.security) return { deployed: 0, targets: [] };

    const SCRIPT_RAM = 1.75; // GB per thread (weaken/grow/hack all ~1.75GB)
    const targets    = rankTargets(servers);
    let   deployed   = 0;

    // Available attack platforms: home + purchased servers
    const attackers = ["home", ...ns.getPurchasedServers()].filter(s => {
      try { return ns.getServerMaxRam(s) > 0; } catch { return false; }
    });

    for (const target of targets.slice(0, 10)) {
      // Try to crack if not already rooted
      try {
        if (!ns.hasRootAccess(target.name)) getRootAccess(target.name);
        if (!ns.hasRootAccess(target.name)) continue;
      } catch { continue; }

      const curSec  = ns.getServerSecurityLevel(target.name);
      const minSec  = ns.getServerMinSecurityLevel(target.name);
      const curMon  = ns.getServerMoneyAvailable(target.name);
      const maxMon  = ns.getServerMaxMoney(target.name);

      // Determine what this target needs: weaken > grow > hack
      const needsWeaken = curSec > minSec + 2;
      const needsGrow   = curMon < maxMon * 0.75;
      const script = needsWeaken ? W_WEAKEN : (needsGrow ? W_GROW : W_HACK);

      for (const attacker of attackers) {
        try {
          const maxRam   = ns.getServerMaxRam(attacker);
          const usedRam  = ns.getServerUsedRam(attacker);
          const freeRam  = maxRam - usedRam - (attacker === "home" ? 32 : 0);
          const threads  = Math.floor(freeRam / SCRIPT_RAM);
          if (threads < 1) continue;

          // Don't re-deploy if already running this exact script on this attacker for this target
          const already = ns.ps(attacker).some(p => p.filename === script && p.args[0] === target.name);
          if (already) continue;

          if (!DRY) {
            // Copy script to attacker if needed
            if (!ns.fileExists(script, attacker)) ns.scp(script, attacker);
            const pid = ns.exec(script, attacker, threads, target.name);
            if (pid > 0) deployed++;
          } else {
            deployed++;
          }
        } catch { /* exec failed — skip this attacker/target pair */ }
      }
    }

    return { deployed, targets: targets.slice(0, 5).map(t => t.name) };
  }


  // ── CLEANUP MODULE ───────────────────────────────────────────────
  function runCleanup(servers) {
    if (!cfg.cleanup) return { killed: 0, removed: 0 };

    const KEEP = new Set(cfg.keepScripts);
    // Also keep the sysadmin worker scripts
    KEEP.add(W_WEAKEN); KEEP.add(W_GROW); KEEP.add(W_HACK);

    let killed = 0, removed = 0;

    // Kill orphan processes: running on purchased servers targeting $0 servers
    for (const server of ns.getPurchasedServers()) {
      try {
        for (const proc of ns.ps(server)) {
          const tgt = proc.args[0];
          if (!tgt) continue;
          try {
            const maxMon = ns.getServerMaxMoney(tgt);
            if (maxMon === 0) {
              if (!DRY) ns.kill(proc.pid, server);
              killed++;
            }
          } catch { /* can't assess target — leave it alone */ }
        }
      } catch { /* can't ps this server */ }
    }

    // Remove orphan script files from home that aren't running anywhere
    // and aren't in the keep list. Never touch /lib/ — those are imported
    // dynamically and won't show up as running processes.
    try {
      const homeFiles = ns.ls("home", ".js").filter(f => !KEEP.has(f) && !f.startsWith("/lib/"));
      for (const file of homeFiles) {
        // Check if it's running on any server
        let isRunning = false;
        for (const server of servers) {
          try {
            if (ns.scriptRunning(file, server)) { isRunning = true; break; }
          } catch { /* can't check this server */ }
        }
        if (!isRunning) {
          if (!DRY) ns.rm(file, "home");
          removed++;
        }
      }
    } catch { /* ns.ls failed */ }

    return { killed, removed };
  }


  // ── AUGMENTATION TRACKER ─────────────────────────────────────────
  function getAugInfo() {
    const result = { available: [], tiers: [] };
    try {
      // Requires SF4 — will throw if not unlocked
      const owned = new Set(ns.singularity.getOwnedAugmentations(true));
      const money    = ns.getServerMoneyAvailable("home");

      const allAugs = [];
      for (const fac of ns.singularity.getJoinedFactions()) {
        try {
          for (const aug of ns.singularity.getAugmentationsFromFaction(fac)) {
            if (!owned.has(aug)) {
              const cost = ns.singularity.getAugmentationPrice(aug);
              const rep  = ns.singularity.getAugmentationRepReq(aug);
              const facRep = ns.singularity.getFactionRep(fac);
              allAugs.push({ name: aug, cost, rep, facRep, faction: fac, affordable: cost <= money && facRep >= rep });
            }
          }
        } catch { /* faction aug query failed */ }
      }
      allAugs.sort((a, b) => a.cost - b.cost);
      result.available = allAugs.slice(0, 8);
    } catch { /* SF4 not unlocked — no aug data */ }
    return result;
  }


  // ── DASHBOARD ────────────────────────────────────────────────────
  function printDashboard(servers, optResult, secResult, cleanResult, augInfo) {
    ns.clearLog();
    const money = ns.getServerMoneyAvailable("home");
    const homeRam = ns.getServerMaxRam("home");
    const usedRam = ns.getServerUsedRam("home");
    const pservs  = ns.getPurchasedServers();
    const farmRam = pservs.length > 0 ? ns.getServerMaxRam(pservs[0]) : 0;

    ns.print("╔══════════════════════════════════════════════════════════════╗");
    ns.print("║  SYSADMIN  " + (DRY ? "[ DRY RUN ]" : "[ LIVE ]") + "  " + new Date().toLocaleTimeString());
    ns.print("╠══════════════════════════════════════════════════════════════╣");

    // System overview
    ns.print(`║ $  ${ns.formatNumber(money, 2).padStart(14)} | Hack: ${ns.getHackingLevel()} | Servers: ${servers.length}`);
    ns.print(`║ home RAM:  ${ns.formatRam(homeRam)} (${Math.round(usedRam/homeRam*100)}% used)`);
    if (pservs.length > 0) ns.print(`║ farm:  ${pservs.length}×${ns.formatRam(farmRam)}  (${pservs.length}/${cfg.maxPurchasedSvr} slots)`);

    // Module status
    ns.print("╠══════════════════════════════════════════════════════════════╣");
    const mods = [
      ["OPTIMIZER", cfg.optimizer], ["SECURITY", cfg.security],
      ["CLEANUP",   cfg.cleanup  ], ["AUGUPDATES", cfg.augupdates],
    ];
    ns.print("║ Modules: " + mods.map(([n,v]) => (v ? n : `[off]${n}`)).join("  "));

    // Expert toggles (from cfg)
    ns.print(`║ Config: ${CFG_FILE}  MaxFarm: ${cfg.maxPurchasedSvr}×${ns.formatRam(cfg.maxPurchasedRam)}`);

    // Optimizer results
    if (optResult.actions.length > 0) {
      ns.print("╠══════════════════════════════════════════════════════════════╣");
      ns.print("║ OPTIMIZER:");
      for (const a of optResult.actions) ns.print(`║   + ${a}`);
    }

    // Security results
    ns.print("╠══════════════════════════════════════════════════════════════╣");
    ns.print(`║ SECURITY:  deployed ${secResult.deployed} threads | top targets: ${secResult.targets.slice(0,3).join(", ") || "none"}`);

    // Cleanup results
    if (cfg.cleanup) {
      ns.print("╠══════════════════════════════════════════════════════════════╣");
      ns.print(`║ CLEANUP:   killed ${cleanResult.killed} orphan procs | removed ${cleanResult.removed} orphan files`);
    }

    // Aug tracker (if SF4)
    if (cfg.augupdates && augInfo.available.length > 0) {
      ns.print("╠══════════════════════════════════════════════════════════════╣");
      ns.print("║ AUGMENTS  (unowned, joined factions):");
      for (const a of augInfo.available.slice(0, 5)) {
        const rdy = a.affordable ? "✓" : "·";
        ns.print(`║  ${rdy} ${a.name.substring(0, 28).padEnd(28)} ${ns.formatNumber(a.cost, 2).padStart(10)}  [${a.faction}]`);
      }
    } else if (cfg.augupdates) {
      ns.print("╠══════════════════════════════════════════════════════════════╣");
      ns.print("║ AUGMENTS:  SF4 required for aug tracking");
    }

    ns.print("╚══════════════════════════════════════════════════════════════╝");
    if (DRY) ns.print("  DRY RUN — no changes made. Remove --dry to apply.");
  }


  // ── MAIN LOOP ────────────────────────────────────────────────────
  ensureWorkers();
  ns.tprint(`SYSADMIN started${DRY ? " (dry run)" : ""}. Config: ${CFG_FILE}`);

  while (true) {
    let servers = [];
    try { servers = discoverServers(); } catch { servers = ["home"]; }

    const optResult   = runOptimizer(servers);
    const secResult   = runSecurity(servers);
    const cleanResult = runCleanup(servers);
    const augInfo     = cfg.augupdates ? getAugInfo() : { available: [] };

    printDashboard(servers, optResult, secResult, cleanResult, augInfo);

    await ns.sleep(cfg.sleepMs);
  }
}

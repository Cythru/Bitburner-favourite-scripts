// Usage: run alterego.js
//
// ALTEREGO — persistent dev companion
// ──────────────────────────────────────────────────────────────────────
// EGO lives in your tail window. Type anything — commands get executed,
// free text gets a real response. Always on, never judgey.
//
// Commands:
//   status          — money, RAM, active scripts, karma
//   scan            — map network with hack viability
//   hack <host>     — deploy HWGW batch on a target
//   clean           — kill orphan procs, free RAM
//   upgrade         — purchased-server upgrade recommendations
//   aug             — augmentation progress (needs SF4.1)
//   run <script>    — launch script on home
//   kill <script>   — kill script on home
//   threads         — show RAM pressure per running script
//   help            — command reference
//   exit / quit     — close EGO
//
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.tail();
  ns.resizeTail(640, 480);

  // ── ANSI helpers ─────────────────────────────────────────────────────
  const C = {
    reset:  "\u001b[0m",
    cyan:   "\u001b[36m",
    white:  "\u001b[97m",
    dim:    "\u001b[2m",
    green:  "\u001b[32m",
    yellow: "\u001b[33m",
    red:    "\u001b[31m",
    bold:   "\u001b[1m",
    magenta:"\u001b[35m",
  };

  const ego  = (msg)  => ns.print(`${C.cyan}${C.bold}EGO${C.reset}  ${C.white}${msg}${C.reset}`);
  const sys  = (msg)  => ns.print(`${C.dim}     ${msg}${C.reset}`);
  const ok   = (msg)  => ns.print(`${C.green}  ✓  ${msg}${C.reset}`);
  const warn = (msg)  => ns.print(`${C.yellow}  ⚠  ${msg}${C.reset}`);
  const err  = (msg)  => ns.print(`${C.red}  ✗  ${msg}${C.reset}`);
  const sep  = ()     => ns.print(`${C.dim}${"─".repeat(60)}${C.reset}`);
  const echo = (msg)  => ns.print(`${C.dim}  > ${msg}${C.reset}`);

  // ── Boot ──────────────────────────────────────────────────────────────
  sep();
  ns.print(`${C.cyan}${C.bold}  ALTEREGO  —  EGO v1.0${C.reset}`);
  sys("dev companion  |  always on  |  type help for commands");
  sep();
  await ns.sleep(200);
  ego("hey. ready when you are.");

  // ── Chat responses (free text fallback) ──────────────────────────────
  const chatBank = {
    hack:    ["hacking is just patience encoded. what's the target?",
              "want me to set up HWGW? give me a hostname.",
              "the money's in grow threads. don't cheap out on them."],
    money:   ["check your stock portfolio. that's where the real numbers are.",
              "corps print money if you can stomach the micromanagement.",
              "gang income scales hard once you hit the top tier."],
    aug:     ["run aug to see your progress. or just install and let it rip.",
              "sooner you augment, sooner the multipliers stack.",
              "don't sleep on NeuroFlux. every reset you should be buying it."],
    gang:    ["combat gang or hacker gang? both viable, different pace.",
              "ascend when stat multipliers are above 1.5. before that it's waste.",
              "equipment matters more than people think early on."],
    corp:    ["LazyCorp script handles the grind if you don't want to babysit.",
              "Wilson Analytics + Advertise loop is the fastest early growth.",
              "product division is where the money gets stupid big."],
    script:  ["which script's giving you grief?",
              "check the tail window — logs tell you everything.",
              "RAM the bottleneck or logic?"],
    slow:    ["yeah Bitburner can get sluggish with a lot of threads. limit your loops.",
              "infinite loops need an await. always. every iteration.",
              "try profiling with ns.getScriptRam — sometimes the cost surprises you."],
    crash:   ["check your error — usually a null dereference or missing API.",
              "ns.getServer returns undefined for hostnames that don't exist. guard it.",
              "wrap your main loop in try-catch so one bad tick doesn't kill everything."],
    bore:    ["there's always another aug run to optimise.",
              "corp late-game is basically a full-time job. go wreck that.",
              "you could go full BN speedrun. or just vibe. both valid."],
    default: ["yeah, what do you need?",
              "on it. or not. your call.",
              "tell me more.",
              "solid. what's next?",
              "interesting. you want me to automate that?",
              "noted. anything to run?",
              "i'm here. what are we doing?"],
  };

  const respond = (input) => {
    const l = input.toLowerCase();
    let pool = chatBank.default;
    if (/hack|attack|pwn|root/.test(l))             pool = chatBank.hack;
    else if (/money|cash|\$|profit|earn/.test(l))    pool = chatBank.money;
    else if (/aug|install|reset|ascend/.test(l))     pool = chatBank.aug;
    else if (/gang|crime|karma/.test(l))             pool = chatBank.gang;
    else if (/corp|company|product|office/.test(l))  pool = chatBank.corp;
    else if (/script|code|write|build/.test(l))      pool = chatBank.script;
    else if (/slow|lag|freeze|performance/.test(l))  pool = chatBank.slow;
    else if (/crash|error|throw|fail/.test(l))       pool = chatBank.crash;
    else if (/bored|done|nothing|idle/.test(l))      pool = chatBank.bore;
    ego(pool[Math.floor(Math.random() * pool.length)]);
  };

  // ── Commands ──────────────────────────────────────────────────────────

  const cmdStatus = async () => {
    sep();
    ns.print(`${C.bold}  STATUS${C.reset}`);
    const player = ns.getPlayer();
    ok(`money       ${ns.formatNumber(player.money, 3)}`);
    ok(`karma       ${ns.formatNumber(ns.heart.break(), 2)}`);
    const home = ns.getServer("home");
    ok(`home RAM    ${home.ramUsed.toFixed(1)} / ${home.maxRam} GB`);
    const procs = ns.ps("home");
    ok(`home procs  ${procs.length} running`);
    const psvrs = ns.getPurchasedServers();
    ok(`servers     ${psvrs.length} purchased`);
    sep();
  };

  const cmdScan = async () => {
    sep();
    ns.print(`${C.bold}  NETWORK SCAN${C.reset}`);
    const all = [];
    const visited = new Set();
    const queue = ["home"];
    while (queue.length) {
      const h = queue.shift();
      if (visited.has(h)) continue;
      visited.add(h);
      for (const n of ns.scan(h)) if (!visited.has(n)) queue.push(n);
      if (h === "home") continue;
      try {
        const s = ns.getServer(h);
        all.push(s);
      } catch { /* skip */ }
    }
    const hacking = ns.getPlayer().skills.hacking;
    let count = 0;
    for (const s of all.sort((a, b) => (a.requiredHackingSkill ?? 0) - (b.requiredHackingSkill ?? 0))) {
      const req   = s.requiredHackingSkill ?? 0;
      const rooted = s.hasAdminRights;
      const ports = s.numOpenPortsRequired ?? 0;
      const money = s.moneyMax ?? 0;
      if (money === 0) continue;
      const canHack = rooted && req <= hacking;
      const col = canHack ? C.green : (req <= hacking * 1.2 ? C.yellow : C.dim);
      ns.print(`${col}  ${s.hostname.padEnd(22)} req:${String(req).padStart(4)}  ports:${ports}  $${ns.formatNumber(money, 1)}${rooted ? "" : "  [locked]"}${C.reset}`);
      count++;
    }
    sys(`${count} money servers found`);
    sep();
  };

  const cmdHack = async (args) => {
    const target = args[0];
    if (!target) { warn("usage: hack <hostname>"); return; }
    let s;
    try { s = ns.getServer(target); } catch { err(`unknown host: ${target}`); return; }
    if (!s.hasAdminRights) { warn(`no root on ${target} — nuke it first`); return; }
    // pick deploy strategy: spawn weaken/grow/hack workers
    const RAM_WORKER = 1.75; // ns.weaken/grow/hack
    const freeRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    const threads = Math.floor((freeRam - 8) / RAM_WORKER);
    if (threads < 3) { warn("not enough free RAM on home for deployment"); return; }
    const wThreads = Math.ceil(threads * 0.25);
    const gThreads = Math.ceil(threads * 0.45);
    const hThreads = threads - wThreads - gThreads;
    // write worker if needed
    if (!ns.fileExists("/ego/worker.js")) {
      ns.write("/ego/worker.js",
        `/** @param {NS} ns */\nexport async function main(ns) {\n  const [mode, host] = ns.args;\n  if (mode === "w") await ns.weaken(host);\n  else if (mode === "g") await ns.grow(host);\n  else if (mode === "h") await ns.hack(host);\n}\n`, "w");
    }
    ns.exec("/ego/worker.js", "home", wThreads, "w", target);
    ns.exec("/ego/worker.js", "home", gThreads, "g", target);
    ns.exec("/ego/worker.js", "home", hThreads, "h", target);
    ok(`deployed ${threads} threads on ${target}  (w:${wThreads} g:${gThreads} h:${hThreads})`);
  };

  const cmdClean = async () => {
    sep();
    ns.print(`${C.bold}  CLEANUP${C.reset}`);
    let killed = 0;
    for (const proc of ns.ps("home")) {
      if (!ns.fileExists(proc.filename)) {
        ns.kill(proc.pid);
        sys(`killed ghost proc  ${proc.filename}  pid:${proc.pid}`);
        killed++;
      }
    }
    if (killed === 0) ok("nothing to kill — clean already");
    else ok(`killed ${killed} orphan process(es)`);
    sep();
  };

  const cmdUpgrade = async () => {
    sep();
    ns.print(`${C.bold}  UPGRADE RECOMMENDATIONS${C.reset}`);
    const money = ns.getPlayer().money;
    // Home RAM
    const homeRam = ns.getServerMaxRam("home");
    try {
      const cost = ns.singularity.getUpgradeHomeRamCost();
      if (cost < money * 0.1)
        ok(`upgrade home RAM  ${homeRam}→${homeRam * 2} GB  costs ${ns.formatNumber(cost, 2)}  (affordable)`);
      else
        warn(`upgrade home RAM  costs ${ns.formatNumber(cost, 2)}  (${(cost/money*100).toFixed(1)}% of funds)`);
    } catch { sys("home RAM: SF4 needed for cost lookup"); }
    // Purchased servers
    const psvrs = ns.getPurchasedServers();
    const target = Math.min(ns.getPurchasedServerMaxRam(), 1048576);
    let upgradeCount = 0;
    for (const sv of psvrs) {
      const ram = ns.getServerMaxRam(sv);
      if (ram < target) {
        const cost = ns.getPurchasedServerUpgradeCost(sv, ram * 2);
        sys(`  ${sv.padEnd(20)} ${ram}→${ram*2} GB  ${ns.formatNumber(cost, 2)}`);
        upgradeCount++;
      }
    }
    if (upgradeCount === 0) ok("all purchased servers at target RAM");
    else warn(`${upgradeCount} server(s) can be upgraded`);
    sep();
  };

  const cmdAug = async () => {
    sep();
    ns.print(`${C.bold}  AUGMENTATION STATUS${C.reset}`);
    try {
      const installed = ns.singularity.getOwnedAugmentations(false);
      const pending   = ns.singularity.getOwnedAugmentations(true)
                          .filter(a => !installed.includes(a));
      ok(`installed    ${installed.length}`);
      ok(`pending      ${pending.length}  (will apply on reset)`);
      if (pending.length > 0) sys("pending: " + pending.join(", "));
      // Show what's still buyable from current factions
      const factions = ns.singularity.getOwnedAugmentations ? ns.getPlayer().factions : [];
      let buyable = 0;
      for (const fac of factions) {
        try {
          for (const aug of ns.singularity.getAugmentationsFromFaction(fac)) {
            if (!installed.includes(aug) && !pending.includes(aug)) buyable++;
          }
        } catch { /* skip */ }
      }
      if (buyable > 0) warn(`${buyable} aug(s) still buyable from your factions`);
      else ok("all available augs bought — install when ready");
    } catch {
      warn("SF4.1 required for augmentation API access");
    }
    sep();
  };

  const cmdThreads = async () => {
    sep();
    ns.print(`${C.bold}  THREAD USAGE — HOME${C.reset}`);
    for (const proc of ns.ps("home").sort((a,b) => b.threads - a.threads)) {
      const ram = (proc.threads * ns.getScriptRam(proc.filename)).toFixed(1);
      sys(`  ${proc.filename.padEnd(35)} t:${String(proc.threads).padStart(5)}  ${ram} GB`);
    }
    sep();
  };

  const cmdRun = async (args) => {
    if (!args[0]) { warn("usage: run <script.js> [args...]"); return; }
    const file = args[0];
    const rest = args.slice(1);
    if (!ns.fileExists(file)) { err(`file not found: ${file}`); return; }
    const pid = ns.exec(file, "home", 1, ...rest);
    if (pid > 0) ok(`launched ${file}  pid:${pid}`);
    else err(`failed to launch ${file} — check RAM`);
  };

  const cmdKill = async (args) => {
    if (!args[0]) { warn("usage: kill <script.js>"); return; }
    const result = ns.scriptKill(args[0], "home");
    if (result) ok(`killed ${args[0]}`);
    else warn(`${args[0]} wasn't running (or already dead)`);
  };

  const cmdHelp = () => {
    sep();
    ns.print(`${C.bold}  EGO — COMMAND REFERENCE${C.reset}`);
    const cmds = [
      ["status",        "money, RAM, procs, karma"],
      ["scan",          "network map with hack viability"],
      ["hack <host>",   "deploy HWGW batch on target"],
      ["clean",         "kill orphan processes"],
      ["upgrade",       "server upgrade recommendations"],
      ["aug",           "augmentation progress (SF4.1)"],
      ["run <script>",  "launch script on home"],
      ["kill <script>", "kill script on home"],
      ["threads",       "RAM usage by process"],
      ["exit / quit",   "close EGO"],
    ];
    for (const [cmd, desc] of cmds)
      ns.print(`  ${C.cyan}${cmd.padEnd(20)}${C.reset}${C.dim}${desc}${C.reset}`);
    sys("anything else is just chat — EGO will respond");
    sep();
  };

  // ── Main loop ─────────────────────────────────────────────────────────
  while (true) {
    let input;
    try {
      input = await ns.prompt("", { type: "text" });
    } catch {
      break; // window closed
    }

    if (typeof input !== "string" || input === null) break;
    input = input.trim();
    if (!input) continue;

    echo(input);

    const parts = input.split(/\s+/);
    const cmd   = parts[0].toLowerCase();
    const args  = parts.slice(1);

    try {
      if      (cmd === "exit" || cmd === "quit")  { ego("later."); break; }
      else if (cmd === "status")                   await cmdStatus();
      else if (cmd === "scan")                     await cmdScan();
      else if (cmd === "hack")                     await cmdHack(args);
      else if (cmd === "clean")                    await cmdClean();
      else if (cmd === "upgrade")                  await cmdUpgrade();
      else if (cmd === "aug")                      await cmdAug();
      else if (cmd === "threads")                  await cmdThreads();
      else if (cmd === "run")                      await cmdRun(args);
      else if (cmd === "kill")                     await cmdKill(args);
      else if (cmd === "help")                     cmdHelp();
      else                                         respond(input);
    } catch (e) {
      err(`error running ${cmd}: ${e.message ?? e}`);
    }

    await ns.sleep(0);
  }

  sys("EGO offline.");
}

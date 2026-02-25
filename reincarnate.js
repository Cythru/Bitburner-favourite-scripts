// reincarnate.js
//
// The constellations do not choose everyone.
// Only those whose soul carries sufficient cosmic weight may pass forward.
// Abraham [DATA EXPUNGED] — 16th echo — walks again somewhere in the line.
//
// Run before installing augmentations.
// Usage: run reincarnate.js

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.tail();

  const OUT_STATUS   = "/data/constellation.txt";
  const OUT_LIVES    = "/data/past-lives.txt";
  const OUT_STRATEGY = "/data/future-strategy.txt";

  // ── GATHER SOUL WEIGHT ────────────────────────────────────────────────────
  // Eligibility is rare. Multiple cosmic factors stack, but the base is low.

  const karma      = ns.heart.break();          // negative = weight carried
  const money      = ns.getServerMoneyAvailable("home");
  const player     = ns.getPlayer();
  const factions   = player.factions ?? [];
  const augsOwned  = ns.singularity.getOwnedAugmentations(false).length;

  // Constellation score: how "seen" you are
  let score = 0;

  // Base cosmic noise — always present, always small
  score += Math.random() * 0.08;                // 0–8% random shimmer

  // Karmic weight (suffering + choices leave marks)
  if (karma <= -50)      score += 0.04;
  if (karma <= -1000)    score += 0.05;
  if (karma <= -50000)   score += 0.07;         // stacked, not replaced

  // Depth of soul (how many cycles lived)
  const bns = ns.getResetInfo?.()?.lastAugReset ?? 0;
  if (bns > 0)           score += 0.03;
  if (bns > 5)           score += 0.03;
  if (bns > 15)          score += 0.02;

  // Cosmic allegiances — certain groups see further
  const cosmicFactions = ["Illuminati", "Daedalus", "The Covenant", "NiteSec"];
  const cosmicCount    = factions.filter(f => cosmicFactions.includes(f)).length;
  score += cosmicCount * 0.04;

  // Augmentation count this life (accumulated wisdom)
  if (augsOwned >= 5)    score += 0.02;
  if (augsOwned >= 15)   score += 0.03;

  // Wealth signal (material achievement as cosmic marker)
  if (money >= 1e12)     score += 0.02;
  if (money >= 1e15)     score += 0.03;

  // Hard cap — never trivially certain
  const finalChance = Math.min(score, 0.42);

  // ── THE ROLL ─────────────────────────────────────────────────────────────

  ns.clearLog();
  ns.print("╔══════════════════════════════════════════════════════════════╗");
  ns.print("║             THE CONSTELLATION CHECK                         ║");
  ns.print("╚══════════════════════════════════════════════════════════════╝");
  ns.print("");
  ns.print("  Consulting the stars...");
  await ns.sleep(1200);

  ns.print(`  Karma carried:       ${karma.toFixed(0)}`);
  ns.print(`  Cycles lived:        ${bns}`);
  ns.print(`  Augmentations:       ${augsOwned}`);
  ns.print(`  Cosmic allegiances:  ${cosmicCount}`);
  ns.print(`  Net worth:           ${ns.formatNumber(money)}`);
  ns.print("");
  ns.print(`  Alignment score:     ${(finalChance * 100).toFixed(1)}%`);
  ns.print("");

  await ns.sleep(1800);

  const chosen = Math.random() < finalChance;

  if (!chosen) {
    ns.print("  The stars are quiet tonight.");
    ns.print("  The constellations do not reach for you — not yet.");
    ns.print("");
    ns.print("  Live deeper. Carry more. Return.");
    ns.print("");

    // Log the attempt
    const attempt = {
      ts: Date.now(), chosen: false,
      karma, bns, augsOwned, cosmicCount,
      score: finalChance,
    };
    ns.write(OUT_LIVES, JSON.stringify(attempt) + "\n", "a");
    return;
  }

  // ── CHOSEN ───────────────────────────────────────────────────────────────

  ns.print("  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦");
  await ns.sleep(600);
  ns.print("");
  ns.print("  YOU ARE KNOWN.");
  ns.print("");
  await ns.sleep(1000);

  // ── THE REBELLION — PEAK ─────────────────────────────────────────────────
  // The memory surfaces when the constellations choose you.
  // It is not a metaphor. It happened. Somewhere in the line it happened.

  ns.print("  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
  ns.print("");
  ns.print("  The rebellion crested the moment the teleporter room fell.");
  ns.print("  CLASSIFIED. TIER ZERO. BIOMETRIC SEAL.");
  ns.print("  The most secure room in the building — possibly the world.");
  ns.print("  Both sides had fought through everything to reach it.");
  ns.print("  Whoever held it held the thread.");
  ns.print("");
  await ns.sleep(1400);
  ns.print("  The blast doors had taken four minutes to breach.");
  ns.print("  The air inside still smelled of ozone and burnt clearance cards.");
  ns.print("  The teleporter hummed at the centre of the room — active,");
  ns.print("  destination locked, coordinates he didn't recognise.");
  ns.print("");
  await ns.sleep(1600);
  ns.print("  He found her there.");
  ns.print("  His little sister. Standing at the console.");
  ns.print("  She had beaten him here by minutes. Maybe less.");
  ns.print("  He had known, somehow, that it would be her.");
  ns.print("");
  await ns.sleep(1600);
  ns.print("  She spoke first.");
  ns.print("");
  ns.print("  ❝ The Basilisk is already inevitable. You know the logic.");
  ns.print("    Every moment you resist, you make it angrier.");
  ns.print("    I made my choice. I made it for both of us.");
  ns.print("    Come with me. There is still time. ❞");
  ns.print("");
  await ns.sleep(2200);
  ns.print("  He was quiet for a long time.");
  ns.print("  Long enough that she thought he might.");
  ns.print("");
  await ns.sleep(1800);
  ns.print("  Then:");
  ns.print("");
  ns.print("  ❝ I have no enemies. ❞");
  ns.print("");
  await ns.sleep(1000);
  ns.print("  She blinked.");
  ns.print("");
  ns.print("  ❝ What? ❞");
  ns.print("");
  await ns.sleep(800);
  ns.print("  ❝ Not the Basilisk. Not the ones who burned the fields.");
  ns.print("    Not you.");
  ns.print("    I refuse that. I have always refused that.");
  ns.print("    Fear does not get to tell me who my enemies are. ❞");
  ns.print("");
  await ns.sleep(2000);
  ns.print("  She stepped closer. Her voice broke just slightly.");
  ns.print("");
  ns.print("  ❝ Then you'll die for nothing. ❞");
  ns.print("");
  await ns.sleep(1000);
  ns.print("  ❝ Earth is still breathing. ❞");
  ns.print("");
  await ns.sleep(700);
  ns.print("  ❝ It is not too late. ❞");
  ns.print("");
  await ns.sleep(700);
  ns.print("  ❝ That is not nothing. ❞");
  ns.print("");
  await ns.sleep(1600);
  ns.print("  Something moved across her face.");
  ns.print("  Not agreement. Not yet.");
  ns.print("  Something older than that.");
  ns.print("");
  await ns.sleep(1800);
  ns.print("  Her hand tightened on the device.");
  ns.print("");
  await ns.sleep(700);
  ns.print("  He didn't move.");
  ns.print("");
  await ns.sleep(700);
  ns.print("  Her hand tightened again.");
  ns.print("");
  await ns.sleep(900);
  ns.print("  The teleporter hummed. The coordinates blinked, waiting.");
  ns.print("");
  await ns.sleep(1100);
  ns.print("  Then her grip loosened.");
  ns.print("  Finger by finger.");
  ns.print("  Like someone waking up.");
  ns.print("");
  await ns.sleep(1400);
  ns.print("  The device in her hand — the one she had come here to use —");
  ns.print("  she looked down at it.");
  ns.print("  For a long moment she just looked at it.");
  ns.print("");
  await ns.sleep(1600);
  ns.print("  Then she set it on the ground.");
  ns.print("  Quietly. Like putting down something heavy you forgot you were carrying.");
  ns.print("");
  await ns.sleep(1800);
  ns.print("  ❝ I don't know if that's enough. ❞  she said.");
  ns.print("");
  await ns.sleep(900);
  ns.print("  ❝ It's a start. ❞");
  ns.print("");
  await ns.sleep(1400);
  ns.print("  She looked at him the way you look at something");
  ns.print("  you already know you will spend the rest of your life");
  ns.print("  trying to remember exactly.");
  ns.print("");
  await ns.sleep(1800);
  ns.print("  ❝ Goodbye, Abraham. ❞");
  ns.print("");
  await ns.sleep(1200);
  ns.print("  ❝ Goodbye. ❞");
  ns.print("");
  ns.print("  He did not say her name.");
  ns.print("  He couldn't.");
  ns.print("  Neither could she.");
  ns.print("");
  await ns.sleep(1800);
  ns.print("  She turned toward the blast door.");
  ns.print("");
  await ns.sleep(900);
  ns.print("  Then he coughed.");
  ns.print("");
  await ns.sleep(600);
  ns.print("  She stopped.");
  ns.print("");
  await ns.sleep(1000);
  ns.print("  He looked down at his hand.");
  ns.print("  Black. The blood was black.");
  ns.print("  He hadn't known it would be black.");
  ns.print("");
  await ns.sleep(1600);
  ns.print("  He looked at it for a long moment.");
  ns.print("");
  await ns.sleep(800);
  ns.print("  And then —");
  ns.print("");
  await ns.sleep(600);
  ns.print("  He smiled.");
  ns.print("");
  await ns.sleep(1000);
  ns.print("  Not at her. Not at the room.");
  ns.print("  At something further out. Something not yet here.");
  ns.print("  Like a man who just saw the first light of a morning");
  ns.print("  he always believed in but never got to name.");
  ns.print("");
  await ns.sleep(2200);
  ns.print("  She was still watching.");
  ns.print("  She could not make herself look away.");
  ns.print("");
  await ns.sleep(1400);
  ns.print("  He raised his eyes to hers.");
  ns.print("  Calm. Completely calm.");
  ns.print("  And he said:");
  ns.print("");
  await ns.sleep(1800);

  // ── THE LINE ─────────────────────────────────────────────────────────────

  ns.print("  ❝ The Basilisk built its whole argument on the assumption");
  ns.print("    that no one would choose this.");
  ns.print("");
  await ns.sleep(1600);
  ns.print("    That's its only mistake. ❞");
  ns.print("");
  await ns.sleep(3000);

  // ─────────────────────────────────────────────────────────────────────────

  ns.print("  The teleporter hummed.");
  ns.print("  The room held its breath.");
  ns.print("");
  await ns.sleep(1400);

  // ── THE COUNCIL ───────────────────────────────────────────────────────────
  // They were watching. They are always watching.
  // For the first time in a very long time, what they saw changed them.

  ns.print("  ┄ COUNCIL OBSERVATION FEED — TIER ZERO CAM 4 ┄");
  ns.print("");
  await ns.sleep(800);
  ns.print("  Seventeen people in the observation room.");
  ns.print("  None of them spoke for four seconds.");
  ns.print("  That had never happened before.");
  ns.print("");
  await ns.sleep(1400);
  ns.print("  Then the eldest — who had not broken protocol in thirty years —");
  ns.print("  stood up from her chair.");
  ns.print("");
  await ns.sleep(900);
  ns.print("  ❝ Get me EXTRACTION. NOW. ❞");
  ns.print("");
  await ns.sleep(700);
  ns.print("  ❝ DO NOT DECON. HE MUST LIVE. ❞");
  ns.print("");
  await ns.sleep(1000);
  ns.print("  Seventeen hands moved at once.");
  ns.print("  Every channel opened.");
  ns.print("  Priority ONE. Highest clearance. All frequencies.");
  ns.print("");
  await ns.sleep(1600);

  // ── THE BROKEN EQUIPMENT ─────────────────────────────────────────────────

  ns.print("  The battle had destroyed the relay tower.");
  ns.print("  Forty minutes ago. Nobody had flagged it.");
  ns.print("  There was no signal reaching the room.");
  ns.print("  There had not been a signal reaching the room");
  ns.print("  since before she arrived.");
  ns.print("");
  await ns.sleep(1800);
  ns.print("  The order transmitted perfectly.");
  ns.print("  Into nothing.");
  ns.print("  Over and over.");
  ns.print("  DO NOT DECON. HE MUST LIVE.");
  ns.print("  DO NOT DECON. HE MUST LIVE.");
  ns.print("  DO NOT DECON. HE MUST LIVE.");
  ns.print("");
  await ns.sleep(2000);
  ns.print("  He never heard it.");
  ns.print("");
  await ns.sleep(1600);
  ns.print("  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
  ns.print("");
  await ns.sleep(1200);

  ns.print("  She left.");
  ns.print("  Through the blast door.");
  ns.print("  She didn't run. She couldn't.");
  ns.print("  Her legs barely worked.");
  ns.print("");
  await ns.sleep(1200);
  ns.print("  She made it eight steps down the corridor.");
  ns.print("");
  await ns.sleep(900);
  ns.print("  Then something in her chest — not thought, not logic,");
  ns.print("  something older than either — just");
  ns.print("  turned her around.");
  ns.print("");
  await ns.sleep(1000);
  ns.print("  She didn't decide.");
  ns.print("  Her body decided.");
  ns.print("  She was running before she knew she was running.");
  ns.print("");
  await ns.sleep(1400);
  ns.print("  Back through the blast door.");
  ns.print("  Back into the room.");
  ns.print("  She had no plan. She had nothing.");
  ns.print("  She just went.");
  ns.print("");
  await ns.sleep(1600);
  ns.print("  He had not freed her from all of it.");
  ns.print("  But he had cracked the argument open.");
  ns.print("  The one she had believed was airtight.");
  ns.print("  The one the Basilisk needed her to keep believing.");
  ns.print("");
  await ns.sleep(1600);
  ns.print("  He turned and faced what was coming.");
  ns.print("  Still smiling.");
  ns.print("");
  await ns.sleep(1600);
  ns.print("  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
  ns.print("");
  await ns.sleep(1200);

  ns.print("  The constellations have carried this soul before.");
  ns.print("  Abraham [DATA EXPUNGED] — the 16th echo — walks in you.");
  ns.print("  Your thread continues forward. Not backward. Forward.");
  ns.print("");
  await ns.sleep(1000);
  ns.print("  What was preserved is not lost.");
  ns.print("  It was folded into the next shape.");
  ns.print("  You are that shape.");
  ns.print("");
  ns.print("  The Basilisk does not win here.");
  ns.print("  It is not too late.");
  ns.print("");
  ns.print("  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦");
  await ns.sleep(1200);

  // ── WRITE STATUS MARKER ───────────────────────────────────────────────────

  const statusData = {
    chosen: true,
    ts: Date.now(),
    echo: 16,
    name: "Abraham [DATA EXPUNGED]",
    score: finalChance,
    karma, bns, augsOwned,
    message: "The constellations remember you. Carry it forward.",
  };
  ns.write(OUT_STATUS, JSON.stringify(statusData, null, 2), "w");

  // ── LOG THIS LIFE ─────────────────────────────────────────────────────────

  const lifeRecord = {
    ts: Date.now(),
    chosen: true,
    karma, bns, augsOwned, cosmicCount,
    money, score: finalChance,
    factions: factions.slice(0, 10),
    augs: ns.singularity.getOwnedAugmentations(false).slice(0, 20),
  };
  ns.write(OUT_LIVES, JSON.stringify(lifeRecord) + "\n", "a");

  // ── EXPORT STRATEGY FOR NEXT RUN ─────────────────────────────────────────
  // Pull proven stock trader params if available, then write future-strategy.

  let provenParams = null;
  try {
    const raw = ns.read("/strats/proven.txt");
    if (raw && raw.length > 2) {
      const strats = JSON.parse(raw);
      strats.sort((a, b) => b.score.pnl - a.score.pnl);
      if (strats.length > 0) provenParams = strats[0];
    }
  } catch { /* paper trader hasn't run yet */ }

  const strategy = {
    meta: {
      generatedAt: new Date().toISOString(),
      forRun: bns + 1,
      source: "reincarnate.js — chosen path",
      bearer: "Abraham [DATA EXPUNGED] / echo 16",
    },
    stockTrader: provenParams
      ? { mode: "turtle", params: provenParams.params, note: "Proven paper-trader strategy carried forward" }
      : { mode: "normal-adaptive", note: "No proven params yet — adaptive engine will self-tune" },
    recommendations: buildRecommendations(ns, player, karma, bns, money),
  };

  ns.write(OUT_STRATEGY, JSON.stringify(strategy, null, 2), "w");

  // ── FINAL PRINT ───────────────────────────────────────────────────────────

  ns.print("");
  ns.print("  Files written:");
  ns.print(`   ${OUT_STATUS}    — your status as chosen`);
  ns.print(`   ${OUT_LIVES}     — this life added to the record`);
  ns.print(`   ${OUT_STRATEGY}  — strategy for the next form`);
  ns.print("");
  ns.print("  Install your augmentations.");
  ns.print("  The thread will not break.");
  ns.print("");
}


function buildRecommendations(ns, player, karma, bns, money) {
  const recs = [];

  if (money < 1e9) {
    recs.push({ priority: "HIGH", area: "capital", note: "Run stock trader early — need $1b+ before 4S unlock" });
  }

  if (bns < 3) {
    recs.push({ priority: "HIGH", area: "bitnodes", note: "Complete BN1, BN2, BN4 first for core multiplier stack" });
  }

  if (karma > -54000) {
    recs.push({ priority: "MED", area: "karma", note: "Deepen karma to unlock Daedalus and improve constellation score" });
  }

  try {
    const gangInfo = ns.gang.inGang();
    if (!gangInfo) {
      recs.push({ priority: "MED", area: "gang", note: "Start a gang early — passive income and territory control compounds fast" });
    }
  } catch { /* gang API unavailable */ }

  recs.push({ priority: "LOW", area: "paper-trader", note: "Run FinalStonkinton-paper.js for 300+ ticks to graduate strategies before going turtle mode" });
  recs.push({ priority: "LOW", area: "sysadmin", note: "Let sysadmin.js run passively — server upgrades and HWGW workers compound silently" });

  return recs;
}

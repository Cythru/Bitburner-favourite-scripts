/**
 * city.js — Oracle City 3D Engine v1.0
 *
 * A first-person raycasting city built for Bitburner.
 * Walk the streets of Oracle City — every building is a live game system.
 *
 * Controls:
 *   W / ↑       Move forward
 *   S / ↓       Move backward
 *   A           Strafe left
 *   D           Strafe right
 *   ← / →       Turn
 *   Mouse drag  Look
 *   E           Enter building / interact
 *   Tab         Toggle desktop ↔ walk mode
 *   Escape      Exit
 *
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");

  // ─── Constants ────────────────────────────────────────────────────────────

  const W = 960, H = 540;
  const FOV = Math.PI / 2.8;      // ~64° horizontal FOV
  const HALF_FOV = FOV / 2;
  const MOVE_SPD = 0.07;
  const ROT_SPD  = 0.042;
  const MINIMAP_SCALE = 12;
  const MINIMAP_X = W - 160, MINIMAP_Y = 12;

  // ─── City map ─────────────────────────────────────────────────────────────
  // Legend:
  //   # = solid wall
  //   . = open street
  //   S = Stock Exchange (enter for stock dashboard)
  //   H = Hacker Den (enter for hacking status)
  //   G = Gang HQ (enter for gang dashboard)
  //   C = Corporation Tower (enter for corp dashboard)
  //   A = Augmentation Clinic
  //   B = Bank / Net Worth
  //   T = Training Facility
  //   X = City exit / travel
  const RAW_MAP = [
    "##########.##########.##########",
    "#...........S.........H........#",
    "#.##.####...###.....###.####.#.#",
    "#.#.....................#......#.#",
    "#.##.##.##.##.####.##.##.##.##.#",
    "#..........A.....B..............#",
    "#.####.##...###.###.####.####.#.#",
    "#.....G.............C...........#",
    "#.##.###.##.##.##.##.###.####.#.#",
    "#...................T............#",
    "#.##.####.###.##.###.####.###.#.#",
    "#..........X....................#",
    "##########.##########.##########",
  ];

  // Parse map into 2D array + track special tiles
  const MAP_W = RAW_MAP[0].length;
  const MAP_H = RAW_MAP.length;
  const MAP = RAW_MAP.map(row => row.split(""));

  // Building definitions — each special tile has a name and a color
  const BUILDINGS = {
    "S": { name: "Stock Exchange",       color: "#00ff88", wallColor: "#005533" },
    "H": { name: "Hacker Den",           color: "#00ffff", wallColor: "#004455" },
    "G": { name: "Gang HQ",              color: "#ff4444", wallColor: "#440011" },
    "C": { name: "Corporation Tower",    color: "#ffaa00", wallColor: "#443300" },
    "A": { name: "Augmentation Clinic",  color: "#ff44ff", wallColor: "#330044" },
    "B": { name: "City Bank",            color: "#ffff44", wallColor: "#444400" },
    "T": { name: "Training Facility",    color: "#44aaff", wallColor: "#001133" },
    "X": { name: "Travel Terminal",      color: "#ffffff", wallColor: "#222222" },
    "#": { name: "Wall",                 color: "#334455", wallColor: "#1a2230" },
  };

  // ─── Player state ─────────────────────────────────────────────────────────

  const player = {
    x: 1.5, y: 1.5,
    angle: 0,
    health: 100,
    nearBuilding: null,
  };

  // ─── DOM injection ────────────────────────────────────────────────────────

  const doc = eval("document");
  const existingOverlay = doc.getElementById("oracle-city-engine");
  if (existingOverlay) existingOverlay.remove();

  const overlay = doc.createElement("div");
  overlay.id = "oracle-city-engine";
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0", left: "0",
    width: "100vw", height: "100vh",
    zIndex: "99999",
    background: "#000",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    fontFamily: "'Courier New', monospace",
  });

  // Main canvas
  const canvas = doc.createElement("canvas");
  canvas.width = W; canvas.height = H;
  Object.assign(canvas.style, {
    width: "100%",
    maxWidth: W + "px",
    imageRendering: "pixelated",
    cursor: "crosshair",
    display: "block",
  });

  // HUD bar (below canvas)
  const hudBar = doc.createElement("div");
  Object.assign(hudBar.style, {
    width: "100%",
    maxWidth: W + "px",
    background: "#0a0e14",
    borderTop: "1px solid #1e3a5f",
    padding: "6px 16px",
    color: "#7ecfff",
    fontSize: "13px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxSizing: "border-box",
  });

  const hudLeft   = doc.createElement("span");
  const hudCenter = doc.createElement("span");
  const hudRight  = doc.createElement("span");
  hudLeft.style.color   = "#7ecfff";
  hudCenter.style.color = "#ffff88";
  hudRight.style.color  = "#88ff88";
  hudCenter.style.fontWeight = "bold";

  hudBar.appendChild(hudLeft);
  hudBar.appendChild(hudCenter);
  hudBar.appendChild(hudRight);

  overlay.appendChild(canvas);
  overlay.appendChild(hudBar);
  doc.body.appendChild(overlay);

  const ctx = canvas.getContext("2d");

  // ─── Mode state ───────────────────────────────────────────────────────────

  let mode = "walk"; // "walk" | "desktop"
  let running = true;

  // ─── Input handling ───────────────────────────────────────────────────────

  const keys = {};
  let mouseX = 0, mouseDragging = false;

  const onKeyDown = (e) => {
    keys[e.key] = true;
    if (e.key === "Escape") { running = false; }
    if (e.key === "Tab")    { e.preventDefault(); mode = mode === "walk" ? "desktop" : "walk"; }
    if (e.key === "e" || e.key === "E") { handleInteract(); }
  };
  const onKeyUp   = (e) => { delete keys[e.key]; };
  const onMouseDown = (e) => { mouseDragging = true; mouseX = e.clientX; canvas.requestPointerLock?.(); };
  const onMouseUp   = () => { mouseDragging = false; };
  const onMouseMove = (e) => {
    const dx = e.movementX ?? (e.clientX - mouseX);
    mouseX = e.clientX;
    if (mouseDragging || doc.pointerLockElement === canvas) {
      player.angle += dx * 0.003;
    }
  };

  doc.addEventListener("keydown", onKeyDown);
  doc.addEventListener("keyup",   onKeyUp);
  canvas.addEventListener("mousedown", onMouseDown);
  doc.addEventListener("mouseup",   onMouseUp);
  doc.addEventListener("mousemove", onMouseMove);

  // ─── Utility ──────────────────────────────────────────────────────────────

  function tileAt(x, y) {
    const mx = Math.floor(x), my = Math.floor(y);
    if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return "#";
    return MAP[my][mx];
  }

  function isWall(tile) { return tile === "#" || tile in BUILDINGS && tile !== "."; }

  function isSolid(x, y) {
    const t = tileAt(x, y);
    return t === "#";
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function shadedColor(hex, dist) {
    const { r, g, b } = hexToRgb(hex);
    const factor = Math.max(0.05, 1 - dist * 0.18);
    return `rgb(${Math.floor(r*factor)},${Math.floor(g*factor)},${Math.floor(b*factor)})`;
  }

  // ─── DDA Raycasting ───────────────────────────────────────────────────────

  function castRay(rayAngle) {
    const cosA = Math.cos(rayAngle);
    const sinA = Math.sin(rayAngle);

    // DDA setup
    let mapX = Math.floor(player.x);
    let mapY = Math.floor(player.y);

    const deltaDistX = cosA === 0 ? 1e30 : Math.abs(1 / cosA);
    const deltaDistY = sinA === 0 ? 1e30 : Math.abs(1 / sinA);

    let stepX, stepY, sideDistX, sideDistY;

    if (cosA < 0) {
      stepX = -1; sideDistX = (player.x - mapX) * deltaDistX;
    } else {
      stepX = 1;  sideDistX = (mapX + 1 - player.x) * deltaDistX;
    }
    if (sinA < 0) {
      stepY = -1; sideDistY = (player.y - mapY) * deltaDistY;
    } else {
      stepY = 1;  sideDistY = (mapY + 1 - player.y) * deltaDistY;
    }

    let hit = false, side = 0, dist = 0;
    let hitTile = "#";
    let maxSteps = 64;

    while (!hit && maxSteps-- > 0) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      hitTile = tileAt(mapX, mapY);
      if (hitTile !== "." && hitTile !== "") hit = true;
    }

    dist = side === 0
      ? (mapX - player.x + (1 - stepX) / 2) / cosA
      : (mapY - player.y + (1 - stepY) / 2) / sinA;

    return { dist: Math.abs(dist), tile: hitTile, side };
  }

  // ─── 3D Raycasting Render ─────────────────────────────────────────────────

  function render3D() {
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H / 2);
    skyGrad.addColorStop(0,   "#020510");
    skyGrad.addColorStop(0.6, "#050d1f");
    skyGrad.addColorStop(1,   "#0a1428");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H / 2);

    // Floor gradient
    const floorGrad = ctx.createLinearGradient(0, H / 2, 0, H);
    floorGrad.addColorStop(0,   "#050508");
    floorGrad.addColorStop(1,   "#000000");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, H / 2, W, H / 2);

    // Stars in sky
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 80; i++) {
      // Deterministic pseudo-stars based on player angle
      const sx = ((i * 137 + player.angle * 40) % (W * 2) + W * 2) % (W * 2) - W / 2;
      const sy = (i * 73) % (H * 0.45);
      if (sx >= 0 && sx < W) ctx.fillRect(sx, sy, 1, 1);
    }

    // Cast a ray for each screen column
    for (let col = 0; col < W; col++) {
      const rayAngle = player.angle - HALF_FOV + (col / W) * FOV;
      const { dist, tile, side } = castRay(rayAngle);

      // Correct fisheye
      const corrDist = dist * Math.cos(rayAngle - player.angle);
      const wallH = Math.min(H * 2, Math.floor(H / (corrDist + 0.0001)));
      const wallY = Math.floor((H - wallH) / 2);

      // Get wall color
      const bld = BUILDINGS[tile] || BUILDINGS["#"];
      let color = bld.wallColor;

      // Side face is slightly darker
      let wallColor = shadedColor(color, corrDist);
      if (side === 1) {
        // Darken E/W faces
        const { r, g, b } = hexToRgb(wallColor.replace("rgb(","").replace(")","").split(",").map(Number).reduce((acc,v,i)=>{acc[["r","g","b"][i]]=v;return acc},{}));
        const rgb = wallColor.match(/\d+/g).map(Number);
        wallColor = `rgb(${Math.floor(rgb[0]*0.7)},${Math.floor(rgb[1]*0.7)},${Math.floor(rgb[2]*0.7)})`;
      }

      ctx.fillStyle = wallColor;
      ctx.fillRect(col, wallY, 1, wallH);

      // Building highlight — glow at top/bottom edges
      if (tile !== "#" && tile in BUILDINGS) {
        const bldColor = BUILDINGS[tile].color;
        const glowH = Math.max(2, Math.floor(wallH * 0.05));
        ctx.fillStyle = shadedColor(bldColor, corrDist * 0.3);
        ctx.fillRect(col, wallY, 1, glowH);
        ctx.fillRect(col, wallY + wallH - glowH, 1, glowH);
      }
    }

    // ── Minimap ──────────────────────────────────────────────────────────
    const MM_SZ = MINIMAP_SCALE;
    const MM_ROWS = Math.min(9, MAP_H);
    const MM_COLS = Math.min(11, MAP_W);
    const MM_OFF_X = Math.max(0, Math.floor(player.x) - Math.floor(MM_COLS / 2));
    const MM_OFF_Y = Math.max(0, Math.floor(player.y) - Math.floor(MM_ROWS / 2));
    const mmPX = MINIMAP_X, mmPY = MINIMAP_Y;

    // Minimap background
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(mmPX - 2, mmPY - 2, MM_COLS * MM_SZ + 4, MM_ROWS * MM_SZ + 4);

    for (let ry = 0; ry < MM_ROWS; ry++) {
      for (let rx = 0; rx < MM_COLS; rx++) {
        const mx = MM_OFF_X + rx, my = MM_OFF_Y + ry;
        if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) continue;
        const t = MAP[my][mx];
        let c = "#111";
        if (t === "#") c = "#223344";
        else if (t === ".") c = "#0d1117";
        else if (t in BUILDINGS) c = BUILDINGS[t].color + "99";
        ctx.fillStyle = c;
        ctx.fillRect(mmPX + rx * MM_SZ, mmPY + ry * MM_SZ, MM_SZ - 1, MM_SZ - 1);
      }
    }

    // Player dot on minimap
    const pRX = (player.x - MM_OFF_X) * MM_SZ + mmPX;
    const pRY = (player.y - MM_OFF_Y) * MM_SZ + mmPY;
    ctx.fillStyle = "#00ffff";
    ctx.fillRect(pRX - 2, pRY - 2, 5, 5);

    // Player direction arrow
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pRX, pRY);
    ctx.lineTo(
      pRX + Math.cos(player.angle) * MM_SZ * 1.2,
      pRY + Math.sin(player.angle) * MM_SZ * 1.2
    );
    ctx.stroke();

    // ── Crosshair ──────────────────────────────────────────────────────────
    const cx = W / 2, cy = H / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 3, cy);
    ctx.moveTo(cx + 3,  cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 3);
    ctx.moveTo(cx, cy + 3);  ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    // ── Nearby building prompt ──────────────────────────────────────────────
    const near = getNearBuilding();
    if (near) {
      const bld = BUILDINGS[near];
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W / 2 - 120, H - 90, 240, 32);
      ctx.fillStyle = bld.color;
      ctx.font = "bold 13px 'Courier New'";
      ctx.textAlign = "center";
      ctx.fillText(`[E]  Enter ${bld.name}`, W / 2, H - 70);
      ctx.textAlign = "left";
    }
  }

  // ─── Desktop (top-down) Render ────────────────────────────────────────────

  function renderDesktop() {
    ctx.fillStyle = "#060a10";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "#0d1620";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= MAP_W; x++) {
      const px = (W - MAP_W * 20) / 2 + x * 20;
      ctx.beginPath(); ctx.moveTo(px, 60); ctx.lineTo(px, 60 + MAP_H * 20); ctx.stroke();
    }
    for (let y = 0; y <= MAP_H; y++) {
      const py = 60 + y * 20;
      ctx.beginPath(); ctx.moveTo((W - MAP_W * 20) / 2, py); ctx.lineTo((W + MAP_W * 20) / 2, py); ctx.stroke();
    }

    const CELL = 20;
    const originX = (W - MAP_W * CELL) / 2;
    const originY = 60;

    // Draw map
    for (let my = 0; my < MAP_H; my++) {
      for (let mx = 0; mx < MAP_W; mx++) {
        const t = MAP[my][mx];
        const px = originX + mx * CELL;
        const py = originY + my * CELL;

        if (t === "#") {
          ctx.fillStyle = "#1a2535";
          ctx.fillRect(px, py, CELL, CELL);
        } else if (t in BUILDINGS && t !== ".") {
          const bld = BUILDINGS[t];
          ctx.fillStyle = bld.color + "22";
          ctx.fillRect(px, py, CELL, CELL);
          ctx.strokeStyle = bld.color + "88";
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py, CELL, CELL);
          // Label
          ctx.fillStyle = bld.color;
          ctx.font = "bold 10px 'Courier New'";
          ctx.textAlign = "center";
          ctx.fillText(t, px + CELL / 2, py + CELL / 2 + 4);
        } else {
          ctx.fillStyle = "#070a0f";
          ctx.fillRect(px, py, CELL, CELL);
        }
      }
    }

    // Player position
    const ppx = originX + player.x * CELL;
    const ppy = originY + player.y * CELL;
    ctx.fillStyle = "#00ffcc";
    ctx.beginPath();
    ctx.arc(ppx, ppy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Direction line
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ppx, ppy);
    ctx.lineTo(ppx + Math.cos(player.angle) * 16, ppy + Math.sin(player.angle) * 16);
    ctx.stroke();

    // Title
    ctx.fillStyle = "#7ecfff";
    ctx.font = "bold 16px 'Courier New'";
    ctx.textAlign = "center";
    ctx.fillText("ORACLE CITY  ⬡  DESKTOP VIEW  ⬡  [Tab] Walk Mode  [Esc] Exit", W / 2, 36);

    // Legend
    let legendX = 20, legendY = 80;
    ctx.font = "11px 'Courier New'";
    for (const [tile, bld] of Object.entries(BUILDINGS)) {
      if (tile === "#") continue;
      ctx.fillStyle = bld.color;
      ctx.fillText(`${tile} = ${bld.name}`, legendX, legendY);
      legendY += 16;
    }
    ctx.textAlign = "left";
  }

  // ─── Interaction ──────────────────────────────────────────────────────────

  function getNearBuilding() {
    const FAR = 1.8;
    // Check tiles in front of player and at player's feet
    const checks = [
      { dx: Math.cos(player.angle) * 1.2, dy: Math.sin(player.angle) * 1.2 },
      { dx: 0, dy: 0 },
    ];
    for (const { dx, dy } of checks) {
      const t = tileAt(player.x + dx, player.y + dy);
      if (t in BUILDINGS && t !== ".") return t;
    }
    return null;
  }

  function handleInteract() {
    const near = getNearBuilding();
    if (!near) return;
    const bld = BUILDINGS[near];
    // Flash the HUD
    hudCenter.textContent = `► Entering ${bld.name}...`;
    setTimeout(() => {
      showBuildingInfo(near);
    }, 200);
  }

  function showBuildingInfo(tile) {
    const bld = BUILDINGS[tile];
    // Show an info overlay
    const existing = doc.getElementById("city-bld-overlay");
    if (existing) existing.remove();

    const panel = doc.createElement("div");
    panel.id = "city-bld-overlay";
    Object.assign(panel.style, {
      position: "absolute",
      top: "50%", left: "50%",
      transform: "translate(-50%, -50%)",
      background: "#080d14",
      border: `2px solid ${bld.color}`,
      borderRadius: "4px",
      padding: "20px 28px",
      color: bld.color,
      fontFamily: "'Courier New', monospace",
      fontSize: "13px",
      zIndex: "100001",
      minWidth: "320px",
      boxShadow: `0 0 24px ${bld.color}44`,
    });

    const title = doc.createElement("div");
    title.style.cssText = `font-size:16px;font-weight:bold;margin-bottom:12px;border-bottom:1px solid ${bld.color}44;padding-bottom:8px;`;
    title.textContent = `⬡  ${bld.name}`;

    const content = doc.createElement("pre");
    content.style.cssText = "margin:0;line-height:1.6;font-size:12px;color:#aaccdd;";
    content.textContent = getBuildingContent(tile);

    const closeBtn = doc.createElement("button");
    closeBtn.textContent = "[E] Close";
    Object.assign(closeBtn.style, {
      marginTop: "14px",
      background: "transparent",
      border: `1px solid ${bld.color}`,
      color: bld.color,
      fontFamily: "'Courier New', monospace",
      fontSize: "12px",
      padding: "4px 16px",
      cursor: "pointer",
    });
    closeBtn.onclick = () => panel.remove();

    panel.appendChild(title);
    panel.appendChild(content);
    panel.appendChild(closeBtn);
    overlay.appendChild(panel);
  }

  function fmt(n) {
    if (n === undefined || n === null || isNaN(n)) return "N/A";
    if (n >= 1e12) return (n / 1e12).toFixed(2) + "t";
    if (n >= 1e9)  return (n / 1e9).toFixed(2)  + "b";
    if (n >= 1e6)  return (n / 1e6).toFixed(2)  + "m";
    if (n >= 1e3)  return (n / 1e3).toFixed(1)  + "k";
    return n.toFixed(0);
  }

  function getBuildingContent(tile) {
    try {
      switch (tile) {
        case "S": {
          const p = ns.getPlayer();
          return [
            `Cash:       $${fmt(p.money)}`,
            `Hack Lvl:   ${p.skills.hacking}`,
            ``,
            `Run: FinalStonkinton.js for live stock data`,
            `Run: bleedingedgestocktrader.js for adaptive AI`,
          ].join("\n");
        }
        case "H": {
          const p = ns.getPlayer();
          const servers = ns.scan("home").slice(0, 8);
          return [
            `Hacking:  ${p.skills.hacking}`,
            `Karma:    ${p.karma?.toFixed(0) ?? "N/A"}`,
            ``,
            `Known servers: ${servers.join(", ")}`,
            ``,
            `Run: sysadmin.js for HWGW automation`,
          ].join("\n");
        }
        case "G": {
          if (!ns.gang?.inGang()) return "No active gang.\nJoin a faction to start one.";
          const gi = ns.gang.getGangInformation();
          const members = ns.gang.getMemberNames();
          return [
            `Gang:       ${gi.faction}`,
            `Territory:  ${(gi.territory * 100).toFixed(1)}%`,
            `Respect:    ${fmt(gi.respect)}`,
            `Power:      ${fmt(gi.power)}`,
            `Members:    ${members.length}`,
            ``,
            `Run: autogang.js for automation`,
          ].join("\n");
        }
        case "C": {
          if (!ns.corporation?.hasCorporation()) return "No corporation.\nNeed $150b or BN3 to start.";
          const corp = ns.corporation.getCorporation();
          const divs = corp.divisions.slice(0, 4);
          return [
            `Corp:       ${corp.name}`,
            `Revenue:    $${fmt(corp.revenue)}/s`,
            `Profit:     $${fmt(corp.revenue - corp.expenses)}/s`,
            `Funds:      $${fmt(corp.funds)}`,
            `Divisions:  ${divs.join(", ")}`,
            ``,
            `Run: autocorporation.js for automation`,
          ].join("\n");
        }
        case "A": {
          let augLines = ["Augments available via factions."];
          try {
            const factions = ns.getPlayer().factions;
            let count = 0;
            for (const f of factions.slice(0, 3)) {
              const augs = ns.getAugmentationsFromFaction(f).filter(a => !ns.getOwnedAugmentations(true).includes(a));
              count += augs.length;
            }
            augLines = [`Unowned augments: ~${count}`, `Factions: ${ns.getPlayer().factions.slice(0,4).join(", ")}`];
          } catch {}
          return augLines.join("\n") + "\n\nRun: sysadmin.js to track augments";
        }
        case "B": {
          const p = ns.getPlayer();
          return [
            `Cash:        $${fmt(p.money)}`,
            `Total time:  ${p.totalPlaytime ? Math.floor(p.totalPlaytime / 3600000) + "h" : "N/A"}`,
            ``,
            `Run: hub.js for full portfolio overview`,
          ].join("\n");
        }
        case "T": return "Training Facility\n\nWork out at the gym to improve combat stats.\nFight in gang wars to level up.";
        case "X": return "Travel Terminal\n\nVisit other cities:\n  Aevum, Chongqing, Sector-12,\n  New Tokyo, Ishima, Volhaven\n\nns.singularity.travelToCity(city)";
        default: return `${BUILDINGS[tile]?.name ?? "Unknown"}\n\nNo data available.`;
      }
    } catch (err) {
      return `Could not load data:\n${err.message}`;
    }
  }

  // ─── HUD update ───────────────────────────────────────────────────────────

  let tick = 0;

  function updateHUD() {
    tick++;
    const near = getNearBuilding();
    const nearName = near ? BUILDINGS[near].name : "Oracle City Streets";

    try {
      const p = ns.getPlayer();
      hudLeft.textContent   = `$${fmt(p.money)}  ⬡  Hack:${p.skills.hacking}  ⬡  ${p.city}`;
    } catch {
      hudLeft.textContent   = "Oracle City";
    }

    hudCenter.textContent = near
      ? `◈ ${nearName}  [E] Enter`
      : `Oracle City — ${mode === "walk" ? "Walk Mode" : "Desktop Mode"}`;

    hudRight.textContent  = `[Tab] Mode  [Esc] Exit  ⬡  T:${tick}`;
  }

  // ─── Movement + collision ─────────────────────────────────────────────────

  function movePlayer() {
    if (mode !== "walk") return;

    let nx = player.x, ny = player.y;
    const spd = keys["Shift"] ? MOVE_SPD * 1.8 : MOVE_SPD;

    if (keys["w"] || keys["ArrowUp"]) {
      nx += Math.cos(player.angle) * spd;
      ny += Math.sin(player.angle) * spd;
    }
    if (keys["s"] || keys["ArrowDown"]) {
      nx -= Math.cos(player.angle) * spd;
      ny -= Math.sin(player.angle) * spd;
    }
    if (keys["a"]) {
      nx += Math.cos(player.angle - Math.PI / 2) * spd;
      ny += Math.sin(player.angle - Math.PI / 2) * spd;
    }
    if (keys["d"]) {
      nx += Math.cos(player.angle + Math.PI / 2) * spd;
      ny += Math.sin(player.angle + Math.PI / 2) * spd;
    }
    if (keys["ArrowLeft"])  player.angle -= ROT_SPD;
    if (keys["ArrowRight"]) player.angle += ROT_SPD;

    // Sliding collision
    const MARGIN = 0.25;
    if (!isSolid(nx, player.y - MARGIN) && !isSolid(nx, player.y + MARGIN)) player.x = nx;
    if (!isSolid(player.x - MARGIN, ny) && !isSolid(player.x + MARGIN, ny)) player.y = ny;
  }

  // ─── Main loop ────────────────────────────────────────────────────────────

  while (running) {
    movePlayer();

    if (mode === "walk") {
      render3D();
    } else {
      renderDesktop();
    }

    updateHUD();
    await ns.sleep(16); // ~60fps
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  doc.removeEventListener("keydown", onKeyDown);
  doc.removeEventListener("keyup",   onKeyUp);
  doc.removeEventListener("mouseup", onMouseUp);
  doc.removeEventListener("mousemove", onMouseMove);
  if (doc.exitPointerLock) doc.exitPointerLock();
  overlay.remove();
  ns.tprint("Oracle City engine stopped.");
}

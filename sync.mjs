// Bitburner Remote File API sync script
// Pushes all .js files from this directory into the game over WebSocket

import { readFileSync, readdirSync } from "fs";
import { WebSocket } from "ws";

const TOKEN = "iNNM1rWe8W1WgXyHTakrh0swOr8mVzoM2XxjClkA03NlYh2zBTjypq";
const PORT  = 12525;
const BASE  = "/home/luke/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/Bitburner";

const FILES = [
  // top-level scripts
  ...readdirSync(BASE)
    .filter(f => f.endsWith(".js"))
    .map(f => ({ disk: `${BASE}/${f}`, game: `/${f}` })),
  // lib/
  ...readdirSync(`${BASE}/lib`)
    .filter(f => f.endsWith(".js"))
    .map(f => ({ disk: `${BASE}/lib/${f}`, game: `/lib/${f}` })),
];

const ws = new WebSocket(`ws://localhost:${PORT}`);

ws.on("open", () => {
  console.log(`Connected — pushing ${FILES.length} files...`);

  for (const { disk, game } of FILES) {
    const code = readFileSync(disk, "utf8");
    ws.send(JSON.stringify({ filename: game, code, server: "home" }));
    console.log(`  ✓  ${game}`);
  }

  ws.close();
  console.log("Done.");
});

ws.on("message", d => {
  try {
    const msg = JSON.parse(d);
    if (msg.error) console.error("Server error:", msg.error);
  } catch {}
});

ws.on("error", err => {
  console.error("Connection failed:", err.message);
  console.error("Make sure Remote File API is enabled in Bitburner Options.");
});

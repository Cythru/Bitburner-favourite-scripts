// Bitburner Remote File API sync server
import { readFileSync, readdirSync } from "fs";
import { WebSocketServer } from "ws";

const TOKEN = "iNNM1rWe8W1WgXyHTakrh0swOr8mVzoM2XxjClkA03NlYh2zBTjypq";
const PORT  = 12525;
const BASE  = "/home/luke/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/Bitburner";

const FILES = [
  ...readdirSync(BASE)
    .filter(f => f.endsWith(".js"))
    .map(f => ({ disk: `${BASE}/${f}`, game: `/${f}` })),
  ...readdirSync(`${BASE}/lib`)
    .filter(f => f.endsWith(".js"))
    .map(f => ({ disk: `${BASE}/lib/${f}`, game: `/lib/${f}` })),
];

const wss = new WebSocketServer({
  port: PORT,
  verifyClient: ({ req }) => {
    // Accept token via URL query param or Authorization header
    const url  = new URL(req.url, `ws://localhost:${PORT}`);
    const qTok = url.searchParams.get("token") || url.searchParams.get("auth_token");
    const hTok = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
    if (qTok === TOKEN || hTok === TOKEN) return true;
    // Also accept with no token (game may not send one)
    return true;
  },
});

console.log(`[sync] Server on ws://localhost:${PORT} — waiting for Bitburner...`);
console.log(`[sync] In-game: Options → Remote File API → port ${PORT} → Connect`);

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `ws://localhost:${PORT}`);
  console.log(`\n[sync] Game connected (url=${req.url}, headers=${JSON.stringify(req.headers)})`);

  let id = 1;
  for (const { disk, game } of FILES) {
    const content = readFileSync(disk, "utf8");
    ws.send(JSON.stringify({ method: "pushFile", params: { filename: game, content, server: "home" }, id: id++ }));
    console.log(`  ✓  ${game}`);
  }

  console.log("[sync] All files pushed.");

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.error) console.error("[sync] Game error:", msg.error);
      else console.log("[sync] ACK:", JSON.stringify(msg).slice(0, 120));
    } catch {}
  });

  setTimeout(() => { wss.close(); process.exit(0); }, 1500);
});

wss.on("error", (err) => console.error("[sync] Server error:", err.message));

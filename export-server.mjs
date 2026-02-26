// Receives proven.txt data POST'd from FinalStonkinton on graduation.
// Run: node export-server.mjs
// Saves to /tmp/bb-proven.json — read it to see which strategy won.
import { createServer } from "http";
import { writeFileSync } from "fs";

const PORT = 12526;
const OUT  = "/tmp/bb-proven.json";

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/proven") {
    let body = "";
    req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        writeFileSync(OUT, JSON.stringify(data, null, 2));
        console.log(`[export] Saved ${data.length} graduated strat(s) → ${OUT}`);
        data.forEach(s => console.log(`  ${s.name}: P/L ${(s.score.pnl/1e6).toFixed(2)}m  WR ${(s.score.winRate*100).toFixed(0)}%  ${s.score.trades}T`));
        res.writeHead(200); res.end("ok");
      } catch(e) {
        console.error("[export] Parse error:", e.message);
        res.writeHead(400); res.end("bad json");
      }
    });
  } else {
    res.writeHead(404); res.end();
  }
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`[export] Listening on http://127.0.0.1:${PORT} — waiting for graduation event...`)
);

#!/usr/bin/env node
/**
 * Serviço interno: aprova pairing clawg-ui via CLI OpenClaw (mesmo volume ~/.openclaw).
 * POST /pairing/approve  { "channel": "clawg-ui", "code": "XXXXXXXX" }
 * Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
 */
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PAIRING_HELPER_PORT ?? 18790);
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? "";

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function authOk(req) {
  if (!TOKEN) return true;
  const h = req.headers.authorization ?? "";
  return h === `Bearer ${TOKEN}`;
}

const server = http.createServer(async (req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "GET" && req.url === "/health") {
    send(200, { ok: true });
    return;
  }

  if (req.method !== "POST" || req.url !== "/pairing/approve") {
    send(404, { error: "not_found" });
    return;
  }

  if (!authOk(req)) {
    send(401, { error: "unauthorized" });
    return;
  }

  try {
    const body = await readJson(req);
    const channel = String(body.channel ?? "clawg-ui").trim();
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!code) {
      send(400, { error: "missing_code" });
      return;
    }

    await execFileAsync(
      "openclaw",
      ["pairing", "approve", "--channel", channel, code],
      {
        env: {
          ...process.env,
          XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? "/home/node/.openclaw",
        },
        timeout: 30_000,
      },
    );

    send(200, { ok: true, channel, code });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pairing-helper] approve failed:", msg);
    send(500, { error: "approve_failed", message: msg.slice(0, 500) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[pairing-helper] listening on :${PORT}`);
});

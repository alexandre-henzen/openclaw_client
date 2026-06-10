import http from "node:http";
import type { KorpGatewayConfig } from "./config.js";
import { createMcpProxyHandler } from "./mcp-proxy.js";
import type { KorpTokenManager } from "./token-manager.js";

export function createGatewayServer(
  cfg: KorpGatewayConfig,
  tokens: KorpTokenManager,
): http.Server {
  const upstream = new URL(cfg.mcpUpstreamUrl);
  const proxy = createMcpProxyHandler({
    upstream,
    getAccessToken: () => tokens.getAccessToken(),
  });

  return http.createServer((req, res) => {
    const url = req.url ?? "/";

    if (req.method === "GET" && (url === "/health" || url === "/healthz")) {
      const snap = tokens.getSnapshot();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "korp-mcp-gateway",
          token: snap,
        }),
      );
      return;
    }

    if (req.method === "GET" && url === "/ready") {
      const snap = tokens.getSnapshot();
      if (!snap.ready) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, token: snap }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, token: snap }));
      return;
    }

    if (url === "/mcp" || url.startsWith("/mcp/")) {
      proxy(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
}

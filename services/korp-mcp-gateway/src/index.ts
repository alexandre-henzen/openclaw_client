import { loadConfig } from "./config.js";
import { ensureOpenClawKorpMcpConfig } from "./openclaw-config.js";
import { createGatewayServer } from "./server.js";
import { KorpTokenManager } from "./token-manager.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const tokens = new KorpTokenManager(cfg);

  if (cfg.openclawConfigPath) {
    const { changed } = await ensureOpenClawKorpMcpConfig(
      cfg.openclawConfigPath,
      cfg.openclawProxyPublicUrl,
    );
    console.info(
      `[korp-mcp-gateway] openclaw config ${cfg.openclawConfigPath} ${changed ? "updated" : "unchanged"} → ${cfg.openclawProxyPublicUrl}/mcp`,
    );
  }

  await tokens.start();

  const server = createGatewayServer(cfg, tokens);
  await new Promise<void>((resolve, reject) => {
    server.listen(cfg.port, cfg.host, () => {
      console.info(
        `[korp-mcp-gateway] listening on http://${cfg.host}:${cfg.port}/mcp → ${cfg.mcpUpstreamUrl}`,
      );
      resolve();
    });
    server.on("error", reject);
  });

  const shutdown = () => {
    tokens.stop();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[korp-mcp-gateway] fatal:", err);
  process.exit(1);
});

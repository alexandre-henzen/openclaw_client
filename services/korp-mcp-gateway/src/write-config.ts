import { loadConfig } from "./config.js";
import { ensureOpenClawKorpMcpConfig } from "./openclaw-config.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const configPath =
    cfg.openclawConfigPath ??
    process.env.OPENCLAW_CONFIG_PATH?.trim() ??
    "/home/node/.openclaw/openclaw.json";

  const { changed } = await ensureOpenClawKorpMcpConfig(
    configPath,
    cfg.openclawProxyPublicUrl,
  );
  console.info(
    `[korp-mcp-gateway] write-config ${configPath} ${changed ? "updated" : "ok"}`,
  );
}

main().catch((err) => {
  console.error("[korp-mcp-gateway] write-config failed:", err);
  process.exit(1);
});

export type KorpGatewayConfig = {
  port: number;
  host: string;
  oauth: {
    clientId: string;
    clientSecret: string;
    tokenUrl: string;
    scope: string;
  };
  mcpUpstreamUrl: string;
  /** Renovar quando faltar menos que N ms para expirar (default 120s). */
  refreshSkewMs: number;
  /** Intervalo mínimo entre refreshes proativos (default 60s). */
  refreshIntervalMs: number;
  openclawConfigPath: string | null;
  openclawProxyPublicUrl: string;
};

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(): KorpGatewayConfig {
  return {
    port: optionalInt("KORP_MCP_GATEWAY_PORT", 8787),
    host: process.env.KORP_MCP_GATEWAY_HOST?.trim() || "0.0.0.0",
    oauth: {
      clientId: required("KORP_OAUTH_CLIENT_ID"),
      clientSecret: required("KORP_OAUTH_CLIENT_SECRET"),
      tokenUrl:
        process.env.KORP_OAUTH_TOKEN_URL?.trim() ||
        "https://gateway.korp.com.br/oauth/connect/token",
      scope:
        process.env.KORP_OAUTH_SCOPE?.trim() ||
        "mcp:datawarehouse-elt mcp:datawarehouse-projetos",
    },
    mcpUpstreamUrl:
      process.env.KORP_MCP_UPSTREAM_URL?.trim() ||
      process.env.KORP_MCP_URL?.trim() ||
      "https://api.korp.com.br/bi/v1/mcp",
    refreshSkewMs: optionalInt("KORP_TOKEN_REFRESH_SKEW_MS", 120_000),
    refreshIntervalMs: optionalInt("KORP_TOKEN_REFRESH_INTERVAL_MS", 60_000),
    openclawConfigPath: process.env.OPENCLAW_CONFIG_PATH?.trim() || null,
    openclawProxyPublicUrl:
      process.env.KORP_MCP_PROXY_URL?.trim() || "http://korp-mcp-gateway:8787",
  };
}

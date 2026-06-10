import fs from "node:fs/promises";
import path from "node:path";

export type OpenClawConfig = {
  mcp?: {
    servers?: Record<
      string,
      {
        url?: string;
        transport?: string;
        headers?: Record<string, string>;
        command?: string;
        args?: string[];
      }
    >;
  };
  tools?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Tools que executam ou gravam no container do gateway (fora do E2B / artifact tray).
 * Não bloqueia: read, memory_*, sessions_*, korp-bi__*, run_code, web_*.
 * OpenClaw continua operando pairing, cron, gateway RPC, etc.
 */
export const COPILOTKIT_HOST_EXEC_TOOL_DENY = [
  "group:runtime",
  "write",
  "edit",
  "apply_patch",
  "canvas",
  "nodes",
  /** Evita subagentes sem run_code / korp-bi (ERP chat executa no agente principal). */
  "sessions_spawn",
  "subagents",
  /** Gráficos devem ir para run_code (E2B), não jobs cron inventados pelo modelo. */
  "cron",
] as const;

/**
 * `tools.profile: "coding"` não inclui `group:plugins`. Sem isto, o plugin
 * `openclaw-run-code-sandbox` carrega mas a tool `run_code` não entra no
 * registry do agente (clawg-ui → "Tool run_code not found").
 */
export const COPILOTKIT_TOOL_ALSO_ALLOW = [
  "run_code",
  "group:plugins",
  "bundle-mcp",
] as const;

export function buildKorpBiMcpEntry(proxyBaseUrl: string): {
  url: string;
  transport: "streamable-http";
} {
  const base = proxyBaseUrl.replace(/\/$/, "");
  return {
    url: `${base}/mcp`,
    transport: "streamable-http",
  };
}

/**
 * Grava mcp.servers.korp-bi apontando para o proxy local, sem Bearer no JSON.
 * Evita hot-reload de Authorization e corrida com bundle-mcp.
 */
export async function ensureOpenClawKorpMcpConfig(
  configPath: string,
  proxyBaseUrl: string,
): Promise<{ changed: boolean }> {
  const abs = path.resolve(configPath);
  const raw = await fs.readFile(abs, "utf8");
  const config = JSON.parse(raw) as OpenClawConfig;

  config.mcp ??= {};
  config.mcp.servers ??= {};

  const next = buildKorpBiMcpEntry(proxyBaseUrl);
  const prev = config.mcp.servers["korp-bi"];
  const mcpChanged =
    !prev ||
    prev.url !== next.url ||
    prev.transport !== next.transport ||
    Boolean(prev.headers?.Authorization);

  config.mcp.servers["korp-bi"] = next;

  const toolsChanged = ensureCopilotKitToolsPolicy(config);
  const changed = mcpChanged || toolsChanged;

  if (changed) {
    await fs.writeFile(abs, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  return { changed };
}

/** Perfil coding + deny de execução no host; preserva MCP/plugins e run_code (E2B). */
export function ensureCopilotKitToolsPolicy(config: OpenClawConfig): boolean {
  if (!config.tools || typeof config.tools !== "object") {
    config.tools = { profile: "coding" };
  }
  const tools = config.tools as {
    profile?: string;
    allow?: unknown;
    deny?: string[];
    alsoAllow?: string[];
  };

  let changed = false;

  if (!tools.profile && !tools.allow) {
    tools.profile = "coding";
    changed = true;
  }

  const denyLower = new Set(
    (Array.isArray(tools.deny) ? tools.deny : []).map((d) => d.toLowerCase()),
  );
  for (const entry of COPILOTKIT_HOST_EXEC_TOOL_DENY) {
    if (!denyLower.has(entry.toLowerCase())) {
      denyLower.add(entry.toLowerCase());
      changed = true;
    }
  }
  if (changed) {
    tools.deny = [...denyLower];
  }

  const alsoLower = new Set(
    (Array.isArray(tools.alsoAllow) ? tools.alsoAllow : []).map((a) =>
      a.toLowerCase(),
    ),
  );
  for (const entry of COPILOTKIT_TOOL_ALSO_ALLOW) {
    if (!alsoLower.has(entry.toLowerCase())) {
      alsoLower.add(entry.toLowerCase());
      changed = true;
    }
  }
  if (changed) {
    tools.alsoAllow = [...alsoLower];
  }

  return changed;
}

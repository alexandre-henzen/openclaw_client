import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  COPILOTKIT_HOST_EXEC_TOOL_DENY,
  COPILOTKIT_TOOL_ALSO_ALLOW,
  ensureCopilotKitToolsPolicy,
  ensureOpenClawKorpMcpConfig,
} from "./openclaw-config.js";

const tmpFiles: string[] = [];

afterEach(async () => {
  await Promise.all(tmpFiles.map((f) => fs.unlink(f).catch(() => {})));
  tmpFiles.length = 0;
});

describe("ensureOpenClawKorpMcpConfig", () => {
  it("strips Authorization and points to proxy", async () => {
    const file = path.join(os.tmpdir(), `openclaw-${Date.now()}.json`);
    tmpFiles.push(file);
    await fs.writeFile(
      file,
      JSON.stringify({
        mcp: {
          servers: {
            "korp-bi": {
              url: "https://api.korp.com.br/bi/v1/mcp",
              transport: "streamable-http",
              headers: { Authorization: "Bearer old" },
            },
          },
        },
      }),
    );

    const { changed } = await ensureOpenClawKorpMcpConfig(
      file,
      "http://korp-mcp-gateway:8787",
    );
    expect(changed).toBe(true);

    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as {
      mcp: { servers: Record<string, { url: string; headers?: unknown }> };
    };
    expect(parsed.mcp.servers["korp-bi"].url).toBe(
      "http://korp-mcp-gateway:8787/mcp",
    );
    expect(parsed.mcp.servers["korp-bi"].headers).toBeUndefined();

    const tools = parsed as {
      tools?: { profile?: string; deny?: string[]; alsoAllow?: string[] };
    };
    expect(tools.tools?.profile).toBe("coding");
    for (const d of COPILOTKIT_HOST_EXEC_TOOL_DENY) {
      expect(tools.tools?.deny?.map((x) => x.toLowerCase())).toContain(
        d.toLowerCase(),
      );
    }
    for (const a of COPILOTKIT_TOOL_ALSO_ALLOW) {
      expect(tools.tools?.alsoAllow?.map((x) => x.toLowerCase())).toContain(
        a.toLowerCase(),
      );
    }
  });
});

describe("ensureCopilotKitToolsPolicy", () => {
  it("merges deny list without dropping existing entries", () => {
    const config = {
      tools: { profile: "coding", deny: ["browser"] },
    };
    expect(ensureCopilotKitToolsPolicy(config)).toBe(true);
    const deny = (config.tools as { deny: string[] }).deny.map((d) =>
      d.toLowerCase(),
    );
    expect(deny).toContain("browser");
    expect(deny).toContain("group:runtime");
    expect(deny).toContain("write");
    expect(deny).toContain("sessions_spawn");
    const also = (
      config.tools as unknown as { alsoAllow: string[] }
    ).alsoAllow.map((a) => a.toLowerCase());
    expect(also).toContain("run_code");
    expect(also).toContain("group:plugins");
  });
});

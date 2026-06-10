import { describe, expect, it } from "vitest";
import entry, { resolveRuntimeConfig } from "./index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import type { PluginConfig } from "./types.js";

describe("openclaw-run-code-sandbox", () => {
  it("declares run_code tool metadata", () => {
    expect(getToolPluginMetadata(entry)?.tools.map((tool) => tool.name)).toEqual([
      "run_code",
    ]);
  });

  it("lets .env/runtime variables select e2b over schema defaults", () => {
    const previousBackend = process.env.SANDBOX_BACKEND;
    const previousTimeout = process.env.E2B_SANDBOX_TIMEOUT_MS;
    const previousAllowNetwork = process.env.SANDBOX_ALLOW_NETWORK;
    process.env.SANDBOX_BACKEND = "e2b";
    process.env.E2B_SANDBOX_TIMEOUT_MS = "300000";
    process.env.SANDBOX_ALLOW_NETWORK = "0";

    try {
      const config: PluginConfig = {
        SANDBOX_BACKEND: "piston",
        PISTON_URL: "http://piston:2000/api/v2",
        PISTON_RUN_TIMEOUT_MS: 30_000,
        E2B_API_KEY: "",
        E2B_TEMPLATE: "",
        E2B_SANDBOX_TIMEOUT_MS: 60_000,
        SANDBOX_NETWORK: "none",
        SANDBOX_ALLOW_NETWORK: true,
      };

      expect(resolveRuntimeConfig(config)).toMatchObject({
        SANDBOX_BACKEND: "e2b",
        E2B_SANDBOX_TIMEOUT_MS: 300_000,
        SANDBOX_ALLOW_NETWORK: false,
      });
    } finally {
      restoreEnv("SANDBOX_BACKEND", previousBackend);
      restoreEnv("E2B_SANDBOX_TIMEOUT_MS", previousTimeout);
      restoreEnv("SANDBOX_ALLOW_NETWORK", previousAllowNetwork);
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

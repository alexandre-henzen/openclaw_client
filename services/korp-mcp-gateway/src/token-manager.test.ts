import { describe, expect, it, vi } from "vitest";
import type { KorpGatewayConfig } from "./config.js";
import { KorpTokenManager } from "./token-manager.js";

function mockCfg(): KorpGatewayConfig {
  return {
    port: 8787,
    host: "127.0.0.1",
    oauth: {
      clientId: "id",
      clientSecret: "secret",
      tokenUrl: "https://auth.example/token",
      scope: "mcp:test",
    },
    mcpUpstreamUrl: "https://api.example/mcp",
    refreshSkewMs: 60_000,
    refreshIntervalMs: 999_999,
    openclawConfigPath: null,
    openclawProxyPublicUrl: "http://localhost:8787",
  };
}

describe("KorpTokenManager", () => {
  it("refreshes and returns access token", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: "tok_a",
          expires_in: 900,
        }),
    })) as unknown as typeof fetch;

    const mgr = new KorpTokenManager(mockCfg(), fetchMock);
    await mgr.start();
    const t1 = await mgr.getAccessToken();
    expect(t1).toBe("tok_a");
    expect(mgr.getSnapshot().ready).toBe(true);
    mgr.stop();
  });

  it("serializes concurrent refresh", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: `tok_${calls}`, expires_in: 900 }),
      };
    }) as unknown as typeof fetch;

    const mgr = new KorpTokenManager(mockCfg(), fetchMock);
    const [a, b] = await Promise.all([mgr.getAccessToken(), mgr.getAccessToken()]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
});

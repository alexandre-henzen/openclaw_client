import { describe, expect, it } from "vitest";
import { resolveSandboxBackend } from "../../src/resolver.js";
import { PistonBackend } from "../../src/backends/piston.js";
import { E2BBackend } from "../../src/backends/e2b.js";
import type { PluginConfig } from "../../src/types.js";

function cfg(over: Partial<PluginConfig> = {}): PluginConfig {
  return {
    SANDBOX_BACKEND: "piston",
    PISTON_URL: "http://piston:2000/api/v2",
    PISTON_RUN_TIMEOUT_MS: 30_000,
    E2B_API_KEY: "e2b_test_key",
    E2B_TEMPLATE: "",
    E2B_SANDBOX_TIMEOUT_MS: 300_000,
    SANDBOX_NETWORK: "none",
    SANDBOX_ALLOW_NETWORK: false,
    ...over,
  };
}

describe("resolveSandboxBackend", () => {
  it("returns a PistonBackend for SANDBOX_BACKEND=piston", () => {
    const b = resolveSandboxBackend(cfg());
    expect(b).toBeInstanceOf(PistonBackend);
    expect(b.name).toBe("piston");
  });

  it("returns an E2BBackend for SANDBOX_BACKEND=e2b", () => {
    const b = resolveSandboxBackend(cfg({ SANDBOX_BACKEND: "e2b" }));
    expect(b).toBeInstanceOf(E2BBackend);
    expect(b.name).toBe("e2b");
  });

  it("throws backend_not_implemented for docker", () => {
    expect(() => resolveSandboxBackend(cfg({ SANDBOX_BACKEND: "docker" }))).toThrow(
      /backend_not_implemented:docker/,
    );
  });

  it("throws backend_not_implemented for daytona-oss", () => {
    expect(() => resolveSandboxBackend(cfg({ SANDBOX_BACKEND: "daytona-oss" }))).toThrow(
      /backend_not_implemented:daytona-oss/,
    );
  });

  it("throws invalid_sandbox_backend for unknown values", () => {
    expect(() =>
      // @ts-expect-error — intentional invalid value
      resolveSandboxBackend(cfg({ SANDBOX_BACKEND: "lambda" })),
    ).toThrow(/invalid_sandbox_backend:lambda/);
  });
});

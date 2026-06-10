import { describe, expect, it } from "vitest";
import entry from "../../src/index.js";
import { E2BBackend } from "../../src/backends/e2b.js";
import type { PluginConfig, SandboxExecRequest, SandboxExecResult } from "../../src/types.js";

const E2B_API_KEY = process.env.E2B_API_KEY ?? "";

const available = E2B_API_KEY.trim().length > 0;
if (!available) {
  // eslint-disable-next-line no-console
  console.warn("[skip] E2B_API_KEY is not set. Provide a real key to run E2B integration tests.");
}

function newBackend(): E2BBackend {
  return new E2BBackend({
    apiKey: E2B_API_KEY,
    template: process.env.E2B_TEMPLATE ?? "",
    sandboxTimeoutMs: Number(process.env.E2B_SANDBOX_TIMEOUT_MS ?? 300_000),
  });
}

function baseReq(over: Partial<SandboxExecRequest> = {}): SandboxExecRequest {
  return {
    runId: `run_${Math.random().toString(36).slice(2, 10)}`,
    language: "python",
    source: "print('hello')\n",
    files: [],
    collectOutputs: [],
    timeoutMs: 10_000,
    networkAllowed: false,
    ...over,
  };
}

describe("E2BBackend (live)", () => {
  it.skipIf(!available)("runs python: print hello", async () => {
    const r = await newBackend().exec(baseReq({ language: "python", source: "print('hello')\n" }));
    assertOk(r);
    expect(r.status).toBe("ok");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hello");
    expect(r.backend).toBe("e2b");
    expect(r.sourceSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  }, 60_000);

  it.skipIf(!available)("runs node: console.log hello", async () => {
    const r = await newBackend().exec(
      baseReq({ language: "node", source: "console.log('hello')\n" }),
    );
    assertOk(r);
    expect(r.status).toBe("ok");
    expect(r.stdout).toContain("hello");
  }, 60_000);

  it.skipIf(!available)("extracts emitted files with python helper", async () => {
    const r = await newBackend().exec(
      baseReq({
        language: "python",
        source: "emit_file('out/report.html', '<h1>E2B</h1>')\nprint('done')\n",
      }),
    );
    assertOk(r);
    expect(r.status).toBe("ok");
    expect(r.stdout).toContain("done");
    expect(r.files).toHaveLength(1);
    expect(r.files[0]!.path).toBe("out/report.html");
    expect(r.files[0]!.text).toBe("<h1>E2B</h1>");
  }, 60_000);

  it.skipIf(!available)("makes input files available from the workdir", async () => {
    const r = await newBackend().exec(
      baseReq({
        language: "python",
        source: "print(open('data/name.txt').read())\n",
        files: [{ path: "data/name.txt", content: "openclaw" }],
      }),
    );
    assertOk(r);
    expect(r.status).toBe("ok");
    expect(r.stdout).toContain("openclaw");
  }, 60_000);

  it.skipIf(!available)(
    "emits CSV larger than legacy 512 KiB cap without file_truncated",
    async () => {
      const r = await newBackend().exec(
        baseReq({
          timeoutMs: 120_000,
          source: [
            "n = 55000",
            'csv = "id,val\\n" + "".join(f"{i},{i}\\n" for i in range(n))',
            'emit_file("out/export.csv", csv)',
            'print("bytes", len(csv))',
          ].join("\n"),
        }),
      );
      assertOk(r);
      expect(r.diagnostics.some((d) => d.startsWith("file_truncated"))).toBe(false);
      expect(r.files).toHaveLength(1);
      const f = r.files[0]!;
      expect(f.path).toBe("out/export.csv");
      expect(f.sizeBytes).toBeGreaterThan(512 * 1024);
      expect(f.contentBase64 ?? f.text).toBeTruthy();
    },
    180_000,
  );

  it.skipIf(!available)("uses E2B through the plugin entrypoint when env overrides schema defaults", async () => {
    const previousBackend = process.env.SANDBOX_BACKEND;
    const previousKey = process.env.E2B_API_KEY;
    process.env.SANDBOX_BACKEND = "e2b";
    process.env.E2B_API_KEY = E2B_API_KEY;

    try {
      const r = await executeRunCodeTool(defaultPistonPluginConfig(), {
        language: "python",
        source: "print('plugin-e2b')\n",
        timeoutMs: 10_000,
      });

      assertOk(r);
      expect(r.backend).toBe("e2b");
      expect(r.stdout).toContain("plugin-e2b");
    } finally {
      restoreEnv("SANDBOX_BACKEND", previousBackend);
      restoreEnv("E2B_API_KEY", previousKey);
    }
  }, 60_000);
});

async function executeRunCodeTool(
  pluginConfig: PluginConfig,
  params: { language: "python" | "node" | "bash"; source: string; timeoutMs?: number },
): Promise<SandboxExecResult> {
  let registeredTool: { execute: (...args: unknown[]) => Promise<{ details: SandboxExecResult }> } | null = null;
  entry.register({
    pluginConfig,
    registerTool(tool: unknown) {
      registeredTool = tool as typeof registeredTool;
    },
  } as never);

  if (!registeredTool) throw new Error("run_code tool was not registered");
  const result = await registeredTool.execute("tool-e2b-live", params, undefined, undefined);
  return result.details;
}

function defaultPistonPluginConfig(): PluginConfig {
  return {
    SANDBOX_BACKEND: "piston",
    PISTON_URL: "http://piston:2000/api/v2",
    PISTON_RUN_TIMEOUT_MS: 30_000,
    E2B_API_KEY: "",
    E2B_TEMPLATE: "",
    E2B_SANDBOX_TIMEOUT_MS: 300_000,
    SANDBOX_NETWORK: "none",
    SANDBOX_ALLOW_NETWORK: false,
  };
}

function assertOk(result: SandboxExecResult): void {
  if (result.status === "ok") return;
  throw new Error(
    `E2B run failed: ${JSON.stringify(
      {
        status: result.status,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        diagnostics: result.diagnostics,
      },
      null,
      2,
    )}`,
  );
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
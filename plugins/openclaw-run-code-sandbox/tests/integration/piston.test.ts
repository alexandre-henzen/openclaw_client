import { describe, beforeAll, expect, it } from "vitest";
import { PistonBackend } from "../../src/backends/piston.js";
import type { SandboxExecRequest } from "../../src/types.js";

const PISTON_URL = process.env.PISTON_URL ?? "http://127.0.0.1:2002/api/v2";

async function probe(): Promise<boolean> {
  try {
    const r = await fetch(`${PISTON_URL}/runtimes`, {
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Top-level await so skipIf evaluates with the real value at registration time.
const available = await probe();
if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    `[skip] Piston not reachable at ${PISTON_URL}. Start it via 'docker compose up -d piston'.`,
  );
}

function newBackend(): PistonBackend {
  return new PistonBackend({ baseUrl: PISTON_URL, runTimeoutMs: 30_000 });
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

describe("PistonBackend (live)", () => {
  it.skipIf(!available)("healthcheck reports ok with runtime count", async () => {
    const h = await newBackend().healthcheck();
    expect(h.ok).toBe(true);
    expect(h.detail).toMatch(/\d+ runtimes/);
  });

  it.skipIf(!available)("runs python: print hello", async () => {
    const r = await newBackend().exec(baseReq({ language: "python", source: "print('hello')\n" }));
    expect(r.status).toBe("ok");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("hello\n");
    expect(r.stderr).toBe("");
    expect(r.files).toHaveLength(0);
    expect(r.backend).toBe("piston");
    expect(r.language).toBe("python");
    expect(r.sourceSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.skipIf(!available)("runs node: console.log hello", async () => {
    const r = await newBackend().exec(
      baseReq({ language: "node", source: "console.log('hello')\n" }),
    );
    expect(r.status).toBe("ok");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("hello\n");
  });

  it.skipIf(!available)("runs bash: echo hello", async () => {
    const r = await newBackend().exec(
      baseReq({ language: "bash", source: "echo hello\n" }),
    );
    expect(r.status).toBe("ok");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("hello\n");
  });

  it.skipIf(!available)(
    "reports timeout status for infinite python loop",
    async () => {
      const t0 = Date.now();
      const r = await newBackend().exec(
        baseReq({
          language: "python",
          source: "while True:\n    pass\n",
          timeoutMs: 1500,
        }),
      );
      const wall = Date.now() - t0;
      expect(r.status).toBe("timeout");
      expect(wall).toBeGreaterThanOrEqual(1300);
      expect(wall).toBeLessThan(7000);
    },
    20_000,
  );

  it.skipIf(!available)(
    "extracts files emitted via emit_file() (python prelude)",
    async () => {
      const r = await newBackend().exec(
        baseReq({
          language: "python",
          source: "emit_file('out/chart.html', '<h1>Hi</h1>')\nprint('done')\n",
        }),
      );
      expect(r.status).toBe("ok");
      expect(r.stdout).toBe("done\n");
      expect(r.files).toHaveLength(1);
      const f = r.files[0]!;
      expect(f.path).toBe("out/chart.html");
      expect(f.mimeType).toBe("text/html");
      expect(f.text).toBe("<h1>Hi</h1>");
      expect(f.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    },
  );

  it.skipIf(!available)(
    "extracts files emitted via emitFile() (node prelude)",
    async () => {
      const r = await newBackend().exec(
        baseReq({
          language: "node",
          source:
            "emitFile('out/note.txt', 'hi from node');\nconsole.log('done');\n",
        }),
      );
      expect(r.status).toBe("ok");
      expect(r.stdout).toBe("done\n");
      expect(r.files).toHaveLength(1);
      expect(r.files[0]!.path).toBe("out/note.txt");
      expect(r.files[0]!.mimeType).toBe("text/plain");
      expect(r.files[0]!.text).toBe("hi from node");
    },
  );

  it.skipIf(!available)(
    "rejects unsafe file paths in input files (pre-flight)",
    () => {
      // Backend calls safeRelativePath synchronously on req.files, so it throws
      // before the request is built.
      const b = newBackend();
      return expect(
        b.exec(
          baseReq({
            source: "print(1)",
            files: [{ path: "../escape.txt", content: "no" }],
          }),
        ),
      ).rejects.toThrow();
    },
  );
});

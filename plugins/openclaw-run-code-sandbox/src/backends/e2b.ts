import { createHash } from "node:crypto";
import { posix as path } from "node:path";
import { Sandbox } from "@e2b/code-interpreter";

import {
  LIMITS,
  type SandboxBackend,
  type SandboxExecRequest,
  type SandboxExecResult,
  type SandboxStatus,
} from "../types.js";
import {
  BASH_PRELUDE,
  NODE_PRELUDE,
  PYTHON_PRELUDE,
  extractFileMarkers,
} from "../file-markers.js";
import { safeRelativePath } from "../paths.js";
import {
  detectEmptyRunResult,
  detectMissedEmitFile,
  detectSourceShapeIssue,
  findExternalResources,
} from "./piston.js";

export interface E2BBackendOptions {
  apiKey: string;
  template: string;
  sandboxTimeoutMs: number;
}

const LANGUAGE_MAP = {
  python: "python",
  node: "javascript",
  bash: "bash",
} as const;

const WORKDIR_ROOT = "/home/user/openclaw-run";

export class E2BBackend implements SandboxBackend {
  readonly name = "e2b";
  private readonly apiKey: string;
  private readonly template: string;
  private readonly sandboxTimeoutMs: number;

  constructor(opts: E2BBackendOptions) {
    this.apiKey = opts.apiKey.trim();
    this.template = opts.template.trim();
    this.sandboxTimeoutMs = opts.sandboxTimeoutMs;
  }

  async healthcheck(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.apiKey) return { ok: false, detail: "e2b_api_key_missing" };
    let sandbox: Sandbox | null = null;
    try {
      sandbox = await this.createSandbox(false, LIMITS.minTimeoutMs);
      return { ok: true, detail: "sandbox_created" };
    } catch (err) {
      return { ok: false, detail: classifySdkError(err).diagnostic };
    } finally {
      await killQuietly(sandbox);
    }
  }

  async exec(req: SandboxExecRequest): Promise<SandboxExecResult> {
    const started = Date.now();
    const sourceSha256 =
      "sha256:" + createHash("sha256").update(req.source, "utf8").digest("hex");

    if (!this.apiKey) {
      return unavailable(req.runId, this.name, req.language, sourceSha256, "e2b_api_key_missing");
    }

    const timeoutMs = Math.min(
      Math.max(req.timeoutMs, LIMITS.minTimeoutMs),
      LIMITS.maxTimeoutMs,
    );
    const workdir = `${WORKDIR_ROOT}/${req.runId}`;
    let sandbox: Sandbox | null = null;
    const diagnostics: string[] = [];

    try {
      sandbox = await this.createSandbox(req.networkAllowed, timeoutMs);
      await prepareFiles(sandbox, workdir, req.files);

      const execution = await sandbox.runCode(buildSource(req, workdir), {
        language: LANGUAGE_MAP[req.language],
        timeoutMs,
        requestTimeoutMs: timeoutMs + 10_000,
        envs: {},
      });

      const rawStdout = collectStdout(execution);
      const stderr = truncate(execution.logs.stderr.join(""), LIMITS.maxStderrBytes);
      const { cleanedStdout, files, diagnostics: markerDiagnostics } = extractFileMarkers(rawStdout);
      diagnostics.push(...markerDiagnostics);

      if (files.length === 0) {
        const hint = detectMissedEmitFile(req.language, req.source);
        if (hint) diagnostics.push(hint);
      }

      const sourceShapeHint = detectSourceShapeIssue(req.language, req.source);
      if (sourceShapeHint) diagnostics.push(sourceShapeHint);

      for (const f of files) {
        if (!f.text) continue;
        if (f.mimeType !== "text/html" && f.mimeType !== "image/svg+xml") continue;
        const externals = findExternalResources(f.text);
        if (externals.length > 0) {
          diagnostics.push(
            `external_resources_blocked:${f.path}: artifact references ${externals.slice(0, 3).join(", ")}${externals.length > 3 ? `, +${externals.length - 3} more` : ""}. The host iframe runs under a strict CSP; re-emit the file fully self-contained.`,
          );
        }
      }

      if (execution.error) {
        diagnostics.push(
          `e2b_execution_error:${execution.error.name}:${execution.error.value}`,
        );
      }

      const stdout = truncate(cleanedStdout, LIMITS.maxStdoutBytes);
      const emptyRunHint = detectEmptyRunResult({ files, stdout, stderr, diagnostics });
      if (emptyRunHint) diagnostics.push(emptyRunHint);

      const status: SandboxStatus = execution.error || emptyRunHint ? "error" : "ok";
      return {
        runId: req.runId,
        backend: this.name,
        language: req.language,
        sourceSha256,
        status,
        exitCode: status === "error" ? 1 : 0,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        files,
        diagnostics,
      };
    } catch (err) {
      const classified = classifySdkError(err);
      if (classified.status === "timeout") {
        return errorResult(
          req.runId,
          this.name,
          req.language,
          sourceSha256,
          Date.now() - started,
          classified.diagnostic,
          classified.status,
        );
      }
      return unavailable(
        req.runId,
        this.name,
        req.language,
        sourceSha256,
        classified.diagnostic,
        classified.status,
      );
    } finally {
      await killQuietly(sandbox);
    }
  }

  private async createSandbox(networkAllowed: boolean, requestTimeoutMs: number): Promise<Sandbox> {
    const opts = {
      apiKey: this.apiKey,
      timeoutMs: this.sandboxTimeoutMs,
      requestTimeoutMs: requestTimeoutMs + 10_000,
      allowInternetAccess: networkAllowed,
    };
    return this.template
      ? Sandbox.create(this.template, opts)
      : Sandbox.create(opts);
  }
}

async function prepareFiles(
  sandbox: Sandbox,
  workdir: string,
  files: SandboxExecRequest["files"],
): Promise<void> {
  await ensureDir(sandbox, WORKDIR_ROOT);
  await ensureDir(sandbox, workdir);

  for (const f of files) {
    const safePath = safeRelativePath(f.path);
    const absolutePath = path.join(workdir, safePath);
    await ensureDir(sandbox, path.dirname(absolutePath));
    const content = f.encoding === "base64" ? toArrayBuffer(Buffer.from(f.content, "base64")) : f.content;
    await sandbox.files.write(absolutePath, content, { requestTimeoutMs: 10_000 });
  }
}

async function ensureDir(sandbox: Sandbox, dir: string): Promise<void> {
  if (dir === "/" || dir === ".") return;
  const parts = dir.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    await sandbox.files.makeDir(current, { requestTimeoutMs: 10_000 }).catch(() => false);
  }
}

function buildSource(req: SandboxExecRequest, workdir: string): string {
  if (req.language === "python") {
    return [
      `import os as _oc_os`,
      `_oc_os.chdir(${JSON.stringify(workdir)})`,
      PYTHON_PRELUDE,
      req.source,
    ].join("\n");
  }
  if (req.language === "node") {
    return [`process.chdir(${JSON.stringify(workdir)});`, NODE_PRELUDE, req.source].join("\n");
  }
  return [`cd ${shellQuote(workdir)}`, BASH_PRELUDE, req.source].join("\n");
}

function collectStdout(execution: Awaited<ReturnType<Sandbox["runCode"]>>): string {
  let stdout = execution.logs.stdout.join("");
  if (execution.text && !stdout.includes(execution.text)) {
    stdout += stdout.endsWith("\n") || stdout.length === 0 ? execution.text : `\n${execution.text}`;
    if (!stdout.endsWith("\n")) stdout += "\n";
  }
  return stdout;
}

function classifySdkError(err: unknown): { status: "timeout" | "unavailable"; diagnostic: string } {
  const e = err as Error;
  const name = e.name || "Error";
  const message = e.message || String(err);
  if (/timeout|abort/i.test(`${name}:${message}`)) {
    return { status: "timeout", diagnostic: `e2b_timeout:${name}:${message}` };
  }
  return { status: "unavailable", diagnostic: `e2b_unavailable:${name}:${message}` };
}

function unavailable(
  runId: string,
  backend: string,
  language: SandboxExecRequest["language"],
  sourceSha256: string,
  diag: string,
  status: SandboxStatus = "unavailable",
): SandboxExecResult {
  return {
    runId,
    backend,
    language,
    sourceSha256,
    status,
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs: 0,
    files: [],
    diagnostics: [diag],
  };
}

function errorResult(
  runId: string,
  backend: string,
  language: SandboxExecRequest["language"],
  sourceSha256: string,
  durationMs: number,
  diag: string,
  status: SandboxStatus = "error",
): SandboxExecResult {
  return {
    runId,
    backend,
    language,
    sourceSha256,
    status,
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs,
    files: [],
    diagnostics: [diag],
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n...[truncated ${s.length - max} bytes]`;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buf.byteLength);
  new Uint8Array(arrayBuffer).set(buf);
  return arrayBuffer;
}

async function killQuietly(sandbox: Sandbox | null): Promise<void> {
  if (!sandbox) return;
  await sandbox.kill().catch(() => undefined);
}
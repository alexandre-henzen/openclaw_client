// Piston backend (RUN_CODE_TOOL_SPEC §4.4).
// Uses the engineer-man/piston REST API at POST /api/v2/execute.

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
import { createHash } from "node:crypto";

interface PistonRunResponse {
  language?: string;
  version?: string;
  run?: {
    stdout?: string;
    stderr?: string;
    output?: string;
    code?: number | null;
    signal?: string | null;
    memory?: number;
    cpu_time?: number;
    wall_time?: number;
  };
  compile?: {
    stdout?: string;
    stderr?: string;
    code?: number | null;
  };
  message?: string;
}

interface PistonRuntime {
  language: string;
  version: string;
  aliases?: string[];
  runtime?: string;
}

const LANGUAGE_MAP = {
  python: { install: "python", runtime: "python", entry: "main.py" },
  node: { install: "javascript", runtime: "javascript", entry: "main.js" },
  bash: { install: "bash", runtime: "bash", entry: "main.sh" },
} as const;

export interface PistonBackendOptions {
  baseUrl: string;
  runTimeoutMs: number;
}

export class PistonBackend implements SandboxBackend {
  readonly name = "piston";
  private readonly baseUrl: string;
  private readonly runTimeoutMs: number;
  private runtimesCache: PistonRuntime[] | null = null;

  constructor(opts: PistonBackendOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.runTimeoutMs = opts.runTimeoutMs;
  }

  async healthcheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const r = await fetch(`${this.baseUrl}/runtimes`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const list = (await r.json()) as PistonRuntime[];
      return { ok: true, detail: `${list.length} runtimes` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  async exec(req: SandboxExecRequest): Promise<SandboxExecResult> {
    const started = Date.now();
    const sourceSha256 =
      "sha256:" + createHash("sha256").update(req.source, "utf8").digest("hex");
    const mapping = LANGUAGE_MAP[req.language];
    if (!mapping) {
      return unavailable(req.runId, this.name, req.language, sourceSha256, `unsupported_language:${req.language}`);
    }

    let version: string;
    try {
      version = await this.resolveVersion(mapping.runtime);
    } catch (err) {
      return unavailable(req.runId, this.name, req.language, sourceSha256, (err as Error).message);
    }

    const prelude =
      req.language === "python"
        ? PYTHON_PRELUDE
        : req.language === "node"
          ? NODE_PRELUDE
          : BASH_PRELUDE;

    const pistonFiles: Array<{ name: string; content: string }> = [
      { name: mapping.entry, content: prelude + req.source },
    ];

    // Extra files (validated). Encoded inline as UTF-8 text or as base64 markers
    // that the user code can decode. Piston only supports text file contents,
    // so binary inputs go in as base64 strings the user code must decode.
    for (const f of req.files) {
      const path = safeRelativePath(f.path);
      const enc = f.encoding ?? "utf8";
      const text = enc === "base64" ? f.content : f.content;
      pistonFiles.push({ name: path, content: text });
    }

    const timeoutMs = Math.min(
      Math.max(req.timeoutMs, LIMITS.minTimeoutMs),
      LIMITS.maxTimeoutMs,
    );

    const body = {
      language: mapping.install,
      version,
      files: pistonFiles,
      stdin: "",
      args: [],
      compile_timeout: 0,
      run_timeout: timeoutMs,
      compile_memory_limit: -1,
      run_memory_limit: 268_435_456,
    };

    let resp: PistonRunResponse;
    try {
      const r = await fetch(`${this.baseUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: req.signal ?? AbortSignal.timeout(timeoutMs + 5000),
      });
      const json = (await r.json()) as PistonRunResponse;
      if (!r.ok) {
        return errorResult(
          req.runId,
          this.name,
          req.language,
          sourceSha256,
          Date.now() - started,
          `piston_http_${r.status}: ${json.message ?? ""}`,
        );
      }
      resp = json;
    } catch (err) {
      return errorResult(
        req.runId,
        this.name,
        req.language,
        sourceSha256,
        Date.now() - started,
        (err as Error).message,
      );
    }

    const rawStdout = resp.run?.stdout ?? "";
    const stderr = truncate(resp.run?.stderr ?? "", LIMITS.maxStderrBytes);
    const exitCode = resp.run?.code ?? null;
    const signal = resp.run?.signal ?? null;
    const durationMs = Date.now() - started;

    const { cleanedStdout, files, diagnostics } = extractFileMarkers(rawStdout);
    const stdout = truncate(cleanedStdout, LIMITS.maxStdoutBytes);

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
          `external_resources_blocked:${f.path}: artifact references ${externals.slice(0, 3).join(", ")}${externals.length > 3 ? `, +${externals.length - 3} more` : ""}. The host iframe runs under a strict CSP (default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:) — external URLs (CDNs, fonts, fetch) are blocked. Re-emit the file fully self-contained: inline ALL JS/CSS, replace CDN libraries (React/Vue/Chart.js/unpkg) with hand-rolled inline SVG arithmetic, use data: URIs for images.`,
        );
      }
    }

    const emptyRunHint = detectEmptyRunResult({ files, stdout, stderr, diagnostics });
    if (emptyRunHint) diagnostics.push(emptyRunHint);

    const classifiedStatus = classify({
      exitCode,
      signal,
      durationMs,
      timeoutMs,
    });
    const status: SandboxStatus =
      classifiedStatus === "ok" && emptyRunHint ? "error" : classifiedStatus;

    return {
      runId: req.runId,
      backend: this.name,
      language: req.language,
      sourceSha256,
      status,
      exitCode: status === "error" && exitCode === 0 ? 1 : exitCode,
      stdout,
      stderr,
      durationMs,
      files,
      diagnostics,
    };
  }

  private async resolveVersion(runtimeLang: string): Promise<string> {
    if (!this.runtimesCache) {
      const r = await fetch(`${this.baseUrl}/runtimes`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(`piston_runtimes_http_${r.status}`);
      this.runtimesCache = (await r.json()) as PistonRuntime[];
    }
    const match = this.runtimesCache.find((r) => r.language === runtimeLang);
    if (!match) throw new Error(`runtime_not_installed:${runtimeLang}`);
    return match.version;
  }
}

function classify(args: {
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  timeoutMs: number;
}): SandboxStatus {
  if (args.signal === "SIGKILL" && args.durationMs >= args.timeoutMs - 200) {
    return "timeout";
  }
  if (args.signal === "SIGKILL") return "killed";
  if (args.exitCode === 0) return "ok";
  return "error";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…[truncated ${s.length - max} bytes]`;
}

// Detect common attempts to write files via the worker filesystem (ephemeral,
// not captured) and return a clear diagnostic so the model corrects its next
// call. Returns null when no anti-pattern is detected.
export function detectMissedEmitFile(
  language: SandboxExecRequest["language"],
  source: string,
): string | null {
  // If the source already invokes the proper helper, skip detection — the
  // empty files list is some other failure (truncated stdout, etc.), not a
  // wrong-helper bug. We must not nag the model when it did the right thing.
  const helperCall =
    language === "python"
      ? /\bemit_file\s*\(/
      : language === "node"
        ? /\bemitFile\s*\(/
        : /(^|\n|;|\s)emit_file\s+/;
  if (helperCall.test(source)) return null;

  const patterns: Array<{ re: RegExp; lang: SandboxExecRequest["language"][] }> = [
    { re: /\bfs\.write[A-Za-z]*Sync?\s*\(/i, lang: ["node"] },
    { re: /\brequire\s*\(\s*['"]fs['"]\s*\)/, lang: ["node"] },
    { re: /\bfrom\s+['"]fs['"]/, lang: ["node"] },
    { re: /\bopen\s*\([^)]*,\s*['"][wax]/i, lang: ["python"] },
    { re: /\bPath\s*\([^)]+\)\.write_/i, lang: ["python"] },
    { re: /\bshutil\.(copy|move|copytree)\b/, lang: ["python"] },
    { re: /[>]\s*out\//, lang: ["bash"] },
    { re: /\btee\s+out\//, lang: ["bash"] },
  ];
  for (const p of patterns) {
    if (p.lang.includes(language) && p.re.test(source)) {
      const helper =
        language === "python"
          ? "emit_file('out/<name>.<ext>', content_string_or_bytes)"
          : language === "node"
            ? "emitFile('out/<name>.<ext>', content_string_or_Buffer)"
            : "emit_file out/<name>.<ext> <path-to-file>";
      return `no_file_emitted: detected filesystem write that the host does NOT capture. The Piston worker FS is ephemeral. To deliver a file to the user, call the injected helper ${helper} — do NOT use fs.writeFileSync / open(...,'w') / Path.write_text / shell redirection. Re-run with the helper to make the artifact appear in the user's tray.`;
    }
  }
  // Also flag when the source mentions out/ paths but emitted no files.
  if (/\bout\/[A-Za-z0-9_./-]+\.(html|svg|md|txt|json|csv|png|jpg|jpeg|gif|webp|pdf)\b/.test(source)) {
    const helper =
      language === "python" ? "emit_file" : language === "node" ? "emitFile" : "emit_file";
    return `no_file_emitted: source references out/ files but none were captured. Use ${helper}(path, content) — the helper is pre-injected; the worker filesystem is NOT collected.`;
  }
  return null;
}

export function detectSourceShapeIssue(
  language: SandboxExecRequest["language"],
  source: string,
): string | null {
  if (language !== "python") return null;
  if (source.includes("\n")) return null;
  if (!/\b(def|class|for|while|if|try|with)\b[^\n]*:/.test(source)) return null;
  return "source_shape_invalid: python source appears to have been flattened into one line. Re-run run_code with real newline characters and indentation; do not collapse Python blocks into spaces.";
}

export function detectEmptyRunResult(args: {
  files: unknown[];
  stdout: string;
  stderr: string;
  diagnostics: string[];
}): string | null {
  if (args.files.length > 0) return null;
  if (args.stdout.trim() !== "") return null;
  if (args.stderr.trim() !== "") return null;
  if (args.diagnostics.some((d) => d.startsWith("empty_result:"))) return null;
  return "empty_result: code ran but produced no stdout, stderr, or emitted files. For charts/HTML/files, call emit_file('out/<name>.html', html) or emitFile('out/<name>.html', html). For calculations, print the answer to stdout. Do not stop after an empty result; fix the script and re-run run_code.";
}

// Scan emitted text artifacts for references the strict CSP will reject.
// Returns the offending URLs (deduped, capped). An empty list means the
// document is safe to render in the host iframe.
export function findExternalResources(html: string): string[] {
  const found = new Set<string>();
  const patterns: RegExp[] = [
    /<script[^>]+\bsrc\s*=\s*['"]([^'"]+)['"]/gi,
    /<link[^>]+\bhref\s*=\s*['"]([^'"]+)['"]/gi,
    /<iframe[^>]+\bsrc\s*=\s*['"]([^'"]+)['"]/gi,
    /<img[^>]+\bsrc\s*=\s*['"](https?:\/\/[^'"]+)['"]/gi,
    /@import\s+(?:url\()?['"]([^'"]+)['"]/gi,
    /\bfetch\s*\(\s*['"](https?:\/\/[^'"]+)['"]/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const url = m[1]!.trim();
      if (!url) continue;
      if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("#")) continue;
      if (url.startsWith("./") || url.startsWith("../") || url.startsWith("/")) continue;
      found.add(url);
      if (found.size >= 10) return [...found];
    }
  }
  return [...found];
}

function unavailable(
  runId: string,
  backend: string,
  language: SandboxExecRequest["language"],
  sourceSha256: string,
  diag: string,
): SandboxExecResult {
  return {
    runId,
    backend,
    language,
    sourceSha256,
    status: "unavailable",
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
): SandboxExecResult {
  return {
    runId,
    backend,
    language,
    sourceSha256,
    status: "error",
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs,
    files: [],
    diagnostics: [diag],
  };
}

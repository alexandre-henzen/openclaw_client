// Backend-agnostic types for the run_code tool.
// Structurally mirrored (NOT imported) from openclaw-copilotkit-official-chat/
// src/lib/sandbox/types.ts. The mirror is intentional (D-020): the plugin is a
// build-isolated package and must not depend on Next.js app code.

export type SandboxStatus =
  | "ok"
  | "error"
  | "timeout"
  | "oom"
  | "killed"
  | "unavailable";

export interface SandboxFileInput {
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
}

export interface SandboxExecRequest {
  runId: string;
  language: "python" | "node" | "bash";
  source: string;
  files: SandboxFileInput[];
  collectOutputs: string[];
  timeoutMs: number;
  networkAllowed: boolean;
  signal?: AbortSignal;
}

export interface SandboxOutputFile {
  path: string;
  mimeType: string;
  sizeBytes: number;
  contentBase64?: string;
  text?: string;
  contentHash: string;
}

export interface SandboxExecResult {
  runId: string;
  backend: string;
  language: "python" | "node" | "bash";
  sourceSha256: string;
  status: SandboxStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  files: SandboxOutputFile[];
  diagnostics: string[];
}

export interface SandboxBackend {
  readonly name: string;
  exec(req: SandboxExecRequest): Promise<SandboxExecResult>;
  healthcheck(): Promise<{ ok: boolean; detail?: string }>;
}

export interface PluginConfig {
  SANDBOX_BACKEND: "piston" | "e2b" | "docker" | "daytona-oss";
  PISTON_URL: string;
  PISTON_RUN_TIMEOUT_MS: number;
  E2B_API_KEY: string;
  E2B_TEMPLATE: string;
  E2B_SANDBOX_TIMEOUT_MS: number;
  SANDBOX_NETWORK: "none" | "egress";
  SANDBOX_ALLOW_NETWORK: boolean;
}

// Hard caps — output files aligned with chat artifact store (15 MiB per blob).
export const LIMITS = {
  maxSourceBytes: 256_000,
  /** Max UTF-8 text inlined in a single marker file. */
  maxFileBytes: 5 * 1024 * 1024,
  maxFiles: 16,
  maxCollectGlobs: 8,
  maxTimeoutMs: 60_000,
  minTimeoutMs: 1_000,
  defaultTimeoutMs: 30_000,
  /** Must fit marker lines (base64) before extractFileMarkers; 32 MiB for large exports. */
  maxStdoutBytes: 32 * 1024 * 1024,
  maxStderrBytes: 512 * 1024,
  /** Per emitted file (base64 in stdout markers). Was 512 KiB; raised for xlsx/csv exports. */
  maxOutputFileBytes: 15 * 1024 * 1024,
  maxOutputTotalBytes: 30 * 1024 * 1024,
  maxOutputFiles: 16,
} as const;

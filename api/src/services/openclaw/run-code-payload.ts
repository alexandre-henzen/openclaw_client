/** Normalize run_code plugin results from AG-UI (camelCase or snake_case). */

export interface PluginSandboxOutputFile {
  path: string;
  mimeType?: string;
  sizeBytes: number;
  contentBase64?: string;
  text?: string;
  contentHash: string;
}

export interface PluginSandboxExecResult {
  runId: string;
  backend?: string;
  provider?: string;
  language?: 'python' | 'node' | 'bash';
  sourceSha256?: string;
  status: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  files?: PluginSandboxOutputFile[];
  outputs?: PluginSandboxOutputFile[];
  diagnostics?: string[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeFile(raw: Record<string, unknown>): PluginSandboxOutputFile | null {
  const filePath = typeof raw.path === 'string' ? raw.path : null;
  if (!filePath) return null;
  const sizeBytes =
    typeof raw.sizeBytes === 'number'
      ? raw.sizeBytes
      : typeof raw.size_bytes === 'number'
        ? raw.size_bytes
        : 0;
  const contentHash =
    typeof raw.contentHash === 'string'
      ? raw.contentHash
      : typeof raw.content_hash === 'string'
        ? raw.content_hash
        : 'sha256:unknown';
  const text = typeof raw.text === 'string' ? raw.text : undefined;
  const contentBase64 =
    typeof raw.contentBase64 === 'string'
      ? raw.contentBase64
      : typeof raw.content_base64 === 'string'
        ? raw.content_base64
        : undefined;
  const mimeType =
    typeof raw.mimeType === 'string'
      ? raw.mimeType
      : typeof raw.mime_type === 'string'
        ? raw.mime_type
        : undefined;
  return { path: filePath, sizeBytes, contentHash, text, contentBase64, mimeType };
}

export function normalizePluginExecResult(raw: unknown): PluginSandboxExecResult | null {
  if (!isObj(raw)) return null;
  const runId =
    typeof raw.runId === 'string'
      ? raw.runId
      : typeof raw.run_id === 'string'
        ? raw.run_id
        : null;
  const status = typeof raw.status === 'string' ? raw.status : null;
  if (!runId || !status) return null;

  const rawFiles = raw.files ?? raw.outputs;
  const files: PluginSandboxOutputFile[] = [];
  if (Array.isArray(rawFiles)) {
    for (const item of rawFiles) {
      if (!isObj(item)) continue;
      const f = normalizeFile(item);
      if (f) files.push(f);
    }
  }

  return {
    runId,
    status,
    backend: typeof raw.backend === 'string' ? raw.backend : undefined,
    provider: typeof raw.provider === 'string' ? raw.provider : undefined,
    language:
      raw.language === 'python' || raw.language === 'node' || raw.language === 'bash'
        ? raw.language
        : undefined,
    sourceSha256:
      typeof raw.sourceSha256 === 'string'
        ? raw.sourceSha256
        : typeof raw.source_sha256 === 'string'
          ? raw.source_sha256
          : undefined,
    exitCode:
      typeof raw.exitCode === 'number'
        ? raw.exitCode
        : typeof raw.exit_code === 'number'
          ? raw.exit_code
          : null,
    stdout: typeof raw.stdout === 'string' ? raw.stdout : '',
    stderr: typeof raw.stderr === 'string' ? raw.stderr : '',
    durationMs:
      typeof raw.durationMs === 'number'
        ? raw.durationMs
        : typeof raw.duration_ms === 'number'
          ? raw.duration_ms
          : 0,
    files,
    diagnostics: Array.isArray(raw.diagnostics)
      ? raw.diagnostics.filter((d): d is string => typeof d === 'string')
      : [],
  };
}

export function parseRunCodeResultPayload(
  data: Record<string, unknown>
): PluginSandboxExecResult | null {
  const candidates: unknown[] = [
    data.result,
    data.output,
    data.toolResult,
    data.tool_result,
    data.value,
  ];

  for (const c of candidates) {
    if (typeof c === 'string') {
      try {
        const parsed = normalizePluginExecResult(JSON.parse(c));
        if (parsed) return parsed;
      } catch {
        /* continue */
      }
    }
    const direct = normalizePluginExecResult(c);
    if (direct) return direct;
  }

  for (const key of ['content', 'result', 'output']) {
    const v = data[key];
    if (typeof v === 'string') {
      try {
        const parsed = normalizePluginExecResult(JSON.parse(v));
        if (parsed) return parsed;
      } catch {
        /* continue */
      }
    }
  }

  return normalizePluginExecResult(data);
}

// File-marker convention (RUN_CODE_TOOL_SPEC §4.5).
// Piston has no native "collect files" feature, so the executed script emits
// markers in stdout:
//
//   ### FILE: <relative-path>
//   <base64-encoded content>
//   ### END FILE
//
// Helpers emit_file() (python) and emitFile() (node) are injected as preludes
// so the model can call them without remembering the wire format.

import { createHash } from "node:crypto";
import { LIMITS, type SandboxOutputFile } from "./types.js";
import { safeRelativePath } from "./paths.js";

const BEGIN = /^### FILE: (.+)$/;
const END = "### END FILE";

export interface ExtractResult {
  cleanedStdout: string;
  files: SandboxOutputFile[];
  diagnostics: string[];
}

export function extractFileMarkers(stdout: string): ExtractResult {
  const lines = stdout.split("\n");
  const out: string[] = [];
  const files: SandboxOutputFile[] = [];
  const diagnostics: string[] = [];
  let totalBytes = 0;

  let i = 0;
  while (i < lines.length) {
    const m = BEGIN.exec(lines[i]!);
    if (!m) {
      out.push(lines[i]!);
      i++;
      continue;
    }
    const declaredPath = m[1]!.trim();
    // Collect base64 lines until END marker.
    let j = i + 1;
    const dataLines: string[] = [];
    let endFound = false;
    while (j < lines.length) {
      if (lines[j] === END) {
        endFound = true;
        break;
      }
      dataLines.push(lines[j]!);
      j++;
    }
    if (!endFound) {
      diagnostics.push(`unterminated_file_marker: ${declaredPath}`);
      // Leave the begin line and partial body in the cleaned stdout.
      out.push(lines[i]!);
      i++;
      continue;
    }

    let safePath: string;
    try {
      safePath = safeRelativePath(declaredPath);
    } catch (err) {
      diagnostics.push(
        `rejected_file_path:${declaredPath}:${(err as Error).message}`,
      );
      i = j + 1;
      continue;
    }

    if (files.length >= LIMITS.maxOutputFiles) {
      diagnostics.push(`file_count_exceeded:${safePath}`);
      i = j + 1;
      continue;
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(dataLines.join(""), "base64");
    } catch {
      diagnostics.push(`invalid_base64:${safePath}`);
      i = j + 1;
      continue;
    }

    if (buf.byteLength > LIMITS.maxOutputFileBytes) {
      diagnostics.push(`file_truncated:${safePath}`);
      files.push({
        path: safePath,
        mimeType: guessMime(safePath),
        sizeBytes: buf.byteLength,
        contentHash: sha256(buf),
      });
      i = j + 1;
      continue;
    }

    if (totalBytes + buf.byteLength > LIMITS.maxOutputTotalBytes) {
      diagnostics.push(`total_bytes_exceeded:${safePath}`);
      i = j + 1;
      continue;
    }
    totalBytes += buf.byteLength;

    const mime = guessMime(safePath);
    const file: SandboxOutputFile = {
      path: safePath,
      mimeType: mime,
      sizeBytes: buf.byteLength,
      contentHash: sha256(buf),
    };
    if (isText(mime) && buf.byteLength <= LIMITS.maxFileBytes) {
      file.text = buf.toString("utf8");
    } else {
      file.contentBase64 = buf.toString("base64");
    }
    files.push(file);

    i = j + 1;
  }

  return { cleanedStdout: out.join("\n"), files, diagnostics };
}

function sha256(buf: Buffer): string {
  return "sha256:" + createHash("sha256").update(buf).digest("hex");
}

function isText(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "image/svg+xml" ||
    mime === "application/xml"
  );
}

function guessMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

// Preludes injected before the user-provided source so emit_file() / emitFile()
// produce the marker convention without the model needing to remember it.

export const PYTHON_PRELUDE = `# --- openclaw-run-code-sandbox prelude ---
import base64 as _ocsb64, sys as _ocsys
def emit_file(path, content):
    """Emit a file to the run_code tool result. content may be bytes or str."""
    if isinstance(content, str): content = content.encode('utf-8')
    sys.stdout.flush()
    print('### FILE: ' + path, flush=True)
    print(_ocsb64.b64encode(content).decode('ascii'), flush=True)
    print('### END FILE', flush=True)
import sys
# --- end prelude ---
`;

export const NODE_PRELUDE = `// --- openclaw-run-code-sandbox prelude ---
function emitFile(path, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  process.stdout.write('### FILE: ' + path + '\\n');
  process.stdout.write(buf.toString('base64') + '\\n');
  process.stdout.write('### END FILE\\n');
}
// --- end prelude ---
`;

export const BASH_PRELUDE = `# --- openclaw-run-code-sandbox prelude ---
emit_file() {
  local path="$1"
  local file="$2"
  printf '### FILE: %s\\n' "$path"
  base64 -w0 < "$file"
  printf '\\n### END FILE\\n'
}
# --- end prelude ---
`;

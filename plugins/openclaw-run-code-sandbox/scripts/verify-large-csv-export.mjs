#!/usr/bin/env node
/** One-off live check: CSV > 512 KiB via E2B backend (uses E2B_API_KEY from env). */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const extRoot =
  process.env.RUN_CODE_PLUGIN_ROOT ?? join(__dir, "..");
const { E2BBackend } = await import(
  pathToFileURL(join(extRoot, "dist/backends/e2b.js")).href
);

const apiKey = process.env.E2B_API_KEY ?? "";
if (!apiKey) {
  console.error("E2B_API_KEY missing");
  process.exit(2);
}

const backend = new E2BBackend({
  apiKey,
  template: process.env.E2B_TEMPLATE ?? "",
  sandboxTimeoutMs: Number(process.env.E2B_SANDBOX_TIMEOUT_MS ?? 300_000),
});

const source = [
  "n = 55000",
  'csv = "id,val\\n" + "".join(f"{i},{i}\\n" for i in range(n))',
  'emit_file("out/export.csv", csv)',
  'print("bytes", len(csv))',
].join("\n");

const r = await backend.exec({
  runId: "verify_large_csv",
  language: "python",
  source,
  files: [],
  collectOutputs: [],
  timeoutMs: 120_000,
  networkAllowed: false,
});

const truncated = r.diagnostics.some((d) => d.startsWith("file_truncated"));
const f = r.files[0];
const ok = Boolean(
  r.status === "ok" &&
    !truncated &&
    f &&
    f.path === "out/export.csv" &&
    f.sizeBytes > 512 * 1024 &&
    (f.contentBase64 || f.text),
);

const summary = {
  ok,
  status: r.status,
  truncated,
  path: f?.path,
  sizeBytes: f?.sizeBytes,
  hasPayload: Boolean(f?.contentBase64 || f?.text),
  diagnostics: r.diagnostics,
};
process.stderr.write(`VERIFY_RESULT:${JSON.stringify(summary)}\n`);
process.exit(ok ? 0 : 1);

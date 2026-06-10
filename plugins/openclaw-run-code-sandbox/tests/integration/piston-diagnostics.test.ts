import { describe, expect, it } from "vitest";
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
    timeoutMs: 15_000,
    networkAllowed: false,
    ...over,
  };
}

describe("PistonBackend diagnostics (live)", () => {
  it.skipIf(!available)(
    "node fs.writeFileSync produces no files and pushes no_file_emitted diagnostic",
    async () => {
      const source = `
const fs = require('fs');
fs.writeFileSync('out/chart.html', '<h1>oops</h1>');
console.log('done');
`;
      const r = await newBackend().exec(baseReq({ language: "node", source }));
      // Script either crashes (ENOENT on out/) or completes; either way no
      // file is captured and the diagnostic must surface.
      expect(["ok", "error"]).toContain(r.status);
      expect(r.files).toHaveLength(0);
      expect(r.diagnostics).toHaveLength(1);
      expect(r.diagnostics[0]).toMatch(/^no_file_emitted:/);
      expect(r.diagnostics[0]).toMatch(/emitFile\(/);
    },
  );

  it.skipIf(!available)(
    "python Path.write_text produces no files and pushes no_file_emitted diagnostic",
    async () => {
      const source = `
from pathlib import Path
Path('out/x.html').write_text('<h1>oops</h1>')
print('done')
`;
      const r = await newBackend().exec(baseReq({ language: "python", source }));
      expect(["ok", "error"]).toContain(r.status);
      expect(r.files).toHaveLength(0);
      expect(r.diagnostics).toHaveLength(1);
      expect(r.diagnostics[0]).toMatch(/^no_file_emitted:/);
      expect(r.diagnostics[0]).toMatch(/emit_file\(/);
    },
  );

  it.skipIf(!available)(
    "bash redirection > out/ produces no files and pushes no_file_emitted diagnostic",
    async () => {
      const source = `echo '<h1>oops</h1>' > out/x.html\necho done\n`;
      const r = await newBackend().exec(baseReq({ language: "bash", source }));
      expect(r.files).toHaveLength(0);
      expect(r.diagnostics).toHaveLength(1);
      expect(r.diagnostics[0]).toMatch(/no_file_emitted/);
    },
  );

  it.skipIf(!available)(
    "node emitFile with CDN script emits the file but pushes external_resources_blocked",
    async () => {
      const source = `
const html = \`<!doctype html><html><head>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"><\\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\\/script>
</head><body><div id="root"></div></body></html>\`;
emitFile('out/chart.html', html);
console.log('done');
`;
      const r = await newBackend().exec(baseReq({ language: "node", source }));
      expect(r.status).toBe("ok");
      expect(r.files).toHaveLength(1);
      expect(r.files[0]!.path).toBe("out/chart.html");
      expect(r.files[0]!.mimeType).toBe("text/html");
      expect(r.diagnostics).toHaveLength(1);
      expect(r.diagnostics[0]).toMatch(/^external_resources_blocked:out\/chart\.html:/);
      expect(r.diagnostics[0]).toMatch(/unpkg\.com\/react/);
    },
  );

  it.skipIf(!available)(
    "node emitFile with pure inline SVG html has no diagnostics",
    async () => {
      const source = `
const html = \`<!doctype html><html><body>
<style>body{font-family:sans-serif}</style>
<svg width="200" height="200" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="80" fill="#4f46e5"/>
  <text x="100" y="105" text-anchor="middle" fill="white">Hi</text>
</svg>
<script>console.log('inline ok')<\\/script>
</body></html>\`;
emitFile('out/chart.html', html);
console.log('done');
`;
      const r = await newBackend().exec(baseReq({ language: "node", source }));
      expect(r.status).toBe("ok");
      expect(r.files).toHaveLength(1);
      expect(r.files[0]!.path).toBe("out/chart.html");
      expect(r.diagnostics).toEqual([]);
    },
  );

  it.skipIf(!available)(
    "python emit_file with fetch('http...') in inline script triggers external_resources_blocked",
    async () => {
      const source = `
html = """<!doctype html><html><body>
<script>fetch('https://api.example.com/data').then(r => r.json())</script>
</body></html>"""
emit_file('out/x.html', html)
print('done')
`;
      const r = await newBackend().exec(baseReq({ language: "python", source }));
      expect(r.status).toBe("ok");
      expect(r.files).toHaveLength(1);
      expect(r.diagnostics).toHaveLength(1);
      expect(r.diagnostics[0]).toMatch(/external_resources_blocked/);
      expect(r.diagnostics[0]).toMatch(/api\.example\.com/);
    },
  );

  it.skipIf(!available)(
    "non-html artifact (text/plain) is not scanned for external resources",
    async () => {
      const source = `
emitFile('out/note.txt', 'this mentions https://unpkg.com but is text');
console.log('done');
`;
      const r = await newBackend().exec(baseReq({ language: "node", source }));
      expect(r.files).toHaveLength(1);
      expect(r.files[0]!.mimeType).toBe("text/plain");
      expect(r.diagnostics).toEqual([]);
    },
  );

  it.skipIf(!available)(
    "no_file_emitted is not raised when at least one file was emitted",
    async () => {
      // Source contains fs.writeFileSync pattern AND a real emitFile.
      const source = `
emitFile('out/real.txt', 'real');
// fs.writeFileSync('out/fake.html', 'fake');  // commented but matches regex
const x = 'fs.writeFileSync should not trigger since files.length > 0';
console.log(x.length);
`;
      const r = await newBackend().exec(baseReq({ language: "node", source }));
      expect(r.files).toHaveLength(1);
      // no_file_emitted only fires when files.length === 0
      const noFileEmitted = r.diagnostics.filter((d) => d.startsWith("no_file_emitted"));
      expect(noFileEmitted).toEqual([]);
    },
  );
});

import { describe, expect, it } from "vitest";
import {
  detectEmptyRunResult,
  detectMissedEmitFile,
  detectSourceShapeIssue,
  findExternalResources,
} from "../../src/backends/piston.js";

describe("detectMissedEmitFile", () => {
  describe("node patterns", () => {
    it("flags fs.writeFileSync", () => {
      const hint = detectMissedEmitFile(
        "node",
        "const fs = require('fs'); fs.writeFileSync('out/x.html', '<h1>hi</h1>');",
      );
      expect(hint).not.toBeNull();
      expect(hint).toMatch(/^no_file_emitted:/);
      expect(hint).toMatch(/emitFile\('out\/<name>\.<ext>'/);
      expect(hint).not.toMatch(/emit_file\(/);
    });

    it("flags fs.writeFile (async)", () => {
      const hint = detectMissedEmitFile(
        "node",
        "import fs from 'fs'; fs.writeFile('out/x.txt', 'hi', () => {});",
      );
      expect(hint).not.toBeNull();
      expect(hint).toMatch(/no_file_emitted/);
    });

    it("flags require('fs')", () => {
      const hint = detectMissedEmitFile("node", "const fs = require('fs');\n");
      expect(hint).not.toBeNull();
    });

    it("flags import from 'fs'", () => {
      const hint = detectMissedEmitFile("node", "import fs from 'fs';\nconsole.log(1);");
      expect(hint).not.toBeNull();
    });

    it("flags bare reference to out/<file>.html as fallback", () => {
      const hint = detectMissedEmitFile(
        "node",
        "const path = 'out/report.html';\nconsole.log(path);",
      );
      expect(hint).not.toBeNull();
      expect(hint).toMatch(/source references out\//);
    });

    it("returns null for clean console.log", () => {
      expect(detectMissedEmitFile("node", "console.log('hi');\n")).toBeNull();
    });

    it("returns null for proper emitFile usage", () => {
      expect(
        detectMissedEmitFile("node", "emitFile('out/x.html', '<h1>hi</h1>');\n"),
      ).toBeNull();
    });
  });

  describe("python patterns", () => {
    it("flags open(..., 'w')", () => {
      const hint = detectMissedEmitFile(
        "python",
        "with open('out/x.html', 'w') as f:\n    f.write('<h1>hi</h1>')\n",
      );
      expect(hint).not.toBeNull();
      expect(hint).toMatch(/emit_file\('out\/<name>\.<ext>'/);
    });

    it("flags open(..., 'wb')", () => {
      const hint = detectMissedEmitFile(
        "python",
        "f = open('out/x.bin', 'wb')\nf.write(b'\\x00')\nf.close()\n",
      );
      expect(hint).not.toBeNull();
    });

    it("flags open(..., 'a')", () => {
      const hint = detectMissedEmitFile(
        "python",
        "open('out/log.txt', 'a').write('line\\n')",
      );
      expect(hint).not.toBeNull();
    });

    it("flags Path().write_text", () => {
      const hint = detectMissedEmitFile(
        "python",
        "from pathlib import Path\nPath('out/x.html').write_text('<h1>hi</h1>')\n",
      );
      expect(hint).not.toBeNull();
    });

    it("flags Path().write_bytes", () => {
      const hint = detectMissedEmitFile(
        "python",
        "from pathlib import Path\nPath('out/x.png').write_bytes(b'\\x89PNG')\n",
      );
      expect(hint).not.toBeNull();
    });

    it("flags shutil.copy", () => {
      const hint = detectMissedEmitFile(
        "python",
        "import shutil\nshutil.copy('src', 'out/x.txt')\n",
      );
      expect(hint).not.toBeNull();
    });

    it("returns null for proper emit_file usage", () => {
      expect(
        detectMissedEmitFile("python", "emit_file('out/x.html', '<h1>hi</h1>')\n"),
      ).toBeNull();
    });

    it("returns null for clean print", () => {
      expect(detectMissedEmitFile("python", "print('hi')\n")).toBeNull();
    });
  });

  describe("bash patterns", () => {
    it("flags redirection > out/", () => {
      const hint = detectMissedEmitFile("bash", "echo '<h1>hi</h1>' > out/x.html\n");
      expect(hint).not.toBeNull();
      expect(hint).toMatch(/emit_file out\/<name>\.<ext>/);
    });

    it("flags tee out/", () => {
      const hint = detectMissedEmitFile("bash", "echo 'hi' | tee out/log.txt\n");
      expect(hint).not.toBeNull();
    });

    it("returns null for echo without redirection", () => {
      expect(detectMissedEmitFile("bash", "echo hello\n")).toBeNull();
    });
  });

  describe("cross-language isolation", () => {
    // The language-specific regexes must NOT cross-fire. We use sources that
    // don't reference `out/<file>.<ext>` so the generic fallback doesn't kick in.
    it("does not flag fs.writeFileSync when language is python", () => {
      expect(
        detectMissedEmitFile("python", "fs.writeFileSync('result.html', html)"),
      ).toBeNull();
    });

    it("does not flag open(..., 'w') when language is node", () => {
      expect(detectMissedEmitFile("node", "open('result.html', 'w')")).toBeNull();
    });

    it("does not flag tee redirection when language is python", () => {
      expect(detectMissedEmitFile("python", "subprocess.run(['tee', 'log'])")).toBeNull();
    });
  });
});

describe("detectSourceShapeIssue", () => {
  it("flags flattened python blocks", () => {
    const hint = detectSourceShapeIssue("python", "for x in [1, 2]: print(x)");
    expect(hint).toMatch(/^source_shape_invalid:/);
  });

  it("does not flag indented multiline python", () => {
    const hint = detectSourceShapeIssue("python", "for x in [1, 2]:\n    print(x)\n");
    expect(hint).toBeNull();
  });

  it("does not flag node source", () => {
    const hint = detectSourceShapeIssue("node", "for (const x of [1, 2]) { console.log(x); }");
    expect(hint).toBeNull();
  });
});

describe("detectEmptyRunResult", () => {
  it("flags successful executions with no observable output", () => {
    const hint = detectEmptyRunResult({ files: [], stdout: "", stderr: "", diagnostics: [] });
    expect(hint).toMatch(/^empty_result:/);
  });

  it("does not flag stdout", () => {
    const hint = detectEmptyRunResult({ files: [], stdout: "42\n", stderr: "", diagnostics: [] });
    expect(hint).toBeNull();
  });

  it("does not flag emitted files", () => {
    const hint = detectEmptyRunResult({ files: [{}], stdout: "", stderr: "", diagnostics: [] });
    expect(hint).toBeNull();
  });
});

describe("findExternalResources", () => {
  it("returns [] for fully inline html", () => {
    const html =
      "<!doctype html><html><head><style>body{color:red}</style></head><body><svg><circle r='10'/></svg><script>1+1</script></body></html>";
    expect(findExternalResources(html)).toEqual([]);
  });

  it("detects <script src=https://...>", () => {
    const html = '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>';
    expect(findExternalResources(html)).toEqual([
      "https://unpkg.com/react@18/umd/react.production.min.js",
    ]);
  });

  it("detects <link href=...>", () => {
    const html = '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto">';
    const out = findExternalResources(html);
    expect(out).toContain("https://fonts.googleapis.com/css?family=Roboto");
  });

  it("detects <iframe src=...>", () => {
    const html = '<iframe src="https://example.com/x"></iframe>';
    expect(findExternalResources(html)).toContain("https://example.com/x");
  });

  it("detects <img src=https://...>", () => {
    const html = '<img src="https://cdn.example.com/x.png">';
    expect(findExternalResources(html)).toContain("https://cdn.example.com/x.png");
  });

  it("ignores data: URIs in <img>", () => {
    const html = '<img src="data:image/png;base64,iVBOR...">';
    expect(findExternalResources(html)).toEqual([]);
  });

  it("ignores blob: URIs", () => {
    const html = '<iframe src="blob:http://x"></iframe>';
    expect(findExternalResources(html)).toEqual([]);
  });

  it("ignores relative paths and anchor links", () => {
    const html =
      '<a href="#top"><img src="./local.png"><script src="../js/x.js"></script></a>';
    expect(findExternalResources(html)).toEqual([]);
  });

  it("detects @import in inline <style>", () => {
    const html =
      "<style>@import url('https://fonts.example.com/css'); body{color:red}</style>";
    expect(findExternalResources(html)).toContain("https://fonts.example.com/css");
  });

  it("detects fetch('http...') in inline script", () => {
    const html =
      "<script>fetch('https://api.example.com/data').then(r=>r.json());</script>";
    expect(findExternalResources(html)).toContain("https://api.example.com/data");
  });

  it("dedupes repeated URLs", () => {
    const html =
      '<script src="https://x.example/a.js"></script><script src="https://x.example/a.js"></script>';
    expect(findExternalResources(html)).toEqual(["https://x.example/a.js"]);
  });

  it("collects multiple distinct CDNs", () => {
    const html = `
      <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
      <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
      <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    `;
    const out = findExternalResources(html);
    expect(out).toHaveLength(3);
    expect(out).toEqual(
      expect.arrayContaining([
        "https://unpkg.com/react@18/umd/react.production.min.js",
        "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
        "https://unpkg.com/@babel/standalone/babel.min.js",
      ]),
    );
  });

  it("caps result at 10 entries", () => {
    const parts: string[] = [];
    for (let i = 0; i < 20; i++) {
      parts.push(`<script src="https://x.example/${i}.js"></script>`);
    }
    const out = findExternalResources(parts.join(""));
    expect(out).toHaveLength(10);
  });
});

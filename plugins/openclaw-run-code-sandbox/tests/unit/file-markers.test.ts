import { describe, expect, it } from "vitest";
import { extractFileMarkers } from "../../src/file-markers.js";

function encode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

describe("extractFileMarkers", () => {
  it("returns stdout unchanged when no markers", () => {
    const r = extractFileMarkers("hello world\nline 2\n");
    expect(r.cleanedStdout).toBe("hello world\nline 2\n");
    expect(r.files).toHaveLength(0);
    expect(r.diagnostics).toHaveLength(0);
  });

  it("extracts a single text file and removes marker from stdout", () => {
    const html = "<h1>Hi</h1>";
    const stdout = [
      "before",
      "### FILE: out/chart.html",
      encode(html),
      "### END FILE",
      "after",
    ].join("\n");

    const r = extractFileMarkers(stdout);
    expect(r.cleanedStdout).toBe("before\nafter");
    expect(r.files).toHaveLength(1);
    const f = r.files[0]!;
    expect(f.path).toBe("out/chart.html");
    expect(f.mimeType).toBe("text/html");
    expect(f.sizeBytes).toBe(Buffer.byteLength(html, "utf8"));
    expect(f.text).toBe(html);
    expect(f.contentBase64).toBeUndefined();
    expect(f.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(r.diagnostics).toHaveLength(0);
  });

  it("encodes binary mime types as base64 (no text field)", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const stdout = [
      "### FILE: out/pixel.png",
      png.toString("base64"),
      "### END FILE",
    ].join("\n");

    const r = extractFileMarkers(stdout);
    expect(r.files).toHaveLength(1);
    const f = r.files[0]!;
    expect(f.mimeType).toBe("image/png");
    expect(f.contentBase64).toBe(png.toString("base64"));
    expect(f.text).toBeUndefined();
  });

  it("rejects markers with unsafe paths but continues", () => {
    const stdout = [
      "### FILE: ../etc/passwd",
      encode("oops"),
      "### END FILE",
      "### FILE: ok.txt",
      encode("good"),
      "### END FILE",
    ].join("\n");

    const r = extractFileMarkers(stdout);
    expect(r.files.map((f) => f.path)).toEqual(["ok.txt"]);
    expect(r.diagnostics.some((d) => d.startsWith("rejected_file_path:../etc/passwd"))).toBe(true);
  });

  it("reports unterminated markers as diagnostics and keeps them in stdout", () => {
    const stdout = [
      "before",
      "### FILE: out/leak.txt",
      "deadbeef",
      "no end marker here",
    ].join("\n");

    const r = extractFileMarkers(stdout);
    expect(r.files).toHaveLength(0);
    expect(r.diagnostics).toContain("unterminated_file_marker: out/leak.txt");
    expect(r.cleanedStdout).toContain("### FILE: out/leak.txt");
  });

  it("truncates files over maxOutputFileBytes (sets only metadata)", () => {
    const big = Buffer.alloc(15 * 1024 * 1024 + 1, 65); // 'A'
    const stdout = [
      "### FILE: out/big.txt",
      big.toString("base64"),
      "### END FILE",
    ].join("\n");

    const r = extractFileMarkers(stdout);
    expect(r.files).toHaveLength(1);
    const f = r.files[0]!;
    expect(f.sizeBytes).toBe(big.byteLength);
    expect(f.text).toBeUndefined();
    expect(f.contentBase64).toBeUndefined();
    expect(r.diagnostics).toContain("file_truncated:out/big.txt");
  });
});

import { describe, expect, it } from "vitest";
import { safeRelativePath } from "../../src/paths.js";

describe("safeRelativePath", () => {
  it("accepts simple relative paths", () => {
    expect(safeRelativePath("main.py")).toBe("main.py");
    expect(safeRelativePath("out/chart.html")).toBe("out/chart.html");
    expect(safeRelativePath("a/b/c/d.txt")).toBe("a/b/c/d.txt");
  });

  it.each([
    ["empty", ""],
    ["traversal", "../etc/passwd"],
    ["nested traversal", "out/../../etc"],
    ["absolute unix", "/etc/passwd"],
    ["drive letter", "C:/Windows/System32"],
    ["backslash", "out\\chart.html"],
    ["nul byte", "ev\u0000il.txt"],
    ["dot segment", "./main.py"],
    ["double slash empty segment", "out//chart.html"],
  ])("rejects %s", (_label, input) => {
    expect(() => safeRelativePath(input)).toThrow();
  });

  it("rejects paths longer than 256 chars", () => {
    expect(() => safeRelativePath("a".repeat(257))).toThrow(/256/);
  });
});

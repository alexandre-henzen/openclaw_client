// Rejects path traversal, absolute paths, drive letters, NUL bytes, backslashes.
// Mirrors src/lib/sandbox/paths.ts (RUN_CODE_TOOL_SPEC §6/T19).

const MAX_PATH = 256;

export function safeRelativePath(input: string): string {
  if (typeof input !== "string") throw new Error("path must be a string");
  if (input.length === 0) throw new Error("path is empty");
  if (input.length > MAX_PATH) throw new Error(`path > ${MAX_PATH} chars`);
  if (input.includes("\0")) throw new Error("path contains NUL");
  if (input.includes("\\")) throw new Error("backslash not allowed in path");
  if (/^[A-Za-z]:/.test(input)) throw new Error("drive-letter path not allowed");
  if (input.startsWith("/")) throw new Error("absolute path not allowed");
  const parts = input.split("/");
  for (const seg of parts) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new Error(`invalid path segment: ${JSON.stringify(seg)}`);
    }
  }
  return input;
}

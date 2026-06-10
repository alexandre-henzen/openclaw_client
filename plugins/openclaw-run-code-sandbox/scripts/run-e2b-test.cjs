const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { fileURLToPath } = require("node:url");

const here = dirname(__filename);
const pluginRoot = resolve(here, "..");
const repoRoot = resolve(pluginRoot, "..", "..");
const envPath = resolve(repoRoot, ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    process.env[key] = value;
  }
}

const args = [
  resolve(pluginRoot, "node_modules", "vitest", "vitest.mjs"),
  "run",
  "tests/integration/e2b.test.ts",
  "--testTimeout=120000",
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, args, {
  cwd: pluginRoot,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
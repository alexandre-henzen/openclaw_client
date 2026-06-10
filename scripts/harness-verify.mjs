#!/usr/bin/env node
/**
 * Harness verify — full verification pyramid (SPEC-001 + refatoracao-inicial.spec §Verify).
 *
 * 1. harness:check     — domain/security invariants (AGENTS.md)
 * 2. lint              — static hygiene (typescript-eslint, not style presets)
 * 3. build + unit/int  — tsc + node:test + vitest
 * 4. smokes G1–G17     — runtime (API must be up unless HARNESS_SKIP_SMOKE=1)
 * 5. Playwright @live  — real user journeys (default; HARNESS_E2E_MOCKED=1 for offline)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.join(ROOT, 'api');
const CLIENT = path.join(ROOT, 'client');

function run(label, cmd, args, cwd = ROOT) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\n❌ FAILED: ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  console.log(`✅ ${label}`);
}

// --- Layer 0: domain invariants ---
run('harness:check (invariantes I-01..I-14)', 'npm', ['run', 'harness:check']);

// --- Layer 1: static hygiene ---
run('api lint (typescript-eslint, src/)', 'npm', ['run', 'lint'], API);
run('client lint', 'npm', ['run', 'lint'], CLIENT);

// --- Layer 2: compile ---
run('api build (TypeScript)', 'npm', ['run', 'build'], API);
run('client build', 'npm', ['run', 'build'], CLIENT);

// --- Layer 3: unit + integration (no live stack required) ---
run('api unit + integration tests', 'npm', ['run', 'test'], API);
run('client unit tests (Vitest)', 'npm', ['run', 'test'], CLIENT);

// --- Layer 4: runtime smokes (API + gateway) ---
const skipSmoke = process.env.HARNESS_SKIP_SMOKE === '1';
if (skipSmoke) {
  console.log('\n⚠️  HARNESS_SKIP_SMOKE=1 — pulando smoke runtime');
} else {
  run('smoke-copilot (runtime, API must be up)', 'node', [
    '--test',
    'tests/harness/smoke-copilot.mjs',
  ], API);
  run('smoke-artifacts G13–G17 (runtime, API must be up)', 'node', [
    '--test',
    'tests/harness/smoke-artifacts.mjs',
  ], API);
}

// --- Layer 5: Playwright e2e ---
const skipE2e = process.env.HARNESS_SKIP_E2E === '1';
if (skipE2e) {
  console.log('\n⚠️  HARNESS_SKIP_E2E=1 — pulando Playwright E2E');
} else if (process.env.HARNESS_E2E_MOCKED === '1') {
  run('playwright E2E mocked (G11 offline)', 'npm', ['run', 'test:e2e:mocked']);
} else {
  const e2eEnv = {
    ...process.env,
    E2E_LIVE: '1',
    PLAYWRIGHT_SKIP_WEBSERVER: '1',
  };
  console.log('\n▶ playwright E2E live (G11, API+client+gateway must be up)');
  const r = spawnSync('npm', ['run', 'test:e2e:live'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: e2eEnv,
  });
  if (r.status !== 0) {
    console.error('\n❌ FAILED: playwright E2E live (exit ' + r.status + ')');
    process.exit(r.status ?? 1);
  }
  console.log('✅ playwright E2E live');
}

console.log('\n✅ harness:verify — all gates passed');

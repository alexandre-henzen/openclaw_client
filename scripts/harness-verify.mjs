#!/usr/bin/env node
/**
 * Harness verify — runs all mechanical + runtime gates for SPEC-001.
 * Feed-forward: invariants grep, compile, fixture parser.
 * Feedback: smoke-copilot (requires API running).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.join(ROOT, 'api');

function run(label, cmd, args, cwd = ROOT) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\n❌ FAILED: ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  console.log(`✅ ${label}`);
}

run('harness:check (invariantes I-01..I-14)', 'npm', ['run', 'harness:check']);
run('api build (TypeScript)', 'npm', ['run', 'build'], API);
run('agui fixture parser', 'npm', ['run', 'test:agui:fixtures'], API);
run('artifact mime-policy', 'npm', ['run', 'test:artifacts'], API);
run('run-code observer integration', 'npm', ['run', 'test:artifacts:observer'], API);
run('client build', 'npm', ['run', 'build'], path.join(ROOT, 'client'));

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

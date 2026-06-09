#!/usr/bin/env node
/**
 * Mechanical enforcement of AGENTS.md invariants (harness feed-forward).
 * Exit 0 = pass, 1 = violations found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_SRC = path.join(ROOT, 'client', 'src');

const violations = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

function checkClientNoOpenClawSessionKeyHeader() {
  const files = walk(CLIENT_SRC);
  const needle = 'X-OpenClaw-Session-Key';
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(needle)) {
      violations.push({
        rule: 'I-02',
        file: path.relative(ROOT, file),
        message:
          'client must not set X-OpenClaw-Session-Key — backend injects it (AGENTS.md #2).',
      });
    }
  }
}

function checkClientNoDirectGatewayFetch() {
  const files = walk(CLIENT_SRC);
  const patterns = [
    /fetch\s*\(\s*[`'"][^`'"]*:18789/,
    /fetch\s*\(\s*[`'"][^`'"]*\/v1\/clawg-ui/,
    /ws:\/\/127\.0\.0\.1:18789/,
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of patterns) {
      if (re.test(text)) {
        violations.push({
          rule: 'I-04',
          file: path.relative(ROOT, file),
          message:
            'client must not call gateway/clawg-ui directly — use /api/copilotkit (AGENTS.md #4).',
        });
        break;
      }
    }
  }
}

function checkClientNoDeviceTokenLeak() {
  const files = walk(CLIENT_SRC);
  const needles = ['clawg_ui_device_token', 'clawgUiDeviceToken', 'OPENCLAW_GATEWAY_TOKEN'];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const needle of needles) {
      if (text.includes(needle)) {
        violations.push({
          rule: 'I-01/I-03',
          file: path.relative(ROOT, file),
          message: `client must not reference ${needle} (AGENTS.md #1/#3).`,
        });
      }
    }
  }
}

function checkRequiredDocs() {
  const required = [
    'AGENTS.md',
    'docs/COPILOTKIT_REFACTOR_SPEC.md',
    'docs/DECISIONS.md',
    'docs/HARNESS_REPORT.md',
  ];
  for (const rel of required) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      violations.push({
        rule: 'harness',
        file: rel,
        message: 'missing required harness document',
      });
    }
  }
}

function checkArtifactIframeSandbox() {
  const host = path.join(CLIENT_SRC, 'features', 'artifact', 'ui', 'VisualArtifactHost.tsx');
  if (!fs.existsSync(host)) {
    violations.push({
      rule: 'I-09',
      file: 'client/src/features/artifact/ui/VisualArtifactHost.tsx',
      message: 'VisualArtifactHost missing (SPEC-002 artifacts)',
    });
    return;
  }
  const text = fs.readFileSync(host, 'utf8');
  if (!/sandbox="allow-scripts allow-forms"/.test(text)) {
    violations.push({
      rule: 'I-09',
      file: path.relative(ROOT, host),
      message: 'iframe must use sandbox="allow-scripts allow-forms" (AGENTS.md #9)',
    });
  }
  if (/allow-same-origin/.test(text)) {
    violations.push({
      rule: 'I-09',
      file: path.relative(ROOT, host),
      message: 'iframe must NOT include allow-same-origin (AGENTS.md #9)',
    });
  }
}

function checkPlaywrightHarness() {
  const required = [
    'playwright.config.ts',
    'tests/e2e/chat-mocked.spec.ts',
    'tests/e2e/chat-live.spec.ts',
    'tests/e2e/artifacts-live.spec.ts',
    'tests/e2e/artifacts-pie-chart-live.spec.ts',
    'tests/e2e/helpers/mock-routes.ts',
  ];
  for (const rel of required) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      violations.push({
        rule: 'harness-e2e',
        file: rel,
        message: 'missing Playwright harness file (SPEC §11.2)',
      });
    }
  }
}

checkRequiredDocs();
checkPlaywrightHarness();
checkClientNoOpenClawSessionKeyHeader();
checkClientNoDirectGatewayFetch();
checkClientNoDeviceTokenLeak();
checkArtifactIframeSandbox();

if (violations.length === 0) {
  console.log('✅ harness:check — all invariant scans passed');
  process.exit(0);
}

console.error('❌ harness:check — invariant violations:\n');
for (const v of violations) {
  console.error(`  [${v.rule}] ${v.file}: ${v.message}`);
}
process.exit(1);

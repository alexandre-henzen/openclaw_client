/**
 * Integration — RunCodeObserver + SQLite + artifact store (real DB, no HTTP).
 * Requires: npm run build
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, before, after } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-artifact-int-'));
const dbPath = path.join(tmpDir, 'harness.sqlite');

let AppDataSource;
let VisualArtifact;
let RunCodeObserver;

function ev(type, data) {
  return { type, data };
}

async function importBuild(rel) {
  return import(pathToFileURL(path.join(ROOT, 'build', 'src', rel)).href);
}

before(async () => {
  process.env.DB_PATH = dbPath;
  process.chdir(ROOT);

  const dsMod = await importBuild('data-source.js');
  const entMod = await importBuild('entities/VisualArtifact.js');
  const obsMod = await importBuild('services/openclaw/run-code-observer.js');

  AppDataSource = dsMod.default?.default ?? dsMod.default;
  VisualArtifact = entMod.default?.default ?? entMod.default;
  RunCodeObserver = obsMod.RunCodeObserver;

  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
});

after(async () => {
  if (AppDataSource?.isInitialized) await AppDataSource.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function listArtifacts(conversationId) {
  const repo = AppDataSource.getRepository(VisualArtifact);
  return repo.find({ where: { conversationId }, order: { createdAt: 'ASC' } });
}

async function waitForArtifacts(conversationId, count, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const rows = await listArtifacts(conversationId);
    if (rows.length >= count) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
  return listArtifacts(conversationId);
}

test('observer persists html-sandbox artifact from run_code chart fixture', async () => {
  const conversationId = 9001;
  const chartPayload = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, 'run-code-chart.payload.json'), 'utf8')
  );

  const observer = new RunCodeObserver(conversationId);
  observer.observe(ev('TOOL_CALL_START', { toolCallId: 'tc_chart', toolCallName: 'run_code' }));
  observer.observe(
    ev('TOOL_CALL_RESULT', { toolCallId: 'tc_chart', result: chartPayload })
  );

  const rows = await waitForArtifacts(conversationId, 1);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.protocol, 'html-sandbox');
  assert.equal(row.mimeType, 'text/html');
  assert.equal(row.title, 'out/harness-chart.html');
  assert.match(row.storageRef ?? '', /^fs:[0-9a-f]{64}$/);
  assert.equal(row.metadataJson?.source, 'run_code');
});

test('observer persists download artifact for CSV fixture', async () => {
  const conversationId = 9002;
  const csvPayload = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, 'run-code-csv.payload.json'), 'utf8')
  );

  const observer = new RunCodeObserver(conversationId);
  observer.observe(ev('TOOL_CALL_START', { toolCallId: 'tc_csv', toolCallName: 'run_code' }));
  observer.observe(ev('TOOL_CALL_RESULT', { toolCallId: 'tc_csv', result: csvPayload }));

  const rows = await waitForArtifacts(conversationId, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].protocol, 'download');
  assert.equal(rows[0].mimeType, 'text/csv');
  assert.ok(rows[0].storageRef);
});

test('observer ignores non-run_code tools', async () => {
  const conversationId = 9003;
  const chartPayload = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, 'run-code-chart.payload.json'), 'utf8')
  );
  const observer = new RunCodeObserver(conversationId);
  observer.observe(ev('TOOL_CALL_START', { toolCallId: 'tc_exec', toolCallName: 'exec' }));
  observer.observe(ev('TOOL_CALL_RESULT', { toolCallId: 'tc_exec', result: chartPayload }));
  await new Promise((r) => setTimeout(r, 300));
  const rows = await listArtifacts(conversationId);
  assert.equal(rows.length, 0);
});

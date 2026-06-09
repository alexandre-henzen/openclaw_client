/**
 * Harness smoke — visual artifacts (SPEC-002).
 * Real stack: SQLite + artifact store + HTTP routes (API must be running).
 *
 * Gates G13–G17: run_code observer → list → frame → download
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, before } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:18802/api';
const LOGIN_EMAIL = process.env.HARNESS_LOGIN_EMAIL ?? 'admin@admin.com';
const LOGIN_PASSWORD = process.env.HARNESS_LOGIN_PASSWORD ?? '123456';

let jwt = '';
let conversationId = 0;
let appSessionToken = '';
let chartArtifactId = 0;
let csvArtifactId = 0;
let ormReady = false;

async function ensureOrm() {
  if (ormReady) return;
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^DB_PATH=(.+)$/);
      if (m) process.env.DB_PATH = m[1].trim();
    }
  }
  process.chdir(ROOT);
  const dsMod = await import(pathToFileURL(path.join(ROOT, 'build', 'src', 'data-source.js')).href);
  const AppDataSource = dsMod.default?.default ?? dsMod.default;
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  ormReady = true;
}

async function api(urlPath, opts = {}) {
  const res = await fetch(`${API_BASE}${urlPath}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { res, json, text };
}

function ev(type, data) {
  return { type, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForArtifactItem(predicate, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const { res, json } = await api(`/conversation/${conversationId}/artifacts`, {
      headers: { 'X-App-Session-Id': appSessionToken },
    });
    assert.equal(res.status, 200);
    const hit = (json?.items ?? []).find(predicate);
    if (hit) return hit;
    await sleep(250);
  }
  const { json } = await api(`/conversation/${conversationId}/artifacts`, {
    headers: { 'X-App-Session-Id': appSessionToken },
  });
  throw new Error(
    `artifact not found in tray; items=${JSON.stringify(json?.items ?? []).slice(0, 500)}`
  );
}

before(async () => {
  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  assert.equal(login.res.status, 200);
  jwt = login.json?.accessToken ?? '';

  const agents = await api('/agent');
  const list = agents.json?.items ?? [];
  const agent = list.find((a) => a?.openclawAgentId === 'main') ?? list[0];
  assert.ok(agent?._id);

  const created = await api('/conversation', {
    method: 'POST',
    body: JSON.stringify({ agentId: agent._id }),
  });
  assert.equal(created.res.status, 200);
  conversationId = created.json?._id;

  const tokenRes = await api(`/conversation/${conversationId}/session-token`);
  appSessionToken = tokenRes.json?.appSessionToken ?? '';
  assert.ok(appSessionToken.includes('.'));

  await ensureOrm();
});

test('G13 — RunCodeObserver surfaces html-sandbox artifact (real DB)', async () => {
  const obsMod = await import(
    pathToFileURL(path.join(ROOT, 'build', 'src', 'services', 'openclaw', 'run-code-observer.js')).href
  );
  const RunCodeObserver = obsMod.RunCodeObserver;
  const chartPayload = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, 'run-code-chart.payload.json'), 'utf8')
  );
  chartPayload.runId = `run_g13_${Date.now()}`;

  const observer = new RunCodeObserver(conversationId);
  observer.observe(ev('TOOL_CALL_START', { toolCallId: 'g13_tc', toolCallName: 'run_code' }));
  observer.observe(ev('TOOL_CALL_RESULT', { toolCallId: 'g13_tc', result: chartPayload }));

  const item = await waitForArtifactItem(
    (a) => a.protocol === 'html-sandbox' && String(a.title).includes('harness-chart')
  );
  chartArtifactId = item.id;
  assert.ok(chartArtifactId > 0);
  assert.equal(item.mimeType, 'text/html');
  assert.notEqual(item.downloadAvailable, false);
});

test('G14 — GET /conversation/:id/artifacts lists run_code tray items', async () => {
  assert.ok(chartArtifactId > 0, 'G13 must run first');
  const { res, json } = await api(`/conversation/${conversationId}/artifacts`, {
    headers: { 'X-App-Session-Id': appSessionToken },
  });
  assert.equal(res.status, 200);
  const ids = (json?.items ?? []).map((i) => i.id);
  assert.ok(ids.includes(chartArtifactId), `tray must include chart artifact ${chartArtifactId}`);
});

test('G15 — artifact frame renders harness chart HTML (iframe payload)', async () => {
  assert.ok(chartArtifactId > 0);
  const res = await fetch(
    `${API_BASE}/artifacts/${chartArtifactId}/frame?st=${encodeURIComponent(appSessionToken)}`
  );
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Harness Chart/);
  assert.match(html, /<svg/i);
  const csp = res.headers.get('content-security-policy') ?? '';
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(!/allow-same-origin/i.test(csp));
});

test('G16 — RunCodeObserver surfaces CSV download artifact', async () => {
  const obsMod = await import(
    pathToFileURL(path.join(ROOT, 'build', 'src', 'services', 'openclaw', 'run-code-observer.js')).href
  );
  const RunCodeObserver = obsMod.RunCodeObserver;
  const csvPayload = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, 'run-code-csv.payload.json'), 'utf8')
  );
  csvPayload.runId = `run_g16_${Date.now()}`;

  const observer = new RunCodeObserver(conversationId);
  observer.observe(ev('TOOL_CALL_START', { toolCallId: 'g16_tc', toolCallName: 'run_code' }));
  observer.observe(ev('TOOL_CALL_RESULT', { toolCallId: 'g16_tc', result: csvPayload }));

  const item = await waitForArtifactItem(
    (a) => a.protocol === 'download' && String(a.title).includes('harness-export.csv')
  );
  csvArtifactId = item.id;
  assert.equal(item.mimeType, 'text/csv');
});

test('G17 — GET /artifacts/:id/download returns CSV bytes', async () => {
  assert.ok(csvArtifactId > 0, 'G16 must run first');
  const res = await fetch(
    `${API_BASE}/artifacts/${csvArtifactId}/download?st=${encodeURIComponent(appSessionToken)}`
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/csv/);
  const body = await res.text();
  assert.equal(body, 'a,b\n1,2');
  const disp = res.headers.get('content-disposition') ?? '';
  assert.match(disp, /attachment/i);
  assert.match(disp, /harness-export\.csv/i);
});

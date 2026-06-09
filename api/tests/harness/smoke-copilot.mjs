/**
 * Harness smoke — runtime feedback gates for SPEC-001 (CopilotKit + AG-UI).
 * Requires API running at API_BASE (default http://127.0.0.1:18802/api).
 *
 * Exit 0 = all gates passed. Exit 1 = at least one gate failed.
 */
import assert from 'node:assert/strict';
import { test, before } from 'node:test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:18802/api';
const LOGIN_EMAIL = process.env.HARNESS_LOGIN_EMAIL ?? 'admin@admin.com';
const LOGIN_PASSWORD = process.env.HARNESS_LOGIN_PASSWORD ?? '123456';

let jwt = '';
let conversationId = 0;
let appSessionToken = '';
let mainAgentId = 0;

async function api(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
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

before(async () => {
  const { res, json } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  assert.equal(res.status, 200, `login failed: ${res.status}`);
  jwt = json?.accessToken ?? json?.token ?? '';
  assert.ok(jwt, 'login response missing accessToken');
});

test('G1 — API reachable and JWT auth works', async () => {
  const { res } = await api('/auth/token');
  assert.equal(res.status, 200);
});

test('G2 — CopilotKit runtime route exists (POST not 404)', async () => {
  const { res } = await api('/copilotkit', {
    method: 'POST',
    headers: appSessionToken ? { 'X-App-Session-Id': appSessionToken } : {},
    body: JSON.stringify({}),
  });
  assert.notEqual(res.status, 404, 'copilotkit route missing — check endpoint basePath vs Express mount');
});

test('G3 — AG-UI rejects missing X-App-Session-Id (401)', async () => {
  const { res, json } = await api('/agui', {
    method: 'POST',
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(res.status, 401);
  assert.match(String(json?.error ?? ''), /missing_or_invalid/);
});

test('G4 — pairing/check endpoint responds', async () => {
  const { res, json } = await api('/openclaw/pairing/check', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 200);
  assert.ok(
    ['paired', 'pairing_pending', 'unauthorized', 'error'].includes(json?.status),
    `unexpected pairing status: ${json?.status}`
  );
});

test('G5 — create conversation + mint session token (HMAC)', async () => {
  const agents = await api('/agent');
  assert.equal(agents.res.status, 200);
  const agentList = agents.json?.items ?? agents.json ?? [];
  const list = Array.isArray(agentList) ? agentList : [];
  const first =
    list.find((a) => a?.openclawAgentId === 'main') ??
    list.find((a) => a?.name === 'main') ??
    list[0];
  assert.ok(first?._id, 'no agent available for smoke test');
  mainAgentId = first._id;

  const created = await api('/conversation', {
    method: 'POST',
    body: JSON.stringify({ agentId: first._id }),
  });
  assert.equal(created.res.status, 200);
  conversationId = created.json?._id;
  assert.ok(conversationId, 'conversation create missing _id');
  assert.ok(created.json?.threadId, 'conversation missing threadId');
  assert.ok(created.json?.userScope, 'conversation missing userScope');

  const tokenRes = await api(`/conversation/${conversationId}/session-token`);
  assert.equal(tokenRes.res.status, 200);
  appSessionToken = tokenRes.json?.appSessionToken ?? '';
  assert.ok(appSessionToken.includes('.'), 'appSessionToken must be id.hmac');
  assert.equal(tokenRes.json?.conversationId, conversationId);
});

test('G6 — AG-UI returns 412 when gateway profile not paired', async () => {
  const check = await api('/openclaw/pairing/check', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (check.json?.status === 'paired') {
    // Ambiente já pareado — gate de 412 coberto em instalações novas.
    return;
  }
  const { res, json } = await api('/agui', {
    method: 'POST',
    headers: { 'X-App-Session-Id': appSessionToken },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'probe' }] }),
  });
  assert.equal(res.status, 412);
  assert.equal(json?.error, 'gateway_not_paired');
});

test('G7 — legacy chat route returns Deprecation header', async () => {
  const form = new FormData();
  form.append('conversationId', String(conversationId));
  form.append('text', 'harness deprecation probe');
  const res = await fetch(`${API_BASE}/message/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  assert.equal(res.headers.get('deprecation'), 'true');
});

test('G12 — artifact frame CSP has no allow-same-origin', async () => {
  const { storeText } = await import('../../build/src/services/artifacts/artifact-store.js');
  const dsMod = await import('../../build/src/data-source.js');
  const entMod = await import('../../build/src/entities/VisualArtifact.js');
  const AppDataSource = dsMod.default?.default ?? dsMod.default;
  const VisualArtifact = entMod.default?.default ?? entMod.default;
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();

  const stored = storeText('<!doctype html><html><body><p>probe</p></body></html>');
  const repo = AppDataSource.getRepository(VisualArtifact);
  const row = await repo.save(
    repo.create({
      conversationId,
      runId: 'harness_g12',
      artifactId: `g12_${Date.now()}`,
      protocol: 'html-sandbox',
      title: 'G12 probe',
      mimeType: 'text/html',
      storageRef: stored.storageRef,
      contentHash: stored.contentHash,
    })
  );

  const res = await fetch(
    `${API_BASE}/artifacts/${row._id}/frame?st=${encodeURIComponent(appSessionToken)}`
  );
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy') ?? '';
  assert.ok(csp.length > 0, 'CSP header required');
  assert.ok(!/allow-same-origin/i.test(csp), 'CSP must not include allow-same-origin');
  const html = await res.text();
  assert.match(html, /<p>probe<\/p>/);
});

test('G8 — artifacts list endpoint authZ (401 invalid session)', async () => {
  const [id, mac = ''] = appSessionToken.split('.');
  const flipped = mac.slice(0, -1) + (mac.at(-1) === 'a' ? 'b' : 'a');
  const badToken = `${id}.${flipped}`;
  assert.notEqual(badToken, appSessionToken, 'badToken must differ from valid token');
  const { res } = await api(`/conversation/${conversationId}/artifacts`, {
    headers: { 'X-App-Session-Id': badToken },
  });
  assert.equal(res.status, 401);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryApprovePairingCode(code) {
  if (!code) return false;
  const approve = await api('/openclaw/pairing/approve', {
    method: 'POST',
    body: JSON.stringify({ pairingCode: code }),
  });
  assert.equal(approve.res.status, 200);
  if (approve.json?.status !== 'approved') return false;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const check = await api('/openclaw/pairing/check', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (check.json?.status === 'paired') return true;
  }
  return false;
}

async function ensureGatewayPaired() {
  if (process.env.HARNESS_SKIP_G9 === '1') return false;

  let { json } = await api('/openclaw/pairing/check', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (json?.status === 'paired') return true;

  if (json?.status === 'pairing_pending' && json?.lastPairingCode) {
    if (await tryApprovePairingCode(json.lastPairingCode)) return true;
  }

  const start = await api('/openclaw/pairing/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (start.json?.status === 'paired') return true;

  const code = start.json?.pairingCode ?? json?.lastPairingCode;
  if (start.json?.status === 'pairing_pending' && code) {
    if (await tryApprovePairingCode(code)) return true;
  }

  return false;
}

async function consumeAguiSse(sessionToken, content, timeoutMs = 90_000) {
  const messages =
    content != null && content !== ''
      ? [{ role: 'user', content }]
      : [];
  const res = await fetch(`${API_BASE}/agui`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${jwt}`,
      'X-App-Session-Id': sessionToken,
    },
    body: JSON.stringify({ messages }),
  });

  if (res.status !== 200) {
    const text = await res.text();
    return { status: res.status, body: text, sawRunFinished: false };
  }

  const reader = res.body?.getReader();
  if (!reader) return { status: res.status, body: '', sawRunFinished: false };

  const decoder = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + timeoutMs;
  let sawRunFinished = false;

  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (/RUN_FINISHED|run\.finished/i.test(buf)) {
        sawRunFinished = true;
        break;
      }
      if (/RUN_ERROR|run\.error/i.test(buf)) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* noop */
    }
  }

  return { status: res.status, body: buf, sawRunFinished };
}

test('G9 — AG-UI paired gateway streams RUN_FINISHED', async (t) => {
  if (process.env.HARNESS_SKIP_G9 === '1') {
    t.skip('HARNESS_SKIP_G9=1');
    return;
  }

  const paired = await ensureGatewayPaired();
  assert.ok(paired, 'gateway must be paired for G9 — run pairing/start + approve first');

  // Empty messages = same probe as pairing/check (fast RUN_FINISHED without LLM latency).
  const { status, body, sawRunFinished } = await consumeAguiSse(appSessionToken, null);

  assert.equal(status, 200, `agui stream expected 200, got ${status}: ${body.slice(0, 300)}`);
  assert.ok(sawRunFinished, `SSE must contain RUN_FINISHED; got: ${body.slice(0, 500)}`);
});

test('G10 — AG-UI real user message streams assistant text + RUN_FINISHED', async (t) => {
  if (process.env.HARNESS_SKIP_G10 === '1') {
    t.skip('HARNESS_SKIP_G10=1');
    return;
  }

  const paired = await ensureGatewayPaired();
  assert.ok(paired, 'gateway must be paired for G10');

  const created = await api('/conversation', {
    method: 'POST',
    body: JSON.stringify({ agentId: mainAgentId }),
  });
  assert.equal(created.res.status, 200);
  const tokenRes = await api(`/conversation/${created.json?._id}/session-token`);
  const g10Token = tokenRes.json?.appSessionToken ?? '';

  const timeoutMs = Number(process.env.HARNESS_LLM_TIMEOUT_MS ?? 180_000);
  const { status, body, sawRunFinished } = await consumeAguiSse(
    g10Token,
    'Responda somente com a palavra sim. Não use ferramentas.',
    timeoutMs
  );

  assert.equal(status, 200, `agui stream expected 200, got ${status}: ${body.slice(0, 300)}`);
  assert.match(body, /TEXT_MESSAGE_CONTENT/i, 'SSE must include assistant text deltas');
  assert.ok(sawRunFinished, `SSE must contain RUN_FINISHED; got: ${body.slice(0, 500)}`);
});

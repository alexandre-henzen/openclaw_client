/**
 * Integration — clawg-ui proxy (real temp SQLite + real local HTTP upstream, no mocks).
 * Locks the AGENTS.md invariants:
 *  - backend injects Authorization (decrypted device token), X-OpenClaw-Agent-Id and
 *    X-OpenClaw-Session-Key (inv. 3, 7);
 *  - client-registered `run_code` tool is filtered out of `tools` (inv. 14);
 *  - sandbox system directive + forwardedProps are enforced;
 *  - every AG-UI event is persisted in agui_events (inv. 10) and the run is tracked.
 * Requires: npm run build
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, before, after } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'agui-basic-text.sse');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-proxy-int-'));
const dbPath = path.join(tmpDir, 'proxy.sqlite');

const DEVICE_TOKEN = 'device-token-plaintext-for-test';

let AppDataSource;
let entities;
let proxyMod;
let cryptoMod;

let upstreamServer;
let upstreamUrl;
/** Captured by the fake clawg-ui upstream on each request. */
let captured;

async function importBuild(rel) {
  const built = path.join(ROOT, 'build', 'src', rel);
  assert.ok(fs.existsSync(built), `missing ${built} — run "npm run build" first`);
  return import(pathToFileURL(built).href);
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.APP_AUTH_SECRET = 'proxy-int-test-secret-0123456789abcdef0123';
  process.chdir(ROOT);

  const dsMod = await importBuild('data-source.js');
  const entMod = await importBuild('entities/index.js');
  entities = entMod.default ?? entMod;
  proxyMod = await importBuild('services/agui/clawg-ui-proxy.js');
  cryptoMod = await importBuild('services/security/crypto.js');

  AppDataSource = dsMod.default?.default ?? dsMod.default;
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();

  // Fake clawg-ui upstream: real HTTP server replaying the SSE fixture.
  const sse = fs.readFileSync(FIXTURE, 'utf8');
  upstreamServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      captured = { method: req.method, headers: req.headers, body: JSON.parse(body) };
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(sse);
    });
  });
  await new Promise((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve));
  upstreamUrl = `http://127.0.0.1:${upstreamServer.address().port}/v1/clawg-ui`;
});

after(async () => {
  if (upstreamServer) await new Promise((resolve) => upstreamServer.close(resolve));
  if (AppDataSource?.isInitialized) await AppDataSource.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function createConversation() {
  const agentRepo = AppDataSource.getRepository(entities.Agent);
  const convRepo = AppDataSource.getRepository(entities.Conversation);
  const agent = await agentRepo.save(
    agentRepo.create({ name: 'Proxy Test Agent', openclawAgentId: 'main', createdBy: 1 })
  );
  return convRepo.save(
    convRepo.create({ agentId: agent._id, title: 'proxy test', createdBy: 1 })
  );
}

function buildOpts(conversation, input) {
  const now = new Date().toISOString();
  return {
    profile: {
      id: 'default',
      name: 'default',
      gatewayUrl: 'http://127.0.0.1:1',
      clawgUiUrl: upstreamUrl,
      clawgUiDeviceTokenEnc: cryptoMod.encryptString(DEVICE_TOKEN),
      pairingStatus: 'paired',
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: String(conversation._id),
      gatewayProfileId: 'default',
      agentId: 'main',
      title: 'proxy test',
      threadId: 'thread_test_0001',
      userScope: 'u:0123abcd4567ef89',
      status: 'idle',
      createdAt: now,
      updatedAt: now,
    },
    conversationId: conversation._id,
    input,
  };
}

async function readAll(webResponse) {
  const reader = webResponse.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

test('proxy injects clawg headers, filters run_code, and persists every AG-UI event', async () => {
  const conversation = await createConversation();
  const opts = buildOpts(conversation, {
    runId: 'run_proxy_test_1',
    tools: [
      { name: 'run_code', description: 'client-registered, must be filtered' },
      { name: 'searchWeb', description: 'kept' },
    ],
    messages: [{ id: 'u1', role: 'user', content: 'olá' }],
  });

  const res = await proxyMod.proxyToClawgUi(opts);
  assert.equal(res.headers.get('Content-Type'), 'text/event-stream');
  const sseOut = await readAll(res);

  // --- upstream request: headers injected by the backend (inv. 3 & 7) ---
  assert.equal(captured.method, 'POST');
  assert.equal(captured.headers.authorization, `Bearer ${DEVICE_TOKEN}`);
  assert.equal(captured.headers['x-openclaw-agent-id'], 'main');
  assert.equal(captured.headers['x-openclaw-session-key'], 'u:0123abcd4567ef89');

  // --- run_code filtered from tools; other tools preserved (inv. 14) ---
  const toolNames = captured.body.tools.map((t) => t.name);
  assert.ok(!toolNames.includes('run_code'), 'run_code must be filtered out');
  assert.ok(toolNames.includes('searchWeb'));

  // --- sandbox policy: system directive + forwardedProps ---
  const sys = captured.body.messages.find((m) => m.role === 'system');
  assert.ok(sys, 'sandbox system message injected');
  assert.match(sys.content, /^SANDBOX EXECUTION POLICY/);
  assert.equal(captured.body.forwardedProps.preferredTool, 'run_code');
  assert.deepEqual(captured.body.forwardedProps.disabledTools, [
    'write',
    'write_file',
    'exec',
    'canvas',
    'nodes',
  ]);

  // --- session pinning ---
  assert.equal(captured.body.threadId, 'thread_test_0001');
  assert.equal(captured.body.runId, 'run_proxy_test_1');

  // --- downstream SSE re-emitted ---
  assert.match(sseOut, /event: RUN_STARTED/);
  assert.match(sseOut, /Olá /);
  assert.match(sseOut, /event: RUN_FINISHED/);

  // --- agui_events persisted in order (inv. 10) ---
  const evRepo = AppDataSource.getRepository(entities.AguiEvent);
  const rows = await evRepo.find({
    where: { conversationId: conversation._id, runId: 'run_proxy_test_1' },
    order: { seq: 'ASC' },
  });
  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.map((r) => r.eventType),
    [
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]
  );
  assert.deepEqual(rows.map((r) => r.seq), [1, 2, 3, 4, 5, 6]);

  // --- run lifecycle tracked ---
  // finishRun executes in the stream's finally block, which may settle just
  // after controller.close() unblocks the reader: poll briefly.
  const runRepo = AppDataSource.getRepository(entities.CopilotRun);
  let run;
  const deadline = Date.now() + 5000;
  do {
    run = await runRepo.findOne({
      where: { conversationId: conversation._id, runId: 'run_proxy_test_1' },
    });
    if (run?.status !== 'started') break;
    await new Promise((r) => setTimeout(r, 50));
  } while (Date.now() < deadline);
  assert.equal(run.status, 'finished');
  assert.ok(run.finishedAt);

  const convRepo = AppDataSource.getRepository(entities.Conversation);
  const freshConv = await convRepo.findOneBy({ _id: conversation._id });
  assert.equal(freshConv.copilotStatus, 'idle');
  assert.ok(freshConv.lastMessageAt, 'lastMessageAt touched after finished run');
});

test('proxy refuses to run against an unpaired profile (device token never optional)', async () => {
  const conversation = await createConversation();
  const opts = buildOpts(conversation, { messages: [] });
  delete opts.profile.clawgUiDeviceTokenEnc;

  await assert.rejects(() => proxyMod.proxyToClawgUi(opts), /not paired/);
});

test('proxy returns 502 when upstream is unreachable (degraded mode, no crash)', async () => {
  const conversation = await createConversation();
  const opts = buildOpts(conversation, { messages: [] });
  opts.profile.clawgUiUrl = 'http://127.0.0.1:9/unreachable';

  const res = await proxyMod.proxyToClawgUi(opts);
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, 'upstream_connect_failed');
});

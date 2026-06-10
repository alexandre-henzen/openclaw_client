/**
 * Sobe o stack OpenClaw + clawg-ui via docker-compose.yml na raiz do repositório.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncCopilotEnv } from './sync-copilot-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = path.join(ROOT, 'docker-compose.yml');
const ENV_FILE = path.join(ROOT, '.env');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const PROJECT = 'openclaw';

const GATEWAY_SERVICES = [
  'piston',
  'piston-packages-setup',
  'openclaw-clawg-ui-setup',
  'openclaw-run-code-sandbox-setup',
  'openclaw-sandbox-skill-setup',
  'korp-mcp-gateway',
  'openclaw-gateway',
  'openclaw-pairing-helper',
];

function docker(args, { inherit = false, cwd = ROOT } = {}) {
  return spawnSync('docker', args, {
    cwd,
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
}

function compose(args, { inherit = false } = {}) {
  if (!fs.existsSync(COMPOSE)) {
    throw new Error(`docker-compose não encontrado: ${COMPOSE}`);
  }
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(
      `.env na raiz não encontrado — copie de ${path.basename(ENV_EXAMPLE)} e preencha os segredos`
    );
  }
  const base = ['compose', '-f', COMPOSE, '--env-file', ENV_FILE, '-p', PROJECT];
  return docker([...base, ...args], { inherit });
}

function gatewayHealthy() {
  const r = docker([
    'inspect',
    '--format',
    '{{.State.Health.Status}}',
    `${PROJECT}-openclaw-gateway-1`,
  ]);
  if (r.status !== 0) return false;
  return (r.stdout || '').trim() === 'healthy';
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function waitGateway(ms = 180_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (gatewayHealthy()) return true;
    sleepMs(3000);
  }
  return gatewayHealthy();
}

export function isGatewayHealthy() {
  return gatewayHealthy();
}

export function cmdUp({ exitOnFail = true } = {}) {
  syncCopilotEnv({ quiet: true });
  console.log('🦞 Subindo OpenClaw gateway + clawg-ui (docker-compose.yml)...');
  const r = compose(['up', '-d', ...GATEWAY_SERVICES], { inherit: true });
  if (r.status !== 0) {
    if (exitOnFail) process.exit(r.status ?? 1);
    return false;
  }
  console.log('⏳ Aguardando openclaw-gateway healthy...');
  if (!waitGateway()) {
    console.warn('⚠️  Gateway ainda não reportou healthy — verifique: npm run openclaw:logs');
    if (exitOnFail) process.exit(1);
    return false;
  }
  console.log('✅ OpenClaw gateway pronto em http://127.0.0.1:18789');
  console.log('✅ Pairing helper em http://127.0.0.1:18790');
  return true;
}

function cmdEnsure() {
  syncCopilotEnv({ quiet: true });
  if (gatewayHealthy()) {
    console.log('✅ OpenClaw gateway já está healthy');
    return;
  }
  cmdUp({ exitOnFail: false });
}

function cmdDown() {
  const r = compose(['down'], { inherit: true });
  process.exit(r.status ?? 0);
}

function cmdStatus() {
  compose(['ps'], { inherit: true });
  const healthy = gatewayHealthy();
  console.log(`\nGateway healthy: ${healthy ? 'yes' : 'no'}`);
  if (healthy) {
    const probe = docker([
      'exec',
      `${PROJECT}-openclaw-gateway-1`,
      'node',
      '-e',
      "fetch('http://127.0.0.1:18789/v1/clawg-ui',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[],threadId:'probe',runId:'probe'})}).then(r=>console.log('clawg-ui',r.status)).catch(e=>console.log('clawg-ui err',e.message))",
    ]);
    if (probe.stdout) process.stdout.write(probe.stdout);
    if (probe.stderr) process.stderr.write(probe.stderr);
  }
}

function cmdLogs() {
  compose(['logs', '-f', 'openclaw-gateway', 'openclaw-pairing-helper'], { inherit: true });
}

function cmdRecreate() {
  syncCopilotEnv({ quiet: true });
  console.log('🔄 Recriando clawg-ui setup + gateway...');
  compose(['rm', '-sf', 'openclaw-clawg-ui-setup', 'openclaw-gateway'], { inherit: true });
  const r = compose(['up', '-d', ...GATEWAY_SERVICES], { inherit: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
  if (!waitGateway()) process.exit(1);
  console.log('✅ Stack recriado');
}

const cmd = process.argv[2] ?? 'up';
switch (cmd) {
  case 'up':
    cmdUp();
    break;
  case 'ensure':
    cmdEnsure();
    break;
  case 'down':
    cmdDown();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'logs':
    cmdLogs();
    break;
  case 'recreate':
    cmdRecreate();
    break;
  default:
    console.error(`Uso: node scripts/openclaw-stack.mjs <up|ensure|down|status|logs|recreate>`);
    process.exit(1);
}

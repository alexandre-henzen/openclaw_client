/**
 * Propaga variáveis do stack OpenClaw (copilotkit/.env) para api/.env.
 * Mantém JWT_SECRET e demais chaves locais da API; só atualiza chaves do gateway.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COPILOT_ENV = path.join(ROOT, 'copilotkit', '.env');
const API_ENV = path.join(ROOT, 'api', '.env');

const SYNC_KEYS = [
  'OPENCLAW_GATEWAY_URL',
  'OPENCLAW_GATEWAY_TOKEN',
  'OPENCLAW_GATEWAY_PORT',
  'OPENCLAW_CLAWG_UI_PATH',
  'OPENCLAW_PAIRING_APPROVE_URL',
  'OPENCLAW_CONFIG_DIR',
  'OPENCLAW_WORKSPACE_DIR',
];

const DERIVED = {
  OPENCLAW_HOME: 'OPENCLAW_CONFIG_DIR',
  OPENCLAW_STATE_DIR: 'OPENCLAW_CONFIG_DIR',
  OPENCLAW_CLAWG_UI_PATH: () => '/v1/clawg-ui',
  OPENCLAW_GATEWAY_URL: (src) =>
    `http://127.0.0.1:${src.OPENCLAW_GATEWAY_PORT ?? '18789'}`,
  OPENCLAW_USE_DOCKER_PAIRING: () => '1',
};

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function serializeEnv(lines) {
  return `${lines.join('\n')}\n`;
}

export function syncCopilotEnv({ quiet = false } = {}) {
  const src = parseEnv(COPILOT_ENV);
  if (!Object.keys(src).length) {
    if (!quiet) {
      console.warn('[sync-copilot-env] copilotkit/.env não encontrado — pulando sync');
    }
    return false;
  }

  if (!src.OPENCLAW_CLAWG_UI_PATH) src.OPENCLAW_CLAWG_UI_PATH = '/v1/clawg-ui';
  if (!src.OPENCLAW_PAIRING_APPROVE_URL) {
    src.OPENCLAW_PAIRING_APPROVE_URL = 'http://127.0.0.1:18790';
  }

  const apiExisting = parseEnv(API_ENV);
  const apiLines = fs.existsSync(API_ENV) ? fs.readFileSync(API_ENV, 'utf8').split('\n') : [];
  const seen = new Set();
  const out = [];

  for (const line of apiLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      out.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    seen.add(key);
    if (SYNC_KEYS.includes(key) && src[key] !== undefined) {
      out.push(`${key}=${src[key]}`);
    } else if (key in DERIVED) {
      const d = DERIVED[key];
      if (typeof d === 'string' && src[d] !== undefined) {
        out.push(`${key}=${src[d]}`);
      } else if (typeof d === 'function') {
        out.push(`${key}=${d(src)}`);
      } else {
        out.push(line);
      }
    } else {
      out.push(line);
    }
  }

  for (const key of SYNC_KEYS) {
    if (!seen.has(key) && src[key] !== undefined) {
      out.push(`${key}=${src[key]}`);
      seen.add(key);
    }
  }
  for (const [key, d] of Object.entries(DERIVED)) {
    if (seen.has(key)) continue;
    if (typeof d === 'string' && src[d] !== undefined) {
      out.push(`${key}=${src[d]}`);
    } else if (typeof d === 'function') {
      out.push(`${key}=${d(src)}`);
    }
  }

  fs.writeFileSync(API_ENV, serializeEnv(out));
  if (!quiet) {
    console.log('[sync-copilot-env] api/.env atualizado a partir de copilotkit/.env');
  }
  return true;
}

const invoked = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (invoked) {
  syncCopilotEnv();
}

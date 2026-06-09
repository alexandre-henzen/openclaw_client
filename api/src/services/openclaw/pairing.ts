import { execFile } from 'child_process';
import { promisify } from 'util';
import { encryptString } from '../security/crypto';
import { logEvent } from '../logging';
import { getGatewayProfile, updateGatewayPairing } from '../gatewayProfileService';
import { buildPairingProbeHeaders } from './clawg-headers';
import { ocExec } from '../openclawGateway';

const execFileAsync = promisify(execFile);

export type PairingStartResult =
  | { status: 'pairing_pending'; pairingCode: string; instructions: string }
  | { status: 'paired' }
  | { status: 'error'; reason: string };

export type PairingCheckResult =
  | { status: 'paired' }
  | { status: 'pairing_pending'; lastPairingCode?: string }
  | { status: 'unauthorized' }
  | { status: 'error'; reason: string };

export type PairingApproveResult = { status: 'approved' } | { status: 'error'; reason: string };

type PairingBody = {
  pairingCode?: string;
  token?: string;
  deviceToken?: string;
  pairing_code?: string;
  bearer_token?: string;
  error?: {
    pairing?: { pairingCode?: string; token?: string };
  };
};

async function safeJson(res: Response): Promise<PairingBody | null> {
  try {
    return (await res.json()) as PairingBody;
  } catch {
    return null;
  }
}

function buildApproveCommand(pairingCode: string): string {
  const template =
    process.env.OPENCLAW_APPROVE_COMMAND ??
    `openclaw pairing approve --channel clawg-ui {code}`;
  return template.replace('{code}', pairingCode);
}

async function probeRunFinished(body: ReadableStream<Uint8Array> | null, timeoutMs = 8000): Promise<boolean> {
  if (!body) return false;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let buf = '';
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (/RUN_FINISHED|run\.finished/i.test(buf)) return true;
      if (/RUN_ERROR|run\.error/i.test(buf)) return false;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* noop */
    }
  }
  return false;
}

export async function startPairing(gatewayProfileId = 'default'): Promise<PairingStartResult> {
  const profile = await getGatewayProfile(gatewayProfileId);
  if (!profile) return { status: 'error', reason: 'gateway_profile_not_found' };
  if (profile.pairingStatus === 'paired') return { status: 'paired' };

  let res: Response;
  try {
    res = await fetch(profile.clawgUiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
  } catch (err) {
    logEvent({ event: 'pairing.start.network_error', level: 'error', error: String(err) });
    return { status: 'error', reason: 'network_error' };
  }

  if (res.status === 403) {
    const body = await safeJson(res);
    const pairingCode =
      body?.error?.pairing?.pairingCode ?? body?.pairingCode ?? body?.pairing_code;
    const pairingToken =
      body?.error?.pairing?.token ?? body?.token ?? body?.deviceToken ?? body?.bearer_token;
    if (pairingCode && pairingToken) {
      await updateGatewayPairing(profile.id, {
        status: 'pairing_pending',
        deviceTokenEnc: encryptString(pairingToken),
        pairingCode,
      });
      return {
        status: 'pairing_pending',
        pairingCode,
        instructions: buildApproveCommand(pairingCode),
      };
    }
    return { status: 'error', reason: 'unexpected_403_body' };
  }

  if (res.ok) {
    await updateGatewayPairing(profile.id, { status: 'paired' });
    return { status: 'paired' };
  }

  if (res.status === 429 && profile.lastPairingCode) {
    return {
      status: 'pairing_pending',
      pairingCode: profile.lastPairingCode,
      instructions: buildApproveCommand(profile.lastPairingCode),
    };
  }

  return { status: 'error', reason: `unexpected_status_${res.status}` };
}

export async function checkPairing(gatewayProfileId = 'default'): Promise<PairingCheckResult> {
  const profile = await getGatewayProfile(gatewayProfileId);
  if (!profile) return { status: 'error', reason: 'gateway_profile_not_found' };

  const headers = buildPairingProbeHeaders(profile);
  if (!headers) {
    return { status: 'pairing_pending', lastPairingCode: profile.lastPairingCode };
  }

  let res: Response;
  try {
    res = await fetch(profile.clawgUiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: [], threadId: 'pairing-probe', runId: 'pairing-probe' }),
    });
  } catch (err) {
    logEvent({ event: 'pairing.check.network_error', level: 'error', error: String(err) });
    // Gateway/clawg-ui down: keep chat usable when DB already paired (AGENTS.md #13).
    if (profile.pairingStatus === 'paired') {
      return { status: 'paired' };
    }
    return { status: 'error', reason: 'network_error' };
  }

  if (res.status === 200) {
    const finished = await probeRunFinished(res.body);
    if (finished) {
      await updateGatewayPairing(profile.id, { status: 'paired' });
      return { status: 'paired' };
    }
    return { status: 'pairing_pending', lastPairingCode: profile.lastPairingCode };
  }
  if (res.status === 403 || res.status === 429) {
    return { status: 'pairing_pending', lastPairingCode: profile.lastPairingCode };
  }
  if (res.status === 401) {
    await updateGatewayPairing(profile.id, { status: 'unauthorized' });
    return { status: 'unauthorized' };
  }
  return { status: 'error', reason: `unexpected_status_${res.status}` };
}

async function approveViaHelper(channel: string, code: string): Promise<boolean> {
  const base = process.env.OPENCLAW_PAIRING_APPROVE_URL?.trim();
  if (!base) return false;
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  const res = await fetch(`${base.replace(/\/$/, '')}/pairing/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ channel, code }),
  });
  return res.ok;
}

async function approveViaCli(channel: string, code: string): Promise<boolean> {
  const home = process.env.OPENCLAW_HOME?.trim();
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || home;
  const opts = {
    encoding: 'utf-8' as const,
    timeout: 30_000,
    env: {
      ...process.env,
      ...(home ? { OPENCLAW_HOME: home } : {}),
      ...(stateDir ? { OPENCLAW_STATE_DIR: stateDir } : {}),
      NO_COLOR: '1',
    },
  };
  try {
    ocExec(['pairing', 'approve', channel, code], opts);
    return true;
  } catch {
    return false;
  }
}

async function approveViaDocker(channel: string, code: string): Promise<boolean> {
  const container = process.env.OPENCLAW_CONTAINER_NAME ?? 'openclaw-openclaw-gateway-1';
  await execFileAsync(
    'docker',
    ['exec', container, 'openclaw', 'pairing', 'approve', '--channel', channel, code],
    { timeout: 30_000 }
  );
  return true;
}

export async function approvePairing(
  gatewayProfileId: string,
  pairingCode: string
): Promise<PairingApproveResult> {
  const profile = await getGatewayProfile(gatewayProfileId);
  if (!profile) return { status: 'error', reason: 'gateway_profile_not_found' };

  const channel = process.env.OPENCLAW_PAIRING_CHANNEL?.trim() || 'clawg-ui';
  const code = pairingCode.trim().toUpperCase();
  if (!code) return { status: 'error', reason: 'missing_pairing_code' };

  try {
    if (await approveViaHelper(channel, code)) return { status: 'approved' };
    if (await approveViaCli(channel, code)) return { status: 'approved' };
    if (
      process.env.OPENCLAW_USE_DOCKER_PAIRING === '1' ||
      process.env.OPENCLAW_PAIRING_APPROVE_URL?.trim()
    ) {
      await approveViaDocker(channel, code);
      return { status: 'approved' };
    }
    return { status: 'error', reason: 'approve_failed' };
  } catch (err) {
    logEvent({ event: 'pairing.approve.failed', level: 'error', error: String(err) });
    return { status: 'error', reason: 'approve_failed' };
  }
}

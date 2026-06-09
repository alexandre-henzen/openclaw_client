import type { ChatSessionRecord, GatewayProfileRecord } from '../../@types/copilot';
import { decryptString } from '../security/crypto';
import { assertValidSessionKey } from '../security/session-scope';

export function buildClawgUiHeaders(
  profile: GatewayProfileRecord,
  session: ChatSessionRecord
): Record<string, string> {
  if (!profile.clawgUiDeviceTokenEnc) {
    throw new Error('gateway profile is not paired');
  }
  assertValidSessionKey(session.userScope);
  const token = decryptString(profile.clawgUiDeviceTokenEnc);
  return {
    Authorization: `Bearer ${token}`,
    'X-OpenClaw-Agent-Id': session.agentId,
    'X-OpenClaw-Session-Key': session.userScope,
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  };
}

export function buildPairingProbeHeaders(
  profile: GatewayProfileRecord
): Record<string, string> | null {
  if (!profile.clawgUiDeviceTokenEnc) return null;
  const token = decryptString(profile.clawgUiDeviceTokenEnc);
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  };
}

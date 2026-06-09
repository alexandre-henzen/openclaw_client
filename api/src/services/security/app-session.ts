import { hmacHex, safeEqualHex } from './crypto';

const INFO = 'app-session-token-v1';

/** Returns "<conversationId>.<hmac>" for browser / CopilotKit headers. */
export function signAppSessionToken(conversationId: string): string {
  const mac = hmacHex(conversationId, INFO);
  return `${conversationId}.${mac}`;
}

export function verifyAppSessionToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0 || idx === token.length - 1) return null;
  const conversationId = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const expected = hmacHex(conversationId, INFO);
  return safeEqualHex(mac, expected) ? conversationId : null;
}

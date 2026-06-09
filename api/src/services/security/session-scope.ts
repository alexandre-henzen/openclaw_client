import { createHash } from 'node:crypto';

const ALLOWED = /^[A-Za-z0-9._@:-]+$/;

/**
 * Build a trusted scope value for X-OpenClaw-Session-Key.
 * Format: u:<sha256(userId + SESSION_KEY_SALT) prefix 16 hex>.
 */
export function buildUserScope(userId: string): string {
  const salt = process.env.SESSION_KEY_SALT ?? '';
  const h = createHash('sha256')
    .update(`${userId}:${salt}`)
    .digest('hex')
    .slice(0, 16);
  return `u:${h}`;
}

export function isValidSessionKey(v: string): boolean {
  if (!v || v.length < 1 || v.length > 256) return false;
  if (v.includes('..') || v.includes('/') || v.includes('\\') || v.includes('\0')) return false;
  return ALLOWED.test(v);
}

export function assertValidSessionKey(v: string): void {
  if (!isValidSessionKey(v)) {
    throw new Error('invalid session key');
  }
}

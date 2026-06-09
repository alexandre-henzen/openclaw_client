import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const KEY_INFO = 'clawg-ui-device-token-v1';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getSecret(): Buffer {
  const raw = process.env.APP_AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('APP_AUTH_SECRET missing or too short (min 32 chars)');
  }
  return Buffer.from(raw, 'utf8');
}

function deriveKey(info: string): Buffer {
  const ikm = getSecret();
  const salt = Buffer.alloc(0);
  const derived = hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf8'), KEY_LENGTH);
  return Buffer.from(derived);
}

/** AES-256-GCM encrypt. Output: base64(iv || ciphertext || tag). */
export function encryptString(plaintext: string, info: string = KEY_INFO): string {
  const key = deriveKey(info);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

export function decryptString(encoded: string, info: string = KEY_INFO): string {
  const key = deriveKey(info);
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('invalid ciphertext');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ct = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** HMAC-SHA256 hex. */
export function hmacHex(message: string, info: string = 'app-session-v1'): string {
  const key = deriveKey(info);
  return createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

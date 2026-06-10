/**
 * Unit — services/security/crypto (AES-256-GCM + HKDF + HMAC).
 * Characterization tests: lock current behavior before any refactor.
 * Requires: npm run build
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, before } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SECRET = 'unit-test-secret-0123456789abcdef0123456789abcdef';

let crypto;

async function loadBuild(rel) {
  const built = path.join(ROOT, 'build', 'src', rel);
  assert.ok(fs.existsSync(built), `missing ${built} — run "npm run build" first`);
  return import(pathToFileURL(built).href);
}

before(async () => {
  process.env.APP_AUTH_SECRET = SECRET;
  crypto = await loadBuild('services/security/crypto.js');
});

test('encryptString/decryptString round-trips utf8 plaintext', () => {
  const plaintext = 'clawg-ui device token — çãé 😀';
  const enc = crypto.encryptString(plaintext);
  assert.notEqual(enc, plaintext);
  assert.equal(crypto.decryptString(enc), plaintext);
});

test('encryptString produces a fresh IV per call (non-deterministic ciphertext)', () => {
  const a = crypto.encryptString('same');
  const b = crypto.encryptString('same');
  assert.notEqual(a, b);
  assert.equal(crypto.decryptString(a), 'same');
  assert.equal(crypto.decryptString(b), 'same');
});

test('decryptString rejects tampered ciphertext (GCM auth tag)', () => {
  const enc = crypto.encryptString('payload');
  const buf = Buffer.from(enc, 'base64');
  buf[buf.length - 1] ^= 0xff; // flip a tag bit
  assert.throws(() => crypto.decryptString(buf.toString('base64')));
});

test('decryptString rejects too-short input', () => {
  assert.throws(() => crypto.decryptString(Buffer.from('short').toString('base64')), /invalid ciphertext/);
});

test('decryptString fails when APP_AUTH_SECRET changes (key derivation)', () => {
  const enc = crypto.encryptString('payload');
  const original = process.env.APP_AUTH_SECRET;
  try {
    process.env.APP_AUTH_SECRET = 'another-secret-0123456789abcdef0123456789abcdef';
    assert.throws(() => crypto.decryptString(enc));
  } finally {
    process.env.APP_AUTH_SECRET = original;
  }
  assert.equal(crypto.decryptString(enc), 'payload');
});

test('throws when APP_AUTH_SECRET is missing or shorter than 32 chars', () => {
  const original = process.env.APP_AUTH_SECRET;
  try {
    delete process.env.APP_AUTH_SECRET;
    assert.throws(() => crypto.encryptString('x'), /APP_AUTH_SECRET/);
    process.env.APP_AUTH_SECRET = 'too-short';
    assert.throws(() => crypto.encryptString('x'), /APP_AUTH_SECRET/);
  } finally {
    process.env.APP_AUTH_SECRET = original;
  }
});

test('hmacHex is deterministic and domain-separated by info', () => {
  const a1 = crypto.hmacHex('message');
  const a2 = crypto.hmacHex('message');
  const b = crypto.hmacHex('message', 'other-info-v1');
  assert.equal(a1, a2);
  assert.match(a1, /^[0-9a-f]{64}$/);
  assert.notEqual(a1, b);
});

test('safeEqualHex compares constant-time and rejects length mismatch/empty', () => {
  const h = crypto.hmacHex('m');
  assert.equal(crypto.safeEqualHex(h, h), true);
  assert.equal(crypto.safeEqualHex(h, crypto.hmacHex('n')), false);
  assert.equal(crypto.safeEqualHex(h, h.slice(0, 32)), false);
  assert.equal(crypto.safeEqualHex('', ''), false);
});

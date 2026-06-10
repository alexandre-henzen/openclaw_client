/**
 * Unit — services/security/app-session (HMAC X-App-Session-Id tokens).
 * Requires: npm run build
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, before } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let appSession;

async function loadBuild(rel) {
  const built = path.join(ROOT, 'build', 'src', rel);
  assert.ok(fs.existsSync(built), `missing ${built} — run "npm run build" first`);
  return import(pathToFileURL(built).href);
}

before(async () => {
  process.env.APP_AUTH_SECRET = 'unit-test-secret-0123456789abcdef0123456789abcdef';
  appSession = await loadBuild('services/security/app-session.js');
});

test('sign/verify round-trips a numeric conversation id', () => {
  const token = appSession.signAppSessionToken('42');
  assert.match(token, /^42\.[0-9a-f]{64}$/);
  assert.equal(appSession.verifyAppSessionToken(token), '42');
});

test('verify rejects a tampered conversation id', () => {
  const token = appSession.signAppSessionToken('42');
  const mac = token.slice(token.lastIndexOf('.') + 1);
  assert.equal(appSession.verifyAppSessionToken(`43.${mac}`), null);
});

test('verify rejects a tampered mac', () => {
  const token = appSession.signAppSessionToken('42');
  const flipped = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
  assert.equal(appSession.verifyAppSessionToken(flipped), null);
});

test('verify rejects malformed tokens', () => {
  assert.equal(appSession.verifyAppSessionToken(null), null);
  assert.equal(appSession.verifyAppSessionToken(undefined), null);
  assert.equal(appSession.verifyAppSessionToken(''), null);
  assert.equal(appSession.verifyAppSessionToken('no-dot'), null);
  assert.equal(appSession.verifyAppSessionToken('.deadbeef'), null);
  assert.equal(appSession.verifyAppSessionToken('42.'), null);
  assert.equal(appSession.verifyAppSessionToken('42.not-hex'), null);
});

test('tokens are invalid after APP_AUTH_SECRET rotation', () => {
  const token = appSession.signAppSessionToken('7');
  const original = process.env.APP_AUTH_SECRET;
  try {
    process.env.APP_AUTH_SECRET = 'rotated-secret-0123456789abcdef0123456789abcdef';
    assert.equal(appSession.verifyAppSessionToken(token), null);
  } finally {
    process.env.APP_AUTH_SECRET = original;
  }
  assert.equal(appSession.verifyAppSessionToken(token), '7');
});

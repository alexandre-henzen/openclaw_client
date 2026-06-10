/**
 * Unit — services/security/session-scope (X-OpenClaw-Session-Key scope).
 * Requires: npm run build
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, before } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let scope;

async function loadBuild(rel) {
  const built = path.join(ROOT, 'build', 'src', rel);
  assert.ok(fs.existsSync(built), `missing ${built} — run "npm run build" first`);
  return import(pathToFileURL(built).href);
}

before(async () => {
  scope = await loadBuild('services/security/session-scope.js');
});

test('buildUserScope returns u:<16 hex> and is deterministic per user+salt', () => {
  process.env.SESSION_KEY_SALT = 'salt-a';
  const a1 = scope.buildUserScope('1');
  const a2 = scope.buildUserScope('1');
  const b = scope.buildUserScope('2');
  assert.match(a1, /^u:[0-9a-f]{16}$/);
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
});

test('buildUserScope changes when SESSION_KEY_SALT changes', () => {
  process.env.SESSION_KEY_SALT = 'salt-a';
  const a = scope.buildUserScope('1');
  process.env.SESSION_KEY_SALT = 'salt-b';
  const b = scope.buildUserScope('1');
  assert.notEqual(a, b);
});

test('isValidSessionKey accepts the allowed charset', () => {
  assert.equal(scope.isValidSessionKey('u:0123abcd4567ef89'), true);
  assert.equal(scope.isValidSessionKey('user@example.com'), true);
  assert.equal(scope.isValidSessionKey('a-b_c.d:e'), true);
});

test('isValidSessionKey rejects traversal, separators and control input', () => {
  assert.equal(scope.isValidSessionKey(''), false);
  assert.equal(scope.isValidSessionKey('a/b'), false);
  assert.equal(scope.isValidSessionKey('a\\b'), false);
  assert.equal(scope.isValidSessionKey('a..b'), false);
  assert.equal(scope.isValidSessionKey('a\0b'), false);
  assert.equal(scope.isValidSessionKey('a b'), false);
  assert.equal(scope.isValidSessionKey('x'.repeat(257)), false);
});

test('assertValidSessionKey throws on invalid input', () => {
  assert.throws(() => scope.assertValidSessionKey('a/b'), /invalid session key/);
  assert.doesNotThrow(() => scope.assertValidSessionKey('u:0123abcd4567ef89'));
});

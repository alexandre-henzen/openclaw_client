/**
 * Integration — auth routes + JWT middleware + blacklist (real Express app, real temp SQLite).
 * Characterization tests for login/logout/token; no mocks.
 * Requires: npm run build
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, before, after } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-auth-int-'));
const dbPath = path.join(tmpDir, 'auth.sqlite');

const EMAIL = 'auth-test@example.com';
const PASSWORD = 's3cret-password';

let AppDataSource;
let User;
let server;
let baseUrl;

async function importBuild(rel) {
  const built = path.join(ROOT, 'build', 'src', rel);
  assert.ok(fs.existsSync(built), `missing ${built} — run "npm run build" first`);
  return import(pathToFileURL(built).href);
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.JWT_SECRET = 'auth-int-test-jwt-secret';
  process.env.APP_AUTH_SECRET = 'auth-int-test-secret-0123456789abcdef012345';
  process.chdir(ROOT);

  const appMod = await importBuild('app.js');
  const dsMod = await importBuild('data-source.js');
  const entMod = await importBuild('entities/index.js');

  AppDataSource = dsMod.default?.default ?? dsMod.default;
  const entities = entMod.default ?? entMod;
  User = entities.User ?? entMod.User;

  if (!AppDataSource.isInitialized) await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  await userRepo.save(
    userRepo.create({ email: EMAIL, password: PASSWORD, name: 'Auth', lastName: 'Test' })
  );
  await userRepo.save(
    userRepo.create({
      email: 'inactive@example.com',
      password: PASSWORD,
      name: 'Inactive',
      lastName: 'User',
      active: false,
    })
  );

  server = http.createServer(appMod.app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (AppDataSource?.isInitialized) await AppDataSource.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function login(email, password) {
  return fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

test('login succeeds with valid credentials and never leaks the password hash', async () => {
  const res = await login(EMAIL, PASSWORD);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.email, EMAIL);
  assert.ok(body.accessToken, 'accessToken in body');
  assert.ok(res.headers.get('access-token'), 'access-token header');
  assert.equal(body.password, undefined, 'password must not be in the response');
});

test('login is case-insensitive on email', async () => {
  const res = await login(EMAIL.toUpperCase(), PASSWORD);
  assert.equal(res.status, 200);
});

test('login fails with wrong password', async () => {
  const res = await login(EMAIL, 'wrong-password');
  assert.equal(res.status, 401);
});

test('login fails for unknown email', async () => {
  const res = await login('nobody@example.com', PASSWORD);
  assert.equal(res.status, 401);
});

test('login fails for inactive user', async () => {
  const res = await login('inactive@example.com', PASSWORD);
  assert.equal(res.status, 401);
});

test('login validation rejects malformed payloads with 422', async () => {
  const res = await login('not-an-email', PASSWORD);
  assert.equal(res.status, 422);
  const res2 = await login(EMAIL, '');
  assert.equal(res2.status, 422);
});

test('GET /auth/token requires a valid bearer token', async () => {
  const noToken = await fetch(`${baseUrl}/auth/token`);
  assert.equal(noToken.status, 401);

  const garbage = await fetch(`${baseUrl}/auth/token`, {
    headers: { Authorization: 'Bearer garbage.token.value' },
  });
  assert.equal(garbage.status, 401);
});

test('GET /auth/token returns the authenticated user', async () => {
  const { accessToken } = await (await login(EMAIL, PASSWORD)).json();
  const res = await fetch(`${baseUrl}/auth/token`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.email, EMAIL);
  assert.equal(body.password, undefined);
});

test('logout blacklists the token (subsequent requests fail with 401)', async () => {
  const { accessToken } = await (await login(EMAIL, PASSWORD)).json();
  const headers = { Authorization: `Bearer ${accessToken}` };

  const beforeLogout = await fetch(`${baseUrl}/auth/token`, { headers });
  assert.equal(beforeLogout.status, 200);

  const logoutRes = await fetch(`${baseUrl}/auth/logout`, { method: 'DELETE', headers });
  assert.equal(logoutRes.status, 200);

  const afterLogout = await fetch(`${baseUrl}/auth/token`, { headers });
  assert.equal(afterLogout.status, 401);
});

test('logout only invalidates the session that called it', async () => {
  const a = await (await login(EMAIL, PASSWORD)).json();
  const b = await (await login(EMAIL, PASSWORD)).json();

  await fetch(`${baseUrl}/auth/logout`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${a.accessToken}` },
  });

  const stillValid = await fetch(`${baseUrl}/auth/token`, {
    headers: { Authorization: `Bearer ${b.accessToken}` },
  });
  assert.equal(stillValid.status, 200);
});

test('tokens signed with a different secret are rejected', async () => {
  const { accessToken } = await (await login(EMAIL, PASSWORD)).json();
  const original = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = 'a-completely-different-secret';
    const res = await fetch(`${baseUrl}/auth/token`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(res.status, 401);
  } finally {
    process.env.JWT_SECRET = original;
  }
});

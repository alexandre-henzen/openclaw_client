import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';

const ENV_KEYS = [
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
  'SEED_ADMIN_NAME',
  'SEED_ADMIN_LAST_NAME',
  'SEED_ADMIN_PHONE',
];

const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function loadReadSeedAdminConfig() {
  const mod = await import('../../build/src/config/seed-admin.js');
  return mod.readSeedAdminConfig ?? mod.default?.readSeedAdminConfig;
}

test('readSeedAdminConfig returns null when email/password missing', async () => {
  delete process.env.SEED_ADMIN_EMAIL;
  delete process.env.SEED_ADMIN_PASSWORD;
  const readSeedAdminConfig = await loadReadSeedAdminConfig();
  assert.equal(readSeedAdminConfig(), null);
});

test('readSeedAdminConfig reads required and optional fields from env', async () => {
  process.env.SEED_ADMIN_EMAIL = ' admin@test.local ';
  process.env.SEED_ADMIN_PASSWORD = 's3cret';
  process.env.SEED_ADMIN_NAME = 'Root';
  process.env.SEED_ADMIN_LAST_NAME = 'Operator';
  process.env.SEED_ADMIN_PHONE = '+5511999999999';

  const readSeedAdminConfig = await loadReadSeedAdminConfig();
  assert.deepEqual(readSeedAdminConfig(), {
    email: 'admin@test.local',
    password: 's3cret',
    name: 'Root',
    lastName: 'Operator',
    phone: '+5511999999999',
  });
});

test('readSeedAdminConfig applies default names when optional env unset', async () => {
  process.env.SEED_ADMIN_EMAIL = 'admin@test.local';
  process.env.SEED_ADMIN_PASSWORD = 's3cret';
  delete process.env.SEED_ADMIN_NAME;
  delete process.env.SEED_ADMIN_LAST_NAME;
  delete process.env.SEED_ADMIN_PHONE;

  const readSeedAdminConfig = await loadReadSeedAdminConfig();
  assert.deepEqual(readSeedAdminConfig(), {
    email: 'admin@test.local',
    password: 's3cret',
    name: 'Admin',
    lastName: 'User',
    phone: null,
  });
});

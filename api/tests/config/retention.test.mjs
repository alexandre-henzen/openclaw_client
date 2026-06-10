import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';

const ENV_KEYS = ['DATA_RETENTION_DAYS', 'DATA_RETENTION_INTERVAL_HOURS'];
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function loadRetentionConfig() {
  const mod = await import('../../build/src/config/retention.js');
  return {
    getRetentionDays: mod.getRetentionDays ?? mod.default?.getRetentionDays,
    getRetentionIntervalHours:
      mod.getRetentionIntervalHours ?? mod.default?.getRetentionIntervalHours,
    computeRetentionCutoff:
      mod.computeRetentionCutoff ?? mod.default?.computeRetentionCutoff,
  };
}

test('getRetentionDays defaults to 7', async () => {
  delete process.env.DATA_RETENTION_DAYS;
  const { getRetentionDays } = await loadRetentionConfig();
  assert.equal(getRetentionDays(), 7);
});

test('getRetentionDays accepts 0 to disable GC', async () => {
  process.env.DATA_RETENTION_DAYS = '0';
  const { getRetentionDays, computeRetentionCutoff } = await loadRetentionConfig();
  assert.equal(getRetentionDays(), 0);
  assert.equal(computeRetentionCutoff(new Date('2026-06-09T12:00:00Z')), null);
});

test('computeRetentionCutoff subtracts configured days', async () => {
  process.env.DATA_RETENTION_DAYS = '3';
  const { computeRetentionCutoff } = await loadRetentionConfig();
  const now = new Date('2026-06-09T12:00:00Z');
  const cutoff = computeRetentionCutoff(now);
  assert.equal(cutoff?.toISOString(), '2026-06-06T12:00:00.000Z');
});

test('getRetentionIntervalHours defaults to 24', async () => {
  delete process.env.DATA_RETENTION_INTERVAL_HOURS;
  const { getRetentionIntervalHours } = await loadRetentionConfig();
  assert.equal(getRetentionIntervalHours(), 24);
});

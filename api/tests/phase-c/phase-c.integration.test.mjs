/**
 * Integration — seed admin from .env on empty DB + data retention purge.
 * Requires: npm run build
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, before, after } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-phase-c-'));
const dbPath = path.join(tmpDir, 'phase-c.sqlite');

let AppDataSource;
let User;
let AguiEvent;
let VisualArtifact;
let seedAdminUser;
let purgeExpiredData;
let storeText;

async function importBuild(rel) {
  const built = path.join(ROOT, 'build', 'src', rel);
  assert.ok(fs.existsSync(built), `missing ${built} — run "npm run build" first`);
  return import(pathToFileURL(built).href);
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.SEED_ADMIN_EMAIL = 'seed@test.local';
  process.env.SEED_ADMIN_PASSWORD = 'seed-pass';
  process.env.DATA_RETENTION_DAYS = '7';
  process.chdir(ROOT);

  const dsMod = await importBuild('data-source.js');
  const entMod = await importBuild('entities/index.js');
  const seedMod = await importBuild('seed.js');
  const retentionMod = await importBuild('services/data-retention.js');
  const storeMod = await importBuild('services/artifacts/artifact-store.js');

  AppDataSource = dsMod.default?.default ?? dsMod.default;
  const entities = entMod.default ?? entMod;
  User = entities.User ?? entMod.User;
  AguiEvent = entities.AguiEvent ?? entMod.AguiEvent;
  VisualArtifact = entities.VisualArtifact ?? entMod.VisualArtifact;
  const seedExport = seedMod.default ?? seedMod;
  seedAdminUser = typeof seedExport === 'function' ? seedExport : seedExport?.default;
  purgeExpiredData = retentionMod.purgeExpiredData ?? retentionMod.default?.purgeExpiredData;
  storeText = storeMod.storeText ?? storeMod.default?.storeText;

  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
});

after(async () => {
  if (AppDataSource?.isInitialized) await AppDataSource.destroy();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('seedAdminUser creates admin from env when database is empty', async () => {
  const userRepo = AppDataSource.getRepository(User);
  const before = await userRepo.count();
  assert.equal(before, 0);

  await seedAdminUser();

  const admin = await userRepo.findOneBy({ email: 'seed@test.local' });
  assert.ok(admin);
  assert.equal(admin.active, true);
});

test('purgeExpiredData removes old agui_events and orphan artifact files', async () => {
  const aguiRepo = AppDataSource.getRepository(AguiEvent);
  const artifactRepo = AppDataSource.getRepository(VisualArtifact);

  const oldDate = new Date('2020-01-01T00:00:00.000Z');
  await aguiRepo.save(
    aguiRepo.create({
      conversationId: 1,
      runId: 'run-old',
      seq: 1,
      eventType: 'TEST',
      eventJson: { ok: true },
      createdAt: oldDate,
    })
  );

  const stored = storeText(`<html>old-${Date.now()}</html>`);
  const artifactFile = path.join(ROOT, 'data', 'artifacts', `${stored.contentHash}.bin`);
  assert.ok(fs.existsSync(artifactFile), 'artifact file should exist before purge');

  await artifactRepo.save(
    artifactRepo.create({
      conversationId: 1,
      runId: 'run-old',
      artifactId: 'art-old',
      protocol: 'html',
      storageRef: stored.storageRef,
      contentHash: stored.contentHash,
      createdAt: oldDate,
    })
  );

  const result = await purgeExpiredData(new Date('2026-06-09T12:00:00Z'));
  assert.equal(result.aguiEvents, 1);
  assert.equal(result.artifacts, 1);
  assert.equal(result.files, 1);
  assert.equal(await aguiRepo.count(), 0);
  assert.equal(await artifactRepo.count(), 0);
  assert.equal(fs.existsSync(artifactFile), false);
});

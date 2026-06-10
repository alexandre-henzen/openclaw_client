import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(os.tmpdir(), 'schema-dump.sqlite');
try {
  fs.unlinkSync(dbPath);
} catch {
  /* empty */
}

process.env.DB_PATH = dbPath;
const dsMod = await import(pathToFileURL(path.join(ROOT, 'build/src/data-source.js')).href);
const ds = dsMod.default?.default ?? dsMod.default;
ds.options.synchronize = true;
await ds.initialize();

const db = new Database(dbPath);
const tables = db
  .prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  .all();
console.log('-- TABLES --');
console.log(tables.map((t) => `${t.sql};`).join('\n\n'));
const indexes = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name")
  .all();
console.log('\n-- INDEXES --');
console.log(indexes.map((t) => `${t.sql};`).join('\n\n'));
db.close();
await ds.destroy();
try {
  fs.unlinkSync(dbPath);
} catch {
  /* empty */
}

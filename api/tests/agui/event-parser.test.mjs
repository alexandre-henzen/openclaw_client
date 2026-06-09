import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(ROOT, 'tests/fixtures/agui-basic-text.sse');

// Load compiled JS if present, else register ts-node for dev runs.
async function loadParser() {
  const built = path.join(ROOT, 'build/src/services/agui/event-parser.js');
  if (fs.existsSync(built)) {
    return import(pathToFileURL(built).href);
  }
  const { register } = await import('ts-node');
  register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return import(pathToFileURL(path.join(ROOT, 'src/services/agui/event-parser.ts')).href);
}

test('parseAguiText reproduces agui-basic-text.sse fixture', async () => {
  const { parseAguiText } = await loadParser();
  const sse = fs.readFileSync(FIXTURE, 'utf8');
  const events = parseAguiText(sse);

  assert.equal(events.length, 6);
  assert.deepEqual(
    events.map((e) => e.type),
    [
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]
  );

  const deltas = events
    .filter((e) => e.type === 'TEXT_MESSAGE_CONTENT')
    .map((e) => e.data?.delta)
    .join('');
  assert.equal(deltas, 'Olá mundo.');
});

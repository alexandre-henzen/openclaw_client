import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  protocolForSandboxOutput,
  resolveOutputMime,
  INLINE_IMAGE_MIME_RE,
} from '../../build/src/services/artifacts/mime-policy.js';

test('resolveOutputMime infers from path', () => {
  assert.equal(resolveOutputMime(undefined, 'report.csv'), 'text/csv');
  assert.equal(resolveOutputMime('application/octet-stream', 'chart.html'), 'text/html');
});

test('protocolForSandboxOutput maps sandbox files', () => {
  assert.equal(protocolForSandboxOutput('text/html', 'out.html'), 'html-sandbox');
  assert.equal(protocolForSandboxOutput(undefined, 'plot.png'), 'file');
  assert.equal(protocolForSandboxOutput(undefined, 'data.csv'), 'download');
  assert.equal(protocolForSandboxOutput('application/pdf', 'doc.pdf'), 'download');
  assert.equal(protocolForSandboxOutput(undefined, 'binary.dat'), null);
});

test('INLINE_IMAGE_MIME_RE accepts png/jpeg', () => {
  assert.match('image/png', INLINE_IMAGE_MIME_RE);
  assert.doesNotMatch('application/pdf', INLINE_IMAGE_MIME_RE);
});

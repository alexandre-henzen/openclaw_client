import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assistantTextHasBrokenMedia,
  sanitizeAssistantMediaText,
} from '../../build/src/services/artifacts/sanitize-media-text.js';

test('sanitizeAssistantMediaText removes MEDIA lines and media failed', () => {
  const raw = [
    'Aqui está o gráfico.',
    'MEDIA:out/pizza_exemplo.html',
    '⚠️ Media failed.',
    'Dados de exemplo.',
  ].join('\n');
  const cleaned = sanitizeAssistantMediaText(raw);
  assert.match(cleaned, /Aqui está o gráfico/);
  assert.match(cleaned, /Dados de exemplo/);
  assert.doesNotMatch(cleaned, /MEDIA:/i);
  assert.doesNotMatch(cleaned, /media failed/i);
});

test('assistantTextHasBrokenMedia detects gateway inline failures', () => {
  assert.equal(assistantTextHasBrokenMedia('MEDIA:out/x.html'), true);
  assert.equal(assistantTextHasBrokenMedia('⚠️ Media failed.'), true);
  assert.equal(assistantTextHasBrokenMedia('Gráfico pronto.'), false);
});

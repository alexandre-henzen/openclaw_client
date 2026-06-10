import { describe, expect, it } from 'vitest';
import { protocolForSandboxOutput, resolveOutputMime } from './mime-policy';
import { preferDownloadCard } from './artifact-display';

describe('resolveOutputMime', () => {
  it('keeps an explicit mime that is not octet-stream', () => {
    expect(resolveOutputMime('text/html', 'out.csv')).toBe('text/html');
  });

  it('falls back to the file extension for missing or generic mimes', () => {
    expect(resolveOutputMime(undefined, 'data.csv')).toBe('text/csv');
    expect(resolveOutputMime('application/octet-stream', 'doc.pdf')).toBe('application/pdf');
    expect(resolveOutputMime(undefined, 'page.HTML')).toBe('text/html');
    expect(resolveOutputMime(undefined, 'chart.png')).toBe('image/png');
  });

  it('defaults to octet-stream for unknown extensions', () => {
    expect(resolveOutputMime(undefined, 'archive.bin')).toBe('application/octet-stream');
  });
});

describe('protocolForSandboxOutput', () => {
  it('routes html to the sandboxed iframe', () => {
    expect(protocolForSandboxOutput(undefined, 'out/chart.html')).toBe('html-sandbox');
  });

  it('routes markdown, images, csv/pdf and other text correctly', () => {
    expect(protocolForSandboxOutput('text/markdown', 'notes.md')).toBe('markdown');
    expect(protocolForSandboxOutput('image/png', 'img.png')).toBe('file');
    expect(protocolForSandboxOutput(undefined, 'data.csv')).toBe('download');
    expect(protocolForSandboxOutput(undefined, 'doc.pdf')).toBe('download');
    expect(protocolForSandboxOutput('text/plain', 'log.txt')).toBe('download');
  });

  it('returns null for binary content it cannot route', () => {
    expect(protocolForSandboxOutput('application/zip', 'a.zip')).toBeNull();
  });
});

describe('preferDownloadCard', () => {
  it('always prefers the card for the download protocol', () => {
    expect(preferDownloadCard('download')).toBe(true);
  });

  it('prefers the card for csv/pdf outputs regardless of protocol', () => {
    expect(preferDownloadCard('file', undefined, 'data.csv')).toBe(true);
    expect(preferDownloadCard('file', 'application/pdf', 'doc.pdf')).toBe(true);
  });

  it('keeps iframes for html artifacts', () => {
    expect(preferDownloadCard('html-sandbox', 'text/html', 'chart.html')).toBe(false);
  });

  it('keeps inline rendering for images', () => {
    expect(preferDownloadCard('file', 'image/png', 'img.png')).toBe(false);
  });
});

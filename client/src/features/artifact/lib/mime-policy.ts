/** Client-side mirror of api mime-policy (display only). */

export function resolveOutputMime(mime: string | undefined, filePath: string): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.html')) return 'text/html';
  if (lower.endsWith('.png')) return 'image/png';
  return mime ?? 'application/octet-stream';
}

export function protocolForSandboxOutput(
  mime: string | undefined,
  filePath: string
): string | null {
  const resolved = resolveOutputMime(mime, filePath);
  if (resolved === 'text/html') return 'html-sandbox';
  if (resolved === 'text/markdown') return 'markdown';
  if (/^image\//.test(resolved)) return 'file';
  if (resolved === 'text/csv' || resolved === 'application/pdf') return 'download';
  if (resolved.startsWith('text/')) return 'download';
  return null;
}

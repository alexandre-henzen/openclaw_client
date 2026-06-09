import type { VisualArtifactProtocol } from '../../@types/copilot';

/** MIME types served inline in `/api/artifacts/:id/frame` (images only). */
export const INLINE_IMAGE_MIME_RE = /^(image\/(png|jpeg|gif|webp|svg\+xml))$/;

const OFFICE_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
]);

const DOWNLOAD_MIMES = new Set([
  'text/csv',
  'application/pdf',
  'application/zip',
  'application/gzip',
  ...OFFICE_MIMES,
]);

function mimeFromPath(filePath: string): string | undefined {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.xlsx'))
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.pptx'))
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.html')) return 'text/html';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return undefined;
}

export function resolveOutputMime(mime: string | undefined, filePath: string): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  return mimeFromPath(filePath) ?? mime ?? 'application/octet-stream';
}

export function protocolForSandboxOutput(
  mime: string | undefined,
  filePath: string
): VisualArtifactProtocol | null {
  const resolved = resolveOutputMime(mime, filePath);

  if (resolved === 'text/html') return 'html-sandbox';
  if (resolved === 'text/markdown') return 'markdown';
  if (INLINE_IMAGE_MIME_RE.test(resolved)) return 'file';

  if (DOWNLOAD_MIMES.has(resolved)) return 'download';
  if (resolved.startsWith('text/')) return 'download';

  if (resolved === 'application/octet-stream' && mimeFromPath(filePath)) {
    return 'download';
  }

  return null;
}

export function downloadFilename(filePath: string, title?: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  if (base) return base;
  return title ?? 'download';
}

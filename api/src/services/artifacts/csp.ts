import type { VisualArtifact } from '../../@types/copilot';

/** Origins allowed to embed artifact iframes (client UI is often another port/host). */
export function resolveFrameAncestors(referer?: string): string {
  const ancestors = new Set<string>(["'self'"]);

  const add = (origin: string) => {
    const trimmed = origin.trim();
    if (trimmed) ancestors.add(trimmed);
  };

  for (const entry of (process.env.VISUAL_ARTIFACT_FRAME_ANCESTORS ?? '').split(',')) {
    add(entry);
  }
  for (const entry of (process.env.ALLOWED_DOMAIN ?? '').split(',')) {
    add(entry);
  }

  if (referer) {
    try {
      add(new URL(referer).origin);
    } catch {
      /* ignore malformed referer */
    }
  }

  const clientPort = Number(process.env.CLIENT_PORT) || 18800;
  const apiPort = Number(process.env.PORT || process.env.API_PORT) || 18802;
  if (clientPort !== apiPort) {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      add(`http://${host}:${clientPort}`);
      add(`https://${host}:${clientPort}`);
    }
  }

  return [...ancestors].join(' ');
}

export function buildArtifactFrameCsp(_artifact: VisualArtifact, referer?: string): string {
  const connectSrc = process.env.VISUAL_ARTIFACT_ALLOWED_CONNECT_SRC ?? "'none'";
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    `connect-src ${connectSrc}`,
    `frame-ancestors ${resolveFrameAncestors(referer)}`,
  ].join('; ');
}

export function artifactFrameHeaders(
  artifact: VisualArtifact,
  referer?: string,
): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': buildArtifactFrameCsp(artifact, referer),
    'Permissions-Policy':
      'accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, no-store',
  };
}

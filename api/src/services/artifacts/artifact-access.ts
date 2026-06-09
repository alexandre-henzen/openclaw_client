import AppDataSource from '../../data-source';
import VisualArtifact from '../../entities/VisualArtifact';
import { verifyAppSessionToken } from '../security/app-session';
import { downloadFilename } from './mime-policy';

export function readAppSessionToken(req: {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
}): string | null {
  const header =
    (req.headers['x-app-session-id'] as string) ||
    (req.headers['X-App-Session-Id'] as string);
  if (header) return header;
  const st = req.query.st;
  return typeof st === 'string' ? st : null;
}

export async function authorizeArtifactAccess(
  req: {
    headers: Record<string, string | string[] | undefined>;
    query: Record<string, unknown>;
  },
  artifactRowId: number
): Promise<{ ok: true; row: VisualArtifact } | { ok: false; status: number }> {
  const token = readAppSessionToken(req);
  const conversationId = verifyAppSessionToken(token);
  if (!conversationId) return { ok: false, status: 401 };

  const repo = AppDataSource.getRepository(VisualArtifact);
  const row = await repo.findOneBy({ _id: artifactRowId });
  if (!row) return { ok: false, status: 404 };
  if (String(row.conversationId) !== conversationId) return { ok: false, status: 403 };

  return { ok: true, row };
}

export function resolveDownloadFilename(row: VisualArtifact): string {
  const metaPath =
    row.metadataJson && typeof row.metadataJson.path === 'string'
      ? row.metadataJson.path
      : undefined;
  if (metaPath) return downloadFilename(metaPath, row.title ?? undefined);
  return row.title ?? row.artifactId;
}

export function contentDispositionFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\-()+ ]/g, '_').slice(0, 180) || 'download';
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${cleaned}"; filename*=UTF-8''${encoded}`;
}

export function artifactDownloadHref(artifactRowId: number, appSessionToken: string): string {
  return `/api/artifacts/${artifactRowId}/download?st=${encodeURIComponent(appSessionToken)}`;
}

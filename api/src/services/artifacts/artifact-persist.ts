import AppDataSource from '../../data-source';
import VisualArtifact from '../../entities/VisualArtifact';
import type { VisualArtifact as VisualArtifactDto } from '../../@types/copilot';
import { storeText, storeBytes } from './artifact-store';
import { logEvent } from '../logging';

export async function persistVisualArtifact(
  conversationId: number,
  runId: string,
  artifact: VisualArtifactDto,
  opts: {
    storageRef?: string | null;
    contentHash?: string | null;
    skipInlinePayload?: boolean;
  } = {}
): Promise<number | null> {
  let storageRef = opts.storageRef ?? null;
  let contentHash = opts.contentHash ?? null;

  if (!storageRef) {
    let payloadText: string | undefined;
    if (typeof artifact.html === 'string') {
      payloadText = artifact.html;
    } else if (typeof artifact.markdown === 'string') {
      payloadText = artifact.markdown;
    } else if (artifact.a2ui !== undefined) {
      try {
        payloadText = JSON.stringify(artifact.a2ui, null, 2);
      } catch {
        payloadText = undefined;
      }
    } else if (artifact.file) {
      try {
        payloadText = JSON.stringify(artifact.file, null, 2);
      } catch {
        payloadText = undefined;
      }
    }
    if (payloadText !== undefined) {
      try {
        const stored = storeText(payloadText);
        storageRef = stored.storageRef;
        contentHash = stored.contentHash;
      } catch (err) {
        logEvent({ event: 'artifact.store_error', level: 'warn', error: String(err) });
      }
    }
  }

  if (opts.skipInlinePayload) {
    artifact.html = undefined;
    artifact.markdown = undefined;
    artifact.a2ui = undefined;
    artifact.file = undefined;
  }

  const repo = AppDataSource.getRepository(VisualArtifact);
  const existing = await repo.findOne({
    where: { conversationId, artifactId: artifact.artifactId },
  });
  if (existing) return existing._id;

  const row = await repo.save(
    repo.create({
      conversationId,
      runId,
      artifactId: artifact.artifactId,
      protocol: artifact.protocol,
      title: artifact.title ?? null,
      mimeType: artifact.mimeType ?? null,
      resourceUri: artifact.resourceUri ?? null,
      storageRef,
      contentHash,
      metadataJson: artifact.metadata ?? null,
    })
  );

  logEvent({
    event: 'artifact.persisted',
    conversationId,
    runId,
    protocol: artifact.protocol,
    artifactId: artifact.artifactId,
  });

  return row._id;
}

export function storeSandboxFilePayload(file: {
  text?: string;
  contentBase64?: string;
}): { storageRef: string; contentHash: string } | null {
  try {
    if (typeof file.text === 'string') return storeText(file.text);
    if (typeof file.contentBase64 === 'string') {
      return storeBytes(Buffer.from(file.contentBase64, 'base64'));
    }
  } catch (err) {
    logEvent({ event: 'artifact.store_error', level: 'warn', error: String(err) });
  }
  return null;
}

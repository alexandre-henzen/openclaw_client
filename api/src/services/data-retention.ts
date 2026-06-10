/* eslint-disable no-console */
import { LessThan, In } from 'typeorm';
import AppDataSource from '../data-source';
import { AguiEvent, VisualArtifact } from '../entities';
import { computeRetentionCutoff, getRetentionDays, getRetentionIntervalHours } from '../config/retention';
import { deleteStoredFile } from './artifacts/artifact-store';

export type RetentionPurgeResult = {
  aguiEvents: number;
  artifacts: number;
  files: number;
};

export async function purgeExpiredData(now = new Date()): Promise<RetentionPurgeResult> {
  const cutoff = computeRetentionCutoff(now);
  if (!cutoff) {
    return { aguiEvents: 0, artifacts: 0, files: 0 };
  }

  const aguiRepo = AppDataSource.getRepository(AguiEvent);
  const artifactRepo = AppDataSource.getRepository(VisualArtifact);

  const aguiResult = await aguiRepo.delete({ createdAt: LessThan(cutoff) });
  const aguiEvents = aguiResult.affected ?? 0;

  const staleArtifacts = await artifactRepo.find({
    where: { createdAt: LessThan(cutoff) },
    select: ['_id', 'storageRef'],
  });
  const artifactIds = staleArtifacts.map((row) => row._id);
  const storageRefs = [
    ...new Set(
      staleArtifacts
        .map((row) => row.storageRef)
        .filter((ref): ref is string => Boolean(ref))
    ),
  ];

  if (artifactIds.length > 0) {
    await artifactRepo.delete({ _id: In(artifactIds) });
  }

  let files = 0;
  for (const storageRef of storageRefs) {
    const remaining = await artifactRepo.count({ where: { storageRef } });
    if (remaining > 0) continue;
    if (deleteStoredFile(storageRef)) files += 1;
  }

  return { aguiEvents, artifacts: artifactIds.length, files };
}

export function startDataRetentionScheduler(): void {
  if (process.env.NODE_ENV === 'test') return;

  const days = getRetentionDays();
  if (days <= 0) {
    console.log('[retention] disabled (DATA_RETENTION_DAYS=0)');
    return;
  }

  const run = () => {
    purgeExpiredData()
      .then((result) => {
        if (result.aguiEvents || result.artifacts || result.files) {
          console.log(
            `[retention] purged agui_events=${result.aguiEvents} artifacts=${result.artifacts} files=${result.files} (>${days}d)`
          );
        }
      })
      .catch((err) => console.warn('[retention] purge failed', err));
  };

  run();
  const intervalMs = getRetentionIntervalHours() * 60 * 60 * 1000;
  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

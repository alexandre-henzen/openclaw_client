const DEFAULT_RETENTION_DAYS = 7;

export function getRetentionDays(): number {
  const raw = process.env.DATA_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_RETENTION_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RETENTION_DAYS;
  return Math.floor(parsed);
}

export function getRetentionIntervalHours(): number {
  const raw = process.env.DATA_RETENTION_INTERVAL_HOURS;
  if (raw === undefined || raw.trim() === '') return 24;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 24;
  return parsed;
}

export function computeRetentionCutoff(now = new Date(), days = getRetentionDays()): Date | null {
  if (days <= 0) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

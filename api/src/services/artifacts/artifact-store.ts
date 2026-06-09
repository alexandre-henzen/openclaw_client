import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'data', 'artifacts');

function ensureDir(): void {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function refToFile(storageRef: string): string {
  if (!storageRef.startsWith('fs:')) throw new Error('unsupported storage ref');
  const hash = storageRef.slice(3);
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('invalid storage ref');
  return path.join(ARTIFACT_DIR, `${hash}.bin`);
}

export type StoredArtifact = {
  storageRef: string;
  contentHash: string;
};

export function storeText(text: string): StoredArtifact {
  const maxHtml = Number(process.env.VISUAL_ARTIFACT_MAX_HTML_BYTES ?? 5_000_000);
  if (Buffer.byteLength(text, 'utf8') > maxHtml) {
    throw new Error('artifact_too_large');
  }
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  ensureDir();
  const file = refToFile(`fs:${hash}`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, text, 'utf8');
  }
  return { storageRef: `fs:${hash}`, contentHash: hash };
}

export function storeBytes(buf: Buffer): StoredArtifact {
  const maxResource = Number(process.env.VISUAL_ARTIFACT_MAX_RESOURCE_BYTES ?? 15_000_000);
  if (buf.byteLength > maxResource) {
    throw new Error('artifact_too_large');
  }
  const hash = createHash('sha256').update(buf).digest('hex');
  ensureDir();
  const file = refToFile(`fs:${hash}`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, buf);
  }
  return { storageRef: `fs:${hash}`, contentHash: hash };
}

export function readStored(storageRef: string): string {
  return fs.readFileSync(refToFile(storageRef), 'utf8');
}

export function readStoredBuffer(storageRef: string): Buffer {
  return fs.readFileSync(refToFile(storageRef));
}

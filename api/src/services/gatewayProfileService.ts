import AppDataSource from '../data-source';
import { GatewayProfile } from '../entities';
import type { GatewayProfileRecord, PairingStatus } from '../@types/copilot';

const DEFAULT_ID = 'default';

function toRecord(row: GatewayProfile): GatewayProfileRecord {
  return {
    id: row.id,
    name: row.name,
    gatewayUrl: row.gatewayUrl,
    clawgUiUrl: row.clawgUiUrl,
    wsUrl: row.wsUrl ?? undefined,
    clawgUiDeviceTokenEnc: row.clawgUiDeviceTokenEnc ?? undefined,
    pairingStatus: row.pairingStatus as PairingStatus,
    lastPairingCode: row.lastPairingCode ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getGatewayProfile(id = DEFAULT_ID): Promise<GatewayProfileRecord | null> {
  const repo = AppDataSource.getRepository(GatewayProfile);
  const row = await repo.findOneBy({ id });
  return row ? toRecord(row) : null;
}

export async function ensureGatewayProfile(): Promise<GatewayProfileRecord> {
  const repo = AppDataSource.getRepository(GatewayProfile);
  let row = await repo.findOneBy({ id: DEFAULT_ID });
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL ?? 'http://127.0.0.1:18789';
  const clawgPath = process.env.OPENCLAW_CLAWG_UI_PATH ?? '/v1/clawg-ui';
  const clawgUiUrl = `${gatewayUrl.replace(/\/$/, '')}${clawgPath}`;
  const now = new Date();

  if (!row) {
    row = repo.create({
      id: DEFAULT_ID,
      name: 'default',
      gatewayUrl,
      clawgUiUrl,
      wsUrl: process.env.OPENCLAW_WS_URL ?? null,
      pairingStatus: 'unpaired',
      createdAt: now,
      updatedAt: now,
    });
    row = await repo.save(row);
  } else if (row.gatewayUrl !== gatewayUrl || row.clawgUiUrl !== clawgUiUrl) {
    row.gatewayUrl = gatewayUrl;
    row.clawgUiUrl = clawgUiUrl;
    row.updatedAt = now;
    row = await repo.save(row);
  }

  return toRecord(row);
}

export async function updateGatewayPairing(
  id: string,
  patch: {
    status?: PairingStatus;
    deviceTokenEnc?: string;
    pairingCode?: string;
  }
): Promise<void> {
  const repo = AppDataSource.getRepository(GatewayProfile);
  const row = await repo.findOneBy({ id });
  if (!row) return;
  if (patch.status) row.pairingStatus = patch.status;
  if (patch.deviceTokenEnc !== undefined) row.clawgUiDeviceTokenEnc = patch.deviceTokenEnc;
  if (patch.pairingCode !== undefined) row.lastPairingCode = patch.pairingCode;
  row.updatedAt = new Date();
  await repo.save(row);
}

import { ensureGatewayProfile } from './gatewayProfileService';

let bootstrapped = false;

export async function bootstrapCopilot(): Promise<void> {
  if (bootstrapped) return;
  await ensureGatewayProfile();
  bootstrapped = true;
}

export type PairingStatus =
  | 'unpaired'
  | 'pairing_pending'
  | 'paired'
  | 'unauthorized'
  | 'error';

export type SessionStatus = 'idle' | 'running' | 'error' | 'archived' | 'deleted';

export type VisualArtifactProtocol =
  | 'mcp-app'
  | 'html-sandbox'
  | 'a2ui'
  | 'markdown'
  | 'file'
  | 'download'
  | 'unknown';

export type VisualArtifact = {
  kind: 'openclaw.visual_artifact.v1';
  artifactId: string;
  protocol: VisualArtifactProtocol;
  title?: string;
  mimeType?: string;
  resourceUri?: string;
  html?: string;
  a2ui?: unknown;
  markdown?: string;
  file?: { path: string; mimeType?: string };
  metadata?: Record<string, unknown>;
};

export type ChatSessionRecord = {
  id: string;
  gatewayProfileId: string;
  agentId: string;
  title: string;
  threadId: string;
  openclawSessionKey?: string;
  userScope: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
};

export type GatewayProfileRecord = {
  id: string;
  name: string;
  gatewayUrl: string;
  clawgUiUrl: string;
  wsUrl?: string;
  clawgUiDeviceTokenEnc?: string;
  pairingStatus: PairingStatus;
  lastPairingCode?: string;
  createdAt: string;
  updatedAt: string;
};

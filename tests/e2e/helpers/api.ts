const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:18802/api';
const LOGIN_EMAIL = process.env.HARNESS_LOGIN_EMAIL ?? 'admin@admin.com';
const LOGIN_PASSWORD = process.env.HARNESS_LOGIN_PASSWORD ?? '123456';

export type ApiResult = {
  status: number;
  json: Record<string, unknown> | null;
  text: string;
};

export async function api(
  path: string,
  opts: RequestInit & { jwt?: string } = {},
): Promise<ApiResult> {
  const { jwt, headers: extraHeaders, ...rest } = opts;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(extraHeaders ?? {}),
    },
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json, text };
}

export async function loginHarness(): Promise<string> {
  const { status, json } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  if (status !== 200) {
    throw new Error(`login failed: HTTP ${status}`);
  }
  const token = (json?.accessToken ?? json?.token) as string | undefined;
  if (!token) throw new Error('login response missing accessToken');
  return token;
}

export async function waitForPaired(jwt: string, maxMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const state = await ensurePaired(jwt);
    if (state === 'paired' || state === 'network_error') return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('pairing not ready — gateway/clawg-ui unavailable');
}

export async function ensurePaired(
  jwt: string,
): Promise<'paired' | 'pending' | 'network_error'> {
  const { status, json } = await api('/openclaw/pairing/check', {
    method: 'POST',
    body: JSON.stringify({}),
    jwt,
  });
  if (status !== 200) throw new Error(`pairing/check failed: HTTP ${status}`);
  const pairingStatus = json?.status as string | undefined;
  if (pairingStatus === 'paired') return 'paired';
  if (pairingStatus === 'error' && json?.reason === 'network_error') return 'network_error';
  return 'pending';
}

export async function createConversation(
  jwt: string,
  agentId: string | number,
): Promise<{ conversationId: string; agentId: string | number }> {
  const { status, json } = await api('/conversation', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
    jwt,
  });
  if (status !== 200) throw new Error(`conversation create failed: HTTP ${status}`);
  const conversationId = String(json?._id ?? '');
  if (!conversationId) throw new Error('conversation create missing _id');
  return { conversationId, agentId };
}

export async function getSessionToken(
  jwt: string,
  conversationId: string | number,
): Promise<{ appSessionToken: string; threadId: string }> {
  const { status, json } = await api(`/conversation/${conversationId}/session-token`, { jwt });
  if (status !== 200) throw new Error(`session-token failed: HTTP ${status}`);
  const appSessionToken = json?.appSessionToken as string | undefined;
  if (!appSessionToken) throw new Error('session-token missing appSessionToken');
  return {
    appSessionToken,
    threadId: String(json?.threadId ?? ''),
  };
}

export type ArtifactTrayItem = {
  id: number;
  protocol: string;
  title?: string;
  mimeType?: string;
};

export async function listArtifacts(
  jwt: string,
  conversationId: string | number,
  appSessionToken: string,
): Promise<ArtifactTrayItem[]> {
  const { status, json } = await api(`/conversation/${conversationId}/artifacts`, {
    jwt,
    headers: { 'X-App-Session-Id': appSessionToken },
  });
  if (status !== 200) throw new Error(`artifacts list failed: HTTP ${status}`);
  const items = json?.items;
  return Array.isArray(items) ? (items as ArtifactTrayItem[]) : [];
}

export async function waitForArtifactInTray(
  jwt: string,
  conversationId: string | number,
  appSessionToken: string,
  opts: { timeoutMs?: number; protocol?: string } = {},
): Promise<ArtifactTrayItem> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const items = await listArtifacts(jwt, conversationId, appSessionToken);
    const hit = opts.protocol
      ? items.find((i) => i.protocol === opts.protocol)
      : items[0];
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 2500));
  }
  const final = await listArtifacts(jwt, conversationId, appSessionToken);
  throw new Error(
    `artifact tray empty after ${timeoutMs}ms; items=${JSON.stringify(final).slice(0, 400)}`,
  );
}

export async function getFirstAgentId(jwt: string): Promise<string | number> {
  const { status, json } = await api('/agent', { jwt });
  if (status !== 200) throw new Error(`agent list failed: HTTP ${status}`);
  const items = (json?.items ?? json) as Array<Record<string, unknown>>;
  const list = Array.isArray(items) ? items : [];
  const first =
    list.find((a) => a?.openclawAgentId === 'main') ??
    list.find((a) => a?.name === 'main') ??
    list[0];
  const id = first?._id;
  if (!id) throw new Error('no agent available for E2E');
  return id as string | number;
}

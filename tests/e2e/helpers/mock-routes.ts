import type { Page, Route } from '@playwright/test';

const MOCK_JWT = 'e2e-mock-jwt-token';
const MOCK_USER = { id: '1', email: 'admin@admin.com', name: 'Admin' };

const API_HOSTS = ['127.0.0.1', 'localhost'];
const API_PORT = process.env.API_PORT ?? '18802';

type MockHandler = (route: Route, url: URL) => Promise<boolean>;

const apiHandlers: MockHandler[] = [];
const routedPages = new WeakSet<Page>();

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function mockAgentLimits(agentId: string) {
  const window = {
    limit: null,
    spent: 0,
    ratio: null,
    exceeded: false,
    nearLimit: false,
  };
  return {
    agentId,
    today: '2026-06-09',
    thisMonth: '2026-06',
    windows: { daily: window, monthly: window, total: window },
    stored: { costLimitDaily: null, costLimitMonthly: null, costLimitTotal: null },
  };
}

async function ensureApiRouter(page: Page): Promise<void> {
  if (routedPages.has(page)) return;
  routedPages.add(page);

  for (const host of API_HOSTS) {
    await page.route(`http://${host}:${API_PORT}/api/**`, async (route) => {
      const url = new URL(route.request().url());
      for (const handler of apiHandlers) {
        if (await handler(route, url)) return;
      }
      await json(route, 200, {});
    });
  }
}

function addHandler(handler: MockHandler): void {
  apiHandlers.push(handler);
}

export function mockJwt(): string {
  return MOCK_JWT;
}

export async function resetApiMocks(page: Page): Promise<void> {
  apiHandlers.length = 0;
  await ensureApiRouter(page);
}

export async function mockAuthenticatedApi(page: Page): Promise<void> {
  await resetApiMocks(page);
  addHandler(async (route, url) => {
    const path = url.pathname.replace(/^\/api/, '');
    if (path === '/auth/login' && route.request().method() === 'POST') {
      await json(route, 200, { ...MOCK_USER, accessToken: MOCK_JWT });
      return true;
    }
    if (path === '/auth/token') {
      await json(route, 200, MOCK_USER);
      return true;
    }
    return false;
  });
}

export async function mockShellApi(
  page: Page,
  opts: { agentId: string; agentName?: string } = { agentId: 'agent_e2e_1' },
): Promise<void> {
  await resetApiMocks(page);
  const { agentId, agentName = 'main' } = opts;
  const agent = { _id: agentId, name: agentName, openclawAgentId: 'main', model: null };

  addHandler(async (route, url) => {
    const path = url.pathname.replace(/^\/api/, '');
    const method = route.request().method();

    if (path === '/auth/login' && method === 'POST') {
      await json(route, 200, { ...MOCK_USER, accessToken: MOCK_JWT });
      return true;
    }
    if (path === '/auth/token') {
      await json(route, 200, MOCK_USER);
      return true;
    }
    if (path === '/agent' && method === 'GET') {
      await json(route, 200, { items: [agent] });
      return true;
    }
    if (path === '/agent/sync' && method === 'POST') {
      await json(route, 200, { synced: true });
      return true;
    }
    if (path === `/agent/${agentId}` && method === 'GET') {
      await json(route, 200, agent);
      return true;
    }
    if (path === '/conversation' && method === 'GET') {
      await json(route, 200, { items: [] });
      return true;
    }
    if (path === '/update/status' && method === 'GET') {
      await json(route, 200, { updateAvailable: false });
      return true;
    }
    if (path === `/agent/${agentId}/limits` && method === 'GET') {
      await json(route, 200, mockAgentLimits(agentId));
      return true;
    }
    if (path.startsWith(`/agent/${agentId}/`)) {
      await json(route, 200, {});
      return true;
    }
    return false;
  });
}

export async function mockPairedChatStack(
  page: Page,
  opts: {
    agentId?: string;
    conversationId?: string;
    threadId?: string;
    appSessionToken?: string;
  } = {},
): Promise<{ agentId: string; conversationId: string }> {
  const agentId = opts.agentId ?? 'agent_e2e_1';
  const conversationId = opts.conversationId ?? '42';
  const threadId = opts.threadId ?? 'thread_e2e_mock';
  const appSessionToken = opts.appSessionToken ?? `${conversationId}.deadbeefcafe`;

  await mockShellApi(page, { agentId });

  addHandler(async (route, url) => {
    const path = url.pathname.replace(/^\/api/, '');

    if (path.startsWith('/openclaw/pairing/')) {
      await json(route, 200, { status: 'paired' });
      return true;
    }
    if (path === `/conversation/${conversationId}/session-token`) {
      await json(route, 200, { appSessionToken, threadId, conversationId: Number(conversationId) });
      return true;
    }
    if (path === `/conversation/${conversationId}/artifacts`) {
      await json(route, 200, { items: [] });
      return true;
    }
    if (path.startsWith('/copilotkit')) {
      await json(route, 200, { data: {} });
      return true;
    }
    return false;
  });

  return { agentId, conversationId };
}

export async function mockUnpairedChatStack(
  page: Page,
  opts: { agentId?: string; conversationId?: string } = {},
): Promise<{ agentId: string; conversationId: string }> {
  const agentId = opts.agentId ?? 'agent_pair_1';
  const conversationId = opts.conversationId ?? '99';

  await mockShellApi(page, { agentId });

  addHandler(async (route, url) => {
    const path = url.pathname.replace(/^\/api/, '');
    if (path.startsWith('/openclaw/pairing/')) {
      await json(route, 200, {
        status: 'pairing_pending',
        lastPairingCode: 'ABCD-1234',
      });
      return true;
    }
    return false;
  });

  return { agentId, conversationId };
}

export async function seedBrowserAuth(page: Page, token = MOCK_JWT): Promise<void> {
  await page.addInitScript((jwt) => {
    localStorage.setItem('token', jwt);
  }, token);
}

import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://127.0.0.1:18802/api';
const LOGIN_EMAIL = process.env.HARNESS_LOGIN_EMAIL ?? 'admin@admin.com';
const LOGIN_PASSWORD = process.env.HARNESS_LOGIN_PASSWORD ?? '123456';

/**
 * G18 — smoke UI da tray (artefato injetado via RunCodeObserver, não LLM).
 * Para fluxo real usuário → run_code → pizza, ver artifacts-pie-chart-live.spec.ts (G19).
 */
test.describe('visual artifacts tray @live', () => {
  test('G18 — iframe renders harness chart in artifact tray', async ({ page, request }) => {
    const login = await request.post(`${API_BASE}/auth/login`, {
      data: { email: LOGIN_EMAIL, password: LOGIN_PASSWORD },
    });
    expect(login.ok()).toBeTruthy();
    const { accessToken } = await login.json();
    expect(accessToken).toBeTruthy();

    const agents = await request.get(`${API_BASE}/agent`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const agentList = (await agents.json())?.items ?? [];
    const agent = agentList.find((a: { openclawAgentId?: string }) => a.openclawAgentId === 'main') ?? agentList[0];
    expect(agent?._id).toBeTruthy();

    const conv = await request.post(`${API_BASE}/conversation`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { agentId: agent._id },
    });
    const convBody = await conv.json();
    const conversationId = convBody._id as number;

    const tokenRes = await request.get(`${API_BASE}/conversation/${conversationId}/session-token`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const appSessionToken = (await tokenRes.json()).appSessionToken as string;

    const root = path.resolve(process.cwd());
    process.chdir(path.join(root, 'api'));
    const fixture = JSON.parse(
      fs.readFileSync(path.join(root, 'api', 'tests', 'fixtures', 'run-code-chart.payload.json'), 'utf8')
    );
    fixture.runId = `run_g18_${Date.now()}`;

    const dsMod = await import(
      pathToFileURL(path.join(root, 'api', 'build', 'src', 'data-source.js')).href
    );
    const AppDataSource = (dsMod.default?.default ?? dsMod.default) as {
      isInitialized: boolean;
      initialize: () => Promise<void>;
    };
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const obsMod = await import(
      pathToFileURL(path.join(root, 'api', 'build', 'src', 'services', 'openclaw', 'run-code-observer.js')).href
    );
    const RunCodeObserver = obsMod.RunCodeObserver as new (id: number) => {
      observe: (ev: { type: string; data: unknown }) => void;
    };
    const observer = new RunCodeObserver(conversationId);
    observer.observe({ type: 'TOOL_CALL_START', data: { toolCallId: 'g18', toolCallName: 'run_code' } });
    observer.observe({
      type: 'TOOL_CALL_RESULT',
      data: { toolCallId: 'g18', result: fixture },
    });

    const pairing = await request.post(`${API_BASE}/openclaw/pairing/check`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {},
    });
    const pairingBody = await pairing.json();
    if (pairingBody?.status !== 'paired') {
      test.skip(true, 'gateway not paired — G18 requires live paired stack');
    }

    await page.addInitScript((jwt: string) => {
      localStorage.setItem('token', jwt);
    }, accessToken);

    await page.goto(`/agent/${agent._id}/chat/${conversationId}`);

    const tray = page.getByTestId('inline-artifacts');
    await expect(tray).toBeVisible({ timeout: 25_000 });

    const iframe = tray.getByTestId('artifact-iframe');
    await expect(iframe).toBeVisible({ timeout: 25_000 });

    const frameSrc = await iframe.getAttribute('src');
    expect(frameSrc).toContain(`/artifacts/`);
    expect(frameSrc).toContain('frame?st=');

    const list = await request.get(`${API_BASE}/conversation/${conversationId}/artifacts`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-App-Session-Id': appSessionToken,
      },
    });
    const items = (await list.json())?.items ?? [];
    expect(items.some((i: { protocol: string }) => i.protocol === 'html-sandbox')).toBeTruthy();
  });
});

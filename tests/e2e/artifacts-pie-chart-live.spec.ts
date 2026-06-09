import { test, expect } from '@playwright/test';
import {
  createConversation,
  getFirstAgentId,
  getSessionToken,
  loginHarness,
  waitForArtifactInTray,
  waitForPaired,
} from './helpers/api';
import { seedBrowserAuth } from './helpers/mock-routes';

const LIVE = process.env.E2E_LIVE === '1';

/**
 * G19 — fluxo REAL do usuário: pede gráfico de pizza no chat,
 * agente executa run_code no gateway, artefato aparece na tray com iframe.
 * Requer: API + client + gateway pareado + run_code (E2B/Piston) ativo.
 */
test.describe('pie chart via chat (real LLM + run_code) @live', () => {
  test.skip(!LIVE, 'Set E2E_LIVE=1 with full stack running');

  test('G19 — pedir gráfico de pizza → artefato html-sandbox no iframe', async ({ page }) => {
    test.setTimeout(420_000);

    const jwt = await loginHarness();
    await waitForPaired(jwt);

    const agentId = await getFirstAgentId(jwt);
    const { conversationId } = await createConversation(jwt, agentId);
    const { appSessionToken } = await getSessionToken(jwt, conversationId);

    await seedBrowserAuth(page, jwt);
    await page.goto(`/agent/${agentId}/chat/${conversationId}`);

    await expect(page.getByTestId('copilot-chat-surface')).toBeVisible({ timeout: 30_000 });
    const input = page.locator('.copilotKitInput textarea');
    await expect(input).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-test-id="copilot-chat-ready"]')).toBeVisible({
      timeout: 45_000,
    });

    const prompt =
      'Gere um gráfico de pizza com dados de exemplo usando run_code. ' +
      'Exporte HTML autocontido (SVG inline, sem CDN). Não use write nem arquivos no workspace.';

    await input.fill(prompt);
    const send = page.getByRole('button', { name: 'Send' });
    await expect(send).toBeEnabled({ timeout: 10_000 });
    await send.click();

    await expect(page.locator('.copilotKitUserMessage').last()).toContainText(/gráfico de pizza|grafico de pizza/i, {
      timeout: 20_000,
    });

    // Aguarda resposta do assistente (pode demorar: LLM + sandbox).
    await expect(page.locator('.copilotKitAssistantMessage').last()).not.toBeEmpty({
      timeout: 300_000,
    });

    // Tray: artefato via API (run_code → RunCodeObserver) e iframe na UI.
    const artifact = await waitForArtifactInTray(jwt, conversationId, appSessionToken, {
      timeoutMs: 240_000,
      protocol: 'html-sandbox',
    });
    expect(artifact.id).toBeGreaterThan(0);

    const tray = page.getByTestId('inline-artifacts');
    await expect(tray).toBeVisible({ timeout: 60_000 });

    const iframe = tray.getByTestId('artifact-iframe');
    await expect(iframe).toBeVisible({ timeout: 30_000 });

    const frameSrc = await iframe.getAttribute('src');
    expect(frameSrc).toMatch(/\/artifacts\/\d+\/frame\?st=/);

    // Conteúdo renderizado no iframe (gráfico).
    const frame = tray.frameLocator('[data-testid="artifact-iframe"]');
    await expect(frame.locator('svg, canvas, [class*="pie"], [id*="pie"]')).toBeVisible({
      timeout: 30_000,
    });
  });
});

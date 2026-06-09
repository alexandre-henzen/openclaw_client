import { test, expect } from '@playwright/test';
import {
  createConversation,
  getFirstAgentId,
  loginHarness,
  waitForPaired,
} from './helpers/api';
import { seedBrowserAuth } from './helpers/mock-routes';

const LIVE = process.env.E2E_LIVE === '1';

test.describe('CopilotKit chat (live stack) @live', () => {
  test.skip(!LIVE, 'Set E2E_LIVE=1 with API+client+gateway running');

  test('login → new chat → assistant reply streams', async ({ page }) => {
    test.setTimeout(180_000);
    const jwt = await loginHarness();
    await waitForPaired(jwt);

    const agentId = await getFirstAgentId(jwt);
    const { conversationId } = await createConversation(jwt, agentId);

    // JWT real via POST /auth/login (sem mock de rotas).
    await seedBrowserAuth(page, jwt);
    await page.goto(`/agent/${agentId}/chat/${conversationId}`);
    await expect(page.getByTestId('copilot-chat-surface')).toBeVisible({ timeout: 30_000 });

    const input = page.locator('.copilotKitInput textarea');
    await expect(input).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-test-id="copilot-chat-ready"]')).toBeVisible({
      timeout: 45_000,
    });

    const prompt = 'Responda em uma palavra: harness';
    await input.fill(prompt);
    const send = page.getByRole('button', { name: 'Send' });
    await expect(send).toBeEnabled({ timeout: 10_000 });
    await send.click();

    await expect(page.locator('.copilotKitUserMessage').last()).toContainText(/harness/i, {
      timeout: 15_000,
    });
    await expect(page.locator('.copilotKitAssistantMessage').last()).not.toBeEmpty({
      timeout: 120_000,
    });
  });
});

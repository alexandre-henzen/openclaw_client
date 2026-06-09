import { test, expect } from '@playwright/test';
import { mockPairedChatStack, seedBrowserAuth } from './helpers/mock-routes';

test.describe('CopilotKit chat surface @mocked', () => {
  test('renders paired CopilotChat on conversation route', async ({ page }) => {
    const { agentId, conversationId } = await mockPairedChatStack(page);
    await seedBrowserAuth(page);

    await page.goto(`/agent/${agentId}/chat/${conversationId}`);

    await expect(page.getByTestId('copilot-chat-surface')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Conversation 42/)).toBeVisible();
    await expect(page.locator('.copilotKitInput textarea')).toBeVisible({ timeout: 15_000 });
  });

  test('CopilotKit runtime receives Authorization header', async ({ page }) => {
    const { agentId, conversationId } = await mockPairedChatStack(page);
    await seedBrowserAuth(page);

    let sawAuth = false;
    for (const host of ['127.0.0.1', 'localhost']) {
      await page.route(`http://${host}:18802/api/copilotkit**`, async (route) => {
        const auth = route.request().headers()['authorization'] ?? '';
        sawAuth = auth.startsWith('Bearer ');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
      });
    }

    await page.goto(`/agent/${agentId}/chat/${conversationId}`);
    await expect(page.getByTestId('copilot-chat-surface')).toBeVisible({ timeout: 20_000 });

    await expect.poll(() => sawAuth, { timeout: 15_000 }).toBe(true);
  });
});

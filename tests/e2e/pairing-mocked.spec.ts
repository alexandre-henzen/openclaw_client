import { test, expect } from '@playwright/test';
import { mockUnpairedChatStack, seedBrowserAuth } from './helpers/mock-routes';

test.describe('pairing panel @mocked', () => {
  test('shows PairingPanel when gateway is not paired', async ({ page }) => {
    const { agentId, conversationId } = await mockUnpairedChatStack(page);
    await seedBrowserAuth(page);

    await page.goto(`/agent/${agentId}/chat/${conversationId}`);

    await expect(page.getByTestId('pairing-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Iniciar pareamento' })).toBeVisible();
    await expect(page.getByText(/Parear com OpenClaw/)).toBeVisible();
  });
});

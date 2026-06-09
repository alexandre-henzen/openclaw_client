import { test, expect } from '@playwright/test';

const LIVE = process.env.E2E_LIVE === '1';

test.describe('login (live stack) @live', () => {
  test.skip(!LIVE, 'Set E2E_LIVE=1 with client running');

  test('login form reaches home with real API', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env.HARNESS_LOGIN_EMAIL ?? 'admin@admin.com');
    await page.getByLabel('Password').fill(process.env.HARNESS_LOGIN_PASSWORD ?? '123456');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/($|\?)/, { timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).not.toBeNull();
  });
});

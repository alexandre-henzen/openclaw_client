import { test, expect } from '@playwright/test';
import { mockShellApi } from './helpers/mock-routes';

test.describe('login @mocked', () => {
  test('login form redirects to home with mocked API', async ({ page }) => {
    await mockShellApi(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@admin.com');
    await page.getByLabel('Password').fill('123456');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL(/\/($|\?)/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).not.toBeNull();
  });
});

import { defineConfig, devices } from '@playwright/test';

const CLIENT_PORT = process.env.CLIENT_PORT ?? '18800';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${CLIENT_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: process.env.E2E_LIVE === '1' ? 180_000 : 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        cwd: './client',
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          ...process.env,
          CLIENT_PORT,
        },
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

import { defineConfig, devices } from 'playwright/test';

// M0 金标准自检 E2E：仅 chromium；webServer 复用已起的 playground（5199 固定端口）
export default defineConfig({
  testDir: 'e2e/',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter playground dev',
    port: 5199,
    reuseExistingServer: true,
  },
});

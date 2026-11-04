import { defineConfig, devices } from 'playwright/test';

// M0 金标准自检 E2E：仅 chromium；webServer 复用已起的 playground（5199 固定端口）
export default defineConfig({
  testDir: 'e2e/',
  // 基线快照按简报绑定目录前缀落位 e2e/__snapshots__/<spec 名>/<id>.snap；
  // 实测安装的 Playwright 1.64.1 已无合并单文件 .snap 格式（一份快照一个文件），此为与简报的唯一差异，见 Task 4 报告
  snapshotPathTemplate: '{snapshotDir}/__snapshots__/{testFilePath}/{arg}.snap',
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

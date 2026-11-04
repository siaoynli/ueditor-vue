import { defineConfig } from 'vitest/config';

// M0 阶段暂无测试文件，空收集不报错；Task 2 起补充真实用例
export default defineConfig({
  test: {
    passWithNoTests: true,
    // e2e 目录归 Playwright 执行，混入 vitest 会因运行器 API 不同而失败
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});

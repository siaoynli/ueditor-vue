import { defineConfig } from 'vitest/config';

// M0 阶段暂无测试文件，空收集不报错；Task 2 起补充真实用例
export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});

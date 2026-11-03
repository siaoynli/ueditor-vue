import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// ESLint 扁平配置：JS/TS 推荐规则；旧版 UEditor 源码只读不检查，产物与工具目录排除
export default tseslint.config(
  {
    ignores: ['ueditor-dev-1.5.0/**', 'dist', '.superpowers'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);

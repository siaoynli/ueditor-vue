// 基线快照生成薄包装：快照采集与比对逻辑全部在 e2e/corpus-baseline.spec.ts，
// 此处仅代为附加 --update-snapshots，避免出现第二套快照管线。
// 用法：node scripts/gen-baseline.ts（Node 24 原生类型剥离，无需额外加载器）
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', 'e2e/corpus-baseline.spec.ts', '--update-snapshots'],
  { cwd: repoRoot, stdio: 'inherit' },
);
process.exit(result.status ?? 1);

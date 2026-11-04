import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'playwright/test';
import { normalizeHtml } from '../packages/test-utils/src/normalizeHtml';
import type { CmdStep } from '../packages/test-utils/src/runSequence';

/**
 * 语料基线快照：manifest 逐条走 baseline 引擎（A 栏），归一化后落 .snap，
 * 作为后续里程碑（M2 Vue 版）保真对照的期望输出。
 * 生成/更新：pnpm exec playwright test e2e/corpus-baseline.spec.ts --update-snapshots
 * （或薄包装 node scripts/gen-baseline.ts）
 */

/** manifest 条目 schema，字段名与简报绑定（id/desc/channel/file/steps） */
interface CorpusEntry {
  id: string;
  desc: string;
  channel: 'setContent';
  file: string;
  steps: CmdStep[];
}

interface HarnessWindow {
  __ready?: boolean;
  __runOn?: (which: 'a' | 'b', html: string, steps: CmdStep[]) => Promise<string>;
}

// file 字段相对 manifest 所在目录解析
const corpusDir = fileURLToPath(new URL('../tests/fixtures/corpus', import.meta.url));

const manifest = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'manifest.json'), 'utf8'),
) as CorpusEntry[];

// 采集期静态校验：id 唯一 + channel 恒为 setContent（Review Focus 4）。
// 新增通道必须先过契约评审再放开，这里 fail-fast 防语料静默混入。
{
  const seen = new Set<string>();
  for (const entry of manifest) {
    if (seen.has(entry.id)) throw new Error(`manifest id 重复：${entry.id}`);
    seen.add(entry.id);
    if (entry.channel !== 'setContent') {
      throw new Error(
        `条目 ${entry.id} channel 非法：${entry.channel}（M0 仅支持 setContent）`,
      );
    }
  }
}

for (const entry of manifest) {
  test(entry.id, async ({ page }) => {
    const html = fs.readFileSync(path.join(corpusDir, entry.file), 'utf8');
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/golden.html');
    await page.waitForFunction(
      () => (window as unknown as HarnessWindow).__ready === true,
      undefined,
      { timeout: 30_000 },
    );

    const raw = await page.evaluate(
      ({ html: h, steps }) => {
        const win = window as unknown as HarnessWindow;
        if (!win.__runOn) throw new Error('harness 未初始化：window.__runOn 缺失');
        return win.__runOn('a', h, steps);
      },
      { html, steps: entry.steps },
    );

    // 只与快照比对，不附加内容断言（假绿防线在生成后的人工抽验，见 Task 4 报告）。
    // 落盘路径由 playwright.config.ts 的 snapshotPathTemplate 决定：
    // e2e/__snapshots__/corpus-baseline.spec.ts/<id>.snap（Playwright 1.64 起无合并单文件 .snap 格式）
    await expect(normalizeHtml(raw)).toMatchSnapshot(entry.id);
    // 全部语料（含 VML/条件注释等异形输入）加载执行须零 console 错误
    expect(consoleErrors).toEqual([]);
  });
}

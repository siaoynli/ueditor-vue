import { expect, test } from 'playwright/test';
import { normalizeHtml } from '../packages/test-utils/src/normalizeHtml';
import type { CmdStep } from '../packages/test-utils/src/runSequence';

const INITIAL_HTML = '<p>abc</p>';
// 对照序列：全选后加粗，bold 是否真实生效由负对照兜底
const STEPS: CmdStep[] = [{ cmd: 'selectall' }, { cmd: 'bold' }];

interface HarnessWindow {
  __ready?: boolean;
  __runOn?: (which: 'a' | 'b', html: string, steps: CmdStep[]) => Promise<string>;
}

async function runOnPane(
  page: import('playwright/test').Page,
  which: 'a' | 'b',
): Promise<string> {
  return page.evaluate(
    ({ which: w, html, steps }) => {
      const win = window as unknown as HarnessWindow;
      if (!win.__runOn) throw new Error('harness 未初始化：window.__runOn 缺失');
      return win.__runOn(w, html, steps);
    },
    { which, html: INITIAL_HTML, steps: STEPS },
  );
}

test('双栏同序列归一化一致，且 bold 确实改变了内容（负对照）', async ({ page }) => {
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

  const htmlA = await runOnPane(page, 'a');
  const htmlB = await runOnPane(page, 'b');

  // pipeline 自洽：两栏同序列结果必须一致
  expect(normalizeHtml(htmlA)).toBe(normalizeHtml(htmlB));
  // 负对照：bold 必须真实生效，防止"两侧都没执行"的假绿
  expect(normalizeHtml(htmlA)).not.toBe(normalizeHtml(INITIAL_HTML));
  expect(consoleErrors).toEqual([]);
});

// 源: ueditor-dev-1.5.0/_src/editor.js:1-15
import { describe, expect, it } from 'vitest';
import type { UENamespace } from './types/index';

/**
 * 探测全局泄漏面（window.UE / window.baidu / globalThis.UE / globalThis.baidu）
 * vitest 默认 node 环境不保证 window 存在，故经 globalThis 双通道检查：
 * window.* 对应浏览器下原版的全局泄漏面，globalThis.* 对应 node 下的等价泄漏面
 */
function leakState(): unknown[] {
  const g = globalThis as typeof globalThis & {
    window?: { UE?: unknown; baidu?: unknown };
    UE?: unknown;
    baidu?: unknown;
  };
  return [g.window?.UE, g.window?.baidu, g.UE, g.baidu];
}

const NO_LEAK = [undefined, undefined, undefined, undefined];

describe('UE 命名空间（批0：包内化）', () => {
  it('import 前后 window/globalThis 均无 UE、baidu 泄漏', async () => {
    expect(leakState()).toEqual(NO_LEAK);
    await import('./namespace');
    expect(leakState()).toEqual(NO_LEAK);
  });

  it('commands/plugins/I18N/dom 均为对象且 instants 存在', async () => {
    const { UE } = await import('./namespace');
    expect(UE.version).toBe('1.5.0-vue');
    for (const key of ['plugins', 'commands', 'I18N', 'dom'] as const) {
      expect(UE[key]).toBeTypeOf('object');
    }
    expect(UE.instants).toBeTypeOf('object');
    // 手写 d.ts 骨架与 JS 实际形状的一致性门禁：声明缺成员时 tsc --noEmit 报错
    const shapeCheck: UENamespace = UE;
    expect(shapeCheck).toBe(UE);
  });

  it('默认导出与具名导出为同一引用（ESM 单例）', async () => {
    const mod = await import('./namespace');
    expect(mod.default).toBe(mod.UE);
  });
});

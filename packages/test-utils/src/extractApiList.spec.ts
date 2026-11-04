import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractApiList } from './extractApiList';

// 真实源文件（只读）：清单的权威格式来源，测试必须对着它断言而非凭空数字
const API_JS_PATH = fileURLToPath(
  new URL('../../../ueditor-dev-1.5.0/_examples/editor_api.js', import.meta.url),
);
const source = readFileSync(API_JS_PATH, 'utf8');

describe('extractApiList', () => {
  it('从 editor_api.js 提取 paths 数组：数量与首文件符合实测', () => {
    const list = extractApiList(source);
    // 实测 editor_api.js:6-122 共 117 条（editor.js → adapter/autosave.js）
    expect(list.length).toBe(117);
    expect(list.length).toBeGreaterThan(100);
    expect(list[0]).toMatch(/editor\.js$/);
  });

  it('保持原顺序且路径为 _src 相对路径（不带引号与空白）', () => {
    const list = extractApiList(source);
    expect(list[1]).toBe('core/browser.js');
    expect(list[2]).toBe('core/utils.js');
    expect(list[list.length - 1]).toBe('adapter/autosave.js');
    for (const p of list) {
      expect(p).toMatch(/^[A-Za-z0-9_./-]+\.js$/);
    }
  });

  it('包含对照自检依赖的命令文件（selectall / basestyle / Editor 核心）', () => {
    const list = extractApiList(source);
    expect(list).toContain('core/Editor.js');
    expect(list).toContain('plugins/selectall.js');
    expect(list).toContain('plugins/basestyle.js');
  });

  it('源中无 paths 数组时抛错而非静默返回空', () => {
    expect(() => extractApiList('var foo = [1, 2];')).toThrow(/paths/);
  });
});

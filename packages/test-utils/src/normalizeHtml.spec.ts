import { describe, it, expect } from 'vitest';
import { normalizeHtml } from './normalizeHtml';

describe('normalizeHtml', () => {
  it('属性顺序不影响结果', () => {
    expect(normalizeHtml('<p class="a" id="b">x</p>'))
      .toBe(normalizeHtml('<p id="b" class="a">x</p>'));
  });
  it('标签间空白折叠，但加粗差异必须保留（Review Focus 2）', () => {
    const a = normalizeHtml('<div>\n  <p>文本</p>\n</div>');
    const b = normalizeHtml('<div><p>文本</p></div>');
    expect(a).toBe(b);
    expect(normalizeHtml('<p><strong>x</strong></p>'))
      .not.toBe(normalizeHtml('<p>x</p>'));
  });
  it('stripAttrs 剔除运行时属性', () => {
    expect(normalizeHtml('<img data-ue-id="1" src="/a.png">', { stripAttrs: ['data-ue-id'] }))
      .toBe('<img src="/a.png">');
  });
  it('自闭合与布尔属性规范化统一', () => {
    expect(normalizeHtml('<br/>')).toBe(normalizeHtml('<br>'));
  });
  // 语料含 mso 条件注释（<!--[if gte mso 9]>...<![endif]-->），注释丢失会掩盖真实差异
  it('注释节点在归一化后保留', () => {
    expect(normalizeHtml('<p>a<!--c-->b</p>')).toBe('<p>a<!--c-->b</p>');
  });
});

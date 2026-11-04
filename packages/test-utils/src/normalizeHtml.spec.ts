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
  // NBSP 是 Word/mso 语料的语义字符（缩进序列），不得按排版空白删除，且须以实体形态输出
  it('NBSP 保留且以 &nbsp; 实体往返', () => {
    expect(normalizeHtml('<p>a&nbsp;b</p>')).not.toBe(normalizeHtml('<p>ab</p>'));
    expect(normalizeHtml('<p>a&nbsp;b</p>')).toBe('<p>a&nbsp;b</p>');
  });
  // 实体转义往返是语料 diff 最易静默腐蚀的路径，钉住精确输出
  it('文本与属性中的实体转义稳定往返', () => {
    expect(normalizeHtml('<p>a &amp; b</p>')).toBe('<p>a &amp; b</p>');
    expect(normalizeHtml('<p title="q&quot;uote">x</p>')).toBe('<p title="q&quot;uote">x</p>');
  });
});

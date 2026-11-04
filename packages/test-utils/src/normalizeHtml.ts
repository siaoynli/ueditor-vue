import { parseHTML } from 'linkedom';

/** normalizeHtml 选项 */
export interface NormalizeOptions {
  /** 需剔除的属性名（不分大小写），用于去掉编辑器运行时生成、金标准对照无意义的属性 */
  stripAttrs?: string[];
}

// 用 linkedom 解析而非正则：正则易误伤属性值内的空白与引号，无法可靠处理嵌套
type ENode = {
  nodeType: number;
  nodeName: string;
  data?: string;
  textContent?: string;
  childNodes: Iterable<ENode>;
  getAttributeNames?: () => string[];
  getAttribute?: (name: string) => string | null;
};

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

// void 标签统一输出无斜杠形式（<br> 而非 <br/>），抹平源写法差异
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// 折叠/判空用显式空白类而非 \s：NBSP（\u00a0）在 Word/mso 语料中是语义字符
// （缩进序列），若按排版空白处理会被整节点删除，系统性抹平真实差异
const WS_RUN = /[ \t\r\n\f\v]+/g;
const WS_ONLY = /^[ \t\r\n\f\v]*$/;

const collapseWs = (s: string) => s.replace(WS_RUN, ' ');

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // NBSP 以实体形态输出，保证双侧对称且 diff 可读
    .replace(/\u00a0/g, '&nbsp;');

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // NBSP 同 escapeText 以实体形态输出：属性内（mso style 等）若原样透传会与文本侧不对称
    .replace(/\u00a0/g, '&nbsp;');

/** 深度遍历手动序列化：linkedom 的 outerHTML 不保证属性排序，需自控输出形态 */
function serialize(node: ENode, strip: Set<string>): string {
  if (node.nodeType === TEXT_NODE) {
    const collapsed = collapseWs(node.data ?? node.textContent ?? '');
    // 纯排版空白文本节点整节点丢弃：缩进/换行不承载内容语义，对照双方一致折叠；
    // 判空用 WS_ONLY 而非 trim()，后者会连 NBSP 一起剥掉
    if (WS_ONLY.test(collapsed)) return '';
    return escapeText(collapsed);
  }
  if (node.nodeType === COMMENT_NODE) {
    // 注释原文保留：语料含 mso 条件注释，丢弃会掩盖 Word 粘贴的真实差异
    return `<!--${node.data ?? ''}-->`;
  }
  if (node.nodeType === ELEMENT_NODE) {
    const name = node.nodeName.toLowerCase();
    const attrs: Array<[string, string]> = [];
    for (const rawName of node.getAttributeNames?.() ?? []) {
      const attrName = rawName.toLowerCase();
      if (strip.has(attrName)) continue;
      attrs.push([attrName, node.getAttribute?.(rawName) ?? '']);
    }
    attrs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const attrText = attrs.map(([n, v]) => ` ${n}="${escapeAttr(v)}"`).join('');
    const open = `<${name}${attrText}>`;
    if (VOID_TAGS.has(name)) return open;
    let inner = '';
    for (const child of node.childNodes) inner += serialize(child, strip);
    return `${open}${inner}</${name}>`;
  }
  return '';
}

/**
 * 将 HTML 归一化为稳定可 diff 的字符串（金标准对照基础）
 *
 * @param html - 待归一化的 HTML 片段
 * @param opts - 归一化选项
 * @returns 标签名/属性名小写、属性按名排序、空白折叠、void 标签无斜杠的 HTML 字符串
 */
export function normalizeHtml(html: string, opts?: NormalizeOptions): string {
  // 显式包 html/body：linkedom 解析裸片段会把首个标签误当根节点，内容落在 body 之外
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const strip = new Set((opts?.stripAttrs ?? []).map((s) => s.toLowerCase()));
  let out = '';
  const body = document.querySelector('body');
  for (const child of ((body ?? document.documentElement) as unknown as ENode).childNodes) {
    out += serialize(child, strip);
  }
  return out;
}

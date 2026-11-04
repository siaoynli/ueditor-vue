/**
 * editor_api.js 文件清单提取（金标准 baseline 拼接的清单来源）
 *
 * 与旧仓库 Gruntfile.js:12 的 fetchScripts 同源格式，但用精确引号匹配替代其
 * "剥掉所有引号空白" 的粗暴做法，避免路径内合法字符被误删。
 */

// 实测 _examples/editor_api.js:5 格式：var paths  = [ '...', ... ]，单引号、每行一项
const PATHS_ARRAY_RE = /paths\s*=\s*\[([\s\S]*?)\]/;
const QUOTED_ITEM_RE = /'([^']+)'/g;

/**
 * 从 editor_api.js 源码提取 _src 相对路径清单（保持原顺序）
 *
 * @param source - editor_api.js 文件内容
 * @returns 形如 ['editor.js', 'core/browser.js', ...] 的路径数组
 * @throws 源文本中不存在 paths 数组时抛错（宁可早失败，不静默产出空 bundle）
 */
export function extractApiList(source: string): string[] {
  const match = PATHS_ARRAY_RE.exec(source);
  if (!match) {
    throw new Error('extractApiList: 未在 editor_api.js 中找到 paths 数组');
  }
  return [...match[1].matchAll(QUOTED_ITEM_RE)].map((m) => m[1]);
}

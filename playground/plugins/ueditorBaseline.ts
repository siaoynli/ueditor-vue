import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
// 注意：vite.config 的裸包导入会被 externalize 交 Node 直接执行，而 test-utils 的 main 指向 .ts 源文件，
// Node 无法解析，故插件内用相对路径引源码（esbuild 打包 config 时会一并编译）
import { extractApiList } from '../../packages/test-utils/src/extractApiList';

/** ueditorBaseline 插件选项 */
export interface UEditorBaselineOptions {
  /** 旧版 UEditor 仓库根目录（只读），默认为仓库根下 ueditor-dev-1.5.0 */
  legacyRoot?: string;
}

// 对齐 Gruntfile.js:61-67 concat.options：banner = 许可注释 + "(function(){\n\n"，footer = "\n\n})();\n"
// 许可注释中的 <%= new Date() %> 在 Grunt 为构建期展开，此处等价地取 dev server 启动时刻
function buildBanner(pkg: { name: string; version: string }): string {
  return (
    `/*!\n * ${pkg.name}\n * version: ${pkg.version}\n` +
    ` * build: ${new Date().toString()}\n */\n\n(function(){\n\n`
  );
}

/**
 * 按 editor_api.js 清单内存拼接 _src 全量源码，复现 Grunt concat 的产物结构
 *
 * @param legacyRoot - 旧仓库根目录
 * @returns 与 dist/ueditor.all.js 同构的 IIFE bundle 文本
 */
export function buildBaselineBundle(legacyRoot: string): string {
  const apiSource = fs.readFileSync(
    path.join(legacyRoot, '_examples', 'editor_api.js'),
    'utf8',
  );
  const files = extractApiList(apiSource);
  const pkg = JSON.parse(
    fs.readFileSync(path.join(legacyRoot, 'package.json'), 'utf8'),
  ) as { name: string; version: string };

  // Gruntfile.js:68-73 process 语义：每文件前置 "// <相对路径>" 注释、首个 "/_css/" 替换为 "/css/"、尾部补换行；
  // 文件间以默认分隔符 \n 连接（grunt-contrib-concat 行为）
  const parts = files.map((rel) => {
    const src = fs.readFileSync(path.join(legacyRoot, '_src', rel), 'utf8');
    return `// ${rel}\n${src.replace('/_css/', '/css/')}\n`;
  });
  return buildBanner(pkg) + parts.join('\n') + '\n\n})();\n';
}

const MIME_TYPES: Record<string, string> = {
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.html': 'text/html;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json;charset=utf-8',
};

// JS 拼接按 Grunt process 语义把 /_css/ 改成了 /css/，adapter 注入的主题 CSS href 因此指向
// dist 产物路径，而源仓库不存在它。此处复现 Grunt css 任务（Gruntfile.js:91-94 + Util.fetchStyles）：
// 按 @import 顺序现场拼接 _css 叶子文件，作为该虚拟路径的响应。
const VIRTUAL_THEME_CSS = '/themes/default/css/ueditor.css';

function buildThemeCss(legacyRoot: string): string {
  const cssBase = path.join(legacyRoot, 'themes', 'default', '_css');
  const entry = fs.readFileSync(path.join(cssBase, 'ueditor.css'), 'utf8');
  const parts: string[] = [];
  const importRe = /@import\s+([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(entry)) !== null) {
    const file = match[1].replace(/['"]/g, '').trim();
    parts.push(fs.readFileSync(path.join(cssBase, file), 'utf8'));
  }
  return parts.join('\n');
}

// /ueditor-static/* → 旧仓库文件，只读映射；越界防护优先于存在性检查
function makeStaticHandler(legacyRoot: string): Connect.NextHandleFunction {
  let themeCssCache: string | null = null;
  return (req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (rel.includes('..')) {
      res.statusCode = 403;
      res.end('Forbidden: path traversal');
      return;
    }
    if (rel === VIRTUAL_THEME_CSS) {
      themeCssCache ??= buildThemeCss(legacyRoot);
      res.setHeader('Content-Type', MIME_TYPES['.css']);
      res.setHeader('Cache-Control', 'no-cache');
      res.end(themeCssCache);
      return;
    }
    const abs = path.resolve(legacyRoot, `.${rel}`);
    // resolve 后再次校验前缀，杜绝编码绕过
    if (abs !== legacyRoot && !abs.startsWith(legacyRoot + path.sep)) {
      res.statusCode = 403;
      res.end('Forbidden: outside legacy root');
      return;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      // 直接 404 而非 next()：落到 vite 的 SPA fallback 会返回 200 HTML，
      // 让 script/link 加载到错误内容且极难排查
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    if (!stat.isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    res.setHeader('Content-Type', MIME_TYPES[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(abs).pipe(res);
  };
}

/**
 * 金标准 baseline 插件：提供 /@baseline/ueditor.all.js（内存拼接引擎包）
 * 与 /ueditor-static/*（旧仓库 lang/themes 等静态资源，只读）
 */
export function ueditorBaseline(options: UEditorBaselineOptions = {}): Plugin {
  // playground/plugins/ → 上两级即仓库根
  const legacyRoot =
    options.legacyRoot ??
    fileURLToPath(new URL('../../ueditor-dev-1.5.0', import.meta.url));

  return {
    name: 'ueditor-baseline',
    configureServer(server) {
      let bundle: string | null = null;
      server.middlewares.use('/@baseline/ueditor.all.js', (_req, res) => {
        // 旧仓库只读，dev server 生命周期内拼接一次即可
        bundle ??= buildBaselineBundle(legacyRoot);
        res.setHeader('Content-Type', 'text/javascript;charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(bundle);
      });
      server.middlewares.use('/ueditor-static', makeStaticHandler(legacyRoot));
    },
  };
}

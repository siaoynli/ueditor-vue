# CLAUDE.md — ueditor-vue 项目约定

本文件是项目级指令，补充（不替代）全局 CLAUDE.md 工作流程。

## 项目背景与目标

将百度 UEditor dev-1.5.0（内部版本号 2.0.0，MIT 协议，官方已停更）**改造为 Vue 3 + TypeScript 富文本组件**，务实完整复刻功能：

- **改造路线（已裁决）：路线 B** —— 复用 UEditor 引擎（`_src/core` + `_src/plugins`，零 jQuery 依赖，迁移为 ESM/TS），废弃其 UI 层（`_src/ui` + 22 个 iframe dialogs），用 Vue 3 SFC 重写工具栏与弹窗。
- **API 设计（已裁决）：只借鉴 wangEditor 5 的架构模式，不引入其引擎**（wangEditor 官方仓库 2022 年归档、2024 年停止维护，不得作为依赖）：monorepo 分包、`MENU_CONF` 式每菜单独立配置、`registerCommand/registerToolbarButton/registerDialog` 式扩展 API、`toolbarKeys` 工具栏裁剪、`mode: 'default'|'simple'` 两档预设。
- **已确认约束**：仅支持现代浏览器（放弃 IE）；服务端对接 Laravel（自有 controller，禁用原版 demo PHP/Java 后端——官方 README 明示其含 SSRF 与文件包含漏洞）；已停服第三方功能（gmap/百度地图/音乐/webapp/截屏）按"务实复刻"处理：提供占位与扩展点，不保留死服务依赖。

## UEditor 1.5.0 源码调研结论（迁移契约基准，改代码前必读）

原版源码留档于 `ueditor-dev-1.5.0/`（**只读参考，禁止修改**，作为行为金标准与迁移素材）。

### 1. 启动装配

- 所有源文件通过全局 `window.baidu / window.UE` 命名空间通信；Grunt 构建把文件 concat 包进一个 IIFE。
- 迁移顺序权威清单：`ueditor-dev-1.5.0/_examples/editor_api.js:5-124`（editor.js → core 15 文件 → plugins 约 70 个 → ui → adapter），依赖严格由此顺序保证（如 filternode 依赖 htmlparser/node）。
- `UE.Editor` 构造时合并 `window.UEDITOR_CONFIG` → 异步 GET `?action=config` 拉服务端配置（`loadconfig.js`，事件 `serverConfigLoaded`）→ `UE.plugin.load()` 执行全部注册插件。ESM 迁移须消除这 3 处 window 全局耦合，改为构造参数注入。
- `~` 前缀资源路径经 `editor.ui.mapUrl` 拼接 `UEDITOR_HOME_URL` 实现——Vue 化后随 iframe dialogs 一起废弃。

### 2. 命令系统（Vue UI 层的状态契约）

- 两级注册：全局 `UE.commands[name]` / 实例 `editor.commands[name]`；查找顺序实例优先；**命令名一律 toLowerCase**。
- 命令对象形状：`{ execCommand(cmdName, ...args), queryCommandState(), queryCommandValue(), notNeedUndo?, ignoreContentChange? }`。
- 按钮状态刷新契约（`_src/adapter/editorui.js`）：监听 `selectionchange`（参数 `(type, causeByUi, uiReady)`）→ `queryCommandState`：`-1`=禁用、`0`=正常、`1`=激活（选中）；下拉/Combox 值取 `queryCommandValue`。Vue 工具栏组件必须实现同一契约的响应式版本。
- `execCommand` 副作用链：`saveScene`(undo 快照) → `beforeexeccommand` → 执行 → `afterexeccommand` → `contentchange` → `_selectionChange()`。
- 源码模式特殊契约：`plugins/source.js` 劫持 `queryCommandState`，除白名单外全部返回 -1（禁用工具栏）。
- UI 层要监听的事件全集：`ready / serverConfigLoaded / contentchange / selectionchange / beforeexeccommand / afterexeccommand / beforesetcontent / aftersetcontent / beforegetcontent / aftergetcontent / beforepaste / afterpaste / catchRemoteImage / catchremotesuccess / simpleuploadbtnready`。

### 3. Dialog 机制（替换红线）

- 旧 dialog = iframe 页面 + `parent.$EDITORUI[dialogId]` 直连对象引用；与 editor 通信**唯一写入口是 `editor.execCommand(...)`**，另有 `dialog.onclose/onok` 钩子、`editor.getDialog(name)`（内部即 `editor.ui._dialogs[name+"Dialog"]`）。
- 没有 `registerDialog` API；注册途径是 `editorui.js` 的 iframeUrlMap（24 项）+ `editor.ui._dialogs`。
- 迁移结论：Vue 弹窗只要守住 execCommand 契约即可完全替换。两个特殊形态需显式建模：emotion 的 MultiMenuPop 弹层、source 模式的命令禁用劫持。

### 4. 服务端通信协议（Laravel 端契约基准）

- URL 统一由 `getActionUrl(action)` 生成：`serverUrl + "?action=..."`。
- action 全集：`config`、`uploadimage`、`uploadvideo`、`uploadfile`、`uploadscrawl`、`catchimage`、`listimage`、`listfile`（actionName 可经后端 config 响应覆写）。
- **Vue 版终版契约（用户已裁决）**：仅实现 `uploadimage/uploadvideo/uploadfile/listimage/listfile/removeimage?/removefile?`；`config` 拉取、`catchimage`（远程抓图）、`uploadscrawl`（涂鸦）整体裁撤，不出现在新组件协议文档里。
- 上传 = multipart POST，文件字段名 `imageFieldName/videoFieldName/fileFieldName/scrawlFieldName`（默认 upfile/file 等）；涂鸦以 base64 表单字段提交。
- 响应统一约定：`{ state: 'SUCCESS' | 中文错误串, url, title, original }`；列表 = `{ state, list:[{url,...}], start, total }`（GET query `start/size`）；远程抓取 = POST，字段 `source[]`（数组序列化），响应 `{ state, list:[{source, url, state}] }`。
- `serverparam` 插件为所有请求注入附加参数（token 等）→ Vue 版演化为 `beforeRequest` 钩子。
- 旧传输通道废弃：simpleupload 的隐藏表单+iframe POST、jsonp 跨域 → 统一 fetch/XHR + CORS，**协议字段不变**。

### 5. 内容净化链（必须保序复刻 + 新增安全层）

- setContent：`beforesetcontent` → `UE.htmlparser`(uNode 树) → `filterInputRule` → `toHtml()` 写 body → enterTag=='p' 包裹裸 inline → `aftersetcontent/contentchange`。
- getContent：`beforegetcontent` → htmlparser → `filterOutputRule` → `aftergetcontent` → `toHtml(formatter)`。
- 粘贴链顺序契约（`plugins/paste.js`，不得改变）：浏览器级 pastebin 清洗 → `UE.filterWord`（去 Word 冗余）→ `UE.filterNode(options.filterRules)` → `filterInputRule` → `beforepaste`（可拦截）→ insertHtml；纯文本模式另过 `filterTxtRules`。
- **1.5.0 无标签白名单机制**（无 allowTags/denyTags）；结构合法性事实来源是 `dtd.js`；输入规则来源 `plugins/defaultfilter.js`（选项 `allowDivTransToP/disabledTableInTable/rgb2Hex`）。
- 新增安全层落点：在 setContent/粘贴/getContent 三个咽喉点挂 DOMPurify（可开关，默认开），不动旧链。
- autotypeset 不在输入/输出链上，是独立 `execCommand('autotypeset')`。

### 6. source 模式与草稿

- 源码编辑器工厂 `sourceEditors` 有 textarea 与 codemirror（动态加载 third-party/codemirror）两种；Vue 版改用懒加载 CodeMirror 6 或轻量替代，保持 `sourceMode` 对命令状态的劫持行为。
- 草稿存储：localStorage 单 key `ueditor_preference`，值 `{ "<url下划线化><editorKey>-drafts-data": "<body.innerHTML 原文>" }`；autosave 以 `contentchange` debounce `saveInterval`（默认 500ms）写入；钩子 `beforeautosave`（返回 false 阻止）/`afterautosave`；按钮可用性用 `queryCommandState('drafts')`（-1=无草稿）。**复刻需保持 key 结构兼容，允许读取老草稿。**

### 7. 第三方依赖处置表

| 依赖 | 旧用途 | 迁移决策 |
|---|---|---|
| jquery 1.10.2 | 仅 4 个 dialog html（image/video/attachment/charts） | 随 dialogs 重写整体移除 |
| WebUploader（含 swf） | image/video/attachment 上传器 | 自研 Vue 上传组件，保持第 4 节协议 |
| highcharts（旧版，商业授权风险） | charts 弹窗 | 待裁决：换 ECharts 懒加载 或 降级扩展点 |
| SyntaxHighlighter | **不在编辑端加载**，仅展示端 ueditor.parse.js 用 | 展示端换 highlight.js 懒加载 |
| codemirror（旧版） | source 模式 | CodeMirror 6 懒加载 |
| snapscreen exe / wordimage swf / zeroclipboard | 截屏客户端 / Flash 剪贴板 / Flash 复制兜底 | 截屏裁撤（扩展点）；**wordimage 连同远程抓图功能整体裁撤（用户裁决，不重实现）**；clipboard 用现代 Clipboard API |
| video-js | 编辑端只输出 class，展示端播放 | 移除，用原生 `<video>` |
| canvas 手写板（scrawl，自研 js） | 涂鸦 | **裁撤（用户裁决）**：scrawl 插件、弹窗、uploadscrawl action 全部不实现 |

## 规划目录结构（设计获批后创建）

```
packages/
  core/       # 引擎迁移层（Editor/Range/Selection/domUtils/htmlparser/filterword/
              # filternode/dtd/node/browser/keymap/plugin/ajax/utils）无 UI、无 window 全局
  commands/   # plugins 命令层迁移 + registerCommand
  config/     # 配置 schema（兼容 UEDITOR_CONFIG 键名）+ i18n（复用 lang/）
  ui/         # Vue 3 控件原语：Toolbar/ToolbarButton/ComboPopup/ColorPicker/
              # TablePicker/MenuButton/DialogShell/Dropdown + CSS 变量主题
  dialogs/    # 弹窗逐个 Vue SFC（约 15 个：图片/视频/附件管理器、搜索替换、表情等；
              # 涂鸦/抓图/wordimage 已裁撤，见"设计裁决记录"）
  vue/        # 发布物：<UEditor v-model> + useEditor() + register* 扩展 API
  parse/      # 展示端 ueditor.parse.js 复刻（已批准纳入）
playground/   # Vite demo + 新旧并排金标准对照页
ueditor-dev-1.5.0/  # 只读参考
```

依赖方向单向：`vue → dialogs/ui → commands → core → config`。

## 工程约定

- Vue 3 + TypeScript + Vite + pnpm monorepo；组件库产物 ESM；测试 Vitest（引擎层单测）+ Playwright（新旧对照 E2E）。
- TS 化策略：引擎迁移首批保持 JS 逻辑原样 + 挂手写 `.d.ts`，渐进转 TS；UI/适配层直接 TS。
- 行为保真验收 = "金标准对照"：同一输入在新（原版）旧（Vue 版）编辑器并排执行同一命令序列，输出 HTML diff 一致（空白/属性序归一化后）。
- 不修改 `ueditor-dev-1.5.0/` 目录任何文件；迁移是"复制或重写进 packages/"，用 Git 记录来源映射（每个迁移文件头注释标注源文件路径）。
- 原版 PHP/Java 后端代码不迁移、不建议使用；Laravel 端接口按第 4 节协议另实现，校验（类型白名单、大小、频率、CSRF）在后端负责。

## 设计裁决记录（2026-11-03，全部通过）

完整规格：`docs/superpowers/specs/2026-11-03-ueditor-vue-design.md`（八段 + 修订轨迹）。要点：

1. 第 1–8 段设计全部批准（分包/组件 API/引擎迁移/功能清单/服务契约/安全/性能/测试交付/扩展体系）。
2. `_parse` 展示端**纳入**（`v-ueditor-parse` 指令 + 函数式 API；SyntaxHighlighter→highlight.js 懒加载；video-js 移除；停服占位→静态提示块）。
3. charts 定为 **ECharts 懒加载 + 老 highcharts 数据适配器**。
4. **裁撤**：远程图片抓取（catchremoteimage/wordimage/catchimage）、涂鸦（scrawl/uploadscrawl）；**新增**：剪贴板图片粘贴上传（默认走 uploadimage，开关 `pasteImageUpload`）。
5. 交付边界：仅前端组件库，Laravel 契约只出文档；配置全前端化（无 config action 拉取）。
6. 按钮扩展为显式承诺：`ToolbarButtonDef` 一次注册 → 工具栏/右键/快捷键/i18n/状态五处可寻址（规格 §8）。


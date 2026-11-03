# ueditor-vue 设计规格说明书

> 状态：八段设计经用户逐段裁决通过（含修订记录见文末）。本文为实现计划（writing-plans）的唯一输入。
> 日期：2026-11-03 ｜ 路线代号：B+（UEditor 引擎保真迁移 × wangEditor 5 架构模式 × Vue 3）

---

## 0. 背景与已裁决决策

**目标**：将百度 UEditor dev-1.5.0（官方停更，MIT）改造为 Vue 3 + TypeScript 富文本组件，务实完整复刻功能，兼顾功能保真、安全、性能、可扩展四项目标。

| 决策项 | 结论 | 裁决记录 |
|---|---|---|
| 改造路线 | 路线 B：复用 `_src/core`+`_src/plugins` 引擎（零 jQuery），废弃 `_src/ui`+22 iframe dialogs，Vue 重写 | 批准 |
| API 风格 | 借鉴 wangEditor 5 架构模式（monorepo/MENU_CONF/registerX/toolbarKeys/mode），**不引入其停更引擎** | 批准 |
| 服务端 | **PHP + MySQL**（用户 2026-11-03 更正，原误记 Laravel）：对接自有 PHP 端点，契约只出文档不写后端代码；仍禁用原版 demo PHP/Java connector（官方自述 SSRF/文件包含漏洞） | 批准 |
| 配置模型 | 全前端化：废除 `?action=config` 拉取与 `loadconfig/serverConfigLoaded`，内置默认值 + props 覆写，组件设置越简单越好 | 批准 |
| 功能取舍 | 删除：远程图片抓取（catchremoteimage/wordimage/catchimage）、涂鸦（scrawl/uploadscrawl）。新增：剪贴板图片粘贴上传。charts 用 ECharts。`_parse` 展示端纳入 | 批准 |
| 扩展性 | 按钮级扩展为显式设计承诺：注册一个描述对象即可新增按钮，零修改库源码 | 批准 |
| 技术栈 | Vue 3 + TS + Vite + pnpm monorepo；仅现代浏览器 | 批准 |

**行为基准**：`ueditor-dev-1.5.0/` 只读留档，作金标准对照端与迁移素材，禁止修改。

---

## 1. 产品形态与工程结构

### 1.1 pnpm monorepo

```
packages/
  core/       引擎迁移层：Editor/EventBase/Range/Selection/domUtils/htmlparser/
              filterword/filternode/dtd/node/browser/keymap/plugin/ajax/utils
              —— 纯 ESM，无 UI、零 window 全局依赖
  commands/   plugins 命令层迁移 + registerCommand 注册机制
  config/     配置 schema（兼容 UEDITOR_CONFIG 键名）+ 默认值 + i18n（lang/ zh_CN、en 转静态 JSON）
  ui/         Vue 3 控件原语：Toolbar/ToolbarButton/ComboPopup/ColorPicker/TablePicker/
              MenuButton/DialogShell/Dropdown/上传队列面板 + CSS 变量主题
  dialogs/    弹窗 Vue SFC（清单见 §3）
  parse/      展示端复刻（v-ueditor-parse 指令 + parse(el) 函数）
  vue/        发布物：<UEditor v-model> + useEditor() + register* 扩展 API
playground/   Vite demo + 新旧并排"金标准对照"harness
ueditor-dev-1.5.0/  原版源码（只读基准）
```

依赖方向单向：`vue → dialogs/ui → commands → core → config`；`parse` 仅依赖 `config`。任何一层可独立替换（含二期换引擎预留的隔离墙）。

### 1.2 组件 API（wangEditor 5 习惯平移）

```vue
<UEditor
  v-model="html"                          // 同步 getContent() 语义 HTML
  mode="default" | "simple"               // 两档预设
  :config="{ initialFrameHeight: 400, wordCount: true }"   // UEditor 兼容键直通引擎
  :editor-config="{
      placeholder: '请输入内容…',
      pasteImageUpload: true,             // 剪贴板图片粘贴→uploadimage（新增能力开关）
      MENU_CONF: {                        // 每菜单独立配置
        uploadImage: { server, fieldName, maxSize, maxCount, headers },
        uploadVideo: { ... }, uploadFile: { ... },
        fileManager: { listServer, removeServer? },
      },
      request: {                          // RequestAdapter（§4.1）
        beforeRequest, afterResponse, fetcher,
      },
  }"
  :toolbar-keys="toolbar"                 // 兼容 ueditor 二维数组 + 声明式对象；excludeKeys/insertKeys
  :buttons="[localBtnDef]"                // 实例级按钮注册（§8）
  :readonly="false"
  @on-created @on-change @on-selection-change @on-focus @on-blur
  @before-upload="(file) => boolean|Promise"   // 拦截/签名注入机会
  @on-error="(e: UEditorError) => void"        // 类型化：UPLOAD|REQUEST|PASTE|COMMAND|SANITIZE
/>
```

- **expose**：`getEditor()`（原生引擎逃生舱）、`execCommand/queryCommandState/getContent('html'|'text')/getText/setContent/focus/blur/isFullScreen/destroy`
- **slots**：`toolbar-start/toolbar-end/statusbar`
- **主题**：CSS 变量令牌（`--ue-border/--ue-primary/…`）+ 暗色令牌；图标 SVG symbol `<iconMap>` 注入，替代雪碧图
- **与 wangEditor 差异声明**：编辑区仍是 iframe contenteditable（引擎保真代价 + XSS 隔离红利）；v-model 是 UEditor `getContent()` 语义 HTML，非 Slate JSON。

### 1.3 命令状态契约（全项目统一，对齐原版）

`queryCommandState` 三值：`-1`=禁用、`0`=正常、`1`=激活；`queryCommandValue` 供下拉显示值；刷新时机 = `selectionchange`（参数 `(type, causeByUi, uiReady)`）；命令名 toLowerCase 查找、实例表优先于全局表。UI 监听事件全集：`ready/contentchange/selectionchange/beforeexeccommand/afterexeccommand/beforesetcontent/aftersetcontent/beforegetcontent/aftergetcontent/beforepaste/afterpaste/simpleuploadbtnready`。（`serverConfigLoaded` 随 config 拉取机制删除。）

---

## 2. 引擎迁移设计（core + commands）

### 2.1 命名空间消解

- 逐文件转换：`(function(){var utils=baidu.editor.utils;…})()` → `import { utils } from './utils'`；`UE` 命名空间对象降级为包内模块（commands/plugins/dtd 字典保留，不上 window）
- `UE.plugins[name]=fn` 魔法注册 → 显式插件清单数组 + `registerCommand`
- 迁移批次按 `_examples/editor_api.js` 依赖序分 6 批：
  `browser/utils/EventBase → domUtils/node/dtd → htmlparser/filternode/filterword → Range/Selection → Editor/plugin/keymap/ajax → commands`，每批完成即跑该层单测

### 2.2 window 耦合拆除（3 处）

| 原耦合 | 方案 |
|---|---|
| `window.UEDITOR_CONFIG` | 构造参数注入 + config 包 schema 校验/默认值合并 |
| `UEDITOR_HOME_URL`/`~` 路径/lang·dialogs 动态脚本加载 | 整体删除；资源交 Vite；i18n 静态 JSON |
| `UE.instants` 全局注册表 | Vue 实例自管理，多实例天然隔离 |
| `?action=config` 服务端配置合并（loadconfig.js） | **删除**（裁决：全前端配置） |

### 2.3 TS 渐进策略

引擎首批逻辑原样保持 .js + 包入口手写 `.d.ts`（Editor/Range/execCommand 等公开面 100% 类型覆盖）；迁移中被修改的文件（Editor.js 拆 loadconfig 段、paste.js 删 IE 分支）第一批即转 TS；ui/commands/vue/dialogs/parse 原生 TS。

### 2.4 行为删改清单（保真前提最小现代化）

- 删：`paste.js` IE 分支、`browser.js` ie/old-opera 检测、`keymap.js` IE 键位、jsonp 传输通道、simpleupload 隐藏表单+iframe POST（改 fetch/XHR，**协议字段不变**）、`catchremoteimage.js`、`scrawl.js`、`wordimage.js`
- 补：`destroy` 清理链（iframe 移除/undoManger 释放/document 级监听解绑），配 ×50 创建销毁堆快照无泄漏回归
- 特殊契约建模：source 模式劫持 `queryCommandState` 全局禁用非白名单命令（保留该行为，Vue 状态层显式实现）；emotion 的 MultiMenuPop 弹层形态
- SSR：引擎初始化仅在 `onMounted`，server 构建路径零 window 触达，组件支持占位渲染

### 2.5 净化链（必须保序复刻）

- setContent：`beforesetcontent → htmlparser → filterInputRule → toHtml 写 body → enterTag=p 包裹裸 inline → aftersetcontent/contentchange`
- getContent：`beforegetcontent → htmlparser → filterOutputRule → aftergetcontent → toHtml(formatter)`
- 粘贴链顺序不可变：浏览器级 pastebin 清洗 → **（新增前置步骤：剪贴板 image/* 文件拦截 → 转 §3.2 图片粘贴上传流程）** → `UE.filterWord` → `filterNode(filterRules)` → `filterInputRule` → `beforepaste` → insertHtml；纯文本模式过 `filterTxtRules`
- 原版无标签白名单（dtd.js 为结构事实来源、defaultfilter 为规则来源），DOMPurify 作为**新增层**挂接（§5.1），不动旧链

---

## 3. 功能复刻清单

### 3.1 P0 — 引擎原生迁移（行为 1:1）

撤销栈；全套样式命令（bold/italic/underline/strikethrough/sup/sub/fontborder/forecolor/backcolor）；fontfamily/fontsize/paragraph/customstyle；lineheight/rowspacing；justify/indent/outdent/directionality；有序无序列表；blockquote；removeformat；formatmatch；粘贴链（含 pasteplain）；autotypeset；表格核心（插入/行列增删/合并拆分/删除/单元格属性/拖拽调整）；图片命令（插入/对齐/缩放 fiximgclick）；链接/取消链接/锚点；水平线/日期/时间/分页符；搜索替换算法层；源码模式（切换+命令劫持）；字数统计；全选/清空/打印；快捷键体系；右键菜单引擎部分；elementPath；autosave/drafts（localStorage 兼容结构：`ueditor_preference` 下 `<url下划线化><editorKey>-drafts-data` 存 body.innerHTML 原文，debounce `saveInterval` 默认 500ms，`beforeautosave/afterautosave` 钩子，读取老草稿）。

### 3.2 P1 — Vue 重写（能力 1:1，外观现代化）

- **工具栏全控件类型**：按钮/Combox/颜色面板/TablePicker 棋盘/MenuButton/分割按钮 + §1.3 状态契约响应式化
- **图片弹窗**：本地上传（多文件队列/进度/取消）、网络图片 URL、服务端文件管理器（分页/删除可选）、对齐设置
- **视频弹窗**（上传/网络嵌入）、**附件弹窗**、文件管理器
- **simpleupload**（一键直传）、**autoupload**（拖拽/文件粘贴自动上传）
- **★ 剪贴板图片粘贴上传（新增能力）**：paste 事件检测 `clipboardData` 中 `image/*` 文件项（截屏粘贴/QQ·微信图片粘贴/文件复制粘贴全覆盖）→ 默认走 `MENU_CONF.uploadImage` 接口上传 → 上传中插入带 loading 的占位 `<img>`（data-ue-uploading 标记，不可编辑期重复粘贴）→ 成功替换为内链；失败移除占位 + `on-error(UPLOAD)`；受 `before-upload` 拦截、`pasteImageUpload` 开关（默认开）、并发队列与 uploadImage 全部校验约束
- 背景设置、模板插入、表情（静态词条图迁移）、特殊字符、insertcode 代码片段、搜索替换 UI、草稿 UI、预览、帮助
- **charts**：ECharts 懒加载（动态 import）+ 老 highcharts 数据格式适配器（读写双向，兼容存量 chart 节点）

### 3.3 已删除（裁决记录，不留扩展点占位实现）

| 删除项 | 影响与说明 |
|---|---|
| 远程图片抓取 catchremoteimage + wordimage + `catchimage` action | 粘贴内容中的外链图片**原样保留不外转**；已知取舍：源站防盗链时图裂。老内容渲染不受影响（本就是 img） |
| 涂鸦 scrawl + `uploadscrawl` action + scrawl 弹窗 | 涂鸦按钮/命令/弹窗全部不实现；老内容中的涂鸦产物就是普通 img，渲染不受影响 |
| snapscreen 截屏（IE 客户端） | P3 扩展点：保留注册机制，无内置实现 |

### 3.4 P3 — 扩展点保留（服务已死）

gmap / 百度地图 / 音乐插入 / webapp / snapscreen：配置键与注册机制保留、无默认实现、文档标注 deprecated 占位。

### 3.5 P2 — 现代 API 替换

复制到纯文本（Clipboard API，替代 zeroclipboard）；源码编辑器（CodeMirror 6 懒加载）；打印/预览（原生）；`window.getDisplayMedia` 截屏可选实现（默认关）。

### 3.6 parse 包（展示端复刻）

`v-ueditor-parse` 指令 + `parse(el|string)` 函数双形态；渲染前强制 sanitize（§5.1）；职责：chart 节点→ECharts+老数据适配、`pre.code`→highlight.js 懒加载、map/music 遗留占位→静态提示块、`video-js` class→原生 video 属性、`contenteditable=false` 节点样式、date/time/pagebreak 打印样式。编辑端与展示端解耦，可独立引用。

---

## 4. 服务层与 PHP+MySQL 后端契约

### 4.1 RequestAdapter（注入点）

```ts
interface UEditorRequestConfig {
  serverUrl: string;                     // 上传/管理端点
  actionNames?: Partial<Record<'uploadImage'|'uploadVideo'|'uploadFile'|'listImage'|'listFile'|'removeImage'|'removeFile', string>>;
  fieldName?: { image?; video?; file? }; // 对齐原版 *FieldName 键
  beforeRequest?: (req) => req | false;  // serverparam 演化：token/CSRF 注入、false=取消
  afterResponse?: (res: ServerResult) => ServerResult;
  fetcher?: (input, init) => Promise<Response>;   // 测试注入/自定义传输
}
```

- 上传：XHR（progress→队列 UI）+ 并发队列（默认 3）+ 客户端预校验（扩展名/MIME/大小/张数——仅体验层，后端为最终防线）
- 响应判定：`state === 'SUCCESS'`，否则映射类型化 `UEditorError`（兼容原版中文错误串透传）；错误对象日志脱敏（剔除 query 中 token）

### 4.2 PHP 后端契约（仅文档交付；action 集合为裁决后终版；协议与后端栈无关，原样沿用）

| action | 方法 | 要点 |
|---|---|---|
| `uploadimage`/`uploadvideo`/`uploadfile` | POST multipart | 字段名可配；响应 `{state:'SUCCESS'|错误串, url, title, original}`；url 返回绝对地址（`imageUrlPrefix` 相对拼接保留兼容） |
| `listimage`/`listfile` | GET `start/size` | `{state, list:[{url,...}], total, start}` |
| `removeimage`/`removefile` | POST | **可选**实现；必须鉴权 + 路径围栏（仅允许删自家上传目录） |

（已删：`config`、`catchimage`、`uploadscrawl`、`snapscreen`。）

### 4.3 后端安全基线（写入交付文档，实现方照单验收）

扩展名双白名单（后缀 + finfo 真实 MIME）；图片二次编码剥离 EXIF/多态载荷；随机文件名；上传目录与执行权限隔离（webroot 外，或 webserver 配置禁 PHP 执行）；按用户限流；全端点鉴权 + CSRF（token 头名按后端约定，经 `beforeRequest` 注入，示例用 `X-CSRF-Token`）；日志脱敏。原版 PHP/Java demo connector（官方自述含 SSRF/文件包含漏洞）不迁移、不建议直接使用；新 PHP 端须按本节基线自研。

---

## 5. 安全设计

### 5.1 XSS 三层防线

| 层 | 机制 |
|---|---|
| 结构隔离 | 编辑区 iframe（脏内容不进主文档 DOM） |
| 旧链保真 | htmlparser→dtd→filterWord/filterNode/inputRules 顺序复刻 |
| 新增净化 | DOMPurify 咽喉点：setContent 入口 / 粘贴 beforepaste 后 / getContent 出口（可选）/ **parse 渲染前强制** |

- `sanitize: false | 'relaxed' | 'strict' | DOMPurifyConfig`，默认 `'relaxed'`（沿用 dtd 白名单 + 剔除 script/`javascript:`/`on*`/恶意 iframe src）；`strict` 供 UGC；文档明示服务端仍需二次净化
- 库内零 `v-html`/`innerHTML` 直插用户数据；`insertframe`/视频嵌入产出的 iframe 经 `frameSandbox` 配置注入 sandbox 属性
- 无 postMessage 面（弹窗 Vue 化后旧 `$EDITORUI` 跨文档通道消失）

### 5.2 其他面

CSRF 全 POST 覆盖；密钥零内置（只走运行时钩子）；直接依赖 ≤4（DOMPurify 常驻；ECharts/CodeMirror6/highlight.js 懒加载 optional），CI `npm audit` 门禁；fuzz 粘贴语料回归（htmlparser 边缘输入）。

---

## 6. 性能设计

- **分包（toolbarKeys 驱动）**：初始必载 = core+基础命令+最小工具栏；ECharts/codemirror/highlight/文件管理器均为独立 chunk，声明或首用时动态 import（scrawl/catchimage 已裁撤，无对应 chunk）；初始 gz 预算在 M1 用真实引擎实测定数，写入 playground perf 回归（不拍脑袋承诺）
- **事件-渲染桥**：`selectionchange/contentchange` → 单一 `shallowRef` 版本号驱动工具栏 computed，rAF 节流；替代原版每按钮各挂监听的 N 倍刷新
- **撤销栈**：保持原版快照语义，`maxUndoCount` 显式默认；undo 序列化复用 `getContent` 缓存
- **实例生命周期**：iframe mounted 创建/unmounted 强制 destroy，×50 堆快照无增长为 CI 项；草稿 debounce 500ms
- **SSR**：server 路径零 window 触达，占位渲染；parse 可 server 预跑（highlight 懒加载除外）

---

## 7. 测试与交付

### 7.1 金标准对照体系（测试核心）

- **语料库**：Word/WPS 各版本粘贴样本（.docx/.rtf/html，中英混排/嵌套表/图文混排约 30 份）+ 网页剪贴样本 + **剪贴板图片粘贴样本**
- **命令矩阵**：原版 `adapter/editorui.js` 60+ 命令逐条生成用例——同初始内容、同操作序列，新旧 `getContent()` 归一化 diff = 空；三值状态逐事件校验
- **harness**：Playwright 双栏对照（playground 内嵌原版未构建源码作基准端），M0 建好，每里程碑必须绿才能合
- 分层：Vitest 单测（filterWord/htmlparser 往返/Range/dtd/上传队列/状态桥/剪贴板拦截）、MSW 模拟 PHP 后端全 action e2e、fuzz 语料回归

### 7.2 已知偏差裁决原则

金标准 diff 优先保真；确认是原版 bug 的（如表格合并边界）列"已知差异清单"，**经用户逐项批准后才允许偏离**。

### 7.3 里程碑（🔴 大型：feature 分支 + PR，每段独立可验证）

| 里程碑 | 内容 | 验收 | 预估 |
|---|---|---|---|
| M0 | 脚手架（pnpm/vite/vitest/playwright）+ 金标准 harness + 语料库入库 | 对照页跑通 bold 命令 diff | 1 周 |
| M1 | core 批次 1–5 迁移 + d.ts + 单测（含删改清单验证） | htmlparser/filterWord/Range 单测全绿；初始包体积实测出预算基线 | 2–3 周 |
| M2 | commands 全量迁移 + 命令矩阵 | 矩阵 100% 绿（P0 范围） | 2 周 |
| M3 | ui 包 + vue 包薄壳（工具栏基础项可用）+ iframe 焦点/弹层抢占 spike | demo 编辑/撤销/状态刷新正常；焦点用例绿 | 2 周 |
| M4 | 上传链路 + 剪贴板图片粘贴 + dialogs 第一批（image/video/attachment/manager/simpleupload/autoupload） | MSW e2e 全协议绿 | 2 周 |
| M5 | dialogs 第二批（背景/模板/表情/特字/搜索替换 UI/帮助/预览）+ charts(ECharts) + parse 包 + P3 扩展点文档 | 功能清单逐项勾验 | 2 周 |
| M6 | sanitize 强化 + perf 预算达标 + 双语文档站 + `v1.0.0` | 全测试绿 + 预算达标 | 1 周 |

版本策略：M1–M5 发 `0.x.0` alpha（里程碑打 tag，经确认后推送），M6 后 `v1.0.0` GA。总预估约 12–13 周。

### 7.4 风险登记

1. filterWord 边缘行为回归 → 语料库在 M1/M2 前置暴露
2. iframe 焦点管理与 Vue 弹层抢占（原版 dialog hide 有 FF 滚动补丁逻辑）→ M3 独立 spike
3. 老 bug 复刻争议 → §7.2 裁决原则
4. 剪贴板图片粘贴的浏览器差异（Firefox 文件项限制）→ M4 起 e2e 覆盖三浏览器，失败路径必达 `on-error`

---

## 8. 扩展体系（按钮/命令/弹窗/右键/快捷键五位一体）

### 8.1 三层扩展模型（映射原版机制）

```
UE.commands[name]                    → registerCommand：算法层扩展，无 UI
adapter/editorui.js 按钮工厂表(硬编码) → registerToolbarButton：UI 层扩展，注册表驱动
iframeUrlMap + editor.ui._dialogs     → registerDialog：弹窗层扩展
```

原版新增按钮需改 4 处源码；新设计 = 1 次注册 + 可选词条，零修改库源码。

### 8.2 `ToolbarButtonDef` 契约

```ts
interface ToolbarButtonDef {
  key: string;                        // toolbarKeys/excludeKeys/contextMenu 唯一寻址名
  icon?: string | Component;          // SVG path/组件；缺省文本按钮
  label?: string;                     // tooltip，支持 i18n key
  type?: 'button' | 'menu' | 'dialog' | 'component';
  run?: (editor, ...args) => void;    // button：推荐内部走 execCommand
  menu?: MenuItemDef[] | MenuConfig;  // menu：复用 ColorPicker/TablePicker/列表面板
  dialog?: Component;                 // dialog：DialogShell 托管
  component?: Component;              // 完全自定义控件（escape hatch）
  getState?: (editor) => -1 | 0 | 1;  // 缺省自动 editor.queryCommandState(key)
  getValue?: (editor) => string;      // 下拉显示值
  when?: (editor) => boolean;         // 按选区/内容显隐（原版无，新增能力）
  configKey?: string;                 // → editorConfig.MENU_CONF[configKey] 独立配置命名空间
  shortcuts?: string[];               // 'ctrl+alt+m' 进 keymap
  contextMenu?: boolean;              // 同步进右键菜单
  group?: number;                     // 默认插入分组
}
```

一次注册五处可寻址：工具栏、右键、快捷键、i18n（`registerLang`）、状态刷新（复用 §6 事件-渲染桥）。

### 8.3 接线规则

- 命令先行：`registerCommand` 接受原版命令对象形状（`execCommand/queryCommandState/queryCommandValue/notNeedUndo`），老 ueditor 第三方插件源码近乎原样平移
- 作用域：`UEditor.registerToolbarButton` 全局（所有实例）；prop `:buttons` 实例级（卸载自动回收，多租户不互染）；重复 key：全局报错 fail-fast，实例覆写并告警
- 工具栏支持多行（原版 `toolbars:[[...],[...]]` 语义）+ `divider/spacer` 特殊键 + `excludeKeys/insertKeys`（wangEditor 式）
- 图标：SVG symbol `<iconMap>` 注入，不碰雪碧图

### 8.4 公开扩展 API 全集（7 个，其余内部成员非公开）

```
registerCommand / registerToolbarButton / registerDialog / registerLang
toolbarKeys(声明式) / excludeKeys / insertKeys
useEditorContext()   // 自定义 component 按钮内取 editor/状态/弹层
```

### 8.5 扩展验收用例（入金标准体系）

1. 外部包注册"Markdown 快捷插入"按钮（button+command+shortcut+contextMenu），三处同时可用，不改库源码；
2. 注册在线图片搜索面板（component 按钮），实例卸载后无内存残留（并入 ×50 堆快照）；
3. 平移真实社区老 ueditor 插件（候选：公式插件）≤1 天跑通（M5 试验项）。

---

## 9. 修订记录（用户裁决轨迹）

| 轮次 | 裁决 |
|---|---|
| 路线选择 | 批准路线 B（引擎复用 + Vue 重写 UI） |
| wangEditor 含义 | 只借架构，不引入其停更引擎 |
| 技术栈四问 | Vue3+TS ／ 务实完整复刻 ／ 对接 Laravel（仅前端） ／ 仅现代浏览器 |
| 第 1 段 | 批准；parse 展示端纳入；charts 定 ECharts+老数据适配器 |
| 第 2–4 段 | 后端代码不动（仅出契约文档）；配置全前端化（删 config action 拉取）；组件从简 |
| 第 5–8 段 | 按钮扩展列为显式承诺（→第 8 段）；删除远程抓图与涂鸦；新增剪贴板图片粘贴上传（默认走 uploadimage） |
| 更正（M0 执行中） | 后端栈为 **PHP + MySQL**（"对接 Laravel"系 AI 从环境上下文误假设，用户更正）。action 协议、响应字段、安全基线不受影响——协议本就与后端栈无关；措辞已全文订正 |

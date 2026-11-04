# ueditor-dev-1.5.0 改造为 Vue 3 + TypeScript 版本：建议

> 适用前提：Vue 3 + Vite + TypeScript，后端 Laravel。文中涉及 1.5.0 内部实现的细节，请以你们仓库实际代码为准（建议动手前先做一轮代码盘点，见第 2 节）。

---

## 1. 先定目标：「TS 化」到底指哪一层

"改造成 Vue + TS"可能意味着三件完全不同的事，工作量差一个数量级：

| 层级 | 内容 | 工作量 | 收益 |
|---|---|---|---|
| **L1 封装层 TS 化** | UEditor 核心保持原样，作为静态资源；外面包一层 Vue 3 + TS 组件、加载器、类型声明 | 小（1–2 周） | 业务代码类型安全、v-model、生命周期可控 |
| **L2 构建与插件层现代化** | 把 `_src` 的构建从 Grunt 换成 Vite/Rollup，产物仍是全局 `UE`；二次开发的插件/对话框用 TS 写 | 中（3–6 周） | 自定义插件可维护，构建可复现 |
| **L3 核心重写为 TS/ESM** | 把 `_src/core`、`plugins`、`ui` 全部迁成 TS 模块 | 极大（数月，高回归风险） | 理论上最干净，实际收益有限 |

**建议：做 L1，需要时再局部做 L2，不做 L3。**

理由：
- 1.5.0 核心是 ES5 + 原型链 + 全局命名空间（`UE.utils`、`UE.dom.domUtils`、`UE.plugins`、`UE.commands` 等），插件之间通过全局注册相互依赖，没有模块边界。强行 TS 化等于重写，且富文本编辑器的 Range/选区/粘贴清洗是回归重灾区，几乎没有自动化测试可依赖。
- 如果最终目的是"现代技术栈 + 长期可维护"，而不是"必须保留 UEditor"，请同时评估替换方案（TinyMCE、CKEditor 5、Tiptap/ProseMirror、wangEditor 等）。改造 1.5.0 的投入，要和替换成本对比后再下决心。

---

## 2. 动手前：代码盘点（1–2 天，强烈建议）

对仓库做一次清点，输出一张表，后面所有决策都基于它：

- [ ] **与官方 1.5.0 的差异**：你们是否改过 `_src`？用 diff 对比官方同版本，列出所有二开点（自定义插件、对话框、样式、上传逻辑）。
- [ ] **实际启用的功能**：`ueditor.config.js` 里的 `toolbars`、`serverUrl`、各 `*ActionName`；没用到的插件（如 SyntaxHighlighter、截图 snapscreen、百度地图、涂鸦 scrawl、Flash 相关）直接砍掉。
- [ ] **third-party 依赖**：jQuery、WebUploader（含 Flash 回退）、ZeroClipboard（Flash）、SyntaxHighlighter、CodeMirror 等，逐个标注 保留/替换/删除。
- [ ] **兼容性代码**：大量 IE6–9 分支（`browser.ie`、`ie9below` 等），确认业务是否仍需要，不需要就是可删的大块代码。
- [ ] **服务端协议**：`php/` `jsp/` 等目录你们实际用哪个，Laravel 里是否已有适配实现。
- [ ] **线上数据**：历史内容里有哪些 HTML 结构（表格、视频 embed、自定义标签），改造后必须能原样回显。

---

## 3. 推荐架构（L1 + 局部 L2）

```
┌────────────────────────────────────────────────┐
│ 业务页面 (Vue 3 + TS)                            │
│   <UEditor v-model="html" :config="cfg" />      │
├────────────────────────────────────────────────┤
│ packages/ueditor-vue  （你们自己的薄封装）          │
│   ├─ loader.ts        单例脚本加载                │
│   ├─ types/ueditor.d.ts  类型声明                 │
│   ├─ UEditor.vue      组件（v-model/生命周期）     │
│   ├─ useUEditor.ts    命令式 API（insert/select） │
│   ├─ plugins/         自定义插件（TS → 构建为 IIFE）│
│   └─ upload/          上传适配层                   │
├────────────────────────────────────────────────┤
│ public/UEditor/   UEditor 核心（构建产物，不进 TS）  │
│   ueditor.config.js / ueditor.all.min.js /      │
│   lang / themes / dialogs / third-party         │
└────────────────────────────────────────────────┘
```

要点：
- **核心当"黑盒静态资源"**，版本锁死，不参与业务 TS 编译。
- **封装层放独立包**（monorepo 的 `packages/` 或单独 npm 私有包），业务只依赖封装层，将来换编辑器时只改这一层。
- 自定义插件用 TS 写，打包成**单个 IIFE 文件**，在核心加载完后再注入。

### 建议目录

```
src/components/ueditor/
├─ index.ts
├─ UEditor.vue
├─ loader.ts
├─ useUEditor.ts
├─ types.ts
├─ upload.ts
└─ plugins/
   ├─ ai-assist.ts
   └─ index.ts
public/UEditor/            # 核心资源，.gitattributes 标记为 vendored
```

---

## 4. 脚本加载：单例、顺序、可重入

UEditor 不是 ESM，必须按顺序加载，且全局只加载一次。

```ts
// loader.ts
let loading: Promise<void> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = false
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`UEditor 脚本加载失败: ${src}`))
    document.head.appendChild(s)
  })
}

export function loadUEditor(base = '/UEditor/'): Promise<void> {
  if (window.UE?.getEditor) return Promise.resolve()
  if (loading) return loading

  window.UEDITOR_HOME_URL = base // 必须在 config.js 之前设置
  loading = (async () => {
    await loadScript(`${base}ueditor.config.js`)
    await loadScript(`${base}ueditor.all.min.js`)
    await loadScript(`${base}lang/zh-cn/zh-cn.js`)
  })().catch((e) => {
    loading = null // 失败后允许重试
    throw e
  })
  return loading
}
```

注意：
- `UEDITOR_HOME_URL` 在不同部署路径（子目录、CDN）下要可配置，别写死 `/UEditor/`。
- 如果项目有 CSP，核心里的内联脚本/`document.write` 行为可能被拦，需要提前在预发验证。

---

## 5. 类型声明：最值钱的一步

官方没有类型。先写**你们实际用到的 API 子集**，别追求全量。

```ts
// types.ts
export interface UERange {
  getClientRects(): DOMRectList
  // 按需补充
}

export interface UESelection {
  getRange(): UERange
  getText(): string
}

export interface UEditorInstance {
  ready(cb: () => void): void
  addListener(event: string, cb: (...args: any[]) => void): void
  removeListener(event: string, cb: (...args: any[]) => void): void
  getContent(): string
  setContent(html: string, isAppendTo?: boolean): void
  getContentTxt(): string
  getPlainTxt(): string
  insertHtml(html: string, ignoreUndo?: boolean): void
  execCommand(cmd: string, ...args: any[]): any
  queryCommandState(cmd: string): number
  setHeight(h: number): void
  setDisabled(except?: string[] | string): void
  setEnabled(): void
  focus(toEnd?: boolean): void
  hasContents(): boolean
  selection: UESelection
  destroy(): void
  document: Document
  body: HTMLElement
  iframe: HTMLIFrameElement
}

export interface UEStatic {
  getEditor(id: string, opt?: Record<string, any>): UEditorInstance
  delEditor(id: string): void
  registerUI(name: string, fn: (editor: UEditorInstance, uiName: string) => any, ...rest: any[]): void
  utils: Record<string, any>
}

declare global {
  interface Window {
    UE: UEStatic
    UEDITOR_HOME_URL: string
  }
}
```

做法：
1. 先按上面最小集开 `strict`，所有 `any` 都显式标注，后续用到什么补什么。
2. 内部 API（`UE.dom.domUtils`、`UE.plugins` 等）如果自定义插件要用，单独放 `types.internal.ts`，标注"内部接口，升级风险高"。

---

## 6. Vue 组件封装的关键点

### 6.1 必须遵守

| 点 | 做法 | 不这么做会怎样 |
|---|---|---|
| 实例存储 | `shallowRef` 或普通变量，**不要** `ref/reactive` | Proxy 包装后 UEditor 内部判断异常、性能差 |
| 实例 id | 每个组件实例生成唯一 id | 同页多实例互相覆盖 |
| 销毁 | `onBeforeUnmount` 里 `UE.delEditor(id)`（必要时先 `destroy()`） | UE 内部按 id 缓存实例，重建时报错/拿到僵尸实例 |
| v-model 防回环 | 记录 `lastEmitted`，watch 里相同则不 `setContent` | 光标跳到开头、输入卡顿 |
| 回写节流 | `contentChange` 防抖 200ms 左右 | 大文档每次按键都 `getContent()`，卡 |
| ready 之后再 set | 异步数据在 `ready` 前到达要缓存，ready 后补 `setContent` | 内容丢失或空白 |
| 隐藏容器 | 在 `v-show`/未激活 Tab 内不要初始化，可见后再创建 | 工具栏/iframe 尺寸错乱 |
| keep-alive | 用 `v-if`/`key` 彻底重建，或在 `deactivated/activated` 里显式销毁/重建 | iframe 被移动会重载，内容和撤销历史丢失 |

### 6.2 组件骨架（TS）

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, shallowRef, watch } from 'vue'
import { loadUEditor } from './loader'
import type { UEditorInstance } from './types'

const props = withDefaults(defineProps<{
  modelValue?: string
  config?: Record<string, any>
  disabled?: boolean
}>(), { modelValue: '' })

const emit = defineEmits<{
  'update:modelValue': [value: string]
  ready: [editor: UEditorInstance]
}>()

const id = `ue_${crypto.randomUUID().replace(/-/g, '')}`
const editor = shallowRef<UEditorInstance | null>(null)
let isReady = false
let lastEmitted = ''
let pending: string | null = null
let timer: number | undefined
let disposed = false

onMounted(async () => {
  await loadUEditor()
  if (disposed) return // 加载期间组件已卸载
  const ue = window.UE.getEditor(id, { ...props.config })
  editor.value = ue
  ue.ready(() => {
    if (disposed) return
    isReady = true
    const init = pending ?? props.modelValue ?? ''
    ue.setContent(init)
    lastEmitted = init
    pending = null
    ue.addListener('contentChange', onChange)
    if (props.disabled) ue.setDisabled()
    emit('ready', ue)
  })
})

function onChange() {
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    if (!editor.value) return
    const html = editor.value.getContent()
    lastEmitted = html
    emit('update:modelValue', html)
  }, 200)
}

watch(() => props.modelValue, (v) => {
  const val = v ?? ''
  if (!isReady) { pending = val; return }
  if (val === lastEmitted) return
  editor.value?.setContent(val)
  lastEmitted = val
})

watch(() => props.disabled, (d) => {
  if (!isReady) return
  d ? editor.value?.setDisabled() : editor.value?.setEnabled()
})

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
  try { window.UE?.delEditor(id) } catch { /* 实例可能已销毁 */ }
  editor.value = null
})

defineExpose({ getEditor: () => editor.value })
</script>

<template><div :id="id" /></template>
```

### 6.3 命令式 API（可选）

把"插入内容、取选区、聚焦"等常用操作封装成 composable，避免业务代码直接碰 `ue.xxx`：

```ts
export function useUEditor(getEditor: () => UEditorInstance | null) {
  return {
    insertHtml: (html: string) => getEditor()?.insertHtml(html),
    getSelectedText: () => getEditor()?.selection.getText() ?? '',
    focus: (toEnd = false) => getEditor()?.focus(toEnd),
  }
}
```

---

## 7. 自定义插件与对话框

1.5.0 的扩展点：`UE.plugins[name]`、`UE.commands[name]`、`UE.registerUI`、`dialogs/` 目录下的独立 HTML 页面（在弹窗 iframe 里运行）。

建议：
- **新增功能优先走 `registerUI` + Vue 弹层**：UI 放主文档由 Vue 渲染，通过封装层 API 与编辑器交互，不再写 `dialogs/*.html`。
- **旧对话框**：先保持原样能用；确需改造，逐个迁移，一次一个。对话框跑在独立 iframe 里，与 Vue 组件的通信用 `postMessage` 或 `parent.xxx`，别指望共享 Vue 状态。
- **自定义插件的 TS 化**：用 Vite 的 library 模式输出 IIFE，在 `loadUEditor` 之后再 `import('./plugins')` 注册。

```ts
// vite.config.ts（插件包）
export default defineConfig({
  build: {
    lib: { entry: 'src/plugins/index.ts', name: 'UEPlugins', formats: ['iife'], fileName: () => 'ue-plugins.js' },
  },
})
```

---

## 8. 上传与服务端（Laravel）

UEditor 前端靠 `serverUrl` 访问后端，先 `?action=config` 取配置，再按 action 上传。

### 8.1 协议要点

- `GET ?action=config`：返回 JSON 配置（各类上传的字段名、大小限制、允许的后缀、路径格式）。
- `POST ?action=uploadimage|uploadfile|uploadvideo|uploadscrawl|catchimage`：返回 `{ state: "SUCCESS", url, title, original, type, size }`；失败时 `state` 为错误信息。
- `GET ?action=listimage|listfile`：在线管理，按需实现，不用的直接去掉。

### 8.2 改造建议

- **鉴权**：UEditor 原生上传不方便带自定义请求头。方案按优先级：同域 cookie/Sanctum → `serverUrl` 里带短期 token（query）→ 重写上传逻辑走你们自己的接口（推荐，见下）。
- **重写上传层**：用 `UE.Editor.prototype.getActionUrl` 或在封装层拦截，把图片/视频上传改成调用你们现有上传服务（含对象存储直传、进度、取消）。
- **catchimage（抓取远程图片）**：这是典型 SSRF 点，务必在服务端限制协议、域名白名单、内网 IP 段、响应大小与超时；没有必要就关闭。
- **文件安全**：服务端以**白名单**校验后缀 + MIME + 文件头；文件名由服务端生成；上传目录禁止执行脚本。
- **不要直接沿用 1.5.0 自带的 php/jsp/asp/net 示例后端**，历史上这类示例代码有过多起安全问题，应当用 Laravel 重新实现协议，再对照校验。

---

## 9. 安全（务必当作独立工作项）

1.5.0 发布于 2016 年前后，原版已停止维护，以下均需要主动处理：

1. **输入侧**：UEditor 内置过滤规则（`filterRules`、`whitList`）不能当安全边界。
2. **服务端存储前净化**：Laravel 用 HTMLPurifier 或同类库，白名单标签/属性/协议（禁止 `javascript:`、事件属性、`<script>`、危险的 `<iframe>`/`<embed>`，视频嵌入走受控白名单域名）。
3. **渲染侧**：前台展示再净化一次，或确保展示端使用统一的净化组件；`v-html` 之前必须净化。
4. **`ueditor.parse.js`（uParse）**：旧的前台渲染脚本，建议直接弃用，改为"净化后的 HTML + 自己的内容样式"。
5. **依赖漏洞**：对 `third-party` 下的 jQuery 等旧库做版本核查，能删则删。
6. 渲染内容放进**独立样式作用域**（如 `.rich-content`），避免与站点样式互相污染。

---

## 10. 现代浏览器兼容性专项检查

对 2016 年的代码，上线前要在最新 Chrome / Safari / Firefox 实测，重点排查：

- **Mutation Events**（`DOMNodeInserted` / `DOMNodeRemoved` 等）：Chrome 已移除，若核心或插件仍使用，需改为 `MutationObserver`。请全局搜索核实。
- **`document.write` / `document.open` 初始化 iframe**：多数情况仍可用，但在严格 CSP 或部分嵌入场景下可能受限，需实测。
- **Flash 相关**：ZeroClipboard、WebUploader 的 Flash 回退、旧的截图/上传组件，全部移除，用 `navigator.clipboard` 和 HTML5 上传替代。
- **同步 XHR / `unload` 事件**：浏览器逐步限制，改为异步与 `pagehide`。
- **粘贴**：Word/WPS/网页粘贴清洗行为在新版浏览器与新版 Office 输出下可能退化，必须建立粘贴样本集做回归。
- **移动端**：1.5.0 的触摸、选区、软键盘处理较弱，若有移动端场景，单独评估。
- **高分屏 / 暗色模式**：工具栏图标是雪碧图，暗色下需要另配主题；编辑区样式通过 `iframeCssUrl` / `initialStyle` 注入，主题切换要手动同步 iframe 内 document。

---

## 11. AI / 浮层联动（如有）

- 选区取值用 `ue.selection.getRange()` / `getText()`，不要用宿主的 `window.getSelection()`（焦点在 iframe 内时指向 iframe 元素）。
- 浮层放主文档，定位用 `range.getClientRects()` 加上 iframe 自身的 `getBoundingClientRect()` 偏移，并监听 iframe 内外滚动。
- 流式输出：按 50–100ms 或按句合并后再 `insertHtml`，避免逐 token 插入导致选区撕裂、撤销栈爆炸；整段 AI 输出应合并为一次撤销步骤。
- 全局快捷键（`useMagicKeys` 等）在焦点进入 iframe 后收不到，需通过 `ue.addListener('keydown', …)` 或在 `ue.document` 上再绑一份。

---

## 12. 构建与工程化

- **核心构建**：如果不改核心源码，直接使用官方/你们现有的 `ueditor.all.min.js` 产物，并锁版本、放制品库。要改核心，保留 Grunt 构建，先在 CI 中跑通可复现构建，再考虑迁 Vite。
- **资源托管**：核心资源走静态目录/CDN，文件名带版本号或哈希，避免缓存导致 `config.js` 与 `all.js` 版本错配。
- **TS 配置**：封装层开启 `strict`、`noUncheckedIndexedAccess`；核心目录用 `.eslintignore` / `tsconfig exclude` 排除。
- **Vendored 标记**：在 `.gitattributes` 中把核心目录标为 `linguist-vendored`，Code Review 时不被噪音淹没。
- **Monorepo 建议**：`packages/ueditor-vue`（封装）+ `apps/*`（业务），封装层写 README 和使用示例，版本独立发布。

---

## 13. 测试策略

富文本最怕"改了某处，别处悄悄坏了"。

| 类型 | 内容 |
|---|---|
| 组件单测（Vitest） | v-model 回环、异步回填、销毁、多实例、disabled 切换（编辑器本体可 mock） |
| E2E（Playwright） | 真实浏览器：输入、格式化、粘贴、上传、撤销重做、路由切换 20 次内存与报错 |
| 粘贴样本集 | Word、WPS、网页、微信公众号、Markdown 渲染结果，各 5–10 份，保存清洗后 HTML 快照 |
| 历史内容回显 | 从线上抽样 200+ 条历史内容，批量 `setContent → getContent`，比较结构差异 |
| 安全回归 | XSS payload 集（含 SVG、`onerror`、`javascript:`、CSS 表达式、编码绕过）打到存储与渲染两端 |

---

## 14. 分阶段计划（参考）

| 阶段 | 内容 | 产出 |
|---|---|---|
| **P0 盘点（2–3 天）** | 第 2 节清单、与官方版本 diff、功能裁剪决定 | 盘点表、保留/删除清单 |
| **P1 封装（1–2 周）** | loader、类型、`UEditor.vue`、`useUEditor`、上传适配 | 可用的 Vue 3 + TS 组件，替换一个低风险页面试点 |
| **P2 服务端与安全（1–2 周，可与 P1 并行）** | Laravel 实现协议、净化、catchimage 限制 | 安全验收报告 |
| **P3 插件迁移（按需）** | 自定义插件 TS 化、对话框 Vue 化 | 插件包、对话框迁移清单 |
| **P4 兼容与回归（1–2 周）** | 现代浏览器专项、粘贴样本、历史内容回显 | 回归报告 |
| **P5 灰度** | 按页面/租户灰度，保留回滚开关 | 全量切换 |

---

## 15. 验收清单

- [ ] 同页多个编辑器实例互不干扰
- [ ] 路由来回切换 20 次，无内存持续增长、无控制台报错
- [ ] 异步回填（先空后有）正确显示，光标不跳
- [ ] 弹窗 / Tab / 折叠面板内初始化正常
- [ ] `v-model` 无回环，大文档输入不卡
- [ ] 粘贴 Word / WPS / 网页清洗效果达标
- [ ] 上传：图片、视频、附件、失败重试、鉴权都正常
- [ ] catchimage 已限制或关闭
- [ ] 存储前与渲染前均已净化，XSS 回归通过
- [ ] 最新 Chrome / Safari / Firefox 实测通过，无已移除 API 依赖
- [ ] 暗色模式下编辑区与工具栏一致
- [ ] 核心版本、依赖版本已锁定，构建可复现

---

## 16. 风险与取舍提示

1. **核心无人维护**：任何核心 bug 都得自己修。要评估团队是否愿意长期承担这个成本；若不愿意，应把"封装层隔离"做彻底，为将来替换编辑器留好出口。
2. **iframe 的先天限制**：与宿主的焦点、快捷键、选区、浮层联动会一直比 contenteditable 派麻烦。如果产品路线里 AI 浮层、划词交互是重点，请把这点写进选型风险。
3. **别在 L3 上冒进**：全量 TS 重写核心看起来整洁，但没有测试保护时，粘贴、表格、撤销、选区这些模块极易产生隐蔽回归。
4. **历史数据兼容优先**：任何清洗/净化规则的变更，都先用历史内容回显测试验证，再上线。

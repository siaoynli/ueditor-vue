# ueditor-vue

将百度 [UEditor](https://github.com/fex-team/ueditor) dev-1.5.0 改造为 **Vue 3 + TypeScript 富文本编辑器组件**，务实完整复刻原版功能。

> ⚠️ 当前状态：**设计阶段**。架构路线已裁决（见下），详细设计规格分段评审中，尚未开始编码实现。

## 为什么做这个项目

UEditor 是十年间中文互联网使用最广的富文本编辑器之一，官方已停止维护，且：

- 依赖全局 `window.UEDITOR_CONFIG` + 脚本动态加载，无法进入 Vite/SPA 工程体系；
- 自带的 PHP/Java 后端仅为 DEMO，官方 README 明示存在 SSRF 与文件包含漏洞，禁止生产使用；
- UI 层是命令式老代码，与 Vue 组件生命周期/响应式体系脱节。

但它的**编辑引擎**（选区算法、Word 粘贴清洗 `filterword`、格式匹配、自动排版、结构过滤器）是大量重写型编辑器至今难以完全复刻的资产。本项目的答案：**引擎保真迁移 + UI 层 Vue 重写**。

## 技术路线（已裁决）

| 决策项 | 结论 |
|---|---|
| 改造路线 | **路线 B**：复用 `_src/core` + `_src/plugins`（零 jQuery 依赖），迁移为 ESM/TS；废弃 `_src/ui` 与 22 个 iframe 弹窗，用 Vue 3 SFC 重写 |
| API 风格 | 借鉴 wangEditor 5 的**架构模式**（不引入其已停更的引擎）：monorepo 分层、`MENU_CONF` 每菜单独立配置、`register*` 扩展 API、`toolbarKeys` 裁剪、`mode: default/simple` |
| 功能范围 | 务实完整复刻：保留所有今日仍可用的能力；依赖已停服第三方服务的老功能（高德/百度地图、音乐插入、webapp、截屏）提供扩展点而非死代码 |
| 技术栈 | Vue 3 + TypeScript + Vite + pnpm monorepo |
| 服务端 | 对接 Laravel（按协议契约自研，不使用原版 demo 后端） |
| 浏览器 | 仅现代浏览器（Chrome/Edge/Firefox/Safari），放弃 IE |

## 规划架构

```
packages/
  core/       UEditor 引擎迁移层（Editor/Range/Selection/htmlparser/filterword/…）
  commands/   60+ 命令插件迁移 + registerCommand 注册机制
  config/     配置 schema（兼容 UEDITOR_CONFIG 键名）+ i18n
  ui/         Vue 控件原语：Toolbar/ColorPicker/TablePicker/DialogShell/… + CSS 变量主题
  dialogs/    弹窗的 Vue SFC 实现（图片/视频/附件管理器、搜索替换、表情等约 15 个；涂鸦/抓图已裁撤）
  vue/        发布物：<UEditor v-model> + useEditor() + register* 扩展 API
playground/   Demo 站点 + 新旧编辑器并排的"金标准对照"验收页
ueditor-dev-1.5.0/  原版源码留档（只读参考与行为基准）
```

依赖方向单向：`vue → dialogs/ui → commands → core → config`，任何一层可独立替换。

编辑区仍为 iframe contenteditable（引擎保真的代价，同时是 XSS 的天然隔离层）；工具栏、弹窗、状态栏均为 Vue 组件，按钮态由 `selectionchange → queryCommandState/Value` 契约驱动（与原版一致，但响应式化）。

## 目标用法（设计预览，未实现）

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { UEditor } from '@ueditor-vue/';

const html = ref('<p>hello</p>');
</script>

<template>
  <UEditor
    v-model="html"
    mode="default"
    :config="{ initialFrameHeight: 400, wordCount: true }"
    :editor-config="{
      placeholder: '请输入内容…',
      MENU_CONF: {
        uploadImage: { server: '/api/ueditor/upload?action=uploadimage', maxSize: 5 * 1024 * 1024 },
        uploadVideo: { server: '/api/ueditor/upload?action=uploadvideo' },
        fileManager: { server: '/api/ueditor/upload?action=listimage' },
      },
      pasteImageUpload: true,   // 剪贴板图片粘贴自动上传（新增能力，默认开）
      beforeRequest: (req) => { req.headers.set('X-CSRF-Token', csrf()); return req; },
    }"
    @on-error="toast"
  />
</template>
```

## 服务端契约（Laravel 对接）

沿用并现代化 UEditor 的 action 分发协议（配置拉取 `config`、远程抓图 `catchimage`、涂鸦 `uploadscrawl` 已随功能裁撤；传输层从 jsonp/表单-iframe POST 升级为 fetch/XHR + CORS，字段不变）：

| action | 方法 | 说明 |
|---|---|---|
| `uploadimage` / `uploadvideo` / `uploadfile` | POST multipart | 文件字段名可配（`imageFieldName` 等）；响应 `{ state:'SUCCESS'|错误串, url, title, original }`；剪贴板图片粘贴也走 `uploadimage` |
| `listimage` / `listfile` | GET | 文件管理器分页，`{ state, list, start, total }` |
| `removeimage` / `removefile` | POST | 可选实现；必须鉴权 + 路径围栏（仅允许删自家上传目录） |

安全基线：文件扩展名/MIME 双白名单、大小与频率限制、图片二次编码剥离 EXIF、随机文件名、响应 `state` 错误串不回显路径——由 Laravel 端负责（本项目仅交付契约文档，不写后端代码）。

## 安全与现代化要点

- 原版净化链（`htmlparser → dtd 结构校验 → filterWord/filterNode/inputRules`，粘贴顺序契约）**保序复刻**；
- 在 setContent/粘贴/getContent 三个咽喉点**新增** DOMPurify 净化层（可开关，默认开启）；
- 移除 Flash 时代产物（WebUploader swf、wordimage swf 剪贴板、zeroclipboard、snapscreen 客户端）与商业授权风险的旧版 highcharts；
- 草稿存储保持原版 localStorage key 结构（`ueditor_preference`），可读取老版本草稿。

## 功能复刻范围（摘要）

**原生迁移**：全部命令/选区/撤销栈、Word 粘贴清洗、格式刷、自动排版、表格全套操作、源码模式（CodeMirror 6 懒加载）、搜索替换、字数统计、草稿（autosave）、元素路径、右键菜单、快捷键、图片/视频/附件上传与文件管理器（Vue 重写 UI）、**剪贴板图片粘贴上传（新增）**、表情、特殊字符、模板、背景、分页符、日期/时间、水平线、锚点、图表（ECharts + 老 highcharts 数据适配）。

**已裁撤（用户裁决，不留实现）**：远程图片抓取（catchremoteimage/wordimage，粘贴外链图原样保留不外转）、涂鸦（scrawl）。

**扩展点保留（不再直连停服第三方）**：地图（gmap/百度地图）、音乐插入、webapp、截屏——接口与注册机制在，实现由业务方注入。

## 目录内容说明

- `ueditor-dev-1.5.0/`：UEditor 原版源码（MIT）留档，行为基准与迁移素材，**只读**。
- `CLAUDE.md`：AI 协作项目约定（含完整源码调研结论与迁移契约基准）。
- `docs/superpowers/specs/2026-11-03-ueditor-vue-design.md`：设计规格说明书（八段设计 + 裁决轨迹，实现唯一依据）。

## 参考

- [fex-team/ueditor（官方，已停更）](https://github.com/fex-team/ueditor)
- [wangEditor-v5 归档说明](https://github.com/wangeditor-team/wangEditor-v5)（本项目仅借鉴其 API 架构模式，不使用其引擎）
- UEditor 原版 `README.md` 安全通告：自带后端代码仅为 DEMO，勿直接生产使用

## License

MIT（同 UEditor 上游）。

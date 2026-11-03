# ueditor-vue 总体实现计划（Master Plan）

> **For agentic workers:** 每个里程碑开工前必须先产出该里程碑的任务级详细计划（TDD 步骤粒度）并经用户批准；本文件只到步骤级，不含任务内代码细节。REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 superpowers:executing-plans。

**Goal:** 按设计规格交付 `@ueditor-vue` 组件库：UEditor 1.5.0 引擎保真迁移 + Vue 3 UI/弹窗重写 + parse 展示端 + 按钮级扩展体系。

**Architecture:** 路线 B+——`_src/core`/`_src/plugins` ESM 化进 `packages/core|commands`，废弃原 UI 层由 Vue SFC 重写（`packages/ui|dialogs`），`packages/vue` 出 `<UEditor v-model>` 薄壳；行为保真以"金标准对照 harness"（原版留档目录作基准端，HTML diff 归一化=空）验收。

**Tech Stack:** Vue 3 + TypeScript + Vite + pnpm monorepo + Vitest + Playwright + MSW；仅现代浏览器。

**Spec:** `docs/superpowers/specs/2026-11-03-ueditor-vue-design.md`（v0.0.1）

## Global Constraints

- 直接依赖 ≤4（DOMPurify 常驻；ECharts/CodeMirror6/highlight.js 为懒加载 optional/peer）
- `ueditor-dev-1.5.0/` 只读且已被 .gitignore（本地留档基准）；每迁移文件头注释标注源文件路径
- 命令名 toLowerCase、`queryCommandState` 三值语义（-1/0/1）、粘贴链顺序（filterWord→filterNode→inputRules→beforepaste）不得偏离
- 库内零 `v-html`/`innerHTML` 直插用户数据；注释中文（项目规则）；不写后端代码，PHP+MySQL 后端契约只出文档（2026-11-03 更正，原误记 Laravel）
- 配置全前端化：无 `config` action 拉取；已裁撤功能（catchimage/scrawl/wordimage/snapscreen 内置实现）不出现在任何 API 面
- 每个里程碑分支 `feat/m<N>-<名>`，PR 合入；里程碑级验收（金标准矩阵）绿才能进下一段

## 步骤（🔴 大型，15 步封顶）

```
步骤 1 — M0 脚手架：pnpm workspace + 6 packages 骨架 + Vite/Vitest/Playwright/ESLint 配置
  文件：pnpm-workspace.yaml、根与 packages/*/package.json、tsconfig.base.json
  验证：pnpm -r test/lint/build 空跑通过；CI 脚本就绪

步骤 2 — M0 金标准对照 harness：playground 双栏（左：原版 ueditor-dev-1.5.0 静态挂载；右：新实例）
  文件：playground/（对照页、diff 归一化工具、命令注入执行器）
  验证：同内容同命令序列（bold 试点）双栏 getContent diff=空

步骤 3 — M0 语料库：30 份 Word/WPS/网页粘贴样本 + 剪贴板图片样本 + 期望输出快照
  文件：tests/fixtures/（语料、manifest、快照基线）
  验证：harness 批量跑原版端生成基线快照入库

步骤 4 — M1a core 批次 1–2：browser/utils/EventBase/domUtils/node/dtd ESM 化 + 包 d.ts 骨架
  文件：packages/core/src/*、packages/core/types/*.d.ts
  验证：domUtils/dtd/node Vitest 单测绿；零 window 引用（grep 门禁）

步骤 5 — M1b core 批次 3–4：htmlparser/filternode/filterword + Range/Selection
  文件：packages/core/src/{htmlparser,filternode,filterword,Range,Selection}.ts(js)
  验证：htmlparser 往返保真单测；filterWord 语料快照绿；Range/Selection 跨浏览器 e2e 试点

步骤 6 — M1c core 批次 5：Editor/plugin/keymap/ajax + config 包（schema/默认值/i18n JSON 化）
  文件：packages/core/src/{Editor,plugin,keymap,ajax}.js、packages/config/*
  验证：3 处 window 耦合拆除用例绿；destroy×50 堆快照无增长；schema 校验单测

步骤 7 — M2 commands 全量迁移（60 插件，按 §3.1 P0 清单；删改见规格 §2.4）
  文件：packages/commands/*（含 registerCommand、命令矩阵测试集）
  验证：金标准命令矩阵 100% diff=空（P0 范围）；toLowerCase/三值契约回归绿

步骤 8 — M3a ui 包：工具栏控件原语（Button/Combox/ColorPicker/TablePicker/MenuButton/DialogShell）+ 事件-渲染桥
  文件：packages/ui/{components,composables/*stateBridge*}、主题 CSS 变量
  验证：控件测试库单测绿；selectionchange→rAF 节流状态刷新用例（无 N 倍监听）

步骤 9 — M3b vue 包薄壳：<UEditor v-model> + 基础工具栏 + iframe 焦点/弹层抢占 spike + SSR 占位
  文件：packages/vue/{UEditor.vue,useEditor.ts}、playground/demo
  验证：demo 编辑/撤销/状态刷新正常；FF 滚动补丁与焦点用例绿；SSR 渲染冒烟

步骤 10 — M4a 服务层：RequestAdapter + XHR 上传队列（progress/并发/预校验/beforeRequest）
  文件：packages/core/src/request/、packages/ui 上传队列面板
  验证：MSW 全 action e2e 绿（upload×3/list×2/remove 可选）；错误映射 UEditorError 用例

步骤 11 — M4b dialogs 第一批：image/video/attachment/fileManager/simpleupload/autoupload + 剪贴板图片粘贴上传
  文件：packages/dialogs/{Image,Video,Attachment,FileManager}*.vue、paste 拦截模块
  验证：四浏览器粘贴图上传占位→替换/失败移除 e2e；before-upload 拦截用例绿

步骤 12 — M5a dialogs 第二批：background/template/emotion/spechars/searchreplace UI/help/preview + 草稿与元素路径状态栏
  文件：packages/dialogs/*（emotion 含 MultiMenuPop 弹层形态）、statusbar
  验证：功能清单逐项勾验；草稿 localStorage 兼容读写用例（读老 key）绿

步骤 13 — M5b charts + 扩展体系：ECharts 懒加载 + highcharts 数据适配器 + register* 七件套 API
  文件：packages/dialogs/Charts.vue、packages/vue/extend/*（ToolbarButtonDef）
  验证：规格 §8.5 三个扩展验收用例绿（含第三方老插件平移 ≤1 天试验）

步骤 14 — M5c parse 包：v-ueditor-parse 指令 + parse() API + 老内容渲染兼容 + 渲染前强制 sanitize
  文件：packages/parse/*
  验证：老 chart/code/map 占位/video/contenteditable=false 渲染快照对比绿；XSS payload 语料拦截

步骤 15 — M6 收尾：sanitize 三档强化 + perf 预算实测定数入库 + 双语文档站 + v1.0.0
  文件：docs 站、perf 回归基线、CHANGELOG
  验证：全测试绿 + 初始 gz 预算达标 + 文档站构建 + 版本标签经确认推送
```

## Review Focus（规格隐含、任务测试未必覆盖、最易出事的输入类）

1. **Word 粘贴边缘件**：WPS 导出 docx 与 Office 内网域（mso-* 条件注释、VML 图形）——filterWord 语料外样本不得产生结构破坏；期望：退化保留纯文本而非碎 DOM（步骤 5/7 语料扩集）。
2. **iframe 与 Vue 弹层焦点抢占**：DialogShell 开合后编辑区光标位置、FF 滚动补偿（步骤 9 spike 用例固化）。
3. **剪贴板非图片混排**：文本+图同时粘贴时只截文件项、文本照常走粘贴链（步骤 11 e2e）。
4. **sanitize 'relaxed' 与原版行为冲突**：原版允许但 DOMPurify 默认剔除的标签（如 `<div style>` 裸排版）不得被误杀——diff 对照含 sanitize 开关矩阵（步骤 14/15）。
5. **老草稿/老内容 key 兼容**：`ueditor_preference` 读写不得破坏其他站 key；草稿恢复后 selection/undo 状态正确（步骤 12）。

## Self-Review 结论

- 规格覆盖：§1→步骤 1/8/9/13；§2→4–7；§3→7/11/12/13/14；§4→10；§5→6/14/15；§6→8/9/15；§7→2/3/7 贯穿；§8→13。无漏项。
- 占位符扫描：通过（M 级步骤的文件行为目录级锚点，任务级细节由各里程碑详细计划承担，已在头部声明机制）。
- 类型一致性：步骤间接口名以规格 §1.3/§4.1/§8.2 为准，详细计划生成时逐字对照。

## 版本与分支

- M0–M6 各自 feature 分支 + PR；alpha 标签 `v0.1.0`(M1)…`v0.6.0`(M6 前)，GA `v1.0.0`（步骤 15，经确认后打并推送）。

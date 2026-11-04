// 源: ueditor-dev-1.5.0/_src/editor.js:1-15
/**
 * UE 命名空间形状声明（批0骨架），经 package.json "types" 字段供包外 TS 侧消费。
 * 形状与 src/namespace.js 实际导出保持一致，由 namespace.spec.ts 的一致性赋值断言门禁；
 * 后续批次通过模块增强（declare module '@ueditor-vue/core'）向 dom 等注册表接口追加成员。
 */

/** 插件注册字典（UE.plugins），值形状由后续批次逐个增强 */
export interface UEPluginRegistry {
  [name: string]: unknown;
}

/** 命令注册字典（UE.commands），命令名小写，值形状由后续批次逐个增强 */
export interface UECommandRegistry {
  [name: string]: unknown;
}

/** 编辑器实例字典（UE.instants），实例 id → Editor 实例；去全局化改造见 M1 步骤6 */
export interface UEInstants {
  [id: string]: unknown;
}

/** 语言包字典（UE.I18N[lang]），词条表形状由 config 批次增强 */
export interface UEI18N {
  [lang: string]: unknown;
}

/** dom 短名别名容器（UE.dom.domUtils/Range/Selection/dtd 后续批次挂载点） */
export interface UEDom {
  [name: string]: unknown;
}

/** UE 命名空间对象形状，键集与 src/namespace.js 导出一致，不得发明成员 */
export interface UENamespace {
  version: string;
  plugins: UEPluginRegistry;
  commands: UECommandRegistry;
  instants: UEInstants;
  I18N: UEI18N;
  dom: UEDom;
}

export declare const UE: UENamespace;

export default UE;

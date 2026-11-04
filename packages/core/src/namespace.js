// 源: ueditor-dev-1.5.0/_src/editor.js:1-15
// 批0：原版靠 window.baidu / window.UE 全局通信的命名空间降级为包内单例模块。
// 后续批次迁移文件把 `baidu.editor.xxx = ...` 之类挂载改写为对本对象的属性赋值（模块级副作用），
// ESM 单例天然保证唯一实例。
// 不迁移项：window.UEDITOR_CONFIG（由构造参数注入替代）、_customizeUI（随 UI 层废弃）。

export const UE = {
  version: '1.5.0-vue',
  plugins: {},
  commands: {},
  instants: {},
  I18N: {},
  dom: {},
};

export default UE;

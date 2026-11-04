// NOTE: M0 阶段右栏同为 baseline 引擎（harness 自检）；M2 将右栏替换为 Vue 组件实例，
// 届时本执行器只换实例来源，runSequence/normalizeHtml 链路不变。
import {
  runSequence,
  type CmdStep,
  type EditorLike,
} from '../../packages/test-utils/src/runSequence';

/** 最小 UE 全局接口面（baseline bundle 挂载于 window.UE） */
interface UEStatic {
  getEditor(containerId: string, options?: Record<string, unknown>): EditorLike;
}

declare global {
  interface Window {
    UE: UEStatic;
    /** 双栏编辑器均 ready 后置 true，e2e 以此为门 */
    __ready: boolean;
    /** e2e 入口：注入初始 HTML 并在指定栏执行命令序列，返回 getContent() 原文 */
    __runOn: (which: 'a' | 'b', html: string, steps: CmdStep[]) => Promise<string>;
  }
}

function waitReady(editor: EditorLike): Promise<void> {
  return new Promise((resolve) => editor.ready(() => resolve()));
}

// baseline bundle（/@baseline/ueditor.all.js）404 时 window.UE 缺失：若不先拦，
// 顶层 getEditor 直接抛不可读的 TypeError，__runOn 注册不上，e2e 只能等 30s 超时且无成因
if (!window.UE) {
  console.error('[harness] window.UE 缺失：baseline bundle 可能 404');
  window.__ready = false;
  // 注册可读错误入口：page.evaluate 能把该 Error 原样抛回测试输出
  window.__runOn = async () => {
    throw new Error('baseline 未加载：window.UE 缺失');
  };
} else {
  const editors: Record<'a' | 'b', EditorLike> = {
    a: window.UE.getEditor('ed-a', { initialFrameHeight: 280, initialFrameWidth: '100%' }),
    b: window.UE.getEditor('ed-b', { initialFrameHeight: 280, initialFrameWidth: '100%' }),
  };

  window.__ready = false;
  window.__runOn = async (which, html, steps) => {
    const editor = editors[which];
    editor.setContent(html);
    return runSequence(editor, steps);
  };

  void Promise.all([waitReady(editors.a), waitReady(editors.b)]).then(() => {
    window.__ready = true;
  });
}

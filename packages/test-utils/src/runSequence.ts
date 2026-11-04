/**
 * 命令序列执行器：baseline 与 Vue 版共用同一执行逻辑，金标准对照的"同一输入跑同一序列"由此保证
 */

/** 单条命令步骤，args 为 execCommand 的可变参数 */
export type CmdStep = { cmd: string; args?: unknown[] };

/** runSequence 所需的最小编辑器接口面（UE.Editor 与未来 Vue 封装实例均满足） */
export interface EditorLike {
  ready(fn: () => void): void;
  setContent(html: string): void;
  execCommand(cmd: string, ...args: unknown[]): void;
  getContent(): string;
}

/**
 * 等待编辑器 ready 后按序执行命令，返回最后一步的 getContent() 原文（归一化由调用方做）
 *
 * @param editor - 编辑器实例（接口见 EditorLike）
 * @param steps - 命令序列，顺序执行，不做间隔等待（UE 命令为同步执行）
 * @returns 执行完毕后的 getContent() HTML
 */
export function runSequence(editor: EditorLike, steps: CmdStep[]): Promise<string> {
  return new Promise((resolve) => {
    editor.ready(() => {
      for (const step of steps) {
        editor.execCommand(step.cmd, ...(step.args ?? []));
      }
      resolve(editor.getContent());
    });
  });
}

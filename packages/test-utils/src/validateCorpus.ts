import type { CmdStep } from './runSequence';

/** manifest 条目 schema，字段名与简报绑定（id/desc/channel/file/steps） */
export interface CorpusEntry {
  id: string;
  desc: string;
  channel: 'setContent';
  file: string;
  steps: CmdStep[];
}

/**
 * 语料 manifest 采集期静态校验（fail-fast 防语料静默混入）
 *
 * 结构非法（cmd 拼写成非字符串、steps/args 形态错误）在运行期表现为"命令没跑过"：
 * 基线快照如实记录该结果，M2 Vue 侧同样 no-op，输出一致 → 假绿。必须采集期拦截。
 *
 * @param manifest - JSON.parse 后的原始数据（不可信，类型未知）
 * @returns 校验通过的条目数组（类型断言仅在全部结构检查通过后发生）
 * @throws Error 任一规则不满足时抛出，消息含条目 id（id 本身非法时退化为下标）
 */
export function validateCorpus(manifest: unknown): CorpusEntry[] {
  if (!Array.isArray(manifest)) {
    throw new Error('manifest 根节点不是数组');
  }
  const seen = new Set<string>();
  for (const [index, raw] of manifest.entries()) {
    const entry = (raw ?? {}) as Partial<CorpusEntry> & Record<string, unknown>;
    // id 自身非法时无条目 id 可引用，退化为下标定位
    const ref = typeof entry.id === 'string' && entry.id !== '' ? entry.id : `#${index}`;
    if (typeof entry.id !== 'string' || entry.id === '') {
      throw new Error(`条目 ${ref} id 非法（须为非空字符串）`);
    }
    if (seen.has(entry.id)) {
      throw new Error(`manifest id 重复：${entry.id}`);
    }
    seen.add(entry.id);
    if (entry.channel !== 'setContent') {
      throw new Error(`条目 ${ref} channel 非法：${String(entry.channel)}（M0 仅支持 setContent）`);
    }
    if (typeof entry.file !== 'string' || entry.file === '') {
      throw new Error(`条目 ${ref} file 非法（须为非空字符串）`);
    }
    if (!Array.isArray(entry.steps)) {
      throw new Error(`条目 ${ref} steps 必须是数组`);
    }
    entry.steps.forEach((rawStep: unknown, stepIndex: number) => {
      const step = (rawStep ?? {}) as Record<string, unknown>;
      if (typeof step.cmd !== 'string' || step.cmd === '') {
        throw new Error(`条目 ${ref} 第 ${stepIndex} 步 cmd 非法（须为非空字符串）`);
      }
      if (step.args !== undefined && !Array.isArray(step.args)) {
        throw new Error(`条目 ${ref} 第 ${stepIndex} 步 args 必须是数组或省略`);
      }
    });
  }
  return manifest as CorpusEntry[];
}

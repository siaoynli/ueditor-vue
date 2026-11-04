import { describe, expect, it } from 'vitest';
import { validateCorpus } from './validateCorpus';

// 合法样本：各非法用例在此基础上做单点变异
const okEntry = {
  id: 'sample',
  desc: '样本',
  channel: 'setContent',
  file: 'sample/paste.html',
  steps: [{ cmd: 'bold' }, { cmd: 'insertimage', args: [{ src: 'x.png' }] }],
};

describe('validateCorpus', () => {
  it('合法 manifest 原样通过并返回类型化数组', () => {
    expect(validateCorpus([okEntry])).toEqual([okEntry]);
  });

  it('根节点不是数组直接抛错', () => {
    expect(() => validateCorpus({ id: 'x' })).toThrow(/不是数组/);
  });

  it('id 重复 fail-fast', () => {
    expect(() => validateCorpus([okEntry, okEntry])).toThrow(/id 重复/);
  });

  it('channel 非 setContent 拒绝（新增通道须先过契约评审）', () => {
    expect(() => validateCorpus([{ ...okEntry, channel: 'paste' }])).toThrow(/channel 非法/);
  });

  // file 缺失会让基线读取抛 ENOENT 且不带条目上下文，采集期先拦
  it('file 非字符串或为空时抛错且信息含条目 id', () => {
    expect(() => validateCorpus([{ ...okEntry, file: '' }])).toThrow(/sample/);
    expect(() => validateCorpus([{ ...okEntry, file: 1 }])).toThrow(/sample file 非法/);
  });

  it('steps 不是数组时抛错且信息含条目 id', () => {
    expect(() => validateCorpus([{ ...okEntry, steps: 'bold' }])).toThrow(/sample steps 必须是数组/);
  });

  // cmd 拼写成非字符串会双侧静默 no-op：基线记录"命令没跑过"，M2 复现同样 no-op → 假绿
  it('cmd 非字符串时 fail-fast', () => {
    expect(() => validateCorpus([{ ...okEntry, steps: [{ cmd: 123 }] }])).toThrow(/sample 第 0 步 cmd 非法/);
  });

  it('args 既不是数组也未省略时 fail-fast', () => {
    expect(() => validateCorpus([{ ...okEntry, steps: [{ cmd: 'x', args: {} }] }])).toThrow(/第 0 步 args/);
    // args 省略是合法形态（execCommand 无额外参数）
    expect(() => validateCorpus([{ ...okEntry, steps: [{ cmd: 'x' }] }])).not.toThrow();
  });
});

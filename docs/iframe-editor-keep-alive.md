# iframe 编辑器与 Vue `<keep-alive>` 的坑

> 适用：UEditor、TinyMCE（iframe 模式）、CKEditor 4 等 iframe 派编辑器，Vue 3。

---

## 1. 结论

**有这个坑。** 但真正的原因不是"iframe 保留在内存里"，而是 **iframe 被移动后会重新加载**，编辑器实例对此无感知。

---

## 2. 机制

1. `<keep-alive>` 在组件失活时不会销毁 DOM，而是把组件根节点移到一个脱离文档的临时容器中，激活时再移回。
2. 浏览器对 iframe 的规则：从文档中移除再插入，iframe 会重新加载。
3. 这类编辑器的 iframe 内容是脚本用 `document.write` 动态写入的。重载后变成空白页，写入的内容、样式、事件绑定全部丢失。
4. 编辑器实例对象仍然存在，并认为自己已初始化，指向的是旧的 document。
5. 编辑器本身不感知 Vue 的 `activated` / `deactivated`，所以不会自己重建。

**典型表现**：编辑器外壳（工具栏）还在，编辑区空白、点不进去、不能输入。

**范围**：这不是 TinyMCE 独有，UEditor、CKEditor 4 的 iframe 模式都一样。

---

## 3. 关于官方封装

`@tinymce/tinymce-vue` 的新版本据说已在 `activated` / `deactivated` 里做了移除与重建处理，但未逐版本核实。

- 请查看你们实际使用版本的源码确认。
- 用最小用例在 keep-alive 中来回切换几次验证。
- UEditor 没有官方 Vue 包，社区封装不一定处理了，需要自己兜底。

---

## 4. 处理方案（按推荐程度）

### 方案 1：编辑页不进 keep-alive（最简单）

```vue
<keep-alive exclude="EditorPage">
  <component :is="Component" />
</keep-alive>
```

或者给编辑器加 `v-if` / `key`，让它每次都重建。

- 优点：简单可靠。
- 代价：切走再回来，撤销历史、滚动位置会丢。

### 方案 2：失活时销毁，激活时重建

把当前内容存下来，激活后用它初始化新实例。

```ts
import { onActivated, onDeactivated, onMounted } from 'vue'

let snapshot = ''
let mounted = false

onMounted(async () => {
  await initEditor(props.modelValue)
  mounted = true
})

onDeactivated(() => {
  snapshot = editor.value?.getContent() ?? ''
  window.UE.delEditor(id)        // TinyMCE 则是 editor.remove()
  editor.value = null
  isReady = false
})

onActivated(async () => {
  if (!mounted) return           // 首次激活由 onMounted 负责，避免重复初始化
  await initEditor(snapshot)     // 新建实例，ready 后 setContent(snapshot)
})
```

注意点：

- 首次激活会先触发 `onMounted`，再触发 `onActivated`，务必用标志位避免重复初始化。
- 销毁与重建期间，`v-model` 的 watch 要用 `isReady` 拦住，别对不存在的实例调用 `setContent`。
- UEditor 要用 `UE.delEditor(id)` 清缓存，只 `destroy()` 不够。
- 若需要保留撤销历史或滚动位置，必须自己保存和恢复（编辑器重建后撤销栈会清空）。

### 方案 3：换成 contenteditable 方案

TinyMCE 的 inline 模式直接在主文档里编辑，节点被移动不会丢内容。

- 优点：不受 iframe 重载影响。
- 需要重新评估：浮层、样式隔离、XSS 边界。
- 仍需确认：节点移回后，事件监听是否正常。

---

## 5. 选择建议

| 场景 | 建议 |
|---|---|
| 编辑页离开后无需保留状态 | 方案 1 |
| 必须保留内容草稿，撤销历史可丢 | 方案 2 |
| 必须保留撤销历史 / 滚动位置 | 方案 2 + 自行保存恢复状态 |
| 需要与宿主页面深度联动，且在意 keep-alive | 评估方案 3 |

---

## 6. 验收清单

- [ ] 在 keep-alive 下来回切换路由 20 次，编辑区始终可输入
- [ ] 切换后内容与离开前一致
- [ ] 无重复初始化（同 id 只存在一个实例）
- [ ] 无控制台报错，无内存持续增长
- [ ] 失活期间异步到达的 `modelValue` 在重建后正确显示

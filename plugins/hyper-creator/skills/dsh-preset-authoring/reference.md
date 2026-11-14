# 预设创建参考

`SKILL.md` 的流程细节与查证入口。关键结论都附了出处，可以直接回读源码复核。

## 声明字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✓ | 小写字母、数字、连字符；profile 内全局唯一，重名让声明加载失败 |
| `plugins` | ✓ | Cordis 条目列表 |
| `name` / `description` / `order` | | 显示名、描述、roster 位置 |
| Loader 行 id | 约定 | `preset-<id>` |

- 内置预设在 `@deepseek-ai/dsh-web-app` 的 `presets/*.patch.yml`；桌面版在 `app.asar` 内，只能文件工具读。
- 覆盖内置预设：按 Loader 行 id 写 patch，`config` **整体替换**；`name` 只断言插件名。
- 往 group 里插：`insert` 的 `id` 写那个 `group: true` 的行 id。
- 建议先读 `dsh-doc` 的 `references/compositions.md`（创建/覆盖/迁移的权威写法）与 `references/composition-reference.md`（补丁方言）。

## 放置与 realm

- Host 插件供共享服务：工具与提示词注册表、Agent 循环、会话、持久化、设置、沙箱策略、模型路由、子 agent 后端。
- preset 插件贡献作用域内的工具、persona、提示词段、策略。**预设的 revision 是急切激活一次、由选中它的 Agent 共享**。
- `scope` 管贡献与事件可见性；`isolate` 管服务实例。preset 里的插件要供服务，提供者与消费者一起 `isolate` 到同一 realm；被 Host 插件消费的服务只能放 Host。
- 工具执行器每作用域一个：`ctx.tools.setExecutor` 第二次调用直接抛 `Only one tool executor may be registered in each scope`。根作用域已有内置执行器，所以执行器只能住在 preset 里。
- 嵌套插件列表用普通 Cordis group（`name: cordis:group`, `group: true`）；`cordis:include` 从 `config.path` 读 YAML/JSON 条目列表。

## `!!js` 求值

- 只放在插件 `config` 或 `disabled` 里；行级元数据保持字面量。
- 实现（`cordis-plugin-loader` 的 `lib` 内 `config/utils`）：

  ```js
  const evaluate = new Function("ctx", "expr", `
    with (ctx) {
      return eval(expr)
    }
  `)
  ```

  所以表达式里的 `baseUrl`、`ctx.<service>` 都是 ctx 的属性，不是全局变量。
- `config` 的表达式在插件的 fiber ctx 上求值（`interpolate(fiber.ctx, config)`），此时该行声明的 `inject` 已经激活。
- `baseUrl`：补丁文件被载入时设为 `new URL(".", pathToFileURL(patchFile)).href`——**补丁文件所在目录的 file URL，带尾斜杠**（`dsh-app-boot` 的 patch loader）。
- `disabled` 的表达式在挂载决策时对 Loader entry ctx 求值（`_resolveDisabled`）。

### 锚点配方：自己包内的资源

```js
// customSkillDirs 的一项：<包根>/plugins/<plugin>/skills
(() => {
  const path = process.getBuiltinModule('node:path')
  const url = process.getBuiltinModule('node:url')
  const raw = typeof baseUrl === 'object' && baseUrl !== null ? baseUrl.href : String(baseUrl ?? '')
  let dir = raw
  try {
    dir = url.fileURLToPath(new URL('.', raw))
  } catch {
    if (/\.ya?ml$/i.test(dir)) dir = path.dirname(dir)
  }
  if (dir === '') return path.join(path.sep, '.dsh-skills-absent')
  return path.join(dir, 'plugins', '<plugin>', 'skills')
})()
```

这段覆盖三种输入：file URL / URL 对象（正常走 `new URL('.')`）、纯路径（退回 `dirname`）、空值（返回一个必定不存在的哨兵，避开「空串解析成 cwd」的坑）。

### 锚点配方：安装目录里的 shipped 包

```js
const anchor = ctx.get('profileContext').installAnchor   // <install>/@deepseek-ai/dsh/package.json
const root = join(dirname(anchor), '..')                 // …/@deepseek-ai
```

Host 上的安装锚点是 `ctx.get('profileContext').installAnchor`。`process.env.DSH_INSTALL_DIR` 不可依赖：历史观察是它只由 `dsh-shell-env` 注入给 shell 命令，Host 进程里可能没有（所以别拿 shell 里的值当 Host 行为）。也因此别用 `createRequire(baseUrl).resolve('@deepseek-ai/...')` 解析 shipped 包：从链接安装的 bundle 出发必然 `MODULE_NOT_FOUND`，那一行随之 `never started`。自己包内的资源才用 `baseUrl`。

## 诊断对照

| 诊断 | 含义 | 处理 |
|---|---|---|
| `never started` | 该行模块导入失败；loader 只写 Host 日志，不建 fiber | 让失败变可见：模块作用域零 shipped 依赖，解析推迟到 `apply()` |
| `failed: <详情>` | 激活抛错 | 读详情；`cannot resolve … (tried: …)` 指向锚点问题 |
| `waiting for <service>` | `inject` 的服务没供上 | 检查提供者与消费者是否同一 realm |
| `failed: <INVALID…>` | 行配置不合 schema | 对齐插件导出的 `Config` |
| 组件列表少一项 | 可能只是 preset 子项 | `list_bundles` 的 `rows` 才是顶层组件；group 会被递归 |
| 改了代码没反应 | 改的是 preset 行（`unmanaged-plugin`）或文件不在 `link:` 目标的真实路径下 | preset 行必须重启；Host 行禁用→启用 bundle 即可 |

一个容易误判的信号：从 Host 视角查 `Config.listConfigs`，preset 作用域的行可能显示 `inactive`——那可能只是它不在 Host 的 loader 树里枚举，不代表没挂载。判断依据是 fiber、诊断和实际工具面。

## 验证命令

```text
plugin_manager list_bundles                  # rows = 顶层组件（group 会被递归）
plugin_manager list_plugins                  # preset-<id>: enabled / fiberPhase
cordis_inspect_query Config.listConfigs      # name=@deepseek-ai/dsh-agent-preset
cordis_inspect_query ToolCatalog.listTools   # 模型真正收到的编目，含 run_code 这类传输
cordis_inspect_query Tool/listTools          # 只是注册表，永远不含传输
```

- 预设声明失败时仍留在 roster 上带诊断，且不能组会话；修好后重装，用新会话验证。
- `plugin_manager` 的调用要过权限/审批；没有审批通道时会一直等到超时。只读排查优先用 `cordis_inspect_query`（Host 侧本地执行、不弹审批）。
- 验收设计要留下**宿主侧证据**：写一个文件再回读、`stat` 看 mtime、或 inspect 输出。这样验收方不必相信模型的自我汇报。同一批发出的调用是否真的同批，只有日志或磁盘顺序能证明。

## 派生脚本骨架

```ts
// bun derive.ts <内置预设 patch 路径> <输出路径>
import { readFileSync, writeFileSync } from 'node:fs'

const [, , basePath, outPath] = process.argv
const edits: [string, string][] = [
  ['id: cordis', 'id: hyper-creator'],
  ['name: Creator', 'name: 增强创造模式'],
  ['order: 5', 'order: 6'],
]

let text = readFileSync(basePath, 'utf8')
for (const [from, to] of edits) {
  const hits = text.split(from).length - 1
  if (hits !== 1) throw new Error(`expected exactly 1 "${from}", found ${hits}`)
  text = text.replace(from, to)
}
writeFileSync(outPath, text)
```

跑完用 `git diff --no-index -- <基线> <输出>` 逐行看：应当只有你列出的改动，加上预期的新增行。行数变化对不上就回退重跑，别靠肉眼扫二十几行 YAML。

## 常见误判

- 「组件里只有一项」→ preset 的 `plugins` 子项不是组件，模式自己才是。
- 「版本号没变，所以没生效」→ 版本只是元数据；活性看行为差异。
- 「装完就能用」→ 已开着的会话保留旧 revision，要新会话。
- 「改了 preset 里的代码没反应」→ preset 行是 `unmanaged-plugin`，重载不淘汰它，要重启。

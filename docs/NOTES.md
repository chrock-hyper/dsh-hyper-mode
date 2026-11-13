# 建造笔记：一个能真正加载的 DSH 混合执行器 bundle

这份笔记记录 `dsh-hyper-mode` 从「想合并两种执行器」到「在真实会话里验收通过」的全过程，重点是**踩过的坑**——它们几乎都不是业务逻辑问题，而是 bundle 的加载与解析机制问题。如果你想给 DSH 写插件，这些坑大概率也会遇到。

> 可复用的检查清单见仓库里的 `skills/dsh-bundle-authoring/SKILL.md`。

## 1. 动机

DSH 内置两种工具执行器，**同一作用域只能注册一个**（`ctx.tools.setExecutor`）：

- `tool-executor-native`：模型直呼每个可见工具；
- `tool-executor-ptc`：模型只能直呼 `run_code`，其余工具退化为程序内的 SDK 绑定。

于是「长编排直呼 `workflow`、批量操作写程序」这种组合用内置件拼不出来。但 `ToolExecutor` 契约本身很小：

```ts
interface ToolExecutor {
  readonly sections?: readonly ToolPromptSection[]
  describe(tools): ToolModelInput            // 决定模型看到哪些 schema
  execute(batch): Promise<ToolBatchResult>   // 接管整批调用的解析/调度/结算
}
```

参数解析、权限策略、审批、取消、日志都在共享的 `ToolExecutionPipeline` 里。所以「混合」不需要重写安全逻辑，只需**重新分发**：`describe` 把 `run_code` 传输与全部原生 schema 一起通告，`execute` 按调用形状把一批拆成若干相邻段，各交给对应的执行器。

## 2. 三个设计取舍

| 取舍 | 选择 | 理由 |
|---|---|---|
| 怎么复用 | 组合现成的 `NativeToolExecutor` + `PtcExecutor` 实例 | 两者合计 151 行且都已导出；内部 `createRunCodeTool` 未导出，硬抄等于重写审批/超时/额度 |
| 怎么分批 | 按**相邻**同类分成段，段间串行 | 保住「独占调用构成屏障」，写操作不会被排到程序后面 |
| 怎么保序 | 段内各自保序，合并时用 `callId` 还原提交顺序 | 批次契约要求「一调用一结果、按模型原始顺序」 |

`run_code` 传输刻意不在可见工具集里（PTC 把它放在注册能力之外），所以 SDK 块只列真实工具，`run_code` 由 `describe` 单独放最前。

## 3. 四个坑

### 坑 1：链接式 bundle 解析不到 `@deepseek-ai/*`

```
ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-tools'
  imported from /Users/…/bundles/dsh-hyper-mode/index.js
```

`install_bundle` 对本地目录用 `link:` 安装，Node 会把符号链接解析成**真实路径**，从工作区向上找不到 `app.asar` 里的包。

**注意**：安装仍返回 `application: applied`，预设行也 `status: schema`——**安装成功不代表能加载**。

### 坑 2：加载器把导入失败吞成 `never started`

```
tool-executor-hybrid (dsh-hyper-mode): never started
```

`cordis-plugin-loader` 的 `_init()`：

```js
try { moduleNamespace = await this.parent.tree.import(this.options.name, …) }
catch (error) { this.ctx.logger.error(error); return }   // 只写日志，不建 fiber
```

导入失败不产生 fiber，审计看到 `fiber === undefined` 就报 `never started`，**原因只在 Host 日志里**（桌面版没有落盘日志）。

**对策**：模块作用域零 shipped 依赖，加载推迟到 `apply()`。这样导入永远成功，失败会变成 registry 可见的 `failed: <详情>`。

### 坑 3：预设里的 `!!js` 表达式锚定在补丁文件旁

从 `dsh-web-app` 的 Creator 预设照抄了这段：

```js
createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')
```

补丁方言里 `baseUrl` 锚定**补丁文件所在目录**。原件在 `dsh-web-app` 包里能解析；搬到自己的 bundle 后必然 `MODULE_NOT_FOUND`，那一行随之起不来。

**对策**：改用安装目录锚点，并保留原路径作回退：

```js
const installed = path.join(process.env.DSH_INSTALL_DIR || '', '..', 'dsh-agent-preset', 'skills')
if (fs.existsSync(installed)) return installed
```

### 坑 4：Host 进程里没有 `DSH_INSTALL_DIR`

```
cannot resolve @deepseek-ai/dsh-tool-executor-native:
  @deepseek-ai packages are not reachable and DSH_INSTALL_DIR is unset
```

这个变量由 `dsh-shell-env` **只注入给 shell 命令**（`values[key] = dirname(profile.installAnchor)`），Host 进程的 `process.env` 里没有。

**这才是最关键的教训**：我最初所有验证都在 bash 里跑，而 bash 恰好是唯一有这个变量的地方——**测试环境把差异掩盖了**，导致同一个问题反复出现。

**正解**：Host 上有 `hostCtx.provide("profileContext", profileContext)`，其中

```js
const INSTALL_ANCHOR = fileURLToPath(new URL("../package.json", import.meta.url))
// → <install>/@deepseek-ai/dsh/package.json
```

从 `ctx.get('profileContext').installAnchor` 取，`dirname(anchor)/..` 即 `@deepseek-ai` 根。该服务在 Agent preset 作用域同样可见（预设里的 `tool-plugin-manager` 行就用 `!!js "!ctx.get('profileContext')"` 判断）。

最终 `lib/shipped.js` 按序尝试四个锚点、逐个 `existsSync` 校验，全失败时报错**列出尝试过的路径**。

## 4. 怎么验证「改的代码真的在跑」

软链接不是问题：profile 里只是符号链接（与源目录同一 inode，无副本），改文件立刻反映在磁盘上。真正的障碍是 **Node 的 ES 模块按 URL 缓存**——但这**不等于**必须重启进程。

`plugin_manager` 开关 bundle 时会调用 `hmr.reconcileProfile()`，它按顺序做四件事：

1. `profileRoots(profile.dir)` 收集比对根：profile 目录**加上所有符号链接包的真实目标**（`lstatSync(...).isSymbolicLink()`）——所以 `link:` 安装的 bundle 也在比对范围内；
2. `files.compare(profileModules(roots))` 拿已加载模块与磁盘比对，得出 `stale`；
3. `planReplacement` → `stopPlanned` 停掉这些模块的插件，`evict()` 把条目从 ESM 与 CJS 缓存里删掉（失败则回滚并重放旧插件）；
4. `recomposeProfile()` 重算并重放条目，下一次 import 重新求值磁盘上的新代码。

所以：**重载 bundle 就能让改动完全生效**。`package.json` 的 `version` 依然不是活性信号（只是元数据）；可靠的活性信号是**行为差异**——诊断文字从 `never started` 变成 `failed: <详情>`，或第 8 节的路由策略段落换成了新文案。

需要重启的只剩与进程实例强绑定的情况：

- `ResolutionRestartRequired`：保留中的 profile 映射**真实目录或作用域变了**（例如把 `link:` 从主 checkout 改指到 worktree）、安装版本/声明方变化、映射被移除；
- **`unmanaged-plugin`：改动被一个「不在 Loader 条目里」的插件 import**——即 agent preset 挂载的行。`hmr` 的原话是「A plugin registered outside a Loader entry has no owner that can start its replacement」（`src/index.ts:844`），所以它不会淘汰这些模块，只记一条待重启项；
- 原生 addon、进程级单例等 Cordis 生命周期管不到的状态。

实测数据（`dsh-hyper-mode`，含一个 preset 行）：`plugin_manager set_bundle` 禁用再启用后返回 `application: restart-required`、`restartReason: unmanaged-plugin`；但**同一个 bundle 里的 Host 行照样热生效**（本包新增的 `ToolCatalog` provider 当即出现在 `cordis_inspect_list` 里）。也就是说：改 Host 行的代码可以靠重载生效，改 preset 里的行必须重启。

这条也解释了反直觉现象：源码改了却没生效时，先查**改的文件是否在链接目标的真实路径下**，而不是先重启。

## 5. 验收怎么设计才可信

不用「看起来能用」当结论，而是让用例**留下宿主侧可独立核验的痕迹**：

- 直呼一次 `cordis_inspect_list`（证明原生面存在）；
- 一次 `run_code` 只做 introspection，返回 7 个绑定的 `typeof`（证明 SDK 渲染 + Creator 工具集在程序面）；
- **同一批**发出 `直呼 bash → run_code → 直呼 bash`，各自往同一文件追加一行（证明混合批被正确分段）；
- 回读文件，**三行顺序必须是 H1/H2/H3**。

验收方（不是模型自己）直接 `cat -n` 那个文件核对行序，就绕开了「模型自述可能记错」的问题。

实测结果：9 个 provider、7 个绑定全 `function`、三行有序。

## 6. 已知未覆盖

- **跨段并发屏障**：混合批按段串行，未测「段内并行读 + 另一段写」的实际交错；
- **`run_code` 上限**：10 分钟硬超时与按超时计算的调用额度耗尽未单独验证；
- **子调用失败隔离**：程序内某个子调用失败时，同批其余调用的结算未单独验证；
- **`Config` 导出**：因加载推迟到 `apply()`，本插件不再导出 `Config`，行配置由 `PtcExecutor` 自行校验（功能无损，但界面少了 schema 提示）。

## 7. 开发这个 bundle 时的最小自检

```bash
bun test                                   # 纯逻辑 + 接线 + apply 注册
node --check index.js                      # 语法（复制成 .mjs 再检查）
env -u DSH_INSTALL_DIR ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" …  # 模拟 Host 环境
```

最后一条尤其重要：**永远用「没有 shell 变量」的环境验证 Host 侧行为**。

## 8. 路由策略：为什么是阈值而不是「一律用 run_code」

混合执行器最初的策略只有一句话：「单步直呼，要串联/循环/并行读才写程序」。这等于只是**允许**，没有在模型做决策的地方给出判据；而 `run_code` 自带的工具描述是纯机械的（「执行一个程序，两个参数」），一个字也没说什么时候该用它。

于是把策略收成一条**可判定的阈值**，落在两处：

| 位置 | 作用 |
|---|---|
| `lib/policy.js` 的 `HYBRID_INSTRUCTION` | 挂在 `PTC_ONLY` 段（order 800），在各工具专属段落之前，统领全局 |
| 同文件的 `RUN_CODE_PREFERENCE` | `describe()` 时追加到 `run_code` 的 schema 描述上，离决策点最近 |

**判据**：动手前就能列出 ≥2 个调用、且中间值只被程序消费 → 写程序；单步、结果要先看/先批、或还在探索 → 直呼。

不做成「一律编程」，是因为代价不对称：

- `run_code` 省的是**往返次数**和大结果占的**上下文**；
- 它不省的是**代码本身的 token**和单次调用的**额外延迟**——两个小结果写成程序反而更贵；
- 嵌套子调用 settle 时没有 `meta`（见 `dsh-client-ui-tool` 的 `image-card-model.ts`），需要看渲染结果（图片、diff）的工作仍应直呼。

所以策略里同时写了两条「反例豁免」和三条**批处理卫生**：逐项 `try/catch` 并回报失败项（程序内子调用失败是 rejection，不捕获就整体失败）、只打印整理后的结果、破坏性/对外可见动作保持直呼；大批量要分块，因为 `run_code` 有 10 分钟硬上限。

策略文本抽成纯常量而不是内联在 `index.js`，是为了让 `bun test` 能断言「阈值、反例、卫生规则都还在」，改文案不动执行器逻辑。

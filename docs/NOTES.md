# 建造笔记：一个能真正加载的 DSH 混合执行器 bundle

这份笔记记录 `dsh-hyper-mode` 从「想合并两种执行器」到「在真实会话里验收通过」的全过程，重点是**踩过的坑**——它们几乎都不是业务逻辑问题，而是 bundle 的加载与解析机制问题。如果你想给 DSH 写插件，这些坑大概率也会遇到。

> 可复用的检查清单见 `plugins/hyper-creator/skills/dsh-bundle-authoring/SKILL.md`（加载与解析），以及 `plugins/hyper-creator/skills/dsh-preset-authoring/SKILL.md`（造预设）。

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

## 9. `/hyper-skill`：把随包 skill 做成一条斜杠命令

一开始把它做成 Host 行的系统提示段落（「根指令」），但用户要的是 `/export` 那种**人类命令**：由人决定装什么，不进模型消息、不占 token。最终形态是 `ctx.commands.register`，skill 的发现与「链接进扫描根」保留为纯函数，可直接测。

两个约束决定了形态：

| 约束 | 结论 |
|---|---|
| 客户端只把参数文本路由给**声明了 `input`** 的命令 | 必须声明 `input.hint`；不声明时 `/hyper-skill install x` 不会被命令路径接管 |
| 命令结果走 composer 的 `notify` | 只返回单行短文本；名字超过 6 个折叠成「等 N 个」 |

命令语义：

- 空输入 / `list` → 列清单：可安装、已安装（项目 or 用户）
- `install <名称>` → 默认链接到 `~/.dsh/skills`；`--project` 改到 `<项目根>/.dsh/skills`
- `remove <名称>` → 同时试 `<名称>` 与 `<名称>.md`（扁平 skill 的链接名必须带扩展名），只删「解析后位于本 bundle 内」的链接

「安装」为什么不用重启：skill 是否出现只取决于扫描根（项目 `.dsh/skills`(100)、`customSkillDirs`(300)、`~/.dsh/skills`(400)…），而 `skill-filesystem` watch 这些根；命令只做 `mkdir` + `ln -s`。

验证记录（2026-11-14，Desktop profile）：

1. `ln -s <bundle>/plugins/hyper-creator/skills/dsh-preset-authoring ./.dsh/skills/` → 下一步替换编目出现它，`skill` 工具加载成功；删链接后消失，全程未重启；
2. `bun test` 覆盖命令语法、两种安装位置、幂等、冲突、外部链接保护与命令注册（当前全量 54 例全绿）；
3. 重载后 `plugin_manager list_plugins` → `include:hyper-skills` 为 `enabled: true`、`fiberPhase: active`。

这也解释了为什么它必须是 Host 行：preset 行的配置冻结在会话组合里，改动走 `unmanaged-plugin` 的重启路径；Host 行重载 bundle 即可生效。

**坑 5：新增子路径导出要重启，相对路径不用。** 第一次实现把这行写成 `@chrock-studio/dsh-hyper-mode/hyper-skills`，`exports` 也加了对应条目，重载后行状态是 `never started`。原因不在加载器：Node 的 ESM 解析器把 `package.json` 的 `exports` 缓存在**进程级**，同一进程里后来添加的子路径仍报 `ERR_PACKAGE_PATH_NOT_EXPORTED`（用一个只改 package.json 的最小复现确认过）。补丁方言支持 `name: ./plugins/<name>/index.js`，插入行的相对路径锚定在补丁文件旁，`loader` 里走的是 `new URL(name, ctx.baseUrl)`——完全绕开 `exports`。所以本 bundle 的新行用相对路径：**新增插件也不用重启**。

**一个待查的现象**：当前进程里「增强创造模式」会话并没有看到 `dsh-preset-authoring`（`skill` 报 unknown），而同一个 skill 链接进项目根后立刻出现。可能是进程启动早于 `b23e5cc`、预设组合还是旧的，也可能是 preset 作用域下 `baseUrl` 的锚点与补丁文件不同。命令不依赖这条 preset 行，所以无论哪种原因它都成立。

## 10. 策略追加：DSH 创造任务先通读 dsh-doc

`HYBRID_INSTRUCTION` 现在多了一段硬前置：写或改 DSH 的 bundle、plugin、preset、tool、skill、MCP 连接之前，先通读 `dsh-doc`，再读它指向的 references。

理由是本仓库的坑几乎都来自「凭记忆写插件契约」：加载器把导入失败吞成 `never started`（坑 2）、`exports` 被进程级缓存（坑 5）、preset 行的配置冻结在会话组合里（坑 3/4）。这些规则随 DSH 版本变化，`dsh-doc` 是随安装发布的那份事实，记忆里的那份不是。

文本落在 `lib/policy.js` 的 `HYBRID_INSTRUCTION`（order 800，在各工具专属段落之前），`policy.test.js` 断言它还在。注意它在 preset 行里，属于 `unmanaged-plugin`：改完重载返回 `restart-required`，要重启 DSH 才进提示词。

## 11. 一个 bundle 里的第二块客户端：多来源限制

给 `hyper-roles` 加面板时，最直觉的做法是在根 `package.json` 加 `dsh.client`。这会**让整个 bundle 起不来**。

`dsh-client-modules` 的 `reconcilePackage` 会把「同一个包名」的所有活跃 Loader 来源收在一起，出现两个就抛：

```
client-modules: package @chrock-studio/dsh-hyper-mode resolves from multiple active Loader sources:
  "./plugins/hyper-skills/index.js" from file://…, "./plugins/hyper-roles/index.js" from file://…; remove one entry
```

本 bundle 有四行来自同一个包（hyper-teams / tool-catalog / hyper-skills / preset 里的 hyper-creator），所以根包上永远不能声明 `dsh.client`。

**做法**：把客户端挂到一个嵌套清单 `plugins/hyper-roles/package.json`（包名 `@chrock-studio/dsh-hyper-roles`，只声明 `exports["./client"]` 与 `dsh.client`）。`locatePkgJson → nearestPackage` 会从行模块向上找**最近**的 `package.json`，因此只有 `hyper-roles` 这一行认领这个包，冲突消失。

顺带确认了三点：

| 事实 | 位置 |
|---|---|
| 路径式行（`./plugins/x.js`）会从模块向上找最近的包清单 | `dsh-client-modules/src/index.ts:931-992` |
| 同一个包出现多个活跃来源 → 抛错 | 同上 `reconcilePackage` |
| 嵌套包不需要被安装：清单从磁盘读，client 文件按 `dirname(pkgPath)+exports["./client"]` 提供 | 同上 `resolveMeta` |

## 12. 岗位绑定：为什么是 projection 而不是旁存文件

岗位身份要能扛住 resume / fork / 重放，所以它必须来自**会话日志**。三条路都比想象中窄：

1. `session.snapshotEvents()` / `ownEvents()` 已标记 deprecated，新代码禁用；
2. 自建 JSON 绑定表不受重放保护，fork 出来的子代理会丢身份；
3. 写新事件类型会污染会话格式（`appendPluginRecord` 只对 DSH 自家实验包开放）。

最终形态：委派时在子代理首条消息里写 `<!-- role:<id> -->`，插件注册一个 host-only 的 session projection 折叠它。两个细节值得记：

- `ProjectionDefinition.stateSchema` 的运行时契约只需要 `{ parse(value) }`（`dsh-session-projection/src/index.ts:216` 的注册入口按结构接收），所以一个 6 行校验器就够，不必为了 schema 把 zod 塞进一个零依赖 bundle；
- 投影状态必须同步、纯、且是纯 JSON；未命中事件要返回**同一个引用**，否则每一步都会产生下游工作。

提示词段落拿 `context.agent`（`AssembleContext.agent` 由 `dsh-agent` 合并声明），每次装配读一次磁盘卡片（按需可再加 mtime 缓存），于是「改岗位 → 下一步生效」，不用重开子代理。

## 13. 把它们放进会话标签页：三个被现实纠正的判断

**入口不是 `main` 面板。** DSH 的会话视图排在 `conversation.view`（list/session）里：`chat 0 · trajectory 10 · stats 40`，注册项只有 `id / order / label`（没有图标）。把岗位与 Wiki 分别注册成 `order 50 / 60`，就落在「统计」后面。这个槽位自带 `sessionId` 标准 prop——比原来的根级 `main` 面板强的地方在于：项目作用域直接取当前会话的工作目录，面板不再需要“选择项目目录”。

**浏览器 `fetch` 拿不到连接容器的凭据。** 上一版在自建路由上用 `connection.requestRejection(req)` 鉴权，`curl` 与页面请求都得到 401；页面的 `fetch` 不是 `/api` 通道的客户端，它不带那套凭据，于是所有按钮都“没反应”。改法与其它本地插件一致：路由只接受 loopback，非 loopback 一律 401。代价是本地进程可以读写这些文件；收益是它真的能用。

**Electron 没有 `window.prompt`。** 旧面板用 `prompt()` 收集新建岗位的 id 与目录，点击即抛异常并被 `onClick` 吞掉。现在新建是就地表单；归档是第二次点击确认（按钮文案变「确认归档？」）。同时补上真正的 dirty 计算：每个输入框都参与比较，保存按钮的禁用状态永远能解释。

**收进同一个 bundle 时，客户端仍要独立清单。** `dsh-client-modules` 对同一个包出现多个活跃来源会直接抛错，而本 bundle 有六行来自同一个包。所以 `hyper-roles` 与 `hyper-wiki` 各自把自己的浏览器半边放进嵌套的 `package.json`：`locatePkgJson → nearestPackage` 会从行模块向上取最近的清单，一行认领一个客户端包。wiki 因此从独立 bundle 收回为 `plugins/hyper-wiki/` 的一行，profile 里只剩一个安装项。

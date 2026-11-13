# dsh-tool-executor-hybrid

一个 agent 作用域内的**混合工具执行器**：模型既能直呼工具，也能把同一批工具当作 `run_code` 程序里的 SDK 绑定调用。

## 为什么存在

`@deepseek-ai/dsh-tool-executor-native` 与 `@deepseek-ai/dsh-tool-executor-ptc` 是互斥的：同一作用域只能注册一个执行器（`ctx.tools.setExecutor`）。PTC 用 pipeline 的 `reject` 钩子把非 `run_code` 的直呼一律判为 `UNKNOWN_TOOL`，于是「长编排直呼、批量走程序」这种组合无法用内置件拼出来。

`ToolExecutor` 契约本身很小（`describe` + `execute` + 可选 `sections`），解析、策略、审批、取消、日志都在共享的 `ToolExecutionPipeline` 里。所以混合语义不需要重写安全逻辑，只需重新分发。

## 文档

| 文件 | 内容 |
|---|---|
| `README.md` | 这是什么、怎么装、验证状态 |
| `docs/DETAIL.md` | 插件详情页：功能、用法、限制 |
| `docs/NOTES.md` | **建造笔记**：设计取舍、四个坑（含原始报错）、验收怎么设计才可信 |
| `VERIFY.md` | 可复现的验收用例（直呼 / 程序 / 混合批 / 回读） |
| `skills/dsh-bundle-authoring/SKILL.md` | 可复用 skill：写 DSH bundle 的检查清单与「症状 → 病因」表 |

## 组成

| 文件 | 作用 |
|---|---|
| `index.js` | 插件本体：`describe` 合并两种调用面，`execute` 分段委派 |
| `lib/split.js` | 纯函数：相邻同类分组、按原始顺序归并结果（无依赖，可单测） |
| `cordis.patch.yml` | 声明预设 `creator-hybrid`（Creator 能力 + 本执行器） |
| `test/split.test.js` | 分组与归并的单元测试 |

## 安装

```bash
# 在 DSH 会话里（需要 Full access 或审批）
plugin_manager action=install_bundle target=<本目录绝对路径>
```

安装后新建会话，模式选「强化创造模式（混合执行）」。

回滚：`plugin_manager action=remove_bundle target=dsh-tool-executor-hybrid`。

## `lib/shipped.js`：为什么要自己解析包

本地 `link:` 安装的 bundle，入口名由加载器解析，但**插件自身 `import '@deepseek-ai/…'` 按 Node 规则从其真实路径解析** —— 链接指向工作区时解析不到 `app.asar` 里的包，插件会在导入阶段失败。

而 Cordis 加载器把插件导入失败**吞成一行 `never started`**（`cordis-plugin-loader` 的 `_init()` 里 `catch → logger.error → return`，不建 fiber），UI 上看不到原因。所以这里做了两件事：

1. **模块作用域零 shipped 依赖**：`apply()` 内才同步 `require` 这些包。于是模块导入永远成功；真出问题就落在 `apply()` 里，registry 会记成可见的 `failed: <详情>`。
2. **按安装锚点解析**：`ctx.get('profileContext').installAnchor`（Host 提供，形如 `<install>/@deepseek-ai/dsh/package.json`）→ `$DSH_INSTALL_DIR` → `process.resourcesPath` → `process.execPath`，逐个 `existsSync` 校验。**注意 `DSH_INSTALL_DIR` 在 Host 进程里不存在**——它是 `dsh-shell-env` 专门给 shell 命令派生的，所以唯一可靠的来源是 `profileContext.installAnchor`。用安装目录的绝对路径是为了拿到**同一份模块实例**（副本重复会让 `HarnessError` 之类的 `instanceof` 失效）。

由于加载被推迟，本插件**不再导出 `Config`**：行配置由 `PtcExecutor` 在 `apply()` 内自行校验。

## 验证状态

- ✅ `bun test` 12/12（分组/归并 5 项 + 接线 5 项 + `apply()` 注册执行器 1 项 + 解析失败必须抛出 1 项）
- ✅ 已装进 `desktop` profile：预设行 `include:preset-creator-hybrid`（`status: schema`）
- ✅ 真实运行时：插件模块导入成功（无 shipped 依赖），`loadShipped` 三个包均取到
- ✅ 预设内 `!!js` 表达式改为以安装目录为锚点（原 `createRequire(baseUrl)` 从 bundle 目录必然失败）
- ✅ **端到端验收通过**（2026-11-14，会话「工具调用顺序验收验证」）：直呼 `cordis_inspect_list` 可用；`run_code` 内 7 个绑定均为 `function`；同一批三条 `bash → run_code → bash` 顺序正确；磁盘证据三行有序

详细排查过程见 `../../ops/records/2026-11-14-creator-hybrid-bundle-install.md` 与
`../../ops/knowledge/dsh-linked-bundle-module-resolution.md`。

## 限制

见 `docs/DETAIL.md`。要点：混合批按段串行；`run_code` 沿用 PTC 运行时的额度与超时；未挂载 PTC 运行时则不激活。

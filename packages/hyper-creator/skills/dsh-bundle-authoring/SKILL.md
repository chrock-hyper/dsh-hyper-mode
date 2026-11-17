---
name: dsh-bundle-authoring
description: 给 DeepSeek Harness 写或排查本地 bundle 插件时使用——新增 DSH 插件、bundle 装上了却显示 never started / failed、插件里要 import `@deepseek-ai/*` 或预设里要写 `!!js` 表达式、改了代码却不生效。给出「安装成功 ≠ 能加载」的检查清单与验证命令。
---

# 写一个能真正加载的 DSH bundle

DSH 的 bundle 加载链有三处反直觉的失败点，且**失败是静默的**：`install_bundle` 返回 `application: applied`、预设行显示 `status: schema`，但插件根本起不来。本 skill 是一份检查清单，按顺序排除。

预设声明本身怎么造（id、放置、派生、skill 目录）见 `dsh-preset-authoring`；本 skill 只管「包能不能加载」。

## 0. 先记住四条事实

1. **安装 ≠ 加载**。`applied` 只说明包进了 profile，不说明模块能 import、插件能激活。
2. **本地目录是 `link:` 安装**。profile 里是符号链接，Node 会把链接解析成真实路径，所以你的插件的依赖解析发生在**工作区**，不是 `app.asar` 里。
3. **加载器吞掉导入错误**。`cordis-plugin-loader/lib/index.js` 的 `_init()` 里 `catch (error) { logger.error(error); return }` —— 不建 fiber，审计只报 `never started`，原因只在 Host 日志（桌面版无落盘日志）。
4. **重载 ≠ 重启**。Node 按 URL 缓存 ES 模块，但 `plugin_manager` 开关 bundle 会走 `hmr.reconcileProfile()`：比对已加载模块与磁盘（含 `link:` 包的真实目标）→ 淘汰缓存 → 重新求值并重放条目。**所以重载 bundle 就能生效**；只有进程级绑定（原生插件、进程单例、`ResolutionRestartRequired` 的映射变更）才需要重启。`package.json` 的 `version` 不是活性信号。

## 1. 清单

- [ ] **随包（`@deepseek-ai/*`）走 peer + dev + external 三件套，然后正常 `import`。**
  ```json
  "peerDependencies": { "@deepseek-ai/dsh-tools": "^0.2.2-rc.3" },
  "devDependencies":  { "@deepseek-ai/dsh-tools": "0.2.2-rc.3" }
  ```
  ```ts
  import { defineTool } from '@deepseek-ai/dsh-tools'   // 模块顶层，正常写
  ```
  三件事各管一段：`peerDependencies` 让装进 profile 后的裸请求由 profile resolver 指到**宿主副本**；
  `devDependencies` 让本地构建、类型检查、测试解析得到（link 安装下运行时用的就是它）；
  构建时保持 external（`deps.neverBundle: [/^@deepseek-ai\//]`）让裸请求在运行时仍然存在。
  **不要内联随包**——内联就没有裸请求，peer 也就无从生效。**不要自己写按安装目录探路径的加载器**：
  那会让模块级无法 import、每个调用点手写 interface，而且 `link:` 下同样要自己找路径。
  这也是官方客户端与服务端流行插件的做法（`dsh-free-search` 等：`import { defineTool } from '@deepseek-ai/dsh-tools'` + peer/dev）。
- [ ] **Client 半边不要 runtime import `@deepseek-ai/*`**。浏览器模块表只种了 `react`、`react/jsx-runtime` 这类基线；
  在 Client 里 import 随包会让整包加载失败。`import type` 会被擦除，是安全的。
- [ ] **`!!js` 用 `baseUrl` 定位自己包内的资源是对的**（它锚定补丁文件所在目录），但**不要用它解析 shipped 包**：从别的 bundle 抄来的 `createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')` 换到你的 bundle 必然 `MODULE_NOT_FOUND`，那一行随之 `never started`。表达式本身也不能抛错、不能返回空串（空串会被解析成当前工作目录）。
- [ ] **每类资源 `existsSync` 校验 + 报错列出尝试过的路径**。静默回退是排查噩梦。
- [ ] **补丁用 `insert` 追加自己的行**；覆盖已存在的行会**整体替换 `config`**，必须重述全部字段。
- [ ] **display 资源齐全**：`locale/en.json` + 用户语言的 `meta.title/description`、`./icon`、`files` 覆盖所有运行时文件。
- [ ] **别手写 profile 的 `package.json` / `cordis.patch.yml`**，也别在 profile 里跑 pnpm；用 `plugin_manager` 的 `install_bundle` / `remove_bundle`。

## 2. 验证（按顺序，任一步失败就别往后跑）

```bash
# ① 纯逻辑：不碰 Host
bun test

# ② 构建 + 类型：随包解析在 devDependencies 上，typecheck 会暴露漏声明的 peer
pnpm build
pnpm typecheck

# ③ 模拟 Host：让真实安装副本参与解析，确认 apply 能装配
env -u DSH_INSTALL_DIR ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-<你的>.mjs

# ④ 装：plugin_manager install_bundle target=<绝对目录>
# ⑤ 预设注册：cordis_inspect_query Config.listConfigs name=@deepseek-ai/dsh-agent-preset
# ⑥ 新会话验收：确认工具面、并留一份磁盘证据核对顺序
```

## 3. 症状 → 病因

| 症状 | 病因 | 处理 |
|---|---|---|
| `never started` | 模块导入失败（被吞） | 按清单重新检查；让失败变可见后重新启用 bundle 再看 |
| `Cannot find package '@deepseek-ai/…'` | 只写了 `peerDependencies`，没写 `devDependencies`（或没装依赖） | 补齐 devDependencies 后 `pnpm install` |
| 装进 profile 后行为与本地不同 | 安装形态不同：packed 安装走 peer → 宿主副本，link 安装走 dev → 工作区副本 | 让两边版本对齐（peer 区间覆盖当前 DSH 版本） |
| `failed: <INVALID…>` | 行配置不合 schema | 对齐插件导出的 `Config` |
| 改了代码没变化 | 没重新构建，或改动不在链接目标的真实路径下 | `pnpm build` 后禁用→启用 bundle |
| 重载后 Host 行生效、preset 内仍旧 | 该行由 preset 挂在 Loader 条目之外（`unmanaged-plugin`） | 改 preset 内插件的代码只能重启 DSH；Host 行会热生效 |
| `waiting for <service>` | 依赖服务未供上 | 检查 `inject` 与所在作用域 |

## 4. 反例（别这么做）

- ❌ 把 `@deepseek-ai/*` 内联进产物 —— 运行时没有裸请求，peer 路由失效，还可能出现第二份实例。
- ❌ 只声明 `peerDependencies` 就本地跑 —— link 安装下解析不到，直接 `MODULE_NOT_FOUND`。
- ❌ 自己写按安装目录探路径的 `loadShipped` 类加载器 —— 模块级不能 import、类型要手写、`DSH_INSTALL_DIR` 在 Host 进程里根本不存在。
- ❌ 在 Client 半边 runtime import 随包 —— 浏览器模块表不认。
- ❌ 只用 bash 环境验证插件 —— 用 Host 自己的运行时（`ELECTRON_RUN_AS_NODE=1`）跑一遍。
- ❌ 以 `application: applied` 判定成功。

本仓库的 `docs/NOTES.md` 是这些结论的完整实验记录（含四次失败的具体报错）。

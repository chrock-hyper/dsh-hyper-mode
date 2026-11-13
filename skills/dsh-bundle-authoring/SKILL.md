---
name: dsh-bundle-authoring
description: 给 DeepSeek Harness 写或排查本地 bundle 插件时使用——新增 DSH 插件、bundle 装上了却显示 never started / failed、插件里要 import `@deepseek-ai/*` 或预设里要写 `!!js` 表达式、改了代码却不生效。给出「安装成功 ≠ 能加载」的检查清单与验证命令。
---

# 写一个能真正加载的 DSH bundle

DSH 的 bundle 加载链有三处反直觉的失败点，且**失败是静默的**：`install_bundle` 返回 `application: applied`、预设行显示 `status: schema`，但插件根本起不来。本 skill 是一份检查清单，按顺序排除。

## 0. 先记住四条事实

1. **安装 ≠ 加载**。`applied` 只说明包进了 profile，不说明模块能 import、插件能激活。
2. **本地目录是 `link:` 安装**。profile 里是符号链接；Node 会把链接解析成真实路径，从你的工作区**看不到** `app.asar` 里的 `@deepseek-ai/*`。
3. **加载器吞掉导入错误**。`cordis-plugin-loader/lib/index.js` 的 `_init()` 里 `catch (error) { logger.error(error); return }` —— 不建 fiber，审计只报 `never started`，原因只在 Host 日志（桌面版无落盘日志）。
4. **重载 ≠ 重启**。Node 按 URL 缓存 ES 模块，但 `plugin_manager` 开关 bundle 会走 `hmr.reconcileProfile()`：比对已加载模块与磁盘（含 `link:` 包的真实目标）→ 淘汰缓存 → 重新求值并重放条目。**所以重载 bundle 就能生效**；只有进程级绑定（原生插件、进程单例、`ResolutionRestartRequired` 的映射变更）才需要重启。`package.json` 的 `version` 不是活性信号。

## 1. 清单

- [ ] **模块作用域零 `@deepseek-ai/*`**。不要在顶层 `import` 或顶层 `await` 取 shipped 包；把解析推迟到 `apply()` 里，用同步 `require`（Node 22.12+ 支持 `require(esm)`）。这样导入不可能失败；真失败也会变成 registry 可见的 `failed: <详情>`。
- [ ] **解析锚点用 `ctx.get('profileContext').installAnchor`**，不要用 `process.env.DSH_INSTALL_DIR`——后者由 `dsh-shell-env` **只注入给 shell 命令**，Host 进程里没有。
  ```js
  const anchor = ctx.get('profileContext')?.installAnchor   // <install>/@deepseek-ai/dsh/package.json
  const root = join(dirname(anchor), '..')                  // …/@deepseek-ai
  createRequire(join(root, pkg, 'package.json'))(join(root, pkg, 'lib/index.js'))
  ```
  用安装目录的绝对路径还能保证与运行时**同一份模块实例**，避免两份 `HarnessError` 让 `instanceof` 失效。
- [ ] **预设 / 补丁里的 `!!js` 不要依赖 `baseUrl`**。`baseUrl` 锚定**补丁文件所在目录**；从别的 bundle 抄来的表达式（例如 `createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')`）换到你的 bundle 必然 `MODULE_NOT_FOUND`，那一行随之 `never started`。
- [ ] **每类资源 `existsSync` 校验 + 报错列出尝试过的路径**。静默回退是排查噩梦。
- [ ] **补丁用 `insert` 追加自己的行**；覆盖已存在的行会**整体替换 `config`**，必须重述全部字段。
- [ ] **display 资源齐全**：`locale/en.json` + 用户语言的 `meta.title/description`、`./icon`、`files` 覆盖所有运行时文件。
- [ ] **别手写 profile 的 `package.json` / `cordis.patch.yml`**，也别在 profile 里跑 pnpm；用 `plugin_manager` 的 `install_bundle` / `remove_bundle`。

## 2. 验证（按顺序，任一步失败就别往后跑）

```bash
# ① 纯逻辑：不碰 Host
bun test

# ② 语法（复制成 .mjs 再 --check，绕开 type=module 的检测差异）
cp index.js /tmp/x.mjs && node --check /tmp/x.mjs

# ③ 模拟 Host：关键是把 shell 变量去掉！
env -u DSH_INSTALL_DIR ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" -e "
  const { loadShipped } = await import('<绝对路径>/lib/shipped.js')
  const anchor = '<install>/@deepseek-ai/dsh/package.json'
  console.log(loadShipped('@deepseek-ai/dsh-tools', { get: n => n === 'profileContext' ? { installAnchor: anchor } : undefined }))
" --input-type=module

# ④ 装：plugin_manager install_bundle target=<绝对目录>
# ⑤ 预设注册：cordis_inspect_query Config.listConfigs name=@deepseek-ai/dsh-agent-preset
# ⑥ 新会话验收：确认工具面、并留一份磁盘证据核对顺序
```

## 3. 症状 → 病因

| 症状 | 病因 | 处理 |
|---|---|---|
| `never started` | 模块导入失败（被吞） | 按清单 1、2 改；让失败变可见后重新启用 bundle 再看 |
| `failed: cannot resolve … (tried: …)` | 锚点不对 | 看 `tried:` 列表，补 `profileContext.installAnchor` |
| `failed: <INVALID…>` | 行配置不合 schema | 对齐插件导出的 `Config` |
| 改了代码没变化 | 改动不在链接目标的真实路径下，或根本没发生重载 | 确认文件在 `link:` 指向的目录内，再禁用→启用 bundle |
| `waiting for <service>` | 依赖服务未供上 | 检查 `inject` 与所在作用域 |

## 4. 反例（别这么做）

- ❌ 在 bundle 里 `import { x } from '@deepseek-ai/dsh-tools'` —— 链接安装下必挂。
- ❌ 把 shipped 包装进自己 `node_modules` 求稳定 —— 版本漂移 + 重复实例，`instanceof` 失效。
- ❌ 只用 bash 环境验证插件 —— bash 有 `DSH_INSTALL_DIR`，Host 没有，**测试会掩盖差异**。
- ❌ 以 `application: applied` 判定成功。

本仓库的 `docs/NOTES.md` 是这些结论的完整实验记录（含四次失败的具体报错）。

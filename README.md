# dsh-hyper-mode · 增强创造模式

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）的**模式集 bundle**：一个包里聚合多个即插即用插件，装一次即可在会话里选到所有模式。

## 插件地图

| 插件 | 子路径 | 提供什么 |
|---|---|---|
| **hyper-creator**（增强创造模式） | `@chrock-studio/dsh-hyper-mode/hyper-creator` | Creator 能力 + 混合工具执行：既可直呼工具，也可把同一批工具当作 `run_code` 程序里的 SDK 绑定调用；动手前能列出步骤的多次调用优先走 `run_code` 编排 |
| `shared` | — | 跨插件共享纯代码，不挂载 |
| **hyper-teams**（空壳） | `@chrock-studio/dsh-hyper-mode/hyper-teams` | **独立组件**（顶层行，Host 作用域）：对所有会话生效，可在 Plugin Manager 单独启用/禁用。仅塞一个提示词标记，验收后可删 |
| **tool-catalog**（检视修复） | `@chrock-studio/dsh-hyper-mode/tool-catalog` | **独立组件**（顶层行，Host 作用域）：注册 `ToolCatalog` 检视 provider，返回模型真正收到的工具编目，补上 `Tool/listTools` 看不到的 `run_code` 传输 |
| **hyper-skills**（`/hyper-skill` 命令） | `@chrock-studio/dsh-hyper-mode/hyper-skills`（补丁行用相对路径 `./plugins/hyper-skills/index.js`） | **独立组件**（顶层行，Host 作用域）：注册 `/hyper-skill` 命令，按需把随包 skill 安装进扫描根；所有模式可用 |

## 结构

```
dsh-hyper-mode/
├─ package.json          @chrock-studio/dsh-hyper-mode（dsh.bundle.patch → ./cordis.patch.yml）
├─ cordis.patch.yml      ← 聚合点：每条插件行 + 各 mode 的 preset 声明
├─ index.js              兜底入口：整包当作单插件挂载时等同 hyper-creator
├─ locale/               bundle 在插件管理器里的标题/描述（en + zh）
├─ plugins/
│  ├─ hyper-creator/     增强创造模式插件（执行器 + 路由策略 + skill + locale + 文档 + 测试）
│  │  └─ skills/         随插件发布、由预设加载或按需安装的 skill
│  ├─ hyper-skills/      /hyper-skill 命令插件（Host 作用域：按需安装随包 skill）
│  ├─ tool-catalog/      检视修复插件（Host 作用域：ToolCatalog provider）
│  └─ shared/            跨插件共享代码（shipped 解析器）
└─ docs/NOTES.md         建造笔记：设计取舍与踩过的坑
```

**聚合点是 `cordis.patch.yml`，不是 `index.js`**：DSH 按补丁里的行挂载插件，根目录导出它们并不会自动生效。

## 新增一个插件

1. 建 `plugins/<name>/`，写 `index.js`（导出 `apply` / `name` / `inject`，可选 `Config`）；
2. 在根 `package.json` 的 `exports` 加两条：`./<name>` 与 `./<name>/locale/*.json`（给外部消费者用）；
3. 在 `cordis.patch.yml` 加一行。**优先用相对路径** `name: ./plugins/<name>/index.js`：补丁方言把插入行的相对路径锚定在补丁文件旁，新增子路径也不用重启。若写成 `@chrock-studio/dsh-hyper-mode/<name>`，Node 对 `package.json` 的 `exports` 有**进程级缓存**，新子路径在重载后仍报 `ERR_PACKAGE_PATH_NOT_EXPORTED`（加载器只记一条 `never started`），必须重启一次；
4. 重新启用 bundle（禁用→启用）即可，**Host 行不需要重启 DSH**：重载会比对已加载模块与磁盘、淘汰旧缓存再重新求值。**Preset 行例外**（`unmanaged-plugin`）：它被预设组合引用，重载返回 `restart-required`，要重启 DSH；与进程实例强绑定的实现（原生插件、进程级单例、改变链接目标目录）同样需要重启。

## 安装

```bash
plugin_manager action=install_bundle target=<本仓库绝对路径>
```

装完新建会话，模式选「增强创造模式」。

回滚：`plugin_manager action=remove_bundle target=@chrock-studio/dsh-hyper-mode`

## 验证

```bash
bun test                                # 全部：hyper-creator（执行器/策略）+ tool-catalog（provider 接线）
```

端到端验收用例见 `plugins/hyper-creator/VERIFY.md`，建造过程见 `docs/NOTES.md`。

## 随包发布的技能

`plugins/hyper-creator/skills/` 里的 skill 有两条到达路径：

| 路径 | 覆盖范围 | 生效方式 |
|---|---|---|
| **预设预挂**（`hyper-creator` 的 `skill-filesystem.customSkillDirs`） | 只在「增强创造模式」的会话 | 改这一行要**重启 DSH**（preset 行属 `unmanaged-plugin`） |
| **`/hyper-skill` 按需安装**（Host 行 `hyper-skills`） | 所有模式 | 命令把链接写进扫描根，下一步自动进编目，**不用重启** |

| skill | 用途 |
|---|---|
| `dsh-preset-authoring` | 新建或改造 agent 预设：放置决策、从基线派生、写声明、挂 skill 目录、验收 |
| `dsh-bundle-authoring` | bundle 的模块解析，以及「装上了但加载不了」的排查清单 |

在任意会话里直接敲（人类命令，不进模型消息、不占 token）：

```text
/hyper-skill                                         # 列出可安装 / 已安装
/hyper-skill install dsh-preset-authoring            # 装到 ~/.dsh/skills（默认，跨项目）
/hyper-skill install dsh-preset-authoring --project  # 装到 <项目根>/.dsh/skills
/hyper-skill remove dsh-preset-authoring             # 删掉本 bundle 的链接
```

「安装」= 把 `<bundle>/plugins/<plugin>/skills/<skill>` 链接进一个扫描根。`skill-filesystem` 监听 `<项目根>/.dsh/skills`（rank 100）与 `~/.dsh/skills`（rank 400），加/删链接下一步就反映到编目；卸载 = 删链接。项目根 = 最近含 `.git` 的祖先目录；`--project` 需要能取到会话工作目录。

实测（2026-11-14）：把 `dsh-preset-authoring` 链接进 `./.dsh/skills/`，**下一步编目就出现了它**，`skill` 工具可加载；删除后消失，全程未重启。

> 重名无副作用：某模式已预挂同名 skill 时，项目根 rank 更高会胜出。`minimal` 预设没挂 `skill-filesystem`，在那里装什么都不会出现。

新增一个 skill：建 `<插件>/skills/<name>/SKILL.md`（frontmatter 必须有 `name` 与 `description`，`name` 用小写字母/数字/连字符）。**不需要改补丁**——命令每次执行都重新扫描目录，`skill-filesystem` 也会发现新条目。只有要让它成为某个预设的「预装」技能，才需要改 `customSkillDirs`（并重启）。

## DSH 创造任务的硬前置

`hyper-creator` 的系统提示里有一条前置：写或改 DSH 的 bundle、plugin、preset、tool、skill、MCP 连接之前，先通读 `dsh-doc`（随 DSH 发布，不在本 bundle 里），再读它指向的 references。这条不是风格建议——插件契约、加载器行为与授权边界都随版本变化，凭记忆写出的补丁会静默失败（见 `docs/NOTES.md` 的坑 1/2/5）。

## 许可

MIT © 2026 JuerGenie / Chrock Studio

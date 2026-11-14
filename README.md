# dsh-hyper-mode · 增强创造模式

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）的**模式集 bundle**：一个包里聚合多个即插即用插件，装一次即可在会话里选到所有模式。

## 插件地图

| 插件 | 子路径 | 提供什么 |
|---|---|---|
| **hyper-creator**（增强创造模式） | `@chrock-studio/dsh-hyper-mode/hyper-creator` | Creator 能力 + 混合工具执行：既可直呼工具，也可把同一批工具当作 `run_code` 程序里的 SDK 绑定调用；动手前能列出步骤的多次调用优先走 `run_code` 编排 |
| `shared` | — | 跨插件共享纯代码，不挂载 |
| **hyper-teams**（空壳） | `@chrock-studio/dsh-hyper-mode/hyper-teams` | **独立组件**（顶层行，Host 作用域）：对所有会话生效，可在 Plugin Manager 单独启用/禁用。仅塞一个提示词标记，验收后可删 |
| **tool-catalog**（检视修复） | `@chrock-studio/dsh-hyper-mode/tool-catalog` | **独立组件**（顶层行，Host 作用域）：注册 `ToolCatalog` 检视 provider，返回模型真正收到的工具编目，补上 `Tool/listTools` 看不到的 `run_code` 传输 |

## 结构

```
dsh-hyper-mode/
├─ package.json          @chrock-studio/dsh-hyper-mode（dsh.bundle.patch → ./cordis.patch.yml）
├─ cordis.patch.yml      ← 聚合点：每条插件行 + 各 mode 的 preset 声明
├─ index.js              兜底入口：整包当作单插件挂载时等同 hyper-creator
├─ locale/               bundle 在插件管理器里的标题/描述（en + zh）
├─ plugins/
│  ├─ hyper-creator/     增强创造模式插件（执行器 + 路由策略 + skill + locale + 文档 + 测试）
│  │  └─ skills/         随插件发布、由预设加载的 skill
│  ├─ tool-catalog/      检视修复插件（Host 作用域：ToolCatalog provider）
│  └─ shared/            跨插件共享代码（shipped 解析器）
└─ docs/NOTES.md         建造笔记：设计取舍与四个坑
```

**聚合点是 `cordis.patch.yml`，不是 `index.js`**：DSH 按补丁里的行挂载插件，根目录导出它们并不会自动生效。

## 新增一个插件

1. 建 `plugins/<name>/`，写 `index.js`（导出 `apply` / `name` / `inject`，可选 `Config`）；
2. 在根 `package.json` 的 `exports` 加两条：`./<name>` 与 `./<name>/locale/*.json`；
3. 在 `cordis.patch.yml` 的相关 preset 里加一行 `name: '@chrock-studio/dsh-hyper-mode/<name>'`；
4. 重新启用 bundle（禁用→启用）即可，**不需要重启 DSH**：重载会比对已加载模块与磁盘、淘汰旧缓存再重新求值。只有与进程实例强绑定的实现（原生插件、进程级单例、改变链接目标目录）才需要重启。

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

`plugins/hyper-creator/skills/` 里的 skill 由本预设的 `skill-filesystem` 行通过 `customSkillDirs` 挂载，只出现在「增强创造模式」的会话里：

| skill | 用途 |
|---|---|
| `dsh-preset-authoring` | 新建或改造 agent 预设：放置决策、从基线派生、写声明、挂 skill 目录、验收 |
| `dsh-bundle-authoring` | bundle 的模块解析，以及「装上了但加载不了」的排查清单 |

新增一个 skill：建 `<目录>/<name>/SKILL.md`（frontmatter 必须有 `name` 与 `description`，`name` 用小写字母/数字/连字符）。**不需要改补丁**——`customSkillDirs` 指向整个目录，`skill-filesystem` 的 watcher 会发现新条目。只有改 `customSkillDirs` 这类行配置才需要重启 DSH（该行在 preset 里，属 `unmanaged-plugin`）。

## 许可

MIT © 2026 JuerGenie / Chrock Studio

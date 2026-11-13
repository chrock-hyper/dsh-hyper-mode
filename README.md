# dsh-hyper-mode · 增强创造模式

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）的**模式集 bundle**：一个包里聚合多个即插即用插件，装一次即可在会话里选到所有模式。

## 插件地图

| 插件 | 子路径 | 提供什么 |
|---|---|---|
| **hyper-creator**（增强创造模式） | `@chrock-studio/dsh-hyper-mode/hyper-creator` | Creator 能力 + 混合工具执行：既可直呼工具，也可把同一批工具当作 `run_code` 程序里的 SDK 绑定调用 |
| `shared` | — | 跨插件共享纯代码，不挂载 |
| **hyper-teams**（空壳） | `@chrock-studio/dsh-hyper-mode/hyper-teams` | 仅用于验证「一个 bundle 挂多个子路径插件」；只往提示词塞标记，验收后可删 |

## 结构

```
dsh-hyper-mode/
├─ package.json          @chrock-studio/dsh-hyper-mode（dsh.bundle.patch → ./cordis.patch.yml）
├─ cordis.patch.yml      ← 聚合点：每条插件行 + 各 mode 的 preset 声明
├─ index.js              兜底入口：整包当作单插件挂载时等同 hyper-creator
├─ plugins/
│  ├─ hyper-creator/     增强创造模式插件（执行器 + locale + 文档 + 测试）
│  └─ shared/            共享代码
├─ docs/NOTES.md         建造笔记：设计取舍与四个坑
└─ skills/               随包发布的可复用 skill
```

**聚合点是 `cordis.patch.yml`，不是 `index.js`**：DSH 按补丁里的行挂载插件，根目录导出它们并不会自动生效。

## 新增一个插件

1. 建 `plugins/<name>/`，写 `index.js`（导出 `apply` / `name` / `inject`，可选 `Config`）；
2. 在根 `package.json` 的 `exports` 加两条：`./<name>` 与 `./<name>/locale/*.json`；
3. 在 `cordis.patch.yml` 的相关 preset 里加一行 `name: '@chrock-studio/dsh-hyper-mode/<name>'`；
4. 重装 bundle 并**重启 DSH**（Node 按 URL 缓存 ES 模块，改代码不会热更新）。

## 安装

```bash
plugin_manager action=install_bundle target=<本仓库绝对路径>
```

装完新建会话，模式选「增强创造模式」。

回滚：`plugin_manager action=remove_bundle target=@chrock-studio/dsh-hyper-mode`

## 验证

```bash
cd plugins/hyper-creator && bun test    # 12 项：分组归并 / 接线 / apply / 失败可见性
```

端到端验收用例见 `plugins/hyper-creator/VERIFY.md`，建造过程见 `docs/NOTES.md`。

## 许可

MIT © 2026 JuerGenie / Chrock Studio

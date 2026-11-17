# dsh-hyper-mode

一个 DeepSeek Harness 的 bundle：**元包只做组合**，每个插件是独立可启停的真实包。

## 行与包

| 行 | 包 | 加什么 |
|---|---|---|
| `tool-catalog` | `@chrock-studio/dsh-tool-catalog` | Host 检视 provider，报告模型真正收到的工具编目 |
| `hyper-skills` | `@chrock-studio/dsh-hyper-skills` | `/hyper-skill` 命令：按需安装随包 skill |
| `hyper-roles` | `@chrock-studio/dsh-hyper-roles` | 岗位卡片、身份绑定、`role`/`role_spawn` 工具与「岗位」标签页 |
| `hyper-org` | `@chrock-studio/dsh-hyper-org` | 工单、在制上限、验收签字与「工单」看板 |
| `hyper-wiki` | `@chrock-studio/dsh-hyper-wiki` | 会话内 Wiki：作用域页面库、草稿流与「Wiki」标签页 |
| `hyper-creator` | `@chrock-studio/dsh-hyper-creator` | 增强创造模式的混合执行器（挂在 preset 里，随模式启停） |

前五行是 Host 作用域的独立组件；`hyper-creator` 是 preset 的一部分，随模式挂载。

停用某一行只影响它自己：`hyper-wiki` 关掉后「Wiki」标签页和 `wiki` 工具一起消失，
岗位面板与工单看板照常。元包自己没有 Host 代码、没有 Client 半边，只提供补丁、
bundle 级 locale/图标与 `workspace:*` 依赖。

## 依赖方向

`hyper-org` 依赖 `@chrock-studio/dsh-hyper-roles`：工单要按岗位派活、要显示接管人标题，
身份判定必须与岗位面板同一份实现。它通过 `@chrock-studio/dsh-hyper-roles/internal`
这个具名入口复用绑定投影、作用域解析与岗位库——不是直接 import 兄弟包的实现文件。

`hyper-roles` 必须先于 `hyper-org` 挂载，补丁里的行序就是这个约束。

`@chrock-studio/dsh-hyper-shared` 是纯代码库（不是 Loader 行）：DSH 状态目录定位、
项目根判定、路径安全与随包模块加载。所有插件通过它引用，不再各自复制。

## 配置

只有 `hyper-creator` 行带配置：`maxSubCallsPerMinute` 与 `maxParallelSubCalls`。
其余各行没有 `config`。改配置就改 `cordis.patch.yml` 里对应行的 `config`，
或者从 profile 自己的补丁层覆盖。

## 加一个插件

1. 复制 `packages/hyper-skills`（无 UI）或 `packages/hyper-roles`（有 UI）为 `packages/<name>`。
2. 改 `package.json` 的 `name`，以及 `src/`、`locale/`、`icon.svg`。
3. 在本包的 `dependencies` 加 `"@chrock-studio/dsh-<name>": "workspace:*"`。
4. 在 `cordis.patch.yml` 加一行：`name` 写裸包根，只有插件导出 `Config` 时才写 `config`。
5. 在仓库根跑 `pnpm install`（建立 workspace 链接）与 `pnpm test`。

## 限制

- Client 半边是**经典脚本**（`window.__ModuleLoader__.load`），无构建这一轮只能单文件；
  拆分随第二步的打包一起做。
- 面板不做乐观写入：阶段/规模的移动一律走 Host 的规则层，失败就把 Host 原文显示出来回来。

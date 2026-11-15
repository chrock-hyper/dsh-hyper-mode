# dsh-hyper-mode · 增强创造模式 + 岗位 + Wiki

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）的扩展 bundle：一个包里聚合即插即用插件，装一次即可用。

除了「增强创造模式」，它还在**会话里**加了两个标签页（与「对话」「轨迹」「统计」同一排）：

| 标签页 | 插件 | 提供什么 |
|---|---|---|
| 岗位 | `hyper-roles` | 可编辑的角色卡、会话级岗位绑定、按岗位委派；数据在 `~/.dsh/roles` 与 `<项目>/.dsh/roles` |
| Wiki | `hyper-wiki` | 约定优先的 Markdown 知识库、草稿审批、反链、每作用域 git 历史 |

两者不共享代码，只通过文件约定互操作（岗位的「岗位指导」引用 wiki 页面，培训员的报告写成 wiki 草稿）。

## 插件地图

| 插件 | 子路径 | 提供什么 |
|---|---|---|
| **hyper-creator**（增强创造模式） | `@chrock-studio/dsh-hyper-mode/hyper-creator` | Creator 能力 + 混合工具执行：既可直呼工具，也可把同一批工具当作 `run_code` 程序里的 SDK 绑定调用；动手前能列出步骤的多次调用优先走 `run_code` 编排 |
| `shared` | — | 跨插件共享纯代码，不挂载 |
| **hyper-teams**（空壳） | `@chrock-studio/dsh-hyper-mode/hyper-teams` | **独立组件**（顶层行，Host 作用域）：对所有会话生效，可在 Plugin Manager 单独启用/禁用。仅塞一个提示词标记，验收后可删 |
| **tool-catalog**（检视修复） | `@chrock-studio/dsh-hyper-mode/tool-catalog` | **独立组件**（顶层行，Host 作用域）：注册 `ToolCatalog` 检视 provider，返回模型真正收到的工具编目，补上 `Tool/listTools` 看不到的 `run_code` 传输 |
| **hyper-skills**（`/hyper-skill` 命令） | `@chrock-studio/dsh-hyper-mode/hyper-skills`（补丁行用相对路径 `./plugins/hyper-skills/index.js`） | **独立组件**（顶层行，Host 作用域）：注册 `/hyper-skill` 命令，按需把随包 skill 安装进扫描根；所有模式可用 |
| **hyper-roles**（岗位） | `@chrock-studio/dsh-hyper-mode/hyper-roles`（补丁行用相对路径 `./plugins/hyper-roles/index.js`） | 顶层行 + 会话级「岗位」标签页：可编辑角色卡、会话级绑定、`role` / `role_spawn` / `role_edit`；全局 `~/.dsh/roles`、项目 `<项目>/.dsh/roles` |
| **hyper-wiki**（Wiki） | `@chrock-studio/dsh-hyper-mode/hyper-wiki`（补丁行用相对路径 `./plugins/hyper-wiki/index.js`） | 顶层行 + 会话级「Wiki」标签页：约定优先的 Markdown 页面、镜像草稿与人工批准、反链、标题/标签检索、全局库自动 git 提交 |

## 结构

```
dsh-hyper-mode/
├─ package.json          @chrock-studio/dsh-hyper-mode（dsh.bundle.patch → ./cordis.patch.yml）
├─ cordis.patch.yml      ← 聚合点：每条插件行 + 各 mode 的 preset 声明
├─ index.js              兜底入口：整包当作单插件挂载时等同 hyper-creator
├─ locale/               bundle 在插件管理器里的标题/描述（en + zh）
├─ plugins/
│  ├─ hyper-creator/     增强创造模式插件（执行器 + 路由策略 + skill + locale + 文档 + 测试）
│  ├─ hyper-skills/      /hyper-skill 命令插件（按需安装随包 skill）
│  ├─ hyper-roles/       岗位标签页（角色卡 / 绑定 / 工具 / 面板）
│  │  └─ package.json    嵌套包：只声明岗位标签页的 dsh.client
│  ├─ hyper-wiki/        Wiki 标签页（页面 / 草稿 / 链接 / 检索 / git / 工具 / 面板）
│  │  └─ package.json    嵌套包：只声明 Wiki 标签页的 dsh.client
│  ├─ tool-catalog/      检视修复插件（ToolCatalog provider）
│  └─ shared/            跨插件共享代码（shipped 解析器、路径工具）
├─ scripts/              Host 冒烟检查：smoke-roles.mjs / smoke-wiki.mjs
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

装完新建会话，模式选「增强创造模式」：会话标题下方会多出「岗位」与「Wiki」两个标签页。它们都是会话级的——没有会话就不显示，项目作用域直接取当前会话的工作目录。

回滚：`plugin_manager action=remove_bundle target=@chrock-studio/dsh-hyper-mode`

## 岗位制编排（hyper-roles）

把「团队岗位」变成会话里可用的东西：一张可编辑的角色卡、一个 durable 的身份绑定、一个按岗位委派的工具，以及一个编辑面板。

### 数据在哪

| 作用域 | 位置 | 可见性 |
|---|---|---|
| 全局 | `${DSH_HOME:-~/.dsh}/roles/` | 所有会话 |
| 项目 | `<项目根>/.dsh/roles/` | 仅该项目；同名岗位覆盖全局 |
| 随包 | `plugins/hyper-roles/roles/` | 只读，可复制到任一作用域 |

每个岗位是三个文件：`<id>.md`（角色卡）、`<id>.notes.md`（经验，追加式）、`<id>.guide.md`（岗位指导）。写入都会追加一行到同目录的 `CHANGELOG.md`，归档进 `.archive/`，不删除。

### 预设岗位

随包带了五个岗位，复制到全局或项目即可用（`role` 面板的「随包岗位」列表里一键复制）：

| 岗位 | id | 在流程里做什么 | 交给谁 |
|---|---|---|---|
| 秘书 | `secretary` | 唯一对用户的接口：承接需求 → 派发 → 汇总 → 报进度、请决策 | 产品经理 / 架构师 / 原型设计师 |
| 产品经理 | `product-manager` | 需求澄清与拆解：需求简报 + 可验收的 Story 清单 | 秘书（→ 架构师 / 原型设计师） |
| 架构师 | `architect` | 落地方案：模块边界、数据流、接口契约、迁移与回滚 | 秘书（→ 原型设计师） |
| 原型设计师 | `prototype-designer` | 界面与可视产物：信息架构、主路径、状态矩阵、交互说明 | 秘书 |
| 培训员 | `trainer` | 用真实案例做岗位间的经验交换与沉淀 | 主代理 / wiki 草稿 |

默认链路（秘书按阶段推进，每个阶段都回到用户确认）：

```
用户 → 秘书 → 产品经理（需求简报 + 拆解）
                    ↓ 用户确认范围
              架构师（方案） ＋ 原型设计师（界面）
                    ↓
              秘书汇总 → 用户：结论 / 待决策 / 下一步
```

秘书不做专业判断，专家不直接对用户；这条边界写在每张卡里，也决定了两两之间的 `handoffs`。

### 角色卡

```markdown
---
id: reviewer
title: 代码评审员
version: 3
capabilities: 静态分析, 风险识别
skills: dsh-bundle-authoring
handoffs: implementer, architect
can: edit-roles
---
## 职责
（首段会被摘进子代理每一步看到的紧凑卡片）
## 工作方式
## 交互对象
## 完成标准
```

`version` 由保存动作维护，同时作为乐观锁：面板和工具都带 `expectedVersion`，读到旧版本会要求重读而不是覆盖。

### 岗位怎么绑定到一次会话

- `role_spawn` 把 `<!-- role:<id> -->` 写在子代理任务的第一行；
- 插件用 session projection 从会话日志里折叠出「这个会话的岗位」，所以 resume / fork / 重放都还在；
- 人手敲同一行也能给一个普通会话绑岗位。

绑定之后，每一步系统提示里都有一段紧凑的「你的岗位」（职责首段 / 能力 / 交接 / 经验条数），取的是磁盘上的最新卡片——改了岗位不用重开子代理。

### 三个工具

| 工具 | 用途 |
|---|---|
| `role` | `brief`（默认）读自己的卡；`list` 看目录；`read` 读指定岗位；`skill` 加载岗位声明的技能正文；`note` 记一条经验；`notes` 在全部岗位经验里按关键词找（借鉴别的岗位的做法）；`guide` 读/写岗位指导 |
| `role_spawn` | 按岗位委派：自动把岗位卡片写进子代理任务开头，并绑定岗位 |
| `role_edit` | `create` / `update` / `archive`。未绑定岗位的调用者，或带 `can: edit-roles` 的岗位才能写；写入带版本校验 |

### 面板

会话里的「岗位」标签页：作用域切换（本项目/全局）、岗位列表（标出覆盖全局）、字段与正文编辑、岗位指导、经验列表与追加、归档、复制岗位提示词、随包岗位复制。项目作用域来自当前会话，不需要选目录。

### 培训员

`plugins/hyper-roles/roles/trainer.md` 是随包岗位，`skills/role-training/SKILL.md` 是同一套 playbook 的 skill 版。它以**根会话**运行（默认委派深度为 1，子代理拉不起同级），流程是：定框架 → 并行 `role_spawn` → 三栏对照 → `send_message` 交叉回灌 → 各岗位写经验 → 报告落成 wiki 草稿。

### 可调项

没有导出 `Config`（链接安装的 bundle 无法静态 import schemastery），可调项在 `<DSH_HOME>/roles/config.json`，面板的配置接口也能改：

```json
{ "provider": "spawn", "maxRosterRoles": 20, "briefMaxChars": 6000,
  "selfSectionMaxChars": 1200, "rosterSection": true, "notesShown": 3 }
```

### 为什么面板的客户端是嵌套包

`dsh-client-modules` 对**同一个包出现多个活跃 Loader 来源**会直接报错。本 bundle 已有四行来自同一个包，所以面板的 `dsh.client` 必须挂在独立清单上：`plugins/hyper-roles/package.json`（包名 `@chrock-studio/dsh-hyper-roles`）。`locatePkgJson` 会从行模块向上取最近的 `package.json`，因此只有 `hyper-roles` 这一行认领它。

验收步骤见 `plugins/hyper-roles/VERIFY.md`。

## 会话内 Wiki（hyper-wiki）

一个**约定优先**的知识库：`<作用域>/wiki/` 下是普通 Markdown 页面，`<作用域>/wiki/drafts/` 下是镜像草稿，`<作用域>/wiki.md` 是写给任何 Agent 看的契约。插件只做三件事——校验约定、把草稿 diff 摆到人面前、把确认做成一次点击；插件坏掉或换编辑器，内容照样可读。

| 维度 | 行为 |
|---|---|
| 作用域 | 全局 `$DSH_HOME/wiki`、项目 `<项目根>/.dsh/wiki`，两库独立、同名互不影响 |
| 页面 | frontmatter `title` / `tags` / `status` / `updated`；相对路径即 id（支持中文目录） |
| 写入 | Agent 只写 `drafts/`（`draft:` 段记录状态、作者、基线哈希、打回理由）；批准、打回、删除、重命名是人 |
| 冲突 | 草稿基线哈希与当前页面不一致时阻止批准，需显式强制覆盖 |
| 链接 | 只支持相对 Markdown 链接；反链由插件扫描得出（不支持 `[[ ]]`） |
| 检索 | 零依赖，只匹配标题 / 标签 / 文件名，正文由 Agent 直接读 |
| 历史 | 仅全局库：首次使用时 `git init`，批准/删除/重命名后自动提交；项目库不碰 git |
| 面板 | 会话里的「Wiki」标签页：页面树 + 源码编辑 + 纯文本预览 + 反链 + 草稿 diff + 待审角标 |

工具只有一个 `wiki`，动作为 `list` / `search` / `read` / `draft` / `status` / `backlinks`，**没有批准权限**。完整说明见 `plugins/hyper-wiki/README.md`。

## 验证

```bash
bun test                                                     # 全部单元测试
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-roles.mjs   # 岗位：真实 Host 装配
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-wiki.mjs    # Wiki：真实 Host 装配
```

界面自查（不改 app、不点按钮）：`bun scripts/preview.mjs roles` / `bun scripts/preview.mjs wiki` 会把**真实组件**渲染成 `docs/demo/preview-*.html`，用无头 Chrome 截图即可看到 1200/1440 下的实际样子。它复刻了 `conversation.view` 的 flex 容器，所以布局塌缩这类问题会在这里暴露。

端到端验收用例见 `plugins/hyper-creator/VERIFY.md`、`plugins/hyper-roles/VERIFY.md`、`plugins/hyper-wiki/VERIFY.md`；建造过程与踩坑见 `docs/NOTES.md`。

## 随包发布的技能

`plugins/hyper-creator/skills/` 里的 skill 有两条到达路径：

| 路径 | 覆盖范围 | 生效方式 |
|---|---|---|
| **预设预挂**（`hyper-creator` 的 `skill-filesystem.customSkillDirs`） | 只在「增强创造模式」的会话 | 改这一行要**重启 DSH**（preset 行属 `unmanaged-plugin`） |
| **`/hyper-skill` 按需安装**（Host 行 `hyper-skills`） | 所有模式 | 命令把链接写进扫描根，下一步自动进编目，**不用重启** |

| skill | 来源 | 用途 |
|---|---|---|
| `dsh-preset-authoring` | hyper-creator | 新建或改造 agent 预设：放置决策、从基线派生、写声明、挂 skill 目录、验收 |
| `dsh-bundle-authoring` | hyper-creator | bundle 的模块解析，以及「装上了但加载不了」的排查清单 |
| `role-training` | hyper-roles | 组织一次岗位交叉培训：定框架、并行分析、交叉回灌、经验落袋、报告成文 |

`hyper-wiki` 还自带一个 skill：`wiki-draft-review`。它在插件加载时通过 `ctx.skills.register()` 注册为运行时技能（不走文件扫描根），只在装了 wiki 的组合里出现。

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

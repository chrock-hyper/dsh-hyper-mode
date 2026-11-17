# dsh-hyper-mode · 增强创造模式 + 岗位 + Wiki

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）的扩展 bundle：一个 pnpm monorepo，
**元包负责组合、每个插件一个真实包**，装一次即可用。为什么要拆成多包、而不是一个大包 +
若干子路径，见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

除了「增强创造模式」，它还在**会话里**加了三个标签页（与「对话」「轨迹」「统计」同一排）：

| 标签页 | 插件 | 提供什么 |
|---|---|---|
| 岗位 | `hyper-roles` | 可编辑的角色卡、会话级岗位绑定、按岗位委派；数据在 `~/.dsh/roles` 与 `<项目>/.dsh/roles` |
| Wiki | `hyper-wiki` | 约定优先的 Markdown 知识库、草稿审批、反链、每作用域 git 历史 |
| 工单 | `hyper-org` | 五列看板 + 固定检查器、建单 / 改阶段 / 签收；拖拽与 Agent 走同一条 `PATCH`，交付物在 DSH 右侧栏预览；数据仍是 `<项目>/.dsh/org` |

三个面板不共享代码，只通过文件约定互操作（岗位的「岗位指导」引用 wiki 页面，培训员的报告写成 wiki 草稿，工单的 DRI 引用岗位 id）。

## 插件地图

每个插件是一个独立包，行的 `name` 就是包根：

| 插件 | 包 | 提供什么 |
|---|---|---|
| **hyper-creator**（增强创造模式） | `@chrock-studio/dsh-hyper-creator` | Creator 能力 + 混合工具执行：既可直呼工具，也可把同一批工具当作 `run_code` 程序里的 SDK 绑定调用；动手前能列出步骤的多次调用优先走 `run_code` 编排 |
| **tool-catalog**（检视修复） | `@chrock-studio/dsh-tool-catalog` | **独立组件**（顶层行，Host 作用域）：注册 `ToolCatalog` 检视 provider，返回模型真正收到的工具编目，补上 `Tool/listTools` 看不到的 `run_code` 传输 |
| **hyper-skills**（`/hyper-skill` 命令） | `@chrock-studio/dsh-hyper-skills` | **独立组件**（顶层行，Host 作用域）：注册 `/hyper-skill` 命令，按需把随包 skill 安装进扫描根；所有模式可用 |
| **hyper-roles**（岗位） | `@chrock-studio/dsh-hyper-roles` | 顶层行 + 会话级「岗位」标签页：可编辑角色卡、会话级绑定、`role` / `role_spawn` / `role_edit`；全局 `~/.dsh/roles`、项目 `<项目>/.dsh/roles` |
| **hyper-org**（公司层） | `@chrock-studio/dsh-hyper-org` | 顶层行 + 会话级「工单」标签页：在岗位制之上加工单——`org_order`（建单 / 改单 / 签收）、`org_board`（看板）、在制上限与「M/L 无验收标准不能进 active」的门禁；数据在 `~/.dsh/org` 与 `<项目>/.dsh/org` |
| **hyper-wiki**（Wiki） | `@chrock-studio/dsh-hyper-wiki` | 顶层行 + 会话级「Wiki」标签页：约定优先的 Markdown 页面、镜像草稿与人工批准、反链、标题/标签检索、全局库自动 git 提交 |
| `shared` | `@chrock-studio/dsh-hyper-shared` | 跨插件共享纯代码，不挂载、不出现补丁里 |

行与包一一对应，所以每行在 Plugin Manager 里都有自己的标题、图标与详情，也能各自启停：
关掉 `hyper-wiki` 只消失 Wiki 标签页与 `wiki` 工具，岗位与工单照常。

## 结构

```
dsh-hyper-mode/                  pnpm workspace 根（private，无运行时代码）
├─ pnpm-workspace.yaml           packages/*
├─ packages/
│  ├─ bundle/                    元包 @chrock-studio/dsh-hyper-mode
│  │  ├─ package.json            dsh.bundle.patch + workspace:* 依赖，不声明 dsh.client
│  │  ├─ cordis.patch.yml        ← 聚合点：每条插件行 + 各 mode 的 preset 声明
│  │  ├─ locale/                 bundle 在插件管理器里的标题/描述（en + zh）
│  │  ├─ icon.svg                元包图标
│  │  └─ docs/DETAIL.md          元包详情页
│  ├─ hyper-creator/             增强创造模式（执行器 + 路由策略 + skill + 测试）
│  ├─ hyper-skills/              /hyper-skill 命令
│  ├─ hyper-roles/               岗位：角色卡 / 绑定 / 工具 / Client 半边 / roles 模板
│  ├─ hyper-org/                 公司层：工单 / 在制上限 / 验收签字（依赖 hyper-roles）
│  ├─ hyper-wiki/                Wiki：页面 / 草稿 / 链接 / 检索 / git / Client 半边
│  ├─ tool-catalog/              检视修复（ToolCatalog provider）
│  └─ shared/                    纯代码：DSH 状态目录、项目根、路径安全、随包模块加载
├─ scripts/                      Host 冒烟检查 + 面板静态预览
├─ examples/                     示例产物（不参与构建）
├─ docs/NOTES.md                 建造笔记：设计取舍与踩过的坑
├─ docs/HANDOFF.md               交接：现状、已完成的看板 UI 与剩余遗留
└─ AGENTS.md                     本工作区的三条硬规矩
```

每个插件的布局一致：

```
packages/<name>/
├─ package.json    exports: "."（行入口，指向 lib/）/ "./client"（有 UI 才有）/ locale / icon
├─ src/            index.ts（Host 入口）与按职责拆分的 .ts；有 UI 时含 client/*.tsx
├─ lib/            构建产物（gitignored）：index.js / client.js / *.d.ts
├─ locale/         en.json + zh.json（行级标题与描述）
├─ icon.svg        行级图标
└─ test/           bun test（client 测试加载 lib/client.js）
```

## 构建

源码是 TypeScript，**运行的是 `lib/` 里的构建产物**——改完源码必须构建，否则 DSH 加载的仍是旧文件。

```sh
pnpm build          # 全部包；或 bun scripts/build.ts <包名> 只建一个
pnpm typecheck      # tsc --noEmit（strict + noUncheckedIndexedAccess）
pnpm test           # 先 build，再跑全部包的 bun test
```

两半的产物形状不同，这是浏览器的约束不是风格选择：

| 半边 | 格式 | 消费方 | 产物 |
|---|---|---|---|
| Host | ESM | Node 直接 import | `lib/index.js` + `lib/index.d.ts` |
| Client | CJS，外面包 `window.__ModuleLoader__.load(...)` | 页面当脚本抓取执行 | 单个 `lib/client.js` |

Client 的**源码**可以拆成多个 `.tsx`（JSX 由 tsdown 编译），但**产物**必须是单个文件：浏览器模块表
是惰性 CJS 表，`factory(require)` 只认 `react` / `react/jsx-runtime` 这类基线，没有相对路径解析。
构建时 `react` 与 `react/jsx-runtime` 保持外部，其余全部内联。

`@deepseek-ai/*` 永远不进产物，也永远不做运行时探路径：每个插件在 `peerDependencies` +
`devDependencies` 里声明用到的包，构建时保持 external。装进 profile 后 resolver 把裸请求指到宿主副本；
本地 link 开发期解析到 workspace 里的 devDependency 副本。`@chrock-studio/dsh-hyper-shared` 相反——
它没有自己的构建，由各插件在打包时内联。

**聚合点是 `packages/bundle/cordis.patch.yml`，不是任何 `index.js`**：DSH 按补丁里的行挂载插件，
包根导出它们并不会自动生效。

## 新增一个插件

1. 建 `packages/<name>/src/index.js`，导出 `apply` / `name` / `inject`（可选 `Config`）；
2. 写 `packages/<name>/package.json`：`"exports"` 至少含 `"."`、`"./locale/*.json"`、`"./icon"`、
   `"./package.json"`；有 UI 时再加 `"./client"` 与 `dsh.client`；
3. 在 `packages/bundle/package.json` 的 `dependencies` 加 `"@chrock-studio/dsh-<name>": "workspace:*"`；
4. 在 `packages/bundle/cordis.patch.yml` 加一行，`name` 写**裸包根** `@chrock-studio/dsh-<name>`；
5. 回仓库根跑 `pnpm install`（建立 workspace 链接）与 `pnpm test`。

**不要再用相对路径行。** 以前为了绕开 Node 对 `exports` 的进程级缓存，行名写成
`./plugins/<name>/index.js`；代价是 `readPluginMeta` 认不出它，那一行在插件管理器里没有标题、
图标和详情，而且同一个包的多个行会让 client-modules 撞上「一个包只能有一个活跃 Client 来源」。
现在每个插件是真实包，行名用裸包根，三套身份同源。

新增行之后 Host 侧不需重启 DSH：重载会比对已加载模块与磁盘、淘汰旧缓存再重新求值。
**Preset 行例外**（`unmanaged-plugin`）：它被预设组合引用，重载返回 `restart-required`，要重启 DSH。

## 安装

```bash
plugin_manager action=install_bundle target=<本仓库>/packages/bundle
```

注意安装目标从仓库根变成了 **`packages/bundle`**：元包在那里。装完新建会话，模式选「增强创造模式」：
会话标题下方会多出「岗位」「Wiki」「工单」三个标签页。它们都是会话级的——没有会话就不显示，
项目作用域直接取当前会话的工作目录。

回滚：`plugin_manager action=remove_bundle target=@chrock-studio/dsh-hyper-mode`

## 岗位制编排（hyper-roles）

把「团队岗位」变成会话里可用的东西：一张可编辑的角色卡、一个 durable 的身份绑定、一个按岗位委派的工具，以及一个编辑面板。

### 数据在哪

| 作用域 | 位置 | 可见性 |
|---|---|---|
| 全局 | `${DSH_HOME:-~/.dsh}/roles/` | 所有会话 |
| 项目 | `<项目根>/.dsh/roles/` | 仅该项目；同名岗位覆盖全局 |
| 随包 | `packages/hyper-roles/roles/` | 只读模板；面板里显示「复制到本项目 / 全局」，是否复制由用户决定 |

每个岗位是三个文件：`<id>.md`（角色卡）、`<id>.notes.md`（经验，追加式）、`<id>.guide.md`（岗位指导）。写入都会追加一行到同目录的 `CHANGELOG.md`，归档进 `.archive/`，不删除。

### 预设岗位

随包带了七个岗位，**只存在于插件目录里**；面板的「随包岗位」列表会把它们列出来，复制到全局或项目之后才可编辑（复制是用户主动动作，不会自动落盘）：

| 岗位 | id | 在流程里做什么 | 交给谁 |
|---|---|---|---|
| 秘书 | `secretary` | 唯一对用户的接口：承接需求 → 派发 → 汇总 → 报进度、请决策 | 产品经理 / 架构师 / 原型设计师 |
| 产品经理 | `product-manager` | 需求澄清与拆解：需求简报 + 可验收的 Story 清单 | 秘书（→ 架构师 / 原型设计师） |
| 架构师 | `architect` | 落地方案：模块边界、数据流、接口契约、迁移与回滚 | 秘书（→ 原型设计师） |
| 原型设计师 | `prototype-designer` | 界面与可视产物：信息架构、主路径、状态矩阵、交互说明 | 秘书 |
| 工程师 | `engineer` | 把方案落成能跑的实现：读工单与验收标准、小步落盘、跑测试、写清怎么验 | 验收评审员 |
| 验收评审员 | `reviewer` | 只看标准与产物是否对得上，不看努力程度；结论只有「通过」或「打回 + 改哪一条」 | 主代理 |
| 培训员 | `trainer` | 用真实案例做岗位间的经验交换与沉淀 | 主代理 / wiki 草稿 |

默认链路（秘书按阶段推进，每个阶段都回到用户确认）：

```
用户 → 秘书 → 产品经理（需求简报 + 拆解）
                    ↓ 用户确认范围
              架构师（方案） ＋ 原型设计师（界面）
                    ↓
              工程师（实现）→ 验收评审员（签字）
                    ↓
              秘书汇总 → 用户：结论 / 待决策 / 下一步
```

秘书不做专业判断，专家不直接对用户；这条边界写在每张卡里，也决定了两两之间的 `handoffs`。

要改这些卡、或给团队加新岗位，先让 Agent 装上 `role-authoring` 技能（`/hyper-skill install role-authoring`）：它会按「五问 + 按缺口追问」的协议向你收集信息，再落成卡片。写卡的方法本身就是这套预置岗位的产出过程。

### 角色卡

```markdown
---
id: reviewer
title: 代码评审员
version: 3
model: opencode-go/deepseek-v4.1-flash
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

`model` 是这一行的**薪酬**：`role_spawn` 按它给子代理指定路由，写 `provider/model`（如 `opencode-go/deepseek-v4.1-flash`）或裸 `model`；省略则继承父代理的默认路由。它只影响委派，不影响这张卡在提示词里的渲染体积（只在 `role` 读卡与委派简报里各多一行）。可用的子代理路由由设置里的「子代理委派」决定，用 `list_subagent_models` 查；写了一个不存在的路由时，委派会在启动那一刻失败，而不是静默降级。

### 岗位怎么绑定到一次会话

- `role_spawn` 把 `<!-- role:<id> -->` 写在子代理任务的第一行；
- 插件用 session projection 从会话日志里折叠出「这个会话的岗位」，所以 resume / fork / 重放都还在；
- 人手敲同一行也能给一个普通会话绑岗位。

绑定之后，每一步系统提示里都有一段紧凑的「你的岗位」（职责首段 / 能力 / 交接 / 经验条数），取的是磁盘上的最新卡片——改了岗位不用重开子代理。

### 三个工具

| 工具 | 用途 |
|---|---|
| `role` | `brief`（默认）读自己的卡；`list` 看目录；`read` 读指定岗位；`skill` 加载岗位声明的技能正文；`note` 记一条经验；`notes` 在全部岗位经验里按关键词找（借鉴别的岗位的做法）；`guide` 读/写岗位指导 |
| `role_spawn` | 按岗位委派：自动把岗位卡片写进子代理任务开头，并绑定岗位；卡片带 `model` 时按该路由启动 |
| `role_edit` | `create` / `update` / `archive`。未绑定岗位的调用者，或带 `can: edit-roles` 的岗位才能写；写入带版本校验 |

### 面板

会话里的「岗位」标签页：作用域切换（本项目/全局）、岗位列表（标出覆盖全局）、字段与正文编辑、岗位指导、经验列表与追加、归档、复制岗位提示词、随包岗位复制。项目作用域来自当前会话，不需要选目录。

### 培训员

`packages/hyper-roles/roles/trainer.md` 是随包岗位，`skills/role-training/SKILL.md` 是同一套 playbook 的 skill 版。它以**根会话**运行（默认委派深度为 1，子代理拉不起同级），流程是：定框架 → 并行 `role_spawn` → 三栏对照 → `send_message` 交叉回灌 → 各岗位写经验 → 报告落成 wiki 草稿。

### 可调项

没有导出 `Config`（链接安装的 bundle 无法静态 import schemastery），可调项在 `<DSH_HOME>/roles/config.json`，面板的配置接口也能改：

```json
{ "provider": "spawn", "maxRosterRoles": 20, "briefMaxChars": 6000,
  "selfSectionMaxChars": 1200, "rosterSection": true, "notesShown": 3 }
```

### 为什么面板的客户端就挂在这个包上

`dsh-client-modules` 对**同一个包出现多个活跃 Loader 来源**会直接报错，而且一个包只能有一个
Client 入口。以前整个 bundle 是一个包、补丁行有四行指向它，所以面板只能挂到「嵌套伪包」上，
靠 `locatePkgJson` 从行模块向上找最近的 `package.json`。现在每个面板是独立包、独立行，
`dsh.client` 就写在自己的 `package.json` 里，一行一个 Client，不再需要伪包。

验收步骤见 `packages/hyper-roles/VERIFY.md`。

## 公司层（hyper-org）

岗位回答「谁是什么样的人」，工单回答「现在有什么活、归谁、怎么算完」。这一层把两者接起来，是**自用**的最小公司形态：扁平两层，没有中层，权力不是「能派活」，而是「能签收」。

**依赖是真的**：`hyper-org` 直接复用 hyper-roles 的身份绑定投影（同一个 projection key 由两家共享同一个单元，不重复折叠）、岗位库（DRI 必须是已存在的岗位）与作用域解析（一个项目只有一个根，工单不会和岗位分家）。

### 工单

`<作用域>/org/orders/<id>.json`，`<作用域>/org/CHANGELOG.md` 是审计线。id 形如 `wo-20261115-1`，按天递增。

阶段：`intake` 排队 → `active` 在制 → `review` 待验收 → `done` 已签收；另有 `blocked` 与 `dropped`。规模 `S` / `M` / `L`。

### 三条门禁

| 门禁 | 行为 | 为什么 |
|---|---|---|
| 在制上限 | 在制（active/review/blocked）达到 `wipLimit`（默认 2）后，新单**强制排队进 intake**，无论调用方要求什么阶段 | 不能排队就不能拒单，不能拒单的组织只会变慢 |
| 验收标准 | M/L 规模没有 `acceptance` 不能进 `active`，也不能被签收 | 判不了的活签不了字，签不了字的活只是多了几个字的对话 |
| 签收 | `done` 只能由 `org_order` 的 `action=sign` 产生；签收必须写 `note`；**领取人不能给自己签字** | 生产者与验收者同源时，验收会退化成自我确认 |

### 工具

| 工具 | 用途 |
|---|---|
| `org_order` | `create` / `read` / `update` / `sign`。`update` 只改阶段、领取人、验收标准与交付物；`done` 不在可选阶段里 |
| `org_board` | `status` 是决策用短摘要，`list` 是完整看板（含超龄天数与解析失败的文件） |

两个工具都只写工单，**不代替 `role_spawn`**：建单 → 看板确认在制 → `role_spawn` 派活 → 交付物挂回工单 → `review` → 别人签字。

### 面板（会话里的「工单」标签页）

**五列 Kanban + 右侧固定检查器**：intake / active / review / blocked / done，`done` 只能由签收进入、`dropped` 折叠成看板底部一条。顶部常驻「在制 x/wipLimit / 超龄 / 无验收」，卡片显示标题（两行截断，悬停看全文）、规模、DRI 岗位名、超龄、验收与交付物条数，以及「无验收 / 受阻 / 超龄」标记。检查器给六项——当前阶段、规模、DRI（岗位名 + id）、验收标准（空时警示）、交付物（路径 + 状态 + 「在 DSH 预览中打开」）、完整日志（最新在上，`pre-wrap`，>100 条折叠）；下面接签收 / 打回与改阶段 / DRI / 验收标准 / note / 保存。「新建工单」是弹层，被压回 intake 用信息条解释，不当错误。

- **规则只有一套**：面板的写操作与 `org_order` 走同一个 `lib/rules.js`（note 必填、领取人不能自签、DRI 必须存在），门禁仍由 `lib/store.js` 执行；面板不自己判断，只渲染 Host 下发的 `sign.blockers` 与 `create.notes`。
- **拖拽不是第二套移动逻辑**：拖卡片和检查器的阶段下拉都只发同一个 `PATCH /hyper-org/api/order/:id`，Host 侧与 `org_order action=update` 同一条 `updateWithRules → store.saveOrder`。客户端**不预判门禁**（不拦 M/L 无验收、在制满或 done），Host 的 409/400 原文进错误条、卡片原地不动（不做乐观移动），成功与失败后都重拉 `/state` 与 `/order`。拖进 `done` 照常发请求，由 Host 回 `done_forbidden`；拖进 `dropped` 先在弹层里补 `update` 本来就要求的 note，理由为空不发请求。键盘 / 无拖拽用户走检查器里同一个函数。
- **交付物复用 DSH 自己的预览**：面板不读文件内容，也没有 `/hyper-org/api/artifact`（路由已删）。`describeArtifact` 只回 `{ path, kind, absolutePath? }`；客户端用绝对路径构造 `dsh-resource://file/session/<sessionId>/<path>`（与官方 `sessionFileAddress` 同形：逐段编码、`%3A` 还原为 `:`、绝对路径保留前导 `/`），再调 `ctx.get('sidebarRight').openResource(address)` 在最右侧栏打开，Markdown / 代码 / 图片 / PDF / Office / HTML 全由 DSH 渲染。`sidebarRight` 惰性解析；服务缺失或没有绝对路径时按钮禁用并写明原因，不静默失败。
- **身份同源**：`actor` 取当前会话的岗位绑定（与工具同一个 projection）；未绑定即 `lead`。日志里的 `by` 是标签，自签判定只看真实岗位——手改文件把 DRI 写成 `lead` 不会误伤主代理。
- **建单受同一套门禁**：M/L 无验收标准落 intake，在制满时强制排队；降级是 200 + 解释，不是失败。
- **数据不动**：`schemaVersion` 仍为 1，`.dsh/org` 是唯一数据源，面板不建第二份存储、不改写老文件。
- **窄屏**：<1240px 时检查器可折叠（默认展开，按钮收起），看板横向滚动，不遮挡主操作。

路由前缀 `/hyper-org/api`（跟 `hyper-roles` 一致）；面板客户端挂在本包的 `dsh.client` 上，标签页 `order: 70` 排在岗位（50）、Wiki（60）右侧。

### 配置

没有导出 `Config`（链接安装的 bundle 无法静态 import schemastery），可调项在 `<DSH_HOME>/org/config.json`：

```json
{ "wipLimit": 2, "pulseRows": 3, "boardSection": true }
```

`boardSection` 控制主代理系统提示里那一段「在制工单」脉冲；绑定岗位的子代理看不到它，它们收到的是自己的岗位卡与任务。

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

工具只有一个 `wiki`，动作为 `list` / `search` / `read` / `draft` / `status` / `backlinks`，**没有批准权限**。完整说明见 `packages/hyper-wiki/README.md`。

## 验证

```bash
bun test                                                     # 全部单元测试
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-roles.mjs   # 岗位：真实 Host 装配
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-wiki.mjs    # Wiki：真实 Host 装配
```

界面自查（不改 app、不点按钮）：`bun scripts/preview.mjs roles` / `wiki` / `orders` 会把**真实组件**渲染成 `docs/demo/preview-*.html`，用无头 Chrome 截图即可看到 1200/1440 下的实际样子。它复刻了 `conversation.view` 的 flex 容器，所以布局塌缩这类问题会在这里暴露。`orders` 页另外挂了空态 / 错误 / 无项目根三个快照，用 `?panel=empty|error|noproject` 切换；交付物按钮带真实 `data-address`，点开时页面里的假 `sidebarRight` 会显示即将交给 DSH 的地址。

端到端验收用例见 `packages/hyper-creator/VERIFY.md`、`packages/hyper-roles/VERIFY.md`、`packages/hyper-wiki/VERIFY.md`；建造过程与踩坑见 `docs/NOTES.md`。

## 随包发布的技能

`packages/hyper-creator/skills/` 里的 skill 有两条到达路径：

| 路径 | 覆盖范围 | 生效方式 |
|---|---|---|
| **预设预挂**（`hyper-creator` 的 `skill-filesystem.customSkillDirs`） | 只在「增强创造模式」的会话 | 改这一行要**重启 DSH**（preset 行属 `unmanaged-plugin`） |
| **`/hyper-skill` 按需安装**（Host 行 `hyper-skills`） | 所有模式 | 命令把链接写进扫描根，下一步自动进编目，**不用重启** |

| skill | 来源 | 用途 |
|---|---|---|
| `dsh-preset-authoring` | hyper-creator | 新建或改造 agent 预设：放置决策、从基线派生、写声明、挂 skill 目录、验收 |
| `dsh-bundle-authoring` | hyper-creator | bundle 的模块解析，以及「装上了但加载不了」的排查清单 |
| `role-training` | hyper-roles | 组织一次岗位交叉培训：定框架、并行分析、交叉回灌、经验落袋、报告成文 |
| `role-authoring` | hyper-roles | 用一轮结构化提问把职责、边界、输入输出、决策权问清，再写成可执行的岗位卡并校验 |

`hyper-wiki` 还自带一个 skill：`wiki-draft-review`。它在插件加载时通过 `ctx.skills.register()` 注册为运行时技能（不走文件扫描根），只在装了 wiki 的组合里出现。

在任意会话里直接敲（人类命令，不进模型消息、不占 token）：

```text
/hyper-skill                                         # 列出可安装 / 已安装
/hyper-skill install                                 # 全量装到 ~/.dsh/skills
/hyper-skill install role-authoring                  # 只装一个
/hyper-skill install --all --project                 # 全量装进当前项目的 .dsh/skills
/hyper-skill install dsh-preset-authoring --project  # 装到 <项目根>/.dsh/skills
/hyper-skill remove dsh-preset-authoring             # 删掉本 bundle 的链接
```

「安装」= 把 `<packages>/<package>/skills/<skill>` 链接进一个扫描根。`skill-filesystem` 监听 `<项目根>/.dsh/skills`（rank 100）与 `~/.dsh/skills`（rank 400），加/删链接下一步就反映到编目；卸载 = 删链接。项目根 = 最近含 `.git` 的祖先目录；`--project` 需要能取到会话工作目录。

实测（2026-11-14）：把 `dsh-preset-authoring` 链接进 `./.dsh/skills/`，**下一步编目就出现了它**，`skill` 工具可加载；删除后消失，全程未重启。

> 重名无副作用：某模式已预挂同名 skill 时，项目根 rank 更高会胜出。`minimal` 预设没挂 `skill-filesystem`，在那里装什么都不会出现。

新增一个 skill：建 `<插件>/skills/<name>/SKILL.md`（frontmatter 必须有 `name` 与 `description`，`name` 用小写字母/数字/连字符）。**不需要改补丁**——命令每次执行都重新扫描目录，`skill-filesystem` 也会发现新条目。只有要让它成为某个预设的「预装」技能，才需要改 `customSkillDirs`（并重启）。

## DSH 创造任务的硬前置

`hyper-creator` 的系统提示里有一条前置：写或改 DSH 的 bundle、plugin、preset、tool、skill、MCP 连接之前，先通读 `dsh-doc`（随 DSH 发布，不在本 bundle 里），再读它指向的 references。这条不是风格建议——插件契约、加载器行为与授权边界都随版本变化，凭记忆写出的补丁会静默失败（见 `docs/NOTES.md` 的坑 1/2/5）。

## 许可

MIT © 2026 JuerGenie / Chrock Studio

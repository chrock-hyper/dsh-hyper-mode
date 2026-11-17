# 交接：Agent 公司（岗位 + 工单）

给下一个上下文用的现状快照。读完这份，加上 `README.md`，就能直接开工，不需要翻旧会话。

> **2026-11-17 布局变更（先读这段）**：仓库已重构成 pnpm monorepo，旧路径全部作废。
> - 元包（含 `cordis.patch.yml`）在 `packages/bundle/`；每个插件是 `packages/<name>/` 下的**真包**。
> - `plugins/<name>/index.js` → `packages/<name>/src/index.js`；
>   `plugins/<name>/lib/*.js` → `packages/<name>/src/*.ts`；
>   `plugins/<name>/client/client.js` → `packages/<name>/src/client/*.tsx`（已改为 JSX 多模块 + 构建产物 `lib/client.js`）。
> - 行的 `name` 现在是裸包根（`@chrock-studio/dsh-hyper-roles`），不再用相对路径或子路径；
>   面板的 `dsh.client` 就写在插件包自己的 `package.json` 上，嵌套伪包已删除。
> - 根 `index.js` 兜底与空壳 `hyper-teams` 已删除。安装目标改为 `packages/bundle`。
> - 为什么这么改见 [ARCHITECTURE.md](ARCHITECTURE.md)；日常约定见 `AGENTS.md`。
> 下文与旧路径相关的内容按上述映射理解。

## 现在是什么状态

仓库 `dsh-hyper-mode` 是 DSH 的 bundle（`cordis.patch.yml` 是聚合点，`index.js` 只是兜底）。本轮新增了以下提交：

| commit | 内容 |
|---|---|
| `a219a5d` | 岗位卡支持 `model` 路由，`role_spawn` 透传为 `agentOptions` |
| `e50966f` | 新增 `hyper-org`：工单 / 在制上限 / 验收签字 |
| `999ce9b` | 修复：验收标准只按换行切分（中文逗号曾被当分隔符） |
| `552e996` | 随包岗位增加 `engineer`、`reviewer`（现共 7 张） |
| `43f933c` | `examples/flying-chess`：第一单的产物与证据 |

`wo-20261115-2`（工单看板 v1）与 `wo-20261116-1`（v2：Kanban + DSH 预览）均已由 `reviewer` 签收，见下文「已完成」一节。

插件职责：

- `hyper-roles`：岗位卡、会话级身份绑定、`role` / `role_spawn` / `role_edit`、岗位面板；
- `hyper-org`：工单（`org_order`）、看板（`org_board`）、在制上限与验收门禁、会话级「工单」标签页；**代码级依赖 hyper-roles**（共享同一 projection key 的绑定单元、岗位库、作用域解析）；
- `hyper-wiki` / `hyper-skills` / `hyper-creator`：与本次无关，未改。

本地状态（gitignored）：

- `.dsh/roles/`：本项目作用域的岗位副本（7 张，可编辑）；
- `.dsh/org/orders/`：工单。三张单都已 `done`（wo-20261115-1 / wo-20261115-2 / wo-20261116-1），在制 0/2。

仓库**没有远端**，纯本地。

## 新上下文必须知道的四件事

1. **`.dsh/` 是运行状态，不是源码。** 岗位与工单都在这里；随包模板在 `packages/hyper-roles/roles/`。改模板要同时考虑项目副本是否覆盖。
2. **改完插件必须 bundle 重载**：`plugin_manager action=set_bundle enabled=false` 然后 `true`。以返回的 `application` 为准——`changed:false` 表示根本没重算，不算生效；`failed` 时诊断里才有真实原因（链接安装的模块 import 失败不报堆栈）。
3. **源码是 TS，运行的是构建产物。** `pnpm build` 之后 `lib/` 才是 DSH 加载的东西；`dsh.client` 指向 `./lib/client.js`。`dsh-client-modules` **不允许同一个包出现多个活跃 loader 来源**——所以一个带 UI 的组件必须独占一个包。现在每个面板本来就是独立包（`packages/hyper-roles`、`packages/hyper-org`、`packages/hyper-wiki`），这个约束自然满足。
4. **委派深度默认 1**：岗位子代理拉不起同级。跨岗位协作一律经主代理，`send_message` 只能在同一棵树内用。

## 已完成：工单看板 v2（wo-20261116-1）

用户确认的四个决定：**A 的列 + C 的固定检查器**；可拖拽，且拖拽与 Agent 流程完全一致；`done` 只读列、`dropped` 折叠成底部一条；交付物在最右侧 DSH 侧栏打开、复用 DSH 自带文档预览。本轮按此重写了面板并删掉了旧的交付物读取链路；规则与数据格式一行未改。实现已由 `reviewer` 签收；代码与本文档的更新见本轮提交。新界面先 demo 的流程约定已写入 `AGENTS.md`。

**v2 的交付物**

| 文件 | 内容 |
|---|---|
| `plugins/hyper-org/client/client.js` | 重写：五列看板 + 右侧固定检查器（六项 + 签收/打回 + 改阶段/明细 + 建单弹层）、拖拽、`sessionFileAddress` / `openInDsh` / `stageRequest` |
| `plugins/hyper-org/lib/artifacts.js` | 只剩 `artifactBase` + `describeArtifact`；file 带 `bytes` 与 `absolutePath`，dir 只带 `absolutePath`；删除 `readArtifactText` 与体积/二进制守卫 |
| `plugins/hyper-org/lib/api.js` | 删除 `GET /hyper-org/api/artifact`；`GET /order` 的 artifacts 带 `absolutePath` |
| `plugins/hyper-org/test/{artifacts,api,client}.test.js` | 按 v2 重写；`rules.test.js`、`org-flow.test.js` 未动 |
| `scripts/preview.mjs` | `orders` fixture 扩到五列 + 长日志 + 空/错误/无项目根四态；静态快照保留 `data-*`、select 选中项；假 `sidebarRight` mock |
| `README.md` / `docs/demo/orders-kanban-prototype.md` | v2 说明与用户确认四条 |
| `docs/demo/orders-kanban-prototype.html` / `.md` | 用户确认用的 A/B/C 交互 demo 与决定记录；原型，不参与运行时代码 |

**v2 的关键落点**

1. **拖拽与 Agent 完全同源**：拖拽、检查器的阶段下拉、撤单弹层都只经过 `stageRequest()` 生成同一个 `PATCH /hyper-org/api/order/:id`；Host 侧与 `org_order action=update` 同一条 `updateWithRules → store.saveOrder`。客户端不预判门禁（不拦 M/L 无验收、WIP 满或 done），409/400 原文进错误条、卡片原地不动（不做乐观移动），成功与失败后都重拉 `/state` 与 `/order`。拖进 `done` 照常发请求由 Host 拒绝；拖进 `dropped` 先在弹层补 note，理由为空不发请求。
2. **交付物不再读文件**：`describeArtifact` 只回 `{ path, kind, absolutePath?, bytes? }`（file 带 `bytes`，dir 只带 `absolutePath`）；客户端 `sessionFileAddress(sessionId, absolutePath)` 拼 `dsh-resource://file/session/<id>/<path>`（逐段 `encodeURIComponent`、`%3A` 还原 `:`、绝对路径保留前导 `/`，与官方 `@deepseek-ai/dsh-util-workspace-path` 同形），再 `ctx.get('sidebarRight').openResource(address)`。`sidebarRight` 惰性解析，缺失时按钮禁用并提示「当前界面没有 DSH 文档预览服务」。
3. **done / dropped**：`done` 列只读进入（卡片显示「已签收」，列脚「由 sign 产生」）；`dropped` 折叠在底部。
4. **窄屏**：<1240px 检查器可折叠（默认展开），看板横向滚动；1440 下五列 + 检查器同屏。

**沿用自 v1 的落点（仍然有效）**

1. 标签页 `order` 用 **70**：岗位 50、Wiki 60，不要撞号。
2. 路由前缀 `/hyper-org/api`（跟 `hyper-roles` 一致）；面板客户端在独立嵌套包 `plugins/hyper-org/package.json`（`@chrock-studio/dsh-hyper-org`）。
3. **规则只有一套**：面板写路径只能经 `rules.*WithRules`；身份拆成 `by`（日志标签）与 `role`（真实绑定），自签判定只看 `role`。
4. `lib/store.js` 一行未改；`schemaVersion` 仍为 1，`.dsh/org` 是唯一数据源。

**验证结论（engineer 已做）**

- `cd plugins/hyper-org && bun test` → **98 pass / 0 fail**；`test/org-flow.test.js` 与 `test/rules.test.js` 未修改；
- 全仓 `bun test` → **346 pass / 0 fail**；
- `bun -e "await import('./plugins/hyper-org/index.js')"` 可导入；
- `bun scripts/preview.mjs orders` → `docs/demo/preview-orders.html`；无头 Chrome 1440×900（五列 + 检查器同屏、长标题两行截断、长日志、交付物地址 `dsh-resource://file/session/session-preview//Users/…/docs/design/orders-tab.md`）、1200×900（看板横向滚动、检查器完整）、空 / 错误 / 无项目根三态截图自查通过；
- 截图在 `.dsh/verify/orders-v2-*.png`（gitignored，不入库）。

**v2 运行态（主代理已做）**

- bundle 重载 `enabled=false → true`，两次均 `changed:true, application:applied`；
- `Tool/listTools` 62 个，`org_order` / `org_board` 仍在；`conversation.view` 含 `orders(70)`；
- `GET /state` 200：重载后当时在制 1/2（v2 单 active），三张单都带 `driTitle`；`GET /order?id=wo-20261116-1` 200：artifacts 带 `absolutePath`；`GET /api/artifact` 404（路由已删）；
- 签收后本地状态 0/2。真实 GUI 的目视与真实 `sidebarRight` 点击未由自动化确认（页面有鉴权；以 `client.test`、静态 preview 与插槽证据为准）；真实指针拖拽未在 Electron 实测。

**残余风险**

1. 拖拽走 HTML5 DnD：Electron 内正常，Safari 的 `dataTransfer` 更保守（用 `dragId` 状态兜底）；没有触摸 / 移动端拖拽，窄屏以检查器下拉为兜底。
2. `sidebarRight` 只在 DSH 自带 Web GUI 里可用；换宿主时服务缺失，按钮会禁用并解释，不会退化成预览文本。
3. 面板写路径仍无乐观锁（v1 遗留）：人与 Agent 同时写同一单会丢一条日志。
4. `dropped` 的空字符串理由：面板只做按钮禁用（弹层不发空理由），`store.js` 现状仍允许空串。
5. 视觉自查是 `preview-orders.html` 的静态快照（含假 `sidebarRight`），不是运行中的 GUI；真机布局 / 主题与真实预览需主代理重载后目视确认。

## 关键文件地图

（路径已按 2026-11-17 的 monorepo + 拆分更新）

| 关心什么 | 看哪里 |
|---|---|
| 三件套工具与权限 | `packages/hyper-roles/src/tools/`（`role.js` / `role-spawn.js` / `role-edit.js`，门面 `tools.js`） |
| 提示词渲染（岗位卡 / 花名册 / brief） | `packages/hyper-roles/src/marker.js`、`src/index.js` |
| 面板与标签页注册 | `packages/hyper-roles/src/client/index.tsx` |
| 岗位库与作用域 | `packages/hyper-roles/src/store/`（`list.js` / `cards.js` / `builtins.js` …） |
| 跨包契约（给 hyper-org 用） | `packages/hyper-roles/src/internal.js` |
| 工单存储与三条门禁 | `packages/hyper-org/src/store.js` |
| 工单语法 | `packages/hyper-org/src/order-doc.js` |
| 工单工具 | `packages/hyper-org/src/tools.js` |
| 规则（note / 自签 / DRI / 解释 / 分类） | `packages/hyper-org/src/rules.js` |
| 面板路由与错误映射 | `packages/hyper-org/src/api/routes.js`（门面 `api.js`） |
| 交付物状态与 `absolutePath`（DSH 预览地址的来源） | `packages/hyper-org/src/artifacts.js` |
| 工单面板（标签页） | `packages/hyper-org/src/client/index.tsx`、`packages/hyper-org/package.json` |
| Wiki 存储 / 工具 / 路由 | `packages/hyper-wiki/src/store/`、`tools/`、`api/`（各自保留门面） |
| 行与包的组合 | `packages/bundle/cordis.patch.yml`、`packages/bundle/package.json` |
| 第一单产物 | `examples/flying-chess/`（含 `order.json` 快照） |

## 已知遗留

- 工单面板已落地（见上）。仍未做：乐观锁 / `expectedRevision`（并发写可能丢一条日志）、`PATCH` 时的在制上限（现状只在建单时生效）、撤单理由的空字符串校验（`store.js` 现状允许空串，面板只做按钮禁用）。
- 「跳格/飞行」规则按裁决未做，单局平均约 370 步、15 分钟以上；要给人玩需要单开一单。
- 评审记录的残余风险：未做 Safari / Firefox 实测；运行时 DPR 变化依赖 `resize` 事件触发重建。
- `~/.dsh/settings.yaml.imported`、`~/.dsh/pet.json` 未确认是否可删，一直没动。
- 子代理路由目前只授权了 `opencode-go/deepseek-v4.1-flash` 一个模型，`model` 字段已就位但无法体现成本差异。

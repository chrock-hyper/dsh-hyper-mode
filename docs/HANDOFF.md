# 交接：Agent 公司（岗位 + 工单）

给下一个上下文用的现状快照。读完这份，加上 `README.md`，就能直接开工，不需要翻旧会话。

## 现在是什么状态

仓库 `dsh-hyper-mode` 是 DSH 的 bundle（`cordis.patch.yml` 是聚合点，`index.js` 只是兜底）。本轮新增了以下提交：

| commit | 内容 |
|---|---|
| `a219a5d` | 岗位卡支持 `model` 路由，`role_spawn` 透传为 `agentOptions` |
| `e50966f` | 新增 `hyper-org`：工单 / 在制上限 / 验收签字 |
| `999ce9b` | 修复：验收标准只按换行切分（中文逗号曾被当分隔符） |
| `552e996` | 随包岗位增加 `engineer`、`reviewer`（现共 7 张） |
| `43f933c` | `examples/flying-chess`：第一单的产物与证据 |

`wo-20261115-2`（工单看板）已由 `reviewer` 签收，实现见下文「已完成」一节；代码提交在本轮的 `feat(org)` 里。

插件职责：

- `hyper-roles`：岗位卡、会话级身份绑定、`role` / `role_spawn` / `role_edit`、岗位面板；
- `hyper-org`：工单（`org_order`）、看板（`org_board`）、在制上限与验收门禁、会话级「工单」标签页；**代码级依赖 hyper-roles**（共享同一 projection key 的绑定单元、岗位库、作用域解析）；
- `hyper-wiki` / `hyper-skills` / `hyper-creator`：与本次无关，未改。

本地状态（gitignored）：

- `.dsh/roles/`：本项目作用域的岗位副本（7 张，可编辑）；
- `.dsh/org/orders/`：工单。当前 `wo-20261115-1` 已 `done`，`wo-20261115-2` 在 `active`（在制 1/2）。

仓库**没有远端**，纯本地。

## 新上下文必须知道的四件事

1. **`.dsh/` 是运行状态，不是源码。** 岗位与工单都在这里；随包模板在 `plugins/hyper-roles/roles/`。改模板要同时考虑项目副本是否覆盖。
2. **改完插件必须 bundle 重载**：`plugin_manager action=set_bundle enabled=false` 然后 `true`。以返回的 `application` 为准——`changed:false` 表示根本没重算，不算生效；`failed` 时诊断里才有真实原因（链接安装的模块 import 失败不报堆栈）。
3. **面板客户端是源码直供**（`dsh.client` 指向 `./client/client.js`），不需要构建，改完刷新页面。但 `dsh-client-modules` **不允许同一个包出现多个活跃 loader 来源**——所以面板必须放**独立的嵌套包**（`hyper-roles` 与 `hyper-wiki` 都是这么做的），不能塞进根包的 `dsh.client`。
4. **委派深度默认 1**：岗位子代理拉不起同级。跨岗位协作一律经主代理，`send_message` 只能在同一棵树内用。

## 已完成：工单看板 UI（wo-20261115-2）

实现已落在工作区，等 review 签字后提交。会话里多了「工单」标签页，与「岗位」「Wiki」同排，因此验收标准里的六条都有对应落点。

**交付物**

| 文件 | 内容 |
|---|---|
| `plugins/hyper-org/lib/rules.js`（新） | 解析器、四类签收 blocker、DRI 校验、建单降级解释、错误分类，以及三个 `*WithRules` 组合函数——工具与面板唯一的规则入口 |
| `plugins/hyper-org/lib/artifacts.js`（新） | 交付物预览：五道防护（形态 / 声明 / 词法包含 / 符号链接包含 / 类型与体积）+ 二进制嗅探 |
| `plugins/hyper-org/lib/api.js`（新） | `/hyper-org/api`：`state`、`order`（GET / POST / PATCH）、`order/:id/sign`、`artifact`；读走 store，写只走 `rules.*WithRules` |
| `plugins/hyper-org/index.js` | `ctx.inject(['webServer'])` 挂载路由；session → cwd / 真实岗位的解析 |
| `plugins/hyper-org/lib/tools.js` | 改调 `rules.*`，对外文案逐字不变；`splitLines`/`splitList` 从 `rules.js` 再导出 |
| `plugins/hyper-org/lib/marker.js` | `ageOf` 加 `export`（唯一改动，无行为变化） |
| `plugins/hyper-org/package.json`（新） | 嵌套包 `@chrock-studio/dsh-hyper-org`，`dsh.client` 指向 `./client/client.js` |
| `plugins/hyper-org/client/client.js`（新） | 三栏看板：分组列表 / 六项详情 + 文本预览 / 签收与改阶段；只做 fetch 与渲染 |
| 根 `package.json` | `exports["./hyper-org/client"]` |
| `scripts/preview.mjs` | 支持 `orders` fixture；顺带用面板自己的字典渲染文案（之前三个预览都显示 locale key） |
| `plugins/hyper-org/test/{rules,api,artifacts,client}.test.js`（新） | 规则、HTTP 门禁矩阵、预览防护、客户端注册与一次真实 mount |

**已核实的落点（与这份交接稿的偏差，以实现文档为准）**

1. 标签页 `order` 用 **70**，不是 60：岗位 50、Wiki 60，60 会撞号，「与岗位、Wiki 同排」会变成「插在两者之间」。
2. 路由前缀 `/hyper-org/api`（跟 `hyper-roles` 一致；`hyper-wiki` 用的是 `/wiki`，两个插件本就不统一）。

**规则复用怎么落的**

- `lib/store.js` 一行未改：阶段 / 验收 / 在制上限仍是唯一执行点；
- 「note 必填」「领取人不能自签」「DRI 必须存在」原来只在 `lib/tools.js`，现在下沉到 `lib/rules.js`，工具与 API 都只调它；
- 身份拆成两个值：`by` 是日志标签（未绑定为 `lead`），`role` 是真实绑定（可为 `undefined`）。**自签判定只看 `role`**——否则手改文件把 `dri` 写成 `lead` 会误判主代理自签，这正是方案 §3 否掉 store 级校验的理由；
- `lib/api.js` 不 import store 的 `createOrder/saveOrder/signOrder`，写路径只能经 `*WithRules`；
- 面板自身不做门禁判断：只渲染 Host 下发的 `sign.blockers` 与 `create.notes`，按钮禁用只是 UX。

**验证结论（engineer 已做）**

- `cd plugins/hyper-org && bun test` → **102 pass / 0 fail**，`test/org-flow.test.js` 一行未改；
- 全仓 `bun test` → **350 pass / 0 fail**；
- `bun -e "await import('./plugins/hyper-org/index.js')"` 可导入；
- `bun scripts/preview.mjs orders` → `docs/demo/preview-orders.html`；无头 Chrome 1440×900 与 1200×900 自查通过：三栏不塌、<1240px 时右栏落到第二行、中文标签不溢出、标签顺序在 Wiki 右侧；
- 数据格式未动：`schemaVersion` 仍为 1，`.dsh/org` 仍是唯一数据源，老工单文件无需迁移；
- 截图在 `.dsh/verify/`（gitignored，不入库）。

**运行态验证（主代理已做，2026-11-16 01:18）**

1. bundle 重载：`enabled=false` → `true`，两次都返回 `changed:true, application:applied`；
2. `Tool/listTools` 共 62 个工具，`org_order`、`org_board` 仍在（新 import 没把行搞成 `never started`）；
3. `GET /hyper-org/api/state?session=$DSH_SESSION_ID` → 200：`projectRoot` 解析为仓库根、`occupied:1`、`wipLimit:2`、两张单带 `driTitle:"工程师"`、`age`、`scope`；`GET /hyper-org/api/order?id=wo-20261115-2&session=…` → 200：六项齐全、完整日志 1 条、`sign.blockers` 只有 `not_review`（identity 解析为 `lead`，未绑定岗位）；
4. `conversation.view` 插槽已有 `orders(70)`，与 `roles(50)`、`wiki(60)` 同排；连接中的页面已自动加载新模块，无需手动刷新（真实 GUI 的目视确认仍由用户完成，布局证据见 `.dsh/verify/orders-*.png`）；
5. 写路径（建单降级、M/L 验收门禁、note 必填、自签拒绝、409/403 映射）由 `plugins/hyper-org/test/api.test.js` 在临时目录逐条覆盖；运行态**没有**建/签任何真实工单，`.dsh/org` 只有两张既有单。

## 关键文件地图

| 关心什么 | 看哪里 |
|---|---|
| 三件套工具与权限 | `plugins/hyper-roles/lib/tools.js` |
| 提示词渲染（岗位卡 / 花名册 / brief） | `plugins/hyper-roles/lib/marker.js`、`index.js` |
| 面板与标签页注册 | `plugins/hyper-roles/client/client.js` |
| 工单存储与三条门禁 | `plugins/hyper-org/lib/store.js` |
| 工单语法 | `plugins/hyper-org/lib/order-doc.js` |
| 工单工具 | `plugins/hyper-org/lib/tools.js` |
| 规则（note / 自签 / DRI / 解释 / 分类） | `plugins/hyper-org/lib/rules.js` |
| 面板路由与错误映射 | `plugins/hyper-org/lib/api.js` |
| 交付物预览的五道防护 | `plugins/hyper-org/lib/artifacts.js` |
| 工单面板（标签页） | `plugins/hyper-org/client/client.js`、`plugins/hyper-org/package.json` |
| 第一单产物 | `examples/flying-chess/`（含 `order.json` 快照） |

## 已知遗留

- 工单面板已落地（见上）。仍未做：乐观锁 / `expectedRevision`（并发写可能丢一条日志）、`PATCH` 时的在制上限（现状只在建单时生效）、撤单理由的空字符串校验（`store.js` 现状允许空串，面板只做按钮禁用）。
- 「跳格/飞行」规则按裁决未做，单局平均约 370 步、15 分钟以上；要给人玩需要单开一单。
- 评审记录的残余风险：未做 Safari / Firefox 实测；运行时 DPR 变化依赖 `resize` 事件触发重建。
- `~/.dsh/settings.yaml.imported`、`~/.dsh/pet.json` 未确认是否可删，一直没动。
- 子代理路由目前只授权了 `opencode-go/deepseek-v4.1-flash` 一个模型，`model` 字段已就位但无法体现成本差异。

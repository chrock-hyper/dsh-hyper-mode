# 工单看板改版 · 确认用 demo

- 工单：`wo-20261116-1`「工单看板改版：Kanban 布局 + 复用 DSH 文档预览（demo 先行）」
- 文件：[orders-kanban-prototype.html](./orders-kanban-prototype.html)（单文件，双击可开，无外部资源）
- 状态：**等用户确认后才改插件实现**；本 demo 不碰 `plugins/**`、`.dsh/org` 与任何运行状态。

## 要回答的问题

1. 工单看板用哪种结构？看板密度、在制可视化、详情放在哪，哪一版最顺手？
2. 交付物点开时，是否就按「在最右侧 DSH 文档预览里打开」来做？面板不再自绘文本预览。
3. 改阶段用拖拽、卡片菜单，还是两者都要？`done` / `dropped` 怎么展示？

## 怎么打开

```bash
open docs/demo/orders-kanban-prototype.html          # 正常态，A 方案
open 'docs/demo/orders-kanban-prototype.html?variant=B'
open 'docs/demo/orders-kanban-prototype.html?variant=C'
```

- `?variant=A|B|C`：切换三个结构不同的方案；底部浮动条与键盘 `←` / `→` 也能切。
- `?demo=normal|empty|loading|error|noproject`：直接看空态 / 加载 / 错误 / 无项目根。
- `?theme=light|dark`：亮/暗主题。

## 三个方案

| 方案 | 结构 | 适合什么 | 代价 |
|---|---|---|---|
| **A · Columns** | 五个阶段列（intake / active / review / blocked / done）铺满宽度，卡片网格；详情从右侧抽屉滑出 | 一眼扫完阶段流转与在制占用，最接近经典 Kanban | 抽屉打开时遮住最右列；列多时每列偏窄 |
| **B · Lanes** | 五个阶段横向泳道，卡片在道内横向排列；详情用底部 inspector | 每阶段卡片多、屏幕宽时更舒展；阶段像「队列」 | 纵向滚动多；跨阶段横向对比不如列直观 |
| **C · Stage rail** | 左侧竖向阶段轨（数量 + 在制仪表），中间只显示选中阶段的卡片，右侧固定详情检查器 | 窄屏、单阶段卡片很多、想给详情稳定位置 | 一次只看一个阶段，失去全盘一眼可见 |

共同点：顶部「在制 x/wipLimit / 超龄 / 无验收」常驻；卡片带标题、规模、DRI 岗位名、超龄、验收/交付物数量；`done` 只读、`dropped` 折叠成底部一条。

## 哪些是真实能力，哪些是示意

**按真实实现的字段与规则画的：**

- 数据形状来自 `plugins/hyper-org/lib/api.js`：`state.orders` 的行字段、`order` 详情的六项、`sign.blockers`、`create.notes`。
- 门禁行为照 `lib/rules.js` / `lib/store.js`：M/L 无验收不能进 active；在制满落 intake；签收要 note；领取人不能给自己签；`done` 只能由签收产生；撤单要理由。
- 会话外壳、标签栏（岗位 50 / Wiki 60 / 工单 70）、亮暗配色沿用上一版面板与 `conversation.view` 的样式令牌。
- 两张真实工单：`wo-20261115-1`（done）、`wo-20261115-2`（done），以及本单 `wo-20261116-1`（active）。

**demo 里的示意：**

- 数据是页面内静态 mock，不连 Host；刷新后回到初始状态。
- 最右侧的 DSH 文档预览是**视觉 mock**（标题栏、渲染器选择、换行/重载、Markdown 内容），不读真实文件。
- 真实实现会这样打开：客户端 `ctx.get('sidebarRight').openResource(address)`，`address` 由 `sessionFileAddress(sessionId, absolutePath)` 构造，形如
  `dsh-resource://file/session/<sessionId>//Users/…/docs/design/orders-tab.md`；
  DSH 右侧栏自己渲染 Markdown / 代码 / 图片 / PDF / Office / HTML。面板不再自绘预览，也不保留自定义文件读取路由（现有 `/hyper-org/api/artifact` 会删除）。
- demo 在制上限设为 **5**（真实 `config.json` 是 2），让「满员降级 intake」在演示里可达。
- 拖拽、签收、建单只改 demo 内存状态，不会写 `.dsh/org`。

## 已经验过的

- 无头 Chrome 1440×900：A/B/C 均渲染，控制台无错误；A = 5 列 / 9 张卡，B = 5 条泳道，C = 6 个阶段轨（含 dropped）/ 默认阶段 2 张卡 + 检查器。
- A 主路径：点 review 卡片 → 详情抽屉出现，含验收标准 / 完整日志 / 4 个「在 DSH 预览中打开」；点第一行交付物 → 右侧栏 mock 打开，显示真实 `dsh-resource://file/session/…` 地址与 `sidebarRight.openResource` 标注。
- 1200×900、空态 / 加载 / 错误态截图均生成（`.dsh/verify/kanban-*.png`，gitignored）。
- 页面无外部字体 / CDN / 网络请求。

## 需要你拍板

1. **选哪个方案，或者怎么混？**（例如「A 的列 + C 的固定检查器」「B 的泳道 + A 的抽屉」都可以）
2. **改阶段用拖拽吗？** A/B 里可以拖；C 用卡片菜单。最终面板要拖拽 / 菜单 / 两者都要？
3. **`done` 与 `dropped` 怎么摆？** `done` 作为只读列（只能 sign 进入）、`dropped` 折叠成底部一条，是否接受？
4. 交付物预览默认开在**最右侧 DSH 侧栏**；要不要再给一个「浮动预览」入口（`openResourceIn(..., { destination: 'float' })`）？

确认后我会派工程师按选定方案实现，并保持「规则一套、数据格式不动」的约束。

## 用户确认（2026-11-16）

1. **布局 = A 的列 + C 的固定检查器**：五个阶段列（intake / active / review / blocked / done）铺开，右侧常驻详情检查器，不再是 A 的抽屉。
2. **可拖拽，但拖拽与 Agent 流程完全一致**：拖拽只是 `PATCH /order/:id`（stage）的快捷方式，与 `org_order action=update` 走同一个 `updateWithRules → store.saveOrder`；不为人工操作额外处理，客户端不预判门禁。
3. **done 只读列、dropped 折叠成底部一条**：`done` 只能由签收进入；`dropped` 不消失，收在看板底部的折叠区。
4. **交付物在最右侧 DSH 侧栏打开**：复用 DSH 自带文档预览（`ctx.get('sidebarRight').openResource(sessionFileAddress(...))`），面板不再自绘文本预览、不再保留自定义文件读取路由。

以上四条已按 `wo-20261116-1` 落到 `plugins/hyper-org/**`；本 demo HTML 保持确认时的样子，不再改动。

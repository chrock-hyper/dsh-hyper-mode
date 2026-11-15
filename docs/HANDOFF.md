# 交接：Agent 公司（岗位 + 工单）

给下一个上下文用的现状快照。读完这份，加上 `README.md`，就能直接开工，不需要翻旧会话。

## 现在是什么状态

仓库 `dsh-hyper-mode` 是 DSH 的 bundle（`cordis.patch.yml` 是聚合点，`index.js` 只是兜底）。本轮新增了三个提交：

| commit | 内容 |
|---|---|
| `a219a5d` | 岗位卡支持 `model` 路由，`role_spawn` 透传为 `agentOptions` |
| `e50966f` | 新增 `hyper-org`：工单 / 在制上限 / 验收签字 |
| `999ce9b` | 修复：验收标准只按换行切分（中文逗号曾被当分隔符） |
| `552e996` | 随包岗位增加 `engineer`、`reviewer`（现共 7 张） |
| `43f933c` | `examples/flying-chess`：第一单的产物与证据 |

插件职责：

- `hyper-roles`：岗位卡、会话级身份绑定、`role` / `role_spawn` / `role_edit`、岗位面板；
- `hyper-org`：工单（`org_order`）、看板（`org_board`）、在制上限与验收门禁；**代码级依赖 hyper-roles**（共享同一 projection key 的绑定单元、岗位库、作用域解析）；
- `hyper-wiki` / `hyper-skills` / `hyper-creator`：与本次无关，未改。

本地状态（gitignored）：

- `.dsh/roles/`：本项目作用域的岗位副本（7 张，可编辑）；
- `.dsh/org/orders/`：工单。当前 `wo-20261115-1` 已 `done`，在制 0/2。

仓库**没有远端**，纯本地。

## 新上下文必须知道的四件事

1. **`.dsh/` 是运行状态，不是源码。** 岗位与工单都在这里；随包模板在 `plugins/hyper-roles/roles/`。改模板要同时考虑项目副本是否覆盖。
2. **改完插件必须 bundle 重载**：`plugin_manager action=set_bundle enabled=false` 然后 `true`。以返回的 `application` 为准——`changed:false` 表示根本没重算，不算生效；`failed` 时诊断里才有真实原因（链接安装的模块 import 失败不报堆栈）。
3. **面板客户端是源码直供**（`dsh.client` 指向 `./client/client.js`），不需要构建，改完刷新页面。但 `dsh-client-modules` **不允许同一个包出现多个活跃 loader 来源**——所以面板必须放**独立的嵌套包**（`hyper-roles` 与 `hyper-wiki` 都是这么做的），不能塞进根包的 `dsh.client`。
4. **委派深度默认 1**：岗位子代理拉不起同级。跨岗位协作一律经主代理，`send_message` 只能在同一棵树内用。

## 下一个工单（待提交）：工单看板 UI

用户已明确要做。规格建议如下，可直接作为 `org_order` create 的内容。

**标题**：工单看板：会话内「工单」标签页

**规模**：M（三岗：architect → engineer → reviewer）

**建议验收标准**（一行一条，别用逗号分隔——那是踩过的坑）：

```
会话内出现「工单」标签页，与「岗位」「Wiki」同排；没有会话时不显示
看板按阶段分组：intake / active / review / blocked / done，显示在制 x/wipLimit、超龄时长、领取人岗位名
点开一张单能看到六项：验收标准、完整日志、交付物路径（可点开）、规模、DRI、当前阶段
面板可建单（标题 / 规模 / DRI / 验收标准），且受同一套门禁约束：M/L 无验收标准不能进 active、在制满时落 intake
签收必须写 note，且领取人不能给自己签；面板与 org_order 用同一套规则，不是两套
不改变数据格式：`.dsh/org` 仍是唯一数据源，老工单文件不用迁移
```

**技术落点**（已核实，可直接照走）：

- Host 半边加 HTTP 前缀：仿 `plugins/hyper-roles/lib/api.js` 的 `webServer.register({kind:'prefix', path:'/hyper-org/api', handler})`，在 `plugins/hyper-org/index.js` 里 `ctx.inject(['webServer'], …)`；
- Client 半边注册标签页，照 `plugins/hyper-roles/client/client.js` 末尾：

  ```js
  return {
    inject: ['slots', 'locale'],
    apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), '…')
      t = ctx.locale.bind(NS)
      ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view', id: 'orders', order: 60, locale: NS, label: () => t('tab'),
      }, OrdersTab))
    },
  }
  ```

- 新建 `plugins/hyper-org/package.json`（包名 `@chrock-studio/dsh-hyper-org`，`exports['./client']`，`dsh.client`），并在根 `package.json` 的 `exports` 加 `./hyper-org/client`；
- 别改 `lib/store.js` 的门禁逻辑——面板要复用同一套函数，避免规则分叉。

**明确不做**：拖拽改阶段、在面板里编辑岗位卡、多项目聚合视图。

## 关键文件地图

| 关心什么 | 看哪里 |
|---|---|
| 三件套工具与权限 | `plugins/hyper-roles/lib/tools.js` |
| 提示词渲染（岗位卡 / 花名册 / brief） | `plugins/hyper-roles/lib/marker.js`、`index.js` |
| 面板与标签页注册 | `plugins/hyper-roles/client/client.js` |
| 工单存储与三条门禁 | `plugins/hyper-org/lib/store.js` |
| 工单语法 | `plugins/hyper-org/lib/order-doc.js` |
| 工单工具 | `plugins/hyper-org/lib/tools.js` |
| 第一单产物 | `examples/flying-chess/`（含 `order.json` 快照） |

## 已知遗留

- 工单只有工具入口，**没有面板**——就是下一个工单。
- 「跳格/飞行」规则按裁决未做，单局平均约 370 步、15 分钟以上；要给人玩需要单开一单。
- 评审记录的残余风险：未做 Safari / Firefox 实测；运行时 DPR 变化依赖 `resize` 事件触发重建。
- `~/.dsh/settings.yaml.imported`、`~/.dsh/pet.json` 未确认是否可删，一直没动。
- 子代理路由目前只授权了 `opencode-go/deepseek-v4.1-flash` 一个模型，`model` 字段已就位但无法体现成本差异。

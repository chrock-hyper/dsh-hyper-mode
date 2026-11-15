# 工单看板（会话内「工单」标签页）· 开工方案

- 工单：`wo-20261115-2`「工单看板：会话内『工单』标签页」（M 规模，DRI `engineer`）
- 状态：方案，可直接开工；实现不由本文档承担
- 读者：`engineer`（照着做）、`reviewer`（照验收标准查）

---

## 0. 结论摘要

1. **路由前缀用 `/hyper-org/api`**，Host 路由写在 `plugins/hyper-org/lib/api.js`（新增），由 `plugins/hyper-org/index.js` 里 `ctx.inject(['webServer'], …)` 挂载——与 `hyper-roles` 完全同构（`plugins/hyper-roles/index.js:147-162`）。
2. **标签页 `order` 必须用 70，不是 60**。`岗位` 是 `order: 50`（`plugins/hyper-roles/client/client.js:814`），`Wiki` 是 `order: 60`（`plugins/hyper-wiki/client/client.js:1161`）。`docs/HANDOFF.md:68` 写的 `order: 60` 会撞号，与同一份文档的验收标准「与岗位、Wiki 同排」冲突。**按本文档的 70 执行。**
3. **规则复用的落法**：新增 `plugins/hyper-org/lib/rules.js`，把「note 必填」「领取人不能自签」两条目前只存在于 `lib/tools.js` 的校验，连同 `splitLines`/`splitList` 一起下沉成纯函数 + 三个 `*WithRules` 组合函数；`lib/tools.js` 与新的 `lib/api.js` 都只调用它。**`lib/store.js` 一行不改**，现有测试一行不改（见 §6.4 的兼容性证明）。
4. **面板不写任何规则判断**。它只渲染 Host 返回的 `canSign.blockers` 与 `create.notes`，所以「两套规则」在结构上无法发生（见 §6.5）。
5. **交付物只能「面板内预览文本 + 复制路径」**。浏览器半边没有 shell／文件管理器能力；预览走 Host 的 `/artifact` 路由，带 5 道路径防护（见 §9）。
6. 数据格式不动：`schemaVersion` 仍为 1，`.dsh/org` 仍是唯一数据源，老文件不迁移、不改写。

**与交接文档的两处偏差，以本文档为准**：标签页 `order` 60 → **70**；路由前缀与客户端 `API` 常量统一为 `/hyper-org/api`（`hyper-wiki` 用的是 `/wiki`，两插件约定不一致，此处跟 `hyper-roles` 走）。

---

## 1. 已核实的现状（不是想象）

| 事实 | 证据 |
|---|---|
| Host 行已挂载，无需改 `cordis.patch.yml` | `cordis.patch.yml:36-37`（`id: hyper-org`，相对路径） |
| `hyper-org` 无嵌套包，面板加载器还没有落点 | `ls plugins/hyper-org` → 只有 `index.js` / `lib/` / `test/` |
| 目前 `inject` 只有 `tools`、`systemPrompt` | `plugins/hyper-org/index.js:26` |
| 会话 → 工作目录的解法已存在（`sessions.get` + `workingDirectory.get`） | `plugins/hyper-roles/index.js:66-76`；`plugins/hyper-wiki/index.js:253-265` 同形 |
| `webServer` 是按需注入的，不在 `inject` 数组里 | `plugins/hyper-roles/index.js:147`（`export const inject` 在 :28 没有 webServer，仍然可用） |
| 路由收到的是**含前缀的完整 pathname** | `plugins/hyper-roles/lib/api.js:59`（`segments[0] === 'hyper-roles'`） |
| 守卫只看 loopback | `plugins/hyper-roles/lib/api.js:190-203` |
| 列表返回 `{project, global, merged, problems}`，行里**没有 scope** | `plugins/hyper-org/lib/store.js:43-54` |
| `readOrder` 返回 `{order, scope, path}`，读不到返回 `undefined` | `store.js:62-74` |
| 建单的在制上限**只在这里生效**；`saveOrder` 没有在制检查 | `store.js:97-99`（create）vs `store.js:126-160`（save，无 wip 校验） |
| 建单必须显式传 `wipLimit`，否则上限静默失效 | `store.js:97`（`occupied >= input.wipLimit`） |
| `done` 不可直写；`dropped` 要求 `note`；M/L 进 `active` 要验收标准 | `store.js:132-147` |
| 签收只认 `review`；签收要求有验收标准 | `store.js:171-178` |
| **note 必填、DRI 自签**在工具层，不在 store | `plugins/hyper-org/lib/tools.js:152-157` |
| DRI 必须是已存在岗位 | `tools.js:50-56`（`readRole` 查岗位库） |
| 看板文本会截断（标题 40 字、每单一行、日志 6 条 × 200 字） | `lib/marker.js:12-14, 37-43, 64` |
| `ageOf`（人类可读时长）目前是**模块私有** | `lib/marker.js:106-113` |
| `occupiesSlot`/`acceptanceGate` 已是导出函数 | `lib/order-doc.js:89-105` |
| `ORDER_ID` 有正则，可用于 URL 段校验 | `lib/order-doc.js:16` |
| 路径包含判定与项目根探测已有共享实现 | `plugins/shared/paths.js:38-63`（`.git` 探测、`isInside`） |
| 岗位行摘要含 `id/title/version/summary`，项目作用域覆盖全局 | `hyper-roles/lib/store.js:52-64, 118-135`、`summarize()` |
| 面板客户端的三条硬规则（无 prompt/confirm、dirty 可解释、错误必可见） | `hyper-roles/client/client.js:8-11` |
| 本机真实数据：`wo-20261115-1` 已 `done`，`wo-20261115-2` 在 `active` | `.dsh/org/orders/*.json`；在制 1/2 |

---

## 2. 不变量（实现期间不得违反）

| # | 不变量 | 违反的后果 |
|---|---|---|
| I1 | `.dsh/org` 是唯一数据源；面板不建第二份存储、不做缓存层 | 面板与 Agent 看到不同的世界 |
| I2 | **所有写路径最终都落到 `lib/store.js` 的 `createOrder/saveOrder/signOrder`** | 绕过 `writeText` 的原子写与 `CHANGELOG` 审计 |
| I3 | 门禁判定只有一处实现：`store.js`（阶段/验收/在制）+ `rules.js`（note/自签/DRI） | 两套规则，验收标准第 5 条直接失效 |
| I4 | `schemaVersion`、字段名、字段含义不变；不解释未知字段、不改写老文件 | 老工单不可读 |
| I5 | 浏览器半边只做 `fetch` 与渲染：无 Node、无 shell、无 `window.prompt/confirm` | Electron 下静默抛错（`client.js:9`） |
| I6 | 样式只用 `--dsw-alias-*` 令牌，且带兜底色 | 主题切换下不可读 |
| I7 | 文案全部走 locale（`zh`/`en` 两份）；不硬编码中文字符串到 JSX | 与两个既有面板不一致 |
| I8 | 面板客户端必须在**独立嵌套包** `plugins/hyper-org/package.json` 里 | `dsh-client-modules` 对同一包多个活跃 loader 来源直接报错 |
| I9 | 一次请求只读一次盘，写后重读（不做客户端乐观更新） | 面板显示与文件不一致 |
| I10 | 不新增门禁，也不放宽门禁 | 验收标准第 4、5 条 |

---

## 3. 两个方案与推荐

### 方案 A（推荐）：新增 `lib/rules.js`，store 零改动

`rules.js` 持有：文本解析（`splitLines`/`splitList`，从 `tools.js` 搬来）、纯规则（`signBlockers`）、三个组合函数（`createWithRules`/`updateWithRules`/`signWithRules`，内置「校验 → 调 store」）、错误分类（`classify`）、建单降级解释（`explainCreate`）。`tools.js` 与 `api.js` 都是它的调用方。

- 改动面：新增 1 个 lib、改 `tools.js`（约 25 行重排）、改 `index.js`（挂载块 ~20 行）、新增 `api.js` / `artifacts.js` / 嵌套包 / 客户端
- 风险：低。`store.js` 与数据格式零接触，现有 `bun test` 应原样通过
- 可逆性：高。删 `api.js` 与客户端注册即回到今天；`rules.js` 留着也无害（`tools.js` 行为等价）
- 工作量：M

### 方案 B（备选，不建议本次做）：把两条校验下沉进 `store.js`

在 `signOrder` 里加 `if (input.by === order.dri) throw …` 与 note 非空检查。

- 收益：store 成为唯一执行点，面板在物理上无法绕过
- 代价 1：**门禁语义扩张**——`signOrder` 的拒绝集合变大，与「不改 store.js 门禁语义」的约束直接冲突
- 代价 2：`by` 是**身份标签**，`org_order` 里它是 `boundRole ?? 'lead'`（`tools.js:41`）。用 `by === dri` 判自签，前提是「`dri` 一定是真岗位 id」；而 `parseOrder` 并不校验 DRI 存在（`order-doc.js:48`），手改文件把 `dri` 写成 `lead` 就会产生「lead 不能签 lead 的单」的假阳性
- 代价 3：现有测试虽然不破（`signOrder` 的用例都带 note、且自签场景从工具层走），但它把「store 不管身份」这个既有分层打破了
- 工作量：S（但代价大）

**推荐 A。** 什么情况下改推 B：若将来出现第三个写入口（比如命令行脚本直接改单），A 的「约定 + 测试」就守不住，届时应连 `expectedRevision` 一起做，单开一单。

---

## 4. 数据流

```
浏览器「工单」标签页 (sessionId)
   │  fetch /hyper-org/api/*?session=<id>
   ▼
plugins/hyper-org/lib/api.js        ← 只做 HTTP：解析、鉴权、错误码
   │  sessionId → { cwd, boundRole }        （复用 cwdOfSession 思路）
   │  cwd → resolveDirs → orgDirs()          （复用 hyper-roles 的作用域解析）
   ▼
plugins/hyper-org/lib/rules.js      ← 唯一规则实现（note / 自签 / DRI / 解释 / 分类）
   ▼
plugins/hyper-org/lib/store.js      ← 唯一写入口（阶段 / 验收 / 在制 / 原子写 / CHANGELOG）
   ▼
<项目根>/.dsh/org/orders/*.json  +  CHANGELOG.md      （唯一数据源）
   ▲
   │  同一批函数
org_order / org_board（模型侧工具，lib/tools.js）
```

关键点：**面板与工具在 `rules.js` 汇合，之后同路**。面板不直接 import `store.js` 的写函数（code review 检查项）。

---

## 5. Host API 契约

### 5.1 通用约定

- 前缀：`/hyper-org/api`；`webServer.register({ kind: 'prefix', path: '/hyper-org/api', handler })`
- 鉴权：只服务 loopback（照抄 `hyper-roles/lib/api.js:190-203`，含 IPv4-mapped IPv6），非 loopback → `401 {"ok":false,"code":"unauthorized"}`。**不要**套 connection carrier 凭证（面板是普通页面请求，套了必 401，`hyper-roles/lib/api.js:179-192` 的注释记录了这次踩坑）
- 请求体：JSON 对象，上限 256 KiB（照抄 `readJsonBody`），超限/非对象 → `400 bad_body`
- 响应：`{ ok: true, … }` 或 `{ ok: false, code, error }`；`content-type: application/json; charset=utf-8`，`cache-control: no-store`
- **`id` 必须先过 `ORDER_ID` 正则**（`order-doc.js:16`）再碰文件系统：`id` 来自 URL，`store.readOrder` 会 `join(dir,'orders',id+'.json')`，`../..` 能穿越。不合法 → `400 bad_id`
- 所有写路由：`actor` **不由请求体提供**，一律取当前会话的岗位绑定（见 §5.3）

### 5.2 端点总表

| # | 方法 | 路径 | 查询 | 请求体 | 成功响应 |
|---|---|---|---|---|---|
| 1 | GET | `/hyper-org/api/state` | `session` | — | 看板摘要 + 岗位目录 + 无法解析的文件 |
| 2 | GET | `/hyper-org/api/order` | `session`, `id` | — | 单张工单全量（含完整日志）+ 交付物状态 + 可签提示 |
| 3 | POST | `/hyper-org/api/order` | `session` | 建单输入 | 建好的单 + 是否被压回 intake + 解释 |
| 4 | PATCH | `/hyper-org/api/order/:id` | `session` | 改阶段/领取人/验收/交付物/note | 改好的单 |
| 5 | POST | `/hyper-org/api/order/:id/sign` | `session` | `{approve, note}` | 签收或打回后的单 |
| 6 | GET | `/hyper-org/api/artifact` | `session`, `id`, `path` | — | 文本预览（可能截断） |

方法不符 → `405 method_not_allowed`；路由不存在 → `404 not_found`。

### 5.3 会话与身份解析（两件事分开做）

```js
// index.js 内，与 hyper-roles/index.js:66-76 同构
const sessionOf = (sessionId) => {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  try {
    const session = ctx.get('sessions')?.get?.(sessionId)   // 注意：传 id，拿对象
    return session ?? undefined
  } catch { return undefined }
}
const cwdOfSession = (sessionId) => { const s = sessionOf(sessionId); /* workingDirectory.get(s) → string */ }
const roleOfSession = (sessionId) => {
  const session = sessionOf(sessionId)
  const state = session === undefined ? undefined : binding?.stateOf?.(session)
  return typeof state?.role === 'string' ? state.role : undefined
}
```

- `cwd` → `resolveDirs({ home, cwd })` → `orgDirs(...)`：**与工具完全同一条作用域链**，不另造项目根。
- `actor` = `roleOfSession(sessionId) ?? 'lead'`。**必须与 `tools.js:41` 的 `identityOf` 同规则**：否则工程师在面板上能签自己名下的单，而这是验收标准第 5 条的核心。
- 身份解析不出来（会话已关闭／不是 live session）时：`actor = 'lead'`，但 `state.actor.confirmed = false`，面板据此把签收按钮显示为「无法确认身份，请在会话内操作」并禁用（**禁用是 UX，Host 仍会正常校验**；不要为此新增门禁）。见风险 R2。

### 5.4 `GET /state`

```json
{
  "ok": true,
  "now": "2026-11-15T15:39:21.000Z",
  "projectRoot": "/Users/…/dsh-hyper-mode",
  "globalDir": "/Users/…/.dsh/org",
  "projectDir": "/Users/…/dsh-hyper-mode/.dsh/org",
  "wipLimit": 2,
  "actor": { "role": null, "label": "lead", "confirmed": true },
  "stages": ["intake", "active", "review", "blocked", "done", "dropped"],
  "wipStages": ["active", "review", "blocked"],
  "sizes": ["S", "M", "L"],
  "occupied": 1,
  "orders": [{
    "id": "wo-20261115-2", "title": "工单看板：会话内「工单」标签页",
    "stage": "active", "size": "M",
    "dri": "engineer", "driTitle": "工程师", "scope": "project",
    "age": "6 小时", "updatedAt": "2026-11-15T15:37:44.269Z",
    "acceptanceCount": 6, "artifactCount": 0, "logCount": 1, "occupiesSlot": true
  }],
  "roles": [{ "id": "engineer", "title": "工程师", "scope": "project" }],
  "problems": [{ "path": "…/orders/wo-broken.json", "message": "…" }]
}
```

取数细节（都是现成函数，不要新写）：

- `listOrders(dirs)` → `merged` + `problems`（`store.js:43-54`）
- `scope` 标注：`merged` 的行本身不带 scope，用 `new Map([...project.map(o => [o.id,'project']), ...global.map(o => [o.id,'global'])])` 补；不要改 `store.js` 的返回形状
- `occupied` = `merged.filter(occupiesSlot).length`（`order-doc.js:89`）——**不要**再写字面量 `['active','review','blocked']`
- `age` = `marker.js` 的 `ageOf(updatedAt)`：**把它从模块私有改成 `export`**（唯一一处 marker 改动，无行为变化）。面板不重写时长口径
- `driTitle` = `readRole(roleDirs, dri)?.title`（项目覆盖全局由 `readRole` 保证）
- `roles` = `listRoles(dirs)` 的 `project` + 未被子遮蔽的 `global`，只留 `{id,title,scope}`

**不分阶段分组**：分组是纯展示，放客户端做（`stages` 已下发顺序），Host 不预分组，避免两个排序口径。

### 5.5 `GET /order?id=…`

```json
{
  "ok": true, "scope": "project", "path": "/…/.dsh/org/orders/wo-20261115-2.json",
  "order": { "schemaVersion": 1, "id": "…", "title": "…", "stage": "active", "size": "M",
             "dri": "engineer", "acceptance": ["…"], "artifacts": [], "log": [{"at":"…","by":"…","note":"…"}],
             "createdAt": "…", "updatedAt": "…" },
  "driTitle": "工程师",
  "age": "6 小时",
  "artifacts": [{ "path": "examples/flying-chess/index.html", "kind": "file", "bytes": 84213 }],
  "sign": { "allowed": false, "blockers": [{ "code": "not_review", "message": "工单 … 现在是 active，只有 review 状态可以签收；先 update 到 review" }] }
}
```

- **`log` 原样返回，不截断**。验收标准第 3 条要「完整日志」，而 `marker.renderOrder` 只给最近 6 条 × 200 字（`marker.js:12-14`）——**不要复用 `renderOrder` 的产出**，它给模型看，不给面板看。
- `sign.blockers` 由 `rules.signBlockers(order, { actor })` 直接产出（不含 `note_required`，因为还没填）；面板只渲染，不自己判断（§6.5）。

### 5.6 `POST /order`（建单）

请求体：`{ "scope"?: "project"|"global", "title": string, "size"?: "S"|"M"|"L", "dri"?: string, "acceptance"?: string|string[], "note"?: string }`

- `title` 空 → `400 bad_title`（消息与工具一致：`create 需要 title：一句话说清要交付什么`）
- `size` 不在 `SIZES` → `400 bad_size`
- `dri` 非空但岗位不存在 → `400 unknown_role`（消息与 `tools.js:53` 一致）
- 无项目根却要 `project` → `400 no_project`（`这个会话没有项目根，只能写全局作用域`）
- **不接收 `stage`**：`createOrder` 的默认 `requested='active'`，面板不越过它
- **必须传 `wipLimit: config.wipLimit`**（漏了 = 在制上限静默失效，见 R3）
- `acceptance` 用 `splitLines`（**只按换行切**，中文逗号不切——`tools.js:222-228`，踩过的坑）
- 成功：`200 { ok:true, order, downgraded:boolean, reason:"wip"|"acceptance"|null, occupied, wipLimit, notes:string[] }`
  - `notes` 来自 `rules.explainCreate(result)`，逐条说明为什么没进 active。**降级不是错误，是 200**：面板要把「被压回 intake」当成正常结果展示，不要显示成失败

### 5.7 `PATCH /order/:id`（改阶段/领取人）

请求体：`{ "stage"?, "dri"?, "acceptance"?, "artifacts"?, "note"?, "title"?, "size"? }`

- 允许的阶段：`intake/active/review/blocked/dropped`；`done` 不在里面（`store.js:133` 会拒）
- `dri` 校验同建单；`''` 表示取消指派（`store.js:143` 的约定）
- `artifacts` 用 `splitList`（逗号或换行切），**追加**而非覆盖（`store.js:148`）
- 门禁全部来自 store（验收/`done`/`dropped` 要 note），本层不新增判断
- 成功：`200 { ok:true, order, scope, path }`
- 已知现状（**不要顺手修**）：`dropped` 的理由校验只要求 `typeof note === 'string'`（`store.js:136`），空字符串能过。面板用「按钮禁用」做 UX 兜底，但不新增 Host 门禁（I10）

### 5.8 `POST /order/:id/sign`

请求体：`{ "approve": boolean, "note": string }`

执行顺序（**必须**）：`rules.signBlockers(order, {actor, note, approve})` → 有 blocker 就抛 → 否则 `store.signOrder(...)`。

成功：`200 { ok:true, order, scope, path }`，`order.stage` 为 `done`（签收）或 `active`（打回）。

### 5.9 错误码表（`{ok:false, code, error}`）

| code | status | 触发 | `error` 文本来源 |
|---|---|---|---|
| `unauthorized` | 401 | 非 loopback | 固定字串 |
| `bad_body` | 400 | 非 JSON / 非对象 / >256 KiB | 固定字串 |
| `bad_id` | 400 | `id` 不过 `ORDER_ID` | 固定字串 |
| `bad_title` | 400 | `title` 空 | 与 `tools.js:97` 同句 |
| `bad_size` / `bad_stage` / `bad_scope` | 400 | 枚举外 | 固定字串 |
| `unknown_role` | 400 | DRI 岗位不存在 | `tools.js:53` 原句 |
| `no_project` | 400 | 要 project 但没有项目根 | `store.js:261` 原句 |
| `note_required` | 400 | `sign` 无 note | `tools.js:156` 原句 |
| `self_sign` | **403** | `actor === order.dri` | `tools.js:153` 原句 |
| `order_not_found` | 404 | id 不存在 | `store.js:202` 原句 |
| `not_review` | 409 | 非 `review` 签收 | `store.js:174` 原句 |
| `no_acceptance` | 409 | 无验收标准却签收 | `store.js:177` 原句 |
| `acceptance_gate` | 409 | M/L 无验收标准进 active | `store.js:146` 原句 |
| `done_forbidden` | 409 | 直接写 `done` | `store.js:134` 原句 |
| `path_escape` / `not_declared` / `binary` / `too_large` | 400/400/415/413 | 见 §9 | 固定字串 |
| `missing` / `is_directory` | 404 / 409 | 交付物不存在 / 是目录 | 固定字串 |
| `not_found` / `method_not_allowed` | 404 / 405 | 路由/方法不符 | 固定字串 |

**映射方式**：`rules.classify(error)` 用「消息前缀/正则 → `{status, code}`」做**表现层**映射，不碰 store 的抛出逻辑（store 的消息文本是门禁的一部分，改它等于改语义）。`test/rules.test.js` 必须逐条断言「每条门禁消息都能被分类」，这样将来有人改 store 文案时测试会响，而不是静默退化成 400。

### 5.10 不做的端点

- `GET /hyper-org/api/changelog` —— `CHANGELOG.md` 是审计线，面板只读单，不读审计（范围外）
- `PUT /hyper-org/api/config` —— 面板不改 `wipLimit`（范围外）
- 任何写岗位卡的端点 —— 明确不做项

---

## 6. 规则复用方案

### 6.1 问题陈述

今天有两条规则**只存在于工具层**：

```js
// plugins/hyper-org/lib/tools.js:149-157（sign 分支）
const callerRole = boundRoleOf(binding, agent)
if (callerRole !== undefined && callerRole === found.order.dri) throw new Error(`…验收不能由领取人自己签`)
if (typeof args.note !== 'string' || args.note.trim() === '') throw new Error('sign 需要 note：…')
```

面板若照抄这两段，就是两套规则（验收标准第 5 条明确禁止）。

### 6.2 落法：`plugins/hyper-org/lib/rules.js`（新增）

只写签名，不写实现：

```js
// 纯函数（无 fs、无 store、无 ctx）
export function splitLines(value): string[]            // 从 tools.js 搬来，语义不变
export function splitList(value): string[]
export function signBlockers(order, { actor, note, approve }): {code, message}[]
      // not_review / self_sign / note_required / no_acceptance —— 四条的 message 与今天逐字一致
export function requireRoleId(lookupRole, id): card    // DRI 存在性，message 同 tools.js:53
export function explainCreate(created): string[]       // 建单降级的人话解释（tools 与面板共用）
export function classify(error): { status, code }      // 表现层映射（§5.9）

// 组合函数：唯一「校验 → store」序列
export function createWithRules(dirs, input, { lookupRole, wipLimit }): created
export function updateWithRules(dirs, input, { lookupRole }): saved
export function signWithRules(dirs, { id, approve, note, actor }): signed
      // = signBlockers(...) 抛错 → store.signOrder(...)
```

`createWithRules` 内部仍是 `store.createOrder(...)`；`signWithRules` 内部仍是 `store.signOrder(...)`。**规则判定没有第二处实现**，`store.js` 也一行不改。

### 6.3 改动面（`tools.js` 的 diff 形状）

| 今天 | 改成 |
|---|---|
| `tools.js:50-56` `requireRole` | `requireRoleId((id) => readRole(roleDirs, id), id)` |
| `tools.js:152-157` 两段抛错 | `signWithRules(dirs, { id, approve, note, actor: boundRoleOf(binding, agent) })` |
| `tools.js:99-108` 建单装配 | `createWithRules(...)`，`text` 组合保持原样 |
| `tools.js:222-241` `splitLines`/`splitList` | 定义搬去 `rules.js`；**`tools.js` 必须保留再导出**：`export { splitLines, splitList } from './rules.js'` |

工具对外的 `text` 文案（`已建单 …` / `已更新 …` / `已签收` / `岗位 "x" 不存在` / `验收不能由领取人自己签` / `需要 note`）**逐字保留**。

### 6.4 对现有测试的影响：零改动

`plugins/hyper-org/test/org-flow.test.js` 里被这些改动碰到的断言：

| 现有断言 | 行 | 为什么不受影响 |
|---|---|---|
| `import { buildOrgTools, splitLines } from '../lib/tools.js'` | :12 | `tools.js` 再导出 `splitLines`，导入路径不变 |
| `rejects.toThrow(/岗位 "ghost" 不存在/)` | :124 | `requireRoleId` 用同一句话 |
| `rejects.toThrow(/验收不能由领取人自己签/)` | :140 | `signBlockers` 的 `self_sign` 用同一句话 |
| `rejects.toThrow(/需要 note/)` | :156 | `note_required` 用同一句话 |
| `signOrder` 直调用（:101/:104/:111） | — | `store.js` 未改 |
| `createOrder` 直调用（:55-89 等） | — | `store.js` 未改 |

**执行纪律**：Phase 0 完成后先跑 `cd plugins/hyper-org && bun test`，`org-flow.test.js` 必须**在未修改的情况下**全绿。绿了才进 Phase 1；不绿说明搬动改变了语义，回退重排。

### 6.5 为什么「两套规则」在结构上不可能

1. `api.js` **禁止** import `store.createOrder/saveOrder/signOrder`（只有 `readOrder/listOrders` 可以）——写路径只能经 `rules.*WithRules`。
2. 面板**不实现任何规则判断**：`sign.blockers` 与 `create.notes` 都是 Host 算好下发的字符串，客户端只渲染。四条 blocker 同时以「禁用按钮 + 解释」呈现，但**真正拒绝发生在 Host**。
3. 身份同源：工具的 `actor = boundRoleOf(binding, agent) ?? 'lead'`，面板的 `actor = roleOfSession(sessionId) ?? 'lead'`——同一个 projection、同一个 fallback。
4. `test/api.test.js` 与 `test/org-flow.test.js` 对同四条规则各断言一次；任一实现分叉都会有一侧红。

---

## 7. Client 半边

### 7.1 新嵌套包 `plugins/hyper-org/package.json`（全文）

```json
{
  "name": "@chrock-studio/dsh-hyper-org",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "工单看板的浏览器半边：会话级工单看板，数据走 Host 的 /hyper-org/api",
  "exports": { "./client": "./client/client.js" },
  "dsh": {
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-ui-sidebar"
      ]
    }
  }
}
```

要点：

- 包名与既有两个不同（`@chrock-studio/dsh-hyper-roles`、`@chrock-studio/dsh-hyper-wiki-client`），**不要**复用根包名——根包已经有 6 条 patch 行，塞 `dsh.client` 就是「同一包多个活跃 loader 来源」
- `locatePkgJson` 从行模块 `plugins/hyper-org/index.js` 向上取**最近的** `package.json`，正好是这个新文件；`hyper-roles`、`hyper-wiki` 两行各认领自己的清单，互不影响
- 根 `package.json` 的 `exports` 追加一行：`"./hyper-org/client": "./plugins/hyper-org/client/client.js"`（给外部消费者与一致性，加载器实际走嵌套包名）

### 7.2 `plugins/hyper-org/client/client.js` 结构

单文件、无构建、无 JSX，形状照 `hyper-roles/client/client.js`：

```js
window.__ModuleLoader__.load({
  id: '@chrock-studio/dsh-hyper-org',            // 与 package.json 的 name 一致
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const NS = 'hyperOrg'          // 不与 hyperRoles / wiki 冲突
    const TAB_ID = 'orders'
    const API = '/hyper-org/api'
    let t = (key) => key

    const zh = { /* tab, stageIntake, stageActive, stageReview, stageBlocked, stageDone, stageDropped,
                    sizeS/sizeM/sizeL, wip, ageUnknown, noOrders, selectOrder, title, size, dri,
                    acceptance, artifacts, log, stage, signOff, sendBack, note, noteHint,
                    createTitle, createSize, createDri, createAcceptance, createSubmit, cancel,
                    unassigned, refresh, loading, saving, saved, created, error, retry,
                    noProject, problemsBanner, preview, copyPath, copied, closePreview,
                    truncated, missingArtifact, unsupportedStage, doneViaSign, … */ }
    const en = { /* 同键集 */ }

    function queryString(query) { /* 复制 roles 的实现：空值跳过 */ }
    async function call(path, options) { /* 复制 roles：失败抛 error.status/code */ }

    function OrdersTab({ sessionId }) { /* 左：分组看板；中：详情/预览；右：签收与改阶段 */ }

    const STYLES = `/* .ho- 前缀，只用 --dsw-alias-* */`

    return {
      inject: ['slots', 'locale'],
      __test: { queryString, groupByStage, ageText },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hyper-org: dictionaries')
        t = ctx.locale.bind(NS)
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: TAB_ID,
          order: 70,                 // ← 岗位 50 / Wiki 60；不要再往上撞
          locale: NS,
          label: () => t('tab'),
        }, OrdersTab))
      },
    }
  },
})
```

标签页注册参数：

| 参数 | 值 | 说明 |
|---|---|---|
| `name` | `'conversation.view'` | 与岗位、Wiki 同一排 |
| `id` | `'orders'` | 唯一；`roles`/`wiki` 已占用另两个 |
| `order` | **70** | 50 岗位、60 Wiki |
| `locale` | `'hyperOrg'` | 与 `NS` 一致 |
| `label` | `() => t('tab')` | `zh: '工单'`，`en: 'Orders'` |
| 组件 | `OrdersTab` | 接收 `{ sessionId }`（`conversation.view` 会传，两个既有面板已验证） |

`sessionId` 为空时不需要自己处理「不显示」：`conversation.view` 只在会话里渲染。但**数据请求仍要短路**（`session === ''` 时不 fetch），否则会拿 `session=` 打出一个无项目根的 `state`。

### 7.3 样式

- 类前缀 `.ho-`（`hr-` / `dw-` 已被占用）
- 只用 `--dsw-alias-*`，一律带兜底：`var(--dsw-alias-bg-layer-1,#fff)`。可用集合（既有面板已在用）：`label-primary`、`label-secondary`、`bg-base`、`bg-layer-1`、`bg-layer-2`、`border-l1`、`border-l2`、`brand-primary`、`state-error-primary`、`state-warn-primary`、`state-success-primary`
- 根容器必须能撑满：`display:flex; flex-direction:column; flex:1 1 auto; height:100%; min-height:0`（照 `client.js:705-707`；这是「布局塌缩」踩过的点）
- 三栏用 grid；`@media (max-width:1239px)` 退成两行（照 `client.js:798-801`）

---

## 8. UI 结构与状态

### 8.1 三栏

```
┌ 顶部：错误条 / 提示条（一次只留一条，可关闭） ─────────────────────┐
├───────────────┬──────────────────────────────┬────────────────────┤
│ 工单 (n)  [刷新] │  详情（六项） 或 交付物预览   │ 签收 / 打回         │
│ ＋ 新建工单     │                              │ 改阶段 / 领取人      │
│ 在制 1/2       │                              │ 数据位置            │
│ ▸ review (0)  │                              │                    │
│ ▸ blocked (0) │                              │                    │
│ ▾ active (1)  │                              │                    │
│   ● wo-…-2    │                              │                    │
│ ▸ intake (0)  │                              │                    │
│ ▸ done (1)    │                              │                    │
│ ▸ dropped (0) │                              │                    │
└───────────────┴──────────────────────────────┴────────────────────┘
```

### 8.2 左栏：按阶段分组

- 组顺序取 `state.stages`：`intake / active / review / blocked / done`，**末尾追加 `dropped`**（验收标准列了五组；撤单不隐藏，否则单会消失）。`done` 与 `dropped` **默认折叠**，`active`/`review`/`blocked`/`intake` 默认展开
- 列的头部固定显示 `在制 {occupied}/{wipLimit}`；`occupied > wipLimit` 时加一行警告（照 `marker.renderBoard:66-68` 的口径：在制已超上限，新单会被压到 intake）
- 组标题：`阶段名 (n)`，用 locale 的 `stageActive` 等
- 行：标题（2 行截断 + `title` 属性给全文）、`size`、`driTitle ?? '未指派'`、`age`
  - 当前选中行高亮（复用 `.hr-row-on` 的视觉：`color-mix` + 左侧 2px 条）
  - `scope === 'global'` 的行加一个 `全局` 小标（项目单不加，避免噪音）
- 组内排序：`updatedAt` 升序（**最老的排最上**，超龄一眼看见）
- 空态：`还没有工单，用「＋ 新建工单」开一张`
- 加载态：`读取中…`（骨架不做）
- `＋ 新建工单` 按钮：`projectRoot === null` 时禁用并给出原因（写全局仍可用，见 8.5）

### 8.3 中栏：详情六项

按验收标准逐条落位，顺序固定：

| # | 六项 | 渲染 |
|---|---|---|
| 1 | 当前阶段 | 大标 `stage` + 阶段说明；`done` 时附「由 sign 产生」（`done` 不可手改） |
| 2 | 规模 | `S/M/L` + 人话（单兵／三岗／全链路） |
| 3 | DRI | `driTitle（dri）`；未指派显示 `未指派` |
| 4 | 验收标准 | 列表；空时黄条：`无验收标准：M/L 规模的单不能进 active，也不能签收` |
| 5 | 交付物 | 可点行：路径 + 状态（`file`/`missing`/`dir`）；点击 → 预览（§9）；每行有 `复制路径` |
| 6 | 完整日志 | **全部条目**，倒序（最新在上），每条 `MM-DD HH:mm · by` + note（`white-space:pre-wrap; word-break:break-word`）；容器 `max-height:260px; overflow:auto`；超过 100 条时默认只渲染最新 100 条，末尾一行 `显示全部（共 N 条）` |

标题区：完整标题（不截断）、`id`、`scope`、`age`。

### 8.4 右栏：签收/打回 + 改阶段

**签收 / 打回**（`stage === 'review'` 才显示操作区，否则一行灰字 `只有 review 可签收`）：

- `note` 文本域（必填，locale 提示：`写清签收依据，或打回时要改哪一条`）
- 两个按钮：`签收 → done`、`打回 → active`
- `state.sign.blockers` 逐条渲染成解释行，并禁用按钮（`note_required` 由客户端在提交前自己判空，因为这个 blocker 属于输入绑定）
- 身份行：`以 {actor.label} 身份签收`；`actor.confirmed === false` 时显示 `无法确认当前身份：请在会话内操作` 并禁用

**改阶段 / 领取人**：

- 阶段下拉：`intake/active/review/blocked/dropped`（**没有 `done`**，下拉里给它一个 `done（只能由签收产生）` 的禁用项，让「为什么不给我」可解释）
- DRI 下拉：`未指派` + `state.roles`（显示 `title`，存入 `id`）
- 验收标准：多行文本域（一行一条，提示「逗号不拆」）
- 交付物：多行文本域（追加语义，提示「逗号或换行分隔，只追加」）
- `note`（`dropped` 时必填）
- 保存按钮：成功后重拉 `/state` 与当前 `/order`（I9）

**建单**（放在左栏按钮展开的表单里，与岗位面板的「新建岗位」同位）：

- 标题（必填）、规模（默认 M）、领取人（未指派 + 岗位列表）、验收标准（多行，一行一条）、`note`、作用域（有项目根时默认 `project`）
- 提交后：`downgraded === true` 时用 `notes[]` 显示**信息条**（不是错误条）；`reason === 'wip'` 与 `'acceptance'` 的文案由 Host 给，客户端不自己编

### 8.5 状态矩阵（必须全部实现）

| 状态 | 呈现 |
|---|---|
| 首次加载 | 左栏 `读取中…`；中栏 `从左选一张工单`；按钮全禁用 |
| 空看板 | 左栏 `还没有工单`；中栏引导建单；`＋ 新建工单` 可用 |
| 请求失败 | 顶部错误条（`state`/`order`/写操作各自） + `重试` 按钮；**不允许点了没反应** |
| 无项目根 | 顶部黄条：`这个会话没有项目根：只能看全局工单，新建会落在全局作用域`；作用域选择锁到 `global`；交付物预览禁用并解释 |
| 无法解析的工单文件 | `problems.length > 0` → 折叠加警示条：`N 个工单文件无法解析` + 每条 `path — message`；**看板其余部分照常渲染**（`listOrders` 已经隔离坏文件，`store.js:225-234`） |
| 选中单已被外部改动/删除 | 写操作返回 `404 order_not_found` → 错误条 + 自动刷新列表并清空选中 |
| 写操作被门禁拒绝 | 错误条显示 Host 的 `error` 原文（不要翻译、不要改写），并保持表单内容不清空 |
| 长标题 | 左栏 2 行截断 + `title` 属性；中栏完整换行 |
| 长日志 / 长 note | `pre-wrap` + `break-word`；容器滚动；>100 条折叠 |
| 长验收标准 | 中栏完整显示、可滚动；不做「展开更多」 |
| 窄屏（<1240） | 右栏落到第二行（照 `client.js:798-801`） |
| 会话 id 为空 | 不 fetch，显示 `没有会话上下文` |

**不使用** `window.prompt` / `window.confirm` / `window.alert`：确认类交互（打回、撤单）用「两段式按钮」（第一次点变成 `确认打回？`，第二次才发请求），与岗位面板的 `archiveConfirm` 一致（`client.js:436-457`）。

---

## 9. 交付物「可点开」

### 9.1 浏览器半边能做与不能做

| 能做 | 不能做 |
|---|---|
| `fetch` Host 路由、渲染文本 | 打开系统文件管理器 / 编辑器（无 shell） |
| `navigator.clipboard.writeText` 复制路径 | `file://` 打开交付物（页面是 http(s)，被浏览器策略拦） |
| 文本预览（Host 读文件后返回） | 运行/渲染 HTML 交付物（见 9.5） |

所以「可点开」= **面板内预览文本 + 复制路径给用户自己去打开**。

### 9.2 `plugins/hyper-org/lib/artifacts.js`（新增）

```js
export const MAX_BYTES = 256 * 1024        // 软上限：超出即截断，仍可预览
export const HARD_MAX_BYTES = 2 * 1024 * 1024  // 硬上限：直接拒绝
export function artifactBase({ projectRoot })            // projectRoot，没有就是 undefined
export function describeArtifact(base, path)             // {path, kind:'file'|'dir'|'missing'|'escape', bytes?}
export function readArtifactText({ base, declaredPaths, path, maxBytes? })
      // → { ok:true, path, bytes, truncated, text } | throw({code})
```

### 9.3 五道防护（按顺序，任一不过即拒）

| # | 防护 | 失败码 |
|---|---|---|
| 1 | `path` 是字符串、非空、**不是绝对路径**、不含 NUL | `path_escape` 400 |
| 2 | `path` **必须在该工单的 `order.artifacts` 里**（精确匹配，规范化后比较） | `not_declared` 400 |
| 3 | 词法包含：`isInside(base, resolve(base, path))`（复用 `shared/paths.js:59`） | `path_escape` 400 |
| 4 | 符号链接包含：目标存在时 `realpathSync` 两侧再判一次 `isInside` | `path_escape` 400 |
| 5 | 类型与体积：必须是常规文件；`stat.size > HARD_MAX` 拒；`> MAX_BYTES` 截断读取并标 `truncated` | `is_directory` 409 / `too_large` 413 |

第 6 道（内容）：读前 8 KiB，含 `\0` 判为二进制 → `binary` 415，消息提示「用编辑器打开，或复制路径」。

**为什么第 2 道最重要**：`artifacts` 是模型可写的字段（`org_order` 的 `artifacts` 参数），第 3-4 道防的是「文件里写了 `../../.ssh/id_rsa`」，第 2 道把「只有工单声明过的交付物才可预览」变成显式契约——顺带挡住「面板被当成任意文件读取器」。

### 9.4 预览交互

1. 点交付物行 → `GET /hyper-org/api/artifact?session=…&id=…&path=…`
2. 中栏切到预览模式：头部 `路径` + `复制路径` + `返回详情`；正文 `<pre>`（`ui-monospace`，`overflow:auto`，可切换「软换行」）
3. `truncated === true` → 正文末尾提示 `已截断：只显示前 256 KiB`
4. 失败：错误条显示 Host 的 `error`，行内保留 `复制路径`（这是失败时唯一还能用的动作）
5. `kind === 'missing'` 的行在详情里就标红 `文件不存在`，点击不发请求

### 9.5 明确不做：HTML 渲染预览

用 `iframe` + `srcdoc` 渲染交付物（比如 `examples/flying-chess/index.html`）看起来很有吸引力，但即使 `sandbox` 加满，也是把仓库里的代码执行在 GUI 的页面上下文里，收益（省一次双击）远小于风险。**v1 只做文本预览**；需要看渲染效果就复制路径到浏览器。写进不做项，评审不必再提。

---

## 10. 文件级改动清单与顺序

### 10.1 清单

| 文件 | 动作 | 内容 | 预计行数 |
|---|---|---|---|
| `plugins/hyper-org/lib/rules.js` | **新增** | 解析器 + `signBlockers` + `requireRoleId` + `explainCreate` + `classify` + 三个 `*WithRules` | ~150 |
| `plugins/hyper-org/lib/tools.js` | 修改 | 改用 `rules.*`；**保留** `splitLines/splitList` 再导出；tool 文案逐字不变 | −30 / +25 |
| `plugins/hyper-org/lib/marker.js` | 修改 | `ageOf` 前加 `export`（1 行，无行为变化） | +1 |
| `plugins/hyper-org/lib/artifacts.js` | **新增** | §9.2 | ~90 |
| `plugins/hyper-org/lib/api.js` | **新增** | §5 六个路由 + 守卫 + 错误映射 | ~260 |
| `plugins/hyper-org/index.js` | 修改 | `ctx.inject(['webServer'], …)` 挂载；`sessionOf/cwdOfSession/roleOfSession` | +45 |
| `plugins/hyper-org/package.json` | **新增** | §7.1 | 20 |
| `plugins/hyper-org/client/client.js` | **新增** | §7.2 / §8 | ~700 |
| `package.json`（根） | 修改 | `exports["./hyper-org/client"]` | +1 |
| `plugins/hyper-org/test/rules.test.js` | **新增** | §11 | ~120 |
| `plugins/hyper-org/test/api.test.js` | **新增** | §11 | ~220 |
| `plugins/hyper-org/test/artifacts.test.js` | **新增** | §11 | ~110 |
| `scripts/preview.mjs` | 修改（可选但建议） | 支持第三个面板；加 orders fixture | +40 |
| `README.md` / `docs/HANDOFF.md` | 修改 | 标签页表加一行；把「下一个工单」改成「已完成」并写清偏差（order=70） | 小 |

**一行不改**：`lib/store.js`、`lib/order-doc.js`、`lib/config.js`、`cordis.patch.yml`、根 `index.js`、`plugins/hyper-roles/**`、`plugins/hyper-wiki/**`。

> `cordis.patch.yml` 不动是设计的结果：`hyper-org` 行已经在（`:36-37`），新面板靠嵌套包的 `dsh.client` 被同一行认领。

### 10.2 顺序（每阶段都有可停可验的出口）

**Phase 0 · 抽规则（行为零变化）**
`rules.js` + `tools.js` 重排 + `marker.js` 导出 `ageOf`。
出口：`cd plugins/hyper-org && bun test` —— **`org-flow.test.js` 未改动即全绿**。不绿就回退重排。

**Phase 1 · Host 读路径**
`artifacts.js` → `api.js`（先只做 1、2、6 三个 GET）→ `index.js` 挂载。
出口：`bun test`（新 `artifacts.test.js` + `api.test.js` 的读用例）；`curl` 等价检查由测试覆盖，不需要手工起服务。

**Phase 2 · Host 写路径**
3、4、5 三个写路由，全部经 `*WithRules`。
出口：`api.test.js` 的门禁矩阵全绿（§11.2 表）。

**Phase 3 · 客户端**
`package.json` → `client/client.js` → 根 `exports`。
出口：`bun scripts/preview.mjs orders` 生成 `docs/demo/preview-orders.html`，无头 Chrome 截 1200 / 1440 两张。

**Phase 4 · 挂载与验收**
bundle 重载（`enabled=false` → `true`，看返回的 `application`）→ `cordis_inspect_query` 查 `Tool/listTools` → GUI 刷新看标签页 → 走一遍验收标准 6 条 → 回写文档。

---

## 11. 测试计划

### 11.1 `bun test`（`cd plugins/hyper-org && bun test`）

| 文件 | 覆盖 |
|---|---|
| `org-flow.test.js` | **不改**。它继续通过就是「门禁语义未变」的证据 |
| `rules.test.js`（新） | `splitLines` 中文逗号不拆（迁到新导入路径仍成立）；`signBlockers` 四种各一条；优先级不吞 blocker；`requireRoleId` 的成功/失败消息；`explainCreate` 在 `wip`/`acceptance`/正常三种下的句子；`classify` 对 §5.9 每条消息都能给出 `status+code`（**含一条「未知消息 → 400/unknown」兜底**） |
| `api.test.js`（新） | 用假 `req`（`Readable` + `socket.remoteAddress`）与收集型 `res`。见 11.2 |
| `artifacts.test.js`（新） | `mkdtemp` 造 `base`：正常文本；`../` 逃逸；绝对路径；URL 编码 `..%2F`（先 `decodeURIComponent` 再判）；未声明路径；目录；二进制（写 `\0`）；超软上限截断；超硬上限拒绝；**符号链接指向 base 外 → `path_escape`** |

### 11.2 `api.test.js` 的用例矩阵（验收标准第 4、5 条的证据）

| 用例 | 期望 |
|---|---|
| 非 loopback 请求 | 401 `unauthorized` |
| 未知路由 / 错误方法 | 404 / 405 |
| `id` 带 `../` | 400 `bad_id`（**不碰文件系统**） |
| `GET /state` 无项目根 | 200，`projectRoot: null`，`projectDir: null` |
| `GET /state` 正常 | 含 `orders/problems/wipLimit/roles/occupied/actor`，行带 `driTitle`/`age`/`scope` |
| 建单：在制已满（`wipLimit:1` 且已有 1 张 active） | 200 + `downgraded:true` + `reason:'wip'` + `order.stage==='intake'` |
| 建单：M 无验收标准 | 200 + `reason:'acceptance'` + `stage==='intake'` |
| 建单：S 无验收标准 | 200 + `downgraded:false` + `stage==='active'` |
| 建单：不存在的 DRI | 400 `unknown_role` |
| PATCH `stage:'done'` | 409 `done_forbidden` |
| PATCH `stage:'active'`（M 无验收） | 409 `acceptance_gate` |
| sign 无 note（stage=review） | 400 `note_required` |
| sign 由 DRI 本人调用 | 403 `self_sign` |
| sign 非 review | 409 `not_review` |
| sign 无验收标准 | 409 `no_acceptance` |
| sign 成功后 | 200 + `stage==='done'` + 日志末条含 note |
| artifact 逃逸 / 未声明 / 目录 / 二进制 | 400 / 400 / 409 / 415 |

### 11.3 运行时（人工，engineer 必须做完并写进交付物）

1. `plugin_manager action=set_bundle … enabled=false` → `true`，以返回的 `application` 为准（`changed:false` 不算生效）
2. `cordis_inspect_query` 查 `Tool/listTools`：`org_order`、`org_board` **仍在**（证明新 import 没把行搞成 `never started`；若行挂了，`hydra` 会只记一条 `never started`，本地先用 `bun -e "await import('./plugins/hyper-org/index.js')"` 复现）
3. GUI `http://127.0.0.1:57546` 刷新：标签栏出现「工单」，位置在「岗位」「Wiki」**右侧**
4. 看板：在制 `1/2`、`wo-20261115-2` 在 active、`wo-20261115-1` 在 done（折叠）
5. 点开 `wo-20261115-2`：六项齐全，日志 1 条全文可见，验收标准 6 条与文件一致
6. 建一张验证单（标题前缀 `[验证]`，S 规模，无验收标准）→ 应直接进 active（S 免验收）→ 改到 review → 用同会话签收（未绑定岗位时 actor 是 `lead`，可签）→ 再建一张确认在制满后落 intake
7. 把验证单全部 `dropped` 并写理由，别把垃圾留在用户真实看板上
8. 断网/停 Host 情况不测（本地唯一通道）

### 11.4 视觉自查

`bun scripts/preview.mjs orders` → `docs/demo/preview-orders.html` → 无头 Chrome 截图 1200 / 1440。它复刻 `conversation.view` 的 flex 容器，布局塌缩会在这里暴露（`README.md:241`）。

---

## 12. 风险、不做项、回滚

### 12.1 风险（每条都能提前发现、能回滚）

| # | 风险 | 触发条件 | 影响 | 提前发现 | 回滚后状态 |
|---|---|---|---|---|---|
| R1 | **规则分叉** | `api.js` 直接 import `store.signOrder/createOrder/saveOrder`，或客户端自己判自签 | 面板与工具不一致，验收标准第 5 条失效 | code review 检查项 + `api.test.js` 两条 403/400 断言 + `org-flow.test.js` 同断言 | 删掉写路由，工具侧不受影响 |
| R2 | **身份解析失败导致自签放行** | `sessions.get(sessionId)` 返回 `undefined`（会话已关闭/重启）→ `actor` 退成 `'lead'` | 领取人能从面板签自己的单 | `api.test.js` 分「已绑定 engineer 的会话」与「查不到的会话」两组；`state.actor.confirmed=false` 让 UI 显式提示 | 面板禁用签收（`blockers` 加一条本地提示性 blocker，**不改 Host 门禁**），签收退回会话内 |
| R3 | **在制上限静默失效** | 建单时漏传 `wipLimit`（`occupied >= undefined` 恒 false） | 在制无限增长，且**没有任何报错** | `api.test.js` 的「在制已满」用例（必须见到 `reason:'wip'`） | 修 `api.js` 一行；store 不受影响 |
| R4 | **路径穿越 / 任意文件读取** | `order.artifacts` 里出现 `../../…`；或 `id`/`path` 未规范化 | 面板变成任意文件读取器 | `artifacts.test.js` 的 `..`、绝对路径、URL 编码、符号链接四例；`api.test.js` 的 `bad_id` | 停用 `/artifact` 路由，面板只剩「复制路径」 |
| R5 | **标签页撞号 / 加载器冲突** | `order` 用 60；或把 `dsh.client` 塞进根包 | 标签顺序错乱，或 `dsh-client-modules` 报「同一包多个活跃 loader 来源」，面板整体不加载 | 刷新页面看标签顺序；Host 日志有 loader 冲突字样 | 改回 70 / 恢复独立嵌套包，一处改动 |
| R6 | **嵌套包缺 `package.json` 或名字不对** | `plugins/hyper-org/package.json` 缺失、`name` 与 loader `id` 不一致 | 行本身正常，面板永不出现（无报错） | 刷新无标签 + Host 日志 `never started`；`bun -e "await import('./plugins/hyper-org/index.js')"` | 删掉 `dsh.client` 声明，回到只有工具的状态 |
| R7 | **并发写丢日志** | 人点保存的同时 Agent 也在写同一单（store 无版本锁） | 后写覆盖，丢一条日志；不回滚文件则不可见 | 只在人工复核时发现；无自动检测 | 已知缺陷，本次**不加乐观锁**（见不做项）；面板每次写前重读、写后重拉，把窗口压到最小 |
| R8 | **验证污染真实看板** | 测试期在 `.dsh/org` 建单 | 用户的看板多出垃圾单 | 交付物里列出验证单 id 并确认 `dropped` | 手工删文件（`.dsh` 是 gitignored 状态，删前确认 id） |
| R9 | **大日志渲染卡顿** | 单条工单日志 > 数百条（每条 note 可能上千字） | 面板卡顿 | preview 里塞 500 条日志 | 100 条折叠上限已内置；再卡就改分页 |
| R10 | **`classify` 与 store 文案失耦** | 有人改了 `store.js` 的报错文案，`classify` 正则不再命中 | 门禁错误退化成 400 `unknown`，用户看到错误码不对 | `rules.test.js` 对每条消息的映射断言（文案一改就红） | 修 `classify` 正则；store 不用动 |

### 12.2 不做项（交接文档已明确 + 本文档补充）

**交接文档明确不做**：拖拽改阶段、在面板里编辑岗位卡、多项目聚合视图。

**本文档补充不做**（评审不必再提）：

- 乐观锁 / `expectedRevision`（会改数据格式或写路径语义，单开一单）
- 面板修改 `wipLimit` 等配置（配置仍走 `<DSH_HOME>/org/config.json`）
- 面板写 `CHANGELOG.md`（`store.js` 已经写）
- HTML 交付物渲染预览（§9.5）
- 交付物目录浏览、二进制预览
- 在 `PATCH` 时施加在制上限（**现状就是只在建单时生效**，加它等于新增门禁，违反 I10）
- 撤单理由的空字符串校验（`store.js:136` 现状允许；面板只做按钮禁用）
- 工单搜索 / 筛选 / 排序偏好
- 从面板 `role_spawn` 派活

### 12.3 回滚总路径

- **数据**：零迁移。新代码只读老文件，不写 `schemaVersion` 以外的东西，回滚后 `.dsh/org` 与今天一致
- **代码**：改动 = 5 个新文件 + 2 个 `package.json` 的 1 行 + `tools.js` 内部重排 + `index.js` 挂载块。回滚 = 撤 `index.js` 的 `ctx.inject(['webServer'])` 块与客户端 `package.json`（面板消失），`tools.js` 保留 `rules.js` 也等价，无需回退
- **验收失败时**：删 `plugins/hyper-org/client/` 与 `package.json` 即回到「只有工具、没有面板」的今天，`org_order`/`org_board` 与所有测试不受影响

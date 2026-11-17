# 本工作区约定（dsh-hyper-mode）

DSH 的 bundle 仓库，pnpm monorepo：`packages/bundle` 是元包（只有补丁与 bundle 级元数据），
`packages/<name>` 是**每个插件一个真实包**。行的 `name` 一律写裸包根，不用相对路径或子路径。

**源码是 TypeScript，运行的是构建产物。** `src/` 进 git，`lib/` 是 `pnpm build` 生成的产物（已忽略）。
改完源码必须构建，否则 DSH 加载的还是旧的 `lib/`。

改插件前先读 `README.md` 与 `docs/HANDOFF.md`（现状、下一步、已核实的落点）。

## 三条硬规矩

1. **`.dsh/` 是本地运行状态，不是源码。** 岗位在 `.dsh/roles/`，工单在 `.dsh/org/orders/`；
   随包模板在 `packages/hyper-roles/roles/`。别把状态当代码改，也别指望它进 git（已忽略）。
2. **改完必须 `pnpm build`，再让 bundle 重载**：`plugin_manager set_bundle enabled=false` → `true`，
   以返回的 `application` 为准。`changed:false` 表示没重算，不算生效；`failed` 的诊断字段才有真实原因。
   改变了链接目标目录（例如换安装路径）需要重启 DSH。
3. **行 = 包 = Client = 元数据，四者必须在同一个真包上。** 这是本仓库的形状约束：
   - 只有**裸包根**能让行同时拿到自己的 Client 半边与自己的标题/图标/详情；相对路径行会丢元数据。
   - 一个包只能有一个活跃 Client 来源；多个 UI 塞进同一个包会让它们的生命周期绑死。
   - Client 半边**源码**可以拆成多个 `.tsx`，但**产物**必须是单个 `lib/client.js`：浏览器模块表是惰性
     CJS 表，`factory(require)` 只认 `react`、`react/jsx-runtime` 等基线，没有相对路径解析。所以
     `dsh.client` 永远指向构建后的那一个文件。

## 日常命令

| 想做什么 | 命令 |
|---|---|
| 装依赖 / 建 workspace 链接 | `pnpm install` |
| 构建全部包 | `pnpm build`（或 `bun scripts/build.ts <包名>` 只建一个） |
| 类型检查 | `pnpm typecheck` |
| 全部测试（先构建） | `pnpm test` |
| 一个包的测试 | `cd packages/<name> && bun test`（client 测试需要 `lib/client.js` 已构建） |
| 清掉构建产物 | `pnpm clean` |

## 新增插件

1. 建 `packages/<name>/src/index.ts`（导出 `apply` / `name` / `inject`，可选 `Config`）。
2. 有 UI 时写 `packages/<name>/src/client/index.tsx`，用**命名导出** `inject` / `apply`（以及测试用的 `__test`）。
   **不要在源码里自己调 `window.__ModuleLoader__.load`**：构建 banner 已经把整块产物包进
   `load({ id: <包名>, factory })` 并返回 `module.exports`；源码再调一次就是重复注册（DSH 直接抛
   `duplicate factory registration`，插件对象变成 `{}`）。
3. `packages/<name>/package.json`：`exports` 至少含 `"."`、`"./locale/*.json"`、`"./icon"`、`"./package.json"`；
   有 UI 才加 `"./client"`（指向 `./lib/client.js`）与 `dsh.client`；依赖 `@chrock-hyper/dsh-hyper-shared`。
4. 在 `packages/bundle/package.json` 的 `dependencies` 加 `"@chrock-hyper/dsh-<name>": "workspace:*"`。
5. 在 `packages/bundle/cordis.patch.yml` 加一行，`name` 写**裸包根**。
6. `pnpm install && pnpm build`。

跨包复用走具名入口（现有例子是 `@chrock-hyper/dsh-hyper-roles/internal`），不要 import 兄弟包的实现文件。
Host 的类型面在 `@chrock-hyper/dsh-hyper-shared/host`。

**随包（`@deepseek-ai/*`）走三件套，不写运行时探路径。** 要用哪个包就：

1. 在 `peerDependencies` 声明（装进 profile 后由 resolver 指到宿主副本）；
2. 在 `devDependencies` 声明（本地构建、类型检查、测试解析得到）；
3. 构建时保持 external（`build/config.ts` 的 `neverBundle`），让裸请求在运行时仍然存在。

然后正常写 `import { defineTool } from '@deepseek-ai/dsh-tools'`。**不要**再写按安装目录探路径的加载器：
那是为「link 安装下解析不到随包」准备的绕路，代价是模块级不能 import、每个调用点手写 interface。
peer 负责安装形态，dev 负责本地形态，external 保证运行时有裸请求。

## 新界面先 demo

新增页面 / 标签页 / 大改版这类「新界面」需求，先产出可交互 demo（单文件 HTML，双击可开）给用户确认，
确认后才改插件。demo 要说清哪些是真实数据/真实能力、哪些是示意，并覆盖空态 / 加载 / 错误 /
无项目根 / 窄屏；不要跳过确认直接交付实现。demo 放 `docs/demo/`，文件名带 `prototype`。

## 验证

- 单测：`pnpm test`
- Host 装配冒烟（读得到安装目录的 `@deepseek-ai/*`，必须用 Host 自己的运行时）：
  `ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-roles.mjs`（`smoke-wiki.mjs` 同理）
- 面板静态预览：`bun scripts/preview.mjs roles|wiki|orders` → `docs/demo/preview-*.html`
- 运行态：重载后 `cordis_inspect_query` 查 `Tool/listTools`，确认工具真的注册上了
- 委派深度默认 1：岗位子代理拉不起同级，跨岗位协作经主代理

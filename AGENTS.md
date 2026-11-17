# 本工作区约定（dsh-hyper-mode）

DSH 的 bundle 仓库，pnpm monorepo：`packages/bundle` 是元包（只有补丁与 bundle 级元数据），
`packages/<name>` 是**每个插件一个真实包**。行的 `name` 一律写裸包根，不用相对路径或子路径。

改插件前先读 `README.md` 与 `docs/HANDOFF.md`（现状、下一步、已核实的落点）。

## 三条硬规矩

1. **`.dsh/` 是本地运行状态，不是源码。** 岗位在 `.dsh/roles/`，工单在 `.dsh/org/orders/`；
   随包模板在 `packages/hyper-roles/roles/`。别把状态当代码改，也别指望它进 git（已忽略）。
2. **改完插件必须 bundle 重载**：`plugin_manager set_bundle enabled=false` → `true`，以返回的
   `application` 为准。`changed:false` 表示没重算，不算生效；`failed` 的诊断字段才有真实原因
   （链接安装的 import 失败不报堆栈，先本地 `bun -e "await import('./packages/<name>/src/index.js')"` 验一遍）。
   改了 `packages/bundle/cordis.patch.yml` 里的 preset 行属于 `unmanaged-plugin`，重载会返回
   `restart-required`，要重启 DSH。
3. **行 = 包 = Client = 元数据，四者必须在同一个真包上。** 这是本仓库的形状约束：
   - Loader 什么 `name` 都认，但只有**裸包根**能让行同时拿到自己的 Client 半边与自己的
     标题/图标/详情；相对路径行会丢元数据，子路径行会丢 Client。
   - 一个包只能有一个活跃 Client 来源；多个 UI 塞进同一个包会让它们的生命周期绑死。
   - Client 半边是**经典脚本**（`window.__ModuleLoader__.load({ id, factory })`），`factory(require)`
     只认基线模块与其他已注册包，**没有相对路径解析**——所以每个包的 `src/client/index.js`
     必须保持单文件，拆不动。要拆得先引入打包步骤。

## 新增插件

1. 建 `packages/<name>/src/index.js`（导出 `apply` / `name` / `inject`，可选 `Config`）。
2. 写 `packages/<name>/package.json`：`exports` 至少含 `"."`、`"./locale/*.json"`、`"./icon"`、
   `"./package.json"`；有 UI 才加 `"./client"` 与 `dsh.client`；依赖 `@chrock-studio/dsh-hyper-shared`。
3. 在 `packages/bundle/package.json` 的 `dependencies` 加 `"@chrock-studio/dsh-<name>": "workspace:*"`。
4. 在 `packages/bundle/cordis.patch.yml` 加一行，`name` 写**裸包根** `@chrock-studio/dsh-<name>`。
5. 回仓库根跑 `pnpm install`（建立 workspace 链接），否则补丁行解析不到模块。

不要让包互相 import 实现文件：跨包复用走具名入口（现有的例子是
`@chrock-studio/dsh-hyper-roles/internal`）。

## 新界面先 demo

新增页面 / 标签页 / 大改版这类「新界面」需求，先产出可交互 demo（单文件 HTML，双击可开）给用户确认，
确认后才改插件。demo 要说清哪些是真实数据/真实能力、哪些是示意，并覆盖空态 / 加载 / 错误 /
无项目根 / 窄屏；不要跳过确认直接交付实现。demo 放 `docs/demo/`，文件名带 `prototype`。

## 验证

- 单测：`pnpm test`（根目录跑全部），或 `cd packages/<name> && bun test`
- Host 装配冒烟（读得到安装目录的 `@deepseek-ai/*`，必须用 Host 自己的运行时）：
  `ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-roles.mjs`
- 面板静态预览：`bun scripts/preview.mjs roles|wiki|orders` → `docs/demo/preview-*.html`
- 运行态：重载后用 `cordis_inspect_query` 查 `Tool/listTools`，确认工具真的注册上了
- 委派深度默认 1：岗位子代理拉不起同级，跨岗位协作经主代理

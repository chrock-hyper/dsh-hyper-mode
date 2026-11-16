# 本工作区约定（dsh-hyper-mode）

DSH 的 bundle 仓库：`cordis.patch.yml` 是聚合点，每个插件一行；根 `index.js` 只是整包当单插件挂载时的兜底。

改插件前先读 `README.md` 与 `docs/HANDOFF.md`（现状、下一步、已核实的落点）。

## 三条硬规矩

1. **`.dsh/` 是本地运行状态，不是源码。** 岗位在 `.dsh/roles/`，工单在 `.dsh/org/orders/`；随包模板在 `plugins/hyper-roles/roles/`。别把状态当代码改，也别指望它进 git（已忽略）。
2. **改完插件必须 bundle 重载**：`set_bundle enabled=false` → `true`，以返回的 `application` 为准。`changed:false` 表示没重算，不算生效；`failed` 的诊断字段才有真实原因（链接安装的 import 失败不报堆栈，先本地 `bun -e "await import('./index.js')"` 验一遍）。
3. **面板客户端是源码直供，且一个包只能有一个活跃 loader 来源。** 新面板放独立嵌套包（`plugins/<name>/package.json` + `dsh.client`），不要塞进根包。

## 新界面先 demo

新增页面 / 标签页 / 大改版这类「新界面」需求，先产出可交互 demo（单文件 HTML，双击可开）给用户确认，确认后才改插件。demo 要说清哪些是真实数据/真实能力、哪些是示意，并覆盖空态 / 加载 / 错误 / 无项目根 / 窄屏；不要跳过确认直接交付实现。demo 放 `docs/demo/`，文件名带 `prototype`。

## 新增插件

`plugins/<name>/index.js` → 根 `package.json` 的 `exports` 加子路径 → `cordis.patch.yml` 加一行，**用相对路径**（`./plugins/<name>/index.js`）：Node 对 `exports` 有进程级缓存，新子路径在重载后仍可能报 `ERR_PACKAGE_PATH_NOT_EXPORTED`。

## 验证

- 单测：`cd plugins/<name> && bun test`
- 运行态：重载后用 `cordis_inspect_query` 查 `Tool/listTools`，确认工具真的注册上了
- 委派深度默认 1：岗位子代理拉不起同级，跨岗位协作经主代理

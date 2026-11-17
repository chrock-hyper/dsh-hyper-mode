# shared

跨插件共享的纯代码。**不是一个可挂载的插件**，不出现在 `cordis.patch.yml` 里。

插件通过包名引用（`workspace:*` 依赖），不做相对路径穿透：

```ts
import { findProjectRoot } from '@chrock-hyper/dsh-hyper-shared/paths'
```

现有内容：

- `paths.ts` — DSH 状态目录、项目根判定、路径安全、JSON 读取。
- `host.ts` — 插件实际用到的 Host 接口面（`HostContext`、服务形状、`Disposable` 等），纯类型。
- `package.json` — 只有 `exports`，没有构建产物：本包由各插件在打包时**内联**（`alwaysBundle`）。

随包（`@deepseek-ai/*`）不在这里中转：各插件用 peer + dev + external 自己声明、自己 `import`。

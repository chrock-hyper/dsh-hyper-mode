# shared

跨插件共享的纯代码。**不是一个可挂载的插件**，不出现在 `cordis.patch.yml` 里。

用法：插件内直接相对引用。

```js
import { groupConsecutive } from '../shared/batch.js'
```

现有内容：

- `shipped.js` — 按显式路径同步加载 DSH 随包提供的 `@deepseek-ai/*`（本地 `link:` 安装解析不到安装目录）。只允许在 `apply()` 里用，不要在模块作用域 import。

# shared

跨插件共享的纯代码。**不是一个可挂载的插件**，不出现在 `cordis.patch.yml` 里。

用法：插件内直接相对引用。

```js
import { groupConsecutive } from '../shared/batch.js'
```

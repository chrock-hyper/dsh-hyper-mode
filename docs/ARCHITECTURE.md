# 为什么这个仓库是 monorepo

这份文档解释一个设计决定：**为什么 bundle 不是「一个包 + 若干子路径导出」，而是「元包 + 每个插件一个真实包」。**

## 一、DSH 用三套键识别同一行

`packages/bundle/cordis.patch.yml` 里每一行都同时被三个子系统看见，而它们认的键不一样。

### 1. Loader：行

```yaml
- id: hyper-roles
  name: '@chrock-studio/dsh-hyper-roles'
```

`id` 是行自己的生命周期身份（启停、配置、日志），`name` 是模块规格符。Loader 对 `name` 最宽容：
包名、子路径、相对路径、`file:` URL、`cordis:` 内置都接受，import 之后调用模块导出的 `apply(ctx, config)`。

### 2. client-modules：包

包声明 `dsh.client` 并导出 `./client`。Host 侧的 client-modules 扫描**活跃行**，对每一行：

1. 从行模块向上找最近的 `package.json`；
2. 读它的 `dsh.client`；
3. 把该包的 Client bundle 加进启动图。

启动图按**包名**键，浏览器里每个包只注册一个 lazy factory。两条硬约束：

- **子路径行不会被当成 Client 行**：`exactPackageSpecifier` 对子路径返回空；
- **同一个包出现两个活跃来源**，`reconcilePackage` 直接抛错。

所以 Client 的生命周期跟着**包**走，不跟着行走。

### 3. Plugin Manager：裸包规格符

`readPluginMeta` 不加载插件，只读导出资源，并且要求 `barePackageName(name)` 能解析出包名：

- 根包：读 `package.json` 的 `name`/`description`/`icon` 与 `locale/*.json`；
- 子路径：读 `<specifier>/locale/*.json` 与 `<specifier>/icon`；
- 相对路径 / URL：**没有行级元数据**。

## 二、三者的交集只有裸包根

| 行的 `name` | Loader | Client | 行级元数据 |
|---|---|---|---|
| `pkg` | ✅ | ✅ 每包一份 | ✅ |
| `pkg/sub` | ✅ | ❌ 不是 Client 行 | ✅ |
| `./x/index.js` | ✅ | ✅ 最近 `package.json` | ❌ |
| `pkg` 出现在 N 行 | ✅ N 个实例 | ⚠️ 去重成一份 | ⚠️ 同一份 |

一句话：**Loader 什么都认；Client 只认包；元数据只认裸包名。**

一个组件想同时拥有「独立行 + 独立 Client + 独立元数据」，就必须在三个系统里是同一个真实包。

## 三、重构前的形状（C）

旧结构是一个根包 `@chrock-studio/dsh-hyper-mode`，插件放在 `plugins/<name>/index.js`，补丁行写相对路径
`./plugins/hyper-roles/index.js`；三个面板各自挂一个**嵌套 `package.json`** 当伪包，靠
`locatePkgJson → nearestPackage` 让 client-modules 认领。

代码本身是干净的，代价是身份模型：

- 行不是裸包规格符 → **每一行都没有自己的标题、图标、详情**，元数据只剩 bundle 级；
- 「一个包只能有一个活跃 Client 来源」逼出了嵌套伪包——包边界同时承担安装单位、Client 身份、
  元数据身份三件事，而这三件事在 DSH 里本该由同一个包承担；
- 想让某一行的面板独立启停，做不到。

## 四、重构后的形状（D）

```
packages/bundle/        元包：只有补丁、bundle 级 locale/icon/docs 与 workspace:* 依赖
packages/hyper-roles/   真包：Host 入口 + 自己的 dsh.client + locale + icon
packages/hyper-org/     真包：同上，依赖 hyper-roles
packages/hyper-wiki/    真包：同上
packages/shared/        纯代码库，不是 Loader 行
```

行 = 包 = Client = 元数据，四套身份在同一个包上对齐。每行可以单独启停，Plugin Manager 里
每行都有自己的标题、图标与详情页。

## 五、选 D 之后的硬规则

1. **元包不挂 Host、不声明 `dsh.client`。** 它只有 patch、bundle 级 locale/icon/docs，以及
   `workspace:*` 依赖。它插入多行，而一个包只能有一个活跃 Client 来源。
2. **每个插件是一个真实包，行名用裸包根。** 这是三套身份同时成立的交集。
3. **一个带 UI 的组件一个包。** 多个面板塞进同一个包会让它们的生命周期绑死。
4. **plugin 包导出 `./locale/*.json`、`./icon`、`./package.json`。** 行级元数据靠这三个导出。
5. **跨包复用走具名入口。** `hyper-org` 需要岗位的身份投影与岗位库，走
   `@chrock-studio/dsh-hyper-roles/internal`，不直接 import 兄弟包的实现文件。
6. **Client 半边只 `require` 基线模块。** 浏览器模块表只种了 `react` 这类基线；在 Client 里
   runtime import `@deepseek-ai/*` 会让整包加载失败。Client 半边因此是**单文件经典脚本**，
   没有相对路径解析——拆分它必须先引入打包步骤。
7. **N=1 与 N=10 同构。** 加包 = 加目录 + 加依赖 + 加一行补丁，元包不需要为新插件改代码。

## 六、本地 link 的边界

`dsh plugin add` 对本地目录用 `link:`。`workspace:*` 只在 workspace 内解析，所以：

- 安装目标是 **`packages/bundle`**，不是仓库根；
- 元包的 `packages/bundle/node_modules/` 里必须有各插件包的 workspace 链接，所以改包结构后
  要回仓库根跑 `pnpm install`；
- link 能验「组合」（行挂上、Client 加载、config 生效），**不一定能验「实例共享」**：
  只 link 元包时插件包的真实路径在元包之外，静态 import 会落到 workspace 副本。

## 七、这一轮没做的事

- **没有构建步骤。** 源码直接是 `src/*.js`，`exports` 指向源码；模板里的 tsdown + `lib/` 产物
  留给下一步的 TypeScript 迁移。Client 半边的拆分也依赖那一步。
- **包保持 `private: true`，只做本地 link。** 没有 `files` 白名单、`engines.dsh` 与 `pack:check`；
  要发布时再按模板补。

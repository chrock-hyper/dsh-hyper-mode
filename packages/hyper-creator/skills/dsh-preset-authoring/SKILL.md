---
name: dsh-preset-authoring
description: 给 DeepSeek Harness 新建或改造 agent 预设（会话模式）时使用——要从内置预设派生、判断某个插件该放 Host 顶层还是 preset 作用域、写 cordis.patch.yml 的 preset 声明、给预设挂自己的 skill 目录，或诊断「bundle 装上了但模式没起来」。加载与模块解析的问题看 dsh-bundle-authoring。
---

# 造一个能挂上的 agent 预设

预设就是一条 `@deepseek-ai/dsh-agent-preset` 声明，随 bundle 的补丁安装。格式的权威文档在 `dsh-doc` 的 `references/compositions.md` 与 `references/composition-reference.md`；本篇是可执行的流程，以及会静默失败的那几处。

## 0. 读基线，确认 id 没被占用

内置预设是 `@deepseek-ai/dsh-web-app` 的 `presets/<id>.patch.yml`：`standard`、`ptc`、`minimal`、`cordis`。`minimal` 最短，适合当模板；`cordis`（Creator）这类能力齐的，适合当派生源。

用文件读取工具读，不要 `ls`/`cat`：桌面版的包在 `app.asar` 里，只有文件工具能进去。

顺带确认目标 id 可用。预设 id 在 profile 内**全局唯一**，重名不是覆盖，而是声明加载失败（registry 抛 `Duplicate agent preset: <id>`）。现存的行看 `plugin_manager list_plugins` 或 `Config.listConfigs`。

**完成判据**：能报出基线文件路径、它挂了多少行、目标 id 未被占用。

## 1. 决定放置：Host 顶层，还是 preset 里

每个插件行只有两个家：

| 行提供什么 | 放哪 | 为什么 |
|---|---|---|
| 共享服务（工具/提示词注册表、Agent 循环、会话、持久化、设置、沙箱策略、模型路由、子 agent 后端），或要对**所有会话**生效的能力 | **Host 顶层行** | 唯一实例；用户在 Plugins 里能单独启用/禁用 |
| 作用域内的工具、persona、提示词段、策略——属于某个模式的 | **preset 的 `plugins`** | 只在该模式的会话里可见 |
| **工具执行器** | **preset 的 `plugins`** | 每个作用域只允许一个执行器，根作用域已被内置的那个占住 |

两条边界容易踩：

- **服务提供者与它的消费者必须同 realm**。preset 里的插件要供服务，就把提供者和消费者一起 `isolate`；被 Host 插件消费的服务只能放 Host。
- **「组件」= 补丁顶层行**。Plugins 页的组件列表只数顶层行（`group` 行会被递归），preset 的 `plugins` 子项不在其中——组件里看不到某个预设内部插件，不代表它没挂上。

所有权是清楚的：模式本身是一个组件，它的执行器/提示词/工具集跟着模式走；与模式无关的能力做成顶层组件，用户按需开关。

**完成判据**：每条要新增的行都写了归属与理由；没有任何服务跨 realm 被消费。

## 2. 从基线派生，不要手抄

内置预设二十几行、每行带 `config`。手抄的失败方式是**漏行**和**漏字段**，而且不报错——模式只是少了个能力，看起来还能用。

做法：脚本读基线 → 只做你列出的替换 → 断言每处替换恰好命中一次 → 打印 diff 和行数变化，确认等于预期集合。骨架见 `reference.md`。

**完成判据**：diff 能逐条说出理由；多一处或少一处都回退重跑。

## 3. 写声明

```yaml
- insert:
    - id: preset-<id>                 # Loader 行 id 的约定
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: <id>                      # 必填，小写字母/数字/连字符
        name: <显示名>
        description: <一句给用户看的话>
        order: 6                      # roster 位置
        plugins: [ ... ]              # 必填的 Cordis 条目列表
```

改内置预设时按 Loader 行 id 覆盖，而不是 insert：`config` 是**整体替换**，必须重述全部字段；`name` 只用来断言插件名，不会改名。

`!!js` 只放在插件 `config` 或 `disabled` 里。`config` 里的表达式在该插件的上下文上求值（`with (ctx) { eval(expr) }`），能拿到 `ctx.<service>` 和 `baseUrl`；行级元数据保持字面量。

**完成判据**：补丁能被 YAML 解析；行数与每层条目数符合预期；每个 `name` 都是可解析的包 specifier。

## 4. 预设自己的资产：skill 目录

预设要带 skill，需要 `skill-filesystem` 行（web-app 把 Host 那行关了，本地发现归 preset 管）与 `tool-skill` 行（它才把这个 agent 接上目录与加载器）；`skill` 注册表留在 Host 层。目录本身加进 `customSkillDirs`：

```yaml
          - id: skill-filesystem
            name: '@deepseek-ai/dsh-skill-filesystem'
            config:
              customSkillDirs:
                # 表达式要返回一个绝对目录
                - !!js >-
                    ...
```

布局是 `<目录>/<skill 名>/SKILL.md`（或根下的 `<名>.md`）。frontmatter 必须有 `name` 和 `description`，`name` 要匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`。不合规的 SKILL.md 只写一条 warn 然后被忽略——又一处静默失败。

路径按**包根**锚定：`baseUrl` 是补丁文件所在目录的 file URL，所以 `new URL('.', baseUrl)` 就是包根。两条硬要求：

- 表达式**不能抛错**。它一抛，`skill-filesystem` 整行 `never started`，这个模式的全部 skill 一起消失；
- **不要返回空串**。空串被 `resolve` 成当前工作目录，会被当成 skill 根去扫。

目录不存在是安全的（provider 会跳过），所以保底可以返回一个必定不存在的路径。完整配方见 `reference.md`。

**完成判据**：表达式在 file URL、URL 对象、纯路径三种输入下都返回存在的目录；其中每个 SKILL.md 的 name 与 description 都合规。

## 5. 装，然后用新会话验

用 `plugin_manager install_bundle`，不要手改 profile 的 `package.json` 或 `cordis.patch.yml`。

按顺序验证，每步给出结论：

1. 声明行在 roster 上：`preset-<id>` 有 fiber、诊断为空；
2. `Config.listConfigs name=@deepseek-ai/dsh-agent-preset` 能查到该行、schema 正常；
3. **新会话**选该模式，检查工具面与 skill 列表；
4. 让验收留下**宿主侧证据**（文件、`stat`、inspect 输出），由你独立核对——模型的自我汇报不算证据。

两个时间陷阱：

- **旧会话保留它启动时的 revision**。改过预设，一定在新会话里验。
- **`applied` 与 `status: schema` 都不是活性信号**：前者只说明包装进了 profile。活性看行为变化，`version` 也不是活性信号。

**完成判据**：新会话里能列出预期的工具与 skill；验收证据由宿主侧独立确认。

## 6. 没起来时

| 诊断 | 含义 | 下一步 |
|---|---|---|
| `never started` | 该行的模块导入失败，原因只在 Host 日志（loader 吞了） | 按 `dsh-bundle-authoring` 把 shipped 包解析推迟到 `apply()`，让失败变可见 |
| `failed: <详情>` | 激活抛错 | 读详情；`cannot resolve … (tried: …)` 说明锚点不对 |
| `waiting for <service>` | `inject` 的服务没供上 | 检查提供者与消费者是否在同一个 realm |
| 组件列表少一项 | 那一项可能是 preset 子项 | 用 `list_bundles` 的 `rows` 看顶层行的真实组成 |

重载与重启：Host 顶层行的代码改动，禁用→启用 bundle 即可生效；**preset 里挂的行记为 `unmanaged-plugin`，要重启 DSH**。

## 参考

- `reference.md`——声明字段、放置与 realm、`!!js` 锚点配方、诊断对照、验证命令、派生脚本骨架
- `dsh-bundle-authoring`——模块解析与「装上了但加载不了」的排查
- 本仓库 `docs/NOTES.md`——这套方法在真实 bundle 上的实验记录

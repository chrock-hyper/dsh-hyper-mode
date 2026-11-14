# hyper-wiki · 会话内的 Wiki

约定优先的 Markdown 知识库：给 Agent 一个 `wiki` 工具，给你一个会话里的「Wiki」标签页，给全局库一份 git 历史。

目录与文件就是产物——`~/.dsh/wiki/`（全局）和 `<projectRoot>/.dsh/wiki/`（项目）里的 Markdown 不依赖本插件也能被任何编辑器或 Agent 读写。插件只负责校验约定、把草稿 diff 摆到你面前、把确认做成一次点击。

## 安装与入口

它是 `@chrock-studio/dsh-hyper-mode` bundle 里的一行（`cordis.patch.yml` 的 `hyper-wiki`），不需要单独安装。

装好 bundle、新开一个会话后，会话标题下方会多出 **Wiki** 标签页（与「对话」「轨迹」「统计」同一排）。标签页自带会话 id，项目作用域直接取当前会话的工作目录——没有“选项目”这一步；没有会话时标签页也不存在。

`package.json` 只声明标签页的 `dsh.client`（独立嵌套包）：`dsh-client-modules` 不允许同一个包出现多个活跃来源，所以面板的浏览器半边必须挂在自己的清单上，与 `hyper-roles` 同理。

## 快速开始

```markdown
<!-- ~/.dsh/wiki.md —— 你维护的契约文件 -->
- 全局库放跨项目的长期知识：术语、约定、决策记录。
- 一页讲一件事；标题就是检索入口。
- 链接一律用相对 Markdown 链接。
```

然后在会话里：

```
你：把今天我们确定的错误码规范写进 wiki
Agent：（调用 wiki 工具，action=draft，path=guide/error-codes）
     已写入草稿 drafts/guide/error-codes.md，等你在 Wiki 面板批准。
```

会话里的 **Wiki** 标签页 → 左侧选中该页 → 中栏「草稿对比」看增删行 → 右栏 **批准**。写页面、更新 `updated`、删除草稿、全局库提交，一次点击完成。

## 文件布局

```
plugins/hyper-wiki/
├─ index.js                    # 组装：config、工具、提示段、HTTP 路由、随包 skill
├─ package.json                # 嵌套包：只声明标签页的 dsh.client
├─ lib/shipped.js              # loadShipped 的本地副本（shipped 包只能在 apply() 里加载）
├─ lib/scopes.js               # 两个作用域的路径、最近项目、原子写
├─ lib/page.js                 # frontmatter 解析/序列化、页面 id 校验、sha1
├─ lib/draft.js                # 草稿镜像路径、draft: 块、批准/打回状态机
├─ lib/links.js                # 相对链接归一化与反链
├─ lib/search.js               # 零依赖检索与权重
├─ lib/store.js                # 全部文件副作用（含 .trash 与提交）
├─ lib/git.js                  # 仅全局库：init / add / commit，失败降级
├─ lib/api.js                  # /wiki 路由、鉴权、256 KiB 体上限
├─ lib/tools.js                # 单个 wiki 工具，六个 action
├─ lib/prompt.js               # 最多四行的系统提示段
├─ client/client.js            # 手写浏览器模块（无构建）：侧栏行 + main 面板
├─ skills/wiki-draft-review/   # 随包 skill：写完草稿后如何交接审核
├─ locale/{zh,en}.json         # bundle 在插件管理器里的标题/描述/详情页
├─ icon.svg
├─ docs/DETAIL.md              # 功能、用法、限制
├─ VERIFY.md                   # 手工验收步骤
└─ test/*.test.js              # bun test
```

## 工具

`wiki` 一个工具、六个动作：`list` / `search` / `read` / `draft` / `status` / `backlinks`。没有批准、打回、删除、重命名——那些是人（面板）的权限。

参数：`action`（必填）、`path`、`query`、`scope`、`content`、`title`、`tags`、`status`。

## 配置

补丁行可以带 `config`，全部有默认值；写错类型会回退默认值而不是让插件启动失败：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `home` | `$DSH_HOME` → `~/.dsh` | 全局库所在 home（必须是绝对路径） |
| `prompt` | `true` | 是否注入系统提示段 |
| `git` | `true` | 全局库是否维护 git 历史 |
| `gitBin` | `git` | git 可执行文件 |
| `maxResults` | `20` | 检索上限（1–200） |
| `recentProjects` | `8` | 面板记住的最近项目数（1–50） |
| `skill` | `true` | 是否注册随包 skill |

## 开发与测试

```sh
bun test plugins/hyper-wiki/test
```

测试只用 `mkdtempSync` 临时目录，不连网络；git 相关测试在临时目录里真的建仓，缺 git 的降级路径用不存在的 `gitBin` 模拟。

## 文档

- [docs/DETAIL.md](docs/DETAIL.md)：功能、用法、HTTP 接口、限制。
- [VERIFY.md](VERIFY.md)：安装后的手工验收清单。

## 许可

MIT。

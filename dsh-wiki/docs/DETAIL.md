# Wiki · 功能、用法与限制

Wiki 把"知识库"当成一组有约定的 Markdown 文件，而不是一个需要专用编辑器的系统。目录与文件本身就能被任何 Agent、编辑器、`grep` 读懂；插件只负责三件事：**校验约定**、**把草稿摆到人面前**、**把确认做成一次点击**。

## 两个互相独立的库

| 作用域 | 页面目录 | 契约文件 | git |
| --- | --- | --- | --- |
| 全局 | `$DSH_HOME/wiki/**/*.md`（默认 `~/.dsh/wiki/`） | `$DSH_HOME/wiki.md` | 有：`wiki/` 是独立仓库 |
| 项目 | `<projectRoot>/.dsh/wiki/**/*.md` | `<projectRoot>/.dsh/wiki.md` | 无，绝不执行 git |

`projectRoot` 是会话工作目录最近的含 `.git` 祖先。两个库完全独立：同名页面互不影响。工具默认同时读两边并标出 `scope`；写草稿时，如果调用者在一个项目里，就默认写进项目库。

## 文件布局

```
<scope>/wiki.md                  # 契约文件，人维护；Agent 不得写
<scope>/wiki/**/*.md             # 页面；相对路径就是页面 id（允许中文与 -）
<scope>/wiki/drafts/**/*.md      # 镜像草稿：drafts/xxx/yy.md 对应 xxx/yy.md
<scope>/wiki/.trash/<path>.<ts>.md
<scope>/wiki/.git/               # 仅全局库
<scope>/wiki/state.json          # 仅全局库；面板的最近项目，不进 git
```

`drafts/`、`.trash/` 以及任何以 `.` 开头的路径都是保留名，不能再作为页面前缀。页面 id 可以带或不带 `.md`，插件统一规范化。

## 页面格式

```markdown
---
title: 术语表
tags: 术语, 约定
status: stable
updated: 2026-11-15
---

正文。
```

- `status` 只接受 `stable` / `wip` / `deprecated`；写错的页面仍可读，列表里保留原值并给出解析提示。
- `updated` 是 ISO 日期，由插件在**批准时**维护，人不需要手写。
- 链接只支持相对 Markdown 链接，例如 `[术语](./dir/page.md)`；不支持 `[[ ]]`。反链由扫描全库相对链接归一化得到，外链、锚点、图片会被忽略。

## 给 Agent：`wiki` 工具

一个工具、六个动作：`list`、`search`、`read`、`draft`、`status`、`backlinks`。**工具没有批准能力**，这是设计而不是遗漏。

| 动作 | 作用 | 关键参数 |
| --- | --- | --- |
| `list` | 列出两个库的页面（带 `scope`） | `scope` |
| `search` | 按 `title`(×3) / `tags`(×2) / 文件名(×2) 的子串检索，上限 20 | `query` |
| `read` | 读一页，附带草稿状态与反链 | `path` |
| `draft` | 写/覆盖镜像草稿，返回 `{ draftPath, base, created|replaced }` | `path`、`content`、`title`、`tags`、`status` |
| `status` | 列出**自己**的草稿与打回理由 | — |
| `backlinks` | 谁链接到这一页 | `path` |

`content` 可以是带 frontmatter 的完整页面，也可以只是正文；显式的 `title`/`tags`/`status` 优先。

## 给人类：Wiki 面板

侧栏 **Wiki** 一行（带待审数字角标）打开一个三栏页面：

- 左：搜索框 + 页面树（状态点、草稿标记）+ 待审队列。
- 中：`源码` / `预览` / `草稿对比` 三个页签。草稿对比显示相对当前正文的增删行。
- 右：页面信息、反链、草稿卡片，以及 **批准 / 强制覆盖 / 打回 / 删除 / 重命名**。

顶部可以在全局库和项目库之间切换；项目库的目标目录来自 Agent 调用工具时记录的最近项目，也可以在顶栏下拉里选。

## 草稿与批准

草稿内容 = 页面 frontmatter + `draft:` 块 + 正文：

```yaml
draft:
  status: pending        # 或 rejected
  author: wiki-builder   # 由调用者的 subagent 名字决定
  base: 9f2c…            # 页面正文的 sha1；新页面为 new
  updated: 2026-11-15T03:04:05.000Z
  reason: …              # 仅打回时写
```

- 单页单草稿：新草稿覆盖旧的。
- **批准**：剥离 `draft:` 块、写入页面、删除草稿、维护 `updated`（全局库并提交）。
- **打回**：保留草稿文件，写入 `reason` 与新的 `updated`。
- **冲突**：`base` 与当前正文的 sha1 不一致时拒绝批准；`force` 可覆盖，面板会二次确认。

## git

只有全局库有历史：首次变更时若 `wiki/` 下没有 `.git` 就 `git init`，批准/删除/重命名后 `git add -A && git commit -m "wiki: …"`。`.gitignore` 会排除 `state.json`（面板导航状态）和 `.trash/`。git 缺失或命令失败只记日志并降级——变更本身照常完成。

## HTTP 接口

面板通过 `/wiki` 前缀路由读写，所有请求先经过组合的 `connection` 服务鉴权（Host/Origin 围栏 + 浏览器登录态）；没有该服务时只接受 loopback。请求体上限 256 KiB。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/wiki/state` | 两个库的存在性、页数、待审数、最近项目 |
| GET | `/wiki/pages` | 某库页面列表 |
| GET | `/wiki/page?path=` | 一页正文 + 草稿 + 反链 |
| GET | `/wiki/drafts` | 草稿列表 |
| GET | `/wiki/pending` | 待审总数（侧栏角标轮询） |
| GET | `/wiki/search?q=` | 检索 |
| GET | `/wiki/backlinks?path=` | 反链 |
| POST | `/wiki/draft` | 建/覆盖草稿 |
| POST | `/wiki/approve` | 批准（`force` 可选） |
| POST | `/wiki/reject` | 打回（`reason`） |
| POST | `/wiki/page` | 面板直接保存页面 |
| POST | `/wiki/delete` | 移入 `.trash` |
| POST | `/wiki/rename` | 只移动文件，返回受影响入链 |

状态码：400 参数/路径不合法，401/403 鉴权失败，404 页面或路由不存在，409 冲突（如 stale 草稿、重命名目标已存在），413 请求体过大，405 方法不对。

## 提示注入

当且仅当某个作用域真的有 wiki（有 `wiki.md`，或至少一页）时，注入最多四行的系统提示段：库路径、`wiki` 工具用法、"写内容一律进 `drafts/` 等人批准"、链接写法。没有 wiki 的 profile 不为此付出任何 token。

## 随包 skill

`skills/wiki-draft-review/SKILL.md` 通过 `ctx.skills.register()` 注册为 `runtime` skill（预设在有 `skills` 服务时生效）。它引导：先读现状 → 用 `draft` 写 → 请人审核 → 被拒后读理由重写。

## 已知限制（一期之外）

- 不做图片/附件、向量检索、批量导入、富文本。
- 不做页面历史快照——全局库靠 git，项目库靠项目自己的版本控制。
- 重命名**不改写**别人页面里的链接，只返回受影响入链清单。
- 一个页面只有一个草稿，没有多分支草稿或队列。
- 面板的中间编辑器保存的是**页面本身**（人的权限）；Agent 永远只能写草稿。
- 聊天内提醒（actionCard）未启用：注册 kind 需要 `zod` 细节模型与一个 `conversation.chat.node` 渲染器，且 `propose_action` 拒绝子代理调用。当前用侧栏待审角标 + 随包 skill 达到同样效果。

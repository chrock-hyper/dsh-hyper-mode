# 手工验收

`bun test dsh-wiki/test` 覆盖纯逻辑、文件副作用与 `/wiki` 路由。下面这些只能在真实 Host + 浏览器里确认。

## 0. 前置

- [ ] 本目录已作为 bundle 安装（**Plugins** → **Add plugin**），插件行 `dsh-wiki` 处于启用状态。
- [ ] 打开一个新会话（确保新代码被加载）。
- [ ] 确认 `~/.dsh/wiki/` 与 `~/.dsh/wiki.md` 中的一个存在（仅当存在时才会注入提示段）。

## 1. 插件管理器元数据

- [ ] **Plugins** 里能看到 **Wiki** 一行，标题/描述来自 `locale/zh.json`（中文界面）或 `locale/en.json`（英文界面）。
- [ ] 打开详情页，正文来自 `docs/DETAIL.md`，没有 metadata 诊断信息。
- [ ] 图标是自己画的页面+链接图案（不是默认图标），浅色/深色下都可辨认。

## 2. 工具

- [ ] 新会话的工具表里有 `wiki`；它的参数只有 `action/path/query/scope/content/title/tags/status`，没有任何 approve/reject/force/reason/actor 参数。
- [ ] 让 Agent 执行 `action: "list"`：返回两个库里已有的页面并标出 `scope`；没有任何库时给出"还没有页面"的提示。
- [ ] 让 Agent 执行 `action: "draft"` 写一个**新**页面：返回 `{ draftPath, base: "new", created: true }`，磁盘上出现 `drafts/<path>`，而 `<path>` 本身不存在。
- [ ] 再次 `draft` 同一路径：返回 `replaced: true`，草稿文件被覆盖（仍然只有一个文件）。
- [ ] `action: "draft"` 带 `path: "drafts/x.md"` 或 `"../x.md"`：被拒绝（invalid_path），磁盘上没有逃逸文件。
- [ ] `action: "status"` 只列出自己写的草稿；换个 Agent 名字再查，看不到别人的。
- [ ] `action: "backlinks"` 对一页返回链接到它的页面；外链、锚点、图片不计入。

## 3. 提示段

- [ ] 有 wiki 的会话中，系统提示里出现最多四行 Wiki 段：两个库路径、`wiki` 工具用法、草稿规则、链接写法。
- [ ] 删掉 `~/.dsh/wiki.md` 与 `~/.dsh/wiki/`（或在没有 wiki 的 profile 里）后新会话不再出现该段。
- [ ] 仅存在 `~/.dsh/wiki/state.json`（例如刚用过面板）不应触发注入——需要真的有一页或契约文件。

## 4. 面板

- [ ] 侧栏出现 **Wiki**，位置在 Scheduled tasks 附近（`order: 40`），图标在这个面板选中时高亮。
- [ ] 有待审草稿时，侧栏图标出现数字角标；批准后角标减少/消失（最多 20 秒轮询）。
- [ ] 点开面板：左栏页面树、中栏源码、右栏信息。顶部能切换 **全局 / 项目**；项目下拉列出最近项目。
- [ ] 中栏三个页签：`源码`（只读）、`预览`（纯文本渲染，标题/列表/引用/代码块可读）、`草稿对比`（有草稿时显示 `+`/`-` 行）。
- [ ] 点 `编辑` 后源码可改、`保存页面` 写入并刷新 `updated`；取消后丢弃改动。
- [ ] 右栏 `批准` 在有草稿时可用；批准后页面正文更新、草稿消失、反链仍在。
- [ ] 先批准一版页面，再让 Agent 基于旧内容起草后人工改页面 → 面板显示 `强制覆盖…`，点开有二次确认；确认后覆盖成功。
- [ ] `打回…` 输入理由：草稿保留，`status: rejected`，理由显示在右栏与 Agent 的 `status` 结果里。
- [ ] `删除…` 后页面从树里消失，`.trash/<path>.<ts>.md` 出现。
- [ ] `重命名…` 后文件移动、其它页面内容未被改写，返回的受影响反链在通知里可见。
- [ ] 缩放窗口到窄宽度：右栏改到编辑器下方（批准/打回按钮仍然可达），不出现横向滚动条。

## 5. git（仅全局库）

- [ ] 第一次批准/删除/重命名后 `~/.dsh/wiki/.git` 出现，`git -C ~/.dsh/wiki log --oneline` 有 `wiki: …` 提交。
- [ ] `git -C ~/.dsh/wiki ls-files` 不含 `state.json`。
- [ ] 项目库（`<project>/.dsh/wiki`）下**没有** `.git`，也没有提交记录。
- [ ] 临时把补丁行配置成 `gitBin: /nonexistent/git`：批准仍然成功，只多一条 debug 日志。

## 6. 鉴权与路由

- [ ] 打开面板时 `/wiki/*` 请求返回 200（浏览器已带登录态）。
- [ ] 用 `curl` 从本机访问 `http://127.0.0.1:<port>/wiki/pages?scope=global`：有 `connection` 服务时按登录态判定（未认证返回 401/403）。
- [ ] `PUT /wiki/pages` 返回 405 且带 `Allow`；不存在的子路径返回 404；`POST /wiki/draft` 带 `"path": "drafts/x.md"` 返回 400；超过 256 KiB 的请求体返回 413。

## 7. 降级

- [ ] 没有 `skills` 服务时插件仍启动（只是没有 `wiki-draft-review` skill）。
- [ ] 没有 `webServer` 时工具仍然可用，面板不可用（日志有一条 warn）。
- [ ] 主目录只读：工具调用返回明确的失败文本，而不是抛异常拖垮会话。

## 记录

验收时把发现的问题写在这里（版本、现象、复现步骤），修完再勾选。渲染细节（间距、深色主题、窄屏）必须在真实页面里看过才算了。

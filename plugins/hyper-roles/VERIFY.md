# 岗位（hyper-roles）验收

前置：`bun test` 全绿、`scripts/smoke-roles.mjs` 通过。

```bash
bun test
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-roles.mjs
```

安装/更新 bundle 后，Host 行会随 bundle 重载生效（不需要重启 DSH）；标签页是浏览器模块，重载后**刷新页面**再验证。

## 1. 标签页出现并能写文件

1. 会话标题下方出现「岗位」标签页（对话 / 轨迹 / 统计 / 岗位 / Wiki）。
2. 作用域默认「本项目」——它取自当前会话的工作目录，不需要选目录。
3. 「新建岗位」就地展开表单：id `reviewer`、名称 `代码评审员`；填正文后保存。
4. 宿主侧核对：`ls <项目>/.dsh/roles/` 应出现 `reviewer.md` 与 `CHANGELOG.md`；卡片里 `version: 1`。
5. 再保存一次：版本变 2，CHANGELOG 多一行。

## 2. 岗位绑定（两条路径都要验证）

在会话里：

```
用 role_spawn 把「评审 src/index.js 的这个改动」交给 reviewer 岗位，name 用 peer。
```

- 子代理首轮回复里应引用自己的职责（而不是只在被问时才查）。
- 在子代理里执行 `role` 的 `action=brief`：返回同一张卡 + 最近经验 + 指导路径。
- 子代理 `role action=note` 写一条经验：`reviewee.notes.md` 出现 `## <时间> · <子代理名>`。

第二条路径（证明绑定来自会话日志，而不是专有通道）：

```
用内置 subagent 工具起一个子代理，任务首行写 <!-- role:reviewer -->，其余随便问它「你现在是什么岗位」。
```

- 子代理应报出 `reviewer`，且 `role action=brief` 能读到卡片。

## 3. 权限

- 子代理里调用 `role_edit action=update id=reviewer`：应失败，理由是「没有 edit-roles 权限」。
- 主代理（未绑定岗位）执行同样的调用：成功，版本 +1。
- 给某岗位加 `can: train` 后，它能替别的岗位写笔记；没有该权限时跨岗位写笔记被拒。

## 4. 冲突与归档

- 打开岗位 A 但不保存；用工具把 A 改成 v2；面板点保存 → 提示「已被他人修改（v1 → v2）」，不覆盖。
- 归档 A：`<作用域>/roles/.archive/A.<时间戳>/` 下应有 `A.md`、`A.notes.md`、`A.guide.md`；再新建同名岗位不报错。
- 若全局也有同名 A：归档项目 A 后，`role action=read` 应解析到全局版本。

## 5. 作用域

- 同一 id 在项目与全局各建一份：面板列表里全局那份标「覆盖全局」；`role action=read` 返回项目版本。
- 没有 `.git` 的目录作为项目根时，项目作用域落在该目录下的 `.dsh/roles`。

## 6. 路由鉴权

用应用里显示的地址（形如 `http://127.0.0.1:<port>`）：

```bash
# 无凭据：应 401（有 connection carrier 时）或 403（无 carrier 且非 loopback）
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:<port>/hyper-roles/api/state'

# 带浏览器凭据：应 200 且返回 JSON
curl -s -b '<从浏览器复制的 cookie>' 'http://127.0.0.1:<port>/hyper-roles/api/state' | head -c 400
```

## 7. 培训员（端到端）

1. 面板「新建岗位」旁边没有直接建会话的入口时，用「复制岗位提示词」拿到 `trainer` 卡片（先把随包 trainer 复制到某个作用域）。
2. 新会话首条消息粘贴该提示词（首行是 `<!-- role:trainer -->`），给出一个真实小案例。
3. 期望：培训员用 `role_spawn` 起 2–3 个岗位子代理 → 汇总 → `send_message` 交叉回灌 → 各子代理写经验 → 培训员产出报告。

## 8. 已知未验证

- 面板在真实浏览器里的视觉与交互（需要安装后人工过一遍；本仓库的单元测试只校验了模块格式与槽位注册）。
- 子代理在 `maxDepth: 0` 的组合里调用 `role_spawn` 的报错文案（由 provider 返回）。
- 岗位卡片很大（>6000 字符）时的截断体验。

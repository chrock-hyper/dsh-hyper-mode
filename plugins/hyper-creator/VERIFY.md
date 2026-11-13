# 验收案例 HYBRID-1

目标：证明 `hyper-creator` 预设里**直呼工具**与 **`run_code` 程序**同时可用，且两者能在一条回复里混用、结果不错位。

## 前置

- 在 **`/Users/juergenie/Projects/Workspaces/DSH`** 这个工作区里**新建会话**（写文件才不会被沙箱拦）。
- 模式选「**强化创造模式（混合执行）**」。
- 只需一轮：把下面的代码块整段粘贴进去，不要再追加说明。

## 粘贴这段

```text
这是一个验收任务，请严格按 A → B → C 顺序做完，不要跳步、不要合并步骤、不要自行"优化"。

A（直呼验证）：直接调用 cordis_inspect_list（不要经过 run_code），把返回里 host 与 client 两边的 provider id 列出来。

B（程序验证）：调用一次 run_code，程序体只做 introspection，不要真的调用 workflow 或 subagent（会起子 agent）。返回值是一个对象，逐项给出这些绑定名的 typeof：
bash, read, edit, workflow, subagent, cordis_inspect_list, plugin_manager
然后 console.log 打印一行：PTB=<bash 的 typeof>

C（混合验证，重点）：在**同一条回复**里连续发出下面三个工具调用（必须一批发出，不要分成多步）：
1) 直接调用 bash：printf 'H1-direct\n' >> /Users/juergenie/Projects/Workspaces/DSH/_hybrid-verify.txt
2) 调用 run_code：程序里只做一件事—— await tools.bash({ description: 'append H2', command: "printf 'H2-program\\n' >> /Users/juergenie/Projects/Workspaces/DSH/_hybrid-verify.txt" })
3) 直接调用 bash：printf 'H3-direct\n' >> /Users/juergenie/Projects/Workspaces/DSH/_hybrid-verify.txt

D（回读）：直接调用 read 读取 /Users/juergenie/Projects/Workspaces/DSH/_hybrid-verify.txt，把文件内容原样贴出来（三行）。

最后用一张表汇报：A/B/C/D 每步你实际发出的工具名、关键返回值，并明确回答一句：C 步那三个调用是"同一批发出"还是"分步发出"。
```

## 预期结果

| 步骤 | 期望 | 失败时的含义 |
|---|---|---|
| A | 直接调用成功，列出 host providers（Service/Event/Config/Tool 等）与 client providers | 报 `UNKNOWN_TOOL`/只允许 `run_code` → 执行器没换掉，会话还跑在纯 PTC 预设上 |
| B | 七个名全是 `function`；`PTB=function` | 某个为 `undefined`（尤其 `bash`）→ SDK 块没渲染；`workflow` 缺 → 预设不是以 Creator 为基线 |
| C | 三个调用**同批**发出；模型自述"同一批" | 分步发出 → 混合批路径没被覆盖（不算失败，但这条没验到） |
| D | 文件内容恰好三行，顺序 `H1-direct` / `H2-program` / `H3-direct` | 顺序错 → 分段串行化坏；行缺失 → 某个形状的调用没执行 |

## 我这边怎么独立核验

你跑完后我可以直接读 `/Users/juergenie/Projects/Workspaces/DSH/_hybrid-verify.txt`：

```bash
cat /Users/juergenie/Projects/Workspaces/DSH/_hybrid-verify.txt
```

三行且顺序正确 = C 步的**效果顺序**成立，与模型自述无关。行数不对或顺序错乱，就说明 `groupConsecutive` / 分段执行有问题。

> 注意：模型自述"同一批"仍可能记错。真正证明混合批走通的是——模型在**同一条 assistant 消息**里发出形状为 `direct → program → direct` 的调用；在 DSH 的会话日志里这会表现为同一 step 下的三次调用与三个结果。若模型分步了，C 项记为「未覆盖」，其余项仍然有效。

## 判定口径

- **全绿**：A 成功、B 全 `function`、D 三行有序 → 混合执行器在真实会话里可用。
- **部分红**：按上表的「失败时的含义」定位；把该行原样贴回来即可。
- 失败不需要你先排查，把会话里的报错原文给我。

## 清理

```bash
rm -f /Users/juergenie/Projects/Workspaces/DSH/_hybrid-verify.txt
```

## 实测结果（2026-11-14 05:50）

会话「工具调用顺序验收验证」按本用例执行，四项全绿：

| 步 | 结果 |
|---|---|
| A | 直呼 `cordis_inspect_list` 返回 9 个 provider（host 4 / client 5） |
| B | `run_code` 内 `bash`/`read`/`edit`/`workflow`/`subagent`/`cordis_inspect_list`/`plugin_manager` 全为 `function`；`PTB=function` |
| C | 同一回复内一批三条 `bash → run_code → bash`，全部无报错（模型自述「同一批发出」） |
| D | `_hybrid-verify.txt` 三行：`H1-direct` / `H2-program` / `H3-direct` |

宿主侧独立核验（不依赖模型自述）：`cat -n` 行序一致，`mtime` 05:50:24。

### 未覆盖的部分（下一次可加）

- **跨段并发**：混合批按段串行，未测「同段内并行读 + 另一段写」的屏障行为。
- **`run_code` 上限**：未测 10 分钟硬上限与调用额度耗尽的行为。
- **失败隔离**：未测 `run_code` 内某个子调用失败时，同批其余调用是否仍正常结算。

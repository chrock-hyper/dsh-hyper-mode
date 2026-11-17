# @chrock-hyper/dsh-hyper-mode

组合包。只有 `dsh.bundle.patch`、bundle 级 locale 与图标，没有运行时代码，也不声明
`dsh.client`——它插入多行，而一个包只能有一个活跃的 Client 来源。

`dependencies` 列全补丁里挂载的每个插件包：

```json
"dependencies": {
  "@chrock-hyper/dsh-hyper-roles": "workspace:*",
  "@chrock-hyper/dsh-hyper-org": "workspace:*"
}
```

行的解析从本目录出发：`packages/bundle/node_modules/` 里必须有这些包的 workspace
链接，所以改完包要回仓库根跑 `pnpm install`。

本地开发流程与身份模型见仓库根的 `README.md`、`docs/ARCHITECTURE.md`。

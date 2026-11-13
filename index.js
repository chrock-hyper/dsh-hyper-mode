/**
 * Bundle 根的兜底入口：整包被当成单个插件挂载时，行为等同 hyper-creator。
 *
 * 正常路径是子路径插件 `@chrock-studio/dsh-hyper-mode/hyper-creator`；
 * 若子路径解析在某个环境里不可用，把 cordis.patch.yml 里的 name 换成本包名即可。
 *
 * @module @chrock-studio/dsh-hyper-mode
 */
export * from './plugins/hyper-creator/index.js'

/**
 * `hyper-roles` 暴露给同 bundle 其它包的稳定内部接口。
 *
 * `hyper-org` 复用这里的身份绑定投影、作用域解析与岗位库：工单要按岗位派活、
 * 要显示接管人标题，身份判定必须与岗位面板同一份实现。收成一个具名入口，
 * 而不是让兄弟包直接 import 任意实现文件——实现可以重组，这个入口是契约。
 *
 * 这不是 Loader 行，也不参与客户端加载：它只是 Node 侧的模块导出。
 *
 * @module @chrock-studio/dsh-hyper-roles/internal
 */

export { boundRoleOf, registerBinding } from './binding.js'
export { resolveDirs } from './scopes.js'
export { createRole, listRoles, readRole } from './store.js'

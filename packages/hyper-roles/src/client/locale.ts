/**
 * The panel's dictionaries and its one translation indirection.
 *
 * `t` is rebound by `apply` once the locale service is up — the same shape the
 * hand-written module used with a closure variable — so components read it at
 * render time and never at module-evaluation time. A module-level binding is
 * enough because the page loads one factory per module id.
 */

/** Locale namespace owned by this plugin. */
export const NS = 'hyperRoles'
/** Id of the tab this panel registers on `conversation.view`. */
export const TAB_ID = 'roles'

export const zh = {
  tab: '岗位',
  scopeProject: '本项目',
  scopeGlobal: '全局',
  filter: '筛选岗位',
  newRole: '新建岗位',
  emptyList: '还没有岗位',
  emptyBody: '从左侧选择一个岗位，或新建一个',
  readonly: '随包岗位只读，复制后即可编辑',
  copyIn: '复制到本项目',
  idField: '岗位 id（小写字母 / 数字 / 连字符）',
  titleField: '名称',
  create: '创建',
  cancel: '取消',
  capabilities: '能力（逗号分隔）',
  skills: '技能（逗号分隔）',
  handoffs: '交接对象（岗位 id，逗号分隔）',
  can: '权限（edit-roles / train）',
  model: '模型（provider/model，留空继承默认路由）',
  body: '正文（Markdown）',
  guide: '岗位指导：指向 wiki 页面与阅读顺序',
  guideSave: '保存指导',
  notes: '经验',
  noteEmpty: '还没有经验条目',
  notePlaceholder: '一条一事：什么信号出现时 → 做什么判断 → 为什么',
  noteAdd: '记一条经验',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  archive: '归档',
  archiveConfirm: '确认归档？',
  reload: '重新载入',
  copyPrompt: '复制岗位提示词',
  copied: '已复制到剪贴板',
  installed: '已安装',
  copyFailed: '复制失败，请手动选择',
  version: 'v',
  shadowed: '覆盖全局',
  builtin: '随包',
  dirty: '未保存',
  conflict: '岗位已被他人修改',
  created: '已创建',
  error: '出错了',
  loading: '读取中…',
  needTitle: '名称不能为空',
  needId: 'id 只能用小写字母、数字与连字符',
  dataAt: '数据位置',
  promptHint: '复制后粘进新会话，首行即绑定这个岗位',
  writeFailed: '写入失败',
  savedGuide: '指导已保存',
  refreshed: '已重新载入',
}

export const en = {
  tab: 'Roles',
  scopeProject: 'Project',
  scopeGlobal: 'Global',
  filter: 'Filter roles',
  newRole: 'New role',
  emptyList: 'No roles yet',
  emptyBody: 'Pick a role, or create one',
  readonly: 'Shipped roles are read-only; copy one to edit',
  copyIn: 'Copy into project',
  idField: 'Role id (lowercase, digits, hyphens)',
  titleField: 'Title',
  create: 'Create',
  cancel: 'Cancel',
  capabilities: 'Capabilities (comma separated)',
  skills: 'Skills (comma separated)',
  handoffs: 'Handoffs (role ids)',
  can: 'Grants (edit-roles / train)',
  model: 'Model (provider/model, blank inherits the default route)',
  body: 'Body (Markdown)',
  guide: 'Reading guide: wiki pages and order',
  guideSave: 'Save guide',
  notes: 'Experience',
  noteEmpty: 'No experience yet',
  notePlaceholder: 'One thing: what signal → what judgement → why',
  noteAdd: 'Add entry',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  archive: 'Archive',
  archiveConfirm: 'Archive this role?',
  reload: 'Reload',
  copyPrompt: 'Copy role prompt',
  copied: 'Copied',
  installed: 'installed',
  copyFailed: 'Copy failed; select the text manually',
  version: 'v',
  shadowed: 'overrides global',
  builtin: 'shipped',
  dirty: 'unsaved',
  conflict: 'This role changed elsewhere',
  created: 'Created',
  error: 'Error',
  loading: 'Loading…',
  needTitle: 'A title is required',
  needId: 'The id may only use lowercase letters, digits and hyphens',
  dataAt: 'Data',
  promptHint: 'Paste it into a new session to bind that role',
  writeFailed: 'Write failed',
  savedGuide: 'Guide saved',
  refreshed: 'Reloaded',
}

/** Identity fallback: before `apply` runs, a key renders as itself. */
let translate: (key: string) => string = (key) => key

/**
 * Point `t` at the bound dictionary for one namespace.
 * @param next - the narrator returned by `ctx.locale.bind`.
 */
export function bindTranslate(next: (key: string) => string): void {
  translate = next
}

/**
 * Translate one key through the currently bound dictionary.
 * @param key - key of this panel's dictionary.
 * @returns the localized text, or the key itself before binding.
 */
export function t(key: string): string {
  return translate(key)
}

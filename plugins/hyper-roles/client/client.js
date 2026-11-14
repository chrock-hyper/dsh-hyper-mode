/**
 * 岗位面板：一级页面 + 侧栏图标。
 *
 * 纯浏览器模块，不经过任何构建：React 来自宿主的模块表，样式是组件内的
 * <style>，数据全部走 Host 的 `/hyper-roles/api` 路由。面板只做三件事——
 * 把角色卡摆出来、把字段改动提交给同一套 store、把版本冲突如实告诉人。
 */
window.__ModuleLoader__.load({
  id: '@chrock-studio/dsh-hyper-roles',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const NS = 'hyperRoles'
    const PANEL_ID = 'hyper-roles'
    const API = '/hyper-roles/api'

    let t = (key) => key

    const zh = {
      panel: '岗位',
      title: '岗位',
      subtitle: '可编辑的团队角色卡：职责、能力、交接对象与经验',
      refresh: '刷新',
      project: '项目',
      global: '全局',
      builtin: '随包',
      filter: '筛选岗位',
      newRole: '新建岗位',
      emptyList: '还没有岗位',
      emptyBody: '从左侧选择一个岗位，或新建一个',
      emptyProject: '还没有选择项目目录',
      pickProject: '选择项目目录',
      manualPath: '手动输入路径',
      idField: '岗位 id',
      titleField: '名称',
      capabilities: '能力（逗号分隔）',
      skills: '技能（逗号分隔）',
      handoffs: '交接对象（岗位 id，逗号分隔）',
      can: '权限（edit-roles / train）',
      body: '正文（Markdown）',
      guide: '岗位指导：指向 wiki 页面与阅读顺序',
      guideSave: '保存指导',
      notes: '经验',
      noteEmpty: '这个岗位还没有经验条目',
      notePlaceholder: '一条一事：什么信号出现时 → 做什么判断 → 为什么',
      noteAdd: '记一条经验',
      save: '保存',
      saving: '保存中…',
      saved: '已保存',
      archive: '归档',
      reload: '重新载入',
      copyPrompt: '复制岗位提示词',
      copied: '已复制到剪贴板',
      version: 'v',
      shadowed: '覆盖全局',
      conflict: '岗位已被他人修改，先重新载入再保存',
      dirty: '有未保存的修改',
      copiedRole: '已复制随包岗位',
      createdRole: '已创建岗位',
      archiveConfirm: '归档后这张卡、经验和指导都会移入 .archive，可以吗？',
      source: '来源',
      noPermission: '只读：当前页面没有写权限',
      needProject: '项目岗位需要一个项目目录；选一个后再新建。',
      newRoleId: '新岗位 id（小写字母/数字/连字符）',
      newRoleTitle: '新岗位名称',
      builtinHint: '随包岗位只读；复制到某个作用域后即可编辑。',
      copyToScope: '复制到当前作用域',
      error: '出错了',
      loading: '读取中…',
    }

    const en = {
      panel: 'Roles',
      title: 'Roles',
      subtitle: 'Editable team role cards: duties, capabilities, handoffs and experience',
      refresh: 'Refresh',
      project: 'Project',
      global: 'Global',
      builtin: 'Shipped',
      filter: 'Filter roles',
      newRole: 'New role',
      emptyList: 'No roles yet',
      emptyBody: 'Pick a role on the left, or create one',
      emptyProject: 'No project directory selected',
      pickProject: 'Pick a project directory',
      manualPath: 'Type a path',
      idField: 'Role id',
      titleField: 'Title',
      capabilities: 'Capabilities (comma separated)',
      skills: 'Skills (comma separated)',
      handoffs: 'Handoffs (role ids, comma separated)',
      can: 'Grants (edit-roles / train)',
      body: 'Body (Markdown)',
      guide: 'Reading guide: wiki pages and reading order',
      guideSave: 'Save guide',
      notes: 'Experience',
      noteEmpty: 'No experience entries yet',
      notePlaceholder: 'One thing: what signal → what judgement → why',
      noteAdd: 'Add entry',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      archive: 'Archive',
      reload: 'Reload',
      copyPrompt: 'Copy role prompt',
      copied: 'Copied to clipboard',
      version: 'v',
      shadowed: 'overrides global',
      conflict: 'This role changed elsewhere; reload before saving',
      dirty: 'Unsaved changes',
      copiedRole: 'Copied shipped role',
      createdRole: 'Role created',
      archiveConfirm: 'Archive moves the card, notes and guide into .archive. Continue?',
      source: 'source',
      noPermission: 'Read-only: this page cannot write',
      needProject: 'Project roles need a project directory; pick one first.',
      newRoleId: 'New role id (lowercase letters, digits, hyphens)',
      newRoleTitle: 'New role title',
      builtinHint: 'Shipped roles are read-only; copy one into a scope to edit it.',
      copyToScope: 'Copy into current scope',
      error: 'Error',
      loading: 'Loading…',
    }

    /**
     * Call one API route.
     * @param {string} path - route path.
     * @param {object} [init] - fetch init.
     * @returns {Promise<object>} the JSON payload.
     */
    async function api(path, init) {
      const response = await fetch(path, {
        headers: { 'content-type': 'application/json' },
        ...init,
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok) {
        const error = new Error(data.error || `HTTP ${response.status}`)
        error.status = response.status
        error.data = data
        throw error
      }
      return data
    }

    /** @param {string} path - route. @param {string|null} cwd - project root. @returns {string} route with cwd. */
    function withCwd(path, cwd) {
      if (!cwd) return path
      return `${path}${path.includes('?') ? '&' : '?'}cwd=${encodeURIComponent(cwd)}`
    }

    /** @param {string[]|undefined} value - list. @returns {string} comma text. */
    const listText = (value) => (Array.isArray(value) ? value.join(', ') : '')

    /** @param {string} value - comma text. @returns {string[]} list. */
    const parseList = (value) => String(value || '').split(/[,，]/).map((entry) => entry.trim()).filter(Boolean)

    /** @param {object} fields - parsed card fields. @returns {object} form state. */
    function formOf(fields) {
      return {
        title: fields.title || '',
        capabilities: listText(fields.capabilities),
        skills: listText(fields.skills),
        handoffs: listText(fields.handoffs),
        can: listText(fields.can),
        body: '',
      }
    }

    /** 侧栏图标：一个角色剪影，选中时带一个点。 */
    function RoleIcon({ size = 18, active = false }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block' },
      },
        h('circle', { cx: 11, cy: 8, r: 3.1, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('path', {
          d: 'M5.2 19c1.1-3 3.3-4.6 5.8-4.6s4.7 1.6 5.8 4.6',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
        }),
        active ? h('circle', { cx: 18.6, cy: 5.4, r: 2.1, fill: 'currentColor' }) : null,
      )
    }

    /** 一个带标签的编辑行。 */
    function Field({ label, children, hint }) {
      return h('label', { className: 'hr-field' },
        h('span', { className: 'hr-field-label' }, label),
        children,
        hint ? h('span', { className: 'hr-field-hint' }, hint) : null,
      )
    }

    /** 面板主体。 */
    function RolePanel() {
      const [cwd, setCwd] = useState(null)
      const [state, setState] = useState(null)
      const [scope, setScope] = useState('project')
      const [selected, setSelected] = useState(null)
      const [doc, setDoc] = useState(null)
      const [form, setForm] = useState(null)
      const [guide, setGuide] = useState('')
      const [note, setNote] = useState('')
      const [notice, setNotice] = useState(null)
      const [filter, setFilter] = useState('')
      const [busy, setBusy] = useState(false)

      const report = useCallback((kind, text) => setNotice({ kind, text }), [])

      const loadState = useCallback(async (nextCwd) => {
        try {
          const data = await api(withCwd(`${API}/state`, nextCwd))
          setState(data)
          setCwd(nextCwd ?? null)
          if (nextCwd === null && !data.projectRoot && Array.isArray(data.recentProjects) && data.recentProjects.length > 0) {
            await loadState(data.recentProjects[0])
          }
        } catch (error) {
          report('error', `${t('error')}: ${error.message}`)
        }
      }, [report])

      useEffect(() => {
        loadState(null)
      }, [loadState])

      const openRole = useCallback(async (target) => {
        setSelected(target)
        try {
          const data = await api(withCwd(`${API}/role/${target.scope}/${encodeURIComponent(target.id)}`, cwd), { method: 'GET' })
          setDoc(data)
          setForm({ ...formOf(data.fields), body: data.body })
          setGuide(data.guide || '')
          setNotice(null)
        } catch (error) {
          report('error', error.message)
        }
      }, [cwd, report])

      const rows = useMemo(() => {
        const list = state?.roles?.[scope] ?? []
        const needle = filter.trim().toLowerCase()
        if (needle === '') return list
        return list.filter((row) => `${row.id} ${row.title}`.toLowerCase().includes(needle))
      }, [state, scope, filter])

      const dirty = useMemo(() => {
        if (!doc || !form) return false
        const original = formOf(doc.fields)
        return form.title !== original.title
          || form.capabilities !== original.capabilities
          || form.skills !== original.skills
          || form.handoffs !== original.handoffs
          || form.can !== original.can
          || form.body !== doc.body
      }, [doc, form])

      const save = useCallback(async () => {
        if (!doc || !form || !selected) return
        setBusy(true)
        try {
          await api(withCwd(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}`, cwd), {
            method: 'PUT',
            body: JSON.stringify({
              fields: {
                title: form.title,
                capabilities: parseList(form.capabilities),
                skills: parseList(form.skills),
                handoffs: parseList(form.handoffs),
                can: parseList(form.can),
              },
              body: form.body,
              expectedVersion: doc.revision,
            }),
          })
          report('ok', t('saved'))
          await loadState(cwd)
          await openRole(selected)
        } catch (error) {
          if (error.status === 409 && error.data?.code === 'stale') {
            report('error', `${t('conflict')} （v${doc.revision} → v${error.data.currentVersion}）`)
          } else {
            report('error', error.message)
          }
        } finally {
          setBusy(false)
        }
      }, [doc, form, selected, cwd, loadState, openRole, report])

      const createRole = useCallback(async () => {
        if (scope === 'project' && !state?.projectDir) {
          report('error', t('needProject'))
          return
        }
        const id = window.prompt(t('newRoleId'), '')
        if (!id) return
        const title = window.prompt(t('newRoleTitle'), id)
        if (!title) return
        try {
          await api(withCwd(`${API}/role/${scope}`, cwd), {
            method: 'POST',
            body: JSON.stringify({ id: id.trim(), title, body: '## 职责\n\n## 工作方式\n\n## 交互对象\n\n## 完成标准\n' }),
          })
          report('ok', t('createdRole'))
          await loadState(cwd)
          await openRole({ scope, id: id.trim() })
        } catch (error) {
          report('error', error.message)
        }
      }, [scope, state, cwd, loadState, openRole, report])

      const archiveRole = useCallback(async () => {
        if (!selected) return
        if (!window.confirm(t('archiveConfirm'))) return
        try {
          await api(withCwd(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}/archive`, cwd), { method: 'POST', body: '{}' })
          setDoc(null)
          setForm(null)
          setSelected(null)
          await loadState(cwd)
        } catch (error) {
          report('error', error.message)
        }
      }, [selected, cwd, loadState, report])

      const saveGuide = useCallback(async () => {
        if (!selected) return
        try {
          await api(withCwd(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}/guide`, cwd), {
            method: 'PUT',
            body: JSON.stringify({ text: guide }),
          })
          report('ok', t('saved'))
          await openRole(selected)
        } catch (error) {
          report('error', error.message)
        }
      }, [selected, cwd, guide, openRole, report])

      const addNote = useCallback(async () => {
        if (!selected || note.trim() === '') return
        try {
          await api(withCwd(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}/note`, cwd), {
            method: 'POST',
            body: JSON.stringify({ text: note }),
          })
          setNote('')
          await openRole(selected)
        } catch (error) {
          report('error', error.message)
        }
      }, [selected, note, cwd, openRole, report])

      const copyPrompt = useCallback(async () => {
        if (!doc) return
        const text = [
          `<!-- role:${doc.fields.id} -->`,
          `【岗位】${doc.fields.title}（${doc.fields.id} · v${doc.revision}）`,
          '',
          doc.body,
          doc.guide ? `\n## 岗位指导\n${doc.guide}` : '',
        ].join('\n')
        try {
          await navigator.clipboard.writeText(text)
          report('ok', t('copied'))
        } catch (error) {
          report('error', error.message)
        }
      }, [doc, report])

      const copyBuiltin = useCallback(async (id) => {
        if (scope === 'project' && !state?.projectDir) {
          report('error', t('needProject'))
          return
        }
        try {
          await api(withCwd(`${API}/role/${scope}`, cwd), { method: 'POST', body: JSON.stringify({ fromBuiltin: id }) })
          report('ok', t('copiedRole'))
          await loadState(cwd)
          await openRole({ scope, id })
        } catch (error) {
          report('error', error.message)
        }
      }, [scope, state, cwd, loadState, openRole, report])

      const pickProject = useCallback(async () => {
        const path = window.prompt(t('manualPath'), state?.projectRoot || '')
        if (!path) return
        await loadState(path.trim())
      }, [state, loadState])

      const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

      const scopeLabel = (value) => (value === 'project' ? t('project') : t('global'))

      return h('div', { className: 'hr-page' },
        h('style', null, STYLES),
        h('header', { className: 'hr-header' },
          h('div', { className: 'hr-heading' },
            h('h1', null, t('title')),
            h('p', null, t('subtitle')),
          ),
          h('div', { className: 'hr-header-actions' },
            h('button', { className: 'hr-button', onClick: () => loadState(cwd) }, t('refresh')),
            h('button', { className: 'hr-button hr-primary', onClick: createRole }, t('newRole')),
          ),
        ),
        h('div', { className: 'hr-scopebar' },
          ['project', 'global'].map((value) => h('button', {
            key: value,
            className: `hr-tab${scope === value ? ' hr-tab-active' : ''}`,
            onClick: () => setScope(value),
          }, scopeLabel(value))),
          h('span', { className: 'hr-scope-hint' },
            scope === 'project'
              ? (state?.projectRoot || t('emptyProject'))
              : state?.globalDir || ''),
          scope === 'project'
            ? h('button', { className: 'hr-link', onClick: pickProject }, t('pickProject'))
            : null,
        ),
        notice !== null
          ? h('div', { className: `hr-notice hr-notice-${notice.kind}` },
            h('span', null, notice.text),
            h('button', { className: 'hr-link', onClick: () => setNotice(null) }, '×'))
          : null,
        h('div', { className: 'hr-body' },
          h('aside', { className: 'hr-list' },
            h('input', {
              className: 'hr-input hr-filter',
              placeholder: t('filter'),
              value: filter,
              onChange: (event) => setFilter(event.target.value),
            }),
            rows.length === 0
              ? h('p', { className: 'hr-muted' }, t('emptyList'))
              : h('ul', null, rows.map((row) => h('li', {
                key: `${row.scope}:${row.id}`,
                className: `hr-row${selected !== null && selected.id === row.id && selected.scope === row.scope ? ' hr-row-active' : ''}`,
                onClick: () => openRole({ scope: row.scope, id: row.id }),
              },
                h('span', { className: 'hr-row-title' }, row.title),
                h('span', { className: 'hr-row-meta' },
                  `${row.id} · v${row.version}`,
                  row.shadowed ? h('em', { className: 'hr-badge' }, t('shadowed')) : null,
                ),
              ))),
            scope === 'project' && state?.builtins?.length > 0
              ? h('div', { className: 'hr-builtins' },
                h('p', { className: 'hr-muted' }, t('builtinHint')),
                h('ul', null, state.builtins.map((row) => h('li', { key: row.id, className: 'hr-row hr-row-builtin' },
                  h('span', { className: 'hr-row-title' }, `${row.title}`),
                  h('span', { className: 'hr-row-meta' }, row.id),
                  h('button', { className: 'hr-link', onClick: () => copyBuiltin(row.id) }, t('copyToScope')),
                ))))
              : null,
          ),
          h('section', { className: 'hr-editor' },
            doc === null || form === null
              ? h('p', { className: 'hr-muted' }, t('emptyBody'))
              : h('div', { className: 'hr-editor-inner' },
                h('div', { className: 'hr-editor-head' },
                  h('div', null,
                    h('h2', null, form.title || doc.fields.id),
                    h('p', { className: 'hr-muted' }, `${doc.fields.id} · ${scopeLabel(doc.scope)} · v${doc.revision}${dirty ? ` · ${t('dirty')}` : ''}`),
                  ),
                  h('div', { className: 'hr-editor-actions' },
                    h('button', { className: 'hr-button', onClick: copyPrompt }, t('copyPrompt')),
                    h('button', { className: 'hr-button', onClick: () => openRole(selected) }, t('reload')),
                    h('button', { className: 'hr-button hr-primary', disabled: busy || !dirty, onClick: save },
                      busy ? t('saving') : t('save')),
                    h('button', { className: 'hr-button hr-danger', onClick: archiveRole }, t('archive')),
                  ),
                ),
                h('div', { className: 'hr-grid' },
                  h(Field, { label: t('titleField') },
                    h('input', { className: 'hr-input', value: form.title, onChange: setField('title') })),
                  h(Field, { label: t('capabilities') },
                    h('input', { className: 'hr-input', value: form.capabilities, onChange: setField('capabilities') })),
                  h(Field, { label: t('skills') },
                    h('input', { className: 'hr-input', value: form.skills, onChange: setField('skills') })),
                  h(Field, { label: t('handoffs') },
                    h('input', { className: 'hr-input', value: form.handoffs, onChange: setField('handoffs') })),
                  h(Field, { label: t('can') },
                    h('input', { className: 'hr-input', value: form.can, onChange: setField('can') })),
                ),
                h(Field, { label: t('body') },
                  h('textarea', { className: 'hr-textarea hr-body', value: form.body, onChange: setField('body') })),
                h('div', { className: 'hr-guide' },
                  h(Field, { label: t('guide') },
                    h('textarea', { className: 'hr-textarea hr-guide-text', value: guide, onChange: (event) => setGuide(event.target.value) })),
                  h('button', { className: 'hr-button', onClick: saveGuide }, t('guideSave')),
                ),
              ),
          ),
          h('aside', { className: 'hr-notes' },
            h('h3', null, t('notes')),
            doc === null
              ? null
              : h('div', null,
                doc.notes.length === 0
                  ? h('p', { className: 'hr-muted' }, t('noteEmpty'))
                  : h('ul', { className: 'hr-note-list' }, doc.notes.slice().reverse().map((entry, index) => h('li', { key: `${entry.at}-${index}` },
                    h('span', { className: 'hr-note-meta' }, `${entry.at.slice(0, 16).replace('T', ' ')} · ${entry.source}`),
                    h('p', null, entry.text),
                  ))),
                h('textarea', {
                  className: 'hr-textarea hr-note-input',
                  placeholder: t('notePlaceholder'),
                  value: note,
                  onChange: (event) => setNote(event.target.value),
                }),
                h('button', { className: 'hr-button hr-primary', disabled: note.trim() === '', onClick: addNote }, t('noteAdd')),
              ),
          ),
        ),
      )
    }

    const STYLES = `
.hr-page { display:flex; flex-direction:column; height:100%; min-height:0; box-sizing:border-box;
  color:var(--dsw-alias-label-primary,#1f2328); background:var(--dsw-alias-bg-base,transparent); font-size:13.5px; }
.hr-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:18px 20px 10px; }
.hr-heading h1 { margin:0; font-size:18px; font-weight:600; }
.hr-heading p { margin:4px 0 0; color:var(--dsw-alias-label-secondary,#6b7280); font-size:12.5px; }
.hr-header-actions { display:flex; gap:8px; }
.hr-scopebar { display:flex; align-items:center; gap:8px; padding:0 20px 10px; border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); }
.hr-tab { border:1px solid transparent; background:transparent; color:var(--dsw-alias-label-secondary,#6b7280);
  padding:4px 10px; border-radius:999px; cursor:pointer; font-size:12.5px; }
.hr-tab-active { background:var(--dsw-alias-bg-layer-2,#f3f4f6); color:var(--dsw-alias-label-primary,#111827); border-color:var(--dsw-alias-border-l1,#e5e7eb); }
.hr-scope-hint { color:var(--dsw-alias-label-secondary,#6b7280); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:52%; }
.hr-link { background:none; border:none; color:var(--dsw-alias-brand-primary,#2563eb); cursor:pointer; font-size:12.5px; padding:2px 4px; }
.hr-notice { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:10px 20px 0;
  padding:8px 12px; border-radius:8px; font-size:12.5px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb); }
.hr-notice-ok { background:var(--dsw-alias-bg-layer-2,#f0fdf4); border-color:var(--dsw-alias-state-success-primary,#16a34a); }
.hr-notice-error { background:var(--dsw-alias-bg-layer-2,#fef2f2); border-color:var(--dsw-alias-state-error-primary,#dc2626); }
.hr-body { display:grid; grid-template-columns:250px minmax(0,1fr) 260px; gap:0; flex:1; min-height:0; }
.hr-list { border-right:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding:12px; overflow:auto; min-height:0; }
.hr-filter { margin-bottom:10px; }
.hr-list ul { list-style:none; margin:0; padding:0; }
.hr-row { display:flex; flex-direction:column; gap:2px; padding:8px 10px; border-radius:8px; cursor:pointer; }
.hr-row:hover { background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.hr-row-active { background:var(--dsw-alias-bg-layer-2,#eef2ff); box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary,#2563eb); }
.hr-row-title { font-weight:550; }
.hr-row-meta { font-size:11.5px; color:var(--dsw-alias-label-secondary,#6b7280); display:flex; gap:6px; align-items:center; }
.hr-badge { font-style:normal; font-size:10.5px; padding:0 5px; border-radius:999px; background:var(--dsw-alias-bg-layer-1,#e5e7eb); }
.hr-builtins { margin-top:18px; border-top:1px dashed var(--dsw-alias-border-l1,#e5e7eb); padding-top:10px; }
.hr-row-builtin { cursor:default; }
.hr-editor { padding:16px 20px; overflow:auto; min-height:0; }
.hr-editor-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px; }
.hr-editor-head h2 { margin:0; font-size:15px; }
.hr-editor-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.hr-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px 14px; }
.hr-field { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; }
.hr-field-label { font-size:12px; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-field-hint { font-size:11px; color:var(--dsw-alias-label-secondary,#9ca3af); }
.hr-input,.hr-textarea { width:100%; box-sizing:border-box; padding:7px 9px; border-radius:7px; font-size:13px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff);
  color:var(--dsw-alias-label-primary,#111827); font-family:inherit; }
.hr-input:focus,.hr-textarea:focus { outline:none; border-color:var(--dsw-alias-brand-primary,#2563eb); }
.hr-textarea { resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; line-height:1.6; }
.hr-body { min-height:280px; }
.hr-guide { margin-top:6px; }
.hr-guide-text { min-height:90px; }
.hr-button { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff);
  color:inherit; padding:5px 11px; border-radius:7px; cursor:pointer; font-size:12.5px; }
.hr-button:hover { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.hr-button:disabled { opacity:.5; cursor:default; }
.hr-primary { background:var(--dsw-alias-brand-primary,#2563eb); border-color:var(--dsw-alias-brand-primary,#2563eb); color:#fff; }
.hr-danger { color:var(--dsw-alias-state-error-primary,#dc2626); border-color:var(--dsw-alias-border-l1,#e5e7eb); }
.hr-notes { border-left:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding:14px; overflow:auto; min-height:0; }
.hr-notes h3 { margin:0 0 10px; font-size:13px; }
.hr-note-list { list-style:none; margin:0 0 12px; padding:0; display:flex; flex-direction:column; gap:10px; }
.hr-note-list li { border-left:2px solid var(--dsw-alias-border-l2,#d1d5db); padding-left:8px; }
.hr-note-meta { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-note-list p { margin:3px 0 0; white-space:pre-wrap; word-break:break-word; }
.hr-note-input { min-height:80px; margin-bottom:8px; }
.hr-muted { color:var(--dsw-alias-label-secondary,#6b7280); font-size:12.5px; }
`

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hyper-roles: dictionaries')
        t = ctx.locale.bind(NS)

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 30,
          locale: NS,
          label: () => t('panel'),
        }, RoleIcon))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, RolePanel))
      },
    }
  },
})

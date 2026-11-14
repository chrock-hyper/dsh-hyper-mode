/**
 * 岗位标签页：会话里的「岗位」视图。
 *
 * 挂载在 `conversation.view`（与「对话」「轨迹」「统计」同一排），拿到
 * `sessionId`，因此项目作用域直接取当前会话的工作目录，不再需要选目录。
 * 纯浏览器模块：React 来自模块表，数据走 `/hyper-roles/api`。
 *
 * 三条硬规则（上一版踩过）：
 * 1. 不用 window.prompt / window.confirm —— Electron 不支持 prompt，点了会静默抛错；
 * 2. 每个字段都参与 dirty 计算，按钮的禁用状态要能解释；
 * 3. 请求失败一定落到可见的错误条上，不允许“点了没反应”。
 */
window.__ModuleLoader__.load({
  id: '@chrock-studio/dsh-hyper-roles',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const NS = 'hyperRoles'
    const TAB_ID = 'roles'
    const API = '/hyper-roles/api'

    let t = (key) => key

    const zh = {
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

    const en = {
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

    /** @param {object} query - parameters; empty values are skipped. @returns {string} suffix. */
    function queryString(query) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query || {})) {
        if (value === undefined || value === null || value === '') continue
        params.set(key, String(value))
      }
      const text = params.toString()
      return text === '' ? '' : `?${text}`
    }

    /** Call one API route, turning a failure into a thrown Error with its status. */
    async function call(path, options) {
      const response = await fetch(path, options)
      let body = {}
      try {
        body = await response.json()
      } catch {
        body = {}
      }
      if (!response.ok || body.ok === false) {
        const error = new Error(body.error || `HTTP ${response.status}`)
        error.status = response.status
        error.code = body.code
        error.currentVersion = body.currentVersion
        throw error
      }
      return body
    }

    /** @param {string} value - comma text. @returns {string[]} trimmed list. */
    const parseList = (value) => String(value || '').split(/[,，]/).map((entry) => entry.trim()).filter(Boolean)

    /** @param {string[]|undefined} value - list. @returns {string} comma text. */
    const listText = (value) => (Array.isArray(value) ? value.join(', ') : '')

    /** Render a form object from card fields; list fields stay arrays. */
    function formOf(fields, body) {
      return {
        title: fields.title || '',
        capabilities: Array.isArray(fields.capabilities) ? [...fields.capabilities] : [],
        skills: Array.isArray(fields.skills) ? [...fields.skills] : [],
        handoffs: Array.isArray(fields.handoffs) ? [...fields.handoffs] : [],
        can: Array.isArray(fields.can) ? [...fields.can] : [],
        body: body || '',
      }
    }

    /** @returns whether two token lists hold the same values in the same order. */
    const sameList = (left, right) => left.length === right.length && left.every((value, index) => value === right[index])

    /** Focused small button. */
    function button(label, onClick, options = {}) {
      return h('button', {
        type: 'button',
        className: `hr-btn${options.primary ? ' hr-primary' : ''}${options.danger ? ' hr-danger' : ''}${options.ghost ? ' hr-ghost' : ''}`,
        onClick,
        disabled: options.disabled === true,
      }, label)
    }

    /** Labeled input row. */
    function Field({ label, value, onChange, disabled }) {
      return h('label', { className: 'hr-field' },
        h('span', { className: 'hr-label' }, label),
        h('input', { className: 'hr-input', value, onChange, disabled: disabled === true }))
    }

    /**
     * A token field: values are chips, typing adds one, and a short suggestion
     * list offers the values that already exist (grants, role ids).
     */
    function TokenField({ label, value, onChange, suggestions, placeholder }) {
      const [text, setText] = useState('')
      const [focused, setFocused] = useState(false)
      const add = (raw) => {
        const next = [...value]
        for (const token of String(raw).split(/[,，]/).map((entry) => entry.trim()).filter(Boolean)) {
          if (!next.includes(token)) next.push(token)
        }
        onChange(next)
        setText('')
      }
      const needle = text.trim().toLowerCase()
      const options = (suggestions || [])
        .filter((option) => !value.includes(option) && (needle === '' || option.toLowerCase().includes(needle)))
        .slice(0, 6)
      return h('div', { className: 'hr-field' },
        h('span', { className: 'hr-label' }, label),
        h('div', { className: 'hr-tokens' },
          value.map((token) => h('span', { key: token, className: 'hr-chip' },
            token,
            h('button', {
              type: 'button',
              className: 'hr-chip-x',
              'aria-label': `移除 ${token}`,
              onClick: () => onChange(value.filter((entry) => entry !== token)),
            }, '×'),
          )),
          h('input', {
            className: 'hr-token-input',
            value: text,
            placeholder: value.length === 0 ? placeholder : '',
            onChange: (event) => setText(event.target.value),
            onFocus: () => setFocused(true),
            onBlur: () => setFocused(false),
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
                event.preventDefault()
                add(text)
              } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
                onChange(value.slice(0, -1))
              }
            },
          }),
        ),
        focused && options.length > 0
          ? h('div', { className: 'hr-suggest' }, options.map((option) => h('button', {
              key: option,
              type: 'button',
              className: 'hr-suggest-item',
              onMouseDown: (event) => { event.preventDefault(); add(option) },
            }, option)))
          : null,
      )
    }

    /** The tab component. */
    function RoleTab({ sessionId }) {
      const [state, setState] = useState(null)
      const [scope, setScope] = useState('project')
      const [selected, setSelected] = useState(null)
      const [doc, setDoc] = useState(null)
      const [form, setForm] = useState(null)
      const [guide, setGuide] = useState('')
      const [note, setNote] = useState('')
      const [filter, setFilter] = useState('')
      const [creating, setCreating] = useState(false)
      const [newId, setNewId] = useState('')
      const [newTitle, setNewTitle] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [conflict, setConflict] = useState(null)
      const [archiving, setArchiving] = useState(false)

      const session = sessionId === undefined || sessionId === null ? '' : String(sessionId)

      /** Show a transient success line. */
      const flash = useCallback((text) => {
        setNotice(text)
        setError('')
      }, [])

      /** Show a failure line and clear the success line. */
      const fail = useCallback((failure) => {
        setError(`${t('error')}: ${failure?.message || failure}`)
        setNotice('')
      }, [])

      const loadState = useCallback(async () => {
        try {
          const body = await call(`${API}/state${queryString({ session })}`)
          setState(body)
          if (body.problems && body.problems.length > 0) {
            setError(`${t('error')}: ${body.problems.length} 个岗位文件无法解析（${body.problems[0].path}）`)
          }
        } catch (failure) {
          fail(failure)
        }
      }, [session, fail])

      const openRole = useCallback(async (target) => {
        if (target === null) return
        setSelected(target)
        setArchiving(false)
        setConflict(null)
        try {
          const body = await call(`${API}/role/${target.scope}/${encodeURIComponent(target.id)}${queryString({ session })}`)
          setDoc(body)
          setForm(formOf(body.fields, body.body))
          setGuide(body.guide || '')
          setError('')
        } catch (failure) {
          setDoc(null)
          setForm(null)
          fail(failure)
        }
      }, [session, fail])

      useEffect(() => {
        loadState()
      }, [loadState])

      useEffect(() => {
        if (selected !== null) return
        const rows = state === null ? [] : state.roles[scope] || []
        if (rows.length > 0) openRole({ scope, id: rows[0].id })
      }, [state, scope, selected, openRole])

      const rows = useMemo(() => {
        const list = state === null ? [] : state.roles[scope] || []
        const needle = filter.trim().toLowerCase()
        if (needle === '') return list
        return list.filter((row) => `${row.id} ${row.title}`.toLowerCase().includes(needle))
      }, [state, scope, filter])

      const dirty = useMemo(() => {
        if (doc === null || form === null) return false
        const original = formOf(doc.fields, doc.body)
        return form.title !== original.title
          || !sameList(form.capabilities, original.capabilities)
          || !sameList(form.skills, original.skills)
          || !sameList(form.handoffs, original.handoffs)
          || !sameList(form.can, original.can)
          || form.body !== original.body
      }, [doc, form])

      const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
      const setList = (key) => (values) => setForm((current) => ({ ...current, [key]: values }))

      const save = useCallback(async () => {
        if (doc === null || form === null || selected === null) return
        if (form.title.trim() === '') { fail(new Error(t('needTitle'))); return }
        setBusy(true)
        try {
          await call(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}${queryString({ session })}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              fields: {
                title: form.title.trim(),
                capabilities: form.capabilities,
                skills: form.skills,
                handoffs: form.handoffs,
                can: form.can,
              },
              body: form.body,
              expectedVersion: doc.revision,
            }),
          })
          flash(t('saved'))
          await loadState()
          await openRole(selected)
        } catch (failure) {
          if (failure.status === 409 && failure.code === 'stale') {
            setConflict(failure.currentVersion)
          } else {
            fail(failure)
          }
        } finally {
          setBusy(false)
        }
      }, [doc, form, selected, session, loadState, openRole, flash, fail])

      const create = useCallback(async () => {
        const id = newId.trim()
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) { fail(new Error(t('needId'))); return }
        if (newTitle.trim() === '') { fail(new Error(t('needTitle'))); return }
        setBusy(true)
        try {
          await call(`${API}/role/${scope}${queryString({ session })}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              id,
              title: newTitle.trim(),
              body: '## 职责\n\n## 工作方式\n\n## 交互对象\n\n## 完成标准\n',
            }),
          })
          setCreating(false)
          setNewId('')
          setNewTitle('')
          flash(t('created'))
          await loadState()
          await openRole({ scope, id })
        } catch (failure) {
          fail(failure)
        } finally {
          setBusy(false)
        }
      }, [newId, newTitle, scope, session, loadState, openRole, flash, fail])

      const copyBuiltin = useCallback(async (id) => {
        setBusy(true)
        try {
          await call(`${API}/role/${scope}${queryString({ session })}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ fromBuiltin: id }),
          })
          flash(t('copied'))
          await loadState()
          await openRole({ scope, id })
        } catch (failure) {
          fail(failure)
        } finally {
          setBusy(false)
        }
      }, [scope, session, loadState, openRole, flash, fail])

      const archive = useCallback(async () => {
        if (selected === null) return
        if (!archiving) { setArchiving(true); return }
        setBusy(true)
        try {
          await call(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}/archive${queryString({ session })}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          setArchiving(false)
          setDoc(null)
          setForm(null)
          setSelected(null)
          flash(t('saved'))
          await loadState()
        } catch (failure) {
          fail(failure)
        } finally {
          setBusy(false)
        }
      }, [selected, archiving, session, loadState, flash, fail])

      const saveGuide = useCallback(async () => {
        if (selected === null) return
        setBusy(true)
        try {
          await call(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}/guide${queryString({ session })}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: guide }),
          })
          flash(t('savedGuide'))
        } catch (failure) {
          fail(failure)
        } finally {
          setBusy(false)
        }
      }, [selected, guide, session, flash, fail])

      const addNote = useCallback(async () => {
        if (selected === null || note.trim() === '') return
        setBusy(true)
        try {
          await call(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}/note${queryString({ session })}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: note.trim() }),
          })
          setNote('')
          flash(t('saved'))
          await openRole(selected)
        } catch (failure) {
          fail(failure)
        } finally {
          setBusy(false)
        }
      }, [selected, note, session, openRole, flash, fail])

      const copyPrompt = useCallback(async () => {
        if (doc === null) return
        const text = [
          `<!-- role:${doc.fields.id} -->`,
          `【岗位】${doc.fields.title}（${doc.fields.id} · v${doc.revision}）`,
          '',
          doc.body,
          guide.trim() === '' ? '' : `\n## 岗位指导\n${guide.trim()}`,
        ].join('\n')
        try {
          await navigator.clipboard.writeText(text)
          flash(t('copied'))
        } catch {
          fail(new Error(t('copyFailed')))
        }
      }, [doc, guide, flash, fail])

      const reload = useCallback(async () => {
        setConflict(null)
        if (selected !== null) await openRole(selected)
        flash(t('refreshed'))
      }, [selected, openRole, flash])

      const scopeButton = (value) => h('button', {
        type: 'button',
        className: `hr-seg-btn${scope === value ? ' hr-seg-on' : ''}`,
        onClick: () => { setScope(value); setSelected(null); setDoc(null); setForm(null) },
      }, value === 'project' ? t('scopeProject') : t('scopeGlobal'))

      const roleIds = state === null ? [] : [...new Set([
        ...(state.roles.project || []).map((row) => row.id),
        ...(state.roles.global || []).map((row) => row.id),
      ])].filter((id) => doc === null || id !== doc.fields.id)
      const builtinRows = state === null ? [] : state.builtins || []
      const editor = doc === null || form === null
        ? h('p', { className: 'hr-muted' }, t('emptyBody'))
        : h('div', { className: 'hr-editor' },
            h('div', { className: 'hr-ed-head' },
              h('div', { className: 'hr-ed-title-wrap' },
                h('input', { className: 'hr-title', value: form.title, onChange: setField('title') }),
                h('div', { className: 'hr-meta' },
                  h('span', null, doc.fields.id),
                  h('span', null, '·'),
                  h('span', null, doc.scope === 'project' ? t('scopeProject') : t('scopeGlobal')),
                  h('span', null, '·'),
                  h('span', null, `${t('version')}${doc.revision}`),
                  h('span', null, '·'),
                  h('span', { className: dirty ? 'hr-dirty' : 'hr-faint' }, dirty ? t('dirty') : t('saved')),
                ),
              ),
              h('div', { className: 'hr-actions' },
                button(t('copyPrompt'), copyPrompt, { ghost: true }),
                button(t('reload'), reload),
                button(busy ? t('saving') : t('save'), save, { primary: true, disabled: busy || !dirty }),
                archiving ? button(t('archiveConfirm'), archive, { danger: true }) : button(t('archive'), archive, { danger: true }),
              ),
            ),
            conflict === null ? null : h('div', { className: 'hr-banner hr-warn' },
              h('span', null, `${t('conflict')}（v${doc.revision} → v${conflict}）`),
              button(t('cancel'), () => setConflict(null), { ghost: true }),
            ),
            h('div', { className: 'hr-grid' },
              h(TokenField, {
                label: t('capabilities'),
                value: form.capabilities,
                onChange: setList('capabilities'),
                placeholder: 'Enter 添加，可自由输入',
              }),
              h(TokenField, {
                label: t('skills'),
                value: form.skills,
                onChange: setList('skills'),
                placeholder: 'Enter 添加技能名',
              }),
              h(TokenField, {
                label: t('handoffs'),
                value: form.handoffs,
                onChange: setList('handoffs'),
                suggestions: roleIds,
                placeholder: 'Enter 添加岗位 id',
              }),
              h(TokenField, {
                label: t('can'),
                value: form.can,
                onChange: setList('can'),
                suggestions: ['edit-roles', 'train'],
                placeholder: 'edit-roles / train',
              }),
            ),
            h('textarea', { className: 'hr-textarea hr-body', value: form.body, onChange: setField('body') }),
            h('details', { className: 'hr-guide', open: guide.trim() !== '' },
              h('summary', null, t('guide')),
              h('textarea', { className: 'hr-textarea hr-guide-text', value: guide, onChange: (event) => setGuide(event.target.value) }),
              h('div', { className: 'hr-guide-actions' }, button(t('guideSave'), saveGuide, { disabled: busy })),
            ),
            h('p', { className: 'hr-hint' }, t('promptHint')),
          )

      const listHead = h('div', { className: 'hr-list-head' },
        h('div', { className: 'hr-seg' }, scopeButton('project'), scopeButton('global')),
        h('input', {
          className: 'hr-input hr-filter',
          placeholder: t('filter'),
          value: filter,
          onChange: (event) => setFilter(event.target.value),
        }),
        h('button', {
          type: 'button',
          className: 'hr-new',
          onClick: () => setCreating((open) => !open),
          disabled: scope === 'project' && (state === null || state.projectDir === null),
        }, creating ? t('cancel') : `＋ ${t('newRole')}`),
      )

      const listColumn = h('aside', { className: 'hr-col hr-list-col' },
        listHead,
        creating === false ? null : h('div', { className: 'hr-create' },
          h('input', { className: 'hr-input', placeholder: t('idField'), value: newId, onChange: (event) => setNewId(event.target.value) }),
          h('input', { className: 'hr-input', placeholder: t('titleField'), value: newTitle, onChange: (event) => setNewTitle(event.target.value) }),
          h('div', { className: 'hr-create-actions' },
            button(t('cancel'), () => setCreating(false), { ghost: true }),
            button(t('create'), create, { primary: true, disabled: busy }),
          ),
        ),
        rows.length === 0
          ? h('p', { className: 'hr-muted hr-pad' }, state === null ? t('loading') : t('emptyList'))
          : h('ul', { className: 'hr-rows' }, rows.map((row) => h('li', {
              key: `${row.scope}:${row.id}`,
              className: `hr-row${selected !== null && selected.id === row.id && selected.scope === row.scope ? ' hr-row-on' : ''}`,
              onClick: () => openRole({ scope: row.scope, id: row.id }),
            },
              h('span', { className: 'hr-row-title' }, row.title),
              h('span', { className: 'hr-row-meta' },
                `${row.id} · ${t('version')}${row.version}`,
                row.shadowed === true ? h('em', { className: 'hr-badge' }, t('shadowed')) : null,
              ),
            ))),
        builtinRows.length === 0 ? null : h('div', { className: 'hr-builtins' },
          h('p', { className: 'hr-muted hr-pad' }, t('readonly')),
          h('ul', { className: 'hr-rows' }, builtinRows.map((row) => h('li', { key: row.id, className: 'hr-row hr-row-builtin' },
            h('span', { className: 'hr-row-title' }, row.title),
            h('span', { className: 'hr-row-meta' }, row.id,
              h('button', {
                type: 'button',
                className: 'hr-link',
                onClick: () => copyBuiltin(row.id),
                disabled: busy || (scope === 'project' && state.projectDir === null),
              }, t('copyIn')),
            ),
          ))),
        ),
      )

      const sideColumn = h('aside', { className: 'hr-col hr-side-col' },
        h('h3', { className: 'hr-side-title' }, `${t('notes')} ${doc === null ? '' : `(${doc.notes.length})`}`),
        doc === null ? null : h('div', null,
          doc.notes.length === 0
            ? h('p', { className: 'hr-muted' }, t('noteEmpty'))
            : h('ul', { className: 'hr-note-list' }, doc.notes.slice().reverse().map((entry, index) => h('li', { key: `${entry.at}-${index}` },
                h('span', { className: 'hr-note-meta' }, `${String(entry.at).slice(0, 16).replace('T', ' ')} · ${entry.source}`),
                h('p', null, entry.text),
              ))),
          h('textarea', {
            className: 'hr-textarea hr-note-input',
            placeholder: t('notePlaceholder'),
            value: note,
            onChange: (event) => setNote(event.target.value),
          }),
          h('div', { className: 'hr-note-actions' },
            button(t('noteAdd'), addNote, { primary: true, disabled: busy || note.trim() === '' }),
          ),
        ),
        h('h3', { className: 'hr-side-title' }, t('dataAt')),
        h('p', { className: 'hr-muted' },
          state === null ? '' : `本项目 ${state.projectDir === null ? '—' : '.dsh/roles/'}`,
          h('br'),
          state === null ? '' : `全局 ${state.globalDir}`,
        ),
      )

      const banners = error === '' && notice === ''
        ? null
        : h('div', { className: 'hr-banners' },
            error === '' ? null : h('span', { className: 'hr-banner hr-error' }, error),
            notice === '' ? null : h('span', { className: 'hr-banner hr-ok' }, notice),
          )

      return h('div', { className: 'hr-tab' },
        h('style', null, STYLES),
        banners,
        h('div', { className: 'hr-body-cols' },
          listColumn,
          h('section', { className: 'hr-col hr-editor-col' }, editor),
          sideColumn,
        ),
      )
    }

    const STYLES = `
.hr-tab, .hr-tab *, .hr-tab *::before, .hr-tab *::after { box-sizing:border-box; }
.hr-tab { display:flex; flex-direction:column; flex:1 1 auto; width:100%; height:100%; min-height:0;
  color:var(--dsw-alias-label-primary,#1f2328); background:var(--dsw-alias-bg-base,transparent);
  font-size:13px; line-height:1.55; overflow:hidden; }
.hr-banners { display:flex; gap:8px; flex-wrap:wrap; padding:7px 14px; border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  background:var(--dsw-alias-bg-layer-1,#fff); flex:none; }
.hr-list-head { position:sticky; top:0; z-index:2; display:flex; flex-direction:column; gap:6px;
  padding:2px 0 10px; background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-new { display:flex; align-items:center; justify-content:center; width:100%; padding:5px 8px;
  border:1px dashed var(--dsw-alias-border-l2,#d1d5db); border-radius:7px; background:var(--dsw-alias-bg-layer-2,#f8f9fb);
  color:var(--dsw-alias-label-secondary,#6b7280); font-size:12px; cursor:pointer; }
.hr-new:hover:not(:disabled) { border-color:var(--dsw-alias-brand-primary,#2563eb); color:var(--dsw-alias-brand-primary,#2563eb); }
.hr-new:disabled { opacity:.45; cursor:default; }
.hr-grow { flex:1; }
.hr-seg { display:flex; gap:2px; padding:2px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:8px; background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.hr-seg-btn { border:none; background:none; padding:3px 9px; border-radius:6px; font-size:12px; color:var(--dsw-alias-label-secondary,#6b7280); cursor:pointer; }
.hr-seg-on { background:var(--dsw-alias-bg-layer-1,#fff); color:var(--dsw-alias-label-primary,#111827); box-shadow:0 1px 2px rgba(0,0,0,.06); }
.hr-filter { width:180px; }
.hr-tokens { display:flex; flex-wrap:wrap; align-items:center; gap:4px; min-height:32px; padding:3px 6px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:7px; background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.hr-tokens:focus-within { border-color:var(--dsw-alias-brand-primary,#2563eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-chip { display:inline-flex; align-items:center; gap:2px; padding:1px 3px 1px 7px; border-radius:6px; font-size:11.5px;
  background:color-mix(in srgb, var(--dsw-alias-brand-primary,#2563eb) 10%, var(--dsw-alias-bg-layer-1,#fff));
  color:var(--dsw-alias-label-primary,#1f2328); }
.hr-chip-x { border:none; background:none; color:inherit; opacity:.5; cursor:pointer; padding:0 2px; font-size:12px; line-height:1; }
.hr-chip-x:hover { opacity:1; }
.hr-token-input { flex:1; min-width:90px; border:none; outline:none; background:transparent; font:inherit; padding:2px 0; color:inherit; }
.hr-suggest { display:flex; flex-wrap:wrap; gap:4px; margin-top:3px; }
.hr-suggest-item { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff);
  border-radius:6px; padding:1px 6px; font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); cursor:pointer; }
.hr-suggest-item:hover { border-color:var(--dsw-alias-brand-primary,#2563eb); color:var(--dsw-alias-brand-primary,#2563eb); }
.hr-input, .hr-textarea { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:7px; padding:6px 8px;
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); color:inherit; outline:none; font:inherit; }
.hr-input:focus, .hr-textarea:focus { border-color:var(--dsw-alias-brand-primary,#2563eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-btn { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); color:inherit;
  padding:4px 10px; border-radius:7px; font-size:12px; cursor:pointer; white-space:nowrap; }
.hr-btn:hover { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.hr-btn:disabled { opacity:.45; cursor:default; }
.hr-primary { background:var(--dsw-alias-brand-primary,#2563eb); border-color:var(--dsw-alias-brand-primary,#2563eb); color:#fff; }
.hr-danger { color:var(--dsw-alias-state-error-primary,#dc2626); }
.hr-ghost { border-color:transparent; background:transparent; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-body-cols { flex:1 1 auto; min-height:0; display:grid; grid-template-columns:250px minmax(0,1fr) 268px;
  background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-col { min-height:0; overflow-y:auto; overflow-x:hidden; }
.hr-list-col { border-right:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding:0 8px 8px; }
.hr-editor-col { padding:14px 16px 40px; }
.hr-side-col { border-left:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding:12px; }
.hr-rows { list-style:none; margin:0; padding:0; }
.hr-row { display:flex; flex-direction:column; gap:2px; padding:8px 9px; border-radius:8px; cursor:pointer; }
.hr-row:hover { background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.hr-row-on { background:color-mix(in srgb, var(--dsw-alias-brand-primary,#2563eb) 14%, var(--dsw-alias-bg-layer-1,#fff));
  box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary,#2563eb); }
.hr-row-title { font-weight:550; }
.hr-row-meta { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); display:flex; gap:6px; align-items:center; }
.hr-row-builtin { cursor:default; }
.hr-badge { font-style:normal; font-size:10px; padding:0 4px; border-radius:999px; border:1px solid var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.hr-builtins { margin-top:14px; border-top:1px dashed var(--dsw-alias-border-l1,#e5e7eb); padding-top:8px; }
.hr-link { border:none; background:none; color:var(--dsw-alias-brand-primary,#2563eb); cursor:pointer; padding:0 2px; font-size:11px; }
.hr-create { display:flex; flex-direction:column; gap:6px; padding:8px; border:1px dashed var(--dsw-alias-border-l2,#d1d5db); border-radius:8px; margin-bottom:8px; }
.hr-create-actions { display:flex; justify-content:flex-end; gap:6px; }
.hr-ed-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.hr-ed-title-wrap { flex:1; min-width:0; }
.hr-title { width:min(430px,100%); font-size:16px; font-weight:600; border:1px solid transparent; border-radius:6px;
  padding:2px 4px; background:transparent; color:inherit; outline:none; }
.hr-title:hover, .hr-title:focus { border-color:var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.hr-meta { display:flex; gap:6px; font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); margin-top:2px; flex-wrap:wrap; }
.hr-faint { color:var(--dsw-alias-label-secondary,#9aa1ab); }
.hr-dirty { color:var(--dsw-alias-state-warn-primary,#d97706); }
.hr-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.hr-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:8px 12px; margin-top:12px; }
.hr-field { display:flex; flex-direction:column; gap:3px; }
.hr-label { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-textarea { width:100%; resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; line-height:1.65; }
.hr-body { min-height:248px; margin-top:10px; }
.hr-guide { margin-top:10px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:8px; padding:0 10px 8px; background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.hr-guide summary { padding:7px 0; cursor:pointer; font-size:12px; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-guide-text { min-height:70px; background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-guide-actions { display:flex; justify-content:flex-end; margin-top:6px; }
.hr-hint { font-size:11px; color:var(--dsw-alias-label-secondary,#9aa1ab); margin:10px 0 0; }
.hr-side-title { font-size:12px; font-weight:600; margin:0 0 8px; }
.hr-note-list { list-style:none; margin:0 0 10px; padding:0; display:flex; flex-direction:column; gap:8px; }
.hr-note-list li { border-left:2px solid var(--dsw-alias-border-l2,#d1d5db); padding-left:7px; }
.hr-note-meta { font-size:10.5px; color:var(--dsw-alias-label-secondary,#6b7280); }
.hr-note-list p { margin:2px 0 0; white-space:pre-wrap; word-break:break-word; }
.hr-note-input { min-height:64px; margin-bottom:6px; background:var(--dsw-alias-bg-layer-1,#fff); }
.hr-note-actions { display:flex; justify-content:flex-end; }
.hr-banner { display:inline-flex; align-items:center; gap:8px; padding:4px 9px; border-radius:7px; font-size:11.5px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); max-width:46ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hr-warn { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); margin-bottom:8px; display:flex; justify-content:space-between; }
.hr-error { border-color:var(--dsw-alias-state-error-primary,#dc2626); color:var(--dsw-alias-state-error-primary,#dc2626); }
.hr-ok { border-color:var(--dsw-alias-state-success-primary,#16a34a); color:var(--dsw-alias-state-success-primary,#16a34a); }
.hr-muted { color:var(--dsw-alias-label-secondary,#6b7280); font-size:12px; }
.hr-pad { padding:8px; }
@media (max-width: 1239px) {
  .hr-body-cols { grid-template-columns:250px minmax(0,1fr); grid-template-rows:minmax(0,1fr) 240px; }
  .hr-side-col { grid-column:1 / -1; border-left:0; border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb); }
}
`

    return {
      inject: ['slots', 'locale'],
      __test: { queryString, formOf, parseList },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hyper-roles: dictionaries')
        t = ctx.locale.bind(NS)

        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: TAB_ID,
          order: 50,
          locale: NS,
          label: () => t('tab'),
        }, RoleTab))
      },
    }
  },
})

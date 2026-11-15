/**
 * 工单标签页：会话里的「工单」看板。
 *
 * 挂载在 `conversation.view`（与「岗位」「Wiki」同一排），拿到 `sessionId`，
 * 所以项目作用域直接取当前会话的工作目录，不需要选目录。纯浏览器模块：
 * React 来自模块表，数据只走 `/hyper-org/api`。
 *
 * 这个面板**不实现任何门禁判断**：`sign.blockers`、`create.notes` 与错误文案
 * 都由 Host 算好下发，客户端只渲染。「禁用按钮」是 UX，真正的拒绝在 Host。
 *
 * 三条硬规则（与岗位面板一致，踩过的坑）：
 * 1. 不用 window.prompt / confirm / alert —— Electron 不支持 prompt，点了静默抛错；
 * 2. 请求失败一定落到可见的错误条上，不允许「点了没反应」；
 * 3. 文案全部走 locale，样式只用 --dsw-alias-* 且带兜底。
 */
window.__ModuleLoader__.load({
  id: '@chrock-studio/dsh-hyper-org',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const NS = 'hyperOrg'
    const TAB_ID = 'orders'
    const API = '/hyper-org/api'
    /** Board groups in reading order; `dropped` is appended so nothing vanishes. */
    const DEFAULT_STAGES = ['intake', 'active', 'review', 'blocked', 'done']
    /** Stages a human may pick in the edit form; `done` only comes from sign. */
    const WRITABLE_STAGES = ['intake', 'active', 'review', 'blocked', 'dropped']
    /** Log entries rendered before the "show all" link appears. */
    const LOG_SHOWN = 100

    let t = (key) => key

    const zh = {
      tab: '工单',
      boardTitle: '工单',
      refresh: '刷新',
      retry: '重试',
      close: '关闭',
      cancel: '取消',
      save: '保存',
      saving: '保存中…',
      saved: '已保存',
      created: '已建单',
      loading: '读取中…',
      error: '出错了',
      noSession: '没有会话上下文',
      selectOrder: '从左选一张工单',
      emptyBoard: '还没有工单，用「＋ 新建工单」开一张',
      newOrder: '新建工单',
      wipLabel: '在制',
      wipOver: '在制已超上限，新单会被压到 intake 排队',
      stageIntake: 'intake',
      stageActive: 'active',
      stageReview: 'review',
      stageBlocked: 'blocked',
      stageDone: 'done',
      stageDropped: 'dropped',
      stage: '当前阶段',
      size: '规模',
      sizeS: '单兵',
      sizeM: '三岗',
      sizeL: '全链路',
      dri: '领取人',
      unassigned: '未指派',
      acceptance: '验收标准',
      artifacts: '交付物',
      log: '完整日志',
      noAcceptance: '无验收标准：M/L 规模的单不能进 active，也不能签收',
      noArtifacts: '没有挂交付物',
      artifactFile: '文件',
      artifactDir: '目录',
      artifactMissing: '文件不存在',
      artifactEscape: '路径越界',
      preview: '预览',
      previewBack: '返回详情',
      copyPath: '复制路径',
      copied: '已复制到剪贴板',
      copyFailed: '复制失败，请手动选择',
      truncated: '已截断：只显示前 256 KiB',
      wrap: '软换行',
      signSection: '签收 / 打回',
      onlyReview: '只有 review 可签收',
      signAs: '签收身份',
      cannotConfirm: '无法确认当前身份：请在会话内操作',
      signNote: '写清签收依据，或打回时要改哪一条',
      signNoteRequired: '签收必须写 note',
      signOff: '签收 → done',
      sendBack: '打回 → active',
      sendBackConfirm: '确认打回？',
      signedOff: '已签收',
      sentBack: '已打回',
      editSection: '改阶段与领取人',
      doneLocked: '只能由签收产生',
      doneFrozen: 'done 不能直接改，只能由签收产生',
      acceptanceHint: '一行一条，逗号不拆',
      artifactsHint: '逗号或换行分隔，只追加',
      noteField: '备注（写进日志）',
      noteRequiredDrop: '撤单要写理由',
      dropConfirm: '确认撤单？',
      createTitle: '标题：一句话说清要交付什么',
      createAcceptance: '验收标准（一行一条，逗号不拆）',
      createNote: '备注（可选）',
      scope: '作用域',
      scopeProject: '本项目',
      scopeGlobal: '全局',
      globalBadge: '全局',
      noProject: '这个会话没有项目根：只能看全局工单，新建会落在全局作用域',
      problems: '个工单文件无法解析',
      dataAt: '数据位置',
      showAll: '显示全部',
      needTitle: '标题不能为空',
      savedNote: '写入成功',
    }

    const en = {
      tab: 'Orders',
      boardTitle: 'Orders',
      refresh: 'Refresh',
      retry: 'Retry',
      close: 'Close',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      created: 'Created',
      loading: 'Loading…',
      error: 'Error',
      noSession: 'No session context',
      selectOrder: 'Pick an order on the left',
      emptyBoard: 'No orders yet — start one with “+ New order”',
      newOrder: 'New order',
      wipLabel: 'In progress',
      wipOver: 'Over the limit: new orders queue in intake',
      stageIntake: 'intake',
      stageActive: 'active',
      stageReview: 'review',
      stageBlocked: 'blocked',
      stageDone: 'done',
      stageDropped: 'dropped',
      stage: 'Stage',
      size: 'Size',
      sizeS: 'single pair of hands',
      sizeM: 'three seats',
      sizeL: 'whole chain',
      dri: 'Assignee',
      unassigned: 'Unassigned',
      acceptance: 'Acceptance criteria',
      artifacts: 'Artifacts',
      log: 'Full log',
      noAcceptance: 'No acceptance criteria: medium and large work cannot go active or be signed',
      noArtifacts: 'No artifacts attached',
      artifactFile: 'file',
      artifactDir: 'directory',
      artifactMissing: 'file missing',
      artifactEscape: 'path escapes',
      preview: 'Preview',
      previewBack: 'Back to detail',
      copyPath: 'Copy path',
      copied: 'Copied',
      copyFailed: 'Copy failed; select the text manually',
      truncated: 'Truncated: first 256 KiB only',
      wrap: 'Wrap',
      signSection: 'Sign off / send back',
      onlyReview: 'Only review orders can be signed',
      signAs: 'Signing as',
      cannotConfirm: 'Cannot confirm your identity: act inside the session',
      signNote: 'Why it passes, or which criterion to fix on a send-back',
      signNoteRequired: 'A note is required to sign',
      signOff: 'Sign off → done',
      sendBack: 'Send back → active',
      sendBackConfirm: 'Send back?',
      signedOff: 'Signed off',
      sentBack: 'Sent back',
      editSection: 'Stage and assignee',
      doneLocked: 'produced by sign only',
      doneFrozen: 'done cannot be edited directly; it comes from sign',
      acceptanceHint: 'one per line; commas do not split',
      artifactsHint: 'comma or newline separated; append only',
      noteField: 'Note (goes into the log)',
      noteRequiredDrop: 'Dropping needs a reason',
      dropConfirm: 'Drop this order?',
      createTitle: 'Title: one sentence on what to deliver',
      createAcceptance: 'Acceptance criteria (one per line; commas do not split)',
      createNote: 'Note (optional)',
      scope: 'Scope',
      scopeProject: 'Project',
      scopeGlobal: 'Global',
      globalBadge: 'global',
      noProject: 'This session has no project root: global orders only; new orders land in the global scope',
      problems: 'order files cannot be parsed',
      dataAt: 'Data',
      showAll: 'Show all',
      needTitle: 'A title is required',
      savedNote: 'Saved',
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

    /** Call one API route, turning a failure into a thrown Error with its status and code. */
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
        throw error
      }
      return body
    }

    /**
     * Group rows by stage, in the order the Host sends.
     * `dropped` is appended when the Host leaves it out, so a cancelled order
     * never disappears from the board. Rows keep the oldest first inside a
     * group, because the point of the column is to show what is aging.
     * @param {object[]} orders - board rows.
     * @param {string[]} stages - stage order from the state payload.
     * @returns {{stage: string, rows: object[]}[]}
     */
    function groupByStage(orders, stages) {
      const list = Array.isArray(orders) ? orders : []
      const order = Array.isArray(stages) && stages.length > 0 ? [...stages] : [...DEFAULT_STAGES]
      if (!order.includes('dropped')) order.push('dropped')
      return order.map((stage) => ({
        stage,
        rows: list
          .filter((row) => row.stage === stage)
          .sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt))),
      }))
    }

    /**
     * The row an operator should see first: work waiting on a decision, then
     * work in flight, then the queue.
     * @param {object[]} orders - board rows.
     * @returns {string|null} an order id.
     */
    function pickFirst(orders) {
      const list = Array.isArray(orders) ? orders : []
      for (const stage of ['review', 'blocked', 'active', 'intake']) {
        const found = list.find((row) => row.stage === stage)
        if (found !== undefined) return found.id
      }
      return list.length > 0 ? list[0].id : null
    }

    /** @param {string} iso - ISO timestamp. @returns `MM-DD HH:mm`, as the log shows it. */
    function formatLogTime(iso) {
      const text = String(iso || '')
      if (text.length < 16) return text === '' ? '—' : text
      return `${text.slice(5, 10)} ${text.slice(11, 16)}`
    }

    /** @param {string} kind - artifact status from the Host. @returns its locale key. */
    function kindKey(kind) {
      if (kind === 'file') return 'artifactFile'
      if (kind === 'dir') return 'artifactDir'
      if (kind === 'escape') return 'artifactEscape'
      return 'artifactMissing'
    }

    /** @param {string} stage - stage id. @returns its locale key. */
    function stageKey(stage) {
      return `stage${String(stage || '').charAt(0).toUpperCase()}${String(stage || '').slice(1)}`
    }

    /** @returns the create form's initial values. */
    function emptyCreate() {
      return { title: '', size: 'M', dri: '', acceptance: '', note: '', scope: 'project' }
    }

    /** @param {object} order - normalized order. @returns edit-form values. */
    function editFrom(order) {
      return {
        stage: order.stage,
        dri: order.dri === undefined ? '' : order.dri,
        acceptance: (order.acceptance || []).join('\n'),
        artifacts: '',
        note: '',
      }
    }

    /** Focused small button. */
    function button(label, onClick, options = {}) {
      return h('button', {
        type: 'button',
        className: `ho-btn${options.primary ? ' ho-primary' : ''}${options.danger ? ' ho-danger' : ''}${options.ghost ? ' ho-ghost' : ''}`,
        onClick,
        disabled: options.disabled === true,
      }, label)
    }

    /** One labelled block of the detail column. */
    function Item({ label, children }) {
      return h('div', { className: 'ho-item' },
        h('div', { className: 'ho-item-label' }, label),
        h('div', { className: 'ho-item-body' }, children),
      )
    }

    /** The tab component. */
    function OrdersTab({ sessionId }) {
      const session = sessionId === undefined || sessionId === null ? '' : String(sessionId)

      const [state, setState] = useState(null)
      const [selected, setSelected] = useState(null)
      const [doc, setDoc] = useState(null)
      const [preview, setPreview] = useState(null)
      const [wrap, setWrap] = useState(true)
      const [phase, setPhase] = useState('')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [showProblems, setShowProblems] = useState(false)
      const [collapsed, setCollapsed] = useState({ done: true, dropped: true })
      const [showAllLog, setShowAllLog] = useState(false)
      const [creating, setCreating] = useState(false)
      const [form, setForm] = useState(emptyCreate())
      const [edit, setEdit] = useState(null)
      const [signNote, setSignNote] = useState('')
      const [sendBack, setSendBack] = useState(false)
      const [confirmDrop, setConfirmDrop] = useState(false)

      const busy = phase !== ''

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
        if (session === '') {
          setState(null)
          return
        }
        setPhase('state')
        try {
          const body = await call(`${API}/state${queryString({ session })}`)
          setState(body)
          setError('')
        } catch (failure) {
          fail(failure)
        } finally {
          setPhase('')
        }
      }, [session, fail])

      const openOrder = useCallback(async (id) => {
        if (id === null || id === undefined || id === '') return
        setSelected(String(id))
        setPreview(null)
        setShowAllLog(false)
        setSendBack(false)
        setConfirmDrop(false)
        setSignNote('')
        setPhase('order')
        try {
          const body = await call(`${API}/order${queryString({ session, id })}`)
          setDoc(body)
          setEdit(editFrom(body.order))
          setError('')
        } catch (failure) {
          setDoc(null)
          setEdit(null)
          fail(failure)
        } finally {
          setPhase('')
        }
      }, [session, fail])

      useEffect(() => {
        loadState()
      }, [loadState])

      // Open something as soon as the board arrives: an empty detail column on a
      // board with orders reads as a missing feature.
      useEffect(() => {
        if (state === null || selected !== null) return
        const first = pickFirst(state.orders)
        if (first !== null) openOrder(first)
      }, [state, selected, openOrder])

      const create = useCallback(async () => {
        const title = form.title.trim()
        if (title === '') {
          fail(new Error(t('needTitle')))
          return
        }
        setPhase('write')
        try {
          const body = await call(`${API}/order${queryString({ session })}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              scope: state !== null && state.projectRoot === null ? 'global' : form.scope,
              title,
              size: form.size,
              dri: form.dri,
              acceptance: form.acceptance,
              note: form.note,
            }),
          })
          setCreating(false)
          setForm(emptyCreate())
          const notes = Array.isArray(body.notes) ? body.notes : []
          flash(notes.length === 0 ? t('created') : `${t('created')} · ${notes.join(' ')}`)
          await loadState()
          await openOrder(body.order.id)
        } catch (failure) {
          fail(failure)
        } finally {
          setPhase('')
        }
      }, [form, state, session, loadState, openOrder, flash, fail])

      const saveEdit = useCallback(async () => {
        if (edit === null || selected === null) return
        if (edit.stage === 'dropped' && edit.note.trim() === '') {
          fail(new Error(t('noteRequiredDrop')))
          return
        }
        setPhase('write')
        try {
          const body = await call(`${API}/order/${encodeURIComponent(selected)}${queryString({ session })}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              stage: edit.stage,
              dri: edit.dri,
              acceptance: edit.acceptance,
              artifacts: edit.artifacts,
              note: edit.note,
            }),
          })
          setDoc(body)
          setEdit(editFrom(body.order))
          setConfirmDrop(false)
          flash(t('saved'))
          await loadState()
        } catch (failure) {
          fail(failure)
        } finally {
          setPhase('')
        }
      }, [edit, selected, session, loadState, flash, fail])

      const sign = useCallback(async (approve) => {
        if (selected === null) return
        const note = signNote.trim()
        if (note === '') {
          fail(new Error(t('signNoteRequired')))
          return
        }
        setPhase('write')
        try {
          const body = await call(`${API}/order/${encodeURIComponent(selected)}/sign${queryString({ session })}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ approve, note }),
          })
          setDoc(body)
          setEdit(editFrom(body.order))
          setSignNote('')
          setSendBack(false)
          flash(approve ? t('signedOff') : t('sentBack'))
          await loadState()
        } catch (failure) {
          // An order deleted outside the panel would otherwise leave a ghost
          // selection behind: clear it and reload the board.
          if (failure.code === 'order_not_found') {
            setSelected(null)
            setDoc(null)
            setEdit(null)
            setPreview(null)
            await loadState()
          }
          fail(failure)
        } finally {
          setPhase('')
        }
      }, [selected, signNote, session, loadState, flash, fail])

      const openPreview = useCallback(async (path) => {
        if (selected === null) return
        setPhase('order')
        try {
          const body = await call(`${API}/artifact${queryString({ session, id: selected, path })}`)
          setPreview({ path: body.path, text: body.text, truncated: body.truncated, bytes: body.bytes })
          setError('')
        } catch (failure) {
          fail(failure)
        } finally {
          setPhase('')
        }
      }, [session, selected, fail])

      const copyPath = useCallback(async (path) => {
        if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
          fail(new Error(t('copyFailed')))
          return
        }
        try {
          await navigator.clipboard.writeText(String(path))
          flash(t('copied'))
        } catch {
          fail(new Error(t('copyFailed')))
        }
      }, [flash, fail])

      const orders = state === null || !Array.isArray(state.orders) ? [] : state.orders
      const roles = state === null || !Array.isArray(state.roles) ? [] : state.roles
      const groups = groupByStage(orders, state === null ? DEFAULT_STAGES : state.stages)
      const occupied = state === null ? 0 : state.occupied
      const wipLimit = state === null ? 0 : state.wipLimit
      const overWip = state !== null && occupied > wipLimit
      const noProject = state !== null && state.projectRoot === null

      // ---------------------------------------------------------------- list
      const scopeButton = (value, label, disabled) => h('button', {
        type: 'button',
        className: `ho-seg-btn${form.scope === value ? ' ho-seg-on' : ''}`,
        onClick: () => setForm({ ...form, scope: value }),
        disabled,
      }, label)

      const driOptions = h('select', {
        className: 'ho-input',
        value: form.dri,
        onChange: (event) => setForm({ ...form, dri: event.target.value }),
      }, [
        h('option', { key: '', value: '' }, t('unassigned')),
        ...roles.map((role) => h('option', { key: `${role.scope}:${role.id}`, value: role.id }, `${role.title}（${role.id}）`)),
      ])

      const createForm = h('div', { className: 'ho-create' },
        h('input', {
          className: 'ho-input',
          placeholder: t('createTitle'),
          value: form.title,
          onChange: (event) => setForm({ ...form, title: event.target.value }),
        }),
        h('select', {
          className: 'ho-input',
          value: form.size,
          onChange: (event) => setForm({ ...form, size: event.target.value }),
        }, ['S', 'M', 'L'].map((size) => h('option', { key: size, value: size }, `${size} · ${t(`size${size}`)}`))),
        driOptions,
        h('div', { className: 'ho-seg' },
          scopeButton('project', t('scopeProject'), noProject),
          scopeButton('global', t('scopeGlobal'), false),
        ),
        h('textarea', {
          className: 'ho-textarea ho-create-acceptance',
          placeholder: t('createAcceptance'),
          value: form.acceptance,
          onChange: (event) => setForm({ ...form, acceptance: event.target.value }),
        }),
        h('input', {
          className: 'ho-input',
          placeholder: t('createNote'),
          value: form.note,
          onChange: (event) => setForm({ ...form, note: event.target.value }),
        }),
        h('div', { className: 'ho-actions' },
          button(t('cancel'), () => setCreating(false), { ghost: true }),
          button(busy ? t('saving') : t('create'), create, { primary: true, disabled: busy }),
        ),
      )

      const renderRow = (row) => h('li', {
        key: row.id,
        className: `ho-row${selected === row.id ? ' ho-row-on' : ''}`,
        onClick: () => openOrder(row.id),
      },
        h('span', { className: 'ho-row-title', title: row.title }, row.title),
        h('span', { className: 'ho-row-meta' },
          h('span', { className: 'ho-row-size' }, row.size),
          h('span', null, '·'),
          h('span', { className: 'ho-row-dri' }, row.driTitle || row.dri || t('unassigned')),
          h('span', null, '·'),
          h('span', { className: 'ho-row-age' }, row.age),
          row.scope === 'global' ? h('em', { className: 'ho-badge' }, t('globalBadge')) : null,
        ),
      )

      const renderGroup = (group) => {
        const isCollapsed = collapsed[group.stage] === true
        return h('div', { key: group.stage, className: 'ho-group' },
          h('button', {
            type: 'button',
            className: 'ho-group-head',
            onClick: () => setCollapsed({ ...collapsed, [group.stage]: !isCollapsed }),
          },
            h('span', { className: 'ho-caret' }, isCollapsed ? '▸' : '▾'),
            h('span', null, `${t(stageKey(group.stage))} (${group.rows.length})`),
          ),
          isCollapsed
            ? null
            : group.rows.length === 0
              ? h('p', { className: 'ho-muted ho-group-empty' }, '—')
              : h('ul', { className: 'ho-rows' }, group.rows.map(renderRow)),
        )
      }

      const listColumn = h('aside', { className: 'ho-col ho-list-col' },
        h('div', { className: 'ho-list-head' },
          h('span', { className: 'ho-list-title' }, `${t('boardTitle')} (${orders.length})`),
          button(t('refresh'), loadState, { ghost: true, disabled: busy }),
        ),
        h('div', { className: `ho-wip${overWip ? ' ho-wip-over' : ''}` },
          `${t('wipLabel')} ${occupied}/${wipLimit}`,
          overWip ? h('span', { className: 'ho-wip-warn' }, t('wipOver')) : null,
        ),
        noProject ? h('p', { className: 'ho-hint' }, t('noProject')) : null,
        state !== null && Array.isArray(state.problems) && state.problems.length > 0
          ? h('div', { className: 'ho-problems' },
              h('button', {
                type: 'button',
                className: 'ho-problems-head',
                onClick: () => setShowProblems(!showProblems),
              }, `${state.problems.length} ${t('problems')}`),
              showProblems
                ? h('ul', { className: 'ho-problem-list' }, state.problems.map((problem, index) => h('li',
                    { key: `${problem.path}-${index}` },
                    `${problem.path} — ${problem.message}`,
                  )))
                : null,
            )
          : null,
        h('button', {
          type: 'button',
          className: 'ho-new',
          onClick: () => setCreating(!creating),
          disabled: state === null,
        }, creating ? t('cancel') : `＋ ${t('newOrder')}`),
        creating ? createForm : null,
        state === null
          ? h('p', { className: 'ho-muted ho-pad' }, phase === 'state' ? t('loading') : t('selectOrder'))
          : orders.length === 0
            ? h('p', { className: 'ho-muted ho-pad' }, t('emptyBoard'))
            : h('div', { className: 'ho-groups' }, groups.map(renderGroup)),
      )

      // -------------------------------------------------------------- detail
      const logBlock = (order) => {
        const entries = (Array.isArray(order.log) ? order.log : []).slice().reverse()
        const shown = showAllLog ? entries : entries.slice(0, LOG_SHOWN)
        return h('div', { className: 'ho-log' },
          h('ul', { className: 'ho-log-list' }, shown.map((entry, index) => h('li', { key: `${entry.at}-${index}` },
            h('span', { className: 'ho-log-meta' }, `${formatLogTime(entry.at)} · ${entry.by}`),
            h('p', { className: 'ho-log-note' }, entry.note),
          ))),
          entries.length > LOG_SHOWN && !showAllLog
            ? h('button', { type: 'button', className: 'ho-link', onClick: () => setShowAllLog(true) },
                `${t('showAll')}（${entries.length}）`)
            : null,
        )
      }

      const artifactsBlock = () => {
        const rows = Array.isArray(doc.artifacts) ? doc.artifacts : []
        if (rows.length === 0) return h('p', { className: 'ho-muted' }, t('noArtifacts'))
        return h('ul', { className: 'ho-artifacts' }, rows.map((entry) => h('li', {
          key: entry.path,
          className: `ho-artifact ho-artifact-${entry.kind}`,
        },
          h('button', {
            type: 'button',
            className: 'ho-artifact-open',
            title: entry.path,
            disabled: entry.kind !== 'file' || noProject || busy,
            onClick: () => openPreview(entry.path),
          }, entry.path),
          h('span', { className: 'ho-artifact-kind' }, t(kindKey(entry.kind))),
          h('button', { type: 'button', className: 'ho-link', onClick: () => copyPath(entry.path) }, t('copyPath')),
        )))
      }

      const detailView = () => {
        const order = doc.order
        const sizeText = `${order.size} · ${t(`size${order.size}`)}`
        const driText = order.dri === undefined || order.dri === ''
          ? t('unassigned')
          : `${doc.driTitle || order.dri}（${order.dri}）`
        return h('section', { className: 'ho-col ho-detail-col' },
          h('div', { className: 'ho-detail-head' },
            h('h2', { className: 'ho-detail-title' }, order.title),
            h('div', { className: 'ho-meta' },
              h('span', null, order.id),
              h('span', null, '·'),
              h('span', null, doc.scope === 'project' ? t('scopeProject') : t('scopeGlobal')),
              h('span', null, '·'),
              h('span', null, doc.age),
            ),
          ),
          h(Item, { label: t('stage') },
            h('span', { className: `ho-stage ho-stage-${order.stage}` }, order.stage),
            order.stage === 'done' ? h('span', { className: 'ho-faint' }, ` · ${t('doneLocked')}`) : null,
          ),
          h(Item, { label: t('size') }, sizeText),
          h(Item, { label: t('dri') }, driText),
          h(Item, { label: t('acceptance') },
            (order.acceptance || []).length === 0
              ? h('p', { className: 'ho-warn-inline' }, t('noAcceptance'))
              : h('ul', { className: 'ho-acceptance' }, (order.acceptance || []).map((entry, index) => h('li', { key: index }, entry))),
          ),
          h(Item, { label: t('artifacts') }, artifactsBlock()),
          h(Item, { label: t('log') }, logBlock(order)),
        )
      }

      const previewView = () => h('section', { className: 'ho-col ho-detail-col' },
        h('div', { className: 'ho-detail-head' },
          h('h2', { className: 'ho-detail-title ho-mono' }, preview.path),
          h('div', { className: 'ho-actions' },
            button(t('copyPath'), () => copyPath(preview.path), { ghost: true }),
            button(t('wrap'), () => setWrap(!wrap), { ghost: true, primary: wrap }),
            button(t('previewBack'), () => setPreview(null)),
          ),
        ),
        preview.truncated ? h('p', { className: 'ho-warn-inline' }, t('truncated')) : null,
        h('pre', { className: `ho-pre${wrap ? ' ho-pre-wrap' : ''}` }, preview.text),
      )

      // ---------------------------------------------------------------- side
      const signPanel = () => {
        const order = doc.order
        if (order.stage !== 'review') {
          return h('section', { className: 'ho-card' },
            h('h3', { className: 'ho-card-title' }, t('signSection')),
            h('p', { className: 'ho-muted' }, t('onlyReview')),
          )
        }
        const blockers = doc.sign !== undefined && Array.isArray(doc.sign.blockers) ? doc.sign.blockers : []
        const confirmed = state === null || state.actor === undefined || state.actor.confirmed !== false
        const label = state !== null && state.actor !== undefined ? state.actor.label : 'lead'
        const noteMissing = signNote.trim() === ''
        const approveBlocked = blockers.length > 0 || noteMissing || !confirmed
        // Sending back only needs a note and a signer who is not the DRI: the
        // other blockers describe signing off.
        const sendBackBlocked = noteMissing
          || !confirmed
          || blockers.some((entry) => entry.code === 'self_sign')
        return h('section', { className: 'ho-card' },
          h('h3', { className: 'ho-card-title' }, t('signSection')),
          h('p', { className: 'ho-muted' }, `${t('signAs')}：${label}`),
          confirmed ? null : h('p', { className: 'ho-warn-inline' }, t('cannotConfirm')),
          blockers.length === 0 ? null : h('ul', { className: 'ho-blockers' }, blockers.map((entry) => h('li',
            { key: entry.code, className: 'ho-blocker' }, entry.message))),
          noteMissing ? h('p', { className: 'ho-hint' }, t('signNoteRequired')) : null,
          h('textarea', {
            className: 'ho-textarea ho-sign-note',
            placeholder: t('signNote'),
            value: signNote,
            onChange: (event) => setSignNote(event.target.value),
          }),
          h('div', { className: 'ho-actions' },
            button(busy ? t('saving') : t('signOff'), () => sign(true), { primary: true, disabled: busy || approveBlocked }),
            sendBack
              ? button(t('sendBackConfirm'), () => sign(false), { danger: true, disabled: busy || sendBackBlocked })
              : button(t('sendBack'), () => setSendBack(true), { danger: true, disabled: busy || sendBackBlocked }),
            sendBack ? button(t('cancel'), () => setSendBack(false), { ghost: true }) : null,
          ),
        )
      }

      const editPanel = () => {
        if (edit === null) return null
        const order = doc.order
        const done = order.stage === 'done'
        const stageOptions = [
          ...WRITABLE_STAGES.map((stage) => h('option', { key: stage, value: stage }, t(stageKey(stage)))),
          h('option', { key: 'done', value: 'done', disabled: true }, `${t(stageKey('done'))}（${t('doneLocked')}）`),
        ]
        const dropNeedsReason = edit.stage === 'dropped' && edit.note.trim() === ''
        const saveLabel = edit.stage === 'dropped' && confirmDrop ? t('dropConfirm') : t('save')
        return h('section', { className: 'ho-card' },
          h('h3', { className: 'ho-card-title' }, t('editSection')),
          done ? h('p', { className: 'ho-hint' }, t('doneFrozen')) : null,
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, t('stage')),
            h('select', {
              className: 'ho-input',
              value: edit.stage,
              disabled: done,
              onChange: (event) => {
                setConfirmDrop(false)
                setEdit({ ...edit, stage: event.target.value })
              },
            }, stageOptions),
          ),
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, t('dri')),
            h('select', {
              className: 'ho-input',
              value: edit.dri,
              disabled: done,
              onChange: (event) => setEdit({ ...edit, dri: event.target.value }),
            }, [
              h('option', { key: '', value: '' }, t('unassigned')),
              ...roles.map((role) => h('option', { key: `${role.scope}:${role.id}`, value: role.id }, `${role.title}（${role.id}）`)),
            ]),
          ),
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, `${t('acceptance')} · ${t('acceptanceHint')}`),
            h('textarea', {
              className: 'ho-textarea',
              value: edit.acceptance,
              disabled: done,
              onChange: (event) => setEdit({ ...edit, acceptance: event.target.value }),
            }),
          ),
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, `${t('artifacts')} · ${t('artifactsHint')}`),
            h('textarea', {
              className: 'ho-textarea ho-artifacts-input',
              value: edit.artifacts,
              placeholder: t('artifactsHint'),
              disabled: done,
              onChange: (event) => setEdit({ ...edit, artifacts: event.target.value }),
            }),
          ),
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, t('noteField')),
            h('input', {
              className: 'ho-input',
              value: edit.note,
              disabled: done,
              onChange: (event) => setEdit({ ...edit, note: event.target.value }),
            }),
          ),
          h('div', { className: 'ho-actions' },
            button(busy ? t('saving') : saveLabel, () => {
              if (edit.stage === 'dropped' && !confirmDrop) {
                setConfirmDrop(true)
                return
              }
              saveEdit()
            }, { primary: true, disabled: busy || done || dropNeedsReason }),
          ),
        )
      }

      const dataCard = () => h('section', { className: 'ho-card' },
        h('h3', { className: 'ho-card-title' }, t('dataAt')),
        h('p', { className: 'ho-muted' }, `${t('scopeProject')}：${state !== null && state.projectDir !== null ? '.dsh/org/' : '—'}`),
        h('p', { className: 'ho-muted' }, `${t('scopeGlobal')}：${state === null ? '' : state.globalDir}`),
      )

      // -------------------------------------------------------------- frames
      const banners = error === '' && notice === ''
        ? null
        : h('div', { className: 'ho-banners' },
            error === '' ? null : h('div', { className: 'ho-banner ho-banner-error' },
              h('span', { className: 'ho-banner-text' }, error),
              button(t('retry'), loadState, { ghost: true, disabled: busy }),
              button(t('close'), () => setError(''), { ghost: true }),
            ),
            notice === '' ? null : h('div', { className: 'ho-banner ho-banner-ok' },
              h('span', { className: 'ho-banner-text' }, notice),
              button(t('close'), () => setNotice(''), { ghost: true }),
            ),
          )

      const body = session === ''
        ? h('p', { className: 'ho-muted ho-pad' }, t('noSession'))
        : h('div', { className: 'ho-cols' },
            listColumn,
            preview !== null ? previewView() : doc === null
              ? h('section', { className: 'ho-col ho-detail-col' },
                  h('p', { className: 'ho-placeholder' }, phase === 'order' ? t('loading') : t('selectOrder')))
              : detailView(),
            doc === null
              ? h('aside', { className: 'ho-col ho-side' },
                  h('p', { className: 'ho-muted' }, phase === 'order' ? t('loading') : t('selectOrder')))
              : h('aside', { className: 'ho-col ho-side' },
                  signPanel(),
                  editPanel(),
                  state === null ? null : dataCard(),
                ),
          )

      return h('div', { className: 'ho-root' },
        h('style', null, STYLES),
        banners,
        body,
      )
    }

    const STYLES = `
.ho-root, .ho-root *, .ho-root *::before, .ho-root *::after { box-sizing:border-box; }
.ho-root { display:flex; flex-direction:column; flex:1 1 auto; width:100%; height:100%; min-height:0;
  color:var(--dsw-alias-label-primary,#1f2328); background:var(--dsw-alias-bg-base,transparent);
  font-size:13px; line-height:1.55; overflow:hidden; }
.ho-banners { display:flex; flex-direction:column; gap:6px; padding:7px 14px; flex:none;
  border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-banner { display:flex; align-items:center; gap:8px; padding:4px 9px; border-radius:7px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); font-size:11.5px; }
.ho-banner-error { border-color:var(--dsw-alias-state-error-primary,#dc2626); color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-banner-ok { border-color:var(--dsw-alias-state-success-primary,#16a34a); color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-banner-text { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.ho-cols { flex:1 1 auto; min-height:0; display:grid; grid-template-columns:248px minmax(0,1fr) 286px;
  background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-col { min-height:0; overflow-y:auto; overflow-x:hidden; }
.ho-list-col { border-right:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding:0 8px 8px; }
.ho-detail-col { padding:14px 16px 40px; }
.ho-side { border-left:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding:12px; display:flex; flex-direction:column; gap:10px; }
.ho-list-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding:8px 0 6px; background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-list-title { font-weight:600; }
.ho-wip { display:flex; flex-direction:column; gap:2px; padding:4px 8px; margin-bottom:8px; font-size:11.5px;
  color:var(--dsw-alias-label-secondary,#6b7280); border:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  border-radius:7px; background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-wip-over { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-wip-warn { font-size:11px; }
.ho-new { display:flex; align-items:center; justify-content:center; width:100%; padding:5px 8px; margin-bottom:8px;
  border:1px dashed var(--dsw-alias-border-l2,#d1d5db); border-radius:7px; background:var(--dsw-alias-bg-layer-2,#f8f9fb);
  color:var(--dsw-alias-label-secondary,#6b7280); font-size:12px; cursor:pointer; }
.ho-new:hover:not(:disabled) { border-color:var(--dsw-alias-brand-primary,#2563eb); color:var(--dsw-alias-brand-primary,#2563eb); }
.ho-new:disabled { opacity:.45; cursor:default; }
.ho-create { display:flex; flex-direction:column; gap:6px; padding:8px; margin-bottom:8px;
  border:1px dashed var(--dsw-alias-border-l2,#d1d5db); border-radius:8px; }
.ho-create-acceptance { min-height:60px; }
.ho-seg { display:flex; gap:2px; padding:2px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  border-radius:8px; background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.ho-seg-btn { flex:1; border:none; background:none; padding:3px 8px; border-radius:6px; font-size:12px;
  color:var(--dsw-alias-label-secondary,#6b7280); cursor:pointer; }
.ho-seg-btn:disabled { opacity:.45; cursor:default; }
.ho-seg-on { background:var(--dsw-alias-bg-layer-1,#fff); color:var(--dsw-alias-label-primary,#111827); box-shadow:0 1px 2px rgba(0,0,0,.06); }
.ho-groups { display:flex; flex-direction:column; gap:6px; }
.ho-group { border-radius:8px; }
.ho-group-head { display:flex; align-items:center; gap:6px; width:100%; padding:5px 6px; border:none; background:none;
  border-radius:6px; color:var(--dsw-alias-label-secondary,#6b7280); font-size:11.5px; font-weight:600;
  letter-spacing:.02em; cursor:pointer; text-align:left; }
.ho-group-head:hover { background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.ho-caret { width:10px; display:inline-block; }
.ho-group-empty { margin:2px 0 4px 22px; font-size:11.5px; }
.ho-rows { list-style:none; margin:0; padding:0; }
.ho-row { display:flex; flex-direction:column; gap:2px; padding:7px 9px; border-radius:8px; cursor:pointer; }
.ho-row:hover { background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.ho-row-on { background:color-mix(in srgb, var(--dsw-alias-brand-primary,#2563eb) 14%, var(--dsw-alias-bg-layer-1,#fff));
  box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary,#2563eb); }
.ho-row-title { font-weight:550; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.ho-row-meta { display:flex; gap:5px; align-items:center; flex-wrap:wrap; font-size:11px;
  color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-row-age { color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-badge { font-style:normal; font-size:10px; padding:0 4px; border-radius:999px;
  border:1px solid var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-problems { margin-bottom:8px; border:1px solid var(--dsw-alias-state-warn-primary,#d97706); border-radius:7px;
  padding:4px 7px; font-size:11.5px; color:var(--dsw-alias-state-warn-primary,#d97706);
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-problems-head { border:none; background:none; color:inherit; font:inherit; cursor:pointer; padding:0; }
.ho-problem-list { margin:4px 0 0; padding-left:16px; }
.ho-problem-list li { word-break:break-all; }
.ho-muted { color:var(--dsw-alias-label-secondary,#6b7280); font-size:12px; }
.ho-faint { color:var(--dsw-alias-label-secondary,#9aa1ab); font-size:11.5px; }
.ho-pad { padding:8px; }
.ho-hint { margin:4px 0; font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-placeholder { margin:40px auto; color:var(--dsw-alias-label-secondary,#6b7280); text-align:center; }
.ho-detail-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:12px; }
.ho-detail-title { margin:0; font-size:16px; font-weight:600; word-break:break-word; }
.ho-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; }
.ho-meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:3px; font-size:11px;
  color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-item { display:grid; grid-template-columns:96px minmax(0,1fr); gap:10px; padding:7px 0;
  border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb); }
.ho-item-label { font-size:11.5px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-item-body { min-width:0; }
.ho-stage { font-weight:600; }
.ho-stage-done { color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-stage-blocked { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-stage-review { color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-acceptance { margin:0; padding-left:16px; }
.ho-acceptance li { margin:1px 0; word-break:break-word; }
.ho-warn-inline { margin:0; padding:4px 8px; border-radius:6px; font-size:11.5px;
  border:1px solid var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706);
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-artifacts { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:3px; }
.ho-artifact { display:flex; align-items:center; gap:6px; font-size:12px; }
.ho-artifact-open { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  border:none; background:none; color:var(--dsw-alias-brand-primary,#2563eb); font:inherit; cursor:pointer; padding:0; text-align:left; }
.ho-artifact-open:disabled { color:var(--dsw-alias-label-secondary,#9aa1ab); cursor:default; }
.ho-artifact-open:disabled:hover { text-decoration:none; }
.ho-artifact-open:hover:not(:disabled) { text-decoration:underline; }
.ho-artifact-kind { font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-artifact-missing .ho-artifact-kind, .ho-artifact-escape .ho-artifact-kind { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-link { border:none; background:none; color:var(--dsw-alias-brand-primary,#2563eb); cursor:pointer;
  padding:0 2px; font-size:11px; }
.ho-log { max-height:260px; overflow:auto; }
.ho-log-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:7px; }
.ho-log-list li { border-left:2px solid var(--dsw-alias-border-l2,#d1d5db); padding-left:7px; }
.ho-log-meta { font-size:10.5px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-log-note { margin:1px 0 0; white-space:pre-wrap; word-break:break-word; }
.ho-pre { margin:0; padding:10px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:8px;
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px; line-height:1.6; overflow:auto; max-height:calc(100% - 90px); }
.ho-pre-wrap { white-space:pre-wrap; word-break:break-word; }
.ho-card { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:9px; padding:9px 10px;
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-card-title { margin:0 0 7px; font-size:12.5px; font-weight:600; }
.ho-field { display:flex; flex-direction:column; gap:3px; margin-bottom:7px; }
.ho-label { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-input, .ho-textarea { width:100%; border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:7px;
  padding:5px 7px; background:var(--dsw-alias-bg-layer-1,#fff); color:inherit; outline:none; font:inherit; }
.ho-input:focus, .ho-textarea:focus { border-color:var(--dsw-alias-brand-primary,#2563eb); }
.ho-textarea { resize:vertical; min-height:56px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
.ho-sign-note { min-height:58px; margin-bottom:6px; }
.ho-artifacts-input { min-height:46px; }
.ho-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.ho-btn { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff);
  color:inherit; padding:4px 10px; border-radius:7px; font-size:12px; cursor:pointer; white-space:nowrap; }
.ho-btn:hover:not(:disabled) { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.ho-btn:disabled { opacity:.45; cursor:default; }
.ho-primary { background:var(--dsw-alias-brand-primary,#2563eb); border-color:var(--dsw-alias-brand-primary,#2563eb); color:#fff; }
.ho-danger { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-ghost { border-color:transparent; background:transparent; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-blockers { list-style:none; margin:0 0 7px; padding:0; display:flex; flex-direction:column; gap:4px; }
.ho-blocker { font-size:11px; color:var(--dsw-alias-state-warn-primary,#d97706); }
@media (max-width: 1239px) {
  .ho-cols { grid-template-columns:236px minmax(0,1fr); grid-template-rows:minmax(0,1fr) 240px; }
  .ho-side { grid-column:1 / -1; border-left:0; border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);
    flex-direction:row; flex-wrap:wrap; overflow-y:auto; }
  .ho-side > .ho-card { flex:1 1 260px; }
}
`

    return {
      inject: ['slots', 'locale'],
      __test: { queryString, groupByStage, pickFirst, formatLogTime, kindKey },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hyper-org: dictionaries')
        t = ctx.locale.bind(NS)

        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: TAB_ID,
          order: 70,
          locale: NS,
          label: () => t('tab'),
        }, OrdersTab))
      },
    }
  },
})

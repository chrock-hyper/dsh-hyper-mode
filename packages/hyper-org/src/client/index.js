/**
 * 工单标签页：会话里的「工单」看板（v2 · Kanban 五列 + 固定检查器）。
 *
 * 挂载在 `conversation.view`（与「岗位」「Wiki」同一排），拿到 `sessionId`，
 * 所以项目作用域直接取当前会话的工作目录，不需要选目录。纯浏览器模块：
 * React 来自模块表，数据只走 `/hyper-org/api`。
 *
 * 这个面板**不实现任何门禁判断**：拖拽与检查器改阶段都只是把 stage 发给 Host
 * （同一个 `PATCH /hyper-org/api/order/:id`，与 `org_order action=update` 同一条
 * `updateWithRules → store.saveOrder` 路径），409/400 的原文显示在错误条上，
 * 卡片原地不动——不做乐观移动，也不在前端拦 M/L 无验收、WIP 满或 done。
 * `sign.blockers`、`create.notes` 同理：Host 算好下发，客户端只渲染。
 * 「禁用按钮」是 UX，真正的拒绝在 Host。
 *
 * 交付物不再自绘预览：点「在 DSH 预览中打开」后由 `ctx.get('sidebarRight')`
 * 的 `openResource(sessionFileAddress(sessionId, absolutePath))` 在最右侧栏
 * 打开 DSH 自己的文档预览（Markdown / 代码 / 图片 / PDF / Office / HTML）。
 * 面板不读取文件内容，也没有自定义文件读取路由。
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
    /** The five columns, in reading order; `done` is entered by sign only. */
    const BOARD_STAGES = ['intake', 'active', 'review', 'blocked', 'done']
    /** Stages a human may pick in the stage menu; `done` only comes from sign. */
    const WRITABLE_STAGES = ['intake', 'active', 'review', 'blocked', 'dropped']
    /** Log entries rendered before the "show all" link appears. */
    const LOG_SHOWN = 100
    /** A review card is "overdue" past this many hours; a display threshold only. */
    const OVERDUE_HOURS = 72
    /** DSH's own preview address prefix (same shape as `sessionFileAddress`). */
    const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

    /** The client context, captured in `apply`, so services are resolved lazily. */
    let services
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
      selectOrder: '选一张工单',
      selectOrderHint: '点左侧卡片；右侧只显示六项，不重复渲染文件',
      emptyBoard: '还没有工单，用「＋ 新建工单」开一张',
      emptyBoardHint: '空看板不是错误：.dsh/org/orders/ 下没有可解析的工单',
      newOrder: '新建工单',
      wipLabel: '在制',
      overdueLabel: '超龄',
      noAccLabel: '无验收',
      wipOver: '在制已超上限，新单会被压到 intake 排队',
      stageIntake: 'intake',
      stageActive: 'active',
      stageReview: 'review',
      stageBlocked: 'blocked',
      stageDone: 'done',
      stageDropped: 'dropped',
      stageIntakeSub: '排队',
      stageActiveSub: '在制',
      stageReviewSub: '待验收',
      stageBlockedSub: '受阻',
      stageDoneSub: '已签收',
      stageDroppedSub: '已撤单',
      colIntakeFoot: '降级落点',
      colIntakeFootRight: '新单排队',
      colActiveFootRightFull: '已满',
      colActiveFootRightFree: '有名额',
      colReviewFoot: '只有这里能签收',
      colBlockedFoot: '需外部条件',
      colBlockedFootRight: '看最新日志',
      colDoneFoot: '由 sign 产生',
      colDoneFootRight: '只读进入',
      doneOnlySign: '只能由签收进入',
      signed: '已签收',
      stage: '当前阶段',
      stageDoneNote: 'done 只能由签收产生；拖入会被 Host 拒绝，拖出与 Agent 的 update 同路',
      size: '规模',
      sizeS: '单兵',
      sizeM: '三岗',
      sizeL: '全链路',
      dri: '领取人（DRI）',
      driHint: '岗位名 + id；未指派时 M/L 派活要先指派',
      unassigned: '未指派',
      acceptance: '验收标准',
      artifacts: '交付物',
      log: '完整日志',
      countAcceptance: '验收',
      countArtifacts: '交付物',
      countLog: '日志',
      overdueDays: '{n} 天',
      noAcceptance: '无验收标准：M/L 规模的单不能进 active，也不能签收',
      noArtifacts: '没有挂交付物',
      artifactFile: '文件',
      artifactDir: '目录',
      artifactMissing: '文件不存在',
      artifactEscape: '路径越界',
      openInDsh: '在 DSH 预览中打开',
      openInDshHint: '在最右侧栏打开，由 DSH 自己渲染',
      openedInDsh: '已在右侧栏打开',
      noPreviewService: '当前界面没有 DSH 文档预览服务',
      noAbsolutePath: '这个交付物解析不出绝对路径（missing / 越界）',
      previewFailed: '打开 DSH 预览失败，请重试',
      logCount: '共 {n} 条 · 最新在上',
      showAll: '显示全部',
      signSection: '签收 / 打回',
      onlyReview: '只有 review 可签收',
      onlyReviewHint: '先改到 review，再写 note 签收',
      signAs: '签收身份',
      cannotConfirm: '无法确认当前身份：请在会话内操作',
      signNote: '写清签收依据，或打回时要改哪一条',
      signNoteRequired: '签收必须写 note',
      signOff: '签收 → done',
      sendBack: '打回 → active',
      sendBackConfirm: '确认打回？',
      signedOff: '已签收',
      sentBack: '已打回',
      editSection: '改阶段与明细',
      stageChangeHint: '改阶段与拖拽是同一个请求：PATCH /hyper-org/api/order/:id',
      doneLocked: '只能由签收产生',
      doneFrozen: 'done 只能由签收进入；把它改成别的阶段是允许的（Agent 也这么做）',
      acceptanceHint: '一行一条，逗号不拆',
      artifactsHint: '逗号或换行分隔，只追加',
      noteField: 'note（写进日志）',
      noteRequiredDrop: '撤单要写理由',
      dropTitle: '撤单理由',
      dropHint: '拖到 dropped 就是 update，update 要求 note；理由会写进日志，文件不删除',
      dropConfirm: '确认撤单',
      createTitleLabel: '标题',
      createTitle: '一句话说清要交付什么',
      createSize: '规模',
      createDri: '领取人',
      createAcceptance: '验收标准（一行一条，逗号不拆）',
      createNote: 'note（可选）',
      createHint: '建单与 org_order create 同一条路径；M/L 无验收标准或在制满时会被压回 intake，那是正常结果',
      createTitleRequired: '标题不能为空',
      scope: '作用域',
      scopeProject: '本项目',
      scopeGlobal: '全局',
      globalBadge: '全局',
      noProject: '这个会话没有项目根：只能看全局工单，新建会落在全局作用域',
      noProjectScope: '作用域锁定 global',
      problems: '个工单文件无法解析',
      dragHint: '拖卡片到别的列改阶段；Host 拒绝时显示原文并回弹',
      checkerTitle: '详情检查器',
      checkerCollapse: '收起检查器',
      checkerExpand: '展开检查器',
      archiveHint: '拖卡片到这里撤单（要写理由）',
      archiveCollapse: '收起归档',
      archiveEmpty: '没有已撤单的工单',
      needTitle: '标题不能为空',
      loadFailed: '看板读取失败，可在顶部重试',
      noRoles: '没有岗位：先建岗位再指派 DRI',
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
      selectOrder: 'Pick an order',
      selectOrderHint: 'Click a card on the left; this panel shows six items and never re-renders the file',
      emptyBoard: 'No orders yet — start one with “+ New order”',
      emptyBoardHint: 'An empty board is not an error: no readable order under .dsh/org/orders/',
      newOrder: 'New order',
      wipLabel: 'In progress',
      overdueLabel: 'Overdue',
      noAccLabel: 'No criteria',
      wipOver: 'Over the limit: new orders queue in intake',
      stageIntake: 'intake',
      stageActive: 'active',
      stageReview: 'review',
      stageBlocked: 'blocked',
      stageDone: 'done',
      stageDropped: 'dropped',
      stageIntakeSub: 'queued',
      stageActiveSub: 'in progress',
      stageReviewSub: 'awaiting sign-off',
      stageBlockedSub: 'blocked',
      stageDoneSub: 'signed off',
      stageDroppedSub: 'dropped',
      colIntakeFoot: 'downgrade lands here',
      colIntakeFootRight: 'new orders queue',
      colActiveFootRightFull: 'full',
      colActiveFootRightFree: 'a slot is free',
      colReviewFoot: 'only this column can be signed',
      colBlockedFoot: 'needs an outside condition',
      colBlockedFootRight: 'see the latest log',
      colDoneFoot: 'produced by sign',
      colDoneFootRight: 'read-only entry',
      doneOnlySign: 'sign-off only',
      signed: 'signed off',
      stage: 'Stage',
      stageDoneNote: 'done comes from sign only; dropping in is refused by the Host, dragging out uses the same update as the Agent',
      size: 'Size',
      sizeS: 'single pair of hands',
      sizeM: 'three seats',
      sizeL: 'whole chain',
      dri: 'Assignee (DRI)',
      driHint: 'role title + id; medium and large work needs one before it can move',
      unassigned: 'Unassigned',
      acceptance: 'Acceptance criteria',
      artifacts: 'Artifacts',
      log: 'Full log',
      countAcceptance: 'criteria',
      countArtifacts: 'artifacts',
      countLog: 'log',
      overdueDays: '{n}d',
      noAcceptance: 'No acceptance criteria: medium and large work cannot go active or be signed',
      noArtifacts: 'No artifacts attached',
      artifactFile: 'file',
      artifactDir: 'directory',
      artifactMissing: 'file missing',
      artifactEscape: 'path escapes',
      openInDsh: 'Open in DSH preview',
      openInDshHint: 'opens in the right sidebar; DSH renders it',
      openedInDsh: 'Opened in the right sidebar',
      noPreviewService: 'This interface has no DSH document preview service',
      noAbsolutePath: 'No absolute path for this artifact (missing / escapes)',
      previewFailed: 'Could not open the DSH preview; try again',
      logCount: '{n} entries · newest first',
      showAll: 'Show all',
      signSection: 'Sign off / send back',
      onlyReview: 'Only review orders can be signed',
      onlyReviewHint: 'move it to review, write a note, then sign',
      signAs: 'Signing as',
      cannotConfirm: 'Cannot confirm your identity: act inside the session',
      signNote: 'Why it passes, or which criterion to fix on a send-back',
      signNoteRequired: 'A note is required to sign',
      signOff: 'Sign off → done',
      sendBack: 'Send back → active',
      sendBackConfirm: 'Send back?',
      signedOff: 'Signed off',
      sentBack: 'Sent back',
      editSection: 'Stage and details',
      stageChangeHint: 'A stage change and a drop are the same request: PATCH /hyper-org/api/order/:id',
      doneLocked: 'produced by sign only',
      doneFrozen: 'done is entered by sign only; moving it elsewhere is allowed (the Agent does the same)',
      acceptanceHint: 'one per line; commas do not split',
      artifactsHint: 'comma or newline separated; append only',
      noteField: 'Note (goes into the log)',
      noteRequiredDrop: 'Dropping needs a reason',
      dropTitle: 'Drop reason',
      dropHint: 'Dropping is an update, and an update needs a note; the reason goes into the log and no file is deleted',
      dropConfirm: 'Drop this order',
      createTitleLabel: 'Title',
      createTitle: 'One sentence on what to deliver',
      createSize: 'Size',
      createDri: 'Assignee',
      createAcceptance: 'Acceptance criteria (one per line; commas do not split)',
      createNote: 'Note (optional)',
      createHint: 'Same path as org_order create; being pushed back to intake by a full board or missing criteria is a normal result',
      createTitleRequired: 'A title is required',
      scope: 'Scope',
      scopeProject: 'Project',
      scopeGlobal: 'Global',
      globalBadge: 'global',
      noProject: 'This session has no project root: global orders only; new orders land in the global scope',
      noProjectScope: 'scope locked to global',
      problems: 'order files cannot be parsed',
      dragHint: 'Drag a card to another column; when the Host refuses, its sentence shows and the card stays',
      checkerTitle: 'Inspector',
      checkerCollapse: 'Collapse inspector',
      checkerExpand: 'Expand inspector',
      archiveHint: 'drop a card here to cancel it (a reason is required)',
      archiveCollapse: 'Collapse archive',
      archiveEmpty: 'No dropped orders',
      needTitle: 'A title is required',
      loadFailed: 'The board could not be loaded; retry from the banner above',
      noRoles: 'No roles yet: create one before assigning a DRI',
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

    /** One address segment: encode, but leave `:` readable (DSH's own rule). */
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':')
    }

    /** One address path: every `/`-separated segment encoded, `/` kept. */
    function encodePath(path) {
      return path.split('/').map(encodeSegment).join('/')
    }

    /**
     * Build the address DSH's sidebar previews read.
     *
     * Same shape as `@deepseek-ai/dsh-util-workspace-path`'s `sessionFileAddress`:
     * `dsh-resource://file/session/<sessionId>/<path>`, every segment encoded,
     * `%3A` restored to `:`, backslashes normalized, a leading `./` dropped. An
     * absolute path keeps its absolute spelling, which is why the result has a
     * double slash right after the session id.
     * @param {string} sessionId - durable Session id.
     * @param {string} path - absolute (or workspace-relative) path.
     * @returns {string} the resource address.
     */
    function sessionFileAddress(sessionId, path) {
      const normalized = String(path === undefined || path === null ? '' : path)
        .replace(/\\/g, '/')
        .replace(/^(?:\.\/)+/, '')
      return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(String(sessionId === undefined || sessionId === null ? '' : sessionId))}/${encodePath(normalized)}`
    }

    /**
     * Ask DSH's own right sidebar to show one file.
     *
     * The service is resolved lazily by the caller, so a GUI without it (or a
     * path with no absolute location) reports a reason instead of failing
     * silently. Returns a boolean rather than throwing, because the caller owns
     * the visible error line.
     * @param {object} sidebar - `ctx.get('sidebarRight')`, when available.
     * @param {string} sessionId - durable Session id.
     * @param {string} absolutePath - the file's absolute path.
     * @returns {boolean} whether `openResource` was called.
     */
    function openInDsh(sidebar, sessionId, absolutePath) {
      if (sidebar === undefined || sidebar === null || typeof sidebar.openResource !== 'function') return false
      if (typeof sessionId !== 'string' || sessionId === '') return false
      if (typeof absolutePath !== 'string' || absolutePath === '') return false
      try {
        sidebar.openResource(sessionFileAddress(sessionId, absolutePath))
      } catch {
        // The service throws when no Session surface is mounted; the caller owns
        // the visible error line, so the helper keeps its boolean contract.
        return false
      }
      return true
    }

    /**
     * The one request shape for a stage move.
     *
     * Drag-and-drop, the stage menu and the drop dialog all build their request
     * here, so there is exactly one way a stage changes from this panel — the
     * same `PATCH /hyper-org/api/order/:id` an Agent's `org_order update` takes.
     * @param {string} id - order id.
     * @param {string} stage - target stage.
     * @param {string} [note] - drop reason; `dropped` needs one.
     * @returns {{path: string, method: string, body: object}}
     */
    function stageRequest(id, stage, note) {
      const reason = typeof note === 'string' ? note.trim() : ''
      return {
        path: `${API}/order/${encodeURIComponent(String(id))}`,
        method: 'PATCH',
        body: { stage: String(stage), ...(reason === '' ? {} : { note }) },
      }
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
      const text = String(stage || '')
      return `stage${text.charAt(0).toUpperCase()}${text.slice(1)}`
    }

    /** @param {string} stage - stage id. @returns its one-line meaning key. */
    function stageSubKey(stage) {
      return `${stageKey(stage)}Sub`
    }

    /**
     * Hours between an ISO timestamp and the board's `now`.
     * @param {string} iso - updatedAt.
     * @param {string} now - board timestamp.
     * @returns {number} hours, 0 when either value is unusable.
     */
    function hoursSince(iso, now) {
      const from = Date.parse(String(iso || ''))
      const to = Date.parse(String(now || ''))
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0
      return (to - from) / 3_600_000
    }

    /** @param {object[]} rows - board rows, oldest first. */
    function sortOldestFirst(rows) {
      return rows.slice().sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)))
    }

    /**
     * The five columns, in the Host's stage order.
     * @param {object[]} orders - board rows.
     * @returns {{stage: string, rows: object[]}[]}
     */
    function columnsOf(orders) {
      const list = Array.isArray(orders) ? orders : []
      return BOARD_STAGES.map((stage) => ({
        stage,
        rows: sortOldestFirst(list.filter((row) => row.stage === stage)),
      }))
    }

    /**
     * The folded bottom strip: cancelled orders stay visible, never deleted.
     * @param {object[]} orders - board rows.
     * @returns {object[]} dropped rows, oldest first.
     */
    function archiveOf(orders) {
      return sortOldestFirst((Array.isArray(orders) ? orders : []).filter((row) => row.stage === 'dropped'))
    }

    /**
     * Review cards aging past the threshold. A display marker, not a gate: the
     * Host has no "overdue" rule and nothing here refuses anything.
     * @param {object[]} orders - board rows.
     * @param {string} now - board timestamp.
     * @returns {object[]}
     */
    function overdueOf(orders, now) {
      return (Array.isArray(orders) ? orders : [])
        .filter((row) => row.stage === 'review' && hoursSince(row.updatedAt, now) >= OVERDUE_HOURS)
    }

    /**
     * Medium and large orders with no acceptance criteria — the ones a board
     * reader should fix before trying to promote them.
     * @param {object[]} orders - board rows.
     * @returns {object[]}
     */
    function noAcceptanceOf(orders) {
      return (Array.isArray(orders) ? orders : []).filter((row) => (row.size === 'M' || row.size === 'L')
        && row.stage !== 'done'
        && row.stage !== 'dropped'
        && Number(row.acceptanceCount) === 0)
    }

    /**
     * The row an operator should look at first: work waiting on a decision, then
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

    /** @returns the create form's initial values. */
    function emptyCreate() {
      return { title: '', size: 'M', dri: '', acceptance: '', note: '', scope: 'project' }
    }

    /** @param {object} order - normalized order. @returns edit-form values. */
    function editFrom(order) {
      return {
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
        title: options.title,
      }, label)
    }

    /** The tab component. */
    function OrdersTab({ sessionId }) {
      const session = sessionId === undefined || sessionId === null ? '' : String(sessionId)

      const [state, setState] = useState(null)
      const [selected, setSelected] = useState(null)
      const [doc, setDoc] = useState(null)
      const [loading, setLoading] = useState(false)
      const [writing, setWriting] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [showProblems, setShowProblems] = useState(false)
      const [showAllLog, setShowAllLog] = useState(false)
      const [creating, setCreating] = useState(false)
      const [form, setForm] = useState(emptyCreate())
      const [edit, setEdit] = useState(null)
      const [signNote, setSignNote] = useState('')
      const [sendBackArmed, setSendBackArmed] = useState(false)
      const [drop, setDrop] = useState(null)
      const [archiveOpen, setArchiveOpen] = useState(false)
      const [checkerOpen, setCheckerOpen] = useState(true)
      const [dragId, setDragId] = useState(null)
      const [dragOver, setDragOver] = useState(null)
      const [bounce, setBounce] = useState(null)

      const busy = loading || writing

      const orders = state !== null && Array.isArray(state.orders) ? state.orders : []
      const roles = state !== null && Array.isArray(state.roles) ? state.roles : []
      const now = state === null ? '' : state.now
      const occupied = state === null ? 0 : Number(state.occupied) || 0
      const wipLimit = state === null ? 0 : Number(state.wipLimit) || 0
      const noProject = state !== null && state.projectRoot === null
      const columns = columnsOf(orders)
      const archive = archiveOf(orders)
      const overdue = overdueOf(orders, now)
      const noAcceptance = noAcceptanceOf(orders)
      const overWip = state !== null && occupied > wipLimit
      const atWip = state !== null && wipLimit > 0 && occupied >= wipLimit

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

      /** Resolve DSH's sidebar service lazily: the GUI may not have it composed. */
      const sidebarRight = () => {
        try {
          return typeof services?.get === 'function' ? services.get('sidebarRight') : undefined
        } catch {
          return undefined
        }
      }

      const loadState = useCallback(async () => {
        if (session === '') {
          setState(null)
          return
        }
        setLoading(true)
        try {
          const body = await call(`${API}/state${queryString({ session })}`)
          setState(body)
        } catch (failure) {
          fail(failure)
        } finally {
          setLoading(false)
        }
      }, [session, fail])

      const loadOrder = useCallback(async (id) => {
        if (id === null || id === undefined || id === '') return undefined
        setLoading(true)
        try {
          const body = await call(`${API}/order${queryString({ session, id })}`)
          setDoc(body)
          setEdit(editFrom(body.order))
          return body
        } catch (failure) {
          setDoc(null)
          setEdit(null)
          if (failure.code === 'order_not_found') setSelected(null)
          fail(failure)
          return undefined
        } finally {
          setLoading(false)
        }
      }, [session, fail])

      /** Write, then re-read the board and the order from disk (no local stage edits). */
      const afterWrite = useCallback(async (id) => {
        await loadState()
        if (id !== null && id !== undefined && id !== '') await loadOrder(String(id))
      }, [loadState, loadOrder])

      const openOrder = useCallback(async (id) => {
        if (id === null || id === undefined || id === '') return
        setSelected(String(id))
        setShowAllLog(false)
        setSendBackArmed(false)
        setDrop(null)
        setSignNote('')
        await loadOrder(String(id))
      }, [loadOrder])

      const requestStage = useCallback(async (id, target, note) => {
        const orderId = String(id)
        const row = orders.find((entry) => entry.id === orderId)
        // Dropping a card on its own column is a no-op, not a gate.
        if (row !== undefined && row.stage === target) return
        // A drop needs the note `update` already requires; ask for it first and
        // send nothing until the reason is written.
        if (target === 'dropped' && (typeof note !== 'string' || note.trim() === '')) {
          setDrop({ id: orderId, reason: '', error: '' })
          return
        }
        const request = stageRequest(orderId, target, note)
        setSelected(orderId)
        setError('')
        setNotice('')
        setWriting(true)
        try {
          await call(`${request.path}${queryString({ session })}`, {
            method: request.method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request.body),
          })
          setDrop(null)
          setBounce(null)
          if (target === 'dropped') setArchiveOpen(true)
          flash(`${orderId}：${row === undefined ? '' : row.stage} → ${target}`)
        } catch (failure) {
          // The Host's sentence is the explanation; never reword it.
          if (failure.code === 'order_not_found') {
            setSelected(null)
            setDoc(null)
            setEdit(null)
          }
          fail(failure)
          setBounce(orderId)
          // Clear it once the shake has played, so the same card can shake again.
          setTimeout(() => setBounce(null), 420)
        } finally {
          setWriting(false)
          // Success or refusal, the panel re-reads both: the file is the truth.
          await afterWrite(orderId)
        }
      }, [orders, session, afterWrite, flash, fail])

      const saveDetails = useCallback(async () => {
        if (edit === null || selected === null) return
        setError('')
        setNotice('')
        setWriting(true)
        let saved = false
        try {
          const request = {
            dri: edit.dri,
            acceptance: edit.acceptance,
            artifacts: edit.artifacts,
            note: edit.note,
          }
          await call(`${API}/order/${encodeURIComponent(selected)}${queryString({ session })}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request),
          })
          saved = true
          flash(t('saved'))
        } catch (failure) {
          // A refusal keeps the form as typed, so nothing has to be retyped.
          if (failure.code === 'order_not_found') {
            setSelected(null)
            setDoc(null)
            setEdit(null)
          }
          fail(failure)
        } finally {
          setWriting(false)
          await loadState()
          if (saved) await loadOrder(selected)
        }
      }, [edit, selected, session, loadState, loadOrder, flash, fail])

      const sign = useCallback(async (approve) => {
        if (selected === null) return
        const note = signNote.trim()
        if (note === '') {
          fail(new Error(t('signNoteRequired')))
          return
        }
        setError('')
        setNotice('')
        setWriting(true)
        try {
          await call(`${API}/order/${encodeURIComponent(selected)}/sign${queryString({ session })}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ approve, note }),
          })
          setSignNote('')
          setSendBackArmed(false)
          flash(approve ? t('signedOff') : t('sentBack'))
        } catch (failure) {
          if (failure.code === 'order_not_found') {
            setSelected(null)
            setDoc(null)
            setEdit(null)
          }
          fail(failure)
        } finally {
          setWriting(false)
          await afterWrite(selected)
        }
      }, [selected, signNote, session, afterWrite, flash, fail])

      const create = useCallback(async () => {
        const title = form.title.trim()
        if (title === '') {
          fail(new Error(t('needTitle')))
          return
        }
        setError('')
        setNotice('')
        setWriting(true)
        try {
          const body = await call(`${API}/order${queryString({ session })}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              scope: noProject ? 'global' : form.scope,
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
          // A downgrade is a normal result (200), never an error.
          flash(notes.length === 0 ? `${t('created')} ${body.order.id}` : `${t('created')} ${body.order.id} · ${notes.join(' ')}`)
          await loadState()
          await openOrder(body.order.id)
        } catch (failure) {
          fail(failure)
        } finally {
          setWriting(false)
        }
      }, [form, noProject, session, loadState, openOrder, flash, fail])

      const confirmDrop = useCallback(async () => {
        if (drop === null) return
        const reason = drop.reason.trim()
        if (reason === '') {
          setDrop({ ...drop, error: t('noteRequiredDrop') })
          return
        }
        await requestStage(drop.id, 'dropped', reason)
      }, [drop, requestStage])

      const openArtifact = useCallback((entry) => {
        const sidebar = sidebarRight()
        const hasPath = typeof entry.absolutePath === 'string' && entry.absolutePath !== ''
        if (!openInDsh(sidebar, session, entry.absolutePath)) {
          fail(new Error(sidebar === undefined || sidebar === null
            ? t('noPreviewService')
            : hasPath ? t('previewFailed') : t('noAbsolutePath')))
          return
        }
        flash(t('openedInDsh'))
      }, [session, flash, fail])

      useEffect(() => {
        loadState()
      }, [loadState])

      // Open something as soon as the board arrives: an empty inspector on a
      // board with orders reads as a missing feature.
      useEffect(() => {
        if (state === null || selected !== null) return
        const first = pickFirst(state.orders)
        if (first !== null) openOrder(first)
      }, [state, selected, openOrder])

      // ------------------------------------------------------------- drag/drop
      const dragStart = (id) => (event) => {
        setDragId(String(id))
        setBounce(null)
        try {
          event.dataTransfer.setData('text/plain', String(id))
          event.dataTransfer.effectAllowed = 'move'
        } catch {
          // A synthetic event may carry no dataTransfer; the id state covers it.
        }
      }

      const dragEnd = () => {
        setDragId(null)
        setDragOver(null)
      }

      const dragOverZone = (zone) => (event) => {
        event.preventDefault()
        setDragOver(zone)
        try {
          event.dataTransfer.dropEffect = 'move'
        } catch {
          // Same as above: nothing to do without a dataTransfer.
        }
      }

      const dragLeaveZone = (zone) => () => {
        setDragOver((current) => (current === zone ? null : current))
      }

      const dropZone = (zone) => (event) => {
        event.preventDefault()
        const id = dragId !== null
          ? dragId
          : (() => {
              try {
                return event.dataTransfer.getData('text/plain')
              } catch {
                return ''
              }
            })()
        setDragId(null)
        setDragOver(null)
        if (id === null || id === undefined || id === '') return
        requestStage(id, zone)
      }

      // ---------------------------------------------------------------- render
      const banner = (kind, text, onRetry) => h('div', { className: `ho-banner ho-banner-${kind}` },
        h('span', { className: 'ho-banner-text' }, text),
        onRetry === undefined ? null : button(t('retry'), onRetry, { ghost: true, disabled: busy }),
        button(t('close'), () => (kind === 'error' ? setError('') : setNotice('')), { ghost: true }),
      )

      const banners = []
      if (error !== '') {
        banners.push(banner('error', error, async () => {
          setError('')
          setNotice('')
          await loadState()
          if (selected !== null) await loadOrder(selected)
        }))
      }
      if (notice !== '') banners.push(banner('ok', notice))
      if (noProject) {
        banners.push(h('div', { className: 'ho-banner ho-banner-warn' },
          h('span', { className: 'ho-banner-text' }, `${t('noProject')} · ${t('noProjectScope')}`),
        ))
      }

      const problemsBar = state !== null && Array.isArray(state.problems) && state.problems.length > 0
        ? h('div', { className: 'ho-problems' },
            h('button', {
              type: 'button',
              className: 'ho-problems-head',
              onClick: () => setShowProblems(!showProblems),
            }, `${showProblems ? '▾' : '▸'} ${state.problems.length} ${t('problems')}`),
            showProblems
              ? h('ul', { className: 'ho-problem-list' }, state.problems.map((problem, index) => h('li',
                  { key: `${problem.path}-${index}`, className: 'ho-problem-item' },
                  `${problem.path} — ${problem.message}`,
                )))
              : null,
          )
        : null

      const stat = (label, value, tone) => h('span', { className: `ho-stat${tone === undefined ? '' : ` ho-stat-${tone}`}` },
        h('span', { className: 'ho-stat-label' }, label),
        h('b', null, value),
      )

      const topBar = h('header', { className: 'ho-top' },
        h('div', { className: 'ho-top-title', title: state === null ? undefined : state.projectRoot || state.globalDir },
          h('span', null, t('boardTitle')),
          h('span', { className: 'ho-top-count' }, ` (${orders.length})`),
        ),
        h('div', { className: 'ho-stats' },
          stat(t('wipLabel'), `${occupied}/${wipLimit}`, atWip ? 'warn' : (occupied === 0 ? 'ok' : undefined)),
          stat(t('overdueLabel'), overdue.length, overdue.length === 0 ? undefined : 'danger'),
          stat(t('noAccLabel'), noAcceptance.length, noAcceptance.length === 0 ? undefined : 'warn'),
          overWip ? h('span', { className: 'ho-stat ho-stat-warn', title: t('wipOver') }, t('wipOver')) : null,
        ),
        h('div', { className: 'ho-top-actions' },
          h('span', { className: 'ho-faint ho-drag-hint' }, t('dragHint')),
          button(t('refresh'), async () => {
            setError('')
            setNotice('')
            await loadState()
            if (selected !== null) await loadOrder(selected)
          }, { ghost: true, disabled: busy || session === '' }),
          button(`＋ ${t('newOrder')}`, () => setCreating(true), { primary: true, disabled: busy || state === null || session === '' }),
        ),
      )

      const cardWarnings = (row) => {
        const chips = []
        if ((row.size === 'M' || row.size === 'L') && Number(row.acceptanceCount) === 0
          && row.stage !== 'done' && row.stage !== 'dropped') {
          chips.push(h('span', { key: 'noacc', className: 'ho-chip ho-chip-warn', title: t('noAcceptance') }, t('noAccLabel')))
        }
        if (row.stage === 'blocked') {
          chips.push(h('span', { key: 'blocked', className: 'ho-chip ho-chip-danger' }, t('stageBlockedSub')))
        }
        if (row.stage === 'review' && hoursSince(row.updatedAt, now) >= OVERDUE_HOURS) {
          const days = Math.max(1, Math.floor(hoursSince(row.updatedAt, now) / 24))
          chips.push(h('span', { key: 'overdue', className: 'ho-chip ho-chip-danger' }, `${t('overdueLabel')} ${t('overdueDays').replace('{n}', String(days))}`))
        }
        return chips.length === 0 ? null : h('div', { className: 'ho-card-warns' }, chips)
      }

      const renderCard = (row, options = {}) => {
        const on = selected === row.id
        const className = [
          'ho-card',
          options.compact === true ? 'ho-card-compact' : '',
          on ? 'ho-card-on' : '',
          bounce === row.id ? 'ho-card-bounce' : '',
          dragId === row.id ? 'ho-card-dragging' : '',
        ].filter((entry) => entry !== '').join(' ')
        return h('div', {
          key: row.id,
          className,
          role: 'button',
          tabIndex: 0,
          title: `${row.title} · ${row.id}`,
          'data-order-id': row.id,
          draggable: options.draggable === false ? undefined : 'true',
          onClick: () => openOrder(row.id),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openOrder(row.id)
            }
          },
          onDragStart: options.draggable === false ? undefined : dragStart(row.id),
          onDragEnd: options.draggable === false ? undefined : dragEnd,
        },
          h('div', { className: 'ho-card-title' }, row.title),
          h('div', { className: 'ho-card-meta' },
            h('span', { className: 'ho-chip ho-chip-size' }, row.size),
            h('span', { className: 'ho-card-dri' }, row.driTitle || row.dri || t('unassigned')),
            h('span', { className: 'ho-faint' }, '·'),
            h('span', { className: 'ho-faint' }, row.age),
            row.scope === 'global' ? h('span', { className: 'ho-chip ho-chip-global' }, t('globalBadge')) : null,
          ),
          cardWarnings(row),
          options.compact === true
            ? null
            : h('div', { className: 'ho-card-foot' },
                h('span', { className: 'ho-card-foot-main' },
                  `${t('countAcceptance')} ${Number(row.acceptanceCount) || 0} · ${t('countArtifacts')} ${Number(row.artifactCount) || 0}`),
                h('span', { className: 'ho-card-foot-side' }, `${t('countLog')} ${Number(row.logCount) || 0}`),
              ),
          row.stage === 'done' ? h('div', { className: 'ho-card-signed' }, `✓ ${t('signed')}`) : null,
        )
      }

      const columnFoot = (stage) => {
        if (stage === 'intake') {
          return h('div', { className: 'ho-col-foot' }, h('span', null, t('colIntakeFoot')), h('span', null, t('colIntakeFootRight')))
        }
        if (stage === 'active') {
          return h('div', { className: 'ho-col-foot' },
            h('span', null, `${t('wipLabel')} ${occupied}/${wipLimit}`),
            h('span', null, atWip ? t('colActiveFootRightFull') : t('colActiveFootRightFree')),
          )
        }
        if (stage === 'review') {
          return h('div', { className: 'ho-col-foot' },
            h('span', null, `${t('overdueLabel')} ${overdue.length}`),
            h('span', null, t('colReviewFoot')),
          )
        }
        if (stage === 'blocked') {
          return h('div', { className: 'ho-col-foot' }, h('span', null, t('colBlockedFoot')), h('span', null, t('colBlockedFootRight')))
        }
        return h('div', { className: 'ho-col-foot' }, h('span', null, t('colDoneFoot')), h('span', null, t('colDoneFootRight')))
      }

      const renderColumn = (column) => {
        const isOver = dragOver === column.stage
        const body = column.rows.length === 0
          ? h('p', { className: 'ho-col-empty' }, state === null ? (loading ? t('loading') : t('loadFailed')) : '—')
          : column.rows.map((row) => renderCard(row))
        return h('section', {
          key: column.stage,
          className: `ho-col ho-col-${column.stage}${isOver ? ' ho-col-over' : ''}`,
          'data-stage': column.stage,
          'data-drop': column.stage,
          onDragOver: dragOverZone(column.stage),
          onDragLeave: dragLeaveZone(column.stage),
          onDrop: dropZone(column.stage),
        },
          h('header', { className: 'ho-col-head' },
            h('span', { className: `ho-dot ho-dot-${column.stage}` }),
            h('span', { className: 'ho-col-name' }, t(stageKey(column.stage))),
            h('span', { className: 'ho-col-sub' }, t(stageSubKey(column.stage))),
            h('span', { className: 'ho-col-count' }, column.rows.length),
          ),
          column.stage === 'done'
            ? h('p', { className: 'ho-col-note' }, t('doneOnlySign'))
            : null,
          h('div', { className: 'ho-col-body' }, body),
          columnFoot(column.stage),
        )
      }

      const archiveStrip = h('section', {
        className: `ho-archive${dragOver === 'dropped' ? ' ho-archive-over' : ''}`,
        'data-drop': 'dropped',
        onDragOver: dragOverZone('dropped'),
        onDragLeave: dragLeaveZone('dropped'),
        onDrop: dropZone('dropped'),
      },
        h('button', {
          type: 'button',
          className: 'ho-archive-btn',
          onClick: () => setArchiveOpen(!archiveOpen),
        },
          h('span', null, archiveOpen ? '▾' : '▸'),
          h('span', null, `${t(stageKey('dropped'))} · ${archive.length}`),
          h('span', { className: 'ho-faint' },
            archiveOpen ? t('archiveCollapse') : t('archiveHint')),
        ),
        archiveOpen
          ? (archive.length === 0
              ? h('p', { className: 'ho-archive-empty' }, t('archiveEmpty'))
              : h('div', { className: 'ho-archive-list' },
                  archive.map((row) => renderCard(row, { compact: true, draggable: false }))))
          : null,
      )

      const board = h('div', { className: 'ho-board-wrap' },
        h('div', { className: 'ho-board' }, columns.map(renderColumn)),
        archiveStrip,
      )

      // -------------------------------------------------------------- inspector
      const item = (label, body) => h('section', { className: 'ho-sec' },
        h('div', { className: 'ho-sec-label' }, label),
        h('div', { className: 'ho-sec-body' }, body),
      )

      const artifactBlock = (rows) => {
        if (rows.length === 0) return h('p', { className: 'ho-muted' }, t('noArtifacts'))
        const sidebar = sidebarRight()
        const usable = (entry) => entry.kind === 'file' && typeof entry.absolutePath === 'string' && entry.absolutePath !== ''
        return h('ul', { className: 'ho-arts' }, rows.map((entry) => {
          const address = usable(entry) ? sessionFileAddress(session, entry.absolutePath) : undefined
          const disabledReason = usable(entry) ? undefined : t('noAbsolutePath')
          const serviceMissing = sidebar === undefined || typeof sidebar.openResource !== 'function'
          return h('li', { key: entry.path, className: `ho-art ho-art-${entry.kind}` },
            h('div', { className: 'ho-art-top' },
              h('span', { className: 'ho-art-path', title: entry.path }, entry.path),
              h('span', { className: 'ho-art-kind' }, t(kindKey(entry.kind))),
            ),
            h('button', {
              type: 'button',
              className: 'ho-art-open',
              'data-address': address,
              title: address === undefined ? disabledReason : address,
              disabled: address === undefined || serviceMissing || busy,
              onClick: () => openArtifact(entry),
            }, `${t('openInDsh')} ↗`),
            address === undefined || serviceMissing
              ? h('span', { className: 'ho-art-hint' }, serviceMissing ? t('noPreviewService') : disabledReason)
              : null,
          )
        }))
      }

      const logBlock = (order) => {
        const entries = (Array.isArray(order.log) ? order.log : []).slice().reverse()
        const shown = showAllLog ? entries : entries.slice(0, LOG_SHOWN)
        return h('div', { className: 'ho-log' },
          entries.length === 0
            ? h('p', { className: 'ho-muted' }, '—')
            : h('div', { className: 'ho-log-list' }, shown.map((entry, index) => h('div', {
                key: `${entry.at}-${index}`,
                className: 'ho-log-row',
              },
                h('div', { className: 'ho-log-meta' }, `${formatLogTime(entry.at)} · ${entry.by}`),
                h('p', { className: 'ho-log-note' }, entry.note),
              ))),
          entries.length > LOG_SHOWN && !showAllLog
            ? h('button', { type: 'button', className: 'ho-link', onClick: () => setShowAllLog(true) },
                `${t('showAll')}（${entries.length}）`)
            : null,
          h('div', { className: 'ho-log-count' }, t('logCount').replace('{n}', String(entries.length))),
        )
      }

      const signSection = () => {
        const order = doc.order
        if (order.stage !== 'review') {
          return h('section', { className: 'ho-cardpanel' },
            h('h3', { className: 'ho-panel-title' }, t('signSection')),
            h('p', { className: 'ho-muted' }, `${t('onlyReview')} · ${t('onlyReviewHint')}`),
          )
        }
        const blockers = doc.sign !== undefined && Array.isArray(doc.sign.blockers) ? doc.sign.blockers : []
        const confirmed = state === null || state.actor === undefined || state.actor.confirmed !== false
        const label = state !== null && state.actor !== undefined ? state.actor.label : 'lead'
        const noteMissing = signNote.trim() === ''
        const approveBlocked = blockers.length > 0 || noteMissing || !confirmed
        // A send-back only needs a note and a signer who is not the DRI; the
        // other blockers describe signing off.
        const sendBackBlocked = noteMissing || !confirmed || blockers.some((entry) => entry.code === 'self_sign')
        return h('section', { className: 'ho-cardpanel' },
          h('h3', { className: 'ho-panel-title' }, t('signSection')),
          h('p', { className: 'ho-muted' }, `${t('signAs')}：${label}`),
          confirmed ? null : h('p', { className: 'ho-warnbox' }, t('cannotConfirm')),
          blockers.length === 0
            ? null
            : h('ul', { className: 'ho-blockers' }, blockers.map((entry) => h('li', { key: entry.code, className: 'ho-blocker' }, entry.message))),
          h('textarea', {
            className: 'ho-textarea ho-sign-note',
            placeholder: t('signNote'),
            value: signNote,
            onChange: (event) => setSignNote(event.target.value),
          }),
          noteMissing ? h('p', { className: 'ho-hint' }, t('signNoteRequired')) : null,
          h('div', { className: 'ho-actions' },
            button(busy ? t('saving') : t('signOff'), () => sign(true), { primary: true, disabled: busy || approveBlocked }),
            sendBackArmed
              ? button(t('sendBackConfirm'), () => sign(false), { danger: true, disabled: busy || sendBackBlocked })
              : button(t('sendBack'), () => setSendBackArmed(true), { danger: true, disabled: busy || sendBackBlocked }),
            sendBackArmed ? button(t('cancel'), () => setSendBackArmed(false), { ghost: true }) : null,
          ),
        )
      }

      const editSection = () => {
        if (edit === null) return null
        const order = doc.order
        const stageOptions = [
          ...WRITABLE_STAGES.map((stage) => h('option', { key: stage, value: stage },
            stage === 'dropped' ? `${t(stageKey(stage))}（${t('noteRequiredDrop')}）` : t(stageKey(stage)))),
          h('option', { key: 'done', value: 'done' }, `${t(stageKey('done'))}（${t('doneLocked')}）`),
        ]
        return h('section', { className: 'ho-cardpanel' },
          h('h3', { className: 'ho-panel-title' }, t('editSection')),
          h('p', { className: 'ho-hint' }, t('stageChangeHint')),
          order.stage === 'done' ? h('p', { className: 'ho-hint' }, t('doneFrozen')) : null,
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, t('stage')),
            h('select', {
              className: 'ho-input',
              'data-stage-select': 'true',
              value: order.stage,
              disabled: busy,
              onChange: (event) => requestStage(selected, event.target.value),
            }, stageOptions),
          ),
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, t('dri')),
            h('select', {
              className: 'ho-input',
              value: edit.dri,
              disabled: busy,
              onChange: (event) => setEdit({ ...edit, dri: event.target.value }),
            }, [
              h('option', { key: '', value: '' }, t('unassigned')),
              ...roles.map((role) => h('option', { key: `${role.scope}:${role.id}`, value: role.id }, `${role.title}（${role.id}）`)),
            ]),
            roles.length === 0 ? h('span', { className: 'ho-hint' }, t('noRoles')) : null,
          ),
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, `${t('acceptance')} · ${t('acceptanceHint')}`),
            h('textarea', {
              className: 'ho-textarea',
              value: edit.acceptance,
              disabled: busy,
              onChange: (event) => setEdit({ ...edit, acceptance: event.target.value }),
            }),
          ),
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, `${t('artifacts')} · ${t('artifactsHint')}`),
            h('textarea', {
              className: 'ho-textarea ho-artifacts-input',
              value: edit.artifacts,
              placeholder: t('artifactsHint'),
              disabled: busy,
              onChange: (event) => setEdit({ ...edit, artifacts: event.target.value }),
            }),
          ),
          h('label', { className: 'ho-field' },
            h('span', { className: 'ho-label' }, t('noteField')),
            h('input', {
              className: 'ho-input',
              value: edit.note,
              disabled: busy,
              onChange: (event) => setEdit({ ...edit, note: event.target.value }),
            }),
          ),
          h('div', { className: 'ho-actions' },
            button(busy ? t('saving') : t('save'), saveDetails, { primary: true, disabled: busy }),
          ),
        )
      }

      const inspectorBody = () => {
        if (doc === null) {
          return h('div', { className: 'ho-placeholder' },
            h('span', { className: 'ho-placeholder-mark' }, '◇'),
            h('b', null, state === null && loading ? t('loading') : t('selectOrder')),
            h('span', { className: 'ho-placeholder-sub' }, t('selectOrderHint')),
          )
        }
        const order = doc.order
        const sizeText = `${order.size} · ${t(`size${order.size}`)}`
        const driText = order.dri === undefined || order.dri === ''
          ? t('unassigned')
          : `${doc.driTitle || order.dri}（${order.dri}）`
        return h('div', { className: 'ho-checker-body' },
          h('div', { className: 'ho-ins-head' },
            h('h2', { className: 'ho-ins-title', title: order.title }, order.title),
            h('div', { className: 'ho-ins-meta' },
              h('span', { className: 'ho-mono' }, order.id),
              h('span', null, '·'),
              h('span', null, doc.scope === 'project' ? t('scopeProject') : t('scopeGlobal')),
              h('span', null, '·'),
              h('span', null, doc.age),
            ),
          ),
          item(t('stage'),
            h('div', { className: 'ho-stage-row' },
              h('span', { className: `ho-stage ho-stage-${order.stage}` }, order.stage),
              h('span', { className: 'ho-muted' }, ` · ${t(stageSubKey(order.stage))}`),
            ),
            order.stage === 'done' ? h('p', { className: 'ho-hint' }, t('stageDoneNote')) : null,
          ),
          item(t('size'), h('span', { className: 'ho-muted' }, sizeText)),
          item(t('dri'), h('span', null, driText)),
          item(t('acceptance'),
            (order.acceptance || []).length === 0
              ? h('p', { className: 'ho-warnbox' }, t('noAcceptance'))
              : h('ol', { className: 'ho-acceptance' }, (order.acceptance || []).map((entry, index) => h('li', { key: index }, entry))),
          ),
          item(t('artifacts'), artifactBlock(Array.isArray(doc.artifacts) ? doc.artifacts : [])),
          item(t('log'), logBlock(order)),
          signSection(),
          editSection(),
        )
      }

      const checker = checkerOpen
        ? h('aside', { className: 'ho-checker', 'data-checker': 'open' },
            h('div', { className: 'ho-checker-head' },
              h('span', { className: 'ho-checker-title' }, t('checkerTitle')),
              button('⟩', () => setCheckerOpen(false), { ghost: true, title: t('checkerCollapse') }),
            ),
            inspectorBody(),
          )
        : h('aside', { className: 'ho-checker ho-checker-closed', 'data-checker': 'closed' },
            button('⟨', () => setCheckerOpen(true), { ghost: true, title: t('checkerExpand') }),
            h('span', { className: 'ho-checker-closed-label' }, t('checkerTitle')),
          )

      const body = session === ''
        ? h('div', { className: 'ho-empty-session' }, h('p', { className: 'ho-muted' }, t('noSession')))
        : h('div', { className: 'ho-main' }, board, checker)

      const emptyBanner = state !== null && orders.length === 0 && session !== ''
        ? h('div', { className: 'ho-banner ho-banner-info' },
            h('span', { className: 'ho-banner-text' }, `${t('emptyBoard')} · ${t('emptyBoardHint')}`),
            button(`＋ ${t('newOrder')}`, () => setCreating(true), { primary: true, disabled: busy }),
          )
        : null

      // ----------------------------------------------------------------- modals
      const scopeButton = (value, label, disabled) => h('button', {
        type: 'button',
        className: `ho-seg-btn${form.scope === value ? ' ho-seg-on' : ''}`,
        onClick: () => setForm({ ...form, scope: value }),
        disabled,
      }, label)

      const createModal = creating
        ? h('div', { className: 'ho-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('newOrder') },
            h('div', { className: 'ho-modal-card' },
              h('h2', { className: 'ho-modal-title' }, `＋ ${t('newOrder')}`),
              h('p', { className: 'ho-hint' }, t('createHint')),
              h('label', { className: 'ho-field' },
                h('span', { className: 'ho-label' }, `${t('createTitleLabel')} · ${t('createTitle')}`),
                h('input', {
                  className: 'ho-input',
                  placeholder: t('createTitle'),
                  value: form.title,
                  onChange: (event) => setForm({ ...form, title: event.target.value }),
                }),
              ),
              h('label', { className: 'ho-field' },
                h('span', { className: 'ho-label' }, t('createSize')),
                h('select', {
                  className: 'ho-input',
                  value: form.size,
                  onChange: (event) => setForm({ ...form, size: event.target.value }),
                }, ['S', 'M', 'L'].map((size) => h('option', { key: size, value: size }, `${size} · ${t(`size${size}`)}`))),
              ),
              h('label', { className: 'ho-field' },
                h('span', { className: 'ho-label' }, t('createDri')),
                h('select', {
                  className: 'ho-input',
                  value: form.dri,
                  onChange: (event) => setForm({ ...form, dri: event.target.value }),
                }, [
                  h('option', { key: '', value: '' }, t('unassigned')),
                  ...roles.map((role) => h('option', { key: `${role.scope}:${role.id}`, value: role.id }, `${role.title}（${role.id}）`)),
                ]),
              ),
              h('label', { className: 'ho-field' },
                h('span', { className: 'ho-label' }, t('createAcceptance')),
                h('textarea', {
                  className: 'ho-textarea',
                  value: form.acceptance,
                  onChange: (event) => setForm({ ...form, acceptance: event.target.value }),
                }),
              ),
              h('div', { className: 'ho-field' },
                h('span', { className: 'ho-label' }, t('scope')),
                h('div', { className: 'ho-seg' },
                  scopeButton('project', t('scopeProject'), noProject),
                  scopeButton('global', t('scopeGlobal'), false),
                ),
                noProject ? h('span', { className: 'ho-hint' }, t('noProjectScope')) : null,
              ),
              h('label', { className: 'ho-field' },
                h('span', { className: 'ho-label' }, t('createNote')),
                h('input', {
                  className: 'ho-input',
                  value: form.note,
                  onChange: (event) => setForm({ ...form, note: event.target.value }),
                }),
              ),
              h('div', { className: 'ho-actions' },
                button(t('cancel'), () => setCreating(false), { ghost: true, disabled: writing }),
                button(writing ? t('saving') : t('newOrder'), create, { primary: true, disabled: writing || form.title.trim() === '' }),
              ),
              form.title.trim() === '' ? h('p', { className: 'ho-hint' }, t('createTitleRequired')) : null,
            ),
          )
        : null

      const dropModal = drop !== null
        ? h('div', { className: 'ho-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('dropTitle') },
            h('div', { className: 'ho-modal-card' },
              h('h2', { className: 'ho-modal-title' }, t('dropTitle')),
              h('p', { className: 'ho-hint' }, t('dropHint')),
              h('label', { className: 'ho-field' },
                h('span', { className: 'ho-label' }, `${drop.id} · ${t('noteRequiredDrop')}`),
                h('textarea', {
                  className: 'ho-textarea',
                  value: drop.reason,
                  onChange: (event) => setDrop({ ...drop, reason: event.target.value, error: '' }),
                }),
              ),
              drop.error === '' ? null : h('p', { className: 'ho-warnbox' }, drop.error),
              h('div', { className: 'ho-actions' },
                button(t('cancel'), () => setDrop(null), { ghost: true, disabled: writing }),
                button(writing ? t('saving') : t('dropConfirm'), confirmDrop, {
                  danger: true,
                  disabled: writing || drop.reason.trim() === '',
                }),
              ),
            ),
          )
        : null

      return h('div', { className: 'ho-root' },
        h('style', null, STYLES),
        banners.length === 0 ? null : h('div', { className: 'ho-banners' }, banners),
        emptyBanner,
        topBar,
        problemsBar,
        body,
        createModal,
        dropModal,
      )
    }

    const STYLES = `
.ho-root, .ho-root *, .ho-root *::before, .ho-root *::after { box-sizing:border-box; }
.ho-root { display:flex; flex-direction:column; flex:1 1 auto; width:100%; height:100%; min-height:0;
  color:var(--dsw-alias-label-primary,#1f2328); background:var(--dsw-alias-bg-base,transparent);
  font-size:13px; line-height:1.5; overflow:hidden; }
.ho-banners { display:flex; flex-direction:column; gap:6px; padding:7px 12px; flex:none;
  border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-banner { display:flex; align-items:center; gap:8px; padding:4px 9px; border-radius:7px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); font-size:11.5px; }
.ho-banner-error { border-color:var(--dsw-alias-state-error-primary,#dc2626); color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-banner-ok { border-color:var(--dsw-alias-state-success-primary,#16a34a); color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-banner-warn { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706);
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-banner-info { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.ho-banner-text { flex:1 1 auto; min-width:0; word-break:break-word; }
.ho-empty-session { flex:1 1 auto; display:flex; align-items:center; justify-content:center; }
.ho-top { flex:none; display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 12px;
  border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-top-title { font-weight:600; font-size:13.5px; }
.ho-top-count { color:var(--dsw-alias-label-secondary,#6b7280); font-weight:500; }
.ho-stats { display:flex; gap:6px; flex:1 1 auto; flex-wrap:wrap; align-items:center; }
.ho-stat { display:inline-flex; align-items:baseline; gap:5px; padding:1px 8px; border-radius:999px;
  font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280);
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-stat b { font-size:12.5px; color:var(--dsw-alias-label-primary,#1f2328); }
.ho-stat-warn { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-stat-warn b { color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-stat-danger { border-color:var(--dsw-alias-state-error-primary,#dc2626); color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-stat-danger b { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-stat-ok b { color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-top-actions { display:flex; align-items:center; gap:6px; margin-left:auto; }
.ho-drag-hint { display:none; }
.ho-main { flex:1 1 auto; min-width:0; min-height:0; display:flex; overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-board-wrap { flex:1 1 auto; width:100%; min-width:0; min-height:0; display:flex;
  flex-direction:column; overflow:hidden; }
.ho-board { flex:1 1 auto; width:100%; min-width:0; min-height:0; display:flex; gap:8px; padding:10px;
  overflow-x:auto; overflow-y:hidden; align-items:stretch; }
.ho-col { flex:0 0 auto; width:calc((100% - 32px) / 5); min-width:150px; display:flex;
  flex-direction:column; min-height:0;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:10px;
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-col-over { border-color:var(--dsw-alias-brand-primary,#2563eb);
  box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary,#2563eb); }
.ho-col-head { display:flex; align-items:center; gap:6px; padding:7px 9px; flex:none;
  border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); font-size:11.5px; font-weight:600;
  color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-col-sub { font-weight:400; font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-col-count { margin-left:auto; font-weight:600; color:var(--dsw-alias-label-primary,#1f2328); }
.ho-dot { width:7px; height:7px; border-radius:50%; background:var(--dsw-alias-label-secondary,#9aa1ab); flex:none; }
.ho-dot-intake { background:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-dot-active { background:var(--dsw-alias-brand-primary,#2563eb); }
.ho-dot-review { background:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-dot-blocked { background:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-dot-done { background:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-dot-dropped { background:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-col-note { margin:0; padding:4px 9px 0; font-size:10px; color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-col-body { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; padding:8px;
  display:flex; flex-direction:column; gap:7px; }
.ho-col-empty { margin:8px 0; text-align:center; font-size:11.5px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-col-foot { flex:none; display:flex; justify-content:space-between; gap:6px; padding:5px 9px;
  border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb); font-size:10.5px;
  color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-card { display:flex; flex-direction:column; gap:4px; padding:7px 9px; border-radius:9px; cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-card:hover { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.ho-card:focus-visible { outline:2px solid var(--dsw-alias-brand-primary,#2563eb); outline-offset:1px; }
.ho-card-on { border-color:var(--dsw-alias-brand-primary,#2563eb);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary,#2563eb) 10%, var(--dsw-alias-bg-layer-1,#fff));
  box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary,#2563eb); }
.ho-card-compact { min-width:200px; max-width:300px; }
.ho-card-dragging { opacity:.5; }
.ho-card-bounce { animation:ho-shake .34s ease; }
.ho-card-title { font-weight:550; word-break:break-word; display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; overflow:hidden; }
.ho-card-meta { display:flex; align-items:center; gap:5px; flex-wrap:wrap; font-size:11px;
  color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-chip { font-size:10px; line-height:1.5; padding:0 5px; border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1,#e5e7eb); color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-chip-size { font-weight:600; color:var(--dsw-alias-label-primary,#1f2328);
  border-color:var(--dsw-alias-border-l2,#d1d5db); }
.ho-chip-warn { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-chip-danger { border-color:var(--dsw-alias-state-error-primary,#dc2626); color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-chip-global { border-color:var(--dsw-alias-state-warn-primary,#d97706); color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-card-warns { display:flex; gap:4px; flex-wrap:wrap; }
.ho-card-foot { display:flex; justify-content:space-between; gap:6px; font-size:10px;
  color:var(--dsw-alias-label-secondary,#9aa1ab); white-space:nowrap; min-width:0; }
.ho-card-foot-main { min-width:0; overflow:hidden; text-overflow:ellipsis; }
.ho-card-foot-side { flex:none; }
.ho-card-signed { font-size:10.5px; color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-archive { flex:none; border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  background:var(--dsw-alias-bg-layer-1,#fff); padding:6px 10px 8px; max-height:190px; overflow:auto; }
.ho-archive-over { box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary,#2563eb); }
.ho-archive-btn { display:flex; align-items:center; gap:8px; width:100%; padding:0; border:none;
  background:none; color:var(--dsw-alias-label-secondary,#6b7280); font:inherit; font-size:11.5px;
  cursor:pointer; text-align:left; }
.ho-archive-list { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
.ho-archive-empty { margin:6px 0 0; font-size:11px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-checker { flex:none; width:300px; min-width:0; display:flex; flex-direction:column; min-height:0;
  border-left:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff); }
.ho-checker-closed { width:40px; align-items:center; padding-top:8px; gap:8px; }
.ho-checker-closed-label { writing-mode:vertical-rl; font-size:11px; letter-spacing:.16em;
  color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-checker-head { flex:none; display:flex; align-items:center; justify-content:space-between;
  padding:7px 10px; border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb); }
.ho-checker-title { font-size:12px; font-weight:600; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-checker-body { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden;
  padding:10px 12px 24px; display:flex; flex-direction:column; gap:10px; }
.ho-placeholder { flex:1 1 auto; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:6px; color:var(--dsw-alias-label-secondary,#6b7280); padding:24px 18px; text-align:center; }
.ho-placeholder-mark { font-size:22px; opacity:.5; }
.ho-placeholder-sub { font-size:11px; }
.ho-ins-head { display:flex; flex-direction:column; gap:3px; }
.ho-ins-title { margin:0; font-size:15px; font-weight:600; word-break:break-word; }
.ho-ins-meta { display:flex; gap:6px; flex-wrap:wrap; font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-sec { border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb); padding-top:7px; }
.ho-sec-label { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); margin-bottom:3px; }
.ho-sec-body { min-width:0; word-break:break-word; }
.ho-stage-row { display:flex; align-items:baseline; }
.ho-stage { font-weight:600; }
.ho-stage-done { color:var(--dsw-alias-state-success-primary,#16a34a); }
.ho-stage-blocked { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-stage-review { color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-stage-active { color:var(--dsw-alias-brand-primary,#2563eb); }
.ho-acceptance { margin:0; padding-left:17px; }
.ho-acceptance li { margin:1px 0; word-break:break-word; }
.ho-muted { color:var(--dsw-alias-label-secondary,#6b7280); font-size:12px; }
.ho-faint { color:var(--dsw-alias-label-secondary,#9aa1ab); font-size:10.5px; }
.ho-hint { margin:2px 0; font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.ho-warnbox { margin:2px 0; padding:4px 8px; border-radius:6px; font-size:11.5px;
  border:1px solid var(--dsw-alias-state-warn-primary,#d97706);
  color:var(--dsw-alias-state-warn-primary,#d97706); background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-arts { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:5px; }
.ho-art { display:flex; flex-direction:column; gap:2px; padding:4px 0; }
.ho-art-top { display:flex; align-items:baseline; gap:6px; min-width:0; }
.ho-art-path { flex:1 1 auto; min-width:0; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:11.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ho-art-kind { flex:none; font-size:10px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-art-missing .ho-art-kind, .ho-art-escape .ho-art-kind { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-art-open { align-self:flex-start; border:none; background:none; padding:0; cursor:pointer;
  font:inherit; font-size:11.5px; color:var(--dsw-alias-brand-primary,#2563eb); }
.ho-art-open:hover:not(:disabled) { text-decoration:underline; }
.ho-art-open:disabled { color:var(--dsw-alias-label-secondary,#9aa1ab); cursor:default; }
.ho-art-hint { font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-link { border:none; background:none; color:var(--dsw-alias-brand-primary,#2563eb); cursor:pointer;
  padding:0 2px; font-size:11px; }
.ho-log { max-height:280px; overflow:auto; }
.ho-log-list { display:flex; flex-direction:column; gap:7px; }
.ho-log-row { border-left:2px solid var(--dsw-alias-border-l2,#d1d5db); padding-left:7px; }
.ho-log-meta { font-size:10.5px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-log-note { margin:1px 0 0; white-space:pre-wrap; word-break:break-word; font-size:12px; }
.ho-log-count { margin-top:6px; font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa1ab); }
.ho-cardpanel { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); border-radius:9px;
  padding:8px 9px; background:var(--dsw-alias-bg-layer-2,#f8f9fb); }
.ho-panel-title { margin:0 0 7px; font-size:12.5px; font-weight:600; }
.ho-field { display:flex; flex-direction:column; gap:3px; margin-bottom:7px; }
.ho-label { font-size:11px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-input, .ho-textarea { width:100%; border:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  border-radius:7px; padding:5px 7px; background:var(--dsw-alias-bg-layer-1,#fff); color:inherit;
  outline:none; font:inherit; }
.ho-input:focus, .ho-textarea:focus { border-color:var(--dsw-alias-brand-primary,#2563eb); }
.ho-textarea { resize:vertical; min-height:56px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px; }
.ho-sign-note { min-height:58px; margin-bottom:4px; }
.ho-artifacts-input { min-height:44px; }
.ho-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.ho-btn { border:1px solid var(--dsw-alias-border-l1,#e5e7eb); background:var(--dsw-alias-bg-layer-1,#fff);
  color:inherit; padding:4px 10px; border-radius:7px; font-size:12px; cursor:pointer; white-space:nowrap; }
.ho-btn:hover:not(:disabled) { border-color:var(--dsw-alias-border-l2,#d1d5db); }
.ho-btn:disabled { opacity:.45; cursor:default; }
.ho-primary { background:var(--dsw-alias-brand-primary,#2563eb); border-color:var(--dsw-alias-brand-primary,#2563eb); color:#fff; }
.ho-danger { color:var(--dsw-alias-state-error-primary,#dc2626); }
.ho-ghost { border-color:transparent; background:transparent; color:var(--dsw-alias-label-secondary,#6b7280); }
.ho-blockers { list-style:none; margin:0 0 6px; padding:0; display:flex; flex-direction:column; gap:4px; }
.ho-blocker { font-size:11px; color:var(--dsw-alias-state-warn-primary,#d97706); word-break:break-word; }
.ho-problems { flex:none; padding:4px 12px; border-bottom:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  background:var(--dsw-alias-bg-layer-2,#f8f9fb); font-size:11.5px;
  color:var(--dsw-alias-state-warn-primary,#d97706); }
.ho-problems-head { border:none; background:none; color:inherit; font:inherit; cursor:pointer; padding:0; }
.ho-problem-list { margin:4px 0 3px; padding-left:16px; }
.ho-problem-item { word-break:break-all; }
.ho-modal { position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center;
  padding:20px; background:rgba(15,23,42,.38); }
.ho-modal-card { width:min(540px, 100%); max-height:84vh; overflow:auto; padding:14px 16px;
  border-radius:12px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  background:var(--dsw-alias-bg-layer-1,#fff); box-shadow:0 18px 50px rgba(15,23,42,.28); }
.ho-modal-title { margin:0 0 4px; font-size:14px; font-weight:600; }
.ho-seg { display:flex; gap:2px; padding:2px; border:1px solid var(--dsw-alias-border-l1,#e5e7eb);
  border-radius:8px; background:var(--dsw-alias-bg-layer-2,#f3f4f6); }
.ho-seg-btn { flex:1; border:none; background:none; padding:3px 8px; border-radius:6px; font-size:12px;
  color:var(--dsw-alias-label-secondary,#6b7280); cursor:pointer; }
.ho-seg-btn:disabled { opacity:.45; cursor:default; }
.ho-seg-on { background:var(--dsw-alias-bg-layer-1,#fff); color:var(--dsw-alias-label-primary,#111827);
  box-shadow:0 1px 2px rgba(0,0,0,.06); }
@keyframes ho-shake {
  0%, 100% { transform:translateX(0); }
  25% { transform:translateX(-3px); }
  75% { transform:translateX(3px); }
}
@media (max-width:1239px) {
  .ho-checker { width:286px; }
  .ho-checker-closed { width:36px; }
  .ho-drag-hint { display:none; }
  .ho-col { min-width:160px; }
  .ho-top { gap:6px; }
}
`

    return {
      inject: ['slots', 'locale'],
      __test: {
        queryString,
        sessionFileAddress,
        openInDsh,
        stageRequest,
        columnsOf,
        archiveOf,
        overdueOf,
        noAcceptanceOf,
        hoursSince,
        pickFirst,
        formatLogTime,
        kindKey,
      },
      apply(ctx) {
        services = ctx
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

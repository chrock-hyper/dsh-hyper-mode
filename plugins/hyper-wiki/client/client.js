/**
 * Wiki panel — browser half.
 *
 * A sidebar entry beside Plugins and Scheduled tasks, opening a review page:
 * page tree and search on the left, page source and a plain-text preview in the
 * middle, and the draft, backlinks, and approval controls on the right. The
 * Host owns every file operation; this module only calls `/wiki/*` and renders.
 *
 * Plain browser module: React comes from the platform module table, so there is
 * no build step, no JSX, and no import of any DSH Client package.
 */
window.__ModuleLoader__.load({
  id: '@chrock-studio/dsh-hyper-wiki-client',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'wiki'
    const PANEL_ID = 'wiki'
    const API = '/wiki'
    const BADGE_POLL_MS = 20000

    let t = key => key

    // ------------------------------------------------------------------ locale
    const zh = {
      panel: 'Wiki',
      title: 'Wiki',
      subtitle: '约定优先的 Markdown 知识库：Agent 只写草稿，你在这里批准',
      scopeGlobal: '全局',
      scopeProject: '项目',
      noProject: '（没有最近项目）',
      refresh: '刷新',
      searchPlaceholder: '搜索标题、标签、文件名…',
      emptyPages: '这个库里还没有页面。',
      emptySelection: '从左侧选一个页面，或先让 Agent 写一份草稿。',
      draftWaiting: '待审',
      tabSource: '源码',
      tabPreview: '预览',
      tabDraft: '草稿对比',
      edit: '编辑',
      save: '保存页面',
      cancel: '取消',
      saving: '保存中…',
      readonly: '源码只读；点「编辑」直接改页面（Agent 只能写草稿）',
      noDraft: '这个页面没有草稿。',
      draftTitle: '草稿',
      draftAuthor: '作者',
      draftBase: '基线',
      draftUpdated: '更新',
      draftStatus_pending: '待批准',
      draftStatus_rejected: '已打回',
      draftStale: '页面在草稿之后被改过：批准会冲突，需要重新起草或强制覆盖。',
      approve: '批准',
      approveForce: '强制覆盖…',
      reject: '打回…',
      deletePage: '删除…',
      renamePage: '重命名…',
      backlinks: '反链',
      noBacklinks: '还没有别的页面链接到这里。',
      meta: '信息',
      status: '状态',
      updated: '更新于',
      tags: '标签',
      path: '路径',
      contract: '契约文件',
      confirmForceTitle: '强制覆盖页面？',
      confirmForceBody: '草稿的基线已经和当前页面不一致，覆盖会丢掉页面上更新的内容。确认继续？',
      confirmDeleteTitle: '删除页面？',
      confirmDeleteBody: '页面会移进 .trash，在全局库里还会产生一次提交。',
      rejectTitle: '打回草稿',
      rejectBody: '理由会写进草稿，Agent 用 wiki 工具的 status 动作能看到。',
      renameTitle: '重命名页面',
      renameBody: '只移动文件，不会改写别的页面里的链接；受影响的反链会列出来。',
      confirm: '确认',
      close: '关闭',
      reasonPlaceholder: '例如：术语和 wiki.md 里的定义不一致',
      newPath: '新的页面路径，如 guide/setup.md',
      busyApplying: '正在处理…',
      approved: '已批准并写入页面',
      rejected: '已打回',
      deleted: '已移入 .trash',
      renamed: '已重命名',
      saved: '已保存页面',
      noPages: '没有匹配的页面。',
      gitOn: 'git 历史开',
      gitOff: '无 git',
      pagesCount: '{count} 页',
      draftsCount: '{count} 份草稿',
      pendingCount: '待审 {count}',
      newPage: '新建页面',
      pagePathPlaceholder: '路径，例如 guide/error-codes.md',
      pageTitlePlaceholder: '标题',
      create: '创建',
      cancel: '取消',
      needPath: '路径不能为空',
      pageCreated: '页面已创建',
      rejectedHint: '被打回：',
      errors: '解析提示',
    }

    const en = {
      panel: 'Wiki',
      title: 'Wiki',
      subtitle: 'A convention-first Markdown wiki: agents draft, you approve here',
      scopeGlobal: 'Global',
      scopeProject: 'Project',
      noProject: '(no recent project)',
      refresh: 'Refresh',
      searchPlaceholder: 'Search titles, tags, file names…',
      emptyPages: 'No pages in this store yet.',
      emptySelection: 'Pick a page on the left, or ask an agent for a draft first.',
      draftWaiting: 'pending',
      tabSource: 'Source',
      tabPreview: 'Preview',
      tabDraft: 'Draft diff',
      edit: 'Edit',
      save: 'Save page',
      cancel: 'Cancel',
      saving: 'Saving…',
      readonly: 'Source is read-only; Edit changes the page directly (agents may only draft)',
      noDraft: 'This page has no draft.',
      draftTitle: 'Draft',
      draftAuthor: 'Author',
      draftBase: 'Base',
      draftUpdated: 'Updated',
      draftStatus_pending: 'Awaiting approval',
      draftStatus_rejected: 'Rejected',
      draftStale: 'The page changed after this draft: approving conflicts — re-draft or force the overwrite.',
      approve: 'Approve',
      approveForce: 'Force overwrite…',
      reject: 'Reject…',
      deletePage: 'Delete…',
      renamePage: 'Rename…',
      backlinks: 'Backlinks',
      noBacklinks: 'No other page links here yet.',
      meta: 'Details',
      status: 'Status',
      updated: 'Updated',
      tags: 'Tags',
      path: 'Path',
      contract: 'Contract file',
      confirmForceTitle: 'Force the overwrite?',
      confirmForceBody: 'The draft base no longer matches the page, so approving discards newer page content. Continue?',
      confirmDeleteTitle: 'Delete this page?',
      confirmDeleteBody: 'The page moves into .trash; the global store also gains a commit.',
      rejectTitle: 'Reject the draft',
      rejectBody: 'The reason is written into the draft and appears in the agent’s wiki status action.',
      renameTitle: 'Rename the page',
      renameBody: 'Only the file moves; links in other pages are not rewritten, and affected backlinks are listed.',
      confirm: 'Confirm',
      close: 'Close',
      reasonPlaceholder: 'For example: the term disagrees with the definition in wiki.md',
      newPath: 'New page path, such as guide/setup.md',
      busyApplying: 'Working…',
      approved: 'Approved and written to the page',
      rejected: 'Rejected',
      deleted: 'Moved to .trash',
      renamed: 'Renamed',
      saved: 'Page saved',
      noPages: 'No matching page.',
      gitOn: 'git history',
      gitOff: 'no git',
      pagesCount: '{count} page(s)',
      draftsCount: '{count} draft(s)',
      pendingCount: '{count} pending',
      newPage: 'New page',
      pagePathPlaceholder: 'path, e.g. guide/error-codes.md',
      pageTitlePlaceholder: 'title',
      create: 'Create',
      cancel: 'Cancel',
      needPath: 'A path is required',
      pageCreated: 'Page created',
      rejectedHint: 'Rejected: ',
      errors: 'Parse notes',
    }

    // ------------------------------------------------------------------- fetch
    /**
     * GET one API path.
     * @param {string} path - path below /wiki.
     * @param {object} query - query parameters; empty values are omitted.
     * @returns {Promise<object>} the parsed JSON body.
     */
    async function apiGet(path, query) {
      const url = API + path + queryString(query)
      const response = await fetch(url, { cache: 'no-store' })
      return readResponse(response)
    }

    /**
     * POST one API path.
     * @param {string} path - path below /wiki.
     * @param {object} query - query parameters.
     * @param {object} body - JSON body.
     * @returns {Promise<object>} the parsed JSON body.
     */
    async function apiPost(path, query, body) {
      const response = await fetch(API + path + queryString(query), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      return readResponse(response)
    }

    /**
     * Build a query string, skipping empty values.
     * @param {object} query - parameters.
     * @returns {string} the encoded suffix, or an empty string.
     */
    function queryString(query) {
      const params = new URLSearchParams()
      for (const key of Object.keys(query || {})) {
        const value = query[key]
        if (value === undefined || value === null || value === '') continue
        params.set(key, String(value))
      }
      const text = params.toString()
      return text === '' ? '' : '?' + text
    }

    /**
     * Read one JSON response and turn a failure into an exception.
     * @param {Response} response - fetch response.
     * @returns {Promise<object>} the body.
     */
    async function readResponse(response) {
      let body
      try {
        body = await response.json()
      } catch (error) {
        throw new Error(response.status + ' ' + response.statusText)
      }
      if (!response.ok || body.ok === false) {
        throw new Error((body && body.message) || response.status + ' ' + response.statusText)
      }
      return body
    }

    // -------------------------------------------------------------------- icon
    /**
     * The sidebar icon: a page with a link, plus the pending-draft badge the
     * design asks for. Drawn here, so it needs no extra asset.
     * @param {{size?: number, active?: boolean}} props - sidebar row props.
     */
    function WikiIcon(props) {
      const size = (props && props.size) || 18
      const active = Boolean(props && props.active)
      const [pending, setPending] = useState(0)

      useEffect(() => {
        let alive = true
        const load = () => {
          fetch(API + '/pending', { cache: 'no-store' })
            .then(response => (response.ok ? response.json() : undefined))
            .then(body => {
              if (!alive || !body || typeof body.total !== 'number') return
              setPending(body.total)
            })
            .catch(() => undefined)
        }
        load()
        const timer = setInterval(load, BADGE_POLL_MS)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [])

      const badge = pending > 0
        ? h(
            'g',
            null,
            h('circle', {
              cx: 18.4,
              cy: 5.6,
              r: 5.2,
              fill: 'var(--dsw-alias-state-warn-primary, #d97706)',
              stroke: 'var(--dsw-alias-bg-base, #ffffff)',
              strokeWidth: 1.4,
            }),
            h(
              'text',
              {
                x: 18.4,
                y: 8.3,
                textAnchor: 'middle',
                fontSize: 6.4,
                fontWeight: 700,
                fill: '#ffffff',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              },
              pending > 99 ? '99+' : String(pending),
            ),
          )
        : null

      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: active ? 1.9 : 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { overflow: 'visible' },
        },
        h('path', { d: 'M6.2 3.4h7.1l4.5 4.4v12.4a1.4 1.4 0 0 1-1.4 1.4H6.2a1.4 1.4 0 0 1-1.4-1.4V4.8a1.4 1.4 0 0 1 1.4-1.4z' }),
        h('path', { d: 'M13.1 3.5v4.5h4.6' }),
        h('path', { d: 'M8.2 12.6h6.2M8.2 15.8h4.2' }),
        h('circle', { cx: 14.6, cy: 18.1, r: 1.5, fill: 'currentColor', stroke: 'none' }),
        badge,
      )
    }

    // ------------------------------------------------------------------- panel
    /**
     * The main panel: page tree, editor/preview, and review rail.
     */
    function WikiPage({ sessionId }) {
      const [boot, setBoot] = useState(null)
      const session = sessionId === undefined || sessionId === null ? '' : String(sessionId)
      const [scope, setScope] = useState('global')
      const [pages, setPages] = useState([])
      const [drafts, setDrafts] = useState([])
      const [selected, setSelected] = useState('')
      const [page, setPage] = useState(null)
      const [tab, setTab] = useState('source')
      const [editing, setEditing] = useState(false)
      const [draftText, setDraftText] = useState('')
      const [filter, setFilter] = useState('')
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState('')
      const [error, setError] = useState('')
      const [dialog, setDialog] = useState(null)
      const [creatingPage, setCreatingPage] = useState(false)
      const [newPath, setNewPath] = useState('')
      const [newTitle, setNewTitle] = useState('')
      const selectedRef = useRef('')
      selectedRef.current = selected

      const query = useMemo(() => ({ scope, session }), [scope, session])

      const loadState = useCallback(async () => {
        try {
          const body = await apiGet('/state', { session })
          setBoot(body)
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }, [session])

      const loadScope = useCallback(async () => {
        try {
          const [listBody, draftBody] = await Promise.all([
            apiGet('/pages', query),
            apiGet('/drafts', query),
          ])
          const rows = listBody.pages || []
          setPages(rows)
          setDrafts(draftBody.drafts || [])
          // A page can disappear under the selection (deleted or renamed);
          // keeping it selected would only produce a 404 on the next read.
          setSelected(current => (current !== '' && !rows.some(row => row.path === current) ? '' : current))
        } catch (failure) {
          setError(String(failure.message || failure))
        }
      }, [query])

      const loadPage = useCallback(async path => {
        if (!path) {
          setPage(null)
          setDraftText('')
          return
        }
        try {
          const body = await apiGet('/page', { scope, session, path })
          setPage(body)
          setEditing(false)
        } catch (failure) {
          setPage(null)
          setError(String(failure.message || failure))
        }
      }, [scope, session])

      // The tab is session-scoped: the Host resolves the project directory from
      // `session`, so there is no project picker and no second render pass.
      useEffect(() => {
        loadState()
      }, [loadState])

      useEffect(() => {
        loadScope()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [scope, session])

      useEffect(() => {
        loadPage(selected)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [selected, scope, session])

      // A fresh tab should show a page, not an empty placeholder: the first
      // listed page is the natural entry point, and its draft tab wins when
      // there is something to review.
      useEffect(() => {
        if (selected !== '' || pages.length === 0) return
        const first = pages[0]
        setSelected(first.path)
        setTab(drafts.some(row => row.path === first.path) ? 'draft' : 'source')
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [pages, drafts, selected])

      /**
       * Reload state, the page list, drafts, and the selected page.
       * @param {string|undefined} nextPath - selection to keep or move to;
       *   `''` clears it, undefined keeps the current one.
       */
      const refresh = useCallback(async nextPath => {
        await loadState()
        await loadScope()
        if (nextPath !== undefined) {
          setSelected(nextPath)
          selectedRef.current = nextPath
          if (nextPath === '') {
            setPage(null)
            setEditing(false)
          } else {
            await loadPage(nextPath)
          }
          return
        }
        if (selectedRef.current !== '') await loadPage(selectedRef.current)
      }, [loadState, loadScope, loadPage])

      /**
       * Run one mutation and report its outcome.
       * @param {string} path - API path.
       * @param {object} body - JSON body.
       * @param {string} successKey - locale key for the success notice.
       * @param {{path?: string}} options - how to refresh afterwards.
       */
      const mutate = useCallback(async (path, body, successKey, nextPath) => {
        setBusy(true)
        setError('')
        setNotice('')
        try {
          await apiPost(path, query, body)
          setNotice(t(successKey))
          await refresh(nextPath)
        } catch (failure) {
          setError(String(failure.message || failure))
        } finally {
          setBusy(false)
        }
      }, [query, refresh])

      const draft = page && page.draft ? page.draft : null
      const queued = drafts.filter(row => row.status === 'pending')
      const visible = useMemo(() => {
        const needle = filter.trim().toLowerCase()
        if (needle === '') return pages
        return pages.filter(row => {
          const haystack = [row.path, row.title, (row.tags || []).join(' ')].join(' ').toLowerCase()
          return haystack.indexOf(needle) >= 0
        })
      }, [pages, filter])
      const draftByPage = useMemo(() => {
        const map = {}
        for (const row of drafts) map[row.path] = row
        return map
      }, [drafts])
      const scopeRow = useMemo(() => {
        if (!boot) return undefined
        return (boot.scopes || []).find(row => row.scope === scope)
      }, [boot, scope])
      const projectScope = useMemo(() => {
        if (!boot) return undefined
        return (boot.scopes || []).find(row => row.scope === 'project')
      }, [boot])

      const submitDialog = async value => {
        const current = dialog
        setDialog(null)
        if (!current) return
        if (current.kind === 'force') {
          await mutate('/approve', { path: selected, force: true }, 'approved', selected)
          return
        }
        if (current.kind === 'delete') {
          await mutate('/delete', { path: selected }, 'deleted', '')
          return
        }
        if (current.kind === 'reject') {
          await mutate('/reject', { path: selected, reason: value || '' }, 'rejected', selected)
          return
        }
        if (current.kind === 'rename') {
          await mutate('/rename', { from: selected, to: value || '' }, 'renamed', String(value || '').trim())
        }
      }

      const savePage = async () => {
        await mutate('/page', { path: selected, content: draftText }, 'saved', selected)
        setEditing(false)
      }

      /**
       * Create a page from the tree form. A page needs frontmatter, so the
       * title is written there and the body starts as a single heading.
       */
      const createPage = async () => {
        const path = newPath.trim().replace(/^\.?\/?/, '')
        if (path === '') { setError(t('needPath')); return }
        const title = newTitle.trim() === '' ? path.replace(/\.md$/, '').split('/').pop() : newTitle.trim()
        const content = `---\ntitle: ${title}\nstatus: wip\n---\n\n# ${title}\n`
        await mutate('/page', { path, content }, 'pageCreated', path.endsWith('.md') ? path : `${path}.md`)
        setCreatingPage(false)
        setNewPath('')
        setNewTitle('')
      }

      return h(
        'div',
        { className: 'dw-root' },
        h('style', null, STYLES),
        error !== '' ? h('div', { className: 'dw-banner dw-banner-error' }, error, button('dw-banner-close', '×', () => setError(''))) : null,
        notice !== '' ? h('div', { className: 'dw-banner dw-banner-ok' }, notice, button('dw-banner-close', '×', () => setNotice(''))) : null,
        h(
          'div',
          { className: 'dw-body' },
          h(
            'aside',
            { className: 'dw-tree' },
            h('div', { className: 'dw-treehead' },
    h(
                  'div',
                  { className: 'dw-controls' },
                  h(
                    'div',
                    { className: 'dw-segmented', role: 'group', 'aria-label': t('panel') },
                    scopeButton('global', t('scopeGlobal')),
                    scopeButton('project', t('scopeProject'), projectScope === undefined || projectScope === null),
                  ),
                  scope === 'project' && (projectScope === undefined || projectScope === null)
                    ? h('span', { className: 'dw-chip dw-chip-quiet' }, t('noProject'))
                    : null,
                  h('span', { className: 'dw-chip' }, t('pendingCount', { count: queued.length })),
                  scopeRow
                    ? h('span', { className: 'dw-chip dw-chip-quiet' }, t(scopeRow.git ? 'gitOn' : 'gitOff'))
                    : null,
                  h('button', { type: 'button', className: 'dw-button', onClick: () => refresh(), disabled: busy }, t('refresh')),
                ),
              ),
            h('input', {
              className: 'dw-input dw-search',
              type: 'search',
              value: filter,
              placeholder: t('searchPlaceholder'),
              onChange: event => setFilter(event.target.value),
            }),
            h('button', {
              type: 'button',
              className: 'dw-newpage',
              onClick: () => setCreatingPage(open => !open),
              disabled: busy,
            }, creatingPage ? t('cancel') : `＋ ${t('newPage')}`),
            creatingPage
              ? h('div', { className: 'dw-create' },
                  h('input', {
                    className: 'dw-input',
                    placeholder: t('pagePathPlaceholder'),
                    value: newPath,
                    onChange: event => setNewPath(event.target.value),
                  }),
                  h('input', {
                    className: 'dw-input',
                    placeholder: t('pageTitlePlaceholder'),
                    value: newTitle,
                    onChange: event => setNewTitle(event.target.value),
                  }),
                  h('div', { className: 'dw-create-actions' },
                    h('button', { type: 'button', className: 'dw-button', onClick: () => setCreatingPage(false) }, t('cancel')),
                    h('button', { type: 'button', className: 'dw-button dw-primary', onClick: createPage, disabled: busy }, t('create'))))
              : null,
            h('div', { className: 'dw-tree-meta' },
              t('pagesCount', { count: pages.length }),
              ' · ',
              t('draftsCount', { count: drafts.length })),
            visible.length === 0
              ? h('p', { className: 'dw-muted' }, pages.length === 0 ? t('emptyPages') : t('noPages'))
              : h(
                  'ul',
                  { className: 'dw-page-list' },
                  visible.map(row => {
                    const rowDraft = draftByPage[row.path]
                    return h(
                      'li',
                      { key: row.path },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dw-page-row' + (row.path === selected ? ' dw-page-row-active' : ''),
                          onClick: () => {
                            setSelected(row.path)
                            setTab(rowDraft ? 'draft' : 'source')
                          },
                          title: row.path,
                        },
                        h('span', { className: 'dw-page-title' }, row.title),
                        h(
                          'span',
                          { className: 'dw-page-sub' },
                          h('span', { className: 'dw-dot dw-dot-' + (row.status || 'unknown') }),
                          row.path,
                          rowDraft
                            ? h('span', { className: 'dw-badge dw-badge-' + (rowDraft.status || 'pending') }, t('draftWaiting'))
                            : null,
                        ),
                      ),
                    )
                  }),
                ),
            queued.length > 0
              ? h(
                  'div',
                  { className: 'dw-queue' },
                  h('div', { className: 'dw-label' }, t('draftTitle')),
                  h(
                    'ul',
                    { className: 'dw-queue-list' },
                    queued.map(row => h(
                      'li',
                      { key: row.path },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dw-link',
                          onClick: () => {
                            setSelected(row.path)
                            setTab('draft')
                          },
                        },
                        row.path,
                        ' ',
                        h('span', { className: 'dw-muted' }, '— ' + row.author),
                      ),
                      row.stale ? h('span', { className: 'dw-warn' }, ' ⚠') : null,
                    )),
                  ),
                )
              : null,
          ),
          h(
            'main',
            { className: 'dw-main' },
            selected === '' || !page
              ? h('div', { className: 'dw-placeholder' }, h('p', null, t('emptySelection')))
              : h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    { className: 'dw-page-head' },
                    h('div', null,
                      h('h2', null, page.title),
                      h('div', { className: 'dw-page-meta' },
                        h('span', { className: 'dw-mono' }, page.path),
                        h('span', { className: 'dw-dot dw-dot-' + (page.status || 'unknown') }),
                        h('span', null, page.status),
                        page.updated ? h('span', { className: 'dw-muted' }, t('updated') + ' ' + page.updated) : null)),
                    h('div', { className: 'dw-tabs' },
                      tabButton('source', t('tabSource')),
                      tabButton('preview', t('tabPreview')),
                      tabButton('draft', t('tabDraft')),
                      h('span', { className: 'dw-spacer' }),
                      editing
                        ? h(React.Fragment, null,
                            h('button', { type: 'button', className: 'dw-button', onClick: () => { setEditing(false); loadPage(selected) }, disabled: busy }, t('cancel')),
                            h('button', { type: 'button', className: 'dw-button dw-primary', onClick: savePage, disabled: busy }, busy ? t('saving') : t('save')))
                        : h('button', {
                            type: 'button',
                            className: 'dw-button',
                            onClick: () => {
                              setDraftText(page.text)
                              setEditing(true)
                              setTab('source')
                            },
                          }, t('edit'))),
                  ),
                  tab === 'preview'
                    ? h('div', { className: 'dw-pane dw-preview' }, renderPreview(editing ? stripFrontmatter(draftText) : page.body))
                    : tab === 'draft'
                      ? h(
                          'div',
                          { className: 'dw-pane dw-diff' },
                          draft === null || draft === undefined
                            ? h('p', { className: 'dw-muted' }, t('noDraft'))
                            : h(
                                React.Fragment,
                                null,
                                h('div', { className: 'dw-draft-banner dw-draft-' + (draft.status || 'pending') },
                                  h('strong', null, t('draftStatus_' + (draft.status || 'pending'))),
                                  h('span', { className: 'dw-muted' }, ' ' + t('draftAuthor') + ': ' + (draft.author || '—')),
                                  h('span', { className: 'dw-muted' }, ' · ' + t('draftBase') + ': ' + (draft.base || '—')),
                                  draft.reason ? h('div', { className: 'dw-reason' }, t('rejectedHint') + draft.reason) : null),
                                h('pre', { className: 'dw-diff-body' }, diffLines(page.body || '', draft.body === undefined ? page.body || '' : draft.body)),
                              ),
                        )
                      : h('textarea', {
                          className: 'dw-input dw-editor',
                          value: editing ? draftText : page.text,
                          readOnly: !editing,
                          spellCheck: false,
                          onChange: event => setDraftText(event.target.value),
                        }),
                  editing ? h('p', { className: 'dw-muted dw-hint' }, t('readonly')) : null,
                ),
          ),
          h(
            'aside',
            { className: 'dw-rail' },
            selected === '' || !page
              ? null
              : h(
                  React.Fragment,
                  null,
                  h('section', { className: 'dw-section' },
                    h('h3', null, t('draftTitle')),
                    draft === null || draft === undefined
                      ? h('p', { className: 'dw-muted' }, t('noDraft'))
                      : h(
                          React.Fragment,
                          null,
                          h('dl', { className: 'dw-dl' },
                            h('dt', null, t('status')),
                            h('dd', null, t('draftStatus_' + (draft.status || 'pending'))),
                            h('dt', null, t('draftAuthor')),
                            h('dd', null, draft.author || '—'),
                            h('dt', null, t('draftBase')),
                            h('dd', { className: 'dw-mono' }, draft.base || '—'),
                            h('dt', null, t('draftUpdated')),
                            h('dd', null, draft.updated || '—')),
                          draft.reason ? h('p', { className: 'dw-reason' }, t('rejectedHint') + draft.reason) : null,
                          h('div', { className: 'dw-actions' },
                            h('button', {
                              type: 'button',
                              className: 'dw-button dw-primary',
                              disabled: busy,
                              onClick: () => {
                                setTab('source')
                                mutate('/approve', { path: selected }, 'approved', selected)
                              },
                            }, t('approve')),
                            draft.stale
                              ? h('button', { type: 'button', className: 'dw-button dw-warn-button', disabled: busy, onClick: () => setDialog({ kind: 'force' }) }, t('approveForce'))
                              : null,
                            h('button', {
                              type: 'button',
                              className: 'dw-button',
                              disabled: busy,
                              onClick: () => setDialog({ kind: 'reject' }),
                            }, t('reject'))),
                          draft.stale ? h('p', { className: 'dw-warn' }, t('draftStale')) : null,
                        )),
                  h('section', { className: 'dw-section' },
                    h('h3', null, t('backlinks') + ' (' + (page.backlinks || []).length + ')'),
                    (page.backlinks || []).length === 0
                      ? h('p', { className: 'dw-muted' }, t('noBacklinks'))
                      : h('ul', { className: 'dw-backlinks' },
                          (page.backlinks || []).map(row => h('li', { key: row.path },
                            h('button', {
                              type: 'button',
                              className: 'dw-link',
                              onClick: () => { setSelected(row.path); setTab('source') },
                            }, row.title))))),
                  h('section', { className: 'dw-section' },
                    h('h3', null, t('meta')),
                    h('dl', { className: 'dw-dl' },
                      h('dt', null, t('path')),
                      h('dd', { className: 'dw-mono' }, page.path),
                      h('dt', null, t('tags')),
                      h('dd', null, (page.tags || []).length === 0 ? '—' : page.tags.join(', ')),
                      h('dt', null, t('contract')),
                      h('dd', { className: 'dw-mono' }, scopeRow ? scopeRow.contract : '—')),
                    (page.errors || []).length > 0
                      ? h('div', { className: 'dw-note' },
                          h('div', { className: 'dw-label' }, t('errors')),
                          h('ul', null, page.errors.map((line, index) => h('li', { key: index }, line))))
                      : null),
                  h('section', { className: 'dw-section' },
                    h('div', { className: 'dw-actions' },
                      h('button', { type: 'button', className: 'dw-button', disabled: busy, onClick: () => setDialog({ kind: 'rename' }) }, t('renamePage')),
                      h('button', { type: 'button', className: 'dw-button dw-danger', disabled: busy, onClick: () => setDialog({ kind: 'delete' }) }, t('deletePage')))),
                ),
          ),
        ),
        dialog === null ? null : h(Dialog, { spec: dialog, onClose: () => setDialog(null), onSubmit: submitDialog }),
        busy ? h('div', { className: 'dw-busy' }, t('busyApplying')) : null,
      )

      function scopeButton(id, label, disabled) {
        return h('button', {
          type: 'button',
          className: 'dw-segment' + (scope === id ? ' dw-segment-active' : ''),
          'aria-pressed': scope === id,
          disabled: disabled === true,
          onClick: () => {
            setScope(id)
            setSelected('')
            setEditing(false)
          },
        }, label)
      }

      function tabButton(id, label) {
        return h('button', {
          type: 'button',
          className: 'dw-tab' + (tab === id ? ' dw-tab-active' : ''),
          onClick: () => setTab(id),
        }, label)
      }
    }

    /**
     * A tiny modal for confirmations and one-line inputs.
     * @param {{spec: object, onClose: Function, onSubmit: Function}} props - dialog state.
     */
    function Dialog(props) {
      const spec = props.spec || {}
      const kind = spec.kind
      const needsValue = kind === 'reject' || kind === 'rename'
      const [value, setValue] = useState('')
      const input = useRef(null)

      useEffect(() => {
        if (input.current) input.current.focus()
      }, [])

      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') props.onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [props.onClose])

      const title = kind === 'force'
        ? t('confirmForceTitle')
        : kind === 'delete'
          ? t('confirmDeleteTitle')
          : kind === 'reject'
            ? t('rejectTitle')
            : t('renameTitle')
      const body = kind === 'force'
        ? t('confirmForceBody')
        : kind === 'delete'
          ? t('confirmDeleteBody')
          : kind === 'reject'
            ? t('rejectBody')
            : t('renameBody')

      return h(
        'div',
        { className: 'dw-overlay', onClick: event => { if (event.target === event.currentTarget) props.onClose() } },
        h(
          'div',
          { className: 'dw-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          h('h2', null, title),
          h('p', { className: 'dw-muted' }, body),
          needsValue
            ? kind === 'reject'
              ? h('textarea', {
                  ref: input,
                  className: 'dw-input dw-dialog-input',
                  value,
                  placeholder: t('reasonPlaceholder'),
                  onChange: event => setValue(event.target.value),
                })
              : h('input', {
                  ref: input,
                  className: 'dw-input dw-dialog-input',
                  value,
                  placeholder: t('newPath'),
                  onChange: event => setValue(event.target.value),
                })
            : null,
          h(
            'div',
            { className: 'dw-modal-actions' },
            h('button', { type: 'button', className: 'dw-button', onClick: props.onClose }, t('close')),
            h('button', {
              type: 'button',
              className: 'dw-button ' + (kind === 'delete' ? 'dw-danger' : 'dw-primary'),
              onClick: () => props.onSubmit(value),
            }, kind === 'force' || kind === 'delete' ? t('confirm') : kind === 'reject' ? t('reject') : t('confirm')),
          ),
        ),
      )
    }

    // ------------------------------------------------------------------ helpers
    /**
     * Drop a leading frontmatter block, for previewing an edited document.
     * @param {string} text - page text.
     * @returns {string} the body.
     */
    function stripFrontmatter(text) {
      const value = String(text || '')
      if (!/^\uFEFF?---\r?\n/.test(value)) return value
      const lines = value.replace(/^\uFEFF/, '').split('\n')
      for (let index = 1; index < lines.length; index += 1) {
        if (lines[index].trim() === '---') {
          return lines.slice(index + 1).join('\n').replace(/^\n/, '')
        }
      }
      return value
    }

    /**
     * A line-oriented diff: unchanged, removed, and added lines.
     * @param {string} before - current page body.
     * @param {string} after - drafted body.
     * @returns {string} `pre`-ready text with +/- markers.
     */
    function diffLines(before, after) {
      const left = String(before || '').split('\n')
      const right = String(after || '').split('\n')
      if (left.length > 1200 || right.length > 1200) {
        return '-' + left.join('\n-') + '\n+' + right.join('\n+')
      }
      const rows = []
      let prefix = 0
      while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1
      let suffix = 0
      while (
        suffix < left.length - prefix
        && suffix < right.length - prefix
        && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
      ) suffix += 1
      const leftMiddle = left.slice(prefix, left.length - suffix)
      const rightMiddle = right.slice(prefix, right.length - suffix)
      for (let index = 0; index < prefix; index += 1) rows.push(' ' + left[index])
      if (leftMiddle.length === 0 && rightMiddle.length === 0) {
        return rows.length === 0 ? '' : rows.join('\n')
      }
      for (const line of leftMiddle) rows.push('-' + line)
      for (const line of rightMiddle) rows.push('+' + line)
      for (let index = left.length - suffix; index < left.length; index += 1) rows.push(' ' + left[index])
      return rows.join('\n')
    }

    /**
     * A deliberately plain Markdown preview: headings, lists, quotes, code, and
     * paragraphs, all as text — no renderer, no HTML injection.
     * @param {string} text - page document.
     * @returns {Array} React nodes.
     */
    function renderPreview(text) {
      const lines = String(text || '').split('\n')
      const nodes = []
      let paragraph = []
      let code = null
      const flushParagraph = () => {
        if (paragraph.length === 0) return
        nodes.push(h('p', { key: 'p' + nodes.length, className: 'dw-md-p' }, paragraph.join('\n')))
        paragraph = []
      }
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        if (line.trim().startsWith('```')) {
          if (code === null) {
            flushParagraph()
            code = []
          } else {
            nodes.push(h('pre', { key: 'c' + nodes.length, className: 'dw-md-code' }, code.join('\n')))
            code = null
          }
          continue
        }
        if (code !== null) {
          code.push(line)
          continue
        }
        if (line.trim() === '') {
          flushParagraph()
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          flushParagraph()
          nodes.push(h(
            'div',
            { key: 'h' + nodes.length, className: 'dw-md-h dw-md-h' + heading[1].length },
            heading[2],
          ))
          continue
        }
        if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
          flushParagraph()
          nodes.push(h('div', { key: 'l' + nodes.length, className: 'dw-md-li' }, line))
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          flushParagraph()
          nodes.push(h('div', { key: 'q' + nodes.length, className: 'dw-md-quote' }, line.replace(/^\s*>\s?/, '')))
          continue
        }
        paragraph.push(line)
      }
      flushParagraph()
      if (code !== null) nodes.push(h('pre', { key: 'c-end', className: 'dw-md-code' }, code.join('\n')))
      return nodes.length === 0 ? [h('p', { key: 'empty', className: 'dw-muted' }, '')] : nodes
    }

    /**
     * One small icon button.
     * @param {string} className - class list.
     * @param {string} label - accessible label and glyph.
     * @param {Function} onClick - handler.
     */
    function button(className, label, onClick) {
      return h('button', { type: 'button', className: className, 'aria-label': label, onClick }, label)
    }

    // -------------------------------------------------------------------- style
    const STYLES = `
.dw-root, .dw-root *, .dw-root *::before, .dw-root *::after { box-sizing: border-box; }
.dw-root { position: relative; flex: 1 1 auto; width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; color: var(--dsw-alias-label-primary, #1f2328); background: var(--dsw-alias-bg-base, transparent); font-size: 13px; line-height: 1.55; overflow: hidden; }
.dw-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 18px clamp(16px, 3vw, 28px) 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
[data-platform="darwin"] .dw-header { padding-top: calc(18px + var(--dsh-frame-top-clearance, 0px)); }
.dw-heading { display: flex; align-items: baseline; gap: 12px; min-width: 0; flex-wrap: wrap; }
.dw-heading h1 { margin: 0; font-size: 17px; font-weight: 600; line-height: 24px; }
.dw-subtitle { font-size: 12.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dw-segmented { display: inline-flex; padding: 2px; gap: 2px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
.dw-segment { font: inherit; font-size: 12.5px; line-height: 22px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary, #6b7280); cursor: pointer; }
.dw-segment-active { background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #1f2328); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.dw-segment:disabled { opacity: .45; cursor: not-allowed; }
.dw-chip { font-size: 11.5px; padding: 1px 9px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-secondary, #6b7280); white-space: nowrap; }
.dw-chip-quiet { opacity: .8; }
.dw-button { font: inherit; font-size: 12.5px; line-height: 26px; height: 28px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2328); cursor: pointer; white-space: nowrap; }
.dw-button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.dw-button:disabled { opacity: .5; cursor: not-allowed; }
.dw-primary { background: var(--dsw-alias-brand-primary, #2563eb); border-color: var(--dsw-alias-brand-primary, #2563eb); color: #fff; }
.dw-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary, #2563eb); filter: brightness(.95); }
.dw-danger { color: var(--dsw-alias-state-error-primary, #dc2626); border-color: var(--dsw-alias-state-error-primary, #dc2626); }
.dw-warn-button { color: var(--dsw-alias-state-warn-primary, #d97706); border-color: var(--dsw-alias-state-warn-primary, #d97706); }
.dw-select { font: inherit; font-size: 12.5px; height: 28px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; max-width: 320px; }
.dw-banner { display: flex; align-items: center; gap: 10px; margin: 8px clamp(16px, 3vw, 28px) 0; padding: 6px 10px; border-radius: 8px; font-size: 12.5px; }
.dw-banner-error { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 12%, transparent); color: var(--dsw-alias-state-error-primary, #dc2626); }
.dw-banner-ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #059669) 12%, transparent); color: var(--dsw-alias-state-success-primary, #059669); }
.dw-banner-close { margin-left: auto; border: 0; background: none; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; }
.dw-body { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 250px minmax(0, 1fr) 310px; background: var(--dsw-alias-bg-layer-1, #fff); }
.dw-tree { min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px; border-right: 1px solid var(--dsw-alias-border-l1, #e5e7eb); overflow: auto; background: var(--dsw-alias-bg-layer-1, #fff); }
.dw-treehead { display: flex; flex-direction: column; gap: 6px; margin-bottom: 2px; }
.dw-newpage { display: flex; align-items: center; justify-content: center; width: 100%; padding: 5px 8px;
  border: 1px dashed var(--dsw-alias-border-l2, #d6dae1); border-radius: 7px; background: var(--dsw-alias-bg-layer-2, #f8f9fb);
  color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; cursor: pointer; }
.dw-newpage:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary, #2563eb); color: var(--dsw-alias-brand-primary, #2563eb); }
.dw-newpage:disabled { opacity: .45; cursor: default; }
.dw-create { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px dashed var(--dsw-alias-border-l2, #d6dae1); border-radius: 8px; }
.dw-create-actions { display: flex; justify-content: flex-end; gap: 6px; }
.dw-main { min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; overflow: hidden; }
.dw-rail { min-width: 0; display: flex; flex-direction: column; gap: 14px; padding: 12px; border-left: 1px solid var(--dsw-alias-border-l1, #e5e7eb); overflow: auto; background: var(--dsw-alias-bg-layer-1, #fff); }
.dw-input { font: inherit; font-size: 13px; width: 100%; box-sizing: border-box; padding: 6px 9px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; }
.dw-search { flex: none; }
.dw-tree-meta { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-page-list, .dw-queue-list, .dw-backlinks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.dw-page-row { display: block; width: 100%; text-align: left; font: inherit; padding: 5px 7px; border: 0; border-radius: 8px; background: none; color: inherit; cursor: pointer; }
.dw-page-row:hover { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.dw-page-row-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #2563eb) 10%, transparent); }
.dw-page-title { display: block; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dw-page-sub { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dw-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--dsw-alias-label-secondary, #9ca3af); flex: none; display: inline-block; }
.dw-dot-stable { background: var(--dsw-alias-state-success-primary, #059669); }
.dw-dot-wip { background: var(--dsw-alias-state-warn-primary, #d97706); }
.dw-dot-deprecated { background: var(--dsw-alias-state-error-primary, #dc2626); }
.dw-badge { margin-left: 4px; font-size: 10px; padding: 0 6px; border-radius: 999px; line-height: 15px; }
.dw-badge-pending { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 16%, transparent); color: var(--dsw-alias-state-warn-primary, #d97706); }
.dw-badge-rejected { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 14%, transparent); color: var(--dsw-alias-state-error-primary, #dc2626); }
.dw-queue { margin-top: auto; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
.dw-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--dsw-alias-label-secondary, #6b7280); margin-bottom: 4px; }
.dw-link { font: inherit; font-size: 12px; padding: 1px 0; border: 0; background: none; color: var(--dsw-alias-brand-primary, #2563eb); text-align: left; cursor: pointer; }
.dw-link:hover { text-decoration: underline; }
.dw-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.dw-page-head h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.dw-page-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); margin-top: 2px; }
.dw-tabs { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.dw-spacer { flex: 1; min-width: 8px; }
.dw-tab { font: inherit; font-size: 12.5px; height: 26px; padding: 0 10px; border: 0; border-radius: 999px; background: none; color: var(--dsw-alias-label-secondary, #6b7280); cursor: pointer; }
.dw-tab:hover { background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.dw-tab-active { background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-primary, #1f2328); font-weight: 600; }
.dw-pane { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 10px; padding: 12px; background: var(--dsw-alias-bg-layer-1, #fff); }
.dw-editor { flex: 1; min-height: 0; resize: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.6; padding: 10px 12px; border-radius: 10px; }
.dw-editor[readonly] { background: var(--dsw-alias-bg-layer-2, #f6f7f9); }
.dw-hint { font-size: 11.5px; margin: 2px 0 0; }
.dw-muted { color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-warn { color: var(--dsw-alias-state-warn-primary, #d97706); font-size: 12px; }
.dw-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; word-break: break-all; }
.dw-section { display: flex; flex-direction: column; gap: 6px; }
.dw-section h3 { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 0; font-size: 12px; }
.dw-dl dt { color: var(--dsw-alias-label-secondary, #6b7280); }
.dw-dl dd { margin: 0; min-width: 0; }
.dw-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.dw-reason { margin-top: 6px; padding: 6px 8px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 10%, transparent); color: var(--dsw-alias-state-error-primary, #dc2626); font-size: 12px; }
.dw-note { margin-top: 8px; padding: 6px 8px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); font-size: 11.5px; }
.dw-note ul { margin: 4px 0 0; padding-left: 16px; }
.dw-draft-banner { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; padding: 6px 9px; border-radius: 8px; margin-bottom: 8px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); }
.dw-draft-pending { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 12%, transparent); }
.dw-draft-rejected { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 10%, transparent); }
.dw-diff-body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.dw-md-p { margin: 6px 0; white-space: pre-wrap; word-break: break-word; }
.dw-md-h { margin: 14px 0 4px; font-weight: 600; }
.dw-md-h1 { font-size: 18px; } .dw-md-h2 { font-size: 16px; } .dw-md-h3 { font-size: 15px; } .dw-md-h4, .dw-md-h5, .dw-md-h6 { font-size: 14px; }
.dw-md-li { margin: 2px 0 2px 4px; white-space: pre-wrap; }
.dw-md-quote { margin: 6px 0; padding-left: 10px; border-left: 3px solid var(--dsw-alias-border-l2, #d1d5db); color: var(--dsw-alias-label-secondary, #6b7280); white-space: pre-wrap; }
.dw-md-code { margin: 8px 0; padding: 8px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: auto; white-space: pre; }
.dw-overlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0,0,0,.45); }
.dw-modal { width: min(460px, 92vw); max-height: 88vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); box-shadow: 0 12px 32px rgba(0,0,0,.18); }
.dw-modal h2 { margin: 0; font-size: 16px; font-weight: 600; }
.dw-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.dw-dialog-input { min-height: 32px; }
textarea.dw-dialog-input { min-height: 84px; resize: vertical; }
.dw-busy { position: absolute; right: 16px; bottom: 12px; font-size: 11.5px; padding: 3px 10px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-secondary, #6b7280); }
@media (max-width: 1080px) {
  /* The review rail keeps its actions reachable: it drops below the editor
     instead of disappearing. */
  .dw-body { grid-template-columns: 250px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 240px); }
  .dw-rail { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb); flex-direction: row; flex-wrap: wrap; align-content: flex-start; gap: 16px; }
  .dw-rail .dw-section { min-width: 240px; flex: 1; }
}
`

    // -------------------------------------------------------------------- apply
    return {
      inject: ['slots', 'locale'],
      /**
       * Test-only handles: the module loader ignores extra keys, so the pure
       * display helpers can be exercised without mounting the panel.
       */
      __test: { diffLines, renderPreview, stripFrontmatter, WikiIcon, WikiPage },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-wiki: dictionaries')
        t = ctx.locale.bind(NS)

        ctx.slots.inject('conversation.view', () =>
          ctx.slots.register(
            {
              name: 'conversation.view',
              id: 'wiki',
              order: 60,
              label: () => t('panel'),
              locale: NS,
            },
            WikiPage,
          ),
        )
      },
    }
  },
})

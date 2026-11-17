/**
 * The main panel: page tree, editor/preview, and review rail.
 *
 * The panel owns every hook and every request. The three columns are pure
 * render functions from `tree.tsx` / `document.tsx` / `rail.tsx`, called
 * inline so one render pass carries the whole element tree.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'

import { apiGet, apiPost, errorText } from './api.ts'
import type { Query } from './api.ts'
import { Dialog } from './dialog.tsx'
import { renderDocument } from './document.tsx'
import { t } from './locale.ts'
import { renderRail } from './rail.tsx'
import { STYLES } from './styles.ts'
import { renderTree } from './tree.tsx'
import type {
  BootState,
  DialogState,
  Draft,
  DraftRow,
  DraftsBody,
  PageBody,
  PageDetail,
  PageRow,
  PagesBody,
  RequestBody,
  ScopeName,
  ScopeRow,
  TabName,
} from './types.ts'

export interface WikiPanelProps {
  sessionId?: string
}

/** One small icon button. */
function bannerButton(className: string, label: string, onClick: () => void): ReactElement {
  return (
    <button type="button" className={className} aria-label={label} onClick={onClick}>{label}</button>
  )
}

export function WikiPage({ sessionId }: WikiPanelProps = {}): ReactElement {
  const [boot, setBoot] = useState<BootState | null>(null)
  const session = sessionId === undefined || sessionId === null ? '' : String(sessionId)
  const [scope, setScope] = useState<ScopeName>('global')
  const [pages, setPages] = useState<PageRow[]>([])
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [selected, setSelected] = useState('')
  const [page, setPage] = useState<PageDetail | null>(null)
  const [tab, setTab] = useState<TabName>('source')
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [creatingPage, setCreatingPage] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const selectedRef = useRef('')
  selectedRef.current = selected

  const query = useMemo<Query>(() => ({ scope, session }), [scope, session])

  const loadState = useCallback(async () => {
    try {
      const body = await apiGet<BootState>('/state', { session })
      setBoot(body)
    } catch (failure) {
      setError(errorText(failure))
    }
  }, [session])

  const loadScope = useCallback(async () => {
    try {
      const [listBody, draftBody] = await Promise.all([
        apiGet<PagesBody>('/pages', query),
        apiGet<DraftsBody>('/drafts', query),
      ])
      const rows = listBody.pages || []
      setPages(rows)
      setDrafts(draftBody.drafts || [])
      // A page can disappear under the selection (deleted or renamed);
      // keeping it selected would only produce a 404 on the next read.
      setSelected(current => (current !== '' && !rows.some(row => row.path === current) ? '' : current))
    } catch (failure) {
      setError(errorText(failure))
    }
  }, [query])

  const loadPage = useCallback(async (path: string) => {
    if (!path) {
      setPage(null)
      setDraftText('')
      return
    }
    try {
      const body = await apiGet<PageBody>('/page', { scope, session, path })
      setPage(body)
      setEditing(false)
    } catch (failure) {
      setPage(null)
      setError(errorText(failure))
    }
  }, [scope, session])

  // The tab is session-scoped: the Host resolves the project directory from
  // `session`, so there is no project picker and no second render pass.
  useEffect(() => {
    loadState()
  }, [loadState])

  useEffect(() => {
    loadScope()
    // The scope/session pair is what `loadScope` closes over; re-running on
    // `query` identity would double the request on every render.
  }, [scope, session])

  useEffect(() => {
    loadPage(selected)
  }, [selected, scope, session])

  // A fresh tab should show a page, not an empty placeholder: the first
  // listed page is the natural entry point, and its draft tab wins when
  // there is something to review.
  useEffect(() => {
    if (selected !== '' || pages.length === 0) return
    const first = pages[0]
    if (first === undefined) return
    setSelected(first.path)
    setTab(drafts.some(row => row.path === first.path) ? 'draft' : 'source')
  }, [pages, drafts, selected])

  /**
   * Reload state, the page list, drafts, and the selected page.
   * @param nextPath - selection to keep or move to; `''` clears it,
   *   undefined keeps the current one.
   */
  const refresh = useCallback(async (nextPath?: string) => {
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
   * @param path - API path.
   * @param body - JSON body.
   * @param successKey - locale key for the success notice.
   * @param nextPath - how to refresh afterwards.
   */
  const mutate = useCallback(async (
    path: string,
    body: RequestBody,
    successKey: string,
    nextPath: string,
  ) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiPost(path, query, body)
      setNotice(t(successKey))
      await refresh(nextPath)
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }, [query, refresh])

  const draft: Draft | null = page && page.draft ? page.draft : null
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
    const map: Record<string, DraftRow> = {}
    for (const row of drafts) map[row.path] = row
    return map
  }, [drafts])
  const scopeRow: ScopeRow | undefined = useMemo(() => {
    if (!boot) return undefined
    return (boot.scopes || []).find(row => row.scope === scope)
  }, [boot, scope])
  const projectScope: ScopeRow | undefined = useMemo(() => {
    if (!boot) return undefined
    return (boot.scopes || []).find(row => row.scope === 'project')
  }, [boot])

  const submitDialog = async (value: string) => {
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
   * Create a page from the tree form. A page needs frontmatter, so the title is
   * written there and the body starts as a single heading.
   */
  const createPage = async () => {
    const path = newPath.trim().replace(/^\.?\/?/, '')
    if (path === '') {
      setError(t('needPath'))
      return
    }
    const title = newTitle.trim() === ''
      ? (path.replace(/\.md$/, '').split('/').pop() ?? path)
      : newTitle.trim()
    const content = `---\ntitle: ${title}\nstatus: wip\n---\n\n# ${title}\n`
    await mutate('/page', { path, content }, 'pageCreated', path.endsWith('.md') ? path : `${path}.md`)
    setCreatingPage(false)
    setNewPath('')
    setNewTitle('')
  }

  return (
    <div className="dw-root">
      <style>{STYLES}</style>
      {error !== ''
        ? (
            <div className="dw-banner dw-banner-error">
              {error}
              {bannerButton('dw-banner-close', '×', () => setError(''))}
            </div>
          )
        : null}
      {notice !== ''
        ? (
            <div className="dw-banner dw-banner-ok">
              {notice}
              {bannerButton('dw-banner-close', '×', () => setNotice(''))}
            </div>
          )
        : null}
      <div className="dw-body">
        {renderTree({
          scope,
          projectScope,
          scopeRow,
          queued,
          busy,
          filter,
          creatingPage,
          newPath,
          newTitle,
          pages,
          drafts,
          visible,
          draftByPage,
          selected,
          onScopeChange: next => {
            setScope(next)
            setSelected('')
            setEditing(false)
          },
          onRefresh: () => {
            refresh()
          },
          onFilter: setFilter,
          onToggleCreate: () => {
            setCreatingPage(open => !open)
          },
          onCloseCreate: () => {
            setCreatingPage(false)
          },
          onNewPath: setNewPath,
          onNewTitle: setNewTitle,
          onCreatePage: createPage,
          onSelectPage: (path, nextTab) => {
            setSelected(path)
            setTab(nextTab)
          },
        })}
        {renderDocument({
          selected,
          page,
          tab,
          editing,
          busy,
          draftText,
          draft,
          onTab: setTab,
          onEdit: () => {
            if (page === null) return
            setDraftText(page.text)
            setEditing(true)
            setTab('source')
          },
          onCancelEdit: () => {
            setEditing(false)
            loadPage(selected)
          },
          onSave: savePage,
          onDraftText: setDraftText,
        })}
        {renderRail({
          selected,
          page,
          draft,
          scopeRow,
          busy,
          onApprove: () => {
            setTab('source')
            mutate('/approve', { path: selected }, 'approved', selected)
          },
          onDialog: kind => {
            setDialog({ kind })
          },
          onOpenBacklink: path => {
            setSelected(path)
            setTab('source')
          },
        })}
      </div>
      {dialog === null ? null : <Dialog spec={dialog} onClose={() => setDialog(null)} onSubmit={submitDialog} />}
      {busy ? <div className="dw-busy">{t('busyApplying')}</div> : null}
    </div>
  )
}

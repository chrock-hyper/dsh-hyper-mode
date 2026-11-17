/**
 * The orders tab: a five-column kanban with a fixed inspector.
 *
 * Mounted on `conversation.view` (beside 岗位 and Wiki), it receives
 * `sessionId`, so the project scope is the conversation's working directory and
 * no folder picker is needed. Data comes only from `/hyper-org/api`.
 *
 * This panel **makes no gate decisions**: a drag, the stage menu and the drop
 * dialog all send the same stage to the Host (one
 * `PATCH /hyper-org/api/order/:id`, the same
 * `updateWithRules → store.saveOrder` path `org_order action=update` takes).
 * A 409/400 is shown verbatim and the card stays where it was — no optimistic
 * move, no client-side block for a missing acceptance list, a full board or a
 * `done` target. `sign.blockers` and `create.notes` are computed by the Host
 * and only rendered here. A disabled button is UX; the real refusal is the
 * Host's.
 *
 * Three rules the panel keeps (same pitfalls as the roles panel):
 * 1. no `window.prompt` / `confirm` / `alert` — Electron has no prompt;
 * 2. every failure lands on a visible line, never a silent no-op;
 * 3. all copy goes through the locale, all styling through `--dsw-alias-*`.
 */
import type { DragEvent, ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'

import type { SidebarService } from './address.ts'
import { openInDsh } from './address.ts'
import { API, call, errorCodeOf, queryString, stageRequest } from './api.ts'
import {
  archiveOf,
  columnsOf,
  editFrom,
  emptyCreate,
  messageOf,
  noAcceptanceOf,
  overdueOf,
  pickFirst,
} from './format.ts'
import { t } from './locale.ts'
import { STYLES } from './styles.ts'
import type {
  ArtifactEntry,
  BoardState,
  CreateForm,
  DropState,
  EditForm,
  OrderDoc,
} from './types.ts'
import { Board } from './components/board.tsx'
import { Inspector } from './components/inspector.tsx'
import { CreateModal, DropModal } from './components/modals.tsx'
import { Banner, Button, Stat } from './components/primitives.tsx'

/** The members of the Client context this panel touches. */
export interface Services {
  get(name: string): unknown
}

/** The client context, captured in `apply`, so services are resolved lazily. */
let services: Services | undefined

/**
 * Bind the Client context captured by the plugin entry.
 * @param next - the context `apply` received.
 */
export function bindServices(next: Services): void {
  services = next
}

/** Props the slot framework passes to a conversation view. */
export interface OrdersTabProps {
  sessionId?: string | null
}

/** The create route's answer: the new card plus the Host's downgrade notes. */
interface CreateResult {
  order: { id: string }
  notes?: string[]
}

/**
 * The tab component: one board per conversation, scoped to its directory.
 * @param props - the session id from `conversation.view`.
 * @returns the `ho-root` element.
 */
export function OrdersTab({ sessionId }: OrdersTabProps): ReactElement {
  const session = sessionId === undefined || sessionId === null ? '' : String(sessionId)

  const [state, setState] = useState<BoardState | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [doc, setDoc] = useState<OrderDoc | null>(null)
  const [loading, setLoading] = useState(false)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showProblems, setShowProblems] = useState(false)
  const [showAllLog, setShowAllLog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateForm>(emptyCreate())
  const [edit, setEdit] = useState<EditForm | null>(null)
  const [signNote, setSignNote] = useState('')
  const [sendBackArmed, setSendBackArmed] = useState(false)
  const [drop, setDrop] = useState<DropState | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [checkerOpen, setCheckerOpen] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [bounce, setBounce] = useState<string | null>(null)

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
  const flash = useCallback((text: string) => {
    setNotice(text)
    setError('')
  }, [])

  /** Show a failure line and clear the success line. */
  const fail = useCallback((failure: unknown) => {
    setError(`${t('error')}: ${messageOf(failure)}`)
    setNotice('')
  }, [])

  /** Resolve DSH's sidebar service lazily: the GUI may not have it composed. */
  const sidebarRight = (): SidebarService | undefined => {
    try {
      if (services === undefined || typeof services.get !== 'function') return undefined
      const value = services.get('sidebarRight')
      return value === undefined || value === null ? undefined : value as SidebarService
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
      const body = await call<BoardState>(`${API}/state${queryString({ session })}`)
      setState(body)
    } catch (failure) {
      fail(failure)
    } finally {
      setLoading(false)
    }
  }, [session, fail])

  const loadOrder = useCallback(async (id: string | null | undefined): Promise<OrderDoc | undefined> => {
    if (id === null || id === undefined || id === '') return undefined
    setLoading(true)
    try {
      const body = await call<OrderDoc>(`${API}/order${queryString({ session, id })}`)
      setDoc(body)
      setEdit(editFrom(body.order))
      return body
    } catch (failure) {
      setDoc(null)
      setEdit(null)
      if (errorCodeOf(failure) === 'order_not_found') setSelected(null)
      fail(failure)
      return undefined
    } finally {
      setLoading(false)
    }
  }, [session, fail])

  /** Write, then re-read the board and the order from disk (no local stage edits). */
  const afterWrite = useCallback(async (id?: string | null) => {
    await loadState()
    if (id !== null && id !== undefined && id !== '') await loadOrder(String(id))
  }, [loadState, loadOrder])

  const openOrder = useCallback(async (id: string | null | undefined) => {
    if (id === null || id === undefined || id === '') return
    setSelected(String(id))
    setShowAllLog(false)
    setSendBackArmed(false)
    setDrop(null)
    setSignNote('')
    await loadOrder(String(id))
  }, [loadOrder])

  const requestStage = useCallback(async (id: string, target: string, note?: string) => {
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
      if (errorCodeOf(failure) === 'order_not_found') {
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
      if (errorCodeOf(failure) === 'order_not_found') {
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

  const sign = useCallback(async (approve: boolean) => {
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
      if (errorCodeOf(failure) === 'order_not_found') {
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
      const body = await call<CreateResult>(`${API}/order${queryString({ session })}`, {
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

  const openArtifact = useCallback((entry: ArtifactEntry) => {
    const sidebar = sidebarRight()
    const hasPath = typeof entry.absolutePath === 'string' && entry.absolutePath !== ''
    if (!openInDsh(sidebar, session, entry.absolutePath)) {
      fail(new Error(sidebar === undefined
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
  const dragStart = (id: string) => (event: DragEvent<HTMLElement>) => {
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

  const dragOverZone = (zone: string) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragOver(zone)
    try {
      event.dataTransfer.dropEffect = 'move'
    } catch {
      // Same as above: nothing to do without a dataTransfer.
    }
  }

  const dragLeaveZone = (zone: string) => () => {
    setDragOver((current) => (current === zone ? null : current))
  }

  const dropZone = (zone: string) => (event: DragEvent<HTMLElement>) => {
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
    if (id === '') return
    void requestStage(id, zone)
  }

  // ---------------------------------------------------------------- render
  const banners: ReactElement[] = []
  if (error !== '') {
    banners.push(
      <Banner
        key="error"
        kind="error"
        text={error}
        busy={busy}
        onClose={() => setError('')}
        onRetry={async () => {
          setError('')
          setNotice('')
          await loadState()
          if (selected !== null) await loadOrder(selected)
        }}
      />,
    )
  }
  if (notice !== '') {
    banners.push(
      <Banner key="ok" kind="ok" text={notice} busy={busy} onClose={() => setNotice('')} />,
    )
  }
  if (noProject) {
    banners.push(
      <div key="no-project" className="ho-banner ho-banner-warn">
        <span className="ho-banner-text">{`${t('noProject')} · ${t('noProjectScope')}`}</span>
      </div>,
    )
  }

  const topBar = (
    <header className="ho-top">
      <div className="ho-top-title" title={state === null ? undefined : state.projectRoot || state.globalDir}>
        <span>{t('boardTitle')}</span>
        <span className="ho-top-count">{` (${orders.length})`}</span>
      </div>
      <div className="ho-stats">
        <Stat
          label={t('wipLabel')}
          value={`${occupied}/${wipLimit}`}
          tone={atWip ? 'warn' : (occupied === 0 ? 'ok' : undefined)}
        />
        <Stat
          label={t('overdueLabel')}
          value={overdue.length}
          tone={overdue.length === 0 ? undefined : 'danger'}
        />
        <Stat
          label={t('noAccLabel')}
          value={noAcceptance.length}
          tone={noAcceptance.length === 0 ? undefined : 'warn'}
        />
        {overWip ? (
          <span className="ho-stat ho-stat-warn" title={t('wipOver')}>{t('wipOver')}</span>
        ) : null}
      </div>
      <div className="ho-top-actions">
        <span className="ho-faint ho-drag-hint">{t('dragHint')}</span>
        <Button
          label={t('refresh')}
          onClick={async () => {
            setError('')
            setNotice('')
            await loadState()
            if (selected !== null) await loadOrder(selected)
          }}
          ghost
          disabled={busy || session === ''}
        />
        <Button
          label={`＋ ${t('newOrder')}`}
          onClick={() => setCreating(true)}
          primary
          disabled={busy || state === null || session === ''}
        />
      </div>
    </header>
  )

  const problems = state !== null && Array.isArray(state.problems) ? state.problems : []
  const problemsBar = problems.length > 0
    ? (
      <div className="ho-problems">
        <button
          type="button"
          className="ho-problems-head"
          onClick={() => setShowProblems(!showProblems)}
        >
          {`${showProblems ? '▾' : '▸'} ${problems.length} ${t('problems')}`}
        </button>
        {showProblems
          ? (
            <ul className="ho-problem-list">
              {problems.map((problem, index) => (
                <li key={`${problem.path}-${index}`} className="ho-problem-item">
                  {`${problem.path} — ${problem.message}`}
                </li>
              ))}
            </ul>
          )
          : null}
      </div>
    )
    : null

  const emptyBanner = state !== null && orders.length === 0 && session !== ''
    ? (
      <div className="ho-banner ho-banner-info">
        <span className="ho-banner-text">{`${t('emptyBoard')} · ${t('emptyBoardHint')}`}</span>
        <Button
          label={`＋ ${t('newOrder')}`}
          onClick={() => setCreating(true)}
          primary
          disabled={busy}
        />
      </div>
    )
    : null

  const board = (
    <Board
      columns={columns}
      archive={archive}
      dragOver={dragOver}
      occupied={occupied}
      wipLimit={wipLimit}
      atWip={atWip}
      overdueCount={overdue.length}
      emptyText={state === null ? (loading ? t('loading') : t('loadFailed')) : '—'}
      archiveOpen={archiveOpen}
      onToggleArchive={() => setArchiveOpen(!archiveOpen)}
      now={now}
      selectedId={selected}
      bounceId={bounce}
      dragId={dragId}
      onOpen={openOrder}
      onDragStart={dragStart}
      onDragEnd={dragEnd}
      onDragOver={dragOverZone}
      onDragLeave={dragLeaveZone}
      onDrop={dropZone}
    />
  )

  const checker = (
    <Inspector
      open={checkerOpen}
      session={session}
      state={state}
      loading={loading}
      doc={doc}
      edit={edit}
      roles={roles}
      busy={busy}
      signNote={signNote}
      sendBackArmed={sendBackArmed}
      showAllLog={showAllLog}
      getSidebar={sidebarRight}
      onToggle={setCheckerOpen}
      onShowAllLog={() => setShowAllLog(true)}
      onSignNote={setSignNote}
      onSendBackArmed={setSendBackArmed}
      onEdit={setEdit}
      onSign={sign}
      onSaveDetails={saveDetails}
      onStageChange={(stage: string) => {
        if (selected !== null) void requestStage(selected, stage)
      }}
      onOpenArtifact={openArtifact}
    />
  )

  const body = session === ''
    ? (
      <div className="ho-empty-session">
        <p className="ho-muted">{t('noSession')}</p>
      </div>
    )
    : <div className="ho-main">{board}{checker}</div>

  const createModal = creating
    ? (
      <CreateModal
        form={form}
        roles={roles}
        writing={writing}
        noProject={noProject}
        onForm={setForm}
        onCreate={create}
        onClose={() => setCreating(false)}
      />
    )
    : null

  const dropModal = drop !== null
    ? (
      <DropModal
        drop={drop}
        writing={writing}
        onReason={(reason) => setDrop({ ...drop, reason, error: '' })}
        onCancel={() => setDrop(null)}
        onConfirm={confirmDrop}
      />
    )
    : null

  return (
    <div className="ho-root">
      <style>{STYLES}</style>
      {banners.length === 0 ? null : <div className="ho-banners">{banners}</div>}
      {emptyBanner}
      {topBar}
      {problemsBar}
      {body}
      {createModal}
      {dropModal}
    </div>
  )
}

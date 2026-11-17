/**
 * The fixed inspector beside the board: six read items, the sign-off section
 * and the detail form.
 *
 * Presentational only — the panel owns the state and builds every request. The
 * gates are the Host's: this region renders `doc.sign.blockers` as given,
 * disables a button for UX, and never decides on its own that a sign may pass.
 */
import type { ChangeEvent, ReactElement } from 'react'

import type { SidebarService } from '../address.ts'
import { sessionFileAddress } from '../address.ts'
import type { BoardState, EditForm, OrderDoc, OrderDocOrder, RoleRow } from '../types.ts'
import type { ArtifactEntry } from '../types.ts'
import { formatLogTime, kindKey, LOG_SHOWN, stageKey, stageSubKey, WRITABLE_STAGES } from '../format.ts'
import { t } from '../locale.ts'
import { Button, Section } from './primitives.tsx'

/** The inspector's collapsed rail versus its open body. */
export interface InspectorProps {
  open: boolean
  session: string
  state: BoardState | null
  loading: boolean
  doc: OrderDoc | null
  edit: EditForm | null
  roles: RoleRow[]
  busy: boolean
  signNote: string
  sendBackArmed: boolean
  showAllLog: boolean
  /** Resolve `ctx.get('sidebarRight')` lazily, only when a list is rendered. */
  getSidebar: () => SidebarService | undefined
  onToggle: (open: boolean) => void
  onShowAllLog: () => void
  onSignNote: (note: string) => void
  onSendBackArmed: (armed: boolean) => void
  onEdit: (edit: EditForm) => void
  onSign: (approve: boolean) => void
  onSaveDetails: () => void
  onStageChange: (stage: string) => void
  onOpenArtifact: (entry: ArtifactEntry) => void
}

/** What one {@link ArtifactList} renders. */
export interface ArtifactListProps {
  artifacts: ArtifactEntry[]
  session: string
  getSidebar: () => SidebarService | undefined
  busy: boolean
  onOpen: (entry: ArtifactEntry) => void
}

/**
 * The declared deliverables.
 *
 * The panel does not read files: each usable row shows the exact
 * `dsh-resource://` address it will open, and the click hands it to DSH's own
 * right sidebar. A row with no absolute path, or a GUI with no preview
 * service, is disabled and says why.
 * @param props - artifacts, session, the preview service and the click handler.
 * @returns the artifact list, or the empty line.
 */
export function ArtifactList({ artifacts, session, getSidebar, busy, onOpen }: ArtifactListProps): ReactElement {
  if (artifacts.length === 0) return <p className="ho-muted">{t('noArtifacts')}</p>
  const sidebar = getSidebar()
  const usable = (entry: ArtifactEntry): boolean => entry.kind === 'file'
    && typeof entry.absolutePath === 'string'
    && entry.absolutePath !== ''
  const serviceMissing = sidebar === undefined || typeof sidebar.openResource !== 'function'
  return (
    <ul className="ho-arts">
      {artifacts.map((entry) => {
        const address = usable(entry) ? sessionFileAddress(session, entry.absolutePath) : undefined
        const disabledReason = usable(entry) ? undefined : t('noAbsolutePath')
        return (
          <li key={entry.path} className={`ho-art ho-art-${entry.kind}`}>
            <div className="ho-art-top">
              <span className="ho-art-path" title={entry.path}>{entry.path}</span>
              <span className="ho-art-kind">{t(kindKey(entry.kind))}</span>
            </div>
            <button
              type="button"
              className="ho-art-open"
              data-address={address}
              title={address === undefined ? disabledReason : address}
              disabled={address === undefined || serviceMissing || busy}
              onClick={() => onOpen(entry)}
            >
              {`${t('openInDsh')} ↗`}
            </button>
            {address === undefined || serviceMissing
              ? <span className="ho-art-hint">{serviceMissing ? t('noPreviewService') : disabledReason}</span>
              : null}
          </li>
        )
      })}
    </ul>
  )
}

/** What one {@link LogBlock} renders. */
export interface LogBlockProps {
  order: OrderDocOrder
  showAllLog: boolean
  onShowAllLog: () => void
}

/**
 * The full log, newest first, folded at {@link LOG_SHOWN} entries.
 * @param props - the order and the fold state.
 * @returns the log block.
 */
export function LogBlock({ order, showAllLog, onShowAllLog }: LogBlockProps): ReactElement {
  const entries = (Array.isArray(order.log) ? order.log : []).slice().reverse()
  const shown = showAllLog ? entries : entries.slice(0, LOG_SHOWN)
  return (
    <div className="ho-log">
      {entries.length === 0
        ? <p className="ho-muted">{'—'}</p>
        : (
          <div className="ho-log-list">
            {shown.map((entry, index) => (
              <div key={`${entry.at}-${index}`} className="ho-log-row">
                <div className="ho-log-meta">{`${formatLogTime(entry.at)} · ${entry.by}`}</div>
                <p className="ho-log-note">{entry.note}</p>
              </div>
            ))}
          </div>
        )}
      {entries.length > LOG_SHOWN && !showAllLog
        ? (
          <button type="button" className="ho-link" onClick={onShowAllLog}>
            {`${t('showAll')}（${entries.length}）`}
          </button>
        )
        : null}
      <div className="ho-log-count">{t('logCount').replace('{n}', String(entries.length))}</div>
    </div>
  )
}

/** What the sign-off section renders. */
export interface SignSectionProps {
  order: OrderDocOrder
  doc: OrderDoc
  state: BoardState | null
  busy: boolean
  signNote: string
  sendBackArmed: boolean
  onSignNote: (note: string) => void
  onSign: (approve: boolean) => void
  onSendBackArmed: (armed: boolean) => void
}

/**
 * The sign-off / send-back card. Only `review` orders get the form; every other
 * stage gets the one-line explanation of why.
 * @param props - order, doc, actor state and the two actions.
 * @returns the `ho-cardpanel` section.
 */
export function SignSection({
  order,
  doc,
  state,
  busy,
  signNote,
  sendBackArmed,
  onSignNote,
  onSign,
  onSendBackArmed,
}: SignSectionProps): ReactElement {
  if (order.stage !== 'review') {
    return (
      <section className="ho-cardpanel">
        <h3 className="ho-panel-title">{t('signSection')}</h3>
        <p className="ho-muted">{`${t('onlyReview')} · ${t('onlyReviewHint')}`}</p>
      </section>
    )
  }
  const blockers = doc.sign !== undefined && Array.isArray(doc.sign.blockers) ? doc.sign.blockers : []
  const confirmed = state === null || state.actor === undefined || state.actor.confirmed !== false
  const label = state !== null && state.actor !== undefined ? state.actor.label : 'lead'
  const noteMissing = signNote.trim() === ''
  const approveBlocked = blockers.length > 0 || noteMissing || !confirmed
  // A send-back only needs a note and a signer who is not the DRI; the other
  // blockers describe signing off.
  const sendBackBlocked = noteMissing || !confirmed || blockers.some((entry) => entry.code === 'self_sign')
  return (
    <section className="ho-cardpanel">
      <h3 className="ho-panel-title">{t('signSection')}</h3>
      <p className="ho-muted">{`${t('signAs')}：${label}`}</p>
      {confirmed ? null : <p className="ho-warnbox">{t('cannotConfirm')}</p>}
      {blockers.length === 0
        ? null
        : (
          <ul className="ho-blockers">
            {blockers.map((entry) => <li key={entry.code} className="ho-blocker">{entry.message}</li>)}
          </ul>
        )}
      <textarea
        className="ho-textarea ho-sign-note"
        placeholder={t('signNote')}
        value={signNote}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onSignNote(event.target.value)}
      />
      {noteMissing ? <p className="ho-hint">{t('signNoteRequired')}</p> : null}
      <div className="ho-actions">
        <Button
          label={busy ? t('saving') : t('signOff')}
          onClick={() => onSign(true)}
          primary
          disabled={busy || approveBlocked}
        />
        {sendBackArmed
          ? (
            <Button
              label={t('sendBackConfirm')}
              onClick={() => onSign(false)}
              danger
              disabled={busy || sendBackBlocked}
            />
          )
          : (
            <Button
              label={t('sendBack')}
              onClick={() => onSendBackArmed(true)}
              danger
              disabled={busy || sendBackBlocked}
            />
          )}
        {sendBackArmed ? <Button label={t('cancel')} onClick={() => onSendBackArmed(false)} ghost /> : null}
      </div>
    </section>
  )
}

/** What the detail form renders. */
export interface EditSectionProps {
  order: OrderDocOrder
  edit: EditForm
  roles: RoleRow[]
  busy: boolean
  onStageChange: (stage: string) => void
  onEdit: (edit: EditForm) => void
  onSave: () => void
}

/**
 * Stage plus the editable details. `done` stays selectable on purpose: the
 * Host, not the panel, refuses that move.
 * @param props - order, form values, roles and the three callbacks.
 * @returns the edit `ho-cardpanel` section.
 */
export function EditSection({
  order,
  edit,
  roles,
  busy,
  onStageChange,
  onEdit,
  onSave,
}: EditSectionProps): ReactElement {
  const stageOptions = [
    ...WRITABLE_STAGES.map((stage) => (
      <option key={stage} value={stage}>
        {stage === 'dropped' ? `${t(stageKey(stage))}（${t('noteRequiredDrop')}）` : t(stageKey(stage))}
      </option>
    )),
    <option key="done" value="done">{`${t(stageKey('done'))}（${t('doneLocked')}）`}</option>,
  ]
  return (
    <section className="ho-cardpanel">
      <h3 className="ho-panel-title">{t('editSection')}</h3>
      <p className="ho-hint">{t('stageChangeHint')}</p>
      {order.stage === 'done' ? <p className="ho-hint">{t('doneFrozen')}</p> : null}
      <label className="ho-field">
        <span className="ho-label">{t('stage')}</span>
        <select
          className="ho-input"
          data-stage-select="true"
          value={order.stage}
          disabled={busy}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onStageChange(event.target.value)}
        >
          {stageOptions}
        </select>
      </label>
      <label className="ho-field">
        <span className="ho-label">{t('dri')}</span>
        <select
          className="ho-input"
          value={edit.dri}
          disabled={busy}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onEdit({ ...edit, dri: event.target.value })}
        >
          <option key="unassigned" value="">{t('unassigned')}</option>
          {roles.map((role) => (
            <option key={`${role.scope}:${role.id}`} value={role.id}>{`${role.title}（${role.id}）`}</option>
          ))}
        </select>
        {roles.length === 0 ? <span className="ho-hint">{t('noRoles')}</span> : null}
      </label>
      <label className="ho-field">
        <span className="ho-label">{`${t('acceptance')} · ${t('acceptanceHint')}`}</span>
        <textarea
          className="ho-textarea"
          value={edit.acceptance}
          disabled={busy}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onEdit({ ...edit, acceptance: event.target.value })}
        />
      </label>
      <label className="ho-field">
        <span className="ho-label">{`${t('artifacts')} · ${t('artifactsHint')}`}</span>
        <textarea
          className="ho-textarea ho-artifacts-input"
          value={edit.artifacts}
          placeholder={t('artifactsHint')}
          disabled={busy}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onEdit({ ...edit, artifacts: event.target.value })}
        />
      </label>
      <label className="ho-field">
        <span className="ho-label">{t('noteField')}</span>
        <input
          className="ho-input"
          value={edit.note}
          disabled={busy}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onEdit({ ...edit, note: event.target.value })}
        />
      </label>
      <div className="ho-actions">
        <Button label={busy ? t('saving') : t('save')} onClick={onSave} primary disabled={busy} />
      </div>
    </section>
  )
}

/**
 * The inspector rail and, when open, the selected order's card.
 * @param props - selection, order, form state and every callback the body needs.
 * @returns the `ho-checker` aside.
 */
export function Inspector(props: InspectorProps): ReactElement {
  const {
    open,
    session,
    state,
    loading,
    doc,
    edit,
    roles,
    busy,
    signNote,
    sendBackArmed,
    showAllLog,
    getSidebar,
    onToggle,
    onShowAllLog,
    onSignNote,
    onSendBackArmed,
    onEdit,
    onSign,
    onSaveDetails,
    onStageChange,
    onOpenArtifact,
  } = props

  if (!open) {
    return (
      <aside className="ho-checker ho-checker-closed" data-checker="closed">
        <Button label={'⟨'} onClick={() => onToggle(true)} ghost title={t('checkerExpand')} />
        <span className="ho-checker-closed-label">{t('checkerTitle')}</span>
      </aside>
    )
  }

  const order = doc === null ? null : doc.order
  const sizeText = order === null ? '' : `${order.size} · ${t(`size${order.size}`)}`
  const driText = order === null
    ? ''
    : order.dri === undefined || order.dri === ''
      ? t('unassigned')
      : `${doc?.driTitle || order.dri}（${order.dri}）`

  return (
    <aside className="ho-checker" data-checker="open">
      <div className="ho-checker-head">
        <span className="ho-checker-title">{t('checkerTitle')}</span>
        <Button label={'⟩'} onClick={() => onToggle(false)} ghost title={t('checkerCollapse')} />
      </div>
      {doc === null || order === null
        ? (
          <div className="ho-placeholder">
            <span className="ho-placeholder-mark">{'◇'}</span>
            <b>{state === null && loading ? t('loading') : t('selectOrder')}</b>
            <span className="ho-placeholder-sub">{t('selectOrderHint')}</span>
          </div>
        )
        : (
          <div className="ho-checker-body">
            <div className="ho-ins-head">
              <h2 className="ho-ins-title" title={order.title}>{order.title}</h2>
              <div className="ho-ins-meta">
                <span className="ho-mono">{order.id}</span>
                <span>{'·'}</span>
                <span>{doc.scope === 'project' ? t('scopeProject') : t('scopeGlobal')}</span>
                <span>{'·'}</span>
                <span>{doc.age}</span>
              </div>
            </div>
            <Section label={t('stage')}>
              <div className="ho-stage-row">
                <span className={`ho-stage ho-stage-${order.stage}`}>{order.stage}</span>
                <span className="ho-muted">{` · ${t(stageSubKey(order.stage))}`}</span>
              </div>
              {order.stage === 'done' ? <p className="ho-hint">{t('stageDoneNote')}</p> : null}
            </Section>
            <Section label={t('size')}>
              <span className="ho-muted">{sizeText}</span>
            </Section>
            <Section label={t('dri')}>
              <span>{driText}</span>
            </Section>
            <Section label={t('acceptance')}>
              {(order.acceptance || []).length === 0
                ? <p className="ho-warnbox">{t('noAcceptance')}</p>
                : (
                  <ol className="ho-acceptance">
                    {(order.acceptance || []).map((entry, index) => <li key={index}>{entry}</li>)}
                  </ol>
                )}
            </Section>
            <Section label={t('artifacts')}>
              <ArtifactList
                artifacts={Array.isArray(doc.artifacts) ? doc.artifacts : []}
                session={session}
                getSidebar={getSidebar}
                busy={busy}
                onOpen={onOpenArtifact}
              />
            </Section>
            <Section label={t('log')}>
              <LogBlock order={order} showAllLog={showAllLog} onShowAllLog={onShowAllLog} />
            </Section>
            <SignSection
              order={order}
              doc={doc}
              state={state}
              busy={busy}
              signNote={signNote}
              sendBackArmed={sendBackArmed}
              onSignNote={onSignNote}
              onSign={onSign}
              onSendBackArmed={onSendBackArmed}
            />
            {edit === null
              ? null
              : (
                <EditSection
                  order={order}
                  edit={edit}
                  roles={roles}
                  busy={busy}
                  onStageChange={onStageChange}
                  onEdit={onEdit}
                  onSave={onSaveDetails}
                />
              )}
          </div>
        )}
    </aside>
  )
}

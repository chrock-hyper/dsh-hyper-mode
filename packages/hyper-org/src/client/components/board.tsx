/**
 * The board region: five fixed columns, the folded archive strip, and the card
 * every one of them renders.
 *
 * Presentational only. The panel owns the state and the single PATCH; this
 * module carries no gate of its own — a drop hands its zone back to the caller,
 * `done` stays a normal column, and `dropped` stays a folded strip so a
 * cancelled order never disappears from the board.
 */
import type { DragEvent, ReactElement } from 'react'

import { hoursSince, OVERDUE_HOURS, stageKey, stageSubKey } from '../format.ts'
import { t } from '../locale.ts'
import type { BoardColumnEntry, BoardStage, OrderRow } from '../types.ts'

/** Row-level state every card host shares. */
export interface CardHostProps {
  now: string
  selectedId: string | null
  bounceId: string | null
  dragId: string | null
  onOpen: (id: string) => void
  onDragStart: (id: string) => (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

/** A handler a column or the archive strip builds for one drop zone. */
export type ZoneDropHandler = (zone: string) => (event: DragEvent<HTMLElement>) => void

/** A leave handler; the zone is passed so only the active one clears. */
export type ZoneLeaveHandler = (zone: string) => () => void

/**
 * The display-only warning chips under one card's meta line.
 * @param props - the row and the board's `now`.
 * @returns a chip row, or null when the card has nothing to warn about.
 */
export function CardWarnings({ row, now }: { row: OrderRow; now: string }): ReactElement | null {
  const chips: ReactElement[] = []
  if ((row.size === 'M' || row.size === 'L') && Number(row.acceptanceCount) === 0
    && row.stage !== 'done' && row.stage !== 'dropped') {
    chips.push(
      <span key="noacc" className="ho-chip ho-chip-warn" title={t('noAcceptance')}>{t('noAccLabel')}</span>,
    )
  }
  if (row.stage === 'blocked') {
    chips.push(<span key="blocked" className="ho-chip ho-chip-danger">{t('stageBlockedSub')}</span>)
  }
  if (row.stage === 'review' && hoursSince(row.updatedAt, now) >= OVERDUE_HOURS) {
    const days = Math.max(1, Math.floor(hoursSince(row.updatedAt, now) / 24))
    chips.push(
      <span key="overdue" className="ho-chip ho-chip-danger">
        {`${t('overdueLabel')} ${t('overdueDays').replace('{n}', String(days))}`}
      </span>,
    )
  }
  return chips.length === 0 ? null : <div className="ho-card-warns">{chips}</div>
}

/** What one {@link OrderCard} renders. */
export interface OrderCardProps {
  row: OrderRow
  now: string
  selected: boolean
  bounce: boolean
  dragging: boolean
  /** The archive's small variant: no footer counters. */
  compact?: boolean
  /** `false` for the archive, whose cards are click-only. */
  draggable?: boolean
  onOpen: () => void
  onDragStart?: (event: DragEvent<HTMLElement>) => void
  onDragEnd?: () => void
}

/**
 * One order card.
 *
 * `draggable` is the string `'true'` the hand-written module emitted, and it is
 * absent (not `false`) on a card that must not drag, so the DOM stays identical
 * to what the running app already renders.
 * @param props - row, selection flags and handlers.
 * @returns the card element.
 */
export function OrderCard({
  row,
  now,
  selected,
  bounce,
  dragging,
  compact,
  draggable,
  onOpen,
  onDragStart,
  onDragEnd,
}: OrderCardProps): ReactElement {
  const canDrag = draggable !== false
  const className = [
    'ho-card',
    compact === true ? 'ho-card-compact' : '',
    selected ? 'ho-card-on' : '',
    bounce ? 'ho-card-bounce' : '',
    dragging ? 'ho-card-dragging' : '',
  ].filter((entry) => entry !== '').join(' ')
  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      title={`${row.title} · ${row.id}`}
      data-order-id={row.id}
      draggable={canDrag ? 'true' : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
    >
      <div className="ho-card-title">{row.title}</div>
      <div className="ho-card-meta">
        <span className="ho-chip ho-chip-size">{row.size}</span>
        <span className="ho-card-dri">{row.driTitle || row.dri || t('unassigned')}</span>
        <span className="ho-faint">{'·'}</span>
        <span className="ho-faint">{row.age}</span>
        {row.scope === 'global' ? <span className="ho-chip ho-chip-global">{t('globalBadge')}</span> : null}
      </div>
      <CardWarnings row={row} now={now} />
      {compact === true
        ? null
        : (
          <div className="ho-card-foot">
            <span className="ho-card-foot-main">
              {`${t('countAcceptance')} ${Number(row.acceptanceCount) || 0} · ${t('countArtifacts')} ${Number(row.artifactCount) || 0}`}
            </span>
            <span className="ho-card-foot-side">{`${t('countLog')} ${Number(row.logCount) || 0}`}</span>
          </div>
        )}
      {row.stage === 'done' ? <div className="ho-card-signed">{`✓ ${t('signed')}`}</div> : null}
    </div>
  )
}

/** The footer reading one column carries. */
export interface ColumnFootProps {
  stage: BoardStage
  occupied: number
  wipLimit: number
  atWip: boolean
  overdueCount: number
}

/**
 * One column's bottom strip: what the column means, plus its live number.
 * @param props - stage and the readings it shows.
 * @returns the footer element.
 */
function ColumnFoot({ stage, occupied, wipLimit, atWip, overdueCount }: ColumnFootProps): ReactElement {
  if (stage === 'intake') {
    return (
      <div className="ho-col-foot">
        <span>{t('colIntakeFoot')}</span>
        <span>{t('colIntakeFootRight')}</span>
      </div>
    )
  }
  if (stage === 'active') {
    return (
      <div className="ho-col-foot">
        <span>{`${t('wipLabel')} ${occupied}/${wipLimit}`}</span>
        <span>{atWip ? t('colActiveFootRightFull') : t('colActiveFootRightFree')}</span>
      </div>
    )
  }
  if (stage === 'review') {
    return (
      <div className="ho-col-foot">
        <span>{`${t('overdueLabel')} ${overdueCount}`}</span>
        <span>{t('colReviewFoot')}</span>
      </div>
    )
  }
  if (stage === 'blocked') {
    return (
      <div className="ho-col-foot">
        <span>{t('colBlockedFoot')}</span>
        <span>{t('colBlockedFootRight')}</span>
      </div>
    )
  }
  return (
    <div className="ho-col-foot">
      <span>{t('colDoneFoot')}</span>
      <span>{t('colDoneFootRight')}</span>
    </div>
  )
}

/** What one {@link BoardColumn} renders. */
export interface BoardColumnProps extends CardHostProps {
  column: BoardColumnEntry
  over: boolean
  emptyText: string
  occupied: number
  wipLimit: number
  atWip: boolean
  overdueCount: number
  onDragOver: ZoneDropHandler
  onDragLeave: ZoneLeaveHandler
  onDrop: ZoneDropHandler
}

/**
 * One stage column: head, optional sign-only note, scrollable body, footer.
 * @param props - the column, its rows and the drop handlers for its zone.
 * @returns the column section.
 */
export function BoardColumn({
  column,
  over,
  emptyText,
  occupied,
  wipLimit,
  atWip,
  overdueCount,
  now,
  selectedId,
  bounceId,
  dragId,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: BoardColumnProps): ReactElement {
  return (
    <section
      className={`ho-col ho-col-${column.stage}${over ? ' ho-col-over' : ''}`}
      data-stage={column.stage}
      data-drop={column.stage}
      onDragOver={onDragOver(column.stage)}
      onDragLeave={onDragLeave(column.stage)}
      onDrop={onDrop(column.stage)}
    >
      <header className="ho-col-head">
        <span className={`ho-dot ho-dot-${column.stage}`} />
        <span className="ho-col-name">{t(stageKey(column.stage))}</span>
        <span className="ho-col-sub">{t(stageSubKey(column.stage))}</span>
        <span className="ho-col-count">{column.rows.length}</span>
      </header>
      {column.stage === 'done' ? <p className="ho-col-note">{t('doneOnlySign')}</p> : null}
      <div className="ho-col-body">
        {column.rows.length === 0
          ? <p className="ho-col-empty">{emptyText}</p>
          : column.rows.map((row) => (
            <OrderCard
              key={row.id}
              row={row}
              now={now}
              selected={selectedId === row.id}
              bounce={bounceId === row.id}
              dragging={dragId === row.id}
              onOpen={() => onOpen(row.id)}
              onDragStart={onDragStart(row.id)}
              onDragEnd={onDragEnd}
            />
          ))}
      </div>
      <ColumnFoot
        stage={column.stage}
        occupied={occupied}
        wipLimit={wipLimit}
        atWip={atWip}
        overdueCount={overdueCount}
      />
    </section>
  )
}

/** What the folded archive strip renders. */
export interface ArchiveStripProps extends CardHostProps {
  rows: OrderRow[]
  open: boolean
  over: boolean
  onToggle: () => void
  onDragOver: ZoneDropHandler
  onDragLeave: ZoneLeaveHandler
  onDrop: ZoneDropHandler
}

/**
 * The folded bottom strip: cancelled orders stay visible, never deleted.
 * @param props - dropped rows, fold state and the drop handlers.
 * @returns the archive section.
 */
export function ArchiveStrip({
  rows,
  open,
  over,
  now,
  selectedId,
  bounceId,
  dragId,
  onOpen,
  onDragStart,
  onDragEnd,
  onToggle,
  onDragOver,
  onDragLeave,
  onDrop,
}: ArchiveStripProps): ReactElement {
  return (
    <section
      className={`ho-archive${over ? ' ho-archive-over' : ''}`}
      data-drop="dropped"
      onDragOver={onDragOver('dropped')}
      onDragLeave={onDragLeave('dropped')}
      onDrop={onDrop('dropped')}
    >
      <button type="button" className="ho-archive-btn" onClick={onToggle}>
        <span>{open ? '▾' : '▸'}</span>
        <span>{`${t(stageKey('dropped'))} · ${rows.length}`}</span>
        <span className="ho-faint">{open ? t('archiveCollapse') : t('archiveHint')}</span>
      </button>
      {open
        ? (rows.length === 0
            ? <p className="ho-archive-empty">{t('archiveEmpty')}</p>
            : (
              <div className="ho-archive-list">
                {rows.map((row) => (
                  <OrderCard
                    key={row.id}
                    row={row}
                    now={now}
                    selected={selectedId === row.id}
                    bounce={bounceId === row.id}
                    dragging={dragId === row.id}
                    compact
                    draggable={false}
                    onOpen={() => onOpen(row.id)}
                  />
                ))}
              </div>
            ))
        : null}
    </section>
  )
}

/** What the whole board region renders. */
export interface BoardProps extends CardHostProps {
  columns: BoardColumnEntry[]
  archive: OrderRow[]
  dragOver: string | null
  occupied: number
  wipLimit: number
  atWip: boolean
  overdueCount: number
  emptyText: string
  archiveOpen: boolean
  onToggleArchive: () => void
  onDragOver: ZoneDropHandler
  onDragLeave: ZoneLeaveHandler
  onDrop: ZoneDropHandler
}

/**
 * The board and its archive strip.
 * @param props - columns, archive and every handler the cards need.
 * @returns the `ho-board-wrap` element.
 */
export function Board({
  columns,
  archive,
  dragOver,
  occupied,
  wipLimit,
  atWip,
  overdueCount,
  emptyText,
  archiveOpen,
  onToggleArchive,
  now,
  selectedId,
  bounceId,
  dragId,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: BoardProps): ReactElement {
  return (
    <div className="ho-board-wrap">
      <div className="ho-board">
        {columns.map((column) => (
          <BoardColumn
            key={column.stage}
            column={column}
            over={dragOver === column.stage}
            emptyText={emptyText}
            occupied={occupied}
            wipLimit={wipLimit}
            atWip={atWip}
            overdueCount={overdueCount}
            now={now}
            selectedId={selectedId}
            bounceId={bounceId}
            dragId={dragId}
            onOpen={onOpen}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          />
        ))}
      </div>
      <ArchiveStrip
        rows={archive}
        open={archiveOpen}
        over={dragOver === 'dropped'}
        now={now}
        selectedId={selectedId}
        bounceId={bounceId}
        dragId={dragId}
        onOpen={onOpen}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onToggle={onToggleArchive}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      />
    </div>
  )
}

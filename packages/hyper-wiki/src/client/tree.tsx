/**
 * The page tree column: scope switch, search, the new-page form, the page
 * list, and the pending-draft queue.
 *
 * This is a plain render function rather than a component on purpose: the
 * panel owns every hook, and the mount test inspects the element tree of one
 * render pass, so the column must be inlined into that pass instead of
 * mounting its own fiber.
 */

import type { ReactElement } from 'react'

import { t } from './locale.ts'
import type { DraftRow, PageRow, ScopeName, ScopeRow, TabName } from './types.ts'

export interface TreeColumnProps {
  scope: ScopeName
  projectScope: ScopeRow | undefined
  scopeRow: ScopeRow | undefined
  queued: DraftRow[]
  busy: boolean
  filter: string
  creatingPage: boolean
  newPath: string
  newTitle: string
  pages: PageRow[]
  drafts: DraftRow[]
  visible: PageRow[]
  draftByPage: Record<string, DraftRow | undefined>
  selected: string
  onScopeChange(scope: ScopeName): void
  onRefresh(): void
  onFilter(value: string): void
  onToggleCreate(): void
  onCloseCreate(): void
  onNewPath(value: string): void
  onNewTitle(value: string): void
  onCreatePage(): void
  onSelectPage(path: string, tab: TabName): void
}

export function renderTree(props: TreeColumnProps): ReactElement {
  const {
    scope, projectScope, scopeRow, queued, busy, filter, creatingPage, newPath, newTitle,
    pages, drafts, visible, draftByPage, selected,
    onScopeChange, onRefresh, onFilter, onToggleCreate, onCloseCreate,
    onNewPath, onNewTitle, onCreatePage, onSelectPage,
  } = props

  function scopeButton(id: ScopeName, label: string, disabled?: boolean): ReactElement {
    return (
      <button
        type="button"
        className={'dw-segment' + (scope === id ? ' dw-segment-active' : '')}
        aria-pressed={scope === id}
        disabled={disabled === true}
        onClick={() => onScopeChange(id)}
      >
        {label}
      </button>
    )
  }

  return (
    <aside className="dw-tree">
      <div className="dw-treehead">
        <div className="dw-controls">
          <div className="dw-segmented" role="group" aria-label={t('panel')}>
            {scopeButton('global', t('scopeGlobal'))}
            {scopeButton('project', t('scopeProject'), projectScope === undefined || projectScope === null)}
          </div>
          {scope === 'project' && (projectScope === undefined || projectScope === null)
            ? <span className="dw-chip dw-chip-quiet">{t('noProject')}</span>
            : null}
          <span className="dw-chip">{t('pendingCount', { count: queued.length })}</span>
          {scopeRow ? <span className="dw-chip dw-chip-quiet">{t(scopeRow.git ? 'gitOn' : 'gitOff')}</span> : null}
          <button type="button" className="dw-button" onClick={() => onRefresh()} disabled={busy}>{t('refresh')}</button>
        </div>
      </div>
      <input
        className="dw-input dw-search"
        type="search"
        value={filter}
        placeholder={t('searchPlaceholder')}
        onChange={event => onFilter(event.target.value)}
      />
      <button type="button" className="dw-newpage" onClick={() => onToggleCreate()} disabled={busy}>
        {creatingPage ? t('cancel') : `＋ ${t('newPage')}`}
      </button>
      {creatingPage
        ? (
            <div className="dw-create">
              <input
                className="dw-input"
                placeholder={t('pagePathPlaceholder')}
                value={newPath}
                onChange={event => onNewPath(event.target.value)}
              />
              <input
                className="dw-input"
                placeholder={t('pageTitlePlaceholder')}
                value={newTitle}
                onChange={event => onNewTitle(event.target.value)}
              />
              <div className="dw-create-actions">
                <button type="button" className="dw-button" onClick={() => onCloseCreate()}>{t('cancel')}</button>
                <button type="button" className="dw-button dw-primary" onClick={onCreatePage} disabled={busy}>{t('create')}</button>
              </div>
            </div>
          )
        : null}
      <div className="dw-tree-meta">{t('pagesCount', { count: pages.length })}{' · '}{t('draftsCount', { count: drafts.length })}</div>
      {visible.length === 0
        ? <p className="dw-muted">{pages.length === 0 ? t('emptyPages') : t('noPages')}</p>
        : (
            <ul className="dw-page-list">
              {visible.map(row => {
                const rowDraft = draftByPage[row.path]
                return (
                  <li key={row.path}>
                    <button
                      type="button"
                      className={'dw-page-row' + (row.path === selected ? ' dw-page-row-active' : '')}
                      onClick={() => onSelectPage(row.path, rowDraft ? 'draft' : 'source')}
                      title={row.path}
                    >
                      <span className="dw-page-title">{row.title}</span>
                      <span className="dw-page-sub">
                        <span className={'dw-dot dw-dot-' + (row.status || 'unknown')} />
                        {row.path}
                        {rowDraft
                          ? <span className={'dw-badge dw-badge-' + (rowDraft.status || 'pending')}>{t('draftWaiting')}</span>
                          : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
      {queued.length > 0
        ? (
            <div className="dw-queue">
              <div className="dw-label">{t('draftTitle')}</div>
              <ul className="dw-queue-list">
                {queued.map(row => (
                  <li key={row.path}>
                    <button type="button" className="dw-link" onClick={() => onSelectPage(row.path, 'draft')}>
                      {row.path}{' '}<span className="dw-muted">{`— ${row.author}`}</span>
                    </button>
                    {row.stale ? <span className="dw-warn">{' ⚠'}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )
        : null}
    </aside>
  )
}

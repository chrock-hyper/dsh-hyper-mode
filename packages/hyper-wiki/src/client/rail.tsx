/**
 * The review rail: the draft card with approve/reject, backlinks, page
 * metadata, and the rename/delete actions.
 */

import type { ReactElement } from 'react'

import { t } from './locale.ts'
import type { Draft, DialogKind, PageDetail, ScopeRow } from './types.ts'

export interface RailColumnProps {
  selected: string
  page: PageDetail | null
  draft: Draft | null
  scopeRow: ScopeRow | undefined
  busy: boolean
  onApprove(): void
  onDialog(kind: DialogKind): void
  onOpenBacklink(path: string): void
}

/**
 * Render the tag row. An absent list and an empty list both show a dash, which
 * is what the original inline expression did.
 *
 * @param tags - page tags, possibly omitted by the route.
 * @returns the joined tags or a dash.
 */
function tagText(tags: string[] | undefined): string {
  const list = tags ?? []
  return list.length === 0 ? '—' : list.join(', ')
}

export function renderRail(props: RailColumnProps): ReactElement {
  const { selected, page, draft, scopeRow, busy, onApprove, onDialog, onOpenBacklink } = props

  return (
    <aside className="dw-rail">
      {selected === '' || !page
        ? null
        : (
            <>
              <section className="dw-section">
                <h3>{t('draftTitle')}</h3>
                {draft === null || draft === undefined
                  ? <p className="dw-muted">{t('noDraft')}</p>
                  : (
                      <>
                        <dl className="dw-dl">
                          <dt>{t('status')}</dt>
                          <dd>{t('draftStatus_' + (draft.status || 'pending'))}</dd>
                          <dt>{t('draftAuthor')}</dt>
                          <dd>{draft.author || '—'}</dd>
                          <dt>{t('draftBase')}</dt>
                          <dd className="dw-mono">{draft.base || '—'}</dd>
                          <dt>{t('draftUpdated')}</dt>
                          <dd>{draft.updated || '—'}</dd>
                        </dl>
                        {draft.reason ? <p className="dw-reason">{t('rejectedHint') + draft.reason}</p> : null}
                        <div className="dw-actions">
                          <button
                            type="button"
                            className="dw-button dw-primary"
                            disabled={busy}
                            onClick={() => onApprove()}
                          >
                            {t('approve')}
                          </button>
                          {draft.stale
                            ? (
                                <button
                                  type="button"
                                  className="dw-button dw-warn-button"
                                  disabled={busy}
                                  onClick={() => onDialog('force')}
                                >
                                  {t('approveForce')}
                                </button>
                              )
                            : null}
                          <button
                            type="button"
                            className="dw-button"
                            disabled={busy}
                            onClick={() => onDialog('reject')}
                          >
                            {t('reject')}
                          </button>
                        </div>
                        {draft.stale ? <p className="dw-warn">{t('draftStale')}</p> : null}
                      </>
                    )}
              </section>
              <section className="dw-section">
                <h3>{t('backlinks') + ' (' + (page.backlinks || []).length + ')'}</h3>
                {(page.backlinks || []).length === 0
                  ? <p className="dw-muted">{t('noBacklinks')}</p>
                  : (
                      <ul className="dw-backlinks">
                        {(page.backlinks || []).map(row => (
                          <li key={row.path}>
                            <button
                              type="button"
                              className="dw-link"
                              onClick={() => onOpenBacklink(row.path)}
                            >
                              {row.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
              </section>
              <section className="dw-section">
                <h3>{t('meta')}</h3>
                <dl className="dw-dl">
                  <dt>{t('path')}</dt>
                  <dd className="dw-mono">{page.path}</dd>
                  <dt>{t('tags')}</dt>
                  <dd>{tagText(page.tags)}</dd>
                  <dt>{t('contract')}</dt>
                  <dd className="dw-mono">{scopeRow ? scopeRow.contract : '—'}</dd>
                </dl>
                {(page.errors || []).length > 0
                  ? (
                      <div className="dw-note">
                        <div className="dw-label">{t('errors')}</div>
                        <ul>
                          {(page.errors || []).map((line, index) => <li key={index}>{line}</li>)}
                        </ul>
                      </div>
                    )
                  : null}
              </section>
              <section className="dw-section">
                <div className="dw-actions">
                  <button
                    type="button"
                    className="dw-button"
                    disabled={busy}
                    onClick={() => onDialog('rename')}
                  >
                    {t('renamePage')}
                  </button>
                  <button
                    type="button"
                    className="dw-button dw-danger"
                    disabled={busy}
                    onClick={() => onDialog('delete')}
                  >
                    {t('deletePage')}
                  </button>
                </div>
              </section>
            </>
          )}
    </aside>
  )
}

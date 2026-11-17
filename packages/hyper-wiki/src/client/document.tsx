/**
 * The middle column: page header, tabs, and the source / preview / draft-diff
 * panes. State lives in the panel; this module only renders one pass.
 */

import type { ReactElement } from 'react'

import { diffLines, stripFrontmatter } from './diff.ts'
import { t } from './locale.ts'
import { renderPreview } from './markdown.tsx'
import type { Draft, PageDetail, TabName } from './types.ts'

export interface DocumentColumnProps {
  selected: string
  page: PageDetail | null
  tab: TabName
  editing: boolean
  busy: boolean
  draftText: string
  draft: Draft | null
  onTab(tab: TabName): void
  onEdit(): void
  onCancelEdit(): void
  onSave(): void
  onDraftText(value: string): void
}

export function renderDocument(props: DocumentColumnProps): ReactElement {
  const {
    selected, page, tab, editing, busy, draftText, draft,
    onTab, onEdit, onCancelEdit, onSave, onDraftText,
  } = props

  function tabButton(id: TabName, label: string): ReactElement {
    return (
      <button
        type="button"
        className={'dw-tab' + (tab === id ? ' dw-tab-active' : '')}
        onClick={() => onTab(id)}
      >
        {label}
      </button>
    )
  }

  return (
    <main className="dw-main">
      {selected === '' || !page
        ? <div className="dw-placeholder"><p>{t('emptySelection')}</p></div>
        : (
            <>
              <div className="dw-page-head">
                <div>
                  <h2>{page.title}</h2>
                  <div className="dw-page-meta">
                    <span className="dw-mono">{page.path}</span>
                    <span className={'dw-dot dw-dot-' + (page.status || 'unknown')} />
                    <span>{page.status}</span>
                    {page.updated ? <span className="dw-muted">{t('updated') + ' ' + page.updated}</span> : null}
                  </div>
                </div>
                <div className="dw-tabs">
                  {tabButton('source', t('tabSource'))}
                  {tabButton('preview', t('tabPreview'))}
                  {tabButton('draft', t('tabDraft'))}
                  <span className="dw-spacer" />
                  {editing
                    ? (
                        <>
                          <button type="button" className="dw-button" onClick={onCancelEdit} disabled={busy}>{t('cancel')}</button>
                          <button type="button" className="dw-button dw-primary" onClick={onSave} disabled={busy}>
                            {busy ? t('saving') : t('save')}
                          </button>
                        </>
                      )
                    : <button type="button" className="dw-button" onClick={onEdit}>{t('edit')}</button>}
                </div>
              </div>
              {tab === 'preview'
                ? <div className="dw-pane dw-preview">{renderPreview(editing ? stripFrontmatter(draftText) : page.body)}</div>
                : tab === 'draft'
                  ? (
                      <div className="dw-pane dw-diff">
                        {draft === null || draft === undefined
                          ? <p className="dw-muted">{t('noDraft')}</p>
                          : (
                              <>
                                <div className={'dw-draft-banner dw-draft-' + (draft.status || 'pending')}>
                                  <strong>{t('draftStatus_' + (draft.status || 'pending'))}</strong>
                                  <span className="dw-muted">{' ' + t('draftAuthor') + ': ' + (draft.author || '—')}</span>
                                  <span className="dw-muted">{' · ' + t('draftBase') + ': ' + (draft.base || '—')}</span>
                                  {draft.reason ? <div className="dw-reason">{t('rejectedHint') + draft.reason}</div> : null}
                                </div>
                                <pre className="dw-diff-body">{diffLines(page.body || '', draft.body === undefined ? page.body || '' : draft.body)}</pre>
                              </>
                            )}
                      </div>
                    )
                  : (
                      <textarea
                        className="dw-input dw-editor"
                        value={editing ? draftText : page.text}
                        readOnly={!editing}
                        spellCheck={false}
                        onChange={event => onDraftText(event.target.value)}
                      />
                    )}
              {editing ? <p className="dw-muted dw-hint">{t('readonly')}</p> : null}
            </>
          )}
    </main>
  )
}

/**
 * The right column: the role's experience entries, the input for one more, and
 * where the two scope directories are.
 *
 * Presentational: the panel owns the note draft and the request.
 */
import type { ChangeEvent, ReactElement } from 'react'

import type { RoleDoc, RoleState } from '../api.ts'
import { formatNoteAt } from '../format.ts'
import { t } from '../locale.ts'
import { Button } from './primitives.tsx'

/** Everything the side column renders or asks for. */
export interface SideColumnProps {
  /** `null` until the first `/state` response arrives. */
  state: RoleState | null
  /** `null` when no card is open. */
  doc: RoleDoc | null
  note: string
  busy: boolean
  onNote: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onAddNote: () => void
}

/**
 * Render the side column.
 * @param props - the card, the note draft and the handlers.
 * @returns the `aside.hr-side-col` element.
 */
export function SideColumn({ state, doc, note, busy, onNote, onAddNote }: SideColumnProps): ReactElement {
  return (
    <aside className="hr-col hr-side-col">
      <h3 className="hr-side-title">{`${t('notes')} ${doc === null ? '' : `(${doc.notes.length})`}`}</h3>
      {doc === null ? null : (
        <div>
          {doc.notes.length === 0 ? (
            <p className="hr-muted">{t('noteEmpty')}</p>
          ) : (
            <ul className="hr-note-list">
              {doc.notes.slice().reverse().map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <span className="hr-note-meta">{`${formatNoteAt(entry.at)} · ${entry.source}`}</span>
                  <p>{entry.text}</p>
                </li>
              ))}
            </ul>
          )}
          <textarea
            className="hr-textarea hr-note-input"
            placeholder={t('notePlaceholder')}
            value={note}
            onChange={onNote}
          />
          <div className="hr-note-actions">
            <Button label={t('noteAdd')} onClick={onAddNote} primary disabled={busy || note.trim() === ''} />
          </div>
        </div>
      )}
      <h3 className="hr-side-title">{t('dataAt')}</h3>
      <p className="hr-muted">
        {state === null ? '' : `本项目 ${state.projectDir === null ? '—' : '.dsh/roles/'}`}
        <br />
        {state === null ? '' : `全局 ${state.globalDir}`}
      </p>
    </aside>
  )
}

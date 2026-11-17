/**
 * The middle column: the selected role's title, metadata, fields, body, guide
 * and the save / reload / copy / archive actions.
 *
 * Presentational: every value and every handler comes from the panel, which
 * owns the selection, the dirty flag and the requests. The conflict banner
 * appears here because it replaces the actions, not the whole editor.
 */
import type { ChangeEvent, ReactElement } from 'react'

import type { RoleDoc } from '../api.ts'
import type { FieldKey, ListKey, RoleForm } from '../format.ts'
import { t } from '../locale.ts'
import type { FieldChange } from './primitives.tsx'
import { Button, Field } from './primitives.tsx'
import type { ListChange } from './token-field.tsx'
import { TokenField } from './token-field.tsx'

/** Everything the editor renders or asks for. */
export interface EditorColumnProps {
  doc: RoleDoc
  form: RoleForm
  /** Whether the form differs from the card it was loaded from. */
  dirty: boolean
  busy: boolean
  /** The version the role has moved to since it was opened, if known. */
  conflict: number | null | undefined
  guide: string
  /** Role ids the handoff field suggests; the current role is excluded. */
  roleIds: string[]
  archiving: boolean
  onField: (key: FieldKey) => FieldChange
  onList: (key: ListKey) => ListChange
  onGuide: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onSave: () => void
  onReload: () => void
  onCopyPrompt: () => void
  onArchive: () => void
  onDismissConflict: () => void
  onSaveGuide: () => void
}

/**
 * Render the editor for one loaded card.
 * @param props - the card, the form, its flags and the handlers.
 * @returns the `hr-editor` element.
 */
export function EditorColumn(props: EditorColumnProps): ReactElement {
  const {
    doc, form, dirty, busy, conflict, guide, roleIds, archiving,
    onField, onList, onGuide, onSave, onReload, onCopyPrompt, onArchive, onDismissConflict, onSaveGuide,
  } = props

  return (
    <div className="hr-editor">
      <div className="hr-ed-head">
        <div className="hr-ed-title-wrap">
          <input className="hr-title" value={form.title} onChange={onField('title')} />
          <div className="hr-meta">
            <span>{doc.fields.id}</span>
            <span>·</span>
            <span>{doc.scope === 'project' ? t('scopeProject') : t('scopeGlobal')}</span>
            <span>·</span>
            <span>{`${t('version')}${doc.revision}`}</span>
            <span>·</span>
            <span className={dirty ? 'hr-dirty' : 'hr-faint'}>{dirty ? t('dirty') : t('saved')}</span>
          </div>
        </div>
        <div className="hr-actions">
          <Button label={t('copyPrompt')} onClick={onCopyPrompt} ghost />
          <Button label={t('reload')} onClick={onReload} />
          <Button label={busy ? t('saving') : t('save')} onClick={onSave} primary disabled={busy || !dirty} />
          {archiving ? (
            <Button label={t('archiveConfirm')} onClick={onArchive} danger />
          ) : (
            <Button label={t('archive')} onClick={onArchive} danger />
          )}
        </div>
      </div>
      {conflict === null ? null : (
        <div className="hr-banner hr-warn">
          <span>{`${t('conflict')}（v${doc.revision} → v${conflict}）`}</span>
          <Button label={t('cancel')} onClick={onDismissConflict} ghost />
        </div>
      )}
      <div className="hr-grid">
        <TokenField
          label={t('capabilities')}
          value={form.capabilities}
          onChange={onList('capabilities')}
          placeholder="Enter 添加，可自由输入"
        />
        <TokenField
          label={t('skills')}
          value={form.skills}
          onChange={onList('skills')}
          placeholder="Enter 添加技能名"
        />
        <TokenField
          label={t('handoffs')}
          value={form.handoffs}
          onChange={onList('handoffs')}
          suggestions={roleIds}
          placeholder="Enter 添加岗位 id"
        />
        <TokenField
          label={t('can')}
          value={form.can}
          onChange={onList('can')}
          suggestions={['edit-roles', 'train']}
          placeholder="edit-roles / train"
        />
        <Field label={t('model')} value={form.model} onChange={onField('model')} />
      </div>
      <textarea className="hr-textarea hr-body" value={form.body} onChange={onField('body')} />
      <details className="hr-guide" open={guide.trim() !== ''}>
        <summary>{t('guide')}</summary>
        <textarea className="hr-textarea hr-guide-text" value={guide} onChange={onGuide} />
        <div className="hr-guide-actions">
          <Button label={t('guideSave')} onClick={onSaveGuide} disabled={busy} />
        </div>
      </details>
      <p className="hr-hint">{t('promptHint')}</p>
    </div>
  )
}

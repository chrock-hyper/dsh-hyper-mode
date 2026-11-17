/**
 * The two modal dialogs: creating an order and giving a drop its reason.
 *
 * Both are controlled by the panel — nothing here decides what a request means.
 * The create dialog sends the same body `org_order create` takes (the Host may
 * push it back to intake; that is a normal result, not a client check), and the
 * drop dialog exists because `update` already requires a note for `dropped`.
 */
import type { ChangeEvent, ReactElement } from 'react'

import type { CreateForm, DropState, OrderSize, RoleRow } from '../types.ts'
import { t } from '../locale.ts'
import { Button } from './primitives.tsx'

/** Sizes the create form offers, in the Host's order. */
const SIZES: OrderSize[] = ['S', 'M', 'L']

/** What the create dialog renders. */
export interface CreateModalProps {
  form: CreateForm
  roles: RoleRow[]
  writing: boolean
  /** True when the session has no project root: the project scope is locked. */
  noProject: boolean
  onForm: (form: CreateForm) => void
  onCreate: () => void
  onClose: () => void
}

/** One segmented scope choice. */
interface ScopeButtonProps {
  value: CreateForm['scope']
  label: string
  on: boolean
  disabled: boolean
  onClick: () => void
}

/**
 * One side of the two-way scope switch.
 * @param props - the scope value, label, current selection and lock.
 * @returns the segmented button.
 */
function ScopeButton({ label, on, disabled, onClick }: ScopeButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`ho-seg-btn${on ? ' ho-seg-on' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}

/**
 * The create-order dialog.
 * @param props - form values, roles, busy flag and the three callbacks.
 * @returns the modal element.
 */
export function CreateModal({
  form,
  roles,
  writing,
  noProject,
  onForm,
  onCreate,
  onClose,
}: CreateModalProps): ReactElement {
  return (
    <div className="ho-modal" role="dialog" aria-modal="true" aria-label={t('newOrder')}>
      <div className="ho-modal-card">
        <h2 className="ho-modal-title">{`＋ ${t('newOrder')}`}</h2>
        <p className="ho-hint">{t('createHint')}</p>
        <label className="ho-field">
          <span className="ho-label">{`${t('createTitleLabel')} · ${t('createTitle')}`}</span>
          <input
            className="ho-input"
            placeholder={t('createTitle')}
            value={form.title}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onForm({ ...form, title: event.target.value })}
          />
        </label>
        <label className="ho-field">
          <span className="ho-label">{t('createSize')}</span>
          <select
            className="ho-input"
            value={form.size}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onForm({ ...form, size: event.target.value })}
          >
            {SIZES.map((size) => (
              <option key={size} value={size}>{`${size} · ${t(`size${size}`)}`}</option>
            ))}
          </select>
        </label>
        <label className="ho-field">
          <span className="ho-label">{t('createDri')}</span>
          <select
            className="ho-input"
            value={form.dri}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onForm({ ...form, dri: event.target.value })}
          >
            <option key="unassigned" value="">{t('unassigned')}</option>
            {roles.map((role) => (
              <option key={`${role.scope}:${role.id}`} value={role.id}>{`${role.title}（${role.id}）`}</option>
            ))}
          </select>
        </label>
        <label className="ho-field">
          <span className="ho-label">{t('createAcceptance')}</span>
          <textarea
            className="ho-textarea"
            value={form.acceptance}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onForm({ ...form, acceptance: event.target.value })}
          />
        </label>
        <div className="ho-field">
          <span className="ho-label">{t('scope')}</span>
          <div className="ho-seg">
            <ScopeButton
              value="project"
              label={t('scopeProject')}
              on={form.scope === 'project'}
              disabled={noProject}
              onClick={() => onForm({ ...form, scope: 'project' })}
            />
            <ScopeButton
              value="global"
              label={t('scopeGlobal')}
              on={form.scope === 'global'}
              disabled={false}
              onClick={() => onForm({ ...form, scope: 'global' })}
            />
          </div>
          {noProject ? <span className="ho-hint">{t('noProjectScope')}</span> : null}
        </div>
        <label className="ho-field">
          <span className="ho-label">{t('createNote')}</span>
          <input
            className="ho-input"
            value={form.note}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onForm({ ...form, note: event.target.value })}
          />
        </label>
        <div className="ho-actions">
          <Button label={t('cancel')} onClick={onClose} ghost disabled={writing} />
          <Button
            label={writing ? t('saving') : t('newOrder')}
            onClick={onCreate}
            primary
            disabled={writing || form.title.trim() === ''}
          />
        </div>
        {form.title.trim() === '' ? <p className="ho-hint">{t('createTitleRequired')}</p> : null}
      </div>
    </div>
  )
}

/** What the drop-reason dialog renders. */
export interface DropModalProps {
  drop: DropState
  writing: boolean
  onReason: (reason: string) => void
  onCancel: () => void
  onConfirm: () => void
}

/**
 * The drop-reason dialog: nothing is sent until the reason is written.
 * @param props - the pending drop, busy flag and the three callbacks.
 * @returns the modal element.
 */
export function DropModal({ drop, writing, onReason, onCancel, onConfirm }: DropModalProps): ReactElement {
  return (
    <div className="ho-modal" role="dialog" aria-modal="true" aria-label={t('dropTitle')}>
      <div className="ho-modal-card">
        <h2 className="ho-modal-title">{t('dropTitle')}</h2>
        <p className="ho-hint">{t('dropHint')}</p>
        <label className="ho-field">
          <span className="ho-label">{`${drop.id} · ${t('noteRequiredDrop')}`}</span>
          <textarea
            className="ho-textarea"
            value={drop.reason}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onReason(event.target.value)}
          />
        </label>
        {drop.error === '' ? null : <p className="ho-warnbox">{drop.error}</p>}
        <div className="ho-actions">
          <Button label={t('cancel')} onClick={onCancel} ghost disabled={writing} />
          <Button
            label={writing ? t('saving') : t('dropConfirm')}
            onClick={onConfirm}
            danger
            disabled={writing || drop.reason.trim() === ''}
          />
        </div>
      </div>
    </div>
  )
}

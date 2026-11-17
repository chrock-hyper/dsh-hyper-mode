/**
 * A tiny modal for confirmations and one-line inputs.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

import { t } from './locale.ts'
import type { DialogState } from './types.ts'

export interface DialogProps {
  spec: DialogState
  onClose(): void
  onSubmit(value: string): void
}

export function Dialog({ spec, onClose, onSubmit }: DialogProps): ReactElement {
  const kind = spec.kind
  const needsValue = kind === 'reject' || kind === 'rename'
  const [value, setValue] = useState('')
  // The textarea and the single-line input are mutually exclusive; one ref per
  // element type keeps the React ref typing honest.
  const inputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const node = textareaRef.current ?? inputRef.current
    if (node) node.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = kind === 'force'
    ? t('confirmForceTitle')
    : kind === 'delete'
      ? t('confirmDeleteTitle')
      : kind === 'reject'
        ? t('rejectTitle')
        : t('renameTitle')
  const body = kind === 'force'
    ? t('confirmForceBody')
    : kind === 'delete'
      ? t('confirmDeleteBody')
      : kind === 'reject'
        ? t('rejectBody')
        : t('renameBody')

  return (
    <div
      className="dw-overlay"
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="dw-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p className="dw-muted">{body}</p>
        {needsValue
          ? kind === 'reject'
            ? (
                <textarea
                  ref={textareaRef}
                  className="dw-input dw-dialog-input"
                  value={value}
                  placeholder={t('reasonPlaceholder')}
                  onChange={event => setValue(event.target.value)}
                />
              )
            : (
                <input
                  ref={inputRef}
                  className="dw-input dw-dialog-input"
                  value={value}
                  placeholder={t('newPath')}
                  onChange={event => setValue(event.target.value)}
                />
              )
          : null}
        <div className="dw-modal-actions">
          <button type="button" className="dw-button" onClick={onClose}>{t('close')}</button>
          <button
            type="button"
            className={'dw-button ' + (kind === 'delete' ? 'dw-danger' : 'dw-primary')}
            onClick={() => onSubmit(value)}
          >
            {kind === 'force' || kind === 'delete' ? t('confirm') : kind === 'reject' ? t('reject') : t('confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

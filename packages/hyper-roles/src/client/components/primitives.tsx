/**
 * The two form primitives every column shares: the small button and the
 * labeled input row.
 *
 * Both were plain builders in the hand-written module; they are components now
 * so the columns stay declarative, with the same className strings and the same
 * disabled semantics.
 */
import type { ChangeEvent, ReactElement } from 'react'

/** The event both a single-line and a multi-line text input hand a handler. */
export type FieldEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement>

/** A change handler usable by either text input. */
export type FieldChange = (event: FieldEvent) => void

/** What a {@link Button} renders and does. */
export interface ButtonProps {
  label: string
  onClick: () => void
  /** Filled with the brand colour. */
  primary?: boolean
  /** Destructive action (archive). */
  danger?: boolean
  /** Borderless, for secondary actions inside a banner. */
  ghost?: boolean
  disabled?: boolean
}

/**
 * Focused small button.
 * @param props - label, handler and the three visual variants.
 * @returns the button element.
 */
export function Button({ label, onClick, primary, danger, ghost, disabled }: ButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`hr-btn${primary ? ' hr-primary' : ''}${danger ? ' hr-danger' : ''}${ghost ? ' hr-ghost' : ''}`}
      onClick={onClick}
      disabled={disabled === true}
    >
      {label}
    </button>
  )
}

/** What a {@link Field} renders and does. */
export interface FieldProps {
  label: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  disabled?: boolean
}

/**
 * Labeled input row.
 * @param props - label, value, handler and the optional disabled flag.
 * @returns the label wrapping one input.
 */
export function Field({ label, value, onChange, disabled }: FieldProps): ReactElement {
  return (
    <label className="hr-field">
      <span className="hr-label">{label}</span>
      <input className="hr-input" value={value} onChange={onChange} disabled={disabled === true} />
    </label>
  )
}

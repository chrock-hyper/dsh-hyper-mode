/**
 * The small pieces every region of the board shares: the focused button, the
 * top-bar stat, a banner line and one labeled inspector section.
 *
 * All four were plain builders in the hand-written module; they are components
 * now so the regions stay declarative, with the same className strings, the
 * same children order and the same disabled semantics.
 */
import type { ReactElement, ReactNode } from 'react'

import { t } from '../locale.ts'

/** What a {@link Button} renders and does. */
export interface ButtonProps {
  label: string
  onClick: () => void
  /** Filled with the brand colour. */
  primary?: boolean
  /** Destructive action (sign back / drop). */
  danger?: boolean
  /** Borderless, for secondary actions inside a banner. */
  ghost?: boolean
  disabled?: boolean
  title?: string
}

/**
 * Focused small button.
 * @param props - label, handler and the visual variants.
 * @returns the button element.
 */
export function Button({ label, onClick, primary, danger, ghost, disabled, title }: ButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`ho-btn${primary ? ' ho-primary' : ''}${danger ? ' ho-danger' : ''}${ghost ? ' ho-ghost' : ''}`}
      onClick={onClick}
      disabled={disabled === true}
      title={title}
    >
      {label}
    </button>
  )
}

/** The three tones the top bar can give a reading. */
export type StatTone = 'warn' | 'ok' | 'danger'

/** What a {@link Stat} renders. */
export interface StatProps {
  label: string
  value: string | number
  tone?: StatTone
}

/**
 * One top-bar reading: a faint label and a bold value.
 * @param props - label, value and optional tone.
 * @returns the `ho-stat` span.
 */
export function Stat({ label, value, tone }: StatProps): ReactElement {
  return (
    <span className={`ho-stat${tone === undefined ? '' : ` ho-stat-${tone}`}`}>
      <span className="ho-stat-label">{label}</span>
      <b>{value}</b>
    </span>
  )
}

/** What a {@link Banner} renders and does. */
export interface BannerProps {
  kind: 'error' | 'ok'
  text: string
  /** Present on an error line: re-read the board and the open order. */
  onRetry?: () => void
  onClose: () => void
  busy: boolean
}

/**
 * One visible line above the board, with an optional retry and a dismiss.
 * @param props - kind, text and the two callbacks.
 * @returns the banner element.
 */
export function Banner({ kind, text, onRetry, onClose, busy }: BannerProps): ReactElement {
  return (
    <div className={`ho-banner ho-banner-${kind}`}>
      <span className="ho-banner-text">{text}</span>
      {onRetry === undefined ? null : <Button label={t('retry')} onClick={onRetry} ghost disabled={busy} />}
      <Button label={t('close')} onClick={onClose} ghost />
    </div>
  )
}

/** What a {@link Section} wraps. */
export interface SectionProps {
  label: string
  children: ReactNode
}

/**
 * One inspector section: a faint label above its body.
 * @param props - label and body nodes.
 * @returns the `ho-sec` section.
 */
export function Section({ label, children }: SectionProps): ReactElement {
  return (
    <section className="ho-sec">
      <div className="ho-sec-label">{label}</div>
      <div className="ho-sec-body">{children}</div>
    </section>
  )
}

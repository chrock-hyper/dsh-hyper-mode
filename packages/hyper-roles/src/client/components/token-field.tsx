/**
 * A token field: values are chips, typing adds one, and a short suggestion list
 * offers the values that already exist (grants, role ids).
 *
 * Typing a comma or pressing Enter commits; Backspace on an empty input drops
 * the last chip. The chips stay arrays in the form, so nothing here parses text
 * beyond splitting the input on the two comma characters.
 */
import { useState } from 'react'
import type { ReactElement } from 'react'

/** Replace the whole token list. */
export type ListChange = (values: string[]) => void

/** What a {@link TokenField} renders and does. */
export interface TokenFieldProps {
  label: string
  value: string[]
  onChange: ListChange
  /** Values that already exist elsewhere; at most six are offered. */
  suggestions?: string[]
  placeholder?: string
}

/**
 * Chips plus a `hr-token-input`.
 * @param props - label, tokens, handler, suggestions and placeholder.
 * @returns the field element, with the suggestion strip only while focused.
 */
export function TokenField({ label, value, onChange, suggestions, placeholder }: TokenFieldProps): ReactElement {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)

  const add = (raw: string): void => {
    const next = [...value]
    for (const token of String(raw).split(/[,，]/).map((entry) => entry.trim()).filter(Boolean)) {
      if (!next.includes(token)) next.push(token)
    }
    onChange(next)
    setText('')
  }

  const needle = text.trim().toLowerCase()
  const options = (suggestions || [])
    .filter((option) => !value.includes(option) && (needle === '' || option.toLowerCase().includes(needle)))
    .slice(0, 6)

  return (
    <div className="hr-field">
      <span className="hr-label">{label}</span>
      <div className="hr-tokens">
        {value.map((token) => (
          <span key={token} className="hr-chip">
            {token}
            <button
              type="button"
              className="hr-chip-x"
              aria-label={`移除 ${token}`}
              onClick={() => onChange(value.filter((entry) => entry !== token))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="hr-token-input"
          value={text}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
              event.preventDefault()
              add(text)
            } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
              onChange(value.slice(0, -1))
            }
          }}
        />
      </div>
      {focused && options.length > 0 ? (
        <div className="hr-suggest">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="hr-suggest-item"
              onMouseDown={(event) => { event.preventDefault(); add(option) }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

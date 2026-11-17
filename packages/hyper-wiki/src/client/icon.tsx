/**
 * The sidebar icon: a page with a link, plus the pending-draft badge the
 * design asks for. Drawn here, so it needs no extra asset.
 */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'

import { API, BADGE_POLL_MS } from './api.ts'
import type { PendingBody } from './types.ts'

export interface WikiIconProps {
  size?: number
  active?: boolean
}

export function WikiIcon(props: WikiIconProps = {}): ReactElement {
  const size = props.size || 18
  const active = Boolean(props.active)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () => {
      fetch(API + '/pending', { cache: 'no-store' })
        .then(response => (response.ok ? response.json() : undefined))
        .then((body: PendingBody | undefined) => {
          if (!alive || !body || typeof body.total !== 'number') return
          setPending(body.total)
        })
        .catch(() => undefined)
    }
    load()
    const timer = setInterval(load, BADGE_POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const badge = pending > 0
    ? (
        <g>
          <circle
            cx={18.4}
            cy={5.6}
            r={5.2}
            fill="var(--dsw-alias-state-warn-primary, #d97706)"
            stroke="var(--dsw-alias-bg-base, #ffffff)"
            strokeWidth={1.4}
          />
          <text
            x={18.4}
            y={8.3}
            textAnchor="middle"
            fontSize={6.4}
            fontWeight={700}
            fill="#ffffff"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {pending > 99 ? '99+' : String(pending)}
          </text>
        </g>
      )
    : null

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.9 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      <path d="M6.2 3.4h7.1l4.5 4.4v12.4a1.4 1.4 0 0 1-1.4 1.4H6.2a1.4 1.4 0 0 1-1.4-1.4V4.8a1.4 1.4 0 0 1 1.4-1.4z" />
      <path d="M13.1 3.5v4.5h4.6" />
      <path d="M8.2 12.6h6.2M8.2 15.8h4.2" />
      <circle cx={14.6} cy={18.1} r={1.5} fill="currentColor" stroke="none" />
      {badge}
    </svg>
  )
}

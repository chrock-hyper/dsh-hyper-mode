/**
 * The left column: the scope switcher, the filter, the inline create form, the
 * role rows of the selected scope, and the shipped cards that can be copied in.
 *
 * Presentational: the panel owns the state and the requests; this column only
 * knows how a row looks selected and when a control is unavailable.
 */
import type { ChangeEvent, ReactElement } from 'react'

import type { BuiltinRow, RoleRef, RoleRow, RoleScope, RoleState } from '../api.ts'
import { t } from '../locale.ts'
import { Button } from './primitives.tsx'

/** Everything the list column renders or asks for. */
export interface ListColumnProps {
  /** `null` until the first `/state` response arrives. */
  state: RoleState | null
  /** Rows of the selected scope, already filtered. */
  rows: RoleRow[]
  builtinRows: BuiltinRow[]
  scope: RoleScope
  filter: string
  creating: boolean
  newId: string
  newTitle: string
  busy: boolean
  selected: RoleRef | null
  onScope: (scope: RoleScope) => void
  onFilter: (event: ChangeEvent<HTMLInputElement>) => void
  onToggleCreating: () => void
  onNewId: (event: ChangeEvent<HTMLInputElement>) => void
  onNewTitle: (event: ChangeEvent<HTMLInputElement>) => void
  onCancelCreate: () => void
  onCreate: () => void
  onOpen: (target: RoleRef) => void
  onCopyBuiltin: (id: string) => void
}

/**
 * Render the list column.
 * @param props - the state slice, the rows and the handlers.
 * @returns the `aside.hr-list-col` element.
 */
export function ListColumn(props: ListColumnProps): ReactElement {
  const { state, rows, builtinRows, scope, filter, creating, newId, newTitle, busy, selected } = props

  /** One half of the project / global switcher. */
  const scopeButton = (value: RoleScope): ReactElement => (
    <button
      type="button"
      className={`hr-seg-btn${scope === value ? ' hr-seg-on' : ''}`}
      onClick={() => props.onScope(value)}
    >
      {value === 'project' ? t('scopeProject') : t('scopeGlobal')}
    </button>
  )

  return (
    <aside className="hr-col hr-list-col">
      <div className="hr-list-head">
        <div className="hr-seg">
          {scopeButton('project')}
          {scopeButton('global')}
        </div>
        <input
          className="hr-input hr-filter"
          placeholder={t('filter')}
          value={filter}
          onChange={props.onFilter}
        />
        <button
          type="button"
          className="hr-new"
          onClick={props.onToggleCreating}
          disabled={scope === 'project' && (state === null || state.projectDir === null)}
        >
          {creating ? t('cancel') : `＋ ${t('newRole')}`}
        </button>
      </div>
      {creating === false ? null : (
        <div className="hr-create">
          <input className="hr-input" placeholder={t('idField')} value={newId} onChange={props.onNewId} />
          <input className="hr-input" placeholder={t('titleField')} value={newTitle} onChange={props.onNewTitle} />
          <div className="hr-create-actions">
            <Button label={t('cancel')} onClick={props.onCancelCreate} ghost />
            <Button label={t('create')} onClick={props.onCreate} primary disabled={busy} />
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="hr-muted hr-pad">{state === null ? t('loading') : t('emptyList')}</p>
      ) : (
        <ul className="hr-rows">
          {rows.map((row) => (
            <li
              key={`${row.scope}:${row.id}`}
              className={`hr-row${selected !== null && selected.id === row.id && selected.scope === row.scope ? ' hr-row-on' : ''}`}
              onClick={() => props.onOpen({ scope: row.scope, id: row.id })}
            >
              <span className="hr-row-title">{row.title}</span>
              <span className="hr-row-meta">
                {`${row.id} · ${t('version')}${row.version}`}
                {row.shadowed === true ? <em className="hr-badge">{t('shadowed')}</em> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {builtinRows.length === 0 ? null : (
        <div className="hr-builtins">
          <p className="hr-muted hr-pad">{t('readonly')}</p>
          <ul className="hr-rows">
            {builtinRows.map((row) => {
              const installed = rows.some((entry) => entry.id === row.id)
              return (
                <li key={row.id} className="hr-row hr-row-builtin">
                  <span className="hr-row-title">{row.title}</span>
                  <span className="hr-row-meta">
                    {row.id}
                    {installed ? (
                      <em className="hr-installed">{t('installed')}</em>
                    ) : (
                      <button
                        type="button"
                        className="hr-link"
                        onClick={() => props.onCopyBuiltin(row.id)}
                        disabled={busy || (scope === 'project' && (state === null || state.projectDir === null))}
                      >
                        {t('copyIn')}
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </aside>
  )
}

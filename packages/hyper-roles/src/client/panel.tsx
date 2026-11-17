/**
 * The roles tab: scope switcher, role list, editor and notes, in one panel.
 *
 * State and requests live here; the three columns are presentational modules,
 * so the panel's own job — what is selected, what is dirty, what went wrong —
 * stays readable in one file. Everything the panel saves goes through
 * `/hyper-roles/api`, the same routes the model tools use, so the panel and the
 * agent can never disagree about what a save means.
 *
 * Three rules the panel learned the hard way and still keeps:
 * 1. no window.prompt / window.confirm — Electron has no prompt and throws silently;
 * 2. every field feeds `dirty`, so a disabled Save can explain itself;
 * 3. a failed request always lands on the visible error banner.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'

import type { RoleDoc, RoleRef, RoleScope, RoleState } from './api.ts'
import { API, call, isStale, queryString } from './api.ts'
import type { FieldKey, ListKey, RoleForm } from './format.ts'
import { formOf, messageOf, sameList } from './format.ts'
import { t } from './locale.ts'
import { EditorColumn } from './components/editor-column.tsx'
import { ListColumn } from './components/list-column.tsx'
import { SideColumn } from './components/side-column.tsx'
import type { FieldEvent } from './components/primitives.tsx'
import { STYLES } from './styles.ts'

/** Props the slot framework passes to a conversation view. */
export interface RoleTabProps {
  sessionId?: string | null
}

/**
 * The tab component: one panel per conversation, scoped to its working
 * directory, so the project scope needs no directory picker.
 * @param props - the session id from `conversation.view`.
 * @returns the `hr-tab` element.
 */
export function RoleTab({ sessionId }: RoleTabProps): ReactElement {
  const [state, setState] = useState<RoleState | null>(null)
  const [scope, setScope] = useState<RoleScope>('project')
  const [selected, setSelected] = useState<RoleRef | null>(null)
  const [doc, setDoc] = useState<RoleDoc | null>(null)
  const [form, setForm] = useState<RoleForm | null>(null)
  const [guide, setGuide] = useState('')
  const [note, setNote] = useState('')
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [newId, setNewId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState<number | null | undefined>(null)
  const [archiving, setArchiving] = useState(false)

  const session = sessionId === undefined || sessionId === null ? '' : String(sessionId)

  /** Show a transient success line. */
  const flash = useCallback((text: string) => {
    setNotice(text)
    setError('')
  }, [])

  /** Show a failure line and clear the success line. */
  const fail = useCallback((failure: unknown) => {
    setError(`${t('error')}: ${messageOf(failure)}`)
    setNotice('')
  }, [])

  const loadState = useCallback(async () => {
    try {
      const body = await call<RoleState>(`${API}/state${queryString({ session })}`)
      setState(body)
      if (body.problems && body.problems.length > 0) {
        setError(`${t('error')}: ${body.problems.length} 个岗位文件无法解析（${body.problems[0]?.path}）`)
      }
    } catch (failure) {
      fail(failure)
    }
  }, [session, fail])

  const openRole = useCallback(async (target: RoleRef | null): Promise<boolean> => {
    if (target === null) return true
    setSelected(target)
    setArchiving(false)
    setConflict(null)
    try {
      const body = await call<RoleDoc>(`${API}/role/${target.scope}/${encodeURIComponent(target.id)}${queryString({ session })}`)
      setDoc(body)
      setForm(formOf(body.fields, body.body))
      setGuide(body.guide || '')
      setError('')
      return true
    } catch (failure) {
      setDoc(null)
      setForm(null)
      fail(failure)
      return false
    }
  }, [session, fail])

  useEffect(() => {
    loadState()
  }, [loadState])

  useEffect(() => {
    if (selected !== null) return
    const rows = state === null ? [] : state.roles[scope] || []
    const first = rows[0]
    if (first !== undefined) openRole({ scope, id: first.id })
  }, [state, scope, selected, openRole])

  const rows = useMemo(() => {
    const list = state === null ? [] : state.roles[scope] || []
    const needle = filter.trim().toLowerCase()
    if (needle === '') return list
    return list.filter((row) => `${row.id} ${row.title}`.toLowerCase().includes(needle))
  }, [state, scope, filter])

  const dirty = useMemo(() => {
    if (doc === null || form === null) return false
    const original = formOf(doc.fields, doc.body)
    return form.title !== original.title
      || !sameList(form.capabilities, original.capabilities)
      || !sameList(form.skills, original.skills)
      || !sameList(form.handoffs, original.handoffs)
      || !sameList(form.can, original.can)
      || form.model !== original.model
      || form.body !== original.body
  }, [doc, form])

  // The editor only renders while a form is loaded, so `current` is never null
  // here; the guard keeps the updater total for TypeScript.
  const setField = (key: FieldKey) => (event: FieldEvent): void => {
    const value = event.target.value
    setForm((current) => (current === null ? current : { ...current, [key]: value }))
  }

  const setList = (key: ListKey) => (values: string[]): void => {
    setForm((current) => (current === null ? current : { ...current, [key]: values }))
  }

  const changeScope = (value: RoleScope): void => {
    setScope(value)
    setSelected(null)
    setDoc(null)
    setForm(null)
  }

  const save = useCallback(async () => {
    if (doc === null || form === null || selected === null) return
    if (form.title.trim() === '') { fail(new Error(t('needTitle'))); return }
    setBusy(true)
    try {
      await call(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}${queryString({ session })}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fields: {
            title: form.title.trim(),
            capabilities: form.capabilities,
            skills: form.skills,
            handoffs: form.handoffs,
            can: form.can,
            model: form.model,
          },
          body: form.body,
          expectedVersion: doc.revision,
        }),
      })
      flash(t('saved'))
      await loadState()
      await openRole(selected)
    } catch (failure) {
      if (isStale(failure)) {
        setConflict(failure.currentVersion)
      } else {
        fail(failure)
      }
    } finally {
      setBusy(false)
    }
  }, [doc, form, selected, session, loadState, openRole, flash, fail])

  const create = useCallback(async () => {
    const id = newId.trim()
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) { fail(new Error(t('needId'))); return }
    if (newTitle.trim() === '') { fail(new Error(t('needTitle'))); return }
    setBusy(true)
    try {
      await call(`${API}/role/${scope}${queryString({ session })}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          title: newTitle.trim(),
          body: '## 职责\n\n## 工作方式\n\n## 交互对象\n\n## 完成标准\n',
        }),
      })
      setCreating(false)
      setNewId('')
      setNewTitle('')
      flash(t('created'))
      await loadState()
      await openRole({ scope, id })
    } catch (failure) {
      fail(failure)
    } finally {
      setBusy(false)
    }
  }, [newId, newTitle, scope, session, loadState, openRole, flash, fail])

  const copyBuiltin = useCallback(async (id: string) => {
    setBusy(true)
    try {
      await call(`${API}/role/${scope}${queryString({ session })}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fromBuiltin: id }),
      })
      flash(t('copied'))
      await loadState()
      await openRole({ scope, id })
    } catch (failure) {
      fail(failure)
    } finally {
      setBusy(false)
    }
  }, [scope, session, loadState, openRole, flash, fail])

  const archive = useCallback(async () => {
    if (selected === null) return
    if (!archiving) { setArchiving(true); return }
    setBusy(true)
    try {
      await call(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}/archive${queryString({ session })}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      setArchiving(false)
      setDoc(null)
      setForm(null)
      setSelected(null)
      flash(t('saved'))
      await loadState()
    } catch (failure) {
      fail(failure)
    } finally {
      setBusy(false)
    }
  }, [selected, archiving, session, loadState, flash, fail])

  const saveGuide = useCallback(async () => {
    if (selected === null) return
    setBusy(true)
    try {
      await call(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}/guide${queryString({ session })}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: guide }),
      })
      flash(t('savedGuide'))
    } catch (failure) {
      fail(failure)
    } finally {
      setBusy(false)
    }
  }, [selected, guide, session, flash, fail])

  const addNote = useCallback(async () => {
    if (selected === null || note.trim() === '') return
    setBusy(true)
    try {
      await call(`${API}/role/${selected.scope}/${encodeURIComponent(selected.id)}/note${queryString({ session })}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: note.trim() }),
      })
      setNote('')
      flash(t('saved'))
      await openRole(selected)
    } catch (failure) {
      fail(failure)
    } finally {
      setBusy(false)
    }
  }, [selected, note, session, openRole, flash, fail])

  const copyPrompt = useCallback(async () => {
    if (doc === null) return
    const text = [
      `<!-- role:${doc.fields.id} -->`,
      `【岗位】${doc.fields.title}（${doc.fields.id} · v${doc.revision}）`,
      '',
      doc.body,
      guide.trim() === '' ? '' : `\n## 岗位指导\n${guide.trim()}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      flash(t('copied'))
    } catch {
      fail(new Error(t('copyFailed')))
    }
  }, [doc, guide, flash, fail])

  const reload = useCallback(async () => {
    setConflict(null)
    // A failed reload writes the error banner; flashing success afterwards
    // would clear it and claim the panel had refreshed.
    const refreshed = selected === null ? true : await openRole(selected)
    if (refreshed) flash(t('refreshed'))
  }, [selected, openRole, flash])

  const roleIds = state === null ? [] : [...new Set([
    ...(state.roles.project || []).map((row) => row.id),
    ...(state.roles.global || []).map((row) => row.id),
  ])].filter((id) => doc === null || id !== doc.fields.id)
  const builtinRows = state === null ? [] : state.builtins || []

  return (
    <div className="hr-tab">
      <style>{STYLES}</style>
      {error === '' && notice === '' ? null : (
        <div className="hr-banners">
          {error === '' ? null : <span className="hr-banner hr-error">{error}</span>}
          {notice === '' ? null : <span className="hr-banner hr-ok">{notice}</span>}
        </div>
      )}
      <div className="hr-body-cols">
        <ListColumn
          state={state}
          rows={rows}
          builtinRows={builtinRows}
          scope={scope}
          filter={filter}
          creating={creating}
          newId={newId}
          newTitle={newTitle}
          busy={busy}
          selected={selected}
          onScope={changeScope}
          onFilter={(event) => setFilter(event.target.value)}
          onToggleCreating={() => setCreating((open) => !open)}
          onNewId={(event) => setNewId(event.target.value)}
          onNewTitle={(event) => setNewTitle(event.target.value)}
          onCancelCreate={() => setCreating(false)}
          onCreate={create}
          onOpen={openRole}
          onCopyBuiltin={copyBuiltin}
        />
        <section className="hr-col hr-editor-col">
          {doc === null || form === null ? (
            <p className="hr-muted">{t('emptyBody')}</p>
          ) : (
            <EditorColumn
              doc={doc}
              form={form}
              dirty={dirty}
              busy={busy}
              conflict={conflict}
              guide={guide}
              roleIds={roleIds}
              archiving={archiving}
              onField={setField}
              onList={setList}
              onGuide={(event: ChangeEvent<HTMLTextAreaElement>) => setGuide(event.target.value)}
              onSave={save}
              onReload={reload}
              onCopyPrompt={copyPrompt}
              onArchive={archive}
              onDismissConflict={() => setConflict(null)}
              onSaveGuide={saveGuide}
            />
          )}
        </section>
        <SideColumn
          state={state}
          doc={doc}
          note={note}
          busy={busy}
          onNote={(event) => setNote(event.target.value)}
          onAddNote={addNote}
        />
      </div>
    </div>
  )
}

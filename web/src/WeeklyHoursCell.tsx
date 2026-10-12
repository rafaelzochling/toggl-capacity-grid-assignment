import { useState, type FocusEvent, type FormEvent } from 'react'
import { updateWeeklyHours, type PersonSummary } from './api'

type Props = {
  person: PersonSummary
  onSaved: (person: PersonSummary) => void
}

type Save = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string }

// WeeklyHoursCell is the editable capacity in a person's row. Click to
// edit, Enter to save, Escape to cancel. While a save is in flight the
// editor is locked, so a double Enter or an impatient Retry cannot fire a
// second request. On failure the typed value stays put next to the error;
// the grid keeps showing the last number the server confirmed.
export function WeeklyHoursCell({ person, onSaved }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [save, setSave] = useState<Save>({ status: 'idle' })

  const close = () => {
    setDraft(null)
    setSave({ status: 'idle' })
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (draft === null || save.status === 'saving') return
    const hours = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(hours) || hours < 0 || hours > 168) {
      setSave({ status: 'error', message: 'Enter hours between 0 and 168' })
      return
    }
    if (hours === person.weeklyHours) {
      close()
      return
    }
    setSave({ status: 'saving' })
    updateWeeklyHours(person.id, hours).then(
      (saved) => {
        close()
        onSaved(saved)
      },
      (err: unknown) => setSave({ status: 'error', message: err instanceof Error ? err.message : 'save failed' }),
    )
  }

  // Leaving the editor cancels, unless focus moved to the Retry button.
  const onBlur = (e: FocusEvent<HTMLFormElement>) => {
    if (save.status === 'saving') return
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    close()
  }

  if (draft === null) {
    return (
      <td className="num">
        <button type="button" className="edit" onClick={() => setDraft(String(person.weeklyHours))} aria-label={`Edit weekly hours for ${person.name}`}>
          {person.weeklyHours}
        </button>
      </td>
    )
  }

  const saving = save.status === 'saving'
  return (
    <td className="num editing">
      <form onSubmit={submit} onBlur={onBlur}>
        <input
          type="number"
          min={0}
          max={168}
          step={0.5}
          value={draft}
          autoFocus
          disabled={saving}
          aria-label={`Weekly hours for ${person.name}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && close()}
        />
        {saving && <span className="saving">Saving…</span>}
        {save.status === 'error' && (
          <span className="error" role="alert">
            {save.message}{' '}
            <button type="submit" disabled={saving}>
              Retry
            </button>
          </span>
        )}
      </form>
    </td>
  )
}

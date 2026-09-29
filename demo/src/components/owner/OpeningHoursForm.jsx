import { useEffect, useState } from 'react'
import { getHours, setHours } from '../../api/catalogApi.js'
import { Fold, Unsaved } from '../Accordion.jsx'

const DAYS = [
  ['MONDAY', 'Mon'],
  ['TUESDAY', 'Tue'],
  ['WEDNESDAY', 'Wed'],
  ['THURSDAY', 'Thu'],
  ['FRIDAY', 'Fri'],
  ['SATURDAY', 'Sat'],
  ['SUNDAY', 'Sun'],
]
const MODES = [
  ['closed', 'Closed'],
  ['open', 'Open'],
  ['allday', '24 hours'],
]
const NEW_SESSION = { opens: '11:00', closes: '21:00' }
const ALL_DAY = { opens: '00:00', closes: '00:00' } // same time both ends = 24 hours

const when = (iso) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })

// The catalog's week -> one editable row per day. Unknown hours start all closed.
function toRows(week) {
  return DAYS.map(([day]) => {
    const sessions = week.find((d) => d.day === day)?.sessions ?? []
    if (sessions.length === 0) return { day, mode: 'closed', sessions: [] }
    if (sessions.length === 1 && sessions[0].opens === sessions[0].closes) return { day, mode: 'allday', sessions: [] }
    return { day, mode: 'open', sessions }
  })
}

const toWeek = (rows) =>
  rows.map(({ day, mode, sessions }) => ({
    day,
    sessions: mode === 'closed' ? [] : mode === 'allday' ? [ALL_DAY] : sessions,
  }))

// Weekly hours diners see as "Open now · closes 9:30pm"; Find leaves out venues
// that are shut right now. Up to two sessions a day (lunch and dinner service).
export default function OpeningHoursForm({ venueId }) {
  const [rows, setRows] = useState(null)
  const [savedRows, setSavedRows] = useState(null) // what diners see now
  const [updatedAt, setUpdatedAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const show = (hours) => {
    const shown = toRows(hours.week)
    setRows(shown)
    setSavedRows(shown)
    setUpdatedAt(hours.updatedAt)
  }
  const changed = rows !== null && JSON.stringify(toWeek(rows)) !== JSON.stringify(toWeek(savedRows))

  useEffect(() => {
    getHours(venueId)
      .then(show)
      .catch((err) => setError(err.message))
  }, [venueId])

  const edit = (index, change) => {
    setSaved(false)
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)))
  }

  const setMode = (index, mode) =>
    edit(index, { mode, sessions: mode === 'open' && rows[index].sessions.length === 0 ? [NEW_SESSION] : rows[index].sessions })

  const setTime = (index, s, field, value) =>
    edit(index, { sessions: rows[index].sessions.map((session, j) => (j === s ? { ...session, [field]: value } : session)) })

  const copyMondayToAll = () => {
    setSaved(false)
    setRows((current) => current.map((row) => ({ ...current[0], day: row.day })))
  }

  const save = async (e) => {
    e.preventDefault()
    const same = rows.find((r) => r.mode === 'open' && r.sessions.some((s) => s.opens === s.closes))
    if (same) {
      setError(`${DAYS.find(([d]) => d === same.day)[1]}: opening and closing times are the same - choose "24 hours" instead`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      show(await setHours(venueId, toWeek(rows)))
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const openDays = savedRows?.filter((r) => r.mode !== 'closed').length
  const summary = !savedRows ? null : updatedAt ? `Open ${openDays} day${openDays === 1 ? '' : 's'} a week · updated ${when(updatedAt)}` : 'Not set yet'

  return (
    <Fold id="hours" title="Opening hours" summary={summary}>
      <div className="status-now">
        {updatedAt ? (
          <>
            Diners see these hours
            <span className="status-when"> · updated {when(updatedAt)}</span>
          </>
        ) : (
          'No hours set yet - diners see nothing about when you open. Mark the days you open below.'
        )}
      </div>
      {!rows && !error && <div className="loading">Loading your hours…</div>}

      {rows && (
        <form className="hours-form" onSubmit={save}>
          {rows.map((row, i) => {
            const label = DAYS[i][1]
            return (
              <div key={row.day} className="hours-day">
                <span className="hours-day-name">{label}</span>
                <div className="hours-mode" role="radiogroup" aria-label={`${label} opening`}>
                  {MODES.map(([mode, text]) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={row.mode === mode}
                      className={`hours-mode-btn ${mode}`}
                      onClick={() => setMode(i, mode)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                {row.mode === 'open' && (
                  <div className="hours-sessions">
                    {row.sessions.map((session, s) => (
                      <div key={s} className="hours-session">
                        <input type="time" required value={session.opens} onChange={(e) => setTime(i, s, 'opens', e.target.value)} aria-label={`${label} opens`} />
                        <span aria-hidden="true">–</span>
                        <input type="time" required value={session.closes} onChange={(e) => setTime(i, s, 'closes', e.target.value)} aria-label={`${label} closes`} />
                        {session.closes < session.opens && <small className="hours-hint">past midnight</small>}
                        {row.sessions.length > 1 && (
                          <button type="button" className="hours-remove" onClick={() => edit(i, { sessions: row.sessions.filter((_, j) => j !== s) })} aria-label={`Remove this ${label} session`}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {row.sessions.length < 2 && (
                      <button type="button" className="hours-add" onClick={() => edit(i, { sessions: [...row.sessions, { opens: '17:30', closes: '21:00' }] })}>
                        + Second session (e.g. dinner)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {error && <div className="error">{error}</div>}
          {saved && <div className="ok-note">Saved. Diners see the new hours the next time their feed refreshes.</div>}

          <div className="row-actions">
            <button type="submit" className="btn go" disabled={busy}>
              {busy ? 'Saving…' : 'Save hours'}
            </button>
            <button type="button" className="btn quiet" onClick={copyMondayToAll} disabled={busy}>
              Copy Monday to every day
            </button>
          </div>
          <Unsaved when={changed} />
        </form>
      )}
      {!rows && error && <div className="error">{error}</div>}
    </Fold>
  )
}

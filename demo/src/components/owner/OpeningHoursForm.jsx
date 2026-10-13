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
const NEW_SESSION = { opens: '11:00', closes: '21:00' }
const SECOND_SESSION = { opens: '17:30', closes: '21:00' }
const ALL_DAY = { opens: '00:00', closes: '00:00' } // same time both ends = 24 hours

const when = (iso) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })

// "21:30" -> "9:30pm", the way diners see it
function clock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`
}

// Every quarter hour, "00:00" to "23:45".
const QUARTERS = Array.from({ length: 96 }, (_, i) =>
  `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
)

// A saved time off the quarter-hour list (say 11:10) still shows as itself.
function TimeSelect({ value, onChange, label }) {
  const options = QUARTERS.includes(value) ? QUARTERS : [...QUARTERS, value].sort()
  return (
    <select className="hours-time" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((t) => (
        <option key={t} value={t}>
          {clock(t)}
        </option>
      ))}
    </select>
  )
}

function SessionTimes({ session, label, onChange }) {
  return (
    <div className="hours-session">
      <TimeSelect value={session.opens} onChange={(v) => onChange('opens', v)} label={`${label} opens`} />
      <span aria-hidden="true">–</span>
      <TimeSelect value={session.closes} onChange={(v) => onChange('closes', v)} label={`${label} closes`} />
      {session.closes < session.opens && <small className="hours-hint">past midnight</small>}
    </div>
  )
}

// The catalog's week -> one editable row per day. Unknown hours start all closed.
function toRows(week) {
  return DAYS.map(([day]) => {
    const sessions = week.find((d) => d.day === day)?.sessions ?? []
    if (sessions.length === 0) return { day, mode: 'closed', sessions: [] }
    if (sessions.length === 1 && sessions[0].opens === sessions[0].closes) return { day, mode: 'allday', sessions: [] }
    return { day, mode: 'open', sessions }
  })
}

// A day open through the afternoon splits into lunch and dinner; the catalog rejects overlapping sessions.
function withSecondSession([first]) {
  if (first.opens <= '14:30' && first.closes >= '17:30') {
    return [{ ...first, closes: '14:30' }, { opens: '17:30', closes: first.closes }]
  }
  return [first, SECOND_SESSION]
}

const toWeek = (rows) =>
  rows.map(({ day, mode, sessions }) => ({
    day,
    sessions: mode === 'closed' ? [] : mode === 'allday' ? [ALL_DAY] : sessions,
  }))

// Weekly hours diners see as "Open now · closes 9:30pm"; Find leaves out venues
// that are shut right now. One line per day: a switch, the times, and a ⋯ menu
// for the rarer things (copy to every day, a second session, 24 hours).
export default function OpeningHoursForm({ venueId }) {
  const [rows, setRows] = useState(null)
  const [savedRows, setSavedRows] = useState(null) // what diners see now
  const [updatedAt, setUpdatedAt] = useState(null)
  const [menuFor, setMenuFor] = useState(null) // index of the day whose ⋯ menu is open
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

  // Switching a day back on restores its own times, else borrows the nearest open day above.
  const toggle = (index) => {
    const row = rows[index]
    if (row.mode !== 'closed') return edit(index, { mode: 'closed' })
    if (row.sessions.length > 0) return edit(index, { mode: 'open' })
    const above = rows.slice(0, index).reverse().find((r) => r.mode !== 'closed')
    edit(index, above ? { mode: above.mode, sessions: above.sessions } : { mode: 'open', sessions: [NEW_SESSION] })
  }

  const setTime = (index, s, field, value) =>
    edit(index, { sessions: rows[index].sessions.map((session, j) => (j === s ? { ...session, [field]: value } : session)) })

  const copyToAll = (index) => {
    setSaved(false)
    setRows((current) => current.map((row) => ({ ...current[index], day: row.day })))
  }

  // Each menu choice closes the menu.
  const pick = (action) => () => {
    action()
    setMenuFor(null)
  }

  const save = async (e) => {
    e.preventDefault()
    const same = rows.find((r) => r.mode === 'open' && r.sessions.some((s) => s.opens === s.closes))
    if (same) {
      setError(`${DAYS.find(([d]) => d === same.day)[1]}: opening and closing times are the same - choose "Open 24 hours" in its ⋯ menu instead`)
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
      {savedRows && !updatedAt && (
        <div className="status-now">No hours set yet - diners see nothing about when you open. Switch on the days you open below.</div>
      )}
      {!rows && !error && <div className="loading">Loading your hours…</div>}

      {rows && (
        <form className="hours-form" onSubmit={save}>
          <div className="hours-week">
            {rows.map((row, i) => {
              const label = DAYS[i][1]
              const menuOpen = menuFor === i && row.mode !== 'closed'
              return (
                <div key={row.day} className="hours-day">
                  <span className="hours-day-name">{label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.mode !== 'closed'}
                    aria-label={`Open on ${label}`}
                    className="hours-switch"
                    onClick={() => toggle(i)}
                  />
                  {row.mode === 'closed' && <span className="hours-off">Closed</span>}
                  {row.mode === 'allday' && <span className="hours-allday">Open 24 hours</span>}
                  {row.mode === 'open' && (
                    <SessionTimes session={row.sessions[0]} label={label} onChange={(field, v) => setTime(i, 0, field, v)} />
                  )}
                  {row.mode !== 'closed' && (
                    <button
                      type="button"
                      className="hours-more"
                      aria-label={`More options for ${label}`}
                      aria-expanded={menuOpen}
                      onClick={() => setMenuFor(menuOpen ? null : i)}
                    >
                      ⋯
                    </button>
                  )}
                  {row.mode === 'open' && row.sessions[1] && (
                    <>
                      <SessionTimes session={row.sessions[1]} label={`${label} second session`} onChange={(field, v) => setTime(i, 1, field, v)} />
                      <button type="button" className="hours-remove" onClick={() => edit(i, { sessions: row.sessions.slice(0, 1) })} aria-label={`Remove the second ${label} session`}>
                        ✕
                      </button>
                    </>
                  )}
                  {menuOpen && (
                    <div className="hours-menu" role="group" aria-label={`${label} options`} onKeyDown={(e) => e.key === 'Escape' && setMenuFor(null)}>
                      <button type="button" onClick={pick(() => copyToAll(i))}>
                        Copy {label} to every day
                      </button>
                      {row.mode === 'open' && (
                        row.sessions.length < 2 ? (
                          <button type="button" onClick={pick(() => edit(i, { sessions: withSecondSession(row.sessions) }))}>
                            Add a second session
                          </button>
                        ) : (
                          <button type="button" onClick={pick(() => edit(i, { sessions: row.sessions.slice(0, 1) }))}>
                            Remove second session
                          </button>
                        )
                      )}
                      {row.mode === 'open' ? (
                        <button type="button" onClick={pick(() => edit(i, { mode: 'allday' }))}>
                          Open 24 hours
                        </button>
                      ) : (
                        <button type="button" onClick={pick(() => edit(i, { mode: 'open', sessions: row.sessions.length ? row.sessions : [NEW_SESSION] }))}>
                          Set opening times
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {error && <div className="error">{error}</div>}
          {saved && <div className="ok-note">Saved. Diners see the new hours the next time their feed refreshes.</div>}

          <div className="row-actions">
            <button type="submit" className="btn go" disabled={busy}>
              {busy ? 'Saving…' : 'Save hours'}
            </button>
          </div>
          <Unsaved when={changed} />
        </form>
      )}
      {!rows && error && <div className="error">{error}</div>}
    </Fold>
  )
}

import { useEffect, useState } from 'react'
import { getVenueUpdates, reportVenueStatus } from '../../api/catalogApi.js'
import { Fold, Unsaved } from '../Accordion.jsx'

const STATUSES = [
  { id: 'OPEN', label: 'Open as usual', cls: 'open' },
  { id: 'TEMPORARILY_CLOSED', label: 'Closed for now', cls: 'paused' },
  { id: 'CLOSED', label: 'Closed for good', cls: 'closed' },
  { id: 'MOVED', label: 'We moved', cls: 'moved' },
]
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]))

const when = (iso) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })

// Owners tell diners what changed. Diners see it on their next refresh:
// closed venues drop out of recommendations, moves show the new address.
export default function VenueStatusForm({ venueId }) {
  const [history, setHistory] = useState(null)
  const [status, setStatus] = useState(null)
  const [newAddress, setNewAddress] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [posted, setPosted] = useState(false)

  const load = () =>
    getVenueUpdates(venueId)
      .then(setHistory)
      .catch((err) => setError(err.message))

  useEffect(() => {
    load()
  }, [venueId])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await reportVenueStatus(venueId, {
        status,
        newAddress: status === 'MOVED' ? newAddress.trim() : null,
        note: note.trim() || null,
      })
      setStatus(null)
      setNewAddress('')
      setNote('')
      setPosted(true)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const current = history?.[0]
  // A move stays true after later updates, so diners see the latest moved-to address.
  const movedTo = history?.find((u) => u.status === 'MOVED')?.newAddress

  const summary = current ? `Diners see: ${STATUS_LABEL[current.status]}` : history && 'Nothing posted yet'

  return (
    <Fold id="status" title="Tell diners what changed" summary={summary}>
      <div className="status-now">
        {current ? (
          <>
            Diners currently see: <strong>{STATUS_LABEL[current.status]}</strong>
            {movedTo && <> at {movedTo}</>}
            <span className="status-when"> · posted {when(current.reportedAt)}</span>
          </>
        ) : (
          'No update posted yet - diners see the open-data listing.'
        )}
      </div>

      <form className="status-form" onSubmit={submit}>
        <div className="status-choices" role="radiogroup" aria-label="Venue status">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={status === s.id}
              className={`status-choice ${s.cls}`}
              onClick={() => {
                setStatus(s.id)
                setPosted(false)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {status === 'MOVED' && (
          <label className="field">
            <span>New address</span>
            <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} maxLength={200} placeholder="35 Selegie Rd, #01-C2 Parklane Shopping Mall" required />
          </label>
        )}
        {status && (
          <label className="field">
            <span>Note for diners (optional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Back after renovation on 1 Oct" />
          </label>
        )}

        {error && <div className="error">{error}</div>}
        {posted && <div className="ok-note">Posted. Diners will see it the next time their feed refreshes.</div>}

        {status && (
          <div className="row-actions">
            <button type="submit" className="btn go" disabled={busy || (status === 'MOVED' && !newAddress.trim())}>
              {busy ? 'Posting…' : 'Post update'}
            </button>
          </div>
        )}
        <Unsaved when={status !== null} />
      </form>

      {history?.length > 1 && (
        <details className="status-history">
          <summary>Earlier updates ({history.length - 1})</summary>
          <ul className="plain-list">
            {history.slice(1).map((u) => (
              <li key={u.id}>
                {when(u.reportedAt)} - {STATUS_LABEL[u.status]}
                {u.newAddress && ` (${u.newAddress})`}
                {u.note && `: ${u.note}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Fold>
  )
}

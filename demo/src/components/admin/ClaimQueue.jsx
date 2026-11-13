import { useEffect, useState } from 'react'
import { approveClaim, listClaims, rejectClaim } from '../../api/accountApi.js'
import { getVenue } from '../../api/catalogApi.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Accordion, Fold, Unsaved } from '../Accordion.jsx'
import { claimVenueCheck } from './claimVenue.js'

const FILTERS = [
  { id: 'PENDING', label: 'Waiting' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'ALL', label: 'All' },
]
const when = (iso) => new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function ClaimCard({ claim, isMine, onDecided }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const decide = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onDecided()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  // A waiting claim is checked against the catalog when it's opened: the name on it
  // is the claimant's own, and approving goes by the venue id (claimVenue.js).
  const [lookup, setLookup] = useState(null)
  const pending = claim.status === 'PENDING'
  const checkVenue = () => {
    if (!pending) return
    setLookup(null)
    getVenue(claim.venueId)
      .then((venue) => setLookup({ venue }))
      .catch((err) => setLookup(err.status === 404 ? { missing: true } : { failed: true }))
  }
  const place = claimVenueCheck(claim, lookup)

  const who = claim.claimant.displayName ?? 'Unknown account'
  return (
    <li>
      <Fold
        id={claim.id}
        sub
        title={place.name}
        summary={`${isMine ? 'You' : who} · ${when(claim.createdAt)}`}
        aside={<span className={`pill ${claim.status.toLowerCase()}`}>{claim.status.toLowerCase()}</span>}
        onOpen={checkVenue}
      >
        <div className="venue-row-meta">
          {who}
          {claim.claimant.username && ` · @${claim.claimant.username}`} · {when(claim.createdAt)} · {claim.venueId}
        </div>
        {place.address && <div className="venue-row-meta">{place.address}</div>}
        {place.problem && <div className="error" role="alert">{place.problem}</div>}
        <blockquote className="claim-proof">{claim.proof}</blockquote>
        {claim.rejectReason && <div className="claim-reason">Rejected: “{claim.rejectReason}”</div>}

        {pending && (
          rejecting ? (
            <div className="reject-box">
              <label className="field">
                <span>Why? {claim.claimant.displayName ?? 'They'} will see this</span>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="We couldn't match the UEN to this venue" autoFocus />
              </label>
              <div className="row-actions">
                <button type="button" className="btn stop" disabled={!reason.trim() || busy} onClick={() => decide(() => rejectClaim(claim.id, reason.trim()))}>
                  Reject claim
                </button>
                <button type="button" className="btn quiet" onClick={() => setRejecting(false)}>
                  Back
                </button>
              </div>
              <Unsaved when={reason.trim() !== ''} />
            </div>
          ) : (
            <div className="row-actions">
              <button type="button" className="btn go" disabled={busy || !lookup?.venue} onClick={() => decide(() => approveClaim(claim.id))}>
                {lookup ? `Approve: ${who} manages ${place.name}` : 'Checking the place…'}
              </button>
              <button type="button" className="btn stop" disabled={busy} onClick={() => setRejecting(true)}>
                Reject…
              </button>
            </div>
          )
        )}
        {error && <div className="error">{error}</div>}
      </Fold>
    </li>
  )
}

export default function ClaimQueue() {
  const { me } = useAuth()
  const [filter, setFilter] = useState('PENDING')
  const [claims, setClaims] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    setError(null)
    return listClaims(filter)
      .then(setClaims)
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    setClaims(null)
    load()
  }, [filter])

  // Your own pending claims need another admin, so they don't count as yours to review.
  const shown = FILTERS.find((f) => f.id === filter)
  const pending = claims?.filter((c) => c.status === 'PENDING') ?? []
  const mine = pending.filter((c) => c.claimant.id === me.id).length
  const toReview = pending.length - mine
  const summary = claims && [
    claims.length === 0 && filter === 'PENDING' ? 'Nothing waiting' : `${claims.length} ${filter === 'ALL' ? 'in total' : shown.label.toLowerCase()}`,
    mine > 0 && (mine === 1 ? '1 is yours' : `${mine} are yours`),
  ].filter(Boolean).join(' · ')

  return (
    <Fold
      id="claims"
      title="Venue claims"
      summary={summary}
      aside={toReview > 0 && <span className="pill pending">{toReview} to review</span>}
      onOpen={load}
    >
      <p className="panel-note">Check the proof, then approve or reject. Approving makes the claimant an owner of that venue.</p>
      <div className="filter-row" role="group" aria-label="Show claims">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {!claims && !error && <div className="loading">Loading claims…</div>}
      {claims?.length === 0 && (
        <p className="panel-note">{filter === 'PENDING' ? 'Nothing waiting. New claims show up here.' : 'No claims here.'}</p>
      )}
      {claims?.length > 0 && (
        <Accordion>
          <ul className="fold-list">
            {claims.map((c) => (
              <ClaimCard key={c.id} claim={c} isMine={c.claimant.id === me.id} onDecided={load} />
            ))}
          </ul>
        </Accordion>
      )}
    </Fold>
  )
}

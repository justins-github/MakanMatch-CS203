import { useEffect, useState } from 'react'
import { approveClaim, listClaims, rejectClaim } from '../../api/accountApi.js'
import { useAuth } from '../../auth/AuthContext.jsx'

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

  const who = claim.claimant.displayName ?? 'Unknown account'
  return (
    <li className="claim-card">
      <div className="claim-card-head">
        <span className="claim-venue">{claim.venueName}</span>
        <span className={`pill ${claim.status.toLowerCase()}`}>{claim.status.toLowerCase()}</span>
      </div>
      <div className="venue-row-meta">
        {who}
        {claim.claimant.username && ` · @${claim.claimant.username}`} · {when(claim.createdAt)} · {claim.venueId}
      </div>
      <blockquote className="claim-proof">{claim.proof}</blockquote>
      {claim.rejectReason && <div className="claim-reason">Rejected: “{claim.rejectReason}”</div>}

      {claim.status === 'PENDING' && (
        isMine ? (
          <p className="panel-note">This is your own claim. Another admin has to review it.</p>
        ) : rejecting ? (
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
          </div>
        ) : (
          <div className="row-actions">
            <button type="button" className="btn go" disabled={busy} onClick={() => decide(() => approveClaim(claim.id))}>
              Approve: {who} manages {claim.venueName}
            </button>
            <button type="button" className="btn stop" disabled={busy} onClick={() => setRejecting(true)}>
              Reject…
            </button>
          </div>
        )
      )}
      {error && <div className="error">{error}</div>}
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

  return (
    <section className="admin-section">
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
        <ul className="claim-cards">
          {claims.map((c) => (
            <ClaimCard key={c.id} claim={c} isMine={c.claimant.id === me.id} onDecided={load} />
          ))}
        </ul>
      )}
    </section>
  )
}

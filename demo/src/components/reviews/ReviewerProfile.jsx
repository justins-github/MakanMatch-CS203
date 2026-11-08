import { useEffect, useState } from 'react'
import { requestKaki } from '../../api/accountApi.js'
import { getReviewer } from '../../api/engineApi.js'
import Avatar from '../kakis/Avatar.jsx'
import { RadarChart } from '../TasteDna.jsx'
import { Verdict } from './ReviewParts.jsx'
import { relativeDay } from './when.js'

function AddKaki({ person }) {
  const [status, setStatus] = useState(person.kakiStatus)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (person.isYou || status === 'unknown') return null
  if (status === 'kaki') return <span className="rv-pill kaki">Your kaki</span>
  if (status === 'asked') return <span className="rv-pill">Asked</span>
  if (!person.username) return null // kakis are added by username

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await requestKaki(person.username)
      setStatus(next.kakis.some((k) => k.id === person.id) ? 'kaki' : 'asked')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="btn" disabled={busy} onClick={add}>
        {busy ? 'Sending…' : '+ Add as kaki'}
      </button>
      {error && <div className="error">{error}</div>}
    </>
  )
}

// Someone else's taste next to yours, and what they've been reviewing. Never their email,
// dietary needs or the venues they own: the engine doesn't send those.
export default function ReviewerProfile({ id, onBack }) {
  const [person, setPerson] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    getReviewer(id)
      .then((answer) => live && setPerson(answer))
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [id])

  return (
    <main className="account rv-profile">
      <button type="button" className="back-link" onClick={onBack}>← Back</button>
      {error && <div className="error">Profile unavailable: {error}</div>}
      {!error && !person && <div className="loading">Loading…</div>}
      {person && (
        <>
          <header className="rv-profile-head">
            <Avatar id={person.id} name={person.displayName} large />
            <div className="rv-profile-who">
              <h2 className="step-title">{person.isYou ? 'You' : person.displayName}</h2>
              <div className="rv-handle">
                {person.username && `@${person.username} · `}
                {person.reviewCount} review{person.reviewCount === 1 ? '' : 's'}
              </div>
            </div>
            {!person.isYou && (
              <div className="sticker rv-sticker">
                {person.closeness == null ? (
                  <span className="label">new here</span>
                ) : (
                  <>
                    <span className="pct">{person.closeness}%</span>
                    <span className="label">like you</span>
                  </>
                )}
              </div>
            )}
          </header>

          <div className="rv-actions"><AddKaki person={person} /></div>

          {person.dimensions && (
            <section>
              <div className="rv-title">Taste</div>
              <div className="rv-chart">
                <RadarChart
                  dimensions={person.dimensions}
                  compare={person.isYou ? null : person.yourDimensions}
                  label={person.isYou ? 'Radar chart of your taste' : `Radar chart of ${person.displayName}'s taste next to yours`}
                />
              </div>
              {!person.isYou && (
                <div className="rv-legend">
                  <span><i className="them" />{person.displayName}</span>
                  <span><i className="you" />You</span>
                </div>
              )}
              {person.agreements.map((line) => <div key={line} className="rv-agrees">{line}</div>)}
            </section>
          )}

          <section>
            <div className="rv-title">Recent reviews</div>
            {person.reviews.length === 0 && <div className="rv-note">No reviews yet.</div>}
            {person.reviews.map((review) => (
              <div key={`${review.dishId}-${review.at}`} className="rv-row">
                <div className="rv-body">
                  <div className="rv-who plain">{review.venueName || review.dishName}</div>
                  <div className="rv-tags"><Verdict sentiment={review.sentiment} /></div>
                  {review.text && <div className="rv-said">{review.text}</div>}
                  <div className="rv-meta">
                    {review.venueName ? `${review.dishName} · ` : ''}{relativeDay(review.at)}
                  </div>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  )
}

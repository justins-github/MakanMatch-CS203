import { useEffect, useState } from 'react'
import { getChangeExplanation } from '../api/engineApi.js'
import EmbeddedMap from './EmbeddedMap.jsx'
import Avatar from './kakis/Avatar.jsx'

const CONFIDENCE_DOTS = { high: 3, medium: 2, low: 1 }
const CONFIDENCE_TEXT = {
  high: 'high confidence',
  medium: 'medium confidence',
  low: 'low confidence - sparse or ageing data',
}

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })

// What the venue's owner last told us, kept visibly separate from the open data.
function OwnerUpdate({ update }) {
  if (!update) return null
  const detail = update.status === 'MOVED'
    ? `Moved to ${update.currentAddress}`
    : update.note || 'Open as usual'
  return (
    <div className={`owner-update ${update.status.toLowerCase()}`}>
      <span className="owner-update-label">Owner update · {shortDate(update.reportedAt)}</span>
      {detail}
      {update.status === 'MOVED' && update.note && <> · {update.note}</>}
    </div>
  )
}

const money = (v) => `$${Number(v).toFixed(2)}`
const REPORT = {
  MOVED: (u) => ['moved', `To ${u.newAddress}`],
  CLOSED: () => ['closed', 'Closed'],
  TEMPORARILY_CLOSED: (u) => ['closed', u.note ? `Temporarily closed · ${u.note}` : 'Temporarily closed'],
  OPEN: (u) => ['update', u.note || 'Open as usual'],
}
const MAX_ROWS = 4 // a big menu reload shouldn't turn the card into a list

// Why the match moved (CSD-52): the plain sentence at once, Claude's version when it arrives.
function WhyItChanged({ venueId, plain }) {
  const [why, setWhy] = useState(plain)
  useEffect(() => {
    let live = true
    getChangeExplanation(venueId)
      .then((r) => live && r.explanation?.writtenBy === 'ai' && setWhy(r.explanation))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [venueId])
  return (
    <div className="since-visit-why">
      {why.text}
      {why.writtenBy === 'ai' && <span className="since-visit-who">Claude</span>}
    </div>
  )
}

// What changed at a place you've reviewed, since your latest review there (CSD-50).
function SinceLastVisit({ venueId, changes }) {
  const rows = [
    ...changes.prices.map((p) => ['price', p.from == null
      ? `${p.name} now ${money(p.to)}`
      : <>{p.name} <span className={p.to > p.from ? 'pricier' : 'cheaper'}>{money(p.from)} → {money(p.to)}</span></>]),
    ...changes.added.map((d) => ['new', d.price != null ? `${d.name} · ${money(d.price)}` : d.name]),
    ...changes.removed.map((d) => ['gone', d.name]),
    ...changes.updates.map((u) => {
      const [tag, text] = (REPORT[u.status] ?? REPORT.OPEN)(u)
      return [tag, `${text} (owner, ${shortDate(u.reportedAt)})`]
    }),
  ]
  return (
    <div className="since-visit">
      <div className="since-visit-label">Since your last visit · {shortDate(changes.since)}</div>
      {/* CSD-51: what the venue's changes did to your match (your taste today, then vs now). */}
      {changes.match && (
        <div className={`since-visit-match ${changes.match.now > changes.match.was ? 'up' : 'down'}`}>
          {changes.match.now > changes.match.was ? '▲' : '▼'} Match was {changes.match.was}%, now {changes.match.now}%
        </div>
      )}
      {/* Keyed on the plain text so a re-run Find with different changes starts afresh. */}
      {changes.match && changes.explanation && (
        <WhyItChanged key={changes.explanation.text} venueId={venueId} plain={changes.explanation} />
      )}
      {rows.length === 0 ? (
        <div className="since-visit-quiet">The menu and prices haven't changed.</div>
      ) : (
        rows.slice(0, MAX_ROWS).map(([tag, text], i) => (
          <div key={i} className="since-visit-row">
            <span className="since-visit-tag">{tag}</span>
            <span>{text}</span>
          </div>
        ))
      )}
      {rows.length > MAX_ROWS && <div className="since-visit-quiet">and {rows.length - MAX_ROWS} more changes</div>}
    </div>
  )
}

// On a group card: how well the place suits each person. The first is always you.
function GroupScores({ scores }) {
  return (
    <div className="group-scores" aria-label={scores.map((s, i) => `${i === 0 ? 'You' : s.name} ${s.score}%`).join(', ')}>
      {scores.map((s, i) => (
        <span key={s.id} className="group-score" title={i === 0 ? 'You' : s.name}>
          <Avatar id={i === 0 ? 'you' : s.id} name={i === 0 ? 'You' : s.name} small />
          {s.score}
        </span>
      ))}
    </div>
  )
}

export default function VenueCard({ venue, index }) {
  const [showMap, setShowMap] = useState(false)
  const dots = CONFIDENCE_DOTS[venue.confidence]

  // Construct a fallback address string for the map popup
  const fullAddress = [venue.area, venue.address ?? venue.postcode].filter(Boolean).join(' · ')

  return (
    <article
      className={`card${venue.experimental ? ' experimental' : ''}`}
      style={{ '--i': index }}
    >
      {venue.experimental && <div className="exp-eyebrow">Experimental pick</div>}
      <h2>{venue.name}</h2>
      {venue.signature && <div className="dish">{venue.signature}</div>}
      <div className="meta">
        {fullAddress}
      </div>
      {venue.hours ? (
        <div className="hours-line">{venue.hours.label}</div>
      ) : (
        <div className="hours-line unknown">Hours unknown · check before you go</div>
      )}
      {/* The owner's latest report is shown once: in "Since your last visit" if it's new to you. */}
      {!venue.sinceLastVisit?.updates.some((u) => u.reportedAt === venue.ownerUpdate?.reportedAt) && (
        <OwnerUpdate update={venue.ownerUpdate} />
      )}
      {venue.sinceLastVisit && <SinceLastVisit venueId={venue.id} changes={venue.sinceLastVisit} />}
      {venue.groupScores && <GroupScores scores={venue.groupScores} />}
      <div className="chips">
        {venue.why.map((reason, i) => (
          <span key={reason} className={`why${i === 0 ? ' lead' : ''}`}>
            {reason}
          </span>
        ))}
      </div>
      <div
        className="confidence"
        title="Based on review volume and how recently we confirmed this venue's data"
      >
        {[1, 2, 3].map((n) => (
          <span key={n} className={`dot${n <= dots ? ` on-${venue.confidence}` : ''}`} />
        ))}
        {CONFIDENCE_TEXT[venue.confidence]}
      </div>
      <div
        className="sticker"
        aria-label={venue.groupScores ? `Group score ${venue.matchScore} percent` : `Match score ${venue.matchScore} percent`}
      >
        <span className="pct">{venue.matchScore}%</span>
        <span className="label">{venue.groupScores ? `all ${venue.groupScores.length}` : 'match'}</span>
      </div>

      {/* Map Toggle Section */}
      <div className="map-section" style={{ marginTop: '14px' }}>
        <button
          type="button"
          className="map-toggle-btn"
          onClick={() => setShowMap((v) => !v)}
          style={{
            background: 'none',
            border: '1px solid rgba(0,0,0,0.15)',
            padding: '6px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {showMap ? 'Hide map 🗺️' : 'View map & directions 🗺️'}
        </button>

        {showMap && (
          <div style={{ marginTop: '12px' }}>
            <EmbeddedMap
              latitude={venue.latitude}
              longitude={venue.longitude}
              placeName={venue.name}
              address={fullAddress}
            />
          </div>
        )}
      </div>
    </article>
  )
}

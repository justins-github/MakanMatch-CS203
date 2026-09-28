import { useState } from 'react'
import EmbeddedMap from './EmbeddedMap.jsx'

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
    : [update.openingHours, update.note].filter(Boolean).join(' · ') || 'Open as usual'
  return (
    <div className={`owner-update ${update.status.toLowerCase()}`}>
      <span className="owner-update-label">Owner update · {shortDate(update.reportedAt)}</span>
      {detail}
      {update.status === 'MOVED' && update.note && <> · {update.note}</>}
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
      <OwnerUpdate update={venue.ownerUpdate} />
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
      <div className="sticker" aria-label={`Match score ${venue.matchScore} percent`}>
        <span className="pct">{venue.matchScore}%</span>
        <span className="label">match</span>
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

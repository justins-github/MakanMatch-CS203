const CONFIDENCE_DOTS = { high: 3, medium: 2, low: 1 }
const CONFIDENCE_TEXT = {
  high: 'high confidence',
  medium: 'medium confidence',
  low: 'low confidence - sparse or ageing data',
}

export default function VenueCard({ venue, index }) {
  const dots = CONFIDENCE_DOTS[venue.confidence]

  return (
    <article
      className={`card${venue.experimental ? ' experimental' : ''}`}
      style={{ '--i': index }}
    >
      {venue.experimental && <div className="exp-eyebrow">Experimental pick</div>}
      <h2>{venue.name}</h2>
      {venue.signature && <div className="dish">{venue.signature}</div>}
      <div className="meta">
        {[venue.area, venue.address ?? venue.postcode].filter(Boolean).join(' · ')}
      </div>
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
    </article>
  )
}

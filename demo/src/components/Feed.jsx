import VenueCard from './VenueCard.jsx'

const MOOD_NOTES = {
  soupy: 'Re-ranked for something soupy',
  spicy: 'Re-ranked for heat',
  light: 'Re-ranked for something light',
}

const CLOSED_LABEL = { CLOSED: 'closed for good', TEMPORARILY_CLOSED: 'closed for now' }

// "A (x), B (y) and 3 more"
function nameSome(venues, detail) {
  const named = venues.slice(0, 2).map((v) => `${v.name} (${detail(v)})`).join(', ')
  return venues.length > 2 ? `${named} and ${venues.length - 2} more` : named
}

// Owners' reports and hours change the feed; say so, so a missing favourite isn't a mystery.
function OwnerReportsNote({ reports }) {
  if (!reports) return null
  if (!reports.available) {
    return <div className="rerank-note">Owner updates are unavailable right now, so a recent closure might not show.</div>
  }
  const closed = reports.closedNearby ?? []
  const shut = reports.shutNow ?? []
  return (
    <>
      {closed.length > 0 && (
        <div className="rerank-note">
          Left out because their owners reported them closed: {nameSome(closed, (v) => CLOSED_LABEL[v.status] ?? 'closed')}.
        </div>
      )}
      {shut.length > 0 && (
        <div className="rerank-note">Left out because they're shut right now: {nameSome(shut, (v) => v.next)}.</div>
      )}
    </>
  )
}

export default function Feed({ mode, data, onFind, onSurprise, onAnother, onBack }) {
  if (mode === 'idle') {
    return (
      <main className="feed">
        <div className="landing">
          <div className="landing-loc">📍 Near SMU · walkable in 20 min</div>
          <h2 className="landing-title">What are we eating?</h2>
          <p className="landing-note">
            Every Singapore venue we know, matched live against your Taste DNA.
          </p>
          <button className="big-btn" onClick={onFind}>
            🍽️ Find me a restaurant
          </button>
          <button className="big-btn surprise" onClick={onSurprise}>
            🎲 Surprise me
          </button>
        </div>
      </main>
    )
  }

  if (!data) return <div className="loading">Finding your matches…</div>

  // keyed on the ranking inputs so the entrance animation replays on re-rank
  const rankKey = `${data.mode}-${data.mood}-${data.context.raining}-${data.venues[0]?.id ?? 'none'}`

  return (
    <main className="feed" key={rankKey}>
      <button className="back-link" onClick={onBack}>
        ← Back
      </button>
      {MOOD_NOTES[data.mood] && <div className="rerank-note">{MOOD_NOTES[data.mood]}</div>}
      <OwnerReportsNote reports={data.ownerReports} />
      {mode === 'surprise' && data.venues.length === 0 && (
        <div className="loading">No surprises left within a walk - you've met them all. Reset or go find instead.</div>
      )}
      {data.venues.map((venue, i) => (
        <VenueCard key={venue.id} venue={venue} index={i} />
      ))}
      {mode === 'surprise' && data.venues.length > 0 && (
        <button className="teach-btn" onClick={onAnother}>
          🎲 Another surprise
        </button>
      )}
    </main>
  )
}

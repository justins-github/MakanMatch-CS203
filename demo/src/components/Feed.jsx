import VenueCard from './VenueCard.jsx'

const MOOD_NOTES = {
  soupy: 'Re-ranked for something soupy',
  spicy: 'Re-ranked for heat',
  light: 'Re-ranked for something light',
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

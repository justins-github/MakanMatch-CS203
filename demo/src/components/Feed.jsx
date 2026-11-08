import { useState } from 'react'
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
  // Places you've been that closed since your last visit get their own line (CSD-50).
  const yours = (reports.closedNearby ?? []).filter((v) => v.closedSinceYourVisit)
  const closed = (reports.closedNearby ?? []).filter((v) => !v.closedSinceYourVisit)
  const shut = reports.shutNow ?? []
  return (
    <>
      {yours.length > 0 && (
        <div className="rerank-note">
          Since your last visit, the owner reported{' '}
          {yours.map((v) => `${v.name} ${CLOSED_LABEL[v.status] ?? 'closed'}${v.note ? ` (${v.note})` : ''}`).join(', ')}.
        </div>
      )}
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

// "you and Jia Hui", "you, Jia Hui and Arun"
const listNames = (names) => `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

// Who the list is for, and when the 75% floor had to come down.
function GroupNote({ group }) {
  if (!group) return null
  return (
    <>
      <div className="rerank-note">Best for {listNames(['you', ...group.members.slice(1).map((m) => m.name)])}.</div>
      {group.relaxed && (
        <div className="rerank-note">
          Nobody hits {group.aimedFloor}% for all of you, so these keep everyone at {group.floor}% or more.
        </div>
      )}
    </>
  )
}

// Never says whose needs they were: that's theirs to share.
function DietaryNote({ dietary, group }) {
  const dropped = dietary?.dropped ?? 0
  if (dropped === 0) return null
  return (
    <div className="rerank-note">
      Left out {dropped.toLocaleString('en-SG')} place{dropped === 1 ? '' : 's'} that don't suit {group ? "everyone's" : 'your'} dietary needs.
    </div>
  )
}

function Empty({ mode, group, walkMin }) {
  if (group) {
    return (
      <div className="loading">
        {mode === 'surprise'
          ? "No surprises left that suit all of you. Go back and find instead."
          : `No place nearby works for all of you, even keeping everyone at ${group.floor}%. Try fewer kakis.`}
      </div>
    )
  }
  return mode === 'surprise' ? (
    <div className="loading">
      No surprises left within a {walkMin}-min walk - you've met them all. Try a longer walk, another spot, or go find instead.
    </div>
  ) : (
    <div className="loading">Nothing within a {walkMin}-min walk fits right now. Try a longer walk or another spot.</div>
  )
}

export default function Feed({ mode, data, onFind, onSurprise, onAnother, onPrevious, onBack, onReview, onOpenReviewer, moves = null }) {
  const [openId, setOpenId] = useState(null) // one card open at a time
  if (mode === 'idle') {
    return (
      <main className="feed">
        <div className="landing">
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

  const dropped = data.droppedByReviews ?? []
  const card = (venue, i) => (
    <VenueCard
      key={venue.id}
      venue={venue}
      index={i}
      open={openId === venue.id}
      onToggle={() => setOpenId((id) => (id === venue.id ? null : venue.id))}
      onReview={onReview}
      onOpenReviewer={onOpenReviewer}
      move={moves?.get(venue.id) ?? null}
    />
  )

  // keyed on the ranking inputs so the entrance animation replays on re-rank
  const rankKey = `${data.mode}-${data.mood}-${data.context.raining}-${data.venues[0]?.id ?? 'none'}`

  return (
    <main className="feed" key={rankKey}>
      <button className="back-link" onClick={onBack}>
        ← {data.group ? "Who's coming" : 'Back'}
      </button>
      <GroupNote group={data.group} />
      {MOOD_NOTES[data.mood] && <div className="rerank-note">{MOOD_NOTES[data.mood]}</div>}
      <DietaryNote dietary={data.dietary} group={data.group} />
      <OwnerReportsNote reports={data.ownerReports} />
      {data.venues.length === 0 && <Empty mode={mode} group={data.group} walkMin={data.near?.walkMin ?? 20} />}
      {data.venues.map(card)}
      {/* Reviews pushed these out of your top 10; say so, so they don't just vanish. */}
      {dropped.length > 0 && <div className="rv-dropped-title">Dropped out because of recent reviews</div>}
      {dropped.map((venue, i) => card(venue, data.venues.length + i))}
      {mode === 'surprise' && data.venues.length > 0 && (
        <button className="teach-btn" onClick={onAnother}>
          🎲 Another surprise
        </button>
      )}
      {mode === 'surprise' && onPrevious && (
        <button className="back-link" onClick={onPrevious}>
          ← Previous pick
        </button>
      )}
    </main>
  )
}

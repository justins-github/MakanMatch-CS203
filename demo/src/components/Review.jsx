import { useEffect, useRef, useState } from 'react'
import { addDish as addCatalogDish } from '../api/catalogApi.js'
<<<<<<< Updated upstream
import { getProfile, getRankings, getVenueDishes, postBeliReview, searchVenues } from '../api/engineApi.js'
=======
import { getProfile, getRankings, getVenueDishes, postBeliReview, searchVenues, undoReview } from '../api/engineApi.js'
>>>>>>> Stashed changes

// Venue name with the server-computed match ranges bolded.
function HighlightedName({ name, highlight }) {
  if (!highlight?.length) return name
  const parts = []
  let pos = 0
  highlight.forEach((h, i) => {
    if (h.start > pos) parts.push(name.slice(pos, h.start))
    parts.push(<b key={i}>{name.slice(h.start, h.start + h.len)}</b>)
    pos = h.start + h.len
  })
  if (pos < name.length) parts.push(name.slice(pos))
  return parts
}

const SEARCH_DEBOUNCE_MS = 200
const queryIsSearchable = (q) => q.replace(/[^\p{L}\p{N}]+/gu, '').length >= 2

const SENTIMENTS = [
  { id: 'loved', label: 'Loved it', cls: 'loved' },
  { id: 'fine', label: 'It was fine', cls: 'fine' },
  { id: 'disliked', label: 'Not for me', cls: 'disliked' },
]

function AccuracyMeter({ accuracy }) {
  if (accuracy.count === 0) {
    return (
      <div className="meter">
        <div className="meter-label">Model accuracy</div>
        <div className="meter-empty">
          No reviews yet - the AI is predicting from a neutral starting profile. Review dishes to train it.
        </div>
      </div>
    )
  }
  return (
    <div className="meter">
      <div className="meter-label">Model accuracy</div>
      <div className="meter-row">
        <span className="meter-bar">
          <span className="meter-fill" style={{ width: `${accuracy.running}%` }} />
        </span>
        <span className="meter-val">
          {accuracy.running}% · {accuracy.count} review{accuracy.count === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}

<<<<<<< Updated upstream
function DeltaPanel({ result }) {
  const { deltas, prediction } = result
  return (
    <div className="delta-panel">
      <div className="delta-title">The AI just learned</div>
      <div className="delta-predict">
        Your ranking placed it {result.score10}/10 - the AI had predicted {prediction.predictedScore10}/10
      </div>
=======
const READ_BY = {
  ai: 'Claude read your review',
  keywords: "Read by keyword matching (Claude wasn't available)",
}

// What the AI learned from the review just posted, with Undo for when it got you
// wrong (CSD-54): the profile goes back, the review and its score stay.
function DeltaPanel({ result, onUndone }) {
  const { deltas, prediction } = result
  const [undo, setUndo] = useState({ busy: false, done: false, gone: false, error: null })

  const undoIt = async () => {
    setUndo({ busy: true, done: false, gone: false, error: null })
    try {
      await undoReview(result.review.dishId, result.review.at)
      setUndo({ busy: false, done: true, gone: false, error: null })
      onUndone()
    } catch (err) {
      // 409: a newer review (say, from another tab) or an earlier Undo got there first.
      const gone = err.status === 409
      setUndo({ busy: false, done: false, gone, error: gone ? "This review can't be undone any more." : `Undo failed: ${err.message}` })
    }
  }

  return (
    <div className={`delta-panel${undo.done ? ' undone' : ''}`}>
      <div className="delta-title">{undo.done ? 'Undone' : 'The AI just learned'}</div>
      {READ_BY[result.readBy] && <div className="delta-reader">{READ_BY[result.readBy]}</div>}
      {!undo.done && (
        <div className="delta-predict">
          Your ranking placed it {result.score10}/10 - the AI had predicted {prediction.predictedScore10}/10
        </div>
      )}
>>>>>>> Stashed changes
      {deltas.length === 0 && (
        <div className="delta-row">No profile change - this review matched what it already knew.</div>
      )}
      {deltas.map((d) => (
<<<<<<< Updated upstream
        <div key={d.dimension} className="delta-row">
=======
        <div key={d.dimension} className={`delta-row${undo.done ? ' struck' : ''}`}>
>>>>>>> Stashed changes
          <span className={`delta-arrow ${d.to > d.from ? 'up' : 'down'}`}>
            {d.to > d.from ? '▲' : '▼'}
          </span>
          <span className="delta-dim">{d.dimension}</span>
          <span className="delta-vals">
            {d.from} → {d.to}
          </span>
<<<<<<< Updated upstream
          <span className="delta-reason">{d.reason}</span>
        </div>
      ))}
=======
          {!undo.done && <span className="delta-reason">{d.reason}</span>}
        </div>
      ))}
      {undo.done && (
        <div className="delta-note">
          Your Taste DNA is back to how it was before this review. Your {result.score10}/10 and ranking stay.
        </div>
      )}
      {!undo.done && !undo.gone && deltas.length > 0 && (
        <div className="delta-undo">
          <span>Not what you meant?</span>
          <button onClick={undoIt} disabled={undo.busy}>
            {undo.busy ? 'Undoing…' : 'Undo these changes'}
          </button>
        </div>
      )}
      {undo.error && <div className="error">{undo.error}</div>}
>>>>>>> Stashed changes
    </div>
  )
}

function Leaderboard({ rankings }) {
  if (rankings.length === 0) return null
  return (
    <div className="board">
      <div className="board-title">Your rankings</div>
      {rankings.slice(0, 8).map((r) => (
        <div key={r.dishId} className="board-row">
          <span className="board-rank">#{r.rank}</span>
          <span className="board-name">
            {r.name} <span className="board-venue">· {r.venueName}</span>
          </span>
          <span className="board-score">{r.score10}</span>
        </div>
      ))}
    </div>
  )
}

const money = (v) => (v == null ? 'no price yet' : '$' + Number(v).toFixed(2))

export default function Review() {
  const [loaded, setLoaded] = useState(false)
  const [venueDishes, setVenueDishes] = useState(null) // dishes at the chosen venue
  const [venueInfo, setVenueInfo] = useState(null) // { youManage, degraded }
  const [rankings, setRankings] = useState([])
  const [accuracy, setAccuracy] = useState({ running: null, count: 0 })
  const [error, setError] = useState(null)

  const [step, setStep] = useState('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const abortRef = useRef(null)
  const cacheRef = useRef(new Map()) // query → results, per session
  const activeQueryRef = useRef('')
  const [venue, setVenue] = useState(null)
  const [dish, setDish] = useState(null)
  const [sentiment, setSentiment] = useState(null)
  const [duel, setDuel] = useState(null) // {opponents, lo, hi, count, pairs}
  const [insertIndex, setInsertIndex] = useState(0)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newDishName, setNewDishName] = useState('')
  const [newDishPrice, setNewDishPrice] = useState('')

  const loadAll = () =>
    Promise.all([getProfile(), getRankings()])
      .then(([p, r]) => {
        setAccuracy(p.accuracy)
        setRankings(r)
        setLoaded(true)
      })
      .catch((err) => setError(err.message))

  // A venue's menu comes from the catalog, with the AI's prediction per dish.
  const loadVenue = (v) =>
    getVenueDishes(v.id)
      .then((d) => {
        setVenueDishes(d.dishes)
        setVenueInfo({ youManage: d.youManageThisVenue, degraded: d.degraded })
        setAccuracy(d.accuracy)
      })
      .catch((err) => setError(err.message))

  useEffect(() => {
    loadAll()
  }, [])

  // Debounced typeahead with a session cache; stale responses are aborted.
  useEffect(() => {
    const q = query.trim()
    activeQueryRef.current = q
    if (!queryIsSearchable(q)) {
      setResults([])
      setSearching(false)
      return
    }
    if (cacheRef.current.has(q)) {
      setResults(cacheRef.current.get(q))
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const data = await searchVenues(q, { signal: controller.signal })
        cacheRef.current.set(q, data.results)
        if (activeQueryRef.current === q) {
          setResults(data.results)
          setSearching(false)
        }
      } catch (err) {
        if (err.name !== 'AbortError' && activeQueryRef.current === q) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const startWizard = () => {
    setStep('search')
    setQuery('')
    setVenue(null)
    setVenueDishes(null)
    setVenueInfo(null)
    setDish(null)
    setSentiment(null)
    setDuel(null)
    setInsertIndex(0)
    setText('')
    setResult(null)
    setAdding(false)
  }

  const pickSentiment = (s) => {
    setSentiment(s)
    const opponents = rankings.filter((r) => r.dishId !== dish.id)
    if (opponents.length === 0) {
      setInsertIndex(0)
      setStep('text')
    } else {
      setDuel({ opponents, lo: 0, hi: opponents.length, count: 0, pairs: [] })
      setStep('duel')
    }
  }

  const answerDuel = (newDishWon, tie = false) => {
    const { opponents, lo, hi, count, pairs } = duel
    const mid = Math.floor((lo + hi) / 2)
    const opponent = opponents[mid]
    if (tie) {
      setInsertIndex(mid)
      setStep('text')
      return
    }
    const nextPairs = [
      ...pairs,
      newDishWon
        ? { winnerId: dish.id, loserId: opponent.dishId }
        : { winnerId: opponent.dishId, loserId: dish.id },
    ]
    const nextLo = newDishWon ? lo : mid + 1
    const nextHi = newDishWon ? mid : hi
    if (nextLo >= nextHi || count + 1 >= 3) {
      setDuel({ ...duel, pairs: nextPairs })
      setInsertIndex(nextLo)
      setStep('text')
    } else {
      setDuel({ opponents, lo: nextLo, hi: nextHi, count: count + 1, pairs: nextPairs })
    }
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await postBeliReview(dish.id, sentiment, insertIndex, duel?.pairs ?? [], text)
      setResult(r)
      setAccuracy(r.accuracy)
      setStep('done')
      await Promise.all([loadAll(), loadVenue(venue)])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const addDish = async () => {
    setBusy(true)
    setError(null)
    try {
      const price = newDishPrice === '' ? null : Number(newDishPrice)
      const created = await addCatalogDish(venue.id, newDishName.trim(), price)
      await loadVenue(venue)
      setDish({ id: created.id, name: created.name, venueId: venue.id, venueName: venue.name, predictedScore10: null })
      setAdding(false)
      setNewDishName('')
      setNewDishPrice('')
      setStep('sentiment')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !loaded) return <div className="error">Review flow unavailable: {error}</div>
  if (!loaded) return <div className="loading">Loading…</div>

  const searchActive = queryIsSearchable(query.trim())
  // Same-named chain outlets get their location appended.
  const nameCounts = results.reduce((m, r) => m.set(r.name, (m.get(r.name) ?? 0) + 1), new Map())
  const currentOpponent = duel ? duel.opponents[Math.floor((duel.lo + duel.hi) / 2)] : null

  return (
    <main className="rate">
      {step === 'search' && (
        <>
          <div className="rate-intro">
            Been somewhere? Find it, rank the dish, tell the AI why - it learns from all three.
          </div>
          <input
            className="search-input"
            type="search"
            placeholder="Search 21,000+ restaurants and hawker stalls…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search venues"
          />
          {searchActive ? (
            <div className="venue-list">
              {results.map((r) => (
                <button
                  key={r.id}
                  className="venue-row"
                  onClick={() => {
                    setVenue(r)
                    setVenueDishes(null)
                    setVenueInfo(null)
                    setError(null)
                    loadVenue(r)
                    setStep('dish')
                  }}
                >
                  <span className="venue-row-main">
                    <span className="venue-row-name">
                      <HighlightedName name={r.name} highlight={r.highlight} />
                      {nameCounts.get(r.name) > 1 && (
                        <span className="venue-row-loc">
                          {' '}
                          - {r.area ?? (r.address ? r.address.split(',')[0] : r.postcode)}
                        </span>
                      )}
                    </span>
                    <span className="venue-row-meta">
                      {[r.cuisine?.replace(/-/g, ' '), r.area, r.address].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="venue-row-scores">
                    <span className="pill ai">AI {r.matchScore}%</span>
                    {r.yourScore != null && <span className="pill you">You {r.yourScore}</span>}
                  </span>
                </button>
              ))}
              {searching && results.length === 0 && <div className="loading">Searching…</div>}
              {!searching && results.length === 0 && (
                <div className="loading">No venues match "{query}".</div>
              )}
            </div>
          ) : (
            <>
              <AccuracyMeter accuracy={accuracy} />
              <Leaderboard rankings={rankings} />
            </>
          )}
        </>
      )}

      {step === 'dish' && (
        <>
          <button className="back-link" onClick={() => setStep('search')}>
            ← Search
          </button>
          <h2 className="step-title">{venue.name}</h2>
          {venueInfo?.youManage ? (
            <div className="rate-intro">
              You manage this venue, so you can't review it. Update its menu and prices in My venues instead.
            </div>
          ) : (
          <>
          {venueInfo?.degraded && (
            <div className="rerank-note">The menu service is down, so this is our starter menu for the venue.</div>
          )}
          <div className="rate-intro">Which dish did you have?</div>
          {!venueDishes && <div className="loading">Loading the menu…</div>}
          <div className="venue-list">
            {(venueDishes ?? []).map((d) => (
              <button
                key={d.id}
                className="venue-row"
                onClick={() => {
                  setDish(d)
                  setStep('sentiment')
                }}
              >
                <span className="venue-row-main">
                  <span className="venue-row-name">{d.name}</span>
                  <span className="venue-row-meta">
                    {money(d.price)}
                    {d.source === 'OWNER' ? ' · official menu' : d.source === 'DINER' ? ' · added by a diner' : ''}
                  </span>
                </span>
                <span className="venue-row-scores">
                  {d.rated && <span className="pill you">You {d.rated.score10}</span>}
                </span>
              </button>
            ))}
          </div>
          {adding ? (
            <div className="add-dish">
              <input
                className="search-input"
                placeholder="Dish name"
                value={newDishName}
                onChange={(e) => setNewDishName(e.target.value)}
                aria-label="New dish name"
              />
              <input
                className="search-input"
                type="number"
                min="0"
                step="0.5"
                placeholder="Price you paid (S$, optional)"
                value={newDishPrice}
                onChange={(e) => setNewDishPrice(e.target.value)}
                aria-label="New dish price"
              />
              <button className="teach-btn" disabled={!newDishName.trim() || busy} onClick={addDish}>
                Add and review
              </button>
            </div>
          ) : (
            <button className="back-link" onClick={() => setAdding(true)}>
              + Add a dish that's not listed
            </button>
          )}
          {error && <div className="error">{error}</div>}
          </>
          )}
        </>
      )}

      {step === 'sentiment' && (
        <>
          <button className="back-link" onClick={() => setStep('dish')}>
            ← {venue.name}
          </button>
          <h2 className="step-title">{dish.name}</h2>
          {/* The AI's guess stays hidden until the review is posted, so it can't sway the rating. */}
          <div className="rate-intro">How was it? You go first - the AI shows its prediction after you post.</div>
          <div className="sentiments">
            {SENTIMENTS.map((s) => (
              <button key={s.id} className={`sentiment ${s.cls}`} onClick={() => pickSentiment(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'duel' && currentOpponent && (
        <>
          <h2 className="step-title">Which was better?</h2>
          <div className="rate-intro">
            Quick comparison {duel.count + 1} - each answer trains your Taste DNA.
          </div>
          <div className="duel">
            <button className="duel-card" onClick={() => answerDuel(true)}>
              <span className="duel-name">{dish.name}</span>
              <span className="duel-venue">{venue.name} · just now</span>
            </button>
            <span className="duel-vs">vs</span>
            <button className="duel-card" onClick={() => answerDuel(false)}>
              <span className="duel-name">{currentOpponent.name}</span>
              <span className="duel-venue">
                {currentOpponent.venueName} · your #{currentOpponent.rank}
              </span>
            </button>
          </div>
          <button className="back-link" onClick={() => answerDuel(false, true)}>
            Too close to call
          </button>
        </>
      )}

      {step === 'text' && (
        <>
          <h2 className="step-title">Say more about {dish.name}</h2>
          <div className="rate-intro">
            The AI reads this - themes repeated across your reviews compound in your Taste DNA.
          </div>
          <textarea
            className="review-text"
            rows={4}
            placeholder='e.g. "I love the spice, but it was a bit oily…"'
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Written review"
          />
          <button className="teach-btn" disabled={busy} onClick={submit}>
<<<<<<< Updated upstream
            {busy ? 'Posting…' : 'Post review'}
=======
            {busy ? (text.trim() ? 'Reading your review…' : 'Posting…') : 'Post review'}
>>>>>>> Stashed changes
          </button>
          {error && <div className="error">Review failed: {error}</div>}
        </>
      )}

      {step === 'done' && result && (
        <>
          <div className="score-badge">
            <span className="score-big">{result.score10}/10</span>
            <span className="score-rank">
              #{result.rank.index + 1} of {result.rank.total} · {dish.name}
            </span>
          </div>
<<<<<<< Updated upstream
          <DeltaPanel result={result} />
=======
          <DeltaPanel key={result.review.at} result={result} onUndone={loadAll} />
>>>>>>> Stashed changes
          <AccuracyMeter accuracy={accuracy} />
          <Leaderboard rankings={rankings} />
          <button className="teach-btn" onClick={startWizard}>
            Review another dish
          </button>
        </>
      )}
    </main>
  )
}

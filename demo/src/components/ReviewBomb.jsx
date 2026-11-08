import { createContext, useContext, useEffect, useState } from 'react'
import { dropReviewBomb, getReviewBomb, undoReviewBomb } from '../api/engineApi.js'
import './review-bomb.css'

// An admin's review bomb, shared by the venue cards and the Demo controls: three demo
// accounts post real "too spicy" reviews of one dish at a place, and Undo takes them back.
// One place at a time; bombing another place moves it there. After either, Find runs
// again (onChanged), and `version` moves so open review lists reload.

const ReviewBombContext = createContext(null)

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)

export function ReviewBombProvider({ enabled, onChanged, children }) {
  const [bomb, setBomb] = useState(null) // { ready, posted, of, venueId, venueName, dishName, why? }
  const [busy, setBusy] = useState(null) // { kind: 'drop' | 'undo', venueId } while one runs
  const [error, setError] = useState(null) // { message, venueId }: where it went wrong
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!enabled) return
    getReviewBomb().then(setBomb).catch((err) => setError({ message: err.message, venueId: null }))
  }, [enabled])

  if (!enabled) return children

  // Resolves true when it worked.
  const run = async (kind, venueId, call) => {
    setBusy({ kind, venueId })
    setError(null)
    try {
      setBomb(await call())
      setVersion((n) => n + 1)
      onChanged()
      return true
    } catch (err) {
      setError({ message: err.message, venueId })
      getReviewBomb().then(setBomb).catch(() => {}) // where it stands after a partial run
      return false
    } finally {
      setBusy(null)
    }
  }

  const value = {
    bomb,
    busy,
    error,
    version,
    on: bomb?.posted > 0,
    drop: (venueId) => run('drop', venueId, () => dropReviewBomb(venueId)),
    undo: () => run('undo', bomb?.venueId ?? null, undoReviewBomb),
  }
  return <ReviewBombContext.Provider value={value}>{children}</ReviewBombContext.Provider>
}

// The bomb for admins; null for everyone else.
export const useReviewBomb = () => useContext(ReviewBombContext)

// What's standing, in a sentence: "3 people panned Turk's Kebab's chicken doner wrap".
export const bombSentence = (bomb) =>
  `${bomb.posted === 1 ? 'someone' : `${bomb.posted} people`} panned ${bomb.venueName}'s ${lowerFirst(bomb.dishName)}`

// In a card's drawer, for admins, at places with a menu: bomb this place, or take it back.
export function CardBomb({ venue }) {
  const reviewBomb = useReviewBomb()
  if (!reviewBomb || !venue.hasMenu) return null
  const { bomb, busy, error, on, drop, undo } = reviewBomb
  const here = on && bomb.venueId === venue.id

  const text = !bomb ? 'Checking the review bomb…'
    : !bomb.ready ? "The review bomb needs its one-time setup."
      : here ? `Review bomb on: ${bombSentence(bomb)}.`
        : on ? `Moves the review bomb here from ${bomb.venueName}.`
          : `${bomb.of} demo accounts post real "too spicy" reviews here.`

  return (
    <div className="card-bomb">
      <div className="card-bomb-text">
        <span className="card-bomb-label">Admin</span>
        {text}
      </div>
      {here ? (
        <button type="button" className="btn quiet" disabled={busy != null} onClick={undo}>
          {busy?.kind === 'undo' ? 'Undoing…' : 'Undo review bomb'}
        </button>
      ) : (
        <button type="button" className="btn stop" disabled={!bomb?.ready || busy != null} onClick={() => drop(venue.id)}>
          {busy?.kind === 'drop' && busy.venueId === venue.id ? 'Posting reviews…' : 'Review-bomb this place'}
        </button>
      )}
      {error && error.venueId === venue.id && <div className="card-bomb-error">{error.message}</div>}
    </div>
  )
}

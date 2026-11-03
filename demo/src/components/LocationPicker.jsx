import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../api/engineApi.js'
import { QUICK_PICKS, WALK_CHOICES, locateMe } from '../location.js'

const SEARCH_DEBOUNCE_MS = 300

// "Near Bedok", or "Near you · Tampines" once the engine has named the area.
export function whereText(where, area) {
  if (where.source === 'gps') return area ? `Near you · ${area}` : 'Near you'
  return `Near ${where.label}`
}

// The line above For you that says where it searches from; Change opens the picker:
// your location, a OneMap search, quick picks, and how far you'll walk.
export default function LocationPicker({ where, area, onChange }) {
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState({ results: [], available: true, searching: false })
  const abortRef = useRef(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      abortRef.current?.abort()
      setSearch({ results: [], available: true, searching: false })
      return
    }
    setSearch((s) => ({ ...s, searching: true }))
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const data = await searchPlaces(q, { signal: controller.signal })
        setSearch({ results: data.results, available: data.available, searching: false })
      } catch (err) {
        if (err.name !== 'AbortError') setSearch({ results: [], available: false, searching: false })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const close = () => {
    setOpen(false)
    setQuery('')
    setMessage(null)
  }

  const goTo = (spot) => {
    onChange({ ...where, ...spot })
    close()
  }

  const useMyLocation = async () => {
    setLocating(true)
    setMessage(null)
    try {
      const point = await locateMe()
      goTo({ ...point, label: 'you', source: 'gps' })
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLocating(false)
    }
  }

  const isHere = (spot) => where.source === 'pick' && where.lat === spot.lat && where.lon === spot.lon

  return (
    <section className="loc">
      <button
        type="button"
        className="loc-line"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span>
          <span aria-hidden="true">📍 </span>
          {whereText(where, area)} · {where.walkMin}-min walk
        </span>
        <span className="loc-change">{open ? 'Done' : 'Change'}</span>
      </button>

      {open && (
        <div className="loc-panel">
          <button type="button" className="teach-btn loc-gps" onClick={useMyLocation} disabled={locating}>
            {locating ? 'Finding you…' : '📡 Use where I am'}
          </button>
          {message && (
            <div className="loc-msg" role="status">
              {message}
            </div>
          )}

          <input
            className="search-input"
            type="search"
            placeholder="Search a place, MRT or postcode"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search for a place to eat near"
          />
          {query.trim().length >= 2 && (
            <div className="loc-results">
              {search.results.map((place) => (
                <button
                  key={`${place.label}-${place.lat}-${place.lon}`}
                  type="button"
                  className="loc-result"
                  onClick={() => goTo({ lat: place.lat, lon: place.lon, label: place.label, source: 'search' })}
                >
                  <span className="loc-result-name">{place.label}</span>
                  {place.detail && <span className="loc-result-detail">{place.detail}</span>}
                </button>
              ))}
              {!search.searching && !search.available && (
                <div className="loc-msg">Place search is unavailable right now. Use where you are or a quick pick.</div>
              )}
              {!search.searching && search.available && search.results.length === 0 && (
                <div className="loc-msg">No places match that.</div>
              )}
            </div>
          )}

          <div className="loc-label">Quick picks</div>
          <div className="loc-chips">
            {QUICK_PICKS.map((spot) => (
              <button key={spot.label} type="button" className="chip" aria-pressed={isHere(spot)} onClick={() => goTo(spot)}>
                {spot.label}
              </button>
            ))}
          </div>

          <div className="loc-label">Walk up to</div>
          <div className="loc-chips" role="group" aria-label="How far you'll walk">
            {WALK_CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className="chip"
                aria-pressed={where.walkMin === minutes}
                onClick={() => onChange({ ...where, walkMin: minutes })}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

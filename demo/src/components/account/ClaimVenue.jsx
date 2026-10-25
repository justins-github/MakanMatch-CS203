import { useEffect, useRef, useState } from 'react'
import { claimVenue } from '../../api/accountApi.js'
import { searchCatalogVenues } from '../../api/catalogApi.js'
import { Unsaved } from '../Accordion.jsx'

const MIN_PROOF = 10

// Ask to manage a venue. An admin reads the proof before approving it.
export default function ClaimVenue({ onClaimed, onCancel }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [venue, setVenue] = useState(null)
  const [proof, setProof] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    const q = query.trim()
    if (venue || q.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        setResults(await searchCatalogVenues(q, { signal: controller.signal }))
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query, venue])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const claim = await claimVenue(venue.id, venue.name, proof.trim())
      onClaimed(claim)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="panel claim-form" onSubmit={submit}>
      <div className="panel-title">Claim a venue you run</div>

      {venue ? (
        <div className="claim-picked">
          <div>
            <div className="venue-row-name">{venue.name}</div>
            <div className="venue-row-meta">{venue.address ?? venue.postcode ?? venue.id}</div>
          </div>
          <button type="button" className="back-link" onClick={() => setVenue(null)}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            className="search-input"
            type="search"
            placeholder="Find your venue by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Find your venue"
            autoFocus
          />
          {results.length > 0 && (
            <div className="venue-list">
              {results.map((r) => (
                <button key={r.id} type="button" className="venue-row" onClick={() => setVenue(r)}>
                  <span className="venue-row-main">
                    <span className="venue-row-name">{r.name}</span>
                    <span className="venue-row-meta">{[r.cuisine?.replace(/-/g, ' '), r.address].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <label className="field">
        <span>How can an admin check it's yours?</span>
        <textarea
          rows={3}
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          placeholder="e.g. UEN 201912345K, the stall phone number listed online, or when we can drop by"
          maxLength={2000}
          required
        />
        <small>Required. Only admins see this.</small>
      </label>

      {error && <div className="error">{error}</div>}

      <div className="row-actions">
        <button type="submit" className="btn go" disabled={!venue || proof.trim().length < MIN_PROOF || busy}>
          {busy ? 'Sending…' : 'Send claim for review'}
        </button>
        <button type="button" className="btn quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <Unsaved when={venue !== null || proof.trim() !== ''} />
    </form>
  )
}

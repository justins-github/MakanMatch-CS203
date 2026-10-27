import { useEffect, useState } from 'react'
import { getGroups, getKakis } from '../../api/accountApi.js'
import Avatar from './Avatar.jsx'
import './kakis.css'

// "Just me / With friends" at the top of For you.
export function CompanySwitch({ company, onChange }) {
  return (
    <div className="company-switch" role="radiogroup" aria-label="Who's eating">
      {[
        ['solo', 'Just me'],
        ['friends', 'With friends'],
      ].map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={company === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}

const sameIds = (a, b) => a.length === b.length && a.every((id) => b.includes(id))

// Who's coming: tap kakis (or a saved group), then find a place for everyone.
// onFind/onSurprise get the ids actually picked, so a removed kaki never goes out.
export default function WithFriends({ selected, onSelect, onFind, onSurprise, onOpenKakis }) {
  const [kakis, setKakis] = useState(null)
  const [groups, setGroups] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getKakis(), getGroups()])
      .then(([data, saved]) => {
        setKakis(data.kakis)
        setGroups(saved)
      })
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <div className="error">Couldn't load your kakis: {error}</div>
  if (!kakis) return <div className="loading">Loading your kakis…</div>

  if (kakis.length === 0) {
    return (
      <main className="feed">
        <div className="landing">
          <h2 className="landing-title">Who's coming?</h2>
          <p className="landing-note">
            You haven't added any kakis yet. Add the people you eat with, and once they accept you can pick them here.
          </p>
          <button className="big-btn" onClick={onOpenKakis}>
            👥 Add kakis
          </button>
        </div>
      </main>
    )
  }

  // Someone removed since you picked them drops out quietly.
  const chosen = selected.filter((id) => kakis.some((k) => k.id === id))
  const toggle = (id) => onSelect(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])
  const people = chosen.length + 1

  return (
    <main className="feed">
      <div className="landing">
        <h2 className="landing-title">Who's coming?</h2>
        <div className="kaki-chips">
          <span className="kaki-chip you">
            <Avatar id="you" name="You" small />
            You
          </span>
          {kakis.map((k) => (
            <button key={k.id} type="button" className="kaki-chip" aria-pressed={chosen.includes(k.id)} onClick={() => toggle(k.id)}>
              <Avatar id={k.id} name={k.displayName} small />
              {k.displayName}
            </button>
          ))}
        </div>
        {groups.length > 0 && (
          <div>
            <div className="kaki-label">Or a group</div>
            <div className="kaki-chips">
              {groups.map((g) => {
                const ids = g.members.map((m) => m.id)
                return (
                  <button
                    key={g.id}
                    type="button"
                    className="kaki-chip group"
                    aria-pressed={sameIds(ids, chosen)}
                    onClick={() => onSelect(ids)}
                  >
                    {g.name} · {ids.length + 1}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <button className="big-btn" disabled={chosen.length === 0} onClick={() => onFind(chosen)}>
          👥 {chosen.length === 0 ? 'Find a place together' : `Find a place for ${people}`}
        </button>
        <button className="big-btn surprise" disabled={chosen.length === 0} onClick={() => onSurprise(chosen)}>
          🎲 {chosen.length === 0 ? 'Surprise everyone' : `Surprise all ${people}`}
        </button>
        <p className="landing-note">
          {chosen.length === 0
            ? 'Tap the kakis who are coming.'
            : "We blend everyone's Taste DNA and leave out anything someone can't eat."}
        </p>
      </div>
    </main>
  )
}

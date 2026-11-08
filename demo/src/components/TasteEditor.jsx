import { useEffect, useState } from 'react'
import { getDials, putDials } from '../api/engineApi.js'
import './taste-editor.css'

// An admin sets their real taste by hand on the Taste DNA tab, e.g. to show Find
// reacting without posting twenty reviews: every cuisine to 0, Japanese to 100, and Find
// shows Japanese places and their embedding neighbours. Saved, the taste is "set by hand"
// and Find takes its embedding from these sliders until the next review.

const FLAVOUR = [
  { key: 'spicePref', label: 'Spice' },
  { key: 'richnessPref', label: 'Richness' },
  { key: 'priceComfort', label: 'Price comfort', max: 2 },
  { key: 'adventurousness', label: 'Adventurous' },
]

const affinityOf = (taste, key) => taste.cuisines.find((c) => c.key === key)?.affinity
const cuisineName = (key) => key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ')
const priceWord = (value) => (value < 0.67 ? 'cheap' : value < 1.34 ? 'mid' : 'splurge')
const asPercent = (value, max = 1) => Math.round((value / max) * 100)
const fromPercent = (percent, max = 1) => Math.round((percent / 100) * max * 100) / 100

// Only what the sliders changed, in the shape the engine takes.
function changesBetween(saved, draft) {
  const dials = {}
  for (const { key } of FLAVOUR) if (draft[key] !== saved[key]) dials[key] = draft[key]
  const cuisineAffinity = {}
  for (const c of draft.cuisines) if (c.affinity !== affinityOf(saved, c.key)) cuisineAffinity[c.key] = c.affinity
  if (Object.keys(cuisineAffinity).length) dials.cuisineAffinity = cuisineAffinity
  return dials
}

function Slider({ label, detail, value, max = 1, shown, changed, onChange }) {
  const percent = asPercent(value, max)
  return (
    <label className={`slider${changed ? ' changed' : ''}${percent === 100 ? ' full' : ''}`}>
      <span className="slider-name">
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </span>
      <input
        type="range"
        min="0"
        max="100"
        value={percent}
        style={{ '--fill': `${percent}%` }}
        onChange={(e) => onChange(fromPercent(Number(e.target.value), max))}
      />
      <span className="slider-val">{shown ?? percent}</span>
    </label>
  )
}

export default function TasteEditor({ onCancel, onSaved }) {
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDials()
      .then((taste) => {
        setSaved(taste)
        setDraft(taste)
      })
      .catch((err) => setError(err.message))
  }, [])

  if (!draft) return error ? <div className="error">Your taste couldn't load: {error}</div> : <div className="loading">Loading your taste…</div>

  const changes = changesBetween(saved, draft)
  const { cuisineAffinity = {}, ...flavours } = changes
  const changeCount = Object.keys(flavours).length + Object.keys(cuisineAffinity).length
  const changed = changeCount > 0
  const setFlavour = (key, value) => setDraft((d) => ({ ...d, [key]: value }))
  const setCuisine = (key, affinity) =>
    setDraft((d) => ({ ...d, cuisines: d.cuisines.map((c) => (c.key === key ? { ...c, affinity } : c)) }))
  const setAllCuisines = (affinity) => setDraft((d) => ({ ...d, cuisines: d.cuisines.map((c) => ({ ...c, affinity })) }))
  // Every slider to where a brand-new account starts (the engine sends it as `starter`).
  const resetToNewAccount = () =>
    setDraft((d) => ({
      ...d,
      ...Object.fromEntries(FLAVOUR.map(({ key }) => [key, saved.starter[key]])),
      cuisines: d.cuisines.map((c) => ({ ...c, affinity: affinityOf(saved.starter, c.key) ?? c.affinity })),
    }))

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      if (changed) await putDials({ dials: changes })
      onSaved()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <section className="taste-editor" aria-label="Set your taste">
      <p className="editor-note">
        Admins only. Saving changes your real taste: Find uses these sliders, embeddings included, until your next review.
      </p>

      <div className="editor-label-row">
        <div className="editor-label">Flavour</div>
        {saved.starter && (
          <button type="button" className="editor-tool" onClick={resetToNewAccount} title="Every slider to where a brand-new account starts">
            Reset to a new account
          </button>
        )}
      </div>
      {FLAVOUR.map(({ key, label, max }) => (
        <Slider
          key={key}
          label={label}
          value={draft[key]}
          max={max}
          shown={key === 'priceComfort' ? priceWord(draft[key]) : undefined}
          changed={draft[key] !== saved[key]}
          onChange={(v) => setFlavour(key, v)}
        />
      ))}

      <div className="editor-label-row">
        <div className="editor-label">Cuisines</div>
        <button type="button" className="editor-tool" onClick={() => setAllCuisines(0)}>
          Set all to 0
        </button>
      </div>
      {draft.cuisines.map((c) => (
        <Slider
          key={c.key}
          label={cuisineName(c.key)}
          detail={`${c.venues.toLocaleString()} places`}
          value={c.affinity}
          changed={c.affinity !== affinityOf(saved, c.key)}
          onChange={(v) => setCuisine(c.key, v)}
        />
      ))}

      {error && <div className="editor-error">{error}</div>}
      <div className="editor-actions">
        <span className="editor-count">{changed ? `${changeCount} changed` : 'No changes yet'}</span>
        <button type="button" className="btn quiet" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : changed ? 'Save and Find' : 'Find'}
        </button>
      </div>
    </section>
  )
}

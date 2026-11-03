import { useEffect, useState } from 'react'
import { acceptSuggestion, dismissSuggestion, getProfile, getSuggestion } from '../api/engineApi.js'

function RadarChart({ dimensions }) {
  const width = 360
  const height = 300
  const cx = width / 2
  const cy = height / 2
  const radius = 92
  const n = dimensions.length

  const point = (i, r) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  }

  const ringPath = (r) =>
    dimensions.map((_, i) => point(i, r).join(',')).join(' ')

  const valuePath = dimensions
    .map((d, i) => point(i, radius * d.value).join(','))
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Radar chart of your six taste dimensions"
    >
      {[0.33, 0.66, 1].map((f) => (
        <polygon
          key={f}
          points={ringPath(radius * f)}
          fill="none"
          stroke="#6b6257"
          strokeWidth="1"
          opacity="0.4"
        />
      ))}
      {dimensions.map((_, i) => {
        const [x, y] = point(i, radius)
        return (
          <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#6b6257" strokeWidth="1" opacity="0.4" />
        )
      })}
      <polygon points={valuePath} fill="#d6342c" fillOpacity="0.3" stroke="#d6342c" strokeWidth="2.5" />
      {dimensions.map((d, i) => {
        const [x, y] = point(i, radius + 24)
        return (
          <text
            key={d.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="'IBM Plex Mono', monospace"
            fontSize="10"
            fill="#201b15"
          >
            {d.label.toUpperCase()}
          </text>
        )
      })}
    </svg>
  )
}

const HISTORY_COLORS = ['#d6342c', '#237a57', '#46689b', '#b56a16', '#83549a', '#201b15']

function HistoryChart({ history }) {
  const width = 360
  const height = 166
  const left = 34
  const right = 348
  const top = 12
  const bottom = 122
  const firstTime = Date.parse(history[0].recordedAt)
  const lastTime = Date.parse(history.at(-1).recordedAt)
  const timeSpan = lastTime - firstTime
  const xFor = (snapshot) =>
    timeSpan === 0 ? (left + right) / 2 : left + ((Date.parse(snapshot.recordedAt) - firstTime) / timeSpan) * (right - left)
  const yFor = (value) => bottom - value * (bottom - top)
  const dimensions = history[0].dimensions
  const formatDate = (value) =>
    new Date(value).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })

  return (
    <div>
      <svg
        className="history-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Taste DNA dimension history from ${formatDate(history[0].recordedAt)} to ${formatDate(history.at(-1).recordedAt)}`}
      >
        {[0, 0.5, 1].map((value) => (
          <g key={value}>
            <line x1={left} y1={yFor(value)} x2={right} y2={yFor(value)} className="history-grid" />
            <text x={left - 7} y={yFor(value) + 3} textAnchor="end" className="history-axis-label">
              {value.toFixed(1)}
            </text>
          </g>
        ))}
        {dimensions.map((dimension, dimensionIndex) => {
          const points = history.map((snapshot) => {
            const value = snapshot.dimensions.find((item) => item.key === dimension.key)?.value ?? 0
            return `${xFor(snapshot)},${yFor(value)}`
          })
          return (
            <g key={dimension.key}>
              {history.length > 1 && (
                <polyline
                  points={points.join(' ')}
                  fill="none"
                  stroke={HISTORY_COLORS[dimensionIndex % HISTORY_COLORS.length]}
                  strokeWidth="2"
                />
              )}
              {history.map((snapshot) => {
                const value = snapshot.dimensions.find((item) => item.key === dimension.key)?.value ?? 0
                return (
                  <circle
                    key={`${dimension.key}-${snapshot.recordedAt}`}
                    cx={xFor(snapshot)}
                    cy={yFor(value)}
                    r="3"
                    fill={HISTORY_COLORS[dimensionIndex % HISTORY_COLORS.length]}
                  >
                    <title>{`${dimension.label}: ${value.toFixed(2)} on ${formatDate(snapshot.recordedAt)}`}</title>
                  </circle>
                )
              })}
            </g>
          )
        })}
        <text x={left} y={height - 8} textAnchor="start" className="history-axis-label">
          {formatDate(history[0].recordedAt)}
        </text>
        {history.length > 1 && (
          <text x={right} y={height - 8} textAnchor="end" className="history-axis-label">
            {formatDate(history.at(-1).recordedAt)}
          </text>
        )}
      </svg>
      <div className="history-legend">
        {dimensions.map((dimension, index) => (
          <span key={dimension.key}>
            <i style={{ backgroundColor: HISTORY_COLORS[index % HISTORY_COLORS.length] }} />
            {dimension.label}
          </span>
        ))}
      </div>
    </div>
  )
}

const signed = (step) => `${step > 0 ? '+' : '−'}${Math.abs(step).toFixed(2)}`

// "Claude's take" on the trends (CSD-56): nothing changes until you lean into it,
// and an answered suggestion doesn't come back.
function TheirTake({ onAnswered }) {
  const [suggestion, setSuggestion] = useState(undefined) // undefined = still loading
  const [answer, setAnswer] = useState(null) // { decision, applied } once answered
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSuggestion().then((r) => setSuggestion(r.suggestion)).catch(() => setSuggestion(null))
  }, [])

  const answerWith = async (send) => {
    setBusy(true)
    setError(null)
    try {
      setAnswer(await send(suggestion.signature))
      onAnswered()
    } catch (err) {
      setError(err.status === 409 ? 'That suggestion changed - reopen this page to see the new one.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  if (answer?.decision === 'accepted') {
    const moved = answer.applied.map((c) => `${c.label} ${c.from.toFixed(2)} → ${c.to.toFixed(2)}`).join(', ')
    return <div className="take take-done">Done: {moved}. Your matches now lean that way.</div>
  }
  if (answer?.decision === 'dismissed') {
    return <div className="take take-done">Got it, nothing changed. We won't suggest this again.</div>
  }
  if (!suggestion) return null

  return (
    <div className="take">
      <div className="lately-label">{suggestion.writtenBy === 'ai' ? "Claude's take" : 'In short'}</div>
      <p className="take-summary">{suggestion.summary}</p>
      <div className="take-buttons">
        <button className="take-yes" disabled={busy} onClick={() => answerWith(acceptSuggestion)}>
          Lean into it
        </button>
        <button className="take-no" disabled={busy} onClick={() => answerWith(dismissSuggestion)}>
          No thanks
        </button>
      </div>
      <div className="take-changes">
        {suggestion.changes.map((c) => `${c.label} ${signed(c.step)}`).join(', ')} if you accept
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  )
}

// Dimensions moving steadily one way over your recent reviews (CSD-55).
function Lately({ trends, onAnswered }) {
  return (
    <section className="lately" aria-labelledby="lately-title">
      <div id="lately-title" className="lately-label">Lately</div>
      {trends.length === 0 ? (
        <p className="lately-empty">
          Nothing steady yet. Once a few reviews in a row push the same way, it shows up here.
        </p>
      ) : (
        trends.map((t) => (
          <div key={t.key} className="lately-trend">
            <span className={`delta-arrow ${t.direction}`}>{t.direction === 'up' ? '▲' : '▼'}</span>
            <span>
              <span className="lately-headline">{t.headline}</span>
              <span className="lately-vals">
                {t.label} {t.from.toFixed(2)} → {t.to.toFixed(2)} over your last {t.reviews} reviews
              </span>
            </span>
          </div>
        ))
      )}
      {trends.length > 0 && <TheirTake onAnswered={onAnswered} />}
    </section>
  )
}

export default function TasteDna() {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getProfile().then(setProfile).catch((err) => setError(err.message))
  }, [])

  if (error) return <div className="error">Profile unavailable: {error}</div>
  if (!profile) return <div className="loading">Reading your Taste DNA…</div>

  const cuisines = Object.entries(profile.user.cuisineAffinity).sort((a, b) => b[1] - a[1])

  return (
    <main className="dna">
      <h2>Your Taste DNA</h2>
      {profile.accuracy.count === 0 && (
        <p className="recent-note">
          You're starting neutral: the AI knows nothing about you yet. Rank a few dishes in Review and watch this move.
        </p>
      )}
      <div className="radar-wrap">
        <RadarChart dimensions={profile.dimensions} />
      </div>

      <Lately trends={profile.trends ?? []} onAnswered={() => getProfile().then(setProfile).catch(() => {})} />

      <section className="dna-history" aria-labelledby="dna-history-title">
        <h3 id="dna-history-title">How it's changed</h3>
        <p className="history-note">Your latest learned profile for each day, up to 30 days.</p>
        {profile.history.length > 0 ? (
          <HistoryChart history={profile.history} />
        ) : (
          <p className="history-empty">Your history will appear here after your next dish rating.</p>
        )}
      </section>

      <h3>Cuisines you rate</h3>
      {cuisines.map(([cuisine, value]) => (
        <div key={cuisine} className="affinity">
          <span>{cuisine.replace(/-/g, ' ')}</span>
          <span className="bar">
            <span className="fill" style={{ width: `${value * 100}%` }} />
          </span>
          <span className="val">{value.toFixed(2)}</span>
        </div>
      ))}

      {profile.user.recentlyEaten.length > 0 && (
        <div className="recent-note">
          Recently eaten: <strong>{profile.user.recentlyEaten.join(', ').replace(/-/g, ' ')}</strong> - matching
          venues get a temporary satiation penalty in your feed.
        </div>
      )}
    </main>
  )
}

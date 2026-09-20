import { useEffect, useState } from 'react'
import { getProfile } from '../api.js'

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
      aria-label="Radar chart of the demo user's six taste dimensions"
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
      <div className="radar-wrap">
        <RadarChart dimensions={profile.dimensions} />
      </div>

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

      <div className="recent-note">
        Recently eaten: <strong>{profile.user.recentlyEaten.join(', ').replace(/-/g, ' ')}</strong> - matching
        venues get a temporary satiation penalty in your feed.
      </div>
    </main>
  )
}

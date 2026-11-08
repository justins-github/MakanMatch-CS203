// The two-hour forecast as a chip in the top bar; the full forecast is its tooltip.
// Admins simulate rain from the Demo controls (DemoPanel.jsx).
export default function ContextBanner({ context }) {
  if (!context) return <span className="weather-chip">Checking the weather…</span>

  const source =
    context.simulated ? 'simulated'
    : context.source === 'live' ? 'live from data.gov.sg'
    : 'offline fallback data'

  return (
    <span
      className={`weather-chip${context.raining ? ' raining' : ''}`}
      title={`${context.summary}${context.raining ? ' - sheltered places get a boost' : ''} (${source})`}
    >
      <span aria-hidden="true">{context.raining ? '🌧️' : '⛅'}</span>
      {context.raining ? 'Rain nearby' : 'No rain'}
      {context.simulated && ' · simulated'}
    </span>
  )
}

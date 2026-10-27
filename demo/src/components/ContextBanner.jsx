// The two-hour forecast as a chip in the top bar; the full forecast is its tooltip.
// Admins (not viewing as someone else) can simulate rain from here.
export default function ContextBanner({ context, simRain, canSimulate, onToggleRain }) {
  if (!context) return <span className="weather-chip">Checking the weather…</span>

  const source =
    context.simulated ? 'simulated'
    : context.source === 'live' ? 'live from data.gov.sg'
    : 'offline fallback data'

  return (
    <div className="weather">
      <span
        className={`weather-chip${context.raining ? ' raining' : ''}`}
        title={`${context.summary}${context.raining ? ' - sheltered places get a boost' : ''} (${source})`}
      >
        <span aria-hidden="true">{context.raining ? '🌧️' : '⛅'}</span>
        {context.raining ? 'Rain nearby' : 'No rain'}
        {context.simulated && ' · simulated'}
      </span>
      {canSimulate && (
        <button type="button" className="weather-sim" aria-pressed={simRain} onClick={onToggleRain}>
          {simRain ? 'Stop rain sim' : 'Simulate rain'}
        </button>
      )}
    </div>
  )
}

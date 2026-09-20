export default function ContextBanner({ context, simRain, onToggleRain }) {
  if (!context) return null

  const sourceLabel =
    context.simulated ? 'simulated'
    : context.source === 'live' ? 'live · data.gov.sg'
    : 'offline fallback data'

  return (
    <div className={`banner${context.raining ? ' raining' : ''}`}>
      <span className="glyph" aria-hidden="true">
        {context.raining ? '🌧️' : '⛅'}
      </span>
      <div className="text">
        <div className="summary">
          {context.summary}
          {context.raining && ' - sheltered picks boosted'}
        </div>
        <div className="detail">{sourceLabel}</div>
      </div>
      <button className="banner-toggle" onClick={onToggleRain}>
        {simRain ? 'Stop rain sim' : 'Simulate rain'}
      </button>
    </div>
  )
}

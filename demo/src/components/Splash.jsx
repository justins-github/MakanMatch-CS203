// The logo, shown while we look for a saved session (a quick round trip with the
// refresh cookie). It's the only place the full logo appears once you're in.
// leaving: fade out before the next screen fades in.
export default function Splash({ leaving = false }) {
  return (
    <div className={`splash${leaving ? ' leaving' : ''}`} role="status" aria-label="Loading MakanMatch">
      <div className="splash-tile" aria-hidden="true">
        M
      </div>
      <h1 className="splash-logo">
        Makan<span>Match</span>
      </h1>
      <p className="splash-tagline">The AI that learns your taste</p>
      <p className="splash-wait">Checking your session…</p>
    </div>
  )
}

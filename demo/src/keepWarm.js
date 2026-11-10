// Keeps the backend awake while the app is on screen. Vercel stops a service about
// 30 s after its last request and starting one again takes about 13 s, which is
// what made a Find after a short pause slow or fail.
// `ping` wakes them (GET /api/warm); returns a function that stops the pings.
const EVERY_MS = 20_000 // inside the 30 s after which a service is stopped

export function startKeepWarm({ ping, doc = document, everyMs = EVERY_MS }) {
  const beat = () => {
    if (doc.visibilityState === 'visible') ping()
  }
  beat()
  const timer = setInterval(beat, everyMs)
  doc.addEventListener('visibilitychange', beat)
  return () => {
    clearInterval(timer)
    doc.removeEventListener('visibilitychange', beat)
  }
}

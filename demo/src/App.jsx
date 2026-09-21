import { useEffect, useState } from 'react'
import { getContext, getRecommendations, postReset } from './api.js'
import ContextBanner from './components/ContextBanner.jsx'
import Feed from './components/Feed.jsx'
import MoodBar from './components/MoodBar.jsx'
import Login from './components/Login.jsx'
import Review from './components/Review.jsx'
import TasteDna from './components/TasteDna.jsx'

const USER_KEY = 'mm-demo-user'

function loadUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY)) || null
  } catch {
    return null
  }
}

export default function App() {
  // Mock auth: no backend yet, so Login accepts anything. Kept in
  // sessionStorage so a page refresh doesn't bounce you back to sign-in.
  const [user, setUser] = useState(loadUser)
  const [tab, setTab] = useState('feed')
  const [mode, setMode] = useState('idle') // idle | find | surprise
  const [mood, setMood] = useState('none')
  const [simRain, setSimRain] = useState(false)
  const [recs, setRecs] = useState(null)
  const [context, setContext] = useState(null)
  const [exclude, setExclude] = useState([]) // surprise picks already shown
  const [error, setError] = useState(null)
  const [resetCount, setResetCount] = useState(0)

  // Idle landing still shows the live weather banner.
  useEffect(() => {
    if (!user || tab !== 'feed' || mode !== 'idle') return
    let cancelled = false
    getContext(simRain)
      .then((c) => { if (!cancelled) setContext(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user, tab, mode, simRain, resetCount])

  useEffect(() => {
    if (!user || tab !== 'feed' || mode === 'idle') return
    let cancelled = false
    setError(null)
    getRecommendations(mode, mood, simRain, exclude)
      .then((data) => {
        if (cancelled) return
        setRecs(data)
        setContext(data.context)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [user, mode, mood, simRain, exclude, tab, resetCount])

  const startMode = (next) => {
    setRecs(null)
    setExclude([])
    setMode(next)
  }

  const backToLanding = () => {
    setMode('idle')
    setRecs(null)
    setExclude([])
  }

  const anotherSurprise = () => {
    const current = recs?.venues?.[0]
    if (current) setExclude((ids) => [...ids, current.id])
  }

  const resetDemo = async () => {
    await postReset()
    setMood('none')
    backToLanding()
    setResetCount((n) => n + 1) // re-fetches feed and remounts the other tabs
  }

  const login = (u) => {
    try { sessionStorage.setItem(USER_KEY, JSON.stringify(u)) } catch {}
    setUser(u)
  }

  const logout = () => {
    try { sessionStorage.removeItem(USER_KEY) } catch {}
    setUser(null)
    setTab('feed')
    backToLanding()
  }

  if (!user) {
    return (
      <div className="phone">
        <Login onLogin={login} />
      </div>
    )
  }

  const TABS = [
    ['feed', 'For you'],
    ['rate', 'Review'],
    ['dna', 'Taste DNA'],
  ]

  return (
    <div className="phone">
      <header className="header">
        <div className="header-top">
          <div className="eyebrow">The AI that learns your taste - team demo</div>
          <div className="header-actions">
            <button className="reset-btn" onClick={resetDemo}>
              Reset demo
            </button>
            <button className="reset-btn" onClick={logout} title={user.email}>
              Log out
            </button>
          </div>
        </div>
        <h1>
          Makan<span className="accent">Match</span>
        </h1>
        <nav className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className="tab"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'feed' && (
        <>
          <ContextBanner
            context={context}
            simRain={simRain}
            onToggleRain={() => setSimRain((v) => !v)}
          />
          {error ? (
            <div className="error">Feed unavailable: {error}. Is the API running on :3001?</div>
          ) : (
            <Feed
              mode={mode}
              data={recs}
              onFind={() => startMode('find')}
              onSurprise={() => startMode('surprise')}
              onAnother={anotherSurprise}
              onBack={backToLanding}
            />
          )}
          <MoodBar mood={mood} onMood={setMood} />
        </>
      )}

      {tab === 'rate' && <Review key={resetCount} />}
      {tab === 'dna' && <TasteDna key={resetCount} />}
    </div>
  )
}

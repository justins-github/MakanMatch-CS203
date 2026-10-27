import { useEffect, useState } from 'react'
import { getContext, getRecommendations, postReset } from './api/engineApi.js'
import { useAuth } from './auth/AuthContext.jsx'
import ContextBanner from './components/ContextBanner.jsx'
import Feed from './components/Feed.jsx'
import Login from './components/Login.jsx'
import Review from './components/Review.jsx'
import TasteDna from './components/TasteDna.jsx'
import Profile from './components/account/Profile.jsx'
import Register from './components/account/Register.jsx'
import RoleSwitcher, { ActingAsTape } from './components/account/RoleSwitcher.jsx'
import AdminPanel from './components/admin/AdminPanel.jsx'
import Kakis from './components/kakis/Kakis.jsx'
import WithFriends, { CompanySwitch } from './components/kakis/WithFriends.jsx'
import MyVenues from './components/owner/MyVenues.jsx'

// Everyone gets the diner app; owners add "My venues", admins add "Admin".
// The role is the one the server serves this session as (act-as applied).
function tabsFor(role) {
  const tabs = [
    ['feed', 'For you'],
    ['kakis', 'Kakis'],
    ['rate', 'Review'],
    ['dna', 'Taste DNA'],
    ['profile', 'Profile'],
  ]
  if (role === 'OWNER' || role === 'ADMIN') tabs.push(['venues', 'My venues'])
  if (role === 'ADMIN') tabs.push(['admin', 'Admin'])
  return tabs
}

export default function App() {
  const { status } = useAuth()
  const [screen, setScreen] = useState('login')

  useEffect(() => {
    if (status === 'signedOut') setScreen('login')
  }, [status])

  if (status === 'loading') {
    return (
      <div className="phone">
        <div className="loading">Checking your session…</div>
      </div>
    )
  }
  if (status === 'signedOut') {
    return (
      <div className="phone">
        {screen === 'register' ? (
          <Register onHaveAccount={() => setScreen('login')} />
        ) : (
          <Login onCreateAccount={() => setScreen('register')} />
        )}
      </div>
    )
  }
  return <SignedInApp />
}

function SignedInApp() {
  const { me, role, logout } = useAuth()
  const [tab, setTab] = useState('feed')
  const [mode, setMode] = useState('idle') // idle | find | surprise
  const [company, setCompany] = useState('solo') // solo | friends
  const [party, setParty] = useState([]) // ids of the kakis eating with you
  const [mood, setMood] = useState('none')
  const [simRain, setSimRain] = useState(false)
  const [recs, setRecs] = useState(null)
  const [context, setContext] = useState(null)
  const [exclude, setExclude] = useState([]) // surprise picks already shown
  const [error, setError] = useState(null)
  const [resetCount, setResetCount] = useState(0)

  const tabs = tabsFor(role)
  // Switching to a smaller role can take away the tab you were on.
  const activeTab = tabs.some(([id]) => id === tab) ? tab : 'feed'
  // Rain simulation is an admin tool; viewing as a user or owner switches it off.
  const canSimulateRain = role === 'ADMIN'
  if (simRain && !canSimulateRain) setSimRain(false)

  // Idle landing still shows the live weather banner.
  useEffect(() => {
    if (activeTab !== 'feed' || mode !== 'idle') return
    let cancelled = false
    getContext(simRain)
      .then((c) => { if (!cancelled) setContext(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeTab, mode, simRain, resetCount])

  useEffect(() => {
    if (activeTab !== 'feed' || mode === 'idle') return
    let cancelled = false
    setError(null)
    getRecommendations(mode, mood, simRain, exclude, company === 'friends' ? party : [])
      .then((data) => {
        if (cancelled) return
        setRecs(data)
        setContext(data.context)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [me.id, role, mode, mood, simRain, exclude, company, party, activeTab, resetCount])

  const startMode = (next) => {
    setRecs(null)
    setExclude([])
    setMode(next)
  }

  const backToLanding = () => {
    setMode('idle')
    setRecs(null)
    setExclude([])
    setError(null)
  }

  // With friends: remember who was picked, then search for them.
  const startWith = (ids, next) => {
    setParty(ids)
    startMode(next)
  }

  const anotherSurprise = () => {
    const current = recs?.venues?.[0]
    if (current) setExclude((ids) => [...ids, current.id])
  }

  const resetTaste = async () => {
    if (!window.confirm("Forget everything you've taught the AI? Your reviews, rankings and Taste DNA start over.")) return
    try {
      await postReset()
    } catch (err) {
      window.alert(`Couldn't reset: ${err.message}`)
      return
    }
    setMood('none')
    backToLanding()
    setResetCount((n) => n + 1) // re-fetches the feed and remounts the other tabs
  }

  // Remount tab content when the role changes, so it reloads with the new permissions.
  const viewKey = `${role}-${resetCount}`

  return (
    <div className="phone">
      <header className="header">
        <div className="header-top">
          <div className="eyebrow">The AI that learns your taste</div>
          <div className="header-actions">
            <button className="reset-btn" onClick={resetTaste} title="Forget what you've taught the AI">
              Reset my taste
            </button>
            <button className="reset-btn" onClick={logout} title={`Signed in as ${me.email}`}>
              Log out
            </button>
          </div>
        </div>
        <h1>
          Makan<span className="accent">Match</span>
        </h1>
        <RoleSwitcher />
        <nav className="tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className="tab"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <ActingAsTape />

      {activeTab === 'feed' && (
        <>
          <ContextBanner
            context={context}
            simRain={simRain}
            canSimulate={canSimulateRain}
            onToggleRain={() => setSimRain((v) => !v)}
          />
          <CompanySwitch
            company={company}
            onChange={(next) => {
              setCompany(next)
              backToLanding()
            }}
          />
          {error ? (
            <main className="feed">
              <button className="back-link" onClick={backToLanding}>
                ← Back
              </button>
              <div className="error">Feed unavailable: {error}</div>
            </main>
          ) : company === 'friends' && mode === 'idle' ? (
            <WithFriends
              selected={party}
              onSelect={setParty}
              onFind={(ids) => startWith(ids, 'find')}
              onSurprise={(ids) => startWith(ids, 'surprise')}
              onOpenKakis={() => setTab('kakis')}
            />
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
          {/* Mood buttons (MoodBar.jsx) are off for now; the bar keeps its space for what goes here next. */}
          <div className="moodbar" />
        </>
      )}

      {activeTab === 'kakis' && <Kakis key={viewKey} />}
      {activeTab === 'rate' && <Review key={viewKey} />}
      {activeTab === 'dna' && <TasteDna key={viewKey} />}
      {activeTab === 'profile' && <Profile key={viewKey} />}
      {activeTab === 'venues' && <MyVenues key={viewKey} />}
      {activeTab === 'admin' && <AdminPanel key={viewKey} />}
    </div>
  )
}

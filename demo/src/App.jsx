import { useEffect, useState } from 'react'
import { getContext, getRecommendations, postReset, setLocation } from './api/engineApi.js'
import { useAuth } from './auth/AuthContext.jsx'
import { BottomNav, TopBar } from './components/AppNav.jsx'
import ContextBanner from './components/ContextBanner.jsx'
import Feed from './components/Feed.jsx'
import LocationPicker from './components/LocationPicker.jsx'
import Login from './components/Login.jsx'
import MakanPet, { useMakanPet } from './components/MakanPet.jsx'
import Review from './components/Review.jsx'
import Splash from './components/Splash.jsx'
import TasteDna from './components/TasteDna.jsx'
import Me from './components/account/Me.jsx'
import Register from './components/account/Register.jsx'
import { ActingAsTape } from './components/account/RoleSwitcher.jsx'
import Kakis from './components/kakis/Kakis.jsx'
import WithFriends, { CompanySwitch } from './components/kakis/WithFriends.jsx'
import { loadWhere, locateMe, locationAllowed, saveWhere } from './location.js'

// Long enough for the logo to animate in, short enough not to be in the way.
const SPLASH_MS = 1100
const SPLASH_FADE_MS = 250

export default function App() {
  const { status } = useAuth()
  const [screen, setScreen] = useState('login')
  const [splash, setSplash] = useState('showing') // showing | leaving | gone

  useEffect(() => {
    if (status === 'signedOut') setScreen('login')
  }, [status])

  useEffect(() => {
    const leave = setTimeout(() => setSplash('leaving'), SPLASH_MS)
    const gone = setTimeout(() => setSplash('gone'), SPLASH_MS + SPLASH_FADE_MS)
    return () => {
      clearTimeout(leave)
      clearTimeout(gone)
    }
  }, [])

  // A slow session check keeps the splash up (without fading) until it's done.
  if (status === 'loading' || splash !== 'gone') {
    return (
      <div className="phone">
        <Splash leaving={splash !== 'showing' && status !== 'loading'} />
      </div>
    )
  }
  if (status === 'signedOut') {
    return (
      <div className="phone fade-in">
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
  const { me, role } = useAuth()
  const { pet, today, simulator, markReview, advanceDay, resetDaySimulator } = useMakanPet(me.id)
  const [tab, setTab] = useState('feed')
  const [petMinimized, setPetMinimized] = useState(false)
  const [reviewVenue, setReviewVenue] = useState(null) // set when a For you card starts a review
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
  const [where, setWhere] = useState(loadWhere) // { lat, lon, label, source, walkMin }

  // Rain simulation is an admin tool; viewing as a user or owner switches it off.
  const canSimulateRain = role === 'ADMIN'
  if (simRain && !canSimulateRain) setSimRain(false)

  const changeWhere = (next) => {
    setWhere(next)
    saveWhere(next)
  }

  // Before the fetches below, so they go out from the right spot.
  useEffect(() => {
    setLocation(where)
  }, [where.lat, where.lon])

  // "Use where I am" sticks: if the browser lets us without asking, follow the user on open.
  useEffect(() => {
    if (where.source !== 'gps') return
    let cancelled = false
    locationAllowed()
      .then((allowed) => (allowed ? locateMe() : null))
      .then((point) => {
        if (point && !cancelled) setWhere((w) => (w.source === 'gps' ? { ...w, ...point } : w))
      })
      .catch(() => {}) // keep the last known spot
    return () => { cancelled = true }
  }, [])

  // The weather chip sits in the top bar on every tab; its forecast is for where you are.
  useEffect(() => {
    let cancelled = false
    getContext(simRain)
      .then((c) => { if (!cancelled) setContext(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [simRain, resetCount, where.lat, where.lon])

  useEffect(() => {
    if (tab !== 'feed' || mode === 'idle') return
    let cancelled = false
    setError(null)
    getRecommendations(mode, mood, simRain, exclude, company === 'friends' ? party : [], where.walkMin)
      .then((data) => {
        if (cancelled) return
        setRecs(data)
        setContext(data.context)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [me.id, role, mode, mood, simRain, exclude, company, party, tab, resetCount, where.lat, where.lon, where.walkMin])

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

  // "Eat together" on a group card: For you, With friends, that group picked.
  const eatTogether = (ids) => {
    setCompany('friends')
    setParty(ids)
    backToLanding()
    setTab('feed')
  }

  const anotherSurprise = () => {
    const current = recs?.venues?.[0]
    if (current) setExclude((ids) => [...ids, current.id])
  }

  const startPetReview = () => {
    setReviewVenue(null)
    setTab('rate')
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
    <div className="phone with-nav fade-in">
      <TopBar
        me={me}
        onOpenMe={() => setTab('me')}
        weather={
          <ContextBanner
            context={context}
            simRain={simRain}
            canSimulate={canSimulateRain}
            onToggleRain={() => setSimRain((v) => !v)}
          />
        }
      />
      <ActingAsTape />

      {tab === 'feed' && (
        <>
          <CompanySwitch
            company={company}
            onChange={(next) => {
              setCompany(next)
              backToLanding()
            }}
          />
          <LocationPicker where={where} area={context?.area} onChange={changeWhere} />
          <MakanPet
            pet={pet}
            today={today}
            simulator={simulator}
            minimized={petMinimized}
            onToggleMinimized={() => setPetMinimized((value) => !value)}
            onCare={startPetReview}
            onNextDay={advanceDay}
            onResetSimulator={resetDaySimulator}
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
              onReview={(venue) => {
                setReviewVenue(venue)
                setTab('rate')
              }}
            />
          )}
        </>
      )}

      {tab === 'kakis' && <Kakis key={viewKey} onEatTogether={eatTogether} onOpenMe={() => setTab('me')} />}
      {tab === 'rate' && (
        <>
          <MakanPet
            pet={pet}
            today={today}
            simulator={simulator}
            minimized={petMinimized}
            onToggleMinimized={() => setPetMinimized((value) => !value)}
            onNextDay={advanceDay}
            onResetSimulator={resetDaySimulator}
          />
          <Review
            key={viewKey}
            startVenue={reviewVenue}
            onReviewSaved={markReview}
          />
        </>
      )}
      {tab === 'dna' && <TasteDna key={viewKey} />}
      {tab === 'me' && <Me key={viewKey} onResetTaste={resetTaste} />}

      <BottomNav
        active={tab}
        onSelect={(next) => {
          setReviewVenue(null)
          setTab(next)
        }}
      />
    </div>
  )
}

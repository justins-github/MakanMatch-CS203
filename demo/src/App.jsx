import { useEffect, useRef, useState } from 'react'
import {
  getContext, getMonthChanges, getMonths, getRecommendations, postReset, setDemoMonth, setLocation, setReopened, warmServices,
} from './api/engineApi.js'
import { useAuth } from './auth/AuthContext.jsx'
import { BottomNav, TopBar } from './components/AppNav.jsx'
import ContextBanner from './components/ContextBanner.jsx'
import Feed from './components/Feed.jsx'
import LocationPicker from './components/LocationPicker.jsx'
import Login from './components/Login.jsx'
import MakanPet, { useMakanPet } from './components/MakanPet.jsx'
import MonthChanges from './components/MonthChanges.jsx'
import Review from './components/Review.jsx'
import ReviewerProfile from './components/reviews/ReviewerProfile.jsx'
import DemoPanel from './components/DemoPanel.jsx'
import { ReviewBombProvider } from './components/ReviewBomb.jsx'
import { startKeepWarm } from './keepWarm.js'
import { addStillOpen, latestOnly, searchScope } from './monthSwitch.js'
import { movesBetween } from './rankMoves.js'
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

  // From the splash on, so the services are awake by the first Find.
  useEffect(() => startKeepWarm({ ping: warmServices }), [])

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
  const { pet, today, simulator, minimized: petMinimized, toggleMinimized: togglePet, markReview, advanceDay, resetDaySimulator } = useMakanPet(me.id)
  const [tab, setTab] = useState('feed')
  const [editingTaste, setEditingTaste] = useState(false) // an admin's taste sliders, on Taste DNA
  const [reviewVenue, setReviewVenue] = useState(null) // set when a For you card starts a review
  const [reviewOpened, setReviewOpened] = useState(false) // the Review tab loads when first opened
  const [reviewerId, setReviewerId] = useState(null) // whose profile is open, over the current tab
  const [reviewerScroll, setReviewerScroll] = useState(0) // where to come back to
  if (tab === 'rate' && !reviewOpened) setReviewOpened(true)
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
  const [demoVersion, setDemoVersion] = useState(0) // bumped when an admin's demo tool changes things
  const [rankBefore, setRankBefore] = useState(null) // the list's order before that change
  const [where, setWhere] = useState(loadWhere) // { lat, lon, label, source, walkMin }
  // The Month switch (Demo controls): the months there are, the one loaded (null = the
  // month we started from), gone places you said are still open, and the screen it stops on.
  const [months, setMonths] = useState([])
  const [month, setMonth] = useState(null)
  const [stillOpen, setStillOpen] = useState([])
  const [monthScreen, setMonthScreen] = useState(null) // { status: 'loading', text } | { status: 'ready', changes }
  const monthRequests = useRef(latestOnly()) // so a slow answer can't land after a newer one, or after you've left

  // The Demo controls (rain and the rest) are an admin tool; viewing as a user or owner switches rain off.
  const canDemo = role === 'ADMIN'
  if (simRain && !canDemo) setSimRain(false)
  if ((month || monthScreen) && !canDemo) {
    setMonth(null)
    setStillOpen([])
    setMonthScreen(null)
  }

  const changeWhere = (next) => {
    setWhere(next)
    saveWhere(next)
    setRankBefore(null) // a new spot is a new list, not the old one moved
  }

  // Before the fetches below, so they go out from the right spot.
  useEffect(() => {
    setLocation(where)
  }, [where.lat, where.lon])

  // Likewise, so they ask for the month that's loaded.
  useEffect(() => {
    setDemoMonth(month)
    setReopened(stillOpen)
  }, [month, stillOpen])

  useEffect(() => {
    if (!canDemo) return undefined
    let cancelled = false
    getMonths()
      .then((r) => { if (!cancelled) setMonths(r.months) })
      .catch(() => {}) // the Month row just says it's checking
    return () => { cancelled = true }
  }, [canDemo])

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
  }, [me.id, role, mode, mood, simRain, exclude, company, party, tab, resetCount, where.lat, where.lon, where.walkMin, demoVersion, month, stillOpen])

  const startMode = (next) => {
    setRecs(null)
    setExclude([])
    setRankBefore(null)
    setMode(next)
  }

  // A Demo control changed what Find shows: back to For you and Find again, keeping the
  // old order so the cards can say how they moved.
  const afterDemoChange = () => {
    setReviewerId(null)
    setTab('feed')
    if (mode === 'idle') return startMode('find')
    setRankBefore(recs?.venues.map((v) => v.id) ?? null)
    setDemoVersion((n) => n + 1)
  }
  // The Month switch: a short refresh, then what changed since the month we started from
  // (for a later month), then Find. Going back to the first month skips the screen. Find
  // is fetched once, when the month changes (the effect above); the list's order from
  // before is kept so the cards can say how they moved.
  const showPicks = () => {
    setReviewerId(null)
    setTab('feed')
    if (mode === 'idle') startMode('find')
  }
  const loadMonth = async (next) => {
    const picked = months.find((m) => m.month === next)
    if (!picked) return
    const ticket = monthRequests.current.begin()
    const first = months.find((m) => m.base)?.label ?? ''
    setReviewerId(null)
    setTab('feed')
    setError(null)
    setMonthScreen({
      status: 'loading',
      text: picked.base ? `Loading ${picked.label}…` : `Checking what changed since ${first.split(' ')[0]}…`,
    })
    const pause = new Promise((resolve) => setTimeout(resolve, picked.base ? 800 : 1200))
    try {
      const [changes] = await Promise.all([picked.base ? null : getMonthChanges(next, where.walkMin), pause])
      if (!monthRequests.current.isCurrent(ticket)) return
      setRankBefore(mode === 'find' ? recs?.venues.map((v) => v.id) ?? null : null)
      // Together with the month, so Find is asked once: a fresh month starts with nothing reopened.
      setStillOpen((ids) => (ids.length ? [] : ids))
      setMonth(picked.base ? null : next)
      if (picked.base) {
        setMonthScreen(null)
        showPicks()
      } else {
        setMonthScreen({ status: 'ready', changes })
      }
    } catch (err) {
      if (!monthRequests.current.isCurrent(ticket)) return
      setMonthScreen(null)
      setError(err.message)
    }
  }
  const leaveMonthScreen = () => {
    monthRequests.current.cancel() // an "It's still open" answer still on its way must not bring the screen back
    setMonthScreen(null)
    showPicks()
  }
  // "It's still open": the place comes back for you, and drops off the change list.
  const sayStillOpen = async (venueId) => {
    const next = addStillOpen(stillOpen, venueId)
    if (next === stillOpen) return
    const ticket = monthRequests.current.begin()
    setStillOpen(next)
    try {
      const changes = await getMonthChanges(month, where.walkMin, next)
      if (monthRequests.current.isCurrent(ticket)) setMonthScreen({ status: 'ready', changes })
    } catch (err) {
      if (!monthRequests.current.isCurrent(ticket)) return
      setMonthScreen(null)
      setError(err.message)
    }
  }

  // Only Find's list has places to move; Surprise is one pick at a time.
  const moves = mode === 'find' && rankBefore && recs ? movesBetween(rankBefore, recs.venues) : null

  const backToLanding = () => {
    setRankBefore(null)
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
    if (current) setExclude((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]))
  }

  // Un-skipping the last pick brings it back: with the same skips, the engine picks the same place.
  const previousSurprise = () => setExclude((ids) => ids.slice(0, -1))

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

  const openReviewer = (id) => {
    setReviewerScroll(window.scrollY)
    setReviewerId(id)
    window.scrollTo(0, 0)
  }
  const closeReviewer = () => {
    setReviewerId(null)
    requestAnimationFrame(() => window.scrollTo(0, reviewerScroll))
  }

  // Remount tab content when the role changes, so it reloads with the new permissions.
  const viewKey = `${role}-${resetCount}`

  return (
    <ReviewBombProvider enabled={canDemo} onChanged={afterDemoChange}>
    <div className="phone with-nav fade-in">
      <TopBar
        me={me}
        onOpenMe={() => setTab('me')}
        weather={<ContextBanner context={context} />}
        demo={canDemo && (
          <DemoPanel
            key={viewKey}
            simRain={simRain}
            onToggleRain={() => setSimRain((v) => !v)}
            today={today}
            simulator={simulator}
            onNextDay={advanceDay}
            onResetPet={resetDaySimulator}
            onFindAgain={afterDemoChange}
            months={months}
            month={month}
            onLoadMonth={loadMonth}
            onEditTaste={() => {
              setReviewerId(null)
              setEditingTaste(true)
              setTab('dna')
            }}
          />
        )}
      />
      <ActingAsTape />

      {reviewerId && <ReviewerProfile key={reviewerId} id={reviewerId} onBack={closeReviewer} />}

      {/* Stays mounted under a profile, so Back returns to the same open card. */}
      <div className="tab-keep" hidden={reviewerId != null}>
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
          <MakanPet pet={pet} today={today} minimized={petMinimized} onToggleMinimized={togglePet} onCare={startPetReview} />
          {monthScreen?.status === 'loading' ? (
            <main className="feed">
              <div className="loading">{monthScreen.text}</div>
            </main>
          ) : monthScreen ? (
            <MonthChanges changes={monthScreen.changes} onStillOpen={sayStillOpen} onDone={leaveMonthScreen} />
          ) : error ? (
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
              onPrevious={exclude.length > 0 ? previousSurprise : null}
              onBack={backToLanding}
              onReview={(venue) => {
                setReviewVenue(venue)
                setTab('rate')
              }}
              onOpenReviewer={openReviewer}
              moves={moves}
            />
          )}
        </>
      )}

      {tab === 'kakis' && <Kakis key={viewKey} onEatTogether={eatTogether} onOpenMe={() => setTab('me')} onOpenReviewer={openReviewer} />}
      {tab === 'rate' && <MakanPet pet={pet} today={today} minimized={petMinimized} onToggleMinimized={togglePet} />}
      {/* Stays mounted once opened, so an unfinished review survives a look at another tab. */}
      {reviewOpened && (
        <div className="tab-keep" hidden={tab !== 'rate'}>
          {/* Remounts when the Month switch changes what search returns: its cache is per month. */}
          <Review
            key={`${viewKey}-${searchScope(month, stillOpen)}`}
            active={tab === 'rate'}
            startVenue={reviewVenue}
            onReviewSaved={markReview}
          />
        </div>
      )}
      {tab === 'dna' && (
        <TasteDna
          key={viewKey}
          canEdit={canDemo}
          editing={editingTaste}
          onEditing={setEditingTaste}
          onSaved={afterDemoChange}
        />
      )}
      {tab === 'me' && <Me key={viewKey} onResetTaste={resetTaste} />}
      </div>

      <BottomNav
        active={tab}
        onSelect={(next) => {
          setReviewVenue(null)
          setReviewerId(null)
          setEditingTaste(false)
          setTab(next)
        }}
      />
    </div>
    </ReviewBombProvider>
  )
}

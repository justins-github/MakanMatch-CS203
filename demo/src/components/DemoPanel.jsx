import { useEffect, useRef, useState } from 'react'
import { getDials } from '../api/engineApi.js'
import DemoRow from './DemoRow.jsx'
import { displayDate } from './MakanPet.jsx'
import { bombSentence, useReviewBomb } from './ReviewBomb.jsx'
import './demo-panel.css'

// An admin's demo controls, behind one "Demo" button in the top bar, on a screen of their
// own: the outside world (rain, the review bomb - dropped from a restaurant's card, taken
// back here or there), your taste (edited on the Taste DNA tab) and time (Makan Pet's
// days). What changes Find closes the screen and runs Find again (onFindAgain), so the
// room sees the list move. The button counts what's switched on, so nothing is left on
// after a rehearsal.

function ReviewBombRow({ onUndone }) {
  const { bomb, busy, error, on, undo } = useReviewBomb()
  const state = !bomb ? 'Checking…'
    : !bomb.ready ? "Needs one-time setup: the demo accounts can't sign in yet."
      : on ? `On: ${bombSentence(bomb)}. Everyone's Find sees it.`
        : "Off. Drop it from the card of a place with a menu, like Turk's Kebab or Selegie Soto Corner: open Map · reviews, then Review-bomb this place."

  return (
    <>
      <DemoRow title="Review bomb" state={state} detail={bomb?.why} on={on}>
        {on && (
          <button
            type="button"
            className="btn quiet"
            disabled={busy != null}
            onClick={async () => {
              if (await undo()) onUndone()
            }}
          >
            {busy?.kind === 'undo' ? 'Undoing…' : 'Undo'}
          </button>
        )}
      </DemoRow>
      {error && !error.venueId && <div className="demo-error">{error.message}</div>}
    </>
  )
}

export default function DemoPanel({ simRain, onToggleRain, today, simulator, onNextDay, onResetPet, onFindAgain, onEditTaste }) {
  const [open, setOpen] = useState(false)
  const reviewBomb = useReviewBomb()
  const [byHand, setByHand] = useState(null) // is your taste set by hand right now?
  const doneRef = useRef(null)
  const testDays = simulator.offset
  const on = [simRain, reviewBomb?.on, testDays > 0].filter(Boolean).length

  useEffect(() => {
    if (!open) return undefined
    doneRef.current?.focus()
    getDials().then((taste) => setByHand(taste.setByHand)).catch(() => setByHand(null))
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const findAgain = () => {
    setOpen(false)
    onFindAgain()
  }

  return (
    <>
      <button
        type="button"
        className={`demo-button${on ? ' on' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Demo{on > 0 && <span className="demo-count">{on} on</span>}
      </button>

      {/* Stays mounted while closed, so the button knows what's on. */}
      <section className="demo-screen" role="dialog" aria-modal="true" aria-labelledby="demo-title" hidden={!open}>
        <header className="demo-screen-head">
          <button ref={doneRef} type="button" className="demo-done" onClick={() => setOpen(false)}>
            ← Done
          </button>
          <h2 id="demo-title">Demo controls</h2>
        </header>
        <p className="demo-note">Admins only. Each one changes what Find shows, and Find runs again after.</p>

        <h3 className="demo-section">Outside world</h3>
        <DemoRow title="Rain" on={simRain} state={simRain ? 'On: Find treats it as raining.' : 'Off: live weather.'}>
          <button
            type="button"
            className={`btn ${simRain ? 'quiet' : 'go'}`}
            onClick={() => {
              onToggleRain()
              findAgain()
            }}
          >
            {simRain ? 'Stop' : 'Simulate'}
          </button>
        </DemoRow>
        <ReviewBombRow onUndone={() => setOpen(false)} />

        <h3 className="demo-section">Your taste</h3>
        <DemoRow
          title="Taste sliders"
          state={byHand == null ? 'Checking…' : byHand ? 'Set by hand, until your next review.' : 'Learned from your reviews.'}
        >
          <button
            type="button"
            className="btn quiet"
            onClick={() => {
              setOpen(false)
              onEditTaste()
            }}
          >
            Edit
          </button>
        </DemoRow>

        <h3 className="demo-section">Time</h3>
        <DemoRow
          title="Makan Pet"
          on={testDays > 0}
          state={testDays > 0 ? `Test day: ${displayDate(today)}, ${testDays} ahead.` : `Today: ${displayDate(today)}.`}
        >
          <button type="button" className="btn quiet" onClick={onNextDay}>Next day →</button>
          <button type="button" className="btn quiet" title="Back to today, and the pet starts over" onClick={onResetPet}>
            Reset
          </button>
        </DemoRow>
        {simulator.error && <div className="demo-error">{simulator.error}</div>}
      </section>
    </>
  )
}

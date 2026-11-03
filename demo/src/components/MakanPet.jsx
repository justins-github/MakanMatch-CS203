import { useCallback, useEffect, useState } from 'react'

const PET_KEY = 'mm-makan-pet'
const DAY_SIMULATOR_KEY = 'mm-makan-pet-day-offset'
const DAY_MS = 24 * 60 * 60 * 1000
const STAGES = [
  { name: 'Baby otter', startsAt: 0, scale: 'baby' },
  { name: 'Little otter', startsAt: 7, scale: 'little' },
  { name: 'Growing otter', startsAt: 21, scale: 'growing' },
  { name: 'Grown otter', startsAt: 42, scale: 'grown' },
]

function singaporeDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDays(date, count) {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + count))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

function readDayOffset(accountId) {
  try {
    const saved = window.localStorage.getItem(`${DAY_SIMULATOR_KEY}:${accountId}`)
    if (saved == null) return { offset: 0, error: null }
    const offset = Number(saved)
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Saved day simulator value is invalid.')
    return { offset, error: null }
  } catch (error) {
    return { offset: 0, error: `Day simulator could not be loaded: ${error.message}` }
  }
}

function daysBetween(first, second) {
  const toUtc = (date) => {
    const [year, month, day] = date.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((toUtc(first) - toUtc(second)) / DAY_MS)
}

function storageKey(accountId) {
  return `${PET_KEY}:${accountId}`
}

function readPet(accountId) {
  try {
    const saved = window.localStorage.getItem(storageKey(accountId))
    if (!saved) return { lastReviewDate: null, streak: 0 }

    const pet = JSON.parse(saved)
    if (
      typeof pet.lastReviewDate !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(pet.lastReviewDate)
      || !Number.isInteger(pet.streak)
      || pet.streak < 1
    ) {
      throw new Error('Saved pet progress is invalid.')
    }
    return pet
  } catch (error) {
    return {
      lastReviewDate: null,
      streak: 0,
      error: `Pet progress could not be loaded or saved: ${error.message}`,
    }
  }
}

function stageFor(streak) {
  return STAGES.reduce((current, stage) => (streak >= stage.startsAt ? stage : current), STAGES[0])
}

function progressFor(streak, stage) {
  const next = STAGES[STAGES.indexOf(stage) + 1]
  if (!next) return { value: 1, label: 'Fully grown!' }
  const progress = (streak - stage.startsAt) / (next.startsAt - stage.startsAt)
  return {
    value: Math.max(0, Math.min(1, progress)),
    label: `${Math.max(0, next.startsAt - streak)} ${next.startsAt - streak === 1 ? 'day' : 'days'} to grow`,
  }
}

function Otter({ stage, fainted }) {
  return (
    <svg
      className={`makan-pet-art ${fainted ? 'fainted' : ''}`}
      data-stage={stage.scale}
      viewBox="0 0 160 120"
      role="img"
      aria-label={`${fainted ? 'Fainted' : stage.name} otter`}
    >
      <ellipse cx="80" cy="106" rx="50" ry="7" fill="#201b15" opacity=".12" />
      <ellipse cx="47" cy="92" rx="20" ry="11" fill="#8a512f" />
      <ellipse cx="113" cy="92" rx="20" ry="11" fill="#8a512f" />
      <ellipse cx="80" cy="76" rx="39" ry="31" fill="#a96439" />
      <ellipse cx="80" cy="80" rx="22" ry="25" fill="#f3d9ae" />
      <path d="M48 68c-9 5-11 20-6 28 8 4 17 0 22-7" fill="#a96439" />
      <path d="M112 68c9 5 11 20 6 28-8 4-17 0-22-7" fill="#a96439" />
      <circle cx="80" cy="43" r="31" fill="#a96439" />
      <circle cx="57" cy="25" r="10" fill="#8a512f" />
      <circle cx="103" cy="25" r="10" fill="#8a512f" />
      <circle cx="58" cy="25" r="5" fill="#e6ad83" />
      <circle cx="102" cy="25" r="5" fill="#e6ad83" />
      <ellipse cx="80" cy="53" rx="19" ry="14" fill="#f3d9ae" />
      <ellipse cx="80" cy="47" rx="5" ry="3.5" fill="#201b15" />
      {fainted ? (
        <g fill="none" stroke="#201b15" strokeWidth="2" strokeLinecap="round">
          <path d="M69 40c-5 0-5-7 0-7 4 0 5 5 2 7-3 2-7-1-6-5" />
          <path d="M91 40c-5 0-5-7 0-7 4 0 5 5 2 7-3 2-7-1-6-5" />
        </g>
      ) : (
        <>
          <circle cx="69" cy="40" r="2.8" fill="#201b15" />
          <circle cx="91" cy="40" r="2.8" fill="#201b15" />
          <circle cx="70" cy="39" r="1" fill="#fffdf9" />
          <circle cx="92" cy="39" r="1" fill="#fffdf9" />
        </>
      )}
      <path d="M77 56q3 3 6 0" fill="none" stroke="#201b15" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="62" cy="51" rx="4" ry="2.5" fill="#d98777" opacity=".65" />
      <ellipse cx="98" cy="51" rx="4" ry="2.5" fill="#d98777" opacity=".65" />
      <path d="M62 88q-5 5-11 3M98 88q5 5 11 3" fill="none" stroke="#8a512f" strokeWidth="3" strokeLinecap="round" />
      {!fainted && <path d="M124 30q4-8 9 0 5-8 9 0" fill="none" stroke="#ffc42e" strokeWidth="3" strokeLinecap="round" />}
      {fainted && (
        <g fill="#46689b" fontFamily="sans-serif" fontWeight="700">
          <text x="116" y="27" fontSize="16">Z</text>
          <text x="130" y="16" fontSize="12">z</text>
        </g>
      )}
    </svg>
  )
}

export function useMakanPet(accountId) {
  const [pet, setPet] = useState(() => readPet(accountId))
  const [simulator, setSimulator] = useState(() => readDayOffset(accountId))
  const simulationOffset = simulator.offset
  const [today, setToday] = useState(() => addDays(singaporeDate(), readDayOffset(accountId).offset))
  const key = storageKey(accountId)
  const simulatorKey = `${DAY_SIMULATOR_KEY}:${accountId}`

  useEffect(() => {
    setPet(readPet(accountId))
    const initial = readDayOffset(accountId)
    setSimulator(initial)
    const refresh = () => {
      const current = readDayOffset(accountId)
      setSimulator(current)
      setToday(addDays(singaporeDate(), current.offset))
      setPet(readPet(accountId))
    }
    const handleStorage = (event) => {
      if (event.key === key || event.key === simulatorKey) refresh()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', handleStorage)
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', handleStorage)
      window.clearInterval(timer)
    }
  }, [accountId, key, simulatorKey])

  const markReview = useCallback(() => {
    const date = addDays(singaporeDate(), simulationOffset)
    if (pet.lastReviewDate === date) return
    const streak = pet.lastReviewDate && daysBetween(date, pet.lastReviewDate) === 1
      ? pet.streak + 1
      : 1
    const next = { lastReviewDate: date, streak }
    let error = null
    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch (storageError) {
      error = `Pet progress could not be saved: ${storageError.message}`
    }
    setPet({ ...next, error })
    setToday(date)
  }, [key, pet, simulationOffset])

  const advanceDay = useCallback(() => {
    const nextOffset = simulationOffset + 1
    setToday(addDays(singaporeDate(), nextOffset))
    try {
      window.localStorage.setItem(simulatorKey, String(nextOffset))
      setSimulator({ offset: nextOffset, error: null })
    } catch (error) {
      setSimulator({ offset: nextOffset, error: `Day simulator could not be saved: ${error.message}` })
    }
  }, [simulationOffset, simulatorKey])

  const resetDaySimulator = useCallback(() => {
    try {
      window.localStorage.removeItem(key)
      window.localStorage.removeItem(simulatorKey)
      setPet({ lastReviewDate: null, streak: 0 })
      setSimulator({ offset: 0, error: null })
      setToday(singaporeDate())
    } catch (error) {
      setSimulator((current) => ({ ...current, error: `Pet test could not be reset: ${error.message}` }))
    }
  }, [key, simulatorKey])

  return { pet, today, simulator, markReview, advanceDay, resetDaySimulator }
}

function displayDate(date) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export default function MakanPet({ pet, today, simulator, onCare, onNextDay, onResetSimulator }) {
  const missedDay = pet.lastReviewDate && daysBetween(today, pet.lastReviewDate) > 1
  const fainted = Boolean(missedDay)
  const stage = stageFor(pet.streak)
  const progress = progressFor(pet.streak, stage)
  const message = fainted
    ? 'Makan missed a day, is starving and fainted. Make a review to wake them up and start a new streak.'
    : pet.lastReviewDate === today
      ? 'Makan is happy and cared for today. See you tomorrow!'
      : pet.lastReviewDate
        ? 'Make a review today to keep Makan growing.'
        : 'Make your first review to meet Makan and start a streak.'

  return (
    <section className={`makan-pet ${fainted ? 'is-fainted' : ''}`} aria-label="Makan Pet">
      <div className="makan-pet-picture">
        <Otter stage={stage} fainted={fainted} />
      </div>
      <div className="makan-pet-info">
        <div className="makan-pet-heading">
          <div>
            <div className="makan-pet-eyebrow">Makan Pet</div>
            <h2>{stage.name}</h2>
          </div>
          <span className="makan-pet-streak">
            {pet.streak} {pet.streak === 1 ? 'day' : 'days'} 🔥
          </span>
        </div>
        <p>{message}</p>
        <div className="makan-pet-progress" aria-label={`${Math.round(progress.value * 100)}% to the next growth stage`}>
          <span><i style={{ width: `${progress.value * 100}%` }} /></span>
          <small>{progress.label}</small>
        </div>
      </div>
      {onCare && (
        <button type="button" className="makan-pet-care" onClick={onCare} aria-label="Review a dish to care for Makan">
          Review
        </button>
      )}
      <div className="makan-pet-simulator">
        <span>{simulator.offset ? 'Test day' : 'Today'}: {displayDate(today)}</span>
        <div>
          <button type="button" onClick={onNextDay}>Next day →</button>
          <button type="button" onClick={onResetSimulator}>Reset test</button>
        </div>
      </div>
      {(pet.error || simulator.error) && (
        <div className="makan-pet-error" role="status">{pet.error || simulator.error}</div>
      )}
    </section>
  )
}

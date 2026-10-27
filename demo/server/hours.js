// Is a venue open right now, going by the weekly hours its owner set in
// catalog-service? Hours arrive in the catalog's shape - seven days of
// { day: 'MONDAY', sessions: [{ opens: '11:00', closes: '14:30' }] } - where a
// closing time earlier than the opening time runs past midnight and the same time
// for both means open 24 hours. An empty week means the owner never said: unknown.
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY = 24 * 60
const WEEK = 7 * DAY
const SG_OFFSET_MIN = 8 * 60 // Singapore has no daylight saving

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Singapore minutes since Monday 00:00.
function minuteOfWeek(now) {
  const sg = new Date(now.getTime() + SG_OFFSET_MIN * 60_000)
  return ((sg.getUTCDay() + 6) % 7) * DAY + sg.getUTCHours() * 60 + sg.getUTCMinutes()
}

// Opening stretches as merged [start, end) minutes, laid over three consecutive
// weeks so a Sunday-night session running into Monday, and "when does it open
// next", need no special cases. Back-to-back sessions merge into one.
function stretches(week) {
  const raw = []
  for (const { day, sessions } of week) {
    const d = DAYS.indexOf(day)
    if (d < 0) continue
    for (const { opens, closes } of sessions) {
      const o = toMinutes(opens)
      const c = toMinutes(closes)
      const start = d * DAY + o
      const length = c > o ? c - o : c < o ? c + DAY - o : DAY
      for (let w = 0; w < 3; w++) raw.push([start + w * WEEK, start + length + w * WEEK])
    }
  }
  raw.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const [start, end] of raw) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

// 660 -> "11am", 1050 -> "5:30pm", 0 -> "12am"
function clock(minutes) {
  const m = minutes % DAY
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

const dayName = (minutes) => SHORT[Math.floor(minutes / DAY) % 7]

// Within a day it's just the time ("2am" after midnight reads fine); further out it needs the day.
const closing = (end, now) => (end - now < DAY ? clock(end) : `${dayName(end)} ${clock(end)}`)

function opening(start, now) {
  const days = Math.floor(start / DAY) - Math.floor(now / DAY)
  if (days === 0) return clock(start)
  if (days === 1) return `tomorrow ${clock(start)}`
  return `${dayName(start)} ${clock(start)}`
}

// null when the hours are unknown, else { openNow, next, label }:
// { openNow: true, next: 'closes 9:30pm', label: 'Open now · closes 9:30pm' }
export function openState(week, now = new Date()) {
  if (!week?.length) return null
  const merged = stretches(week)
  if (merged.length === 0) return null
  const t = minuteOfWeek(now) + WEEK // the middle week
  const current = merged.find(([start, end]) => start <= t && t < end)
  if (current) {
    if (current[1] - t >= WEEK) return { openNow: true, next: null, label: 'Open 24 hours' }
    const next = `closes ${closing(current[1], t)}`
    return { openNow: true, next, label: `Open now · ${next}` }
  }
  const next = `opens ${opening(merged.find(([start]) => start > t)[0], t)}`
  return { openNow: false, next, label: `Closed now · ${next}` }
}

// Venues shut right now drop out (listed, so the feed can say why); open ones
// carry their hours for the card; venues with unknown hours pass untouched.
export function applyOpeningHours(venues, hoursByVenue, now = new Date()) {
  const open = []
  const shutNow = []
  for (const venue of venues) {
    const state = openState(hoursByVenue.get(venue.id), now)
    if (!state) open.push(venue)
    else if (state.openNow) open.push({ ...venue, hours: state })
    else shutNow.push({ id: venue.id, name: venue.name, next: state.next })
  }
  return { open, shutNow }
}

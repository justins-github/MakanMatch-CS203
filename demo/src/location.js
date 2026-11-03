// Where For you searches from: a spot ({ lat, lon, label, source }) plus how far to
// walk. It lives in this browser only (never on the server) and survives reloads.

export const SMU_SPOT = { lat: 1.2966, lon: 103.85, label: 'SMU', source: 'pick' }
export const WALK_CHOICES = [10, 20, 30]
const DEFAULT_WALK = 20

// One tap away; coordinates from OneMap (MRT stations, SMU's own pin).
export const QUICK_PICKS = [
  SMU_SPOT,
  { lat: 1.324, lon: 103.93, label: 'Bedok', source: 'pick' },
  { lat: 1.3533, lon: 103.9451, label: 'Tampines', source: 'pick' },
  { lat: 1.333, lon: 103.7424, label: 'Jurong East', source: 'pick' },
  { lat: 1.304, lon: 103.8322, label: 'Orchard', source: 'pick' },
  { lat: 1.3699, lon: 103.8496, label: 'Ang Mo Kio', source: 'pick' },
]

const KEY = 'mm-where'

// The same box the engine accepts.
export const inSingapore = ({ lat, lon }) => lat >= 1.13 && lat <= 1.47 && lon >= 103.59 && lon <= 104.1

const usable = (w) =>
  w && Number.isFinite(w.lat) && Number.isFinite(w.lon) && inSingapore(w) && typeof w.label === 'string' &&
  WALK_CHOICES.includes(w.walkMin)

// The saved spot, or SMU and a 20-minute walk. Storage can be blocked, so never trust it.
export function loadWhere() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    if (usable(saved)) return saved
  } catch {
    // blocked or corrupt: start from the default
  }
  return { ...SMU_SPOT, walkMin: DEFAULT_WALK }
}

export function saveWhere(where) {
  try {
    localStorage.setItem(KEY, JSON.stringify(where))
  } catch {
    // not saved; it still applies until the page closes
  }
}

// The browser's idea of where we are -> { lat, lon }; rejects with a message to show.
export function locateMe() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser can't share your location. Pick a spot instead."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lon: coords.longitude }
        if (inSingapore(point)) resolve(point)
        else reject(new Error("You seem to be outside Singapore, so we've kept your spot."))
      },
      (err) => {
        const why = {
          1: 'Location is blocked for this site. Allow it in your browser, or pick a spot instead.',
          2: "Couldn't work out where you are. Pick a spot instead.",
          3: 'Finding you took too long. Try again, or pick a spot instead.',
        }
        reject(new Error(why[err.code] ?? "Couldn't get your location."))
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

// True when the browser will hand over the location without asking.
export async function locationAllowed() {
  try {
    return (await navigator.permissions?.query({ name: 'geolocation' }))?.state === 'granted'
  } catch {
    return false
  }
}

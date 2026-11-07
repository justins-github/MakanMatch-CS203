// Location helpers. Each request says where the user is (X-Location); without
// it the demo's old pin, SMU, still applies.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

export const SMU = { lat: 1.2966, lon: 103.85 }

// How far Find and Surprise look, unless the user picks another walk.
export const DEFAULT_WALK_MIN = 20

// Singapore's bounding box (the same one context-service accepts).
const SG = { minLat: 1.13, maxLat: 1.47, minLon: 103.59, maxLon: 104.1 }

const WALK_METERS_PER_MIN = 80
// Streets aren't straight: foot routes between 40 sampled venues and 10 spots across
// Singapore (OpenStreetMap) ran a median 1.4x the straight line, so we allow for that.
const ROUTE_DETOUR = 1.4

// data.gov.sg's 47 two-hour forecast areas and their label points, kept on disk so
// a spot can be named (and matched to its forecast) even when the API is down.
const AREAS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data', 'sg_areas.json'), 'utf8'),
)

// Great-circle distance in km.
export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// Estimated walk minutes between two points at 80 m/min (at least 1). An estimate from
// the straight-line distance, not a route: a river or expressway can still add more.
export function walkMinutes(from, to) {
  return Math.max(1, Math.round((haversineKm(from, to) * 1000 * ROUTE_DETOUR) / WALK_METERS_PER_MIN))
}

export function inSingapore({ lat, lon }) {
  return lat >= SG.minLat && lat <= SG.maxLat && lon >= SG.minLon && lon <= SG.maxLon
}

// "1.3521,103.8198" -> { lat, lon }; null when it isn't two numbers inside Singapore.
export function parseLatLon(text) {
  const parts = String(text ?? '').split(',').map((s) => s.trim())
  if (parts.length !== 2 || parts.some((p) => !/^-?\d+(\.\d+)?$/.test(p))) return null
  const point = { lat: Number(parts[0]), lon: Number(parts[1]) }
  return inSingapore(point) ? point : null
}

// The forecast area whose label point is closest, e.g. "Tampines".
export function nearestArea(point) {
  let best = null
  let bestKm = Infinity
  for (const area of AREAS) {
    const km = haversineKm(point, area)
    if (km < bestKm) {
      best = area.name
      bestKm = km
    }
  }
  return best
}

// The venues within `walkMin` of `from`, each carrying its walk time from there.
// Venues without coordinates can't be placed, so they never count as nearby.
export function venuesNear(venues, from, walkMin) {
  const reachKm = (walkMin * WALK_METERS_PER_MIN) / ROUTE_DETOUR / 1000
  // A cheap box check first; a degree of latitude is ~111 km.
  const dLat = reachKm / 111 + 0.001
  const dLon = dLat / Math.cos((from.lat * Math.PI) / 180)
  const near = []
  for (const v of venues) {
    if (v.lat == null || v.lon == null) continue
    if (Math.abs(v.lat - from.lat) > dLat || Math.abs(v.lon - from.lon) > dLon) continue
    const distanceMin = walkMinutes(from, v)
    if (distanceMin <= walkMin) near.push({ ...v, distanceMin })
  }
  return near
}

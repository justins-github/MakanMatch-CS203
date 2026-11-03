// OneMap's public place search (no key needed): a building, MRT or postcode -> points
// in Singapore, for the location picker. Like aiClient it never throws: if OneMap is
// down or answers oddly, search() returns null and the picker says search is unavailable
// (the browser's location and the quick picks still work). Answers are cached 10 min.
import { inSingapore } from '../geo.js'

const SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search'
const MAX_RESULTS = 6
const CACHE_MS = 10 * 60 * 1000
const CACHE_SIZE = 200

// Short words OneMap writes in capitals that should stay that way.
const KEEP_UPPER = new Set(['MRT', 'LRT', 'SMU', 'NUS', 'NTU', 'SUTD', 'SIT', 'SUSS', 'HDB', 'ITE', 'CC', 'JTC', 'URA', 'YMCA'])

// "BEDOK MRT STATION (EW5)" -> "Bedok MRT Station (EW5)"
export function titleCase(text) {
  return text
    .split(' ')
    .map((word) => {
      const core = word.replace(/[()]/g, '')
      if (KEEP_UPPER.has(core) || /\d/.test(core)) return word
      return word.toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase())
    })
    .join(' ')
}

const known = (value) => (value && value !== 'NIL' ? value : null)

// One OneMap row -> { label, detail, lat, lon }, or null if it isn't a usable point.
function toPlace(row) {
  const point = { lat: Number(row.LATITUDE), lon: Number(row.LONGITUDE) }
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || !inSingapore(point)) return null
  const street = [known(row.BLK_NO), known(row.ROAD_NAME)].filter(Boolean).join(' ')
  const postal = known(row.POSTAL)
  return {
    label: titleCase(row.SEARCHVAL),
    detail: [street && titleCase(street), postal && `S${postal}`].filter(Boolean).join(' · ') || null,
    ...point,
  }
}

export function createOneMapClient({ fetchImpl = fetch, timeoutMs = 4000, now = Date.now } = {}) {
  const cache = new Map() // normalized query -> { places, until }

  return {
    // Up to 6 places for `query`, or null when OneMap couldn't answer.
    async search(query) {
      const key = query.trim().toLowerCase().replace(/\s+/g, ' ')
      const hit = cache.get(key)
      if (hit && hit.until > now()) return hit.places

      let rows
      try {
        const params = new URLSearchParams({ searchVal: key, returnGeom: 'Y', getAddrDetails: 'Y', pageNum: '1' })
        const res = await fetchImpl(`${SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(timeoutMs) })
        if (!res.ok) return null
        rows = (await res.json())?.results
      } catch {
        return null // unreachable, timed out, or not JSON (OneMap sometimes answers with an HTML page)
      }
      if (!Array.isArray(rows)) return null

      const places = []
      for (const row of rows) {
        const place = toPlace(row)
        if (place && !places.some((p) => p.label === place.label)) places.push(place)
        if (places.length === MAX_RESULTS) break
      }
      cache.delete(key)
      cache.set(key, { places, until: now() + CACHE_MS })
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value)
      return places
    },
  }
}

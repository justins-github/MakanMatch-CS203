// Reads from catalog-service: menus, dishes, owner-reported venue status and
// opening hours. All public endpoints, so no token is forwarded. Statuses and
// hours are cached for a minute and the last good copy is served if the catalog
// goes down.
import { unavailable } from '../errors.js'

const BATCH = 100

export function createCatalogClient({ baseUrl, fetchImpl = fetch, statusTtlMs = 60_000, now = Date.now }) {
  async function get(path) {
    let res
    try {
      res = await fetchImpl(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5000) })
    } catch {
      throw unavailable('The catalog service is unreachable - is it running?')
    }
    if (res.status === 404) return null
    if (!res.ok) throw unavailable(`The catalog service answered ${res.status}`)
    return res.json()
  }

  // One every-venue list, as a Map by venueId, refreshed at most once per TTL.
  function cachedByVenue(path, valueOf) {
    let cache = null // { byVenue: Map, until }
    return async () => {
      if (cache && cache.until > now()) return cache.byVenue
      try {
        const rows = (await get(path)) ?? []
        cache = { byVenue: new Map(rows.map((r) => [r.venueId, valueOf(r)])), until: now() + statusTtlMs }
      } catch (err) {
        if (!cache) throw err
        cache.until = now() + 10_000 // keep serving the stale copy, retry soon
      }
      return cache.byVenue
    }
  }

  return {
    // A venue's live menu, or null for an unknown venue.
    menu: (venueId) => get(`/api/catalog/venues/${encodeURIComponent(venueId)}/dishes`),

    dish: (dishId) => get(`/api/catalog/dishes/${encodeURIComponent(dishId)}`),

    async dishes(dishIds) {
      const found = []
      for (let i = 0; i < dishIds.length; i += BATCH) {
        const ids = dishIds.slice(i, i + BATCH).map(encodeURIComponent).join(',')
        found.push(...((await get(`/api/catalog/dishes?ids=${ids}`)) ?? []))
      }
      return found
    },

    // venueId -> the owner's latest report ({ status, currentAddress, note, reportedAt }).
    venueStatuses: cachedByVenue('/api/catalog/venue-status', (r) => r),

    // venueId -> the owner's weekly hours ([{ day, sessions: [{ opens, closes }] }], see hours.js).
    venueHours: cachedByVenue('/api/catalog/venue-hours', (r) => r.week),
  }
}

// Reads from catalog-service: menus, dishes and owner-reported venue status.
// All public endpoints, so no token is forwarded. Owner statuses are cached for
// a minute and the last good copy is served if the catalog goes down.
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

  let statuses = null // { byVenue: Map, until }

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

    // venueId -> the owner's latest report ({ status, newAddress, openingHours, note, reportedAt }).
    async venueStatuses() {
      if (statuses && statuses.until > now()) return statuses.byVenue
      try {
        const rows = (await get('/api/catalog/venue-status')) ?? []
        statuses = { byVenue: new Map(rows.map((r) => [r.venueId, r])), until: now() + statusTtlMs }
      } catch (err) {
        if (!statuses) throw err
        statuses.until = now() + 10_000 // keep serving the stale copy, retry soon
      }
      return statuses.byVenue
    },
  }
}

// Reads from catalog-service: menus, dishes, owner-reported venue status, opening
// hours and what changed at a venue since a visit. All public endpoints, so no
// token is forwarded. Statuses, hours and changes are cached for a minute; for
// statuses and hours the last good copy is served if the catalog goes down.
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
  // `keep` drops rows whose value isn't usable.
  function cachedByVenue(path, valueOf, keep = () => true) {
    let cache = null // { byVenue: Map, until }
    return async () => {
      if (cache && cache.until > now()) return cache.byVenue
      try {
        const rows = (await get(path)) ?? []
        cache = { byVenue: new Map(rows.filter(keep).map((r) => [r.venueId, valueOf(r)])), until: now() + statusTtlMs }
      } catch (err) {
        if (!cache) throw err
        cache.until = now() + 10_000 // keep serving the stale copy, retry soon
      }
      return cache.byVenue
    }
  }

  // What changed at a venue since a visit, kept for the TTL: every Find asks this for
  // each reviewed venue on the list, and the catalog's connection pool is small.
  const changes = new Map() // `${venueId}|${since}` -> { value, until }
  async function venueChanges(venueId, since) {
    const key = `${venueId}|${since}`
    const hit = changes.get(key)
    if (hit && hit.until > now()) return hit.value
    const value = await get(`/api/catalog/venues/${encodeURIComponent(venueId)}/changes?since=${encodeURIComponent(since)}`)
    for (const [k, entry] of changes) if (entry.until <= now()) changes.delete(k)
    changes.set(key, { value, until: now() + statusTtlMs })
    return value
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

    // What changed at a venue since an ISO time (CSD-50/51): { since, prices, added, removed,
    // updates, priceThen, priceNow }, or null for an unknown venue.
    venueChanges,

    // venueId -> the owner's latest report ({ status, currentAddress, note, reportedAt }).
    venueStatuses: cachedByVenue('/api/catalog/venue-status', (r) => r),

    // venueId -> typical price in S$ (median shown price of its live dishes; CSD-51).
    venuePrices: cachedByVenue('/api/catalog/venue-prices', (r) => Number(r.typicalPrice),
      (r) => r.typicalPrice != null && Number.isFinite(Number(r.typicalPrice))),

    // venueId -> the owner's weekly hours ([{ day, sessions: [{ opens, closes }] }], see hours.js).
    venueHours: cachedByVenue('/api/catalog/venue-hours', (r) => r.week),
  }
}

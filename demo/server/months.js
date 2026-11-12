// Months of the venue registry, for the demo's Month switch. August
// (data/sg_food_places.json) is the base; every later month is a small file of
// differences from it (data/months/<YYYY-MM>.json, written by scripts/build-month.mjs):
//   { month, label, release, base, gone: [{ gersId, reason }], added: [row] }
// A place leaves for one of three reasons. 'closed': the source says so. 'unlisted': it
// vanished or we are no longer confident it exists, so it may have closed. 'dropped':
// it stopped being a food place, which is bookkeeping and never shown as a change.
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { DEDUP_METERS, MIN_CONFIDENCE, dedupe, isListed, metersBetween, normName } from './overture.js'
import { buildRegistry } from './registry.js'
import { buildSearchIndex } from './search.js'

export const BASE_MONTH = { month: '2026-08', label: 'August 2026' }

// '2026-10' -> 'October 2026'
export function monthLabel(month) {
  const [year, monthOfYear] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthOfYear - 1, 1))
    .toLocaleString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const byNormName = (rows) => {
  const index = new Map()
  for (const row of rows) {
    const key = normName(row.name)
    if (!key) continue
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(row)
  }
  return index
}

// Is there another row of the same name within a stone's throw? Then it's the same place.
const samePlaceIn = (index, row) =>
  (index.get(normName(row.name)) ?? []).some((o) => o.gersId !== row.gersId && metersBetween(o, row) <= DEDUP_METERS)

// What changed between the base rows (already filtered and de-duplicated) and a full
// release pull (every place, with isFood and status): who left and why, and who is new.
export function diffMonths(baseRows, releaseRows) {
  const releaseById = new Map(releaseRows.map((r) => [r.gersId, r]))
  const listed = releaseRows.filter(isListed)
  const listedByName = byNormName(listed)
  const baseIds = new Set(baseRows.map((r) => r.gersId))
  const baseByName = byNormName(baseRows)

  const gone = []
  for (const was of baseRows) {
    const now = releaseById.get(was.gersId)
    let reason = null
    if (!now) reason = samePlaceIn(listedByName, was) ? null : 'unlisted' // same place, new id: it stays
    else if (now.status != null && now.status !== 'open') reason = 'closed'
    else if (!now.isFood) reason = 'dropped'
    else if (now.confidence < MIN_CONFIDENCE) reason = 'unlisted'
    if (reason) gone.push({ gersId: was.gersId, reason })
  }

  const added = dedupe(listed)
    .filter((row) => !baseIds.has(row.gersId) && !samePlaceIn(baseByName, row))
    .map(({ isFood, status, ...row }) => row)
    .sort((a, b) => a.name.localeCompare(b.name))
  return { gone, added }
}

// The base rows as they stand in a later month: without the gone, plus the added.
export function applyMonth(baseRows, delta) {
  const gone = new Set(delta.gone.map((g) => g.gersId))
  return [...baseRows.filter((row) => !gone.has(row.gersId)), ...delta.added]
}

// Every month file in <dataDir>/months, oldest first; none when the folder isn't there.
export function loadMonthFiles(dataDir) {
  const dir = join(dataDir, 'months')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')))
    .sort((a, b) => a.month.localeCompare(b.month))
}

const SHOWN = new Set(['closed', 'unlisted']) // 'dropped' leaves without a word

// The venue registry for each month. The base is built at once; a later month is built
// the first time it is asked for and kept. The switch is per request, never global.
export function createMonths({ overtureRows, seeds, deltas, now = Date.now() }) {
  const later = deltas.filter((d) => d.month !== BASE_MONTH.month)
  const deltaOf = new Map(later.map((d) => [d.month, d]))
  const base = buildRegistry(overtureRows, seeds, now)
  // A seed merged onto an Overture record keeps its own id, so gone places are found by gersId.
  const baseByGersId = new Map(base.venues.filter((v) => v.gersId).map((v) => [v.gersId, v]))

  // Reviews, profiles and rankings look venues up by id whatever month is showing, so
  // the base answers for places that only exist later too (but never lists them).
  for (const delta of later) {
    for (const venue of buildRegistry(delta.added, [], now).venues) {
      if (!base.venueById.has(venue.id)) base.venueById.set(venue.id, venue)
    }
  }

  const built = new Map()
  function build(delta) {
    const left = delta.gone.map((g) => ({ reason: g.reason, venue: baseByGersId.get(g.gersId) })).filter((g) => g.venue)
    const leftIds = new Set(left.map((g) => g.venue.id))
    // A seed whose Overture record left goes with it; otherwise it would come back as community-only.
    const registry = buildRegistry(applyMonth(overtureRows, delta), seeds.filter((s) => !leftIds.has(s.id)), now)
    const addedIds = new Set(delta.added.map((row) => row.gersId))
    const venues = registry.venues.map((v) => (v.gersId && addedIds.has(v.gersId) ? { ...v, monthChange: 'new' } : v))
    const gone = new Map(left.filter((g) => SHOWN.has(g.reason)).map((g) => [g.venue.id, g]))
    const ghosts = new Map([...gone].map(([id, g]) => [id, { ...g.venue, monthChange: g.reason }]))
    // Everything that left, 'dropped' included: Find needs it to say whether your picks changed.
    const departed = new Map(left.map((g) => [g.venue.id, { ...g.venue, monthChange: g.reason }]))
    const added = venues.filter((v) => v.monthChange === 'new')
    return {
      registry: {
        venues,
        venueById: new Map(venues.map((v) => [v.id, v])),
        searchIndex: buildSearchIndex([...venues, ...ghosts.values()]), // gone places stay findable, tagged
        ghosts,
        departed,
        stats: registry.stats,
      },
      changes: { month: delta.month, label: delta.label, gone, added, totals: { gone: gone.size, added: added.length } },
    }
  }
  const monthOf = (month) => {
    if (!deltaOf.has(month)) throw new RangeError(`unknown month: ${month}`)
    if (!built.has(month)) built.set(month, build(deltaOf.get(month)))
    return built.get(month)
  }
  const isBase = (month) => month === undefined || month === BASE_MONTH.month

  return {
    list: [{ ...BASE_MONTH, base: true }, ...later.map((d) => ({ month: d.month, label: d.label, base: false }))],
    has: (month) => month === BASE_MONTH.month || deltaOf.has(month),
    base,
    // The registry to rank and search for a month; the base when none is named.
    registryFor: (month) => (isBase(month) ? base : monthOf(month).registry),
    // What left and what arrived in a month, by venue id; null for the base.
    changesFor: (month) => (isBase(month) ? null : monthOf(month).changes),
  }
}

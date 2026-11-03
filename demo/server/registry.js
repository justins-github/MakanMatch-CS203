// Venue registry: Overture rows merged with the curated seeds, built once at startup.

import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { cuisineForCategories } from './cuisines.js'
import { buildSearchIndex, normalizeName } from './search.js'

const DAY_MS = 86_400_000

// Maps an Overture row to a venue record.
function fromOverture(row, now) {
  return {
    id: 'ov-' + row.gersId,
    gersId: row.gersId,
    name: row.name,
    lat: row.lat,
    lon: row.lon,
    cuisine: cuisineForCategories(row.categoryPrimary, row.categoryPath),
    category: row.categoryPrimary,
    address: row.address ?? null,
    postcode: row.postcode ?? null,
    phone: row.phone ?? null,
    website: row.website ?? null,
    social: row.social ?? null,
    brand: row.brand ?? null,
    overtureConfidence: row.confidence,
    dataAgeDays: row.updatedAt
      ? Math.max(0, Math.floor((now - Date.parse(row.updatedAt)) / DAY_MS))
      : undefined,
    reviewCount: 0,
    source: 'overture',
  }
}

// Merges seeds onto Overture records by normalized name; unmatched seeds stay community-only.
export function buildRegistry(overtureRows, seeds, now = Date.now()) {
  const pool = overtureRows.map((row) => fromOverture(row, now))
  const byName = new Map()
  pool.forEach((v, i) => {
    const key = normalizeName(v.name)
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key).push(i)
  })

  const consumed = new Set()
  const unmatched = []
  const mergedSeeds = seeds.map((seed) => {
    const indices = byName.get(normalizeName(seed.name)) ?? []
    const matchIdx = indices.find((i) => !consumed.has(i))
    if (matchIdx === undefined) {
      unmatched.push(seed.name)
      return { ...seed, lat: seed.latitude ?? null, lon: seed.longitude ?? null, source: 'community' }
    }
    consumed.add(matchIdx)
    const ov = pool[matchIdx]
    return {
      ...ov,
      ...seed, // community data wins
      gersId: ov.gersId,
      lat: ov.lat,
      lon: ov.lon,
      overtureConfidence: ov.overtureConfidence,
      source: 'community+overture',
    }
  })

  const venues = [...mergedSeeds, ...pool.filter((_, i) => !consumed.has(i))]
  return {
    venues,
    venueById: new Map(venues.map((v) => [v.id, v])),
    searchIndex: buildSearchIndex(venues),
    stats: { total: venues.length, overture: pool.length, seeds: seeds.length, unmatched },
  }
}

// Loads the seeds and the Overture snapshot from disk.
export function loadRegistry() {
  const here = dirname(fileURLToPath(import.meta.url))
  const seeds = JSON.parse(readFileSync(join(here, 'data', 'venues.json'), 'utf8'))
  const overturePath = join(here, 'data', 'sg_food_places.json')
  let overtureRows = []
  if (existsSync(overturePath)) {
    overtureRows = JSON.parse(readFileSync(overturePath, 'utf8'))
  } else {
    console.warn('sg_food_places.json missing - run `node scripts/extract-overture.mjs`; serving seeds only')
  }
  const registry = buildRegistry(overtureRows, seeds)
  const { total, overture, unmatched } = registry.stats
  console.log(`venue registry: ${total} venues (${overture} from Overture)`)
  if (unmatched.length) console.log(`community-only seeds (no Overture match): ${unmatched.join(', ')}`)
  return registry
}

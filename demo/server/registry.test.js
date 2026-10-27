import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRegistry } from './registry.js'

const NOW = Date.parse('2026-08-31T12:00:00Z')

// ~600 m from SMU (walkable); category resolves to thai via the leaf.
function ovRow(overrides = {}) {
  return {
    gersId: 'g-' + Math.random().toString(36).slice(2, 8),
    name: 'Some Thai Place',
    lat: 1.3,
    lon: 103.8515,
    categoryPrimary: 'thai_restaurant',
    categoryPath: ['food_and_drink', 'restaurant', 'asian_restaurant', 'thai_restaurant'],
    address: '1 Test Rd',
    postcode: '188888',
    confidence: 0.91,
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  }
}

function seed(overrides = {}) {
  return {
    id: 'seed-1',
    name: "Turk's Kebab",
    cuisine: 'turkish',
    tags: ['grilled'],
    area: 'Selegie',
    address: '35 Selegie Rd',
    priceTier: 1,
    spice: 0.3,
    richness: 0.7,
    sheltered: true,
    distanceMin: 5,
    reviewCount: 23,
    dataAgeDays: 20,
    signature: 'Chicken doner wrap',
    ...overrides,
  }
}

test('overture rows get cuisine from taxonomy, computed distance, and data age', () => {
  const { venues } = buildRegistry([ovRow()], [], NOW)
  const [v] = venues
  assert.equal(v.cuisine, 'thai')
  assert.equal(v.reviewCount, 0)
  assert.equal(v.dataAgeDays, 21)
  assert.ok(v.distanceMin >= 1 && v.distanceMin <= 15, `distance ${v.distanceMin} should be walkable`)
  assert.equal(v.source, 'overture')
})

test('unmappable categories degrade to null cuisine', () => {
  const { venues } = buildRegistry(
    [ovRow({ categoryPrimary: 'singaporean_restaurant', categoryPath: ['food_and_drink', 'restaurant'] })],
    [],
    NOW,
  )
  assert.equal(venues[0].cuisine, null)
})

test('a seed matching an Overture record by name merges onto it, keeping its id and data', () => {
  // Coordinates ~1.5 km out so the computed walk time cannot collide with the authored 5.
  const ov = ovRow({ name: "Turk's Kebab", categoryPrimary: 'doner_kebab_restaurant', lat: 1.31 })
  const { venues, venueById } = buildRegistry([ov, ovRow({ name: 'Other Place' })], [seed()], NOW)
  assert.equal(venues.length, 2, 'merged record must not appear twice')
  const merged = venueById.get('seed-1')
  assert.ok(merged, 'seed keeps its id')
  assert.equal(merged.gersId, ov.gersId)
  assert.equal(merged.cuisine, 'turkish')
  assert.equal(merged.spice, 0.3)
  assert.equal(merged.reviewCount, 23)
  assert.equal(merged.source, 'community+overture')
  assert.ok(merged.distanceMin !== 5, 'authored distance replaced by computed geometry')
})

test('an unmatched seed survives as a community-only venue with its authored distance', () => {
  const { venueById, stats } = buildRegistry([ovRow()], [seed({ id: 'seed-x', name: 'Fictional Soto Corner' })], NOW)
  const kept = venueById.get('seed-x')
  assert.equal(kept.source, 'community')
  assert.equal(kept.distanceMin, 5)
  assert.deepEqual(stats.unmatched, ['Fictional Soto Corner'])
})

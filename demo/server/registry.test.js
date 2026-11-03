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
    reviewCount: 23,
    dataAgeDays: 20,
    signature: 'Chicken doner wrap',
    ...overrides,
  }
}

test('overture rows get cuisine from taxonomy, coordinates, and data age', () => {
  const { venues } = buildRegistry([ovRow()], [], NOW)
  const [v] = venues
  assert.equal(v.cuisine, 'thai')
  assert.equal(v.reviewCount, 0)
  assert.equal(v.dataAgeDays, 21)
  assert.deepEqual([v.lat, v.lon], [1.3, 103.8515])
  assert.equal(v.distanceMin, undefined, 'walk time depends on where the user is, so it is worked out per request')
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
  const ov = ovRow({ name: "Turk's Kebab", categoryPrimary: 'doner_kebab_restaurant', lat: 1.31 })
  const { venues, venueById } = buildRegistry([ov, ovRow({ name: 'Other Place' })], [seed({ latitude: 1.2, longitude: 103.7 })], NOW)
  assert.equal(venues.length, 2, 'merged record must not appear twice')
  const merged = venueById.get('seed-1')
  assert.ok(merged, 'seed keeps its id')
  assert.equal(merged.gersId, ov.gersId)
  assert.equal(merged.cuisine, 'turkish')
  assert.equal(merged.spice, 0.3)
  assert.equal(merged.reviewCount, 23)
  assert.equal(merged.source, 'community+overture')
  assert.deepEqual([merged.lat, merged.lon], [1.31, 103.8515], "Overture's geometry beats the authored point")
})

test('an unmatched seed survives as a community-only venue at its authored point', () => {
  const fictional = seed({ id: 'seed-x', name: 'Fictional Soto Corner', latitude: 1.3015, longitude: 103.8505 })
  const { venueById, stats } = buildRegistry([ovRow()], [fictional], NOW)
  const kept = venueById.get('seed-x')
  assert.equal(kept.source, 'community')
  assert.deepEqual([kept.lat, kept.lon], [1.3015, 103.8505])
  assert.deepEqual(stats.unmatched, ['Fictional Soto Corner'])
})

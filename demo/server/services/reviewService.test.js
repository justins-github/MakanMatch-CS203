import test from 'node:test'
import assert from 'node:assert/strict'
import { starterProfile } from '../learn.js'
import { memoryLearnerStore } from './learnerStore.js'
import { createReviewService } from './reviewService.js'
import { applyOwnerReports } from './recommendationService.js'

const TURKS = { id: 'turks-kebab', name: "Turk's Kebab", cuisine: 'turkish', distanceMin: 5 }
const YANGON = { id: 'yangon-flavours', name: 'Yangon Flavours', cuisine: 'burmese', distanceMin: 9 }
const registry = { venueById: new Map([[TURKS.id, TURKS], [YANGON.id, YANGON]]) }

const seedDishes = [
  { id: 'chicken-doner-wrap', venueId: 'turks-kebab', name: 'Chicken doner wrap', price: 8.5, priceTier: 1, spice: 0.3, richness: 0.7, novelty: 0.5, tags: ['grilled'] },
  { id: 'shan-noodles', venueId: 'yangon-flavours', name: 'Shan noodles', price: 5.5, priceTier: 0, spice: 0.4, richness: 0.5, novelty: 0.8, tags: [] },
]

// Catalog as the service sees it; `down` simulates catalog-service being unreachable.
function fakeCatalog({ down = false } = {}) {
  const dishes = new Map([
    ['chicken-doner-wrap', { id: 'chicken-doner-wrap', venueId: 'turks-kebab', name: 'Chicken doner wrap', source: 'SEED', price: '9.00', officialPrice: '9.00', communityPrice: '8.50', priceConflict: false }],
    ['secret-laksa', { id: 'secret-laksa', venueId: 'turks-kebab', name: 'Secret laksa', source: 'DINER', price: '13.00', officialPrice: null, communityPrice: '13.00', priceConflict: false }],
    ['shan-noodles', { id: 'shan-noodles', venueId: 'yangon-flavours', name: 'Shan noodles', source: 'SEED', price: '5.50' }],
  ])
  const unreachable = () => { throw Object.assign(new Error('catalog down'), { status: 503 }) }
  return {
    menu: async (venueId) => (down ? unreachable() : [...dishes.values()].filter((d) => d.venueId === venueId)),
    dish: async (id) => (down ? unreachable() : dishes.get(id) ?? null),
    dishes: async (ids) => (down ? unreachable() : ids.map((id) => dishes.get(id)).filter(Boolean)),
  }
}

const diner = { id: '88888888-8888-8888-8888-888888888888', me: { displayName: 'Mei', ownedVenues: [] } }
const turksOwner = { id: '99999999-9999-9999-9999-999999999999', me: { displayName: 'Ahmet', ownedVenues: [{ venueId: 'turks-kebab' }] } }

function service(catalog = fakeCatalog()) {
  const learners = memoryLearnerStore({ starter: starterProfile })
  const vectors = { size: 0 }
  return createReviewService({ registry, learners, catalog, seedDishes, vectors })
}

const beli = (dishId, extra = {}) => ({ dishId, sentiment: 'loved', insertIndex: 0, duels: [], text: '', ...extra })

test('a venue\'s dishes come with predictions and the catalog\'s price facts', async () => {
  const { dishes, degraded } = await service().venueDishes(diner, 'turks-kebab')
  assert.equal(degraded, false)
  const wrap = dishes.find((d) => d.id === 'chicken-doner-wrap')
  assert.equal(wrap.spice, 0.3, 'seed dishes keep their curated taste features')
  assert.equal(wrap.officialPrice, 9)
  assert.ok(wrap.predictedScore10 >= 0.5 && wrap.predictedScore10 <= 9.9)
  const laksa = dishes.find((d) => d.id === 'secret-laksa')
  assert.equal(laksa.spice, 0.5, 'community dishes start with neutral features')
  assert.equal(laksa.priceTier, 2)
})

test('when the catalog is down, seed dishes still show and the response says so', async () => {
  const { dishes, degraded } = await service(fakeCatalog({ down: true })).venueDishes(diner, 'turks-kebab')
  assert.equal(degraded, true)
  assert.deepEqual(dishes.map((d) => d.id), ['chicken-doner-wrap'])
})

test('owners cannot review their own venue', async () => {
  await assert.rejects(service().submitBeli(turksOwner, beli('chicken-doner-wrap')), { status: 403 })
})

test('owners can still review somewhere else', async () => {
  const result = await service().submitBeli(turksOwner, beli('shan-noodles'))
  assert.ok(result.score10 > 0)
})

test('reviews retrain only the reviewer and show up in their rankings by name', async () => {
  const reviews = service()
  await reviews.submitBeli(diner, beli('secret-laksa', { text: 'love the spice' }))
  await reviews.submitBeli(diner, beli('chicken-doner-wrap', {
    insertIndex: 1, sentiment: 'fine', duels: [{ winnerId: 'secret-laksa', loserId: 'chicken-doner-wrap' }],
  }))
  const rankings = await reviews.rankings(diner)
  assert.deepEqual(rankings.map((r) => r.name), ['Secret laksa', 'Chicken doner wrap'])
  assert.equal(rankings[0].venueName, "Turk's Kebab")
  assert.deepEqual(await reviews.rankings(turksOwner), [])
})

test('bad input is rejected before anything is learned', async () => {
  const reviews = service()
  await assert.rejects(reviews.submitBeli(diner, beli('no-such-dish')), { status: 400 })
  await assert.rejects(reviews.submitBeli(diner, beli('shan-noodles', { sentiment: 'meh' })), { status: 400 })
  await assert.rejects(reviews.submitBeli(diner, beli('shan-noodles', { duels: [{ winnerId: 'ghost', loserId: 'shan-noodles' }] })), { status: 400 })
  assert.deepEqual(await reviews.rankings(diner), [])
})

test('reset clears only the caller', async () => {
  const reviews = service()
  await reviews.submitBeli(diner, beli('shan-noodles'))
  await reviews.submitBeli(turksOwner, beli('shan-noodles'))
  await reviews.reset(diner)
  assert.deepEqual(await reviews.rankings(diner), [])
  assert.equal((await reviews.rankings(turksOwner)).length, 1)
})

test('owner reports: closed venues drop out, and a move keeps showing after later reports', () => {
  const byVenue = new Map([
    ['turks-kebab', { venueId: 'turks-kebab', status: 'OPEN', currentAddress: '35 Selegie Rd #01-C2', note: 'New menu!', reportedAt: '2026-09-20T00:00:00Z' }],
    ['yangon-flavours', { venueId: 'yangon-flavours', status: 'TEMPORARILY_CLOSED', note: 'Renovating', reportedAt: '2026-09-21T00:00:00Z' }],
  ])
  const { open, closed } = applyOwnerReports([{ ...TURKS, address: 'Peace Centre' }, YANGON], byVenue)
  assert.deepEqual(open.map((v) => v.id), ['turks-kebab'])
  assert.equal(open[0].address, '35 Selegie Rd #01-C2')
  assert.equal(open[0].ownerUpdate.status, 'OPEN')
  assert.equal(open[0].ownerUpdate.note, 'New menu!')
  // Hours now come from the owner's weekly hours (hours.js), not from status posts.
  assert.equal('openingHours' in open[0].ownerUpdate, false)
  assert.deepEqual(closed.map((v) => [v.id, v.status]), [['yangon-flavours', 'TEMPORARILY_CLOSED']])
})

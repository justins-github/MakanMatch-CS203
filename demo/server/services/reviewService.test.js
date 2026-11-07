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
  assert.equal(laksa.spice, null, 'community dishes have no taste features until someone curates them')
  assert.equal(laksa.richness, null)
  assert.equal(laksa.novelty, null)
  assert.ok(laksa.predictedScore10 >= 0.5 && laksa.predictedScore10 <= 9.9, 'and still get a prediction')
  assert.equal(laksa.priceTier, 2)
})

test('loving a community dish, even over a spicy seed dish, leaves spice and richness alone', async () => {
  const reviews = service()
  const first = await reviews.submitBeli(diner, beli('chicken-doner-wrap'))
  const second = await reviews.submitBeli(diner, beli('secret-laksa', {
    duels: [{ winnerId: 'secret-laksa', loserId: 'chicken-doner-wrap' }],
  }))
  assert.equal(second.profile.spicePref, first.profile.spicePref)
  assert.equal(second.profile.richnessPref, first.profile.richnessPref)
  assert.equal(second.profile.adventurousness, first.profile.adventurousness)
})

// A review service whose estimator answers from `byDish`, recording what it was asked about.
function withEstimates(byDish) {
  const asked = []
  const estimator = { estimate: async (dish) => { asked.push(dish.id); return byDish[dish.id] ?? null } }
  const learners = memoryLearnerStore({ starter: starterProfile })
  return { asked, reviews: createReviewService({ registry, learners, catalog: fakeCatalog(), seedDishes, vectors: { size: 0 }, estimator }) }
}

test('a duel credits the cuisine the dish is estimated to be, not the venue\'s', async () => {
  const { reviews } = withEstimates({ 'secret-laksa': { spice: null, richness: null, cuisine: 'indian' } })
  await reviews.submitBeli(diner, beli('shan-noodles', { sentiment: 'fine' }))
  const { profile } = await reviews.submitBeli(diner, beli('secret-laksa', {
    sentiment: 'fine', duels: [{ winnerId: 'secret-laksa', loserId: 'shan-noodles' }],
  }))
  assert.equal(profile.cuisineAffinity.indian, 0.53)
  assert.equal(profile.cuisineAffinity.turkish, 0.5, 'the venue is Turkish, the dish is not')
})

test('a rating with no text still learns from the estimate', async () => {
  const { reviews } = withEstimates({ 'secret-laksa': { spice: 0.9, richness: 0.5, cuisine: 'indian' } })
  const { profile, deltas } = await reviews.submitBeli(diner, beli('secret-laksa'))
  assert.equal(Math.round(profile.spicePref * 1000) / 1000, 0.6)
  assert.equal(Math.round(profile.cuisineAffinity.indian * 1000) / 1000, 0.625)
  assert.equal(profile.cuisineAffinity.turkish, 0.5)
  assert.ok(deltas.find((d) => d.dimension === 'Spice').reason.includes('estimated from the dish name'))
})

test('a duel never compares spice or richness by estimate: the gap would be mostly the estimate\'s error', async () => {
  const { reviews } = withEstimates({ 'secret-laksa': { spice: 0.9, richness: 0.1, cuisine: null } })
  const first = await reviews.submitBeli(diner, beli('chicken-doner-wrap', { sentiment: 'fine' }))
  const { profile } = await reviews.submitBeli(diner, beli('secret-laksa', {
    sentiment: 'fine', duels: [{ winnerId: 'secret-laksa', loserId: 'chicken-doner-wrap' }],
  }))
  assert.equal(profile.spicePref, first.profile.spicePref)
  assert.equal(profile.richnessPref, first.profile.richnessPref)
})

test('the same review with and without a duel moves spice the same when the dish is estimated', async () => {
  const estimate = { 'secret-laksa': { spice: 0.9, richness: 0.1, cuisine: null } }
  const alone = await withEstimates(estimate).reviews.submitBeli(diner, beli('secret-laksa'))
  const { reviews } = withEstimates(estimate)
  const first = await reviews.submitBeli(diner, beli('chicken-doner-wrap', { sentiment: 'fine' }))
  const duelled = await reviews.submitBeli(diner, beli('secret-laksa', { duels: [{ winnerId: 'secret-laksa', loserId: 'chicken-doner-wrap' }] }))
  const moved = (r, from) => Math.round((r.profile.spicePref - from) * 1e6) / 1e6
  assert.equal(moved(duelled, first.profile.spicePref), Math.round((0.25 * (0.9 - first.profile.spicePref)) * 1e6) / 1e6)
  assert.ok(moved(alone, 0.5) > 0)
})

test('duels between two curated dishes still compare their features', async () => {
  const { reviews } = withEstimates({})
  const first = await reviews.submitBeli(diner, beli('chicken-doner-wrap', { sentiment: 'fine' }))
  const { profile } = await reviews.submitBeli(diner, beli('shan-noodles', {
    sentiment: 'fine', duels: [{ winnerId: 'shan-noodles', loserId: 'chicken-doner-wrap' }],
  }))
  assert.equal(Math.round((profile.spicePref - first.profile.spicePref) * 1000) / 1000, 0.012, '0.12 x (0.4 - 0.3)')
})

test('a past dish in a duel is estimated too', async () => {
  const { reviews, asked } = withEstimates({})
  await reviews.submitBeli(diner, beli('secret-laksa'))
  asked.length = 0
  await reviews.submitBeli(diner, beli('shan-noodles', { duels: [{ winnerId: 'shan-noodles', loserId: 'secret-laksa' }] }))
  assert.deepEqual(asked.sort(), ['secret-laksa', 'shan-noodles'])
})

test('a bad duel is rejected before Claude is asked anything', async () => {
  const asks = []
  const reader = { read: async () => { asks.push('read'); return { readBy: 'ai', blame: 'overall', signals: [] } } }
  const estimator = { estimate: async () => { asks.push('estimate'); return null } }
  const learners = memoryLearnerStore({ starter: starterProfile })
  const reviews = createReviewService({ registry, learners, catalog: fakeCatalog(), seedDishes, vectors: { size: 0 }, reader, estimator })
  await assert.rejects(reviews.submitBeli(diner, beli('shan-noodles', { text: 'nice', duels: [{ winnerId: 'ghost', loserId: 'shan-noodles' }] })), { status: 400 })
  assert.deepEqual(asks, [])
})

test('an estimate that fails to arrive leaves the review working as before', async () => {
  const { reviews } = withEstimates({})
  const { profile, score10 } = await reviews.submitBeli(diner, beli('secret-laksa'))
  assert.ok(score10 > 0)
  assert.equal(profile.spicePref, 0.5)
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

const DOC_READING = {
  readBy: 'ai',
  blame: 'specific',
  signals: [{ dimension: 'spice', direction: 'down', strength: 3, quote: 'I hate the spice', why: 'dislikes heat' }],
}

test('the reader sees the review and the user\'s profile, and its reading is applied', async () => {
  const asked = []
  const reader = { read: async (input) => { asked.push(input); return DOC_READING } }
  const learners = memoryLearnerStore({ starter: starterProfile })
  const reviews = createReviewService({ registry, learners, catalog: fakeCatalog(), seedDishes, vectors: { size: 0 }, reader })
  const text = 'Price was alright but I hate the spice'
  const result = await reviews.submitBeli(diner, beli('secret-laksa', { sentiment: 'disliked', text }))
  const [input] = asked
  assert.equal(input.text, text)
  assert.equal(input.sentiment, 'disliked')
  assert.equal(input.dish.id, 'secret-laksa')
  assert.equal(input.venue.id, 'turks-kebab')
  assert.equal(input.profile.spicePref, 0.5)
  assert.equal(result.readBy, 'ai')
  assert.equal((await learners.read(diner.id, 'Mei')).reviews.at(-1).readBy, 'ai')
})

test('without a reader, text is read by keywords', async () => {
  const result = await service().submitBeli(diner, beli('secret-laksa', { text: 'way too oily' }))
  assert.equal(result.readBy, 'keywords')
})

test('undo restores the Taste DNA and keeps the score and ranking', async () => {
  const learners = memoryLearnerStore({ starter: starterProfile })
  const reviews = createReviewService({ registry, learners, catalog: fakeCatalog(), seedDishes, vectors: { size: 0 } })
  const before = (await learners.read(diner.id, 'Mei')).profile
  const posted = await reviews.submitBeli(diner, beli('secret-laksa', { sentiment: 'disliked', text: 'way too oily' }))
  const undone = await reviews.undoLatest(diner, { dishId: posted.review.dishId, at: posted.review.at })
  assert.equal(undone.undone, true)
  assert.deepEqual(undone.profile, before)
  assert.deepEqual((await learners.read(diner.id, 'Mei')).profile, before)
  assert.deepEqual((await reviews.rankings(diner)).map((r) => r.dishId), ['secret-laksa'])
})

test('undo is refused for a review that is no longer your latest, or with nothing named', async () => {
  const reviews = service()
  const first = await reviews.submitBeli(diner, beli('secret-laksa'))
  await reviews.submitBeli(diner, beli('chicken-doner-wrap', { insertIndex: 1, sentiment: 'fine' }))
  await assert.rejects(reviews.undoLatest(diner, { dishId: first.review.dishId, at: first.review.at }), { status: 409 })
  await assert.rejects(reviews.undoLatest(diner, {}), { status: 400 })
})

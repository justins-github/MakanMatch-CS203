import test from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_USER } from './match.js'
import { createState, starterProfile, priceTierFor, getAccuracy, predictDishScore, applyReview } from './learn.js'

function makeDish(overrides = {}) {
  return {
    id: 'd-' + Math.random().toString(36).slice(2, 8),
    venueId: 'v-test',
    name: 'Test dish',
    price: 5,
    priceTier: 0,
    spice: 0.5,
    richness: 0.5,
    novelty: 0.5,
    tags: [],
    ...overrides,
  }
}

const VENUE = { id: 'v-test', name: 'Test Venue', cuisine: 'thai' }

test('5-star on a spicy dish raises spicePref', () => {
  const state = createState()
  const before = state.profile.spicePref
  applyReview(state, makeDish({ spice: 0.95 }), VENUE, 5, [])
  assert.ok(state.profile.spicePref > before)
})

test('1-star lowers the cuisine affinity', () => {
  const state = createState()
  const before = state.profile.cuisineAffinity.thai
  applyReview(state, makeDish(), VENUE, 1, [])
  assert.ok(state.profile.cuisineAffinity.thai < before)
})

test('too-heavy tag lowers richnessPref even on a 4-star review', () => {
  const state = createState()
  // dish richness == pref so the star signal alone would not move richness down
  const before = state.profile.richnessPref
  applyReview(state, makeDish({ richness: before }), VENUE, 4, ['too-heavy'])
  assert.ok(state.profile.richnessPref < before)
})

test('repeated 5-star on the same dish shrinks the prediction error', () => {
  const state = createState()
  const dish = makeDish({ spice: 0.9, richness: 0.8, novelty: 0.8 })
  const first = applyReview(state, dish, VENUE, 5, [])
  const second = applyReview(state, dish, VENUE, 5, [])
  assert.ok(second.prediction.predicted > first.prediction.predicted, 'model should move toward the user')
  const err1 = Math.abs(first.prediction.predicted - first.prediction.actual)
  const err2 = Math.abs(second.prediction.predicted - second.prediction.actual)
  assert.ok(err2 < err1, 'prediction error should shrink')
  assert.equal(second.accuracy.count, 2)
})

test('deltas report from/to with reasons and are real changes', () => {
  const state = createState()
  const result = applyReview(state, makeDish({ spice: 0.95, novelty: 0.9, priceTier: 2 }), VENUE, 5, ['worth-it'])
  assert.ok(result.deltas.length > 0)
  for (const d of result.deltas) {
    assert.ok(typeof d.dimension === 'string' && d.dimension.length > 0)
    assert.ok(typeof d.reason === 'string' && d.reason.length > 0)
    assert.ok(Math.abs(d.to - d.from) >= 0.005)
  }
})

test('profile stays clamped under extreme rating sequences', () => {
  const state = createState()
  const fiery = makeDish({ spice: 1, richness: 1, novelty: 1, priceTier: 2 })
  for (let i = 0; i < 30; i++) applyReview(state, fiery, VENUE, 5, ['worth-it'])
  const bland = makeDish({ spice: 0, richness: 0, novelty: 0, priceTier: 0 })
  for (let i = 0; i < 30; i++) applyReview(state, bland, VENUE, 1, ['too-spicy', 'too-heavy', 'too-pricey'])
  const p = state.profile
  for (const v of [p.spicePref, p.richnessPref, p.adventurousness, ...Object.values(p.cuisineAffinity)]) {
    assert.ok(v >= 0 && v <= 1, `value ${v} out of 0..1`)
  }
  assert.ok(p.priceComfort >= 0 && p.priceComfort <= 2)
})

test('a fresh state is the baseline profile with no accuracy history', () => {
  const used = createState()
  applyReview(used, makeDish({ spice: 1 }), VENUE, 5, ['worth-it'])
  assert.notDeepEqual(used.profile, DEMO_USER)
  const fresh = createState()
  assert.deepEqual(fresh.profile, DEMO_USER)
  assert.equal(getAccuracy(fresh).count, 0)
})

test('learners are independent: one user\'s review never moves another\'s profile', () => {
  const alice = createState()
  const bob = createState()
  applyReview(alice, makeDish({ spice: 0.95 }), VENUE, 5, [])
  assert.deepEqual(bob.profile, DEMO_USER)
  assert.equal(getAccuracy(bob).count, 0)
})

test('reviews record what persistence needs', () => {
  const state = createState()
  const { review } = applyReview(state, makeDish({ id: 'dish-x', name: 'Laksa' }), VENUE, 4, [])
  assert.equal(review.dishId, 'dish-x')
  assert.equal(review.dishName, 'Laksa')
  assert.equal(review.venueId, 'v-test')
  assert.equal(state.reviews.at(-1), review)
})

test('new accounts start neutral on every cuisine the demo knows', () => {
  const p = starterProfile('Mei')
  assert.equal(p.name, 'Mei')
  assert.deepEqual(Object.keys(p.cuisineAffinity), Object.keys(DEMO_USER.cuisineAffinity))
  assert.ok(Object.values(p.cuisineAffinity).every((v) => v === 0.5))
  assert.deepEqual(p.recentlyEaten, [])
})

test('price tiers: up to $6 cheap, up to $12 mid, then pricey', () => {
  assert.equal(priceTierFor(4.5), 0)
  assert.equal(priceTierFor(6), 0)
  assert.equal(priceTierFor(8.5), 1)
  assert.equal(priceTierFor(12), 2)
  assert.equal(priceTierFor(null), 0)
})

test('prediction is bounded and deterministic for a given profile', () => {
  const state = createState()
  const dish = makeDish()
  const a = predictDishScore(dish, 'thai', state.profile)
  const b = predictDishScore(dish, 'thai', state.profile)
  assert.equal(a, b)
  assert.ok(a >= 5 && a <= 99)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_USER } from './match.js'
import { resetState, getProfile, getAccuracy, predictDishScore, applyReview } from './learn.js'

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
  resetState()
  const before = getProfile().spicePref
  applyReview(makeDish({ spice: 0.95 }), VENUE, 5, [])
  assert.ok(getProfile().spicePref > before)
})

test('1-star lowers the cuisine affinity', () => {
  resetState()
  const before = getProfile().cuisineAffinity.thai
  applyReview(makeDish(), VENUE, 1, [])
  assert.ok(getProfile().cuisineAffinity.thai < before)
})

test('too-heavy tag lowers richnessPref even on a 4-star review', () => {
  resetState()
  // dish richness == pref so the star signal alone would not move richness down
  const before = getProfile().richnessPref
  applyReview(makeDish({ richness: before }), VENUE, 4, ['too-heavy'])
  assert.ok(getProfile().richnessPref < before)
})

test('repeated 5-star on the same dish shrinks the prediction error', () => {
  resetState()
  const dish = makeDish({ spice: 0.9, richness: 0.8, novelty: 0.8 })
  const first = applyReview(dish, VENUE, 5, [])
  const second = applyReview(dish, VENUE, 5, [])
  assert.ok(second.prediction.predicted > first.prediction.predicted, 'model should move toward the user')
  const err1 = Math.abs(first.prediction.predicted - first.prediction.actual)
  const err2 = Math.abs(second.prediction.predicted - second.prediction.actual)
  assert.ok(err2 < err1, 'prediction error should shrink')
  assert.equal(second.accuracy.count, 2)
})

test('deltas report from/to with reasons and are real changes', () => {
  resetState()
  const result = applyReview(makeDish({ spice: 0.95, novelty: 0.9, priceTier: 2 }), VENUE, 5, ['worth-it'])
  assert.ok(result.deltas.length > 0)
  for (const d of result.deltas) {
    assert.ok(typeof d.dimension === 'string' && d.dimension.length > 0)
    assert.ok(typeof d.reason === 'string' && d.reason.length > 0)
    assert.ok(Math.abs(d.to - d.from) >= 0.005)
  }
})

test('profile stays clamped under extreme rating sequences', () => {
  resetState()
  const fiery = makeDish({ spice: 1, richness: 1, novelty: 1, priceTier: 2 })
  for (let i = 0; i < 30; i++) applyReview(fiery, VENUE, 5, ['worth-it'])
  const bland = makeDish({ spice: 0, richness: 0, novelty: 0, priceTier: 0 })
  for (let i = 0; i < 30; i++) applyReview(bland, VENUE, 1, ['too-spicy', 'too-heavy', 'too-pricey'])
  const p = getProfile()
  for (const v of [p.spicePref, p.richnessPref, p.adventurousness, ...Object.values(p.cuisineAffinity)]) {
    assert.ok(v >= 0 && v <= 1, `value ${v} out of 0..1`)
  }
  assert.ok(p.priceComfort >= 0 && p.priceComfort <= 2)
})

test('reset restores the baseline profile and clears accuracy history', () => {
  resetState()
  applyReview(makeDish({ spice: 1 }), VENUE, 5, ['worth-it'])
  assert.notDeepEqual(getProfile(), DEMO_USER)
  resetState()
  assert.deepEqual(getProfile(), DEMO_USER)
  assert.equal(getAccuracy().count, 0)
})

test('prediction is bounded and deterministic for a given profile', () => {
  resetState()
  const dish = makeDish()
  const a = predictDishScore(dish, 'thai', getProfile())
  const b = predictDishScore(dish, 'thai', getProfile())
  assert.equal(a, b)
  assert.ok(a >= 5 && a <= 99)
})

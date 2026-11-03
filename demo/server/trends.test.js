import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBeliReview, createState, starterProfile } from './learn.js'
import { findTrends, profileSeries, trendsIn } from './trends.js'

// Profiles oldest -> newest, varying only the fields given per step.
const base = () => ({ ...starterProfile(), cuisineAffinity: { ...starterProfile().cuisineAffinity } })
function series(steps) {
  return steps.map((fields) => {
    const p = base()
    for (const [key, value] of Object.entries(fields)) {
      if (key in p.cuisineAffinity || key === 'korean') p.cuisineAffinity[key] = value
      else p[key] = value
    }
    return p
  })
}
const spice = (...values) => series(values.map((spicePref) => ({ spicePref })))

test('a steady climb in spice is a trend', () => {
  const [trend, ...rest] = trendsIn(spice(0.5, 0.54, 0.58, 0.6, 0.63, 0.66, 0.66))
  assert.deepEqual(rest, [])
  assert.equal(trend.key, 'spice')
  assert.equal(trend.direction, 'up')
  assert.equal(trend.from, 0.5)
  assert.equal(trend.to, 0.66)
  assert.equal(trend.reviews, 6)
  assert.equal(trend.headline, "You're eating spicier")
  assert.equal(trend.label, 'Spice')
})

test('fewer than 4 reviews is too early to call', () => {
  assert.deepEqual(trendsIn(spice(0.5, 0.56, 0.62, 0.68)), [])
})

test('a dimension that zigzags is not a trend', () => {
  assert.deepEqual(trendsIn(spice(0.5, 0.58, 0.5, 0.58, 0.5, 0.6)), [])
})

test('a tiny drift is not a trend', () => {
  assert.deepEqual(trendsIn(spice(0.5, 0.51, 0.52, 0.53, 0.54, 0.55)), [])
})

test('mostly one way still counts', () => {
  const [trend] = trendsIn(spice(0.5, 0.54, 0.58, 0.58, 0.57, 0.61, 0.65))
  assert.equal(trend?.direction, 'up', '4 of 5 moves went up')
})

test('price comfort needs twice the move, since it runs 0-2', () => {
  const price = (...values) => series(values.map((priceComfort) => ({ priceComfort })))
  assert.deepEqual(trendsIn(price(1, 1.03, 1.06, 1.08, 1.1)), [], 'a 0.10 rise is only 0.05 of the range')
  const [trend] = trendsIn(price(1, 0.96, 0.92, 0.88, 0.84))
  assert.equal(trend.headline, "You're going for cheaper")
  assert.equal(trend.label, 'Price comfort')
})

test('cuisines trend too, worded by name', () => {
  const [trend] = trendsIn(series([0.5, 0.53, 0.56, 0.59, 0.62].map((v) => ({ thai: v }))))
  assert.equal(trend.key, 'cuisine:thai')
  assert.equal(trend.headline, "You're warming to Thai")
  assert.equal(trend.label, 'Thai affinity')
  const [cooling] = trendsIn(series([0.5, 0.46, 0.42, 0.38, 0.34].map((v) => ({ 'chicken-rice': v }))))
  assert.equal(cooling.headline, "You're going off chicken rice")
})

test('a cuisine first reviewed partway through starts from the learner\'s default', () => {
  const [trend] = trendsIn(series([{}, { korean: 0.36 }, { korean: 0.42 }, { korean: 0.48 }, { korean: 0.54 }]))
  assert.equal(trend.key, 'cuisine:korean')
  assert.equal(trend.from, 0.3)
})

test('at most three, biggest first', () => {
  const steps = [0, 1, 2, 3, 4].map((i) => ({
    spicePref: 0.5 + 0.02 * i,
    richnessPref: 0.5 - 0.04 * i,
    adventurousness: 0.5 + 0.03 * i,
    thai: 0.5 + 0.05 * i,
  }))
  assert.deepEqual(trendsIn(series(steps)).map((t) => t.key), ['cuisine:thai', 'richness', 'adventurousness'])
})

test('only the last 8 reviews count', () => {
  const early = [0.3, 0.4, 0.5, 0.6, 0.7]
  const flat = Array(9).fill(0.7)
  assert.deepEqual(trendsIn(spice(...early, ...flat)), [])
})

test('the series runs through each review\'s before-profile to now, skipping older reviews without one', () => {
  const [a, b, now] = spice(0.5, 0.55, 0.6)
  const reviews = [{ dishId: 'old' }, { dishId: 'x', profileBefore: a }, { dishId: 'y', profileBefore: b }]
  assert.deepEqual(profileSeries(reviews, now), [a, b, now])
  assert.deepEqual(profileSeries([{ dishId: 'old' }, { dishId: 'x', profileBefore: a }, { dishId: 'legacy' }], now), [now],
    'a gap breaks the chain: only the unbroken recent run counts')
})

test('reviews that keep loving spicy food show up as eating spicier', () => {
  const state = createState(starterProfile())
  const venue = { id: 'v', name: 'Mala place', cuisine: 'chinese' }
  for (let i = 0; i < 5; i++) {
    const dish = { id: `mala-${i}`, venueId: 'v', name: 'Mala', price: 9, priceTier: 1, spice: 0.95, richness: 0.5, novelty: 0.5, tags: [] }
    applyBeliReview(state, dish, venue, { sentiment: 'loved', duels: [], insertIndex: 0 })
  }
  const keys = findTrends(state.reviews, state.profile).map((t) => t.key)
  assert.ok(keys.includes('spice'), `expected a spice trend, got ${keys}`)
})

test('"fine" reviews pulling a new cuisine up toward neutral are not "warming to" it', () => {
  // cuisines outside the starter list begin at 0.3, and "It was fine" aims at 0.5
  assert.deepEqual(trendsIn(series([{}, { korean: 0.335 }, { korean: 0.37 }, { korean: 0.4 }, { korean: 0.44 }])), [])
  const falling = series([0.8, 0.74, 0.68, 0.62, 0.56].map((v) => ({ thai: v })))
  assert.deepEqual(trendsIn(falling), [], 'still above neutral: not "going off" it yet')
})

test('an undone review is left out of the series', () => {
  const [a, b, now] = spice(0.5, 0.55, 0.6)
  const reviews = [
    { dishId: 'x', profileBefore: a },
    { dishId: 'oops', profileBefore: b, undone: true },
    { dishId: 'y', profileBefore: b },
  ]
  assert.deepEqual(profileSeries(reviews, now), [a, b, now])
})

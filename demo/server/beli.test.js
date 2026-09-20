import test from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_USER } from './match.js'
import {
  resetState,
  getProfile,
  getRankings,
  getUserDishes,
  getAccuracy,
  addUserDish,
  applyBeliReview,
} from './learn.js'

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

const review = (dish, opts = {}) =>
  applyBeliReview(dish, VENUE, {
    sentiment: 'loved',
    duels: [],
    insertIndex: 0,
    text: '',
    ...opts,
  })

test('first loved review anchors high and enters the rankings', () => {
  resetState()
  const dish = makeDish()
  const result = review(dish, { sentiment: 'loved' })
  assert.ok(result.score10 >= 8, `expected anchor-high score, got ${result.score10}`)
  assert.deepEqual(getRankings(), [dish.id])
  assert.equal(result.rank.index, 0)
  assert.equal(result.rank.total, 1)
})

test('duel: preferring the spicier dish raises spicePref', () => {
  resetState()
  const winner = { ...makeDish({ spice: 0.9 }), cuisine: 'thai' }
  const loser = { ...makeDish({ spice: 0.1 }), cuisine: 'chinese' }
  const before = getProfile().spicePref
  review(makeDish(), { sentiment: 'fine', duels: [{ winner, loser }] })
  assert.ok(getProfile().spicePref > before)
})

test('review text "I love the spice" raises spicePref, and repetition compounds', () => {
  resetState()
  const before = getProfile().spicePref
  // sentiment 'fine' zeroes the star-style spice nudge, isolating the text effect
  const first = review(makeDish(), { sentiment: 'fine', text: 'I love the spice here!' })
  const firstDelta = first.deltas.find((d) => d.dimension === 'Spice')
  assert.ok(firstDelta, 'first spice-love review should move Spice')
  const firstMove = firstDelta.to - firstDelta.from
  assert.ok(getProfile().spicePref > before)

  // three more corroborating reviews build up the corpus
  for (let i = 0; i < 3; i++) review(makeDish(), { sentiment: 'fine', text: 'love the spice so much' })
  const fifth = review(makeDish(), { sentiment: 'fine', text: 'again, I love the spice!' })
  const fifthDelta = fifth.deltas.find((d) => d.dimension === 'Spice')
  assert.ok(fifthDelta, 'fifth spice-love review should move Spice')
  assert.ok(
    fifthDelta.to - fifthDelta.from > firstMove,
    `evidence should compound: first ${firstMove}, fifth ${fifthDelta.to - fifthDelta.from}`,
  )
  assert.match(fifthDelta.reason, /5 of your reviews/)
})

test('review text "way too oily" lowers richnessPref', () => {
  resetState()
  const before = getProfile().richnessPref
  // neutral dish + fine sentiment so the star nudge does not move richness
  review(makeDish({ richness: before }), { sentiment: 'fine', text: 'tasty but way too oily for me' })
  assert.ok(getProfile().richnessPref < before)
})

test('insertion order produces monotonically decreasing scores', () => {
  resetState()
  const a = makeDish({ id: 'dish-a' })
  const b = makeDish({ id: 'dish-b' })
  const c = makeDish({ id: 'dish-c' })
  const ra = review(a, { sentiment: 'loved', insertIndex: 0 })
  const rb = review(b, { sentiment: 'disliked', insertIndex: 1 })
  const rc = review(c, { sentiment: 'fine', insertIndex: 1 })
  assert.deepEqual(getRankings(), ['dish-a', 'dish-c', 'dish-b'])
  assert.ok(ra.score10 > rc.score10 && rc.score10 > rb.score10,
    `expected a > c > b, got ${ra.score10}, ${rc.score10}, ${rb.score10}`)
})

test('re-reviewing a dish moves it instead of duplicating', () => {
  resetState()
  const a = makeDish({ id: 'dish-a' })
  const b = makeDish({ id: 'dish-b' })
  review(a, { insertIndex: 0 })
  review(b, { insertIndex: 1 })
  review(a, { sentiment: 'disliked', insertIndex: 2 })
  assert.deepEqual(getRankings(), ['dish-b', 'dish-a'])
})

test('user-created dish can be reviewed; reset clears rankings, user dishes, corpus', () => {
  resetState()
  const dish = addUserDish({ venueId: 'v-test', name: 'Secret off-menu laksa', price: 7 })
  assert.equal(getUserDishes().length, 1)
  assert.ok(dish.userCreated)
  const result = review(dish, { text: 'never tried anything like it' })
  assert.ok(result.score10 > 0)
  assert.ok(getRankings().includes(dish.id))
  resetState()
  assert.deepEqual(getRankings(), [])
  assert.equal(getUserDishes().length, 0)
  assert.equal(getAccuracy().count, 0)
  assert.deepEqual(getProfile(), DEMO_USER)
})

test('accuracy uses the 1-10 score and stays bounded', () => {
  resetState()
  const result = review(makeDish(), { sentiment: 'fine', insertIndex: 0 })
  assert.equal(result.prediction.actual, Math.round(result.score10 * 10))
  assert.ok(result.prediction.predicted >= 5 && result.prediction.predicted <= 99)
  assert.equal(getAccuracy().count, 1)
  assert.ok(getAccuracy().running >= 0 && getAccuracy().running <= 100)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createState, getAccuracy, applyBeliReview } from './learn.js'

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

const review = (state, dish, opts = {}) =>
  applyBeliReview(state, dish, VENUE, {
    sentiment: 'loved',
    duels: [],
    insertIndex: 0,
    text: '',
    ...opts,
  })

test('first loved review anchors high and enters the rankings', () => {
  const state = createState()
  const dish = makeDish()
  const result = review(state, dish, { sentiment: 'loved' })
  assert.ok(result.score10 >= 8, `expected anchor-high score, got ${result.score10}`)
  assert.deepEqual(state.rankings, [dish.id])
  assert.equal(result.rank.index, 0)
  assert.equal(result.rank.total, 1)
})

test('duel: preferring the spicier dish raises spicePref', () => {
  const state = createState()
  const winner = { ...makeDish({ spice: 0.9 }), cuisine: 'thai' }
  const loser = { ...makeDish({ spice: 0.1 }), cuisine: 'chinese' }
  const before = state.profile.spicePref
  review(state, makeDish(), { sentiment: 'fine', duels: [{ winner, loser }] })
  assert.ok(state.profile.spicePref > before)
})

test('review text "I love the spice" raises spicePref, and repetition compounds', () => {
  const state = createState()
  const before = state.profile.spicePref
  // sentiment 'fine' zeroes the star-style spice nudge, isolating the text effect
  const first = review(state, makeDish(), { sentiment: 'fine', text: 'I love the spice here!' })
  const firstDelta = first.deltas.find((d) => d.dimension === 'Spice')
  assert.ok(firstDelta, 'first spice-love review should move Spice')
  const firstMove = firstDelta.to - firstDelta.from
  assert.ok(state.profile.spicePref > before)

  // three more corroborating reviews build up the corpus
  for (let i = 0; i < 3; i++) review(state, makeDish(), { sentiment: 'fine', text: 'love the spice so much' })
  const fifth = review(state, makeDish(), { sentiment: 'fine', text: 'again, I love the spice!' })
  const fifthDelta = fifth.deltas.find((d) => d.dimension === 'Spice')
  assert.ok(fifthDelta, 'fifth spice-love review should move Spice')
  assert.ok(
    fifthDelta.to - fifthDelta.from > firstMove,
    `evidence should compound: first ${firstMove}, fifth ${fifthDelta.to - fifthDelta.from}`,
  )
  assert.match(fifthDelta.reason, /5 of your reviews/)
})

test('text evidence is per user: someone else\'s reviews don\'t compound yours', () => {
  const chatty = createState()
  for (let i = 0; i < 4; i++) review(chatty, makeDish(), { sentiment: 'fine', text: 'love the spice so much' })
  const quiet = createState()
  const first = review(quiet, makeDish(), { sentiment: 'fine', text: 'I love the spice here!' })
  assert.doesNotMatch(first.deltas.find((d) => d.dimension === 'Spice').reason, /of your reviews/)
})

test('review text "way too oily" lowers richnessPref', () => {
  const state = createState()
  const before = state.profile.richnessPref
  // neutral dish + fine sentiment so the star nudge does not move richness
  review(state, makeDish({ richness: before }), { sentiment: 'fine', text: 'tasty but way too oily for me' })
  assert.ok(state.profile.richnessPref < before)
})

test('insertion order produces monotonically decreasing scores', () => {
  const state = createState()
  const a = makeDish({ id: 'dish-a' })
  const b = makeDish({ id: 'dish-b' })
  const c = makeDish({ id: 'dish-c' })
  const ra = review(state, a, { sentiment: 'loved', insertIndex: 0 })
  const rb = review(state, b, { sentiment: 'disliked', insertIndex: 1 })
  const rc = review(state, c, { sentiment: 'fine', insertIndex: 1 })
  assert.deepEqual(state.rankings, ['dish-a', 'dish-c', 'dish-b'])
  assert.ok(ra.score10 > rc.score10 && rc.score10 > rb.score10,
    `expected a > c > b, got ${ra.score10}, ${rc.score10}, ${rb.score10}`)
})

test('re-reviewing a dish moves it instead of duplicating', () => {
  const state = createState()
  const a = makeDish({ id: 'dish-a' })
  const b = makeDish({ id: 'dish-b' })
  review(state, a, { insertIndex: 0 })
  review(state, b, { insertIndex: 1 })
  review(state, a, { sentiment: 'disliked', insertIndex: 2 })
  assert.deepEqual(state.rankings, ['dish-b', 'dish-a'])
})

test('a community-added dish with neutral features can be reviewed', () => {
  const state = createState()
  const dish = makeDish({ name: 'Secret off-menu laksa', spice: 0.5, richness: 0.5, novelty: 0.6 })
  const result = review(state, dish, { text: 'never tried anything like it' })
  assert.ok(result.score10 > 0)
  assert.ok(state.rankings.includes(dish.id))
  assert.equal(result.review.dishName, 'Secret off-menu laksa')
})

test('accuracy uses the 1-10 score and stays bounded', () => {
  const state = createState()
  const result = review(state, makeDish(), { sentiment: 'fine', insertIndex: 0 })
  assert.equal(result.prediction.actual, Math.round(result.score10 * 10))
  assert.ok(result.prediction.predicted >= 5 && result.prediction.predicted <= 99)
  assert.equal(getAccuracy(state).count, 1)
  assert.ok(getAccuracy(state).running >= 0 && getAccuracy(state).running <= 100)
})

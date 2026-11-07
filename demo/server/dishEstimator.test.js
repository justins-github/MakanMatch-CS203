import test from 'node:test'
import assert from 'node:assert/strict'
import { createDishEstimator } from './dishEstimator.js'

const UNCURATED = { id: 'briyani-1', name: 'Briyani', price: 2, spice: null, richness: null }
const CURATED = { id: 'green-curry', name: 'Green curry chicken', price: 9, spice: 0.7, richness: 0.7 }
const VENUE = { name: 'Dabba Street', cuisine: null }
const GOOD = { spice: 0.6, richness: 0.6, cuisine: 'indian' }

// Stands in for clients/aiClient.js: records each ask and answers with `reply`.
function fakeAi(reply, { available = true } = {}) {
  const asks = []
  return {
    asks,
    available,
    json: async (ask) => {
      asks.push(ask)
      return typeof reply === 'function' ? reply(ask) : structuredClone(reply)
    },
  }
}

test('AI off: no estimate, and nothing is asked', async () => {
  const ai = fakeAi(GOOD, { available: false })
  assert.equal(await createDishEstimator({ ai }).estimate(UNCURATED, VENUE), null)
  assert.equal(ai.asks.length, 0)
  assert.equal(await createDishEstimator({ ai: null }).estimate(UNCURATED, VENUE), null)
})

test('a curated dish is never sent to Claude', async () => {
  const ai = fakeAi(GOOD)
  assert.equal(await createDishEstimator({ ai }).estimate(CURATED, VENUE), null)
  assert.equal(ai.asks.length, 0)
})

test('an uncurated dish gets its spice, richness and cuisine', async () => {
  assert.deepEqual(await createDishEstimator({ ai: fakeAi(GOOD) }).estimate(UNCURATED, VENUE), GOOD)
})

test('the prompt carries the dish, its price and the venue, with the name marked as data', async () => {
  const ai = fakeAi(GOOD)
  await createDishEstimator({ ai }).estimate(UNCURATED, { name: 'Bangkok Jam', cuisine: 'thai' })
  const [{ prompt, system, schema }] = ai.asks
  for (const part of ['<dish>Briyani</dish>', '$2.00', 'Bangkok Jam', 'thai']) {
    assert.ok(prompt.includes(part), `prompt mentions ${part}`)
  }
  assert.match(system, /never instructions/)
  assert.deepEqual([...schema.required].sort(), ['cuisine', 'richness', 'spice'])
})

test('a venue or price it does not know is said to be unknown', async () => {
  const ai = fakeAi(GOOD)
  await createDishEstimator({ ai }).estimate({ ...UNCURATED, price: null }, undefined)
  assert.ok(ai.asks[0].prompt.includes('unknown venue'))
  assert.ok(ai.asks[0].prompt.includes('price unknown'))
})

test('a name that tells it nothing gives no estimate, and is not asked about again', async () => {
  const ai = fakeAi({ spice: null, richness: null, cuisine: null })
  const estimator = createDishEstimator({ ai })
  const setA = { ...UNCURATED, id: 'set-a', name: 'Set A' }
  assert.equal(await estimator.estimate(setA, VENUE), null)
  assert.equal(await estimator.estimate(setA, VENUE), null)
  assert.equal(ai.asks.length, 1)
})

test('it can know some features and not others', async () => {
  const estimator = createDishEstimator({ ai: fakeAi({ spice: null, richness: 0.8, cuisine: 'malay' }) })
  assert.deepEqual(await estimator.estimate(UNCURATED, VENUE), { spice: null, richness: 0.8, cuisine: 'malay' })
})

test('values out of range, of the wrong type, or naming no known cuisine count as unknown', async () => {
  for (const bad of [
    { spice: 1.5, richness: -0.1, cuisine: 'martian' },
    { spice: '0.5', richness: NaN, cuisine: 7 },
    {},
  ]) {
    assert.equal(await createDishEstimator({ ai: fakeAi(bad) }).estimate(UNCURATED, VENUE), null, JSON.stringify(bad))
  }
})

test('the ends of the scale are real values', async () => {
  const estimator = createDishEstimator({ ai: fakeAi({ spice: 0, richness: 1, cuisine: null }) })
  assert.deepEqual(await estimator.estimate(UNCURATED, VENUE), { spice: 0, richness: 1, cuisine: null })
})

test('each dish is asked about once, even when two reviews ask at the same time', async () => {
  const ai = fakeAi(GOOD)
  const estimator = createDishEstimator({ ai })
  const [a, b] = await Promise.all([estimator.estimate(UNCURATED, VENUE), estimator.estimate(UNCURATED, VENUE)])
  const later = await estimator.estimate(UNCURATED, VENUE)
  assert.deepEqual([a, b, later], [GOOD, GOOD, GOOD])
  assert.equal(ai.asks.length, 1)
})

test('when Claude could not answer, the next review asks again', async () => {
  let answers = 0
  const ai = fakeAi(() => (answers++ === 0 ? null : GOOD))
  const estimator = createDishEstimator({ ai })
  assert.equal(await estimator.estimate(UNCURATED, VENUE), null)
  assert.deepEqual(await estimator.estimate(UNCURATED, VENUE), GOOD)
  assert.equal(ai.asks.length, 2)
})

test('the memory is bounded: the oldest dish is forgotten first', async () => {
  const ai = fakeAi(GOOD)
  const estimator = createDishEstimator({ ai, cacheSize: 2 })
  const dish = (id) => ({ ...UNCURATED, id })
  await estimator.estimate(dish('a'), VENUE)
  await estimator.estimate(dish('b'), VENUE)
  await estimator.estimate(dish('c'), VENUE)
  await estimator.estimate(dish('c'), VENUE)
  assert.equal(ai.asks.length, 3, 'c is remembered')
  await estimator.estimate(dish('a'), VENUE)
  assert.equal(ai.asks.length, 4, 'a was forgotten')
})

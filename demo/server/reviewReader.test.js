import test from 'node:test'
import assert from 'node:assert/strict'
import { createReviewReader, quoteFound } from './reviewReader.js'
import { keywordReading } from './reviewText.js'

const DISH = { id: 'chicken-rice-1', name: 'Chicken rice', price: 14 }
const VENUE = { id: 'tian-tian', name: 'Tian Tian', cuisine: 'chicken-rice' }
const PROFILE = { cuisineAffinity: { 'chicken-rice': 0.5 }, spicePref: 0.5, richnessPref: 0.5, priceComfort: 1, adventurousness: 0.5 }
const TEXT = 'Price was alright but I hate the spice'

const DOC_EXAMPLE = {
  blame: 'specific',
  signals: [
    { dimension: 'spice', direction: 'down', strength: 3, quote: 'I hate the spice', why: 'dislikes heat' },
    { dimension: 'price', direction: 'up', strength: 1, quote: 'Price was alright', why: 'fine with the price' },
  ],
}

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

const read = (ai, overrides = {}) =>
  createReviewReader({ ai }).read({ text: TEXT, dish: DISH, venue: VENUE, sentiment: 'disliked', profile: PROFILE, ...overrides })

test('keyword reading: "way too oily" -> richness down, quote "oily", blame overall', () => {
  const reading = keywordReading('Tasty but way too oily for me')
  assert.equal(reading.readBy, 'keywords')
  assert.equal(reading.blame, 'overall')
  assert.deepEqual(reading.signals, [
    { dimension: 'richness', direction: 'down', strength: 2, quote: 'oily', why: 'it being oily or heavy' },
  ])
})

test('keyword reading of "so jelak lah" -> richness down', () => {
  const [signal] = keywordReading('so jelak lah').signals
  assert.equal(signal.dimension, 'richness')
  assert.equal(signal.direction, 'down')
})

test('no text: nothing read, AI not called', async () => {
  const ai = fakeAi(DOC_EXAMPLE)
  assert.deepEqual(await read(ai, { text: '   ' }), { readBy: null, blame: 'overall', signals: [] })
  assert.equal(ai.asks.length, 0)
})

test('AI off: falls back to keywords', async () => {
  const ai = fakeAi(DOC_EXAMPLE, { available: false })
  const reading = await read(ai, { text: 'way too oily' })
  assert.equal(reading.readBy, 'keywords')
  assert.equal(ai.asks.length, 0)
  assert.equal((await createReviewReader({ ai: null }).read({ text: 'way too oily', dish: DISH, venue: VENUE })).readBy, 'keywords')
})

test('AI reading kept: the doc example', async () => {
  const reading = await read(fakeAi(DOC_EXAMPLE))
  assert.equal(reading.readBy, 'ai')
  assert.equal(reading.blame, 'specific')
  assert.deepEqual(reading.signals.map((s) => [s.dimension, s.direction, s.strength, s.quote]), [
    ['spice', 'down', 3, 'I hate the spice'],
    ['price', 'up', 1, 'Price was alright'],
  ])
})

test('the prompt carries the dish, price, sentiment, profile and the text', async () => {
  const ai = fakeAi(DOC_EXAMPLE)
  await read(ai)
  const [{ prompt, system, schema }] = ai.asks
  for (const part of ['Chicken rice', '$14.00', 'disliked', 'Tian Tian', 'chicken-rice', TEXT]) {
    assert.ok(prompt.includes(part), `prompt mentions ${part}`)
  }
  assert.ok(prompt.includes('<review>') && prompt.includes('</review>'))
  assert.ok(system.length > 0)
  assert.deepEqual([...schema.required].sort(), ['blame', 'signals'])
})

test('quotes are matched loosely but never invented', async () => {
  assert.equal(quoteFound('i  HATE the spice', TEXT), true)
  assert.equal(quoteFound('the “sambal”', 'loved the "sambal" here'), true)
  assert.equal(quoteFound('I hate the noodles', TEXT), false)
  const reading = await read(fakeAi({
    blame: 'overall',
    signals: [
      { dimension: 'spice', direction: 'down', strength: 2, quote: 'i  HATE the spice', why: '' },
      { dimension: 'richness', direction: 'down', strength: 2, quote: 'I hate the noodles', why: '' },
    ],
  }))
  assert.deepEqual(reading.signals.map((s) => s.dimension), ['spice'])
})

test('invalid signals are dropped', async () => {
  const base = { direction: 'down', strength: 2, quote: 'I hate the spice', why: '' }
  const reading = await read(fakeAi({
    blame: 'overall',
    signals: [
      { ...base, dimension: 'location' },
      { ...base, dimension: 'spice', strength: 4 },
      { ...base, dimension: 'spice', direction: 'sideways' },
      { ...base, dimension: 'spice' },
    ],
  }))
  assert.equal(reading.signals.length, 1)
})

test('a cuisine signal needs a known venue cuisine', async () => {
  const cuisine = { blame: 'overall', signals: [{ dimension: 'cuisine', direction: 'down', strength: 2, quote: 'I hate the spice', why: '' }] }
  assert.equal((await read(fakeAi(cuisine), { venue: { ...VENUE, cuisine: null } })).signals.length, 0)
  assert.equal((await read(fakeAi(cuisine))).signals.length, 1)
})

test('no taste content: AI reads nothing, readBy still ai', async () => {
  const reading = await read(fakeAi({ blame: 'overall', signals: [] }), { text: 'came here with my friends' })
  assert.deepEqual(reading, { readBy: 'ai', blame: 'overall', signals: [] })
})

test('specific blame with no surviving signals becomes overall', async () => {
  const reading = await read(fakeAi({ blame: 'specific', signals: [{ dimension: 'spice', direction: 'down', strength: 2, quote: 'not in the text', why: '' }] }))
  assert.equal(reading.blame, 'overall')
})

test('AI failure (json -> null) falls back to keywords', async () => {
  const reading = await read(fakeAi(null), { text: 'way too oily' })
  assert.equal(reading.readBy, 'keywords')
  assert.equal(reading.signals[0].dimension, 'richness')
})

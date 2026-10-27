import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestionFor } from './suggestion.js'
import { createSummaryWriter } from './tasteSummary.js'

const SPICIER = { key: 'spice', direction: 'up', from: 0.5, to: 0.83, reviews: 5, headline: "You're eating spicier", label: 'Spice' }
const HEARTIER = { key: 'richness', direction: 'up', from: 0.5, to: 0.6, reviews: 5, headline: "You're going heartier", label: 'Richness' }
const suggestion = suggestionFor([SPICIER, HEARTIER], [])
const TEMPLATE = "Lately you're eating spicier and going heartier. Want your matches to lean that way a bit more?"

// Stands in for clients/aiClient.js: records each ask and answers with `reply`.
function fakeAi(reply, { available = true } = {}) {
  const asks = []
  return { asks, available, json: async (ask) => { asks.push(ask); return reply } }
}

test('Claude writes the summary when it can', async () => {
  const ai = fakeAi({ summary: "You've been chasing heat and richer plates lately. Want your matches to lean that way a bit more?" })
  const written = await createSummaryWriter({ ai }).write(suggestion)
  assert.equal(written.writtenBy, 'ai')
  assert.match(written.summary, /chasing heat/)
})

test('Claude is given the trends and nothing else', async () => {
  const ai = fakeAi({ summary: 'ok' })
  await createSummaryWriter({ ai }).write(suggestion)
  const [{ prompt, system, schema }] = ai.asks
  assert.ok(prompt.includes("You're eating spicier (over the last 5 reviews)"))
  assert.ok(prompt.includes("You're going heartier (over the last 5 reviews)"))
  assert.doesNotMatch(prompt, /0\.\d/, 'the numbers are already on screen; Claude only gets the words')
  assert.match(system, /only/i)
  assert.deepEqual(schema.required, ['summary'])
})

test('no AI, no answer, or an unusable answer falls back to the template', async () => {
  for (const ai of [null, fakeAi({ summary: 'x' }, { available: false }), fakeAi(null), fakeAi({ summary: '  ' }), fakeAi({ summary: 'a'.repeat(301) })]) {
    const written = await createSummaryWriter({ ai }).write(suggestion)
    assert.deepEqual(written, { summary: TEMPLATE, writtenBy: 'template' })
  }
})

test('a summary with numbers or far too many words falls back to the template', async () => {
  const withNumbers = fakeAi({ summary: 'Your spice went from 0.50 to 0.83. Lean in?' })
  const rambling = fakeAi({ summary: Array(46).fill('word').join(' ') })
  for (const ai of [withNumbers, rambling]) {
    assert.equal((await createSummaryWriter({ ai }).write(suggestion)).writtenBy, 'template')
  }
})

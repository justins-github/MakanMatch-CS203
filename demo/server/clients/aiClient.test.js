import test from 'node:test'
import assert from 'node:assert/strict'
import { createAiClient } from './aiClient.js'

const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
const ASK = { system: 'You answer in JSON.', prompt: 'Is it ok?', schema: SCHEMA }

// Stands in for the Anthropic SDK: records each request and answers with `reply`.
function fakeAnthropic(reply) {
  const calls = []
  return {
    calls,
    messages: {
      create: async (params, options) => {
        calls.push({ params, options })
        return typeof reply === 'function' ? reply() : reply
      },
    },
  }
}

const answer = (text, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] })

test('no key: unavailable, json returns null without calling the API', async () => {
  const fake = fakeAnthropic(answer('{"ok":true}'))
  const ai = createAiClient({ apiKey: null, client: fake })
  assert.equal(ai.available, false)
  assert.equal(await ai.json(ASK), null)
  assert.equal(fake.calls.length, 0)
})

test('returns the parsed JSON and asks for low effort and a json_schema', async () => {
  const fake = fakeAnthropic(answer('{"ok":true}'))
  const ai = createAiClient({ apiKey: 'test-key', model: 'claude-haiku-5-5', client: fake })
  assert.equal(ai.available, true)
  assert.deepEqual(await ai.json(ASK), { ok: true })
  const { params } = fake.calls[0]
  assert.equal(params.model, 'claude-haiku-5-5')
  assert.equal(params.system, ASK.system)
  assert.equal(params.messages[0].content, ASK.prompt)
  assert.equal(params.output_config.effort, 'low')
  assert.equal(params.output_config.format.type, 'json_schema')
  assert.equal(params.output_config.format.schema, SCHEMA)
})

test('refusal, thrown errors and bad JSON all give null', async () => {
  const refused = fakeAnthropic(answer('{"ok":true}', 'refusal'))
  const broken = fakeAnthropic(() => { throw new Error('529 overloaded') })
  const garbled = fakeAnthropic(answer('not json'))
  for (const fake of [refused, broken, garbled]) {
    const ai = createAiClient({ apiKey: 'test-key', client: fake })
    assert.equal(await ai.json(ASK), null)
  }
})

test('a blank or invalid timeout falls back to 10 s instead of giving up at once', async () => {
  for (const timeoutMs of [0, NaN, -5]) {
    const fake = fakeAnthropic(() => new Promise((resolve) => setTimeout(() => resolve(answer('{"ok":true}')), 30)))
    const ai = createAiClient({ apiKey: 'test-key', timeoutMs, client: fake })
    assert.deepEqual(await ai.json(ASK), { ok: true }, `timeoutMs ${timeoutMs}`)
    assert.equal(fake.calls[0].options.timeout, 10000)
  }
})

test('a slow answer gives null after the timeout', async () => {
  const fake = fakeAnthropic(() => new Promise(() => {}))
  const ai = createAiClient({ apiKey: 'test-key', timeoutMs: 20, client: fake })
  const started = Date.now()
  assert.equal(await ai.json(ASK), null)
  assert.ok(Date.now() - started < 500, 'gave up near the timeout')
})

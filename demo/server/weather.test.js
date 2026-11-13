import test from 'node:test'
import assert from 'node:assert/strict'
import { SMU } from './geo.js'
import { contextFor, contextFromService, createContextPing, createContextSource, withRainOverride } from './weather.js'

const TAMPINES = { lat: 1.3533, lon: 103.9451 }
const FORECASTS = new Map([['City', 'Partly Cloudy (Day)'], ['Tampines', 'Thundery Showers']])

test('the forecast is the one for the area nearest the user', () => {
  assert.deepEqual(contextFor(FORECASTS, SMU), {
    raining: false,
    area: 'City',
    forecast: 'Partly Cloudy (Day)',
    summary: 'No rain expected over City (next 2h)',
    source: 'live',
  })
  const tampines = contextFor(FORECASTS, TAMPINES)
  assert.equal(tampines.raining, true)
  assert.equal(tampines.summary, 'Thundery Showers over Tampines (next 2h)')
})

test('without a forecast for the area, the labelled fallback still names it', () => {
  for (const forecasts of [null, new Map()]) {
    const context = contextFor(forecasts, TAMPINES)
    assert.equal(context.source, 'fallback')
    assert.equal(context.area, 'Tampines')
    assert.match(context.summary, /offline fallback/)
  }
})

test('simulated rain keeps the area but says it is simulated', () => {
  const context = withRainOverride(contextFor(FORECASTS, SMU), true)
  assert.equal(context.raining, true)
  assert.equal(context.area, 'City')
  assert.equal(context.simulated, true)
})

const SERVICE_RAIN = { rainCategory: 'HEAVY', forecastText: 'Thundery Showers', area: 'Tampines', multiplier: 1.4, status: 'available' }

test("context-service's answer becomes the engine's context, labelled with where it came from", () => {
  assert.deepEqual(contextFromService(SERVICE_RAIN), {
    raining: true,
    area: 'Tampines',
    forecast: 'Thundery Showers',
    summary: 'Thundery Showers over Tampines (next 2h)',
    source: 'live',
    via: 'context-service',
    rainCategory: 'HEAVY',
  })
  const dry = contextFromService({ ...SERVICE_RAIN, rainCategory: 'NONE', forecastText: 'Cloudy' })
  assert.equal(dry.raining, false)
  assert.equal(dry.summary, 'No rain expected over Tampines (next 2h)')
  assert.equal(contextFromService({ rainCategory: 'NONE', multiplier: 1, status: 'unavailable' }), null)
})

test('without CONTEXT_SERVICE_URL the engine reads data.gov.sg itself', () => {
  const fallback = async () => 'direct'
  assert.equal(createContextSource({ contextServiceUrl: null, fallback }), fallback)
})

test('context-service answers first; when it fails the fallback answers and it is skipped for a while', async () => {
  let clock = 0
  const calls = []
  let up = true
  const fetchImpl = async (url) => {
    calls.push(url)
    if (!up) throw new Error('still starting')
    return { ok: true, json: async () => SERVICE_RAIN }
  }
  const getContext = createContextSource({
    contextServiceUrl: 'http://context.internal', fetchImpl, now: () => clock, fallback: async () => ({ source: 'fallback' }),
  })

  const live = await getContext(TAMPINES)
  assert.equal(live.via, 'context-service')
  assert.equal(calls[0], 'http://context.internal/api/context/weather?lat=1.3533&lng=103.9451')

  up = false
  assert.equal((await getContext(TAMPINES)).source, 'fallback')
  clock += 5_000
  assert.equal((await getContext(TAMPINES)).source, 'fallback')
  assert.equal(calls.length, 2) // skipped while it recovers

  up = true
  clock += 15_000
  assert.equal((await getContext(TAMPINES)).via, 'context-service')
})

test('an unavailable answer from context-service falls back without skipping it', async () => {
  let calls = 0
  const getContext = createContextSource({
    contextServiceUrl: 'http://context.internal',
    fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ status: 'unavailable', rainCategory: 'NONE' }) } },
    fallback: async () => ({ source: 'fallback' }),
  })
  assert.equal((await getContext(SMU)).source, 'fallback')
  assert.equal((await getContext(SMU)).source, 'fallback')
  assert.equal(calls, 2)
})

// The warm-up (routes/warm.js) only needs to know the service is awake.
test('ping: any answer means context-service is awake, and no forecast is asked for', async () => {
  const asked = []
  const ping = createContextPing({
    contextServiceUrl: 'http://context.internal',
    fetchImpl: async (url) => { asked.push(url); return { ok: false, status: 400 } },
  })
  assert.equal(await ping(), true)
  assert.deepEqual(asked, ['http://context.internal/api/context/weather'])
})

test('ping: an unreachable or too-slow context-service is false, not an error', async () => {
  const down = createContextPing({ contextServiceUrl: 'http://context.internal', fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
  assert.equal(await down(), false)
  const slowFetch = (_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: true }), 300)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
  const slow = createContextPing({ contextServiceUrl: 'http://context.internal', fetchImpl: slowFetch, timeoutMs: 20 })
  assert.equal(await slow(), false)
})

test('ping: without CONTEXT_SERVICE_URL there is nothing to wake', () => {
  assert.equal(createContextPing({ contextServiceUrl: null }), null)
})

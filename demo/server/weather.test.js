import test from 'node:test'
import assert from 'node:assert/strict'
import { SMU } from './geo.js'
import { contextFor, withRainOverride } from './weather.js'

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

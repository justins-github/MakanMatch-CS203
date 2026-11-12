import test from 'node:test'
import assert from 'node:assert/strict'
import { dedupe, isListed, metersBetween, normName } from './overture.js'

const row = (over = {}) => ({ gersId: 'g1', name: 'Kebab Stop', lat: 1.3, lon: 103.85, confidence: 0.9, isFood: true, status: null, ...over })

test('a row is listed only when it is food, confident enough and not closed', () => {
  assert.equal(isListed(row()), true)
  assert.equal(isListed(row({ status: 'open' })), true)
  assert.equal(isListed(row({ status: 'permanently_closed' })), false)
  assert.equal(isListed(row({ confidence: 0.49 })), false)
  assert.equal(isListed(row({ isFood: false })), false)
})

test('names compare without case, accents or punctuation', () => {
  assert.equal(normName("Türk's  Kebab!"), 'turk s kebab')
})

test('same-name rows within 100 m collapse to the most confident one', () => {
  const kept = dedupe([
    row({ gersId: 'low', confidence: 0.6 }),
    row({ gersId: 'high', confidence: 0.9, lat: 1.3005 }), // ~55 m north
    row({ gersId: 'far', confidence: 0.7, lat: 1.31 }), // ~1.1 km north
  ])
  assert.deepEqual(kept.map((r) => r.gersId).sort(), ['far', 'high'])
})

test('a row with no usable name is dropped', () => {
  assert.deepEqual(dedupe([row({ name: '***' })]), [])
})

test('metersBetween is about 111 m per 0.001 degree of latitude', () => {
  assert.ok(Math.abs(metersBetween({ lat: 1.3, lon: 103.85 }, { lat: 1.301, lon: 103.85 }) - 111.3) < 1)
})

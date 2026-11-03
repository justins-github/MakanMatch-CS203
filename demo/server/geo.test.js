import test from 'node:test'
import assert from 'node:assert/strict'
import { SMU, inSingapore, nearestArea, parseLatLon, venuesNear, walkMinutes } from './geo.js'

test('walk minutes are straight-line metres at 80 a minute, at least 1', () => {
  assert.equal(walkMinutes(SMU, SMU), 1)
  // 0.009 degrees of latitude is ~1 km -> 13 min.
  assert.equal(walkMinutes(SMU, { lat: SMU.lat + 0.009, lon: SMU.lon }), 13)
})

test('a location header must be two numbers inside Singapore', () => {
  assert.deepEqual(parseLatLon('1.3521,103.8198'), { lat: 1.3521, lon: 103.8198 })
  assert.deepEqual(parseLatLon(' 1.3 , 103.9 '), { lat: 1.3, lon: 103.9 })
  for (const bad of [undefined, '', '1.3', '1.3,103.8,1', 'abc,103.8', '1.3,1e2', '51.5,-0.12', '1.6,103.8']) {
    assert.equal(parseLatLon(bad), null, String(bad))
  }
  assert.equal(inSingapore({ lat: 1.29, lon: 104.2 }), false)
})

test('a spot is named after the nearest two-hour forecast area', () => {
  assert.equal(nearestArea(SMU), 'City')
  assert.equal(nearestArea({ lat: 1.3533, lon: 103.9451 }), 'Tampines')
  assert.equal(nearestArea({ lat: 1.333, lon: 103.7424 }), 'Jurong East')
})

test('venuesNear keeps venues within the walk, with their minutes from the spot', () => {
  const venues = [
    { id: 'near', lat: SMU.lat + 0.003, lon: SMU.lon },
    { id: 'edge', lat: SMU.lat + 0.0144, lon: SMU.lon }, // ~1.6 km, exactly 20 min
    { id: 'far', lat: SMU.lat + 0.02, lon: SMU.lon },
    { id: 'unplaced' },
  ]
  const near = venuesNear(venues, SMU, 20)
  assert.deepEqual(near.map((v) => [v.id, v.distanceMin]), [['near', 4], ['edge', 20]])
  assert.equal(venues[0].distanceMin, undefined, 'the registry records are left alone')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { SMU } from '../geo.js'
import { locationOf, walkLimitOf } from './location.js'

const req = ({ header, walk } = {}) => ({
  get: (name) => (name.toLowerCase() === 'x-location' ? header : undefined),
  query: walk === undefined ? {} : { walk },
})

test('no X-Location means SMU; a good one is used as is', () => {
  assert.deepEqual(locationOf(req()), SMU)
  assert.deepEqual(locationOf(req({ header: '1.324,103.93' })), { lat: 1.324, lon: 103.93 })
})

test('a malformed or overseas X-Location is a 400', () => {
  for (const header of ['nowhere', '51.5,-0.12']) {
    assert.throws(() => locationOf(req({ header })), (err) => err.status === 400)
  }
})

test('walk is 20 by default and otherwise whole minutes from 5 to 60', () => {
  assert.equal(walkLimitOf(req()), 20)
  assert.equal(walkLimitOf(req({ walk: '30' })), 30)
  for (const walk of ['', '4', '61', '12.5', 'far', ['10', '20']]) {
    assert.throws(() => walkLimitOf(req({ walk })), (err) => err.status === 400, String(walk))
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { addStillOpen, latestOnly, monthNote, searchScope } from './monthSwitch.js'

test('searches made on different months never share a scope', () => {
  assert.notEqual(searchScope(null, []), searchScope('2026-10', []))
  assert.equal(searchScope('2026-10', []), searchScope('2026-10', []))
})

test('saying a place is still open changes what a search on that month returns', () => {
  assert.notEqual(searchScope('2026-10', []), searchScope('2026-10', ['ov-pau']))
})

test('on the first month, still-open places are not sent, so the scope ignores them', () => {
  assert.equal(searchScope(null, ['ov-pau']), searchScope(null, []))
})

test('a place can only be said to be still open once', () => {
  const ids = ['ov-pau']
  assert.equal(addStillOpen(ids, 'ov-pau'), ids)
  assert.deepEqual(addStillOpen(ids, 'ov-juice'), ['ov-pau', 'ov-juice'])
})

test('only the newest of overlapping requests may land', () => {
  const requests = latestOnly()
  const first = requests.begin()
  const second = requests.begin()
  assert.equal(requests.isCurrent(first), false)
  assert.equal(requests.isCurrent(second), true)
})

test('leaving cancels whatever is still on its way', () => {
  const requests = latestOnly()
  const ticket = requests.begin()
  requests.cancel()
  assert.equal(requests.isCurrent(ticket), false)
})

const OCT = { label: 'October 2026', since: 'August 2026' }

test('no line on the first month', () => {
  assert.equal(monthNote(undefined), null)
})

test('unchanged picks say so, and why', () => {
  assert.equal(
    monthNote({ ...OCT, left: [], arrived: 0 }),
    'Showing October 2026. Your picks are the same as in August: none of them left, and no new place beats them yet.',
  )
})

test('picks that left are named with what happened to them', () => {
  const left = [{ name: 'Juice Bar', reason: 'closed' }, { name: 'Pau Shop', reason: 'unlisted' }, { name: 'The Mall', reason: 'dropped' }]
  assert.equal(
    monthNote({ ...OCT, left, arrived: 0 }),
    'Showing October 2026. Since August, Juice Bar (closed), Pau Shop (no longer listed) and The Mall (no longer listed) left your picks.',
  )
})

test('new places that made it in are counted', () => {
  assert.equal(monthNote({ ...OCT, left: [], arrived: 1 }), 'Showing October 2026. Since August, 1 new place made it into your picks.')
  assert.equal(
    monthNote({ ...OCT, left: [{ name: 'Juice Bar', reason: 'closed' }], arrived: 2 }),
    'Showing October 2026. Since August, Juice Bar (closed) left your picks and 2 new places made it in.',
  )
})

test('Surprise and group picks only say which month is showing', () => {
  assert.equal(monthNote(OCT), 'Showing October 2026.')
})

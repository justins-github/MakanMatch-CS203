import test from 'node:test'
import assert from 'node:assert/strict'
import { monthOf, reopenedOf } from './demoMonths.js'

const months = { has: (m) => ['2026-08', '2026-10'].includes(m), list: [{ month: '2026-08' }, { month: '2026-10' }] }
const req = (query) => ({ query })

test('no month means the default', () => assert.equal(monthOf(req({}), months), undefined))

test('a known month is passed through', () => assert.equal(monthOf(req({ month: '2026-10' }), months), '2026-10'))

test('an unknown month is a 400 that names the choices', () => {
  assert.throws(() => monthOf(req({ month: '2027-01' }), months), (err) => err.status === 400 && /2026-08, 2026-10/.test(err.message))
})

test('reopen is a comma list, at most 20', () => {
  assert.deepEqual(reopenedOf(req({ reopen: 'a,,b' })), ['a', 'b'])
  assert.deepEqual(reopenedOf(req({})), [])
  const twentyOne = Array.from({ length: 21 }, (_, i) => `v${i}`).join(',')
  assert.throws(() => reopenedOf(req({ reopen: twentyOne })), (err) => err.status === 400)
})

test('a place named twice is reopened once', () => {
  assert.deepEqual(reopenedOf(req({ reopen: 'a,a,b' })), ['a', 'b'])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyMonth, createMonths, diffMonths, loadMonthFiles, monthLabel } from './months.js'

const row = (gersId, over = {}) => ({ gersId, name: gersId, lat: 1.3, lon: 103.85, confidence: 0.9, isFood: true, status: null, ...over })
const reasons = (delta) => Object.fromEntries(delta.gone.map((g) => [g.gersId, g.reason]))

test('a place the source marks closed is "closed"', () => {
  const delta = diffMonths([row('a')], [row('a', { status: 'permanently_closed' })])
  assert.deepEqual(reasons(delta), { a: 'closed' })
})

test('a place that vanished or lost confidence is "unlisted"', () => {
  const delta = diffMonths([row('a'), row('b')], [row('b', { confidence: 0.4 })])
  assert.deepEqual(reasons(delta), { a: 'unlisted', b: 'unlisted' })
})

test('a place that is no longer food is "dropped"', () => {
  assert.deepEqual(reasons(diffMonths([row('a')], [row('a', { isFood: false })])), { a: 'dropped' })
})

test('closed wins over dropped and low confidence', () => {
  const delta = diffMonths([row('a')], [row('a', { status: 'permanently_closed', isFood: false, confidence: 0.1 })])
  assert.deepEqual(reasons(delta), { a: 'closed' })
})

test('the same place under a new id is neither gone nor added', () => {
  const delta = diffMonths([row('old', { name: 'Kebab Stop' })], [row('new', { name: 'kebab stop', lat: 1.3003 })])
  assert.deepEqual(delta, { gone: [], added: [] })
})

test('a listed place the base never had is added, in the base file\'s shape', () => {
  const delta = diffMonths([row('a')], [row('a'), row('n', { name: 'New Place', lat: 1.31 })])
  assert.deepEqual(delta.added.map((r) => r.gersId), ['n'])
  assert.equal('isFood' in delta.added[0], false)
  assert.equal('status' in delta.added[0], false)
})

test('an unlisted new place is not added', () => {
  assert.deepEqual(diffMonths([], [row('n', { confidence: 0.3 })]).added, [])
})

test('applyMonth removes every gone id and appends the added rows', () => {
  const delta = { gone: [{ gersId: 'a', reason: 'dropped' }], added: [row('n')] }
  assert.deepEqual(applyMonth([row('a'), row('b')], delta).map((r) => r.gersId), ['b', 'n'])
})

test('month ids read as month names', () => {
  assert.equal(monthLabel('2026-10'), 'October 2026')
})

const ov = (gersId, name, over = {}) => ({ gersId, name, lat: 1.3, lon: 103.85, categoryPrimary: 'cafe', categoryPath: [], confidence: 0.9, updatedAt: '2026-08-14T00:00:00Z', ...over })
const OCT = {
  month: '2026-10', label: 'October 2026', release: '2026-10-21.0', base: '2026-08',
  gone: [{ gersId: 'g-juice', reason: 'closed' }, { gersId: 'g-pau', reason: 'unlisted' }, { gersId: 'g-mall', reason: 'dropped' }, { gersId: 'g-kebab', reason: 'unlisted' }],
  added: [ov('g-new', 'Anatolia Grill')],
}
const months = () => createMonths({
  overtureRows: [ov('g-juice', 'Juice Bar'), ov('g-pau', 'Pau Shop'), ov('g-mall', 'The Mall'), ov('g-kebab', 'Kebab Stop'), ov('g-stay', 'Soto Corner')],
  seeds: [{ id: 'kebab-stop', name: 'Kebab Stop', latitude: 1.3, longitude: 103.85 }],
  deltas: [OCT],
})

test('the base month comes first in the list and is the default registry', () => {
  const m = months()
  assert.deepEqual(m.list, [{ month: '2026-08', label: 'August 2026', base: true }, { month: '2026-10', label: 'October 2026', base: false }])
  assert.equal(m.registryFor(), m.base)
  assert.equal(m.registryFor('2026-08'), m.base)
  assert.equal(m.changesFor('2026-08'), null)
})

test('an unknown month is refused', () => {
  assert.equal(months().has('2027-01'), false)
  assert.throws(() => months().registryFor('2027-01'), RangeError)
})

test('October lists survivors and new places, and keeps gone ones only for search', () => {
  const oct = months().registryFor('2026-10')
  assert.deepEqual(oct.venues.map((v) => v.name).sort(), ['Anatolia Grill', 'Soto Corner'])
  assert.equal(oct.venueById.get('ov-g-new').monthChange, 'new')
  assert.deepEqual([...oct.ghosts.values()].map((v) => [v.id, v.monthChange]).sort(), [['kebab-stop', 'unlisted'], ['ov-g-juice', 'closed'], ['ov-g-pau', 'unlisted']])
  assert.equal(oct.searchIndex.length, 5) // 2 listed + 3 ghosts; the dropped mall is nowhere
})

test('the month registry is built once', () => {
  const m = months()
  assert.equal(m.registryFor('2026-10'), m.registryFor('2026-10'))
})

test('changes leave out dropped places, and count without them', () => {
  const changes = months().changesFor('2026-10')
  assert.deepEqual([...changes.gone.keys()].sort(), ['kebab-stop', 'ov-g-juice', 'ov-g-pau'])
  assert.equal(changes.gone.get('ov-g-juice').reason, 'closed')
  assert.deepEqual(changes.totals, { gone: 3, added: 1 })
  assert.deepEqual(changes.added.map((v) => v.id), ['ov-g-new'])
})

test('a place that only exists in October still resolves by id from the base', () => {
  const m = months()
  assert.equal(m.base.venueById.get('ov-g-new').name, 'Anatolia Grill')
  assert.equal(m.base.venues.some((v) => v.id === 'ov-g-new'), false)
})

test('with no month files there is only August', () => {
  assert.deepEqual(loadMonthFiles('/no/such/folder'), [])
  const m = createMonths({ overtureRows: [ov('g-stay', 'Soto Corner')], seeds: [], deltas: [] })
  assert.deepEqual(m.list.map((x) => x.month), ['2026-08'])
})

test('a community-only seed is in every month', () => {
  const m = createMonths({ overtureRows: [ov('g-stay', 'Soto Corner')], seeds: [{ id: 'test-kitchen', name: 'Test Kitchen', latitude: 1.3, longitude: 103.85 }], deltas: [{ ...OCT, gone: [], added: [] }] })
  assert.ok(m.registryFor('2026-10').venueById.has('test-kitchen'))
})

test('a month registry remembers everything that left, whatever the reason', () => {
  const oct = months().registryFor('2026-10')
  assert.deepEqual([...oct.departed.values()].map((v) => [v.id, v.monthChange]).sort(), [['kebab-stop', 'unlisted'], ['ov-g-juice', 'closed'], ['ov-g-mall', 'dropped'], ['ov-g-pau', 'unlisted']])
})

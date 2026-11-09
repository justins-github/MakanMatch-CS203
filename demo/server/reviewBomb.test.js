import test from 'node:test'
import assert from 'node:assert/strict'
import { bombDish, standingBomb } from './reviewBomb.js'

const LINE = 'SUPER SPICY, not for me.'

test('the bomb pans the dish named for a place, else one with known spice, else the first', () => {
  const turks = [{ id: 'baklava', spice: null }, { id: 'kofte', spice: 0.4 }, { id: 'chicken-doner-wrap', spice: 0.3 }]
  assert.equal(bombDish(turks, 'turks-kebab').id, 'chicken-doner-wrap')
  assert.equal(bombDish([{ id: 'a', spice: null }, { id: 'b', spice: 0.7 }], 'moona-thai').id, 'b')
  assert.equal(bombDish([{ id: 'a' }, { id: 'b' }], 'somewhere').id, 'a')
  assert.equal(bombDish([], 'somewhere'), null)
})

test('a standing bomb is the newest review with the bomb line that is not undone, in any order', () => {
  const older = { text: LINE, venueId: 'turks-kebab', at: '2026-11-08T10:00:00Z' }
  const newer = { text: LINE, venueId: 'moona-thai', at: '2026-11-08T11:00:00Z' }
  const other = { text: 'nice', venueId: 'x', at: '2026-11-08T12:00:00Z' }
  assert.equal(standingBomb([older, newer, other], LINE), newer)
  assert.equal(standingBomb([other, newer, older], LINE), newer, 'newest first, as a profile lists them')
  assert.equal(standingBomb([older, { ...newer, undone: true }], LINE), older, 'an undone bomb on top hides nothing')
  assert.equal(standingBomb([other], LINE), null)
})

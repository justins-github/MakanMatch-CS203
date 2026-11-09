import test from 'node:test'
import assert from 'node:assert/strict'
import { movesBetween } from './rankMoves.js'

const venues = (...ids) => ids.map((id) => ({ id }))

test('places new to the list, and places that moved, are marked', () => {
  const moves = movesBetween(['a', 'b', 'c', 'd'], venues('c', 'new', 'a', 'b'))
  assert.deepEqual(moves.get('new'), { kind: 'new' })
  assert.deepEqual(moves.get('c'), { kind: 'up', places: 2 })
  assert.deepEqual(moves.get('a'), { kind: 'down', places: 2 })
  assert.deepEqual(moves.get('b'), { kind: 'down', places: 2 })
})

test('a place that kept its spot is not marked', () => {
  const moves = movesBetween(['a', 'b'], venues('a', 'c'))
  assert.equal(moves.has('a'), false)
  assert.deepEqual(moves.get('c'), { kind: 'new' })
})

test('the same list twice marks nothing', () => {
  assert.equal(movesBetween(['a', 'b'], venues('a', 'b')).size, 0)
})

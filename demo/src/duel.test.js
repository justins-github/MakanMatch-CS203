import test from 'node:test'
import assert from 'node:assert/strict'
import { answerDuel, currentOpponent, startDuel } from './duel.js'

const NEW_DISH = 'new-dish'
const ranked = (n) => Array.from({ length: n }, (_, i) => ({ dishId: `d${i}`, name: `Dish ${i}` }))
const answer = (duel, ...answers) => answers.reduce((d, a) => answerDuel(d, NEW_DISH, a), duel)

test('the first question is against the middle of your ranking', () => {
  assert.equal(currentOpponent(startDuel(ranked(5))).dishId, 'd2')
})

test('winning narrows to the better half and records who won', () => {
  const duel = answer(startDuel(ranked(8)), 'won')
  assert.equal(currentOpponent(duel).dishId, 'd2')
  assert.deepEqual(duel.pairs, [{ winnerId: NEW_DISH, loserId: 'd4' }])
  assert.equal(duel.insertIndex, null, 'still asking')
})

test('losing narrows to the worse half and records who won', () => {
  const duel = answer(startDuel(ranked(8)), 'lost')
  assert.equal(currentOpponent(duel).dishId, 'd6')
  assert.deepEqual(duel.pairs, [{ winnerId: 'd4', loserId: NEW_DISH }])
})

test('it stops after three answers and says where the dish goes', () => {
  const duel = answer(startDuel(ranked(20)), 'won', 'won', 'lost')
  assert.equal(duel.pairs.length, 3)
  assert.equal(duel.insertIndex, 3)
})

test('it stops early once there is nothing left to compare', () => {
  const duel = answer(startDuel(ranked(1)), 'lost')
  assert.equal(duel.insertIndex, 1)
  assert.equal(duel.pairs.length, 1)
})

test('too close to call places the dish there and records no winner', () => {
  const duel = answer(startDuel(ranked(5)), 'tie')
  assert.equal(duel.insertIndex, 2)
  assert.deepEqual(duel.pairs, [])
})

test('the first question has nothing to go back to', () => {
  assert.equal(startDuel(ranked(5)).previous, null)
})

test('going back restores the question before the last answer, with its count', () => {
  const first = startDuel(ranked(20))
  const second = answer(first, 'won')
  const third = answer(second, 'lost')
  assert.equal(third.previous, second)
  assert.equal(third.previous.previous, first)
  assert.equal(third.previous.count, 1)
  assert.equal(currentOpponent(third.previous).dishId, currentOpponent(second).dishId)
})

test('going back from the final answer reopens that question', () => {
  const asked = answer(startDuel(ranked(20)), 'won', 'won')
  const finished = answer(asked, 'lost')
  assert.notEqual(finished.insertIndex, null)
  assert.equal(finished.previous, asked)
  assert.equal(finished.previous.insertIndex, null)
})

test('going back from too close to call reopens that question', () => {
  const start = startDuel(ranked(5))
  assert.equal(answer(start, 'tie').previous, start)
})

test('answering differently after going back replaces the old answer', () => {
  const start = startDuel(ranked(8))
  const changed = answer(answer(start, 'won').previous, 'lost')
  assert.deepEqual(changed.pairs, [{ winnerId: 'd4', loserId: NEW_DISH }])
  assert.equal(currentOpponent(changed).dishId, 'd6')
})

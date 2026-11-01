import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFloor, groupFind, groupSurprise, scoreGroup } from './groupMatch.js'

// A member as recommendationService hands them over: their own ranking of the same venues.
function member(id, scores, { adventurousness = 0.5, novelty = {} } = {}) {
  return {
    id,
    name: id.toUpperCase(),
    adventurousness,
    ranked: Object.entries(scores).map(([venueId, matchScore]) => ({
      id: venueId,
      name: `Venue ${venueId}`,
      matchScore,
      novelty: novelty[venueId] ?? 0.2,
      why: [`${id}'s reason`],
      confidence: 'medium',
    })),
  }
}

test('each place gets the average and the lowest score, best average first', () => {
  const scored = scoreGroup([member('you', { a: 90, b: 70 }), member('jh', { a: 80, b: 76 })])
  assert.deepEqual(scored.map((s) => [s.venue.id, s.average, s.lowest]), [['a', 85, 80], ['b', 73, 70]])
  assert.deepEqual(scored[0].scores, [{ id: 'you', name: 'YOU', score: 90 }, { id: 'jh', name: 'JH', score: 80 }])
})

test('ties on the average go to the place whose unhappiest person is happier', () => {
  const scored = scoreGroup([member('you', { a: 90, b: 80 }), member('jh', { a: 70, b: 80 })])
  assert.deepEqual(scored.map((s) => s.venue.id), ['b', 'a'])
})

test('the floor stays at 75 when three or more places clear it', () => {
  const scored = scoreGroup([member('you', { a: 90, b: 85, c: 80, d: 60 }), member('jh', { a: 80, b: 76, c: 75, d: 99 })])
  const { passing, floor } = applyFloor(scored)
  assert.equal(floor, 75)
  assert.deepEqual(passing.map((s) => s.venue.id), ['a', 'b', 'c'])
})

test('the floor drops 5 points at a time until three places pass', () => {
  const scored = scoreGroup([member('you', { a: 90, b: 70, c: 66, d: 40 }), member('jh', { a: 80, b: 80, c: 90, d: 99 })])
  const { passing, floor } = applyFloor(scored)
  assert.equal(floor, 65)
  assert.deepEqual(passing.map((s) => s.venue.id), ['a', 'c', 'b'])
})

test('the floor never goes below 50, even if that leaves fewer than three', () => {
  const scored = scoreGroup([member('you', { a: 60, b: 45, c: 30 }), member('jh', { a: 55, b: 99, c: 99 })])
  const { passing, floor } = applyFloor(scored)
  assert.equal(floor, 50)
  assert.deepEqual(passing.map((s) => s.venue.id), ['a'])
})

test('Find returns group cards: the average as the match, everyone\'s score, a fairness chip', () => {
  const result = groupFind([member('you', { a: 90, b: 85, c: 80 }), member('jh', { a: 80, b: 76, c: 75 })])
  assert.equal(result.floor, 75)
  assert.equal(result.relaxed, false)
  const [first] = result.venues
  assert.equal(first.id, 'a')
  assert.equal(first.matchScore, 85)
  assert.equal(first.lowest, 80)
  assert.deepEqual(first.groupScores.map((s) => s.score), [90, 80])
  assert.deepEqual(first.why, ['Nobody below 80%'])
})

test('Find says when it had to relax the floor', () => {
  const result = groupFind([member('you', { a: 90, b: 70, c: 66, d: 40 }), member('jh', { a: 80, b: 80, c: 90, d: 99 })])
  assert.equal(result.relaxed, true)
  assert.equal(result.floor, 65)
  assert.deepEqual(result.venues.map((v) => v.id), ['a', 'c', 'b'])
})

test('Find shows at most ten places', () => {
  const scores = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`v${i}`, 70 + i]))
  const members = [member('you', scores), member('jh', scores)]
  const result = groupFind(members)
  assert.equal(result.venues.length, 10)
  assert.equal(result.venues[0].id, 'v19')
  assert.equal(groupFind(members, { limit: 1 }).venues.length, 1)
})

test('Surprise picks something new to the group from the places that pass, skipping exclusions', () => {
  const members = [
    member('you', { a: 90, b: 82, c: 80 }, { novelty: { b: 0.9, c: 0.8 } }),
    member('jh', { a: 88, b: 80, c: 79 }, { novelty: { b: 0.9, c: 0.7 } }),
  ]
  const pick = groupSurprise(members)
  assert.equal(pick.venues.length, 1)
  assert.equal(pick.venues[0].id, 'b')
  assert.equal(pick.venues[0].experimental, true)
  assert.equal(groupSurprise(members, ['b']).venues[0].id, 'c')
  assert.deepEqual(groupSurprise(members, ['a', 'b', 'c']).venues, [])
})

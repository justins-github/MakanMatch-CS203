import test from 'node:test'
import assert from 'node:assert/strict'
import { claimVenueCheck } from './claimVenue.js'

const CLAIM = { venueId: 'turks-kebab', venueName: "Turk's Kebab" }
const TURKS = { id: 'turks-kebab', name: "Turk's Kebab", address: '81 Victoria St' }

test('while the place is being looked up, nothing is said yet', () => {
  assert.deepEqual(claimVenueCheck(CLAIM, null), { name: "Turk's Kebab", address: null, problem: null })
})

test('a claim whose name is the place it points at shows that place and its address', () => {
  assert.deepEqual(claimVenueCheck(CLAIM, { venue: TURKS }), { name: "Turk's Kebab", address: '81 Victoria St', problem: null })
  const typedLoosely = { ...CLAIM, venueName: "  turk's   KEBAB " }
  assert.equal(claimVenueCheck(typedLoosely, { venue: TURKS }).problem, null)
})

// The name on a claim is whatever the claimant sent. Approval goes by the id, so the
// admin has to see the place the id really is.
test('a claim naming one place but pointing at another is called out, under the real name', () => {
  const crafted = { venueId: 'turks-kebab', venueName: 'My Own Stall' }
  const check = claimVenueCheck(crafted, { venue: TURKS })
  assert.equal(check.name, "Turk's Kebab")
  assert.equal(check.address, '81 Victoria St')
  assert.match(check.problem, /My Own Stall/)
  assert.match(check.problem, /Turk's Kebab/)
})

test('a claim for a place we do not list, or one we could not look up, says so', () => {
  assert.match(claimVenueCheck(CLAIM, { missing: true }).problem, /isn't for any place we list/)
  assert.match(claimVenueCheck(CLAIM, { failed: true }).problem, /Couldn't check/)
  assert.equal(claimVenueCheck(CLAIM, { missing: true }).name, "Turk's Kebab")
})

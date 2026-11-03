import test from 'node:test'
import assert from 'node:assert/strict'
import { starterProfile } from './learn.js'
import { applySuggestion, suggestionFor, templateSummary } from './suggestion.js'

const SPICIER = { key: 'spice', direction: 'up', from: 0.5, to: 0.83, reviews: 5, headline: "You're eating spicier", label: 'Spice' }
const HEARTIER = { key: 'richness', direction: 'up', from: 0.5, to: 0.6, reviews: 5, headline: "You're going heartier", label: 'Richness' }
const THAI = { key: 'cuisine:thai', cuisine: 'thai', direction: 'up', from: 0.5, to: 0.62, reviews: 4, headline: "You're warming to Thai", label: 'Thai affinity' }
const CHEAPER = { key: 'price', direction: 'down', from: 1.4, to: 0.6, reviews: 4, headline: "You're going for cheaper", label: 'Price comfort' }

test('no trends, no suggestion', () => {
  assert.equal(suggestionFor([], []), null)
})

test('one more step is the trend\'s average move per review', () => {
  const s = suggestionFor([SPICIER, HEARTIER], [])
  assert.deepEqual(s.changes.map((c) => [c.key, c.step]), [['spice', 0.07], ['richness', 0.02]])
  assert.equal(s.changes[0].label, 'Spice')
})

test('a step is capped at 0.10 of the range (0.20 for price comfort)', () => {
  const fast = { ...SPICIER, from: 0.2, to: 0.9, reviews: 4 }
  assert.equal(suggestionFor([fast], []).changes[0].step, 0.1)
  assert.equal(suggestionFor([CHEAPER], []).changes[0].step, -0.2)
})

test('trends already accepted or dismissed are never suggested again', () => {
  const decided = [{ key: 'spice', direction: 'up', decision: 'dismissed' }]
  assert.deepEqual(suggestionFor([SPICIER, HEARTIER], decided).changes.map((c) => c.key), ['richness'])
  assert.equal(suggestionFor([SPICIER], [{ key: 'spice', direction: 'up', decision: 'accepted' }]), null)
  assert.ok(suggestionFor([{ ...SPICIER, direction: 'down' }], decided), 'the opposite direction is a new trend')
})

test('the signature names the trends, so a stale screen can\'t accept something else', () => {
  assert.equal(suggestionFor([SPICIER, HEARTIER], []).signature, 'spice:up|richness:up')
})

test('accepting moves each dimension one step and reports the changes', () => {
  const profile = { ...starterProfile(), spicePref: 0.83, richnessPref: 0.6 }
  const changes = applySuggestion(profile, suggestionFor([SPICIER, HEARTIER, THAI], []))
  assert.equal(profile.spicePref, 0.9)
  assert.equal(profile.richnessPref, 0.62)
  assert.equal(profile.cuisineAffinity.thai, 0.53)
  assert.deepEqual(changes[0], { key: 'spice', label: 'Spice', from: 0.83, to: 0.9 })
})

test('accepting never pushes past the ends of a range', () => {
  const profile = { ...starterProfile(), spicePref: 0.97, priceComfort: 0.1 }
  applySuggestion(profile, suggestionFor([SPICIER, CHEAPER], []))
  assert.equal(profile.spicePref, 1)
  assert.equal(profile.priceComfort, 0)
})

test('the template summary reads like a sentence', () => {
  assert.equal(templateSummary(suggestionFor([SPICIER], [])),
    "Lately you're eating spicier. Want your matches to lean that way a bit more?")
  assert.equal(templateSummary(suggestionFor([SPICIER, HEARTIER, THAI], [])),
    "Lately you're eating spicier, going heartier and warming to Thai. Want your matches to lean that way a bit more?")
})

test('a trend already at the end of its range has nothing to lean into', () => {
  assert.equal(suggestionFor([{ ...SPICIER, to: 1 }], []), null)
  assert.equal(suggestionFor([{ ...CHEAPER, to: 0 }], []), null)
  assert.deepEqual(suggestionFor([{ ...SPICIER, to: 1 }, HEARTIER], []).changes.map((c) => c.key), ['richness'])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSearchIndex, searchVenues } from './search.js'

function v(id, name, extra = {}) {
  return { id, name, cuisine: null, address: '', ...extra }
}

const VENUES = [
  v('turks', "Turk's Kebab", { cuisine: 'turkish', address: '35 Selegie Rd #01-C2 Parklane', area: 'Selegie' }),
  v('kebab-king', 'Kebab King', { address: 'Bugis St' }),
  v('smoke', 'Smokehouse Kitchen', { address: 'Orchard Rd' }),
  v('soto', 'Soto Corner', { area: 'Selegie', address: 'Selegie Rd coffeeshop' }),
  v('selegie-soto', 'Selegie Soto Bar', { address: 'Selegie Rd' }),
  v('cafe', 'Café Brera', { address: 'Armenian St' }),
  v('bedok-chwee', 'Bedok Chwee Kueh', { address: '208B New Upper Changi Rd' }),
  v('bedok-fish', 'Bedok Fish Soup', { address: '1 Bedok Rd' }),
]

const index = buildSearchIndex(VENUES)
const search = (q, opts = {}) => searchVenues(index, q, opts)

test('queries shorter than 2 normalized chars return nothing', () => {
  assert.deepEqual(search(''), [])
  assert.deepEqual(search('k'), [])
  assert.deepEqual(search('  k  '), [])
})

test('word-prefix match finds the venue and bolds the single matched instance', () => {
  const results = search('ke')
  const turks = results.find((r) => r.venue.id === 'turks')
  assert.ok(turks, "expected Turk's Kebab in results for 'ke'")
  // "Turk's Kebab" - the K of Kebab is at index 7; only that instance is bolded.
  assert.deepEqual(turks.highlight, [{ start: 7, len: 2 }])
})

test('full-name prefix beats word prefix beats mid-word substring', () => {
  const ids = search('ke').map((r) => r.venue.id)
  // Kebab King: prefix of whole name; Turk's Kebab: word-boundary; Smokehouse: substring.
  assert.ok(ids.indexOf('kebab-king') < ids.indexOf('turks'))
  assert.ok(ids.indexOf('turks') < ids.indexOf('smoke'))
})

test('AND semantics: every typed word must match, more words narrow results', () => {
  assert.ok(search('bedok').length >= 2)
  const narrowed = search('bedok chwee')
  assert.equal(narrowed.length, 1)
  assert.equal(narrowed[0].venue.id, 'bedok-chwee')
  assert.equal(search('turk pizza').length, 0)
})

test('metadata (area/address) matches count but rank below name matches and add no highlight', () => {
  const results = search('selegie')
  const ids = results.map((r) => r.venue.id)
  assert.ok(ids.includes('soto'), 'area match should surface Soto Corner')
  assert.ok(ids.indexOf('selegie-soto') < ids.indexOf('soto'), 'name match ranks above area match')
  const soto = results.find((r) => r.venue.id === 'soto')
  assert.deepEqual(soto.highlight, [])
})

test('diacritics fold: "cafe" matches Café and the highlight covers the accented text', () => {
  const results = search('cafe')
  const cafe = results.find((r) => r.venue.id === 'cafe')
  assert.ok(cafe)
  assert.deepEqual(cafe.highlight, [{ start: 0, len: 4 }])
})

test('scoreFn breaks ties between equally good text matches', () => {
  const scores = { 'bedok-chwee': 90, 'bedok-fish': 60 }
  const hi = search('bedok', { scoreFn: (venue) => scores[venue.id] ?? 0 })
  assert.equal(hi[0].venue.id, 'bedok-chwee')
  const flipped = search('bedok', { scoreFn: (venue) => 100 - (scores[venue.id] ?? 0) })
  assert.equal(flipped[0].venue.id, 'bedok-fish')
})

test('limit caps the result count', () => {
  const many = buildSearchIndex(
    Array.from({ length: 30 }, (_, i) => v('m' + i, `Makan Place ${i}`)),
  )
  assert.equal(searchVenues(many, 'makan', { limit: 8 }).length, 8)
})

test('repeated query words do not produce duplicate highlight ranges', () => {
  const results = search('ke ke')
  const turks = results.find((r) => r.venue.id === 'turks')
  assert.ok(turks)
  assert.deepEqual(turks.highlight, [{ start: 7, len: 2 }])
})

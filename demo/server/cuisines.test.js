import test from 'node:test'
import assert from 'node:assert/strict'
import { describeVenue } from './cuisines.js'

const row = (overrides = {}) => ({
  name: 'Turk\'s Kebab',
  categoryPrimary: 'doner_kebab_restaurant',
  categoryPath: ['food_and_drink', 'restaurant', 'middle_eastern_restaurant', 'turkish_restaurant', 'doner_kebab_restaurant'],
  categoriesAlternate: null,
  ...overrides,
})

test('describeVenue joins the name with humanised categories', () => {
  const text = describeVenue(row())
  assert.match(text, /^Turk's Kebab\./)
  assert.match(text, /middle eastern/)
  assert.match(text, /doner kebab/)
  assert.doesNotMatch(text, /food_and_drink|_/)
})

test('describeVenue strips a leading block number but keeps numbers inside names', () => {
  assert.match(describeVenue(row({ name: '618 Hokkien Mee' })), /^Hokkien Mee\./)
  assert.match(describeVenue(row({ name: 'Big 5 Kitchen' })), /^Big 5 Kitchen\./)
})

test('describeVenue appends a dish gloss for known cuisine categories', () => {
  const text = describeVenue(row({
    name: 'Sungei Road',
    categoryPrimary: 'malaysian_restaurant',
    categoryPath: ['food_and_drink', 'restaurant', 'malaysian_restaurant'],
  }))
  assert.match(text, /laksa/)
})

test('describeVenue includes alternate categories once', () => {
  const text = describeVenue(row({ categoriesAlternate: ['turkish_restaurant', 'moroccan_restaurant'] }))
  assert.match(text, /moroccan/)
  assert.equal(text.match(/turkish/g).length, 1)
})

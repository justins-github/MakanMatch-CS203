import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDietary, dietFor, isHalal, isMeatOnly, isVegetarianFriendly, vegetarianBoost } from './dietary.js'

const venue = (overrides) => ({ id: overrides.name, cuisine: null, category: 'restaurant', ...overrides })

test('halal means tagged halal: the category or the name says so', () => {
  assert.equal(isHalal(venue({ name: 'Al Baik Western', category: 'halal_restaurant' })), true)
  assert.equal(isHalal(venue({ name: 'Bismillah Halal Biryani' })), true)
  assert.equal(isHalal(venue({ name: 'Zam Zam Muslim Food' })), true)
  // Usually halal is not enough for a religious rule.
  assert.equal(isHalal(venue({ name: 'Warung Makan', cuisine: 'malay', category: 'malaysian_restaurant' })), false)
})

test('meat-only places are found by category and, for generic ones, by name', () => {
  assert.equal(isMeatOnly(venue({ name: 'Wooloomooloo', category: 'steakhouse' })), true)
  assert.equal(isMeatOnly(venue({ name: "Turk's Kebab", category: 'doner_kebab' })), true)
  assert.equal(isMeatOnly(venue({ name: 'Tian Tian Chicken Rice', category: 'chinese_restaurant' })), true)
  assert.equal(isMeatOnly(venue({ name: 'Song Fa Bak Kut Teh' })), true)
  assert.equal(isMeatOnly(venue({ name: 'Komala Vilas', category: 'indian_restaurant' })), false)
})

test('a vegetarian place is never meat-only, even with a meaty-sounding name', () => {
  const mockDuck = venue({ name: 'Mock Duck Vegetarian Kitchen', category: 'vegetarian_restaurant' })
  assert.equal(isVegetarianFriendly(mockDuck), true)
  assert.equal(isMeatOnly(mockDuck), false)
  assert.equal(isVegetarianFriendly(venue({ name: '素食 Kitchen' })), true)
  assert.equal(isVegetarianFriendly(venue({ name: 'Real Food', cuisine: 'vegetarian' })), true)
})

test('dietFor turns restriction lists into the two dealbreakers we can check', () => {
  assert.deepEqual(dietFor([['HALAL'], ['NUT_ALLERGY']]), { halal: true, vegetarian: false })
  assert.deepEqual(dietFor([[], ['VEGAN']]), { halal: false, vegetarian: true })
  assert.deepEqual(dietFor([[], undefined, null]), { halal: false, vegetarian: false })
})

test('applyDietary keeps only what suits everyone and counts what it left out', () => {
  const venues = [
    venue({ name: 'Al Baik', category: 'halal_restaurant' }),
    venue({ name: 'Halal Steak House', category: 'steakhouse' }),
    venue({ name: 'Komala Vilas', category: 'indian_restaurant' }),
  ]
  assert.deepEqual(applyDietary(venues, [['HALAL']]).allowed.map((v) => v.name), ['Al Baik', 'Halal Steak House'])
  assert.deepEqual(applyDietary(venues, [['VEGETARIAN']]).allowed.map((v) => v.name), ['Al Baik', 'Komala Vilas'])

  const both = applyDietary(venues, [['HALAL'], ['VEGETARIAN']])
  assert.deepEqual(both.allowed.map((v) => v.name), ['Al Baik'])
  assert.equal(both.dropped, 2)

  const none = applyDietary(venues, [[], ['NUT_ALLERGY']])
  assert.equal(none.allowed, venues)
  assert.equal(none.dropped, 0)
})

test('vegetarians get a small boost at vegetarian places, capped at 99', () => {
  const veg = venue({ name: 'Greendot', category: 'vegetarian_restaurant' })
  const other = venue({ name: 'Komala Vilas', category: 'indian_restaurant' })
  assert.equal(vegetarianBoost(veg, 70, ['VEGETARIAN']), 78)
  assert.equal(vegetarianBoost(veg, 95, ['VEGAN']), 99)
  assert.equal(vegetarianBoost(other, 70, ['VEGETARIAN']), 70)
  assert.equal(vegetarianBoost(veg, 70, []), 70)
})

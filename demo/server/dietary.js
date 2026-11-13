// Dietary dealbreakers: what we can check against venue data. Restrictions come
// from each person's profile in account-service (DietaryNeeds.Restriction names).
// Only halal and vegetarian are checkable today; allergies, no pork etc. need
// menu data we don't have yet.

// Halal is a religious rule, so only venues our data tags halal count: the
// place's category, its name, or the `halal` tag on the venues we entered by hand.
const HALAL_NAME = /\bhalal\b|\bmuslim\b/i

const VEGETARIAN_CATEGORIES = new Set(['vegetarian_restaurant', 'vegan_restaurant'])
const VEGETARIAN_NAME = /vegetarian|\bvegan\b|\bveggie\b|素/i

// Places a vegetarian can't really eat at. Generic categories ("restaurant",
// "chinese_restaurant") are judged by name instead.
const MEAT_ONLY_CATEGORIES = new Set([
  'steakhouse',
  'barbecue_restaurant',
  'chicken_restaurant',
  'chicken_wings_restaurant',
  'seafood_restaurant',
  'fish_and_chips_restaurant',
  'doner_kebab',
  'hot_dog_restaurant',
  'sushi_restaurant',
])
const MEAT_ONLY_NAME = new RegExp(
  [
    'chicken rice', 'bak kut teh', 'roast(ed)? (duck|meat|pork)', 'duck rice', 'char siu', 'steak',
    'bbq', 'barbecue', 'satay', 'kebab', 'shawarma', 'seafood', 'crab', 'lobster', 'oyster',
    'fish soup', 'sliced fish', 'wings', 'yakiniku', 'yakitori', 'beef noodles?', 'mutton', 'kambing',
  ].map((word) => `\\b${word}\\b`).join('|'),
  'i',
)

const VEGETARIAN_BOOST = 8

export const isHalal = (venue) =>
  venue.category === 'halal_restaurant' || HALAL_NAME.test(venue.name ?? '') || (venue.tags ?? []).includes('halal')

export const isVegetarianFriendly = (venue) =>
  VEGETARIAN_CATEGORIES.has(venue.category) || venue.cuisine === 'vegetarian' || VEGETARIAN_NAME.test(venue.name ?? '')

export const isMeatOnly = (venue) =>
  !isVegetarianFriendly(venue) &&
  (MEAT_ONLY_CATEGORIES.has(venue.category) || venue.cuisine === 'chicken-rice' || MEAT_ONLY_NAME.test(venue.name ?? ''))

const vegetarianNeed = (restrictions) => restrictions.includes('VEGETARIAN') || restrictions.includes('VEGAN')

// One restriction list per person -> the dealbreakers the whole table shares.
export function dietFor(restrictionLists) {
  const all = restrictionLists.flatMap((list) => list ?? [])
  return { halal: all.includes('HALAL'), vegetarian: vegetarianNeed(all) }
}

// Venues that suit everyone, and how many were left out for it.
export function applyDietary(venues, restrictionLists) {
  const diet = dietFor(restrictionLists)
  if (!diet.halal && !diet.vegetarian) return { allowed: venues, dropped: 0 }
  const allowed = venues.filter((v) => (!diet.halal || isHalal(v)) && (!diet.vegetarian || !isMeatOnly(v)))
  return { allowed, dropped: venues.length - allowed.length }
}

// A vegetarian's score for a vegetarian place goes up a little.
export function vegetarianBoost(venue, score, restrictions = []) {
  if (!vegetarianNeed(restrictions ?? []) || !isVegetarianFriendly(venue)) return score
  return Math.min(99, score + VEGETARIAN_BOOST)
}

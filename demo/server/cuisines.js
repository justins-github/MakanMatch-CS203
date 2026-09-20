// Maps Overture's category taxonomy to the app's cuisine keys.

const CUISINE_BY_CATEGORY = {
  chinese_restaurant: 'chinese',
  cantonese_restaurant: 'chinese',
  szechuan_restaurant: 'chinese',
  teochew_restaurant: 'chinese',
  hong_kong_style_restaurant: 'chinese',
  dim_sum_restaurant: 'chinese',
  noodle_house: 'chinese',
  hainan_restaurant: 'chicken-rice',
  hainanese_restaurant: 'chicken-rice',
  malay_restaurant: 'malay',
  indonesian_restaurant: 'indonesian',
  indian_restaurant: 'indian',
  north_indian_restaurant: 'indian',
  south_indian_restaurant: 'indian',
  thai_restaurant: 'thai',
  vietnamese_restaurant: 'vietnamese',
  burmese_restaurant: 'burmese',
  japanese_restaurant: 'japanese',
  sushi_restaurant: 'japanese',
  ramen_restaurant: 'japanese',
  korean_restaurant: 'korean',
  turkish_restaurant: 'turkish',
  doner_kebab_restaurant: 'turkish',
  middle_eastern_restaurant: 'middle-eastern',
  lebanese_restaurant: 'middle-eastern',
  ethiopian_restaurant: 'ethiopian',
  italian_restaurant: 'italian',
  pizza_restaurant: 'italian',
  french_restaurant: 'french',
  spanish_restaurant: 'spanish',
  mexican_restaurant: 'mexican',
  american_restaurant: 'western',
  steakhouse: 'western',
  burger_restaurant: 'western',
  seafood_restaurant: 'seafood',
  vegetarian_restaurant: 'vegetarian',
  vegan_restaurant: 'vegetarian',
  fast_food_restaurant: 'fast-food',
  cafe: 'cafe',
  coffee_shop: 'cafe',
  bakery: 'bakery',
  bakeries: 'bakery',
  dessert_shop: 'dessert',
  desserts: 'dessert',
  ice_cream_shop: 'dessert',
  shaved_ice_shop: 'dessert',
  bubble_tea_shop: 'dessert',
  juice_bar: 'dessert',
  peranakan_restaurant: 'peranakan',
}

// Walks the category path leaf-first; unmapped categories return null.
export function cuisineForCategories(categoryPrimary, categoryPath = []) {
  const leafFirst = [categoryPrimary, ...[...(categoryPath ?? [])].reverse()]
  for (const cat of leafFirst) {
    if (cat && CUISINE_BY_CATEGORY[cat]) return CUISINE_BY_CATEGORY[cat]
  }
  return null
}

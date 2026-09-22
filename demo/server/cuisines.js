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

// Dish words the embedding model would not otherwise associate with a category.
const CUISINE_GLOSS = {
  malaysian_restaurant: 'laksa, nasi lemak, mee rebus, mee siam',
  malay_restaurant: 'nasi lemak, mee rebus, satay, rendang',
  singaporean_restaurant: 'chicken rice, laksa, chilli crab, char kway teow',
  peranakan_restaurant: 'nyonya laksa, ayam buah keluak, kueh',
  hainan_restaurant: 'hainanese chicken rice',
  hainanese_restaurant: 'hainanese chicken rice',
  indonesian_restaurant: 'ayam penyet, nasi padang, sambal',
  thai_restaurant: 'tom yum, green curry, pad thai, spicy',
  vietnamese_restaurant: 'pho, banh mi, spring rolls',
  chinese_restaurant: 'noodles, rice, dim sum, zi char',
  cantonese_restaurant: 'dim sum, roast meats, wonton noodles',
  teochew_restaurant: 'porridge, fish, kway teow',
  szechuan_restaurant: 'mala, spicy, hotpot',
  hot_pot_restaurant: 'hotpot, steamboat, mala soup',
  noodle_house: 'noodles, soup',
  noodles_restaurant: 'noodles, soup',
  dim_sum_restaurant: 'dim sum, bao, siew mai',
  indian_restaurant: 'curry, roti prata, biryani, naan',
  north_indian_restaurant: 'butter chicken, naan, tandoori',
  south_indian_restaurant: 'thosai, roti prata, vadai',
  japanese_restaurant: 'sushi, ramen, donburi',
  sushi_restaurant: 'sushi, sashimi, omakase',
  ramen_restaurant: 'ramen, noodle soup',
  korean_restaurant: 'kimchi, bbq, bibimbap, spicy',
  turkish_restaurant: 'kebab, doner, pide',
  doner_kebab_restaurant: 'doner kebab wrap',
  middle_eastern_restaurant: 'kebab, hummus, shawarma',
  italian_restaurant: 'pasta, pizza',
  pizza_restaurant: 'pizza',
  american_restaurant: 'burgers, fries, steak',
  burger_restaurant: 'burgers, fries',
  steakhouse: 'steak, grill',
  seafood_restaurant: 'seafood, fish, crab, prawns',
  vegetarian_restaurant: 'vegetarian, light, vegetables',
  vegan_restaurant: 'vegan, plant-based, light',
  salad_bar: 'salad, light, fresh',
  fast_food_restaurant: 'fast food',
  food_truck: 'hawker stall',
  food_truck_stand: 'hawker stall',
  cafe: 'coffee, brunch, cakes',
  coffee_shop: 'coffee, toast',
  bakery: 'bread, pastries',
  dessert_shop: 'desserts, sweets',
  desserts: 'desserts, sweets',
  ice_cream_shop: 'ice cream',
  bubble_tea_shop: 'bubble tea, boba',
  bubble_tea: 'bubble tea, boba',
  soup_restaurant: 'soup',
}

const humanise = (cat) => cat.replace(/_restaurant$/, '').replace(/_/g, ' ')

// One sentence per venue for embedding: name, categories, dish gloss.
export function describeVenue(row) {
  const name = row.name.replace(/^\d+[A-Za-z]?\s+/, '')
  const cats = [...new Set([...(row.categoryPath ?? []), ...(row.categoriesAlternate ?? []), row.categoryPrimary])]
    .filter((c) => c && c !== 'food_and_drink')
  const words = [...new Set(cats.map(humanise))]
  const gloss = [...new Set(cats.map((c) => CUISINE_GLOSS[c]).filter(Boolean))]
  return `${name}. ${[...words, ...gloss].join(', ')}.`
}

// Walks the category path leaf-first; unmapped categories return null.
export function cuisineForCategories(categoryPrimary, categoryPath = []) {
  const leafFirst = [categoryPrimary, ...[...(categoryPath ?? [])].reverse()]
  for (const cat of leafFirst) {
    if (cat && CUISINE_BY_CATEGORY[cat]) return CUISINE_BY_CATEGORY[cat]
  }
  return null
}

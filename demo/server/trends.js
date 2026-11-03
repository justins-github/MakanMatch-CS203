// Trends in a user's Taste DNA (CSD-55): which dimensions have been moving steadily
// one way over their recent reviews ("you're eating spicier"). Plain code, no AI.
// The series is the profile just before each recent review (stored since CSD-54)
// plus the profile now, so it sees every review even when several share a day.

export const TREND_WINDOW = 8 // most recent reviews looked at
const MIN_REVIEWS = 4 // fewer than this is too early to call
const MIN_MOVES = 3 // a trend needs at least this many reviews that moved it
const MIN_SHARE = 0.75 // of those moves, at least this share must go the same way
const MIN_CHANGE = 0.06 // net change, as a share of the dimension's range
const MOVE_EPS = 0.005 // smaller steps don't count as a move
const MAX_TRENDS = 3
const CUISINE_DEFAULT = 0.3 // what learn.js assumes for a cuisine not yet in the profile

const DIMENSIONS = [
  { key: 'spice', label: 'Spice', get: (p) => p.spicePref, up: "You're eating spicier", down: "You're going milder" },
  { key: 'richness', label: 'Richness', get: (p) => p.richnessPref, up: "You're going heartier", down: "You're going lighter" },
  { key: 'price', label: 'Price comfort', get: (p) => p.priceComfort, range: 2, up: "You're happier paying more", down: "You're going for cheaper" },
  { key: 'adventurousness', label: 'Adventurousness', get: (p) => p.adventurousness, up: "You're getting more adventurous", down: "You're sticking to what you know" },
]

// Cuisines that read as a kind of food rather than a nationality stay lower-case.
const FOOD_NAMES = {
  'chicken-rice': 'chicken rice', bakery: 'bakeries', cafe: 'cafes', dessert: 'desserts',
  'fast-food': 'fast food', seafood: 'seafood', vegetarian: 'vegetarian food',
}
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const cuisineName = (c) => FOOD_NAMES[c] ?? c.split('-').map(capitalise).join(' ')

// A cuisine has a neutral point: "It was fine" pulls affinity toward 0.5 from either
// side, so "warming to" needs it above that and "going off" below it.
const CUISINE_NEUTRAL = 0.5

function cuisineDimension(cuisine) {
  const name = cuisineName(cuisine)
  return {
    key: `cuisine:${cuisine}`,
    cuisine,
    neutral: CUISINE_NEUTRAL,
    label: `${capitalise(name)} affinity`,
    get: (p) => p.cuisineAffinity?.[cuisine] ?? CUISINE_DEFAULT,
    up: `You're warming to ${name}`,
    down: `You're going off ${name}`,
  }
}

const round2 = (v) => Math.round(v * 100) / 100

// The profile before each review in the unbroken recent run that has one, then now.
// Undone reviews are skipped: the next review's before-profile is already the one
// the undo restored, so the series stays exact.
export function profileSeries(reviews, current) {
  const run = []
  for (let i = reviews.length - 1; i >= 0 && run.length < TREND_WINDOW; i--) {
    if (reviews[i].undone) continue
    if (!reviews[i].profileBefore) break
    run.unshift(reviews[i].profileBefore)
  }
  return [...run, current]
}

// One dimension's trend over the series, or null.
function trendOf(dimension, points) {
  const range = dimension.range ?? 1
  const values = points.map(dimension.get)
  const steps = values.slice(1).map((v, i) => (v - values[i]) / range)
  const moves = steps.filter((d) => Math.abs(d) >= MOVE_EPS)
  const net = (values.at(-1) - values[0]) / range
  if (moves.length < MIN_MOVES || Math.abs(net) < MIN_CHANGE) return null
  const sign = Math.sign(net)
  if (moves.filter((d) => Math.sign(d) === sign).length / moves.length < MIN_SHARE) return null
  if (dimension.neutral != null && (sign > 0 ? values.at(-1) <= dimension.neutral : values.at(-1) >= dimension.neutral)) return null
  const start = steps.findIndex((d) => Math.sign(d) === sign && Math.abs(d) >= MOVE_EPS)
  return {
    key: dimension.key,
    ...(dimension.cuisine ? { cuisine: dimension.cuisine } : {}),
    direction: sign > 0 ? 'up' : 'down',
    from: round2(values[start]),
    to: round2(values.at(-1)),
    reviews: steps.length - start,
    headline: sign > 0 ? dimension.up : dimension.down,
    label: dimension.label,
    size: Math.abs(net),
  }
}

// Steady trends in a series of profiles (oldest first), biggest first, at most three.
export function trendsIn(points) {
  const recent = points.slice(-(TREND_WINDOW + 1))
  if (recent.length - 1 < MIN_REVIEWS) return []
  const cuisines = new Set(recent.flatMap((p) => Object.keys(p.cuisineAffinity ?? {})))
  return [...DIMENSIONS, ...[...cuisines].map(cuisineDimension)]
    .map((dimension) => trendOf(dimension, recent))
    .filter(Boolean)
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_TRENDS)
    .map(({ size, ...trend }) => trend)
}

export const findTrends = (reviews, current) => trendsIn(profileSeries(reviews, current))

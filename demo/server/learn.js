// Taste-learning engine: the profile starts as DEMO_USER and every review nudges it.
// Three channels: sentiment, duels, and review text (see reviewText.js).

import { DEMO_USER } from './match.js'
import { matchSignals, countEvidence } from './reviewText.js'

const ALPHA = 0.25 // sentiment learning rate
const DUEL_ALPHA = 0.12 // per-duel nudge toward the winner
const TEXT_BASE = 0.03 // per-signal text nudge, scaled by evidence
const DELTA_MIN = 0.0049 // smallest change worth reporting

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const round1 = (v) => Math.round(v * 10) / 10
const round2 = (v) => Math.round(v * 100) / 100

export const REVIEW_TAGS = ['too-spicy', 'too-heavy', 'worth-it', 'too-pricey']
export const SENTIMENTS = ['loved', 'fine', 'disliked']
const SENTIMENT_RATING = { loved: 5, fine: 3, disliked: 1 }
const SENTIMENT_ANCHOR = { loved: 8.5, fine: 5.5, disliked: 2.5 }

let state
export function resetState() {
  state = {
    profile: structuredClone(DEMO_USER),
    reviews: [],
    rankings: [], // dish ids, best first
    userDishes: [],
  }
  return state
}
resetState()

export function getProfile() {
  return state.profile
}

export function getReviews() {
  return state.reviews
}

export function getRankings() {
  return state.rankings
}

export function getUserDishes() {
  return state.userDishes
}

export function getAccuracy() {
  const errors = state.reviews.map((r) => Math.abs(r.predicted - r.actual))
  const count = errors.length
  const running = count
    ? Math.round(100 - errors.reduce((a, b) => a + b, 0) / count)
    : null
  return { running, count }
}

export function addUserDish({ venueId, name, price }) {
  const dish = {
    id: 'user-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + state.userDishes.length,
    venueId,
    name,
    price: Number(price) || 0,
    priceTier: price >= 12 ? 2 : price > 6 ? 1 : 0,
    // unknown taste features start neutral
    spice: 0.5,
    richness: 0.5,
    novelty: 0.6,
    tags: ['user-added'],
    userCreated: true,
  }
  state.userDishes.push(dish)
  return dish
}

// Predicts how much the user will like a dish (0-100) from the profile alone.
export function predictDishScore(dish, cuisine, profile) {
  let score = 50
  score += 25 * (profile.cuisineAffinity[cuisine] ?? 0.3)
  score += 15 * (1 - Math.abs(dish.spice - profile.spicePref))
  score += 10 * (1 - Math.abs(dish.richness - profile.richnessPref))
  score -= 8 * Math.max(0, dish.priceTier - profile.priceComfort)
  return Math.round(Math.min(99, Math.max(5, score)))
}

// Beli-style 1-10 score: positional within the ranked list, anchored by the sentiment.
export function scoreFromRank(index, total, sentiment) {
  const anchor = SENTIMENT_ANCHOR[sentiment]
  if (total <= 1) return round1(anchor)
  const span = 6.5 * Math.min((total - 1) / 9, 1) // full spread from 10 dishes up
  const positional = 9.5 - (index * span) / (total - 1)
  return round1(Math.min(10, Math.max(1, 0.7 * positional + 0.3 * anchor)))
}

// Merges changes per dimension so each shows as one delta.
function makeToucher() {
  const touched = new Map()
  const touch = (key, label, from, to, reason) => {
    if (!touched.has(key)) touched.set(key, { label, from, reasons: [] })
    const entry = touched.get(key)
    entry.to = to
    entry.reasons.push(reason)
  }
  const deltas = () => {
    const out = []
    for (const { label, from, to, reasons } of touched.values()) {
      if (Math.abs(to - from) < DELTA_MIN) continue
      out.push({ dimension: label, from: round2(from), to: round2(to), reason: reasons.join('; ') })
    }
    return out
  }
  return { touch, deltas }
}

// Nudges the profile from a 1-5 rating and optional tags.
function collectRatingNudges(profile, dish, cuisine, rating, tags, touch) {
  const signal = (rating - 3) / 2 // -1 .. +1

  if (cuisine != null) {
    const from = profile.cuisineAffinity[cuisine] ?? 0.3
    const target = clamp01(0.5 + signal * 0.5)
    const to = clamp01(from + ALPHA * (target - from))
    profile.cuisineAffinity[cuisine] = to
    touch('affinity-' + cuisine, `${cuisine.replace(/-/g, ' ')} affinity`, from, to,
      `${rating}★ on a ${cuisine.replace(/-/g, ' ')} dish`)
  }

  if (signal !== 0) {
    const sp = profile.spicePref
    const spTo = clamp01(sp + ALPHA * signal * (dish.spice - sp))
    if (spTo !== sp) {
      profile.spicePref = spTo
      touch('spice', 'Spice', sp, spTo,
        signal > 0
          ? `you enjoyed something ${dish.spice > sp ? 'spicier' : 'milder'} than your usual`
          : `you disliked something ${dish.spice > sp ? 'spicier' : 'milder'} than your usual`)
    }
    const ri = profile.richnessPref
    const riTo = clamp01(ri + ALPHA * signal * (dish.richness - ri))
    if (riTo !== ri) {
      profile.richnessPref = riTo
      touch('richness', 'Richness', ri, riTo,
        signal > 0
          ? `you enjoyed something ${dish.richness > ri ? 'heartier' : 'lighter'} than your usual`
          : `you disliked something ${dish.richness > ri ? 'heartier' : 'lighter'} than your usual`)
    }
  }

  if (dish.novelty >= 0.7 && signal !== 0) {
    const from = profile.adventurousness
    const to = clamp01(from + ALPHA * signal * 0.4)
    profile.adventurousness = to
    touch('adventurousness', 'Adventurousness', from, to, `${rating}★ on a high-novelty dish`)
  }

  if (dish.priceTier > profile.priceComfort && signal !== 0) {
    const from = profile.priceComfort
    const to = Math.min(2, Math.max(0, from + 0.2 * signal))
    profile.priceComfort = to
    touch('price', 'Price comfort', from, to,
      signal > 0 ? 'you happily paid above your usual' : 'a pricey dish disappointed')
  }

  for (const tag of tags) {
    if (tag === 'too-spicy') {
      const from = profile.spicePref
      profile.spicePref = clamp01(from - 0.12)
      touch('spice', 'Spice', from, profile.spicePref, 'tagged "too spicy"')
    } else if (tag === 'too-heavy') {
      const from = profile.richnessPref
      profile.richnessPref = clamp01(from - 0.12)
      touch('richness', 'Richness', from, profile.richnessPref, 'tagged "too heavy"')
    } else if (tag === 'worth-it') {
      const from = profile.priceComfort
      profile.priceComfort = Math.min(2, from + 0.15)
      touch('price', 'Price comfort', from, profile.priceComfort, 'tagged "worth every cent"')
    } else if (tag === 'too-pricey') {
      const from = profile.priceComfort
      profile.priceComfort = Math.max(0, from - 0.15)
      touch('price', 'Price comfort', from, profile.priceComfort, 'tagged "too pricey"')
    }
  }
}

// Pulls the profile toward each duel winner's features.
function collectDuelNudges(profile, duels, touch) {
  for (const { winner, loser } of duels) {
    const reason = `you preferred ${winner.name} over ${loser.name}`

    const sp = profile.spicePref
    const spTo = clamp01(sp + DUEL_ALPHA * (winner.spice - loser.spice))
    if (spTo !== sp) {
      profile.spicePref = spTo
      touch('spice', 'Spice', sp, spTo, reason)
    }

    const ri = profile.richnessPref
    const riTo = clamp01(ri + DUEL_ALPHA * (winner.richness - loser.richness))
    if (riTo !== ri) {
      profile.richnessPref = riTo
      touch('richness', 'Richness', ri, riTo, reason)
    }

    const adv = profile.adventurousness
    const advTo = clamp01(adv + DUEL_ALPHA * (winner.novelty - loser.novelty))
    if (advTo !== adv) {
      profile.adventurousness = advTo
      touch('adventurousness', 'Adventurousness', adv, advTo, reason)
    }

    if (winner.cuisine != null && loser.cuisine != null && winner.cuisine !== loser.cuisine) {
      const wFrom = profile.cuisineAffinity[winner.cuisine] ?? 0.3
      profile.cuisineAffinity[winner.cuisine] = clamp01(wFrom + 0.03)
      touch('affinity-' + winner.cuisine, `${winner.cuisine.replace(/-/g, ' ')} affinity`,
        wFrom, profile.cuisineAffinity[winner.cuisine], reason)
      const lFrom = profile.cuisineAffinity[loser.cuisine] ?? 0.3
      profile.cuisineAffinity[loser.cuisine] = clamp01(lFrom - 0.03)
      touch('affinity-' + loser.cuisine, `${loser.cuisine.replace(/-/g, ' ')} affinity`,
        lFrom, profile.cuisineAffinity[loser.cuisine], reason)
    }
  }
}

// Nudges from review text; signals repeated across past reviews compound.
function collectTextNudges(profile, text, touch) {
  if (!text) return
  const corpus = state.reviews.map((r) => r.text).filter(Boolean)
  for (const sig of matchSignals(text)) {
    const n = countEvidence(corpus, sig) + 1 // + this review
    const mag = TEXT_BASE * Math.min(n, 10) * sig.dir
    const reason = n === 1
      ? `your review mentions ${sig.label}`
      : `${n} of your reviews mention ${sig.label}`
    if (sig.dim === 'spice') {
      const from = profile.spicePref
      profile.spicePref = clamp01(from + mag)
      touch('spice', 'Spice', from, profile.spicePref, reason)
    } else if (sig.dim === 'richness') {
      const from = profile.richnessPref
      profile.richnessPref = clamp01(from + mag)
      touch('richness', 'Richness', from, profile.richnessPref, reason)
    } else if (sig.dim === 'price') {
      const from = profile.priceComfort
      profile.priceComfort = Math.min(2, Math.max(0, from + mag * 1.5))
      touch('price', 'Price comfort', from, profile.priceComfort, reason)
    } else if (sig.dim === 'adventure') {
      const from = profile.adventurousness
      profile.adventurousness = clamp01(from + mag)
      touch('adventurousness', 'Adventurousness', from, profile.adventurousness, reason)
    }
  }
}

// Star-rating entry point.
export function applyReview(dish, venue, rating, tags = []) {
  const profile = state.profile
  const predicted = predictDishScore(dish, venue.cuisine, profile)
  const actual = Math.round(((rating - 1) / 4) * 100)

  const { touch, deltas } = makeToucher()
  collectRatingNudges(profile, dish, venue.cuisine, rating, tags, touch)

  state.reviews.push({
    dishId: dish.id, rating, tags, predicted, actual, at: new Date().toISOString(),
  })

  return {
    deltas: deltas(),
    prediction: { predicted, actual },
    accuracy: getAccuracy(),
    profile,
  }
}

// Beli-style entry point; duels arrive resolved as { winner, loser } dishes with cuisine.
export function applyBeliReview(dish, venue, { sentiment, duels = [], insertIndex = 0, text = '' }) {
  if (!SENTIMENTS.includes(sentiment)) throw new Error(`invalid sentiment "${sentiment}"`)
  const profile = state.profile
  const predicted = predictDishScore(dish, venue.cuisine, profile)

  const { touch, deltas } = makeToucher()
  collectRatingNudges(profile, dish, venue.cuisine, SENTIMENT_RATING[sentiment], [], touch)
  collectDuelNudges(profile, duels, touch)
  collectTextNudges(profile, text, touch)

  // Re-reviewing moves the dish rather than duplicating it.
  state.rankings = state.rankings.filter((id) => id !== dish.id)
  const index = Math.min(Math.max(0, insertIndex), state.rankings.length)
  state.rankings.splice(index, 0, dish.id)
  const total = state.rankings.length
  const score10 = scoreFromRank(index, total, sentiment)
  const actual = Math.round(score10 * 10)

  state.reviews.push({
    dishId: dish.id,
    rating: SENTIMENT_RATING[sentiment],
    sentiment,
    tags: [],
    text,
    score10,
    predicted,
    actual,
    at: new Date().toISOString(),
  })

  return {
    deltas: deltas(),
    score10,
    rank: { index, total },
    prediction: { predicted, actual, predictedScore10: round1(predicted / 10) },
    accuracy: getAccuracy(),
    rankings: [...state.rankings],
    profile,
  }
}

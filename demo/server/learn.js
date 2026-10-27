// Taste-learning engine: every review nudges a user's profile.
<<<<<<< Updated upstream
// Three channels: sentiment, duels, and review text (see reviewText.js).
=======
// Three channels: sentiment, duels, and review text. The text arrives already
// read (reviewReader.js: Claude, or the keyword list) as signals; this file
// decides how far each one moves the profile.
>>>>>>> Stashed changes
// Pure logic over a per-user `state` ({ profile, reviews, rankings }); where that
// state lives (memory or Postgres) is services/learnerStore.js's job.

import { DEMO_USER } from './match.js'
<<<<<<< Updated upstream
import { matchSignals, countEvidence } from './reviewText.js'

const ALPHA = 0.25 // sentiment learning rate
const DUEL_ALPHA = 0.12 // per-duel nudge toward the winner
const TEXT_BASE = 0.03 // per-signal text nudge, scaled by evidence
=======
import { keywordReading } from './reviewText.js'

const ALPHA = 0.25 // sentiment learning rate
const DUEL_ALPHA = 0.12 // per-duel nudge toward the winner
const STRENGTH_STEP = { 1: 0.02, 2: 0.04, 3: 0.06 } // per text signal, before evidence
const EVIDENCE_MAX = 3 // a theme repeated in 3+ of your reviews counts triple
const TEXT_CAP = 0.12 // most the text can move one dimension in one review
const PRICE_SCALE = 1.5 // price comfort runs 0-2, the others 0-1
const BLAME_SCALE = 0.3 // cuisine nudge left when the review blames something specific
>>>>>>> Stashed changes
const DELTA_MIN = 0.0049 // smallest change worth reporting

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const round1 = (v) => Math.round(v * 10) / 10
const round2 = (v) => Math.round(v * 100) / 100

export const REVIEW_TAGS = ['too-spicy', 'too-heavy', 'worth-it', 'too-pricey']
export const SENTIMENTS = ['loved', 'fine', 'disliked']
const SENTIMENT_RATING = { loved: 5, fine: 3, disliked: 1 }
const SENTIMENT_ANCHOR = { loved: 8.5, fine: 5.5, disliked: 2.5 }

// A learner's state. `profile` defaults to the demo persona (tests use it).
export function createState(profile = DEMO_USER) {
  return {
    profile: structuredClone(profile),
    reviews: [], // oldest first
    rankings: [], // dish ids, best first
  }
}

// Where a new account starts: every known cuisine neutral, no history. The AI
// has nothing to go on yet; reviews and duels move it from here.
export function starterProfile(name = 'You') {
  return {
    name,
    cuisineAffinity: Object.fromEntries(Object.keys(DEMO_USER.cuisineAffinity).map((c) => [c, 0.5])),
    spicePref: 0.5,
    richnessPref: 0.5,
    priceComfort: 1,
    adventurousness: 0.5,
    recentlyEaten: [],
  }
}

// 0 = cheap, 1 = mid, 2 = pricey (S$).
export function priceTierFor(price) {
  const p = Number(price) || 0
  return p >= 12 ? 2 : p > 6 ? 1 : 0
}

export function getAccuracy(state) {
  const errors = state.reviews.map((r) => Math.abs(r.predicted - r.actual))
  const count = errors.length
  const running = count
    ? Math.round(100 - errors.reduce((a, b) => a + b, 0) / count)
    : null
  return { running, count }
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

<<<<<<< Updated upstream
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
=======
// Nudges the profile from a 1-5 rating and optional tags. A rating only says how
// much you liked the dish, so its spice/richness/price/novelty nudges are guesses
// at why: `skip` drops the guess on dimensions your own words covered, and
// `cuisineScale` shrinks the cuisine nudge when you blamed something specific.
function collectRatingNudges(profile, dish, cuisine, rating, tags, touch, { skip = new Set(), cuisineScale = 1, blamedQuote } = {}) {
  const signal = (rating - 3) / 2 // -1 .. +1

  if (cuisine != null && !skip.has('cuisine')) {
    const label = cuisine.replace(/-/g, ' ')
    const from = profile.cuisineAffinity[cuisine] ?? 0.3
    const target = clamp01(0.5 + signal * 0.5)
    const to = clamp01(from + ALPHA * (target - from) * cuisineScale)
    profile.cuisineAffinity[cuisine] = to
    touch('affinity-' + cuisine, `${label} affinity`, from, to,
      cuisineScale < 1
        ? `you ${signal > 0 ? 'credited' : 'blamed'} "${blamedQuote}", not the cuisine`
        : `${rating}★ on a ${label} dish`)
  }

  if (signal !== 0 && !skip.has('spice')) {
>>>>>>> Stashed changes
    const sp = profile.spicePref
    const spTo = clamp01(sp + ALPHA * signal * (dish.spice - sp))
    if (spTo !== sp) {
      profile.spicePref = spTo
      touch('spice', 'Spice', sp, spTo,
        signal > 0
          ? `you enjoyed something ${dish.spice > sp ? 'spicier' : 'milder'} than your usual`
          : `you disliked something ${dish.spice > sp ? 'spicier' : 'milder'} than your usual`)
    }
<<<<<<< Updated upstream
=======
  }

  if (signal !== 0 && !skip.has('richness')) {
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
  if (dish.novelty >= 0.7 && signal !== 0) {
=======
  if (dish.novelty >= 0.7 && signal !== 0 && !skip.has('adventurousness')) {
>>>>>>> Stashed changes
    const from = profile.adventurousness
    const to = clamp01(from + ALPHA * signal * 0.4)
    profile.adventurousness = to
    touch('adventurousness', 'Adventurousness', from, to, `${rating}★ on a high-novelty dish`)
  }

<<<<<<< Updated upstream
  if (dish.priceTier > profile.priceComfort && signal !== 0) {
=======
  if (dish.priceTier > profile.priceComfort && signal !== 0 && !skip.has('price')) {
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
// Nudges from review text; signals repeated across the user's past reviews compound.
function collectTextNudges(state, text, touch) {
  if (!text) return
  const profile = state.profile
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

=======
// Two signals with the same key count as "the same thing said again" across reviews.
const evidenceKey = (s, cuisine) =>
  s.dimension === 'cuisine' ? `cuisine:${cuisine}:${s.direction}` : `${s.dimension}:${s.direction}`

// Keys each past review carries; reviews saved before AI reading are re-read by
// keywords, and undone reviews no longer count.
function pastEvidence(reviews) {
  return reviews
    .filter((r) => !r.undone)
    .map((r) => new Set((r.signals ?? keywordReading(r.text).signals).map((s) => evidenceKey(s, s.cuisine))))
}

// Where each dimension lives in the profile, and its range.
const TEXT_TARGETS = {
  spice: { touchKey: 'spice', label: 'Spice', get: (p) => p.spicePref, set: (p, v) => (p.spicePref = clamp01(v)) },
  richness: { touchKey: 'richness', label: 'Richness', get: (p) => p.richnessPref, set: (p, v) => (p.richnessPref = clamp01(v)) },
  adventurousness: { touchKey: 'adventurousness', label: 'Adventurousness', get: (p) => p.adventurousness, set: (p, v) => (p.adventurousness = clamp01(v)) },
  price: { touchKey: 'price', label: 'Price comfort', scale: PRICE_SCALE, get: (p) => p.priceComfort, set: (p, v) => (p.priceComfort = Math.min(2, Math.max(0, v))) },
}

function cuisineTarget(cuisine) {
  return {
    touchKey: 'affinity-' + cuisine,
    label: `${cuisine.replace(/-/g, ' ')} affinity`,
    get: (p) => p.cuisineAffinity[cuisine] ?? 0.3,
    set: (p, v) => (p.cuisineAffinity[cuisine] = clamp01(v)),
  }
}

const targetFor = (dimension, cuisine) => (dimension === 'cuisine' ? cuisineTarget(cuisine) : TEXT_TARGETS[dimension])

// What the review's signals would move, per dimension: strength x evidence
// (repeats across your reviews compound), summed, then capped per review.
function textMoves(state, reading, venue) {
  const past = pastEvidence(state.reviews)
  const moves = new Map()
  for (const s of reading.signals) {
    if (s.dimension === 'cuisine' && venue.cuisine == null) continue
    const target = targetFor(s.dimension, venue.cuisine)
    if (!target) continue
    const n = 1 + past.filter((keys) => keys.has(evidenceKey(s, venue.cuisine))).length
    const sign = s.direction === 'up' ? 1 : -1
    const move = moves.get(s.dimension) ?? { target, amount: 0, quotes: [], n: 1 }
    move.amount += sign * STRENGTH_STEP[s.strength] * Math.min(n, EVIDENCE_MAX) * (target.scale ?? 1)
    move.quotes.push(`"${s.quote}"`)
    move.n = Math.max(move.n, n)
    moves.set(s.dimension, move)
  }
  for (const move of moves.values()) {
    const cap = TEXT_CAP * (move.target.scale ?? 1)
    move.amount = Math.min(cap, Math.max(-cap, move.amount))
    move.reason = `you said ${move.quotes.join(', ')}` + (move.n > 1 ? ` (${move.n} of your reviews say so)` : '')
  }
  return moves
}

// How far the rating's guesses would move each dimension, without moving anything.
function guessedMoves(profile, dish, cuisine, rating, options) {
  const trial = structuredClone(profile)
  collectRatingNudges(trial, dish, cuisine, rating, [], () => {}, options)
  const guesses = new Map()
  for (const dimension of [...Object.keys(TEXT_TARGETS), ...(cuisine != null ? ['cuisine'] : [])]) {
    const target = targetFor(dimension, cuisine)
    guesses.set(dimension, target.get(trial) - target.get(profile))
  }
  return guesses
}

>>>>>>> Stashed changes
// Star-rating entry point. Mutates `state`; `review` in the result is the new record.
export function applyReview(state, dish, venue, rating, tags = []) {
  const profile = state.profile
  const predicted = predictDishScore(dish, venue.cuisine, profile)
  const actual = Math.round(((rating - 1) / 4) * 100)

  const { touch, deltas } = makeToucher()
  collectRatingNudges(profile, dish, venue.cuisine, rating, tags, touch)

  const review = {
    dishId: dish.id,
    dishName: dish.name,
    venueId: dish.venueId,
    rating,
    tags,
    text: '',
    predicted,
    actual,
    at: new Date().toISOString(),
  }
  state.reviews.push(review)

  return {
    review,
    deltas: deltas(),
    prediction: { predicted, actual },
    accuracy: getAccuracy(state),
    profile,
  }
}

// Beli-style entry point; duels arrive resolved as { winner, loser } dishes with cuisine.
<<<<<<< Updated upstream
export function applyBeliReview(state, dish, venue, { sentiment, duels = [], insertIndex = 0, text = '' }) {
  if (!SENTIMENTS.includes(sentiment)) throw new Error(`invalid sentiment "${sentiment}"`)
  const profile = state.profile
  const predicted = predictDishScore(dish, venue.cuisine, profile)

  const { touch, deltas } = makeToucher()
  collectRatingNudges(profile, dish, venue.cuisine, SENTIMENT_RATING[sentiment], [], touch)
  collectDuelNudges(profile, duels, touch)
  collectTextNudges(state, text, touch)
=======
// `reading` is the review text already read (reviewReader.js); without one the
// keyword list reads `text` here.
export function applyBeliReview(state, dish, venue, { sentiment, duels = [], insertIndex = 0, text = '', reading = keywordReading(text) }) {
  if (!SENTIMENTS.includes(sentiment)) throw new Error(`invalid sentiment "${sentiment}"`)
  const profile = state.profile
  const profileBefore = structuredClone(profile) // what Undo puts back
  const predicted = predictDishScore(dish, venue.cuisine, profile)

  // On each dimension your words cover, they and the rating's guess are compared:
  // pointing the same way, the bigger move wins; pointing different ways, your
  // words win; words that cancel out leave the guess alone. A specific blame
  // softens the cuisine nudge unless the cuisine itself is what you talked about;
  // the blamed (or credited) words are the first non-cuisine ones Claude lists,
  // since it is asked to put those first.
  const { touch, deltas } = makeToucher()
  const rating = SENTIMENT_RATING[sentiment]
  const aboutCuisine = reading.signals.some((s) => s.dimension === 'cuisine')
  const blamed = reading.signals.find((s) => s.dimension !== 'cuisine')
  const ratingOptions = {
    cuisineScale: reading.blame === 'specific' && blamed && !aboutCuisine ? BLAME_SCALE : 1,
    blamedQuote: blamed?.quote,
  }
  const words = textMoves(state, reading, venue)
  const guesses = guessedMoves(profile, dish, venue.cuisine, rating, ratingOptions)
  const wordsBeatGuess = (dimension, { amount }) => {
    const guess = guesses.get(dimension) ?? 0
    if (amount === 0) return false
    return !(Math.sign(guess) === Math.sign(amount) && Math.abs(guess) > Math.abs(amount))
  }
  const wordsWin = new Set([...words].filter(([dimension, move]) => wordsBeatGuess(dimension, move)).map(([dimension]) => dimension))

  collectRatingNudges(profile, dish, venue.cuisine, rating, [], touch, { ...ratingOptions, skip: wordsWin })
  collectDuelNudges(profile, duels, touch)
  for (const [dimension, { target, amount, reason }] of words) {
    const from = target.get(profile)
    if (wordsWin.has(dimension)) target.set(profile, from + amount)
    touch(target.touchKey, target.label, from, target.get(profile), reason)
  }
>>>>>>> Stashed changes

  // Re-reviewing moves the dish rather than duplicating it.
  state.rankings = state.rankings.filter((id) => id !== dish.id)
  const index = Math.min(Math.max(0, insertIndex), state.rankings.length)
  state.rankings.splice(index, 0, dish.id)
  const total = state.rankings.length
  const score10 = scoreFromRank(index, total, sentiment)
  const actual = Math.round(score10 * 10)

  const review = {
    dishId: dish.id,
    dishName: dish.name,
    venueId: dish.venueId,
    rating: SENTIMENT_RATING[sentiment],
    sentiment,
    tags: [],
    text,
<<<<<<< Updated upstream
=======
    signals: reading.signals.map((s) => (s.dimension === 'cuisine' ? { ...s, cuisine: venue.cuisine } : s)),
    readBy: reading.readBy,
    profileBefore,
>>>>>>> Stashed changes
    score10,
    predicted,
    actual,
    at: new Date().toISOString(),
  }
  state.reviews.push(review)

  return {
    review,
<<<<<<< Updated upstream
=======
    readBy: reading.readBy,
>>>>>>> Stashed changes
    deltas: deltas(),
    score10,
    rank: { index, total },
    prediction: { predicted, actual, predictedScore10: round1(predicted / 10) },
    accuracy: getAccuracy(state),
    rankings: [...state.rankings],
    profile,
  }
}
<<<<<<< Updated upstream
=======

// Undo (CSD-54): puts the profile back exactly as it was before your latest review,
// when that review is the one named and hasn't been undone. The review, its score
// and your ranking stay; it just stops counting as evidence. Null when not allowed.
export function undoLatestReview(state, { dishId, at }) {
  const latest = state.reviews.at(-1)
  if (!latest || latest.undone || !latest.profileBefore) return null
  if (latest.dishId !== dishId || latest.at !== at) return null
  state.profile = structuredClone(latest.profileBefore)
  latest.undone = true
  return { review: latest, profile: state.profile, accuracy: getAccuracy(state) }
}
>>>>>>> Stashed changes

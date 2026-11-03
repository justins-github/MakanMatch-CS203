// Scores venues against a user's Taste DNA and context. Each term fires only when
// the venue has that data, and the score is capped by how much is known.

export const DEMO_USER = {
  name: 'Justin (demo)',
  cuisineAffinity: {
    turkish: 0.9,
    thai: 0.75,
    malay: 0.7,
    'chicken-rice': 0.65,
    indian: 0.6,
    chinese: 0.55,
    burmese: 0.4,
    ethiopian: 0.35,
  },
  spicePref: 0.6,
  richnessPref: 0.5,
  priceComfort: 1,
  adventurousness: 0.55,
  recentlyEaten: ['chicken-rice'],
}

const MOODS = ['none', 'soupy', 'spicy', 'light']

function prettyCuisine(cuisine) {
  return cuisine.replace(/-/g, ' ')
}

// A venue's typical price (S$, from the catalog's live menu) on the 0-2 price scale
// used by priceComfort: $4 or less is 0, $9 is 1, $14 or more is 2, smoothly between.
export function priceLevel(price) {
  return Math.round(Math.min(2, Math.max(0, (price - 4) / 5)) * 100) / 100
}

// How unfamiliar this venue's cuisine is to the user; drives the Surprise pick.
export function computeNovelty(venue, user) {
  if (!venue.cuisine) return 0.3
  const affinity = user.cuisineAffinity[venue.cuisine] ?? 0.3
  const unexplored = (venue.reviewCount ?? 0) === 0 ? 0.1 : 0
  return Math.min(1, Math.max(0, 1 - affinity + unexplored))
}

// Scores one venue for one user; returns { score, why }.
function scoreVenue(venue, user, context) {
  let score = 50
  const why = []

  const hasCuisine = venue.cuisine != null
  const affinity = hasCuisine ? (user.cuisineAffinity[venue.cuisine] ?? 0.3) : 0.3
  score += 25 * affinity
  if (hasCuisine && affinity >= 0.7) why.push(`You love ${prettyCuisine(venue.cuisine)}`)

  if (venue.spice != null) {
    score += 15 * (1 - Math.abs(venue.spice - user.spicePref))
    if (Math.abs(venue.spice - user.spicePref) <= 0.15) why.push('Matches your spice level')
  }

  if (venue.richness != null) {
    score += 10 * (1 - Math.abs(venue.richness - user.richnessPref))
    if (Math.abs(venue.richness - user.richnessPref) <= 0.15) why.push('As hearty as you like it')
  }

  if (venue.priceTier != null) {
    const pricePenalty = 8 * Math.max(0, venue.priceTier - user.priceComfort)
    score -= pricePenalty
    if (pricePenalty > 0) why.push('Pricier than your usual')
  }

  // Learned taste: cosine between the user's taste vector and the venue's prior vector.
  // Fires only when both exist; unrelated venues sit around 0.4, close ones above 0.75.
  const sim = context.taste?.vector && venue.gersId
    ? context.taste.store.similarity(venue.gersId, context.taste.vector)
    : null
  if (sim != null) {
    score += 12 * Math.max(0, Math.min(1, (sim - 0.4) / 0.5))
    if (sim >= 0.75) why.push("Similar to places you've rated well")
  }

  // Distance is from where the user is; a request without one scores taste alone.
  if (venue.distanceMin != null) {
    score -= Math.min(12, venue.distanceMin * 0.8)
    why.push(`${venue.distanceMin} min walk`)
  }

  if (hasCuisine && user.recentlyEaten.includes(venue.cuisine)) {
    score -= 15
    why.push(`You just had ${prettyCuisine(venue.cuisine)}`)
  }

  if (context.raining) {
    if (venue.sheltered === true) {
      score += 10
      why.push('Sheltered - good in this rain')
    } else if (venue.sheltered === false) {
      score -= Math.min(8, venue.distanceMin ?? 0)
      why.push('Exposed walk in the rain')
    }
  }

  // Moods only move venues that have the relevant data.
  if (context.mood === 'soupy' && Array.isArray(venue.tags)) {
    if (venue.tags.includes('soup')) {
      score += 15
      why.push('Soupy, as requested')
    } else {
      score -= 10
    }
  } else if (context.mood === 'spicy' && venue.spice != null) {
    if (venue.spice >= 0.6) {
      score += 15
      why.push('Brings the heat')
    } else {
      score -= 10
    }
  } else if (context.mood === 'light' && venue.richness != null) {
    if (venue.richness <= 0.35) {
      score += 15
      why.push('Light pick')
    } else {
      score -= 10
    }
  }

  // Information cap: known attributes and reviews raise the ceiling (80..99).
  const knownAttrs = [venue.cuisine, venue.spice, venue.richness, venue.priceTier]
    .filter((v) => v != null).length
  const infoCap = Math.min(99, 80 + 4 * knownAttrs + Math.min(venue.reviewCount ?? 0, 5))

  return { score: Math.round(Math.min(infoCap, Math.max(5, score))), why }
}

// Data trust from record confidence, data age and review volume.
function confidenceFor(venue) {
  const conf = venue.overtureConfidence ?? 0.95 // curated seeds count as vouched for
  const age = venue.dataAgeDays ?? 365
  const rc = venue.reviewCount ?? 0
  let points = 0
  points += conf >= 0.9 ? 1 : conf >= 0.7 ? 0 : -1
  points += age <= 45 ? 1 : age <= 120 ? 0 : -1
  points += rc >= 25 ? 2 : rc >= 8 ? 1 : rc > 0 ? 0 : -1
  if (points >= 3) return 'high'
  if (points <= 0) return 'low'
  return 'medium'
}

// Scores every venue and returns them best-first.
export function rankVenues(venues, user, context = {}) {
  const mood = MOODS.includes(context.mood) ? context.mood : 'none'
  const raining = Boolean(context.raining)
  const taste = context.taste?.store && context.taste.vector ? context.taste : null

  return venues
    .map((venue) => {
      const { score, why } = scoreVenue(venue, user, { raining, mood, taste })
      return {
        ...venue,
        matchScore: score,
        confidence: confidenceFor(venue),
        novelty: computeNovelty(venue, user),
        why,
        experimental: false,
      }
    })
    .sort((a, b) => b.matchScore - a.matchScore)
}

// Picks one decent match from an unfamiliar cuisine, or null.
export function pickSurprise(venues, user, context = {}, excludeIds = []) {
  const excluded = new Set(excludeIds)
  const ranked = rankVenues(
    venues.filter((v) => v.cuisine != null && !excluded.has(v.id)),
    user,
    context,
  )
  if (ranked.length === 0) return null
  let candidates = ranked.filter((v) => v.novelty >= 0.55 && v.matchScore >= 55)
  if (candidates.length === 0) candidates = ranked.filter((v) => v.novelty >= 0.4)
  if (candidates.length === 0) candidates = ranked
  const pick = candidates.reduce((best, v) => {
    const value = v.matchScore + v.novelty * 100 * user.adventurousness
    const bestValue = best.matchScore + best.novelty * 100 * user.adventurousness
    return value > bestValue ? v : best
  })
  return {
    ...pick,
    experimental: true,
    why: [`Experimental pick - ${prettyCuisine(pick.cuisine)} is a stretch for your Taste DNA`, ...pick.why],
  }
}

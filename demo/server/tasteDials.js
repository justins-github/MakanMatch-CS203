// Taste sliders: an admin sets their real Taste DNA by hand (the Taste DNA tab), so a demo
// can show Find reacting to an extreme taste without posting twenty reviews first. The
// profile is marked setByHand until their next review (reviewService).
import { badRequest } from './errors.js'
import { CUISINES } from './cuisines.js'

const RANGES = { spicePref: 1, richnessPref: 1, priceComfort: 2, adventurousness: 1 } // each runs from 0
const UNSEEN_CUISINE = 0.3 // what match.js assumes for a cuisine the profile has no feeling about

const inRange = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max

// The profile with these dials set; anything left out keeps its value.
export function applyDials(profile, dials) {
  const entries = Object.entries(dials ?? {})
  if (entries.length === 0) throw badRequest('Set at least one dial')
  const next = { ...profile, cuisineAffinity: { ...profile.cuisineAffinity } }
  for (const [key, value] of entries) {
    if (key === 'cuisineAffinity') {
      for (const [cuisine, affinity] of Object.entries(value ?? {})) {
        if (!CUISINES.includes(cuisine)) throw badRequest(`No cuisine called "${cuisine}"`)
        if (!inRange(affinity, 1)) throw badRequest(`${cuisine} must be from 0 to 1`)
        next.cuisineAffinity[cuisine] = affinity
      }
    } else if (key in RANGES) {
      if (!inRange(value, RANGES[key])) throw badRequest(`${key} must be from 0 to ${RANGES[key]}`)
      next[key] = value
    } else {
      throw badRequest(`There's no dial called "${key}"`)
    }
  }
  return next
}

// What the sliders show: the taste now, and every cuisine with how many places have it.
export function dialsOf(profile, venueCounts) {
  return {
    setByHand: Boolean(profile.setByHand),
    spicePref: profile.spicePref,
    richnessPref: profile.richnessPref,
    priceComfort: profile.priceComfort,
    adventurousness: profile.adventurousness,
    cuisines: CUISINES
      .map((key) => ({ key, venues: venueCounts.get(key) ?? 0, affinity: profile.cuisineAffinity[key] ?? UNSEEN_CUISINE }))
      .sort((a, b) => b.venues - a.venues),
  }
}

export function venuesPerCuisine(venues) {
  const counts = new Map()
  for (const { cuisine } of venues) if (cuisine) counts.set(cuisine, (counts.get(cuisine) ?? 0) + 1)
  return counts
}

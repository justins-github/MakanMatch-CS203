// The suggested update behind "Claude's take" (CSD-56): lean each recent trend
// (trends.js) one more step the same way. Nothing here changes a profile until the
// user accepts; a trend that was accepted or dismissed is never suggested again.

const MAX_STEP = 0.1 // of the dimension's range
const CUISINE_DEFAULT = 0.3 // what learn.js assumes for a cuisine not yet in the profile
const LEAN_QUESTION = 'Want your matches to lean that way a bit more?'

const round2 = (v) => Math.round(v * 100) / 100
const round4 = (v) => Math.round(v * 10000) / 10000
const rangeOf = (key) => (key === 'price' ? 2 : 1)

// Where each trend key lives in the profile.
function field(key) {
  if (key.startsWith('cuisine:')) {
    const cuisine = key.slice('cuisine:'.length)
    return {
      get: (p) => p.cuisineAffinity[cuisine] ?? CUISINE_DEFAULT,
      set: (p, v) => (p.cuisineAffinity[cuisine] = v),
    }
  }
  const name = { spice: 'spicePref', richness: 'richnessPref', price: 'priceComfort', adventurousness: 'adventurousness' }[key]
  return { get: (p) => p[name], set: (p, v) => (p[name] = v) }
}

const decided = (decisions, t) => decisions.some((d) => d.key === t.key && d.direction === t.direction)

// The suggestion for these trends, leaving out decided ones and any already at the
// end of their range (nothing to lean into); null when nothing's left.
export function suggestionFor(trends, decisions) {
  const changes = trends
    .filter((t) => !decided(decisions, t))
    .map((t) => {
      const cap = MAX_STEP * rangeOf(t.key)
      const step = round2(Math.max(-cap, Math.min(cap, (t.to - t.from) / t.reviews)))
      return { key: t.key, direction: t.direction, label: t.label, headline: t.headline, from: t.from, to: t.to, reviews: t.reviews, step }
    })
    .filter((c) => (c.step > 0 ? c.to < rangeOf(c.key) : c.step < 0 && c.to > 0))
  if (changes.length === 0) return null
  return { signature: changes.map((c) => `${c.key}:${c.direction}`).join('|'), changes }
}

// Accepting: moves the profile one step per change (kept inside each range).
export function applySuggestion(profile, suggestion) {
  return suggestion.changes.map(({ key, label, step }) => {
    const { get, set } = field(key)
    const from = get(profile)
    set(profile, round4(Math.min(rangeOf(key), Math.max(0, from + step))))
    return { key, label, from: round2(from), to: round2(get(profile)) }
  })
}

// What the summary says when Claude isn't available.
export function templateSummary(suggestion) {
  const phrases = suggestion.changes.map((c) => c.headline.replace(/^You're /, ''))
  const joined = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`
  return `Lately you're ${joined}. ${LEAN_QUESTION}`
}

// What other people's recent reviews do to a venue's match. Two effects:
//   - what we believe about the venue: "too spicy" makes it count as hotter, for everyone;
//   - the verdict, which counts for more the closer the reviewer's taste is to yours.
// Pure logic; the reviews and profiles come from the learner store.
import { keywordReading } from './reviewText.js'

export const WINDOW_DAYS = 30 // reviews fade to nothing over this long
export const BANNER_MIN_POINTS = 3 // smaller moves aren't worth a banner
const FULL_HISTORY = 5 // reviews before someone's word counts in full
const MIN_REVIEWS_TO_COMPARE = 3 // new accounts all start alike, so comparing them means nothing
const UNKNOWN_CLOSENESS = 0.5
const ZERO_CLOSENESS_GAP = 0.35 // a mean gap this big reads as nothing in common
const MISSING_CUISINE = 0.3 // what match.js assumes for a cuisine someone has no feeling about
const MAX_SHIFT = 0.7 // furthest reviews can move a venue's spice or richness
const MAX_NUDGE = 12 // most points the verdict can add or take away
const SHRINK = 4 // how much evidence it takes: one review barely moves things, three do
const LOTS = 0.5
const SOME = 0.15
const DAY_MS = 24 * 60 * 60 * 1000

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length
const shrunk = (evidence) => (evidence * evidence) / (evidence * evidence + SHRINK)
const ageInDays = (row, nowMs) => (nowMs - Date.parse(row.at)) / DAY_MS

// How alike two Taste DNAs are: 1 is identical, 0 is nothing in common.
export function closeness(a, b) {
  const cuisines = [...new Set([...Object.keys(a.cuisineAffinity), ...Object.keys(b.cuisineAffinity)])]
  const cuisineGaps = cuisines.map((c) => Math.abs((a.cuisineAffinity[c] ?? MISSING_CUISINE) - (b.cuisineAffinity[c] ?? MISSING_CUISINE)))
  const gap = mean([
    Math.abs(a.spicePref - b.spicePref),
    Math.abs(a.richnessPref - b.richnessPref),
    Math.abs(a.priceComfort - b.priceComfort) / 2, // price comfort runs 0-2
    Math.abs(a.adventurousness - b.adventurousness),
    cuisineGaps.length ? mean(cuisineGaps) : 0,
  ])
  return clamp01(1 - gap / ZERO_CLOSENESS_GAP)
}

// Closeness between two people ({ profile, reviewCount }), when there's enough to compare.
export function closenessBetween(a, b) {
  if (a.reviewCount < MIN_REVIEWS_TO_COMPARE || b.reviewCount < MIN_REVIEWS_TO_COMPARE) {
    return { value: UNKNOWN_CLOSENESS, known: false }
  }
  return { value: closeness(a.profile, b.profile), known: true }
}

// How much one review counts for this viewer.
export function reviewWeight(viewer, person, row, nowMs) {
  const recency = clamp01(1 - ageInDays(row, nowMs) / WINDOW_DAYS)
  const history = Math.min(1, person.reviewCount / FULL_HISTORY)
  const { value, known } = closenessBetween(viewer, person)
  return { weight: value * value * recency * history, closeness: value, known, recency, history }
}

export function countsLabel(weight) {
  if (weight >= LOTS) return 'counts a lot'
  return weight >= SOME ? 'counts some' : 'counts a little'
}

// Signals describe the reviewer's own taste, so the verdict is what makes them a fact
// about the venue: "too spicy" from an unhappy diner and "love the heat" from a happy
// one both say it's hot (+1). One review is one vote, however many times it says so.
function voteOf(row, dimension) {
  const signals = row.signals ?? keywordReading(row.text, row.sentiment).signals
  const total = signals
    .filter((s) => s.dimension === dimension)
    .reduce((sum, s) => sum + (s.direction === 'up' ? 1 : -1) * (row.sentiment === 'loved' ? 1 : -1), 0)
  return Math.sign(total)
}

const SENTIMENT_VALUE = { loved: 1, fine: 0, disliked: -1 }

// The reviews that count: recent, not undone, not yours, and only each person's latest
// per venue, so reviewing five dishes is still one voice. Grouped by venue.
function countedByVenue(viewer, rows, people, nowMs) {
  const latest = new Map()
  for (const row of rows) {
    if (row.undone || !row.sentiment || row.userId === viewer.id || !people.has(row.userId)) continue
    if (ageInDays(row, nowMs) >= WINDOW_DAYS) continue
    const key = `${row.venueId}|${row.userId}`
    const seen = latest.get(key)
    if (!seen || Date.parse(row.at) > Date.parse(seen.at)) latest.set(key, row)
  }
  const byVenue = new Map()
  for (const row of latest.values()) {
    if (!byVenue.has(row.venueId)) byVenue.set(row.venueId, [])
    byVenue.get(row.venueId).push(row)
  }
  return byVenue
}

// venue id -> what reviews do to it for this viewer. No entry means no effect.
export function communityFor(viewer, rows, people, nowMs) {
  const result = new Map()
  for (const [venueId, counted] of countedByVenue(viewer, rows, people, nowMs)) {
    let spiceEvidence = 0
    let richnessEvidence = 0
    let verdict = 0
    const reviews = counted.map((row) => {
      const { weight, closeness: value, known, recency, history } = reviewWeight(viewer, people.get(row.userId), row, nowMs)
      const spiceVote = voteOf(row, 'spice')
      const richnessVote = voteOf(row, 'richness')
      // The venue's heat is a fact for everyone, so taste closeness stays out of it.
      spiceEvidence += spiceVote * recency * history
      richnessEvidence += richnessVote * recency * history
      verdict += SENTIMENT_VALUE[row.sentiment] * weight
      return { userId: row.userId, weight, closeness: value, known, sentiment: row.sentiment, spiceVote, richnessVote, at: row.at }
    })
    result.set(venueId, {
      spiceShift: Math.sign(spiceEvidence) * MAX_SHIFT * shrunk(spiceEvidence),
      richnessShift: Math.sign(richnessEvidence) * MAX_SHIFT * shrunk(richnessEvidence),
      nudge: Math.sign(verdict) * MAX_NUDGE * shrunk(verdict),
      spiceEvidence,
      richnessEvidence,
      reviews,
    })
  }
  return result
}

const CLOSE = 0.7 // close enough to say "taste like yours"
const THIS_WEEK_DAYS = 7
const MAX_FACES = 3

// What most people said about each way a venue can move, by [complaint, praise].
const REASONS = {
  spice: { vote: 'spiceVote', evidence: 'spiceEvidence', more: ['too spicy', 'really spicy'], less: 'not very spicy' },
  richness: { vote: 'richnessVote', evidence: 'richnessEvidence', more: ['too heavy', 'really hearty'], less: 'light' },
}

// The biggest thing reviewers said about the venue, and who said it; null if they gave no reason.
function strongestReason(input) {
  const [reason] = Object.values(REASONS)
    .filter((r) => input[r.evidence] !== 0)
    .sort((a, b) => Math.abs(input[b.evidence]) - Math.abs(input[a.evidence]))
  if (!reason) return null
  const direction = Math.sign(input[reason.evidence])
  return { reason, direction, voters: input.reviews.filter((r) => r[reason.vote] === direction) }
}

function reasonWords({ reason, direction, voters }, rose) {
  if (direction < 0) return `said it's ${reason.less}.`
  const praised = voters.filter((r) => r.sentiment === 'loved').length > voters.length / 2
  return `said it's ${reason.more[praised ? 1 : 0]}${rose ? ', which usually suits you' : ''}.`
}

function whoSaid(voters, viewer) {
  const people = voters.length === 1 ? '1 person' : `${voters.length} people`
  const close = voters.filter((r) => r.known && r.closeness >= CLOSE).length
  const likeYou = viewer.reviewCount >= MIN_REVIEWS_TO_COMPARE && close > voters.length / 2
  return likeYou ? `${people} with taste like yours` : people
}

// What the card says when reviews moved your match; null if they barely did.
export function reviewChange(input, was, now, viewer, nowMs) {
  if (Math.abs(now - was) < BANNER_MIN_POINTS) return null
  const rose = now > was
  const found = strongestReason(input)
  const verdictVoters = input.reviews.filter((r) => r.sentiment === (rose ? 'loved' : 'disliked'))
  const voters = found?.voters ?? (verdictVoters.length ? verdictVoters : input.reviews)
  const words = found ? reasonWords(found, rose) : rose ? 'loved it.' : "didn't like it."
  const newest = Math.max(...input.reviews.map((r) => Date.parse(r.at)))
  return {
    was,
    now,
    label: `Recent reviews · this ${(nowMs - newest) / DAY_MS <= THIS_WEEK_DAYS ? 'week' : 'month'}`,
    text: `${whoSaid(voters, viewer)} ${words}`,
    reviewerIds: [...voters].sort((a, b) => b.weight - a.weight).slice(0, MAX_FACES).map((r) => r.userId),
  }
}

const AGREEMENTS = {
  spice: {
    low: 'You both keep the spice low',
    high: 'You both like it hot',
    theirsHigher: 'They like it much hotter than you',
    theirsLower: 'They like it much milder than you',
  },
  richness: {
    low: 'You both keep it light',
    high: 'You both like it rich',
    theirsHigher: 'They like it much richer than you',
    theirsLower: 'They like it much lighter than you',
  },
  price: {
    low: 'You both keep it cheap',
    high: "You both don't mind paying more",
    theirsHigher: 'They spend much more freely than you',
    theirsLower: "They're much more careful with money than you",
  },
  adventurousness: {
    low: 'You both stick to what you know',
    high: 'You both love trying new things',
    theirsHigher: "They're much more adventurous than you",
    theirsLower: "They're much less adventurous than you",
  },
}
const MAX_AGREEMENTS = 3
const SAME_GAP = 0.15
const FAR_GAP = 0.4
const LOW = 0.35
const HIGH = 0.65

// Plain lines comparing two tastes, from their profile dimensions ({ key, value }).
export function agreementLines(yourDimensions, theirDimensions) {
  const valueOf = (dimensions, key) => dimensions.find((d) => d.key === key).value
  const lines = Object.entries(AGREEMENTS).flatMap(([key, words]) => {
    const yours = valueOf(yourDimensions, key)
    const theirs = valueOf(theirDimensions, key)
    const gap = Math.round(Math.abs(yours - theirs) * 100) / 100 // 0.6 - 0.2 isn't quite 0.4 in floating point
    if (gap >= FAR_GAP) return [theirs > yours ? words.theirsHigher : words.theirsLower]
    if (gap > SAME_GAP) return []
    if (yours < LOW && theirs < LOW) return [words.low]
    return yours > HIGH && theirs > HIGH ? [words.high] : []
  })
  return lines.slice(0, MAX_AGREEMENTS)
}

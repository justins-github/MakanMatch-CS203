// Matching for a table of kakis. Everyone ranks the same venues with their own
// Taste DNA; a place's group score is the average, and nobody should be stuck
// somewhere they'd hate: aim for everyone at 75% or more, and only if that leaves
// fewer than three places, lower the bar 5 points at a time (never below 50).
export const AIMED_FLOOR = 75
const FLOOR_STEP = 5
const LOWEST_FLOOR = 50
const ENOUGH = 3

// members: [{ id, name, adventurousness, ranked }] - ranked is rankVenues() output
// over the same venues; the first member is the person asking, whose ranking
// supplies the card details (hours, owner updates, confidence).
export function scoreGroup(members) {
  const byMember = members.map((m) => new Map(m.ranked.map((v) => [v.id, v])))
  return members[0].ranked
    .filter((venue) => byMember.every((ranking) => ranking.has(venue.id)))
    .map((venue) => {
      const mine = byMember.map((ranking) => ranking.get(venue.id))
      const scores = members.map((m, i) => ({ id: m.id, name: m.name, score: mine[i].matchScore }))
      const values = scores.map((s) => s.score)
      return {
        venue,
        scores,
        average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        lowest: Math.min(...values),
        novelty: mine.reduce((sum, v) => sum + v.novelty, 0) / mine.length,
      }
    })
    .sort((a, b) => b.average - a.average || b.lowest - a.lowest)
}

// The highest floor (75, 70, ... 50) that still leaves three places.
export function applyFloor(scored) {
  for (let floor = AIMED_FLOOR; ; floor -= FLOOR_STEP) {
    const passing = scored.filter((s) => s.lowest >= floor)
    if (passing.length >= ENOUGH || floor <= LOWEST_FLOOR) return { passing, floor }
  }
}

const card = ({ venue, scores, average, lowest }) => ({
  ...venue,
  matchScore: average,
  lowest,
  groupScores: scores,
  why: [`Nobody below ${lowest}%`],
})

export function groupFind(members, { limit = 10 } = {}) {
  const { passing, floor } = applyFloor(scoreGroup(members))
  return { venues: passing.slice(0, limit).map(card), floor, relaxed: floor < AIMED_FLOOR }
}

// One place that's new to most of the table, from the places that pass the floor.
export function groupSurprise(members, excludeIds = []) {
  const excluded = new Set(excludeIds)
  const { passing, floor } = applyFloor(scoreGroup(members))
  const open = passing.filter((s) => !excluded.has(s.venue.id))
  const meta = { floor, relaxed: floor < AIMED_FLOOR }
  if (open.length === 0) return { venues: [], ...meta }

  const daring = members.reduce((sum, m) => sum + (m.adventurousness ?? 0.5), 0) / members.length
  const fresh = open.filter((s) => s.novelty >= 0.55)
  const candidates = fresh.length > 0 ? fresh : open
  const pick = candidates.reduce((best, s) =>
    s.average + s.novelty * 100 * daring > best.average + best.novelty * 100 * daring ? s : best,
  )
  return {
    venues: [{ ...card(pick), experimental: true, why: ['Experimental pick - new to most of you', ...card(pick).why] }],
    ...meta,
  }
}

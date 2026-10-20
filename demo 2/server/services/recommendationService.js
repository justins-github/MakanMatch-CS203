// "For you" recommendations - for one person or a table of kakis - and
// personalised venue search.
import { applyDietary, vegetarianBoost } from '../dietary.js'
import { MAX_WALK_MIN } from '../geo.js'
import { AIMED_FLOOR, groupFind, groupSurprise } from '../groupMatch.js'
import { applyOpeningHours } from '../hours.js'
import { pickSurprise, rankVenues } from '../match.js'
import { searchVenues } from '../search.js'
import { learnedVector, tasteContext } from './tasteVectors.js'

const round1 = (v) => Math.round(v * 10) / 10
const CLOSED = new Set(['CLOSED', 'TEMPORARILY_CLOSED'])

export function createRecommendationService({ registry, vectors, learners, catalog, accounts, now = () => new Date() }) {
  const walkable = registry.venues.filter((v) => v.distanceMin <= MAX_WALK_MIN)

  // Owner reports are a live signal; if the catalog is down we still recommend, and say so.
  async function ownerReports() {
    try {
      return { byVenue: await catalog.venueStatuses(), available: true }
    } catch {
      return { byVenue: new Map(), available: false }
    }
  }

  // Same for opening hours: without them, nothing is left out for being shut.
  async function openingHours() {
    try {
      return await catalog.venueHours()
    } catch {
      return new Map()
    }
  }

  // What match.js needs to rank `venues` for one person: their Taste DNA and taste vector.
  async function contextFor(person, venues, { raining, mood }) {
    const state = await learners.read(person.id, person.name)
    const vector = await learnedVector(vectors, state.reviews, registry.venueById)
    const taste = await tasteContext(vectors, vector, venues)
    const ctx = { raining, mood, taste }
    return { state, ctx }
  }

  // Their scores for every venue, vegetarian places nudged up for vegetarians.
  async function rankedFor(person, venues, context) {
    const { state, ctx } = await contextFor(person, venues, context)
    const ranked = rankVenues(venues, state.profile, ctx)
      .map((v) => ({ ...v, matchScore: vegetarianBoost(v, v.matchScore, person.restrictions) }))
    return { ...person, adventurousness: state.profile.adventurousness, ranked }
  }

  return {
    // mode: 'find' (top 10) | 'surprise' (one experimental pick, skipping `exclude`).
    // withIds: kakis eating with the caller; account-service checks they are kakis.
    async recommend(user, { mode, mood, context, exclude = [], withIds = [] }) {
      const kakis = withIds.length > 0 ? await accounts.party(user.token, withIds) : []
      const me = { id: user.id, name: user.me.displayName, restrictions: user.me.dietary?.restrictions ?? [] }
      const people = [me, ...kakis.map((k) => ({ id: k.id, name: k.displayName, restrictions: k.restrictions ?? [] }))]

      const [reports, hours] = await Promise.all([ownerReports(), openingHours()])
      const { open: notClosed, closed } = applyOwnerReports(walkable, reports.byVenue)
      const { open, shutNow } = applyOpeningHours(notClosed, hours, now())
      // Halal and vegetarian are dealbreakers for anyone at the table.
      const { allowed, dropped } = applyDietary(open, people.map((p) => p.restrictions))
      const answer = {
        context,
        mood,
        mode,
        ownerReports: { available: reports.available, closedNearby: closed, shutNow },
        dietary: { dropped },
      }
      const scene = { raining: context.raining, mood }

      if (kakis.length === 0) {
        if (mode === 'surprise') {
          const { state, ctx } = await contextFor(me, allowed, scene)
          return { ...answer, venues: [pickSurprise(allowed, state.profile, ctx, exclude)].filter(Boolean) }
        }
        const { ranked } = await rankedFor(me, allowed, scene)
        return { ...answer, venues: ranked.sort((a, b) => b.matchScore - a.matchScore).slice(0, 10) }
      }

      const members = await Promise.all(people.map((p) => rankedFor(p, allowed, scene)))
      const result = mode === 'surprise' ? groupSurprise(members, exclude) : groupFind(members)
      return {
        ...answer,
        venues: result.venues,
        group: {
          members: people.map(({ id, name }) => ({ id, name })),
          aimedFloor: AIMED_FLOOR,
          floor: result.floor,
          relaxed: result.relaxed,
        },
      }
    },

    async search(user, query, limit) {
      const state = await learners.read(user.id, user.me.displayName)
      const yours = yourScoresByVenue(state.reviews)
      const results = searchVenues(registry.searchIndex, query, {
        limit,
        scoreFn: (venue) => rankVenues([venue], state.profile)[0].matchScore,
      })
      return results.map(({ venue, matchScore, highlight }) => ({
        id: venue.id,
        name: venue.name,
        area: venue.area ?? null,
        address: venue.address ?? null,
        cuisine: venue.cuisine ?? null,
        distanceMin: venue.distanceMin,
        matchScore,
        yourScore: yours.get(venue.id) ?? null,
        highlight,
      }))
    },
  }
}

// What owners report changes what diners see: closed venues drop out (and are
// listed so the UI can say why), and a venue that moved shows its new address
// even after later reports (catalog-service carries the latest move forward).
export function applyOwnerReports(venues, byVenue) {
  const open = []
  const closed = []
  for (const venue of venues) {
    const report = byVenue.get(venue.id)
    if (!report) {
      open.push(venue)
    } else if (CLOSED.has(report.status)) {
      closed.push({ id: venue.id, name: venue.name, status: report.status, note: report.note ?? null, reportedAt: report.reportedAt })
    } else {
      open.push({
        ...venue,
        address: report.currentAddress ?? venue.address,
        ownerUpdate: {
          status: report.status,
          currentAddress: report.currentAddress ?? null,
          note: report.note ?? null,
          reportedAt: report.reportedAt,
        },
      })
    }
  }
  return { open, closed }
}

// Mean of the latest 1-10 score per dish, per venue.
function yourScoresByVenue(reviews) {
  const latestByDish = new Map()
  for (const r of reviews) if (r.score10 !== undefined) latestByDish.set(r.dishId, r)
  const perVenue = new Map()
  for (const r of latestByDish.values()) {
    if (!perVenue.has(r.venueId)) perVenue.set(r.venueId, [])
    perVenue.get(r.venueId).push(r.score10)
  }
  return new Map([...perVenue].map(([id, s]) => [id, round1(s.reduce((a, b) => a + b, 0) / s.length)]))
}

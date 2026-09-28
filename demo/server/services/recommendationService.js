// "For you" recommendations and personalised venue search for one user.
import { MAX_WALK_MIN } from '../geo.js'
import { applyOpeningHours } from '../hours.js'
import { pickSurprise, rankVenues } from '../match.js'
import { searchVenues } from '../search.js'
import { learnedVector, tasteContext } from './tasteVectors.js'

const round1 = (v) => Math.round(v * 10) / 10
const CLOSED = new Set(['CLOSED', 'TEMPORARILY_CLOSED'])

export function createRecommendationService({ registry, vectors, learners, catalog, now = () => new Date() }) {
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

  return {
    // mode: 'find' (top 10) | 'surprise' (one experimental pick, skipping `exclude`)
    async recommend(user, { mode, mood, context, exclude = [] }) {
      const state = await learners.read(user.id, user.me.displayName)
      const [reports, hours] = await Promise.all([ownerReports(), openingHours()])
      const { open: notClosed, closed } = applyOwnerReports(walkable, reports.byVenue)
      const { open, shutNow } = applyOpeningHours(notClosed, hours, now())
      const vector = await learnedVector(vectors, state.reviews, registry.venueById)
      const taste = await tasteContext(vectors, vector, open)
      const ctx = { raining: context.raining, mood, taste }
      const venues = mode === 'surprise'
        ? [pickSurprise(open, state.profile, ctx, exclude)].filter(Boolean)
        : rankVenues(open, state.profile, ctx).slice(0, 10)
      return { context, mood, mode, venues, ownerReports: { available: reports.available, closedNearby: closed, shutNow } }
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

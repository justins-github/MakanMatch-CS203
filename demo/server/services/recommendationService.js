// "For you" recommendations - for one person or a table of kakis - and
// personalised venue search.
import { createChangeExplainer, factsFor, templateExplanation } from '../changeExplainer.js'
import { applyDietary, vegetarianBoost } from '../dietary.js'
import { DEFAULT_WALK_MIN, SMU, nearestArea, venuesNear, walkMinutes } from '../geo.js'
import { AIMED_FLOOR, groupFind, groupSurprise } from '../groupMatch.js'
import { applyOpeningHours } from '../hours.js'
import { pickSurprise, priceLevel, rankVenues } from '../match.js'
import { searchVenues } from '../search.js'
import { learnedVector, tasteContext } from './tasteVectors.js'

const round1 = (v) => Math.round(v * 10) / 10
const CLOSED = new Set(['CLOSED', 'TEMPORARILY_CLOSED'])

export function createRecommendationService({
  registry, vectors, learners, catalog, accounts, explainer = createChangeExplainer({ ai: null }), now = () => new Date(),
}) {
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

  // CSD-51: live menu prices set a venue's price level; without them it keeps the registry's.
  async function livePrices() {
    try {
      return await catalog.venuePrices()
    } catch {
      return new Map()
    }
  }
  const withLivePrices = (venues, prices) =>
    venues.map((v) => (prices.has(v.id) ? { ...v, priceTier: priceLevel(prices.get(v.id)) } : v))

  // CSD-51: the venue as it was at your visit (its price level then), scored with your
  // taste today, next to the card's match now; null when the venue's changes didn't move
  // it, or when it had no typical price then or now (the list then says what's new).
  function matchThenAndNow(venue, changes, score) {
    if (changes.priceThen == null || changes.priceNow == null) return null
    const was = score({ ...venue, priceTier: priceLevel(Number(changes.priceThen)) })
    return was !== venue.matchScore ? { was, now: venue.matchScore } : null
  }

  // CSD-50: cards for places you've reviewed carry what changed there since your
  // latest review. If the catalog can't say, the card just goes without. On your own
  // cards (`you` = { score, profile }; not group ones) it also says what that did to
  // your match, with a plain explanation (CSD-52; Claude's comes via explainChange).
  function withSinceLastVisit(venues, visits, you) {
    return Promise.all(venues.map(async (venue) => {
      const since = visits.get(venue.id)
      if (!since) return venue
      try {
        const changes = await catalog.venueChanges(venue.id, since)
        if (!changes) return venue // the catalog doesn't know this venue (any more)
        const match = you ? matchThenAndNow(venue, changes, you.score) : null
        const why = match ? { explanation: { text: templateExplanation({ changes, profile: you.profile }), writtenBy: 'template' } } : {}
        return { ...venue, sinceLastVisit: { ...changes, ...(match ? { match } : {}), ...why } }
      } catch {
        return venue
      }
    }))
  }

  // CSD-52: Claude's explanations, one per (user, venue, what the facts say). Only the
  // latest per user and venue is kept; a template one (Claude didn't answer usefully)
  // is kept for RETRY_MS, so a failing answer isn't re-asked on every card load.
  const RETRY_MS = 10 * 60 * 1000
  const explained = new Map() // key -> { pending: Promise<{ text, writtenBy }>, until }
  function explanationFor(key, scope, input) {
    const hit = explained.get(key)
    if (hit && hit.until > now().getTime()) return hit.pending
    for (const old of explained.keys()) if (old.startsWith(scope)) explained.delete(old)
    const entry = { pending: explainer.explain(input), until: Infinity }
    explained.set(key, entry)
    entry.pending.then(
      (e) => { if (e.writtenBy !== 'ai') entry.until = now().getTime() + RETRY_MS },
      () => explained.delete(key),
    )
    return entry.pending
  }

  // Their scores for every venue, vegetarian places nudged up for vegetarians.
  async function rankedFor(person, venues, context) {
    const { state, ctx } = await contextFor(person, venues, context)
    const score = (v) => vegetarianBoost(v, rankVenues([v], state.profile, ctx)[0].matchScore, person.restrictions)
    const ranked = rankVenues(venues, state.profile, ctx)
      .map((v) => ({ ...v, matchScore: vegetarianBoost(v, v.matchScore, person.restrictions) }))
    return { ...person, adventurousness: state.profile.adventurousness, profile: state.profile, ranked, score }
  }

  return {
    // mode: 'find' (top 10) | 'surprise' (one experimental pick, skipping `exclude`).
    // withIds: kakis eating with the caller; account-service checks they are kakis.
    // Only venues within `walkMin` of `from` (the caller's spot, for the whole table) count.
    async recommend(user, { mode, mood, context, exclude = [], withIds = [], from = SMU, walkMin = DEFAULT_WALK_MIN }) {
      const kakis = withIds.length > 0 ? await accounts.party(user.token, withIds) : []
      const me = { id: user.id, name: user.me.displayName, restrictions: user.me.dietary?.restrictions ?? [] }
      const people = [me, ...kakis.map((k) => ({ id: k.id, name: k.displayName, restrictions: k.restrictions ?? [] }))]

      const [reports, hours, mine, prices] = await Promise.all([
        ownerReports(), openingHours(), learners.read(me.id, me.name), livePrices(),
      ])
      const visits = lastVisitsByVenue(mine.reviews)
      const nearby = venuesNear(registry.venues, from, walkMin)
      const { open: notClosed, closed } = applyOwnerReports(withLivePrices(nearby, prices), reports.byVenue)
      const { open, shutNow } = applyOpeningHours(notClosed, hours, now())
      // Halal and vegetarian are dealbreakers for anyone at the table.
      const { allowed, dropped } = applyDietary(open, people.map((p) => p.restrictions))
      const answer = {
        context,
        mood,
        mode,
        near: { area: nearestArea(from), walkMin },
        ownerReports: { available: reports.available, closedNearby: closedYourPlacesFirst(closed, visits), shutNow },
        dietary: { dropped },
      }
      const scene = { raining: context.raining, mood }

      if (kakis.length === 0) {
        if (mode === 'surprise') {
          const { state, ctx } = await contextFor(me, allowed, scene)
          const pick = [pickSurprise(allowed, state.profile, ctx, exclude)].filter(Boolean)
          const score = (v) => rankVenues([v], state.profile, ctx)[0].matchScore
          return { ...answer, venues: await withSinceLastVisit(pick, visits, { score, profile: state.profile }) }
        }
        const { ranked, score, profile } = await rankedFor(me, allowed, scene)
        const top = ranked.sort((a, b) => b.matchScore - a.matchScore).slice(0, 10)
        return { ...answer, venues: await withSinceLastVisit(top, visits, { score, profile }) }
      }

      const members = await Promise.all(people.map((p) => rankedFor(p, allowed, scene)))
      const result = mode === 'surprise' ? groupSurprise(members, exclude) : groupFind(members)
      return {
        ...answer,
        venues: await withSinceLastVisit(result.venues, visits),
        group: {
          members: people.map(({ id, name }) => ({ id, name })),
          aimedFloor: AIMED_FLOOR,
          floor: result.floor,
          relaxed: result.relaxed,
        },
      }
    },

    // CSD-52: Claude's take on why your match with a venue changed since your last visit,
    // or null when you haven't been or the match didn't move. Asked for separately so
    // Find never waits on Claude; scored without mood or rain, which don't change the why.
    async explainChange(user, venueId) {
      const venue = registry.venueById.get(venueId)
      if (!venue) return null
      const me = { id: user.id, name: user.me.displayName, restrictions: user.me.dietary?.restrictions ?? [] }
      const [mine, prices] = await Promise.all([learners.read(me.id, me.name), livePrices()])
      const since = lastVisitsByVenue(mine.reviews).get(venueId)
      if (!since) return null
      const changes = await catalog.venueChanges(venueId, since).catch(() => null)
      if (!changes) return null
      const { ranked, score } = await rankedFor(me, withLivePrices([venue], prices), { raining: false, mood: null })
      const match = matchThenAndNow(ranked[0], changes, score)
      if (!match) return null
      // Keyed on what Claude would be told, so any different change gets a fresh answer.
      const scope = `${user.id}|${venueId}|`
      const told = factsFor({ changes, profile: mine.profile }).map((f) => `${f.id} ${f.text}`).join('\n')
      const key = `${scope}${since}|${match.now < match.was ? 'down' : 'up'}|${told}`
      return explanationFor(key, scope, { venueName: venue.name, changes, match, profile: mine.profile })
    },

    // Match % includes the walk from `from`, so it agrees with the feed's.
    async search(user, query, limit, from = SMU) {
      const [state, prices] = await Promise.all([learners.read(user.id, user.me.displayName), livePrices()])
      const yours = yourScoresByVenue(state.reviews)
      const results = searchVenues(registry.searchIndex, query, {
        limit,
        scoreFn: (venue) => rankVenues(withLivePrices([withWalkFrom(from, venue)], prices), state.profile)[0].matchScore,
      })
      return results.map(({ venue, matchScore, highlight }) => ({
        id: venue.id,
        name: venue.name,
        area: venue.area ?? null,
        address: venue.address ?? null,
        cuisine: venue.cuisine ?? null,
        distanceMin: withWalkFrom(from, venue).distanceMin ?? null,
        matchScore,
        yourScore: yours.get(venue.id) ?? null,
        highlight,
      }))
    },
  }
}

// The venue with its walk time from `from`, when it has coordinates.
const withWalkFrom = (from, venue) => (venue.lat == null || venue.lon == null ? venue : { ...venue, distanceMin: walkMinutes(from, venue) })

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

// Closed venues drop out of the feed, so a closure "since your last visit" (CSD-50)
// can't sit on a card: places you visited that closed since lead the closed list, flagged.
function closedYourPlacesFirst(closed, visits) {
  const flagged = closed.map((v) => {
    const visit = visits.get(v.id)
    return visit && Date.parse(v.reportedAt) > Date.parse(visit) ? { ...v, closedSinceYourVisit: true } : v
  })
  return [...flagged.filter((v) => v.closedSinceYourVisit), ...flagged.filter((v) => !v.closedSinceYourVisit)]
}

// When you last reviewed anything at each venue (ISO time of your latest review there).
function lastVisitsByVenue(reviews) {
  const latest = new Map()
  for (const r of reviews) {
    if (!r.venueId || !r.at) continue
    const seen = latest.get(r.venueId)
    if (!seen || Date.parse(r.at) > Date.parse(seen)) latest.set(r.venueId, r.at)
  }
  return latest
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

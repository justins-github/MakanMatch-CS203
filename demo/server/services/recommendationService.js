// "For you" recommendations - for one person or a table of kakis - and
// personalised venue search.
import { createChangeExplainer, factsFor, templateExplanation } from '../changeExplainer.js'
import { BANNER_MIN_POINTS, WINDOW_DAYS, communityFor, reviewChange } from '../community.js'
import { applyDietary, vegetarianBoost } from '../dietary.js'
import { DEFAULT_WALK_MIN, SMU, nearestArea, venuesNear, walkMinutes } from '../geo.js'
import { AIMED_FLOOR, groupFind, groupSurprise } from '../groupMatch.js'
import { applyOpeningHours } from '../hours.js'
import { pickSurprise, priceLevel, rankVenues } from '../match.js'
import { searchVenues } from '../search.js'
import { createSliderVectors, learnedVector, tasteContext } from './tasteVectors.js'

const round1 = (v) => Math.round(v * 10) / 10
const CLOSED = new Set(['CLOSED', 'TEMPORARILY_CLOSED'])
const DAY_MS = 24 * 60 * 60 * 1000
const TOP = 10 // how many places Find shows
const MAX_DROPPED = 3
const byMatch = (a, b) => b.matchScore - a.matchScore
const standingBy = (reviews) => reviews.filter((r) => !r.undone).length

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

  // Other people's recent reviews at these venues (null = everywhere) and who wrote them.
  // If they can't be read we still recommend, as if nobody had said anything.
  async function crowdAt(venueIds) {
    try {
      const rows = await learners.recentReviewsAt(venueIds, new Date(now().getTime() - WINDOW_DAYS * DAY_MS).toISOString())
      return { rows, people: await learners.peopleFacts([...new Set(rows.map((r) => r.userId))]) }
    } catch {
      return { rows: [], people: new Map() }
    }
  }

  const viewerFrom = (person, state) => ({ id: person.id, profile: state.profile, reviewCount: standingBy(state.reviews) })
  const reviewsFor = (viewer, crowd) => communityFor(viewer, crowd.rows, crowd.people, now().getTime())

  // What match.js needs to rank `venues` for one person: their Taste DNA, taste vector
  // and what other people's reviews do for them. A taste set by hand (the Taste DNA
  // sliders) takes its vector from the sliders' cuisines, not from their reviews.
  const sliderVector = createSliderVectors(vectors, registry.venues ?? [])
  async function contextFor(person, venues, { raining, mood }, crowd) {
    const state = await learners.read(person.id, person.name)
    const byHand = Boolean(state.profile.setByHand)
    const vector = byHand
      ? await sliderVector(state.profile)
      : await learnedVector(vectors, state.reviews, registry.venueById)
    const taste = await tasteContext(vectors, vector, venues, byHand ? 'Close to the taste you set' : undefined)
    const viewer = viewerFrom(person, state)
    const ctx = { raining, mood, taste, community: reviewsFor(viewer, crowd) }
    return { state, ctx, viewer }
  }

  // CSD-51: live menu prices set a venue's price level; without them it keeps the registry's.
  // A venue the catalog prices has a menu (hasMenu), which an admin's review bomb needs.
  async function livePrices() {
    try {
      return await catalog.venuePrices()
    } catch {
      return new Map()
    }
  }
  const withLivePrices = (venues, prices) =>
    venues.map((v) => (prices.has(v.id) ? { ...v, priceTier: priceLevel(prices.get(v.id)), hasMenu: true } : v))

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
  async function rankedFor(person, venues, context, crowd) {
    const { state, ctx, viewer } = await contextFor(person, venues, context, crowd)
    const noReviews = { ...ctx, community: null }
    const scoreWith = (c) => (v) => vegetarianBoost(v, rankVenues([v], state.profile, c)[0].matchScore, person.restrictions)
    const rankWith = (c) => rankVenues(venues, state.profile, c)
      .map((v) => ({ ...v, matchScore: vegetarianBoost(v, v.matchScore, person.restrictions) }))
    return {
      ...person,
      adventurousness: state.profile.adventurousness,
      profile: state.profile,
      ranked: rankWith(ctx),
      score: scoreWith(ctx),
      scoreWithoutReviews: scoreWith(noReviews),
      rankedWithoutReviews: () => rankWith(noReviews),
      community: ctx.community,
      viewer,
    }
  }

  // Who wrote what, for showing faces: if account-service can't say, the card goes without.
  async function namesOf(user, ids) {
    try {
      return new Map((await accounts.people(user.token, ids)).map((p) => [p.id, p]))
    } catch {
      return new Map()
    }
  }

  // Cards whose match moved because of reviews say so. `you` = { community, viewer, scoreWithoutReviews }.
  async function withReviewChange(cards, you, user) {
    const changes = new Map()
    for (const card of cards) {
      const input = you.community.get(card.id)
      const change = input && reviewChange(input, you.scoreWithoutReviews(card), card.matchScore, you.viewer, now().getTime())
      if (change) changes.set(card.id, change)
    }
    if (changes.size === 0) return cards
    const people = await namesOf(user, [...new Set([...changes.values()].flatMap((c) => c.reviewerIds))])
    return cards.map((card) => {
      const change = changes.get(card.id)
      if (!change) return card
      const { reviewerIds, ...said } = change
      const reviewers = reviewerIds.filter((id) => people.has(id)).map((id) => ({ id, displayName: people.get(id).displayName }))
      return { ...card, reviewChange: { ...said, reviewers } }
    })
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
      const crowd = await crowdAt(allowed.map((v) => v.id))

      if (kakis.length === 0) {
        if (mode === 'surprise') {
          const { state, ctx, viewer } = await contextFor(me, allowed, scene, crowd)
          const pick = [pickSurprise(allowed, state.profile, ctx, exclude)].filter(Boolean)
          const score = (v) => rankVenues([v], state.profile, ctx)[0].matchScore
          const scoreWithoutReviews = (v) => rankVenues([v], state.profile, { ...ctx, community: null })[0].matchScore
          const cards = await withSinceLastVisit(pick, visits, { score, profile: state.profile })
          return { ...answer, venues: await withReviewChange(cards, { community: ctx.community, viewer, scoreWithoutReviews }, user) }
        }
        const you = await rankedFor(me, allowed, scene, crowd)
        const ranked = you.ranked.sort(byMatch)
        const top = ranked.slice(0, TOP)
        const dropped = droppedByReviews(ranked, you)
        const cards = await withSinceLastVisit([...top, ...dropped], visits, { score: you.score, profile: you.profile })
        const told = await withReviewChange(cards, you, user)
        return { ...answer, venues: told.slice(0, top.length), droppedByReviews: told.slice(top.length) }
      }

      const members = await Promise.all(people.map((p) => rankedFor(p, allowed, scene, crowd)))
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
      const { ranked, score } = await rankedFor(me, withLivePrices([venue], prices), { raining: false, mood: null }, await crowdAt([venueId]))
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
      const [state, prices, crowd] = await Promise.all([learners.read(user.id, user.me.displayName), livePrices(), crowdAt(null)])
      const yours = yourScoresByVenue(state.reviews)
      const community = reviewsFor(viewerFrom({ id: user.id }, state), crowd)
      const results = searchVenues(registry.searchIndex, query, {
        limit,
        scoreFn: (venue) => rankVenues(withLivePrices([withWalkFrom(from, venue)], prices), state.profile, { community })[0].matchScore,
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

// Places reviews pushed out of your top 10, so they don't just vanish: in the top 10
// without reviews, not with them, and moved enough to mention. Biggest drop first.
function droppedByReviews(ranked, you) {
  if (you.community.size === 0) return []
  const inTop = new Set(ranked.slice(0, TOP).map((v) => v.id))
  const now = new Map(ranked.map((v) => [v.id, v]))
  return you.rankedWithoutReviews().sort(byMatch).slice(0, TOP)
    .filter((v) => !inTop.has(v.id))
    .map((v) => ({ venue: now.get(v.id), drop: v.matchScore - now.get(v.id).matchScore }))
    .filter(({ drop }) => drop >= BANNER_MIN_POINTS)
    .sort((a, b) => b.drop - a.drop)
    .slice(0, MAX_DROPPED)
    .map(({ venue }) => venue)
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

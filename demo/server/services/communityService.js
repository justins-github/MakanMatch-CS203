// Reading other people's reviews: a venue's, closest to your taste first; a reviewer's
// profile, compared with yours; and what your kakis have been eating. Names come from
// account-service. Nothing here shows email, dietary needs or venues someone owns.
import { WINDOW_DAYS, agreementLines, closenessBetween, countsLabel, reviewWeight } from '../community.js'
import { notFound } from '../errors.js'
import { dimensionsFor } from './profileService.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_LISTED = 20
const READ_AT_VENUE = 200 // enough to find each person's latest
const PROFILE_REVIEWS = 10
const MAX_EATS = 10
const PEOPLE_PER_CALL = 50 // account-service's limit for GET /api/people

const asCard = ({ id, displayName, username }) => ({ id, displayName, username: username ?? null })

// "Willing to travel" is the same for everyone, so it would only look like agreement.
const comparableDimensions = (profile) => dimensionsFor(profile).filter((d) => d.key !== 'location')

// Newest-first rows -> each person's latest.
function latestPerPerson(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    if (seen.has(row.userId)) return false
    seen.add(row.userId)
    return true
  })
}

export function createCommunityService({ learners, accounts, registry, now = () => new Date() }) {
  async function viewerOf(user) {
    const { profile, reviews } = await learners.read(user.id, user.me.displayName)
    return { id: user.id, profile, reviewCount: reviews.filter((r) => !r.undone).length }
  }

  // Who these people are, leaving out unknown and disabled accounts; asked in batches,
  // since account-service answers at most PEOPLE_PER_CALL ids at a time.
  async function cardsOf(user, ids) {
    if (ids.length === 0) return new Map()
    const batches = []
    for (let i = 0; i < ids.length; i += PEOPLE_PER_CALL) batches.push(ids.slice(i, i + PEOPLE_PER_CALL))
    const cards = (await Promise.all(batches.map((batch) => accounts.people(user.token, batch)))).flat()
    return new Map(cards.map((card) => [card.id, asCard(card)]))
  }

  // Where you stand with people; a failed lookup only costs the tags.
  async function kakiLists(user) {
    try {
      const { kakis, outgoing } = await accounts.kakis(user.token)
      return { known: true, kakis: new Set(kakis.map((k) => k.id)), asked: new Set(outgoing.map((k) => k.id)) }
    } catch {
      return { known: false, kakis: new Set(), asked: new Set() }
    }
  }

  function publicReview(row, card, { viewer, person, isKaki }) {
    const isYou = row.userId === viewer.id
    const seen = person && !isYou ? reviewWeight(viewer, person, row, now().getTime()) : null
    return {
      reviewer: card,
      isYou,
      isKaki,
      closeness: seen?.known ? Math.round(seen.closeness * 100) : null,
      counts: seen && seen.recency > 0 ? countsLabel(seen.weight) : null,
      faded: Boolean(seen) && countsLabel(seen.weight) === countsLabel(0),
      sentiment: row.sentiment,
      text: row.text ?? '',
      dishId: row.dishId,
      dishName: row.dishName,
      venueId: row.venueId,
      venueName: registry.venueById.get(row.venueId)?.name ?? '',
      at: row.at,
    }
  }

  // Your own first, then the ones that count by how much they count, then the rest, newest first.
  function closestFirst(rows, viewer, people) {
    const nowMs = now().getTime()
    const rank = (row) => {
      if (row.userId === viewer.id) return { group: 0, weight: 0 }
      const { weight, recency } = reviewWeight(viewer, people.get(row.userId), row, nowMs)
      return { group: recency > 0 ? 1 : 2, weight }
    }
    return rows
      .map((row) => ({ row, ...rank(row) }))
      .sort((a, b) => a.group - b.group || b.weight - a.weight || Date.parse(b.row.at) - Date.parse(a.row.at))
      .map(({ row }) => row)
  }

  return {
    async venueReviews(user, venueId) {
      if (!registry.venueById.has(venueId)) throw notFound('No such venue')
      const rows = latestPerPerson(await learners.reviewsAtVenue(venueId, READ_AT_VENUE))
      const [viewer, people, lists] = await Promise.all([
        viewerOf(user),
        learners.peopleFacts(rows.map((r) => r.userId)),
        kakiLists(user),
      ])
      const known = rows.filter((row) => row.userId === viewer.id || people.has(row.userId))
      const listed = closestFirst(known, viewer, people).slice(0, MAX_LISTED)
      const cards = await cardsOf(user, listed.map((r) => r.userId))
      return {
        reviews: listed
          .filter((row) => cards.has(row.userId)) // a disabled account isn't returned
          .map((row) => publicReview(row, cards.get(row.userId), {
            viewer, person: people.get(row.userId), isKaki: lists.kakis.has(row.userId),
          })),
      }
    },

    async reviewer(user, id) {
      if (!UUID.test(id)) throw notFound('No such person')
      const card = (await cardsOf(user, [id])).get(id)
      if (!card) throw notFound('No such person')
      const [viewer, facts, rows, lists] = await Promise.all([
        viewerOf(user),
        learners.peopleFacts([id]),
        learners.reviewsByPeople([id], { limit: PROFILE_REVIEWS }),
        kakiLists(user),
      ])
      const isYou = id === user.id
      const person = facts.get(id)
      const closeness = person && !isYou ? closenessBetween(viewer, person) : null
      const dimensions = person ? comparableDimensions(person.profile) : null
      const yourDimensions = comparableDimensions(viewer.profile)
      const isKaki = lists.kakis.has(id)
      const standing = () => {
        if (isYou) return null
        if (!lists.known) return 'unknown'
        if (isKaki) return 'kaki'
        return lists.asked.has(id) ? 'asked' : null
      }
      return {
        ...card,
        reviewCount: person?.reviewCount ?? 0,
        isYou,
        closeness: closeness?.known ? Math.round(closeness.value * 100) : null,
        dimensions,
        yourDimensions,
        agreements: dimensions && !isYou ? agreementLines(yourDimensions, dimensions) : [],
        reviews: rows.map((row) => publicReview(row, card, { viewer, person, isKaki })),
        kakiStatus: standing(),
      }
    },

    async recentEats(user) {
      const { kakis } = await accounts.kakis(user.token)
      if (kakis.length === 0) return { eats: [] }
      const since = new Date(now().getTime() - WINDOW_DAYS * DAY_MS).toISOString()
      // The kaki list keeps a kaki whose account was disabled; the people lookup doesn't.
      // If it can't be asked, the list's own names will do.
      const cards = await cardsOf(user, kakis.map((k) => k.id))
        .catch(() => new Map(kakis.map((k) => [k.id, asCard(k)])))
      if (cards.size === 0) return { eats: [] }
      const rows = await learners.reviewsByPeople([...cards.keys()], { limit: MAX_EATS, since })
      const [viewer, people] = await Promise.all([viewerOf(user), learners.peopleFacts([...new Set(rows.map((r) => r.userId))])])
      return {
        eats: rows.map((row) => publicReview(row, cards.get(row.userId), { viewer, person: people.get(row.userId), isKaki: true })),
      }
    },
  }
}

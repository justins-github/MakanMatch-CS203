// The review flow for one user: a venue's dishes with the AI's predictions, the
// user's rankings, and posting reviews (which retrain their Taste DNA).
// Dishes and prices belong to catalog-service; this service keeps the taste
// features the AI needs (curated for seed dishes; null for everything else, which
// Claude estimates when a review needs it).
import { badRequest, conflict, forbidden, notFound } from '../errors.js'
import {
  REVIEW_TAGS,
  SENTIMENTS,
  applyBeliReview,
  applyReview,
  getAccuracy,
  predictDishScore,
  priceTierFor,
  undoLatestReview,
} from '../learn.js'
import { createDishEstimator } from '../dishEstimator.js'
import { createReviewReader } from '../reviewReader.js'
import { learnedVector } from './tasteVectors.js'

const round1 = (v) => Math.round(v * 10) / 10
const numberOrNull = (v) => (v == null || v === '' ? null : Number(v))

// `reader` reads review text (reviewReader.js); without one, keywords do it.
// `estimator` estimates uncurated dishes (dishEstimator.js); without one they stay unknown.
export function createReviewService({
  registry, learners, catalog, seedDishes, vectors, reader = createReviewReader({ ai: null }), estimator = createDishEstimator({ ai: null }),
}) {
  const seedById = new Map(seedDishes.map((d) => [d.id, d]))
  const seedAsCatalogDish = (s) => ({ id: s.id, venueId: s.venueId, name: s.name, price: s.price, source: 'SEED' })

  // Catalog dish -> what learn.js needs, plus the catalog's price facts for display.
  function toEngineDish(d) {
    const seed = seedById.get(d.id)
    const price = numberOrNull(d.price) ?? seed?.price ?? null
    return {
      id: d.id,
      venueId: d.venueId,
      name: d.name,
      price,
      priceTier: seed?.priceTier ?? priceTierFor(price),
      spice: seed?.spice ?? null,
      richness: seed?.richness ?? null,
      novelty: seed?.novelty ?? null,
      tags: seed?.tags ?? [],
      source: d.source ?? 'SEED',
      officialPrice: numberOrNull(d.officialPrice),
      communityPrice: numberOrNull(d.communityPrice),
      priceConflict: Boolean(d.priceConflict),
    }
  }

  // Falls back to the curated seeds when the catalog is unreachable.
  async function findDish(dishId) {
    try {
      const found = await catalog.dish(dishId)
      return found ? toEngineDish(found) : null
    } catch (err) {
      if (seedById.has(dishId)) return toEngineDish(seedAsCatalogDish(seedById.get(dishId)))
      throw err
    }
  }

  // Duel opponents are dishes this user ranked before: ask the catalog, then the
  // seeds, then fall back to the snapshot in the user's own review.
  async function findRankedDishes(state, ids) {
    const found = new Map()
    if (ids.length) {
      try {
        for (const d of await catalog.dishes(ids)) found.set(d.id, toEngineDish(d))
      } catch {
        // fallbacks below
      }
    }
    for (const id of ids) {
      if (found.has(id)) continue
      if (seedById.has(id)) {
        found.set(id, toEngineDish(seedAsCatalogDish(seedById.get(id))))
        continue
      }
      const snapshot = state.reviews.findLast((r) => r.dishId === id)
      if (snapshot) found.set(id, toEngineDish({ id, venueId: snapshot.venueId, name: snapshot.dishName }))
    }
    return found
  }

  const withCuisine = (dish) => ({ ...dish, cuisine: dish.cuisine ?? registry.venueById.get(dish.venueId)?.cuisine ?? null })

  // Dish id -> Claude's estimate of it, for the dishes it has something to say about.
  async function estimatesFor(dishes) {
    return new Map(await Promise.all(dishes.map(async (d) => [d.id, await estimator.estimate(d, registry.venueById.get(d.venueId))])))
  }
  const manages = (user, venueId) => (user.me.ownedVenues ?? []).some((v) => v.venueId === venueId)

  function venueOf(dish) {
    const venue = registry.venueById.get(dish.venueId)
    if (!venue) throw badRequest(`dish "${dish.id}" belongs to an unknown venue`)
    return venue
  }

  // Owners reviewing their own venue would be a conflict of interest.
  function assertMayReview(user, dish) {
    if (manages(user, dish.venueId)) throw forbidden("You manage this venue, so you can't review it")
  }

  // Runs one learning step under the user's lock and persists the result,
  // including the refreshed taste vector (an AI output we keep).
  // A review teaches the profile, so a taste set by hand (the Taste DNA sliders) goes
  // back to being learned. The review's undo snapshot was taken before, so undo puts the
  // hand-set taste back.
  function learn(user, step) {
    return learners.update(user.id, user.me.displayName, async (state) => {
      const result = await step(state)
      delete state.profile.setByHand
      const tasteVector = await learnedVector(vectors, state.reviews, registry.venueById).catch(() => undefined)
      return { result, review: result.review, tasteVector }
    })
  }

  return {
    async venueDishes(user, venueId) {
      const venue = registry.venueById.get(venueId)
      if (!venue) throw notFound('No such venue')
      let dishes
      let degraded = false
      try {
        dishes = (await catalog.menu(venueId)) ?? []
      } catch {
        dishes = seedDishes.filter((d) => d.venueId === venueId).map(seedAsCatalogDish)
        degraded = true
      }
      const state = await learners.read(user.id, user.me.displayName)
      const latest = new Map()
      for (const r of state.reviews) if (r.score10 !== undefined) latest.set(r.dishId, r)
      return {
        accuracy: getAccuracy(state),
        degraded,
        youManageThisVenue: manages(user, venueId),
        dishes: dishes.map(toEngineDish).map((dish) => {
          const predicted = predictDishScore(dish, venue.cuisine, state.profile)
          return {
            ...dish,
            venueName: venue.name,
            cuisine: venue.cuisine,
            predicted,
            predictedScore10: round1(predicted / 10),
            rated: latest.get(dish.id) ?? null,
          }
        }),
      }
    },

    async rankings(user) {
      const state = await learners.read(user.id, user.me.displayName)
      const latest = new Map(state.reviews.map((r) => [r.dishId, r]))
      return state.rankings.map((dishId, i) => {
        const review = latest.get(dishId)
        return {
          rank: i + 1,
          dishId,
          name: review?.dishName ?? 'Unknown dish',
          venueName: registry.venueById.get(review?.venueId)?.name ?? '',
          score10: review?.score10 ?? null,
        }
      })
    },

    // Beli-style: sentiment + head-to-head duels + free text, inserted into the ranking.
    async submitBeli(user, body) {
      const { dishId, sentiment, insertIndex, duels = [], text = '' } = body ?? {}
      if (!SENTIMENTS.includes(sentiment)) throw badRequest(`sentiment must be one of ${SENTIMENTS.join(', ')}`)
      if (!Number.isInteger(insertIndex) || insertIndex < 0) throw badRequest('insertIndex must be a non-negative integer')
      if (!Array.isArray(duels) || duels.length > 5) throw badRequest('duels must be an array of at most 5 comparisons')
      if (typeof text !== 'string' || text.length > 1000) throw badRequest('text must be a string of at most 1000 chars')

      const dish = await findDish(dishId)
      if (!dish) throw badRequest(`unknown dishId "${dishId}"`)
      const venue = venueOf(dish)
      assertMayReview(user, dish)

      const before = await learners.read(user.id, user.me.displayName)
      const opponentIds = [...new Set(duels.flatMap((d) => [d?.winnerId, d?.loserId]))].filter((id) => id && id !== dish.id)
      const known = await findRankedDishes(before, opponentIds)
      known.set(dish.id, dish)
      const pairs = duels.map(({ winnerId, loserId } = {}) => {
        const winner = known.get(winnerId)
        const loser = known.get(loserId)
        if (!winner || !loser) throw badRequest('duel references an unknown dish')
        return { winner, loser }
      })

      // Ask Claude before taking the learning lock, so a slow answer doesn't hold
      // up this user's other writes.
      const [reading, estimates] = await Promise.all([
        reader.read({ text, dish, venue, sentiment, profile: before.profile }),
        estimatesFor([...known.values()]),
      ])
      // A duel takes only the cuisine from an estimate. Comparing two dishes' spice or
      // richness needs curated values: the gap would be mostly the estimate's own error,
      // and "preferred it" doesn't say the spice was why.
      const inDuel = (d) => withCuisine({ ...d, cuisine: estimates.get(d.id)?.cuisine })
      const resolved = pairs.map(({ winner, loser }) => ({ winner: inDuel(winner), loser: inDuel(loser) }))

      return learn(user, async (state) =>
        applyBeliReview(state, dish, venue, { sentiment, duels: resolved, insertIndex, text, reading, estimate: estimates.get(dish.id) }))
    },

    // Undo (CSD-54): takes back what the AI learned from the review just posted,
    // named by its dish and time so a stale screen can't undo a newer review.
    // The review, its score and the ranking stay.
    async undoLatest(user, body) {
      const { dishId, at } = body ?? {}
      if (typeof dishId !== 'string' || typeof at !== 'string') throw badRequest('dishId and at are required')
      return learners.update(user.id, user.me.displayName, async (state) => {
        const result = undoLatestReview(state, { dishId, at })
        if (!result) throw conflict("That's no longer your latest review, or it was already undone")
        return { result: { undone: true, profile: result.profile, accuracy: result.accuracy }, undone: true }
      })
    },

    // Star-rating route (kept for API clients; the app uses the Beli flow).
    async submitRating(user, body) {
      const { dishId, rating, tags = [] } = body ?? {}
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest('rating must be an integer 1-5')
      if (!Array.isArray(tags) || tags.some((t) => !REVIEW_TAGS.includes(t))) {
        throw badRequest(`tags must be a subset of ${REVIEW_TAGS.join(', ')}`)
      }
      const dish = await findDish(dishId)
      if (!dish) throw badRequest(`unknown dishId "${dishId}"`)
      const venue = venueOf(dish)
      assertMayReview(user, dish)
      return learn(user, async (state) => applyReview(state, dish, venue, rating, tags))
    },

    // "Reset demo": forget what this user taught the AI (never touches anyone else).
    reset: (user) => learners.reset(user.id),
  }
}

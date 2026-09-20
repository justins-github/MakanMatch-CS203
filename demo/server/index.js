import express from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { rankVenues, pickSurprise } from './match.js'
import { MAX_WALK_MIN } from './geo.js'
import { loadRegistry } from './registry.js'
import { searchVenues } from './search.js'
import { getContext } from './weather.js'
import {
  REVIEW_TAGS,
  SENTIMENTS,
  addUserDish,
  applyBeliReview,
  applyReview,
  getAccuracy,
  getProfile,
  getRankings,
  getReviews,
  getUserDishes,
  predictDishScore,
  resetState,
} from './learn.js'

const here = dirname(fileURLToPath(import.meta.url))
const seedDishes = JSON.parse(readFileSync(join(here, 'data', 'dishes.json'), 'utf8'))
const { venues, venueById, searchIndex } = loadRegistry()

const allDishes = () => [...seedDishes, ...getUserDishes()]
const findDish = (id) => allDishes().find((d) => d.id === id)
const round1 = (v) => Math.round(v * 10) / 10

const MOODS = ['none', 'soupy', 'spicy', 'light']

// Latest scored review per dish id.
function latestScoresByDish() {
  const map = new Map()
  for (const r of getReviews()) if (r.score10 !== undefined) map.set(r.dishId, r)
  return map
}

const app = express()
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// ?rain=1 forces a (labelled) simulated rain context for demos.
function withRainOverride(context, req) {
  if (req.query.rain !== '1') return context
  return {
    ...context,
    raining: true,
    summary: 'Simulated rain (demo toggle)',
    simulated: true,
  }
}

app.get('/api/context', async (req, res) => {
  res.json(withRainOverride(await getContext(), req))
})

app.get('/api/profile', (_req, res) => {
  const profile = getProfile()
  const affinities = Object.values(profile.cuisineAffinity)
  const breadth = affinities.reduce((a, b) => a + b, 0) / affinities.length
  res.json({
    user: profile,
    dimensions: [
      { key: 'cuisine', label: 'Cuisine breadth', value: Number(breadth.toFixed(2)) },
      { key: 'price', label: 'Price comfort', value: Number((profile.priceComfort / 2).toFixed(2)) },
      { key: 'spice', label: 'Spice', value: Number(profile.spicePref.toFixed(2)) },
      { key: 'richness', label: 'Richness', value: Number(profile.richnessPref.toFixed(2)) },
      { key: 'location', label: 'Willing to travel', value: 0.45 },
      { key: 'adventurousness', label: 'Adventurousness', value: Number(profile.adventurousness.toFixed(2)) },
    ],
    accuracy: getAccuracy(),
  })
})

// For You: top-10 walkable matches, or one experimental Surprise pick.
app.get('/api/recommendations', async (req, res) => {
  const mode = req.query.mode === 'surprise' ? 'surprise' : 'find'
  const mood = MOODS.includes(req.query.mood) ? req.query.mood : 'none'
  const context = withRainOverride(await getContext(), req)
  const ctx = { raining: context.raining, mood }
  const nearby = venues.filter((v) => v.distanceMin <= MAX_WALK_MIN)
  if (mode === 'surprise') {
    const exclude = String(req.query.exclude ?? '').split(',').filter(Boolean)
    const pick = pickSurprise(nearby, getProfile(), ctx, exclude)
    return res.json({ context, mood, mode, venues: pick ? [pick] : [] })
  }
  res.json({ context, mood, mode, venues: rankVenues(nearby, getProfile(), ctx).slice(0, 10) })
})

// Typeahead venue search; echoes q so the client can drop stale responses.
app.get('/api/venues/search', (req, res) => {
  const q = String(req.query.q ?? '')
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 8, 1), 20)
  const profile = getProfile()
  const scores = latestScoresByDish()
  const results = searchVenues(searchIndex, q, {
    limit,
    scoreFn: (venue) => rankVenues([venue], profile)[0].matchScore,
  })
  res.json({
    q,
    results: results.map(({ venue, matchScore, highlight }) => {
      const mine = allDishes()
        .filter((d) => d.venueId === venue.id && scores.has(d.id))
        .map((d) => scores.get(d.id).score10)
      return {
        id: venue.id,
        name: venue.name,
        area: venue.area ?? null,
        address: venue.address ?? null,
        cuisine: venue.cuisine ?? null,
        distanceMin: venue.distanceMin,
        matchScore,
        yourScore: mine.length ? round1(mine.reduce((a, b) => a + b, 0) / mine.length) : null,
        highlight,
      }
    }),
  })
})

app.get('/api/dishes', (_req, res) => {
  const profile = getProfile()
  const scores = latestScoresByDish()
  res.json({
    accuracy: getAccuracy(),
    dishes: allDishes().map((dish) => {
      const venue = venueById.get(dish.venueId)
      const predicted = predictDishScore(dish, venue.cuisine, profile)
      return {
        ...dish,
        venueName: venue.name,
        cuisine: venue.cuisine,
        predicted,
        predictedScore10: round1(predicted / 10),
        rated: scores.get(dish.id) ?? null,
      }
    }),
  })
})

// The user's personal ranked list, best first.
app.get('/api/rankings', (_req, res) => {
  const scores = latestScoresByDish()
  res.json(
    getRankings().map((dishId, i) => {
      const dish = findDish(dishId)
      return {
        rank: i + 1,
        dishId,
        name: dish.name,
        venueName: venueById.get(dish.venueId).name,
        score10: scores.get(dishId)?.score10 ?? null,
      }
    }),
  )
})

// User-generated menu entries - "the menu emerges from reviews".
app.post('/api/dishes', (req, res) => {
  const { venueId, name, price = 5 } = req.body ?? {}
  if (!venueById.has(venueId)) return res.status(400).json({ error: `unknown venueId "${venueId}"` })
  if (typeof name !== 'string' || !name.trim() || name.length > 60) {
    return res.status(400).json({ error: 'name must be a non-empty string of at most 60 chars' })
  }
  if (typeof price !== 'number' || price < 0 || price > 200) {
    return res.status(400).json({ error: 'price must be a number between 0 and 200' })
  }
  res.json(addUserDish({ venueId, name: name.trim(), price }))
})

// Beli-style review: sentiment + duels + text + rank insertion.
app.post('/api/reviews/beli', (req, res) => {
  const { dishId, sentiment, insertIndex, duels = [], text = '' } = req.body ?? {}
  const dish = findDish(dishId)
  if (!dish) return res.status(400).json({ error: `unknown dishId "${dishId}"` })
  if (!SENTIMENTS.includes(sentiment)) {
    return res.status(400).json({ error: `sentiment must be one of ${SENTIMENTS.join(', ')}` })
  }
  if (!Number.isInteger(insertIndex) || insertIndex < 0) {
    return res.status(400).json({ error: 'insertIndex must be a non-negative integer' })
  }
  if (!Array.isArray(duels) || duels.length > 5) {
    return res.status(400).json({ error: 'duels must be an array of at most 5 comparisons' })
  }
  if (typeof text !== 'string' || text.length > 1000) {
    return res.status(400).json({ error: 'text must be a string of at most 1000 chars' })
  }
  const resolved = []
  for (const { winnerId, loserId } of duels) {
    const winner = findDish(winnerId)
    const loser = findDish(loserId)
    if (!winner || !loser) return res.status(400).json({ error: 'duel references an unknown dish' })
    resolved.push({
      winner: { ...winner, cuisine: venueById.get(winner.venueId).cuisine },
      loser: { ...loser, cuisine: venueById.get(loser.venueId).cuisine },
    })
  }
  const venue = venueById.get(dish.venueId)
  res.json(applyBeliReview(dish, venue, { sentiment, duels: resolved, insertIndex, text }))
})

// Star-rating review route (the UI uses /api/reviews/beli).
app.post('/api/reviews', (req, res) => {
  const { dishId, rating, tags = [] } = req.body ?? {}
  const dish = findDish(dishId)
  if (!dish) return res.status(400).json({ error: `unknown dishId "${dishId}"` })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be an integer 1-5' })
  }
  if (!Array.isArray(tags) || tags.some((t) => !REVIEW_TAGS.includes(t))) {
    return res.status(400).json({ error: `tags must be a subset of ${REVIEW_TAGS.join(', ')}` })
  }
  res.json(applyReview(dish, venueById.get(dish.venueId), rating, tags))
})

app.post('/api/reset', (_req, res) => {
  resetState()
  res.json({ ok: true })
})

app.listen(3001, () => console.log('api on :3001'))

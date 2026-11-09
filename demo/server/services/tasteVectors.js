// Where venue prior vectors come from for the learned-taste term in match.js:
//   pgVectorSource   - pgvector in Postgres (when taste.venue_embeddings is filled)
//   fileVectorSource - the int8 files in data/ (no database, or table still empty)
// Both answer the same two async questions, so callers don't care which is used.
import { userVector, venueScores } from '../vectors.js'

export function fileVectorSource(store) {
  return {
    kind: 'files',
    size: store.size,
    model: store.model,
    async vectorsFor(gersIds) {
      const found = new Map()
      for (const id of gersIds) {
        const v = store.vectorFor(id)
        if (v) found.set(id, v)
      }
      return found
    },
    async similarities(gersIds, vector) {
      const found = new Map()
      for (const id of gersIds) {
        const s = store.similarity(id, vector)
        if (s != null) found.set(id, s)
      }
      return found
    },
  }
}

export function pgVectorSource(embeddings, { size, model }) {
  return {
    kind: 'pgvector',
    size,
    model,
    vectorsFor: (gersIds) => embeddings.vectorsFor(gersIds),
    similarities: (gersIds, vector) => embeddings.similarities(gersIds, vector),
  }
}

// The user's learned taste vector: venues they rated above 5/10, weighted by how
// far above. Null until something qualifies.
export async function learnedVector(source, reviews, venueById) {
  if (!source || source.size === 0) return null
  const venueOfDish = new Map(reviews.map((r) => [r.dishId, r.venueId]))
  const ranked = venueScores(reviews, (dishId) => ({ venueId: venueOfDish.get(dishId) }), (id) => venueById.get(id))
  if (ranked.length === 0) return null
  const vectors = await source.vectorsFor(ranked.map((r) => r.gersId))
  if (vectors.size === 0) return null
  const dim = vectors.values().next().value.length
  return userVector({ size: vectors.size, dim, vectorFor: (id) => vectors.get(id) ?? null }, ranked)
}

// A taste set by hand (the Taste DNA sliders) has no reviews to learn a vector from, so
// it gets one from its cuisines: the mean embedding of up to PER_CUISINE places of each
// cuisine set above the middle, each cuisine weighted by how far above. Null when none
// is. Returns vectorFor(profile); the same sliders are worked out once.
const PER_CUISINE = 40
const MIDDLE = 0.5
const MEMO_SIZE = 50

export function createSliderVectors(source, venues) {
  const byCuisine = new Map() // cuisine -> the first PER_CUISINE places' embedding ids
  for (const { cuisine, gersId } of venues) {
    if (!cuisine || !gersId) continue
    const ids = byCuisine.get(cuisine) ?? []
    if (ids.length < PER_CUISINE) byCuisine.set(cuisine, [...ids, gersId])
  }
  const memo = new Map()

  return function vectorFor(profile) {
    if (!source || source.size === 0) return Promise.resolve(null)
    const weights = Object.entries(profile.cuisineAffinity ?? {})
      .filter(([cuisine, affinity]) => affinity > MIDDLE && byCuisine.has(cuisine))
      .map(([cuisine, affinity]) => [cuisine, Math.round((affinity - MIDDLE) * 1000) / 1000])
      .sort(([a], [b]) => a.localeCompare(b))
    if (weights.length === 0) return Promise.resolve(null)
    const key = JSON.stringify(weights)
    if (!memo.has(key)) {
      if (memo.size >= MEMO_SIZE) memo.clear()
      memo.set(key, centroid(source, weights, byCuisine).catch(() => {
        memo.delete(key) // try again next time
        return null
      }))
    }
    return memo.get(key)
  }
}

async function centroid(source, weights, byCuisine) {
  const vectors = await source.vectorsFor(weights.flatMap(([cuisine]) => byCuisine.get(cuisine)))
  let sum = null
  for (const [cuisine, weight] of weights) {
    const found = byCuisine.get(cuisine).map((id) => vectors.get(id)).filter(Boolean)
    for (const v of found) {
      sum ??= new Float32Array(v.length)
      for (let i = 0; i < v.length; i++) sum[i] += (weight / found.length) * v[i]
    }
  }
  if (!sum) return null
  const norm = Math.hypot(...sum)
  return norm === 0 ? null : sum.map((x) => x / norm)
}

// What match.js expects as context.taste: a synchronous similarity lookup, answered
// from one batched query over the venues being ranked. `why` is the chip a close venue
// gets, when the vector didn't come from the person's reviews.
export async function tasteContext(source, vector, venues, why = undefined) {
  if (!vector) return null
  const similarities = await source.similarities(venues.map((v) => v.gersId).filter(Boolean), vector)
  return { store: { similarity: (gersId) => similarities.get(gersId) ?? null }, vector, ...(why ? { why } : {}) }
}

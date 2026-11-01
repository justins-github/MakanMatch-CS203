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

// What match.js expects as context.taste: a synchronous similarity lookup,
// answered from one batched query over the venues being ranked.
export async function tasteContext(source, vector, venues) {
  if (!vector) return null
  const similarities = await source.similarities(venues.map((v) => v.gersId).filter(Boolean), vector)
  return { store: { similarity: (gersId) => similarities.get(gersId) ?? null }, vector }
}

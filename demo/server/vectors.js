// Venue prior vectors: int8-quantised sentence embeddings built offline by
// scripts/embed-venues.mjs. The server only does arithmetic here - no model at runtime.
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const SCALE = 127

// Unit-vector float32 → int8 (and back). Cosine survives the rounding to ~0.01.
export const quantise = (vec) => Int8Array.from(vec, (x) => Math.round(Math.max(-1, Math.min(1, x)) * SCALE))
export const dequantise = (int8) => Float32Array.from(int8, (x) => x / SCALE)

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na * nb)
  return denom === 0 ? 0 : dot / denom
}

// Wraps a manifest ({ dim, ids, model }) and its int8 matrix (rows in `ids` order).
export function createStore(manifest, int8) {
  const { dim, ids, model } = manifest
  const rowById = new Map(ids.map((id, i) => [id, i]))
  const row = (id) => {
    const i = rowById.get(id)
    return i === undefined ? null : int8.subarray(i * dim, (i + 1) * dim)
  }
  return {
    size: ids.length,
    dim,
    model,
    has: (id) => rowById.has(id),
    vectorFor: (id) => {
      const r = row(id)
      return r ? dequantise(r) : null
    },
    similarity: (id, vec) => {
      const r = row(id)
      return r ? cosine(r, vec) : null
    },
  }
}

export const emptyStore = () => createStore({ dim: 0, ids: [], model: null }, new Int8Array(0))

// Loads venue_vectors.{json,bin} from a data dir; missing files give an empty store.
export function loadVectorStore(dir) {
  const manifestPath = join(dir, 'venue_vectors.json')
  const binPath = join(dir, 'venue_vectors.bin')
  if (!existsSync(manifestPath) || !existsSync(binPath)) return emptyStore()
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const buf = readFileSync(binPath)
  const int8 = new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  return createStore(manifest, int8)
}

// Best review score per venue, keyed by gersId, from per-dish reviews.
export function venueScores(reviews, dishFor, venueFor) {
  const best = new Map()
  for (const r of reviews) {
    if (r.score10 == null) continue
    const gersId = venueFor(dishFor(r.dishId)?.venueId)?.gersId
    if (!gersId) continue
    if (!best.has(gersId) || r.score10 > best.get(gersId)) best.set(gersId, r.score10)
  }
  return [...best].map(([gersId, score10]) => ({ gersId, score10 }))
}

// The user's taste vector: mean of the priors of venues they ranked above 5/10,
// weighted by how far above. Null when nothing qualifies.
export function userVector(store, ranked) {
  if (store.size === 0) return null
  const acc = new Float32Array(store.dim)
  let total = 0
  for (const { gersId, score10 } of ranked) {
    const w = (score10 ?? 0) - 5
    if (w <= 0) continue
    const v = store.vectorFor(gersId)
    if (!v) continue
    for (let i = 0; i < acc.length; i++) acc[i] += w * v[i]
    total += w
  }
  if (total === 0) return null
  let norm = 0
  for (let i = 0; i < acc.length; i++) norm += acc[i] * acc[i]
  norm = Math.sqrt(norm)
  for (let i = 0; i < acc.length; i++) acc[i] /= norm
  return acc
}

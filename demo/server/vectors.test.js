import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cosine, quantise, dequantise, createStore, loadVectorStore, userVector, venueScores } from './vectors.js'

const unit = (arr) => {
  const n = Math.hypot(...arr)
  return Float32Array.from(arr, (x) => x / n)
}

test('quantise/dequantise round-trips a unit vector within int8 precision', () => {
  const v = unit([0.3, -0.7, 0.1, 0.62])
  const back = dequantise(quantise(v))
  for (let i = 0; i < v.length; i++) assert.ok(Math.abs(back[i] - v[i]) < 0.01)
})

test('cosine is 1 for identical, 0 for orthogonal unit vectors', () => {
  const a = unit([1, 0, 0]), b = unit([0, 1, 0])
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-6)
  assert.ok(Math.abs(cosine(a, b)) < 1e-6)
})

function twoVenueStore() {
  const dim = 3
  const rows = [unit([1, 0, 0]), unit([0, 1, 0])]
  const bin = new Int8Array(dim * rows.length)
  rows.forEach((r, i) => bin.set(quantise(r), i * dim))
  return createStore({ dim, ids: ['a', 'b'], model: 'test' }, bin)
}

test('createStore looks up a venue vector by gersId', () => {
  const store = twoVenueStore()
  assert.equal(store.size, 2)
  assert.ok(store.has('a'))
  assert.ok(!store.has('zzz'))
  assert.equal(store.vectorFor('zzz'), null)
  assert.ok(Math.abs(store.vectorFor('b')[1] - 1) < 0.01)
})

test('store.similarity compares a venue against a query vector', () => {
  const store = twoVenueStore()
  const q = unit([1, 0, 0])
  assert.ok(store.similarity('a', q) > 0.99)
  assert.ok(store.similarity('b', q) < 0.01)
  assert.equal(store.similarity('zzz', q), null)
})

test('userVector weights ranked venues by how far above 5/10 they scored', () => {
  const store = twoVenueStore()
  // a: 9/10 (weight 4), b: 6/10 (weight 1) → leans strongly toward a
  const u = userVector(store, [{ gersId: 'a', score10: 9 }, { gersId: 'b', score10: 6 }])
  assert.ok(u[0] > u[1])
  assert.ok(Math.abs(Math.hypot(...u) - 1) < 1e-6, 'normalised')
})

test('userVector ignores venues rated 5 or below and returns null with no evidence', () => {
  const store = twoVenueStore()
  assert.equal(userVector(store, [{ gersId: 'a', score10: 4 }]), null)
  assert.equal(userVector(store, [{ gersId: 'zzz', score10: 9 }]), null)
  assert.equal(userVector(store, []), null)
  const u = userVector(store, [{ gersId: 'a', score10: 8 }, { gersId: 'b', score10: 3 }])
  assert.ok(Math.abs(u[1]) < 0.01, 'b contributed nothing')
})

test('loadVectorStore returns an empty store when the files are missing', () => {
  const store = loadVectorStore(join(tmpdir(), 'no-such-dir-' + Date.now()))
  assert.equal(store.size, 0)
  assert.ok(!store.has('a'))
})

test('loadVectorStore reads the manifest and int8 file from disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vec-'))
  const dim = 2
  const bin = new Int8Array(dim * 1)
  bin.set(quantise(unit([0, 1])), 0)
  writeFileSync(join(dir, 'venue_vectors.json'), JSON.stringify({ dim, ids: ['x'], model: 'test' }))
  writeFileSync(join(dir, 'venue_vectors.bin'), Buffer.from(bin.buffer))
  const store = loadVectorStore(dir)
  assert.equal(store.size, 1)
  assert.ok(store.similarity('x', unit([0, 1])) > 0.99)
})

test('venueScores collapses per-dish reviews to the best score per venue gersId', () => {
  const reviews = [
    { dishId: 'd1', score10: 8.5 },
    { dishId: 'd2', score10: 6 },   // same venue as d1 → keep 8.5
    { dishId: 'd3', score10: 9 },   // venue without a gersId → dropped
    { dishId: 'd4', score10: 7 },   // unknown dish → dropped
  ]
  const dishes = { d1: { venueId: 'v1' }, d2: { venueId: 'v1' }, d3: { venueId: 'v2' } }
  const venues = { v1: { gersId: 'g1' }, v2: {} }
  const out = venueScores(reviews, (id) => dishes[id], (id) => venues[id])
  assert.deepEqual(out, [{ gersId: 'g1', score10: 8.5 }])
})

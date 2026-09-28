// Runs the repositories' SQL against a real Postgres (embedded PGlite with
// pgvector), after applying the same migrations production uses.
import test from 'node:test'
import assert from 'node:assert/strict'
import { migrate } from '../db/migrate.js'
import { openDatabase } from '../db/pool.js'
import { rankingRepository } from './rankingRepository.js'
import { reviewRepository } from './reviewRepository.js'
import { tasteProfileRepository } from './tasteProfileRepository.js'
import { venueEmbeddingRepository } from './venueEmbeddingRepository.js'

const USER = '77777777-7777-7777-7777-777777777777'
const db = await openDatabase({ pglite: null })
test.after(() => db.close())

// A 384-dim unit vector pointing mostly along `axis`.
function unit(axis, lean = 0) {
  const v = new Float32Array(384)
  v[axis] = 1
  v[(axis + 1) % 384] = lean
  const norm = Math.hypot(...v)
  return v.map((x) => x / norm)
}

test('migrations apply once and are recorded', async () => {
  const first = await migrate(db)
  assert.deepEqual(first, [
    '001_create_reviews.sql',
    '002_create_rankings.sql',
    '003_create_taste_profiles.sql',
    '004_create_venue_embeddings.sql',
  ])
  assert.deepEqual(await migrate(db), [])
})

test('reviews round-trip in the shape learn.js uses', async () => {
  const reviews = reviewRepository(db)
  await reviews.insert(USER, {
    dishId: 'kebab-1', dishName: 'Chicken doner wrap', venueId: 'turks-kebab', rating: 5, sentiment: 'loved',
    tags: [], text: 'love the spice', score10: 8.5, predicted: 72, actual: 85, at: '2026-09-01T10:00:00.000Z',
  })
  await reviews.insert(USER, {
    dishId: 'kebab-2', dishName: 'Lamb shish', venueId: 'turks-kebab', rating: 4, tags: ['worth-it'],
    predicted: 60, actual: 75, at: '2026-09-02T10:00:00.000Z',
  })
  const [loved, rated] = await reviews.listForUser(USER)
  assert.equal(loved.sentiment, 'loved')
  assert.equal(loved.score10, 8.5)
  assert.equal(loved.text, 'love the spice')
  assert.equal(rated.sentiment, undefined, 'star reviews have no sentiment')
  assert.equal(rated.score10, undefined, 'star reviews have no 1-10 score')
  assert.deepEqual(rated.tags, ['worth-it'])
})

test('rankings keep their order when replaced', async () => {
  const rankings = rankingRepository(db)
  await rankings.replace(USER, ['b', 'a', 'c'])
  assert.deepEqual(await rankings.get(USER), ['b', 'a', 'c'])
  await rankings.replace(USER, ['c', 'b'])
  assert.deepEqual(await rankings.get(USER), ['c', 'b'])
})

test('taste profiles upsert, and the learned vector is stored with pgvector', async () => {
  const profiles = tasteProfileRepository(db)
  await profiles.save(USER, { name: 'Tester', spicePref: 0.5 })
  await profiles.save(USER, { name: 'Tester', spicePref: 0.7 })
  assert.equal((await profiles.get(USER)).spicePref, 0.7)
  await profiles.saveVector(USER, unit(3))
  const back = await profiles.getVector(USER)
  assert.equal(back.length, 384)
  assert.ok(Math.abs(back[3] - 1) < 1e-5)
})

test('pgvector ranks venues by cosine similarity to a taste vector', async () => {
  const embeddings = venueEmbeddingRepository(db)
  await embeddings.upsertMany([
    { gersId: 'same', embedding: unit(0) },
    { gersId: 'close', embedding: unit(0, 0.5) },
    { gersId: 'unrelated', embedding: unit(200) },
  ], 'test-model')
  assert.deepEqual(await embeddings.count(), { count: 3, model: 'test-model' })

  const sims = await embeddings.similarities(['same', 'close', 'unrelated', 'missing'], unit(0))
  assert.ok(Math.abs(sims.get('same') - 1) < 1e-4)
  assert.ok(sims.get('close') < sims.get('same') && sims.get('close') > sims.get('unrelated'))
  assert.equal(sims.has('missing'), false)

  const vectors = await embeddings.vectorsFor(['close'])
  assert.equal(vectors.get('close').length, 384)
})

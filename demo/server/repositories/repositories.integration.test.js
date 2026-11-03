// Runs the repositories' SQL against a real Postgres (embedded PGlite with
// pgvector), after applying the same migrations production uses.
import test from 'node:test'
import assert from 'node:assert/strict'
import { migrate } from '../db/migrate.js'
import { openDatabase } from '../db/pool.js'
import { rankingRepository } from './rankingRepository.js'
import { reviewRepository } from './reviewRepository.js'
import { tasteProfileHistoryRepository } from './tasteProfileHistoryRepository.js'
import { tasteProfileRepository } from './tasteProfileRepository.js'
import { trendDecisionRepository } from './trendDecisionRepository.js'
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
    '005_create_taste_profile_history.sql',
    '006_add_review_signals.sql',
    '007_add_review_undo.sql',
    '008_create_trend_decisions.sql',
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
  assert.equal(rated.signals, undefined, 'reviews saved without a reading have no signals')
  assert.equal(rated.readBy, undefined)
})

test('a review keeps what was read from its text', async () => {
  const reviews = reviewRepository(db)
  const signals = [{ dimension: 'spice', direction: 'down', strength: 3, quote: 'I hate the spice', why: 'x' }]
  await reviews.insert(USER, {
    dishId: 'rice-1', dishName: 'Chicken rice', venueId: 'tian-tian', rating: 1, sentiment: 'disliked',
    tags: [], text: 'I hate the spice', signals, readBy: 'ai', score10: 2.5, predicted: 60, actual: 25, at: '2026-09-03T10:00:00.000Z',
  })
  const read = (await reviews.listForUser(USER)).find((r) => r.dishId === 'rice-1')
  assert.deepEqual(read.signals, signals)
  assert.equal(read.readBy, 'ai')
})

test('the last 8 reviews bring back the profile before them, and undo marks only the latest', async () => {
  const reviews = reviewRepository(db)
  const someone = '78787878-7878-7878-7878-787878787878'
  const base = { dishName: 'Dish', venueId: 'turks-kebab', rating: 5, sentiment: 'loved', tags: [], text: '', predicted: 50, actual: 80 }
  for (let day = 1; day <= 9; day++) {
    const at = `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`
    await reviews.insert(someone, { ...base, dishId: `d-${day}`, profileBefore: { spicePref: day / 10 }, at })
  }
  let listed = await reviews.listForUser(someone)
  assert.equal(listed[0].profileBefore, undefined, 'older reviews are needed by neither undo nor trends')
  assert.deepEqual(listed.slice(1).map((r) => r.profileBefore.spicePref), [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
  assert.equal(listed.at(-1).undone, undefined)
  await reviews.markLatestUndone(someone)
  listed = await reviews.listForUser(someone)
  assert.equal(listed.at(-1).undone, true)
  assert.equal(listed.at(-2).undone, undefined)
})

test('trend decisions are kept once each and forgotten on reset', async () => {
  const decisions = trendDecisionRepository(db)
  await decisions.insert(USER, [{ key: 'spice', direction: 'up', decision: 'accepted' }, { key: 'cuisine:thai', direction: 'down', decision: 'dismissed' }])
  await decisions.insert(USER, [{ key: 'spice', direction: 'up', decision: 'dismissed' }])
  assert.deepEqual(await decisions.list(USER), [
    { key: 'cuisine:thai', direction: 'down', decision: 'dismissed' },
    { key: 'spice', direction: 'up', decision: 'accepted' },
  ])
  await decisions.deleteForUser(USER)
  assert.deepEqual(await decisions.list(USER), [])
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

test('taste profile history stores one latest snapshot per user per day', async () => {
  const history = tasteProfileHistoryRepository(db)
  await history.deleteForUser(USER)
  await history.saveSnapshot(USER, { name: 'Tester', spicePref: 0.5 })
  await history.saveSnapshot(USER, { name: 'Tester', spicePref: 0.8 })
  const snapshots = await history.listRecent(USER)
  assert.equal(snapshots.length, 1)
  assert.equal(snapshots[0].profile.spicePref, 0.8)
  await history.deleteForUser(USER)

  const staleAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
  await db.query(
    `insert into taste.taste_profile_history (user_id, snapshot_date, profile, updated_at)
     values ($1, $2::date, $3::jsonb, $4)`,
    [USER, staleAt.toISOString().slice(0, 10), JSON.stringify({ spicePref: 0.2 }), staleAt],
  )
  assert.deepEqual(await history.listRecent(USER), [])
  await history.deleteForUser(USER)
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

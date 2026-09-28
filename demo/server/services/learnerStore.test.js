// The same behaviour is required of both stores, so one set of tests runs
// against each: in memory, and on a real (embedded) Postgres.
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBeliReview, starterProfile } from '../learn.js'
import { migrate } from '../db/migrate.js'
import { openDatabase } from '../db/pool.js'
import { dbLearnerStore, memoryLearnerStore } from './learnerStore.js'

const ALICE = '55555555-5555-5555-5555-555555555555'
const BOB = '66666666-6666-6666-6666-666666666666'
const VENUE = { id: 'turks-kebab', name: "Turk's Kebab", cuisine: 'turkish' }

const dish = (id, overrides = {}) => ({
  id, venueId: VENUE.id, name: `Dish ${id}`, price: 8, priceTier: 1, spice: 0.9, richness: 0.6, novelty: 0.5, tags: [], ...overrides,
})

// One review as the app would post it; returns the learning result.
const review = (store, userId, dishId, opts = {}) =>
  store.update(userId, 'Tester', async (state) => {
    const result = applyBeliReview(state, dish(dishId), VENUE, { sentiment: 'loved', insertIndex: 0, ...opts })
    return { result, review: result.review, tasteVector: null }
  })

const db = await openDatabase({ pglite: null })
await migrate(db)
test.after(() => db.close())

const stores = {
  memory: () => memoryLearnerStore({ starter: starterProfile }),
  postgres: () => dbLearnerStore({ db, starter: starterProfile }),
}

for (const [kind, makeStore] of Object.entries(stores)) {
  test(`${kind}: a new user starts from the neutral starter profile`, async () => {
    const store = makeStore()
    await store.reset(ALICE)
    const state = await store.read(ALICE, 'Alice')
    assert.equal(state.profile.name, 'Alice')
    assert.equal(state.profile.spicePref, 0.5)
    assert.deepEqual(state.reviews, [])
    assert.deepEqual(state.rankings, [])
  })

  test(`${kind}: reviews, rankings and the learned profile are saved`, async () => {
    const store = makeStore()
    await store.reset(ALICE)
    await review(store, ALICE, 'kebab-1')
    await review(store, ALICE, 'kebab-2', { insertIndex: 1, sentiment: 'fine', text: 'love the spice' })
    const state = await store.read(ALICE, 'Alice')
    assert.deepEqual(state.rankings, ['kebab-1', 'kebab-2'])
    assert.equal(state.reviews.length, 2)
    assert.equal(state.reviews[1].text, 'love the spice')
    assert.equal(state.reviews[1].dishName, 'Dish kebab-2')
    assert.ok(state.profile.spicePref > 0.5, 'loving spicy dishes should raise spice preference')
  })

  test(`${kind}: users never see each other's learning`, async () => {
    const store = makeStore()
    await store.reset(ALICE)
    await store.reset(BOB)
    await review(store, ALICE, 'kebab-1')
    const bob = await store.read(BOB, 'Bob')
    assert.deepEqual(bob.reviews, [])
    assert.equal(bob.profile.spicePref, 0.5)
  })

  test(`${kind}: simultaneous reviews by one user are both kept`, async () => {
    const store = makeStore()
    await store.reset(ALICE)
    await Promise.all([review(store, ALICE, 'a'), review(store, ALICE, 'b'), review(store, ALICE, 'c')])
    const state = await store.read(ALICE, 'Alice')
    assert.equal(state.reviews.length, 3)
    assert.equal(new Set(state.rankings).size, 3)
  })

  test(`${kind}: a failed step saves nothing`, async () => {
    const store = makeStore()
    await store.reset(ALICE)
    await assert.rejects(store.update(ALICE, 'Alice', async (state) => {
      applyBeliReview(state, dish('x'), VENUE, { sentiment: 'loved', insertIndex: 0 })
      throw new Error('validation failed after learning')
    }))
    assert.deepEqual((await store.read(ALICE, 'Alice')).reviews, [])
  })

  test(`${kind}: reset forgets only that user`, async () => {
    const store = makeStore()
    await review(store, ALICE, 'kebab-1')
    await review(store, BOB, 'kebab-9')
    await store.reset(ALICE)
    assert.deepEqual((await store.read(ALICE, 'Alice')).reviews, [])
    assert.equal((await store.read(BOB, 'Bob')).reviews.length > 0, true)
  })
}

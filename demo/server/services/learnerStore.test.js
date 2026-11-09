// The same behaviour is required of both stores, so one set of tests runs
// against each: in memory, and on a real (embedded) Postgres.
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBeliReview, starterProfile, undoLatestReview } from '../learn.js'
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
    const history = await store.history(ALICE)
    assert.equal(history.length, 1, 'same-day reviews should update one daily snapshot')
    assert.equal(history[0].profile.spicePref, state.profile.spicePref)
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

  test(`${kind}: undoing the latest review restores the profile and keeps the review`, async () => {
    const store = makeStore()
    await store.reset(ALICE)
    await review(store, ALICE, 'kebab-1')
    const before = (await store.read(ALICE, 'Alice')).profile
    const posted = await review(store, ALICE, 'kebab-2', { insertIndex: 1, text: 'love the spice' })
    const undo = () => store.update(ALICE, 'Alice', async (state) => {
      const result = undoLatestReview(state, { dishId: posted.review.dishId, at: posted.review.at })
      return { result, undone: Boolean(result) }
    })
    assert.ok(await undo())
    const state = await store.read(ALICE, 'Alice')
    assert.deepEqual(state.profile, before)
    assert.equal(state.reviews.length, 2)
    assert.equal(state.reviews[1].undone, true)
    assert.deepEqual(state.rankings, ['kebab-1', 'kebab-2'])
    assert.equal(await undo(), null, 'a second undo is refused')
  })

  test(`${kind}: accept and dismiss choices are kept, and reset forgets them`, async () => {
    const store = makeStore()
    await store.reset(ALICE)
    assert.deepEqual((await store.read(ALICE, 'Alice')).decisions, [])
    const decided = [{ key: 'spice', direction: 'up', decision: 'dismissed' }]
    await store.update(ALICE, 'Alice', async (state) => {
      state.decisions.push(...decided)
      return { result: true, decided }
    })
    assert.deepEqual((await store.read(ALICE, 'Alice')).decisions, decided)
    await store.reset(ALICE)
    assert.deepEqual((await store.read(ALICE, 'Alice')).decisions, [])
  })

  test(`${kind}: reset forgets only that user`, async () => {
    const store = makeStore()
    await review(store, ALICE, 'kebab-1')
    await review(store, BOB, 'kebab-9')
    await store.reset(ALICE)
    assert.deepEqual((await store.read(ALICE, 'Alice')).reviews, [])
    assert.deepEqual(await store.history(ALICE), [])
    assert.equal((await store.read(BOB, 'Bob')).reviews.length > 0, true)
  })

  // Reading other people's reviews.
  const fresh = async () => {
    const store = makeStore()
    await store.reset(ALICE)
    await store.reset(BOB)
    return store
  }
  const postedAt = (store, userId, dishId, day, { venueId = VENUE.id, sentiment = 'disliked', noSentiment = false } = {}) =>
    store.update(userId, 'Tester', async (state) => {
      const result = applyBeliReview(state, dish(dishId, { venueId }), VENUE, { sentiment, insertIndex: 0, text: `about ${dishId}` })
      result.review.at = `2026-11-0${day}T12:00:00.000Z`
      if (noSentiment) delete result.review.sentiment
      return { result, review: result.review, tasteVector: null }
    })
  const undoLatest = (store, userId) =>
    store.update(userId, 'Tester', async (state) => {
      const latest = state.reviews.at(-1)
      return { result: undoLatestReview(state, { dishId: latest.dishId, at: latest.at }), undone: true }
    })
  const dishes = (rows) => rows.map((r) => r.dishId)

  test(`${kind}: recent reviews at chosen venues name their writer, newest first`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'a', 3)
    await postedAt(store, BOB, 'b', 4)
    await postedAt(store, BOB, 'elsewhere', 5, { venueId: 'other-place' })
    const rows = await store.recentReviewsAt([VENUE.id], '2026-11-01T00:00:00.000Z')
    assert.deepEqual(dishes(rows), ['b', 'a'])
    assert.deepEqual(rows.map((r) => r.userId), [BOB, ALICE])
    assert.equal(rows[0].venueId, VENUE.id)
    assert.equal(rows[0].sentiment, 'disliked')
    assert.equal(rows[0].text, 'about b')
    assert.equal(rows[0].at, '2026-11-04T12:00:00.000Z')
  })

  test(`${kind}: no venue list means every venue`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'a', 3)
    await postedAt(store, BOB, 'elsewhere', 4, { venueId: 'other-place' })
    assert.deepEqual(dishes(await store.recentReviewsAt(null, '2026-11-01T00:00:00.000Z')), ['elsewhere', 'a'])
  })

  test(`${kind}: reviews from before the window are left out`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'old', 2)
    await postedAt(store, ALICE, 'new', 4)
    assert.deepEqual(dishes(await store.recentReviewsAt([VENUE.id], '2026-11-03T00:00:00.000Z')), ['new'])
  })

  test(`${kind}: other people's reviews never carry the writer's past profile`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'a', 3)
    const rows = [
      ...(await store.recentReviewsAt([VENUE.id], '2026-11-01T00:00:00.000Z')),
      ...(await store.reviewsAtVenue(VENUE.id, 5)),
      ...(await store.reviewsByPeople([ALICE], { limit: 5 })),
    ]
    assert.equal(rows.length, 3)
    assert.ok(rows.every((r) => !('profileBefore' in r)))
  })

  test(`${kind}: an undone review disappears from every read and from the count`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'kept', 3)
    await postedAt(store, ALICE, 'taken-back', 4)
    await undoLatest(store, ALICE)
    assert.deepEqual(dishes(await store.recentReviewsAt([VENUE.id], '2026-11-01T00:00:00.000Z')), ['kept'])
    assert.deepEqual(dishes(await store.reviewsAtVenue(VENUE.id, 5)), ['kept'])
    assert.deepEqual(dishes(await store.reviewsByPeople([ALICE], { limit: 5 })), ['kept'])
    assert.equal((await store.peopleFacts([ALICE])).get(ALICE).reviewCount, 1)
  })

  test(`${kind}: a review with no verdict is left out`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'star-only', 3, { noSentiment: true })
    assert.deepEqual(await store.recentReviewsAt([VENUE.id], '2026-11-01T00:00:00.000Z'), [])
    assert.deepEqual(await store.reviewsAtVenue(VENUE.id, 5), [])
    assert.deepEqual(await store.reviewsByPeople([ALICE], { limit: 5 }), [])
  })

  test(`${kind}: reviews at one venue come newest first, up to the limit`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'a', 3)
    await postedAt(store, BOB, 'b', 5)
    await postedAt(store, BOB, 'c', 4)
    await postedAt(store, BOB, 'elsewhere', 6, { venueId: 'other-place' })
    assert.deepEqual(dishes(await store.reviewsAtVenue(VENUE.id, 2)), ['b', 'c'])
  })

  test(`${kind}: reviews by chosen people come newest first, up to the limit and window`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'a', 3)
    await postedAt(store, BOB, 'b', 5)
    await postedAt(store, BOB, 'c', 4, { venueId: 'other-place' })
    assert.deepEqual(dishes(await store.reviewsByPeople([ALICE, BOB], { limit: 2 })), ['b', 'c'])
    assert.deepEqual(dishes(await store.reviewsByPeople([ALICE], { limit: 5 })), ['a'])
    assert.deepEqual(dishes(await store.reviewsByPeople([ALICE, BOB], { limit: 5, since: '2026-11-04T00:00:00.000Z' })), ['b', 'c'])
  })

  test(`${kind}: facts about people give their profile and review count`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'a', 3)
    await postedAt(store, ALICE, 'b', 4)
    const facts = await store.peopleFacts([ALICE, BOB])
    assert.equal(facts.get(ALICE).reviewCount, 2)
    assert.equal(facts.get(ALICE).profile.spicePref, (await store.read(ALICE, 'Alice')).profile.spicePref)
    assert.equal(facts.has(BOB), false, 'no stored profile, no entry')
  })

  test(`${kind}: after a reset, a person is gone from every read`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'a', 3)
    await store.reset(ALICE)
    assert.deepEqual(await store.recentReviewsAt([VENUE.id], '2026-11-01T00:00:00.000Z'), [])
    assert.deepEqual(await store.reviewsAtVenue(VENUE.id, 5), [])
    assert.deepEqual(await store.reviewsByPeople([ALICE], { limit: 5 }), [])
    assert.equal((await store.peopleFacts([ALICE])).size, 0)
  })

  test(`${kind}: asking about nobody finds nothing`, async () => {
    const store = await fresh()
    await postedAt(store, ALICE, 'a', 3)
    assert.deepEqual(await store.recentReviewsAt([], '2026-11-01T00:00:00.000Z'), [])
    assert.deepEqual(await store.reviewsByPeople([], { limit: 5 }), [])
    assert.equal((await store.peopleFacts([])).size, 0)
  })
}

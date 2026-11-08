import test from 'node:test'
import assert from 'node:assert/strict'
import { starterProfile } from '../learn.js'
import { memoryLearnerStore } from './learnerStore.js'
import { createCommunityService } from './communityService.js'

const NOW = new Date('2026-11-07T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString()

const ME = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HAFIZ = '22222222-2222-2222-2222-222222222222'
const NADIA = '33333333-3333-3333-3333-333333333333'
const MEI = '44444444-4444-4444-4444-444444444444'
const GONE = '55555555-5555-5555-5555-555555555555'

const CARDS = {
  [ME]: { id: ME, displayName: 'Sam', username: 'sam_mild' },
  [HAFIZ]: { id: HAFIZ, displayName: 'Hafiz', username: 'hafiz_nospice' },
  [NADIA]: { id: NADIA, displayName: 'Nadia', username: null },
  [MEI]: { id: MEI, displayName: 'Mei', username: 'mei_chilli' },
}
const TURKS = { id: 'turks-kebab', name: "Turk's Kebab" }
const registry = { venueById: new Map([[TURKS.id, TURKS]]) }
const user = { id: ME, token: 'token', me: { displayName: 'Sam', ownedVenues: [], email: 'sam@example.com', dietary: { restrictions: ['HALAL'] } } }

function setup({ kakis = [], outgoing = [], kakisDown = false, peopleDown = false } = {}) {
  const learners = memoryLearnerStore({ starter: starterProfile })
  const asked = { people: [] }
  const accounts = {
    people: async (_token, ids) => {
      if (peopleDown) throw Object.assign(new Error('down'), { status: 503 })
      asked.people.push(ids)
      return ids.map((id) => CARDS[id]).filter(Boolean)
    },
    kakis: async () => {
      if (kakisDown) throw Object.assign(new Error('down'), { status: 503 })
      // Like account-service, the kaki list still has a kaki whose account was disabled.
      const listed = (id) => CARDS[id] ?? { id, displayName: null, username: null }
      return { kakis: kakis.map(listed), incoming: [], outgoing: outgoing.map(listed) }
    },
  }
  return { learners, asked, community: createCommunityService({ learners, accounts, registry, now: () => NOW }) }
}

const oldReview = { dishId: 'old', dishName: 'Old', venueId: 'somewhere-else', sentiment: 'fine', text: '', at: ago(90) }

const someone = (learners, id, taste = {}, reviewCount = 8) =>
  learners.update(id, 'Someone', async (state) => {
    Object.assign(state.profile, taste)
    state.reviews.push(...Array.from({ length: reviewCount }, () => ({ ...oldReview })))
    return { result: null }
  })

const says = (learners, id, extra = {}) =>
  learners.update(id, 'Someone', async (state) => {
    state.reviews.push({ dishId: 'wrap', dishName: 'Doner wrap', venueId: TURKS.id, sentiment: 'disliked', text: 'too spicy', at: ago(1), ...extra })
    return { result: null }
  })

const names = (reviews) => reviews.map((r) => r.reviewer.displayName)

test('reviews come closest to your taste first, with how much each counts', async () => {
  const { learners, community } = setup()
  await someone(learners, ME, { spicePref: 0.15 })
  await someone(learners, HAFIZ, { spicePref: 0.18 })
  await someone(learners, MEI, { spicePref: 1, richnessPref: 1 })
  await says(learners, MEI, { at: ago(0) })
  await says(learners, HAFIZ, { at: ago(1) })
  const { reviews } = await community.venueReviews(user, TURKS.id)
  assert.deepEqual(names(reviews), ['Hafiz', 'Mei'])
  const [hafiz, mei] = reviews
  assert.equal(hafiz.reviewer.username, 'hafiz_nospice')
  assert.ok(hafiz.closeness > 90 && Number.isInteger(hafiz.closeness), `${hafiz.closeness}`)
  assert.equal(hafiz.counts, 'counts a lot')
  assert.equal(hafiz.faded, false)
  assert.equal(hafiz.isYou, false)
  assert.equal(hafiz.sentiment, 'disliked')
  assert.equal(hafiz.text, 'too spicy')
  assert.equal(hafiz.dishId, 'wrap')
  assert.equal(hafiz.dishName, 'Doner wrap')
  assert.equal(hafiz.venueName, "Turk's Kebab")
  assert.equal(mei.counts, 'counts a little')
  assert.equal(mei.faded, true)
})

test('your own review comes first and has no closeness', async () => {
  const { learners, community } = setup()
  await someone(learners, ME)
  await someone(learners, HAFIZ)
  await says(learners, HAFIZ, { at: ago(0) })
  await says(learners, ME, { at: ago(5) })
  const { reviews } = await community.venueReviews(user, TURKS.id)
  assert.deepEqual(names(reviews), ['Sam', 'Hafiz'])
  assert.equal(reviews[0].isYou, true)
  assert.equal(reviews[0].closeness, null)
  assert.equal(reviews[0].counts, null)
  assert.equal(reviews[0].faded, false)
})

test('reviews too old to count come last, with no "counts" label', async () => {
  const { learners, community } = setup()
  await someone(learners, ME)
  await someone(learners, HAFIZ)
  await someone(learners, NADIA)
  await says(learners, HAFIZ, { at: ago(40) })
  await says(learners, NADIA, { at: ago(2) })
  const { reviews } = await community.venueReviews(user, TURKS.id)
  assert.deepEqual(names(reviews), ['Nadia', 'Hafiz'])
  assert.equal(reviews[1].counts, null)
  assert.equal(reviews[1].faded, true)
})

test('new accounts have no closeness to show', async () => {
  const { learners, community } = setup()
  await someone(learners, ME)
  await says(learners, HAFIZ)
  const [hafiz] = (await community.venueReviews(user, TURKS.id)).reviews
  assert.equal(hafiz.closeness, null)
  assert.equal(hafiz.counts, 'counts a little')
})

test('one row per person, their latest', async () => {
  const { learners, community } = setup()
  await someone(learners, ME)
  await someone(learners, HAFIZ)
  await says(learners, HAFIZ, { at: ago(5), dishName: 'Older' })
  await says(learners, HAFIZ, { at: ago(1), dishName: 'Newer' })
  const { reviews } = await community.venueReviews(user, TURKS.id)
  assert.deepEqual(reviews.map((r) => r.dishName), ['Newer'])
})

test('at most 20 reviews, and never more than 20 names asked for', async () => {
  const { learners, asked, community } = setup()
  await someone(learners, ME)
  for (let i = 0; i < 25; i++) {
    const id = `10000000-0000-0000-0000-${String(i).padStart(12, '0')}`
    CARDS[id] = { id, displayName: `Person ${i}`, username: null }
    await someone(learners, id)
    await says(learners, id)
  }
  const { reviews } = await community.venueReviews(user, TURKS.id)
  assert.equal(reviews.length, 20)
  assert.ok(asked.people.every((ids) => ids.length <= 20))
})

test('a kaki\'s review is marked', async () => {
  const { learners, community } = setup({ kakis: [HAFIZ] })
  await someone(learners, ME)
  await someone(learners, HAFIZ)
  await someone(learners, NADIA)
  await says(learners, HAFIZ)
  await says(learners, NADIA)
  const { reviews } = await community.venueReviews(user, TURKS.id)
  assert.equal(reviews.find((r) => r.reviewer.id === HAFIZ).isKaki, true)
  assert.equal(reviews.find((r) => r.reviewer.id === NADIA).isKaki, false)
})

test('if kakis can\'t be fetched, the list still shows, without the tag', async () => {
  const { learners, community } = setup({ kakisDown: true })
  await someone(learners, ME)
  await someone(learners, HAFIZ)
  await says(learners, HAFIZ)
  const { reviews } = await community.venueReviews(user, TURKS.id)
  assert.equal(reviews[0].isKaki, false)
})

test('if names can\'t be fetched, the list says so', async () => {
  const { learners, community } = setup({ peopleDown: true })
  await someone(learners, HAFIZ)
  await says(learners, HAFIZ)
  await assert.rejects(community.venueReviews(user, TURKS.id), { status: 503 })
})

test('undone reviews never show', async () => {
  const { learners, community } = setup()
  await someone(learners, HAFIZ)
  await says(learners, HAFIZ, { undone: true })
  assert.deepEqual((await community.venueReviews(user, TURKS.id)).reviews, [])
})

test('someone whose account is disabled drops out of the list', async () => {
  const { learners, community } = setup()
  await someone(learners, GONE) // account-service doesn't know this id, as it wouldn't for a disabled account
  await says(learners, GONE)
  assert.deepEqual((await community.venueReviews(user, TURKS.id)).reviews, [])
})

test('a venue nobody reviewed has an empty list', async () => {
  const { community } = setup()
  assert.deepEqual(await community.venueReviews(user, TURKS.id), { reviews: [] })
})

test('a venue we do not know is a 404', async () => {
  const { community } = setup()
  await assert.rejects(community.venueReviews(user, 'no-such-place'), { status: 404 })
})

test('a review with no text stays empty, never "null"', async () => {
  const { learners, community } = setup()
  await someone(learners, HAFIZ)
  await says(learners, HAFIZ, { text: '' })
  const [hafiz] = (await community.venueReviews(user, TURKS.id)).reviews
  assert.equal(hafiz.text, '')
})

// A reviewer's profile.
test('a profile compares your tastes on five dimensions, leaving out the fixed one', async () => {
  const { learners, community } = setup()
  await someone(learners, ME, { spicePref: 0.15 })
  await someone(learners, HAFIZ, { spicePref: 0.18 })
  const profile = await community.reviewer(user, HAFIZ)
  assert.equal(profile.displayName, 'Hafiz')
  assert.equal(profile.username, 'hafiz_nospice')
  assert.equal(profile.reviewCount, 8)
  assert.equal(profile.isYou, false)
  assert.ok(profile.closeness > 90)
  assert.deepEqual(profile.dimensions.map((d) => d.key), ['cuisine', 'price', 'spice', 'richness', 'adventurousness'])
  assert.deepEqual(profile.yourDimensions.map((d) => d.key), ['cuisine', 'price', 'spice', 'richness', 'adventurousness'])
  assert.equal(profile.dimensions.find((d) => d.key === 'spice').value, 0.18)
  assert.equal(profile.yourDimensions.find((d) => d.key === 'spice').value, 0.15)
  assert.deepEqual(profile.agreements, ['You both keep the spice low'])
})

test('a profile has no closeness when either of you has under 3 reviews', async () => {
  const { learners, community } = setup()
  await someone(learners, ME, {}, 2)
  await someone(learners, HAFIZ)
  assert.equal((await community.reviewer(user, HAFIZ)).closeness, null)
})

test('a profile lists their latest 10 reviews, newest first', async () => {
  const { learners, community } = setup()
  await someone(learners, HAFIZ, {}, 0)
  for (let day = 12; day >= 1; day--) await says(learners, HAFIZ, { at: ago(day), dishName: `Day ${day}` })
  const { reviews, reviewCount } = await community.reviewer(user, HAFIZ)
  assert.equal(reviewCount, 12)
  assert.equal(reviews.length, 10)
  assert.equal(reviews[0].dishName, 'Day 1')
  assert.equal(reviews[9].dishName, 'Day 10')
})

test('a profile says where you stand as kakis', async () => {
  const { learners, community } = setup({ kakis: [HAFIZ], outgoing: [NADIA] })
  for (const id of [HAFIZ, NADIA, MEI]) await someone(learners, id)
  assert.equal((await community.reviewer(user, HAFIZ)).kakiStatus, 'kaki')
  assert.equal((await community.reviewer(user, NADIA)).kakiStatus, 'asked')
  assert.equal((await community.reviewer(user, MEI)).kakiStatus, null)
})

test('if kakis can\'t be fetched, a profile doesn\'t guess', async () => {
  const { learners, community } = setup({ kakisDown: true })
  await someone(learners, HAFIZ)
  assert.equal((await community.reviewer(user, HAFIZ)).kakiStatus, 'unknown')
})

test('your own profile has no comparison', async () => {
  const { learners, community } = setup()
  await someone(learners, ME)
  const profile = await community.reviewer(user, ME)
  assert.equal(profile.isYou, true)
  assert.equal(profile.closeness, null)
  assert.equal(profile.kakiStatus, null)
  assert.deepEqual(profile.agreements, [])
})

test('someone with no reviews yet has a profile with no chart', async () => {
  const { community } = setup()
  const profile = await community.reviewer(user, MEI)
  assert.equal(profile.displayName, 'Mei')
  assert.equal(profile.reviewCount, 0)
  assert.equal(profile.dimensions, null)
  assert.equal(profile.closeness, null)
  assert.deepEqual(profile.agreements, [])
  assert.deepEqual(profile.reviews, [])
})

test('a reviewer with no username still comes through', async () => {
  const { learners, community } = setup()
  await someone(learners, NADIA)
  assert.equal((await community.reviewer(user, NADIA)).username, null)
})

test('a malformed id is a 404, without asking anyone', async () => {
  const { asked, community } = setup()
  await assert.rejects(community.reviewer(user, 'not-a-uuid'), { status: 404 })
  assert.deepEqual(asked.people, [])
})

test('an unknown or disabled person is a 404', async () => {
  const { community } = setup()
  await assert.rejects(community.reviewer(user, GONE), { status: 404 })
})

test('a review at a venue we no longer know keeps its dish, with no venue name', async () => {
  const { learners, community } = setup()
  await someone(learners, HAFIZ, {}, 0)
  await says(learners, HAFIZ, { venueId: 'gone-now', dishName: 'Mystery' })
  const [review] = (await community.reviewer(user, HAFIZ)).reviews
  assert.equal(review.dishName, 'Mystery')
  assert.equal(review.venueName, '')
})

// Nothing private leaves.
test('nothing private reaches a profile or a reviews list', async () => {
  const { learners, community } = setup()
  await someone(learners, ME)
  await someone(learners, HAFIZ)
  await learners.update(HAFIZ, 'Someone', async (state) => {
    state.reviews.push({
      dishId: 'wrap', dishName: 'Wrap', venueId: TURKS.id, sentiment: 'disliked', text: 'hot', at: ago(1), predicted: 70, actual: 20, profileBefore: state.profile,
    })
    return { result: null }
  })
  const answers = [await community.reviewer(user, HAFIZ), await community.venueReviews(user, TURKS.id), await community.reviewer(user, ME)]
  for (const answer of answers) {
    const json = JSON.stringify(answer)
    for (const banned of ['email', 'dietary', 'restrictions', 'ownedVenues', 'profileBefore', 'predicted', 'actual']) {
      assert.ok(!json.includes(banned), banned)
    }
  }
})

// Recent eats.
test('recent eats shows only your kakis, newest first', async () => {
  const { learners, community } = setup({ kakis: [HAFIZ, MEI] })
  await someone(learners, ME)
  for (const id of [HAFIZ, MEI, NADIA]) await someone(learners, id)
  await says(learners, HAFIZ, { at: ago(3) })
  await says(learners, MEI, { at: ago(1), sentiment: 'loved', text: 'properly hot' })
  await says(learners, NADIA, { at: ago(0) })
  const { eats } = await community.recentEats(user)
  assert.deepEqual(names(eats), ['Mei', 'Hafiz'])
  assert.equal(eats[0].venueName, "Turk's Kebab")
  assert.equal(eats[0].sentiment, 'loved')
  assert.equal(eats[0].text, 'properly hot')
  assert.equal(eats[0].isKaki, true)
  assert.ok(Number.isInteger(eats[0].closeness))
})

test('recent eats leave out a kaki whose account is disabled', async () => {
  const { learners, community } = setup({ kakis: [HAFIZ, GONE] })
  for (const id of [HAFIZ, GONE]) await someone(learners, id)
  await says(learners, HAFIZ, { at: ago(2) })
  await says(learners, GONE, { at: ago(1) })
  assert.deepEqual(names((await community.recentEats(user)).eats), ['Hafiz'])
})

test('if names can\'t be looked up, recent eats still shows kakis by their listed names', async () => {
  const { learners, community } = setup({ kakis: [HAFIZ], peopleDown: true })
  await someone(learners, HAFIZ)
  await says(learners, HAFIZ, { at: ago(1) })
  assert.deepEqual(names((await community.recentEats(user)).eats), ['Hafiz'])
})

test('recent eats shows the newest 10', async () => {
  const { learners, community } = setup({ kakis: [HAFIZ] })
  await someone(learners, HAFIZ, {}, 0)
  for (let day = 1; day <= 12; day++) await says(learners, HAFIZ, { at: ago(day), dishName: `Day ${day}` })
  const { eats } = await community.recentEats(user)
  assert.equal(eats.length, 10)
  assert.equal(eats[0].dishName, 'Day 1')
})

test('a kaki\'s eat from over 30 days ago has dropped off', async () => {
  const { learners, community } = setup({ kakis: [HAFIZ] })
  await says(learners, HAFIZ, { at: ago(31) })
  assert.deepEqual((await community.recentEats(user)).eats, [])
})

test('with no kakis, recent eats is empty and reads nothing', async () => {
  const { learners, community } = setup()
  const guarded = createCommunityService({
    learners: { ...learners, reviewsByPeople: async () => { throw new Error('should not read') } },
    accounts: { kakis: async () => ({ kakis: [], incoming: [], outgoing: [] }), people: async () => [] },
    registry,
    now: () => NOW,
  })
  assert.deepEqual(await guarded.recentEats(user), { eats: [] })
  assert.deepEqual(await community.recentEats(user), { eats: [] })
})

test('someone you removed as a kaki drops out of recent eats', async () => {
  const { learners, community } = setup({ kakis: [] })
  await someone(learners, HAFIZ)
  await says(learners, HAFIZ)
  assert.deepEqual((await community.recentEats(user)).eats, [])
})

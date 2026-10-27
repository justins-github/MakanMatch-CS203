import test from 'node:test'
import assert from 'node:assert/strict'
import { starterProfile } from '../learn.js'
import { memoryLearnerStore } from './learnerStore.js'
import { createRecommendationService } from './recommendationService.js'

const TURKS = { id: 'turks-kebab', name: "Turk's Kebab", cuisine: 'turkish', category: 'doner_kebab', distanceMin: 5 }
const YANGON = { id: 'yangon-flavours', name: 'Yangon Flavours', cuisine: 'burmese', distanceMin: 9 }
const AL_BAIK = { id: 'al-baik', name: 'Al Baik', cuisine: 'middle-eastern', category: 'halal_restaurant', distanceMin: 7 }
const GREENDOT = { id: 'greendot', name: 'Greendot', cuisine: 'vegetarian', category: 'vegetarian_restaurant', distanceMin: 6 }
const registryOf = (venues) => ({ venues, venueById: new Map(venues.map((v) => [v.id, v])) })

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const everyDay = (opens, closes) => DAYS.map((day) => ({ day, sessions: [{ opens, closes }] }))
// 2026-09-28 is a Monday; 8pm Singapore time.
const MONDAY_8PM = new Date('2026-09-28T20:00:00+08:00')

const diner = { id: '88888888-8888-8888-8888-888888888888', me: { displayName: 'Mei', ownedVenues: [] } }

function service({ hours = new Map(), hoursDown = false, venues = [TURKS, YANGON], kakis = [] } = {}) {
  const catalog = {
    venueStatuses: async () => new Map(),
    venueHours: async () => {
      if (hoursDown) throw Object.assign(new Error('catalog down'), { status: 503 })
      return hours
    },
  }
  // Stands in for account-service: only these people are the caller's kakis.
  const accounts = {
    party: async (_token, ids) => {
      if (!ids.every((id) => kakis.some((k) => k.id === id))) throw Object.assign(new Error('not kakis'), { status: 400 })
      return kakis.filter((k) => ids.includes(k.id))
    },
  }
  const learners = memoryLearnerStore({ starter: starterProfile })
  return createRecommendationService({
    registry: registryOf(venues),
    vectors: { size: 0 },
    learners,
    catalog,
    accounts,
    now: () => MONDAY_8PM,
  })
}

const find = (recs) => recs.recommend(diner, { mode: 'find', mood: null, context: { raining: false } })

test('Find leaves out venues that are shut right now, and says so', async () => {
  const recs = service({ hours: new Map([['yangon-flavours', everyDay('11:00', '14:30')]]) })
  const result = await find(recs)
  assert.deepEqual(result.venues.map((v) => v.id), ['turks-kebab'])
  assert.deepEqual(result.ownerReports.shutNow, [{ id: 'yangon-flavours', name: 'Yangon Flavours', next: 'opens tomorrow 11am' }])
})

test('Surprise never picks a venue that is shut right now', async () => {
  const recs = service({ hours: new Map([['turks-kebab', everyDay('11:00', '14:30')]]) })
  const result = await recs.recommend(diner, { mode: 'surprise', mood: null, context: { raining: false } })
  assert.deepEqual(result.venues.map((v) => v.id), ['yangon-flavours'])
})

test('open venues carry their hours to the card', async () => {
  const recs = service({ hours: new Map([['turks-kebab', everyDay('10:00', '22:00')]]) })
  const turks = (await find(recs)).venues.find((v) => v.id === 'turks-kebab')
  assert.equal(turks.hours.label, 'Open now · closes 10pm')
})

test('if hours are unavailable, nothing is left out for being shut', async () => {
  const result = await find(service({ hoursDown: true }))
  assert.equal(result.venues.length, 2)
  assert.deepEqual(result.ownerReports.shutNow, [])
})

// Group meals and dietary dealbreakers.
const JIA_HUI = { id: '11111111-1111-1111-1111-111111111111', displayName: 'Jia Hui', restrictions: [] }
const ARUN = { id: '22222222-2222-2222-2222-222222222222', displayName: 'Arun', restrictions: ['HALAL'] }
const ALL_FOUR = [TURKS, YANGON, AL_BAIK, GREENDOT]
const withKakis = (recs, ids, mode = 'find') =>
  recs.recommend({ ...diner, token: 't' }, { mode, mood: null, context: { raining: false }, withIds: ids })

test('a group Find scores every place for everyone and reports the floor it used', async () => {
  const result = await withKakis(service({ venues: ALL_FOUR, kakis: [JIA_HUI] }), [JIA_HUI.id])
  assert.deepEqual(result.group.members.map((m) => m.name), ['Mei', 'Jia Hui'])
  assert.equal(result.group.aimedFloor, 75)
  // New accounts score these 52-59, so the floor had to come down to 50.
  assert.equal(result.group.floor, 50)
  assert.equal(result.group.relaxed, true)
  assert.equal(result.venues.length, 4)
  for (const venue of result.venues) {
    assert.deepEqual(venue.groupScores.map((s) => s.id), [diner.id, JIA_HUI.id])
    assert.ok(venue.lowest >= 50)
  }
})

test('one halal kaki means only halal places, and the screen learns how many were left out', async () => {
  const result = await withKakis(service({ venues: ALL_FOUR, kakis: [JIA_HUI, ARUN] }), [JIA_HUI.id, ARUN.id])
  assert.deepEqual(result.venues.map((v) => v.id), ['al-baik'])
  assert.equal(result.dietary.dropped, 3)
})

test('a vegetarian on their own never gets a meat-only place', async () => {
  const vegetarian = { ...diner, me: { ...diner.me, dietary: { restrictions: ['VEGETARIAN'] } } }
  const recs = service({ venues: ALL_FOUR })
  const result = await recs.recommend(vegetarian, { mode: 'find', mood: null, context: { raining: false } })
  assert.ok(!result.venues.some((v) => v.id === 'turks-kebab'))
  assert.equal(result.dietary.dropped, 1)
  // ...and vegetarian places get a nudge up the list.
  assert.equal(result.venues[0].id, 'greendot')
})

test('people who are not your kakis are refused', async () => {
  await assert.rejects(withKakis(service({ venues: ALL_FOUR, kakis: [JIA_HUI] }), [ARUN.id]), /not kakis/)
})

test('a group Surprise gives one pick that passes the floor', async () => {
  const result = await withKakis(service({ venues: ALL_FOUR, kakis: [JIA_HUI] }), [JIA_HUI.id], 'surprise')
  assert.equal(result.venues.length, 1)
  assert.equal(result.venues[0].experimental, true)
})

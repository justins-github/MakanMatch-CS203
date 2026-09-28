import test from 'node:test'
import assert from 'node:assert/strict'
import { starterProfile } from '../learn.js'
import { memoryLearnerStore } from './learnerStore.js'
import { createRecommendationService } from './recommendationService.js'

const TURKS = { id: 'turks-kebab', name: "Turk's Kebab", cuisine: 'turkish', distanceMin: 5 }
const YANGON = { id: 'yangon-flavours', name: 'Yangon Flavours', cuisine: 'burmese', distanceMin: 9 }
const registry = { venues: [TURKS, YANGON], venueById: new Map([[TURKS.id, TURKS], [YANGON.id, YANGON]]) }

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const everyDay = (opens, closes) => DAYS.map((day) => ({ day, sessions: [{ opens, closes }] }))
// 2026-09-28 is a Monday; 8pm Singapore time.
const MONDAY_8PM = new Date('2026-09-28T20:00:00+08:00')

const diner = { id: '88888888-8888-8888-8888-888888888888', me: { displayName: 'Mei', ownedVenues: [] } }

function service({ hours = new Map(), hoursDown = false } = {}) {
  const catalog = {
    venueStatuses: async () => new Map(),
    venueHours: async () => {
      if (hoursDown) throw Object.assign(new Error('catalog down'), { status: 503 })
      return hours
    },
  }
  const learners = memoryLearnerStore({ starter: starterProfile })
  return createRecommendationService({ registry, vectors: { size: 0 }, learners, catalog, now: () => MONDAY_8PM })
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

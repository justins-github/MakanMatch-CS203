import test from 'node:test'
import assert from 'node:assert/strict'
import { starterProfile } from '../learn.js'
import { memoryLearnerStore } from './learnerStore.js'
import { buildSearchIndex } from '../search.js'
import { createRecommendationService } from './recommendationService.js'

// All a short walk north of SMU (1.2966, 103.85): 5, 9, 7 and 6 minutes.
const TURKS = { id: 'turks-kebab', name: "Turk's Kebab", cuisine: 'turkish', category: 'doner_kebab', lat: 1.3002, lon: 103.85 }
const YANGON = { id: 'yangon-flavours', name: 'Yangon Flavours', cuisine: 'burmese', lat: 1.3031, lon: 103.85 }
const AL_BAIK = { id: 'al-baik', name: 'Al Baik', cuisine: 'middle-eastern', category: 'halal_restaurant', lat: 1.3016, lon: 103.85 }
const GREENDOT = { id: 'greendot', name: 'Greendot', cuisine: 'vegetarian', category: 'vegetarian_restaurant', lat: 1.3009, lon: 103.85 }
const registryOf = (venues) => ({ venues, venueById: new Map(venues.map((v) => [v.id, v])), searchIndex: buildSearchIndex(venues) })

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const everyDay = (opens, closes) => DAYS.map((day) => ({ day, sessions: [{ opens, closes }] }))
// 2026-09-28 is a Monday; 8pm Singapore time.
const MONDAY_8PM = new Date('2026-09-28T20:00:00+08:00')

const diner = { id: '88888888-8888-8888-8888-888888888888', me: { displayName: 'Mei', ownedVenues: [] } }

function service({ hours = new Map(), hoursDown = false, venues = [TURKS, YANGON], kakis = [], changes, statuses = new Map(), prices = new Map(), explainer, clock = () => MONDAY_8PM, learners = memoryLearnerStore({ starter: starterProfile }) } = {}) {
  const catalog = {
    venueStatuses: async () => statuses,
    venuePrices: async () => prices,
    venueHours: async () => {
      if (hoursDown) throw Object.assign(new Error('catalog down'), { status: 503 })
      return hours
    },
    venueChanges: changes ?? (async () => { throw new Error('no review, so this should not be asked') }),
  }
  // Stands in for account-service: only these people are the caller's kakis.
  const accounts = {
    party: async (_token, ids) => {
      if (!ids.every((id) => kakis.some((k) => k.id === id))) throw Object.assign(new Error('not kakis'), { status: 400 })
      return kakis.filter((k) => ids.includes(k.id))
    },
  }
  return createRecommendationService({
    registry: registryOf(venues),
    vectors: { size: 0 },
    learners,
    catalog,
    accounts,
    explainer,
    now: clock,
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

// --- CSD-50: "Since your last visit" on cards for places you've reviewed ---

const VISIT = '2026-10-12T04:00:00.000Z'
const WRAP_UP = { since: VISIT, prices: [{ dishId: 'wrap', name: 'Chicken doner wrap', from: 8.5, to: 10.5, at: '2026-10-20T04:00:00Z' }], added: [], removed: [], updates: [] }

async function reviewedTurks(at = [VISIT]) {
  const learners = memoryLearnerStore({ starter: starterProfile })
  await learners.update(diner.id, 'Mei', async (state) => {
    for (const when of at) state.reviews.push({ dishId: 'wrap', dishName: 'Chicken doner wrap', venueId: 'turks-kebab', rating: 5, at: when })
    return { result: null }
  })
  return learners
}

test('cards for places you have reviewed say what changed since your last visit', async () => {
  const asked = []
  const changes = async (venueId, since) => { asked.push([venueId, since]); return WRAP_UP }
  const learners = await reviewedTurks(['2026-10-01T04:00:00.000Z', VISIT])
  const venues = (await find(service({ changes, learners }))).venues
  const turks = venues.find((v) => v.id === 'turks-kebab')
  assert.deepEqual(asked, [['turks-kebab', VISIT]], 'asked once, from the latest visit')
  assert.equal(turks.sinceLastVisit.since, VISIT)
  assert.equal(turks.sinceLastVisit.prices[0].to, 10.5)
  assert.equal(venues.find((v) => v.id === 'yangon-flavours').sinceLastVisit, undefined)
})

test('if what changed can\'t be fetched, the card just goes without it', async () => {
  const changes = async () => { throw Object.assign(new Error('catalog down'), { status: 503 }) }
  const venues = (await find(service({ changes, learners: await reviewedTurks() }))).venues
  assert.equal(venues.length, 2)
  assert.equal(venues.find((v) => v.id === 'turks-kebab').sinceLastVisit, undefined)
})

test('Surprise and group cards get it too', async () => {
  const changes = async () => WRAP_UP
  const learners = await reviewedTurks()
  const recs = service({ changes, learners, venues: [TURKS], kakis: [{ id: 'jh', displayName: 'Jia Hui', restrictions: [] }] })
  const group = await recs.recommend(diner, { mode: 'find', mood: null, context: { raining: false }, withIds: ['jh'] })
  assert.equal(group.venues[0].sinceLastVisit?.since, VISIT)
})

test('a place you visited that has closed since leads the closed list, flagged', async () => {
  const statuses = new Map([
    ['yangon-flavours', { venueId: 'yangon-flavours', status: 'CLOSED', reportedAt: '2026-10-01T00:00:00Z' }],
    ['turks-kebab', { venueId: 'turks-kebab', status: 'TEMPORARILY_CLOSED', note: 'Renovating', reportedAt: '2026-10-20T00:00:00Z' }],
  ])
  const result = await find(service({ statuses, learners: await reviewedTurks(), changes: async () => WRAP_UP }))
  assert.deepEqual(result.ownerReports.closedNearby.map((v) => [v.id, Boolean(v.closedSinceYourVisit)]), [
    ['turks-kebab', true],
    ['yangon-flavours', false],
  ])
})

// --- CSD-51: live prices in the match, and "was / now" on your reviewed cards ---

test('live prices set a venue\'s price level in the match', async () => {
  const score = async (prices) => (await find(service({ prices }))).venues.find((v) => v.id === 'turks-kebab').matchScore
  assert.ok(await score(new Map([['turks-kebab', 14]])) < await score(new Map([['turks-kebab', 6]])),
    'a pricier Turk\'s Kebab matches a mid-budget diner less')
})

test('the card says what the venue\'s changes did to your match, with your taste today', async () => {
  const pricier = { ...WRAP_UP, priceThen: 8.5, priceNow: 14 }
  const recs = service({ changes: async () => pricier, learners: await reviewedTurks(), prices: new Map([['turks-kebab', 14]]) })
  const turks = (await find(recs)).venues.find((v) => v.id === 'turks-kebab')
  assert.equal(turks.sinceLastVisit.match.now, turks.matchScore)
  assert.ok(turks.sinceLastVisit.match.was > turks.sinceLastVisit.match.now, 'pricier than at the visit: the match went down')
})

test('no match line when the venue\'s changes didn\'t move it, and none on group cards', async () => {
  const same = { ...WRAP_UP, priceThen: 9, priceNow: 9 }
  const solo = service({ changes: async () => same, learners: await reviewedTurks(), prices: new Map([['turks-kebab', 9]]) })
  assert.equal((await find(solo)).venues.find((v) => v.id === 'turks-kebab').sinceLastVisit.match, undefined)

  const pricier = { ...WRAP_UP, priceThen: 8.5, priceNow: 14 }
  const recs = service({ changes: async () => pricier, learners: await reviewedTurks(), venues: [TURKS], kakis: [{ id: 'jh', displayName: 'Jia Hui', restrictions: [] }] })
  const group = await recs.recommend(diner, { mode: 'find', mood: null, context: { raining: false }, withIds: ['jh'] })
  assert.equal(group.venues[0].sinceLastVisit.match, undefined)
})

test('venue search scores use live prices too, so its match agrees with the card', async () => {
  const user = { ...diner, me: { ...diner.me } }
  const matchIn = async (prices) => (await service({ prices }).search(user, 'turk', 5)).find((r) => r.id === 'turks-kebab').matchScore
  assert.ok(await matchIn(new Map([['turks-kebab', 14]])) < await matchIn(new Map([['turks-kebab', 6]])))
})

test('no match line unless the venue had a typical price both at the visit and now', async () => {
  const firstPriced = { ...WRAP_UP, prices: [{ dishId: 'x', name: 'Chicken rice', from: null, to: 15 }], priceThen: null, priceNow: 15 }
  const recs = service({ changes: async () => firstPriced, learners: await reviewedTurks(), prices: new Map([['turks-kebab', 15]]) })
  assert.equal((await find(recs)).venues.find((v) => v.id === 'turks-kebab').sinceLastVisit.match, undefined)
})

test('a venue the catalog no longer knows just gets no box, on group cards too', async () => {
  const recs = service({ changes: async () => null, learners: await reviewedTurks(), venues: [TURKS], kakis: [{ id: 'jh', displayName: 'Jia Hui', restrictions: [] }] })
  const group = await recs.recommend(diner, { mode: 'find', mood: null, context: { raining: false }, withIds: ['jh'] })
  assert.equal(group.venues[0].sinceLastVisit, undefined)
})

// --- CSD-52: why your match changed ---

const PRICIER = { ...WRAP_UP, priceThen: 8.5, priceNow: 14 }
const pricierTurks = async (extra = {}) =>
  service({ changes: async () => PRICIER, learners: await reviewedTurks(), prices: new Map([['turks-kebab', 14]]), ...extra })

test('a card whose match moved carries a plain explanation straight away', async () => {
  const turks = (await find(await pricierTurks())).venues.find((v) => v.id === 'turks-kebab')
  assert.deepEqual(turks.sinceLastVisit.explanation, {
    text: 'Prices here went up about 65% (typically $8.50 → $14.00), and you usually go for mid-range places.',
    writtenBy: 'template',
  })
})

test('Claude\'s explanation comes from its own call, once per change', async () => {
  const asked = []
  const explainer = { explain: async (input) => { asked.push(input); return { text: 'Claude says: pricier now.', writtenBy: 'ai' } } }
  const recs = await pricierTurks({ explainer })
  assert.deepEqual(await recs.explainChange(diner, 'turks-kebab'), { text: 'Claude says: pricier now.', writtenBy: 'ai' })
  await recs.explainChange(diner, 'turks-kebab')
  assert.equal(asked.length, 1)
  assert.equal(asked[0].venueName, "Turk's Kebab")
  assert.ok(asked[0].match.was > asked[0].match.now)
  assert.equal(asked[0].changes.priceNow, 14)
})

test('no explanation for a place you never visited, or whose match didn\'t move', async () => {
  const explainer = { explain: async () => ({ text: 'x', writtenBy: 'ai' }) }
  const recs = await pricierTurks({ explainer })
  assert.equal(await recs.explainChange(diner, 'yangon-flavours'), null)
  const same = service({ changes: async () => ({ ...WRAP_UP, priceThen: 9, priceNow: 9 }), learners: await reviewedTurks(), prices: new Map([['turks-kebab', 9]]), explainer })
  assert.equal(await same.explainChange(diner, 'turks-kebab'), null)
})

test('a different change gets a fresh explanation, even with the same number of changes', async () => {
  let current = PRICIER
  let asked = 0
  const explainer = { explain: async () => ({ text: `Claude ${++asked}`, writtenBy: 'ai' }) }
  const recs = service({ changes: async () => current, learners: await reviewedTurks(), prices: new Map([['turks-kebab', 14]]), explainer })
  assert.equal((await recs.explainChange(diner, 'turks-kebab')).text, 'Claude 1')
  current = { ...PRICIER, prices: [{ ...PRICIER.prices[0], name: 'Lamb shish wrap' }] }
  assert.equal((await recs.explainChange(diner, 'turks-kebab')).text, 'Claude 2')
})

test('a fallback explanation is kept for a while before Claude is asked again', async () => {
  let clock = MONDAY_8PM.getTime()
  let asked = 0
  const explainer = { explain: async () => { asked++; return { text: 'plain', writtenBy: 'template' } } }
  const recs = service({ changes: async () => PRICIER, learners: await reviewedTurks(), prices: new Map([['turks-kebab', 14]]), explainer, clock: () => new Date(clock) })
  await recs.explainChange(diner, 'turks-kebab')
  await recs.explainChange(diner, 'turks-kebab')
  assert.equal(asked, 1)
  clock += 11 * 60 * 1000
  await recs.explainChange(diner, 'turks-kebab')
  assert.equal(asked, 2)
})

// Recommendations from where the user is.
const BEDOK_MRT = { lat: 1.324, lon: 103.93 }
const JEFRI = { id: 'jefri-botak', name: 'Jefri Botak Chicken Rice', cuisine: 'chicken-rice', lat: 1.3248, lon: 103.9305 }
const findFrom = (recs, where) => recs.recommend(diner, { mode: 'find', mood: null, context: { raining: false }, ...where })

test('Find only keeps places within the walk of where you are, timed from there', async () => {
  const recs = service({ venues: [TURKS, YANGON, JEFRI] })
  const atSmu = await find(recs)
  assert.deepEqual(atSmu.venues.map((v) => v.id).sort(), ['turks-kebab', 'yangon-flavours'])
  assert.deepEqual(atSmu.near, { area: 'City', walkMin: 20 })

  const inBedok = await findFrom(recs, { from: BEDOK_MRT })
  assert.deepEqual(inBedok.venues.map((v) => v.id), ['jefri-botak'])
  assert.equal(inBedok.venues[0].distanceMin, 1)
  assert.ok(inBedok.venues[0].why.includes('1 min walk'))
  assert.equal(inBedok.near.area, 'Bedok')
})

test('a shorter walk leaves out the places further away', async () => {
  const result = await findFrom(service(), { walkMin: 6 })
  assert.deepEqual(result.venues.map((v) => v.id), ['turks-kebab'])
  assert.equal(result.near.walkMin, 6)
})

test('a place with no coordinates is never counted as nearby', async () => {
  const recs = service({ venues: [TURKS, { id: 'nowhere', name: 'Nowhere Cafe', cuisine: 'turkish' }] })
  assert.deepEqual((await find(recs)).venues.map((v) => v.id), ['turks-kebab'])
})

test('search counts the walk from where you are, so its match % agrees with the feed', async () => {
  const recs = service({ venues: [TURKS, YANGON, JEFRI] })
  const [fromSmu] = await recs.search(diner, 'jefri', 5)
  const [fromBedok] = await recs.search(diner, 'jefri', 5, BEDOK_MRT)
  assert.ok(fromSmu.distanceMin > 100)
  assert.equal(fromBedok.distanceMin, 1)
  assert.ok(fromBedok.matchScore > fromSmu.matchScore)
  const fed = await findFrom(recs, { from: BEDOK_MRT })
  assert.equal(fed.venues[0].matchScore, fromBedok.matchScore)
})

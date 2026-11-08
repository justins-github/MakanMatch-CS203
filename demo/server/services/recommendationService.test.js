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

function service({ hours = new Map(), hoursDown = false, venues = [TURKS, YANGON], kakis = [], people, changes, statuses = new Map(), prices = new Map(), explainer, clock = () => MONDAY_8PM, learners = memoryLearnerStore({ starter: starterProfile }), vectors = { size: 0 } } = {}) {
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
    ...(people ? { people } : {}),
  }
  return createRecommendationService({
    registry: registryOf(venues),
    vectors,
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

// Taste set by hand (profileService.tune): the embedding comes from the cuisines on the
// sliders, not from your reviews, until your next review.
test('a taste set by hand takes its embedding from the sliders, not your reviews', async () => {
  const learners = memoryLearnerStore({ starter: starterProfile })
  await learners.update(diner.id, 'Mei', async (state) => {
    state.reviews.push({ dishId: 'mohinga', dishName: 'Mohinga', venueId: 'yangon-flavours', score10: 9, at: '2026-10-12T04:00:00.000Z' })
    return { result: null }
  })
  // Mei's review taught a taste right on Yangon. The ramen bar has no cuisine on record,
  // but its embedding sits next to the Japanese place's.
  const SUSHI = { id: 'sushi-bar', name: 'Sushi Bar', cuisine: 'japanese', lat: 1.3010, lon: 103.85, gersId: 'g-sushi' }
  const RAMEN = { id: 'ramen-bar', name: 'Ramen Bar', cuisine: null, lat: 1.3012, lon: 103.85, gersId: 'g-ramen' }
  const embeddings = new Map([['g-sushi', [1, 0, 0]], ['g-ramen', [0.96, 0.28, 0]], ['g-yangon', [0, 0, 1]], ['g-turks', [0, 1, 0]]])
  const cosine = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b))
  const vectors = {
    size: embeddings.size,
    vectorsFor: async (ids) => new Map(ids.filter((id) => embeddings.has(id)).map((id) => [id, embeddings.get(id)])),
    similarities: async (ids, vector) => new Map(ids.filter((id) => embeddings.has(id)).map((id) => [id, cosine(embeddings.get(id), [...vector])])),
  }
  const venues = [{ ...TURKS, gersId: 'g-turks' }, { ...YANGON, gersId: 'g-yangon' }, SUSHI, RAMEN]
  const recs = service({ venues, vectors, learners, changes: async () => null })
  const byId = async () => new Map((await find(recs)).venues.map((v) => [v.id, v]))

  const learned = await byId()
  assert.ok(learned.get('yangon-flavours').why.includes("Similar to places you've rated well"))
  assert.ok(!learned.get('ramen-bar').why.some((w) => w.startsWith('Close to')))

  await learners.update(diner.id, 'Mei', async (state) => {
    state.profile = { ...state.profile, cuisineAffinity: { japanese: 1, burmese: 0.3 }, setByHand: true }
    return { result: null }
  })
  const byHand = await byId()
  assert.ok(byHand.get('ramen-bar').why.includes('Close to the taste you set'))
  assert.ok(!byHand.get('yangon-flavours').why.some((w) => w.startsWith('Similar') || w.startsWith('Close')))
})

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

// The catalog prices every place with a menu, so a card can say it has one (an admin can
// review-bomb only those: the bombers need a dish to pan).
test('cards for places with a menu say so', async () => {
  const recs = service({ prices: new Map([['turks-kebab', 9]]) })
  const byId = new Map((await find(recs)).venues.map((v) => [v.id, v]))
  assert.equal(byId.get('turks-kebab').hasMenu, true)
  assert.equal(byId.get('yangon-flavours').hasMenu, undefined)
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
  assert.equal(inBedok.venues[0].distanceMin, 2)
  assert.ok(inBedok.venues[0].why.includes('2 min walk'))
  assert.equal(inBedok.near.area, 'Bedok')
})

test('a shorter walk leaves out the places further away', async () => {
  const result = await findFrom(service(), { walkMin: 8 })
  assert.deepEqual(result.venues.map((v) => v.id), ['turks-kebab'])
  assert.equal(result.near.walkMin, 8)
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
  assert.equal(fromBedok.distanceMin, 2)
  assert.ok(fromBedok.matchScore > fromSmu.matchScore)
  const fed = await findFrom(recs, { from: BEDOK_MRT })
  assert.equal(fed.venues[0].matchScore, fromBedok.matchScore)
})

// Other people's reviews change your match. Turk's Kebab with its curated spice, at a 5 minute walk.
const MILD_TURKS = { ...TURKS, spice: 0.3, richness: 0.7, priceTier: 1 }
const WEI_LING = '11111111-1111-1111-1111-111111111111'
const HAFIZ = '22222222-2222-2222-2222-222222222222'
const NADIA = '33333333-3333-3333-3333-333333333333'
const NAMES = { [WEI_LING]: 'Wei Ling', [HAFIZ]: 'Hafiz', [NADIA]: 'Nadia' }
const names = async (_token, ids) => ids.map((id) => ({ id, displayName: NAMES[id], username: null }))
const TOO_SPICY = { dimension: 'spice', direction: 'down', strength: 2, quote: 'SUPER SPICY', why: '' }

const daysBefore = (days) => new Date(MONDAY_8PM.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
const longAgo = { dishId: 'old', dishName: 'Old', venueId: 'somewhere-else', sentiment: 'fine', text: '', at: daysBefore(90) }

// Someone with this taste and this many reviews, all long enough ago not to count.
const person = (learners, userId, taste, reviewCount = 8) =>
  learners.update(userId, 'Someone', async (state) => {
    Object.assign(state.profile, taste)
    state.reviews.push(...Array.from({ length: reviewCount }, () => ({ ...longAgo })))
    return { result: null }
  })

const says = (learners, userId, extra = {}) =>
  learners.update(userId, 'Someone', async (state) => {
    state.reviews.push({
      dishId: 'wrap', dishName: 'Wrap', venueId: TURKS.id, sentiment: 'disliked', text: 'SUPER SPICY', signals: [TOO_SPICY], at: daysBefore(1), ...extra,
    })
    return { result: null }
  })

const newLearners = () => memoryLearnerStore({ starter: starterProfile })

// A spice-shy diner, plus `count` people like them who've each reviewed the place.
async function bombed(learners, count = 3, { dinerTaste = { spicePref: 0.15 }, extra = {} } = {}) {
  await person(learners, diner.id, dinerTaste)
  for (const id of [WEI_LING, HAFIZ, NADIA].slice(0, count)) {
    await person(learners, id, { spicePref: 0.18 })
    await says(learners, id, extra)
  }
}

const cardOf = (result) => result.venues.find((v) => v.id === TURKS.id)
const quietScore = async (dinerTaste = { spicePref: 0.15 }) => {
  const learners = newLearners()
  await person(learners, diner.id, dinerTaste)
  return cardOf(await find(service({ learners, venues: [MILD_TURKS] }))).matchScore
}

test('three "too spicy" reviews lower a spice-shy diner by 10 or more, and the card says why', async () => {
  const learners = newLearners()
  await bombed(learners)
  const card = cardOf(await find(service({ learners, venues: [MILD_TURKS], people: names })))
  assert.ok(card.reviewChange.was - card.reviewChange.now >= 10, `${card.reviewChange.was} -> ${card.reviewChange.now}`)
  assert.equal(card.reviewChange.now, card.matchScore)
  assert.equal(card.reviewChange.text, "3 people with taste like yours said it's too spicy.")
  assert.equal(card.reviewChange.label, 'Recent reviews · this week')
  assert.deepEqual(card.reviewChange.reviewers.map((r) => r.displayName).sort(), ['Hafiz', 'Nadia', 'Wei Ling'])
  assert.deepEqual(Object.keys(card.reviewChange.reviewers[0]).sort(), ['displayName', 'id'])
})

test('"was" is what the card scores with no reviews at all', async () => {
  const before = await quietScore()
  const learners = newLearners()
  await bombed(learners)
  const card = cardOf(await find(service({ learners, venues: [MILD_TURKS], people: names })))
  assert.equal(card.reviewChange.was, before)
})

test('one review moves a spice-shy diner by under 5 points', async () => {
  const before = await quietScore()
  const learners = newLearners()
  await bombed(learners, 1)
  const after = cardOf(await find(service({ learners, venues: [MILD_TURKS], people: names }))).matchScore
  assert.ok(before > after && before - after < 5, `${before} -> ${after}`)
})

test('three brand-new accounts move the match by 2 points or fewer', async () => {
  const before = await quietScore()
  const learners = newLearners()
  await person(learners, diner.id, { spicePref: 0.15 })
  for (const id of [WEI_LING, HAFIZ, NADIA]) await says(learners, id)
  const after = cardOf(await find(service({ learners, venues: [MILD_TURKS], people: names }))).matchScore
  assert.ok(before - after <= 2, `${before} -> ${after}`)
})

test('the same reviews raise the match for a spice lover', async () => {
  const learners = newLearners()
  await bombed(learners, 3, { dinerTaste: { spicePref: 1 } })
  const card = cardOf(await find(service({ learners, venues: [MILD_TURKS], people: names })))
  assert.ok(card.reviewChange.now > card.reviewChange.was, `${card.reviewChange.was} -> ${card.reviewChange.now}`)
  assert.equal(card.reviewChange.text, "3 people said it's too spicy, which usually suits you.")
})

test('undone reviews stop counting, and the match goes back', async () => {
  const learners = newLearners()
  await bombed(learners)
  const before = cardOf(await find(service({ learners, venues: [MILD_TURKS], people: names })))
  for (const id of [WEI_LING, HAFIZ, NADIA]) {
    await learners.update(id, 'Someone', async (state) => {
      state.reviews.at(-1).undone = true
      return { result: null }
    })
  }
  const after = cardOf(await find(service({ learners, venues: [MILD_TURKS], people: names })))
  assert.equal(after.matchScore, before.reviewChange.was)
  assert.equal(after.reviewChange, undefined)
})

test('reviews more than 30 days old have no effect', async () => {
  const learners = newLearners()
  await bombed(learners, 3, { extra: { at: daysBefore(31) } })
  const card = cardOf(await find(service({ learners, venues: [MILD_TURKS], people: names })))
  assert.equal(card.reviewChange, undefined)
})

test('with no reviews, nothing changes and nothing dropped out', async () => {
  const result = await find(service({ learners: newLearners(), venues: [MILD_TURKS] }))
  assert.equal(cardOf(result).reviewChange, undefined)
  assert.deepEqual(result.droppedByReviews, [])
})

test('your own review does not move your own match', async () => {
  const learners = newLearners()
  await person(learners, diner.id, { spicePref: 0.15 })
  await says(learners, diner.id)
  const changes = async () => ({ prices: [], added: [], removed: [], updates: [], since: daysBefore(1), priceThen: null, priceNow: null })
  const card = cardOf(await find(service({ learners, venues: [MILD_TURKS], changes })))
  assert.equal(card.reviewChange, undefined)
})

test('group scores count reviews, per person, with no banner', async () => {
  const KAKI = '44444444-4444-4444-4444-444444444444'
  const kakis = [{ id: KAKI, displayName: 'Jia Hui', restrictions: [] }]
  const withKaki = (recs) => recs.recommend(diner, { mode: 'find', mood: null, context: { raining: false }, withIds: [KAKI] })
  const quiet = newLearners()
  await person(quiet, diner.id, { spicePref: 0.15 })
  const before = cardOf(await withKaki(service({ learners: quiet, venues: [MILD_TURKS], kakis })))
  const learners = newLearners()
  await bombed(learners)
  const result = await withKaki(service({ learners, venues: [MILD_TURKS], kakis, people: names }))
  const after = cardOf(result)
  assert.ok(after.groupScores[0].score < before.groupScores[0].score)
  assert.equal(after.reviewChange, undefined)
  assert.equal(result.droppedByReviews, undefined)
})

test('a Surprise pick says when reviews moved it, and has no dropped-out list', async () => {
  const learners = newLearners()
  await bombed(learners)
  const recs = service({ learners, venues: [MILD_TURKS], people: names })
  const result = await recs.recommend(diner, { mode: 'surprise', mood: null, context: { raining: false } })
  const [pick] = result.venues
  assert.ok(pick.reviewChange.was - pick.reviewChange.now >= 10)
  assert.equal(pick.reviewChange.now, pick.matchScore)
  assert.equal(result.droppedByReviews, undefined)
})

test('search shows the same match as the card', async () => {
  const learners = newLearners()
  await bombed(learners)
  const recs = service({ learners, venues: [MILD_TURKS], people: names })
  const card = cardOf(await find(recs))
  const [found] = await recs.search(diner, 'turk', 5)
  assert.equal(found.matchScore, card.matchScore)
  assert.equal(found.matchScore, card.reviewChange.now)
})

test("if reviews can't be read, Find still answers with today's scores", async () => {
  const before = await quietScore()
  const quiet = newLearners()
  await person(quiet, diner.id, { spicePref: 0.15 })
  const learners = { ...quiet, recentReviewsAt: async () => { throw new Error('database down') } }
  const after = cardOf(await find(service({ learners, venues: [MILD_TURKS] })))
  assert.equal(after.matchScore, before)
})

test("if names can't be fetched, the banner still shows, without faces", async () => {
  const learners = newLearners()
  await bombed(learners)
  const down = async () => { throw new Error('account service down') }
  const card = cardOf(await find(service({ learners, venues: [MILD_TURKS], people: down })))
  assert.ok(card.reviewChange.text.startsWith('3 people'))
  assert.deepEqual(card.reviewChange.reviewers, [])
})

test('with no way to fetch names at all, Find still works', async () => {
  const learners = newLearners()
  await bombed(learners)
  const card = cardOf(await find(service({ learners, venues: [MILD_TURKS] })))
  assert.deepEqual(card.reviewChange.reviewers, [])
})

// Places scoring between Turk's Kebab before the reviews (79) and after them (about 64).
const rivals = (count, facts = { spice: 0.6 }) => Array.from({ length: count }, (_, i) => ({
  id: `rival-${i}`, name: `Rival ${i}`, cuisine: 'thai', richness: 0.5, priceTier: 1, lat: TURKS.lat, lon: TURKS.lon, ...facts,
}))

test('a place pushed out of the top 10 by reviews stays on screen below the list', async () => {
  const learners = newLearners()
  await bombed(learners)
  const result = await find(service({ learners, venues: [MILD_TURKS, ...rivals(10)], people: names }))
  assert.equal(result.venues.length, 10)
  assert.ok(!result.venues.some((v) => v.id === TURKS.id))
  assert.deepEqual(result.droppedByReviews.map((v) => v.id), [TURKS.id])
  const [dropped] = result.droppedByReviews
  assert.ok(dropped.reviewChange.now < dropped.reviewChange.was)
  assert.equal(dropped.matchScore, dropped.reviewChange.now)
  assert.ok(dropped.reviewChange.text.includes('too spicy'))
})

test('a place that stays in the top 10 is not listed as dropped', async () => {
  const learners = newLearners()
  await bombed(learners)
  const result = await find(service({ learners, venues: [MILD_TURKS, ...rivals(5)], people: names }))
  assert.ok(result.venues.some((v) => v.id === TURKS.id))
  assert.deepEqual(result.droppedByReviews, [])
})

test('a place that was never in your top 10 is not listed as dropped', async () => {
  const learners = newLearners()
  await bombed(learners)
  const neverTop = { ...MILD_TURKS, spice: 1 } // below the rivals with or without reviews
  const result = await find(service({ learners, venues: [neverTop, ...rivals(10)], people: names }))
  assert.ok(!result.venues.some((v) => v.id === TURKS.id))
  assert.deepEqual(result.droppedByReviews, [])
})

test('a place left out for being shut is not listed as dropped', async () => {
  const learners = newLearners()
  await bombed(learners)
  const hours = new Map([[TURKS.id, everyDay('11:00', '14:30')]])
  const result = await find(service({ learners, venues: [MILD_TURKS, ...rivals(10)], people: names, hours }))
  assert.deepEqual(result.droppedByReviews, [])
})

test('a place that only slipped out by under 3 points is not listed', async () => {
  const learners = newLearners()
  await person(learners, diner.id, { spicePref: 0.15 })
  await person(learners, WEI_LING, { spicePref: 0.18 }, 2) // with this review that's 3: it counts, but not in full
  await says(learners, WEI_LING)
  const result = await find(service({ learners, venues: [MILD_TURKS, ...rivals(10, { spice: 0.45 })], people: names }))
  assert.ok(!result.venues.some((v) => v.id === TURKS.id), 'it did slip out')
  assert.deepEqual(result.droppedByReviews, [])
})

test('at most three places are listed as dropped, biggest drop first', async () => {
  const learners = newLearners()
  await person(learners, diner.id, { spicePref: 0.15 })
  const places = ['one-review', 'three-reviews', 'two-reviews', 'also-one'].map((id) => ({ ...MILD_TURKS, id, name: id }))
  const reviewers = { 'one-review': [WEI_LING], 'three-reviews': [WEI_LING, HAFIZ, NADIA], 'two-reviews': [WEI_LING, HAFIZ], 'also-one': [HAFIZ] }
  for (const id of [WEI_LING, HAFIZ, NADIA]) await person(learners, id, { spicePref: 0.18 })
  for (const [venueId, ids] of Object.entries(reviewers)) {
    for (const id of ids) await says(learners, id, { venueId })
  }
  const result = await find(service({ learners, venues: [...places, ...rivals(10)], people: names }))
  assert.equal(result.droppedByReviews.length, 3)
  assert.deepEqual(result.droppedByReviews.slice(0, 2).map((v) => v.id), ['three-reviews', 'two-reviews'])
})

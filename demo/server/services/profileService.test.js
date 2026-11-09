import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBeliReview, starterProfile } from '../learn.js'
import { memoryLearnerStore } from './learnerStore.js'
import { createProfileService } from './profileService.js'

const mei = { id: '12121212-1212-1212-1212-121212121212', me: { displayName: 'Mei' } }
const MALA = { id: 'mala-place', name: 'Mala place', cuisine: 'chinese' }

async function lovedSpicyDishes(learners, count) {
  for (let i = 0; i < count; i++) {
    const dish = { id: `mala-${i}`, venueId: MALA.id, name: 'Mala', price: 9, priceTier: 1, spice: 0.95, richness: 0.5, novelty: 0.5, tags: [] }
    await learners.update(mei.id, 'Mei', async (state) => {
      const result = applyBeliReview(state, dish, MALA, { sentiment: 'loved', duels: [], insertIndex: 0 })
      return { result, review: result.review }
    })
  }
}

test('a new user has no trends yet', async () => {
  const learners = memoryLearnerStore({ starter: starterProfile })
  assert.deepEqual((await createProfileService({ learners }).tasteDna(mei)).trends, [])
})

test('the Taste DNA comes with trends from recent reviews', async () => {
  const learners = memoryLearnerStore({ starter: starterProfile })
  await lovedSpicyDishes(learners, 5)
  const { trends } = await createProfileService({ learners }).tasteDna(mei)
  const spice = trends.find((t) => t.key === 'spice')
  assert.equal(spice?.headline, "You're eating spicier")
  assert.equal(spice.from, 0.5)
  assert.equal(spice.reviews, 5)
})

// Stands in for tasteSummary.js: counts how often a summary is written.
function fakeWriter(summary = "You've been chasing heat lately. Lean in?") {
  const writes = []
  return { writes, write: async (suggestion) => { writes.push(suggestion); return { summary, writtenBy: 'ai' } } }
}

async function withSpicyTrend() {
  const learners = memoryLearnerStore({ starter: starterProfile })
  await lovedSpicyDishes(learners, 5)
  const summaries = fakeWriter()
  return { learners, summaries, profiles: createProfileService({ learners, summaries }) }
}

// A taste set by hand jumps in one step; that's not something learned "lately".
test('while a taste is set by hand there are no trends and no suggestion', async () => {
  const { learners, profiles, summaries } = await withSpicyTrend()
  await learners.update(mei.id, 'Mei', async (state) => {
    state.profile = { ...state.profile, setByHand: true }
    return { result: null }
  })
  assert.deepEqual((await profiles.tasteDna(mei)).trends, [])
  assert.deepEqual(await profiles.suggestion(mei), { suggestion: null })
  assert.equal(summaries.writes.length, 0)
})

test('no trends, no suggestion', async () => {
  const learners = memoryLearnerStore({ starter: starterProfile })
  assert.deepEqual(await createProfileService({ learners, summaries: fakeWriter() }).suggestion(mei), { suggestion: null })
})

test('a user with trends gets a summary and what accepting would change', async () => {
  const { profiles } = await withSpicyTrend()
  const { suggestion } = await profiles.suggestion(mei)
  assert.equal(suggestion.summary, "You've been chasing heat lately. Lean in?")
  assert.equal(suggestion.writtenBy, 'ai')
  const spice = suggestion.changes.find((c) => c.key === 'spice')
  assert.ok(spice.step > 0)
  assert.equal(spice.label, 'Spice')
  assert.match(suggestion.signature, /spice:up/)
})

test('the summary is written once per suggestion, not on every visit', async () => {
  const { profiles, summaries } = await withSpicyTrend()
  await profiles.suggestion(mei)
  await profiles.suggestion(mei)
  assert.equal(summaries.writes.length, 1)
})

test('accepting leans the profile in, and that suggestion goes away', async () => {
  const { profiles, learners } = await withSpicyTrend()
  const { suggestion } = await profiles.suggestion(mei)
  const before = (await learners.read(mei.id, 'Mei')).profile.spicePref
  const step = suggestion.changes.find((c) => c.key === 'spice').step
  const { applied } = await profiles.acceptSuggestion(mei, { signature: suggestion.signature })
  const after = (await learners.read(mei.id, 'Mei')).profile.spicePref
  assert.equal(Math.round((after - before) * 100) / 100, step)
  assert.ok(applied.some((c) => c.key === 'spice' && c.to > c.from))
  assert.deepEqual(await profiles.suggestion(mei), { suggestion: null })
  assert.ok((await learners.read(mei.id, 'Mei')).decisions.every((d) => d.decision === 'accepted'))
})

test('dismissing changes nothing, and the suggestion never comes back', async () => {
  const { profiles, learners } = await withSpicyTrend()
  const { suggestion } = await profiles.suggestion(mei)
  const before = (await learners.read(mei.id, 'Mei')).profile
  await profiles.dismissSuggestion(mei, { signature: suggestion.signature })
  assert.deepEqual((await learners.read(mei.id, 'Mei')).profile, before)
  assert.deepEqual(await profiles.suggestion(mei), { suggestion: null })
})

test('a stale suggestion is refused with 409, a missing one with 400', async () => {
  const { profiles } = await withSpicyTrend()
  await assert.rejects(profiles.acceptSuggestion(mei, { signature: 'richness:down' }), { status: 409 })
  await assert.rejects(profiles.dismissSuggestion(mei, {}), { status: 400 })
})

test('a fallback summary is not kept, so Claude gets another go next visit', async () => {
  const learners = memoryLearnerStore({ starter: starterProfile })
  await lovedSpicyDishes(learners, 5)
  const answers = [{ summary: 'Lately you eat spicier.', writtenBy: 'template' }, { summary: 'Claude says lean in?', writtenBy: 'ai' }]
  let writes = 0
  const profiles = createProfileService({ learners, summaries: { write: async () => answers[writes++] } })
  assert.equal((await profiles.suggestion(mei)).suggestion.writtenBy, 'template')
  assert.equal((await profiles.suggestion(mei)).suggestion.writtenBy, 'ai')
  assert.equal((await profiles.suggestion(mei)).suggestion.writtenBy, 'ai')
  assert.equal(writes, 2)
})

test('two visits at once share one Claude call', async () => {
  const { profiles, summaries } = await withSpicyTrend()
  await Promise.all([profiles.suggestion(mei), profiles.suggestion(mei)])
  assert.equal(summaries.writes.length, 1)
})

// Taste sliders: admins set their real taste by hand (Taste DNA tab), e.g. to show Find
// reacting without posting twenty reviews. It stays "set by hand" until their next review.
const admin = { id: '34343434-3434-3434-3434-343434343434', me: { displayName: 'Justin', admin: true, effectiveRole: 'ADMIN' } }
const actingAsUser = { ...admin, me: { ...admin.me, effectiveRole: 'USER' } }
const dialsRegistry = {
  venues: [
    { id: 'a', cuisine: 'fast-food' }, { id: 'b', cuisine: 'fast-food' }, { id: 'c', cuisine: 'indian' },
    { id: 'd', cuisine: null },
  ],
}
const dialsService = (learners = memoryLearnerStore({ starter: starterProfile })) =>
  ({ learners, profiles: createProfileService({ learners, registry: dialsRegistry }) })

test('setting taste by hand is for admins only, not for an admin viewing as a user', async () => {
  const { profiles } = dialsService()
  for (const call of [(u) => profiles.dials(u), (u) => profiles.tune(u, { dials: { spicePref: 0 } })]) {
    await assert.rejects(call(mei), { status: 403 })
    await assert.rejects(call(actingAsUser), { status: 403 })
  }
})

test('the sliders show your taste now, with every cuisine, most places first', async () => {
  const { profiles } = dialsService()
  const dials = await profiles.dials(admin)
  assert.equal(dials.setByHand, false)
  assert.equal(dials.spicePref, 0.5)
  assert.equal(dials.priceComfort, 1)
  assert.deepEqual(dials.cuisines.slice(0, 2).map((c) => [c.key, c.venues]), [['fast-food', 2], ['indian', 1]])
  assert.equal(dials.cuisines.find((c) => c.key === 'indian').affinity, 0.5)
  assert.equal(dials.cuisines.find((c) => c.key === 'fast-food').affinity, 0.3, 'a cuisine the profile has never seen')
  assert.ok(dials.cuisines.some((c) => c.key === 'peranakan' && c.venues === 0), 'every cuisine the app knows')
})

test('saving sets your real Taste DNA, marked as set by hand', async () => {
  const { profiles } = dialsService()
  const dials = await profiles.tune(admin, { dials: { spicePref: 0, cuisineAffinity: { indian: 1, 'fast-food': 1 } } })
  assert.equal(dials.setByHand, true)
  assert.equal(dials.spicePref, 0)
  assert.equal(dials.cuisines.find((c) => c.key === 'indian').affinity, 1)
  const dna = await profiles.tasteDna(admin)
  assert.equal(dna.user.spicePref, 0)
  assert.equal(dna.user.cuisineAffinity['fast-food'], 1)
  assert.equal(dna.setByHand, true)
  assert.equal('setByHand' in dna.user, false, 'the mark is said once, not inside the profile')
})

test('sliders you leave alone keep their values', async () => {
  const { profiles } = dialsService()
  await profiles.tune(admin, { dials: { richnessPref: 0.8 } })
  const dials = await profiles.tune(admin, { dials: { spicePref: 0.1 } })
  assert.equal(dials.richnessPref, 0.8)
  assert.equal(dials.spicePref, 0.1)
})

test('the sliders come with a new account\'s taste, for "Reset to a new account"', async () => {
  const { profiles } = dialsService()
  await profiles.tune(admin, { dials: { spicePref: 0.1, priceComfort: 2, cuisineAffinity: { indian: 1 } } })
  const { starter } = await profiles.dials(admin)
  const fresh = starterProfile('Justin')
  for (const key of ['spicePref', 'richnessPref', 'priceComfort', 'adventurousness']) assert.equal(starter[key], fresh[key], key)
  assert.equal(starter.cuisines.find((c) => c.key === 'indian').affinity, 0.5)
  assert.equal(starter.cuisines.find((c) => c.key === 'fast-food').affinity, 0.3, 'a cuisine a new account has no feeling about')
  assert.equal(starter.cuisines.length, (await profiles.dials(admin)).cuisines.length)
})

test('every cuisine can go to 0 at once', async () => {
  const { profiles } = dialsService()
  const all = (await profiles.dials(admin)).cuisines.map((c) => c.key)
  const dials = await profiles.tune(admin, { dials: { cuisineAffinity: Object.fromEntries(all.map((key) => [key, 0])) } })
  assert.ok(dials.cuisines.every((c) => c.affinity === 0))
})

test('price comfort runs 0-2; the rest 0-1', async () => {
  const { profiles } = dialsService()
  assert.equal((await profiles.tune(admin, { dials: { priceComfort: 2 } })).priceComfort, 2)
  for (const dials of [{ priceComfort: 2.5 }, { spicePref: 1.5 }, { richnessPref: -0.1 }, { adventurousness: '1' }, { spicePref: null }]) {
    await assert.rejects(profiles.tune(admin, { dials }), { status: 400 }, JSON.stringify(dials))
  }
})

test('only cuisines the app knows can be tuned', async () => {
  const { profiles } = dialsService()
  await assert.rejects(profiles.tune(admin, { dials: { cuisineAffinity: { martian: 1 } } }), { status: 400 })
  await assert.rejects(profiles.tune(admin, { dials: { cuisineAffinity: { indian: 2 } } }), { status: 400 })
})

test('a save with nothing in it is a bad request', async () => {
  const { profiles } = dialsService()
  await assert.rejects(profiles.tune(admin, {}), { status: 400 })
  await assert.rejects(profiles.tune(admin, { dials: { name: 'x' } }), { status: 400 })
})

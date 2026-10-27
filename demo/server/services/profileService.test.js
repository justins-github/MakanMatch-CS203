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

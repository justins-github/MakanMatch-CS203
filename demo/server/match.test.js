import test from 'node:test'
import assert from 'node:assert/strict'
import { rankVenues, pickSurprise, computeNovelty, DEMO_USER } from './match.js'

// A community-enriched venue (all attributes known, like the hand-seeded ones).
function makeVenue(overrides = {}) {
  return {
    id: 'v-' + Math.random().toString(36).slice(2, 8),
    name: 'Test Venue',
    cuisine: 'chinese',
    tags: [],
    area: 'Bedok',
    address: 'somewhere',
    priceTier: 0,
    spice: 0.5,
    richness: 0.5,
    sheltered: true,
    distanceMin: 10,
    reviewCount: 30,
    dataAgeDays: 10,
    signature: 'Test dish',
    ...overrides,
  }
}

// A barebones Overture-seeded venue: cuisine (maybe), distance, provenance - nothing else.
function makeBare(overrides = {}) {
  return {
    id: 'o-' + Math.random().toString(36).slice(2, 8),
    name: 'Overture Venue',
    cuisine: 'thai',
    address: '1 Somewhere Rd',
    distanceMin: 8,
    reviewCount: 0,
    dataAgeDays: 21,
    overtureConfidence: 0.92,
    ...overrides,
  }
}

const CTX = { raining: false, mood: 'none' }

test('rain boosts a sheltered venue above an identical unsheltered one', () => {
  const sheltered = makeVenue({ id: 'shel', sheltered: true })
  const exposed = makeVenue({ id: 'expo', sheltered: false })
  const ranked = rankVenues([exposed, sheltered], DEMO_USER, { raining: true, mood: 'none' })
  assert.equal(ranked[0].id, 'shel')
  assert.ok(ranked[0].matchScore > ranked[1].matchScore)
})

test('rain neither rewards nor punishes a venue whose shelter is unknown', () => {
  const bare = makeBare()
  const [dry] = rankVenues([bare], DEMO_USER, CTX)
  const [wet] = rankVenues([bare], DEMO_USER, { raining: true, mood: 'none' })
  assert.equal(dry.matchScore, wet.matchScore)
  assert.ok(!wet.why.some((w) => w.includes('rain')))
})

test("mood 'soupy' promotes a soup-tagged venue over the mood-'none' winner", () => {
  const soup = makeVenue({ id: 'soup', tags: ['soup'], distanceMin: 14 })
  const notSoup = makeVenue({ id: 'dry', tags: ['grilled'], distanceMin: 2 })
  const plain = rankVenues([soup, notSoup], DEMO_USER, CTX)
  assert.equal(plain[0].id, 'dry')
  const soupy = rankVenues([soup, notSoup], DEMO_USER, { raining: false, mood: 'soupy' })
  assert.equal(soupy[0].id, 'soup')
})

test('moods leave venues with unknown attributes at their base score', () => {
  const bare = makeBare()
  const [plain] = rankVenues([bare], DEMO_USER, CTX)
  for (const mood of ['soupy', 'spicy', 'light']) {
    const [moody] = rankVenues([bare], DEMO_USER, { raining: false, mood })
    assert.equal(moody.matchScore, plain.matchScore, `mood ${mood} should not move an unmapped venue`)
  }
})

test('satiation: recently eaten cuisine scores lower than the same venue otherwise', () => {
  const venue = makeVenue({ cuisine: 'chicken-rice' })
  assert.ok(DEMO_USER.recentlyEaten.includes('chicken-rice'), 'fixture relies on demo user having eaten chicken-rice')
  const [scored] = rankVenues([venue], DEMO_USER, CTX)
  const [scoredFresh] = rankVenues([venue], { ...DEMO_USER, recentlyEaten: [] }, CTX)
  assert.ok(scored.matchScore < scoredFresh.matchScore)
})

test('barebones venue emits only the chips its data supports', () => {
  const [scored] = rankVenues([makeBare({ cuisine: 'turkish', distanceMin: 8 })], DEMO_USER, CTX)
  assert.deepEqual(scored.why, ['You love turkish', '8 min walk'])
  const [unknown] = rankVenues([makeBare({ cuisine: null })], DEMO_USER, CTX)
  assert.deepEqual(unknown.why, ['8 min walk'])
})

test('information cap: a barebones venue cannot outscore an identical-fit enriched one', () => {
  // Perfect-fit barebones turkish venue vs perfect-fit enriched turkish venue.
  const bare = makeBare({ cuisine: 'turkish', distanceMin: 1 })
  const rich = makeVenue({
    cuisine: 'turkish', spice: 0.6, richness: 0.5, priceTier: 0, distanceMin: 1, reviewCount: 40,
  })
  const [b] = rankVenues([bare], DEMO_USER, CTX)
  const [r] = rankVenues([rich], DEMO_USER, CTX)
  assert.ok(b.matchScore <= 84, `barebones score ${b.matchScore} should be capped`)
  assert.ok(r.matchScore > b.matchScore, 'community data must buy score headroom')
})

test('every result has bounded score, valid confidence, non-empty why[], numeric novelty', () => {
  const venues = [
    makeVenue({ reviewCount: 60, dataAgeDays: 5 }),
    makeVenue({ reviewCount: 3, dataAgeDays: 200 }),
    makeBare(),
    makeBare({ cuisine: null, overtureConfidence: 0.55, dataAgeDays: 400 }),
  ]
  for (const mood of ['none', 'soupy', 'spicy', 'light']) {
    for (const raining of [true, false]) {
      const ranked = rankVenues(venues, DEMO_USER, { raining, mood })
      for (const r of ranked) {
        assert.ok(r.matchScore >= 5 && r.matchScore <= 99, `score ${r.matchScore} out of bounds`)
        assert.ok(['high', 'medium', 'low'].includes(r.confidence))
        assert.ok(Array.isArray(r.why) && r.why.length > 0)
        assert.ok(Number.isFinite(r.novelty))
      }
    }
  }
})

test('confidence combines review volume, data age, and Overture confidence', () => {
  const [hi] = rankVenues([makeVenue({ reviewCount: 30, dataAgeDays: 20 })], DEMO_USER, CTX)
  assert.equal(hi.confidence, 'high')
  // Fresh, well-attested Overture venue with no reviews yet: trustworthy-ish, not blind.
  const [fresh] = rankVenues([makeBare({ overtureConfidence: 0.96, dataAgeDays: 15 })], DEMO_USER, CTX)
  assert.equal(fresh.confidence, 'medium')
  // Weakly-attested, stale, unreviewed: the dots must say so.
  const [junk] = rankVenues([makeBare({ overtureConfidence: 0.55, dataAgeDays: 400 })], DEMO_USER, CTX)
  assert.equal(junk.confidence, 'low')
  // Community-vouched but ageing and lightly reviewed (the Selegie Soto case).
  const [mid] = rankVenues([makeVenue({ reviewCount: 9, dataAgeDays: 90 })], DEMO_USER, CTX)
  assert.equal(mid.confidence, 'medium')
})

test('novelty is computed from affinity, not authored', () => {
  const familiar = makeBare({ cuisine: 'turkish' }) // affinity 0.9
  const unfamiliar = makeBare({ cuisine: 'ethiopian' }) // affinity 0.35
  const mystery = makeBare({ cuisine: null })
  assert.ok(computeNovelty(unfamiliar, DEMO_USER) > computeNovelty(familiar, DEMO_USER))
  assert.ok(computeNovelty(mystery, DEMO_USER) < 0.55, 'unknown cuisine is not an adventure')
})

test('pickSurprise returns an unfamiliar-cuisine venue marked experimental', () => {
  const safe = makeVenue({ id: 'safe', cuisine: 'chicken-rice', distanceMin: 2 })
  const wild = makeBare({ id: 'wild', cuisine: 'ethiopian', distanceMin: 15 })
  const pick = pickSurprise([safe, wild], DEMO_USER, CTX)
  assert.equal(pick.id, 'wild')
  assert.equal(pick.experimental, true)
  assert.ok(pick.why[0].startsWith('Experimental pick'))
})

test('pickSurprise honors exclusions and never picks unknown-cuisine venues', () => {
  const a = makeBare({ id: 'a', cuisine: 'ethiopian' })
  const b = makeBare({ id: 'b', cuisine: 'burmese' })
  const mystery = makeBare({ id: 'm', cuisine: null })
  const first = pickSurprise([a, b, mystery], DEMO_USER, CTX)
  const second = pickSurprise([a, b, mystery], DEMO_USER, CTX, [first.id])
  assert.notEqual(second.id, first.id)
  assert.notEqual(second.id, 'm')
  const none = pickSurprise([mystery], DEMO_USER, CTX)
  assert.equal(none, null)
})

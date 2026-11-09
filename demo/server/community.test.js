import test from 'node:test'
import assert from 'node:assert/strict'
import { starterProfile } from './learn.js'
import { agreementLines, closeness, closenessBetween, communityFor, countsLabel, reviewChange, reviewWeight } from './community.js'

const NOW = Date.parse('2026-11-07T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const near = (actual, expected, tolerance = 0.001) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not about ${expected}`)

const base = starterProfile('a')
const ago = (days) => new Date(NOW - days * DAY).toISOString()
const person = (reviewCount = 8, profile = base) => ({ profile, reviewCount })
const viewer = { id: 'me', profile: base, reviewCount: 8 }
const tooSpicy = { dimension: 'spice', direction: 'down', strength: 2, quote: 'too spicy', why: '' }

const row = (userId, extra = {}) => ({
  userId, venueId: 'v', sentiment: 'disliked', signals: [tooSpicy], text: 'too spicy', at: ago(0), ...extra,
})
const threeTooSpicy = [row('a'), row('b'), row('c')]
const threePeople = new Map([['a', person()], ['b', person()], ['c', person()]])

test('closeness is 1 for identical tastes', () => {
  assert.equal(closeness(base, base), 1)
})

test('a gap in one dimension costs a fifth of its size, against the 0.35 scale', () => {
  near(closeness(base, { ...base, spicePref: 0.85 }), 0.8)
})

test('price comfort runs 0-2, so its gap counts half', () => {
  near(closeness(base, { ...base, priceComfort: 2 }), 0.714)
})

test('a cuisine only one person has counts as 0.3 for the other', () => {
  near(closeness({ ...base, cuisineAffinity: { turkish: 0.5 } }, { ...base, cuisineAffinity: {} }), 0.886)
})

test('closeness stops at 0 for opposite tastes', () => {
  const low = { name: 'x', cuisineAffinity: { thai: 0 }, spicePref: 0, richnessPref: 0, priceComfort: 0, adventurousness: 0 }
  const high = { name: 'y', cuisineAffinity: { thai: 1 }, spicePref: 1, richnessPref: 1, priceComfort: 2, adventurousness: 1 }
  assert.equal(closeness(low, high), 0)
})

test('with under 3 reviews on either side, closeness is an unknown 0.5', () => {
  const far = { ...base, spicePref: 1 }
  assert.deepEqual(closenessBetween(person(2), person(9, far)), { value: 0.5, known: false })
  assert.deepEqual(closenessBetween(person(9), person(2, far)), { value: 0.5, known: false })
  assert.deepEqual(closenessBetween(person(3), person(3)), { value: 1, known: true })
})

test('recency and history scale the weight', () => {
  near(reviewWeight(viewer, person(5), row('a', { at: ago(15) }), NOW).weight, 0.5)
  near(reviewWeight(viewer, person(4), row('a'), NOW).weight, 0.8)
  // Unknown closeness (0.5), squared, times history 0.2.
  near(reviewWeight(viewer, person(1), row('a'), NOW).weight, 0.05)
})

test('a review past the window has no weight', () => {
  assert.equal(reviewWeight(viewer, person(), row('a', { at: ago(31) }), NOW).weight, 0)
})

test('weight labels', () => {
  assert.equal(countsLabel(0.5), 'counts a lot')
  assert.equal(countsLabel(0.49), 'counts some')
  assert.equal(countsLabel(0.15), 'counts some')
  assert.equal(countsLabel(0.14), 'counts a little')
})

const voteOf = (dimension, direction, sentiment) => {
  const signals = [{ dimension, direction, strength: 2, quote: 'x', why: '' }]
  const input = communityFor(viewer, [row('a', { sentiment, signals })], threePeople, NOW).get('v')
  return dimension === 'spice' ? input.reviews[0].spiceVote : input.reviews[0].richnessVote
}

for (const dimension of ['spice', 'richness']) {
  test(`a verdict turns a ${dimension} signal into a fact about the venue`, () => {
    assert.equal(voteOf(dimension, 'down', 'disliked'), 1)
    assert.equal(voteOf(dimension, 'down', 'fine'), 1)
    assert.equal(voteOf(dimension, 'up', 'disliked'), -1)
    assert.equal(voteOf(dimension, 'up', 'fine'), -1)
    assert.equal(voteOf(dimension, 'up', 'loved'), 1)
    assert.equal(voteOf(dimension, 'down', 'loved'), -1)
  })
}

test('three fresh complaints from full-history reviewers shift heat and nudge the verdict', () => {
  const input = communityFor(viewer, threeTooSpicy, threePeople, NOW).get('v')
  near(input.spiceEvidence, 3)
  near(input.spiceShift, 0.4846)
  near(input.nudge, -8.308)
  assert.equal(input.richnessShift, 0)
  assert.equal(input.reviews.length, 3)
})

test('one review moves much less than three', () => {
  const input = communityFor(viewer, [row('a')], threePeople, NOW).get('v')
  near(input.spiceShift, 0.14)
  near(input.nudge, -12 / 5)
})

test('praise lifts the verdict', () => {
  const loved = [row('a', { sentiment: 'loved', signals: [] }), row('b', { sentiment: 'loved', signals: [] }), row('c', { sentiment: 'loved', signals: [] })]
  near(communityFor(viewer, loved, threePeople, NOW).get('v').nudge, 8.308)
})

test('"fine" with no reason moves nothing', () => {
  const input = communityFor(viewer, [row('a', { sentiment: 'fine', signals: [] })], threePeople, NOW).get('v')
  assert.equal(input.spiceShift, 0)
  assert.equal(input.nudge, 0)
})

test('taste closeness changes the verdict but not the heat', () => {
  const distant = { ...viewer, profile: { ...base, spicePref: 1, richnessPref: 1, adventurousness: 1 } }
  const close = communityFor(viewer, threeTooSpicy, threePeople, NOW).get('v')
  const far = communityFor(distant, threeTooSpicy, threePeople, NOW).get('v')
  near(far.spiceShift, close.spiceShift)
  assert.ok(Math.abs(far.nudge) < Math.abs(close.nudge))
})

test('undone reviews do not count', () => {
  assert.equal(communityFor(viewer, [row('a', { undone: true })], threePeople, NOW).size, 0)
})

test("the viewer's own review does not count", () => {
  const people = new Map([['me', person()]])
  assert.equal(communityFor(viewer, [row('me')], people, NOW).size, 0)
})

test('a review with no sentiment does not count', () => {
  assert.equal(communityFor(viewer, [row('a', { sentiment: undefined })], threePeople, NOW).size, 0)
})

test('reviews 30 days old or more do not count', () => {
  assert.equal(communityFor(viewer, [row('a', { at: ago(30) })], threePeople, NOW).size, 0)
  assert.equal(communityFor(viewer, [row('a', { at: ago(29) })], threePeople, NOW).size, 1)
})

test("one person's many reviews at a venue are one voice, the latest", () => {
  const rows = [
    row('a', { sentiment: 'loved', signals: [], at: ago(5), dishId: 'older' }),
    row('a', { at: ago(1), dishId: 'newer' }),
  ]
  const input = communityFor(viewer, rows, threePeople, NOW).get('v')
  assert.equal(input.reviews.length, 1)
  assert.equal(input.reviews[0].sentiment, 'disliked')
})

test('the same person counts separately at different venues', () => {
  const result = communityFor(viewer, [row('a'), row('a', { venueId: 'w' })], threePeople, NOW)
  assert.equal(result.get('v').reviews.length, 1)
  assert.equal(result.get('w').reviews.length, 1)
})

test('a complaint and a "could be spicier" cancel out, leaving no shift and no NaN', () => {
  const rows = [row('a'), row('b', { signals: [{ dimension: 'spice', direction: 'up', strength: 2, quote: 'x', why: '' }] })]
  const input = communityFor(viewer, rows, threePeople, NOW).get('v')
  assert.equal(input.spiceEvidence, 0)
  assert.equal(input.spiceShift, 0)
})

test('only spice and richness signals vote', () => {
  const signals = ['cuisine', 'price', 'adventurousness'].map((dimension) => ({ dimension, direction: 'down', strength: 2, quote: 'x', why: '' }))
  const [review] = communityFor(viewer, [row('a', { signals })], threePeople, NOW).get('v').reviews
  assert.equal(review.spiceVote, 0)
  assert.equal(review.richnessVote, 0)
})

test('two spice complaints in one review are one vote', () => {
  const input = communityFor(viewer, [row('a', { signals: [tooSpicy, tooSpicy] })], threePeople, NOW).get('v')
  assert.equal(input.reviews[0].spiceVote, 1)
  near(input.spiceEvidence, 1)
})

test('a review with empty text casts no vote, and its verdict still counts', () => {
  const input = communityFor(viewer, [row('a', { text: '', signals: [] })], threePeople, NOW).get('v')
  assert.equal(input.spiceShift, 0)
  assert.ok(input.nudge < 0)
})

test('an older review with no stored signals is re-read by keywords, using its verdict', () => {
  const rows = [row('a', { signals: undefined, text: 'way too spicy' }), row('b', { signals: undefined, text: 'SUPER SPICY' })]
  const input = communityFor(viewer, rows, threePeople, NOW).get('v')
  assert.deepEqual(input.reviews.map((r) => r.spiceVote), [1, 1])
})

test('a reviewer with no stored profile is ignored', () => {
  assert.equal(communityFor(viewer, [row('gone')], threePeople, NOW).size, 0)
})

test('a venue with no qualifying reviews has no entry', () => {
  assert.equal(communityFor(viewer, [], threePeople, NOW).size, 0)
})

// The banner's words.
const voter = (userId, extra = {}) => ({
  userId, weight: 0.8, closeness: 0.9, known: true, sentiment: 'disliked', spiceVote: 1, richnessVote: 0, at: ago(1), ...extra,
})
const inputOf = (reviews) => ({
  spiceShift: 0,
  richnessShift: 0,
  nudge: 0,
  spiceEvidence: reviews.reduce((sum, r) => sum + r.spiceVote, 0),
  richnessEvidence: reviews.reduce((sum, r) => sum + r.richnessVote, 0),
  reviews,
})
const three = (extra = {}) => [voter('a', extra), voter('b', extra), voter('c', extra)]
const fell = (reviews, who = viewer) => reviewChange(inputOf(reviews), 80, 65, who, NOW)
const rose = (reviews, who = viewer) => reviewChange(inputOf(reviews), 70, 76, who, NOW)

test('banner: close reviewers said it is too spicy, and your match fell', () => {
  assert.equal(fell(three()).text, "3 people with taste like yours said it's too spicy.")
})

test('banner: distant reviewers said it is too spicy, and your match rose', () => {
  assert.equal(rose(three({ closeness: 0.3 })).text, "3 people said it's too spicy, which usually suits you.")
})

test('banner: heavier', () => {
  assert.equal(fell(three({ closeness: 0.3, spiceVote: 0, richnessVote: 1 })).text, "3 people said it's too heavy.")
  assert.equal(rose(three({ closeness: 0.3, spiceVote: 0, richnessVote: 1 })).text, "3 people said it's too heavy, which usually suits you.")
})

test('banner: milder and lighter', () => {
  assert.equal(fell(three({ closeness: 0.3, spiceVote: -1 })).text, "3 people said it's not very spicy.")
  assert.equal(fell(three({ closeness: 0.3, spiceVote: 0, richnessVote: -1 })).text, "3 people said it's light.")
})

test('banner: no reason given, so it reports the verdict', () => {
  assert.equal(fell(three({ spiceVote: 0 })).text, "3 people with taste like yours didn't like it.")
  assert.equal(rose(three({ closeness: 0.3, spiceVote: 0, sentiment: 'loved' })).text, '3 people loved it.')
})

test('banner: one person', () => {
  assert.equal(fell([voter('a', { closeness: 0.3 })]).text, "1 person said it's too spicy.")
  assert.equal(fell([voter('a')]).text, "1 person with taste like yours said it's too spicy.")
})

test('banner: people who loved the heat did not say it was too spicy', () => {
  assert.equal(fell(three({ closeness: 0.3, sentiment: 'loved' })).text, "3 people said it's really spicy.")
  assert.equal(rose(three({ closeness: 0.3, sentiment: 'loved' })).text, "3 people said it's really spicy, which usually suits you.")
  assert.equal(fell(three({ closeness: 0.3, sentiment: 'loved', spiceVote: 0, richnessVote: 1 })).text, "3 people said it's really hearty.")
})

test('banner: only a move of 3 points or more gets one', () => {
  assert.equal(reviewChange(inputOf(three()), 80, 78, viewer, NOW), null)
  assert.equal(reviewChange(inputOf(three()), 78, 80, viewer, NOW), null)
  const change = reviewChange(inputOf(three()), 80, 77, viewer, NOW)
  assert.equal(change.was, 80)
  assert.equal(change.now, 77)
})

test('banner: "like yours" needs you to have 3 reviews', () => {
  assert.equal(fell(three(), { ...viewer, reviewCount: 2 }).text, "3 people said it's too spicy.")
})

test('banner: "like yours" needs most of the voters to be close', () => {
  const half = [voter('a'), voter('b', { closeness: 0.3 })]
  assert.equal(fell(half).text, "2 people said it's too spicy.")
  const most = [voter('a'), voter('b'), voter('c', { closeness: 0.3 })]
  assert.equal(fell(most).text, "3 people with taste like yours said it's too spicy.")
})

test('banner: closeness we could not work out does not count as close', () => {
  assert.equal(fell(three({ known: false })).text, "3 people said it's too spicy.")
  assert.equal(fell(three({ closeness: 0.7 })).text, "3 people with taste like yours said it's too spicy.")
  assert.equal(fell(three({ closeness: 0.69 })).text, "3 people said it's too spicy.")
})

test('banner: the label says how recent the newest review is', () => {
  assert.equal(fell(three({ at: ago(7) })).label, 'Recent reviews · this week')
  assert.equal(fell(three({ at: ago(8) })).label, 'Recent reviews · this month')
  assert.equal(fell([voter('a', { at: ago(20) }), voter('b', { at: ago(2) })]).label, 'Recent reviews · this week')
})

test('banner: the stronger reason wins, and only its voters are counted', () => {
  const reviews = [
    voter('a', { closeness: 0.3, spiceVote: 1 }),
    voter('b', { closeness: 0.3, spiceVote: 1 }),
    voter('c', { closeness: 0.3, spiceVote: 0, richnessVote: 1 }),
  ]
  assert.equal(fell(reviews).text, "2 people said it's too spicy.")
  assert.deepEqual(fell(reviews).reviewerIds.sort(), ['a', 'b'])
})

test('banner: reviewers shown are the voters, most weight first, at most three', () => {
  const reviews = [
    voter('light', { weight: 0.1 }),
    voter('heavy', { weight: 0.9 }),
    voter('middle', { weight: 0.5 }),
    voter('least', { weight: 0.05 }),
  ]
  assert.deepEqual(fell(reviews).reviewerIds, ['heavy', 'middle', 'light'])
})

test('banner: reviews with empty text give the verdict wording, cleanly', () => {
  const rows = [row('a', { text: '', signals: [] }), row('b', { text: '', signals: [] }), row('c', { text: '', signals: [] })]
  const change = reviewChange(communityFor(viewer, rows, threePeople, NOW).get('v'), 80, 72, viewer, NOW)
  assert.equal(change.text, "3 people with taste like yours didn't like it.")
})

// The profile's plain lines. Dimensions as profileService gives them.
const dims = ({ spice = 0.5, richness = 0.5, price = 0.5, adventurousness = 0.5 } = {}) => [
  { key: 'cuisine', label: 'Cuisine breadth', value: 0.5 },
  { key: 'price', label: 'Price comfort', value: price },
  { key: 'spice', label: 'Spice', value: spice },
  { key: 'richness', label: 'Richness', value: richness },
  { key: 'adventurousness', label: 'Adventurousness', value: adventurousness },
]

test('agreement: both low', () => {
  assert.deepEqual(agreementLines(dims({ spice: 0.1 }), dims({ spice: 0.2 })), ['You both keep the spice low'])
  assert.deepEqual(agreementLines(dims({ richness: 0.1 }), dims({ richness: 0.2 })), ['You both keep it light'])
  assert.deepEqual(agreementLines(dims({ price: 0.1 }), dims({ price: 0.2 })), ['You both keep it cheap'])
  assert.deepEqual(agreementLines(dims({ adventurousness: 0.1 }), dims({ adventurousness: 0.2 })), ['You both stick to what you know'])
})

test('agreement: both high', () => {
  assert.deepEqual(agreementLines(dims({ spice: 0.9 }), dims({ spice: 0.8 })), ['You both like it hot'])
  assert.deepEqual(agreementLines(dims({ richness: 0.9 }), dims({ richness: 0.8 })), ['You both like it rich'])
  assert.deepEqual(agreementLines(dims({ price: 0.9 }), dims({ price: 0.8 })), ["You both don't mind paying more"])
  assert.deepEqual(agreementLines(dims({ adventurousness: 0.9 }), dims({ adventurousness: 0.8 })), ['You both love trying new things'])
})

test('agreement: far apart, in the direction of the other person', () => {
  assert.deepEqual(agreementLines(dims({ spice: 0.2 }), dims({ spice: 0.6 })), ['They like it much hotter than you'])
  assert.deepEqual(agreementLines(dims({ spice: 0.6 }), dims({ spice: 0.2 })), ['They like it much milder than you'])
  assert.deepEqual(agreementLines(dims({ richness: 0.2 }), dims({ richness: 0.6 })), ['They like it much richer than you'])
  assert.deepEqual(agreementLines(dims({ richness: 0.6 }), dims({ richness: 0.2 })), ['They like it much lighter than you'])
  assert.deepEqual(agreementLines(dims({ price: 0.2 }), dims({ price: 0.6 })), ['They spend much more freely than you'])
  assert.deepEqual(agreementLines(dims({ price: 0.6 }), dims({ price: 0.2 })), ["They're much more careful with money than you"])
  assert.deepEqual(agreementLines(dims({ adventurousness: 0.2 }), dims({ adventurousness: 0.6 })), ["They're much more adventurous than you"])
  assert.deepEqual(agreementLines(dims({ adventurousness: 0.6 }), dims({ adventurousness: 0.2 })), ["They're much less adventurous than you"])
})

test('agreement: both low but too far apart says nothing', () => {
  assert.deepEqual(agreementLines(dims({ spice: 0.05 }), dims({ spice: 0.3 })), [])
})

test('agreement: two middling tastes have nothing to say', () => {
  assert.deepEqual(agreementLines(dims(), dims()), [])
})

test('agreement: at most three lines, spice first', () => {
  const you = dims({ spice: 0.1, richness: 0.1, price: 0.1, adventurousness: 0.1 })
  assert.deepEqual(agreementLines(you, you), ['You both keep the spice low', 'You both keep it light', 'You both keep it cheap'])
})

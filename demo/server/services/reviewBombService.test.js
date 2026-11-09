import test from 'node:test'
import assert from 'node:assert/strict'
import { starterProfile } from '../learn.js'
import { REVIEW_BOMB } from '../reviewBomb.js'
import { memoryLearnerStore } from './learnerStore.js'
import { createReviewBombService } from './reviewBombService.js'

const ADMIN = { id: 'admin', me: { displayName: 'Justin', effectiveRole: 'ADMIN', ownedVenues: [] } }
const DINER = { id: 'diner', me: { displayName: 'Sam', effectiveRole: 'USER', ownedVenues: [] } }
const NAMES = { weiling_mild: 'Wei Ling', hafiz_nospice: 'Hafiz', nadia_mild: 'Nadia' }
const MENUS = {
  'turks-kebab': [{ id: 'baklava', name: 'Baklava', spice: null }, { id: 'chicken-doner-wrap', name: 'Chicken doner wrap', spice: 0.3 }],
  'moona-thai': [{ id: 'pad-krapow', name: 'Pad krapow', spice: null }, { id: 'tom-yum', name: 'Tom yum goong', spice: 0.8 }],
  'no-menu': [],
}
const registry = {
  venueById: new Map([
    ['turks-kebab', { id: 'turks-kebab', name: "Turk's Kebab" }],
    ['moona-thai', { id: 'moona-thai', name: 'Moona Thai' }],
    ['no-menu', { id: 'no-menu', name: 'No Menu Cafe' }],
  ]),
}
const venueOfDish = (dishId) => Object.keys(MENUS).find((venueId) => MENUS[venueId].some((d) => d.id === dishId))

// Stands in for account-service: the three demo accounts sign in with `password`.
function fakeAccounts({ password, cannotSignIn = [] }) {
  const signIns = []
  return {
    signIns,
    signIn: async (username, given) => {
      signIns.push(username)
      return NAMES[username] && given === password && !cannotSignIn.includes(username) ? `token-${username}` : null
    },
    me: async (token) => {
      const username = token.replace('token-', '')
      return { id: `id-${username}`, username, displayName: NAMES[username], effectiveRole: 'USER', ownedVenues: [] }
    },
  }
}

// Stands in for the review service: menus from MENUS, writes what it's sent into the
// learner store (so the bomb can see what's standing), and undoes only someone's latest review.
function fakeReviews(learners) {
  const posted = []
  let clock = Date.parse('2026-11-08T12:00:00Z')
  return {
    posted,
    venueDishes: async (_user, venueId) => ({ dishes: MENUS[venueId] ?? [] }),
    rankings: async (user) => (await learners.read(user.id, user.me.displayName)).rankings.map((dishId) => ({ dishId })),
    submitBeli: (user, body) => {
      posted.push({ who: user.me.displayName, ...body })
      const venueId = venueOfDish(body.dishId)
      const dishName = MENUS[venueId].find((d) => d.id === body.dishId).name
      return learners.update(user.id, user.me.displayName, async (state) => {
        state.reviews.push({ dishId: body.dishId, dishName, venueId, sentiment: body.sentiment, text: body.text, at: new Date(clock++).toISOString() })
        return { result: null }
      })
    },
    undoLatest: (user, { dishId, at }) =>
      learners.update(user.id, user.me.displayName, async (state) => {
        const latest = state.reviews.at(-1)
        if (!latest || latest.undone || latest.dishId !== dishId || latest.at !== at) {
          throw Object.assign(new Error("That's no longer your latest review"), { status: 409 })
        }
        latest.undone = true
        return { result: null, undone: true }
      }),
  }
}

function bombService({ password = 'demo-pw', cannotSignIn, now } = {}) {
  const learners = memoryLearnerStore({ starter: starterProfile })
  const accounts = fakeAccounts({ password: 'demo-pw', cannotSignIn })
  const reviews = fakeReviews(learners)
  const bomb = createReviewBombService({ accounts, reviews, learners, registry, password, now })
  return { bomb, accounts, reviews, learners }
}

const standingAt = async (learners, venueId) => {
  let count = 0
  for (const username of Object.keys(NAMES)) {
    const latest = (await learners.read(`id-${username}`, NAMES[username])).reviews.findLast((r) => r.venueId === venueId)
    if (latest && !latest.undone) count++
  }
  return count
}

test('the review bomb is for admins only', async () => {
  const { bomb } = bombService()
  for (const call of [(u) => bomb.status(u), (u) => bomb.drop(u), (u) => bomb.undo(u)]) {
    await assert.rejects(call(DINER), { status: 403 })
  }
})

test('without the persona password, it says how to set it up', async () => {
  const { bomb } = bombService({ password: null })
  const status = await bomb.status(ADMIN)
  assert.equal(status.ready, false)
  assert.match(status.why, /SEED_PERSONA_PASSWORD/)
  await assert.rejects(bomb.drop(ADMIN), { status: 503 })
})

test('a demo account that cannot sign in means it is not ready, and says which', async () => {
  const { bomb } = bombService({ cannotSignIn: ['nadia_mild'] })
  const status = await bomb.status(ADMIN)
  assert.equal(status.ready, false)
  assert.match(status.why, /@nadia_mild/)
  assert.match(status.why, /seed:personas/)
})

test('before the bomb, it is ready with nothing posted and nowhere bombed', async () => {
  const { bomb } = bombService()
  assert.deepEqual(await bomb.status(ADMIN), { ready: true, posted: 0, of: 3, venueId: null, venueName: null, dishName: null })
})

test('dropping it with no place named pans the chicken doner wrap at Turk\'s, at the bottom of each list', async () => {
  const { bomb, reviews, learners } = bombService()
  await learners.update('id-hafiz_nospice', 'Hafiz', async (state) => {
    state.rankings.push('mee-rebus', 'begedil')
    return { result: null }
  })
  const status = await bomb.drop(ADMIN)
  assert.deepEqual(status, { ready: true, posted: 3, of: 3, venueId: 'turks-kebab', venueName: "Turk's Kebab", dishName: 'Chicken doner wrap' })
  const byName = Object.fromEntries(reviews.posted.map((r) => [r.who, r]))
  assert.deepEqual(Object.keys(byName).sort(), ['Hafiz', 'Nadia', 'Wei Ling'])
  for (const { username, text } of REVIEW_BOMB.bombers) {
    const review = byName[NAMES[username]]
    assert.equal(review.dishId, 'chicken-doner-wrap')
    assert.equal(review.sentiment, 'disliked')
    assert.equal(review.text, text)
  }
  assert.equal(byName.Hafiz.insertIndex, 2)
  assert.equal(byName.Nadia.insertIndex, 0)
})

test('dropping it on another place pans a dish from its menu, one with known spice first', async () => {
  const { bomb, reviews } = bombService()
  const status = await bomb.drop(ADMIN, { venueId: 'moona-thai' })
  assert.deepEqual(new Set(reviews.posted.map((r) => r.dishId)), new Set(['tom-yum']))
  assert.equal(status.venueName, 'Moona Thai')
  assert.equal(status.dishName, 'Tom yum goong')
})

test('a place with no dishes cannot be bombed, and an unknown place is not found', async () => {
  const { bomb, reviews } = bombService()
  await assert.rejects(bomb.drop(ADMIN, { venueId: 'no-menu' }), { status: 400 })
  await assert.rejects(bomb.drop(ADMIN, { venueId: 'nowhere' }), { status: 404 })
  assert.equal(reviews.posted.length, 0)
})

test('dropping it again on the same place posts nothing more', async () => {
  const { bomb, reviews } = bombService()
  await bomb.drop(ADMIN, { venueId: 'moona-thai' })
  await bomb.drop(ADMIN, { venueId: 'moona-thai' })
  assert.equal(reviews.posted.length, 3)
})

test('dropping it on a second place moves it: the first place\'s reviews are taken back', async () => {
  const { bomb, learners } = bombService()
  await bomb.drop(ADMIN)
  const status = await bomb.drop(ADMIN, { venueId: 'moona-thai' })
  assert.equal(status.venueId, 'moona-thai')
  assert.equal(status.posted, 3)
  assert.equal(await standingAt(learners, 'turks-kebab'), 0)
  assert.equal(await standingAt(learners, 'moona-thai'), 3)
})

test('two drops at once: one runs, the other is told to wait', async () => {
  const { bomb, reviews } = bombService()
  const results = await Promise.allSettled([bomb.drop(ADMIN), bomb.drop(ADMIN)])
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected'])
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409)
  assert.equal(reviews.posted.length, 3)
})

test('undo takes every bomb review back, and it can be dropped again', async () => {
  const { bomb, reviews } = bombService()
  await bomb.drop(ADMIN)
  const undone = await bomb.undo(ADMIN)
  assert.equal(undone.posted, 0)
  assert.equal(undone.venueId, null)
  assert.equal((await bomb.drop(ADMIN)).posted, 3)
  assert.equal(reviews.posted.length, 6)
})

// E.g. the command-line bomb run twice before it checked: undo can only take back the top one.
test('a bomb review left standing under an undone one still shows as on', async () => {
  const { bomb, learners } = bombService()
  const hafizBomb = REVIEW_BOMB.bombers.find((b) => b.username === 'hafiz_nospice').text
  await learners.update('id-hafiz_nospice', 'Hafiz', async (state) => {
    const base = { dishId: 'chicken-doner-wrap', dishName: 'Chicken doner wrap', venueId: 'turks-kebab', sentiment: 'disliked', text: hafizBomb }
    state.reviews.push({ ...base, at: '2026-11-08T10:00:00Z' }, { ...base, at: '2026-11-08T11:00:00Z', undone: true })
    return { result: null }
  })
  const status = await bomb.status(ADMIN)
  assert.equal(status.posted, 1)
  assert.equal(status.venueId, 'turks-kebab')
  await assert.rejects(bomb.undo(ADMIN), (err) => err.status === 409 && /Hafiz/.test(err.message))
})

test('undo with nothing posted is fine', async () => {
  const { bomb } = bombService()
  assert.equal((await bomb.undo(ADMIN)).posted, 0)
})

test('a bomber who has reviewed something since cannot be taken back, and the admin is told who', async () => {
  const { bomb, learners } = bombService()
  await bomb.drop(ADMIN)
  await learners.update('id-hafiz_nospice', 'Hafiz', async (state) => {
    state.reviews.push({ dishId: 'begedil', venueId: 'selegie-soto', sentiment: 'loved', text: 'gentle', at: '2026-11-08T13:00:00Z' })
    return { result: null }
  })
  await assert.rejects(bomb.undo(ADMIN), (err) => err.status === 409 && /Hafiz/.test(err.message))
  assert.equal((await bomb.status(ADMIN)).posted, 1)
})

// account-service allows 10 sign-ins per username per 5 minutes; a page showing the
// Demo controls asks for the status on every load.
test('the first demo account that cannot sign in stops the rest trying', async () => {
  const { bomb, accounts } = bombService({ cannotSignIn: ['weiling_mild'] })
  await bomb.status(ADMIN)
  assert.deepEqual(accounts.signIns, ['weiling_mild'])
})

test('an account that could not sign in is not tried again for a minute', async () => {
  let clock = 0
  const { bomb, accounts } = bombService({ cannotSignIn: ['weiling_mild'], now: () => clock })
  await bomb.status(ADMIN)
  clock = 59_000
  assert.equal((await bomb.status(ADMIN)).ready, false)
  assert.equal(accounts.signIns.length, 1)
  clock = 61_000
  await bomb.status(ADMIN)
  assert.equal(accounts.signIns.length, 2)
})

test('the demo accounts sign in once, not on every look', async () => {
  const { bomb, accounts } = bombService()
  await bomb.status(ADMIN)
  await bomb.status(ADMIN)
  assert.equal(accounts.signIns.length, 3)
})

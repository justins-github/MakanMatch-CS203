#!/usr/bin/env node
// The Week 13 review bomb, through the real APIs: other people's reviews change your match.
//
//   node scripts/seed-review-bomb.mjs --prepare   give the spice-shy accounts their history, and
//                                                 make Sam kakis with Hafiz and Mei. Safe to re-run.
//   node scripts/seed-review-bomb.mjs             the bomb: three accounts say it's SUPER SPICY.
//                                                 Safe to re-run; one place at a time, like the
//                                                 admin's in-app button.
//   node scripts/seed-review-bomb.mjs --undo      take the bomb back, wherever it was dropped
//   node scripts/seed-review-bomb.mjs --check     where the place stands for Sam right now
//
// Add --venue <id> to use another place. Needs all services running, after seed:personas and
// seed:menus. Then sign in as Sam (sam_mild) and run Find; sign in as Mei to see it go the other way.
import { readFileSync } from 'fs'
import { join } from 'path'
import { ROOT, requireEnv } from './lib/setup.mjs'
import { PERSONAS } from './lib/personas.mjs'
import { REVIEW_BOMB, bombDish, standingBomb } from '../demo/server/reviewBomb.js'

requireEnv('SEED_PERSONA_PASSWORD')
const ACCOUNT = process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:8082'
const ENGINE = process.env.ENGINE_URL ?? `http://localhost:${process.env.ENGINE_PORT ?? 3001}`

const PRESENTER = 'sam_mild'
const SAMS_KAKIS = ['hafiz_nospice', 'mei_chilli']
const DEFAULT_VENUE = REVIEW_BOMB.venueId
const TOO_HOT = 'way too spicy for me'
const GENTLE = 'gentle and easy, nice one'
const CHECK_WALK_MIN = 20

const args = process.argv.slice(2)
const venueId = args.includes('--venue') ? args[args.indexOf('--venue') + 1] : DEFAULT_VENUE
if (!venueId) {
  console.error('--venue needs a venue id')
  process.exit(1)
}

async function call(base, path, { token, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${data?.detail ?? data?.error ?? ''}`), { status: res.status })
  return data
}

async function signIn(username) {
  try {
    const session = await call(ACCOUNT, '/api/auth/login', {
      method: 'POST',
      body: { identifier: username, password: process.env.SEED_PERSONA_PASSWORD },
    })
    return session.accessToken
  } catch (err) {
    console.error(`Couldn't sign in as @${username}: ${err.message}`)
    console.error('Run `npm run seed:personas` and `npm run seed:menus` first, with all services running.')
    process.exit(1)
  }
}

const displayName = (username) => PERSONAS.find((p) => p.username === username)?.displayName ?? username
const log = (username, what) => console.log(`${displayName(username).padEnd(9)} ${what}`)

async function review(token, dishId, sentiment, text) {
  const count = (await call(ENGINE, '/api/rankings', { token })).length
  const insertIndex = sentiment === 'loved' ? 0 : count
  return call(ENGINE, '/api/reviews/beli', { token, method: 'POST', body: { dishId, sentiment, insertIndex, duels: [], text } })
}

async function postHistory({ username, history }) {
  const token = await signIn(username)
  const ranked = new Set((await call(ENGINE, '/api/rankings', { token })).map((r) => r.dishId))
  const todo = [
    ...history.dislikes.map((dishId) => [dishId, 'disliked', TOO_HOT]),
    ...history.loves.map((dishId) => [dishId, 'loved', GENTLE]),
  ].filter(([dishId]) => !ranked.has(dishId))
  for (const [dishId, sentiment, text] of todo) await review(token, dishId, sentiment, text)
  log(username, todo.length ? `posted ${todo.length} reviews` : 'already has their history')
}

async function makeKakis(username, other) {
  const token = await signIn(username)
  const { kakis, outgoing } = await call(ACCOUNT, '/api/kakis', { token })
  if (kakis.some((k) => k.username === other)) return log(username, `already kakis with @${other}`)
  if (!outgoing.some((k) => k.username === other)) {
    await call(ACCOUNT, '/api/kakis/requests', { token, method: 'POST', body: { username: other } })
  }
  const theirToken = await signIn(other)
  const { incoming } = await call(ACCOUNT, '/api/kakis', { token: theirToken })
  const request = incoming.find((k) => k.username === username)
  if (request) await call(ACCOUNT, `/api/kakis/requests/${request.id}/accept`, { token: theirToken, method: 'POST' })
  log(username, `now kakis with @${other}`)
}

async function prepare() {
  for (const persona of PERSONAS.filter((p) => p.history)) await postHistory(persona)
  for (const other of SAMS_KAKIS) await makeKakis(PRESENTER, other)
  console.log('\nReady. `npm run seed:review-bomb -- --check` shows where things stand for Sam.')
}

// Each bomber, signed in, with their standing bomb review if any (reviewBomb.js), read
// from their profile: it lists reviews that count, newest first.
async function bombers() {
  const all = []
  for (const { username, text } of REVIEW_BOMB.bombers) {
    const token = await signIn(username)
    const me = await call(ACCOUNT, '/api/me', { token })
    const { reviews } = await call(ENGINE, `/api/reviewers/${me.id}`, { token })
    all.push({ username, text, token, standing: standingBomb(reviews, text) })
  }
  return all
}

// The dish the in-app button would pan there too (reviewBomb.js bombDish).
async function dishFor(token) {
  const { dishes } = await call(ENGINE, `/api/dishes?venueId=${encodeURIComponent(venueId)}`, { token })
  const dish = bombDish(dishes, venueId)
  if (!dish) throw new Error(`${venueId} has no dishes to review. Try another --venue.`)
  return dish.id
}

// One place at a time, like the in-app button: a bomber whose bomb already stands here is
// skipped (a second one could never be undone), and one standing elsewhere comes back first.
async function bomb() {
  const all = await bombers()
  const elsewhere = all.find((b) => b.standing && b.standing.venueId !== venueId)
  if (elsewhere) {
    const where = elsewhere.standing.venueName || elsewhere.standing.venueId
    throw new Error(`A review bomb is standing at ${where}. Take it back first: npm run seed:review-bomb -- --undo`)
  }
  for (const { username } of all.filter((b) => b.standing)) log(username, 'already standing here')
  const toPost = all.filter((b) => !b.standing)
  if (toPost.length === 0) return console.log('\nThe bomb is already on.')
  const dishId = await dishFor(toPost[0].token)
  for (const [i, { username, text, token }] of toPost.entries()) {
    await review(token, dishId, 'disliked', text)
    log(username, `"${text}"`)
    if (i < toPost.length - 1) await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  console.log('\nDone. Run Find again as Sam.')
}

// Takes back each bomber's standing bomb review, wherever it was dropped (app or here).
async function undo() {
  for (const { username, token, standing } of await bombers()) {
    if (!standing) {
      log(username, 'nothing to undo')
      continue
    }
    try {
      await call(ENGINE, '/api/reviews/undo', { token, method: 'POST', body: { dishId: standing.dishId, at: standing.at } })
      log(username, `took it back (${standing.venueName || standing.venueId})`)
    } catch (err) {
      if (err.status !== 409) throw err
      log(username, "can't take it back: they've reviewed something since")
    }
  }
}

async function check() {
  const token = await signIn(PRESENTER)
  const seeds = JSON.parse(readFileSync(join(ROOT, 'demo', 'server', 'data', 'venues.json'), 'utf8'))
  const seed = seeds.find((v) => v.id === venueId)
  const headers = seed ? { 'x-location': `${seed.latitude},${seed.longitude}` } : {}
  if (!seed) console.log(`${venueId} isn't a seed venue, so this is from the default pin.`)
  const { venues, droppedByReviews = [] } = await call(ENGINE, `/api/recommendations?mode=find&walk=${CHECK_WALK_MIN}`, { token, headers })
  const rank = venues.findIndex((v) => v.id === venueId)
  const dropped = droppedByReviews.find((v) => v.id === venueId)
  const card = rank >= 0 ? venues[rank] : dropped
  if (rank >= 0) console.log(`${card.name} for Sam: ${card.matchScore}%, #${rank + 1} in the top ${venues.length}.`)
  else if (dropped) console.log(`${card.name} for Sam: ${card.matchScore}%, out of the top ${venues.length}, under "Dropped out because of recent reviews".`)
  else console.log(`${venueId} isn't on Sam's list at all. The demo needs another --venue or more history.`)
  if (card?.reviewChange) console.log(`Banner: ${card.reviewChange.text} (was ${card.reviewChange.was}%, now ${card.reviewChange.now}%)`)
  const { reviews } = await call(ENGINE, `/api/venues/${encodeURIComponent(venueId)}/reviews`, { token })
  console.log(`Reviews counting there now: ${reviews.filter((r) => r.counts).length}`)
}

try {
  if (args.includes('--prepare')) await prepare()
  else if (args.includes('--undo')) await undo()
  else if (args.includes('--check')) await check()
  else await bomb()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

#!/usr/bin/env node
// Simulates a week of community activity for the demo, through the real APIs:
// every persona signs in and acts with their own token, so auth, roles and
// ownership rules apply exactly as they would for live users.
//
//   1. Ahmet (owner) reports Turk's Kebab moved to Parklane and sets the
//      official price of the chicken doner wrap.
//   2. Thura (owner) reports Yangon Flavours temporarily closed.
//   3. The four diners review dishes according to their tastes, and two of
//      them report paying more for the doner wrap than the menu says.
//
// Afterwards: diners' Taste DNA and feeds differ, Yangon Flavours drops out of
// feeds, Turk's Kebab shows its new address, and Ahmet sees a price conflict.
//
//   node scripts/seed-community.mjs            one round (needs all services running)
//   node scripts/seed-community.mjs --fresh    reset the diners' taste first
import { readFileSync } from 'fs'
import { join } from 'path'
import { ROOT, requireEnv } from './lib/setup.mjs'
import { PERSONAS } from './lib/personas.mjs'

requireEnv('SEED_PERSONA_PASSWORD')
const ACCOUNT = process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:8082'
const CATALOG = process.env.CATALOG_SERVICE_URL ?? 'http://localhost:8083'
const ENGINE = process.env.ENGINE_URL ?? `http://localhost:${process.env.ENGINE_PORT ?? 3001}`
const fresh = process.argv.includes('--fresh')
const dishes = JSON.parse(readFileSync(join(ROOT, 'demo', 'server', 'data', 'dishes.json'), 'utf8'))
const REVIEWS_PER_DINER = 5

async function call(base, path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${data?.detail ?? data?.error ?? ''}`)
  return data
}

async function signIn(persona) {
  try {
    const session = await call(ACCOUNT, '/api/auth/login', {
      method: 'POST',
      body: { identifier: persona.username, password: process.env.SEED_PERSONA_PASSWORD },
    })
    return session.accessToken
  } catch (err) {
    console.error(`Couldn't sign in as @${persona.username}: ${err.message}`)
    console.error('Run `npm run seed:personas` first, and check all services are running (`npm run dev`).')
    process.exit(1)
  }
}

const byName = Object.fromEntries(PERSONAS.map((p) => [p.username, p]))
const log = (who, what) => console.log(`${who.padEnd(7)} ${what}`)

// 1-2. Owners report what changed at their venues.
const ahmet = await signIn(byName.ahmet_kebab)
await call(CATALOG, '/api/catalog/venues/turks-kebab/updates', {
  token: ahmet,
  method: 'POST',
  body: { status: 'MOVED', newAddress: '35 Selegie Rd, #01-C2 Parklane Shopping Mall, S188307', note: 'Moved from Peace Centre (demolished 2024)' },
})
log('Ahmet', "reported Turk's Kebab moved to Parklane Shopping Mall")
await call(CATALOG, '/api/catalog/dishes/chicken-doner-wrap/prices', { token: ahmet, method: 'POST', body: { price: 8.5 } })
log('Ahmet', 'set the official doner wrap price: $8.50')

const thura = await signIn(byName.thura_yangon)
await call(CATALOG, '/api/catalog/venues/yangon-flavours/updates', {
  token: thura,
  method: 'POST',
  body: { status: 'TEMPORARILY_CLOSED', note: 'Renovating - back on 1 Oct' },
})
log('Thura', 'reported Yangon Flavours closed for renovation')

// 3. Diners review what they ate, each through their own taste.
const diners = PERSONAS.filter((p) => p.taste)
const shuffled = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

for (const persona of diners) {
  const token = await signIn(persona)
  if (fresh) await call(ENGINE, '/api/reset', { token, method: 'POST' })
  const ranked = new Set((await call(ENGINE, '/api/rankings', { token })).map((r) => r.dishId))
  // Owners' own venues are off limits to them; diners can review anything.
  const picks = shuffled(dishes.filter((d) => !ranked.has(d.id) && d.venueId !== 'yangon-flavours')).slice(0, REVIEWS_PER_DINER)
  for (const dish of picks) {
    const liking = persona.taste(dish)
    const sentiment = liking > 0.25 ? 'loved' : liking < -0.25 ? 'disliked' : 'fine'
    const count = (await call(ENGINE, '/api/rankings', { token })).length
    const insertIndex = sentiment === 'loved' ? 0 : sentiment === 'disliked' ? count : Math.floor(count / 2)
    const result = await call(ENGINE, '/api/reviews/beli', {
      token,
      method: 'POST',
      body: { dishId: dish.id, sentiment, insertIndex, duels: [], text: persona.says[sentiment] },
    })
    log(persona.displayName, `${sentiment.padEnd(8)} ${dish.name} -> ${result.score10}/10 (AI predicted ${result.prediction.predictedScore10})`)
  }
  if (persona.username === 'mei_chilli' || persona.username === 'jun_budget') {
    await call(CATALOG, '/api/catalog/dishes/chicken-doner-wrap/prices', { token, method: 'POST', body: { price: 10.5 } })
    log(persona.displayName, 'paid $10.50 for the doner wrap (menu says $8.50)')
  }
}

console.log('\nDone. Sign in as a diner to compare feeds, as Ahmet to see the price conflict, or as an admin for Siti\'s claim.')

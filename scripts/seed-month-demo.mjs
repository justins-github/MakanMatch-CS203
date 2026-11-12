#!/usr/bin/env node
// Sets up the Month switch's "a place you loved has closed" moment (Demo controls):
// JOE & THE JUICE at 252 North Bridge Rd is listed in August and marked permanently
// closed in October. Overture venues start with an empty menu, so this adds one dish
// there (as a demo account, the way any diner can) for the presenter to review.
// The review itself is yours to leave, signed in as yourself: a script can't post as you.
//
//   node scripts/seed-month-demo.mjs   (after seed:personas and load:venues; services running)
//
// Safe to re-run: a dish that's already there is left alone.
import { requireEnv } from './lib/setup.mjs'

requireEnv('SEED_PERSONA_PASSWORD')
const ACCOUNT = process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:8082'
const CATALOG = process.env.CATALOG_SERVICE_URL ?? 'http://localhost:8083'
const VENUE = 'ov-6a467ef7-13c3-4154-a432-385acfac27e1'
const DISH = 'Tunacado sandwich'
const ADDER = 'priya_explores'

async function call(base, path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
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
    console.error('Run `npm run seed:personas` first, with all services running.')
    process.exit(1)
  }
}

try {
  const token = await signIn(ADDER)
  const path = `/api/catalog/venues/${VENUE}/dishes`
  const menu = await call(CATALOG, path)
  if (menu.some((d) => d.name.toLowerCase() === DISH.toLowerCase())) {
    console.log(`${DISH} is already on the menu; nothing to add.`)
  } else {
    await call(CATALOG, path, { token, method: 'POST', body: { name: DISH, price: null } })
    console.log(`Added ${DISH}.`)
  }
} catch (err) {
  if (err.status === 404) console.error("JOE & THE JUICE isn't in the catalog. Run npm run load:venues first.")
  else console.error(err.message)
  process.exit(1)
}

console.log('Dish ready at JOE & THE JUICE (252 North Bridge Rd).')
console.log('Now, signed in as yourself with August loaded: Rate -> search "joe & the juice" -> Tunacado sandwich -> Loved.')

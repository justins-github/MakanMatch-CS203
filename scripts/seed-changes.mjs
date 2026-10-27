#!/usr/bin/env node
// Seeds "what changed since your last visit" (CSD-50) for the demo, through the
// real APIs, in the right order:
//
//   1. Mei (diner) reviews Turk's Kebab's chicken doner wrap: that's her visit.
//   2. Afterwards Ahmet (owner) raises the wrap by $3.50, adds a lamb shish at $13,
//      takes the beef iskender off the menu, and posts a note.
//
// Then Mei's For you card for Turk's Kebab lists all of it under "Since your last
// visit", with what the dearer menu did to her match. Meant for a freshly seeded
// database: a re-run makes another visit (another "loved" review in Mei's Taste DNA)
// and only bumps the price $3.50 and re-posts the note, since the lamb shish is
// already on and the iskender already off.
//
//   node scripts/seed-changes.mjs   (after seed:personas and seed:menus; services running)
import { requireEnv } from './lib/setup.mjs'

requireEnv('SEED_PERSONA_PASSWORD')
const ACCOUNT = process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:8082'
const CATALOG = process.env.CATALOG_SERVICE_URL ?? 'http://localhost:8083'
const ENGINE = process.env.ENGINE_URL ?? `http://localhost:${process.env.ENGINE_PORT ?? 3001}`
const VENUE = 'turks-kebab'

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

// 1. Mei's visit.
const mei = await signIn('mei_chilli')
const visit = await call(ENGINE, '/api/reviews/beli', {
  token: mei,
  method: 'POST',
  body: { dishId: 'chicken-doner-wrap', sentiment: 'loved', insertIndex: 0, duels: [], text: '' },
})
console.log("Mei     reviewed Turk's Kebab's chicken doner wrap (her last visit)")
await new Promise((resolve) => setTimeout(resolve, 1500)) // so every change below is clearly after it

// 2. What Ahmet changes afterwards.
const ahmet = await signIn('ahmet_kebab')
const menu = await call(CATALOG, `/api/catalog/venues/${VENUE}/dishes`)
const wrap = menu.find((d) => d.id === 'chicken-doner-wrap')
const newPrice = Number(wrap?.price ?? 8.5) + 3.5 // big enough to move the match (CSD-51)
const hasShish = menu.some((d) => d.name.toLowerCase() === 'lamb shish')
const hasIskender = menu.some((d) => d.id === 'beef-iskender')
await call(CATALOG, `/api/catalog/venues/${VENUE}/dishes`, {
  token: ahmet,
  method: 'PATCH',
  body: {
    prices: [{ dishId: 'chicken-doner-wrap', price: newPrice }],
    added: hasShish ? [] : [{ name: 'Lamb shish', price: 13 }],
    removed: hasIskender ? ['beef-iskender'] : [],
  },
})
console.log(`Ahmet   wrap now $${newPrice.toFixed(2)}${hasShish ? '' : ', added lamb shish $13.00'}${hasIskender ? ', removed beef iskender' : ''}`)
await call(CATALOG, `/api/catalog/venues/${VENUE}/updates`, {
  token: ahmet,
  method: 'POST',
  body: { status: 'OPEN', note: 'Lamb shish is on the menu now' },
})
console.log('Ahmet   posted a note')

const changes = await call(CATALOG, `/api/catalog/venues/${VENUE}/changes?since=${encodeURIComponent(visit.review.at)}`)
console.log(`\nDone: since Mei's visit, ${changes.prices.length} price change(s), ${changes.added.length} new, ${changes.removed.length} gone, ${changes.updates.length} owner report(s).`)
console.log("Sign in as Mei (mei_chilli) and open For you: Turk's Kebab's card shows them under \"Since your last visit\".")

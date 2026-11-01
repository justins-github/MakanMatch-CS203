#!/usr/bin/env node
// Seeds the curated demo dishes and their prices into the catalog, keeping the
// dish ids the engine's taste features are keyed on. Safe to re-run: existing
// dishes are left alone (owners may have edited them).
//
//   node scripts/seed-menus.mjs         (after `npm run load:venues`)
import { readFileSync } from 'fs'
import { join } from 'path'
import { ROOT, connect, requireTable } from './lib/setup.mjs'

const dishes = JSON.parse(readFileSync(join(ROOT, 'demo', 'server', 'data', 'dishes.json'), 'utf8'))
const db = await connect()
await requireTable(db, 'catalog.dishes', 'catalog-service')

let added = 0
let skipped = 0
try {
  for (const dish of dishes) {
    const venue = await db.query('select 1 from catalog.venues where id = $1', [dish.venueId])
    if (venue.rowCount === 0) {
      console.warn(`skip ${dish.id}: venue ${dish.venueId} isn't loaded (run npm run load:venues)`)
      skipped++
      continue
    }
    const inserted = await db.query(
      `insert into catalog.dishes (id, venue_id, name, source) values ($1, $2, $3, 'SEED')
       on conflict (id) do nothing returning id`,
      [dish.id, dish.venueId, dish.name],
    )
    if (inserted.rowCount === 0) {
      skipped++
      continue
    }
    await db.query(
      `insert into catalog.dish_prices (dish_id, price, source) values ($1, $2, 'SEED')`,
      [dish.id, dish.price],
    )
    added++
  }
  console.log(`${added} dishes added, ${skipped} already there or skipped`)
} finally {
  await db.end()
}

#!/usr/bin/env node
// Loads the venue registry into catalog.venues: the Overture snapshot merged
// with our curated seeds, i.e. exactly the records (and ids) the engine uses,
// plus the places later months add (the demo's Month switch), so they can have
// menus and reviews too. Places that left in a later month are kept. Re-run after
// `node scripts/extract-overture.mjs` or `node scripts/build-month.mjs`. Owner
// reports live in their own table, so a refresh never overwrites them.
//
//   node scripts/load-venues.mjs        (needs catalog-service to have started once)
import { join } from 'path'
import { createMonths, loadMonthFiles } from '../demo/server/months.js'
import { loadRegistryInputs } from '../demo/server/registry.js'
import { ROOT, connect, requireTable } from './lib/setup.mjs'

const BATCH = 1000

const inputs = loadRegistryInputs()
const deltas = loadMonthFiles(join(ROOT, 'demo', 'server', 'data'))
const months = createMonths({ ...inputs, deltas })

// Every base venue, then each later month's new places (once each).
const venues = [...months.base.venues]
const loaded = new Set(venues.map((v) => v.id))
for (const { month } of months.list.filter((m) => !m.base)) {
  for (const venue of months.changesFor(month).added) {
    if (!loaded.has(venue.id)) {
      loaded.add(venue.id)
      venues.push(venue)
    }
  }
}
console.log(`${months.base.venues.length} venues in ${months.list[0].label}, ${venues.length - months.base.venues.length} added since`)

// Registry venues don't keep Overture's update time; read it from the source rows.
const updatedAt = new Map(
  [...inputs.overtureRows, ...deltas.flatMap((d) => d.added)].map((r) => [r.gersId, r.updatedAt ?? null]),
)

const db = await connect()
await requireTable(db, 'catalog.venues', 'catalog-service')

const column = (rows, pick) => rows.map(pick)
let done = 0
try {
  for (let i = 0; i < venues.length; i += BATCH) {
    const rows = venues.slice(i, i + BATCH)
    await db.query(
      `insert into catalog.venues (id, name, address, postcode, lat, lon, cuisine, category, source, confidence, source_updated_at)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::float8[],
                            $7::text[], $8::text[], $9::text[], $10::float8[], $11::timestamptz[])
       on conflict (id) do update set
         name = excluded.name, address = excluded.address, postcode = excluded.postcode,
         lat = excluded.lat, lon = excluded.lon, cuisine = excluded.cuisine, category = excluded.category,
         source = excluded.source, confidence = excluded.confidence,
         source_updated_at = excluded.source_updated_at, loaded_at = now()`,
      [
        column(rows, (v) => v.id),
        column(rows, (v) => v.name),
        column(rows, (v) => v.address ?? null),
        column(rows, (v) => v.postcode ?? null),
        column(rows, (v) => v.lat ?? v.latitude ?? null),
        column(rows, (v) => v.lon ?? v.longitude ?? null),
        column(rows, (v) => v.cuisine ?? null),
        column(rows, (v) => v.category ?? null),
        column(rows, (v) => v.source),
        column(rows, (v) => v.overtureConfidence ?? null),
        column(rows, (v) => (v.gersId ? updatedAt.get(v.gersId) ?? null : null)),
      ],
    )
    done += rows.length
    process.stdout.write(`\rloaded ${done}/${venues.length} venues`)
  }
  console.log('\ndone')
} finally {
  await db.end()
}

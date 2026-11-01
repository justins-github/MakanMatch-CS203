#!/usr/bin/env node
// Loads the venue registry into catalog.venues: the Overture snapshot merged
// with our curated seeds, i.e. exactly the records (and ids) the engine uses.
// Re-run monthly after `node scripts/extract-overture.mjs`. Owner reports live
// in their own table, so a refresh never overwrites them.
//
//   node scripts/load-venues.mjs        (needs catalog-service to have started once)
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { loadRegistry } from '../demo/server/registry.js'
import { ROOT, connect, requireTable } from './lib/setup.mjs'

const BATCH = 1000

// Registry venues don't keep Overture's update time; read it from the snapshot.
const snapshot = join(ROOT, 'demo', 'server', 'data', 'sg_food_places.json')
const updatedAt = new Map(
  existsSync(snapshot) ? JSON.parse(readFileSync(snapshot, 'utf8')).map((r) => [r.gersId, r.updatedAt ?? null]) : [],
)

const { venues } = loadRegistry()
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

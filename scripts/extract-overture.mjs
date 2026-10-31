// Extracts Singapore food-and-drink places from the latest Overture Maps release
// into demo/server/data/sg_food_places.json. Run from the repo root after each
// monthly release: node scripts/extract-overture.mjs

import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { DuckDBInstance } from '@duckdb/node-api'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'server', 'data', 'sg_food_places.json')

// Singapore bounding box; non-SG-country rows are dropped in SQL below.
const BBOX = { xmin: 103.6, xmax: 104.1, ymin: 1.13, ymax: 1.5 }
const MIN_CONFIDENCE = 0.5
const DEDUP_METERS = 100

const instance = await DuckDBInstance.create(':memory:')
const con = await instance.connect()
await con.run('INSTALL httpfs; LOAD httpfs;')
await con.run("SET s3_region='us-west-2';")

const releases = await (
  await con.run(
    "SELECT DISTINCT regexp_extract(file, 'release/([^/]+)/', 1) AS rel " +
      "FROM glob('s3://overturemaps-us-west-2/release/*/theme=places/type=place/*') " +
      'ORDER BY rel DESC LIMIT 1',
  )
).getRows()
const release = releases[0][0]
const path = `s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*`
console.log(`Overture release ${release} - extracting SG food & drink…`)

const result = await con.run(`
  SELECT to_json(struct_pack(
    gersId := id,
    name := names.primary,
    lat := bbox.ymin,
    lon := bbox.xmin,
    categoryPrimary := categories.primary,
    categoryPath := taxonomy.hierarchy,
    categoriesAlternate := categories.alternate,
    address := addresses[1].freeform,
    postcode := addresses[1].postcode,
    phone := phones[1],
    website := websites[1],
    social := socials[1],
    brand := brand.names."primary",
    confidence := round(confidence, 3),
    updatedAt := list_max(list_transform(sources, s -> s.update_time))
  )) AS j
  FROM read_parquet('${path}', hive_partitioning=1)
  WHERE bbox.xmin >= ${BBOX.xmin} AND bbox.xmax <= ${BBOX.xmax}
    AND bbox.ymin >= ${BBOX.ymin} AND bbox.ymax <= ${BBOX.ymax}
    AND confidence >= ${MIN_CONFIDENCE}
    AND (addresses[1].country IS NULL OR addresses[1].country = 'SG')
    AND (operating_status IS NULL OR operating_status = 'open')
    AND (
      list_contains(taxonomy.hierarchy, 'food_and_drink')
      OR categories.primary = 'food_and_drink'
    )
`)
const raw = (await result.getRows()).map((r) => JSON.parse(r[0]))
console.log(`${raw.length} rows fetched pre-dedup`)

// Dedup: same normalized name within DEDUP_METERS, keep the highest confidence.
const normName = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const metersBetween = (a, b) => {
  const dLat = (a.lat - b.lat) * 111_320
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

const byName = new Map()
for (const row of raw) {
  const key = normName(row.name)
  if (!key) continue
  if (!byName.has(key)) byName.set(key, [])
  byName.get(key).push(row)
}
const kept = []
let merged = 0
for (const group of byName.values()) {
  group.sort((a, b) => b.confidence - a.confidence)
  const survivors = []
  for (const row of group) {
    if (survivors.some((s) => metersBetween(s, row) <= DEDUP_METERS)) {
      merged++
      continue
    }
    survivors.push(row)
  }
  kept.push(...survivors)
}
kept.sort((a, b) => a.name.localeCompare(b.name))
console.log(`${merged} duplicate listings merged; ${kept.length} venues kept`)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(kept))
console.log(`wrote ${OUT} (${(JSON.stringify(kept).length / 1e6).toFixed(1)} MB)`)

// Spot checks: venues known to exist.
const names = new Set(kept.map((r) => normName(r.name)))
const checks = ['turk s kebab', 'bedok chwee kueh']
const missing = checks.filter((c) => !names.has(c))
if (missing.length) {
  console.error(`SPOT CHECK FAILED - missing: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('spot checks passed:', checks.join(', '))

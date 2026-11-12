// Extracts Singapore food-and-drink places from an Overture Maps release (the latest,
// unless one is named) into demo/server/data/sg_food_places.json. Run from the repo root:
//   node scripts/extract-overture.mjs [release]      e.g. 2026-10-21.0
// This file is the base the demo's Month switch compares against, so replacing it
// means rebuilding the month files after (scripts/build-month.mjs).

import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { dedupe, isListed, normName } from '../demo/server/overture.js'
import { pullRelease } from './lib/overture-pull.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'server', 'data', 'sg_food_places.json')

const { release, rows } = await pullRelease(process.argv[2])
console.log(`Overture release ${release} - extracting SG food & drink…`)

const listed = rows.filter(isListed)
console.log(`${listed.length} rows fetched pre-dedup`)

const kept = dedupe(listed)
  .map(({ isFood, status, ...row }) => row)
  .sort((a, b) => a.name.localeCompare(b.name))
console.log(`${listed.length - kept.length} duplicate or nameless listings dropped; ${kept.length} venues kept`)

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

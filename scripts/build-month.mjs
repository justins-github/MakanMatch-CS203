#!/usr/bin/env node
// Compares an Overture Maps release with the base snapshot and writes that month's
// differences (who left and why, who is new) for the demo's Month switch:
//   node scripts/build-month.mjs <release>           e.g. 2026-10-21.0
// -> demo/server/data/months/<YYYY-MM>.json. Then rebuild the embeddings and reload
// the catalog so the new places can be matched and reviewed:
//   node scripts/embed-venues.mjs && npm run upload:vectors && npm run load:venues
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { BASE_MONTH, diffMonths, monthLabel } from '../demo/server/months.js'
import { pullRelease } from './lib/overture-pull.mjs'
import { ROOT } from './lib/setup.mjs'

const wanted = process.argv[2]
if (!wanted) {
  console.error('usage: node scripts/build-month.mjs <release>   (e.g. 2026-10-21.0)')
  process.exit(1)
}

const dataDir = join(ROOT, 'demo', 'server', 'data')
const baseRows = JSON.parse(readFileSync(join(dataDir, 'sg_food_places.json'), 'utf8'))
console.log(`comparing Overture ${wanted} with ${BASE_MONTH.label} (${baseRows.length} venues)…`)

const { release, rows } = await pullRelease(wanted)
const { gone, added } = diffMonths(baseRows, rows)
const count = (reason) => gone.filter((g) => g.reason === reason).length
console.log(`closed ${count('closed')}, unlisted ${count('unlisted')}, dropped ${count('dropped')}, added ${added.length}`)
if (count('closed') + count('unlisted') === 0) {
  console.error('Nothing closed or unlisted: that is not a real month. Check the release name.')
  process.exit(1)
}

const month = release.slice(0, 7)
const out = join(dataDir, 'months', `${month}.json`)
mkdirSync(join(dataDir, 'months'), { recursive: true })
writeFileSync(out, JSON.stringify({ month, label: monthLabel(month), release, base: BASE_MONTH.month, gone, added }))
console.log(`wrote ${out}`)

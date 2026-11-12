// Builds prior taste vectors for every venue in demo/server/data/sg_food_places.json,
// and for the places later months add (data/months/, the demo's Month switch).
//
//   node scripts/embed-venues.mjs
//
// Text per venue = describeVenue() (name minus block number, categories, dish gloss),
// embedded locally with all-MiniLM-L6-v2 via transformers.js (one-time ~23 MB model
// download into node_modules/.cache), L2-normalised, int8-quantised and written to
//   demo/server/data/venue_vectors.bin   (rows in manifest order, dim bytes each)
//   demo/server/data/venue_vectors.json  ({ model, dim, count, builtAt, ids })
// Both are gitignored; ~80 s on a laptop CPU. Ends with spot-check assertions.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pipeline, env } from '@huggingface/transformers'
import { describeVenue } from '../demo/server/cuisines.js'
import { loadMonthFiles } from '../demo/server/months.js'
import { quantise, createStore } from '../demo/server/vectors.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'demo', 'server', 'data')
const MODEL = 'Xenova/all-MiniLM-L6-v2'
const DIM = 384
const BATCH = 64

env.cacheDir = join(root, 'node_modules', '.cache', 'transformers')

// The base rows first, exactly as before, so their vectors don't change; then each
// later month's new places.
const base = JSON.parse(readFileSync(join(dataDir, 'sg_food_places.json'), 'utf8'))
const seen = new Set(base.map((v) => v.gersId))
const later = loadMonthFiles(dataDir).flatMap((month) => month.added).filter((v) => !seen.has(v.gersId) && seen.add(v.gersId))
const venues = [...base, ...later]
console.log(`embedding ${venues.length} venues with ${MODEL} (${later.length} from later months)`)

const t0 = Date.now()
const embed = await pipeline('feature-extraction', MODEL, { dtype: 'q8' })
console.log(`model ready in ${Date.now() - t0} ms`)

const int8 = new Int8Array(venues.length * DIM)
const t1 = Date.now()
for (let i = 0; i < venues.length; i += BATCH) {
  const texts = venues.slice(i, i + BATCH).map(describeVenue)
  const out = await embed(texts, { pooling: 'mean', normalize: true })
  for (let j = 0; j < texts.length; j++) {
    int8.set(quantise(out.data.subarray(j * DIM, (j + 1) * DIM)), (i + j) * DIM)
  }
  if (i % (BATCH * 32) === 0) process.stdout.write(`  ${i}/${venues.length} ${((Date.now() - t1) / 1000).toFixed(0)}s\n`)
}
console.log(`embedded in ${((Date.now() - t1) / 1000).toFixed(0)} s`)

const manifest = {
  model: MODEL,
  dim: DIM,
  count: venues.length,
  builtAt: new Date().toISOString(),
  ids: venues.map((v) => v.gersId),
}
writeFileSync(join(dataDir, 'venue_vectors.bin'), Buffer.from(int8.buffer))
writeFileSync(join(dataDir, 'venue_vectors.json'), JSON.stringify(manifest))
console.log(`wrote venue_vectors.bin (${(int8.byteLength / 1e6).toFixed(1)} MB) + manifest`)

// --- spot checks --------------------------------------------------------------
const store = createStore(manifest, int8)
const byName = (re) => venues.find((v) => re.test(v.name))
const neighbours = (v, k = 5) => venues
  .filter((o) => o.gersId !== v.gersId)
  .map((o) => [store.similarity(o.gersId, store.vectorFor(v.gersId)), o])
  .sort((a, b) => b[0] - a[0]).slice(0, k)

const turks = byName(/^turk'?s kebab/i)
if (!turks) throw new Error("spot check: Turk's Kebab missing from the registry")
const [topSim, top] = neighbours(turks)[0]
console.log(`Turk's Kebab → nearest: ${top.name} [${top.categoryPrimary}] ${topSim.toFixed(3)}`)
if (!/kebab|turkish/i.test(top.name + top.categoryPrimary)) throw new Error('spot check: nearest to Turk\'s Kebab is not a kebab venue')

const hokkien = byName(/^618 hokkien mee/i)
if (hokkien) {
  const near = neighbours(hokkien).map(([, o]) => o.name)
  console.log(`618 Hokkien Mee → ${near.join(' | ')}`)
  const numberLed = near.filter((n) => /^\d+\s/.test(n)).length
  if (numberLed > 2) throw new Error('spot check: hokkien mee neighbours still cluster by block number')
}
console.log('spot checks passed')

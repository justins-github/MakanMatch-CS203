#!/usr/bin/env node
// Uploads the venue prior vectors (built by scripts/embed-venues.mjs into
// demo/server/data/venue_vectors.*) into taste.venue_embeddings, so the engine
// asks pgvector for similarities instead of reading the local files.
//
//   node scripts/upload-venue-vectors.mjs
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { ROOT } from './lib/setup.mjs'
import { config } from '../demo/server/config.js'
import { migrate } from '../demo/server/db/migrate.js'
import { openDatabase } from '../demo/server/db/pool.js'
import { venueEmbeddingRepository } from '../demo/server/repositories/venueEmbeddingRepository.js'
import { loadVectorStore } from '../demo/server/vectors.js'

const BATCH = 500
const dataDir = join(ROOT, 'demo', 'server', 'data')
const manifestPath = join(dataDir, 'venue_vectors.json')
if (!existsSync(manifestPath)) {
  console.error('No venue_vectors.json yet. Run `node scripts/embed-venues.mjs` first.')
  process.exit(1)
}

const { ids, model } = JSON.parse(readFileSync(manifestPath, 'utf8'))
const store = loadVectorStore(dataDir)
const db = await openDatabase(config.db)
if (!db) {
  console.error('No database configured: set DB_* in .env')
  process.exit(1)
}

try {
  await migrate(db)
  const embeddings = venueEmbeddingRepository(db)
  for (let i = 0; i < ids.length; i += BATCH) {
    const rows = ids.slice(i, i + BATCH).map((gersId) => ({ gersId, embedding: store.vectorFor(gersId) }))
    await embeddings.upsertMany(rows, model)
    process.stdout.write(`\ruploaded ${Math.min(i + BATCH, ids.length)}/${ids.length} vectors`)
  }
  console.log(`\ndone (${model}). Restart the engine to switch it to pgvector.`)
} finally {
  await db.close()
}

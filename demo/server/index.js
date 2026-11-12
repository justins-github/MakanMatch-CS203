// The recommendation engine: wiring only. Domain logic lives in match.js,
// learn.js and friends; services/ holds the use cases, routes/ the HTTP layer,
// repositories/ the SQL, clients/ the calls to the other two services.
import express from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from './config.js'
import { createAccountClient } from './clients/accountClient.js'
import { communityRoutes } from './routes/community.js'
import { createCommunityService } from './services/communityService.js'
import { createAiClient } from './clients/aiClient.js'
import { createChangeExplainer } from './changeExplainer.js'
import { createCatalogClient } from './clients/catalogClient.js'
import { createOneMapClient } from './clients/oneMapClient.js'
import { createDishEstimator } from './dishEstimator.js'
import { migrate } from './db/migrate.js'
import { openDatabase } from './db/pool.js'
import { errorHandler } from './errors.js'
import { starterProfile } from './learn.js'
import { createTokenVerifier, requireAuth } from './middleware/requireAuth.js'
import { createMonths, loadMonthFiles } from './months.js'
import { loadRegistryInputs } from './registry.js'
import { venueEmbeddingRepository } from './repositories/venueEmbeddingRepository.js'
import { createReviewReader } from './reviewReader.js'
import { createSummaryWriter } from './tasteSummary.js'
import { contextRoutes } from './routes/context.js'
import { demoMonthRoutes } from './routes/demoMonths.js'
import { locationRoutes } from './routes/location.js'
import { profileRoutes } from './routes/profile.js'
import { reviewBombRoutes } from './routes/reviewBomb.js'
import { recommendationRoutes } from './routes/recommendations.js'
import { reviewRoutes } from './routes/reviews.js'
import { venueRoutes } from './routes/venues.js'
import { warmRoutes } from './routes/warm.js'
import { dbLearnerStore, memoryLearnerStore } from './services/learnerStore.js'
import { createProfileService } from './services/profileService.js'
import { createRecommendationService } from './services/recommendationService.js'
import { createReviewBombService } from './services/reviewBombService.js'
import { createReviewService } from './services/reviewService.js'
import { fileVectorSource, pgVectorSource } from './services/tasteVectors.js'
import { loadVectorStore } from './vectors.js'
import { createContextSource } from './weather.js'

if (!config.supabaseUrl) {
  console.error('SUPABASE_URL is not set. Copy .env.example to .env at the repo root and fill it in.')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const seedDishes = JSON.parse(readFileSync(join(here, 'data', 'dishes.json'), 'utf8'))
// August is the registry everyone gets; later months are the demo's Month switch (months.js).
const months = createMonths({ ...loadRegistryInputs(), deltas: loadMonthFiles(join(here, 'data')) })
const registry = months.base
console.log(`venue registry: ${registry.stats.total} venues (${registry.stats.overture} from Overture); months: ${months.list.map((m) => m.label).join(', ')}`)
if (registry.stats.unmatched.length) console.log(`community-only seeds (no Overture match): ${registry.stats.unmatched.join(', ')}`)

// Learning state: Postgres when configured (survives restarts), else memory.
const db = await openDatabase(config.db)
if (db) await migrate(db, { log: (line) => console.log(`taste db: ${line}`) })
const learners = db ? dbLearnerStore({ db, starter: starterProfile }) : memoryLearnerStore({ starter: starterProfile })
console.log(db ? `learning state: ${db.kind} (taste schema)` : 'learning state: in memory (set DB_* in .env to persist)')

// Venue prior vectors: pgvector once uploaded, else the local files.
const embeddings = db ? venueEmbeddingRepository(db) : null
const uploaded = embeddings ? await embeddings.count() : { count: 0 }
const vectors = uploaded.count > 0
  ? pgVectorSource(embeddings, { size: uploaded.count, model: uploaded.model })
  : fileVectorSource(loadVectorStore(join(here, 'data')))
if (vectors.size === 0) console.warn('venue vectors missing - run `node scripts/embed-venues.mjs`; ranking without the taste-vector term')
else console.log(`taste vectors: ${vectors.size} venues via ${vectors.kind} (${vectors.model})`)

// Claude reads review text when a key is set; otherwise the keyword list does.
const ai = createAiClient(config.ai)
console.log(ai.available ? `review reader: Claude (${ai.model})` : 'review reader: keyword matching (set ANTHROPIC_API_KEY to use Claude)')

// Weather: context-service when it runs, data.gov.sg directly otherwise (and as its fallback).
const getContext = createContextSource({ contextServiceUrl: config.contextServiceUrl })
console.log(config.contextServiceUrl ? 'weather: context-service, data.gov.sg as fallback' : 'weather: data.gov.sg')

const accounts = createAccountClient({ baseUrl: config.accountServiceUrl })
const catalog = createCatalogClient({ baseUrl: config.catalogServiceUrl })
const recommendations = createRecommendationService({
  registry, months, vectors, learners, catalog, accounts, explainer: createChangeExplainer({ ai }),
})
const reviews = createReviewService({
  registry, learners, catalog, seedDishes, vectors, reader: createReviewReader({ ai }), estimator: createDishEstimator({ ai }),
})
const profiles = createProfileService({ learners, summaries: createSummaryWriter({ ai }), registry })
const community = createCommunityService({ learners, accounts, registry })
const reviewBomb = createReviewBombService({ accounts, reviews, learners, registry, password: config.seedPersonaPassword })
const authenticated = requireAuth({
  verifyToken: createTokenVerifier({ supabaseUrl: config.supabaseUrl, jwtSecret: config.jwtSecret }),
  accounts,
})

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '32kb' }))
app.use(contextRoutes({ getContext })) // public
app.use(warmRoutes({ accounts, catalog })) // public
app.use('/api', authenticated) // everything below needs a signed-in user
app.use(recommendationRoutes({ recommendations, getContext, months }))
app.use(locationRoutes({ oneMap: createOneMapClient() }))
app.use(venueRoutes({ recommendations, months }))
app.use(demoMonthRoutes({ recommendations, months }))
app.use(reviewRoutes({ reviews }))
app.use(profileRoutes({ profiles }))
app.use(communityRoutes({ community }))
app.use(reviewBombRoutes({ reviewBomb }))
app.use(errorHandler)

app.listen(config.port, () => console.log(`engine api on :${config.port}`))

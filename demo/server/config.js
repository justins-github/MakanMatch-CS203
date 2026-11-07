// Engine settings from environment variables, falling back to the repo-root
// .env (the same file the Spring services read). Real environment variables win.
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const rootEnv = join(here, '..', '..', '.env')
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const env = process.env
const withoutTrailingSlash = (url) => url?.replace(/\/+$/, '')

export const config = {
  port: Number(env.ENGINE_PORT ?? 3001),
  supabaseUrl: withoutTrailingSlash(env.SUPABASE_URL),
  // Only for projects still on Supabase's legacy shared JWT secret.
  jwtSecret: env.SUPABASE_JWT_SECRET || null,
  accountServiceUrl: withoutTrailingSlash(env.ACCOUNT_SERVICE_URL ?? 'http://localhost:8082'),
  catalogServiceUrl: withoutTrailingSlash(env.CATALOG_SERVICE_URL ?? 'http://localhost:8083'),
  db: databaseConfig(),
  // No key = AI off; everything that asks Claude has a non-AI fallback.
  ai: {
    apiKey: env.ANTHROPIC_API_KEY || null,
    model: env.AI_MODEL || 'claude-haiku-5-5',
    timeoutMs: Number(env.AI_TIMEOUT_MS ?? 10000),
  },
}

// ENGINE_DB=memory keeps learning state in memory (lost on restart);
// ENGINE_DB=pglite uses an embedded Postgres under demo/server/.data (no Supabase needed);
// otherwise the shared DB_* settings point at Supabase.
function databaseConfig() {
  if (env.ENGINE_DB === 'memory') return null
  if (env.ENGINE_DB === 'pglite') return { pglite: env.ENGINE_PGLITE_DIR ?? join(here, '.data', 'taste') }
  if (!env.DB_HOST) return null
  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 5432),
    database: env.DB_NAME ?? 'postgres',
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: (env.DB_SSLMODE ?? 'require') !== 'disable',
    poolSize: Number(env.DB_POOL_SIZE ?? 3),
  }
}

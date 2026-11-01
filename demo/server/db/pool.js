// Opens the engine's database behind one small interface:
//   { kind, query(text, params) -> { rows }, exec(multiStatementSql), tx(fn), close() }
// Real Postgres (Supabase, through its IPv4 session pooler) in production; an
// embedded PGlite (Postgres compiled to WebAssembly) for local work and tests.
import { mkdirSync } from 'fs'

// The engine owns the "taste" schema; pgvector lives in Supabase's "extensions" schema.
const SEARCH_PATH = 'set search_path to taste, extensions, public'

export async function openDatabase(cfg) {
  if (!cfg) return null
  if ('pglite' in cfg) return openPglite(cfg.pglite)
  return openPostgres(cfg)
}

async function openPostgres(cfg) {
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    // Encrypted; the certificate isn't pinned (see README "Security notes").
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    max: cfg.poolSize ?? 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  pool.on('error', (err) => console.error('postgres pool error:', err.message))

  // Each pooled connection gets the search path once, awaited before its first
  // real query (the session pooler keeps session settings per connection).
  const prepared = new WeakSet()
  async function checkout() {
    const client = await pool.connect()
    if (!prepared.has(client)) {
      try {
        await client.query(SEARCH_PATH)
      } catch (err) {
        client.release(err)
        throw err
      }
      prepared.add(client)
    }
    return client
  }
  async function withClient(fn) {
    const client = await checkout()
    try {
      return await fn(client)
    } finally {
      client.release()
    }
  }
  const wrap = (client) => ({
    query: (text, params) => client.query(text, params),
    exec: (text) => client.query(text),
  })
  return {
    kind: 'postgres',
    query: (text, params) => withClient((client) => client.query(text, params)),
    exec: (text) => withClient((client) => client.query(text)),
    async tx(fn) {
      const client = await checkout()
      try {
        await client.query('begin')
        const result = await fn(wrap(client))
        await client.query('commit')
        return result
      } catch (err) {
        await client.query('rollback').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

// dataDir: a folder to persist in, or null for a throwaway in-memory database.
async function openPglite(dataDir) {
  const [{ PGlite }, { vector }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite-pgvector'),
  ])
  if (dataDir) mkdirSync(dataDir, { recursive: true })
  const db = await PGlite.create({ ...(dataDir ? { dataDir } : {}), extensions: { vector } })
  await db.exec('create schema if not exists extensions; create extension if not exists vector with schema extensions;')
  await db.exec(SEARCH_PATH)
  const wrap = (client) => ({
    query: (text, params) => client.query(text, params),
    exec: (text) => client.exec(text),
  })
  return {
    kind: 'pglite',
    ...wrap(db),
    tx: (fn) => db.transaction((tx) => fn(wrap(tx))),
    close: () => db.close(),
  }
}

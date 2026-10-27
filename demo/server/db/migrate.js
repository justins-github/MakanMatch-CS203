// Applies db/migrations/*.sql in name order, each once, each in a transaction
// (the engine's equivalent of Flyway in the Spring services). Runs on startup;
// also runnable on its own: `npm run migrate` in demo/.
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function migrate(db, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  await db.exec(`
    create schema if not exists taste;
    create table if not exists taste.schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    );`)
  const { rows } = await db.query('select version from taste.schema_migrations')
  const applied = new Set(rows.map((r) => r.version))
  const pending = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().filter((f) => !applied.has(f))
  for (const file of pending) {
    const sql = readFileSync(join(dir, file), 'utf8')
    await db.tx(async (tx) => {
      await tx.exec(sql)
      await tx.query('insert into taste.schema_migrations (version) values ($1)', [file])
    })
    log(`migrated ${file}`)
  }
  return pending
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import('../config.js')
  const { openDatabase } = await import('./pool.js')
  const db = await openDatabase(config.db)
  if (!db) {
    console.error('No database configured: set DB_* in .env (or ENGINE_DB=pglite)')
    process.exit(1)
  }
  const applied = await migrate(db, { log: console.log })
  console.log(applied.length ? `${applied.length} migration(s) applied` : 'already up to date')
  await db.close()
}

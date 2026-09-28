// Shared by the scripts: reads the repo-root .env, opens a Postgres connection,
// and wraps the Supabase Auth admin API (secret key, server-side only).
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const envFile = join(ROOT, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

export function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name])
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(', ')} (see .env.example)`)
    process.exit(1)
  }
}

export async function connect() {
  requireEnv('DB_HOST', 'DB_USER', 'DB_PASSWORD')
  const env = process.env
  const client = new pg.Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 5432),
    database: env.DB_NAME ?? 'postgres',
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: (env.DB_SSLMODE ?? 'require') === 'disable' ? undefined : { rejectUnauthorized: false },
  })
  await client.connect()
  return client
}

// Fails with a helpful message when a service hasn't created its tables yet.
export async function requireTable(db, table, service) {
  const { rows } = await db.query('select to_regclass($1) as found', [table])
  if (!rows[0].found) {
    console.error(`Table ${table} doesn't exist yet. Start ${service} once (it creates its tables), then re-run.`)
    process.exit(1)
  }
}

export function supabaseAdmin() {
  requireEnv('SUPABASE_URL', 'SUPABASE_SECRET_KEY')
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1'
  const key = process.env.SUPABASE_SECRET_KEY
  const headers = {
    apikey: key,
    'content-type': 'application/json',
    // legacy service_role keys are JWTs and go in Authorization too
    ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}),
  }

  async function call(method, path, body) {
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = data.msg ?? data.error_description ?? data.message ?? `Supabase Auth answered ${res.status}`
      throw Object.assign(new Error(message), { status: res.status, code: data.error_code ?? data.error })
    }
    return data
  }

  return {
    async findByEmail(email) {
      const wanted = email.toLowerCase()
      for (let page = 1; page <= 25; page++) {
        const { users = [] } = await call('GET', `/admin/users?page=${page}&per_page=200`)
        const hit = users.find((u) => u.email?.toLowerCase() === wanted)
        if (hit) return hit
        if (users.length < 200) return null
      }
      return null
    },
    // Already confirmed: these accounts never receive email.
    createUser: (email, password, displayName) =>
      call('POST', '/admin/users', { email, password, email_confirm: true, user_metadata: { display_name: displayName } }),
  }
}

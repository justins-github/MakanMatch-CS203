#!/usr/bin/env node
// Account setup that deliberately has no button in the app:
//
//   node scripts/seed-accounts.mjs --promote you@example.com
//       Make an existing account an admin. The very first admin has to come
//       from here; after that, admins promote each other in the Admin tab.
//
//   node scripts/seed-accounts.mjs --grant you@example.com turks-kebab
//       Let an account manage a venue without a claim (handy for testing the
//       owner screens as an admin acting as an owner).
//
//   node scripts/seed-accounts.mjs --personas
//       Create the demo community (scripts/lib/personas.mjs): diners, two
//       owners and one pending claim. Safe to re-run.
//
// Uses the Supabase secret key and writes the accounts schema directly, so
// account-service must have started once to create its tables.
import { connect, requireEnv, requireTable, supabaseAdmin } from './lib/setup.mjs'
import { PERSONAS, personaEmail } from './lib/personas.mjs'

const [command, ...args] = process.argv.slice(2)
const usage = () => {
  console.log('usage: node scripts/seed-accounts.mjs --promote <email> | --grant <email> <venueId> | --personas')
  process.exit(1)
}

const auth = supabaseAdmin()
const db = await connect()
await requireTable(db, 'accounts.profiles', 'account-service')

async function userByEmail(email) {
  const user = await auth.findByEmail(email)
  if (!user) {
    console.error(`No account with email ${email}. Sign up in the app first.`)
    process.exit(1)
  }
  return user
}

async function venueName(venueId) {
  const found = await db.query('select to_regclass($1) as t', ['catalog.venues'])
  if (!found.rows[0].t) return null
  const { rows } = await db.query('select name from catalog.venues where id = $1', [venueId])
  return rows[0]?.name ?? null
}

async function ensureProfile(userId, displayName) {
  await db.query(
    `insert into accounts.profiles (id, display_name) values ($1, $2) on conflict (id) do nothing`,
    [userId, displayName],
  )
}

async function grant(userId, venueId, name) {
  await db.query(
    `insert into accounts.venue_owners (venue_id, venue_name, user_id) values ($1, $2, $3)
     on conflict (venue_id, user_id) do nothing`,
    [venueId, name, userId],
  )
}

try {
  if (command === '--promote') {
    const email = args[0] ?? usage()
    const user = await userByEmail(email)
    await db.query(
      `insert into accounts.profiles (id, display_name, is_admin) values ($1, $2, true)
       on conflict (id) do update set is_admin = true, updated_at = now()`,
      [user.id, user.user_metadata?.display_name ?? email.split('@')[0]],
    )
    console.log(`${email} is now an admin. Sign out and back in (or refresh) to see the Admin tab.`)
  } else if (command === '--grant') {
    const [email, venueId] = args
    if (!email || !venueId) usage()
    const user = await userByEmail(email)
    const name = await venueName(venueId)
    if (!name) {
      console.error(`No venue "${venueId}" in catalog.venues. Run \`npm run load:venues\` first.`)
      process.exit(1)
    }
    await ensureProfile(user.id, user.user_metadata?.display_name ?? email.split('@')[0])
    await grant(user.id, venueId, name)
    console.log(`${email} now manages ${name} (${venueId}).`)
  } else if (command === '--personas') {
    requireEnv('SEED_PERSONA_PASSWORD')
    for (const persona of PERSONAS) {
      const email = personaEmail(persona)
      let user = await auth.findByEmail(email)
      if (!user) {
        try {
          user = await auth.createUser(email, process.env.SEED_PERSONA_PASSWORD, persona.displayName)
        } catch (err) {
          console.error(`Couldn't create ${email}: ${err.message}`)
          if (/invalid/i.test(err.message)) console.error('Supabase may reject this email domain; set SEED_EMAIL_DOMAIN in .env.')
          process.exit(1)
        }
      }
      await db.query(
        `insert into accounts.profiles (id, username, display_name) values ($1, $2, $3)
         on conflict (id) do update set username = excluded.username, display_name = excluded.display_name, updated_at = now()`,
        [user.id, persona.username, persona.displayName],
      )
      let role = 'diner'
      if (persona.owns) {
        const name = (await venueName(persona.owns)) ?? persona.owns
        await grant(user.id, persona.owns, name)
        role = `owner of ${name}`
      }
      if (persona.claims) {
        const name = (await venueName(persona.claims.venueId)) ?? persona.claims.venueId
        await db.query(
          `insert into accounts.venue_claims (venue_id, venue_name, user_id, proof)
           select $1, $2, $3, $4
           where not exists (select 1 from accounts.venue_claims where user_id = $3 and venue_id = $1)`,
          [persona.claims.venueId, name, user.id, persona.claims.proof],
        )
        role = `pending claim for ${name}`
      }
      console.log(`@${persona.username.padEnd(15)} ${persona.displayName.padEnd(7)} ${role} - ${persona.about}`)
    }
    console.log('\nPersonas sign in with their username and SEED_PERSONA_PASSWORD.')
  } else {
    usage()
  }
} finally {
  await db.end()
}

# MakanMatch

Singapore food discovery that learns your taste. Diners rank dishes and get
personalised recommendations; owners keep their venue's status, menu and prices
right; admins verify owners and manage accounts.

## How it fits together

```
Browser (React, :5203) ── one origin; the browser never talks to Supabase or holds a Supabase key
  │
  ├─ /api/auth /api/me /api/claims /api/owner /api/admin ──► account-service  (Spring Boot, :8082)
  │                                                            ├─ Supabase Auth: passwords, tokens, bans
  │                                                            └─ Postgres schema "accounts"
  ├─ /api/catalog/** ──────────────────────────────────────► catalog-service  (Spring Boot, :8083)
  │                                                            ├─ Postgres schema "catalog"
  │                                                            └─ asks account-service "what may this caller do?"
  └─ every other /api/** ──────────────────────────────────► engine           (Express, :3001)
                                                               ├─ Postgres schema "taste" (+ pgvector)
                                                               └─ asks account-service and catalog-service
```

| Part | Owns | Folder |
|---|---|---|
| **account-service** | sign-up/login (on Supabase Auth), profiles and usernames, roles, venue ownership claims, admin user management | `account-service/` |
| **catalog-service** | the 21.7k-venue registry (Overture Maps + curated seeds), owner status reports, dishes, price history | `catalog-service/` |
| **engine** | recommendations, venue search, reviews, rankings, the learned Taste DNA | `demo/server/` |
| **web app** | every screen | `demo/src/` |

Rules the code follows (and `ArchitectureTest` checks for the Spring services):
each service reads and writes **only its own schema**; services call each other
over HTTP in one direction only (catalog → account, engine → account + catalog);
inside a service, controllers → services → repositories, and features never
depend on each other in a circle.

## First-time setup

You need **Node 20.12+** and **JDK 17+** (e.g. `winget install EclipseAdoptium.Temurin.17.JDK`,
or `brew install --cask temurin@17`), with `JAVA_HOME` pointing at it.

### 1. Create the Supabase project (free tier)

1. At supabase.com, create a project. Region: *Southeast Asia (Singapore)*. Save the database password.
2. **API keys** (Project Settings → API Keys): copy the **publishable** key and the
   **secret** key. The legacy `anon` / `service_role` keys work too.
3. **JWT signing keys** (Project Settings → JWT Keys): new projects sign tokens with
   an asymmetric key, which is what we want. If yours says *Legacy JWT secret*,
   either click **Migrate JWT secret** then **Rotate keys**, or put the legacy
   secret in `SUPABASE_JWT_SECRET`.
4. **Database connection** (Connect button → *Session pooler*): note the host
   (`aws-0-<region>.pooler.supabase.com`), port 5432 and user (`postgres.<project-ref>`).
   Use the session pooler: the direct connection is IPv6-only on the free tier.
5. Nothing else. Each service creates its own schema and tables on first start
   (Flyway for the Spring services, `demo/server/db/migrate.js` for the engine).

### 2. Configure and install

```bash
cp .env.example .env      # then fill in the Supabase values
npm install               # installs the root scripts' deps and demo/
```

### 3. Run everything

```bash
npm run dev
```

This starts account-service, catalog-service, the engine and the web app together.
The first start downloads Maven and the Spring dependencies (a few minutes).
The Spring services log quietly here (warnings, errors and a "Tomcat started" line);
`npm run dev:verbose` gives Maven's and Spring's full startup output.
Open http://localhost:5203. Swagger UI: http://localhost:8082/swagger-ui.html
(accounts) and http://localhost:8083/swagger-ui.html (catalog).

### 4. Load data (once, with `npm run dev` running)

```bash
npm run load:venues       # 21.7k venues into the catalog (re-run monthly after extract-overture)
npm run seed:menus        # the curated demo dishes and prices
npm run upload:vectors    # optional: venue vectors into pgvector (build them first: node scripts/embed-venues.mjs)
```

### 5. Make yourself an admin

Sign up in the app, then:

```bash
node scripts/seed-accounts.mjs --promote you@example.com
```

Refresh, and the **Admin** tab and the **View as** switcher appear. After that,
admins promote each other in the Admin tab. For testing the owner screens:
`node scripts/seed-accounts.mjs --grant you@example.com turks-kebab`.

## The demo community (Week 13)

```bash
npm run seed:personas     # 4 diners with distinct tastes, 2 owners, 1 pending claim
npm run simulate          # a week of activity through the real APIs
```

`seed:personas` needs `SEED_PERSONA_PASSWORD` in `.env`. Personas sign in with
their username, e.g. `mei_chilli`. The simulation has Ahmet report that Turk's
Kebab moved to Parklane and set an official price, Thura close Yangon Flavours for
renovation, the diners review dishes according to their tastes, and two diners pay
more than the menu says. Afterwards:
- the diners' Taste DNA and feeds differ from each other;
- Yangon Flavours drops out of feeds (the feed says why);
- Turk's Kebab shows its new address;
- Ahmet sees a price conflict to resolve;
- an admin has Siti's claim to review.

`npm run simulate -- --fresh` resets the diners first.

## Roles

| | Diner | Owner | Admin |
|---|---|---|---|
| For you, Review, Taste DNA, Profile | ✓ | ✓ | ✓ |
| Claim a venue (proof required) | ✓ | ✓ | ✓ |
| **My venues**: post status, edit menu and official prices, resolve price conflicts |  | own venues only | own venues only |
| **Admin**: approve/reject claims, promote/demote admins, disable accounts, revoke ownership |  |  | ✓ |
| Review your own venue | - | ✗ | ✗ |

"Owner" isn't stored: an account is an owner when it manages at least one venue.
Admins can **view as** User or Owner. The server then applies exactly that role's
permissions, so it's a real test, and a caution strip reminds you.

## Security design (for the report)

- **Passwords never touch our code or database.** Supabase Auth hashes and checks them.
- **Tokens:** the access token (~1 h) lives only in page memory. The refresh token
  lives only in an `HttpOnly; SameSite=Strict; Path=/api/auth` cookie (`Secure` over
  https), so injected scripts can't read either. Refresh tokens rotate on every use.
- **Verification:** every service checks the access token itself: the ES256
  signature against Supabase's published keys, plus expiry, issuer and audience.
  Roles come from our database on each request, so promoting, demoting or disabling
  takes effect immediately in account-service, and within 30 s in the other services
  (they cache account lookups).
- **Forgery:** bearer tokens can't be sent by another site. The two cookie routes
  also require an `X-Requested-With` header, which cross-site requests can't add.
- **Login throttling** per client and identifier (10 tries per 5 minutes). Login
  failures give one generic message whether or not the account exists.
- **Least exposure:** our tables live in `accounts`, `catalog` and `taste`. These
  schemas aren't exposed through Supabase's public Data API, and Row Level Security
  with no policies blocks it anyway.
- **Guard rails:** an admin can't approve their own claim, can't change their own
  admin/disabled status, and the last active admin can't be removed. Owners can't
  review their own venue. Disabling an account also bans it in Supabase.

## Tests

```bash
npm test                                  # engine: 94 tests, incl. SQL against embedded Postgres + pgvector
cd account-service && ./mvnw test         # 44 tests (web layer, rules, architecture)
cd catalog-service && ./mvnw test         # 28 tests
```

Each Spring service also has a full-boot test (Flyway + schema validation against
a real database). It runs only when the `DB_*` and `SUPABASE_*` environment variables
are set, e.g. for a second Supabase project used for testing.

## Free-tier notes

- Free Supabase projects **pause after 7 days without activity**. Open the app (or
  the dashboard) before a demo.
- The session pooler allows few connections. Each service uses `DB_POOL_SIZE=3`.
- Supabase's built-in mailer only reaches your own team's addresses (2 emails an
  hour), so sign-up doesn't send confirmation emails, and password resets are done
  by an admin from the Supabase dashboard.
- **Deploying:** serve the web app and all three APIs from **one origin** (e.g.
  Vercel rewrites `/api/...` to the services) so the refresh cookie works, and set
  `COOKIE_SECURE=true`.

## Troubleshooting

- **"Port 8082 (or 8083) already in use"** after stopping the services: on Windows a
  Spring service's `java.exe` can outlive its terminal. Find it with
  `netstat -ano | findstr :8082` and end that PID in Task Manager.
- **Everything returns 401**: check `SUPABASE_URL` in `.env`. Tokens are only
  accepted from that exact project.
- **Engine won't start: "SUPABASE_URL is not set"**: `.env` must be at the repo root.

## Known limitations

- No self-service password reset (see the mailer note above).
- Login throttling is in memory: per instance, reset on restart.
- The engine's TLS connection to Postgres is encrypted, but it doesn't pin
  Supabase's certificate.
- `context-service/` (weather and OneMap) isn't wired in yet; the engine reads the
  data.gov.sg forecast itself.

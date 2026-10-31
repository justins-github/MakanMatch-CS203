import test from 'node:test'
import assert from 'node:assert/strict'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { createTokenVerifier, requireAuth } from './requireAuth.js'

const SUPABASE = 'https://demo-project.supabase.co'
const USER_ID = '44444444-4444-4444-4444-444444444444'
const ME = { id: USER_ID, displayName: 'Mei', effectiveRole: 'USER', ownedVenues: [] }

const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' }] }
const verifyToken = createTokenVerifier({ supabaseUrl: SUPABASE, jwks })

function sign({ issuer = `${SUPABASE}/auth/v1`, audience = 'authenticated', expiresIn = '1h', key = privateKey } = {}) {
  return new SignJWT({ email: 'mei@example.com', role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(USER_ID)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key)
}

// Runs the middleware against a fake request; resolves with what happened.
function run(middleware, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  const req = { get: (name) => lower[name.toLowerCase()] }
  return new Promise((resolve) => {
    const res = {
      status(code) {
        return { json: (body) => resolve({ status: code, body, req }) }
      },
    }
    middleware(req, res, (err) => resolve({ next: true, err, req }))
  })
}

function accountsReturning(me) {
  const calls = []
  return { calls, me: async (token, actAs) => (calls.push({ token, actAs }), me) }
}

test('requests without a token are turned away', async () => {
  const outcome = await run(requireAuth({ verifyToken, accounts: accountsReturning(ME) }))
  assert.equal(outcome.status, 401)
})

test('a valid token lets the request through with the caller attached', async () => {
  const accounts = accountsReturning(ME)
  const token = await sign()
  const outcome = await run(requireAuth({ verifyToken, accounts }), { Authorization: `Bearer ${token}` })
  assert.ok(outcome.next)
  assert.equal(outcome.err, undefined)
  assert.equal(outcome.req.user.id, USER_ID)
  assert.equal(outcome.req.user.me.displayName, 'Mei')
})

test('the act-as choice is forwarded to account-service, which decides if it applies', async () => {
  const accounts = accountsReturning(ME)
  const token = await sign()
  await run(requireAuth({ verifyToken, accounts }), { Authorization: `Bearer ${token}`, 'X-Act-As': 'owner' })
  assert.deepEqual(accounts.calls, [{ token, actAs: 'owner' }])
})

test('tokens signed by anyone else are rejected', async () => {
  const { privateKey: forger } = await generateKeyPair('ES256')
  const token = await sign({ key: forger })
  const outcome = await run(requireAuth({ verifyToken, accounts: accountsReturning(ME) }), { Authorization: `Bearer ${token}` })
  assert.equal(outcome.status, 401)
})

test('expired tokens are rejected', async () => {
  const token = await sign({ expiresIn: '-1m' })
  const outcome = await run(requireAuth({ verifyToken, accounts: accountsReturning(ME) }), { Authorization: `Bearer ${token}` })
  assert.equal(outcome.status, 401)
})

test('tokens for another project or audience are rejected', async () => {
  for (const token of [await sign({ issuer: 'https://other.supabase.co/auth/v1' }), await sign({ audience: 'anon' })]) {
    const outcome = await run(requireAuth({ verifyToken, accounts: accountsReturning(ME) }), { Authorization: `Bearer ${token}` })
    assert.equal(outcome.status, 401)
  }
})

test('disabled accounts are turned away even with a still-valid token', async () => {
  const token = await sign()
  const outcome = await run(requireAuth({ verifyToken, accounts: accountsReturning(null) }), { Authorization: `Bearer ${token}` })
  assert.equal(outcome.status, 401)
})

test('an unreachable account-service is an error, not a pass', async () => {
  const token = await sign()
  const accounts = { me: async () => { throw Object.assign(new Error('down'), { status: 503 }) } }
  const outcome = await run(requireAuth({ verifyToken, accounts }), { Authorization: `Bearer ${token}` })
  assert.ok(outcome.next)
  assert.equal(outcome.err.status, 503)
  assert.equal(outcome.req.user, undefined)
})

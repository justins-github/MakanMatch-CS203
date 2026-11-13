// Every engine route except /api/health and /api/context needs a signed-in user.
// 1. The Supabase access token is verified locally (signature against the
//    project's public keys, expiry, issuer, audience) - no network call.
// 2. account-service is asked who the caller is (cached), so disabled accounts
//    are turned away here too and routes know the caller's role and venues.
//    Requests that `needsFreshAccount` picks out skip the cache.
// Routes then get req.user = { id, token, actAs, me }.
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose'

export function createTokenVerifier({ supabaseUrl, jwtSecret = null, jwks = null }) {
  const issuer = `${supabaseUrl}/auth/v1`
  let key
  let algorithms
  if (jwks) {
    key = createLocalJWKSet(jwks) // tests
    algorithms = ['ES256', 'RS256']
  } else if (jwtSecret) {
    key = new TextEncoder().encode(jwtSecret) // legacy shared-secret projects
    algorithms = ['HS256']
  } else {
    key = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    algorithms = ['ES256', 'RS256']
  }
  return async (token) => {
    const { payload } = await jwtVerify(token, key, { issuer, audience: 'authenticated', algorithms })
    return payload
  }
}

export function requireAuth({ verifyToken, accounts, needsFreshAccount = () => false }) {
  return async (req, res, next) => {
    const token = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '')?.[1]
    if (!token) return res.status(401).json({ error: 'Please sign in' })

    let claims
    try {
      claims = await verifyToken(token)
    } catch {
      return res.status(401).json({ error: 'Your session has expired - please sign in again' })
    }

    const actAs = req.get('x-act-as') ?? null
    try {
      const me = await accounts.me(token, actAs, { fresh: needsFreshAccount(req) })
      if (!me) return res.status(401).json({ error: 'Your session is no longer valid - please sign in again' })
      req.user = { id: claims.sub, token, actAs, me }
      next()
    } catch (err) {
      next(err)
    }
  }
}

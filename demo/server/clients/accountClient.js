// Asks account-service who the caller is: GET /api/me with the caller's own
// token (and their act-as choice). Account data stays owned by account-service.
// Answers are cached briefly per token, so a burst of requests costs one call.
import { badRequest, unavailable } from '../errors.js'

export function createAccountClient({ baseUrl, fetchImpl = fetch, ttlMs = 30_000, now = Date.now }) {
  const cache = new Map()

  async function getJson(path, token) {
    let res
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      })
    } catch {
      throw unavailable('The account service is unreachable - is it running?')
    }
    if (res.ok) return res.json()
    throw unavailable(`The account service answered ${res.status}`)
  }

  return {
    // The caller's MeResponse, or null when account-service rejects the token
    // (expired, or the account was disabled).
    async me(token, actAs = null) {
      const key = `${token}|${actAs ?? ''}`
      const hit = cache.get(key)
      if (hit && hit.until > now()) return hit.value

      let res
      try {
        res = await fetchImpl(`${baseUrl}/api/me`, {
          headers: { authorization: `Bearer ${token}`, ...(actAs ? { 'x-act-as': actAs } : {}) },
          signal: AbortSignal.timeout(5000),
        })
      } catch {
        throw unavailable('The account service is unreachable - is it running?')
      }
      let value = null
      if (res.ok) value = await res.json()
      else if (res.status !== 401 && res.status !== 403) {
        throw unavailable(`The account service answered ${res.status}`)
      }
      if (cache.size > 1000) cache.clear()
      cache.set(key, { value, until: now() + (value ? ttlMs : 5_000) })
      return value
    },

    // The caller's kakis for a group meal: [{ id, displayName, restrictions }].
    // account-service checks they really are the caller's kakis; not cached, so a
    // removed kaki drops out straight away.
    async party(token, ids) {
      let res
      try {
        res = await fetchImpl(`${baseUrl}/api/kakis/party?ids=${ids.map(encodeURIComponent).join(',')}`, {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        })
      } catch {
        throw unavailable('The account service is unreachable - is it running?')
      }
      if (res.ok) return res.json()
      if (res.status === 400 || res.status === 403) {
        throw badRequest("Someone you picked isn't your kaki any more - go back and pick again")
      }
      throw unavailable(`The account service answered ${res.status}`)
    },

    // Who these people are: [{ id, displayName, username }], leaving out unknown and
    // disabled accounts. Not cached, so someone disabled drops out straight away.
    people(token, ids) {
      return getJson(`/api/people?ids=${ids.map(encodeURIComponent).join(',')}`, token)
    },

    // The caller's kakis and requests: { kakis, incoming, outgoing }. Not cached, so a
    // removed kaki drops out straight away.
    kakis(token) {
      return getJson('/api/kakis', token)
    },

    // Signs in with a username (or email) and password: the access token, or null when
    // account-service turns it down. Only the admin's review bomb uses it, for the seeded
    // demo accounts (services/reviewBombService.js).
    async signIn(identifier, password) {
      let res
      try {
        res = await fetchImpl(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        throw unavailable('The account service is unreachable - is it running?')
      }
      if (res.ok) return (await res.json()).accessToken
      if (res.status === 400 || res.status === 401) return null
      throw unavailable(`The account service answered ${res.status}`)
    },
  }
}

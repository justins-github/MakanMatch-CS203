// Asks account-service who the caller is: GET /api/me with the caller's own
// token (and their act-as choice). Account data stays owned by account-service.
// Answers are cached briefly per token, so a burst of requests costs one call.
import { unavailable } from '../errors.js'

export function createAccountClient({ baseUrl, fetchImpl = fetch, ttlMs = 30_000, now = Date.now }) {
  const cache = new Map()
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
  }
}

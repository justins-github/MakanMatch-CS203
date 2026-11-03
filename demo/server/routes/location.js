// Where the user is searching from: the X-Location header that every scoring call
// carries (kept out of the URL, so out of request logs), the walk limit for Find
// and Surprise, and the place search behind the location picker.
import { Router } from 'express'
import { asyncHandler, badRequest } from '../errors.js'
import { DEFAULT_WALK_MIN, SMU, parseLatLon } from '../geo.js'

const MAX_QUERY = 60

// The request's spot; SMU when the client didn't say.
export function locationOf(req) {
  const header = req.get('x-location')
  if (!header) return SMU
  const point = parseLatLon(header)
  if (!point) throw badRequest('X-Location must be "lat,lon" inside Singapore')
  return point
}

// ?walk= whole minutes, 5-60; 20 when absent.
export function walkLimitOf(req) {
  if (req.query.walk === undefined) return DEFAULT_WALK_MIN
  const minutes = Number(req.query.walk)
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) {
    throw badRequest('walk must be whole minutes from 5 to 60')
  }
  return minutes
}

export function locationRoutes({ oneMap }) {
  const router = Router()

  // Echoes q so the client can drop stale responses; available: false when OneMap is down.
  router.get('/api/locations/search', asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length > MAX_QUERY) throw badRequest(`Search for at most ${MAX_QUERY} characters`)
    if (q.length < 2) return res.json({ q, results: [], available: true })
    const places = await oneMap.search(q)
    res.json({ q, results: places ?? [], available: places !== null })
  }))

  return router
}

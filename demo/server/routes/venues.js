// Typeahead venue search, ranked by text match blended with this user's match %.
import { Router } from 'express'
import { asyncHandler } from '../errors.js'

export function venueRoutes({ recommendations }) {
  const router = Router()

  // Echoes q so the client can drop stale responses.
  router.get('/api/venues/search', asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '')
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 8, 1), 20)
    res.json({ q, results: await recommendations.search(req.user, q, limit) })
  }))

  return router
}

// Typeahead venue search, ranked by text match blended with this user's match %, and
// the explanation of why a venue's match changed since your last visit.
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

  // CSD-52: why your match with a venue changed since your last visit ({ explanation: null } if it didn't).
  router.get('/api/venues/:venueId/change-explanation', asyncHandler(async (req, res) => {
    res.json({ explanation: await recommendations.explainChange(req.user, req.params.venueId) })
  }))

  return router
}

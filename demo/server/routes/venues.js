// Typeahead venue search, ranked by text match blended with this user's match %, and
// the explanation of why a venue's match changed since your last visit.
import { Router } from 'express'
import { asyncHandler } from '../errors.js'
import { monthOf, reopenedOf } from './demoMonths.js'
import { locationOf } from './location.js'

export function venueRoutes({ recommendations, months }) {
  const router = Router()

  // Echoes q so the client can drop stale responses. Match % counts the walk from X-Location.
  router.get('/api/venues/search', asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '')
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 8, 1), 20)
    const demo = { month: monthOf(req, months), reopened: reopenedOf(req) } // the demo's Month switch
    res.json({ q, results: await recommendations.search(req.user, q, limit, locationOf(req), demo) })
  }))

  // CSD-52: why your match with a venue changed since your last visit ({ explanation: null } if it didn't).
  router.get('/api/venues/:venueId/change-explanation', asyncHandler(async (req, res) => {
    res.json({ explanation: await recommendations.explainChange(req.user, req.params.venueId) })
  }))

  return router
}

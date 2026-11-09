// Other people's reviews: a venue's, a reviewer's profile, and your kakis' recent eats.
// Not under /api/kakis: the web proxy sends that prefix to account-service.
import { Router } from 'express'
import { asyncHandler } from '../errors.js'

export function communityRoutes({ community }) {
  const router = Router()

  router.get('/api/venues/:venueId/reviews', asyncHandler(async (req, res) => {
    res.json(await community.venueReviews(req.user, req.params.venueId))
  }))

  router.get('/api/reviewers/:id', asyncHandler(async (req, res) => {
    res.json(await community.reviewer(req.user, req.params.id))
  }))

  router.get('/api/recent-eats', asyncHandler(async (req, res) => {
    res.json(await community.recentEats(req.user))
  }))

  return router
}

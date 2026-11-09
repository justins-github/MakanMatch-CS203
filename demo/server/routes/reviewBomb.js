// Admins' review bomb for the Week 13 demo (services/reviewBombService.js): where it
// stands, drop it ({ venueId }, Turk's Kebab when none), take it back.
import { Router } from 'express'
import { asyncHandler } from '../errors.js'

export function reviewBombRoutes({ reviewBomb }) {
  const router = Router()

  router.get('/api/demo/review-bomb', asyncHandler(async (req, res) => {
    res.json(await reviewBomb.status(req.user))
  }))

  router.post('/api/demo/review-bomb', asyncHandler(async (req, res) => {
    res.json(await reviewBomb.drop(req.user, { venueId: req.body?.venueId ?? undefined }))
  }))

  router.delete('/api/demo/review-bomb', asyncHandler(async (req, res) => {
    res.json(await reviewBomb.undo(req.user))
  }))

  return router
}

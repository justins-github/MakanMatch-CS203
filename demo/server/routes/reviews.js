// The review flow: a venue's dishes, your rankings, posting reviews, resetting.
// Adding dishes and reporting prices go to catalog-service, not here.
import { Router } from 'express'
import { asyncHandler, badRequest } from '../errors.js'

export function reviewRoutes({ reviews }) {
  const router = Router()

  router.get('/api/dishes', asyncHandler(async (req, res) => {
    const venueId = String(req.query.venueId ?? '')
    if (!venueId) throw badRequest('venueId is required')
    res.json(await reviews.venueDishes(req.user, venueId))
  }))

  // The user's personal ranked list, best first.
  router.get('/api/rankings', asyncHandler(async (req, res) => {
    res.json(await reviews.rankings(req.user))
  }))

  // Beli-style review: sentiment + duels + text + rank insertion.
  router.post('/api/reviews/beli', asyncHandler(async (req, res) => {
    res.json(await reviews.submitBeli(req.user, req.body))
  }))

  // Undo the Taste DNA change from the review just posted: { dishId, at }.
  router.post('/api/reviews/undo', asyncHandler(async (req, res) => {
    res.json(await reviews.undoLatest(req.user, req.body))
  }))

  // Star-rating review (the app uses /api/reviews/beli).
  router.post('/api/reviews', asyncHandler(async (req, res) => {
    res.json(await reviews.submitRating(req.user, req.body))
  }))

  // Resets only the caller's own Taste DNA, reviews and rankings.
  router.post('/api/reset', asyncHandler(async (req, res) => {
    await reviews.reset(req.user)
    res.json({ ok: true })
  }))

  return router
}

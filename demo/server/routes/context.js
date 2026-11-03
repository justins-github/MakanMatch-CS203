// Public routes: liveness and the live weather context shown on the landing screen.
import { Router } from 'express'
import { asyncHandler } from '../errors.js'
import { withRainOverride } from '../weather.js'
import { locationOf } from './location.js'

export function contextRoutes({ getContext }) {
  const router = Router()

  router.get('/api/health', (_req, res) => res.json({ ok: true }))

  // The forecast where the user is (X-Location). ?rain=1 forces a (labelled) simulated rain context for demos.
  router.get('/api/context', asyncHandler(async (req, res) => {
    res.json(withRainOverride(await getContext(locationOf(req)), req.query.rain === '1'))
  }))

  return router
}

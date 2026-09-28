// The caller's Taste DNA and prediction accuracy.
import { Router } from 'express'
import { asyncHandler } from '../errors.js'

export function profileRoutes({ profiles }) {
  const router = Router()

  router.get('/api/profile', asyncHandler(async (req, res) => {
    res.json(await profiles.tasteDna(req.user))
  }))

  return router
}

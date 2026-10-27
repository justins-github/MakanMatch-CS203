// The caller's Taste DNA and prediction accuracy, and "Claude's take" on their trends.
import { Router } from 'express'
import { asyncHandler } from '../errors.js'

export function profileRoutes({ profiles }) {
  const router = Router()

  router.get('/api/profile', asyncHandler(async (req, res) => {
    res.json(await profiles.tasteDna(req.user))
  }))

  // The current suggestion (or null); the summary may come from Claude.
  router.get('/api/profile/suggestion', asyncHandler(async (req, res) => {
    res.json(await profiles.suggestion(req.user))
  }))

  // { signature } of the suggestion shown: accept leans the profile in, dismiss doesn't.
  router.post('/api/profile/suggestion/accept', asyncHandler(async (req, res) => {
    res.json(await profiles.acceptSuggestion(req.user, req.body))
  }))

  router.post('/api/profile/suggestion/dismiss', asyncHandler(async (req, res) => {
    res.json(await profiles.dismissSuggestion(req.user, req.body))
  }))

  return router
}

// For You: top-10 walkable matches, or one experimental Surprise pick.
import { Router } from 'express'
import { asyncHandler } from '../errors.js'
import { withRainOverride } from '../weather.js'

export const MOODS = ['none', 'soupy', 'spicy', 'light']

export function recommendationRoutes({ recommendations, getContext }) {
  const router = Router()

  router.get('/api/recommendations', asyncHandler(async (req, res) => {
    const mode = req.query.mode === 'surprise' ? 'surprise' : 'find'
    const mood = MOODS.includes(req.query.mood) ? req.query.mood : 'none'
    const exclude = String(req.query.exclude ?? '').split(',').filter(Boolean)
    const context = withRainOverride(await getContext(), req.query.rain === '1')
    res.json(await recommendations.recommend(req.user, { mode, mood, context, exclude }))
  }))

  return router
}

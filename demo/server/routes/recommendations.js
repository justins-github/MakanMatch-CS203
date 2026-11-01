// For You: top-10 walkable matches, or one experimental Surprise pick - for the
// caller alone, or with kakis (?with=id,id).
import { Router } from 'express'
import { asyncHandler, badRequest } from '../errors.js'
import { withRainOverride } from '../weather.js'

const MOODS = ['none', 'soupy', 'spicy', 'light']
const MAX_KAKIS = 9 // ten at the table, counting you
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The kakis' ids, without duplicates or the caller.
function kakiIds(param, selfId) {
  const ids = [...new Set(String(param ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
    .filter((id) => id !== selfId)
  if (ids.some((id) => !UUID.test(id))) throw badRequest('with must be a list of user ids')
  if (ids.length > MAX_KAKIS) throw badRequest(`You can eat with at most ${MAX_KAKIS} kakis at once`)
  return ids
}

export function recommendationRoutes({ recommendations, getContext }) {
  const router = Router()

  router.get('/api/recommendations', asyncHandler(async (req, res) => {
    const mode = req.query.mode === 'surprise' ? 'surprise' : 'find'
    const mood = MOODS.includes(req.query.mood) ? req.query.mood : 'none'
    const exclude = String(req.query.exclude ?? '').split(',').filter(Boolean)
    const withIds = kakiIds(req.query.with, req.user.id)
    const context = withRainOverride(await getContext(), req.query.rain === '1')
    res.json(await recommendations.recommend(req.user, { mode, mood, context, exclude, withIds }))
  }))

  return router
}

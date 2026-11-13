// Public: wakes the services the engine calls. Vercel stops a service about 30 s
// after its last request (measured on the live site) and starting one again takes
// about 13 s, so the web app calls this when it opens and while it stays on screen
// (src/keepWarm.js). Reaching this route wakes the engine too.
// `context` is null when the engine reads the weather itself (no CONTEXT_SERVICE_URL).
import { Router } from 'express'
import { asyncHandler } from '../errors.js'

export function warmRoutes({ accounts, catalog, context = null }) {
  const router = Router()

  router.get('/api/warm', asyncHandler(async (_req, res) => {
    const [account, catalogAwake, contextAwake] = await Promise.all([accounts.ping(), catalog.ping(), context?.ping()])
    res.json({ account, catalog: catalogAwake, ...(context ? { context: contextAwake } : {}) })
  }))

  return router
}

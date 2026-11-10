// Public: wakes the two services the engine calls. Vercel stops a service that has had
// no requests for a while (30 s on a preview deployment, 5 min in production) and
// starting one again takes about 13 s, so the web app calls this when it opens and
// while it stays on screen (src/keepWarm.js). Reaching this route wakes the engine too.
import { Router } from 'express'
import { asyncHandler } from '../errors.js'

export function warmRoutes({ accounts, catalog }) {
  const router = Router()

  router.get('/api/warm', asyncHandler(async (_req, res) => {
    const [account, catalogAwake] = await Promise.all([accounts.ping(), catalog.ping()])
    res.json({ account, catalog: catalogAwake })
  }))

  return router
}

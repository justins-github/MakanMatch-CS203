// The demo's Month switch (admins' Demo controls): which month of the venue registry a
// request wants, the places the diner says are still open, and what changed that month.
// Like ?rain=1 it travels with each request, so only the asker's own view changes.
import { Router } from 'express'
import { asyncHandler, badRequest, notFound } from '../errors.js'
import { locationOf, walkLimitOf } from './location.js'

const MAX_REOPENED = 20

// ?month=YYYY-MM; undefined when the request doesn't name one (the base month).
export function monthOf(req, months) {
  const month = req.query.month
  if (month === undefined) return undefined
  if (!months.has(String(month))) {
    throw badRequest(`month must be one of: ${months.list.map((m) => m.month).join(', ')}`)
  }
  return String(month)
}

// ?reopen=id,id: gone places this diner says are still open.
export function reopenedOf(req) {
  const ids = [...new Set(String(req.query.reopen ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
  if (ids.length > MAX_REOPENED) throw badRequest(`reopen takes at most ${MAX_REOPENED} places`)
  return ids
}

export function demoMonthRoutes({ recommendations, months }) {
  const router = Router()

  router.get('/api/demo/months', (_req, res) => {
    res.json({ months: months.list })
  })

  // What left and what arrived that month, for the caller: their own places first, then
  // near where they are (X-Location, ?walk=).
  router.get('/api/demo/months/:month/changes', asyncHandler(async (req, res) => {
    const month = monthOf({ query: { month: req.params.month } }, months)
    const changes = await recommendations.monthChanges(req.user, {
      month, from: locationOf(req), walkMin: walkLimitOf(req), reopened: reopenedOf(req),
    })
    if (!changes) throw notFound(`${months.list[0].label} is where we start, so nothing has changed`)
    res.json(changes)
  }))

  return router
}

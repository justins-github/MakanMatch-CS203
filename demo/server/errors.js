// HTTP-aware errors for services to throw, and the Express plumbing that turns
// them into `{ error }` responses. Services stay free of req/res.

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const badRequest = (message) => new HttpError(400, message)
export const unauthorized = (message) => new HttpError(401, message)
export const forbidden = (message) => new HttpError(403, message)
export const notFound = (message) => new HttpError(404, message)
export const unavailable = (message) => new HttpError(503, message)

// Express 4 doesn't catch rejected promises from async handlers; this does.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our side' })
}

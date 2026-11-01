// One fetch wrapper for all three backends. They share this page's origin (the
// Vite proxy in dev, rewrites in production), so the refresh cookie just works.
// - adds the access token (kept in memory only, never in localStorage)
// - adds the admin's act-as choice (the server decides if it applies)
// - on a 401, refreshes the session once and retries; if that fails, signs out

let accessToken = null
let actAs = null
let hooks = { refresh: null, onSignedOut: null }
let refreshing = null

export function setAccessToken(token) {
  accessToken = token
}

export function setActAsHeader(role) {
  actAs = role
}

// refresh: () => Promise<boolean>; onSignedOut: () => void
export function configureHttp(next) {
  hooks = next
}

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message)
    this.status = status
    this.fields = fields ?? null
  }
}

// body: a plain object (sent as JSON) or FormData (a file upload; the browser sets the type).
export async function request(path, { method = 'GET', body, signal, headers = {}, auth = true, retried = false } = {}) {
  const isForm = body instanceof FormData
  const sent = { ...headers }
  if (body !== undefined && !isForm) sent['content-type'] = 'application/json'
  if (auth && accessToken) sent.authorization = `Bearer ${accessToken}`
  if (auth && actAs) sent['x-act-as'] = actAs

  const res = await fetch(path, {
    method,
    headers: sent,
    body: body === undefined || isForm ? body : JSON.stringify(body),
    signal,
    credentials: 'same-origin',
  })

  if (res.status === 401 && auth && !retried && hooks.refresh) {
    if (await refreshOnce()) return request(path, { method, body, signal, headers, auth, retried: true })
    hooks.onSignedOut?.()
  }
  return parse(res)
}

// Concurrent 401s share one refresh (refresh tokens are single-use).
function refreshOnce() {
  refreshing ??= hooks.refresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function parse(res) {
  if (res.status === 204) return null
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) throw new ApiError(res.status, messageFrom(data, res.status), data?.errors)
  return data
}

// Express sends { error }; Spring sends RFC 9457 problems { detail, errors }.
function messageFrom(data, status) {
  if (data?.errors && typeof data.errors === 'object') {
    const [field, problem] = Object.entries(data.errors)[0] ?? []
    if (field) return `${humanize(field)} ${problem}`
  }
  return data?.error ?? data?.detail ?? `Request failed (${status})`
}

const humanize = (field) => field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

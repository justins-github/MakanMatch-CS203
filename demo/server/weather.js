// Live context: data.gov.sg two-hour forecast for the area nearest the user,
// cached 5 min, with an offline fallback.
import { SMU, nearestArea } from './geo.js'

const FORECAST_URL = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast'
const CACHE_MS = 5 * 60 * 1000
const RAIN_RE = /rain|showers|thundery/i

let cache = null // { forecasts: Map(area -> forecast text) | null, at }

// Every area's forecast; null when data.gov.sg can't be reached or answers oddly.
async function forecastsByArea() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.forecasts
  let forecasts = null
  try {
    const res = await fetch(FORECAST_URL, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    const items = body?.data?.items?.[0]?.forecasts
    if (!Array.isArray(items)) throw new Error('unexpected response shape')
    forecasts = new Map(items.map((f) => [f.area, f.forecast]))
  } catch {
    forecasts = null
  }
  cache = { forecasts, at: Date.now() }
  return forecasts
}

// The rain context at `from`, given every area's forecast (null = unavailable).
export function contextFor(forecasts, from) {
  const area = nearestArea(from)
  const forecast = forecasts?.get(area)
  if (!forecast) {
    return {
      raining: true,
      area,
      summary: `Light rain over ${area} (offline fallback data)`,
      source: 'fallback',
    }
  }
  const raining = RAIN_RE.test(forecast)
  return {
    raining,
    area,
    forecast,
    summary: raining ? `${forecast} over ${area} (next 2h)` : `No rain expected over ${area} (next 2h)`,
    source: 'live',
  }
}

// Current rain context where the user is (SMU when we don't know).
export async function getContext(from = SMU) {
  const forecasts = await forecastsByArea()
  return { ...contextFor(forecasts, from), fetchedAt: new Date(cache.at).toISOString() }
}

// When context-service runs (CONTEXT_SERVICE_URL is set, as it is on Vercel), it
// answers first: it owns the NEA forecast and the rain categories. The lookup
// above stays as the fallback, so a slow or still-starting context-service never
// holds the page up for more than CONTEXT_TIMEOUT_MS.
const CONTEXT_TIMEOUT_MS = 3000
const SKIP_AFTER_FAILURE_MS = 15_000

// context-service's WeatherContext in the engine's shape; null when it has no forecast.
export function contextFromService(body) {
  if (body?.status !== 'available' || !body.area || !body.forecastText) return null
  const raining = body.rainCategory !== 'NONE'
  return {
    raining,
    area: body.area,
    forecast: body.forecastText,
    summary: raining
      ? `${body.forecastText} over ${body.area} (next 2h)`
      : `No rain expected over ${body.area} (next 2h)`,
    source: 'live',
    via: 'context-service',
    rainCategory: body.rainCategory,
  }
}

// getContext(from), asking context-service first when its URL is set. After a
// failure it goes straight to the fallback for a while instead of waiting again.
export function createContextSource({ contextServiceUrl = null, fetchImpl = fetch, now = Date.now, fallback = getContext } = {}) {
  if (!contextServiceUrl) return fallback
  let skipUntil = 0
  return async (from = SMU) => {
    if (now() >= skipUntil) {
      try {
        const url = `${contextServiceUrl}/api/context/weather?lat=${from.lat}&lng=${from.lon}`
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(CONTEXT_TIMEOUT_MS) })
        const context = res.ok ? contextFromService(await res.json()) : null
        if (context) return { ...context, fetchedAt: new Date(now()).toISOString() }
      } catch {
        skipUntil = now() + SKIP_AFTER_FAILURE_MS
      }
    }
    return fallback(from)
  }
}

// Is context-service awake? Any answer counts (this one is a 400: no coordinates, so
// no forecast is fetched); asking wakes it. A stopped context-service takes longer to
// start than CONTEXT_TIMEOUT_MS, so without this (routes/warm.js) the first weather
// lookup after a pause always waits the full timeout and then uses the fallback.
// Null when the engine reads the weather itself.
const COLD_START_WAIT_MS = 25_000

export function createContextPing({ contextServiceUrl = null, fetchImpl = fetch, timeoutMs = COLD_START_WAIT_MS } = {}) {
  if (!contextServiceUrl) return null
  return async () => {
    try {
      await fetchImpl(`${contextServiceUrl}/api/context/weather`, { signal: AbortSignal.timeout(timeoutMs) })
      return true
    } catch {
      return false
    }
  }
}

// The demo's "simulate rain" toggle: a clearly labelled override, never mistaken for live data.
export function withRainOverride(context, simulateRain) {
  if (!simulateRain) return context
  return {
    ...context,
    raining: true,
    summary: 'Simulated rain (demo toggle)',
    simulated: true,
  }
}

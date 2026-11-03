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

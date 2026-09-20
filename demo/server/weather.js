// Live context: data.gov.sg two-hour forecast, cached 5 min, with an offline fallback.

const FORECAST_URL = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast'
const WATCHED_AREAS = ['Bedok', 'City'] // "City" is the forecast area covering Selegie
const CACHE_MS = 5 * 60 * 1000
const RAIN_RE = /rain|showers|thundery/i

const FALLBACK = {
  raining: true,
  areaForecasts: { Bedok: 'Light Rain', City: 'Cloudy' },
  summary: 'Light rain over Bedok (offline fallback data)',
  source: 'fallback',
}

let cache = null // { value, at }

// Current rain context for the watched areas.
export async function getContext() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value

  let value
  try {
    const res = await fetch(FORECAST_URL, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    const forecasts = body?.data?.items?.[0]?.forecasts
    if (!Array.isArray(forecasts)) throw new Error('unexpected response shape')

    const areaForecasts = {}
    for (const area of WATCHED_AREAS) {
      const hit = forecasts.find((f) => f.area === area)
      if (hit) areaForecasts[area] = hit.forecast
    }
    if (Object.keys(areaForecasts).length === 0) throw new Error('watched areas missing')

    const rainingAreas = Object.entries(areaForecasts).filter(([, f]) => RAIN_RE.test(f))
    value = {
      raining: rainingAreas.length > 0,
      areaForecasts,
      summary:
        rainingAreas.length > 0
          ? `${rainingAreas.map(([a, f]) => `${f} over ${a}`).join(', ')} (next 2h)`
          : `No rain expected near you (next 2h)`,
      source: 'live',
    }
  } catch {
    value = { ...FALLBACK }
  }

  value.fetchedAt = new Date().toISOString()
  cache = { value, at: Date.now() }
  return value
}

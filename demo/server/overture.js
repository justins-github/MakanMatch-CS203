// Which Overture Maps rows the venue registry keeps. Shared by the extract
// (scripts/extract-overture.mjs) and the month comparison (months.js), so a place is
// "listed" by the same rules in both.

export const MIN_CONFIDENCE = 0.5
export const DEDUP_METERS = 100

// A name's form for same-place comparisons: no case, accents or punctuation.
export const normName = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

// Flat-earth distance in metres; fine at Singapore's scale.
export const metersBetween = (a, b) => {
  const dLat = (a.lat - b.lat) * 111_320
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

// A food-and-drink place we are confident exists and that isn't marked closed.
export const isListed = (row) =>
  Boolean(row.isFood) && row.confidence >= MIN_CONFIDENCE && (row.status == null || row.status === 'open')

// Same normalized name within DEDUP_METERS is one place: keep the highest confidence.
// Rows whose name normalizes to nothing are dropped.
export function dedupe(rows) {
  const byName = new Map()
  for (const row of rows) {
    const key = normName(row.name)
    if (!key) continue
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key).push(row)
  }
  const kept = []
  for (const group of byName.values()) {
    const survivors = []
    for (const row of [...group].sort((a, b) => b.confidence - a.confidence)) {
      if (!survivors.some((s) => metersBetween(s, row) <= DEDUP_METERS)) survivors.push(row)
    }
    kept.push(...survivors)
  }
  return kept
}

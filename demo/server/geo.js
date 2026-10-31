// Location helpers; the demo pins the user at SMU.

export const SMU = { lat: 1.2966, lon: 103.85 }

// Recommendations must be walkable from SMU.
export const MAX_WALK_MIN = 20

const WALK_METERS_PER_MIN = 80

// Great-circle distance in km.
export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// Walk minutes from SMU at 80 m/min.
export function walkMinutesFromSmu(lat, lon) {
  return Math.max(1, Math.round((haversineKm(SMU, { lat, lon }) * 1000) / WALK_METERS_PER_MIN))
}

export async function getContext(simRain = false) {
  const res = await fetch(`/api/context${simRain ? '?rain=1' : ''}`)
  if (!res.ok) throw new Error(`context request failed (${res.status})`)
  return res.json()
}

export async function getRecommendations(mode, mood = 'none', simRain = false, exclude = []) {
  const params = new URLSearchParams({ mode, mood })
  if (simRain) params.set('rain', '1')
  if (exclude.length) params.set('exclude', exclude.join(','))
  const res = await fetch(`/api/recommendations?${params}`)
  if (!res.ok) throw new Error(`recommendations request failed (${res.status})`)
  return res.json()
}

// Typeahead search; pass an AbortSignal to cancel superseded requests.
export async function searchVenues(q, { limit = 8, signal } = {}) {
  const params = new URLSearchParams({ q, limit })
  const res = await fetch(`/api/venues/search?${params}`, { signal })
  if (!res.ok) throw new Error(`search request failed (${res.status})`)
  return res.json()
}

export async function getProfile() {
  const res = await fetch('/api/profile')
  if (!res.ok) throw new Error(`profile request failed (${res.status})`)
  return res.json()
}

export async function getDishes() {
  const res = await fetch('/api/dishes')
  if (!res.ok) throw new Error(`dishes request failed (${res.status})`)
  return res.json()
}

export async function getRankings() {
  const res = await fetch('/api/rankings')
  if (!res.ok) throw new Error(`rankings request failed (${res.status})`)
  return res.json()
}

export async function postDish(venueId, name, price) {
  const res = await fetch('/api/dishes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ venueId, name, price }),
  })
  if (!res.ok) throw new Error(`add dish failed (${res.status})`)
  return res.json()
}

export async function postBeliReview(dishId, sentiment, insertIndex, duels, text) {
  const res = await fetch('/api/reviews/beli', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dishId, sentiment, insertIndex, duels, text }),
  })
  if (!res.ok) throw new Error(`review failed (${res.status})`)
  return res.json()
}

export async function postReset() {
  const res = await fetch('/api/reset', { method: 'POST' })
  if (!res.ok) throw new Error(`reset request failed (${res.status})`)
  return res.json()
}

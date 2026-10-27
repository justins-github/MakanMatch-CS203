// The recommendation engine (Express): feed, search, reviews, Taste DNA.
import { request } from './http.js'

export const getContext = (simRain = false) => request(`/api/context${simRain ? '?rain=1' : ''}`, { auth: false })

// withIds: kakis eating with you (group mode); empty for just you.
export function getRecommendations(mode, mood = 'none', simRain = false, exclude = [], withIds = []) {
  const params = new URLSearchParams({ mode, mood })
  if (simRain) params.set('rain', '1')
  if (exclude.length) params.set('exclude', exclude.join(','))
  if (withIds.length) params.set('with', withIds.join(','))
  return request(`/api/recommendations?${params}`)
}

// Typeahead search; pass an AbortSignal to cancel superseded requests.
export function searchVenues(q, { limit = 8, signal } = {}) {
  const params = new URLSearchParams({ q, limit })
  return request(`/api/venues/search?${params}`, { signal })
}

export const getProfile = () => request('/api/profile')

// A venue's dishes with the AI's prediction for you (adding dishes goes to the catalog).
export const getVenueDishes = (venueId) => request(`/api/dishes?venueId=${encodeURIComponent(venueId)}`)

export const getRankings = () => request('/api/rankings')

export const postBeliReview = (dishId, sentiment, insertIndex, duels, text) =>
  request('/api/reviews/beli', { method: 'POST', body: { dishId, sentiment, insertIndex, duels, text } })

// Forgets everything you taught the AI (only yours).
export const postReset = () => request('/api/reset', { method: 'POST' })

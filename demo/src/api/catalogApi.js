// catalog-service: venues, owner status reports, menus and prices.
import { request } from './http.js'

const id = encodeURIComponent

export const searchCatalogVenues = (q, { signal } = {}) =>
  request(`/api/catalog/venues?q=${id(q)}&limit=8`, { signal })
export const getVenue = (venueId) => request(`/api/catalog/venues/${id(venueId)}`)
export const getVenueUpdates = (venueId) => request(`/api/catalog/venues/${id(venueId)}/updates`)
export const reportVenueStatus = (venueId, report) =>
  request(`/api/catalog/venues/${id(venueId)}/updates`, { method: 'POST', body: report })

// Weekly hours: { week: [{ day: 'MONDAY', sessions: [{ opens: '11:00', closes: '14:30' }] }], updatedAt };
// an empty week means the owner hasn't set any. Saving replaces the whole week.
export const getHours = (venueId) => request(`/api/catalog/venues/${id(venueId)}/hours`)
export const setHours = (venueId, week) =>
  request(`/api/catalog/venues/${id(venueId)}/hours`, { method: 'PUT', body: { week } })

export const getMenu = (venueId) => request(`/api/catalog/venues/${id(venueId)}/dishes`)
// price is optional; as an owner it's the official price, otherwise what you paid.
export const addDish = (venueId, name, price) =>
  request(`/api/catalog/venues/${id(venueId)}/dishes`, { method: 'POST', body: { name, price: price ?? null } })
// Owner price-list edit, all or nothing: { prices: [{ dishId, price }], added: [{ name, price }], removed: [dishId] }.
// Returns the updated menu.
export const editMenu = (venueId, changes) =>
  request(`/api/catalog/venues/${id(venueId)}/dishes`, { method: 'PATCH', body: changes })
// Owner menu photo -> { sample, dishes: [{ name, price, dishId }] } to review; nothing is saved.
export function scanMenu(venueId, photo) {
  const form = new FormData()
  form.append('photo', photo, photo.name ?? 'menu.jpg')
  return request(`/api/catalog/venues/${id(venueId)}/menu-scans`, { method: 'POST', body: form })
}
export const updateDish = (dishId, changes) => request(`/api/catalog/dishes/${id(dishId)}`, { method: 'PATCH', body: changes })
export const reportPrice = (dishId, price) =>
  request(`/api/catalog/dishes/${id(dishId)}/prices`, { method: 'POST', body: { price } })
export const getPriceHistory = (dishId) => request(`/api/catalog/dishes/${id(dishId)}/prices`)

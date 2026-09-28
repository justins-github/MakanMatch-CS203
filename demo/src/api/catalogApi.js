// catalog-service: venues, owner status reports, menus and prices.
import { request } from './http.js'

const id = encodeURIComponent

export const searchCatalogVenues = (q, { signal } = {}) =>
  request(`/api/catalog/venues?q=${id(q)}&limit=8`, { signal })
export const getVenue = (venueId) => request(`/api/catalog/venues/${id(venueId)}`)
export const getVenueUpdates = (venueId) => request(`/api/catalog/venues/${id(venueId)}/updates`)
export const reportVenueStatus = (venueId, report) =>
  request(`/api/catalog/venues/${id(venueId)}/updates`, { method: 'POST', body: report })

export const getMenu = (venueId) => request(`/api/catalog/venues/${id(venueId)}/dishes`)
// price is optional; as an owner it's the official price, otherwise what you paid.
export const addDish = (venueId, name, price) =>
  request(`/api/catalog/venues/${id(venueId)}/dishes`, { method: 'POST', body: { name, price: price ?? null } })
export const updateDish = (dishId, changes) => request(`/api/catalog/dishes/${id(dishId)}`, { method: 'PATCH', body: changes })
export const reportPrice = (dishId, price) =>
  request(`/api/catalog/dishes/${id(dishId)}/prices`, { method: 'POST', body: { price } })
export const getPriceHistory = (dishId) => request(`/api/catalog/dishes/${id(dishId)}/prices`)

// account-service: sign-in, profile, venue claims, owner venues, admin.
import { request } from './http.js'

// Cookie-authenticated calls must carry this header (anti-forgery check).
const COOKIE_CALL = { 'x-requested-with': 'makanmatch' }
const post = (path, body) => request(path, { method: 'POST', body })

export const signup = (email, password, displayName) =>
  request('/api/auth/signup', { method: 'POST', body: { email, password, displayName }, auth: false })
export const login = (identifier, password) =>
  request('/api/auth/login', { method: 'POST', body: { identifier, password }, auth: false })
export const refreshSession = () =>
  request('/api/auth/refresh', { method: 'POST', headers: COOKIE_CALL, auth: false })
export const logout = () => request('/api/auth/logout', { method: 'POST', headers: COOKIE_CALL, auth: false })

export const getMe = () => request('/api/me')
export const updateMe = (changes) => request('/api/me', { method: 'PATCH', body: changes })
export const changePassword = (currentPassword, newPassword) =>
  request('/api/me/password', { method: 'PUT', body: { currentPassword, newPassword } })

export const claimVenue = (venueId, venueName, proof) => post('/api/claims', { venueId, venueName, proof })
export const myClaims = () => request('/api/claims/mine')
export const withdrawClaim = (claimId) => post(`/api/claims/${claimId}/withdraw`)

export const myVenues = () => request('/api/owner/venues')

export const listClaims = (status = 'PENDING') => request(`/api/admin/claims?status=${status}`)
export const approveClaim = (claimId) => post(`/api/admin/claims/${claimId}/approve`)
export const rejectClaim = (claimId, reason) => post(`/api/admin/claims/${claimId}/reject`, { reason })

export const listUsers = (q = '') => request(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`)
export const updateUser = (userId, changes) => request(`/api/admin/users/${userId}`, { method: 'PATCH', body: changes })
export const revokeOwnership = (userId, venueId) =>
  request(`/api/admin/users/${userId}/venues/${encodeURIComponent(venueId)}`, { method: 'DELETE' })

// account-service: sign-in, profile, kakis, venue claims, owner venues, admin.
import { request } from './http.js'

// Cookie-authenticated calls must carry this header (anti-forgery check).
const COOKIE_CALL = { 'x-requested-with': 'makanmatch' }
const post = (path, body) => request(path, { method: 'POST', body })

export const signup = (email, password, displayName, dietary) =>
  request('/api/auth/signup', { method: 'POST', body: { email, password, displayName, dietary }, auth: false })
export const login = (identifier, password) =>
  request('/api/auth/login', { method: 'POST', body: { identifier, password }, auth: false })
export const refreshSession = () =>
  request('/api/auth/refresh', { method: 'POST', headers: COOKIE_CALL, auth: false })
export const logout = () => request('/api/auth/logout', { method: 'POST', headers: COOKIE_CALL, auth: false })

export const getMe = () => request('/api/me')
export const updateMe = (changes) => request('/api/me', { method: 'PATCH', body: changes })
export const changePassword = (currentPassword, newPassword) =>
  request('/api/me/password', { method: 'PUT', body: { currentPassword, newPassword } })
// Deleting an account: check first (nothing is gone yet), delete last (see DeleteAccount.jsx).
export const checkDeleteAccount = (password) => post('/api/me/delete-check', { password })
export const deleteAccount = (password) => post('/api/me/delete', { password })

// Kakis: each call that changes something answers with the whole updated list.
export const getKakis = () => request('/api/kakis')
export const requestKaki = (username) => post('/api/kakis/requests', { username })
export const acceptKaki = (userId) => post(`/api/kakis/requests/${userId}/accept`)
export const removeKaki = (userId) => request(`/api/kakis/${userId}`, { method: 'DELETE' })
export const getGroups = () => request('/api/kakis/groups')
export const createGroup = (name, memberIds) => post('/api/kakis/groups', { name, memberIds })
export const updateGroup = (groupId, name, memberIds) =>
  request(`/api/kakis/groups/${groupId}`, { method: 'PUT', body: { name, memberIds } })
export const deleteGroup = (groupId) => request(`/api/kakis/groups/${groupId}`, { method: 'DELETE' })

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

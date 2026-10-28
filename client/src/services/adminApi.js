import { request } from './eventsApi'

// FR-019: admin moderation
export function fetchAdminEvents(token, status = '') {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return request(`/api/admin/events${qs}`, { token })
}

export function moderateEvent(eventId, action, token, reason) {
  return request(`/api/admin/events/${encodeURIComponent(eventId)}/${action}`, {
    method: 'POST',
    token,
    body: reason ? { reason } : {},
  })
}

export function fetchUsers(token) {
  return request('/api/admin/users', { token })
}

export function setUserActive(userId, active, token) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}/${active ? 'reactivate' : 'deactivate'}`, {
    method: 'POST',
    token,
  })
}

import { request } from './eventsApi'

/**
 * Booking engine endpoints from SRS FR-008 and FR-010 (Booking module).
 * A 404 means the booking service is not deployed on this server yet.
 */
export function holdSeats({ eventId, tierId, quantity }, token) {
  return request('/api/bookings/hold', { method: 'POST', token, body: { eventId, tierId, quantity } })
}

export function confirmBooking(holdId, token) {
  return request('/api/bookings/confirm', { method: 'POST', token, body: { holdId } })
}

export function joinWaitlist({ eventId, tierId, quantity }, token) {
  return request('/api/bookings/waitlist', {
    method: 'POST',
    token,
    body: { eventId, tierId, quantity },
  })
}

export function fetchNotifications(token) {
  return request('/api/bookings/notifications', { token })
}

export function acceptWaitlistClaim(claimId, token) {
  return request(`/api/bookings/claims/${encodeURIComponent(claimId)}/accept`, {
    method: 'POST',
    token,
    body: {},
  })
}

export function declineWaitlistClaim(claimId, token) {
  return request(`/api/bookings/claims/${encodeURIComponent(claimId)}/decline`, {
    method: 'POST',
    token,
    body: {},
  })
}

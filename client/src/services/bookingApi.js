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

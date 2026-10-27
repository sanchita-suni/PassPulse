const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

/**
 * Fetch the authenticated attendee's digital pass for a ticket.
 */
export async function fetchAttendeePass({ ticketId, token, userId }) {
  if (!ticketId) {
    throw new Error('Ticket ID is required');
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (userId) {
    headers['x-user-id'] = userId;
  }

  const response = await fetch(`${API_BASE_URL}/api/qr/pass/${encodeURIComponent(ticketId)}`, {
    method: 'GET',
    headers,
  });

  const body = await response.json();

  if (!response.ok) {
    const error = new Error(body.message || 'Failed to retrieve digital pass');
    error.code = body.code || 'PASS_FETCH_ERROR';
    error.status = response.status;
    throw error;
  }

  return body.data;
}

/**
 * Fetch all tickets belonging to the current attendee.
 */
export async function fetchAttendeeTickets({ token, userId }) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (userId) {
    headers['x-user-id'] = userId;
  }

  const response = await fetch(`${API_BASE_URL}/api/qr/tickets`, {
    method: 'GET',
    headers,
  });

  const body = await response.json();

  if (!response.ok) {
    const error = new Error(body.message || 'Failed to fetch tickets');
    error.code = body.code || 'TICKETS_FETCH_ERROR';
    error.status = response.status;
    throw error;
  }

  return body.data || [];
}

/**
 * Retrieve a signed JWT token for the specified user ID (for demo & testing).
 */
export async function fetchDemoToken(userId = 'USR-ATTENDEE-001') {
  const response = await fetch(
    `${API_BASE_URL}/api/qr/token?userId=${encodeURIComponent(userId)}`
  );

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.message || 'Failed to fetch demo token');
  }

  return body.data;
}

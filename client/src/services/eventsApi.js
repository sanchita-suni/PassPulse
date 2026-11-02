const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

/**
 * FR-004: search the public catalog. Empty filter values are dropped.
 */
export function searchEvents(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value).trim());
    }
  });
  const qs = params.toString();
  return request(`/api/events${qs ? `?${qs}` : ''}`);
}

export function fetchCategories() {
  return request('/api/events/categories');
}

export function fetchEvent(eventId) {
  return request(`/api/events/${encodeURIComponent(eventId)}`);
}

export { request };

// FR-005: organizer event management
export function fetchMyEvents(token) {
  return request('/api/events/mine', { token })
}

export function fetchManagedEvent(eventId, token) {
  return request(`/api/events/${encodeURIComponent(eventId)}/manage`, { token })
}

export function createEvent(event, token) {
  return request('/api/events', { method: 'POST', token, body: event })
}

export function updateEvent(eventId, changes, token) {
  return request(`/api/events/${encodeURIComponent(eventId)}`, { method: 'PUT', token, body: changes })
}

export function cancelEvent(eventId, token, { notifyHolders = false } = {}) {
  return request(`/api/events/${encodeURIComponent(eventId)}/cancel`, {
    method: 'POST',
    token,
    body: { notifyHolders },
  })
}

// FR-006: lifecycle transitions
export function changeEventStatus(eventId, status, token) {
  return request(`/api/events/${encodeURIComponent(eventId)}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  })
}

// FR-007: ticket tiers
export function addTier(eventId, tier, token) {
  return request(`/api/events/${encodeURIComponent(eventId)}/tiers`, { method: 'POST', token, body: tier })
}

export function updateTier(eventId, tierId, changes, token) {
  return request(`/api/events/${encodeURIComponent(eventId)}/tiers/${encodeURIComponent(tierId)}`, {
    method: 'PUT',
    token,
    body: changes,
  })
}

export function removeTier(eventId, tierId, token) {
  return request(`/api/events/${encodeURIComponent(eventId)}/tiers/${encodeURIComponent(tierId)}`, {
    method: 'DELETE',
    token,
  })
}

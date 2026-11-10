const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

/**
 * Fetch one-off telemetry snapshot for an event (FR-017).
 *
 * @param {string} eventId
 * @param {string} token
 * @returns {Promise<object>}
 */
export async function fetchTelemetrySnapshot(eventId, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/api/telemetry/${encodeURIComponent(eventId)}`, {
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Telemetry request failed (${response.status})`);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data.data;
}

/**
 * Subscribes to the live Server-Sent Events (SSE) telemetry stream for an event (FR-017, SAD ADR-04).
 * Uses fetch with ReadableStream to transmit JWT bearer token in Authorization headers,
 * avoiding leaking credentials in URLs.
 *
 * @param {string} eventId
 * @param {string} token
 * @param {object} callbacks - { onData, onError, onStatusChange }
 * @returns {function} Unsubscribe callback that halts the stream and releases resources.
 */
export function subscribeToTelemetry(eventId, token, { onData, onError, onStatusChange }) {
  let abortController = new AbortController();
  let isClosed = false;
  let reconnectTimer = null;

  const notifyStatus = (status) => {
    if (!isClosed && typeof onStatusChange === 'function') {
      onStatusChange(status);
    }
  };

  async function connect() {
    if (isClosed) return;
    notifyStatus('connecting');

    try {
      abortController = new AbortController();
      const response = await fetch(`${API_BASE_URL}/api/telemetry/${encodeURIComponent(eventId)}/stream`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err = new Error(errorData.message || `SSE stream failed (${response.status})`);
        err.status = response.status;
        err.code = errorData.code;
        throw err;
      }

      notifyStatus('connected');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!isClosed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Retain the trailing incomplete segment in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const rawJson = trimmed.slice(5).trim();
            if (rawJson) {
              try {
                const parsed = JSON.parse(rawJson);
                if (typeof onData === 'function' && !isClosed) {
                  onData(parsed);
                }
              } catch {
                // Ignore parse errors on malformed lines
              }
            }
          }
        }
      }

      if (!isClosed) {
        notifyStatus('disconnected');
        // Automatically attempt reconnection after 3 seconds
        reconnectTimer = setTimeout(connect, 3000);
      }
    } catch (err) {
      if (isClosed || err.name === 'AbortError') return;
      notifyStatus('error');
      if (typeof onError === 'function') {
        onError(err);
      }
      // Retry connection after 5 seconds
      reconnectTimer = setTimeout(connect, 5000);
    }
  }

  connect();

  return function unsubscribe() {
    isClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    abortController.abort();
    notifyStatus('disconnected');
  };
}

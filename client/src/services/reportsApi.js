/**
 * Reports API Service (FR-018)
 *
 * Downloads attendance and revenue reports in CSV or PDF format using
 * authenticated fetch with Bearer token, Blob handling, and Object URL revocation.
 */

/**
 * Downloads a report file from the backend and triggers a browser file save.
 *
 * @param {object} options
 * @param {string} options.eventId - The event ID
 * @param {'attendance' | 'revenue'} options.reportType - Report type
 * @param {'csv' | 'pdf'} options.format - File format
 * @param {string} options.token - JWT authentication token
 * @returns {Promise<void>}
 */
export async function downloadReport({ eventId, reportType, format, token }) {
  if (!eventId) throw new Error('eventId is required to download report');
  if (!token) throw new Error('Authentication token is required');

  const endpoint = `/api/reports/${encodeURIComponent(eventId)}/${encodeURIComponent(reportType)}?format=${encodeURIComponent(format)}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: format === 'pdf' ? 'application/pdf' : 'text/csv',
    },
  });

  if (!response.ok) {
    let errorMessage = `Failed to download ${reportType} report (HTTP ${response.status})`;
    try {
      const errorJson = await response.json();
      if (errorJson && errorJson.message) {
        errorMessage = errorJson.message;
      }
    } catch {
      // Body was not JSON; use default error message
    }
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  // Derive filename from header or fallback
  let filename = `${reportType}-report-${eventId}.${format}`;
  const disposition = response.headers.get('Content-Disposition');
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoke object URL to avoid memory leaks
  window.URL.revokeObjectURL(url);
}

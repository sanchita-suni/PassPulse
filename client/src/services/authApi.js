const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

/**
 * Authenticate against the backend using actual email and password credentials.
 * Endpoint: POST /api/auth/login (FR-001, FR-003, SEC-002)
 */
export async function loginUser({ email, password }) {
  if (!email || !password) {
    const error = new Error('Email and password are required.');
    error.status = 400;
    error.code = 'MISSING_CREDENTIALS';
    throw error;
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim(),
      password,
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    const error = new Error(body.message || 'Authentication failed.');
    error.status = response.status;
    error.code = body.code || 'LOGIN_FAILED';
    throw error;
  }

  return body.data; // { user: { id, fullName, email, role }, token }
}

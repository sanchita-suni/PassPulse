import { useState } from 'react'
import { loginUser } from '../services/authApi'

const AUTHORIZED_STAFF_ROLES = ['GATE_STAFF', 'STAFF', 'ADMIN']

function StaffLogin({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError({
        type: 'validation',
        message: 'Please provide both your staff email and password.',
      })
      return
    }

    setLoading(true)

    try {
      const data = await loginUser({ email: email.trim(), password })

      if (!data || !data.token) {
        throw new Error('No authentication token received from server.')
      }

      const role = data.user?.role?.toUpperCase()

      // Enforce staff role restriction (GATE_STAFF, STAFF, ADMIN allowed; ATTENDEE and ORGANIZER rejected)
      if (!AUTHORIZED_STAFF_ROLES.includes(role)) {
        setError({
          type: 'forbidden',
          status: 403,
          message: `Access Denied (HTTP 403 Forbidden): Signed in as ${data.user?.fullName || data.user?.name || data.user?.email} with role "${data.user?.role}". Gate scanner operation is strictly restricted to GATE_STAFF, STAFF, or ADMIN roles. Attendee and Organizer accounts cannot operate the gate scanner.`,
        })
        return
      }

      onLoginSuccess({
        user: data.user,
        token: data.token,
      })
    } catch (err) {
      setError({
        type: err.status === 401 ? 'unauthorized' : 'error',
        status: err.status || 500,
        message:
          err.status === 401
            ? 'Invalid email or password credentials (HTTP 401). Please check your staff account credentials and try again.'
            : err.message || 'Login failed. Please check your network connection.',
      })
    } finally {
      setLoading(false)
    }
  }

  function applyPresetEmail(presetEmail) {
    setEmail(presetEmail)
    setError(null)
  }

  return (
    <section className="scanner-card" style={{ maxWidth: '480px', margin: '20px auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '22px', margin: '0 0 6px 0' }}>Gate Staff Authentication</h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted, #9ca3af)' }}>
          Sign in with authorized gate staff credentials to operate the scanner (FR-013 / SEC-002).
        </p>
      </div>

      {error && (
        <div
          className="result error"
          style={{
            margin: '0 0 16px 0',
            padding: '12px 14px',
            borderLeft: '4px solid #ef4444',
            textAlign: 'left',
            background: 'rgba(239, 68, 68, 0.08)',
            borderRadius: '6px',
            fontSize: '13px',
            lineHeight: '1.45',
          }}
        >
          <strong>
            {error.type === 'forbidden'
              ? '⛔ Role Authorization Error (403)'
              : error.type === 'unauthorized'
              ? '🔒 Authentication Failed (401)'
              : '⚠️ Sign In Error'}
          </strong>
          <div style={{ marginTop: '4px' }}>{error.message}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
        <div style={{ marginBottom: '14px' }}>
          <label
            htmlFor="staffEmail"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
          >
            Staff Email Address
          </label>
          <input
            id="staffEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="gate.staff@passpulse.io"
            required
            autoComplete="username"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border, #333)',
              background: 'var(--card-bg, #1a1a1a)',
              color: 'inherit',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '18px' }}>
          <label
            htmlFor="staffPassword"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
          >
            Password
          </label>
          <input
            id="staffPassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            autoComplete="current-password"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border, #333)',
              background: 'var(--card-bg, #1a1a1a)',
              color: 'inherit',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--accent, #6366f1)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '14px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'background 0.2s',
          }}
        >
          {loading ? 'Authenticating...' : 'Sign In as Gate Staff'}
        </button>
      </form>

      {/* Development-Only Account Helper (Completely excluded from production builds) */}
      {import.meta.env.DEV && (
        <div
          style={{
            marginTop: '24px',
            padding: '12px 14px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border, #2a2a2a)',
            borderRadius: '8px',
            textAlign: 'left',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-h, #e5e7eb)' }}>
            🛠️ Development Accounts (Dev Mode Only):
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>Gate Staff</strong>: <code>gate.staff@passpulse.io</code>
              </span>
              <button
                type="button"
                onClick={() => applyPresetEmail('gate.staff@passpulse.io')}
                style={{ padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
              >
                Fill Email
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>System Admin</strong>: <code>admin@passpulse.io</code>
              </span>
              <button
                type="button"
                onClick={() => applyPresetEmail('admin@passpulse.io')}
                style={{ padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
              >
                Fill Email
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>Operations Staff</strong>: <code>staff@passpulse.io</code>
              </span>
              <button
                type="button"
                onClick={() => applyPresetEmail('staff@passpulse.io')}
                style={{ padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
              >
                Fill Email
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>Attendee (Tests 403)</strong>: <code>alex.johnson@example.com</code>
              </span>
              <button
                type="button"
                onClick={() => applyPresetEmail('alex.johnson@example.com')}
                style={{ padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
              >
                Fill Email
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>Organizer (Tests 403)</strong>: <code>organizer@passpulse.io</code>
              </span>
              <button
                type="button"
                onClick={() => applyPresetEmail('organizer@passpulse.io')}
                style={{ padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
              >
                Fill Email
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default StaffLogin

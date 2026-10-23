import { useState } from 'react'
import { loginUser } from '../services/authApi'

/**
 * Sign-in form that only accepts the given roles (FR-003). Used by the
 * organizer and admin screens.
 */
function RoleLogin({ title, allowedRoles, hint, onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setLoading(true)
    try {
      const data = await loginUser({ email, password })
      const role = data.user?.role?.toUpperCase()
      if (!allowedRoles.includes(role)) {
        setError(`This screen needs a ${allowedRoles.join(' or ')} account. You signed in as ${role}.`)
        return
      }
      onLoginSuccess({ user: data.user, token: data.token })
    } catch (err) {
      setError(err.status === 401 ? 'Wrong email or password.' : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="catalog" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26 }}>{title}</h1>
      {hint && <p className="muted">{hint}</p>}
      {error && <div className="notice error">{error}</div>}
      <form className="form-grid" style={{ gridTemplateColumns: '1fr', marginTop: 12 }} onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}

export default RoleLogin

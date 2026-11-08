import { useEffect, useState } from 'react'
import JourneySteps from '../components/JourneySteps'
import { loginUser } from '../services/authApi'
import { holdSeats, confirmBooking } from '../services/bookingApi'
import { formatDate, formatPrice } from '../utils/format'
import './EventCatalog.css'

function secondsLeft(expiresAt) {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))
}

/**
 * NFR-005 screen 3: sign in (inline, no extra screen), hold seats for 10
 * minutes (FR-008) and confirm the booking (FR-010).
 */
function Checkout({ selection, session, initialHold, onSession, onBack, onConfirmed }) {
  const { event, tier, quantity } = selection
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [hold, setHold] = useState(initialHold || null)
  const [remaining, setRemaining] = useState(initialHold ? secondsLeft(initialHold.expiresAt) : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const total = tier.price * quantity

  useEffect(() => {
    if (!hold) return undefined
    const timer = setInterval(() => setRemaining(secondsLeft(hold.expiresAt)), 1000)
    return () => clearInterval(timer)
  }, [hold])

  function explain(err) {
    if (err.status === 404) {
      return 'Booking is not available on this server yet (booking engine FR-008/FR-010 not deployed).'
    }
    return err.message
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const data = await loginUser({ email, password })
      onSession({ user: data.user, token: data.token })
    } catch (err) {
      setError(err.status === 401 ? 'Wrong email or password.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleHold() {
    setError(null)
    setBusy(true)
    try {
      const data = await holdSeats({ eventId: event.id, tierId: tier.id, quantity }, session.token)
      const h = data.hold || data
      setHold(h)
      setRemaining(secondsLeft(h.expiresAt))
    } catch (err) {
      setError(explain(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm() {
    setError(null)
    setBusy(true)
    try {
      const data = await confirmBooking(hold.holdId || hold.id, session.token)
      onConfirmed(data.booking || data)
    } catch (err) {
      setError(explain(err))
    } finally {
      setBusy(false)
    }
  }

  const expired = hold && remaining === 0

  return (
    <section className="catalog" style={{ maxWidth: 640 }}>
      <JourneySteps current={3} />
      <button type="button" className="btn" onClick={onBack}>Change tickets</button>
      <h1 style={{ marginTop: 16 }}>Checkout</h1>

      <div className="panel">
        <strong style={{ color: 'var(--text-h)' }}>{event.title}</strong>
        <div className="muted">{formatDate(event.eventDate)}, {event.venue}</div>
        <div style={{ marginTop: 8 }}>
          {quantity} x {tier.name} at {formatPrice(tier.price)} = <strong>{formatPrice(total)}</strong>
        </div>
      </div>

      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}

      {!session ? (
        <form className="panel form-grid" style={{ gridTemplateColumns: '1fr' }} onSubmit={handleSignIn}>
          <strong style={{ color: 'var(--text-h)' }}>Sign in to book</strong>
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
          <button type="submit" className="btn btn-primary" disabled={busy}>Sign in</button>
        </form>
      ) : !hold ? (
        <div className="panel">
          <p className="muted">Signed in as {session.user.fullName}. Seats are held for 10 minutes once you continue.</p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handleHold}>
            Hold my seats
          </button>
        </div>
      ) : (
        <div className="panel">
          <p>
            {expired
              ? 'Your hold has expired and the seats were released.'
              : `Seats held for ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
          </p>
          {expired ? (
            <button type="button" className="btn" onClick={() => setHold(null)}>Hold again</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleConfirm}>
              Confirm and pay {formatPrice(total)}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export default Checkout

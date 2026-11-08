import { useEffect, useState } from 'react'
import { fetchEvent } from '../services/eventsApi'
import { loginUser } from '../services/authApi'
import { joinWaitlist } from '../services/bookingApi'
import { formatDate, formatPrice } from '../utils/format'
import JourneySteps from '../components/JourneySteps'
import './EventCatalog.css'

/**
 * FR-004: event detail page with the ticket tiers that are on sale.
 */
function EventDetails({ eventId, onBack, onCheckout, session, onSession }) {
  const [event, setEvent] = useState(null)
  const [error, setError] = useState(null)
  const [tierId, setTierId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [waitlistTier, setWaitlistTier] = useState(null)
  const [waitlistQuantity, setWaitlistQuantity] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [waitlistBusy, setWaitlistBusy] = useState(false)
  const [waitlistError, setWaitlistError] = useState(null)
  const [waitlistMessage, setWaitlistMessage] = useState(null)

  useEffect(() => {
    let active = true
    fetchEvent(eventId)
      .then((data) => {
        if (active) setEvent(data.event)
      })
      .catch((err) => {
        if (active) setError(err.status === 404 ? 'This event is not available.' : err.message)
      })
    return () => {
      active = false
    }
  }, [eventId])

  async function handleWaitlistSubmit(e) {
    e.preventDefault()
    if (!waitlistTier || !event) return
    setWaitlistError(null)
    setWaitlistMessage(null)
    setWaitlistBusy(true)
    try {
      let attendeeSession = session
      if (!attendeeSession) {
        const data = await loginUser({ email, password })
        if (data.user?.role?.toUpperCase() !== 'ATTENDEE') {
          throw new Error('Sign in with an attendee account to join a waitlist.')
        }
        attendeeSession = { user: data.user, token: data.token }
        onSession(attendeeSession)
      }
      const data = await joinWaitlist({
        eventId: event.id,
        tierId: waitlistTier.id,
        quantity: waitlistQuantity,
      }, attendeeSession.token)
      const entry = data.waitlist.entry
      setWaitlistMessage(
        entry.status === 'CLAIMED'
          ? 'You joined the waitlist and tickets are available to claim. Check Notifications.'
          : `You joined the waitlist at position ${data.waitlist.position}.`
      )
      setWaitlistTier(null)
    } catch (err) {
      setWaitlistError(err.status === 401 ? 'Wrong email or password.' : err.message)
    } finally {
      setWaitlistBusy(false)
    }
  }

  return (
    <section className="catalog">
      <JourneySteps current={2} />
      <button type="button" className="btn" onClick={onBack}>Back to events</button>

      {error && <div className="notice error" style={{ marginTop: 16 }}>{error}</div>}
      {!error && !event && <p className="muted">Loading event...</p>}

      {event && (
        <>
          <span className="chip" style={{ display: 'inline-block', marginTop: 16 }}>{event.category}</span>
          <h1>{event.title}</h1>
          <p>{formatDate(event.eventDate)}</p>
          <p className="muted">{event.venue}</p>
          <p>{event.description}</p>

          <h2 style={{ fontSize: 20, marginTop: 24 }}>Tickets</h2>
          {event.tiers.length === 0 ? (
            <p className="muted">Tickets are not on sale yet.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const tier = event.tiers.find((t) => t.id === tierId)
                if (tier) onCheckout({ event, tier, quantity })
              }}
            >
              <table className="tier-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Tier</th>
                    <th>Price</th>
                    <th>Available</th>
                    <th>Waitlist</th>
                  </tr>
                </thead>
                <tbody>
                  {event.tiers.map((tier) => (
                    <tr key={tier.id}>
                      <td>
                        <input
                          type="radio"
                          name="tier"
                          aria-label={`Select ${tier.name}`}
                          disabled={tier.available === 0}
                          checked={tierId === tier.id}
                          onChange={() => {
                            setTierId(tier.id)
                            setQuantity(1)
                          }}
                        />
                      </td>
                      <td>{tier.name}</td>
                      <td>{formatPrice(tier.price)}</td>
                      <td>{tier.available > 0 ? tier.available : 'Sold out'}</td>
                      <td>
                        {tier.available === 0 && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setWaitlistTier(tier)
                              setWaitlistQuantity(1)
                              setWaitlistMessage(null)
                              setWaitlistError(null)
                            }}
                          >
                            Join waitlist
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tierId && (
                <div className="catalog-actions" style={{ marginTop: 16 }}>
                  <label className="muted">
                    Tickets{' '}
                    <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
                      {Array.from(
                        {
                          length: Math.min(
                            event.tiers.find((t) => t.id === tierId).maxPerOrder,
                            event.tiers.find((t) => t.id === tierId).available
                          ),
                        },
                        (_, i) => i + 1
                      ).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="btn btn-primary">Continue to checkout</button>
                </div>
              )}
            </form>
          )}

          {waitlistMessage && <div className="notice" style={{ marginTop: 16 }}>{waitlistMessage}</div>}
          {waitlistTier && (
            <form className="panel form-grid" style={{ gridTemplateColumns: '1fr', marginTop: 16 }} onSubmit={handleWaitlistSubmit}>
              <strong>Join {waitlistTier.name} waitlist</strong>
              <label className="muted">
                Tickets
                <select
                  value={waitlistQuantity}
                  onChange={(e) => setWaitlistQuantity(Number(e.target.value))}
                >
                  {Array.from({ length: waitlistTier.maxPerOrder }, (_, i) => i + 1).map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
              {!session && (
                <>
                  <p className="muted">Sign in with an attendee account to join.</p>
                  <label>
                    Email
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
                  </label>
                  <label>
                    Password
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                  </label>
                </>
              )}
              {waitlistError && <div className="notice error">{waitlistError}</div>}
              <div className="catalog-actions">
                <button type="submit" className="btn btn-primary" disabled={waitlistBusy}>
                  {waitlistBusy ? 'Joining...' : 'Join waitlist'}
                </button>
                <button type="button" className="btn" onClick={() => setWaitlistTier(null)}>Cancel</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  )
}

export default EventDetails

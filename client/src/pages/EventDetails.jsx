import { useEffect, useState } from 'react'
import { fetchEvent } from '../services/eventsApi'
import { formatDate, formatPrice } from '../utils/format'
import JourneySteps from '../components/JourneySteps'
import './EventCatalog.css'

/**
 * FR-004: event detail page with the ticket tiers that are on sale.
 */
function EventDetails({ eventId, onBack, onCheckout }) {
  const [event, setEvent] = useState(null)
  const [error, setError] = useState(null)
  const [tierId, setTierId] = useState('')
  const [quantity, setQuantity] = useState(1)

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
        </>
      )}
    </section>
  )
}

export default EventDetails

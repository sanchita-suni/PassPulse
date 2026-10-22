import { useEffect, useState } from 'react'
import { fetchEvent } from '../services/eventsApi'
import { formatDate, formatPrice } from '../utils/format'
import './EventCatalog.css'

/**
 * FR-004: event detail page with the ticket tiers that are on sale.
 */
function EventDetails({ eventId, onBack }) {
  const [event, setEvent] = useState(null)
  const [error, setError] = useState(null)

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
            <table className="tier-table">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Price</th>
                  <th>Available</th>
                </tr>
              </thead>
              <tbody>
                {event.tiers.map((tier) => (
                  <tr key={tier.id}>
                    <td>{tier.name}</td>
                    <td>{formatPrice(tier.price)}</td>
                    <td>{tier.available > 0 ? tier.available : 'Sold out'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}

export default EventDetails

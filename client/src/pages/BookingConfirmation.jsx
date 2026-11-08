import JourneySteps from '../components/JourneySteps'
import { formatDate } from '../utils/format'
import './EventCatalog.css'

/**
 * NFR-005 screen 4: booking confirmed, with a link to each QR pass (FR-012).
 */
function BookingConfirmation({ booking, selection, onViewPass, onDone }) {
  const tickets = booking.tickets || []
  return (
    <section className="catalog" style={{ maxWidth: 640 }}>
      <JourneySteps current={4} />
      <div className="notice success">Booking confirmed</div>
      <h1 style={{ marginTop: 16 }}>{selection.event.title}</h1>
      <p className="muted">{formatDate(selection.event.eventDate)}, {selection.event.venue}</p>
      <p>Booking reference: <strong>{booking.id || booking.bookingId || booking.bookingReference}</strong></p>
      <div className="panel">
        {tickets.length === 0 && <p className="muted">Your tickets will appear under My pass.</p>}
        {tickets.map((t) => {
          const id = t.ticketId || t.id
          return (
            <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span>{selection.tier.name} ticket {id}</span>
              <button type="button" className="btn btn-primary" onClick={() => onViewPass(id)}>View QR pass</button>
            </div>
          )
        })}
      </div>
      <button type="button" className="btn" style={{ marginTop: 16 }} onClick={onDone}>Browse more events</button>
    </section>
  )
}

export default BookingConfirmation

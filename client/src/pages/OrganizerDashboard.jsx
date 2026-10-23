import { useCallback, useEffect, useState } from 'react'
import RoleLogin from '../components/RoleLogin'
import {
  fetchMyEvents,
  createEvent,
  updateEvent,
  cancelEvent,
} from '../services/eventsApi'
import { formatDate } from '../utils/format'
import './EventCatalog.css'

const BLANK = { title: '', description: '', category: '', venue: '', eventDate: '', capacity: '' }

function toLocalInput(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EventForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit({
        ...form,
        capacity: Number(form.capacity),
        eventDate: form.eventDate ? new Date(form.eventDate).toISOString() : '',
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      {error && <div className="notice error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="form-grid">
        <label>
          Title
          <input value={form.title} onChange={(e) => update('title', e.target.value)} required />
        </label>
        <label>
          Category
          <input value={form.category} onChange={(e) => update('category', e.target.value)} required />
        </label>
        <label>
          Venue
          <input value={form.venue} onChange={(e) => update('venue', e.target.value)} required />
        </label>
        <label>
          Date and time
          <input
            type="datetime-local"
            value={form.eventDate}
            onChange={(e) => update('eventDate', e.target.value)}
            required
          />
        </label>
        <label>
          Capacity
          <input
            type="number"
            min="1"
            value={form.capacity}
            onChange={(e) => update('capacity', e.target.value)}
            required
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          Description
          <textarea rows="3" value={form.description} onChange={(e) => update('description', e.target.value)} />
        </label>
      </div>
      <div className="catalog-actions" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>{submitLabel}</button>
        <button type="button" className="btn" onClick={onCancel}>Close</button>
      </div>
    </form>
  )
}

/**
 * FR-005: organizer screen to create, edit, schedule and cancel own events.
 */
function OrganizerDashboard({ session, onSession }) {
  const [events, setEvents] = useState([])
  const [mode, setMode] = useState(null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const token = session?.token

  const load = useCallback(() => {
    if (!token) return Promise.resolve()
    return fetchMyEvents(token)
      .then((data) => setEvents(data.events))
      .catch((err) => setError(err.message))
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  if (!session) {
    return (
      <RoleLogin
        title="Organizer sign in"
        hint="Demo account: organizer@passpulse.io / Organizer@2026"
        allowedRoles={['ORGANIZER', 'ADMIN']}
        onLoginSuccess={onSession}
      />
    )
  }

  async function handleCreate(data) {
    const res = await createEvent(data, token)
    setMode(null)
    setMessage(`Created "${res.event.title}" as a draft.`)
    await load()
  }

  async function handleEdit(id, data) {
    const res = await updateEvent(id, data, token)
    setMode(null)
    setMessage(`Saved changes to "${res.event.title}".`)
    await load()
  }

  async function handleCancel(ev) {
    setError(null)
    try {
      await cancelEvent(ev.id, token)
      setMessage(`Cancelled "${ev.title}".`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const closed = (status) => status === 'CANCELLED' || status === 'COMPLETED'

  return (
    <section className="catalog">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1>My events</h1>
          <p className="muted">Signed in as {session.user.fullName} ({session.user.role})</p>
        </div>
        <div className="catalog-actions">
          <button type="button" className="btn btn-primary" onClick={() => setMode({ type: 'create' })}>
            New event
          </button>
          <button type="button" className="btn" onClick={() => onSession(null)}>Sign out</button>
        </div>
      </div>

      {message && <div className="notice success" style={{ marginTop: 12 }}>{message}</div>}
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}

      {mode?.type === 'create' && (
        <EventForm initial={BLANK} submitLabel="Save as draft" onSubmit={handleCreate} onCancel={() => setMode(null)} />
      )}

      {events.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 16 }}>You have no events yet.</div>
      ) : (
        events.map((ev) => (
          <div key={ev.id} className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span className="chip">{ev.status}</span>
                <h3 style={{ margin: '6px 0', color: 'var(--text-h)' }}>{ev.title}</h3>
                <div className="muted">
                  {formatDate(ev.eventDate)} at {ev.venue}, capacity {ev.capacity}
                </div>
              </div>
              <div className="catalog-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={closed(ev.status)}
                  onClick={() => setMode({ type: 'edit', id: ev.id })}
                >
                  Edit
                </button>
                <button type="button" className="btn" disabled={closed(ev.status)} onClick={() => handleCancel(ev)}>
                  Cancel event
                </button>
              </div>
            </div>
            {mode?.type === 'edit' && mode.id === ev.id && (
              <EventForm
                initial={{
                  title: ev.title,
                  description: ev.description,
                  category: ev.category,
                  venue: ev.venue,
                  eventDate: toLocalInput(ev.eventDate),
                  capacity: ev.capacity,
                }}
                submitLabel="Save changes"
                onSubmit={(data) => handleEdit(ev.id, data)}
                onCancel={() => setMode(null)}
              />
            )}
          </div>
        ))
      )}
    </section>
  )
}

export default OrganizerDashboard

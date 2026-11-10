import { useCallback, useEffect, useState } from 'react'
import RoleLogin from '../components/RoleLogin'
import TierManager from '../components/TierManager'
import {
  fetchMyEvents,
  createEvent,
  updateEvent,
  cancelEvent,
  changeEventStatus,
} from '../services/eventsApi'
import { subscribeToTelemetry, fetchTelemetrySnapshot } from '../services/telemetryApi'
import { downloadReport } from '../services/reportsApi'
import { formatDate } from '../utils/format'
import './EventCatalog.css'

// FR-006: the next steps an organizer can take (publishing is done by an admin)
const ORGANIZER_ACTIONS = {
  DRAFT: [['PENDING_APPROVAL', 'Submit for approval']],
  PENDING_APPROVAL: [['DRAFT', 'Withdraw to draft']],
  PUBLISHED: [['LIVE', 'Go live']],
  LIVE: [['COMPLETED', 'Mark completed']],
}

function soldCount(ev) {
  return ev.tiers.reduce((sum, t) => sum + t.sold, 0)
}

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
 * FR-017 / SAD ADR-04: Live Attendance and Scan-Velocity Telemetry Dashboard Panel.
 */
function LiveTelemetryPanel({ event, token }) {
  const [metrics, setMetrics] = useState(null)
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!event?.id || !token) return

    let isMounted = true

    fetchTelemetrySnapshot(event.id, token)
      .then((data) => {
        if (isMounted) setMetrics(data)
      })
      .catch((err) => {
        if (isMounted) setError(err.message)
      })

    const unsubscribe = subscribeToTelemetry(event.id, token, {
      onData: (data) => {
        if (isMounted) {
          setMetrics(data)
          setError(null)
        }
      },
      onError: (err) => {
        if (isMounted) setError(err.message || 'Stream connection issue')
      },
      onStatusChange: (newStatus) => {
        if (isMounted) setStatus(newStatus)
      },
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [event?.id, token, reloadKey])

  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return (
          <span
            style={{
              fontSize: '12px',
              padding: '3px 10px',
              borderRadius: '100px',
              background: '#dcfce7',
              color: '#15803d',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
            Live (SSE Active)
          </span>
        )
      case 'connecting':
        return (
          <span
            style={{
              fontSize: '12px',
              padding: '3px 10px',
              borderRadius: '100px',
              background: '#fef3c7',
              color: '#b45309',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} />
            Connecting...
          </span>
        )
      case 'error':
        return (
          <span
            style={{
              fontSize: '12px',
              padding: '3px 10px',
              borderRadius: '100px',
              background: '#fee2e2',
              color: '#b91c1c',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
            Connection Error
          </span>
        )
      default:
        return (
          <span
            style={{
              fontSize: '12px',
              padding: '3px 10px',
              borderRadius: '100px',
              background: 'var(--border)',
              color: 'var(--text)',
              fontWeight: 600,
            }}
          >
            Offline
          </span>
        )
    }
  }

  return (
    <div
      style={{
        marginTop: '16px',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div>
          <h4 style={{ margin: 0, color: 'var(--text-h)' }}>Live Attendance & Gate Velocity</h4>
          <span className="muted">Real-time gate telemetry for {event.title} (FR-017)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {getStatusBadge()}
          {status === 'error' && (
            <button
              type="button"
              className="btn"
              style={{ padding: '4px 8px', fontSize: '12px' }}
              onClick={() => {
                setError(null)
                setStatus('connecting')
                setReloadKey((k) => k + 1)
              }}
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {error && !metrics && (
        <div className="notice error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!metrics && status === 'connecting' ? (
        <div className="muted" style={{ padding: '16px 0', textAlign: 'center' }}>
          Connecting to real-time gate telemetry...
        </div>
      ) : metrics ? (
        <div>
          {metrics.totalAttendees === 0 && (
            <div className="empty-state" style={{ marginBottom: 16, padding: '16px' }}>
              No tickets confirmed yet for this event. Gate scans will stream here automatically.
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            {/* Card 1: Attendance Count & Percentage */}
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.02)',
              }}
            >
              <div className="muted" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Attendance
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-h)', margin: '4px 0' }}>
                {metrics.checkedInCount}{' '}
                <span style={{ fontSize: '15px', fontWeight: 400, color: 'var(--text)' }}>
                  / {metrics.totalAttendees}
                </span>
              </div>
              <div style={{ margin: '8px 0 4px', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(0, metrics.attendancePercentage))}%`,
                    background: 'var(--accent)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
              <div className="muted" style={{ fontSize: '12px' }}>
                {metrics.attendancePercentage}% Checked In
              </div>
            </div>

            {/* Card 2: Scan Velocity */}
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.02)',
              }}
            >
              <div className="muted" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Scan Velocity
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-h)', margin: '4px 0' }}>
                {metrics.scanVelocity}{' '}
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                  scans / min
                </span>
              </div>
              <div className="muted" style={{ fontSize: '12px', marginTop: 8 }}>
                {metrics.scanVelocity > 0 ? (
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>🟢 Gate active (rolling 60s)</span>
                ) : (
                  <span>⚪ Gate idle (rolling 60s)</span>
                )}
              </div>
            </div>

            {/* Card 3: Gate Status */}
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.02)',
              }}
            >
              <div className="muted" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Live Stream Info
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-h)', margin: '6px 0 4px' }}>
                State: <span className="chip" style={{ fontSize: '11px' }}>{event.status}</span>
              </div>
              <div className="muted" style={{ fontSize: '12px', marginTop: 12 }}>
                Updated: {metrics.updatedAt ? new Date(metrics.updatedAt).toLocaleTimeString() : '—'}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <ReportExportSection event={event} token={token} />
    </div>
  )
}

/**
 * FR-018: Export Attendance and Revenue Reports Component.
 */
function ReportExportSection({ event, token }) {
  const [downloading, setDownloading] = useState(null)
  const [downloadError, setDownloadError] = useState(null)
  const [downloadSuccess, setDownloadSuccess] = useState(null)

  const handleDownload = async (reportType, format) => {
    const key = `${reportType}-${format}`
    setDownloading(key)
    setDownloadError(null)
    setDownloadSuccess(null)
    try {
      await downloadReport({ eventId: event.id, reportType, format, token })
      setDownloadSuccess(`Downloaded ${reportType.toUpperCase()} (${format.toUpperCase()}) successfully!`)
      setTimeout(() => setDownloadSuccess(null), 4000)
    } catch (err) {
      setDownloadError(err.message || 'Download failed')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div
      style={{
        marginTop: '16px',
        padding: '14px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        background: 'rgba(0,0,0,0.015)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <strong style={{ fontSize: '13px', color: 'var(--text-h)' }}>📥 Export Official Reports (FR-018)</strong>
          <div className="muted" style={{ fontSize: '12px' }}>
            Download verified attendee turnout and financial revenue summaries in CSV or PDF.
          </div>
        </div>
        {downloadSuccess && (
          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
            ✓ {downloadSuccess}
          </span>
        )}
      </div>

      {downloadError && (
        <div className="notice error" style={{ marginBottom: 12, fontSize: '12px', padding: '6px 10px' }}>
          {downloadError}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button
          type="button"
          className="btn"
          disabled={Boolean(downloading)}
          onClick={() => handleDownload('attendance', 'csv')}
          title="Download attendance list with check-in status in CSV"
        >
          {downloading === 'attendance-csv' ? 'Downloading...' : '📄 Attendance CSV'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={Boolean(downloading)}
          onClick={() => handleDownload('attendance', 'pdf')}
          title="Download attendance summary report in PDF"
        >
          {downloading === 'attendance-pdf' ? 'Downloading...' : '📑 Attendance PDF'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={Boolean(downloading)}
          onClick={() => handleDownload('revenue', 'csv')}
          title="Download revenue and confirmed booking records in CSV"
        >
          {downloading === 'revenue-csv' ? 'Downloading...' : '💰 Revenue CSV'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={Boolean(downloading)}
          onClick={() => handleDownload('revenue', 'pdf')}
          title="Download financial revenue and tier performance summary in PDF"
        >
          {downloading === 'revenue-pdf' ? 'Downloading...' : '📈 Revenue PDF'}
        </button>
      </div>
    </div>
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

  async function handleEdit(ev, data) {
    const sold = soldCount(ev)
    const dateChanged = new Date(data.eventDate).getTime() !== new Date(ev.eventDate).getTime()
    const changes = { ...data }
    if (!dateChanged) delete changes.eventDate
    if (dateChanged && sold > 0) {
      // BR-006: holders must be told about a new date
      if (!window.confirm(`${sold} tickets are sold. Change the date and notify every ticket holder?`)) return
      changes.notifyHolders = true
    }
    const res = await updateEvent(ev.id, changes, token)
    setMode(null)
    setMessage(`Saved changes to "${res.event.title}".`)
    await load()
  }

  async function handleCancel(ev) {
    setError(null)
    const sold = soldCount(ev)
    const prompt = sold > 0
      ? `${sold} tickets are sold. Cancel "${ev.title}" and notify every ticket holder?`
      : `Cancel "${ev.title}"?`
    if (!window.confirm(prompt)) return
    try {
      await cancelEvent(ev.id, token, { notifyHolders: sold > 0 })
      setMessage(`Cancelled "${ev.title}".`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleStatus(ev, status, label) {
    setError(null)
    try {
      await changeEventStatus(ev.id, status, token)
      setMessage(`${label}: "${ev.title}" is now ${status}.`)
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
                  {formatDate(ev.eventDate)} at {ev.venue}, capacity {ev.capacity}, {soldCount(ev)} sold
                </div>
                {ev.status === 'PENDING_APPROVAL' && <div className="muted">Waiting for admin approval.</div>}
                {ev.notices.length > 0 && (
                  <div className="muted">
                    Last notice sent to {ev.notices[ev.notices.length - 1].recipients} holders:{' '}
                    {ev.notices[ev.notices.length - 1].message}
                  </div>
                )}
              </div>
              <div className="catalog-actions" style={{ flexWrap: 'wrap' }}>
                {(ORGANIZER_ACTIONS[ev.status] || []).map(([status, label]) => (
                  <button
                    key={status}
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleStatus(ev, status, label)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn"
                  disabled={closed(ev.status)}
                  onClick={() => setMode({ type: 'edit', id: ev.id })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setMode(mode?.type === 'tiers' && mode.id === ev.id ? null : { type: 'tiers', id: ev.id })}
                >
                  Tiers ({ev.tiers.length})
                </button>
                <button
                  type="button"
                  className={`btn ${mode?.type === 'telemetry' && mode.id === ev.id ? 'btn-primary' : ''}`}
                  onClick={() => setMode(mode?.type === 'telemetry' && mode.id === ev.id ? null : { type: 'telemetry', id: ev.id })}
                >
                  {mode?.type === 'telemetry' && mode.id === ev.id ? 'Hide Telemetry & Reports' : '📊 Telemetry & Reports'}
                </button>
                <button type="button" className="btn" disabled={closed(ev.status)} onClick={() => handleCancel(ev)}>
                  Cancel event
                </button>
              </div>
            </div>
            {mode?.type === 'telemetry' && mode.id === ev.id && (
              <LiveTelemetryPanel event={ev} token={token} />
            )}
            {mode?.type === 'tiers' && mode.id === ev.id && (
              <TierManager event={ev} token={token} onChanged={load} />
            )}
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
                onSubmit={(data) => handleEdit(ev, data)}
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

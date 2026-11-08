import { useCallback, useEffect, useState } from 'react'
import RoleLogin from '../components/RoleLogin'
import { fetchAdminEvents, moderateEvent, fetchUsers, setUserActive } from '../services/adminApi'
import { formatDate } from '../utils/format'
import './EventCatalog.css'

const STATUS_FILTERS = ['PENDING_APPROVAL', 'PUBLISHED', 'LIVE', 'DRAFT', 'COMPLETED', 'CANCELLED', '']

/**
 * FR-019: approve, reject, flag or remove events and deactivate accounts.
 */
function AdminPanel({ session, onSession }) {
  const [tab, setTab] = useState('events')
  const [status, setStatus] = useState('PENDING_APPROVAL')
  const [events, setEvents] = useState([])
  const [users, setUsers] = useState([])
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const token = session?.token

  const load = useCallback(() => {
    if (!token) return Promise.resolve()
    return Promise.all([fetchAdminEvents(token, status), fetchUsers(token)])
      .then(([ev, us]) => {
        setEvents(ev.events)
        setUsers(us.users)
      })
      .catch((err) => setError(err.message))
  }, [token, status])

  useEffect(() => {
    load()
  }, [load])

  if (!session) {
    return (
      <RoleLogin
        title="Admin sign in"
        hint="Demo account: admin@passpulse.io / Admin@2026"
        allowedRoles={['ADMIN']}
        onLoginSuccess={onSession}
      />
    )
  }

  async function act(label, fn) {
    setError(null)
    setMessage(null)
    try {
      await fn()
      setMessage(label)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  function withReason(action, ev, verb) {
    const reason = window.prompt(`Reason to ${verb} "${ev.title}"`)
    if (!reason) return
    act(`${ev.title}: ${verb} done.`, () => moderateEvent(ev.id, action, token, reason))
  }

  return (
    <section className="catalog">
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1>Admin</h1>
          <p className="muted">Signed in as {session.user.fullName}</p>
        </div>
        <div className="catalog-actions">
          <button type="button" className={`btn ${tab === 'events' ? 'btn-primary' : ''}`} onClick={() => setTab('events')}>
            Events
          </button>
          <button type="button" className={`btn ${tab === 'users' ? 'btn-primary' : ''}`} onClick={() => setTab('users')}>
            Users
          </button>
          <button type="button" className="btn" onClick={() => onSession(null)}>Sign out</button>
        </div>
      </div>

      {message && <div className="notice success" style={{ marginTop: 12 }}>{message}</div>}
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}

      {tab === 'events' && (
        <>
          <label className="muted" style={{ display: 'block', marginTop: 16 }}>
            Status{' '}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FILTERS.map((s) => (
                <option key={s || 'all'} value={s}>{s || 'All'}</option>
              ))}
            </select>
          </label>
          {events.length === 0 && <div className="empty-state" style={{ marginTop: 16 }}>No events in this view.</div>}
          {events.map((ev) => (
            <div key={ev.id} className="panel">
              <span className="chip">{ev.status}</span>{' '}
              {ev.isFlagged && <span className="chip" style={{ color: '#ef4444' }}>FLAGGED</span>}
              <h3 style={{ margin: '6px 0', color: 'var(--text-h)' }}>{ev.title}</h3>
              <div className="muted">
                {formatDate(ev.eventDate)} at {ev.venue}, organizer {ev.organizerId}, {ev.tiers.length} tier(s)
              </div>
              {ev.flagReason && <div className="muted">Flag reason: {ev.flagReason}</div>}
              <div className="catalog-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                {ev.status === 'PENDING_APPROVAL' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => act(`${ev.title} approved and published.`, () => moderateEvent(ev.id, 'approve', token))}
                    >
                      Approve
                    </button>
                    <button type="button" className="btn" onClick={() => withReason('reject', ev, 'reject')}>
                      Reject
                    </button>
                  </>
                )}
                {ev.isFlagged ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => act(`${ev.title} unflagged.`, () => moderateEvent(ev.id, 'unflag', token))}
                  >
                    Unflag
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => withReason('flag', ev, 'flag')}>
                    Flag
                  </button>
                )}
                {!['CANCELLED', 'COMPLETED'].includes(ev.status) && (
                  <button type="button" className="btn" onClick={() => withReason('remove', ev, 'remove')}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'users' && (
        <table className="tier-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.isActive ? 'Active' : 'Deactivated'}</td>
                <td>
                  {u.id !== session.user.id && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        act(`${u.email} ${u.isActive ? 'deactivated' : 'reactivated'}.`, () =>
                          setUserActive(u.id, !u.isActive, token)
                        )
                      }
                    >
                      {u.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default AdminPanel

import { useCallback, useEffect, useState } from 'react'
import {
  acceptWaitlistClaim,
  declineWaitlistClaim,
  fetchNotifications,
} from '../services/bookingApi'
import { formatDate, formatPrice } from '../utils/format'
import './EventCatalog.css'

function WaitlistNotifications({ session, onClaimAccepted, onBack }) {
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(async () => {
    const data = await fetchNotifications(session.token)
    setNotifications(data.notifications)
  }, [session.token])

  useEffect(() => {
    let active = true
    fetchNotifications(session.token)
      .then((data) => {
        if (active) setNotifications(data.notifications)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
    return () => {
      active = false
    }
  }, [session.token])

  async function handleAccept(notification) {
    const claim = notification.claim
    setError(null)
    setBusyId(claim.id)
    try {
      const data = await acceptWaitlistClaim(claim.id, session.token)
      onClaimAccepted({ claim, hold: data.claim.hold })
    } catch (err) {
      setError(err.message)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleDecline(claimId) {
    setError(null)
    setBusyId(claimId)
    try {
      await declineWaitlistClaim(claimId, session.token)
      await refresh()
    } catch (err) {
      setError(err.message)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="catalog">
      <button type="button" className="btn" onClick={onBack}>Back to events</button>
      <h1 style={{ marginTop: 16 }}>Notifications</h1>
      {error && <div className="notice error">{error}</div>}
      {notifications.length === 0 ? (
        <p className="muted">You have no notifications.</p>
      ) : (
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          {notifications.map((notification) => {
            const claim = notification.claim
            const canAct = notification.type === 'CLAIM_AVAILABLE'
              && claim?.status === 'ACTIVE'
            return (
              <article className="panel" key={notification.id}>
                <strong>
                  {notification.payload?.message || notification.type.replaceAll('_', ' ').toLowerCase()}
                </strong>
                <p className="muted" style={{ marginBottom: 0 }}>
                  {formatDate(notification.createdAt)}
                </p>
                {claim && (
                  <>
                    <p>
                      {claim.quantity} x {claim.tier.name} for {claim.event.title}
                      {' '}({formatPrice(claim.tier.price)} each)
                    </p>
                    <p className="muted">
                      Claim status: {claim.status.toLowerCase()}
                      {claim.status === 'ACTIVE' && `; expires ${new Date(claim.expiresAt).toLocaleString()}`}
                    </p>
                    {canAct && (
                      <div className="catalog-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busyId === claim.id}
                          onClick={() => handleAccept(notification)}
                        >
                          {busyId === claim.id ? 'Accepting...' : 'Accept claim'}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={busyId === claim.id}
                          onClick={() => handleDecline(claim.id)}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default WaitlistNotifications

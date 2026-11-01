import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { verifyCheckIn } from '../services/checkinApi'
import StaffLogin from '../components/StaffLogin'

const AUTHORIZED_ROLES = ['GATE_STAFF', 'STAFF', 'ADMIN']
const SESSION_STORAGE_KEY = 'passpulse_gate_staff_session'

function GateScanner({ initialEventId = '', user: propUser = null, token: propToken = null } = {}) {
  const scannerRef = useRef(null)
  const processingRef = useRef(false)

  // Initialize internal session from sessionStorage
  const [internalSession, setInternalSession] = useState(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (
          parsed?.token &&
          parsed?.user &&
          AUTHORIZED_ROLES.includes(parsed.user?.role?.toUpperCase())
        ) {
          return parsed
        }
      }
    } catch {
      // Ignore sessionStorage read errors
    }
    return null
  })

  // Derive active session: explicit props take precedence over stored session
  const session = propUser && propToken ? { user: propUser, token: propToken } : internalSession

  const [eventId, setEventId] = useState(initialEventId)
  const [isScanning, setIsScanning] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  function handleLoginSuccess({ user, token }) {
    const newSession = { user, token }
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession))
    } catch {
      // ignore
    }
    setInternalSession(newSession)
    setScannerError('')
    setResult(null)
  }

  function handleLogout() {
    stopScanner()
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // ignore
    }
    setInternalSession(null)
    setScannerError('')
    setResult(null)
  }

  const isAuthenticated = Boolean(session?.user && session?.token)
  const isAuthorized =
    isAuthenticated && AUTHORIZED_ROLES.includes(session?.user?.role?.toUpperCase())

  async function startScanner() {
    if (!isAuthenticated) {
      setScannerError('Authentication required: Sign in with an authorized gate staff account (HTTP 401).')
      return
    }

    if (!isAuthorized) {
      setScannerError(
        `Access Denied (403): Role "${session?.user?.role}" cannot operate the scanner. Required role: GATE_STAFF, STAFF, or ADMIN.`
      )
      return
    }

    if (!eventId.trim()) {
      setScannerError('Enter the Event ID first.')
      return
    }

    setScannerError('')
    setResult(null)

    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner

    try {
      const cameras = await Html5Qrcode.getCameras()

      if (!cameras.length) {
        throw new Error('No camera found.')
      }

      await scanner.start(
        cameras[0].id,
        {
          fps: 10,
          qrbox: {
            width: 250,
            height: 250,
          },
        },
        async (decodedText) => {
          if (processingRef.current) return

          processingRef.current = true

          try {
            const response = await verifyCheckIn({
              qrData: decodedText,
              eventId: eventId.trim(),
              token: session?.token,
            })

            setResult({
              type: 'success',
              code: response.code,
              data: response.data,
            })
          } catch (error) {
            if (error.status === 401) {
              handleLogout()
              setScannerError('Session expired or unauthorized (HTTP 401). Please sign in again.')
              return
            }

            setResult({
              type: 'error',
              code:
                error.code ||
                (error.status === 401
                  ? 'UNAUTHORIZED'
                  : error.status === 403
                  ? 'FORBIDDEN'
                  : 'CHECKIN_FAILED'),
              message: error.message || 'Check-in failed.',
            })
          } finally {
            setTimeout(() => {
              processingRef.current = false
            }, 1500)
          }
        },
        () => {
          // Normal scan misses are ignored.
        }
      )

      setIsScanning(true)
    } catch (error) {
      setScannerError(error.message || 'Unable to start the camera.')
      scannerRef.current = null
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current

    if (!scanner) {
      setIsScanning(false)
      return
    }

    try {
      await scanner.stop()
      await scanner.clear()
    } catch {
      // Scanner may already be stopped.
    }

    scannerRef.current = null
    setIsScanning(false)
  }

  async function testCheckIn() {
    if (!isAuthenticated) {
      setScannerError('Authentication required: Sign in with an authorized gate staff account (HTTP 401).')
      return
    }

    if (!isAuthorized) {
      setScannerError(
        `Access Denied (403): Role "${session?.user?.role}" cannot operate the scanner. Required role: GATE_STAFF, STAFF, or ADMIN.`
      )
      return
    }

    const qrData = prompt('Paste the QR data here:')

    if (!qrData) return

    if (!eventId.trim()) {
      setScannerError('Enter the Event ID first.')
      return
    }

    setScannerError('')
    setResult(null)

    try {
      const response = await verifyCheckIn({
        qrData,
        eventId: eventId.trim(),
        token: session?.token,
      })

      setResult({
        type: 'success',
        code: response.code,
        data: response.data,
      })
    } catch (error) {
      if (error.status === 401) {
        handleLogout()
        setScannerError('Session expired or unauthorized (HTTP 401). Please sign in again.')
        return
      }

      setResult({
        type: 'error',
        code:
          error.code ||
          (error.status === 401
            ? 'UNAUTHORIZED'
            : error.status === 403
            ? 'FORBIDDEN'
            : 'CHECKIN_FAILED'),
        message: error.message || 'Check-in failed.',
      })
    }
  }

  // If user is not authenticated, render genuine Staff Login screen
  if (!isAuthenticated) {
    return (
      <main className="scanner-page">
        <StaffLogin onLoginSuccess={handleLoginSuccess} />
      </main>
    )
  }

  // If user somehow authenticated with an unauthorized role (e.g. ATTENDEE or ORGANIZER)
  if (!isAuthorized) {
    return (
      <main className="scanner-page">
        <section className="scanner-card" style={{ maxWidth: '480px', margin: '20px auto' }}>
          <div
            className="result error"
            style={{
              padding: '16px',
              borderLeft: '4px solid #ef4444',
              textAlign: 'left',
              background: 'rgba(239, 68, 68, 0.08)',
              borderRadius: '8px',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>⛔ Access Denied (HTTP 403 Forbidden)</h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px' }}>
              Signed in as <strong>{session.user?.fullName || session.user?.name || session.user?.email}</strong> with role <strong>{session.user?.role}</strong>. This role is not permitted to operate the gate scanner. Access is strictly restricted to <strong>GATE_STAFF</strong>, <strong>STAFF</strong>, or <strong>ADMIN</strong> roles.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                borderRadius: '6px',
                border: '1px solid var(--border)',
              }}
            >
              Sign In with Another Account
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="scanner-page">
      <section className="scanner-card">
        {/* Active Operator Status Bar with Logout Action */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '13px',
            textAlign: 'left',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted, #9ca3af)' }}>Active Operator: </span>
            <strong>{session.user?.fullName || session.user?.name || session.user?.email}</strong>{' '}
            <span
              style={{
                background: 'rgba(34, 197, 94, 0.2)',
                color: '#22c55e',
                padding: '2px 8px',
                borderRadius: '100px',
                fontSize: '11px',
                fontWeight: 600,
                marginLeft: '4px',
              }}
            >
              {session.user?.role}
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border, #444)',
              background: 'transparent',
              color: 'inherit',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            🚪 Log Out
          </button>
        </div>

        <h1>Gate Check-in</h1>

        <p>Scan an attendee QR pass to validate entry.</p>

        <label htmlFor="eventId">Event ID</label>

        <input
          id="eventId"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          placeholder="EVT-001"
          disabled={isScanning}
        />

        <div className="scanner-container">
          <div id="qr-reader" />
        </div>

        {!isScanning ? (
          <button
            type="button"
            onClick={startScanner}
            style={{
              cursor: 'pointer',
            }}
          >
            Start Scanner
          </button>
        ) : (
          <button type="button" onClick={stopScanner}>
            Stop Scanner
          </button>
        )}

        {!isScanning && (
          <button
            type="button"
            onClick={testCheckIn}
            style={{
              marginTop: '10px',
              cursor: 'pointer',
            }}
          >
            Test Check-in Without Camera
          </button>
        )}

        {scannerError && <div className="result error">{scannerError}</div>}

        {result?.type === 'success' && (
          <div className="result success">
            <h2>Check-in Successful</h2>

            <p>Code: {result.code}</p>
            <p>Ticket: {result.data.ticketId}</p>
            <p>Attendee: {result.data.userId}</p>

            <p>
              Checked in:{' '}
              {new Date(result.data.checkedInAt).toLocaleString()}
            </p>
          </div>
        )}

        {result?.type === 'error' && (
          <div className="result error">
            <h2>Check-in Rejected</h2>

            <p>Code: {result.code}</p>
            <p>{result.message}</p>
          </div>
        )}
      </section>
    </main>
  )
}

export default GateScanner

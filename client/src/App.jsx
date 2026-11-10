import { useState, useEffect } from 'react'
import GateScanner from './pages/GateScanner'
import AttendeePass from './pages/AttendeePass'
import EventCatalog from './pages/EventCatalog'
import EventDetails from './pages/EventDetails'
import OrganizerDashboard from './pages/OrganizerDashboard'
import AdminPanel from './pages/AdminPanel'
import Checkout from './pages/Checkout'
import BookingConfirmation from './pages/BookingConfirmation'
import WaitlistNotifications from './pages/WaitlistNotifications'
import './App.css'

function App() {
  const [scannerEventId, setScannerEventId] = useState('EVT-TECH-2026')

  // Check URL parameters on mount (?view=pass&ticketId=...)
  const getInitialState = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const viewParam = params.get('view')
      const ticketParam = params.get('ticketId')
      if (viewParam === 'pass' || ticketParam) {
        return { view: 'pass', ticketId: ticketParam || 'TKT-CONFIRMED-001' }
      }
      if (viewParam === 'scanner') {
        return { view: 'scanner', ticketId: 'TKT-CONFIRMED-001' }
      }
      if (viewParam === 'admin') {
        return { view: 'admin', ticketId: 'TKT-CONFIRMED-001' }
      }
      if (viewParam === 'organizer') {
        return { view: 'organizer', ticketId: 'TKT-CONFIRMED-001' }
      }
      if (viewParam === 'events') {
        return { view: 'events', ticketId: 'TKT-CONFIRMED-001' }
      }
      if (viewParam === 'event' && params.get('eventId')) {
        return { view: 'event', ticketId: 'TKT-CONFIRMED-001', eventId: params.get('eventId') }
      }
    }
    return { view: 'home', ticketId: 'TKT-CONFIRMED-001' }
  }

  const initialState = getInitialState()
  const [currentView, setCurrentView] = useState(initialState.view)
  const [selectedTicketId, setSelectedTicketId] = useState(initialState.ticketId)
  const [selectedEventId, setSelectedEventId] = useState(initialState.eventId || null)
  const [organizerSession, setOrganizerSession] = useState(null)
  const [adminSession, setAdminSession] = useState(null)
  const [attendeeSession, setAttendeeSession] = useState(null)
  const [selection, setSelection] = useState(null)
  const [booking, setBooking] = useState(null)
  const [acceptedClaimHold, setAcceptedClaimHold] = useState(null)

  // Listen for browser popstate
  useEffect(() => {
    const handlePopState = () => {
      const state = getInitialState()
      setCurrentView(state.view)
      setSelectedTicketId(state.ticketId)
      setSelectedEventId(state.eventId || null)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function openEvent(eventId) {
    setSelectedEventId(eventId)
    setCurrentView('event')
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'event')
    url.searchParams.set('eventId', eventId)
    url.searchParams.delete('ticketId')
    window.history.pushState({}, '', url)
  }

  function navigateTo(view, ticketId) {
    if (currentView === 'checkout' && view !== 'checkout') {
      setAcceptedClaimHold(null)
    }
    setCurrentView(view)
    if (ticketId) setSelectedTicketId(ticketId)
    const url = new URL(window.location.href)
    url.searchParams.delete('eventId')
    if (view === 'home') {
      url.searchParams.delete('view')
      url.searchParams.delete('ticketId')
    } else {
      url.searchParams.set('view', view)
      if (ticketId) url.searchParams.set('ticketId', ticketId)
    }
    window.history.pushState({}, '', url)
  }

  function changeTickets() {
    setAcceptedClaimHold(null)
    setSelection(null)
    setCurrentView('event')
  }

  // Top navigation header present across views
  const renderNav = () => (
    <nav
      className="no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        flexWrap: 'wrap',
        gap: '12px',
      }}
      aria-label="Platform Navigation"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <strong style={{ fontSize: '18px', color: 'var(--text-h)' }}>PassPulse</strong>
        <span
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '100px',
            background: 'var(--accent-bg)',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          FR-012 Live
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {attendeeSession && (
          <button
            type="button"
            onClick={() => navigateTo('notifications')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: currentView === 'notifications' ? 'var(--accent)' : 'transparent',
              color: currentView === 'notifications' ? '#fff' : 'var(--text-h)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '13px',
            }}
          >
            Notifications
          </button>
        )}
        <button
          type="button"
          onClick={() => navigateTo('home')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: currentView === 'home' ? 'var(--accent)' : 'transparent',
            color: currentView === 'home' ? '#fff' : 'var(--text-h)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
          }}
        >
          🏠 Events
        </button>

        <button
          type="button"
          onClick={() => navigateTo('organizer')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: currentView === 'organizer' ? 'var(--accent)' : 'transparent',
            color: currentView === 'organizer' ? '#fff' : 'var(--text-h)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
          }}
        >
          Organizer
        </button>

        <button
          type="button"
          onClick={() => navigateTo('admin')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: currentView === 'admin' ? 'var(--accent)' : 'transparent',
            color: currentView === 'admin' ? '#fff' : 'var(--text-h)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
          }}
        >
          Admin
        </button>

        <button
          type="button"
          onClick={() => navigateTo('pass', selectedTicketId)}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: currentView === 'pass' ? 'var(--accent)' : 'transparent',
            color: currentView === 'pass' ? '#fff' : 'var(--text-h)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
          }}
        >
          🎫 Attendee Digital Pass
        </button>

        <button
          type="button"
          onClick={() => navigateTo('scanner')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: currentView === 'scanner' ? 'var(--accent)' : 'transparent',
            color: currentView === 'scanner' ? '#fff' : 'var(--text-h)',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px',
          }}
        >
          📷 Gate Scanner
        </button>
      </div>
    </nav>
  )

  if (currentView === 'admin') {
    return (
      <>
        {renderNav()}
        <AdminPanel session={adminSession} onSession={setAdminSession} />
      </>
    )
  }

  if (currentView === 'organizer') {
    return (
      <>
        {renderNav()}
        <OrganizerDashboard session={organizerSession} onSession={setOrganizerSession} />
      </>
    )
  }

  if (currentView === 'events') {
    return (
      <>
        {renderNav()}
        <EventCatalog onOpenEvent={openEvent} />
      </>
    )
  }

  if (currentView === 'notifications' && attendeeSession) {
    return (
      <>
        {renderNav()}
        <WaitlistNotifications
          session={attendeeSession}
          onBack={() => navigateTo('home')}
          onClaimAccepted={({ claim, hold }) => {
            setSelection({
              event: claim.event,
              tier: claim.tier,
              quantity: hold.quantity,
            })
            setAcceptedClaimHold(hold)
            navigateTo('checkout')
          }}
        />
      </>
    )
  }

  // NFR-005: screens 3 and 4 of the booking journey
  if (currentView === 'checkout' && selection) {
    return (
      <>
        {renderNav()}
        <Checkout
          selection={selection}
          session={attendeeSession}
          initialHold={acceptedClaimHold}
          onSession={setAttendeeSession}
          onBack={changeTickets}
          onConfirmed={(b) => {
            setBooking(b)
            setAcceptedClaimHold(null)
            setCurrentView('confirmation')
          }}
        />
      </>
    )
  }

  if (currentView === 'confirmation' && booking && selection) {
    return (
      <>
        {renderNav()}
        <BookingConfirmation
          booking={booking}
          selection={selection}
          onViewPass={(ticketId) => navigateTo('pass', ticketId)}
          onDone={() => navigateTo('home')}
        />
      </>
    )
  }

  if (currentView === 'event' && selectedEventId) {
    return (
      <>
        {renderNav()}
        <EventDetails
          eventId={selectedEventId}
          session={attendeeSession}
          onSession={setAttendeeSession}
          onBack={() => navigateTo('home')}
          onCheckout={(sel) => {
            setAcceptedClaimHold(null)
            setSelection(sel)
            setCurrentView('checkout')
          }}
        />
      </>
    )
  }

  if (currentView === 'pass') {
    return (
      <>
        {renderNav()}
        <AttendeePass
          initialTicketId={selectedTicketId}
          session={attendeeSession}
          onSession={setAttendeeSession}
          onBack={() => navigateTo('home')}
          onOpenScanner={(evtId) => {
            setScannerEventId(evtId || 'EVT-TECH-2026')
            navigateTo('scanner')
          }}
        />
      </>
    )
  }

  if (currentView === 'scanner') {
    return (
      <>
        {renderNav()}
        <button
          type="button"
          onClick={() => navigateTo('home')}
          style={{
            margin: '20px auto 0 20px',
            padding: '10px 16px',
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          ← Back to Home
        </button>

        <GateScanner initialEventId={scannerEventId} />
      </>
    )
  }

  // NFR-005: the home page is the catalog, screen 1 of the booking journey
  return (
    <>
      {renderNav()}
      <EventCatalog onOpenEvent={openEvent} />
    </>
  )
}

export default App

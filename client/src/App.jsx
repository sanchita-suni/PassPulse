import { useState, useEffect } from 'react'
import GateScanner from './pages/GateScanner'
import AttendeePass from './pages/AttendeePass'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
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
    }
    return { view: 'home', ticketId: 'TKT-CONFIRMED-001' }
  }

  const initialState = getInitialState()
  const [currentView, setCurrentView] = useState(initialState.view)
  const [selectedTicketId, setSelectedTicketId] = useState(initialState.ticketId)

  // Listen for browser popstate
  useEffect(() => {
    const handlePopState = () => {
      const state = getInitialState()
      setCurrentView(state.view)
      setSelectedTicketId(state.ticketId)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigateTo(view, ticketId) {
    setCurrentView(view)
    if (ticketId) setSelectedTicketId(ticketId)
    const url = new URL(window.location.href)
    if (view === 'home') {
      url.searchParams.delete('view')
      url.searchParams.delete('ticketId')
    } else {
      url.searchParams.set('view', view)
      if (ticketId) url.searchParams.set('ticketId', ticketId)
    }
    window.history.pushState({}, '', url)
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
          🏠 Home
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

  if (currentView === 'pass') {
    return (
      <>
        {renderNav()}
        <AttendeePass
          initialTicketId={selectedTicketId}
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

  return (
    <>
      {renderNav()}

      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>PassPulse</h1>
          <p>
            Smart Event Discovery, Multi-Tier Ticketing & Cryptographic QR Check-in Platform
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((c) => c + 1)}
        >
          Count is {count}
        </button>
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation & Modules</h2>
          <p>Sprint 5 Deliverables (QR Pass & Gate Scanner)</p>
          <ul>
            <li>
              <a href="#pass" onClick={(e) => { e.preventDefault(); navigateTo('pass'); }}>
                🎫 Attendee Digital Pass (FR-012)
              </a>
            </li>
            <li>
              <a href="#scanner" onClick={(e) => { e.preventDefault(); navigateTo('scanner'); }}>
                📷 Gate Check-in Scanner (FR-013/14)
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the PassPulse Community</p>
          <ul>
            <li>
              <a href="https://github.com/sanchita-suni/PassPulse" target="_blank" rel="noreferrer">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://vite.dev/" target="_blank" rel="noreferrer">
                <img className="logo" src={viteLogo} alt="" />
                Vite Docs
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>

      {/* Feature Navigation Action Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          margin: '24px 16px',
        }}
      >
        <button
          type="button"
          onClick={() => navigateTo('pass', 'TKT-CONFIRMED-001')}
          style={{
            padding: '12px 24px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
          }}
        >
          🎫 Open Attendee Digital Pass (FR-012)
        </button>

        <button
          type="button"
          onClick={() => navigateTo('scanner')}
          style={{
            padding: '12px 24px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'var(--code-bg)',
            color: 'var(--text-h)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}
        >
          📷 Open Gate Scanner
        </button>
      </div>
    </>
  )
}

export default App

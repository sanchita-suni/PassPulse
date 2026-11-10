import { useEffect, useState } from 'react';
import { fetchAttendeePass, fetchAttendeeTickets } from '../services/passApi';
import { loginUser } from '../services/authApi';
import './AttendeePass.css';

const PRESET_TICKETS = [
  {
    id: 'TKT-CONFIRMED-001',
    label: 'VIP Pass (Confirmed - Alex Johnson)',
    owner: 'USR-ATTENDEE-001',
    badgeType: 'confirmed',
  },
  {
    id: 'TKT-DEMO-001',
    label: 'Demo Ticket (TKT-DEMO-001)',
    owner: 'USR-DEMO-001',
    badgeType: 'confirmed',
  },
  {
    id: 'TKT-CONFIRMED-002',
    label: 'General Admission (Confirmed - Sarah Connor)',
    owner: 'USR-ATTENDEE-002',
    badgeType: 'confirmed',
  },
  {
    id: 'TKT-PENDING-001',
    label: 'Pending Booking (Unconfirmed)',
    owner: 'USR-ATTENDEE-001',
    badgeType: 'warning',
  },
  {
    id: 'TKT-CANCELLED-001',
    label: 'Cancelled Ticket (Invalid)',
    owner: 'USR-ATTENDEE-001',
    badgeType: 'danger',
  },
  {
    id: 'TKT-EXPIRED-001',
    label: 'Expired Conference Pass',
    owner: 'USR-ATTENDEE-001',
    badgeType: 'danger',
  },
];

function AttendeePass({
  initialTicketId = 'TKT-CONFIRMED-001',
  session = null,
  onSession = null,
  onBack,
  onOpenScanner,
}) {
  const [ticketId, setTicketId] = useState(initialTicketId);
  const [prevInitialId, setPrevInitialId] = useState(initialTicketId);

  // Sync ticketId state when initialTicketId prop changes from parent
  if (initialTicketId !== prevInitialId) {
    setPrevInitialId(initialTicketId);
    setTicketId(initialTicketId);
  }

  const [customInputId, setCustomInputId] = useState('');

  // Genuine Attendee Authentication State (FR-012, SEC-002)
  const [localSession, setLocalSession] = useState(null);
  const sessionUser = session?.user || localSession?.user || null;
  const token = session?.token || localSession?.token || null;

  // Authenticated attendee's real tickets from backend
  const [userTickets, setUserTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [, setTicketsError] = useState(null);

  // Test fixtures & preset selector toggle (dev & manual test convenience)
  const [showTestFixtures, setShowTestFixtures] = useState(false);

  // Sign-in form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // Digital pass state
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const loadPass = () => {
    setReloadTrigger((v) => v + 1);
  };

  // Pass expiration monitor to invalidate QR dynamically if expiry arrives while page is open
  const [isPassExpired, setIsPassExpired] = useState(false);

  useEffect(() => {
    if (!pass?.expiresAt) {
      const timer = setTimeout(() => {
        setIsPassExpired(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const expiryTime = new Date(pass.expiresAt).getTime();
    if (Number.isNaN(expiryTime)) {
      const timer = setTimeout(() => {
        setIsPassExpired(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const remainingMs = expiryTime - Date.now();
    if (remainingMs <= 0) {
      const timer = setTimeout(() => {
        setIsPassExpired(true);
      }, 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setIsPassExpired(true);
    }, remainingMs);

    return () => clearTimeout(timer);
  }, [pass?.expiresAt]);

  // Fetch real tickets for authenticated attendee ("for each confirmed ticket")
  // Only re-fetches when session/token changes or an explicit reload is requested
  useEffect(() => {
    let isCancelled = false;

    async function loadUserTickets() {
      if (!token) {
        setUserTickets([]);
        return;
      }

      setLoadingTickets(true);
      setTicketsError(null);

      try {
        const tickets = await fetchAttendeeTickets({ token });
        if (!isCancelled) {
          const list = Array.isArray(tickets) ? tickets : [];
          setUserTickets(list);

          // If current ticketId is unassigned or default placeholder, select first owned ticket
          if (list.length > 0) {
            setTicketId((currentId) => {
              const hasCurrent = list.some((t) => (t.ticketId || t.id) === currentId);
              if (!hasCurrent && (!currentId || currentId === 'TKT-CONFIRMED-001')) {
                return list[0].ticketId || list[0].id;
              }
              return currentId;
            });
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setUserTickets([]);
          setTicketsError(err.message || 'Failed to retrieve tickets');
        }
      } finally {
        if (!isCancelled) {
          setLoadingTickets(false);
        }
      }
    }

    loadUserTickets();

    return () => {
      isCancelled = true;
    };
  }, [token, reloadTrigger]);

  // Fetch digital pass whenever ticketId or token changes
  useEffect(() => {
    let isCancelled = false;

    async function fetchPass() {
      if (!ticketId || !token) {
        setPass(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await fetchAttendeePass({
          ticketId: ticketId.trim(),
          token,
        });

        if (!isCancelled) {
          setPass(data);
        }
      } catch (err) {
        if (!isCancelled) {
          setPass(null);
          setError({
            code: err.code || 'PASS_ERROR',
            message: err.message || 'Failed to retrieve digital pass',
            status: err.status || 500,
          });
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchPass();

    return () => {
      isCancelled = true;
    };
  }, [ticketId, token, reloadTrigger]);



  async function handleAttendeeLogin(e) {
    if (e) e.preventDefault();
    setLoginError(null);

    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Please enter both your email address and password.');
      return;
    }

    setLoginLoading(true);

    try {
      const data = await loginUser({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (!data || !data.token) {
        throw new Error('Authentication failed: No token received from server.');
      }

      setLocalSession({ user: data.user, token: data.token });
      if (onSession) {
        onSession({ user: data.user, token: data.token });
      }
      setLoginPassword(''); // Clean up password from memory
      setLoginError(null);
    } catch (err) {
      setLoginError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleSignOut() {
    setLocalSession(null);
    setPass(null);
    setError(null);
    setUserTickets([]);
    if (onSession) {
      onSession(null);
    }
  }

  function handleCustomSearch(e) {
    e.preventDefault();
    if (customInputId.trim()) {
      setTicketId(customInputId.trim());
    }
  }

  function handleDownloadQr() {
    if (!pass?.qrCodeDataUrl) return;

    const link = document.createElement('a');
    link.href = pass.qrCodeDataUrl;
    link.download = `PassPulse-${pass.ticketId}-QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handlePrintPass() {
    window.print();
  }

  async function handleCopyPayload() {
    if (!pass?.qrData) return;

    try {
      await navigator.clipboard.writeText(pass.qrData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = pass.qrData;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  function formatDateTime(isoString) {
    if (!isoString) return 'TBA';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  // Validate that pass is confirmed, valid, and unexpired before rendering entry QR
  const isPassValid =
    Boolean(pass) &&
    pass.bookingConfirmationStatus === 'CONFIRMED' &&
    pass.ticketStatus === 'VALID' &&
    !isPassExpired;

  return (
    <main className="pass-page" aria-label="Attendee Digital Pass">
      {/* Page Header */}
      <header className="pass-page-header">
        {onBack && (
          <button
            type="button"
            className="action-btn no-print"
            onClick={onBack}
            style={{ alignSelf: 'flex-start', marginBottom: '8px' }}
          >
            ← Back to Home
          </button>
        )}
        <h1>Attendee Digital QR Pass</h1>
        <p className="pass-page-subtitle">
          Your verified smart pass for contactless venue admission
        </p>
      </header>

      {/* If Attendee is not signed in: Render Genuine Attendee Sign In form */}
      {!sessionUser || !token ? (
        <section
          className="state-card no-print"
          style={{ maxWidth: '440px', margin: '20px auto', textAlign: 'left' }}
        >
          <h2 style={{ fontSize: '20px', margin: '0 0 8px 0' }}>Attendee Sign In</h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Sign in with your registered email and password to securely view and present your digital QR pass (FR-012).
          </p>

          {loginError && (
            <div
              className="result error"
              style={{
                margin: '0 0 14px 0',
                padding: '10px 12px',
                borderLeft: '4px solid #ef4444',
                fontSize: '13px',
              }}
            >
              {loginError}
            </div>
          )}

          <form onSubmit={handleAttendeeLogin}>
            <div style={{ marginBottom: '12px' }}>
              <label
                htmlFor="attendeeEmail"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}
              >
                Email Address
              </label>
              <input
                id="attendeeEmail"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="alex.johnson@example.com"
                required
                autoComplete="username"
                disabled={loginLoading}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg, #1a1a1a)',
                  color: 'inherit',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="attendeePassword"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}
              >
                Password
              </label>
              <input
                id="attendeePassword"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                autoComplete="current-password"
                disabled={loginLoading}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg, #1a1a1a)',
                  color: 'inherit',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="action-btn action-primary"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                cursor: loginLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {loginLoading ? 'Authenticating...' : 'Sign In & View Digital Pass'}
            </button>
          </form>

          {/* Development-Only Email Shortcuts */}
          {import.meta.env.DEV && (
            <div
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border)',
                fontSize: '12px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>🛠️ Dev Mode Email Shortcuts:</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setLoginEmail('alex.johnson@example.com')}
                  style={{ padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Alex Johnson (Pass Owner)
                </button>
                <button
                  type="button"
                  onClick={() => setLoginEmail('sarah.connor@example.com')}
                  style={{ padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Sarah Connor (Different Attendee)
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Active Attendee Session Status Bar with Logout Action */}
          <div
            className="no-print"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '8px',
              maxWidth: '680px',
              width: '100%',
              margin: '0 auto 16px auto',
              fontSize: '13px',
              textAlign: 'left',
              flexWrap: 'wrap',
              gap: '8px',
              boxSizing: 'border-box',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Authenticated Attendee: </span>
              <strong>{sessionUser.fullName || sessionUser.name || sessionUser.email}</strong>{' '}
              <span
                style={{
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: 'var(--accent, #6366f1)',
                  padding: '2px 8px',
                  borderRadius: '100px',
                  fontSize: '11px',
                  fontWeight: 600,
                  marginLeft: '4px',
                }}
              >
                {sessionUser.role}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'inherit',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              🚪 Sign Out
            </button>
          </div>

          {/* Loading Attendee Confirmed Tickets */}
          {loadingTickets && (
            <div
              className="no-print"
              style={{ textAlign: 'center', margin: '10px 0 16px 0', fontSize: '13px', color: 'var(--text-muted)' }}
            >
              Loading your confirmed passes...
            </div>
          )}

          {/* Real Confirmed Tickets Selector ("for each confirmed ticket") */}
          {!loadingTickets && userTickets.length > 0 && (
            <section
              className="pass-toolbar no-print"
              style={{ maxWidth: '680px', width: '100%', margin: '0 auto 20px auto' }}
              aria-label="Your Confirmed Tickets"
            >
              <div className="toolbar-title">
                <span>🎟️ Your Confirmed Passes ({userTickets.length})</span>
              </div>
              <div className="toolbar-row">
                <span className="toolbar-label">Select Ticket:</span>
                <div className="ticket-pills">
                  {userTickets.map((t) => {
                    const id = t.ticketId || t.id;
                    const isActive = ticketId === id;
                    const isConfirmed = t.bookingConfirmationStatus === 'CONFIRMED' || t.status === 'CONFIRMED';
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`pill-btn ${isConfirmed ? 'pill-confirmed' : 'pill-warning'} ${
                          isActive ? 'active' : ''
                        }`}
                        onClick={() => setTicketId(id)}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <strong>{t.eventName || t.ticketTier || 'Ticket'}</strong> — {t.ticketTier || 'Admission'} ({id})
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Empty State when attendee has no confirmed tickets */}
          {!loadingTickets && userTickets.length === 0 && !loading && !pass && !error && (
            <section
              className="state-card no-print"
              style={{ margin: '16px auto 24px auto', maxWidth: '520px', width: '100%' }}
            >
              <div style={{ fontSize: '36px' }}>🎟️</div>
              <h2 className="state-title">No Confirmed Passes Found</h2>
              <p className="state-message">
                You do not currently have any confirmed ticket passes associated with your account.
              </p>
              {onBack && (
                <button
                  type="button"
                  className="action-btn action-primary"
                  onClick={onBack}
                  style={{ marginTop: '8px' }}
                >
                  Browse Events & Book Tickets
                </button>
              )}
            </section>
          )}

          {/* Collapsible Test Fixtures & Presets Toolbar */}
          <div
            className="no-print"
            style={{ maxWidth: '680px', width: '100%', margin: '0 auto 16px auto', boxSizing: 'border-box' }}
          >
            <button
              type="button"
              onClick={() => setShowTestFixtures((prev) => !prev)}
              style={{
                background: 'transparent',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>🛠️ Test Fixtures & Custom Ticket Search</span>
              <span>{showTestFixtures ? '▲ Hide' : '▼ Expand'}</span>
            </button>

            {showTestFixtures && (
              <section
                className="pass-toolbar"
                style={{ marginTop: '8px', marginBottom: '8px' }}
                aria-label="Ticket Test Controls"
              >
                <div className="toolbar-row">
                  <span className="toolbar-label">Test Presets:</span>
                  <div className="ticket-pills">
                    {PRESET_TICKETS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`pill-btn ${t.badgeType ? `pill-${t.badgeType}` : ''} ${
                          ticketId === t.id ? 'active' : ''
                        }`}
                        onClick={() => setTicketId(t.id)}
                      >
                        {t.label} ({t.id})
                      </button>
                    ))}
                  </div>
                </div>

                <form className="custom-id-form" onSubmit={handleCustomSearch}>
                  <input
                    type="text"
                    className="custom-id-input"
                    placeholder="Or enter any Ticket ID (e.g. TKT-CONFIRMED-001 or invalid ID)"
                    value={customInputId}
                    onChange={(e) => setCustomInputId(e.target.value)}
                  />
                  <button type="submit" className="custom-id-btn">
                    Load Pass
                  </button>
                </form>
              </section>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <section className="state-card" aria-live="polite">
              <div className="spinner" />
              <h2 className="state-title">Retrieving Digital Pass...</h2>
              <p className="state-message">
                Verifying cryptographic credentials and confirmed booking records with PassPulse server.
              </p>
            </section>
          )}

          {/* Error & Unconfirmed Booking State */}
          {!loading && error && (
            <section className="state-card" aria-live="assertive">
              <div style={{ fontSize: '40px' }}>
                {error.code === 'FORBIDDEN' ? '🔒' : error.code === 'UNCONFIRMED_BOOKING' ? '⏳' : error.code === 'EXPIRED_PASS' ? '⌛' : '⚠️'}
              </div>
              <h2 className="state-title">
                {error.code === 'FORBIDDEN'
                  ? 'Access Forbidden'
                  : error.code === 'UNCONFIRMED_BOOKING'
                  ? 'Booking Not Confirmed'
                  : error.code === 'EXPIRED_PASS'
                  ? 'Digital Pass Expired'
                  : error.code === 'TICKET_NOT_FOUND'
                  ? 'Ticket Not Found'
                  : error.code === 'UNAUTHORIZED'
                  ? 'Authentication Required'
                  : 'Pass Unavailable'}
              </h2>
              <p className="state-message">{error.message}</p>
              <span className="state-code">Code: {error.code} (HTTP {error.status})</span>

              <div className="state-actions">
                {error.status === 401 ? (
                  <button
                    type="button"
                    className="action-btn action-primary"
                    onClick={handleSignOut}
                  >
                    🔑 Sign In Again
                  </button>
                ) : (
                  <>
                    <button type="button" className="action-btn" onClick={loadPass}>
                      🔄 Try Again
                    </button>
                    {userTickets.length > 0 && (
                      <button
                        type="button"
                        className="action-btn action-primary"
                        onClick={() => {
                          setTicketId(userTickets[0].ticketId || userTickets[0].id);
                        }}
                      >
                        Load First Confirmed Pass
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {/* Valid Confirmed Digital Pass */}
          {!loading && !error && pass && (
            <div className="ticket-wrapper">
              <article className="ticket-card" id="digital-pass-card">
                {/* Event Header */}
                <header className="ticket-header">
                  <div className="ticket-header-top">
                    <span className="event-category-badge">{pass.eventCategory || 'Event'}</span>
                    <span
                      className={`ticket-status-badge ${
                        pass.bookingConfirmationStatus === 'CONFIRMED'
                          ? 'status-confirmed'
                          : 'status-pending'
                      }`}
                    >
                      ✓ {pass.bookingConfirmationStatus}
                    </span>
                  </div>

                  <h2 className="event-title">{pass.eventName}</h2>

                  <div className="event-meta-grid">
                    <div className="event-meta-item">
                      <span className="event-meta-icon" aria-hidden="true">📅</span>
                      <span>{formatDateTime(pass.eventDate)}</span>
                    </div>
                    <div className="event-meta-item">
                      <span className="event-meta-icon" aria-hidden="true">📍</span>
                      <span>{pass.venue}</span>
                    </div>
                  </div>
                </header>

                {/* Prominent QR Code Section (Only rendered for confirmed, valid, unexpired passes) */}
                {isPassValid && pass.qrCodeDataUrl ? (
                  <section className="ticket-qr-section" aria-label="Pass QR Code">
                    <div className="qr-frame">
                      <img
                        src={pass.qrCodeDataUrl}
                        alt={`PassPulse cryptographically signed entry QR code for ticket ${pass.ticketId}`}
                        className="qr-image"
                      />
                    </div>

                    <div className="qr-security-badge">
                      <span>🛡️</span>
                      <span>HMAC-SHA256 Cryptographically Signed</span>
                    </div>

                    <p className="qr-instruction">
                      Present this QR code on your mobile device at venue entrance gates.
                    </p>
                  </section>
                ) : (
                  <section className="ticket-qr-section" aria-label="Pass QR Code Unavailable">
                    <div
                      style={{
                        padding: '24px 16px',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '12px',
                        maxWidth: '280px',
                        margin: '0 auto',
                      }}
                    >
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
                      <strong style={{ display: 'block', fontSize: '14px', color: '#ef4444', marginBottom: '4px' }}>
                        QR Pass Unavailable
                      </strong>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                        {pass.bookingConfirmationStatus !== 'CONFIRMED'
                          ? 'Booking is unconfirmed'
                          : pass.ticketStatus !== 'VALID'
                          ? `Ticket status is ${pass.ticketStatus}`
                          : 'Pass has expired'}
                      </p>
                    </div>
                  </section>
                )}

                {/* Perforated Ticket Notch Divider */}
                <div className="ticket-divider" aria-hidden="true">
                  <div className="ticket-divider-notch-left" />
                  <div className="ticket-divider-line" />
                  <div className="ticket-divider-notch-right" />
                </div>

                {/* Attendee & Ticket Tier Details */}
                <section className="ticket-details" aria-label="Ticket and Attendee Information">
                  <div className="details-grid">
                    <div className="detail-block">
                      <span className="detail-label">Attendee Name</span>
                      <span className="detail-value">{pass.attendeeName}</span>
                    </div>

                    <div className="detail-block">
                      <span className="detail-label">Ticket Tier</span>
                      <span className="detail-value tier-highlight">{pass.ticketTier}</span>
                    </div>

                    <div className="detail-block">
                      <span className="detail-label">Ticket ID</span>
                      <span className="detail-value mono">{pass.ticketId}</span>
                    </div>

                    <div className="detail-block">
                      <span className="detail-label">Booking Reference</span>
                      <span className="detail-value mono">{pass.bookingReference || 'N/A'}</span>
                    </div>

                    <div className="detail-block">
                      <span className="detail-label">Attendee User ID</span>
                      <span className="detail-value mono">{pass.userId}</span>
                    </div>

                    <div className="detail-block">
                      <span className="detail-label">Ticket Status</span>
                      <span className="detail-value" style={{ color: '#059669' }}>
                        ● {pass.ticketStatus}
                      </span>
                    </div>

                    <div className="detail-block detail-block-full">
                      <span className="detail-label">Pass Valid Until</span>
                      <span className="expiry-text">{formatDateTime(pass.expiresAt)}</span>
                    </div>
                  </div>
                </section>
              </article>

              {/* Action Buttons Toolbar */}
              {isPassValid && (
                <footer className="ticket-actions no-print">
                  <button
                    type="button"
                    className="action-btn action-primary"
                    onClick={handleDownloadQr}
                    title="Download QR code image file (PNG)"
                  >
                    📥 Save QR Image
                  </button>

                  <button
                    type="button"
                    className="action-btn"
                    onClick={handlePrintPass}
                    title="Print ticket pass or save as PDF"
                  >
                    🖨️ Print Pass
                  </button>

                  <button
                    type="button"
                    className={`action-btn ${copied ? 'copied' : ''}`}
                    onClick={handleCopyPayload}
                    title="Copy signed QR payload string to test check-in scanner"
                  >
                    {copied ? '✓ QR Data Copied!' : '📋 Copy QR Payload'}
                  </button>

                  {onOpenScanner && (
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => onOpenScanner(pass.eventId)}
                      title="Switch to Gate Scanner with this event prefilled"
                    >
                      📱 Test at Gate Scanner
                    </button>
                  )}
                </footer>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default AttendeePass;

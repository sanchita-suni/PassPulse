import { useEffect, useState } from 'react';
import { fetchAttendeePass, fetchDemoToken } from '../services/passApi';
import './AttendeePass.css';

const PRESET_TICKETS = [
  {
    id: 'TKT-CONFIRMED-001',
    label: 'VIP Pass (Confirmed)',
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
    label: 'General Admission (Confirmed)',
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

const PRESET_USERS = [
  {
    id: 'USR-ATTENDEE-001',
    name: 'Alex Johnson',
    role: 'ATTENDEE',
    label: 'Alex Johnson (Authorized for TKT-001)',
  },
  {
    id: 'USR-DEMO-001',
    name: 'Demo Attendee',
    role: 'ATTENDEE',
    label: 'Demo User (USR-DEMO-001)',
  },
  {
    id: 'USR-ATTENDEE-002',
    name: 'Sarah Connor',
    role: 'ATTENDEE',
    label: 'Sarah Connor (Different Attendee / Tests 403)',
  },
  {
    id: 'UNAUTHENTICATED',
    name: 'Unauthenticated User',
    role: '',
    label: 'Logged Out (Tests 401 Unauthorized)',
  },
];

function AttendeePass({ initialTicketId = 'TKT-CONFIRMED-001', onBack, onOpenScanner }) {
  const [ticketId, setTicketId] = useState(initialTicketId);
  const [customInputId, setCustomInputId] = useState('');
  const [currentUser, setCurrentUser] = useState(PRESET_USERS[0]);
  const [token, setToken] = useState(null);

  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Authenticate / fetch token when user selection changes
  useEffect(() => {
    let isCancelled = false;

    async function updateAuth() {
      if (currentUser.id === 'UNAUTHENTICATED') {
        setToken(null);
        return;
      }

      try {
        const authData = await fetchDemoToken(currentUser.id);
        if (!isCancelled) {
          setToken(authData.token);
        }
      } catch {
        if (!isCancelled) {
          setToken(null);
        }
      }
    }

    updateAuth();

    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  const [reloadTrigger, setReloadTrigger] = useState(0);

  const loadPass = () => {
    setReloadTrigger((v) => v + 1);
  };

  useEffect(() => {
    let isCancelled = false;

    async function fetchPass() {
      if (!ticketId) return;

      setLoading(true);
      setError(null);

      try {
        const authToken = currentUser.id === 'UNAUTHENTICATED' ? null : token;
        const authUserId = currentUser.id === 'UNAUTHENTICATED' ? null : currentUser.id;

        const data = await fetchAttendeePass({
          ticketId: ticketId.trim(),
          token: authToken,
          userId: authUserId,
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
  }, [ticketId, token, currentUser, reloadTrigger]);

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
      // Fallback if clipboard API is unavailable
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

      {/* Interactive Switcher / Demo Controls (FR-012 Verification) */}
      <section className="pass-toolbar no-print" aria-label="Ticket and User Controls">
        <div className="toolbar-title">
          <span>⚙️ Verification & Test Controls</span>
        </div>

        {/* Preset Ticket Selector */}
        <div className="toolbar-row">
          <span className="toolbar-label">Select Ticket:</span>
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

        {/* Authenticated Identity Selector */}
        <div className="toolbar-row">
          <span className="toolbar-label">Active User:</span>
          <div className="ticket-pills">
            {PRESET_USERS.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`pill-btn ${currentUser.id === u.id ? 'active' : ''}`}
                onClick={() => setCurrentUser(u)}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Ticket ID Search */}
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
            <button type="button" className="action-btn" onClick={loadPass}>
              🔄 Try Again
            </button>
            <button
              type="button"
              className="action-btn action-primary"
              onClick={() => {
                setCurrentUser(PRESET_USERS[0]);
                setTicketId('TKT-CONFIRMED-001');
              }}
            >
              Reset to Valid Confirmed Pass
            </button>
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

            {/* Prominent QR Code Section */}
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

          {/* Action Buttons Toolbar (Section 3.F Convenience Features) */}
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
        </div>
      )}
    </main>
  );
}

export default AttendeePass;

# PassPulse — Requirements Traceability & Verification Status Matrix

**Project:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)
**Baseline Documents:** SRS v2.1, SAD v1.0, STP v1.0 (`docs/PassPulse_SRS_SAD_STP.pdf`)
**Document Status:** Sprint Execution Active Baseline
**Last Updated:** November 2026

---

## 1. Traceability Matrix Structure & Status Definitions

This matrix establishes traceability between the approved Software Requirements Specification (SRS), Software Architecture Design (SAD), Software Test Plan (STP), and the Sprint Backlog.

### Status Definitions

- **Working / Verified:** Feature code is implemented, automated tests exist, and the relevant tests have been run successfully.
- **Implemented / Pending Verification:** Feature code and tests exist, but the latest local test execution or integration verification is still pending.
- **Implemented / In Review:** Feature implementation is submitted for team review through a pull request.
- **Not Implemented / Planned:** Implementation has not yet been completed.

---

## 2. Master Traceability Matrix

### 2.1 Functional Requirements (FR-001 to FR-019)

| Req ID | Requirement Summary | Module & Owner | Sprint Story | Component / Source File | Planned Test Cases | Current Status | Empirical Evidence / Test Pass |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-001** | User registration with unique email, bcrypt password, and role assignment. | Auth / Saatvik | `STORY-AUTH-01` (S1) | `controllers/auth.controller.js`<br>`models/user.model.js` | `TC-AUTH-01`, `TC-AUTH-02` | Working / Verified | Verified in `tests/auth.test.js`. Rejects duplicate emails with 409 Conflict. |
| **FR-002** | Password hashing via bcrypt with salt rounds ≥ 10. | Auth / Saatvik | `STORY-AUTH-01` (S1) | `utils/password.util.js` | `TC-AUTH-03` | Working / Verified | Verified in `tests/auth.test.js`. |
| **FR-003** | JWT Bearer token authentication and role restriction (401/403). | Auth / Saatvik | `STORY-AUTH-02` (S1) | `middleware/auth.middleware.js`<br>`middleware/rbac.middleware.js` | `TC-AUTH-04`, `TC-AUTH-05` | Working / Verified | Verified in `tests/auth.test.js` and `attendeePass.routes.test.js`. |
| **FR-004** | Event catalog search and multi-parameter filtering (category, date, venue, price). | Events / Sanchita | `STORY-EVT-01` (S1)<br>`STORY-EVT-02` (S1) | `controllers/event.controller.js`<br>`client/src/pages/Catalog.jsx` | `TC-EVT-01`, `TC-EVT-02` | Not Implemented / Planned | Event catalog implementation remains assigned to the Events module. |
| **FR-005** | Organizer event creation, editing, scheduling, and draft management. | Events / Sanchita | `STORY-EVT-03` (S2) | `controllers/event.controller.js`<br>`routes/event.routes.js` | `TC-EVT-03` | Not Implemented / Planned | Requires organizer role protection through RBAC. |
| **FR-006** | Formal event lifecycle state machine (`DRAFT` → `LIVE` → `COMPLETED`). | Events / Sanchita | `STORY-EVT-03` (S2) | `services/event_state.service.js` | `TC-EVT-04` | Not Implemented / Planned | State transitions are defined in the SAD. |
| **FR-007** | Organizer ticket tier definition (Early Bird, VIP) with independent quotas and prices. | Booking / Reet | `STORY-BKG-01` (S1) | `models/tier.model.js`<br>`controllers/tier.controller.js` | `TC-TCK-01` | Not Implemented / Planned | Database and validation implementation assigned to Booking module. |
| **FR-008** | 10-minute temporary seat reservation hold using Redis key TTL 600 seconds. | Booking / Reet | `STORY-BKG-02` (S1) | `services/hold.service.js`<br>`routes/booking.routes.js` | `TC-BKG-01` | Not Implemented / Planned | Hold service implementation assigned to Booking module. |
| **FR-009** | Automatic return of held seats to stock upon hold expiration. | Booking / Reet | `STORY-BKG-02` (S1) | `services/hold.service.js` | `TC-BKG-02` | Not Implemented / Planned | Requires hold expiration handling. |
| **FR-010** | Atomic booking confirmation in a single PostgreSQL transaction (`FOR UPDATE`). | Booking / Reet | `STORY-BKG-03` (S2) | `controllers/booking.controller.js`<br>`services/booking.service.js` | `TC-BKG-03`, `TC-PERF-03` | Not Implemented / Planned | Core concurrency requirement to prevent overselling. |
| **FR-011** | Dynamic QR pass generation with HMAC-SHA256 signature and PNG data URL. | QR / Sambhram | `STORY-QR-01` (S1) | `services/qr.service.js`<br>`controllers/qr.controller.js` | `TC-QR-01`, `TC-QR-04`, `TC-QR-05` | Working / Verified | Verified in `qr.service.test.js` and `qr.routes.test.js`. |
| **FR-012** | Client pass presentation screen with attendee name, tier, and QR code. | QR / Sambhram | `STORY-INT-01` (S1) | `client/src/pages/AttendeePass.jsx`<br>`client/src/services/passApi.js` | `TC-UX-02` | Working / Verified | Implemented in PR #47. |
| **FR-013** | Gate staff device camera pass scanning and signature/expiry verification. | Scanner / Sambhram | `STORY-SCN-01` (S1)<br>`STORY-SCN-02` (S2) | `services/checkin.service.js`<br>`client/src/pages/GateScanner.jsx` | `TC-QR-02`, `TC-QR-03`, `TC-SCN-03` | Working / Verified | QR verification and scanner functionality are covered by the check-in and QR test suites. |
| **FR-014** | Record first scan as `CHECKED_IN`; reject subsequent scans as `DUPLICATE_ENTRY`. | Scanner / Sambhram | `STORY-SCN-01` (S1) | `server/src/services/checkin.service.js`<br>`server/src/controllers/checkin.controller.js`<br>`server/src/routes/checkin.routes.js` | `TC-SCN-01`, `TC-SCN-02` | Implemented / In Review | Issue #26 implementation submitted in PR #50. Includes ticket and booking status validation, duplicate-scan prevention, and in-process concurrency protection. |
| **FR-015** | Attendee joins FIFO waitlist when ticket tier available seats reach zero. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js` | `TC-WTL-01` | Not Implemented / Planned | Waitlist implementation assigned to Booking module. |
| **FR-016** | Automatic email notification and 15-minute slot reservation for waitlist head on cancellation. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js` | `TC-WTL-02`, `TC-WTL-03` | Not Implemented / Planned | Background queue handler and notification implementation remain planned. |
| **FR-017** | Real-time check-in scan velocity and attendance percentage on organizer dashboard. | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `routes/telemetry.routes.js`<br>`client/src/pages/Dashboard.jsx` | `TC-ANL-01` | Not Implemented / Planned | Dashboard telemetry implementation remains planned. |
| **FR-018** | Export attendance and revenue summaries as downloadable CSV and PDF files. | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `services/report.service.js` | `TC-ANL-02` | Not Implemented / Planned | Report export implementation remains planned. |
| **FR-019** | Admin event moderation (approve/flag/remove) and user account deactivation. | Admin / Saatvik | `STORY-ADM-01` (S2) | `controllers/admin.controller.js`<br>`routes/admin.routes.js` | `TC-ADM-01`, `TC-ADM-02` | Not Implemented / Planned | Requires admin role protection through RBAC. |

### 2.2 Non-Functional Requirements

| Req ID | Requirement Summary | Module & Owner | Sprint Story | Component / Source File | Planned Test Cases | Current Status | Empirical Evidence / Test Pass |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **NFR-004** | Health checks and availability monitoring (≥ 99.5% uptime target, liveness/readiness probes, dependency diagnostics). | Infrastructure / Sambhram | `STORY-OPS-01` (S1 / Issue #35) | `server/src/controllers/health.controller.js`<br>`server/src/services/health.service.js`<br>`server/src/routes/health.routes.js` | `TC-OPS-01` | Implemented / Pending Verification | Implements `/api/health`, `/api/health/live`, and `/api/health/ready`. Readiness checks dependency availability and can return 503 when dependencies are unavailable. Combined local test verification is pending. |

---

## 3. Implementation Details

### 3.1 Issue #26 — Duplicate Check-in Prevention (FR-014)

The check-in implementation includes:

- Validates that the ticket status is `VALID`.
- Validates that the booking confirmation status is `CONFIRMED`.
- Cross-checks ticket information against the ticket service.
- Prevents a second successful check-in for the same ticket.
- Returns a duplicate-entry response when a ticket has already been checked in.
- Uses an in-process lock to prevent simultaneous duplicate check-ins within a single server process.
- Provides helper functions to retrieve check-in records and counts.
- Includes service-level and route-level tests.

**Implementation files:**

- `server/src/services/checkin.service.js`
- `server/src/controllers/checkin.controller.js`
- `server/src/services/checkin.service.test.js`
- `server/src/routes/checkin.routes.test.js`

**Pull request:** PR #50
**Branch:** `feature/issue-26-duplicate-checkin`
**Issue:** #26

**Implementation limitation:** The current in-process lock does not provide distributed locking across multiple server instances. Database-level atomicity or distributed locking is required for a multi-instance production deployment.

### 3.2 Issue #35 — Health Checks and Availability Monitoring (NFR-004)

The health monitoring implementation introduces separate health service, controller, and route modules.

**Endpoints:**

| Endpoint | Purpose |
| :--- | :--- |
| `GET /api/health` | General health status and process telemetry. |
| `GET /api/health/live` | Liveness probe indicating whether the application process is running. |
| `GET /api/health/ready` | Readiness probe checking whether the application is ready to serve requests. |
| `GET /api/health?detailed=true` | Detailed health diagnostics. |

**Readiness behavior:**

- Checks PostgreSQL connectivity using a database query when database configuration is present.
- Supports an in-memory fallback when `DATABASE_URL` is not configured.
- Checks the availability of in-memory stores.
- Uses a timeout for the database readiness check.
- Returns HTTP 200 when readiness checks succeed.
- Returns HTTP 503 when a required dependency is unavailable.

**Process telemetry includes:**

- Uptime
- Timestamp
- Application version
- Environment
- Process ID
- Memory usage

**Implementation files:**

- `server/src/services/health.service.js`
- `server/src/controllers/health.controller.js`
- `server/src/routes/health.routes.js`
- `server/src/routes/health.routes.test.js`
- `server/src/app.js`

**Issue:** #35

**Implementation limitations:**

- Redis health checking is not included yet.
- The health endpoints do not independently prove the 99.5% uptime target. Uptime must be measured over time using monitoring.
- The readiness implementation should be reviewed for production database connection-management requirements.

---

## 4. Current Test Suite Status

The Issue #26 implementation was locally tested with:

```bash
npm --prefix server test -- --runInBand
```

**Recorded Issue #26 test result:**

```text
Test Suites: 7 passed, 7 total
Tests:       59 passed, 59 total
```

Issue #35 adds a health route test suite. The combined test result must be updated after running the complete backend test suite on the `feature/issue-35-health-checks` branch.

### Test Suite Inventory

| Suite File | Module | Verification Status |
| :--- | :--- | :--- |
| `tests/auth.test.js` | Authentication & RBAC | Previously passed |
| `src/routes/qr.routes.test.js` | QR Pass Generation API | Previously passed |
| `src/services/qr.service.test.js` | QR Cryptographic Signatures | Previously passed |
| `src/services/ticket.service.test.js` | Ticket Metadata & Formatting | Previously passed |
| `src/services/checkin.service.test.js` | Check-in Validation and Duplicate Prevention | Previously passed |
| `src/routes/attendeePass.routes.test.js` | Digital Pass Retrieval & Authentication | Previously passed |
| `src/routes/checkin.routes.test.js` | Gate Check-in API & Duplicate Check | Previously passed |
| `src/routes/health.routes.test.js` | Health Checks & Availability Monitoring (NFR-004) | Added for Issue #35; combined verification pending |

### Latest Combined Test Result

Update this section after running the complete test suite on the Issue #35 branch.

```text
Test Suites: Pending local verification
Tests:       Pending local verification
Status:      Pending local verification
```

---

## 5. Verification and Evidence Guidelines

A requirement should only be marked **Working / Verified** when:

1. The implementation is present in the repository.
2. Relevant automated tests exist.
3. The tests have been executed successfully.
4. The test result is recorded in this document.
5. Any known implementation limitations are documented.

A requirement submitted through a pull request should remain **Implemented / In Review** until the team has reviewed and merged it.

A requirement should not be marked fully verified merely because code has been written or a test suite has been generated.

---

## 6. Pending Work and Known Limitations

- Complete local verification of the Issue #35 health monitoring implementation.
- Update the combined test-suite and test-case counts after successful execution.
- Complete team review and merge of PR #50 for Issue #26.
- Submit Issue #35 as a separate pull request from its own feature branch.
- Add Redis dependency health checks when Redis integration is introduced.
- Use database-level atomicity or distributed locking for duplicate check-in protection in a multi-instance deployment.
- Establish ongoing uptime monitoring to verify the 99.5% availability target.

---

**Document maintenance:** Update this matrix whenever a requirement is implemented, tested, reviewed, merged, or deferred. Keep implementation status and test evidence aligned with the actual repository state.

# PassPulse — Requirements Traceability & Verification Status Matrix

**Project:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)  
**Baseline Documents:** SRS v2.1, SAD v1.0, STP v1.0 (`docs/PassPulse_SRS_SAD_STP.pdf`)  
**Document Status:** Sprint Execution Active Baseline (Updated October 2026)  

---

## 1. Traceability Matrix Structure & Status Definitions

This matrix establishes bidirectionality between the approved Software Requirements Specification (SRS), Software Architecture Design (SAD), Software Test Plan (STP), and the Sprint Backlog.

### Status Definitions
* **Working / Verified (Green):** Feature code is written, automated test cases exist, and execution has been empirically verified (100% pass rate in automated test suites).
* **Implemented / In Review (Yellow):** Feature code exists in the repository, passing unit tests, with integration / production hardening in progress.
* **Not Implemented / Planned (Red):** Feature is scheduled in Sprint 1 or Sprint 2 backlog; code implementation has not yet commenced.

---

## 2. Master Traceability Matrix

### 2.1 Functional Requirements (FR-001 to FR-019)

| Req ID | Requirement Summary | Module & Owner | Sprint Story | Component / Source File | Planned Test Cases | Current Status | Empirical Evidence / Test Pass |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **FR-001** | User registration with unique email, bcrypt password, role assignment. | Auth / Saatvik | `STORY-AUTH-01` (S1) | `controllers/auth.controller.js`<br>`models/user.model.js` | `TC-AUTH-01`<br>`TC-AUTH-02` | **Working / Verified** | Verified in `tests/auth.test.js`. Rejects duplicate emails with 409 Conflict. |
| **FR-002** | Password hashing via bcrypt with salt rounds $\ge 10$. | Auth / Saatvik | `STORY-AUTH-01` (S1) | `utils/password.util.js` | `TC-AUTH-03` | **Working / Verified** | Verified in `tests/auth.test.js`. Hashes match `$2a$10$...`. Zero plain text in memory. |
| **FR-003** | JWT Bearer token authentication & role restriction (401/403). | Auth / Saatvik | `STORY-AUTH-02` (S1) | `middleware/auth.middleware.js`<br>`middleware/rbac.middleware.js` | `TC-AUTH-04`<br>`TC-AUTH-05` | **Working / Verified** | Verified in `tests/auth.test.js` & `attendeePass.routes.test.js`. Enforces 401/403 guards. |
| **FR-004** | Event catalog search & multi-parameter filtering (category, date, venue, price). | Events / Sanchita | `STORY-EVT-01` (S1)<br>`STORY-EVT-02` (S1) | `services/event.service.js`<br>`routes/event.routes.js`<br>`client/src/pages/EventCatalog.jsx` | `TC-EVT-01`<br>`TC-EVT-02` | **Working / Verified** | Verified in `tests/events.test.js` (19 tests): every filter alone and combined, PUBLISHED/LIVE only, empty result returns 200 with "No events found", invalid filters return 400. Issue #16. |
| **FR-005** | Organizer event creation, editing, scheduling, and draft management. | Events / Sanchita | `STORY-EVT-03` (S2) | `services/event.service.js`<br>`controllers/event.controller.js`<br>`client/src/pages/OrganizerDashboard.jsx` | `TC-EVT-03` | **Working / Verified** | Verified in `tests/event_management.test.js` (20 tests): new events saved as DRAFT, another organizer gets 403 `NOT_EVENT_OWNER`, closed events return 409. Issue #17. |
| **FR-006** | Formal event lifecycle state machine (`DRAFT` $\to$ `LIVE` $\to$ `COMPLETED`). | Events / Sanchita | `STORY-EVT-03` (S2) | `services/event_state.service.js`<br>`PATCH /api/events/:id/status` | `TC-EVT-04`<br>`TC-EVT-05` | **Working / Verified** | Verified in `tests/event_lifecycle.test.js` (16 tests): illegal moves return 409 `INVALID_TRANSITION`, publishing is admin-only, BR-005 and BR-006 enforced. Issue #18. |
| **FR-007** | Organizer ticket tier definition (Early Bird, VIP) with independent quotas/prices. | Events / Sanchita | `STORY-BKG-01` (S1) | `services/tier.service.js`<br>`controllers/tier.controller.js`<br>`client/src/components/TierManager.jsx` | `TC-TCK-01` | **Working / Verified** | Verified in `tests/tiers.test.js` (16 tests): zero quota or negative price return 400, total quota within capacity, unique names, BR-001 max 5 per order. Issue #19 (assigned to Sanchita on GitHub). |
| **FR-008** | 10-minute temporary seat reservation hold using Redis key TTL 600 s. | Booking / Reet | `STORY-BKG-02` (S1) | `services/hold.service.js`<br>`routes/booking.routes.js` | `TC-BKG-01` | **Not Implemented / Planned** | Redis container available in `docker-compose.yml`. Hold service logic scheduled for Sprint 1. |
| **FR-009** | Automatic return of held seats to stock upon hold expiration. | Booking / Reet | `STORY-BKG-02` (S1) | `services/hold.service.js` | `TC-BKG-02` | **Not Implemented / Planned** | Scheduled for Sprint 1. Requires Redis keyspace notification or TTL polling check. |
| **FR-010** | Atomic booking confirmation in single PostgreSQL transaction (`FOR UPDATE`). | Booking / Reet | `STORY-BKG-03` (S2) | `controllers/booking.controller.js`<br>`services/booking.service.js` | `TC-BKG-03`<br>`TC-PERF-03` | **Not Implemented / Planned** | Core concurrency requirement to prevent overselling. Scheduled for Sprint 2. |
| **FR-011** | Dynamic QR pass generation with HMAC-SHA256 signature and PNG data URL. | QR / Sambhram | `STORY-QR-01` (S1) | `services/qr.service.js`<br>`controllers/qr.controller.js` | `TC-QR-01`<br>`TC-QR-04`<br>`TC-QR-05` | **Working / Verified** | Verified in `qr.service.test.js` & `qr.routes.test.js`. Generates 64-hex HMAC signature. |
| **FR-012** | Client pass presentation screen with attendee name, tier, and QR code. | QR / Sambhram | `STORY-INT-01` (S1) | `client/src/pages/AttendeePass.jsx`<br>`client/src/services/passApi.js` | `TC-UX-02` | **Working / Verified** | Verified in `attendeePass.routes.test.js` & React UI. Supported by PR #47. Authenticates via POST /api/auth/login. |
| **FR-013** | Gate staff device camera pass scanning, signature/expiry verification, and RBAC authentication guard. | Scanner / Sambhram | `STORY-SCN-01` (S1)<br>`STORY-SCN-02` (S2) | `services/checkin.service.js`<br>`routes/checkin.routes.js`<br>`client/src/pages/GateScanner.jsx`<br>`client/src/components/StaffLogin.jsx` | `TC-QR-02`<br>`TC-QR-03`<br>`TC-SCN-03` | **Working / Verified** | Verified in `checkin.routes.test.js` (20 tests), `StaffLogin.jsx` & `GateScanner.jsx`. Enforces 401 unauthenticated and 403 attendee guards, restricting scans to GATE_STAFF, STAFF, and ADMIN with genuine JWTs. |
| **FR-014** | Record first scan as `CHECKED_IN`; reject subsequent scans as `DUPLICATE_ENTRY`. | Scanner / Sambhram | `STORY-SCN-01` (S1) | `services/checkin.service.js`<br>`routes/checkin.routes.js` | `TC-SCN-01`<br>`TC-SCN-02` | **Working / Verified** | Verified in `checkin.routes.test.js` & `checkin.service.test.js`. Enforces atomic check-and-set, ISO timestamp storage, duplicate rejection (409), and concurrency safety under simultaneous scans. |
| **FR-015** | Attendee joins FIFO waitlist when ticket tier available seats reach zero. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js` | `TC-WTL-01` | **Not Implemented / Planned** | Scheduled for Sprint 2 using Redis list data structures (`RPUSH`). |
| **FR-016** | Automatic email notification & 15-minute slot reservation for waitlist head on cancel. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js` | `TC-WTL-02`<br>`TC-WTL-03` | **Not Implemented / Planned** | Scheduled for Sprint 2. Background queue handler to be implemented. |
| **FR-017** | Real-time check-in scan velocity and attendance percentage on organizer dashboard. | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `routes/telemetry.routes.js`<br>`client/src/pages/Dashboard.jsx` | `TC-ANL-01` | **Not Implemented / Planned** | Scheduled for Sprint 2 via Server-Sent Events (SSE). |
| **FR-018** | Export attendance and revenue summaries as downloadable CSV and PDF files. | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `services/report.service.js` | `TC-ANL-02` | **Not Implemented / Planned** | Scheduled for Sprint 2. |
| **FR-019** | Admin event moderation (approve/flag/remove) and user account deactivation. | Admin / Sanchita | `STORY-ADM-01` (S2) | `services/admin.service.js`<br>`routes/admin.routes.js`<br>`client/src/pages/AdminPanel.jsx` | `TC-ADM-01`<br>`TC-ADM-02` | **Working / Verified** | Verified in `tests/admin.test.js` (16 tests): `/api/admin/*` is ADMIN only, approve, reject, flag, remove, and a deactivated user's next request returns 401. Issue #31 (assigned to Sanchita on GitHub). |


### 2.2 Non-functional, Security and Operations Items (Sanchita)

| Req ID | Summary | Issue | Evidence | Status |
| :--- | :--- | :---: | :--- | :---: |
| **NFR-001** | Catalog search p95 within 150 ms at 500 concurrent users | #32 | `tests/perf/search.perf.test.js` in CI; `npm run bench:search`; results in `docs/perf/NFR-001_Search_Performance.md` (500 users with 1 s pause: p95 16.2 ms; back-to-back: p95 187.3 ms, see DEV-007) | **Working / Verified** |
| **NFR-005** | Home to confirmed booking in 4 screens or fewer | #36 | 4-screen flow with progress bar; `docs/NFR-005_Booking_Journey.md`. Booking API pending (DEV-008); 5-user walkthrough not yet run | **Implemented / In Review** |
| **NFR-006** | Jest statement and branch coverage at or above 80% | #37 | Coverage gate in `server/package.json` and CI. Current: 94.43% statements, 86.92% branches, 94.25% lines | **Working / Verified** |
| **SEC-004** | TLS 1.3 outside localhost, HTTP redirected | #42 | `deploy/nginx/proxy.conf`; `scripts/check-tls.sh` 5/5 checks pass (TLS 1.3 accepted, TLS 1.2 rejected, 301 to HTTPS, HSTS, API through proxy) | **Working / Verified** |
| **OPS-001** | PostgreSQL schema with keys and constraints | #45 | `server/db/schema.sql`; `tests/schema.test.js` (10 tests); `npm run db:init` applied to PostgreSQL 16 | **Working / Verified** |
| **OPS-002** | Full stack with Docker Compose | #46 | `docker-compose.yml`, `server/Dockerfile`, `client/Dockerfile`; `docker compose config` valid | **Working / Verified** |

---

## 3. Current Test Suite Status (Empirically Verified)

```
Test Suites: 14 passed, 14 total
Tests:       186 passed, 186 total
Coverage:    94.43% statements, 86.92% branches, 94.25% lines (gate: 80%)
Status:      100% pass rate across all unit, integration and performance suites
```

| Suite File | Module | Test Cases Passed | Status |
| :--- | :--- | :---: | :---: |
| `tests/auth.test.js` | Authentication, Privilege Escalation Guard, Admin Provisioning & Seeding Isolation | 22 | **PASSED** |
| `src/routes/qr.routes.test.js` | QR Pass Generation API & Token Security | 8 | **PASSED** |
| `src/services/qr.service.test.js` | QR Cryptographic Signatures | 4 | **PASSED** |
| `src/services/ticket.service.test.js` | Ticket Metadata & Formatting | 10 | **PASSED** |
| `src/services/checkin.service.test.js` | Check-in Validation Logic & Concurrency | 11 | **PASSED** |
| `src/routes/attendeePass.routes.test.js` | Digital Pass Retrieval & Auth | 12 | **PASSED** |
| `src/routes/checkin.routes.test.js` | Gate Check-in API, Duplicate Check & Gate Staff RBAC | 20 | **PASSED** |
| `tests/schema.test.js` | PostgreSQL Schema Constraints (OPS-001) | 10 | **PASSED** |
| `tests/events.test.js` | Catalog Search & Filters (FR-004) | 19 | **PASSED** |
| `tests/event_management.test.js` | Organizer Event Management (FR-005) | 20 | **PASSED** |
| `tests/tiers.test.js` | Ticket Tiers (FR-007, BR-001) | 16 | **PASSED** |
| `tests/event_lifecycle.test.js` | Lifecycle, BR-005, BR-006 (FR-006) | 16 | **PASSED** |
| `tests/admin.test.js` | Admin Moderation & Deactivation (FR-019) | 16 | **PASSED** |
| `tests/perf/search.perf.test.js` | Catalog Search Performance (NFR-001) | 2 | **PASSED** |
| **Total** | | **186** | **ALL GREEN** |

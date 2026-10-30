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
| **FR-004** | Event catalog search & multi-parameter filtering (category, date, venue, price). | Events / Sanchita | `STORY-EVT-01` (S1)<br>`STORY-EVT-02` (S1) | `controllers/event.controller.js`<br>`client/src/pages/Catalog.jsx` | `TC-EVT-01`<br>`TC-EVT-02` | **Not Implemented / Planned** | Client has starter Vite boilerplate. Event controller and routes scheduled for Sprint 1. |
| **FR-005** | Organizer event creation, editing, scheduling, and draft management. | Events / Sanchita | `STORY-EVT-03` (S2) | `controllers/event.controller.js`<br>`routes/event.routes.js` | `TC-EVT-03` | **Not Implemented / Planned** | Scheduled for Sprint 2. Requires RBAC `ORGANIZER` role guard from `STORY-AUTH-02`. |
| **FR-006** | Formal event lifecycle state machine (`DRAFT` $\to$ `LIVE` $\to$ `COMPLETED`). | Events / Sanchita | `STORY-EVT-03` (S2) | `services/event_state.service.js` | `TC-EVT-04` | **Not Implemented / Planned** | State machine transitions defined in SAD Fig B-3; scheduled for Sprint 2. |
| **FR-007** | Organizer ticket tier definition (Early Bird, VIP) with independent quotas/prices. | Booking / Reet | `STORY-BKG-01` (S1) | `models/tier.model.js`<br>`controllers/tier.controller.js` | `TC-TCK-01` | **Not Implemented / Planned** | Schema designed in SAD 3.6; database table and validation logic scheduled for Sprint 1. |
| **FR-008** | 10-minute temporary seat reservation hold using Redis key TTL 600 s. | Booking / Reet | `STORY-BKG-02` (S1) | `services/hold.service.js`<br>`routes/booking.routes.js` | `TC-BKG-01` | **Not Implemented / Planned** | Redis container available in `docker-compose.yml`. Hold service logic scheduled for Sprint 1. |
| **FR-009** | Automatic return of held seats to stock upon hold expiration. | Booking / Reet | `STORY-BKG-02` (S1) | `services/hold.service.js` | `TC-BKG-02` | **Not Implemented / Planned** | Scheduled for Sprint 1. Requires Redis keyspace notification or TTL polling check. |
| **FR-010** | Atomic booking confirmation in single PostgreSQL transaction (`FOR UPDATE`). | Booking / Reet | `STORY-BKG-03` (S2) | `controllers/booking.controller.js`<br>`services/booking.service.js` | `TC-BKG-03`<br>`TC-PERF-03` | **Not Implemented / Planned** | Core concurrency requirement to prevent overselling. Scheduled for Sprint 2. |
| **FR-011** | Dynamic QR pass generation with HMAC-SHA256 signature and PNG data URL. | QR / Sambhram | `STORY-QR-01` (S1) | `services/qr.service.js`<br>`controllers/qr.controller.js` | `TC-QR-01`<br>`TC-QR-04`<br>`TC-QR-05` | **Working / Verified** | Verified in `qr.service.test.js` & `qr.routes.test.js`. Generates 64-hex HMAC signature. |
| **FR-012** | Client pass presentation screen with attendee name, tier, and QR code. | QR / Sambhram | `STORY-INT-01` (S1) | `client/src/pages/AttendeePass.jsx`<br>`client/src/services/passApi.js` | `TC-UX-02` | **Working / Verified** | Verified in `attendeePass.routes.test.js` & React UI. Supported by PR #47. |
| **FR-013** | Gate staff device camera pass scanning and signature/expiry verification. | Scanner / Sambhram | `STORY-SCN-01` (S1)<br>`STORY-SCN-02` (S2) | `services/checkin.service.js`<br>`client/src/pages/GateScanner.jsx` | `TC-QR-02`<br>`TC-QR-03`<br>`TC-SCN-03` | **Working / Verified** | Constant-time HMAC comparison verified in `checkin.service.test.js`. Scanner UI merged in PR #47. |
| **FR-014** | Record first scan as `CHECKED_IN`; reject subsequent scans as `DUPLICATE_ENTRY`. | Scanner / Sambhram | `STORY-SCN-01` (S1) | `services/checkin.service.js`<br>`routes/checkin.routes.js` | `TC-SCN-01`<br>`TC-SCN-02` | **Working / Verified** | Verified in `checkin.routes.test.js`. Returns 200 on 1st scan, 409 on subsequent scans. |
| **FR-015** | Attendee joins FIFO waitlist when ticket tier available seats reach zero. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js` | `TC-WTL-01` | **Not Implemented / Planned** | Scheduled for Sprint 2 using Redis list data structures (`RPUSH`). |
| **FR-016** | Automatic email notification & 15-minute slot reservation for waitlist head on cancel. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js` | `TC-WTL-02`<br>`TC-WTL-03` | **Not Implemented / Planned** | Scheduled for Sprint 2. Background queue handler to be implemented. |
| **FR-017** | Real-time check-in scan velocity and attendance percentage on organizer dashboard. | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `routes/telemetry.routes.js`<br>`client/src/pages/Dashboard.jsx` | `TC-ANL-01` | **Not Implemented / Planned** | Scheduled for Sprint 2 via Server-Sent Events (SSE). |
| **FR-018** | Export attendance and revenue summaries as downloadable CSV and PDF files. | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `services/report.service.js` | `TC-ANL-02` | **Not Implemented / Planned** | Scheduled for Sprint 2. |
| **FR-019** | Admin event moderation (approve/flag/remove) and user account deactivation. | Admin / Saatvik | `STORY-ADM-01` (S2) | `controllers/admin.controller.js`<br>`routes/admin.routes.js` | `TC-ADM-01`<br>`TC-ADM-02` | **Not Implemented / Planned** | Scheduled for Sprint 2. Requires RBAC admin role protection. |

---

## 3. Current Test Suite Status (Empirically Verified)

```
Test Suites: 7 passed, 7 total
Tests:       47 passed, 47 total
Snapshots:   0 total
Status:      100% Pass Rate across all unit and integration suites
```

| Suite File | Module | Test Cases Passed | Status |
| :--- | :--- | :---: | :---: |
| `tests/auth.test.js` | Authentication & RBAC | 10 | **PASSED** |
| `src/routes/qr.routes.test.js` | QR Pass Generation API | 3 | **PASSED** |
| `src/services/qr.service.test.js` | QR Cryptographic Signatures | 3 | **PASSED** |
| `src/services/ticket.service.test.js` | Ticket Metadata & Formatting | 10 | **PASSED** |
| `src/services/checkin.service.test.js` | Check-in Validation Logic | 4 | **PASSED** |
| `src/routes/attendeePass.routes.test.js` | Digital Pass Retrieval & Auth | 13 | **PASSED** |
| `src/routes/checkin.routes.test.js` | Gate Check-in API & Duplicate Check | 4 | **PASSED** |
| **Total** | | **47** | **ALL GREEN** |

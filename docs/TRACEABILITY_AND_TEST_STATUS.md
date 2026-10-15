# PassPulse — Requirements Traceability & Verification Status Matrix

**Project:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)  
**Baseline Documents:** SRS v2.1, SAD v1.0, STP v1.0 (`docs/PassPulse_SRS_SAD_STP.pdf`)  
**Document Status:** Baseline Traceability Audit (Pre-Sprint Review)  

---

## 1. Traceability Matrix Structure & Status Definitions

This matrix establishes bidirectionality between the approved Software Requirements Specification (SRS), Software Architecture Design (SAD), Software Test Plan (STP), and the Sprint Backlog.

### Status Definitions
* **Working / Verified (Green):** Feature code is written, automated test cases exist, and execution has been empirically verified.
* **Implemented / Unverified (Yellow):** Feature code exists in the repository (on `main` or a feature branch), but execution is currently unverified due to missing dependencies, unmerged state, or in-memory mock storage.
* **Not Implemented / Planned (Red):** Feature is scheduled in Sprint 1 or Sprint 2 backlog; code implementation has not yet commenced.

---

## 2. Master Traceability Matrix

### 2.1 Functional Requirements (FR-001 to FR-019)

| Req ID | Requirement Summary | Module & Owner | Sprint Story | Component / Source File | Planned Test Cases | Current Status | Empirical Evidence / Gap Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **FR-001** | User registration with unique email, bcrypt password, role assignment. | Auth / Saatvik | `STORY-AUTH-01` (S1) | `controllers/auth.controller.js`<br>`models/user.model.js` | `TC-AUTH-01`<br>`TC-AUTH-02` | **Implemented / Unverified on main** | Fully implemented and passing on branch `feature/auth-rbac` (10/10 tests pass). Pending PR merge into `main`. |
| **FR-002** | Password hashing via bcrypt with salt rounds $\ge 10$. | Auth / Saatvik | `STORY-AUTH-01` (S1) | `utils/password.util.js` | `TC-AUTH-03` | **Implemented / Unverified on main** | Verified on `feature/auth-rbac`. Stored hash begins with `$2a$` with 10 salt rounds. Pending merge. |
| **FR-003** | JWT Bearer token authentication & role restriction (401/403). | Auth / Saatvik | `STORY-AUTH-02` (S1) | `middleware/auth.middleware.js`<br>`middleware/rbac.middleware.js` | `TC-AUTH-04`<br>`TC-AUTH-05` | **Implemented / Unverified on main** | Verified on `feature/auth-rbac`. Unmerged to `main`. `app.js` on `main` currently lacks auth router mounting. |
| **FR-004** | Event catalog search & multi-parameter filtering (category, date, venue, price). | Events / Sanchita | `STORY-EVT-01` (S1)<br>`STORY-EVT-02` (S1) | `controllers/event.controller.js`<br>`client/src/pages/Catalog.jsx` | `TC-EVT-01`<br>`TC-EVT-02` | **Not Implemented / Planned** | Client has starter Vite boilerplate. Event controller and routes not yet created. Scheduled for Sprint 1. |
| **FR-005** | Organizer event creation, editing, scheduling, and draft management. | Events / Sanchita | `STORY-EVT-03` (S2) | `controllers/event.controller.js`<br>`routes/event.routes.js` | `TC-EVT-03` | **Not Implemented / Planned** | Scheduled for Sprint 2. Requires RBAC `ORGANIZER` role guard from `STORY-AUTH-02`. |
| **FR-006** | Formal event lifecycle state machine (`DRAFT` $\to$ `LIVE` $\to$ `COMPLETED`). | Events / Sanchita | `STORY-EVT-03` (S2) | `services/event_state.service.js` | `TC-EVT-04` | **Not Implemented / Planned** | State machine transitions defined in SAD Fig B-3; backend transition engine to be built in Sprint 2. |
| **FR-007** | Organizer ticket tier definition (Early Bird, VIP) with independent quotas/prices. | Booking / Reet | `STORY-BKG-01` (S1) | `models/tier.model.js`<br>`controllers/tier.controller.js` | `TC-TCK-01` | **Not Implemented / Planned** | Schema designed in SAD 3.6; database table and validation logic scheduled for Sprint 1. |
| **FR-008** | 10-minute temporary seat reservation hold using Redis key TTL 600 s. | Booking / Reet | `STORY-BKG-02` (S1) | `services/hold.service.js`<br>`routes/booking.routes.js` | `TC-BKG-01` | **Not Implemented / Planned** | Redis container available in `docker-compose.yml`. Hold service logic scheduled for Sprint 1. |
| **FR-009** | Automatic return of held seats to stock upon hold expiration. | Booking / Reet | `STORY-BKG-02` (S1) | `services/hold.service.js` | `TC-BKG-02` | **Not Implemented / Planned** | Scheduled for Sprint 1. Requires Redis keyspace notification or TTL polling check. |
| **FR-010** | Atomic booking confirmation in single PostgreSQL transaction (`FOR UPDATE`). | Booking / Reet | `STORY-BKG-03` (S2) | `controllers/booking.controller.js`<br>`services/booking.service.js` | `TC-BKG-03`<br>`TC-PERF-03` | **Not Implemented / Planned** | Core concurrency requirement to prevent overselling. Scheduled for Sprint 2. |
| **FR-011** | Dynamic QR pass generation with HMAC-SHA256 signature and PNG data URL. | QR / Sambhram | `STORY-QR-01` (S1) | `services/qr.service.js`<br>`controllers/qr.controller.js` | `TC-QR-01`<br>`TC-QR-04`<br>`TC-QR-05` | **Implemented / Unverified on main** | Code exists on `main`. Tests fail locally due to missing `qrcode` module in node_modules and missing `QR_HMAC_SECRET`. |
| **FR-012** | Client pass presentation screen with attendee name, tier, and QR code. | QR / Sambhram | `STORY-INT-01` (S1) | `client/src/pages/PassView.jsx` | `TC-UX-02` | **Not Implemented / Planned** | Scheduled for Sprint 1 MVP integration. |
| **FR-013** | Gate staff device camera pass scanning and signature/expiry verification. | Scanner / Sambhram | `STORY-SCN-01` (S1)<br>`STORY-SCN-02` (S2) | `services/checkin.service.js`<br>`client/src/pages/GateScanner.jsx` | `TC-QR-02`<br>`TC-QR-03`<br>`TC-SCN-03` | **Implemented / Unverified on main** | Backend verification written on `main`. Scanner UI written on `feature/gate-scanner` branch. Unmerged & unverified. |
| **FR-014** | Record first scan as `CHECKED_IN`; reject subsequent scans as `DUPLICATE_ENTRY`. | Scanner / Sambhram | `STORY-SCN-01` (S1) | `services/checkin.service.js`<br>`routes/checkin.routes.js` | `TC-SCN-01`<br>`TC-SCN-02` | **Implemented / Unverified on main** | Logic exists on `main` using in-memory `Map()`. Currently blocked by `qrcode` dependency failure on test run. |
| **FR-015** | Attendee joins FIFO waitlist when ticket tier available seats reach zero. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js` | `TC-WTL-01` | **Not Implemented / Planned** | Scheduled for Sprint 2 using Redis list data structures (`RPUSH`). |
| **FR-016** | Automatic email notification & 15-minute slot reservation for waitlist head on cancel. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js` | `TC-WTL-02`<br>`TC-WTL-03` | **Not Implemented / Planned** | Scheduled for Sprint 2. Background queue handler to be implemented. |
| **FR-017** | Real-time check-in scan velocity and attendance percentage on organizer dashboard. | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `routes/telemetry.routes.js`<br>`client/src/pages/Dashboard.jsx` | `TC-ANL-01` | **Not Implemented / Planned** | Scheduled for Sprint 2 via Server-Sent Events (SSE). |
| **FR-018** | Export attendance and revenue summaries as downloadable CSV and PDF files. | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `services/report.service.js` | `TC-ANL-02` | **Not Implemented / Planned** | Scheduled for Sprint 2. |
| **FR-019** | Admin event moderation (approve/flag/remove) and user account deactivation. | Admin / Saatvik | `STORY-ADM-01` (S2) | `controllers/admin.controller.js`<br>`routes/admin.routes.js` | `TC-ADM-01`<br>`TC-ADM-02` | **Not Implemented / Planned** | Scheduled for Sprint 2. Requires RBAC admin role protection. |

---

### 2.2 Business Rules Traceability (BR-001 to BR-006)

| Rule ID | Rule Summary | Enforcing Module | Mapped Story | Test Case | Current Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **BR-001** | Max 5 tickets per transaction for one event. | Booking / Reet | `STORY-BKG-02` (S1) | `TC-BKG-04` | **Not Implemented** |
| **BR-002** | Ticket hold expires exactly 600 s after creation. | Booking / Reet | `STORY-BKG-02` (S1) | `TC-BKG-02` | **Not Implemented** |
| **BR-003** | Pass can be checked in exactly once; later scans rejected. | Scanner / Sambhram | `STORY-SCN-01` (S1) | `TC-SCN-02` | **Implemented / Unverified** |
| **BR-004** | Waitlist claim invitation expires after 15 minutes (900 s). | Waitlist / Reet | `STORY-WTL-01` (S2) | `TC-WTL-03` | **Not Implemented** |
| **BR-005** | Event cannot be submitted without at least 1 tier with quota > 0. | Events / Sanchita | `STORY-EVT-03` (S2) | `TC-EVT-04` | **Not Implemented** |
| **BR-006** | Cannot delete event or edit dates after bookings exist. | Events / Sanchita | `STORY-EVT-03` (S2) | `TC-EVT-05` | **Not Implemented** |

---

### 2.3 Non-Functional Requirements (NFR-001 to NFR-007)

| Req ID | Metric / Target | Category | Mapped Story | Test Case | Current Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **NFR-001** | 95% of catalog search requests respond in $\le 150$ ms at 500 VUs. | Performance | `STORY-QA-01` (S2) | `TC-PERF-01` | **Not Tested** |
| **NFR-002** | QR verification + check-in write completes in $< 200$ ms per scan. | Performance | `STORY-SCN-01` (S1) | `TC-PERF-02` | **Not Tested** |
| **NFR-003** | Booking engine handles 200 concurrent holds/sec with 0 oversell. | Integrity / Concurrency | `STORY-BKG-03` (S2) | `TC-PERF-03` | **Not Tested** |
| **NFR-004** | Availability $\ge 99.5\%$ during event booking window. | Reliability | `STORY-QA-01` (S2) | `TC-OPS-01` | **Not Tested** |
| **NFR-005** | Attendee completes booking in $\le 4$ screens. | Usability | `STORY-EVT-02` (S1) | `TC-UX-01` | **Not Tested** |
| **NFR-006** | Server Jest statement & branch coverage $\ge 80\%$. | Maintainability | `STORY-CI-01` (S1) | `TC-OPS-02` | **Partially Verified** (`auth.test.js` has $>90\%$ on auth files; unverified on main) |
| **NFR-007** | Booking and check-in records survive server/container restart. | Persistence | `STORY-QA-01` (S2) | `TC-OPS-03` | **Not Tested** |

---

### 2.4 Security Requirements (SEC-001 to SEC-006)

| Req ID | Security Requirement | Module & Owner | Mapped Story | Test Case | Current Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **SEC-001** | Passwords stored only as bcrypt hashes with cost $\ge 10$. | Auth / Saatvik | `STORY-AUTH-01` (S1) | `TC-AUTH-03` | **Verified on `feature/auth-rbac`** |
| **SEC-002** | RBAC middleware blocks attendee tokens from restricted routes (403). | Auth / Saatvik | `STORY-AUTH-02` (S1) | `TC-SEC-01` | **Verified on `feature/auth-rbac`** |
| **SEC-003** | Input validation and SQL parameterization to prevent injection & XSS. | Auth / Saatvik | `STORY-SEC-01` (S2) | `TC-SEC-02` | **Not Implemented** |
| **SEC-004** | Client to server traffic uses TLS 1.3 outside localhost. | Security / Saatvik | `STORY-SEC-01` (S2) | `TC-SEC-03` | **Planned for Production** |
| **SEC-005** | Failed logins, rejected scans, and admin actions logged to audit table. | Security / Saatvik | `STORY-SEC-01` (S2) | `TC-SEC-04` | **Not Implemented** |
| **SEC-006** | QR passes signed via HMAC-SHA256 with constant-time verification. | QR / Sambhram | `STORY-QR-01` (S1) | `TC-SEC-05` | **Implemented / Blocked on main** |

---

## 3. Current Repository Audit & Identified Gaps

### 3.1 Gaps Between `main` and Feature Branches
1. **Unmerged Authentication Module:** Saatvik completed the user model, bcrypt utility, JWT utility, controllers, and 10 passing Jest tests on `feature/auth-rbac`. However, `main` does not yet contain these files. **Action:** PR must be opened, reviewed, and merged during Sprint 1.
2. **Unmerged Gate Scanner UI:** Sambhram completed `GateScanner.jsx` and `checkinApi.js` on `feature/gate-scanner`. It is not yet merged to `main`. **Action:** PR must be reviewed and merged in Sprint 1/2.

### 3.2 Setup Blockers & Runtime Deficiencies on `main`
1. **Missing `qrcode` Package in Local Environment:** Running `npm test` on `main` fails with `Cannot find module 'qrcode'` because dependencies have not been re-installed locally after commit `44cbc25`.
2. **Missing `QR_HMAC_SECRET` Runtime Configuration:** `server/src/services/qr.service.js` throws an unhandled error if `QR_HMAC_SECRET` is unset. Tests and startup scripts require fallback or default test environment values.
3. **In-Memory Check-in Storage:** `server/src/services/checkin.service.js` currently stores scans in an in-memory `Map()`. Scans will not survive a server restart (`NFR-007`) until migrated to PostgreSQL in Sprint 2.
4. **No CI Workflow in Repository:** There is currently no `.github/workflows/` directory in the repository. Pull requests are not being automatically tested.

---

## 4. Open Technical Questions & Architectural Decisions

* **Open Question 1 (Database Migrations):** The repository lacks an automated schema migration tool (such as Knex or raw SQL migration runner). Should the team adopt a lightweight SQL migration script (`server/scripts/migrate.js`) or an ORM/query builder?
  * *Recommendation:* Adopt a minimal, zero-dependency Node.js SQL migration script that reads `.sql` files in `server/migrations/` to keep setup lightweight for students.
* **Open Question 2 (Client Test Framework):** `client/package.json` contains `oxlint` for linting, but no unit testing framework. How will React UI components (`PassView.jsx`, `GateScanner.jsx`) be verified?
  * *Recommendation:* Introduce Vitest with React Testing Library in Sprint 1 to validate component rendering.
* **Open Question 3 (Waitlist Email Delivery):** `FR-016` specifies email delivery for waitlist claim links. In a local/student environment without commercial SMTP credentials, how should email dispatch be validated?
  * *Recommendation:* Utilize a local test transport (such as Ethereal Email or structured console log serialization) with formal deviation recorded in `docs/DEVIATIONS.md`.

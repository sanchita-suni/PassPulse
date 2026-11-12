# PassPulse — Architectural & Specification Deviations Log

**Project:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)
**Baseline Documents:** SRS v2.1, SAD v1.0, STP v1.0 (`docs/PassPulse_SRS_SAD_STP.pdf`)
**Document Status:** Final Evaluation & Viva Baseline (Updated 12-Nov-2026)

---

## 1. Deviation Logging Policy & Schema

This document records any deliberate, temporary, or approved divergence between the codebase implementation and the submitted baseline specifications (SRS v2.1, SAD v1.0, and STP v1.0).

### 1.1 Deviation Lifecycle & Statuses
* **Proposed:** Identified during code review or sprint planning; pending approval by Team Lead and Faculty Evaluator.
* **Approved:** Formally accepted with documented technical justification and mitigation plan.
* **Resolved:** Corrective action implemented, tested, and aligned with baseline specification.
* **Rejected:** Deviation not permitted; original specification must be enforced.

### 1.2 Mandatory Schema for Every Entry
Each recorded deviation must include:
1. **Deviation ID:** Unique identifier (`DEV-###`).
2. **Date Logged:** Date of initial identification.
3. **Specification Reference:** SRS requirement ID, SAD section, or STP test case.
4. **Description of Deviation:** Exact divergence between specification and actual implementation.
5. **Technical / Operational Reason:** Underlying constraint or rationale.
6. **Architectural & Quality Impact:** Effect on performance, security, data integrity, or user experience.
7. **Approval Status:** Current governance state.
8. **Corrective Action & Target Sprint:** Step-by-step resolution roadmap.
9. **Final Demo Explanation:** How the item will be addressed and demonstrated to course evaluators.

---

## 2. Active Deviations Registry

### DEV-001: Temporary In-Memory Storage for Check-in Records
* **Deviation ID:** `DEV-001`
* **Date Logged:** 15-Oct-2026 (Resolved: 04-Nov-2026)
* **Specification Reference:** SRS `FR-014`, SAD Section 3.6 & Section 4.6 (`check_in_logs` table), STP `TC-SCN-01`
* **Description of Deviation:**
  Initial Sprint 1 check-in scaffolding (`server/src/services/checkin.service.js`) stored gate check-in logs in a JavaScript `Map()` object in process memory rather than persisting records to the PostgreSQL `check_in_logs` relational table.
* **Technical / Operational Reason:**
  Allowed Sambhram to verify cryptographic HMAC verification and low-latency gate rejection logic in isolation before database schema migrations (`0001_booking_and_retention_foundation.sql`) were finalized.
* **Architectural & Quality Impact:**
  During Sprint 1 MVP, check-in records would not survive container restarts. That limitation is now eliminated in Sprint 2/Final release: when PostgreSQL is initialized (`processPersistentCheckIn`), check-ins execute inside an explicit `BEGIN ... COMMIT` transaction with `FOR UPDATE OF ticket, booking`, insert into `check_in_logs` using `ON CONFLICT (ticket_id) DO NOTHING`, and enforce 1-year `retained_until` retention (`NFR-007`). The `Map()` path remains solely for fast, no-DB legacy unit test fixtures.
* **Approval Status:** **Resolved (PostgreSQL Persistence Active on `main`)**
* **Corrective Action & Target Sprint:**
  Implemented `processPersistentCheckIn`, `getPersistentCheckInRecord`, and `getPersistentCheckInRecords` (`0cb0393`, PR #50 / #53) targeting PostgreSQL `check_in_logs`, automatically invoked by `checkin.controller.js`.
* **Final Demo Explanation:**
  Explain that Sprint 1 validated fast cryptographic check-in rules in memory (`DEV-001`), and Sprint 2 upgraded live API execution to ACID PostgreSQL persistence with row-level duplicate prevention (`ON CONFLICT`) and immutable audit logging.

---

### DEV-002: In-Memory User Repository vs Relational `users` Table Queries
* **Deviation ID:** `DEV-002`
* **Date Logged:** 15-Oct-2026 (Reviewed: 12-Nov-2026)
* **Specification Reference:** SRS `FR-001`, SAD Section 3.6 (`users` table), STP `TC-AUTH-01`
* **Description of Deviation:**
  `server/src/models/user.model.js` currently manages runtime user accounts against an in-memory array (`usersStore`) with bcrypt password hashes and `isActive` flags, even though the relational `users` table and constraints exist in `server/db/schema.sql`.
* **Technical / Operational Reason:**
  Keeping `UserModel` (alongside `EventModel` in `DEV-006`) in process memory enabled independent unit testing across Auth, RBAC, Admin Moderation, and Event Catalog without requiring every route test suite to bootstrap a live PostgreSQL instance. Booking holds, atomic confirmations, FIFO waitlist, persistent check-ins, and immutable audit logs all query PostgreSQL directly, using `(SELECT id FROM users WHERE id = $1)` safe foreign-key lookups where needed so both persistence layers coexist cleanly.
* **Architectural & Quality Impact:**
  User registrations created via API live for the lifetime of the server process, whereas password hashing (`bcryptjs`, 10 salt rounds), CWE-269 role overrides, immediate deactivation denial (`ACCOUNT_DEACTIVATED`), and RBAC enforcement behave identically to SQL persistence. Because query encapsulation sits cleanly inside `UserModel`, switching to `pg` queries requires zero changes to `auth.controller.js`, `auth.middleware.js`, or `rbac.middleware.js`.
* **Approval Status:** **Approved (Documented Architectural Tradeoff; `schema.sql` Ready)**
* **Corrective Action & Target Sprint:**
  Schema DDL in `server/db/schema.sql` (`OPS-001`) is validated by `pg-mem` and live PostgreSQL CI suites; future production scaling replaces `UserModel` array helpers with `db.query(...)` calls without touching service/controller contracts.
* **Final Demo Explanation:**
  Show `server/db/schema.sql` (relational `users` table definition) alongside `server/src/models/user.model.js` and `tests/auth.test.js` (31 passing tests), explaining the clean MVC/Service boundary that isolates storage from security logic.

---

### DEV-003: Simulated Email Dispatch for Waitlist Claim Notifications
* **Deviation ID:** `DEV-003`
* **Date Logged:** 15-Oct-2026 (Verified: 04-Nov-2026)
* **Specification Reference:** SRS `FR-016`, Business Rule `BR-004`, STP `TC-WTL-02`
* **Description of Deviation:**
  The waitlist engine does not transmit external emails via SMTP relays (e.g., SendGrid or AWS SES). Instead, claim notifications and 15-minute claim links are durably persisted in PostgreSQL (`notifications` and `waitlist_claims` tables in migration `0002_fifo_waitlist_claim_allocations.sql`) and surfaced directly in the React application via `GET /api/bookings/notifications`.
* **Technical / Operational Reason:**
  External SMTP delivery introduces third-party network dependencies, API key rotation risks, and spam filtering failure modes inappropriate for deterministic academic evaluation and offline CI runs.
* **Architectural & Quality Impact:**
  Zero functional impact on queue fairness or 15-minute expiry scheduling; attendees view, accept, or decline their waitlist claim notifications directly inside `client/src/pages/WaitlistNotifications.jsx`, backed by PostgreSQL durability.
* **Approval Status:** **Approved & Implemented (Permanent Decision for Academic Evaluation)**
* **Corrective Action & Target Sprint:**
  Implemented in `server/src/services/waitlist.service.js`, migration `0002_fifo_waitlist_claim_allocations.sql`, and `client/src/pages/WaitlistNotifications.jsx`; verified in `src/services/waitlist.postgres.test.js`.
* **Final Demo Explanation:**
  Demonstrate joining a sold-out tier waitlist, triggering an expired hold or seat release, and accepting the 15-minute in-app claim notification in the UI.

---

### DEV-004: Frontend Static Linting & Vite Build Gate Without React Unit Test Runner
* **Deviation ID:** `DEV-004`
* **Date Logged:** 15-Oct-2026 (Reviewed: 12-Nov-2026)
* **Specification Reference:** SAD Section 4.5, STP Section 6 (Test Environment)
* **Description of Deviation:**
  `client/package.json` executes `oxlint` (`npm run lint`) and `vite build` (`npm run build`) in CI, rather than adding a browser DOM unit test framework such as Vitest + React Testing Library.
* **Technical / Operational Reason:**
  The team prioritized achieving thorough automated API, concurrency, security, and database test coverage on the Node/Express/PostgreSQL/Redis backend (**36 suites, 495 passing tests, 92.42% statement / 82.17% branch coverage**) while validating frontend views via static linting (`0` errors), full bundle compilation (`65` modules), backend API contract tests, and captured UI screenshots.
* **Architectural & Quality Impact:**
  CI reliably catches frontend syntax, static analysis, and JSX bundling regressions on every PR (`client-build-lint` job), while runtime UI verification relies on end-to-end manual walkthroughs (`docs/screenshots/01–05_*.png`) and demo recordings (`docs/demo/PassPulse_Sprint1_Demo.mp4`).
* **Approval Status:** **Approved (Scoped Quality Strategy for Final Submission)**
* **Corrective Action & Target Sprint:**
  Retained `oxlint` + `vite build` CI gates; future post-course iterations can add Vitest component tests without altering existing API integration suites.
* **Final Demo Explanation:**
  Point to GitHub Actions `client-build-lint` green status (`oxlint` + `vite build`), screenshots in `docs/screenshots/`, and explain how all critical business logic is tested server-side with >92% coverage.

---

### DEV-005: Missing Root-Level Workspace Orchestration Script
* **Deviation ID:** `DEV-005`
* **Date Logged:** 15-Oct-2026
* **Specification Reference:** SAD Section 3.6 (Development Environment)
* **Description of Deviation:**
  The repository root lacks a root-level `package.json` with concurrently/npm workspaces to start both the `client` and `server` with a single command.
* **Technical / Operational Reason:**
  Client and server were created as independent directories to maintain modularity.
* **Architectural & Quality Impact:**
  Developers must open two terminal windows (`cd server && npm start` and `cd client && npm run dev`), increasing onboarding friction.
* **Approval Status:** **Approved (Acceptable Developer Convention)**
* **Corrective Action & Target Sprint:**
  Document dual-terminal startup in `README.md` and provide an optional root startup script in `infra/` if desired.
* **Final Demo Explanation:**
  Standard multi-tier execution shown with server and client running in split terminal panes.

---

### DEV-006: In-Memory Event and Tier Repository
* **Deviation ID:** `DEV-006`
* **Date Logged:** 30-Oct-2026
* **Specification Reference:** SRS `FR-004` to `FR-007`, SAD Section 3.6 (`events`, `ticket_tiers` tables)
* **Description of Deviation:**
  `server/src/models/event.model.js` keeps events and tiers in process memory, mirroring the columns of `server/db/schema.sql`, instead of reading and writing the PostgreSQL tables.
* **Technical / Operational Reason:**
  Keeps the events module consistent with the user, ticket and check-in stores already on `main` (DEV-001, DEV-002), so the whole demo runs without a database and the modules can be switched to PostgreSQL together.
* **Architectural & Quality Impact:**
  Events created during a session are lost on server restart. Business rules, validation and API contracts are unaffected because they sit in the service layer.
* **Approval Status:** **Approved (Temporary)**
* **Corrective Action & Target Sprint:**
  The schema, pool (`src/config/db.js`) and `npm run db:init` are ready (OPS-001). Replace the methods of `EventModel` with SQL against `events` and `ticket_tiers`; the service layer does not change.
* **Final Demo Explanation:**
  Show `schema.sql` applied to PostgreSQL and the constraint tests, then run the catalog on the in-memory repository.

---

### DEV-007: NFR-001 Measured With User Think Time
* **Deviation ID:** `DEV-007`
* **Date Logged:** 30-Oct-2026 (Reviewed: 12-Nov-2026)
* **Specification Reference:** SRS `NFR-001`, STP `TC-PERF-01`
* **Description of Deviation:**
  The 150 ms p95 target is met with 500 virtual users who pause 1 s between searches (p95 16.2 ms), which is how the k6 script models users. With 500 clients sending back-to-back requests and no pause, p95 is 187.3 ms on a single API process on 2 cores.
* **Technical / Operational Reason:**
  Search itself takes under 1 ms; the extra time under back-to-back load is queueing on one Node.js process. Details in `docs/perf/NFR-001_Search_Performance.md`.
* **Architectural & Quality Impact:**
  None for realistic browsing load. Sustained load above about 3,000 requests per second per process would need more API processes.
* **Approval Status:** **Approved (Benchmark Methodology Documented)**
* **Corrective Action & Target Sprint:**
  If the stricter zero-think-time reading is required, run the API in cluster mode or scale horizontally behind the existing Nginx TLS proxy.
* **Final Demo Explanation:**
  Run `npm run bench:search` with and without `THINK_MS=1000` and explain event-loop queuing vs indexed search speed (`< 1 ms`).

---

### DEV-008: Booking Journey Endpoint Integration & 5-User Walkthrough Follow-up
* **Deviation ID:** `DEV-008`
* **Date Logged:** 30-Oct-2026 (API Integrated: 04-Nov-2026)
* **Specification Reference:** SRS `NFR-005`, STP `TC-UX-01`, dependent on `FR-008` and `FR-010`
* **Description of Deviation:**
  Initially logged when the 4-screen React booking journey was built ahead of the backend booking engine (`POST /api/bookings/hold` and `POST /api/bookings/confirm`). Both backend endpoints and PostgreSQL transactions are now merged on `main` (`ae79eb7`) and integrated with `Checkout.jsx` and `BookingConfirmation.jsx`. Only the formal 5-user live usability walkthrough table in `docs/NFR-005_Booking_Journey.md` (GitHub Issue `#36`) remains open.
* **Technical / Operational Reason:**
  Frontend 4-screen UX (`feature/issue-36-booking-journey`) landed prior to the concurrent PostgreSQL/Redis booking engine merge (`ae79eb7`).
* **Architectural & Quality Impact:**
  End-to-end 4-screen booking works against the deployed API and PostgreSQL/Redis stack (`booking-hold.postgres.test.js` passes 24/24 tests); only human usability timing data (`TC-UX-01`) remains pending completion.
* **Approval Status:** **Resolved (Booking APIs Merged & Wired; 5-User Walkthrough Tracked in Issue #36)**
* **Corrective Action & Target Sprint:**
  Run the 5-user walkthrough protocol documented in `docs/NFR-005_Booking_Journey.md` and record observations in Issue `#36`.
* **Final Demo Explanation:**
  Walk evaluators through all 4 screens (`EventCatalog` $\to$ `EventDetails` $\to$ `Checkout` $\to$ `BookingConfirmation`) with live `/api/bookings/hold` & `/confirm` calls, noting Issue `#36` only tracks the human observation table.

---

## 3. Deviation Review & Audit History

| Revision | Date | Reviewed By | Changes Summary |
| :---: | :---: | :--- | :--- |
| **1.0** | 15-Oct-2026 | Sanchita Sunil (Team Lead), Saatvik Gupta (QA/Security) | Initial deviation baseline established across storage, email dispatch, and frontend tooling. |
| **1.1** | 30-Oct-2026 | Sanchita Sunil (Team Lead) | Added DEV-006 (in-memory event repository), DEV-007 (NFR-001 load model) and DEV-008 (booking journey dependency). |
| **1.2** | 12-Nov-2026 | Saatvik Gupta (QA/Auth Lead) & Team | Updated DEV-001 (PostgreSQL check-in persistence) and DEV-008 (booking APIs merged/wired) to Resolved; finalized DEV-002/003/004/007 statuses ahead of Final Demo & Viva. |

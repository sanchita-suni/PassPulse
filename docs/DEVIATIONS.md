# PassPulse — Architectural & Specification Deviations Log

**Project:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)
**Baseline Documents:** SRS v2.1, SAD v1.0, STP v1.0 (`docs/PassPulse_SRS_SAD_STP.pdf`)
**Document Status:** Active Engineering Registry

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
* **Date Logged:** 15-Oct-2026
* **Specification Reference:** SRS `FR-014`, SAD Section 3.6 & Section 4.6 (`check_in_logs` table), STP `TC-SCN-01`
* **Description of Deviation:**
  The current implementation of the check-in service on `main` (`server/src/services/checkin.service.js`) stores gate check-in logs in a JavaScript `Map()` object in process memory, rather than persisting records to the PostgreSQL `check_in_logs` relational table.
* **Technical / Operational Reason:**
  The QR verification and check-in service was scaffolded by Sambhram in isolation to test cryptographic HMAC verification prior to the completion of Reet's database schema migrations.
* **Architectural & Quality Impact:**
  In-memory check-in logs do not survive server restarts, violating `NFR-007` (Data retention across container restarts). If the server crashes during an event, duplicate entries could theoretically occur after restart.
* **Approval Status:** **Approved (Temporary for Sprint 1 MVP only)**
* **Corrective Action & Target Sprint:**
  In Sprint 2 (`STORY-SCN-02`), migrate the check-in state from `Map()` to PostgreSQL queries targeting `check_in_logs` with a database uniqueness constraint on `ticket_id`.
* **Final Demo Explanation:**
  Explain to evaluators that Sprint 1 focused on zero-latency in-memory validation for gate throughput demonstration, while Sprint 2 formalized persistent ACID durability in PostgreSQL.

---

### DEV-002: In-Memory User Repository on Feature Branch vs Relational Persistence
* **Deviation ID:** `DEV-002`
* **Date Logged:** 15-Oct-2026
* **Specification Reference:** SRS `FR-001`, SAD Section 3.6 (`users` table), STP `TC-AUTH-01`
* **Description of Deviation:**
  The user authentication module on `feature/auth-rbac` (`server/src/models/user.model.js`) currently operates against an in-memory repository with helper serialization methods rather than executing direct SQL `INSERT`/`SELECT` statements against the PostgreSQL `users` table.
* **Technical / Operational Reason:**
  Allowed unit and integration testing of password hashing (Bcrypt) and JWT token verification to proceed deterministically in isolation without requiring a live, migrated database instance during the initial scaffolding phase.
* **Architectural & Quality Impact:**
  User accounts reset whenever the Node.js server process restarts.
* **Approval Status:** **Approved (Temporary for Sprint 1 Kickoff)**
* **Corrective Action & Target Sprint:**
  During Sprint 1 (`STORY-AUTH-01`), integrate the `pg` connection pool into `user.model.js` so that user registration and authentication query the active PostgreSQL container.
* **Final Demo Explanation:**
  Demonstrate database persistence by querying the `users` table directly via `psql` during the Sprint 1 demo.

---

### DEV-003: Simulated Email Dispatch for Waitlist Claim Notifications
* **Deviation ID:** `DEV-003`
* **Date Logged:** 15-Oct-2026
* **Specification Reference:** SRS `FR-016`, Business Rule `BR-004`, STP `TC-WTL-02`
* **Description of Deviation:**
  The waitlist engine will not transmit real-world emails over external SMTP relays (such as SendGrid or AWS SES). Instead, claim notifications and 15-minute claim links will be generated, logged to the server console, and surfaced in the client application interface.
* **Technical / Operational Reason:**
  External SMTP delivery introduces external network dependencies, spam filtering risks, and API key management overhead inappropriate for an academic evaluation environment.
* **Architectural & Quality Impact:**
  Zero functional impact on core queue rebalancing logic; attendees view their notification and claim link directly within the PassPulse web portal.
* **Approval Status:** **Approved (Permanent Architectural Decision for Academic Evaluation)**
* **Corrective Action & Target Sprint:**
  Implement the notification simulator in Sprint 2 (`STORY-WTL-01`), rendering claim notifications in the UI notification bell.
* **Final Demo Explanation:**
  Show the waitlist claim link being generated in server logs and claim token being accepted at the checkout endpoint.

---

### DEV-004: Absence of Frontend Component Test Suite in Package Manifest
* **Deviation ID:** `DEV-004`
* **Date Logged:** 15-Oct-2026
* **Specification Reference:** SAD Section 4.5, STP Section 6 (Test Environment)
* **Description of Deviation:**
  `client/package.json` contains scripts for development, build, and oxlint, but lacks an automated unit/component test runner (such as Vitest or Jest with React Testing Library).
* **Technical / Operational Reason:**
  The frontend was initialized via the standard Vite React template (`feature/client-scaffold`) which does not bundle a test runner out of the box.
* **Architectural & Quality Impact:**
  Frontend component regressions cannot be validated in CI without a test runner.
* **Approval Status:** **Under Review (Target Resolution: Sprint 1 `STORY-CI-01`)**
* **Corrective Action & Target Sprint:**
  In Sprint 1, configure Vitest in `client/` and add `"test": "vitest run"` to `client/package.json`.
* **Final Demo Explanation:**
  Highlight Vitest running alongside Jest in the GitHub Actions CI pipeline.

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
* **Date Logged:** 30-Oct-2026
* **Specification Reference:** SRS `NFR-001`, STP `TC-PERF-01`
* **Description of Deviation:**
  The 150 ms p95 target is met with 500 virtual users who pause 1 s between searches (p95 16.2 ms), which is how the k6 script models users. With 500 clients sending back-to-back requests and no pause, p95 is 187.3 ms on a single API process on 2 cores.
* **Technical / Operational Reason:**
  Search itself takes under 1 ms; the extra time under back-to-back load is queueing on one Node.js process. Details in `docs/perf/NFR-001_Search_Performance.md`.
* **Architectural & Quality Impact:**
  None for realistic browsing load. Sustained load above about 3,000 requests per second per process would need more API processes.
* **Approval Status:** **Proposed**
* **Corrective Action & Target Sprint:**
  If the stricter reading is required, run the API in cluster mode or as more than one container behind the existing proxy.
* **Final Demo Explanation:**
  Run `npm run bench:search` with and without `THINK_MS=1000` and show both results.

---

### DEV-008: Booking Journey Waits on the Booking Engine
* **Deviation ID:** `DEV-008`
* **Date Logged:** 30-Oct-2026
* **Specification Reference:** SRS `NFR-005`, STP `TC-UX-01`, dependent on `FR-008` and `FR-010`
* **Description of Deviation:**
  The 4-screen booking journey is built, but the hold and confirm steps call `/api/bookings/hold` and `/api/bookings/confirm`, which are not on `main` yet. The 5-user walkthrough has therefore not been run.
* **Technical / Operational Reason:**
  The booking engine is a separate module (issues #20 and #22).
* **Architectural & Quality Impact:**
  Attendees can browse and pick tickets but cannot complete a booking until the booking module is merged. The checkout screen explains this.
* **Approval Status:** **Approved (Temporary)**
* **Corrective Action & Target Sprint:**
  After the booking module merges, run the walkthrough in `docs/NFR-005_Booking_Journey.md` and record results.
* **Final Demo Explanation:**
  Show screens 1 to 3 and the step indicator; show the endpoint contract the checkout uses.

---

## 3. Deviation Review & Audit History

| Revision | Date | Reviewed By | Changes Summary |
| :---: | :---: | :---: | :--- |
| **1.0** | 15-Oct-2026 | Sanchita Sunil (Team Lead), Saatvik Gupta (QA/Security) | Initial deviation baseline established across storage, email dispatch, and frontend tooling. |
| **1.1** | 30-Oct-2026 | Sanchita Sunil (Team Lead) | Added DEV-006 (in-memory event repository), DEV-007 (NFR-001 load model) and DEV-008 (booking journey dependency). |

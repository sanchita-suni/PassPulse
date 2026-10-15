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

## 3. Deviation Review & Audit History

| Revision | Date | Reviewed By | Changes Summary |
| :---: | :---: | :---: | :--- |
| **1.0** | 15-Oct-2026 | Sanchita Sunil (Team Lead), Saatvik Gupta (QA/Security) | Initial deviation baseline established across storage, email dispatch, and frontend tooling. |

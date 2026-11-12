# PassPulse — Requirements Traceability & Verification Status Matrix

**Project:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)  
**Baseline Documents:** SRS v2.1, SAD v1.0, STP v1.0 (`docs/PassPulse_SRS_SAD_STP.pdf`)  
**Document Status:** Final Submission & Viva Baseline (Updated November 12, 2026 — CI Run `#42875623511`)  

---

## 1. Traceability Matrix Structure & Status Definitions

This matrix establishes bidirectionality between the approved Software Requirements Specification (SRS), Software Architecture Design (SAD), Software Test Plan (STP), and the Sprint Backlog.

### Status Definitions
* **Working / Verified (Green):** Feature code is written, automated test cases exist, and execution has been empirically verified (100% pass rate in automated test suites).
* **Implemented / In Review (Yellow):** Feature code exists in the repository, passing unit tests, with secondary usability walkthrough or optional verification in progress.
* **Not Implemented / Planned (Red):** Scheduled in backlog; implementation not yet commenced.

---

## 2. Master Traceability Matrix

### 2.1 Functional Requirements (FR-001 to FR-019)

| Req ID | Requirement Summary | Module & Owner | Sprint Story | Component / Source File | Planned Test Cases | Current Status | Empirical Evidence / Test Pass |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **FR-001** | User registration with unique email, bcrypt password, role assignment. | Auth / Saatvik | `STORY-AUTH-01` (S1) | `controllers/auth.controller.js`<br>`models/user.model.js` | `TC-AUTH-01`<br>`TC-AUTH-02` | **Working / Verified** | Verified in `tests/auth.test.js` (31 tests). Rejects duplicate emails with 409 Conflict. Issue #13 closed. |
| **FR-002** | Password hashing via bcrypt with salt rounds $\ge 10$. | Auth / Saatvik | `STORY-AUTH-01` (S1) | `utils/password.util.js` | `TC-AUTH-03` | **Working / Verified** | Verified in `tests/auth.test.js`. Hashes match `$2a$10$...`. Zero plain text in memory. Issue #14 closed. |
| **FR-003** | JWT Bearer token authentication & role restriction (401/403). | Auth / Saatvik | `STORY-AUTH-02` (S1) | `middleware/auth.middleware.js`<br>`middleware/rbac.middleware.js` | `TC-AUTH-04`<br>`TC-AUTH-05` | **Working / Verified** | Verified in `tests/auth.test.js` & `auth.middleware.test.js`. Enforces 401/403 guards. Issue #15 closed. |
| **FR-004** | Event catalog search & multi-parameter filtering (category, date, venue, price). | Events / Sanchita | `STORY-EVT-01` (S1)<br>`STORY-EVT-02` (S1) | `services/event.service.js`<br>`routes/event.routes.js`<br>`client/src/pages/EventCatalog.jsx` | `TC-EVT-01`<br>`TC-EVT-02` | **Working / Verified** | Verified in `tests/events.test.js` (19 tests). Every filter alone & combined. Issue #16 closed. |
| **FR-005** | Organizer event creation, editing, scheduling, and draft management. | Events / Sanchita | `STORY-EVT-03` (S2) | `services/event.service.js`<br>`controllers/event.controller.js`<br>`client/src/pages/OrganizerDashboard.jsx` | `TC-EVT-03` | **Working / Verified** | Verified in `tests/event_management.test.js` (20 tests). Enforces ownership checks. Issue #17 closed. |
| **FR-006** | Formal event lifecycle state machine (`DRAFT` $\to$ `LIVE` $\to$ `COMPLETED`). | Events / Sanchita | `STORY-EVT-03` (S2) | `services/event_state.service.js`<br>`PATCH /api/events/:id/status` | `TC-EVT-04`<br>`TC-EVT-05` | **Working / Verified** | Verified in `tests/event_lifecycle.test.js` (17 tests). Illegal moves return 409 `INVALID_TRANSITION`. Issue #18 closed. |
| **FR-007** | Organizer ticket tier definition (Early Bird, VIP) with independent quotas/prices. | Events / Sanchita | `STORY-BKG-01` (S1) | `services/tier.service.js`<br>`controllers/tier.controller.js`<br>`client/src/components/TierManager.jsx` | `TC-TCK-01` | **Working / Verified** | Verified in `tests/tiers.test.js` (16 tests) & `tier.controller.test.js` (2 tests). Issue #19 closed. |
| **FR-008** | 10-minute temporary seat reservation hold using Redis key TTL 600 s & DB locks. | Booking / Reet | `STORY-BKG-02` (S1) | `services/booking-hold.service.js`<br>`routes/booking.routes.js` | `TC-BKG-01` | **Working / Verified** | PostgreSQL tests verify the 600,000 ms persisted deadline; `booking-hold.redis.postgres.test.js` verifies real Redis PTTL and PG/Redis reconciliation. |
| **FR-009** | Automatic return of held seats to stock upon hold expiration. | Booking / Reet | `STORY-BKG-02` (S1) | `services/hold-expiry.worker.js`<br>`services/booking-hold.service.js` | `TC-BKG-02` | **Working / Verified** | Real PostgreSQL/Redis worker test verifies one-time release, repeated cycles, stale-key cleanup, and recovery after Redis acquisition failure. |
| **FR-010** | Atomic booking confirmation in single PostgreSQL transaction (`FOR UPDATE`). | Booking / Reet | `STORY-BKG-03` (S2) | `controllers/booking.controller.js`<br>`services/booking-confirmation.service.js` | `TC-BKG-03`<br>`TC-PERF-03` | **Working / Verified** | PostgreSQL tests cover quota change, concurrent/idempotent confirmation, ticket and audit persistence, and rollback when ticket creation fails. |
| **FR-011** | Dynamic QR pass generation with HMAC-SHA256 signature and PNG data URL. | QR / Sambhram | `STORY-QR-01` (S1) | `services/qr.service.js`<br>`controllers/qr.controller.js` | `TC-QR-01`<br>`TC-QR-04`<br>`TC-QR-05` | **Working / Verified** | Verified in `qr.service.test.js` (27 tests) & `qr.routes.test.js` (18 tests). Issue #23 closed. |
| **FR-012** | Client pass presentation screen with attendee name, tier, and QR code. | QR / Sambhram | `STORY-INT-01` (S1) | `client/src/pages/AttendeePass.jsx`<br>`client/src/services/passApi.js` | `TC-UX-02` | **Working / Verified** | Verified in `attendeePass.routes.test.js` (18 tests) & React UI (PR #47, #58). Issue #24 closed. |
| **FR-013** | Gate staff device camera pass scanning, signature/expiry verification, and RBAC guard. | Scanner / Sambhram | `STORY-SCN-01` (S1)<br>`STORY-SCN-02` (S2) | `services/checkin.service.js`<br>`routes/checkin.routes.js`<br>`client/src/pages/GateScanner.jsx` | `TC-QR-02`<br>`TC-QR-03`<br>`TC-SCN-03` | **Working / Verified** | Verified in `checkin.routes.test.js` (21 tests). Restricts scans to GATE_STAFF/STAFF/ADMIN. Issue #25 closed. |
| **FR-014** | Record first scan as `CHECKED_IN`; reject subsequent scans as `DUPLICATE_ENTRY`. | Scanner / Sambhram | `STORY-SCN-01` (S1) | `services/checkin.service.js`<br>`routes/checkin.routes.js` | `TC-SCN-01`<br>`TC-SCN-02` | **Working / Verified** | Verified in `checkin.routes.test.js` (21) & `checkin.service.test.js` (14). Enforces duplicate 409 lock. Issue #26 closed. |
| **FR-015** | Attendee joins FIFO waitlist only when ticket tier available seats reach zero. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js`<br>`0002_fifo_waitlist_claim_allocations.sql` | `TC-WTL-01` | **Working / Verified** | PostgreSQL tests cover available-inventory rejection, concurrent eligibility requests, FIFO ordering, and duplicate prevention (`waitlist.postgres.test.js`, 6 tests). |
| **FR-016** | In-app notification & 15-minute claim reservation for waitlist head. | Waitlist / Reet | `STORY-WTL-01` (S2) | `services/waitlist.service.js`<br>`client/src/pages/WaitlistNotifications.jsx` | `TC-WTL-02`<br>`TC-WTL-03` | **Working / Verified (DEV-003)** | PostgreSQL tests verify the 15-minute claim window and reallocation. SMTP email is intentionally not implemented under approved deviation DEV-003. |
| **FR-017** | Real-time check-in scan velocity and attendance percentage dashboard (SSE). | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `services/telemetry.service.js`<br>`routes/telemetry.routes.js`<br>`client/src/pages/OrganizerDashboard.jsx` | `TC-ANL-01` | **Working / Verified** | Verified in `telemetry.service.test.js` (16 tests) & `telemetry.routes.test.js` (20 tests). PR #59. Issue #29 closed. |
| **FR-018** | Export attendance and revenue summaries as downloadable CSV and PDF files. | Telemetry / Sambhram | `STORY-TEL-01` (S2) | `services/report.service.js`<br>`utils/csv.util.js`<br>`utils/pdf.util.js` | `TC-ANL-02` | **Working / Verified** | Verified in `report.service.test.js` (19), `report.routes.test.js` (24), `csv.util.test.js` (13), `pdf.util.test.js` (11). PR #60. Issue #30 closed. |
| **FR-019** | Admin event moderation (approve/flag/remove) and user account deactivation. | Admin / Sanchita | `STORY-ADM-01` (S2) | `services/admin.service.js`<br>`routes/admin.routes.js`<br>`client/src/pages/AdminPanel.jsx` | `TC-ADM-01`<br>`TC-ADM-02` | **Working / Verified** | Verified in `tests/admin.test.js` (16 tests): `/api/admin/*` ADMIN only, deactivated users immediately receive 401. Issue #31 closed. |

---

### 2.2 Security, Non-Functional, and Operational Requirements

| Req ID | Requirement Summary | Module & Owner | Issue # | Evidence & Verification Reference | Current Status |
| :--- | :--- | :--- | :---: | :--- | :---: |
| **SEC-001** | Secure password storage with bcrypt ($\ge 10$ salt rounds) | Auth / Saatvik | #39 | `server/src/utils/password.util.js`; verified in `tests/auth.test.js` (`TC-AUTH-03`, `TC-SEED-01`). Issue #39 closed. | **Working / Verified** |
| **SEC-002** | Enforce role-based access control (RBAC) on all protected routes | Auth / Saatvik | #40 | `server/src/middleware/rbac.middleware.js`; verified in `tests/auth.test.js`, `auth.middleware.test.js` & `tests/admin.test.js`. Issue #40 closed. | **Working / Verified** |
| **SEC-003** | Prevent SQL injection and cross-site scripting (XSS) vulnerabilities | Auth / Saatvik | #41 | `server/src/config/db.js` parameterized queries; validated in `tests/auth.test.js` (`TC-SEC-04`–`07`) & `csv.util.test.js`. Issue #41 closed. | **Working / Verified** |
| **SEC-004** | Configure TLS 1.3 for external communication & HTTP redirect | Security / Sanchita | #42 | `deploy/nginx/proxy.conf`; `scripts/check-tls.sh` 5/5 checks pass. Issue #42 closed. | **Working / Verified** |
| **SEC-005** | Implement security audit logging for failed logins & admin actions | Security / Sambhram | #43 | `server/src/services/audit.service.js`; `GET /api/admin/audit-logs`. Verified in `audit.service.test.js` (12) & `audit.test.js` (13). Issue #43 closed. | **Working / Verified** |
| **SEC-006** | Secure QR signatures and cryptographic pass verification | QR / Sambhram | #44 | Deterministic HMAC-SHA256 + `crypto.timingSafeEqual` + fail-closed startup. Verified in `qr.service.test.js` (27) & `qr.routes.test.js` (18). Issue #44 closed. | **Working / Verified** |
| **NFR-001** | Catalog search p95 within 150 ms at 500 concurrent users | Events / Sanchita | #32 | `tests/perf/search.perf.test.js` in CI; `npm run bench:search`; report in `docs/perf/NFR-001_Search_Performance.md`. Issue #32 closed. | **Working / Verified** |
| **NFR-002** | QR verification and check-in latency target ($\text{p99} < 200\text{ ms}$) | DevOps / Sambhram | #33 | `Server-Timing` metrics; `bench-checkin.js`; `checkin.perf.test.js` (4 tests); p99: 0.84 ms. Issue #33 closed. | **Working / Verified** |
| **NFR-003** | Handle 200 concurrent booking holds per second without overselling | Booking / Reet | #34 | Focused real PostgreSQL + Redis throughput test measured **323.14 req/s** (p50 **361.40 ms**, p95 **597.02 ms**), exceeding the 200 req/s target. Separate one-seat race: 1 success, 199 conflicts, no unexpected errors. | **Working / Verified** |
| **NFR-004** | Health checks, 60s availability monitoring & 99.5% uptime target | DevOps / Sambhram | #35 | `/api/health`, `/live`, `/ready`; `availability.service.js`. Verified across 3 suites (61 tests total). Issue #35 closed. | **Working / Verified** |
| **NFR-005** | Home to confirmed booking in 4 screens or fewer | UX / Sanchita | #36 | 4-screen UI flow with progress bar (`docs/NFR-005_Booking_Journey.md`); API endpoints wired; 5-user walkthrough open (#36). | **Implemented / In Review** |
| **NFR-006** | Enforce Jest coverage thresholds in CI ($\ge 80\%$ statements & branches) | DevOps / Saatvik | #37 | Enforced in `server/package.json`; latest local run: **92.46% statements, 82.19% branches, 97.83% functions, 93.72% lines**. | **Working / Verified** |
| **NFR-007** | Preserve booking, check-in, and audit records for one year and across server restart | Retention / Reet | #38 | Retention integration tests passed; an isolated-schema test verified booking, ticket, sold inventory, and audit rows after an actual PostgreSQL container restart (volume preserved). | **Working / Verified** |
| **OPS-001** | PostgreSQL schema with keys and constraints | Database / Sanchita | #45 | `server/db/schema.sql`, migrations `0001`–`0002`, `schema.test.js` (13), `migration-runner.test.js` (8), `migration-postgres.test.js` (4). Issue #45 closed. | **Working / Verified** |
| **OPS-002** | Full stack containerization with Docker Compose | DevOps / Saatvik | #46 | `docker-compose.yml`, `server/Dockerfile`, `client/Dockerfile`. Issue #46 closed. | **Working / Verified** |

---

## 3. Final Test Suite Execution Status (CI Run `#42875623511`)

```
Test Suites: 36 passed, 36 total
Tests:       495 passed, 495 total (0 failed, 0 skipped)
Coverage:    92.42% statements (2464/2666), 82.17% branches (1351/1644), 97.83% functions (361/369), 93.67% lines (2327/2484)
Frontend:    oxlint (0 errors) + Vite production build (65 modules built in 161ms)
Status:      100% PASS across all 36 backend suites and frontend pipeline
```

| Suite File | Module Under Test | Tests Passed | Status |
| :--- | :--- | :---: | :---: |
| `tests/auth.test.js` | Authentication, Privilege Escalation Guard, Provisioning, SQLi/XSS & Middleware | 31 | **PASSED** |
| `src/middleware/auth.middleware.test.js` | Authentication & Deactivation Middleware Guards | 4 | **PASSED** |
| `src/utils/jwt.util.test.js` | JWT Signing & Verification Utility | 2 | **PASSED** |
| `tests/admin.test.js` | Admin Moderation & Account Deactivation (`FR-019`) | 16 | **PASSED** |
| `tests/audit.test.js` | Security Audit Logging Integration (`SEC-005`) | 13 | **PASSED** |
| `src/services/audit.service.test.js` | Central Audit Service Unit Tests | 12 | **PASSED** |
| `tests/health.test.js` | Health Check API Integration (`/api/health`, `/live`, `/ready`, `/admin/availability`) | 13 | **PASSED** |
| `src/services/health.service.test.js` | Health Dependency Probing & Sanitization | 19 | **PASSED** |
| `src/services/availability.service.test.js` | 60s Availability Poller, Outage Persistence & SLA | 29 | **PASSED** |
| `src/services/booking-hold.postgres.test.js` | 10-Min Holds, Expiry Return & Atomic Booking (`FR-008`–`010`) | 24 | **PASSED** |
| `src/services/waitlist.postgres.test.js` | FIFO Waitlist Queue & Claim Windows (`FR-015`, `FR-016`) | 5 | **PASSED** |
| `src/services/ticket.service.test.js` | Ticket Metadata & State Retrieval | 10 | **PASSED** |
| `src/services/qr.service.test.js` | QR Cryptographic Signatures & `timingSafeEqual` (`SEC-006`) | 27 | **PASSED** |
| `src/routes/qr.routes.test.js` | QR Pass Generation API & Integrity Protection | 18 | **PASSED** |
| `src/routes/attendeePass.routes.test.js` | Digital Pass Retrieval & Experience (`FR-012`) | 18 | **PASSED** |
| `src/services/checkin.service.test.js` | Check-in Logic, Ticket Validation & Concurrency | 14 | **PASSED** |
| `src/controllers/checkin.controller.test.js` | Check-in Controller Dispatch & `Server-Timing` | 5 | **PASSED** |
| `src/routes/checkin.routes.test.js` | Gate Check-in API, Duplicate Check & Gate RBAC (`FR-013`, `FR-014`) | 21 | **PASSED** |
| `src/services/telemetry.service.test.js` | Attendance Telemetry & Scan Velocity (`FR-017`) | 16 | **PASSED** |
| `src/routes/telemetry.routes.test.js` | Telemetry SSE Streaming & Auth Filtering (`FR-017`) | 20 | **PASSED** |
| `src/services/report.service.test.js` | Attendance & Revenue Aggregation (`FR-018`) | 19 | **PASSED** |
| `src/routes/report.routes.test.js` | Report Export Routes & Download Formats (`FR-018`) | 24 | **PASSED** |
| `src/utils/csv.util.test.js` | CSV Formula Injection Guard & Formatting | 13 | **PASSED** |
| `src/utils/pdf.util.test.js` | PDF Export Generator | 11 | **PASSED** |
| `tests/schema.test.js` | PostgreSQL Schema Constraints & Immutability (`OPS-001`) | 13 | **PASSED** |
| `tests/migration-runner.test.js` | Database Migration Runner | 8 | **PASSED** |
| `tests/migration-postgres.test.js` | Live PostgreSQL Migrations Execution | 4 | **PASSED** |
| `tests/nfr-007-retention.postgres.test.js` | 1-Year Record Retention Enforcement (`NFR-007`) | 1 | **PASSED** |
| `tests/events.test.js` | Catalog Search & Filters (`FR-004`) | 19 | **PASSED** |
| `tests/event_management.test.js` | Organizer Event Management (`FR-005`) | 20 | **PASSED** |
| `tests/tiers.test.js` | Ticket Tiers (`FR-007`, `BR-001`) | 16 | **PASSED** |
| `src/controllers/tier.controller.test.js` | Tier Controller Validation | 2 | **PASSED** |
| `tests/event_lifecycle.test.js` | Event Lifecycle FSM (`FR-006`) | 17 | **PASSED** |
| `src/config/redis.test.js` | Redis Connection & Failover | 5 | **PASSED** |
| `tests/perf/search.perf.test.js` | Catalog Search Performance (`NFR-001`) | 2 | **PASSED** |
| `tests/perf/checkin.perf.test.js` | QR Verification Latency (`NFR-002`) | 4 | **PASSED** |
| **Total** | **All 36 Backend Test Suites** | **495** | **ALL GREEN (100%)** |

### 3.1 Latest Local Docker-Backed Verification

The latest run used PostgreSQL 16 and Redis 7, a dedicated `passpulse_test_db`, and Redis logical DB 15. It did not use the development database or delete/reset Compose volumes.

| Verification | Result |
| :--- | :--- |
| Full backend suite | 37 suites, 502 tests passed; 0 failed, 0 skipped |
| Coverage | 92.46% statements, 82.19% branches, 97.83% functions, 93.72% lines |
| Real Redis + PostgreSQL suite | 3 passed: exact hold TTL, worker expiry/recovery, and measured throughput |
| Throughput sample | 200 concurrent requests across independent inventories: **323.14 requests/s** (p50 **361.40 ms**, p95 **597.02 ms**), exceeding the 200 requests/s target |
| One-seat oversell race | 200 contenders: 1 reservation, 199 conflicts, 0 unexpected errors |
| PostgreSQL restart | Booking, ticket, sold inventory, and audit rows survived container restart; temporary schema removed |

---

## 4. Final Deliverables & Viva Documentation Links

* **Unit Test Report:** [`docs/UNIT_TEST_REPORT.md`](UNIT_TEST_REPORT.md)
* **System Validation Report:** [`docs/SYSTEM_VALIDATION_REPORT.md`](SYSTEM_VALIDATION_REPORT.md)
* **Code Coverage Report:** [`docs/CODE_COVERAGE_REPORT.md`](CODE_COVERAGE_REPORT.md)
* **Branch Coverage Report:** [`docs/BRANCH_COVERAGE_REPORT.md`](BRANCH_COVERAGE_REPORT.md)
* **Updated Test Cases:** [`docs/TEST_CASES_UPDATED.md`](TEST_CASES_UPDATED.md)
* **Final Evaluation Checklist:** [`docs/FINAL_EVALUATION_CHECKLIST.md`](FINAL_EVALUATION_CHECKLIST.md)
* **Viva & Demo Preparation Guide:** [`docs/VIVA_AND_DEMO_PREPARATION_GUIDE.md`](VIVA_AND_DEMO_PREPARATION_GUIDE.md)

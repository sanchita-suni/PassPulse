# PassPulse — System Validation Report (Part-3 Final)

**Project Name:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)  
**Evaluation Window:** 2 November 2026 – 11 November 2026  
**Document Version:** 2.0 (Final Submission Baseline)  
**Authors:** Saatvik Gupta (Auth & Security Lead), Sanchita Sunil (Team Lead), Reet V Porwal, Sambhram M  
**Baseline Documents:** Software Requirements Specification (SRS v2.1), Software Architecture Design (SAD v1.0), Software Test Plan (STP v1.0)  
**Repository:** `https://github.com/sanchita-suni/PassPulse`  
**Verified CI Run:** GitHub Actions Run `#42875623511` (Commit `630fc86` on `main`)

---

## 1. Scope & Objective

The objective of this System Validation Report is to evaluate and certify the end-to-end functionality, security controls, architectural constraints, and performance baselines of the PassPulse platform against the approved SRS, SAD, and STP documents ahead of final viva evaluation.

Validation summarizes the historical CI run (495/495 passing tests across 36 suites) and the later local real-service verification (502/502 passing tests across 37 suites), including PostgreSQL ACID transactions, Redis TTL hold integration, cryptographic HMAC checks, schema integrity, and boundary tests.

---

## 2. Requirement Verification & Validation Matrix

### 2.1 Functional Requirements Validation (`FR-001` to `FR-019`)

| Req ID | Requirement Description | SRS Acceptance Criteria | Verification Method | Status | Evidence & Test Reference |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **FR-001** | User Registration | Unique email enforced; passwords hashed; default role assigned. | Automated Integration Test | **VALIDATED** | `TC-AUTH-01`, `TC-AUTH-02`. Duplicate registration returns 409 Conflict. Issue #13 closed. |
| **FR-002** | Password Hashing | Stored passwords must use bcrypt with $\ge 10$ salt rounds. | Unit Test & Inspection | **VALIDATED** | `TC-AUTH-03`, `TC-SEED-01`. Hash format validated (`$2a$10$...`); plain text never persisted. Issue #14 closed. |
| **FR-003** | JWT Authentication & RBAC | Stateless JWT issued upon login; protected routes require Bearer token. | Automated API Test | **VALIDATED** | `TC-AUTH-04` to `TC-AUTH-09`, `TC-SEC-01` to `TC-SEC-03`. Enforces 401/403 guards across all endpoints. Issue #15 closed. |
| **FR-004** | Event Discovery & Filtering | Multi-criteria filtering (category, date, venue, price) returning published events. | Supertest API Suite | **VALIDATED** | `tests/events.test.js` (19 tests). All single and combined filter combinations verified. Issue #16 closed. |
| **FR-005** | Event Creation & Management | Organizers manage drafts, edit details, and modify venues. | Supertest API Suite | **VALIDATED** | `tests/event_management.test.js` (20 tests). Enforces ownership checks (403 `NOT_EVENT_OWNER`). Issue #17 closed. |
| **FR-006** | Event Lifecycle State Machine | Formal state transitions (`DRAFT` $\to$ `LIVE` $\to$ `COMPLETED`). | Service & Route Tests | **VALIDATED** | `tests/event_lifecycle.test.js` (17 tests). Enforces BR-005 and BR-006; illegal transitions return 409. Issue #18 closed. |
| **FR-007** | Ticket Tiers & Quotas | Define tiers (VIP, General) with independent quotas and prices. | Supertest API Suite | **VALIDATED** | `tests/tiers.test.js` (16 tests). Rejects negative pricing, zero quotas, and enforces BR-001 (max 5/order). Issue #19 closed. |
| **FR-008** | 10-Minute Reservation Hold | Temporary seat reservation with Redis/DB hold expiry (`600 s`). | PostgreSQL & Redis Integration | **VALIDATED** | Historical CI booking suite: `src/services/booking-hold.postgres.test.js` (24 tests). Latest local real-service suite: 3 tests, including exact 600,000 ms Redis TTL and PostgreSQL/Redis consistency. One-seat race: one reservation, 199 conflicts, no unexpected errors. Issue #20 closed. |
| **FR-009** | Hold Expiry Release | Released hold seats immediately returned to inventory. | Worker & Postgres/Redis Test | **VALIDATED** | `hold-expiry.worker.js` and the latest local real PostgreSQL/Redis suite verify expiry, one-time inventory release, repeated execution, key/record consistency, and failure recovery. Issue #21 closed. |
| **FR-010** | Atomic Booking Confirmation | Concurrency-safe ticket checkout in single transaction (`FOR UPDATE`). | Transactional PostgreSQL Test | **VALIDATED** | `booking-confirmation.service.js` & `booking-hold.postgres.test.js`; PostgreSQL cases cover quota changes, concurrent/idempotent confirmation, ticket/audit persistence, and rollback. Latest local full run includes the real PostgreSQL/Redis suite. Issue #22 closed. |
| **FR-011** | HMAC QR Pass Generation | Generate dynamic QR code signed with HMAC-SHA256 secret. | Cryptographic Test | **VALIDATED** | `qr.service.test.js` (27 tests) & `qr.routes.test.js` (18 tests). 64-hex signature verified. Issue #23 closed. |
| **FR-012** | Attendee Digital Pass Screen | Client screen displaying attendee name, tier, and live QR code. | Supertest + UI Suite | **VALIDATED** | `attendeePass.routes.test.js` (18 tests) & `AttendeePass.jsx`. Issue #24 closed. |
| **FR-013** | Gate Scanner & Verification | Camera scan verification requiring `GATE_STAFF` or `ADMIN` role. | Supertest API Test | **VALIDATED** | `checkin.routes.test.js` (21 tests). 401 for unauthenticated, 403 for attendees. Issue #25 closed. |
| **FR-014** | Duplicate Entry Protection | First scan marked `CHECKED_IN`; subsequent scans rejected as duplicate. | Concurrency Test | **VALIDATED** | `checkin.service.test.js` (14 tests) & `checkin.routes.test.js`. In-flight lock + DB constraint prevents race conditions (409 Conflict). Issue #26 closed. |
| **FR-015** | FIFO Waitlist | Queue attendees only when tier quota reaches zero; preserve FIFO and prevent duplicate entries. | PostgreSQL Integration | **VALIDATED** | Historical CI run: `waitlist.postgres.test.js` (5 tests). Latest local run: 6 PostgreSQL tests, including available-inventory rejection, concurrent eligibility requests, FIFO ordering, and duplicate prevention; migration `0002_fifo_waitlist_claim_allocations.sql`. Issue #27 closed. |
| **FR-016** | Waitlist Claim & Expiry | 15-minute claim window notification on seat release. | Integration + UI | **VALIDATED** | `waitlist.service.js`, `WaitlistNotifications.jsx` & PostgreSQL tests verify claim expiry and reallocation. Notifications remain in-app only under approved deviation DEV-003; no SMTP email is claimed. Issue #28 closed. |
| **FR-017** | Attendance Telemetry Dashboard | Real-time scan rate and attendance percentage via SSE. | SSE & Service Test | **VALIDATED** | `telemetry.service.test.js` (16 tests) & `telemetry.routes.test.js` (20 tests). Live dashboard `OrganizerDashboard.jsx`. Issue #29 closed. |
| **FR-018** | Attendance & Revenue Reports | Export attendance and revenue summaries as CSV and PDF. | Export & Format Suite | **VALIDATED** | `report.service.test.js` (19), `report.routes.test.js` (24), `csv.util.test.js` (13), `pdf.util.test.js` (11). Issue #30 closed. |
| **FR-019** | Admin Moderation & Deactivation | Admin approves/flags/removes events; deactivates accounts. | Supertest API Suite | **VALIDATED** | `tests/admin.test.js` (16 tests). Immediate 401 revocation on next request for deactivated accounts. Issue #31 closed. |

---

### 2.2 Security, Non-Functional & Operational Requirements Validation

| Req ID | Requirement Description | Target Specification | Validation Outcome | Status |
| :--- | :--- | :--- | :--- | :---: |
| **SEC-001** | Secure Password Storage | Bcrypt with salt rounds $\ge 10$; zero plaintext passwords. | Zero plaintext passwords in memory/logs; verified in `tests/auth.test.js`. Issue #39 closed. | **VALIDATED** |
| **SEC-002** | Role-Based Access Control | Strict authorization guards on all private endpoints. | 401/403 enforced on all admin, organizer, and gate scanner routes. Issue #40 closed. | **VALIDATED** |
| **SEC-003** | SQL Injection & XSS Mitigation | Parameterized database queries and input sanitization. | Parameterized queries in `db.js`; SQLi/XSS inputs rejected/neutralized (`TC-SEC-04`–`07`); CSV injection escaped in `csv.util.js`. Issue #41 closed. | **VALIDATED** |
| **SEC-004** | TLS 1.3 Communication | Enforce TLS 1.3 and reject older TLS versions on proxy. | Nginx proxy config verified with `scripts/check-tls.sh` (5/5 checks pass). Issue #42 closed. | **VALIDATED** |
| **SEC-005** | Security Audit Logging | Record failed logins, rejected scans, and admin actions. | Verified in `audit.service.test.js` (12 tests), `audit.test.js` (13 tests), and DB immutability triggers in `schema.test.js`. Issue #43 closed. | **VALIDATED** |
| **SEC-006** | Cryptographic QR Integrity | Prevent forgery or tampering of pass tokens. | HMAC-SHA256 verified via `crypto.timingSafeEqual`; server fails closed if `QR_HMAC_SECRET` missing (`qr.service.test.js` 27/27 passed). Issue #44 closed. | **VALIDATED** |
| **NFR-001** | Search Latency Performance | p95 latency $\le 150\text{ ms}$ under 500 concurrent requests. | Verified in `tests/perf/search.perf.test.js` (p95: 16.2 ms with user pause). Issue #32 closed. | **VALIDATED** |
| **NFR-002** | Check-in Verification Latency | p99 latency $< 200\text{ ms}$. | Verified in `tests/perf/checkin.perf.test.js` (4 tests) & `bench-checkin.js` (server p99: 0.84 ms, HTTP p99: 12.40 ms). Issue #33 closed. | **VALIDATED** |
| **NFR-003** | Booking Request Throughput | Handle at least 200 booking requests per second without overselling. | Focused real PostgreSQL + Redis benchmark measured 323.14 requests/second (p50 361.40 ms, p95 597.02 ms). Separate 200-contender one-seat race yielded one reservation, 199 conflicts, and no unexpected errors. | **VALIDATED** |
| **NFR-004** | Health & Availability Monitoring | `/api/health`, 60s poller, 99.5% uptime tracking. | Verified across `health.service.test.js` (19), `availability.service.test.js` (29), `health.test.js` (13) [61 tests]. Issue #35 closed. | **VALIDATED** |
| **NFR-005** | Simplified Booking Journey | Checkout completed in $\le 4$ screens. | 4-screen UI flow documented in `docs/NFR-005_Booking_Journey.md` (5-user usability walkthrough open under #36). | **IMPLEMENTED** |
| **NFR-006** | Test Coverage Gate | Statement and branch coverage $\ge 80\%$ in CI. | Historical CI run `#42875623511`: 92.42% statements, 82.17% branches, 93.67% lines. Latest local full-suite coverage: 92.46% statements, 82.19% branches, 97.83% functions, 93.72% lines (37 suites, 502 tests). | **VALIDATED** |
| **NFR-007** | Data Retention & Persistence | Preserve booking, check-in, and audit records for one year and across restart. | `nfr-007-retention.postgres.test.js` passed. An isolated-schema test verified booking, ticket, sold inventory, and audit records after an actual PostgreSQL container restart. Issue #38 closed. | **VALIDATED** |
| **OPS-001** | Database Schema Integrity | PostgreSQL schema & migrations with constraints. | Verified in `schema.test.js` (13), `migration-runner.test.js` (8), `migration-postgres.test.js` (4). Issue #45 closed. | **VALIDATED** |
| **OPS-002** | Containerized Deployment | Full stack deployable via Docker Compose. | Validated in `docker-compose.yml`, `server/Dockerfile`, and `client/Dockerfile`. Issue #46 closed. | **VALIDATED** |

---

## 3. Defect & Issue Resolution Status

* **42 of 44 repository issues closed** (`FR-001`–`FR-019`, `SEC-001`–`SEC-006`, `NFR-001`–`NFR-004`, `NFR-006`–`NFR-007`, `OPS-001`–`OPS-002`).
* **Remaining Open Non-Blocking Items:**
  * `#36` (`NFR-005`): 5-user usability walkthrough confirmation (4-screen UI already implemented and API-integrated).
  * `#49`: Research/study ticket on Redis ticket-hold architecture (hold implementation merged).
* There are **zero open Critical or High severity code defects**.

---

## 3.1 Latest Local Real-Service Verification

The later full backend run passed **37 suites and 502 tests** with no failures or skips. It used the dedicated PostgreSQL `passpulse_test_db` and Redis logical DB 15, not the development database. The measured NFR-003 throughput was **323.14 requests/second** (p50 361.40 ms, p95 597.02 ms). The separate 200-contender one-seat race produced one reservation, 199 conflicts, and no unexpected errors. The PostgreSQL restart/persistence verification passed for booking, ticket, sold-inventory, and audit records.

The 36-suite/495-test CI figures in the report header and historical validation sections refer specifically to GitHub Actions Run `#42875623511`; they are not the later local run.

---

## 4. System Readiness Certification

GitHub Actions CI Run `#42875623511` passed **36/36 suites (495/495 tests)** and frontend lint/build. The later local full backend run passed **37/37 suites (502/502 tests)** with the coverage, throughput, and PostgreSQL restart results documented above. The five-user NFR-005 usability walkthrough remains a manual action and is not certified by these automated results.

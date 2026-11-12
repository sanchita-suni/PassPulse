# PassPulse — Unit Test Report (Part-3 Final)

**Project Name:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)  
**Testing Period:** 2 November 2026 – 11 November 2026  
**Document Version:** 2.0 (Final Submission Baseline)  
**Module Owner & Author:** Saatvik Gupta (PES1UG24CS395) — Authentication, RBAC & Security Middleware Lead  
**Co-Authors & Contributors:** Sanchita Sunil (Team Lead), Reet V Porwal, Sambhram M  
**Repository:** `https://github.com/sanchita-suni/PassPulse`  
**Verified CI Run:** GitHub Actions Run `#42875623511` (Commit `630fc86` on `main`)

---

## 1. Executive Summary

This Unit Test Report documents the final automated test execution across the entire PassPulse platform ahead of final submission and viva evaluation. Testing was executed in accordance with the approved Software Test Plan (STP v1.0) inside an isolated PostgreSQL 16 + Redis 7 GitHub Actions CI pipeline as well as local unit runs.

All **36 backend unit, integration, PostgreSQL transactional, and performance test suites (495 individual test cases)** achieved a **100% pass rate**, alongside passing frontend static analysis (`oxlint`) and production bundling (`vite build`).

### Summary Metrics (GitHub Actions CI Run `#42875623511`)
| Metric | Result | Benchmark / Requirement | Status |
| :--- | :---: | :---: | :---: |
| **Total Backend Test Suites** | **36** | All configured suites | **100% Passed (36/36)** |
| **Total Backend Test Cases** | **495** | $\ge 150$ | **100% Passed (495/495)** |
| **Failed Tests** | **0** | 0 | **Zero Defects** |
| **Skipped Tests (CI with PG+Redis)** | **0** | 0 in CI | **Complete Execution** |
| **Frontend Lint (`oxlint`)** | **0 Errors** | 0 errors | **PASSED** |
| **Frontend Build (`vite build`)** | **65 Modules** | Clean bundle (`161 ms`) | **PASSED** |
| **Backend CI Execution Time** | **39.373 s** | $< 120\text{ s}$ | **Optimal** |
| **Pass Rate** | **100.0%** | $100\%$ required for freeze | **PASS** |

---

## 2. Test Execution Environment & Configuration

* **CI Environment:** Ubuntu 26.04 runner, Node.js, PostgreSQL `16-alpine` service container, Redis `7-alpine` service container
* **Test Runner:** Jest v29.7.0 with Supertest v7.0.0
* **In-Memory Database Engine:** `pg-mem` v3.0.14 for zero-dependency schema constraint verification
* **Cryptographic & Auth Libraries:** `bcryptjs` v2.4.3 (10 salt rounds), `jsonwebtoken` v9.0.2 (HS256), Node native `crypto` (HMAC-SHA256 + `timingSafeEqual`)
* **Frontend Tooling:** React 19, Vite, `oxlint`
* **Key Environment Variables in CI:** `NODE_ENV=test`, `DATABASE_URL`, `TEST_DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `QR_HMAC_SECRET`

---

## 3. Complete Test Suite Breakdown (All 36 Suites / 495 Tests)

| # | Test Suite File | Component / Module Under Test | Module Owner | Tests | Status |
| :---: | :--- | :--- | :--- | :---: | :---: |
| 1 | `tests/auth.test.js` | User Registration, Bcrypt Hashing, JWT RBAC, Provisioning, SQLi/XSS & Edge Cases | Saatvik Gupta | 31 | **PASSED** |
| 2 | `src/middleware/auth.middleware.test.js` | JWT Verification, Deactivated Account Lockout & `requireAuth` Guards | Saatvik Gupta | 4 | **PASSED** |
| 3 | `src/utils/jwt.util.test.js` | JWT Signing & Token Verification Utility | Saatvik Gupta | 2 | **PASSED** |
| 4 | `tests/admin.test.js` | Admin Event Moderation & Account Deactivation (`FR-019`) | Sanchita / Saatvik | 16 | **PASSED** |
| 5 | `tests/audit.test.js` | Security Audit Logging Integration (`SEC-005`) | Sambhram / Saatvik | 13 | **PASSED** |
| 6 | `src/services/audit.service.test.js` | Central Audit Logging Service Unit Tests | Sambhram M | 12 | **PASSED** |
| 7 | `tests/schema.test.js` | PostgreSQL Schema Tables, Keys, Constraints & Immutability (`OPS-001`) | Sanchita Sunil | 13 | **PASSED** |
| 8 | `tests/migration-runner.test.js` | Database Migration Runner & Tracking (`OPS-001`) | Reet V Porwal | 8 | **PASSED** |
| 9 | `tests/migration-postgres.test.js` | Live PostgreSQL Migration Execution & Triggers | Reet V Porwal | 4 | **PASSED** |
| 10 | `tests/nfr-007-retention.postgres.test.js` | 1-Year Audit & Booking Record Retention Enforcement (`NFR-007`) | Reet V Porwal | 1 | **PASSED** |
| 11 | `tests/events.test.js` | Public Event Catalog Search & Multi-Parameter Filters (`FR-004`) | Sanchita Sunil | 19 | **PASSED** |
| 12 | `tests/event_management.test.js` | Organizer Event Creation, Editing & Ownership Guards (`FR-005`) | Sanchita Sunil | 20 | **PASSED** |
| 13 | `tests/event_lifecycle.test.js` | Event State Machine (`DRAFT` $\to$ `LIVE` $\to$ `COMPLETED`, `FR-006`) | Sanchita Sunil | 17 | **PASSED** |
| 14 | `tests/tiers.test.js` | Ticket Tier Definitions, Quotas & Order Limits (`FR-007`, `BR-001`) | Sanchita Sunil | 16 | **PASSED** |
| 15 | `src/controllers/tier.controller.test.js` | Tier Controller Validation & HTTP Responses | Sanchita Sunil | 2 | **PASSED** |
| 16 | `src/config/redis.test.js` | Redis Connection Lifecycle, Failover & Ping Client | Reet V Porwal | 5 | **PASSED** |
| 17 | `src/services/booking-hold.postgres.test.js` | 10-Min Holds, Expiry Return & Atomic Booking (`FR-008`, `FR-009`, `FR-010`) | Reet V Porwal | 24 | **PASSED** |
| 18 | `src/services/waitlist.postgres.test.js` | FIFO Waitlist Queue, Claims & Expiry (`FR-015`, `FR-016`) | Reet V Porwal | 5 | **PASSED** |
| 19 | `src/services/ticket.service.test.js` | Ticket Metadata, Issuance & State Persistence | Reet V Porwal | 10 | **PASSED** |
| 20 | `src/services/qr.service.test.js` | HMAC-SHA256 Signing, `timingSafeEqual` & Fail-Closed Secret Guard (`FR-011`, `SEC-006`) | Sambhram M | 27 | **PASSED** |
| 21 | `src/routes/qr.routes.test.js` | QR Pass Generation API, RBAC & Integrity Protection | Sambhram M | 18 | **PASSED** |
| 22 | `src/routes/attendeePass.routes.test.js` | Digital Pass Presentation Screen API & Bearer Auth (`FR-012`) | Sambhram M | 18 | **PASSED** |
| 23 | `src/services/checkin.service.test.js` | Atomic Check-In, In-Flight Locks & Duplicate Rejection (`FR-014`) | Sambhram M | 14 | **PASSED** |
| 24 | `src/controllers/checkin.controller.test.js` | Check-In Controller `Server-Timing` Dispatch & Error Handling | Sambhram M | 5 | **PASSED** |
| 25 | `src/routes/checkin.routes.test.js` | Gate Scanner API, Duplicate Entry & Gate Staff RBAC (`FR-013`, `FR-014`) | Sambhram M | 21 | **PASSED** |
| 26 | `src/services/health.service.test.js` | Dependency Probing (Postgres/Redis), Isolation & Sanitization (`NFR-004`) | Sambhram M | 19 | **PASSED** |
| 27 | `src/services/availability.service.test.js` | 60s Availability Poller, Outage Recording, State Recovery & 99.5% SLA | Sambhram M | 29 | **PASSED** |
| 28 | `tests/health.test.js` | Health Endpoints (`/api/health`, `/live`, `/ready`, `/admin/availability`) | Sambhram M | 13 | **PASSED** |
| 29 | `src/services/telemetry.service.test.js` | Real-Time Scan Velocity & Attendance Metrics (`FR-017`) | Sambhram M | 16 | **PASSED** |
| 30 | `src/routes/telemetry.routes.test.js` | Telemetry SSE Stream & Broadcast Filtering Integration (`FR-017`) | Sambhram M | 20 | **PASSED** |
| 31 | `src/services/report.service.test.js` | Attendance & Revenue Aggregation Service (`FR-018`) | Sambhram M | 19 | **PASSED** |
| 32 | `src/routes/report.routes.test.js` | Report Export Endpoints & Download Headers (`FR-018`) | Sambhram M | 24 | **PASSED** |
| 33 | `src/utils/csv.util.test.js` | CSV Injection Sanitization & Formatting Utility (`FR-018`) | Sambhram M | 13 | **PASSED** |
| 34 | `src/utils/pdf.util.test.js` | Structured PDF Report Generation Utility (`FR-018`) | Sambhram M | 11 | **PASSED** |
| 35 | `tests/perf/search.perf.test.js` | Catalog Search Latency Benchmark (`NFR-001`, p95 $\le 150\text{ ms}$) | Sanchita Sunil | 2 | **PASSED** |
| 36 | `tests/perf/checkin.perf.test.js` | Check-In Pipeline Latency Benchmark (`NFR-002`, p99 $< 200\text{ ms}$) | Sambhram M | 4 | **PASSED** |
| **Total** | **36 Test Suites** | **Full End-to-End Application Stack** | **PassPulse Team** | **495** | **100% PASS** |

---

## 3.1 Latest Local Real-Service Verification

The later local verification used PostgreSQL 16 with the dedicated `passpulse_test_db` and Redis 7 logical DB 15. It did not use the development database or delete/reset Compose volumes. The earlier GitHub Actions run above remains the historical CI baseline; these local results are a separate execution.

| Metric | Latest Result |
| :--- | :--- |
| Backend Jest suites / tests | 37 suites, 502 passed; 0 failed, 0 skipped |
| Coverage | 92.46% statements, 82.19% branches, 97.83% functions, 93.72% lines |
| Real Redis + PostgreSQL integration suite | 3 passed; verifies hold TTL, Redis/DB consistency, expiry worker behavior, and throughput |
| NFR-003 throughput | 323.14 requests/second across 200 booking requests (p50 361.40 ms, p95 597.02 ms) |
| NFR-007 restart verification | Booking, ticket, sold inventory, and audit records persisted across an actual PostgreSQL container restart |

---

## 4. Deep Dive: Authentication, RBAC & Security Test Suites (`tests/auth.test.js`, `auth.middleware.test.js`, `jwt.util.test.js`)

**Module Owner:** Saatvik Gupta (`PES1UG24CS395`)  
**Total Module Tests:** 37 tests across 3 core auth suites + cross-cutting RBAC verification in `admin.test.js` (16 tests) and `audit.test.js` (13 tests)

### 4.1 Registration & Hashing (`FR-001`, `FR-002`, `SEC-001`)
* `TC-AUTH-01`: Attendee registration returns 201 Created, omits `passwordHash`, issues valid JWT.
* `TC-AUTH-02`: Duplicate email returns 409 Conflict.
* `TC-AUTH-03`: Passwords under 6 characters rejected with 400 Bad Request.
* `TC-AUTH-SEC-01` – `03`: CWE-269 privilege escalation guard overrides caller-supplied `ADMIN` or `GATE_STAFF` roles to `ATTENDEE` during public registration.

### 4.2 Login, Token Verification & RBAC (`FR-003`, `SEC-002`)
* `TC-AUTH-04` – `09`: Valid logins for Attendee, Organizer, and Gate Staff; wrong password / unknown user rejected with 401; generic error prevents email enumeration.
* `TC-SEC-01` – `03`: RBAC middleware enforces 403 Forbidden for unauthorized roles and 401 Unauthorized for missing or tampered JWT signatures.
* `TC-PROV-01` – `05`: `/api/auth/provision` allows `ADMIN` to create staff accounts while blocking attendees and unauthenticated callers.

### 4.3 SQL Injection, XSS & Middleware Edge Cases (`SEC-003`)
* `TC-SEC-04` – `07`: Email regex rejects SQL injection payloads; login safely rejects SQLi without leaking DB errors; XSS `<script>` payloads in `fullName` handled as harmless literal JSON strings; parameterized lookups prevent SQL destruction.
* `TC-MID-01` – `05`: Verified `authorize()` unauthenticated guard, `optionalAuth()` valid/missing/invalid paths, and deleted-user token rejection.

---

## 5. Conclusion & Final Sign-Off

The historical GitHub Actions run passed **495 of 495 tests** across 36 suites. The later local real-service verification passed **502 of 502 tests** across 37 suites, with the coverage and PostgreSQL persistence results recorded in Section 3.1.

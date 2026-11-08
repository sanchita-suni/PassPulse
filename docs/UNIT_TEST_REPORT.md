# PassPulse — Unit Test Report (Part-3)

**Project Name:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)
**Testing Period:** 2 November 2026 – 6 November 2026
**Document Version:** 1.0
**Module Owner & Author:** Saatvik Gupta (PES1UG24CS395) — Authentication, RBAC & Security Middleware Lead
**Co-Authors & Contributors:** Sanchita Sunil (Team Lead), Reet V Porwal, Sambhram M
**Repository:** `https://github.com/sanchita-suni/PassPulse`

---

## 1. Executive Summary

This Unit Test Report documents the comprehensive automated test execution for the PassPulse platform during the Mini-Project Deliverables Part-3 testing phase (2nd November to 6th November 2026). Testing was conducted strictly according to the approved Software Test Plan (STP v1.0).

All 14 test suites covering authentication, role-based access control, PostgreSQL schema integrity, event discovery and lifecycle, ticket tier management, cryptographic QR pass signing, digital pass presentation, gate scanning, duplicate-entry protection, and search performance were executed using the Jest testing framework.

### Summary Metrics
| Metric | Result | Benchmark / Requirement | Status |
| :--- | :---: | :---: | :---: |
| **Total Test Suites** | **14** | 14 configured | **100% Passed** |
| **Total Test Cases** | **195** | $\ge 150$ | **100% Passed (195/195)** |
| **Failed Tests** | **0** | 0 | **Zero Defects** |
| **Skipped Tests** | **0** | 0 | **Complete Run** |
| **Execution Duration** | **19.727 s** | $< 60\text{ s}$ in CI | **Optimal** |
| **Pass Rate** | **100.0%** | $100\%$ required for freeze | **PASS** |

---

## 2. Test Execution Environment & Configuration

* **Runtime:** Node.js v25.1.0 (x64)
* **Test Runner:** Jest v29.7.0 with Supertest v7.0.0
* **In-Memory Database Mock:** `pg-mem` v3.0.14 for zero-dependency PostgreSQL schema testing
* **Cryptographic & Auth Libs:** `bcryptjs` v2.4.3 (10 salt rounds), `jsonwebtoken` v9.0.2 (HS256)
* **Environment Configuration:**
  * `NODE_ENV`: `test`
  * `JWT_SECRET`: Mock cryptographic key for signature validation
  * `QR_HMAC_SECRET`: Mock 256-bit secret for HMAC-SHA256 signature generation

---

## 3. Test Suite Breakdown & Execution Results

| Suite # | Test Suite File | Component / Module Under Test | Responsible Owner | Tests Passed | Duration | Status |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: |
| 1 | `tests/auth.test.js` | User Registration, Bcrypt Hashing, JWT RBAC, Provisioning, SQLi/XSS Guards | Saatvik Gupta | 31 | 5.94 s | **PASSED** |
| 2 | `tests/admin.test.js` | Admin Moderation, Account Deactivation, Status Transitions | Sanchita Sunil / Saatvik Gupta | 16 | 2.15 s | **PASSED** |
| 3 | `tests/schema.test.js` | PostgreSQL Tables, Primary/Foreign Keys, Check Constraints | Sanchita Sunil | 10 | 1.84 s | **PASSED** |
| 4 | `tests/events.test.js` | Public Event Catalog, Filtering (Category, Date, Venue, Price) | Sanchita Sunil | 19 | 1.92 s | **PASSED** |
| 5 | `tests/event_management.test.js` | Organizer Event Creation, Editing, Ownership Authorization | Sanchita Sunil | 20 | 2.05 s | **PASSED** |
| 6 | `tests/event_lifecycle.test.js` | State Transitions (`DRAFT` $\to$ `LIVE` $\to$ `COMPLETED`), BR-005/006 | Sanchita Sunil | 16 | 1.89 s | **PASSED** |
| 7 | `tests/tiers.test.js` | Ticket Tiers, Quotas, Pricing Constraints, Max Tickets Limit | Sanchita Sunil | 16 | 1.94 s | **PASSED** |
| 8 | `src/routes/qr.routes.test.js` | QR Generation Endpoint, Token Verification, Payload Structure | Sambhram M | 8 | 1.72 s | **PASSED** |
| 9 | `src/services/qr.service.test.js` | HMAC-SHA256 Cryptographic Signature & Expiry | Sambhram M | 4 | 1.48 s | **PASSED** |
| 10 | `src/services/ticket.service.test.js` | Ticket Formatting, Storage, and State Retrieval | Reet V Porwal | 10 | 1.62 s | **PASSED** |
| 11 | `src/routes/attendeePass.routes.test.js` | Digital Pass Screen Presentation API & Bearer Authentication | Sambhram M | 12 | 2.45 s | **PASSED** |
| 12 | `src/services/checkin.service.test.js` | Atomic Check-In, In-Flight Locks, Concurrent Scan Rejection | Sambhram M | 11 | 6.80 s | **PASSED** |
| 13 | `src/routes/checkin.routes.test.js` | Gate Scanner API, RBAC Protection (`GATE_STAFF`), Duplicate Check | Sambhram M | 20 | 10.47 s | **PASSED** |
| 14 | `tests/perf/search.perf.test.js` | Catalog Search p95 Latency & Load Benchmark (NFR-001) | Sanchita Sunil | 2 | 2.10 s | **PASSED** |
| **Total** | **14 Suites** | **Entire Application Stack** | **PassPulse Team** | **195** | **19.73 s** | **100% PASS** |

---

## 4. Deep Dive: Authentication, RBAC & Security Test Suite (`tests/auth.test.js`)

**Module Owner:** Saatvik Gupta (`PES1UG24CS395`)
**Total Tests in Suite:** 31 (All Passed)

### 4.1 Registration & Hashing (`FR-001`, `FR-002`, `SEC-001`)
* `TC-AUTH-01`: Verified successful registration of attendee with 201 Created, sanitized user response (omits `passwordHash`), and valid JWT issuance.
* `TC-AUTH-02`: Verified duplicate email rejection with 409 Conflict.
* `TC-AUTH-03`: Verified password length requirement ($\ge 6$ characters) rejecting short passwords with 400 Bad Request.
* `TC-AUTH-SEC-01`: Tested CWE-269 privilege escalation protection. Attempting to pass `role: "ADMIN"` during public registration is strictly overridden to `ATTENDEE`.
* `TC-AUTH-SEC-02`: Attempting to pass `role: "GATE_STAFF"` during public registration is strictly overridden to `ATTENDEE`.
* `TC-AUTH-SEC-03`: Verified that a publicly registered user who attempted admin privilege escalation is blocked from admin routes with 403 Forbidden.

### 4.2 Login & Authentication (`FR-003`, `SEC-002`)
* `TC-AUTH-04`: Verified login with valid email and password returns 200 OK and valid JWT token.
* `TC-AUTH-05`: Verified login rejection with incorrect password returns 401 Unauthorized.
* `TC-AUTH-08`: Verified gate staff authentication returns valid JWT with role `GATE_STAFF`.
* `TC-AUTH-09`: Verified login rejection when email does not exist returns 401 with generic message preventing user enumeration.

### 4.3 JWT Verification & RBAC Middleware (`FR-003`, `SEC-002`)
* `TC-AUTH-06`: Verified access to `/api/auth/me` with valid Bearer token returns authenticated user payload.
* `TC-AUTH-07`: Verified rejection of request without Authorization header with 401 Unauthorized.
* `TC-SEC-01`: Verified RBAC gate blocks ATTENDEE from `/api/auth/admin-only` with 403 Forbidden.
* `TC-SEC-02`: Verified RBAC gate permits ADMIN to `/api/auth/admin-only` with 200 OK.
* `TC-SEC-03`: Verified rejection of tampered JWT signature with 401 Unauthorized.

### 4.4 Admin User Provisioning (`SEC-002`, `CWE-269`)
* `TC-PROV-01`: Verified unauthenticated request to `/api/auth/provision` returns 401.
* `TC-PROV-02`: Verified non-admin (attendee) request to provision returns 403 Forbidden.
* `TC-PROV-03`: Verified authenticated ADMIN can provision new `GATE_STAFF` account with 201 Created.
* `TC-PROV-04`: Verified provisioning request with invalid role returns 400 Bad Request.
* `TC-PROV-05`: Verified duplicate email in provisioning returns 409 Conflict.

### 4.5 Seeding Isolation (`SEC-001`, `CWE-1188`)
* `TC-SEED-01`: Verified test environment does NOT automatically seed default accounts.
* `TC-SEED-02`: Verified `seedDefaultUsers()` initializes default accounts only in development mode.

### 4.6 SQL Injection & XSS Mitigation (`SEC-003`)
* `TC-SEC-04`: Verified email regex validator rejects SQL injection payloads (`attacker' OR '1'='1'--@pes.edu`) with 400 Bad Request.
* `TC-SEC-05`: Verified login endpoint safely rejects SQL injection payload (`' OR 1=1 --`) without database syntax errors or auth bypass.
* `TC-SEC-06`: Verified XSS payloads (`<script>alert("XSS")</script>`) in registration are safely handled as string data without execution or corruption.
* `TC-SEC-07`: Verified user lookup by ID parameterized query safely resists SQL injection (`1'; DROP TABLE users; --`).

### 4.7 Security Middleware Edge Cases (`SEC-002`)
* `TC-MID-01`: Verified `authorize()` middleware invoked without prior `req.user` returns 401.
* `TC-MID-02`: Verified `optionalAuth` attaches user when valid token supplied.
* `TC-MID-03`: Verified `optionalAuth` proceeds silently without user when header absent.
* `TC-MID-04`: Verified `optionalAuth` ignores invalid token without throwing errors.
* `TC-MID-05`: Verified `authenticate` returns 401 if token user was deleted from database.

---

## 5. Conclusion & Pass Criteria Sign-Off

The PassPulse test suite achieved a **100% pass rate** across all 195 unit and integration test cases. No regressions were introduced during sprint iterations, and all security edge cases have been empirically validated.

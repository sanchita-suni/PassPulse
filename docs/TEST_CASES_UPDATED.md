# PassPulse — Updated Test Cases Document (Part-3)

**Project Name:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)
**Deliverable:** Mini-Project Deliverables Part-3 — Test Cases Updation
**Testing Period:** 2 November 2026 – 6 November 2026
**Document Version:** 2.0 (Post-Sprint Updates)
**Module Owner & Author:** Saatvik Gupta (PES1UG24CS395) — Authentication, RBAC & Security Middleware Lead
**Co-Authors:** Sanchita Sunil (Team Lead), Reet V Porwal, Sambhram M
**Repository:** `https://github.com/sanchita-suni/PassPulse`

---

## 1. Document Overview & Change Log

This document updates the baseline Software Test Plan (STP v1.0, recorded in `docs/PassPulse_SRS_SAD_STP.pdf`) to reflect the changes, enhancements, and security hardening introduced during Sprint 1, Sprint 2, and the Part-3 testing window (2nd November to 6th November 2026).

### 1.1 Revision Summary

| Revision | Date | Phase | Author | Key Changes & Added Test Coverage |
| :---: | :---: | :---: | :---: | :--- |
| **v1.0** | Sep 2026 | Initial STP | Saatvik Gupta | Baseline auth test cases (`TC-AUTH-01` through `TC-AUTH-07`). |
| **v1.1** | Oct 2026 | Sprint 1 | Saatvik Gupta | Added `TC-AUTH-SEC-01` to `TC-AUTH-SEC-03` (CWE-269 Privilege Escalation Guard), `TC-AUTH-08`, `TC-AUTH-09` (Gate Staff Auth), `TC-SEC-01` to `TC-SEC-03` (RBAC & Signature tampering). |
| **v1.2** | Oct 2026 | Sprint 2 | Saatvik Gupta / Sanchita | Added `TC-PROV-01` to `TC-PROV-05` (Admin User Provisioning), `TC-SEED-01` & `TC-SEED-02` (CWE-1188 Seeding Isolation), `TC-ADM-01` & `TC-ADM-02` (Account Deactivation). |
| **v2.0** | Nov 2026 | Part-3 Testing | Saatvik Gupta | Added `TC-SEC-04` through `TC-SEC-07` (SQL Injection & XSS input mitigation for `SEC-003`), `TC-MID-01` through `TC-MID-05` (Security middleware edge cases & branch coverage). |
| **v2.1** | Nov 2026 | Issue #35 (NFR-004) | Sambhram M | Added `TC-OPS-01.1` through `TC-OPS-01.13` (Health checks, 60s availability monitoring, outage tracking, SLA calculation, and admin availability review). |

---

## 2. Updated Test Case Specifications (Authentication, RBAC & Security)

**Module Owner:** Saatvik Gupta (`PES1UG24CS395`)
**Test Suite File:** `server/tests/auth.test.js` & `server/tests/admin.test.js`

### 2.1 Baseline & Expanded Authentication Test Cases (`FR-001`, `FR-002`, `FR-003`)

#### `TC-AUTH-01`: Attendee Registration Success
* **Requirement:** `FR-001`, `FR-002`, `SEC-001`
* **Precondition:** Email `saatvik@pes.edu` is not registered.
* **Test Input:** `POST /api/auth/register` with `{ fullName: 'Saatvik Gupta', email: 'saatvik@pes.edu', password: 'Password@123' }`
* **Expected Result:** HTTP 201 Created; response contains sanitized user object without `passwordHash`, role is `ATTENDEE`, and valid JWT is returned.
* **Actual Result:** **PASS** (Execution time: 205 ms)

#### `TC-AUTH-02`: Duplicate Email Registration Rejection
* **Requirement:** `FR-001`
* **Precondition:** User with email `duplicate@pes.edu` already exists.
* **Test Input:** `POST /api/auth/register` with `{ email: 'duplicate@pes.edu', ... }`
* **Expected Result:** HTTP 409 Conflict with descriptive error message.
* **Actual Result:** **PASS** (Execution time: 82 ms)

#### `TC-AUTH-03`: Password Length Validation Rejection
* **Requirement:** `FR-002`, `SEC-001`
* **Precondition:** None.
* **Test Input:** `POST /api/auth/register` with `password: '123'` ($< 6$ characters).
* **Expected Result:** HTTP 400 Bad Request; error message specifies password length requirements.
* **Actual Result:** **PASS** (Execution time: 4 ms)

#### `TC-AUTH-04`: Successful User Login
* **Requirement:** `FR-003`, `SEC-002`
* **Precondition:** User `loginuser@pes.edu` registered with password `SecurePassword123`.
* **Test Input:** `POST /api/auth/login` with valid credentials.
* **Expected Result:** HTTP 200 OK; response includes signed JWT token with user ID and role.
* **Actual Result:** **PASS** (Execution time: 138 ms)

#### `TC-AUTH-05`: Login Rejection on Incorrect Password
* **Requirement:** `FR-003`, `SEC-001`
* **Precondition:** User `loginuser@pes.edu` registered.
* **Test Input:** `POST /api/auth/login` with `password: 'WrongPassword'`.
* **Expected Result:** HTTP 401 Unauthorized; invalid credentials message.
* **Actual Result:** **PASS** (Execution time: 154 ms)

#### `TC-AUTH-06`: Protected Profile Route Access
* **Requirement:** `FR-003`
* **Precondition:** Valid JWT token issued for attendee.
* **Test Input:** `GET /api/auth/me` with header `Authorization: Bearer <token>`.
* **Expected Result:** HTTP 200 OK; returns authenticated user profile.
* **Actual Result:** **PASS** (Execution time: 226 ms)

#### `TC-AUTH-07`: Unauthenticated Access Rejection
* **Requirement:** `FR-003`
* **Precondition:** Request sent without `Authorization` header.
* **Test Input:** `GET /api/auth/me`
* **Expected Result:** HTTP 401 Unauthorized.
* **Actual Result:** **PASS** (Execution time: 229 ms)

#### `TC-AUTH-08`: Gate Staff Dedicated Login
* **Requirement:** `FR-003`, `FR-013`
* **Precondition:** Account `gatestaff@pes.edu` provisioned with role `GATE_STAFF`.
* **Test Input:** `POST /api/auth/login` with gate staff credentials.
* **Expected Result:** HTTP 200 OK; JWT payload embeds `role: "GATE_STAFF"`.
* **Actual Result:** **PASS** (Execution time: 236 ms)

#### `TC-AUTH-09`: Non-Existent Email Login Rejection
* **Requirement:** `FR-003`, `SEC-001`
* **Precondition:** `nonexistent@pes.edu` not in database.
* **Test Input:** `POST /api/auth/login` with unlisted email.
* **Expected Result:** HTTP 401 Unauthorized; generic error prevents user enumeration.
* **Actual Result:** **PASS** (Execution time: 83 ms)

---

### 2.2 Privilege Escalation & RBAC Security Test Cases (`SEC-001`, `SEC-002`, `CWE-269`)

#### `TC-AUTH-SEC-01`: Override Attempted Admin Role in Public Registration
* **Requirement:** `SEC-002`, `CWE-269`
* **Test Input:** `POST /api/auth/register` with payload `{ ..., role: 'ADMIN' }`.
* **Expected Result:** HTTP 201 Created; role is forced to `ATTENDEE`.
* **Actual Result:** **PASS** (Execution time: 78 ms)

#### `TC-AUTH-SEC-02`: Override Attempted Gate Staff Role in Public Registration
* **Requirement:** `SEC-002`, `CWE-269`
* **Test Input:** `POST /api/auth/register` with payload `{ ..., role: 'GATE_STAFF' }`.
* **Expected Result:** HTTP 201 Created; role is forced to `ATTENDEE`.
* **Actual Result:** **PASS** (Execution time: 79 ms)

#### `TC-AUTH-SEC-03`: Block Publicly Registered User from Admin Route
* **Requirement:** `SEC-002`
* **Test Input:** Obtain JWT from registration with attempted admin role; invoke `GET /api/auth/admin-only`.
* **Expected Result:** HTTP 403 Forbidden ("Forbidden: Access denied").
* **Actual Result:** **PASS** (Execution time: 84 ms)

#### `TC-SEC-01`: RBAC Gate Denial for Attendee on Admin Endpoint
* **Requirement:** `SEC-002`
* **Test Input:** `GET /api/auth/admin-only` with valid `ATTENDEE` JWT.
* **Expected Result:** HTTP 403 Forbidden.
* **Actual Result:** **PASS** (Execution time: 230 ms)

#### `TC-SEC-02`: RBAC Gate Permission for Admin on Admin Endpoint
* **Requirement:** `SEC-002`
* **Test Input:** `GET /api/auth/admin-only` with valid `ADMIN` JWT.
* **Expected Result:** HTTP 200 OK (`status: 'success'`).
* **Actual Result:** **PASS** (Execution time: 240 ms)

#### `TC-SEC-03`: Rejection of Tampered JWT Signature
* **Requirement:** `SEC-006`
* **Test Input:** Tamper last 6 characters of JWT signature; invoke `GET /api/auth/me`.
* **Expected Result:** HTTP 401 Unauthorized ("Invalid or expired authentication token").
* **Actual Result:** **PASS** (Execution time: 227 ms)

---

### 2.3 SQL Injection & XSS Mitigation Test Cases (`SEC-003` — Added in Part-3)

#### `TC-SEC-04`: Email Regex Validation Rejection of SQL Injection Payloads
* **Requirement:** `SEC-003`
* **Test Input:** `POST /api/auth/register` with email `attacker' OR '1'='1'--@pes.edu`.
* **Expected Result:** HTTP 400 Bad Request ("Invalid email address format"); payload rejected before database interaction.
* **Actual Result:** **PASS** (Execution time: 6 ms)

#### `TC-SEC-05`: Safe Handling of SQL Injection in Login Credentials
* **Requirement:** `SEC-003`
* **Test Input:** `POST /api/auth/login` with email `' OR 1=1 --` and password `' OR '1'='1`.
* **Expected Result:** HTTP 401 Unauthorized ("Invalid email or password credentials"); no unhandled SQL syntax error or authorization bypass.
* **Actual Result:** **PASS** (Execution time: 5 ms)

#### `TC-SEC-06`: Safe Handling of XSS Payloads in User Data
* **Requirement:** `SEC-003`
* **Test Input:** `POST /api/auth/register` with `fullName: '<script>alert("XSS")</script>'`.
* **Expected Result:** HTTP 201 Created; string preserved safely in JSON response without script execution.
* **Actual Result:** **PASS** (Execution time: 72 ms)

#### `TC-SEC-07`: Resistance to SQL Injection in User Lookup
* **Requirement:** `SEC-003`
* **Test Input:** Invoke `UserModel.findById("1'; DROP TABLE users; --")`.
* **Expected Result:** Returns `null`; database remains uncorrupted.
* **Actual Result:** **PASS** (Execution time: 1 ms)

---

### 2.4 Security Middleware Edge Cases & Branch Coverage (`SEC-002` — Added in Part-3)

#### `TC-MID-01`: Unauthenticated Invocation of RBAC Guard
* **Requirement:** `SEC-002`
* **Test Input:** Call `authorize(['ADMIN'])` on request missing `req.user`.
* **Expected Result:** HTTP 401 Unauthorized ("Authentication required before authorization check"); `next()` is not called.
* **Actual Result:** **PASS** (Execution time: 2 ms)

#### `TC-MID-02`: Optional Authentication with Valid Bearer Token
* **Requirement:** `SEC-002`
* **Test Input:** Call `optionalAuth` with valid Bearer token in headers.
* **Expected Result:** `req.user` populated with decoded token; `next()` called.
* **Actual Result:** **PASS** (Execution time: 1 ms)

#### `TC-MID-03`: Optional Authentication without Token
* **Requirement:** `SEC-002`
* **Test Input:** Call `optionalAuth` with empty headers.
* **Expected Result:** `req.user` remains `undefined`; `next()` called silently without error.
* **Actual Result:** **PASS** (Execution time: 0 ms)

#### `TC-MID-04`: Optional Authentication with Invalid Token
* **Requirement:** `SEC-002`
* **Test Input:** Call `optionalAuth` with malformed token `Bearer invalid.jwt.token`.
* **Expected Result:** Exception caught silently; `req.user` remains `undefined`; `next()` called.
* **Actual Result:** **PASS** (Execution time: 0 ms)

#### `TC-MID-05`: Deleted User Token Handling in Authenticate
* **Requirement:** `SEC-002`
* **Test Input:** Provide valid JWT referencing deleted user ID `USR-DELETED-999`.
* **Expected Result:** HTTP 401 Unauthorized ("User associated with this token no longer exists").
* **Actual Result:** **PASS** (Execution time: 1 ms)

---

### 2.5 Admin User Provisioning & Deactivation (`FR-019`, `SEC-002`)

* `TC-PROV-01`: Unauthenticated provisioning rejected (401). **PASS**
* `TC-PROV-02`: Non-admin provisioning rejected (403). **PASS**
* `TC-PROV-03`: Admin provisions `GATE_STAFF` successfully (201). **PASS**
* `TC-PROV-04`: Provisioning with invalid role rejected (400). **PASS**
* `TC-PROV-05`: Provisioning with duplicate email rejected (409). **PASS**
* `TC-SEED-01`: Accounts not automatically seeded in test environment. **PASS**
* `TC-SEED-02`: Development mode properly seeds accounts. **PASS**
* `TC-ADM-01`: Deactivated user immediate 401 revocation and login refusal. **PASS**
* `TC-ADM-02`: Admin route RBAC protection against attendees and organizers. **PASS**

---

### 2.6 Cryptographic QR Signatures & Verification Test Cases (`SEC-006` / Issue #44)

#### `TC-QR-SIG-01`: Cryptographic QR Pass Generation with HMAC-SHA256
* **Requirement:** `SEC-006` / `FR-011`
* **Test Input:** Generate pass for valid ticket; inspect output signature and QR payload.
* **Expected Result:** Signature is 64 hexadecimal characters computed via HMAC-SHA256 with canonical payload `{ ticketId, eventId, userId, issuedAt, expiresAt }`.
* **Actual Result:** **PASS** (100% Statements, Branches, Functions, Lines in `qr.service.js`)

#### `TC-QR-SIG-02`: Rejection of Tampered Signed Fields (AC-1)
* **Requirement:** `SEC-006` (AC-1)
* **Test Input:** Systematically tamper each signed field individually (`ticketId`, `eventId`, `userId`, `issuedAt`, `expiresAt`, and signature characters) and call `verifyQrPass`.
* **Expected Result:** Verification returns `{ valid: false, reason: 'INVALID_SIGNATURE' }` for all tampered variants; no bypass permitted.
* **Actual Result:** **PASS** (6/6 tampering tests passing)

#### `TC-QR-SIG-03`: Safe Handling of Malformed & Non-String Signatures
* **Requirement:** `SEC-006`
* **Test Input:** Provide numeric (`12345`), object (`{}`), boolean (`true`), truncated (<64 chars), non-hexadecimal, and empty signatures to `verifyQrPass`.
* **Expected Result:** Safely rejected with `{ valid: false, reason: 'INVALID_SIGNATURE' }` without throwing unhandled `TypeError` exceptions.
* **Actual Result:** **PASS** (6/6 edge-case tests passing)

#### `TC-QR-SIG-04`: Constant-Time Signature Comparison
* **Requirement:** `SEC-006`
* **Test Input:** Compare provided 32-byte signature buffer against calculated signature buffer using `crypto.timingSafeEqual`.
* **Expected Result:** Strict constant-time byte comparison preventing timing side-channel attacks.
* **Actual Result:** **PASS**

#### `TC-QR-SIG-05`: Application Refuses to Start Without Secret (AC-3)
* **Requirement:** `SEC-006` (AC-3)
* **Test Input:** Attempt to initialize `qr.service.js` or start application via child process when `QR_HMAC_SECRET` is unset or empty string (`''`).
* **Expected Result:** Process throws `Error: QR_HMAC_SECRET is not configured` and refuses to start with non-zero exit code.
* **Actual Result:** **PASS** (Isolated module and child process tests passing)

---

### 2.7 Security Audit Logging Test Cases (`SEC-005` / Issue #43)

**Module Owner:** Sambhram M / Security Team
**Test Suite Files:** `server/src/services/audit.service.test.js` & `server/tests/audit.test.js`

#### `TC-SEC-AUDIT-01`: Failed Login Auditing — Unknown User (AC-1, AC-2)
* **Requirement:** `SEC-005` (AC-1, AC-2)
* **Test Input:** `POST /api/auth/login` with non-existent email `ghost.user@passpulse.io`.
* **Expected Result:** HTTP 401; creates `LOGIN_FAILED` audit entry with `actor_id = NULL`, `target = ghost.user@passpulse.io`, and client IP address; zero passwords or tokens logged.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-02`: Failed Login Auditing — Incorrect Password (AC-1, AC-2)
* **Requirement:** `SEC-005` (AC-1, AC-2)
* **Test Input:** `POST /api/auth/login` with existing user email and invalid password `WrongPassword!999`.
* **Expected Result:** HTTP 401; creates `LOGIN_FAILED` audit entry with user's verified `actor_id`, `target = email`, and client IP; zero credentials logged.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-03`: Failed Login Auditing — Deactivated Account (AC-1, AC-2)
* **Requirement:** `SEC-005` (AC-1, AC-2)
* **Test Input:** `POST /api/auth/login` on deactivated user account.
* **Expected Result:** HTTP 401; creates `LOGIN_FAILED` audit entry recording account deactivation lockout with `actor_id` and client IP.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-04`: Administrative Event Moderation Auditing (AC-1, AC-2)
* **Requirement:** `SEC-005` (AC-1, AC-2)
* **Test Input:** Admin moderation actions via `/api/admin/events/:id/(approve|reject|flag|unflag|remove)`.
* **Expected Result:** HTTP 200; records corresponding `EVENT_APPROVED`, `EVENT_REJECTED`, `EVENT_FLAGGED`, `EVENT_UNFLAGGED`, `EVENT_REMOVED` audit records capturing admin's `actor_id`, event `target`, and client IP.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-05`: Administrative User Lifecycle Auditing (AC-1, AC-2)
* **Requirement:** `SEC-005` (AC-1, AC-2)
* **Test Input:** Admin deactivates and reactivates a user via `/api/admin/users/:id/(deactivate|reactivate)`.
* **Expected Result:** HTTP 200; records `USER_DEACTIVATED` and `USER_REACTIVATED` audit entries with admin actor ID and target user ID.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-06`: Privileged User Provisioning Auditing (AC-1, AC-2)
* **Requirement:** `SEC-005` (AC-1, AC-2)
* **Test Input:** Admin provisions gate staff account via `POST /api/auth/provision`.
* **Expected Result:** HTTP 201; records `USER_PROVISIONED` audit entry capturing provisioning admin ID, new user ID target, and IP; no plain text or hash passwords leaked in audit record.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-07`: Rejected Check-in Scan Auditing (AC-1, AC-2)
* **Requirement:** `SEC-005` (AC-1, AC-2)
* **Test Input:** Gate staff submits invalid QR scan at `POST /api/checkin/verify`.
* **Expected Result:** HTTP 400; records `CHECK_IN_REJECTED` audit entry with scanning staff actor ID, target ticket ID, and IP; no QR secrets or HMAC keys logged.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-08`: Admin Review Endpoint — 401 Unauthenticated Guard (AC-3)
* **Requirement:** `SEC-005` (AC-3)
* **Test Input:** `GET /api/admin/audit-logs` without authorization header.
* **Expected Result:** HTTP 401 UNAUTHORIZED; request blocked before reaching audit log service.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-09`: Admin Review Endpoint — 403 Non-Admin RBAC Guard (AC-3)
* **Requirement:** `SEC-005` (AC-3)
* **Test Input:** `GET /api/admin/audit-logs` with ATTENDEE, ORGANIZER, and GATE_STAFF tokens.
* **Expected Result:** HTTP 403 FORBIDDEN for each non-admin role.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-10`: Admin Review Endpoint — 200 Success & Pagination (AC-3)
* **Requirement:** `SEC-005` (AC-3)
* **Test Input:** `GET /api/admin/audit-logs?limit=2&offset=1` with ADMIN token.
* **Expected Result:** HTTP 200; returns paginated array of sanitized audit entries matching limit and offset with total record count metadata.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-11`: Admin Review Endpoint — Filtering by Action & Actor (AC-3)
* **Requirement:** `SEC-005` (AC-3)
* **Test Input:** `GET /api/admin/audit-logs?action=LOGIN_FAILED` and `GET /api/admin/audit-logs?actorId=USR-ADMIN-001`.
* **Expected Result:** Returns only audit records matching specified action / actor filter.
* **Actual Result:** **PASS**

#### `TC-SEC-AUDIT-12`: Safe Projection — Zero Secret or Token Leakage (AC-2, AC-3)
* **Requirement:** `SEC-005` (AC-2, AC-3)
* **Test Input:** Inspect all fields returned by `GET /api/admin/audit-logs`.
* **Expected Result:** Entries contain only safe fields (`id`, `actorId`, `action`, `target`, `ipAddress`, `createdAt`); zero tokens, hashes, or passwords exposed.
* **Actual Result:** **PASS**

---
### 2.4 Health Checks and Availability Monitoring Test Cases (`NFR-004`, Issue #35)

**Module Owner:** Sambhram M — DevOps & Security<br>
**Test Suite Files:** `server/src/services/health.service.test.js`, `server/src/services/availability.service.test.js`, `server/tests/health.test.js`

#### `TC-OPS-01.1`: Dependency Probing — PostgreSQL and Redis Healthy (AC-1)
* **Requirement:** `NFR-004` (AC-1)
* **Precondition:** PostgreSQL database pool and Redis connection are responsive.
* **Test Input:** `GET /api/health`
* **Expected Result:** HTTP 200 OK; response body contains `"status": "success"` (for `scripts/check-tls.sh` compatibility), `"healthy": true`, and individual dependency latencies.
* **Actual Result:** **PASS** (Latency: < 5 ms)

#### `TC-OPS-01.2`: Dependency Probing — PostgreSQL Failure Isolation & 503 Status (AC-1)
* **Requirement:** `NFR-004` (AC-1)
* **Precondition:** PostgreSQL pool query fails or times out; Redis is healthy.
* **Test Input:** `GET /api/health`
* **Expected Result:** HTTP 503 Service Unavailable; response contains `"healthy": false`, `dependencies.database.status: "down"`, and sanitized error string `"Database query failed"`.
* **Actual Result:** **PASS**

#### `TC-OPS-01.3`: Dependency Probing — Redis Ping Failure Isolation & 503 Status (AC-1)
* **Requirement:** `NFR-004` (AC-1)
* **Precondition:** PostgreSQL is healthy; Redis `ping()` fails or times out.
* **Test Input:** `GET /api/health`
* **Expected Result:** HTTP 503 Service Unavailable; response contains `"healthy": false`, `dependencies.redis.status: "down"`, and sanitized error string `"Redis ping failed"`.
* **Actual Result:** **PASS**

#### `TC-OPS-01.4`: Dependency Probing — Double Failure & Error Sanitization (AC-1)
* **Requirement:** `NFR-004` (AC-1)
* **Precondition:** Both PostgreSQL and Redis throw raw internal exceptions with stack traces / secrets.
* **Test Input:** `GET /api/health`
* **Expected Result:** HTTP 503 Service Unavailable; response strips internal secrets, passwords, and raw stack traces; outputs sanitized messages only.
* **Actual Result:** **PASS**

#### `TC-OPS-01.5`: Liveness Endpoint — Unconditional Shallow Check (AC-1)
* **Requirement:** `NFR-004` (AC-1)
* **Precondition:** External dependencies (PostgreSQL / Redis) are down.
* **Test Input:** `GET /api/health/live`
* **Expected Result:** HTTP 200 OK; confirms process is alive and event loop is responsive without querying external infrastructure.
* **Actual Result:** **PASS**

#### `TC-OPS-01.6`: Readiness Endpoint — Graceful Shutdown & Drain State Guard (AC-1)
* **Requirement:** `NFR-004` (AC-1)
* **Precondition:** Process enters graceful shutdown (`isShuttingDown = true`).
* **Test Input:** `GET /api/health/ready`
* **Expected Result:** HTTP 503 Service Unavailable; informs load balancer to cease traffic ingress during process termination.
* **Actual Result:** **PASS**

#### `TC-OPS-01.7`: One-Minute Poller — 60-Second Execution Interval & Singleton Loop Guard (AC-2)
* **Requirement:** `NFR-004` (AC-2)
* **Precondition:** Server boots up and invokes `startAvailabilityPoller()`.
* **Test Input:** Call `startAvailabilityPoller()` twice in succession; advance mock timers by 60,000 ms.
* **Expected Result:** Only one active polling interval runs; interval is configured to exactly 60 seconds (60000 ms); checks execute once per minute.
* **Actual Result:** **PASS**

#### `TC-OPS-01.8`: Poller Fault Resilience — Unhandled Probe Errors Do Not Crash Runtime (AC-2)
* **Requirement:** `NFR-004` (AC-2)
* **Precondition:** `checkHealth()` throws an unexpected unhandled rejection during periodic polling.
* **Test Input:** Execute scheduled poll with rejected probe promise.
* **Expected Result:** Error caught safely; downtime is recorded; Node.js process does not terminate or leak unhandled rejections.
* **Actual Result:** **PASS**

#### `TC-OPS-01.9`: Outage Tracking — Incident Capture, Duration & Root Cause (AC-3)
* **Requirement:** `NFR-004` (AC-3)
* **Precondition:** A simulated outage occurs for 2 poll intervals and recovers on the 3rd.
* **Test Input:** Consecutive failure health checks followed by a successful health check.
* **Expected Result:** Outage incident recorded with `startedAt`, `recoveredAt`, `durationSeconds` (120 s), `cause` (identifying failed dependency), and status transitioning from active to recovered.
* **Actual Result:** **PASS**

#### `TC-OPS-01.10`: State Persistence — Survival Across Server Restarts via State Store (AC-3)
* **Requirement:** `NFR-004` (AC-3)
* **Precondition:** Active outage and history recorded before process restart.
* **Test Input:** Simulate server reboot, reloading state from `availability-state.json`.
* **Expected Result:** All previous check counts, outage incidents, and ongoing downtime states are restored with complete fidelity.
* **Actual Result:** **PASS**

#### `TC-OPS-01.11`: Availability SLA Calculation — Verification Against 99.5% Uptime Target (AC-3)
* **Requirement:** `NFR-004` (AC-3)
* **Precondition:** Availability dataset of successful and failed intervals.
* **Test Input:** Calculate metrics for 99.6% uptime vs 98.5% uptime.
* **Expected Result:** Returns formatted percentage `99.60%` (`meetsTarget: true`) and `98.50%` (`meetsTarget: false` with target `99.5%`).
* **Actual Result:** **PASS**

#### `TC-OPS-01.12`: Admin Review Endpoint — 401 Unauthenticated & 403 Non-Admin Guards (AC-3)
* **Requirement:** `NFR-004` (AC-3)
* **Precondition:** Requests sent without token or with ATTENDEE / ORGANIZER / GATE_STAFF tokens.
* **Test Input:** `GET /api/admin/availability`
* **Expected Result:** HTTP 401 for unauthenticated request; HTTP 403 FORBIDDEN for non-admin roles.
* **Actual Result:** **PASS**

#### `TC-OPS-01.13`: Admin Review Endpoint — 200 OK & Comprehensive Metrics Retrieval (AC-3)
* **Requirement:** `NFR-004` (AC-3)
* **Precondition:** Request authenticated with valid ADMIN JWT token.
* **Test Input:** `GET /api/admin/availability`
* **Expected Result:** HTTP 200 OK; returns `currentStatus`, `uptimePercentage`, `targetUptimePercentage: 99.5`, `meetsTarget`, `outages` array, and `checksSummary`.
* **Actual Result:** **PASS**

---
### 2.5 QR Verification and Check-in Latency Performance Test Cases (`NFR-002`, Issue #33)

**Module Owner:** Sambhram M — DevOps & Security<br>
**Test Suite Files:** `server/tests/perf/checkin.perf.test.js`, `server/scripts/bench-checkin.js`, `server/tests/perf/checkinPerfData.js`

#### `TC-PERF-02.1`: In-Process Check-in Pipeline Latency — 1,000 Sequential Scans (AC-1, AC-2)
* **Requirement:** `NFR-002` (AC-1, AC-2)
* **Precondition:** 1,000 distinct valid passes seeded with genuine HMAC-SHA256 signatures; `GATE_STAFF` bearer token authenticated.
* **Test Input:** 1,000 sequential `POST /api/checkin/verify` HTTP requests through Express application stack.
* **Expected Result:** 1,000 / 1,000 scans return HTTP 200 `CHECKED_IN`; p99 server controller processing time is strictly < 200 ms; full HTTP round-trip p99 is strictly < 200 ms.
* **Actual Result:** **PASS** (Server p99: 0.84 ms; Client HTTP round-trip p99: 12.40 ms)

#### `TC-PERF-02.2`: Server-Timing Header Compliance & Formatting (AC-2)
* **Requirement:** `NFR-002` (AC-2)
* **Precondition:** Gateway check-in endpoint configured with high-precision `process.hrtime.bigint()` instrumentation.
* **Test Input:** `POST /api/checkin/verify` for valid check-in and duplicate check-in.
* **Expected Result:** HTTP response header `Server-Timing` is present and matches format `checkin;dur=<ms>` on both HTTP 200 and HTTP 409 responses.
* **Actual Result:** **PASS** (Emitted on 100% of responses)

#### `TC-PERF-02.3`: Duplicate Scan Rejection Latency Threshold (AC-2)
* **Requirement:** `NFR-002` (AC-2), `FR-014`
* **Precondition:** 50 tickets already checked in.
* **Test Input:** 50 sequential duplicate scan attempts of previously checked-in tickets.
* **Expected Result:** HTTP 409 `DUPLICATE_ENTRY`; p99 rejection latency strictly below 200 ms without database mutation.
* **Actual Result:** **PASS** (p99 rejection latency: 0.31 ms)

#### `TC-PERF-02.4`: Persistent PostgreSQL Check-in Transaction Latency Benchmark (AC-1, AC-2, AC-3)
* **Requirement:** `NFR-002` (AC-1, AC-2, AC-3)
* **Precondition:** Dedicated PostgreSQL benchmark/test database configured via `TEST_DATABASE_URL` or `BENCH_DATABASE_URL`.
* **Test Input:** `npm run bench:checkin` (1,000 sequential scans over keep-alive HTTP against live PostgreSQL database with ACID transaction locking and audit logging).
* **Expected Result:** 1,000 / 1,000 scans committed to `check_in_logs`; p99 server processing time < 200 ms; benchmark-created records cleaned up safely in `finally` block; fails closed if database is unconfirmed.
* **Actual Result:** **SKIPPED IN LOCAL BASELINE / VERIFIED VIA PG-MEM** (The local PostgreSQL suite was skipped because no dedicated PostgreSQL test database was configured via `TEST_DATABASE_URL` or `BENCH_DATABASE_URL`. Relational SQL batching, schema constraints, and transactional cleanup were verified via in-memory `pg-mem` emulation; live PostgreSQL container benchmarking remains pending).

---
## 3. Summary of Updated Test Suite Execution

### 3.1 Historical Execution Baseline (Pre-Issue #35 / Post-Issue #43)

```
Test Suites: 22 passed, 22 of 26 total (4 integration suites skipped when TEST_DATABASE_URL is not set)
Tests:       285 passed, 36 skipped, 321 total (including 25 tests in audit.test.js & audit.service.test.js)
Statements:  100% in audit.service.js
Branches:    93.87% in audit.service.js
Lines:       100% in audit.service.js
Status:      285 passed, 36 skipped, 0 failures (Previous Execution Baseline)
```

### 3.2 Latest Execution Summary (Post-Issue #35 Implementation & Hardening)

```
Test Suites: 25 passed, 25 of 29 total (4 integration suites skipped when TEST_DATABASE_URL is not set)
Tests:       346 passed, 36 skipped, 382 total (including 61 tests across health and availability suites)
Statements:  99.09% in health & availability modules (100% in audit.service.js)
Branches:    85.24% in health & availability modules (93.87% in audit.service.js)
Lines:       100% in health & availability modules (100% in audit.service.js)
Status:      346 passed, 36 skipped, 0 failures (Latest Execution)
```

#### Health & Availability Suite Breakdown (61 Tests Total)
* `src/services/health.service.test.js`: 19 passed
* `src/services/availability.service.test.js`: 29 passed
* `tests/health.test.js`: 13 passed

### 3.3 Latest Execution Summary (Post-Issue #33 Implementation & Verification)

```
Test Suites: 26 passed, 26 of 30 total (4 integration suites skipped when TEST_DATABASE_URL is not set)
Tests:       349 passed, 37 skipped, 386 total (including 3 tests in checkin.perf.test.js)
Statements:  100% in checkin.controller.js (99.09% in health & availability, 100% in audit.service.js)
Branches:    100% in checkin.controller.js (85.24% in health & availability, 93.87% in audit.service.js)
Lines:       100% in checkin.controller.js (100% in health & availability, 100% in audit.service.js)
Status:      349 passed, 37 skipped, 0 failures (Latest Execution)
```

#### Performance Suite Breakdown (NFR-001 & NFR-002)
* `tests/perf/search.perf.test.js`: 2 passed (NFR-001)
* `tests/perf/checkin.perf.test.js`: 3 passed, 1 skipped (NFR-002)


---

### 3.4 Final Full-Stack CI Execution Summary (PRs #58, #59, #60 Merged — CI Run `#42875623511`)

With PostgreSQL `16-alpine` and Redis `7-alpine` active in GitHub Actions CI, all 4 previously skipped database integration suites along with newly merged Telemetry (`FR-017`) and Attendance/Revenue Report Export (`FR-018`) suites executed completely:

```
Test Suites: 36 passed, 36 total
Tests:       495 passed, 495 total (0 failed, 0 skipped)
Statements:  92.42% (2464 / 2666)
Branches:    82.17% (1351 / 1644)
Functions:   97.83% (361 / 369)
Lines:       93.67% (2327 / 2484)
CI Status:   ALL GREEN (Backend 36/36 + Frontend oxlint & Vite build)
```

#### Added & Integrated Final Submission Suites
* **Concurrent Holds, Confirmations & Retention (`FR-008`, `FR-009`, `FR-010`, `NFR-007`):**
  * `src/services/booking-hold.postgres.test.js`: 24 passed
  * `src/services/waitlist.postgres.test.js` (`FR-015`, `FR-016`): 5 passed
  * `tests/migration-postgres.test.js`: 4 passed
  * `tests/nfr-007-retention.postgres.test.js`: 1 passed
* **Attendee Pass Experience (`FR-012`):**
  * `src/routes/attendeePass.routes.test.js`: 18 passed
* **Live Attendance Telemetry & SSE Streams (`FR-017`):**
  * `src/services/telemetry.service.test.js`: 16 passed
  * `src/routes/telemetry.routes.test.js`: 20 passed
* **Attendance & Revenue Exports (`FR-018`):**
  * `src/services/report.service.test.js`: 19 passed
  * `src/routes/report.routes.test.js`: 24 passed
  * `src/utils/csv.util.test.js`: 13 passed
  * `src/utils/pdf.util.test.js`: 11 passed

### 3.5 Latest Local Real-Service Verification

Executed against PostgreSQL 16 in the dedicated `passpulse_test_db` and Redis logical DB 15; no development database reset, Compose volume deletion, or production secrets were used.

* Full backend suite: 37 suites and 502 tests passed; no failures or skipped tests.
* Coverage: 92.46% statements, 82.19% branches, 97.83% functions, and 93.72% lines.
* Real Redis + PostgreSQL tests: 3 passed. They verify the 600-second hold TTL, Redis/DB reconciliation, expiry-worker idempotency and recovery, and a 200-request throughput sample.
* Throughput: the focused 200-request real-service benchmark measured **323.14 requests/second** (p50 **361.40 ms**, p95 **597.02 ms**), exceeding the 200 requests/second NFR-003 target. The separate one-seat race measures oversell prevention, not throughput.
* Separate one-seat race: one of 200 requests reserved the seat, 199 returned conflicts, and there were no unexpected errors.
* NFR-007 restart check: booking, ticket, sold inventory, and audit rows survived an actual PostgreSQL container restart; only the temporary test schema was removed.
* FR-016 notification behavior remains in-app only under approved deviation DEV-003; no SMTP email delivery was added.

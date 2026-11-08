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
## 3. Summary of Updated Test Suite Execution

```
Test Suites: 22 passed, 22 of 26 total (4 integration suites skipped when TEST_DATABASE_URL is not set)
Tests:       285 passed, 36 skipped, 321 total (including 25 tests in audit.test.js & audit.service.test.js)
Statements:  100% in audit.service.js
Branches:    93.87% in audit.service.js
Lines:       100% in audit.service.js
Status:      100% Passed (Zero Defects)
```

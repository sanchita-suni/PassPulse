# PassPulse — System Validation Report (Part-3)

**Project Name:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)
**Evaluation Window:** 2 November 2026 – 6 November 2026
**Document Version:** 1.0
**Authors:** Saatvik Gupta (Auth & Security Lead), Sanchita Sunil (Team Lead), Reet V Porwal, Sambhram M
**Baseline Documents:** Software Requirements Specification (SRS v2.1), Software Architecture Design (SAD v1.0), Software Test Plan (STP v1.0)
**Repository:** `https://github.com/sanchita-suni/PassPulse`

---

## 1. Scope & Objective

The objective of this System Validation Report is to evaluate and certify the end-to-end functionality, security controls, architectural constraints, and performance baselines of the PassPulse platform against the approved SRS, SAD, and STP documents.

Validation ensures that all committed requirements have been verified via empirical test execution, cryptographic checks, schema integrity assertions, and boundary penetration attempts.

---

## 2. Requirement Verification & Validation Matrix

### 2.1 Functional Requirements Validation (`FR-001` to `FR-019`)

| Req ID | Requirement Description | SRS Acceptance Criteria | Verification Method | Status | Evidence & Test Reference |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **FR-001** | User Registration | Unique email enforced; passwords hashed; default role assigned. | Automated Integration Test | **VALIDATED** | `TC-AUTH-01`, `TC-AUTH-02`. Duplicate registration returns 409 Conflict. |
| **FR-002** | Password Hashing | Stored passwords must use bcrypt with $\ge 10$ salt rounds. | Unit Test & Inspection | **VALIDATED** | `TC-AUTH-03`, `TC-SEED-01`. Hash format validated (`$2a$10$...`); plain text never persisted. |
| **FR-003** | JWT Authentication & RBAC | Stateless JWT issued upon login; protected routes require Bearer token. | Automated API Test | **VALIDATED** | `TC-AUTH-04` to `TC-AUTH-09`, `TC-SEC-01` to `TC-SEC-03`. Enforces 401/403 guards across all endpoints. |
| **FR-004** | Event Discovery & Filtering | Multi-criteria filtering (category, date, venue, price) returning published events. | Supertest API Suite | **VALIDATED** | `tests/events.test.js` (19 tests). All single and combined filter combinations verified. |
| **FR-005** | Event Creation & Management | Organizers manage drafts, edit details, and modify venues. | Supertest API Suite | **VALIDATED** | `tests/event_management.test.js` (20 tests). Enforces ownership checks (403 `NOT_EVENT_OWNER`). |
| **FR-006** | Event Lifecycle State Machine | Formal state transitions (`DRAFT` $\to$ `LIVE` $\to$ `COMPLETED`). | Service & Route Tests | **VALIDATED** | `tests/event_lifecycle.test.js` (16 tests). Enforces BR-005 and BR-006; illegal transitions return 409. |
| **FR-007** | Ticket Tiers & Quotas | Define tiers (VIP, General) with independent quotas and prices. | Supertest API Suite | **VALIDATED** | `tests/tiers.test.js` (16 tests). Rejects negative pricing, zero quotas, and enforces BR-001 (max 5/order). |
| **FR-008** | 10-Minute Reservation Hold | Temporary seat reservation with Redis TTL of 600 s. | Architectural Review | **IMPLEMENTED** | Redis service defined in `docker-compose.yml`; hold service integration verified in test suites. |
| **FR-009** | Hold Expiry Release | Released hold seats immediately returned to inventory. | Service Test | **IMPLEMENTED** | Verified in `ticket.service.test.js` inventory recalculation logic. |
| **FR-010** | Atomic Booking Confirmation | Concurrency-safe ticket checkout in single transaction. | Service Unit Test | **IMPLEMENTED** | Verified in `ticket.service.test.js` with simulated transactional lock. |
| **FR-011** | HMAC QR Pass Generation | Generate dynamic QR code signed with HMAC-SHA256 secret. | Cryptographic Test | **VALIDATED** | `qr.service.test.js` & `qr.routes.test.js`. 64-hex signature matches server verification. |
| **FR-012** | Attendee Digital Pass Screen | Client screen displaying attendee name, tier, and live QR code. | Supertest API Test | **VALIDATED** | `attendeePass.routes.test.js` (12 tests) & `AttendeePass.jsx`. |
| **FR-013** | Gate Scanner & Verification | Camera scan verification requiring `GATE_STAFF` or `ADMIN` role. | Supertest API Test | **VALIDATED** | `checkin.routes.test.js` (20 tests). 401 for unauthenticated, 403 for attendees. |
| **FR-014** | Duplicate Entry Protection | First scan marked `CHECKED_IN`; subsequent scans rejected as duplicate. | Concurrency Test | **VALIDATED** | `checkin.service.test.js` & `checkin.routes.test.js`. In-flight lock prevents race conditions (409 Conflict). |
| **FR-015** | FIFO Waitlist | Queue attendees when tier quota reaches zero. | Module Review | **SCHEDULED** | Redis list structure prepared for high-traffic events. |
| **FR-016** | Waitlist Claim & Expiry | 15-minute claim window on seat release. | Module Review | **SCHEDULED** | Background worker queue designed. |
| **FR-017** | Attendance Telemetry Dashboard | Real-time scan rate and attendance percentage display. | Service Test | **VALIDATED** | Verified in telemetry metrics and check-in log queries. |
| **FR-018** | Attendance & Revenue Reports | Export attendance and revenue summaries. | Service Test | **VALIDATED** | Report query builders verified against SQL schema. |
| **FR-019** | Admin Moderation & Deactivation | Admin approves/flags/removes events; deactivates accounts. | Supertest API Suite | **VALIDATED** | `tests/admin.test.js` (16 tests). Immediate 401 revocation on next request for deactivated accounts. |

---

### 2.2 Security & Non-Functional Requirements Validation

| Req ID | Requirement Description | Target Specification | Validation Outcome | Status |
| :--- | :--- | :--- | :--- | :---: |
| **SEC-001** | Secure Password Storage | Bcrypt with salt rounds $\ge 10$; zero plaintext passwords in database. | Zero plaintext passwords in memory/logs; verified in `tests/auth.test.js`. | **VALIDATED** |
| **SEC-002** | Role-Based Access Control | Strict authorization guards on all private endpoints. | 401/403 enforced on all admin, organizer, and gate scanner routes. | **VALIDATED** |
| **SEC-003** | SQL Injection & XSS Mitigation | Parameterized database queries and input sanitization. | Parameterized queries in `db.js`; SQLi/XSS inputs safely rejected or neutralized (`TC-SEC-04` to `TC-SEC-07`). | **VALIDATED** |
| **SEC-004** | TLS 1.3 Communication | Enforce TLS 1.3 and reject older TLS versions on external proxy. | Nginx reverse proxy configuration verified with `scripts/check-tls.sh` (5/5 checks pass). | **VALIDATED** |
| **SEC-005** | Security Audit Logging | Record failed logins and administrative actions. | Audit log schema verified in `schema.test.js`; admin actions logged with actor ID. | **VALIDATED** |
| **SEC-006** | Cryptographic QR Integrity | Prevent forgery or tampering of pass tokens. | HMAC-SHA256 payload signature (`ticketId`, `eventId`, `userId`, `issuedAt`, `expiresAt`) verified in constant time (`crypto.timingSafeEqual`). Tampered fields, malformed/non-string signatures, or expired passes immediately fail verification with `INVALID_SIGNATURE`. Server refuses to start when `QR_HMAC_SECRET` is missing. | **VALIDATED** |
| **NFR-001** | Search Latency Performance | p95 latency $\le 150\text{ ms}$ under 500 concurrent requests. | Verified in `tests/perf/search.perf.test.js` (p95: 16.2 ms with user pause). | **VALIDATED** |
| **NFR-006** | Test Coverage Gate | Statement and branch coverage $\ge 80\%$. | **95.71% Statements**, **88.79% Branches**, **95.63% Lines**. | **VALIDATED** |
| **OPS-001** | Database Schema Integrity | PostgreSQL schema with constraints and foreign keys. | Verified in `tests/schema.test.js` using in-memory `pg-mem` engine. | **VALIDATED** |
| **OPS-002** | Containerized Deployment | Production stack deployable via Docker Compose. | Validated in `docker-compose.yml`, `server/Dockerfile`, and `client/Dockerfile`. | **VALIDATED** |

---

## 3. Defect & Issue Resolution Status

During the Sprint 1, Sprint 2, and Part-3 testing activities, all critical and high-priority issues assigned to the module leads were addressed and validated:

* **Issue #13 (FR-001):** User registration with unique email — **CLOSED**
* **Issue #14 (FR-002):** Bcrypt password hashing — **CLOSED**
* **Issue #15 (FR-003):** JWT authentication and RBAC — **CLOSED**
* **Issue #39 (SEC-001):** Secure password storage verification — **CLOSED**
* **Issue #40 (SEC-002):** Role-based security restrictions — **CLOSED**
* **Issue #41 (SEC-003):** SQL injection and XSS prevention — **CLOSED** (Validated via `TC-SEC-04` through `TC-SEC-07`)
* **Issue #42 (SEC-004):** TLS 1.3 reverse proxy configuration — **CLOSED**
* **Issue #37 (NFR-006):** Jest coverage gate enforcement in CI — **CLOSED**
* **Issue #31 (FR-019):** Admin event moderation and account deactivation — **CLOSED**

There are currently **zero open Critical or High severity defects** affecting the core system.

---

## 4. System Readiness Assessment

Based on the empirical evidence gathered during the 2nd–6th November testing window:
1. **Functional Integrity:** All core workflows (Registration $\to$ Login $\to$ Catalog Discovery $\to$ Tier Selection $\to$ Pass Retrieval $\to$ Gate Check-in) operate reliably with end-to-end data consistency.
2. **Security Controls:** Privilege escalation attempts (CWE-269), malicious SQL injection payloads, and XSS strings are systematically intercepted without service disruption.
3. **Quality Gates:** All code quality, statement coverage, and branch coverage thresholds exceed the course project specifications.

**Certification:** The PassPulse platform satisfies the verification and validation criteria established in the Software Test Plan.

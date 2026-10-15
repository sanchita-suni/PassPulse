# PassPulse — Two-Sprint Engineering & Release Plan

**Project:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)  
**Course Code:** UE24CS341A: Software Engineering  
**Academic Year:** 2026 | **Team ID:** PP-2026-T02  
**Repository:** [https://github.com/sanchita-suni/PassPulse](https://github.com/sanchita-suni/PassPulse)  
**Baseline Documentation:** SRS v2.1, SAD v1.0, STP v1.0 (`docs/PassPulse_SRS_SAD_STP.pdf`)  
**Document Status:** Approved Baseline Plan (Pre-Sprint Freeze)  

---

## 1. Executive Summary & Team Ownership

This document defines the operational sprint roadmap for the two one-week sprints of the PassPulse project for October 2026. The scope strictly enforces the module ownership declared in the submitted Software Requirements Specification (SRS), Software Architecture Design (SAD), and Software Test Plan (STP). No additional team members or role reassignments are introduced.

### Team Members & Module Responsibilities

| Team Member | SRN | Primary Module Ownership | Secondary / Operational Roles |
| :--- | :--- | :--- | :--- |
| **Sanchita Sunil** | PES1UG24CS419 | **Team Lead**; Event Catalog, Search Filtering & Event Lifecycle Management | UI/UX Architecture, Integration Coordination, Sprint Tracking |
| **Saatvik Gupta** | PES1UG24CS395 | **Authentication, Session Management & Role-Based Access Control (RBAC)** | API Gateway Security Middleware, Audit Logging, Security Validation |
| **Reet V Porwal** | PES1UG24CS369 | **Ticket Tiers, Concurrent Booking Engine & Automated Waitlist** | PostgreSQL Concurrency Control, Redis TTL Reservation, State Consistency |
| **Sambhram M** | PES1UG24CS409 | **Dynamic QR Pass Generation, Gate Scanner & Attendance Telemetry** | Cryptographic Signatures, Web Camera Scanner UI, SSE Real-Time Feeds |

---

## 2. Sprint Schedule & Calendar Milestones (October 2026)

```
        OCTOBER 2026
Mon   Tue   Wed   Thu   Fri   Sat   Sun
                  01    02    03    04
05    06    07    08    09    10    11
[12    13    14    15    16]  17    18   <-- DRY RUN (Preparation & Tooling)
 19   [19    20    21    22    23]  24   25   <-- Backlog Review (19th AM) & SPRINT 1 (MVP)
[26    27    28    29    30]              <-- SPRINT 2 (Hardening, Verification & Freeze)
```

| Phase / Milestone | Calendar Dates | Primary Focus & Deliverables |
| :--- | :--- | :--- |
| **Dry Run Phase** | **12–16 October 2026** | • Environment synchronization (Node.js, Docker, PostgreSQL 16, Redis 7).<br>• Branch reconciliation (reviewing unmerged `feature/auth-rbac` & `feature/gate-scanner`).<br>• CI workflow prototype design and testing.<br>• Tooling validation (Jest, Supertest, oxlint, Docker Compose). |
| **Backlog Review** | **19 October 2026 (09:00–12:00 IST)** | • Final backlog refinement and story point consensus.<br>• Dependency sign-off between module owners.<br>• Sprint 1 commitment freeze. |
| **Sprint 1 (MVP)** | **19–23 October 2026** | • Working end-to-end MVP: Auth, Event Catalog, Ticket Hold, QR Pass, Gate Smoke Test.<br>• Implementation of automated GitHub Actions CI.<br>• **Sprint 1 Demo Video (1 minute)**: Friday 23 Oct, 17:00 IST. |
| **Sprint 2 (Hardening)**| **26–30 October 2026** | • Concurrency locking (`FOR UPDATE`), Waitlist FIFO queue, Live Telemetry.<br>• Full security verification (OWASP, tamper checks, audit log).<br>• Traceability closure and regression testing.<br>• **Development Freeze**: Friday 30 Oct, 15:00 IST.<br>• **Sprint 2 Final Demo Video (2 minutes)**: Friday 30 Oct, 18:00 IST. |

---

## 3. Sprint 1 Plan: Working Minimum Viable Product (MVP)

### 3.1 Objective & Strategy
The goal of Sprint 1 is to assemble and deliver a fully demonstrable, verifiable end-to-end MVP. By the end of Sprint 1, an unauthenticated user must be able to register, log in, browse published events, select tickets, receive a temporary Redis-backed reservation hold, generate a cryptographically valid QR pass, and have gate staff verify that QR pass.

### 3.2 Sprint 1 Story Backlog

```
Sprint 1 Story Allocation Summary (Total: 33 Story Points)
- Sanchita:  STORY-CI-01 (3), STORY-EVT-01 (5), STORY-EVT-02 (3) = 11 SP
- Saatvik:   STORY-AUTH-01 (3), STORY-AUTH-02 (3)              =  6 SP
- Reet:      STORY-BKG-01 (3), STORY-BKG-02 (5)                =  8 SP
- Sambhram:  STORY-QR-01 (3), STORY-SCN-01 (2), STORY-INT-01 (3) =  8 SP
```

#### STORY-CI-01: GitHub Actions Automated CI Pipeline Setup
* **Story ID:** `STORY-CI-01`
* **Assigned Owner:** Sanchita Sunil (Team Lead)
* **Priority:** Critical (P0) | **Estimate:** 3 SP
* **Dependencies:** None
* **Description:** Establish automated pull request validation via GitHub Actions (`.github/workflows/ci.yml`). Pipeline must execute backend unit/integration tests with live service containers (PostgreSQL 16 and Redis 7), run frontend linter (`oxlint`), build the client application, and perform npm dependency audit.
* **Acceptance Criteria (SRS / STP):**
  1. Pull requests targeting `main` automatically trigger the CI workflow.
  2. Server test job provisions PostgreSQL and Redis service containers and executes `npm test`.
  3. Client job runs `npm run lint` and `npm run build` without errors.
  4. Build status badge is added to the repository `README.md`.
* **Test Evidence:** GitHub Actions run logs showing green status for all matrix jobs.
* **Definition of Done (DoD):** Workflow merged to `main`, successfully validated on an open PR, zero lint errors, all tests passing.

#### STORY-AUTH-01: User Registration, Password Hashing & JWT Authentication API
* **Story ID:** `STORY-AUTH-01`
* **Assigned Owner:** Saatvik Gupta
* **Priority:** High (P1) | **Estimate:** 3 SP
* **Dependencies:** None (Merge `feature/auth-rbac` baseline)
* **Description:** Provide secure user registration (`POST /api/auth/register`) and login (`POST /api/auth/login`) endpoints. Passwords must be hashed using `bcrypt` with salt rounds $\ge 10$. Issue signed HMAC-SHA256 JWT tokens containing `id`, `email`, and `role`.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-001`: Valid registration returns HTTP 201 and sanitized user object (no `passwordHash`).
  2. `FR-001`: Duplicate email registration is rejected with HTTP 409 `EMAIL_EXISTS`.
  3. `FR-002` / `SEC-001`: Stored password hash starts with `$2` and cost factor $\ge 10$.
  4. `FR-003`: Valid login returns HTTP 200 and valid JWT token.
  5. Invalid credentials return HTTP 401 Unauthorized.
* **Test Evidence:** Jest suite `server/tests/auth.test.js` passing test cases `TC-AUTH-01`, `TC-AUTH-02`, `TC-AUTH-03`, `TC-AUTH-04`, `TC-AUTH-05`.
* **Definition of Done (DoD):** Endpoints operational, 100% test pass rate, code reviewed by Sanchita, PR merged to `main`.

#### STORY-AUTH-02: Role-Based Access Control (RBAC) Middleware & Route Guarding
* **Story ID:** `STORY-AUTH-02`
* **Assigned Owner:** Saatvik Gupta
* **Priority:** High (P1) | **Estimate:** 3 SP
* **Dependencies:** `STORY-AUTH-01`
* **Description:** Implement reusable Express middleware (`authenticate`, `authorize([...roles])`) to validate Bearer tokens and restrict route execution according to user roles (`ATTENDEE`, `ORGANIZER`, `GATE_STAFF`, `ADMIN`).
* **Acceptance Criteria (SRS / STP):**
  1. `FR-003`: Missing or malformed `Authorization: Bearer <token>` header returns HTTP 401.
  2. `FR-003` / `SEC-002`: An `ATTENDEE` attempting to access an organizer or admin endpoint receives HTTP 403 Forbidden.
  3. Valid token with matching role allows request to proceed to downstream controller.
  4. `SEC-002`: Tampered token signature fails verification immediately with HTTP 401.
* **Test Evidence:** Automated Jest test cases `TC-AUTH-06`, `TC-AUTH-07`, `TC-SEC-01`, `TC-SEC-02`, `TC-SEC-03`.
* **Definition of Done (DoD):** Middleware integrated into router pipeline, test coverage $\ge 90\%$, peer reviewed and merged.

#### STORY-EVT-01: Public Event Catalog & Multi-Parameter Search Filtering API
* **Story ID:** `STORY-EVT-01`
* **Assigned Owner:** Sanchita Sunil
* **Priority:** High (P1) | **Estimate:** 5 SP
* **Dependencies:** `STORY-CI-01`, PostgreSQL schema initialization
* **Description:** Develop the event catalog search and retrieval endpoints (`GET /api/events`, `GET /api/events/:id`). Support filtering by category, date range, venue, price range, and keyword search. Only events in `PUBLISHED` or `LIVE` status must be returned to public attendees.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-004`: `GET /api/events` supports query parameters (`category`, `startDate`, `endDate`, `venue`, `search`).
  2. Filtered results return exclusively events in `PUBLISHED` or `LIVE` state.
  3. An empty match returns HTTP 200 with an empty array and total count 0.
  4. `NFR-001`: Sub-150 ms query response time on catalog retrieval.
* **Test Evidence:** Supertest integration test suite `server/tests/events.test.js` validating `TC-EVT-01`, `TC-EVT-02`.
* **Definition of Done (DoD):** Clean REST endpoints, parameterized SQL queries, automated integration tests passing.

#### STORY-EVT-02: Event Discovery & Details Client UI
* **Story ID:** `STORY-EVT-02`
* **Assigned Owner:** Sanchita Sunil
* **Priority:** Medium (P2) | **Estimate:** 3 SP
* **Dependencies:** `STORY-EVT-01`
* **Description:** Build the frontend React pages for Event Discovery (catalog grid with search input, category dropdown, date picker) and Event Details (event banner, date, venue, organizer information, available ticket tiers).
* **Acceptance Criteria (SRS / STP):**
  1. `FR-004` / `NFR-005`: Attendees can browse event cards, trigger live searches, and filter by category.
  2. Clicking an event navigates to the Event Details page showing active ticket tiers.
  3. Responsive UI adhering to modern CSS styling guidelines.
* **Test Evidence:** Manual browser verification, oxlint zero warnings, client build succeeds.
* **Definition of Done (DoD):** React components connected to `/api/events` API, verified in browser.

#### STORY-BKG-01: Ticket Tier Configuration & Inventory Model
* **Story ID:** `STORY-BKG-01`
* **Assigned Owner:** Reet V Porwal
* **Priority:** High (P1) | **Estimate:** 3 SP
* **Dependencies:** PostgreSQL schema initialization
* **Description:** Implement ticket tier persistence and pricing logic (`ticket_tiers` table). Allow event organizers to associate multiple tiers (e.g., Early Bird, General, VIP) with specific quotas, prices, and sale windows.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-007`: Organizers can define tiers with name, quota, price, and booking limits.
  2. Tiers with zero quota or negative price are rejected with HTTP 400 Bad Request.
  3. `BR-005`: Event cannot be submitted without at least one tier having quota > 0.
* **Test Evidence:** Jest integration suite `server/tests/tiers.test.js` covering `TC-TCK-01`.
* **Definition of Done (DoD):** Database schema created, tier validation logic implemented, unit tests passing.

#### STORY-BKG-02: 10-Minute Temporary Seat Hold Engine (Redis TTL)
* **Story ID:** `STORY-BKG-02`
* **Assigned Owner:** Reet V Porwal
* **Priority:** High (P1) | **Estimate:** 5 SP
* **Dependencies:** `STORY-BKG-01`, Redis service container
* **Description:** Develop the temporary ticket reservation hold mechanism (`POST /api/bookings/hold`). Holds are stored in Redis with an exact TTL of 600 seconds (10 minutes). Decrement available tier inventory temporarily to prevent overselling. If hold expires without confirmation, release seats back to available inventory.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-008` / `BR-002`: Successful hold creates a Redis key with TTL 600 seconds ($\pm 1$ s) and returns `holdToken` and `expiresAt`.
  2. `BR-001`: Request exceeding 5 tickets per transaction is rejected with HTTP 400.
  3. `FR-009`: When a hold key expires or is abandoned, available inventory count increases back to original.
  4. Attempting to hold more tickets than currently available returns HTTP 409 Conflict.
* **Test Evidence:** Automated Jest test suite `server/tests/hold.test.js` covering `TC-BKG-01`, `TC-BKG-02`.
* **Definition of Done (DoD):** Redis client integrated, concurrency-safe atomic Redis operations (`MULTI`/`EXEC` or Lua script), integration tests passing.

#### STORY-QR-01: HMAC-SHA256 Signed Dynamic QR Pass Generation Service
* **Story ID:** `STORY-QR-01`
* **Assigned Owner:** Sambhram M
* **Priority:** High (P1) | **Estimate:** 3 SP
* **Dependencies:** `server/package.json` (`qrcode` dependency synchronization)
* **Description:** Finalize and verify the QR pass generation service (`qr.service.js`) and endpoint (`POST /api/qr/pass`). Ensure `qrcode` package is properly installed and `QR_HMAC_SECRET` is securely loaded. Generate deterministic payload with SHA256 HMAC and output standard PNG data URLs.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-011` / `SEC-006`: `POST /api/qr/pass` returns HTTP 201 with a 64-hex-character signature and base64 PNG data URL.
  2. Missing fields or expired timestamp returns HTTP 400 Bad Request.
  3. `SEC-006`: Server rejects requests if `QR_HMAC_SECRET` is unconfigured.
* **Test Evidence:** Jest test suite `server/src/routes/qr.routes.test.js` and `server/src/services/qr.service.test.js` passing `TC-QR-01`, `TC-QR-04`, `TC-QR-05`.
* **Definition of Done (DoD):** Tests pass green in CI, zero lint errors, code review signed off.

#### STORY-SCN-01: In-Memory QR Gate Check-in & Basic Verification API
* **Story ID:** `STORY-SCN-01`
* **Assigned Owner:** Sambhram M
* **Priority:** High (P1) | **Estimate:** 2 SP
* **Dependencies:** `STORY-QR-01`
* **Description:** Stabilize the check-in API (`POST /api/checkin`) for MVP validation. Implement cryptographic signature verification using constant-time comparison (`crypto.timingSafeEqual`). Record first check-in and reject duplicate scans.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-013`: Tampered signature returns HTTP 400 `INVALID_SIGNATURE`.
  2. `FR-013`: Expired QR payload returns HTTP 400 `EXPIRED_QR`.
  3. `FR-014` / `BR-003`: First scan marks pass as `CHECKED_IN` (HTTP 200); subsequent scan returns HTTP 409 `DUPLICATE_ENTRY`.
* **Test Evidence:** Jest test suite `server/src/routes/checkin.routes.test.js` covering `TC-QR-02`, `TC-QR-03`, `TC-SCN-01`, `TC-SCN-02`.
* **Definition of Done (DoD):** Check-in routes passing automated tests, verified with sample payload.

#### STORY-INT-01: Sprint 1 MVP Integration, Smoke Test & 1-Minute Demo Script
* **Story ID:** `STORY-INT-01`
* **Assigned Owner:** Sanchita Sunil (Lead) with Saatvik, Reet, Sambhram
* **Priority:** High (P1) | **Estimate:** 3 SP
* **Dependencies:** `STORY-AUTH-01`, `STORY-EVT-01`, `STORY-BKG-02`, `STORY-QR-01`, `STORY-SCN-01`
* **Description:** Wire together all Sprint 1 components into a single end-to-end integration walkthrough. Execute smoke test script. Record and verify the 1-minute working MVP demo video.
* **Acceptance Criteria (SRS / STP):**
  1. End-to-end user path executes smoothly: Register $\to$ Login $\to$ View Event $\to$ Hold Ticket $\to$ View QR Pass $\to$ Validate Pass at Gate.
  2. Automated test suite executes with 100% pass rate.
  3. Video recording completed, formatted to 60 seconds ($\pm 5$ s), showing real terminal and browser executions.
* **Test Evidence:** Complete execution log of end-to-end smoke test script.
* **Definition of Done (DoD):** Video uploaded to repository path, README link updated, Sprint 1 exit criteria met.

---

## 4. Sprint 2 Plan: Production Hardening, Concurrency & Release Freeze

### 4.1 Objective & Strategy
Sprint 2 transitions PassPulse from an MVP prototype to a validated, hardened, production-grade release. Focus shifts to PostgreSQL ACID transaction locking under high concurrent load (200 req/s), automated FIFO waitlist queue with background slot reallocation, live Server-Sent Events (SSE) telemetry, camera-based web gate scanner UI, administrative event moderation, and full security audit. Development freezes on Friday 30 October 2026 at 15:00 IST.

### 4.2 Sprint 2 Story Backlog

```
Sprint 2 Story Allocation Summary (Total: 34 Story Points)
- Sanchita:  STORY-EVT-03 (5), STORY-QA-01 (3)               =  8 SP
- Saatvik:   STORY-ADM-01 (3), STORY-SEC-01 (5)               =  8 SP
- Reet:      STORY-BKG-03 (5), STORY-WTL-01 (5)               = 10 SP
- Sambhram:  STORY-SCN-02 (5), STORY-TEL-01 (3)               =  8 SP
```

#### STORY-EVT-03: Organizer Event Creation, Lifecycle Management & State Machine
* **Story ID:** `STORY-EVT-03`
* **Assigned Owner:** Sanchita Sunil
* **Priority:** High (P1) | **Estimate:** 5 SP
* **Dependencies:** `STORY-AUTH-02`, `STORY-EVT-01`
* **Description:** Implement organizer dashboard endpoints (`POST /api/events`, `PUT /api/events/:id`, `PATCH /api/events/:id/status`) enforcing the formal state transition graph (SAD Figure B-3): `DRAFT` $\to$ `PENDING_APPROVAL` $\to$ `PUBLISHED` $\to$ `LIVE` $\to$ `COMPLETED` / `CANCELLED`.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-005`: Organizers can save events in `DRAFT` and edit venue/capacity before publishing.
  2. An organizer cannot edit or cancel an event owned by another organizer (HTTP 403).
  3. `FR-006`: Illegal state transitions (e.g., `DRAFT` directly to `LIVE`) return HTTP 409 `INVALID_TRANSITION`.
  4. `BR-006`: Once confirmed bookings exist, event date cannot be altered without notifying ticket holders.
* **Test Evidence:** Integration test suite `server/tests/event_lifecycle.test.js` covering `TC-EVT-03`, `TC-EVT-04`, `TC-EVT-05`.
* **Definition of Done (DoD):** State machine validated, unit tests passing, PR merged.

#### STORY-BKG-03: Atomic Booking Confirmation & Concurrency Guard (`SELECT ... FOR UPDATE`)
* **Story ID:** `STORY-BKG-03`
* **Assigned Owner:** Reet V Porwal
* **Priority:** Critical (P0) | **Estimate:** 5 SP
* **Dependencies:** `STORY-BKG-02`, PostgreSQL connection pool
* **Description:** Implement confirmed booking transaction (`POST /api/bookings/confirm`). Execute confirmation within a single PostgreSQL database transaction using pessimistic row locking (`SELECT ... FOR UPDATE` on `ticket_tiers`). Guarantee zero overselling under race conditions.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-010`: Successful confirmation transitions hold into a permanent booking row and generates ticket records.
  2. `NFR-003`: When 200 concurrent confirmation requests are fired against a tier with exactly 1 available seat, exactly 1 succeeds (HTTP 201) and 199 return HTTP 409 Conflict.
  3. Database maintains strict inventory consistency with zero inventory leakage.
* **Test Evidence:** Concurrency test suite `server/tests/concurrency.test.js` covering `TC-BKG-03` and `TC-PERF-03`.
* **Definition of Done (DoD):** Atomic transaction verified with concurrent Jest/autocannon script, zero deadlocks, code reviewed.

#### STORY-WTL-01: Sold-Out Tier FIFO Waitlist Queue & Automated Slot Reallocation
* **Story ID:** `STORY-WTL-01`
* **Assigned Owner:** Reet V Porwal
* **Priority:** Medium (P2) | **Estimate:** 5 SP
* **Dependencies:** `STORY-BKG-03`
* **Description:** Build the automated waitlist engine (`POST /api/waitlist/join`). When a ticket tier is sold out (available quota = 0), allow attendees to queue in a Redis FIFO list (`RPUSH`/`LPOP`). When a confirmed ticket or hold is cancelled, dequeue the next attendee and issue a 15-minute exclusive reservation claim link.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-015`: Attendees can join waitlist only when available seats = 0; duplicate waitlist joins for the same user/tier are rejected.
  2. `FR-016` / `BR-004`: When a ticket is released, head of queue receives an invitation with a 15-minute (900 s) claim window.
  3. If claim window expires, the slot automatically reallocates to the subsequent user in queue.
* **Test Evidence:** Automated unit/integration tests in `server/tests/waitlist.test.js` covering `TC-WTL-01`, `TC-WTL-02`, `TC-WTL-03`.
* **Definition of Done (DoD):** Queue worker functioning, expiration handling validated, integration tests passing.

#### STORY-SCN-02: Camera-Based Web Gate Scanner Client UI & Audio/Visual Feedback
* **Story ID:** `STORY-SCN-02`
* **Assigned Owner:** Sambhram M
* **Priority:** High (P1) | **Estimate:** 5 SP
* **Dependencies:** `feature/gate-scanner` branch review, `STORY-SCN-01`
* **Description:** Integrate the frontend gate scanner interface (`client/src/pages/GateScanner.jsx`). Access device camera via WebRTC `getUserMedia`, decode live QR streams in-browser, send decoded string to `/api/checkin`, and provide immediate visual (green/red banner) and audio feedback.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-013`: Camera viewfinder decodes dynamic PassPulse QR codes.
  2. Valid scan renders green confirmation banner with attendee name and tier in under 200 ms (`NFR-002`).
  3. Duplicate or forged scan renders prominent red alert ("DUPLICATE ENTRY" or "INVALID SIGNATURE") and plays warning sound.
  4. Restrict page access strictly to `GATE_STAFF`, `ORGANIZER`, and `ADMIN` roles (`STORY-AUTH-02`).
* **Test Evidence:** Browser testing with test passes, component tests covering `TC-SCN-03`, `TC-SCN-04`, `TC-SCN-05`.
* **Definition of Done (DoD):** Camera permissions handled cleanly, UI integrated with backend check-in API, merged into `main`.

#### STORY-TEL-01: Live Attendance Telemetry (SSE) & CSV/PDF Reporting
* **Story ID:** `STORY-TEL-01`
* **Assigned Owner:** Sambhram M
* **Priority:** Medium (P2) | **Estimate:** 3 SP
* **Dependencies:** `STORY-SCN-01`
* **Description:** Provide organizers with real-time check-in telemetry via Server-Sent Events (`GET /api/telemetry/live/:eventId`) displaying current check-in velocity and turnout percentage. Implement report export endpoints (`GET /api/reports/:eventId/export?format=csv|pdf`).
* **Acceptance Criteria (SRS / STP):**
  1. `FR-017`: New check-in event reflects on organizer dashboard within 3 seconds via SSE.
  2. `FR-018`: Exported CSV row count exactly matches database attendee check-in records.
  3. Exported PDF summary formats event metadata, total revenue, and final attendance percentage.
* **Test Evidence:** Automated API tests in `server/tests/telemetry.test.js` covering `TC-ANL-01`, `TC-ANL-02`.
* **Definition of Done (DoD):** Telemetry stream operational, report export generating valid downloadable files.

#### STORY-ADM-01: Admin Event Moderation & Account Suspension Engine
* **Story ID:** `STORY-ADM-01`
* **Assigned Owner:** Saatvik Gupta
* **Priority:** Medium (P2) | **Estimate:** 3 SP
* **Dependencies:** `STORY-AUTH-02`, `STORY-EVT-03`
* **Description:** Implement administrative moderation routes (`/api/admin/events/:id/approve`, `/api/admin/events/:id/flag`, `/api/admin/users/:id/deactivate`). Ensure only users with `ADMIN` claim in JWT can reach these endpoints. Deactivated users must be blocked immediately on their subsequent API request.
* **Acceptance Criteria (SRS / STP):**
  1. `FR-019`: Only authenticated `ADMIN` users can access `/api/admin/*`; non-admin tokens receive HTTP 403.
  2. Deactivating a user immediately invalidates active sessions; subsequent calls return HTTP 401.
  3. `SEC-005`: All admin moderation actions produce an immutable entry in the `audit_logs` table.
* **Test Evidence:** Automated Jest test suite `server/tests/admin.test.js` covering `TC-ADM-01`, `TC-ADM-02`.
* **Definition of Done (DoD):** Admin route guards verified, audit logging active, integration tests passing.

#### STORY-SEC-01: Security Hardening, Audit Trail & OWASP Defense Verification
* **Story ID:** `STORY-SEC-01`
* **Assigned Owner:** Saatvik Gupta
* **Priority:** High (P1) | **Estimate:** 5 SP
* **Dependencies:** `STORY-AUTH-02`, `STORY-ADM-01`
* **Description:** Perform end-to-end security audit and defense validation. Verify input sanitization against SQL injection and XSS (`SEC-003`), implement central audit logging for failed logins and security violations (`SEC-005`), and ensure sensitive variables (`JWT_SECRET`, `QR_HMAC_SECRET`) are never leaked in stack traces or logs.
* **Acceptance Criteria (SRS / STP):**
  1. `SEC-003`: Parameterized queries resist classic SQL injection payloads (`' OR 1=1 --`).
  2. `SEC-005`: Failed login attempts and rejected QR scans write to `audit_logs` with timestamp, user/actor, and IP address.
  3. `NFR-006`: Server test coverage remains $\ge 80\%$ statement and branch coverage.
  4. Zero critical or high alerts in vulnerability audit.
* **Test Evidence:** Security test suite `server/tests/security.test.js` covering `TC-SEC-01` through `TC-SEC-05`.
* **Definition of Done (DoD):** Security test suite passing, audit logging verified, SonarQube/audit report clean.

#### STORY-QA-01: Full Regression Testing, Concurrency Benchmarking & Release Freeze
* **Story ID:** `STORY-QA-01`
* **Assigned Owner:** Sanchita Sunil (Lead) with Saatvik, Reet, Sambhram
* **Priority:** Critical (P0) | **Estimate:** 3 SP
* **Dependencies:** All Sprint 2 functional stories
* **Description:** Execute complete regression test suite across all modules. Run k6 load test script verifying `NFR-001` (sub-150 ms catalog search) and `NFR-003` (200 concurrent bookings/sec). Enforce development freeze on 30 October 2026, tag repository with release `v1.0.0`, and record the final 2-minute demonstration video.
* **Acceptance Criteria (SRS / STP):**
  1. 100% automated test cases passing in CI.
  2. Zero open Critical or High severity defects.
  3. Requirement Traceability Matrix (RTM) shows 100% coverage across `FR-001` to `FR-019`.
  4. 2-minute working demo video recorded and linked in repository `README.md`.
* **Test Evidence:** Full CI run logs, k6 summary report, release tag `v1.0.0` pushed to git.
* **Definition of Done (DoD):** Release freeze executed, documentation finalized, release notes published.

---

## 5. Video Deliverable Checklists & Execution Scripts

### 5.1 Sprint 1 MVP Video Checklist (60 Seconds)
* **Target Delivery Date:** Friday, 23 October 2026, 17:00 IST
* **Recommended Repository Path:** `docs/demos/sprint1_demo.mp4` (or linked YouTube unlisted URL in README)
* **Maximum Duration:** Exactly 60 seconds ($\pm 5$ seconds)
* **Demonstration Flow & Script:**

| Timestamp | Screen Display / Action | Performed By | Verification Point Shown |
| :---: | :--- | :--- | :--- |
| **00:00 – 00:10** | Terminal: Docker containers running (`postgres`, `redis`). Execute `npm test` showing 10/10 green passing tests. | Saatvik | Service health, test suite pass rate. |
| **00:10 – 00:22** | Browser: User Registration & Login. Register attendee `alice@pes.edu`, receive JWT, view redirect. | Saatvik | `FR-001`, `FR-003` (Auth & JWT). |
| **00:22 – 00:35** | Browser: Event Catalog. Filter events by category "Tech" and view "TechSummit 2026" details. | Sanchita | `FR-004` (Search & Filter). |
| **00:35 – 00:48** | Browser: Ticket Selection & Hold. Select 2 General Admission tickets, trigger 10-minute hold. | Reet | `FR-008` (Redis Hold & TTL). |
| **00:48 – 01:00** | Browser & Mobile: Dynamic QR Pass generated with HMAC signature; Gate smoke check validates entry. | Sambhram | `FR-011`, `FR-013` (QR Generation & Verification). |

### 5.2 Sprint 2 Final Product Video Checklist (120 Seconds)
* **Target Delivery Date:** Friday, 30 October 2026, 18:00 IST
* **Recommended Repository Path:** `docs/demos/sprint2_final_demo.mp4` (or linked YouTube unlisted URL in README)
* **Maximum Duration:** Exactly 120 seconds ($\pm 10$ seconds)
* **Demonstration Flow & Script:**

| Timestamp | Screen Display / Action | Performed By | Verification Point Shown |
| :---: | :--- | :--- | :--- |
| **00:00 – 00:15** | System Architecture & CI overview. GitHub Actions pipeline passing across client and server. | Sanchita | CI/CD automation & code health. |
| **00:15 – 00:35** | Full Attendee Journey: Registration, Event Search, Tier Selection, and Atomic Checkout commit. | Sanchita & Reet | `FR-001`, `FR-004`, `FR-010` (Postgres ACID). |
| **00:35 – 00:55** | Concurrency & Waitlist Demo: 2 users attempt to grab the final seat. 1 succeeds, 2nd joins FIFO waitlist. | Reet | `NFR-003`, `FR-015`, `FR-016` (Waitlist Engine). |
| **00:55 – 01:20** | Live Gate Scanner: Device camera scans QR pass $\to$ Green check-in. Rescan same pass $\to$ Red duplicate alert. | Sambhram | `FR-013`, `FR-014` (Anti-fraud duplicate rejection). |
| **01:20 – 01:40** | Organizer Dashboard: Real-time scan velocity & attendance percentage updating via SSE; Export CSV/PDF. | Sambhram | `FR-017`, `FR-018` (Live Telemetry). |
| **01:40 – 01:55** | Admin Portal & Security: Admin approves event, deactivates abusive user; audit log inspection. | Saatvik | `FR-019`, `SEC-002`, `SEC-005` (RBAC & Audit). |
| **01:55 – 02:00** | Final summary: Release tag `v1.0.0`, test coverage metrics, freeze confirmation. | Sanchita | Development freeze on 30 October 2026. |

---

## 6. Sprint Exit & Development Freeze Criteria

To guarantee software quality and prevent last-minute regressions, the following criteria must be satisfied prior to declaring a sprint complete:

### Sprint 1 Exit Criteria (23 October 2026)
1. **MVP End-to-End Functionality:** All 5 core functional flows (Auth, Catalog, Hold, QR, Gate Smoke) execute without fatal runtime errors.
2. **Automated CI Validation:** GitHub Actions workflow runs and passes on every PR merged into `main`.
3. **Zero P0 Defects:** No blocker bugs preventing user registration, hold creation, or QR generation.
4. **Demonstration Artifact:** 60-second video recorded, reviewed, and published.

### Sprint 2 Development Freeze Criteria (30 October 2026, 15:00 IST)
1. **Strict Code Freeze:** No new feature branches created or merged after 15:00 IST on 30 October 2026. Only emergency bug fixes for Critical defects permitted with Team Lead sign-off.
2. **Requirement Traceability:** 100% of functional requirements (`FR-001` to `FR-019`) verified with mapped passing test cases in `docs/TRACEABILITY_AND_TEST_STATUS.md`.
3. **Test Suite Coverage:** Server statement and branch coverage $\ge 80\%$ (verified via `npm test -- --coverage`).
4. **Concurrency Safety:** Stress test validates that 200 concurrent requests on a 1-seat tier produce zero overbooked tickets.
5. **Security Gates:** Zero high-severity vulnerabilities on `npm audit`; all protected routes enforce RBAC guards.
6. **Documentation & Deviations:** Release notes completed, all deviations formally documented in `docs/DEVIATIONS.md`.
7. **Release Packaging:** Release tag `v1.0.0` signed and pushed to GitHub with production `docker-compose.yml`.

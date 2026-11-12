# PassPulse — Final Demo & Viva Preparation Guide

**Project:** PassPulse — Smart Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform  
**Course:** UE24CS341A: Software Engineering  
**Repository:** `https://github.com/sanchita-suni/PassPulse`  
**Verified CI Baseline:** GitHub Actions Run `#42875623511` (`36/36` suites, `495/495` tests passing, `92.42%` Stmts / `82.17%` Branches)

---

## 1. FAQ #1 — End-to-End SDLC & Agile Narrative

When evaluators ask *"How did your team follow the Software Development Life Cycle?"*, walk through these six concrete, traceable phases:

1. **Requirements Engineering (SRS v2.1 — `docs/PassPulse_SRS_SAD_STP.pdf`, pp. 1–11):**
   - Elicited real failure modes in event ticketing (screenshot QR fraud, inventory race conditions, wasted capacity from cancellations, slow gate queues, lack of live analytics).
   - Formalized **19 Functional Requirements (`FR-001`–`FR-019`)**, **6 Business Rules (`BR-001`–`BR-006`)**, **7 measurable NFRs (`NFR-001`–`NFR-007`)**, **6 Security Requirements (`SEC-001`–`SEC-006`)**, and a **UML Use Case Diagram** covering 4 actors (`Attendee`, `Organizer`, `Gate Staff`, `Admin`).
2. **Architecture & Test Planning (SAD v1.0 & STP v1.0 — `docs/PassPulse_SRS_SAD_STP.pdf`, pp. 12–31):**
   - Designed a **Layered MVC + Service-Repository Architecture** separating Express routes, controllers, transactional services, and data models/migrations.
   - Chose hybrid persistence: **PostgreSQL 16** for ACID source of truth (`SELECT ... FOR UPDATE`, foreign keys, retention constraints) + **Redis 7** for 600s temporary ticket-hold TTL projection and fast availability locking.
   - Authored **2 UML Sequence Diagrams** (Booking Hold/Confirm & Dynamic QR Gate Check-In), REST API contracts, HTTP error protocols, and **STP Section 5.1 Security Validation**.
3. **Agile Planning & GitHub Project Management (`docs/SPRINT_PLAN.md` & `docs/DEVELOPMENT_WORKFLOW.md`):**
   - Converted SRS requirements 1:1 into **GitHub Issues (`#13`–`#46`)** linked to the **PassPulse Sprint Board**.
   - Estimated effort with Story Points across two core sprints (**Sprint 1 MVP = 33 SP**, **Sprint 2 Hardening = 34 SP**) plus Part-3 QA hardening & CI integration.
4. **Sprint Execution & Automated CI (`.github/workflows/ci.yml`):**
   - Work developed on scoped feature branches (`feature/*`, `perf/*`, `docs/*`) using Conventional Commits.
   - GitHub Actions spins up live **`postgres:16-alpine`** and **`redis:7-alpine`** containers on every PR/push to `main`, enforcing Jest test execution, **`NFR-006` ($\ge 80\%$ statement & branch coverage)**, frontend **`oxlint` (`0` errors)**, and **`vite build`**.
5. **Deviation Governance (`docs/DEVIATIONS.md`):**
   - Any pragmatic engineering shift away from the baseline (e.g., temporary in-memory stores during isolated scaffolding `DEV-001`–`DEV-002`/`DEV-006`, simulated waitlist UI notifications `DEV-003`, backend-heavy CI test focus `DEV-004`) was explicitly logged with rationale, impact, and resolution status.
6. **Part-3 Testing, Verification & Traceability (`docs/*_REPORT.md`, `docs/TEST_CASES_UPDATED.md`):**
   - Updated test cases post-sprint, expanded the suite from initial baselines to **36 suites / 495 passing tests**, audited **100% `FR-001`–`FR-019` verification**, and generated all four mandatory Part-3 reports inside `docs/`.

---

## 2. FAQ #2 — Individual Contributions, PRs, Commits & Issues

Assessors check your individual backlog issues, commits, and PRs. Each member's verifiable GitHub footprint is listed below:

| Member (SRN / GitHub) | Owned Subsystem | Assigned Issues Verified | PRs & Key Git Commits on `main` | Key Code & Test Files to Demo Live |
| :--- | :--- | :--- | :--- | :--- |
| **Sanchita Sunil** (`PES1UG24CS419`, `sanchita-suni`) | **Team Lead**; Event Catalog, Search Cache, Organizer Lifecycle, Ticket Tiers, Admin Panel, Booking UI (`NFR-005`), TLS Proxy & Schema (`OPS-001`) | `#16` (`FR-004`), `#17` (`FR-005`), `#18` (`FR-006`), `#19` (`FR-007`), `#31` (`FR-019`), `#32` (`NFR-001`), `#36` (`NFR-005`, Open walkthrough), `#42` (`SEC-004`), `#45` (`OPS-001`), `#46` (`OPS-002`), `#37` | **PRs:** `#1`, `#54`; **Branch Merges:** `feature/issue-45-postgres-schema` (`5005844`), `feature/issue-16` (`d427182`), `feature/issue-17` (`9712ea6`), `feature/issue-19` (`415964f`), `feature/issue-18` (`31e1ff9`), `feature/issue-31` (`faa5aaf`), `perf/issue-32` (`dfa02ec`), `feature/issue-36` (`537bd4e`), `feature/issue-46` (`7fbe158`), `feature/issue-42` (`9be36e6`) | `server/db/schema.sql`, `event.service.js`, `event_state.service.js`, `tier.service.js`, `admin.service.js`, `client/src/pages/EventCatalog.jsx`, `Checkout.jsx`, `AdminPanel.jsx`, `deploy/nginx/proxy.conf` |
| **Saatvik Gupta** (`PES1UG24CS395`, `Saatvik-G`) | **Auth, RBAC & Security Middleware Lead**; GitHub Actions CI, OWASP SQLi/XSS Security Validation (`SEC-001`–`003`), Sprint Docs & Part-3 QA Reports | `#13` (`FR-001`), `#14` (`FR-002`), `#15` (`FR-003`), `#39` (`SEC-001`), `#40` (`SEC-002`), `#41` (`SEC-003`), shared `#37` (`NFR-006`), `#42` (`SEC-004`), `#46` (`OPS-002`) | **PR:** `#2` (`feature/server-scaffold`); **Key Commits:** `e4fad94` (Sprint Plan, Workflow, Traceability, Deviations), `affa849` (Auth, RBAC Middleware & `.github/workflows/ci.yml`), `428a60d` (Traceability update), `e932020` (Part-3 Reports + `TC-SEC-04`–`07` + `TC-MID-01`–`05`, closes `#41`), plus Final Submission doc updates | `server/src/controllers/auth.controller.js`, `server/src/middleware/auth.middleware.js`, `server/src/middleware/rbac.middleware.js`, `server/src/utils/jwt.util.js`, `server/src/utils/password.util.js`, `server/src/models/user.model.js`, `server/src/routes/auth.routes.js`, `.github/workflows/ci.yml`, `server/tests/auth.test.js`, `docs/*_REPORT.md` |
| **Reet V Porwal** (`PES1UG24CS369`, `reetporwal66`) | **Concurrency Booking Engine, Migrations & Waitlist** (`FR-008`–`010`, `FR-015`–`016`, `NFR-003`, `NFR-007`) | `#20` (`FR-008`), `#21` (`FR-009`), `#22` (`FR-010`), `#27` (`FR-015`), `#28` (`FR-016`), `#34` (`NFR-003`), `#38` (`NFR-007`), `#45`, `#49` (Open study) | **PR:** `#3` (`feature/docker-database`); **Commits:** `25f09a8` (`feat(db): booking and retention foundation`), `ae79eb7` (`feat(bookings): holds, confirmation, FIFO waitlist`), `0cb0393` (`feat(retention): persist check-ins & audit history`), `925dc30` (`test(ci): PostgreSQL setup & coverage`) | `server/db/migrations/0001_*.sql`, `0002_*.sql`, `booking-hold.service.js`, `booking-confirmation.service.js`, `hold-expiry.worker.js`, `waitlist.service.js`, `ticket.service.js`, `server/src/config/redis.js`, `booking-hold.postgres.test.js`, `waitlist.postgres.test.js` |
| **Sambhram M** (`PES1UG24CS409`, `sambhram5`) | **QR Pass Security, Gate Scanner, Audit Logging, Health/SLA, Live SSE Telemetry & CSV/PDF Reports** | `#7`, `#8`, `#10`, `#23`–`#26`, `#29` (`FR-017`), `#30` (`FR-018`), `#33` (`NFR-002`), `#35` (`NFR-004`), `#43` (`SEC-005`), `#44` (`SEC-006`) | **PRs:** `#4`, `#6`, `#9`, `#11`, `#12`, `#47` (Attendee pass), `#48` (Sprint 1 demo), `#50` (Duplicate check-in), `#51` (Health), `#52` (Gate RBAC), `#53` & `#55` (QR security), `#56` (Audit), `#57` (Check-in p99 latency), `#58` (Pass UI), `#59` (SSE Telemetry), `#60` (CSV/PDF) | `qr.service.js`, `checkin.service.js`, `checkin.controller.js`, `audit.service.js`, `health.service.js`, `availability.service.js`, `telemetry.service.js`, `report.service.js`, `csv.util.js`, `pdf.util.js`, `GateScanner.jsx`, `AttendeePass.jsx` |

> **Note for Evaluators Regarding Git History:** Some features were merged via formal GitHub Pull Requests (`#1`–`#60`) while others landed via local feature-branch merges (`git merge feature/issue-*`) or coordinated milestone commits on `main` (tracked identically against GitHub Issues `#13`–`#46` and validated automatically by GitHub Actions CI).

---

## 3. FAQ #3 — How to Explain Our Deviations (`DEV-001` to `DEV-008`)

All deviations are formally governed in [`docs/DEVIATIONS.md`](DEVIATIONS.md). Use these crisp points if asked *"Where did implementation diverge from SRS/SAD/STP, and why?"*:

* **`DEV-001` (In-Memory Check-in `Map` $\to$ Resolved):** *"In Sprint 1, Sambhram verified gate scan crypto in a fast in-memory `Map` while PostgreSQL migrations were finishing (`DEV-001`). In Sprint 2 (`0cb0393`), check-ins migrated to PostgreSQL `check_in_logs` with `FOR UPDATE OF ticket, booking`, `ON CONFLICT (ticket_id) DO NOTHING`, and 1-year retention. So `DEV-001` is **Resolved**; the `Map` only supports no-DB unit fixtures."*
* **`DEV-002` & `DEV-006` (In-Memory User & Event Models Alongside PostgreSQL):** *"Relational tables (`users`, `events`, `ticket_tiers`) are created and tested in `server/db/schema.sql`, while booking holds, confirmations, waitlist claims, persistent check-ins, and audit logs persist in PostgreSQL 16. Keeping `UserModel` and `EventModel` behind repository abstractions in memory allows isolated auth/catalog unit suites to run without Docker DB setup, while foreign-key queries use `(SELECT id FROM users WHERE id = $1)` safely. Because of our MVC Controller $\to$ Model boundary, swapping those two models to SQL leaves controllers and security middleware untouched."*
* **`DEV-003` (Simulated Email Dispatch for Waitlist Claims):** *"Instead of brittle third-party SMTP credentials, waitlist claim links and 15-minute windows are persisted in PostgreSQL `notifications` and rendered directly inside `WaitlistNotifications.jsx` — deterministic for academic demos and CI."*
* **`DEV-004` (Frontend Static Lint/Build vs React DOM Runner):** *"Rather than adding Vitest DOM mocks, CI enforces strict `oxlint` (`0` errors) and full `vite build` (`65` modules) on the React client while concentrating deep behavioral & security testing on 36 backend suites (`495` tests, `92.42%` statements / `82.17%` branches) plus documented UI screenshots."*
* **`DEV-005` (Separate `client/` and `server/` Manifests):** *"Maintains clean dependency decoupling between Express API and React SPA; full stack starts together cleanly via `docker compose up -d --build` (`OPS-002`)."*
* **`DEV-007` (NFR-001 Think-Time Load Benchmark):** *"With realistic `1 s` user pause between searches across 500 VUs, p95 latency is `16.2 ms` (well below `150 ms`). Under continuous zero-pause flood on 1 Node process, p95 hits `187.3 ms` due to single-process event-loop queueing, mitigated simply by scaling horizontally behind Nginx."*
* **`DEV-008` (Booking Journey Endpoint Integration $\to$ Resolved):** *"When the 4-screen UI landed on `main` (`667cc87`), `/api/bookings/hold` and `/confirm` weren't merged yet (`DEV-008`). Those APIs are now live (`ae79eb7`) and wired end-to-end; only the 5-user manual observation sheet in `docs/NFR-005_Booking_Journey.md` (Issue `#36`) remains to be filled."*

---

## 4. FAQ #5 — Technical & AI-Assisted Code Defense Q&A

Evaluators permit AI assistance only when you can **explain the exact logic, security rationale, edge cases, and testing** of your modules. Review these key Q&A points:

### Q1. Walk us through public registration (`/api/auth/register`) vs admin provisioning (`/api/auth/provision`). Why didn't `/register` let callers pass `role: "ADMIN"`? (`FR-001`, `SEC-002`, `CWE-269`)
* **Code (`server/src/controllers/auth.controller.js`):**
  * Public `register` validates non-empty `fullName`, `email` (regex), `password.length >= 6`, checks duplicate email (`409 Conflict`), hashes with `bcryptjs` (`SALT_ROUNDS = 10`), and **unconditionally hardcodes `const selectedRole = 'ATTENDEE'`** regardless of any `req.body.role`.
  * Why? Allowing `role` in self-registration creates **CWE-269 (Improper Privilege Management)** escalation. Privileged staff (`ADMIN`, `ORGANIZER`, `GATE_STAFF`, `STAFF`) can only be created via `POST /api/auth/provision`, which sits behind **`authenticate` + `authorize(['ADMIN'])`** and writes a `USER_PROVISIONED` audit record via `auditService.recordAudit(...)`.
  * **Demo seeding safety (`user.model.js` line 127):** Default demo accounts are seeded **only when `process.env.NODE_ENV === 'development'`** (`CWE-1188` safe default), never in `test` or `production`.

### Q2. What happens immediately if an Admin deactivates a compromised user account while they already hold a valid stateless JWT? (`FR-019`, `auth.middleware.js`)
* **Code (`server/src/middleware/auth.middleware.js` lines 68–74 & 101–107):**
  * Pure stateless JWTs remain valid until expiry (`JWT_EXPIRES_IN = 1d`). To fix that window, both `authenticate()` and `requireAuth()` look up `UserModel.findById(userId)` / `UserModel.isDeactivated(userId)` after verifying the JWT signature.
  * If `user.isActive === false`, the middleware immediately rejects the request with **`HTTP 401` (`code: 'ACCOUNT_DEACTIVATED'`)** on the very next API call—and `/api/auth/login` also logs `LOGIN_FAILED` and blocks sign-in. Tested in `auth.middleware.test.js` & `tests/admin.test.js`.

### Q3. Explain how `SEC-003` (SQL Injection & XSS) is enforced and tested across PassPulse.
* **Code (`server/src/config/db.js`, `auth.controller.js`, `audit.service.js`, `checkin.service.js`, `csv.util.js`):**
  * **PostgreSQL queries:** 100% parameterized placeholders (`$1, $2, ...`), never string interpolation—neutralizing SQL payloads like `' OR '1'='1' --`.
  * **Input boundaries:** `emailRegex` blocks malformed/SQLi emails cleanly at `400 Bad Request` (`TC-SEC-04`), React escapes text bindings safely against reflected XSS, and `csv.util.js` escapes leading formula characters (`=`, `+`, `-`, `@`) to block spreadsheet CSV formula injection (`TC-SEC-07` & `csv.util.test.js`).
  * **Test proof:** `server/tests/auth.test.js` (`TC-SEC-04` to `TC-SEC-07`) proves zero raw DB error/stack leakage on malformed inputs.

### Q4. How does RBAC (`authorize`) work without repeating role logic in every controller? (`FR-003`, `SEC-002`)
* **Code (`server/src/middleware/rbac.middleware.js`):**
  * Factory middleware `authorize(allowedRoles = [])` returns an Express handler `(req, res, next)` that runs strictly *after* `authenticate`/`requireAuth`:
    1. If `!req.user`, returns `401` (fail closed even if middleware wiring omits `authenticate`).
    2. Normalizes `req.user.role` and `allowedRoles` via `.toUpperCase()` and checks inclusion.
    3. Rejects mismatches with **`403 Forbidden`** before controller logic ever executes.

### Q5. How does PassPulse prevent overselling when 200 attendees click "Confirm" simultaneously on 1 remaining seat? (`FR-008`, `FR-010`, `NFR-003`)
* **Code (`booking-hold.service.js`, `booking-confirmation.service.js`, `0001_booking_and_retention_foundation.sql`):**
  * Holds reserve capacity inside a PostgreSQL transaction using row locks (`SELECT ... FOR UPDATE`) combined with table check constraints **`CHECK (sold + reserved <= quota)`** and **`CHECK (reserved >= 0)`**, paired with a Redis 600s TTL key projection.
  * Confirmation validates hold ownership & active expiry atomically inside a transaction, converts `reserved` $\to$ `sold`, issues tickets, and emits an audit event. 199 concurrent losers receive `409 Conflict` cleanly—zero oversell verified in `booking-hold.postgres.test.js`.

### Q6. How do QR passes resist screenshots, tampering, and timing attacks? (`FR-011`, `FR-013`, `FR-014`, `SEC-006`)
* **Code (`qr.service.js`, `checkin.service.js`, `checkin.controller.js`):**
  * **Fail-Closed Secret Guard:** Calling/importing `qr.service.js` invokes `getQrSecret()`, throwing immediately if `QR_HMAC_SECRET` is unset (`TC-QR-SIG-05`).
  * **Canonical Signing + `timingSafeEqual`:** Serializes fixed fields `{ ticketId, eventId, userId, issuedAt, expiresAt }` into HMAC-SHA256 hex (`64` chars), verifies byte length before calling **`crypto.timingSafeEqual`** (preventing timing side channels & `RangeError` crashes on non-hex inputs).
  * **Atomic Duplicate Entry Lock:** `processPersistentCheckIn` executes `BEGIN`, locks `tickets` & `bookings` (`FOR UPDATE`), verifies server-side ticket/booking state (never trusting client body statuses), and inserts into `check_in_logs` with **`ON CONFLICT (ticket_id) DO NOTHING`**—so concurrent gate scans return at most one `200 CHECKED_IN` and `409 DUPLICATE_ENTRY` for all others, instrumented via `Server-Timing` (`p99 = 0.84 ms`).

### Q7. How did you verify coverage (`NFR-006`) and why did local tests differ slightly from CI?
* **Honest Engineering Explanation:**
  * Locally without Docker PostgreSQL/Redis running (`TEST_DATABASE_URL` unset), the 4 `*.postgres.test.js` suites skip gracefully and Redis health checks report Redis unreachable.
  * On every PR/push in GitHub Actions (`.github/workflows/ci.yml`), live **`postgres:16-alpine`** and **`redis:7-alpine`** service containers boot before Jest runs `npm run test:coverage -- --ci`. In CI Run `#42875623511`, **36/36 suites (495/495 tests, 0 skipped)** passed in `39.373s` with **92.42% Statements / 82.17% Branches / 97.83% Functions / 93.67% Lines** (`NFR-006` requires $\ge 80\%$).

---

## 5. Quick Live Viva Verification Commands (Run On-Screen During Demo)

```bash
# 1. Start PostgreSQL 16 + Redis 7 containers (from repo root)
docker compose up -d postgres redis

# 2. Run Saatvik's Auth, RBAC & Security Middleware tests with coverage
cd server
npx jest tests/auth.test.js src/middleware/auth.middleware.test.js src/utils/jwt.util.test.js --coverage

# 3. Run full 36-suite backend + PostgreSQL/Redis integration suite (with local Postgres/Redis up)
DATABASE_URL=postgresql://postgres:password123@localhost:5432/passpulse_test_db \
TEST_DATABASE_URL=postgresql://postgres:password123@localhost:5432/passpulse_test_db \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=demo_jwt_secret QR_HMAC_SECRET=demo_qr_hmac_secret \
npm run test:coverage

# 4. Run frontend lint & build
cd ../client
npm run lint && npm run build
```

---

## 6. Ready-to-Record Script: 2-Minute Sprint 2 Final Demo Video

Target output file: **`docs/demo/PassPulse_Sprint2_Demo.mp4`** (Duration: `~120 seconds`, Screen-share + voiceover).

| Timestamp | Speaker | Visual on Screen | Key Narration / Verification Point |
| :---: | :--- | :--- | :--- |
| **00:00 – 00:15** | **Sanchita** | GitHub Repo + Actions CI Run (`#42875623511` green badge) & Sprint Board | Show SRS/SAD/STP, Jira/GitHub Issues mapped with Story Points, and CI passing **36/36 suites (495 tests, 92.42% Stmts / 82.17% Branches)** + Vite build. |
| **00:15 – 00:35** | **Sanchita** | PassPulse Web App (via HTTPS `https://localhost`) — Catalog, Event Details, Checkout, Confirmation | Walk through the **4-screen NFR-005 booking flow**: search/filter `TechSummit 2026`, pick tickets, inline sign-in, click Hold Seat (10-min countdown). |
| **00:35 – 00:55** | **Reet** | Terminal split / Browser — Confirm booking & Sold-Out Waitlist (`FR-010`, `FR-015`–`016`) | Show PostgreSQL atomic confirmation (`FOR UPDATE`), then try sold-out tier -> join FIFO waitlist -> show 15-minute claim notification in UI. |
| **00:55 – 01:20** | **Sambhram** | `AttendeePass.jsx` QR Pass $\to$ `GateScanner.jsx` (`FR-012`, `FR-013`, `FR-014`) | Show HMAC-SHA256 signed QR pass; scan at Gate Scanner $\to$ **Green `CHECKED_IN`** (`< 1 ms` Server-Timing); scan same QR again $\to$ **Red `DUPLICATE_ENTRY` (409)** alert. |
| **01:20 – 01:40** | **Sambhram** | `OrganizerDashboard.jsx` & Exported CSV/PDF (`FR-017`, `FR-018`) | Point out live attendance percentage updating over SSE right after check-in; click CSV & PDF export and briefly show downloaded report. |
| **01:40 – 02:00** | **Saatvik** | `AdminPanel.jsx` + `GET /api/admin/audit-logs` + `docs/` Part-3 Reports (`FR-019`, `SEC-002`, `SEC-005`) | Admin deactivates an account -> demonstrate immediate `401 ACCOUNT_DEACTIVATED` revocation -> show immutable audit log entries & close on `docs/FINAL_EVALUATION_CHECKLIST.md`. |

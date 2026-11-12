# PassPulse — Code Coverage Report (Part-3 Final)

**Project Name:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)  
**Testing Period:** 2 November 2026 – 11 November 2026  
**Document Version:** 2.0 (Final Submission Baseline)  
**Module Owner & Author:** Saatvik Gupta (PES1UG24CS395) — Authentication, RBAC & Security Middleware Lead  
**Co-Authors:** Sanchita Sunil, Reet V Porwal, Sambhram M  
**Repository:** `https://github.com/sanchita-suni/PassPulse`  
**Verified CI Run:** GitHub Actions Run `#42875623511` (Commit `630fc86` on `main`)

---

## 1. Quality Gate Standards & Requirements

In compliance with the approved Software Test Plan (STP v1.0) and requirement **NFR-006**, all backend application code must satisfy strict coverage gates before merging and release freezing:

* **Statements Coverage:** Minimum $80.0\%$
* **Branch Coverage:** Minimum $80.0\%$
* **Lines Coverage:** Minimum $80.0\%$
* **Functions Coverage:** Tracked and validated (target $> 85\%$)

These thresholds are enforced programmatically in `server/package.json` (`coverageThreshold`) and executed automatically on every push and Pull Request by GitHub Actions (`.github/workflows/ci.yml`) against live PostgreSQL 16 and Redis 7 containers.

---

## 2. Executive Coverage Summary (Empirically Verified in CI)

The full 36-suite backend test pipeline was executed in GitHub Actions Run `#42875623511` (`npm run test:coverage -- --ci`). Every quality gate requirement in `server/package.json` is comfortably exceeded:

```
=============================== Coverage summary ===============================
Statements   : 92.42% ( 2464/2666 )  [Gate: 80% — EXCEEDED (+12.42%)]
Branches     : 82.17% ( 1351/1644 )  [Gate: 80% — EXCEEDED (+2.17%)]
Functions    : 97.83% ( 361/369 )    [Target: >85% — EXCEEDED (+12.83%)]
Lines        : 93.67% ( 2327/2484 )  [Gate: 80% — EXCEEDED (+13.67%)]
================================================================================
Test Suites  : 36 passed, 36 total
Tests        : 495 passed, 495 total
Snapshots    : 0 total
Time         : 39.373 s
```

> **Historical CI environment note:** In GitHub Actions Run `#42875623511`, PostgreSQL and Redis services enabled all 36 suites and 495 tests, producing the CI metrics above. In local runs without `TEST_DATABASE_URL` / `REDIS_URL`, live-service integration suites may skip; the latest local Docker-backed results are recorded below.

### Latest Local Full-Suite Coverage

The later local real-service verification reported **37 suites and 502 tests passed**, with **92.46% statements, 82.19% branches, 97.83% functions, and 93.72% lines**. It used PostgreSQL 16 with the dedicated `passpulse_test_db` and Redis logical DB 15. These figures supersede the earlier aggregate for current local verification; the CI values above remain the historical results for Run `#42875623511`.

---

## 3. Comprehensive File-by-File Coverage Matrix (Unit & Integration Modules)

The following matrix is the historical file-by-file breakdown from the full CI coverage dataset. The latest local run's aggregate coverage is recorded above; refreshed per-file figures were not available for that run.

| File / Component | % Statements | % Branch | % Functions | % Lines | Notes / Verification Scope | Gate Status |
| :--- | :---: | :---: | :---: | :---: | :--- | :---: |
| **Aggregate (Full CI Run #42875623511)** | **92.42%** | **82.17%** | **97.83%** | **93.67%** | All 36 suites / 495 tests (PG 16 + Redis 7) | **PASSED** |
| **`src/` & `src/config/`** | | | | | | |
| `src/app.js` | 100.0% | 50.0% | 100.0% | 100.0% | Express wiring & middleware mounting | **PASSED** |
| `src/config/db.js` | 100.0% | 90.0% | 100.0% | 100.0% | PostgreSQL Pool & parameterized queries | **PASSED** |
| `src/config/migration-runner.js` | 100.0% | 96.15% | 100.0% | 100.0% | Idempotent schema migration execution | **PASSED** |
| `src/config/redis.js` | 100.0% | 100.0% | 100.0% | 100.0% | Redis client wrapper & lifecycle | **PASSED** |
| **`src/controllers/`** | | | | | | |
| `src/controllers/admin.controller.js` | 100.0% | 66.66% | 100.0% | 100.0% | Admin moderation & audit retrieval | **PASSED** |
| `src/controllers/auth.controller.js` | 87.83% | 80.48% | 100.0% | 87.83% | Auth register, login, provision, audit hooks | **PASSED** |
| `src/controllers/checkin.controller.js` | 100.0% | 100.0% | 100.0% | 100.0% | Gate check-in & `Server-Timing` metrics | **PASSED** |
| `src/controllers/event.controller.js` | 91.30% | 66.66% | 100.0% | 91.30% | Catalog filtering & organizer CRUD | **PASSED** |
| `src/controllers/health.controller.js` | 100.0% | 100.0% | 100.0% | 100.0% | Liveness, readiness & SLA health routes | **PASSED** |
| `src/controllers/qr.controller.js` | 90.19% | 84.09% | 100.0% | 90.19% | QR generation & digital pass endpoints | **PASSED** |
| `src/controllers/report.controller.js` | 93.84% | 82.92% | 100.0% | 93.84% | Attendance & revenue export endpoints | **PASSED** |
| `src/controllers/telemetry.controller.js` | 90.27% | 71.42% | 100.0% | 91.42% | SSE real-time telemetry stream controller | **PASSED** |
| `src/controllers/tier.controller.js` | 94.73% | 100.0% | 100.0% | 94.73% | Ticket tier configuration handlers | **PASSED** |
| **`src/middleware/`** | | | | | | |
| `src/middleware/auth.middleware.js` | 98.11% | 96.66% | 100.0% | 98.11% | JWT bearer validation & deactivation guard | **PASSED** |
| `src/middleware/rbac.middleware.js` | 100.0% | 71.42% | 100.0% | 100.0% | Role authorization guard (`authorize`) | **PASSED** |
| **`src/models/`** | | | | | | |
| `src/models/event.model.js` | 97.14% | 75.00% | 100.0% | 97.05% | Event catalog & seed model | **PASSED** |
| `src/models/user.model.js` | 96.55% | 80.00% | 100.0% | 95.83% | User store & deactivation flags | **PASSED** |
| **`src/routes/`** | | | | | | |
| `admin`, `booking`, `checkin`, `event`, `health`, `qr`, `report`, `telemetry` | 100.0% | 100.0% | 100.0% | 100.0% | Full route wiring verified | **PASSED** |
| `src/routes/auth.routes.js` | 92.85% | 100.0% | 50.0% | 92.85% | Auth & provision router wiring | **PASSED** |
| **`src/services/`** | | | | | | |
| `src/services/admin.service.js` | 100.0% | 92.10% | 100.0% | 100.0% | Moderation actions & event flags | **PASSED** |
| `src/services/audit.service.js` | 98.71% | 93.87% | 100.0% | 100.0% | Immutable security audit trail | **PASSED** |
| `src/services/availability.service.js` | 100.0% | 86.59% | 100.0% | 100.0% | 60s SLA poller & incident persistence | **PASSED** |
| `src/services/event.service.js` | 98.89% | 95.88% | 100.0% | 98.71% | Search cache, pagination & filters | **PASSED** |
| `src/services/event_state.service.js` | 100.0% | 100.0% | 100.0% | 100.0% | FSM transition validation | **PASSED** |
| `src/services/health.service.js` | 90.90% | 88.00% | 100.0% | 90.47% | Postgres & Redis health checks | **PASSED** |
| `src/services/qr.service.js` | 100.0% | 100.0% | 100.0% | 100.0% | HMAC-SHA256 & `timingSafeEqual` | **PASSED** |
| `src/services/report.service.js` | 96.57% | 78.70% | 100.0% | 96.80% | CSV & PDF summary aggregations | **PASSED** |
| `src/services/telemetry.service.js` | 94.52% | 91.07% | 83.33% | 97.01% | Check-in velocity & SSE pub/sub | **PASSED** |
| `src/services/tier.service.js` | 98.83% | 98.43% | 100.0% | 100.0% | Tier validation & order caps | **PASSED** |
| `booking-hold`, `booking-confirmation`, `waitlist`, `checkin`, `ticket` | Verified in CI | Verified in CI | Verified in CI | Verified in CI | Covered by `*.postgres.test.js` & check-in suites in CI | **PASSED** |
| **`src/utils/`** | | | | | | |
| `src/utils/csv.util.js` | 100.0% | 92.85% | 100.0% | 100.0% | Formula injection safe CSV serialization | **PASSED** |
| `src/utils/jwt.util.js` | 100.0% | 100.0% | 100.0% | 100.0% | JWT creation & verification | **PASSED** |
| `src/utils/password.util.js` | 100.0% | 100.0% | 100.0% | 100.0% | Bcrypt 10-round password hashing | **PASSED** |
| `src/utils/pdf.util.js` | 98.60% | 81.96% | 100.0% | 99.20% | PDF summary export engine | **PASSED** |

---

## 4. Subsystem Deep Dive: Saatvik Gupta's Module (`PES1UG24CS395`)

* **`src/middleware/auth.middleware.js`:** **98.11% Statements**, **96.66% Branches**, **100% Functions**, **98.11% Lines**. Covers Bearer JWT parsing, signature validation, deactivated account denial (`ACCOUNT_DEACTIVATED`), `requireAuth` test-environment guards, `optionalAuth`, and missing-user errors.
* **`src/middleware/rbac.middleware.js`:** **100% Statements**, **100% Functions**, **100% Lines**, **71.42% Branches**. Covers missing `req.user` rejection (401), role mismatch rejection (403), and case-insensitive role matching.
* **`src/controllers/auth.controller.js`:** **87.83% Statements**, **80.48% Branches**, **100% Functions**. Covers registration, CWE-269 privilege escalation block, login with audit logging hooks (`LOGIN_FAILED`), admin provisioning, and SQLi/XSS input validation (`SEC-003`).
* **`src/utils/jwt.util.js` & `src/utils/password.util.js`:** **100% Statements, Branches, Functions, and Lines**.

---

## 5. Conclusion

The historical GitHub Actions CI run (`#42875623511`) reported 92.42% statement, 82.17% branch, 97.83% function, and 93.67% line coverage across 36 suites and 495 tests. The later local full-suite run reported **92.46% statement, 82.19% branch, 97.83% function, and 93.72% line coverage** across 37 suites and 502 tests. Both exceed the mandatory 80% NFR-006 statement and branch coverage gates.

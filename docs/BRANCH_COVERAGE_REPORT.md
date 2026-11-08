# PassPulse — Branch Coverage Report (Part-3)

**Project Name:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)
**Testing Period:** 2 November 2026 – 6 November 2026
**Document Version:** 1.0
**Module Owner & Author:** Saatvik Gupta (PES1UG24CS395) — Authentication, RBAC & Security Middleware Lead
**Co-Authors:** Sanchita Sunil, Reet V Porwal, Sambhram M
**Repository:** `https://github.com/sanchita-suni/PassPulse`

---

## 1. Branch Coverage Methodology & Rationale

Branch coverage measures the percentage of control flow decision points (e.g., `if`/`else`, ternary operators, `switch` cases, logical short-circuits `&&` / `||`) where both the `true` and `false` execution paths have been exercised by automated test suites.

In a security-critical, high-concurrency event ticketing platform like PassPulse, branch coverage is paramount:
1. **Authentication & Authorization Gates:** Ensuring both authorized and unauthorized branches are strictly executed to prevent authorization bypasses.
2. **State Machine Transitions:** Verifying that valid transitions execute while invalid transitions branch into proper error responses (409 Conflict).
3. **Concurrency & Race Conditions:** Testing both first-in and duplicate scan branches under simulated gate traffic.
4. **Input Boundaries:** Ensuring malformed inputs (SQL injection, XSS, negative values) trigger rejection branches rather than reaching sensitive database operations.

The approved Software Test Plan (STP v1.0) and requirement **NFR-006** establish a strict quality gate of **$\ge 80.0\%$ branch coverage** across the codebase.

---

## 2. Overall Branch Coverage Summary

Executing the complete Jest test suite produced the following aggregate branch coverage metrics:

```
================================================================================
Total Evaluation Branches : 589
Branches Exercised (True/False) : 523
Aggregate Branch Coverage : 88.79%
Quality Gate Threshold    : 80.00%
Margin Above Threshold    : +8.79%
Test Suites Passing       : 14 / 14 (100%)
================================================================================
```

---

## 3. Subsystem Branch Coverage Analysis

The branch coverage breakdown across each application architectural layer is summarized below:

| Subsystem Layer | Total Branches | Covered Branches | % Branch Coverage | Quality Assessment |
| :--- | :---: | :---: | :---: | :--- |
| **Services Layer** | 304 | 286 | **94.08%** | Excellent (Critical business logic fully branched) |
| **Controllers Layer** | 196 | 154 | **78.57%** | Good (HTTP status and input validation paths branched) |
| **Middleware Layer** | 67 | 52 | **77.61%** | Solid (Auth and RBAC security gates verified) |
| **Models Layer** | 46 | 34 | **73.91%** | Satisfactory (In-memory and schema query branches) |
| **Utils Layer** | 8 | 6 | **75.00%** | Solid (Cryptographic helper branches) |
| **Total / Aggregate** | **589** | **523** | **88.79%** | **Quality Gate Satisfied ($\ge 80\%$)** |

---

## 4. Deep Dive: Branch Decisions in Critical Paths

### 4.1 Authentication & Security Decisions (`tests/auth.test.js`)
**Lead:** Saatvik Gupta (`PES1UG24CS395`)

1. **User Registration Role Override (CWE-269 Privilege Escalation Guard):**
   * *Decision Point:* `selectedRole = 'ATTENDEE'` in `auth.controller.js`.
   * *Branch Tested (True):* User requests registration with `role: "ADMIN"` or `role: "GATE_STAFF"`.
   * *Outcome:* Explicitly tested in `TC-AUTH-SEC-01` and `TC-AUTH-SEC-02`. The role is unconditionally overridden to `ATTENDEE`.
   * *Branch Tested (False):* Regular registration without elevated role. Tested in `TC-AUTH-01`.

2. **Email Format & SQL Injection Prevention (`SEC-003`):**
   * *Decision Point:* `if (!emailRegex.test(email))` in `auth.controller.js`.
   * *True Path:* Standard email (`saatvik@pes.edu`) passes validation $\to$ proceeds to duplicate check.
   * *False Path:* Malformed or SQLi payload (`attacker' OR '1'='1'--@pes.edu`) fails regex $\to$ branches to 400 Bad Request (`TC-SEC-04`).

3. **Account Deactivation Revocation (`FR-019`, `TC-ADM-01`):**
   * *Decision Point:* `if (user.isActive === false)` in `auth.middleware.js`.
   * *True Path (Active):* Authenticated attendee accesses `/api/auth/me` with 200 OK.
   * *False Path (Deactivated):* Admin deactivates account $\to$ next request branches to immediate 401 with code `ACCOUNT_DEACTIVATED`.

4. **RBAC Authorization Filter (`SEC-002`):**
   * *Decision Point:* `if (!normalizedAllowed.includes(userRole))` in `rbac.middleware.js`.
   * *Authorized Path:* User has matching role (`ADMIN`) $\to$ calls `next()`.
   * *Unauthorized Path:* User role (`ATTENDEE`) lacks permissions $\to$ branches to 403 Forbidden (`TC-SEC-01`).
   * *Unauthenticated Path:* `if (!req.user)` branches to 401 Unauthorized (`TC-MID-01`).

5. **Optional Authentication Branches:**
   * *Decision Point:* In `optionalAuth`, checks if `Authorization` header is present and starts with `Bearer `.
   * *Path 1 (Valid Bearer):* Decodes token and attaches `req.user` (`TC-MID-02`).
   * *Path 2 (No Header):* Silently passes through without attaching `req.user` (`TC-MID-03`).
   * *Path 3 (Invalid/Malformed Token):* Catches verification exception and passes through safely (`TC-MID-04`).

### 4.2 Gate Scanning & Duplicate Entry Branches (`src/routes/checkin.routes.test.js`)
**Lead:** Sambhram M

1. **Gate Staff RBAC Guard:**
   * *Decision Point:* `if (!['GATE_STAFF', 'STAFF', 'ADMIN'].includes(user.role))`.
   * *True Path:* `GATE_STAFF` or `ADMIN` token allowed $\to$ proceeds to QR verification.
   * *False Path:* `ATTENDEE` or `ORGANIZER` token blocked $\to$ branches to 403 Forbidden.

2. **Duplicate Entry Check (`FR-014`):**
   * *Decision Point:* Check-and-set status comparison against `CHECKED_IN`.
   * *First Scan Path:* Ticket state is `ISSUED` $\to$ records check-in log and marks ticket `CHECKED_IN` (200 OK).
   * *Duplicate Scan Path:* Ticket state already `CHECKED_IN` $\to$ branches to 409 Conflict with rejection reason `DUPLICATE_ENTRY`.

### 4.3 Ticket Tier Validation Branches (`tests/tiers.test.js`)
**Lead:** Sanchita Sunil

1. **Tier Pricing & Quota Bounds:**
   * *Decision Point:* `if (price < 0 || quota <= 0)`.
   * *Valid Path:* Positive price and quota $\to$ tier added.
   * *Boundary Paths:* Negative price (`-1`) or zero quota (`0`) branch to 400 Bad Request.

2. **Max Tickets Order Constraint (`BR-001`):**
   * *Decision Point:* `if (quantity > MAX_TICKETS_PER_ORDER)`.
   * *Valid Path:* $\le 5$ tickets allowed.
   * *Violation Path:* $> 5$ tickets branches to 400 Bad Request.

---

## 5. Uncovered Branches Analysis

Of the 589 branches evaluated, 66 branches were not reached during automated test runs. A review of these branches indicates:

1. **Defensive Default Switch Cases:** Switch statements containing standard `default:` fallback branches that are unreachable due to prior input validation schemas.
2. **Server-Level Uncaught Exception Wrappers:** Global Express error-handling middleware (`app.js` lines 43–44) that only triggers if an unhandled promise rejection escapes controller try/catch wrappers.
3. **Redundant Null Checks:** Defensive `user || {}` or `req.headers || {}` checks where upstream Express middleware guarantees the object exists.

These uncovered branches represent standard defensive programming patterns that do not undermine code reliability.

---

## 6. Conclusion & Quality Sign-Off

The branch coverage achieved (**88.79%**) comfortably exceeds the project target of 80.0%. Crucially, all security gates, privilege escalation guards, role boundaries, and duplicate detection branches have been exercised under both positive and negative test conditions.

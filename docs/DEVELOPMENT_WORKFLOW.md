# PassPulse — Development Workflow & Engineering Standards

**Project:** PassPulse (Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform)  
**Document:** Development Workflow, CI/CD Design, PR & Review Standards  
**Target Branch:** `main`  
**Document Status:** Approved Engineering Guideline  

---

## 1. Overview & Workflow Objective

This document defines the engineering protocols, branching standards, code review gates, continuous integration pipeline design, and security policies governing the development of PassPulse across Sprint 1 and Sprint 2.

All four team members (**Sanchita Sunil**, **Saatvik Gupta**, **Reet V Porwal**, **Sambhram M**) must strictly adhere to this standardized process. Direct commits to `main` are strictly forbidden. All code enters the baseline through automated, peer-reviewed Pull Requests.

---

## 2. Git Branching Strategy (Feature Branch Workflow)

```
        main (protected, production-ready)
         |
         +-----------------------+------------------------+
         |                       |                        |
feature/auth-rbac        feature/event-catalog     feature/booking-hold
         |                       |                        |
   (Feature Dev)           (Feature Dev)            (Feature Dev)
         |                       |                        |
         v                       v                        v
    Pull Request            Pull Request             Pull Request
   (CI Checks Pass)        (CI Checks Pass)         (CI Checks Pass)
   (Reviewer Approved)     (Reviewer Approved)      (Reviewer Approved)
         |                       |                        |
         +---------------------->+<-----------------------+
                                 |
                               Merge
```

### 2.1 Branch Taxonomy & Naming Conventions
All branches must be branched off the latest `origin/main` and named using the following prefixes:

| Branch Type | Syntax / Pattern | Examples | Purpose |
| :--- | :--- | :--- | :--- |
| **Feature Branches** | `feature/<module>-<short-description>` | `feature/auth-rbac`<br>`feature/event-catalog`<br>`feature/booking-hold`<br>`feature/gate-scanner` | Implementing functional requirements defined in the sprint backlog. |
| **Bug Fix Branches** | `fix/<story-id-or-issue>-<short-description>` | `fix/bkg-02-hold-race-condition`<br>`fix/qr-timestamp-validation` | Resolving defects identified in testing or code review. |
| **Documentation** | `docs/<short-description>` | `docs/sprint-plan`<br>`docs/api-specifications` | Updating architecture diagrams, test plans, or release notes. |
| **Infrastructure / CI** | `infra/<short-description>` | `infra/github-actions-ci`<br>`infra/docker-optimization` | Modifying Docker Compose, npm configurations, or GitHub Actions. |

### 2.2 Branch Lifecycle Rules
1. **Never Branch from Stale Code:** Always run `git checkout main && git pull origin main` before branching.
2. **Short-Lived Branches:** Feature branches should exist for no more than 2 to 3 days to prevent massive merge conflicts.
3. **Rebase Before Opening PR:** Rebase or merge `main` into your feature branch before requesting review:
   ```bash
   git checkout feature/your-feature
   git fetch origin
   git merge origin/main
   ```
4. **Delete on Merge:** Feature branches must be deleted immediately after merging to keep the repository clean.

---

## 3. Commit Message Standards (Conventional Commits)

Commit messages must reflect clear student-written engineering progress and adhere to the Conventional Commits specification.

### 3.1 Format
```
<type>(<scope>): <imperative description in lowercase>

[optional body explaining rationale and technical design]

[optional issue reference: Fixes #ID]
```

### 3.2 Allowed Types & Scopes

| Commit Type | Purpose | Example |
| :--- | :--- | :--- |
| `feat` | New functional capability | `feat(auth): add user registration, jwt login, and rbac middleware` |
| `fix` | Bug fix in existing functionality | `fix(qr): enforce constant-time signature comparison` |
| `test` | Adding or updating unit/integration tests | `test(auth): add unit and integration test suite for auth and rbac` |
| `docs` | Documentation changes only | `docs(sprint): add Sprint 1 story breakdown and acceptance criteria` |
| `refactor`| Code change that neither fixes a bug nor adds a feature | `refactor(events): extract query builder into repository service` |
| `chore` | Build process, dependency, or config updates | `chore(qr): add QR generation dependency and secret config` |
| `ci` | GitHub Actions workflow modifications | `ci(actions): add postgres and redis service containers to test matrix` |

---

## 4. Pull Request (PR) Policy & Code Review Protocol

Every code contribution must pass through a structured Pull Request.

### 4.1 PR Submission Checklist
Before opening a PR, the author must ensure:
- [ ] Feature branch is up to date with latest `main`.
- [ ] Code compiles and all local tests pass (`npm test`).
- [ ] No extraneous debug statements (`console.log`) or commented-out code.
- [ ] No credentials, passwords, or `.env` files are included in the diff.

### 4.2 Pull Request Template
Every PR must use the following standard markdown description:

```markdown
## Summary of Changes
- Concise bullet points describing what was implemented or fixed.
- Mention new routes, models, or dependencies added.

## Linked Issue / Story
Fixes #<ISSUE_NUMBER> (or Resolves STORY-<ID>)

## Module & Owner
- Owned Module: [Authentication | Event Lifecycle | Booking Engine | QR Check-in]
- Responsible Author: [Sanchita | Saatvik | Reet | Sambhram]

## Verification & Testing Evidence
- [ ] Unit tests added / updated in `server/tests/` or `client/`
- [ ] All automated tests pass locally (`npm test`): [Paste terminal snippet or screenshot]
- [ ] Linter passes (`npm run lint`)

## Acceptance Criteria Checklist (SRS Mapping)
- [ ] Mapped to SRS Requirement ID: [e.g. FR-001, SEC-001]
- [ ] All specified acceptance criteria verified.
```

### 4.3 Review & Merge Procedure
1. **Mandatory Reviewers:** Every PR must be reviewed by the **Team Lead (Sanchita)** and/or the respective module owner.
2. **Review Criteria:**
   - **Correctness:** Does the code satisfy the SRS acceptance criteria?
   - **Security:** Are inputs sanitized? Are passwords hashed? Are route guards enforced?
   - **Architecture:** Does the code maintain layered boundaries (Controller $\to$ Service $\to$ Model)?
   - **Test Coverage:** Are edge cases and error states tested?
3. **Approval Requirement:** At least **1 formal approving review** is required before merge. Authors cannot approve their own PRs.
4. **Merge Method:** Use **Squash and Merge** or standard **Merge Commit** with a clean, descriptive summary. Do not use fast-forward rebase merges that bypass commit provenance.

---

## 5. GitHub Actions Continuous Integration (CI) Design

### 5.1 Pipeline Architecture
The planned GitHub Actions workflow (`.github/workflows/ci.yml`) executes automatically on every `push` to `main` and on every `pull_request` targeting `main`.

```mermaid
flowchart TD
    PR[Pull Request Opened / Updated] --> Trigger[GitHub Actions CI Triggered]
    
    subgraph Job1 [Job 1: Server Tests & Coverage]
        S_Start[Spin up Ubuntu Runner] --> S_Services[Launch Service Containers: PostgreSQL 16 & Redis 7]
        S_Services --> S_Install[npm ci in server/]
        S_Install --> S_Test[npm test -- --coverage]
        S_Test --> S_Gate[Assert Coverage >= 80%]
    end

    subgraph Job2 [Job 2: Client Lint & Build]
        C_Start[Spin up Ubuntu Runner] --> C_Install[npm ci in client/]
        C_Install --> C_Lint[npm run lint via oxlint]
        C_Lint --> C_Build[npm run build via vite]
    end

    subgraph Job3 [Job 3: Security & Secret Scan]
        SEC_Start[Spin up Ubuntu Runner] --> SEC_Audit[npm audit --production]
        SEC_Audit --> SEC_Check[Zero High/Critical Vulnerabilities]
    end

    Trigger --> Job1
    Trigger --> Job2
    Trigger --> Job3

    Job1 --> MergeCheck{All Jobs Passed?}
    Job2 --> MergeCheck
    Job3 --> MergeCheck

    MergeCheck -- Yes --> Approved[Ready for Review & Merge]
    MergeCheck -- No --> Blocked[PR Blocked: Fix Errors]
```

### 5.2 Planned Workflow Specification (`.github/workflows/ci.yml`)

```yaml
name: PassPulse CI Pipeline

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  server-tests:
    name: Backend Unit & Integration Tests
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password123
          POSTGRES_DB: passpulse_test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js (v20)
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'server/package-lock.json'

      - name: Install Server Dependencies
        working-directory: server
        run: npm ci

      - name: Execute Server Tests with Coverage
        working-directory: server
        env:
          PORT: 5001
          NODE_ENV: test
          DATABASE_URL: postgresql://postgres:password123@localhost:5432/passpulse_test_db
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test_ci_jwt_super_secret_key_123
          JWT_EXPIRES_IN: 1d
          QR_HMAC_SECRET: test_ci_qr_hmac_secret_key_456
        run: npm test -- --coverage --ci

  client-build-lint:
    name: Frontend Lint & Build
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js (v20)
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'client/package-lock.json'

      - name: Install Client Dependencies
        working-directory: client
        run: npm ci

      - name: Run Client Linter (oxlint)
        working-directory: client
        run: npm run lint

      - name: Build React Application
        working-directory: client
        run: npm run build

  security-audit:
    name: Dependency Security Audit
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Audit Server Dependencies
        working-directory: server
        run: npm audit --audit-level=high

      - name: Audit Client Dependencies
        working-directory: client
        run: npm audit --audit-level=high
```

### 5.3 Identified Repository Blockers & Prerequisites
Before activating this workflow in Sprint 1, the following repository gaps must be resolved:
1. **Server `qrcode` Dependency Synchronization:** Ensure `npm ci` cleanly installs `qrcode@^1.5.4` on all developer environments.
2. **Environment Variable Injection:** The CI runner must be injected with dummy test secrets (`JWT_SECRET`, `QR_HMAC_SECRET`) so that `qr.service.js` and `jwt.util.js` initialize without throwing missing-variable errors.
3. **Missing Client Test Script:** `client/package.json` contains `dev`, `build`, `lint`, and `preview`, but lacks a `test` runner. Vitest should be added in Sprint 1 to support React component testing.
4. **Database Migration Script:** The server currently lacks an automated schema migration runner (`npm run migrate`). A baseline SQL runner must be added during Sprint 1.

---

## 6. Test & Quality Gates

Every Pull Request must satisfy the following objective gates:

| Gate Type | Tool / Measurement | Threshold Required for Merge |
| :--- | :--- | :--- |
| **Unit & Integration Tests** | Jest (Server) | 100% test pass rate (0 failures allowed). |
| **Code Coverage** | Jest Coverage (`--coverage`) | $\ge 80\%$ statement and branch coverage on server (NFR-006). |
| **Linter Compliance** | `oxlint` (Client) | 0 errors and 0 warnings. |
| **Production Build** | Vite (`npm run build`) | Bundle builds successfully with zero compilation errors. |
| **Vulnerability Audit** | `npm audit` | 0 Critical, 0 High vulnerabilities. |
| **Code Review Sign-off** | GitHub PR Review | At least 1 approval from module owner or team lead. |

---

## 7. Security Policies & Secret Management

### 7.1 Secret Hygiene
* **Zero Secrets in Git:** Under no circumstances may `.env`, private keys, JWT signing secrets, or database passwords be committed to the repository.
* **`.env.example` as Baseline:** Any new environment variable required by the application must be added to `.env.example` with a placeholder description.
* **Repository Secrets:** Production and CI secrets must be managed via GitHub Repository Secrets (`Settings` $\to$ `Secrets and variables` $\to$ `Actions`).

### 7.2 Recommended GitHub Branch Protection Settings
The team lead must configure GitHub Branch Protection on `main`:
1. **Require a pull request before merging:** Enabled.
2. **Require approvals:** 1 approving review required.
3. **Dismiss stale pull request approvals when new commits are pushed:** Enabled.
4. **Require status checks to pass before merging:**
   - Require branches to be up to date before merging.
   - Required status checks: `server-tests`, `client-build-lint`, `security-audit`.
5. **Do not allow bypassing the above settings:** Enforce for all team members including administrators.

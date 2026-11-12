# PassPulse

**Smart Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform**

---

## Overview

PassPulse is a web platform for end-to-end event management: discovery, multi-tier ticket booking, cryptographic QR check-in, and live attendance telemetry.

It targets five failure points in existing event tooling:

- **Ticket fraud** — static PDF tickets and forwarded screenshots enable duplicate gate entry.
- **Race conditions** — concurrent purchases on limited inventory cause overselling.
- **Wasted capacity** — sold-out events turn attendees away with no waitlist, leaving seats empty after cancellations.
- **Gate congestion** — manual list checks and slow round-trips create entry queues.
- **No live visibility** — organizers can't see entry throughput or tier performance in real time.

The system addresses these with Redis-backed TTL inventory locks over PostgreSQL ACID transactions, HMAC-SHA256 signed dynamic QR passes, an automated FIFO waitlist with a 15-minute claim window, and a real-time organizer dashboard.

## Team

| Member | SRN | Owned Module |
|---|---|---|
| Sanchita Sunil (Team Lead) | PES1UG24CS419 | Event Catalog, Discovery & Lifecycle |
| Saatvik Gupta | PES1UG24CS395 | Authentication, RBAC & Security Middleware |
| Reet V Porwal | PES1UG24CS369 | Concurrency Booking Engine & Waitlist |
| Sambhram M | PES1UG24CS409 | QR Pass Generation, Gate Scanner & Telemetry |

## Tech Stack

**Frontend** React.js (SPA) · Tailwind CSS · html5-qrcode
**Backend** Node.js v20.x · Express.js · JWT
**Data** PostgreSQL 16 (ACID transactions; booking and FIFO waitlist source of truth) · Redis 7 (ticket-hold TTL projection)
**DevOps** Docker & Docker Compose · Jenkins · GitHub Actions
**Quality** Jest & Supertest (≥80% coverage) · SonarQube · ESLint · Postman / k6

## Core Features

1. **Auth & RBAC** — bcrypt hashing, stateless JWT, four roles (Attendee, Organizer, Gate Staff, Admin).
2. **Event discovery** — compound filters across category, date range, venue, price, and availability.
3. **Event lifecycle** — DRAFT → PENDING_APPROVAL → PUBLISHED → LIVE → COMPLETED / CANCELLED.
4. **Multi-tier inventory** — Early Bird, General, VIP tiers with independent quotas and pricing.
5. **Atomic booking** — `POST /api/bookings/hold` reserves inventory for 600 seconds; `POST /api/bookings/confirm` atomically converts an owned active hold into one booking and its tickets, using PostgreSQL pricing and QR/pass-compatible ticket records.
6. **Dynamic QR passes** — HMAC-SHA256 signed, time-expiring, resistant to screenshot sharing.
7. **Gate scanner** — camera-based validation under 200 ms with duplicate-entry rejection.
8. **Automated waitlist** — PostgreSQL FIFO queue, durable in-app claim notifications, and 15-minute claims that reassign expired or declined inventory.
9. **Telemetry & reports** — live scan velocity, attendance percentages, CSV/PDF exports.
10. **Admin moderation** — event approval, account governance, audit log review.

## Repository Structure

```
PassPulse/
├── docker-compose.yml      # Local PostgreSQL & Redis
├── docs/                   # Course deliverables (Synopsis, SRS v2.0)
├── server/                 # Express REST API
│   └── src/
│       ├── config/         # database, redis, jwt
│       ├── controllers/    # auth, events, booking, scanner
│       ├── middleware/     # JWT verification, RBAC guard, error handlers
│       ├── models/         # ORM schema definitions
│       ├── routes/         # API route declarations
│       ├── services/       # ticket holds, FIFO waitlist, claim/hold expiry
│       ├── utils/          # HMAC generator, logger
└── client/                 # React SPA
    └── src/
        ├── components/     # Navbar, EventCard, TimerModal
        ├── pages/          # Home, Discovery, EventWizard, Scanner
        ├── services/       # Axios API clients
        └── context/        # AuthContext, CartContext
```

## Getting Started

**Prerequisites:** Node.js v20.x, Docker & Docker Compose, Git.

```bash
# 1. Clone
git clone https://github.com/sanchita-suni/PassPulse.git
cd PassPulse

# 2. Start PostgreSQL and Redis only
docker compose up -d postgres redis

# 3. Backend
cd server
cp .env.example .env        # fill in DB_URL, REDIS_URL, JWT_SECRET, QR_HMAC_SECRET
npm install
npm run db:init             # bootstraps the core schema and applies pending migrations
npm run dev                 # http://localhost:5000

# 4. Frontend (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

### Run the whole stack with Docker (OPS-002, SEC-004)

```bash
cp .env.example .env            # set JWT_SECRET and QR_HMAC_SECRET
bash scripts/gen-dev-cert.sh    # self-signed certificate for https://localhost (Git Bash on Windows)
docker compose up -d --build
bash scripts/check-tls.sh       # TC-SEC-03: TLS 1.3 only, HTTP to HTTPS redirect, HSTS
```

| Service | Address |
|---|---|
| Web client | https://localhost |
| API | https://localhost/api/health |
| PostgreSQL | localhost:5432 (schema applied on first start) |
| Redis | localhost:6379 |

The API and client have no public ports; all traffic goes through the nginx proxy, which accepts TLS 1.3 only and redirects plain HTTP to HTTPS. The browser will warn about the self-signed certificate the first time.

`APP_ENV=development` in `.env` loads the demo users and events. Stop with `docker compose down`; add `-v` to also delete the database volume.

Database changes are versioned in `server/db/migrations/`. `npm run db:migrate`
applies pending migrations without reinitializing the core schema; the API also
applies pending migrations at startup. Existing booking, ticket, check-in, and
audit rows are retained and protected from deletion for at least one year.

### Environment Variables (`server/.env`)

| Variable | Description |
|---|---|
| `DB_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Signing secret for access tokens |
| `QR_HMAC_SECRET` | Signing secret for QR pass payloads |
| `PORT` | API port (default 5000) |

Never commit `.env` — only `.env.example` is tracked.

## Testing

```bash
cd server
npm test                # Jest + Supertest
npm run test:coverage   # enforces ≥80% statement and branch coverage
npm run lint            # ESLint
```

Load and concurrency testing is run via Postman / k6 — 200 concurrent hold requests on a single-seat tier must produce zero oversells.


## Project Management

Sprint tracking lives on the **PassPulse Sprint Board** (Projects tab) with To Do / In Progress / Done columns. Issues are titled with their SRS requirement IDs so the board maps directly to the Requirement Traceability Matrix.

Six 2-week Agile Scrum sprints:

| Sprint | Weeks | Focus |
|---|---|---|
| 1 | 1–2 | SRS baseline, repo setup, Docker scaffolding |
| 2 | 2–3 | Auth API, RBAC middleware, migrations |
| 3 | 3–4 | Event wizard, multi-tier pricing, catalog search |
| 4 | 5–6 | Concurrency hold engine, atomic checkout, waitlist |
| 5 | 6–7 | QR generation, gate scanner, telemetry |
| 6 | 7–8 | Admin moderation, Dockerization, Jenkins CI, final report |

## Documentation & Evaluation Deliverables

- [`docs/PassPulse_Project_Synopsis.pdf`](docs/PassPulse_Project_Synopsis.pdf) — Phase 1 synopsis
- [`docs/PassPulse_Deliverable2_Requirements_SRS.pdf`](docs/PassPulse_Deliverable2_Requirements_SRS.pdf) — SRS v2.0, validation specification, and SPMP
- [`docs/PassPulse_SRS_SAD_STP.pdf`](docs/PassPulse_SRS_SAD_STP.pdf) — Complete IEEE SRS v2.1, SAD v1.0, and STP v1.0 specification (31 pages)
- [`docs/FINAL_EVALUATION_CHECKLIST.md`](docs/FINAL_EVALUATION_CHECKLIST.md) — Part 1–4 evaluation checklist mapped to repository artifacts & CI runs
- [`docs/VIVA_AND_DEMO_PREPARATION_GUIDE.md`](docs/VIVA_AND_DEMO_PREPARATION_GUIDE.md) — Final Demo & Viva FAQs, member contributions, deviations defense, and 2-min demo script
- [`docs/TRACEABILITY_AND_TEST_STATUS.md`](docs/TRACEABILITY_AND_TEST_STATUS.md) — Master Requirements Traceability & Verification Matrix (`FR-001`–`FR-019`, `SEC-001`–`006`, `NFR-001`–`007`)
- [`docs/TEST_CASES_UPDATED.md`](docs/TEST_CASES_UPDATED.md) — Mini-Project Part-3 Updated Test Cases Document
- [`docs/UNIT_TEST_REPORT.md`](docs/UNIT_TEST_REPORT.md) — Mini-Project Part-3 Unit Test Report (`495/495` tests across `36/36` suites passing in CI Run `#42875623511`)
- [`docs/SYSTEM_VALIDATION_REPORT.md`](docs/SYSTEM_VALIDATION_REPORT.md) — Mini-Project Part-3 System Validation Report
- [`docs/CODE_COVERAGE_REPORT.md`](docs/CODE_COVERAGE_REPORT.md) — Mini-Project Part-3 Code Coverage Report (`92.42%` Statements, `97.83%` Functions, `93.67%` Lines)
- [`docs/BRANCH_COVERAGE_REPORT.md`](docs/BRANCH_COVERAGE_REPORT.md) — Mini-Project Part-3 Branch Coverage Report (`82.17%` Branches — exceeds 80% `NFR-006` CI gate)
- [`docs/SPRINT_PLAN.md`](docs/SPRINT_PLAN.md) — Agile Sprint Plan & Work Allocations
- [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) — Git workflow, branch protections, and CI/CD policies
- [`docs/DEVIATIONS.md`](docs/DEVIATIONS.md) — Architectural and requirement deviations register (`DEV-001`–`DEV-008`)

### Sprint Demo Videos
- [`docs/demo/PassPulse_Sprint1_Demo.mp4`](docs/demo/PassPulse_Sprint1_Demo.mp4) — Sprint 1 MVP 1-minute working product demo (uploaded)
- `docs/demo/PassPulse_Sprint2_Demo.mp4` — Sprint 2 final 2-minute demo target path (script in `docs/VIVA_AND_DEMO_PREPARATION_GUIDE.md`)

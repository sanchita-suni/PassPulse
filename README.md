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
**Data** PostgreSQL 16 (ACID transactions) · Redis 7 (TTL locks, waitlist queues)
**DevOps** Docker & Docker Compose · Jenkins · GitHub Actions
**Quality** Jest & Supertest (≥80% coverage) · SonarQube · ESLint · Postman / k6

## Core Features

1. **Auth & RBAC** — bcrypt hashing, stateless JWT, four roles (Attendee, Organizer, Gate Staff, Admin).
2. **Event discovery** — compound filters across category, date range, venue, price, and availability.
3. **Event lifecycle** — DRAFT → PENDING_APPROVAL → PUBLISHED → LIVE → COMPLETED / CANCELLED.
4. **Multi-tier inventory** — Early Bird, General, VIP tiers with independent quotas and pricing.
5. **Atomic booking** — 10-minute Redis TTL hold, committed inside a PostgreSQL transaction; zero overselling.
6. **Dynamic QR passes** — HMAC-SHA256 signed, time-expiring, resistant to screenshot sharing.
7. **Gate scanner** — camera-based validation under 200 ms with duplicate-entry rejection.
8. **Automated waitlist** — FIFO queue with email notification and a 15-minute claim timer.
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
│       ├── services/       # ticket hold, QR signing, waitlist
│       ├── utils/          # HMAC generator, logger
│       └── workers/        # waitlist claim timer
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

# 2. Start PostgreSQL and Redis
docker-compose up -d

# 3. Backend
cd server
cp .env.example .env        # fill in DB_URL, REDIS_URL, JWT_SECRET, QR_HMAC_SECRET
npm install
npm run dev                 # http://localhost:5000

# 4. Frontend (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

### Environment Variables (`server/.env`)

| Variable | Description |
|---|---|
| `DB_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Signing secret for access tokens |
| `QR_HMAC_SECRET` | Signing secret for QR pass payloads |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Nodemailer credentials for booking and waitlist emails |
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

## Documentation

- [`docs/PassPulse_Project_Synopsis.pdf`](docs/PassPulse_Project_Synopsis.pdf) — Phase 1 synopsis
- [`docs/PassPulse_Deliverable2_Requirements_SRS.pdf`](docs/PassPulse_Deliverable2_Requirements_SRS.pdf) — SRS v2.0, validation specification, and SPMP



# PassPulse

**Smart Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform**

Software Engineering (UE24CS341A) — Mini Project (Jackfruit Phase-1)  
Department of Computer Science and Engineering, PES University  
**Team 2** | **Project ID:** PP-2026-T02

---

## Team Members

| Sl. No. | Student Name | SRN | Assigned Feature |
| :--- | :--- | :--- | :--- |
| 1 | Sanchita Sunil (Team Lead) | PES1UG24CS419 | Event Discovery, Catalog Search & Lifecycle Management |
| 2 | Saatvik Gupta | PES1UG24CS395 | User Authentication, Session & Role-Based Access Control (RBAC) |
| 3 | Reet V Porwal | PES1UG24CS369 | Multi-Tier Ticket Booking & Automated Waitlist Engine |
| 4 | Sambhram M | PES1UG24CS409 | Dynamic QR Pass Generation, Gate Check-in & Analytics |

---

## Project Overview

PassPulse is a web-based event management and ticketing platform designed to handle the full event lifecycle, solve ticket overbooking during rush periods, and prevent gate check-in fraud.

### Key Features
- **Event Catalog & Search:** Search and filter events based on date, category, venue, and price.
- **Concurrency-Controlled Booking:** 10-minute temporary ticket holds to prevent overselling.
- **Dynamic QR Passes:** Cryptographically signed digital passes to prevent duplicate scans and screenshot sharing.
- **Fast Gate Check-in:** In-app mobile camera scanner for gate staff with sub-200ms validation.
- **Automated Waitlist:** FIFO queue that reallocates tickets upon cancellations with a 15-minute claim window.
- **Attendance Analytics:** Real-time check-in stats and exportable reports for organizers.

---

## Technology Stack

- **Frontend:** React.js, Tailwind CSS
- **Backend:** Node.js, Express.js REST API
- **Database & Cache:** PostgreSQL, Redis
- **DevOps & Testing:** Docker, Jenkins, SonarQube, Jest, Postman

---

## Documentation

- **Project Synopsis:** [`docs/PassPulse_Project_Synopsis.pdf`](docs/PassPulse_Project_Synopsis.pdf)

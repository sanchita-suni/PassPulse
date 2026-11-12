# PassPulse — Final Evaluation Checklist & Deliverable Verification

**Project:** PassPulse — Smart Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform  
**Course:** UE24CS341A: Software Engineering (Mini-Project)  
**Repository:** `https://github.com/sanchita-suni/PassPulse`  
**Verified CI Baseline:** GitHub Actions Run `#42875623511` (Commit `630fc86` on `main`)  
**Last Audited:** 12 November 2026

---

## Remaining Manual Team Actions Before Viva

Everything verifiable in code, CI, IEEE documentation, deviations, traceability, and Part-3 reports is complete. Only the following **non-code / manual evaluation items** require action by the team / repository owner before or during the viva:

| Action Item | Checklist Mapping | Owner | Status / Instruction |
| :--- | :--- | :--- | :--- |
| **1. Record & Upload 2-Minute Sprint 2 Demo Video** | Part-2 (`Sprint 2 Deliverables`) & FAQ Q4 | Full Team / Sanchita / Sambhram | Record a ~2-minute live walkthrough following the script in `docs/VIVA_AND_DEMO_PREPARATION_GUIDE.md` (Section 6) and commit to **`docs/demo/PassPulse_Sprint2_Demo.mp4`** (matching Sprint 1 video in `docs/demo/PassPulse_Sprint1_Demo.mp4`). |
| **2. Record 5-User Walkthrough & Close Issue `#36`** | `NFR-005` (`DEV-008`, `TC-UX-01`) | Sanchita Sunil (`sanchita-suni`) | 4-screen UI flow and live booking APIs are already integrated (`Checkout.jsx` -> `/api/bookings/hold` & `/confirm`). Run the 5-user observation table in `docs/NFR-005_Booking_Journey.md` and close `#36`. |
| **3. Close Optional Study Issue `#49`** | Internal Study Task | Reet V Porwal (`reetporwal66`) | `Study Redis ticket-hold implementation` (booking holds + `redis.js` + 24 Postgres/Redis tests are already merged on `main`). |
| **4. Confirm Official Dev Freeze & Tag `v1.0.0`** | Part-2 (`Sprint 2 Finalization`) | Sanchita Sunil (Repo Owner) | After uploading the 2-minute demo video, tag `v1.0.0` on `main` (`git tag v1.0.0 && git push origin v1.0.0`) and confirm dev freeze. |

---

## Part-1: Requirements & Design Documents

All three IEEE baseline specifications are consolidated and verified inside [`docs/PassPulse_SRS_SAD_STP.pdf`](PassPulse_SRS_SAD_STP.pdf) (31 pages), supplemented by [`docs/PassPulse_Deliverable2_Requirements_SRS.pdf`](PassPulse_Deliverable2_Requirements_SRS.pdf).

### Software Requirements Specification (SRS — pp. 1–11, v2.1)
- [x] **Document is in standard IEEE format** — Verified in `docs/PassPulse_SRS_SAD_STP.pdf` (pp. 1–11).
- [x] **Contains introductory and descriptive sections** — Purpose, scope, definitions, system perspective, user classes, operating environment, and assumptions included.
- [x] **Includes both Functional Requirements (FRs) and Non-Functional Requirements (NFRs) specified clearly and measurably** — `FR-001` to `FR-019`, `BR-001` to `BR-006`, and measurable `NFR-001` to `NFR-007` (with latency, concurrency, coverage, uptime, and retention targets).
- [x] **Contains at least 1 UML Use Case Diagram** — Full multi-actor UML Use Case Diagram covering Attendee, Organizer, Gate Staff, and Admin included in `docs/PassPulse_SRS_SAD_STP.pdf`.
- [x] **Security section includes at least 2 objectives and 2 requirements** — Section 5.1 specifies security objectives and 6 measurable requirements (`SEC-001` through `SEC-006`).

### Software Test Plan Document (STP — pp. 24–31, v1.0)
- [x] **Document is in standard IEEE format** — Verified in `docs/PassPulse_SRS_SAD_STP.pdf` (pp. 24–31).
- [x] **Sections 3, 4, and 5 are completely filled** — Features to be tested/not tested, test approach, pass/fail criteria, suspension/resumption, test deliverables, and test environment populated.
- [x] **Section 5.1 is dedicated to security validation** — Security validation scope covering bcrypt (`SEC-001`), RBAC (`SEC-002`), SQLi/XSS (`SEC-003`), TLS 1.3 (`SEC-004`), audit trail (`SEC-005`), and HMAC verification (`SEC-006`).
- [x] **Establishes clear traceability back to the SRS** — Mapped to SRS IDs inside the STP and extended in `docs/TRACEABILITY_AND_TEST_STATUS.md`.
- [x] **Contains 7 to 10 minimum test cases covering both FRs and NFRs** — Exceeds minimum in `PassPulse_SRS_SAD_STP.pdf` and expands post-sprints to 495 automated tests tracked in `docs/TEST_CASES_UPDATED.md`.

### Software Architecture & Design (SAD) Specification (pp. 12–23, v1.0)
- [x] **Document is in standard IEEE format** — Verified in `docs/PassPulse_SRS_SAD_STP.pdf` (pp. 12–23).
- [x] **Architecture includes component diagrams/descriptions, architectural pattern, traceability, and security architecture** — Layered MVC + Service-Repository pattern, PostgreSQL + Redis hybrid persistence, component & class diagrams, traceability mapping, and defense-in-depth security architecture.
- [x] **Design section includes at least 2 UML sequence diagrams, API design, and error handling protocols** — Includes Sequence Diagrams (Fig. B-4 booking hold/confirm concurrency & Fig. B-5 dynamic QR gate check-in), REST API specifications, and standardized HTTP 4xx/5xx error contracts.

---

## Part-2: Agile Planning & Repository Setup

### GitHub Backlog & Project Management
- [x] **GitHub Project created and successfully linked to the mini-project repository** — `PassPulse Sprint Board` linked to `sanchita-suni/PassPulse`; 44 tracked issues (`#7`–`#49`).
- [x] **Backlog items successfully created using FRs and NFRs from the SRS** — Issues `#13`–`#46` map 1:1 to `FR-001`–`FR-019`, `NFR-001`–`NFR-007`, `SEC-001`–`SEC-006`, and `OPS-001`–`OPS-002`.
- [x] **Story Points assigned to all backlog items** — Documented and balanced in `docs/SPRINT_PLAN.md` (Sprint 1 = 33 SP, Sprint 2 = 34 SP) and tracked on the project board.
- [x] **User stories appropriately assigned to individual team members** — Clear module ownership across `sanchita-suni` (Events/Admin/Infra), `Saatvik-G` (Auth/RBAC/Security/CI/QA), `reetporwal66` (Booking Engine/Waitlist/Retention), and `sambhram5` (QR/Scanner/Telemetry/Reports/Health).
- [x] **Sprint 1 and Sprint 2 clearly planned in the project board** — Documented in `docs/SPRINT_PLAN.md` and `docs/DEVELOPMENT_WORKFLOW.md`.

### Sprint 1 Execution
- [x] **GitHub Actions enabled for automated PRs and commits** — `.github/workflows/ci.yml` executes Backend Jest + Coverage (`postgres:16-alpine` + `redis:7-alpine`) and Frontend `oxlint` + `vite build` on every push/PR to `main`.
- [x] **Code implemented using approved methods (including permitted AI/GPT usage) matching SRS/SAD constraints** — Layered `routes -> controllers -> services -> models/config` codebase aligned strictly with SAD v1.0.
- [x] **Pull Requests (PRs) raised by the specifically assigned team members** — Verified via `gh pr list` (PRs `#1`–`#60`) and contributor feature-branch merges.
- [x] **PRs formally reviewed and committed by the repository owner / module leads** — Code review & merges performed on `main` per `docs/DEVELOPMENT_WORKFLOW.md`.
- [x] **1-minute video demonstrating a working product uploaded to the repository** — Verified at [`docs/demo/PassPulse_Sprint1_Demo.mp4`](demo/PassPulse_Sprint1_Demo.mp4) (`7.49 MB`, merged in PR `#48`).

### Sprint 2 Execution
- [ ] **Sprint 2 development activities completed and development cycle officially frozen** — All Sprint 2 backend/frontend features and Part-3 QA reports are complete on `main`; awaiting team closure of Issue `#36` (5-user walkthrough) + `#49` and official `v1.0.0` freeze tag by `sanchita-suni`.
- [x] **Any deviations from initial SAD/SRS documents formally documented for the demo** — `DEV-001` through `DEV-008` maintained in [`docs/DEVIATIONS.md`](DEVIATIONS.md) (v1.2).
- [x] **All remaining project documentation finalized** — `README.md`, `TRACEABILITY_AND_TEST_STATUS.md`, `VIVA_AND_DEMO_PREPARATION_GUIDE.md`, `FINAL_EVALUATION_CHECKLIST.md`, `NFR-005_Booking_Journey.md`, and `docs/perf/*` finalized.
- [ ] **2-minute video demonstrating the working product uploaded to the repository** — Pending recording and upload to **`docs/demo/PassPulse_Sprint2_Demo.mp4`** (ready-to-use script provided in `docs/VIVA_AND_DEMO_PREPARATION_GUIDE.md`).

---

## Part-3: Testing & Quality Assurance

- [x] **Original test cases updated to reflect sprint changes** — [`docs/TEST_CASES_UPDATED.md`](TEST_CASES_UPDATED.md) documents post-sprint suites (`TC-SEC-04`–`07`, `TC-MID-01`–`05`, `TC-QR-SIG-01`–`05`, `TC-SEC-AUDIT-01`–`12`, `TC-OPS-01.1`–`13`, `TC-PERF-02.1`–`04`, `booking-hold`, `waitlist`, `telemetry`, `report` exports).
- [x] **Automated test suites executed** — Historical GitHub Actions CI Run `#42875623511`: **36 / 36 suites, 495 / 495 backend tests passed**; frontend `oxlint` and Vite build passed. Latest local real-service run: **37 / 37 suites, 502 / 502 backend tests passed (0 failed, 0 skipped)**; coverage and PostgreSQL restart evidence are recorded in the corresponding reports. The manual NFR-005 usability walkthrough remains pending.
- [x] **Unit Test Report** — [`docs/UNIT_TEST_REPORT.md`](UNIT_TEST_REPORT.md) (v2.0, historical CI suites itemized; latest local results summarized).
- [x] **System Validation Report** — [`docs/SYSTEM_VALIDATION_REPORT.md`](SYSTEM_VALIDATION_REPORT.md) (v2.0, `FR-001`–`FR-019`, `SEC-001`–`SEC-006`, `NFR-001`–`NFR-007`, `OPS-001`–`002`).
- [x] **Code Coverage Report** — [`docs/CODE_COVERAGE_REPORT.md`](CODE_COVERAGE_REPORT.md) (historical CI: 92.42% Statements / 82.17% Branches / 93.67% Lines; latest local: 92.46% Statements / 82.19% Branches / 97.83% Functions / 93.72% Lines).
- [x] **Branch Coverage Report** — [`docs/BRANCH_COVERAGE_REPORT.md`](BRANCH_COVERAGE_REPORT.md) (latest local **82.19% Branches**; historical CI: 82.17%, both above the 80% `NFR-006` gate).

---

## Part-4: Final Evaluation & Viva Readiness

### Final Demo
- [x] **Application functions end-to-end and fulfills outlined core use cases** — Verified via `495/495` CI tests, UI screenshots (`docs/screenshots/01–05_*.png`), Docker Compose (`docker-compose.yml`), and Nginx TLS 1.3 proxy (`scripts/check-tls.sh`).
- [x] **Permitted deviations clearly documented & explainable** — Covered in [`docs/DEVIATIONS.md`](DEVIATIONS.md) and [`docs/VIVA_AND_DEMO_PREPARATION_GUIDE.md`](VIVA_AND_DEMO_PREPARATION_GUIDE.md).
- [x] **Codebase accessible, readable, and managed through version control** — Clean modular layout on `https://github.com/sanchita-suni/PassPulse`.

### Viva / Oral Examination
- [x] **Individual code contributions, PRs, commits & issues mapped for every team member** — Documented in [`docs/VIVA_AND_DEMO_PREPARATION_GUIDE.md`](VIVA_AND_DEMO_PREPARATION_GUIDE.md) Section 2.
- [x] **Agile/SDLC process walkthrough prepared** — Estimations (67 SP total), sprint planning, blockers/deviations, and CI gates prepared in Section 1 & Section 3.
- [x] **Architectural choices, API design, AI-assisted code logic & test defense prepared** — Deep-dive Q&A reference prepared in Section 4 & Section 5.
- [ ] **Live Oral Viva & Final Demo Delivery** — Executed in person during evaluation slot.

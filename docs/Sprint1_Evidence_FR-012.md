# PassPulse — Sprint 1 Deliverable Evidence: FR-012 Attendee Digital QR Pass

**Project:** PassPulse — Smart Event Discovery, High-Concurrency Ticketing & Anti-Fraud Check-in Platform  
**Assigned Requirement:** FR-012 — Attendee Digital QR Pass Screen (GitHub Issue #24)  
**Related Requirements:** FR-011 (HMAC-SHA256 Signed QR Pass), FR-013 (Gate Scanner Interface), FR-014 (Gate Check-in Validation & Duplicate Prevention)  
**Module Owner:** Sambhram M (PES1UG24CS409)  
**Sprint & Schedule Context:** In the PassPulse SPMP schedule (SRS Deliverable 2, Section 5), Sprint 1 establishes the requirements baseline and repository scaffolding, while Dynamic QR Generation and Gate Scanning are assigned to Sprint 5 (Sambhram M). This document records the verification of FR-012 delivered as an early, functional feature slice for Sprint 1 review.  
**Branch:** `feature/gate-scanner` (Pull Request #12)  
**Repository Path:** `D:\sem5\se\SE_Jackfruit\PassPulse`  
**Date:** October 26, 2026  

---

## 1. Requirement & Implementation Summary

### SRS Requirement Traceability
- **FR-011 (QR Generation):** The system shall generate a unique cryptographic digital QR code for each confirmed ticket, signed using HMAC-SHA256. (High Priority, Unit Test)
- **FR-012 (Attendee Pass Screen):** The system shall provide attendees with an interactive digital pass displaying attendee details, ticket tier, and active QR view. (High Priority, UI Test)
- **FR-013 (Gate Scanner):** The system shall allow authorized Gate Staff to scan QR passes using device cameras and decode verification payloads in real time. (High Priority, Functional Test)
- **FR-014 (Check-in Validation):** The system shall mark validated passes as `CHECKED_IN`, record entry timestamp, and reject duplicate scans with a `DUPLICATE_ENTRY` alert. (High Priority, Integration Test)

### Implementation Overview
FR-012 has been implemented as an interactive, responsive digital pass page (`client/src/pages/AttendeePass.jsx`) connected to the PassPulse backend API:
1. **Confirmed Ticket Presentation:** Renders attendee legal name, event title, category, date/time, venue location, ticket ID, ticket tier badge, booking reference, and booking confirmation status.
2. **Cryptographic QR Pass Integration:** Uses the backend QR service (`server/src/services/qr.service.js`) to generate a canonical signed payload (`ticketId`, `eventId`, `userId`, `issuedAt`, `expiresAt`, `signature`) using HMAC-SHA256 with `QR_HMAC_SECRET`. The secret is never exposed to the client.
3. **Confirmed-Booking Gatekeeping:** Only tickets with `bookingConfirmationStatus: 'CONFIRMED'`, `ticketStatus: 'VALID'`, and non-expired timestamps generate a usable pass. Unconfirmed (`PENDING`), cancelled, or expired tickets trigger clear, human-readable error cards.
4. **Authorization & Anti-Tampering:** Protects against unauthorized URL parameter manipulation. The backend endpoint verifies JWT bearer tokens; if an attendee attempts to load another attendee's ticket, the request is rejected with `403 Forbidden`. Unauthenticated requests receive `401 Unauthorized`.
5. **Convenience & Export Features (FR-012.F):**
   - **Save QR Image:** Downloads the high-resolution PNG QR pass.
   - **Print Pass:** Dedicated `@media print` stylesheet prints only the ticket card cleanly without UI navigation buttons.
   - **Copy QR Payload:** Copies the signed payload string to the clipboard for instant testing with Gate Scanner.
6. **Unified Client Navigation:** Seamlessly integrates into `client/src/App.jsx` with URL query support (`?view=pass&ticketId=...`), allowing switching between Home, Attendee Pass, and Gate Scanner.

---

## 2. Files Changed and Created

### Files Created
| File | Purpose |
|---|---|
| `client/src/pages/AttendeePass.jsx` | React component for the attendee digital pass screen with state management, verification controls, and action buttons |
| `client/src/pages/AttendeePass.css` | Stylesheet implementing PassPulse design variables, responsive ticket stub layout, badges, and `@media print` rules |
| `client/src/services/passApi.js` | Client service fetching attendee pass and token data via fetch API |
| `server/src/services/ticket.service.js` | Ticket repository and validation service verifying ownership, status, confirmation, and generating signed passes |
| `server/src/services/ticket.service.test.js` | Unit test suite verifying ticket validation logic and error code generation |
| `server/src/middleware/auth.middleware.js` | JWT Bearer token authentication middleware and testing identity headers |
| `server/src/routes/attendeePass.routes.test.js` | Integration test suite verifying HTTP status codes (200, 400, 401, 403, 404) and Gate Check-in interoperability |

### Files Modified
| File | Modifications |
|---|---|
| `server/src/controllers/qr.controller.js` | Added controllers for `GET /api/qr/pass/:ticketId`, `GET /api/qr/tickets`, and `GET /api/qr/token` while preserving `createQrPass` |
| `server/src/routes/qr.routes.js` | Mounted protected attendee pass routes with authentication middleware |
| `server/package.json` | Added `"test:coverage": "jest --coverage"` script |
| `client/src/App.jsx` | Integrated `AttendeePass` and `GateScanner` navigation and query-parameter handling |
| `client/src/pages/GateScanner.jsx` | Added optional `initialEventId` prop to support one-click transition from pass to scanner |

---

## 3. Test Commands and Actual Results

### A. Backend Unit & Integration Tests
Command executed from `server/`:
```bash
npm test
```
**Actual Output:**
```
PASS src/routes/qr.routes.test.js
PASS src/services/qr.service.test.js
PASS src/services/ticket.service.test.js
PASS src/services/checkin.service.test.js
PASS src/routes/checkin.routes.test.js
PASS src/routes/attendeePass.routes.test.js

Test Suites: 6 passed, 6 total
Tests:       37 passed, 37 total
Snapshots:   0 total
Time:        2.793 s
Ran all test suites.
```
*Result:* **All 37 tests passed (0 failures).**

### B. Backend Test Coverage
Command executed from `server/`:
```bash
npm run test:coverage
```
**Actual Output:**
```
------------------------|---------|----------|---------|---------|-------------------
File                    | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
------------------------|---------|----------|---------|---------|-------------------
All files               |   87.43 |    79.31 |      84 |   87.31 |                   
 src                    |   78.94 |      100 |       0 |   78.94 |                   
  app.js                |   78.94 |      100 |       0 |   78.94 | 21,29,34-35       
 src/controllers        |   85.71 |     77.5 |     100 |   85.71 |                   
  checkin.controller.js |   83.33 |       80 |     100 |   83.33 | 18,57             
  qr.controller.js      |   86.48 |    76.66 |     100 |   86.48 | 60,88,99,113,149  
 src/middleware         |   62.96 |       50 |   66.66 |   62.96 |                   
  auth.middleware.js    |   62.96 |       50 |   66.66 |   62.96 | 68-88             
 src/routes             |     100 |      100 |     100 |     100 |                   
  checkin.routes.js     |     100 |      100 |     100 |     100 |                   
  qr.routes.js          |     100 |      100 |     100 |     100 |                   
 src/services           |   94.89 |       92 |     100 |   94.79 |                   
  checkin.service.js    |   95.23 |    93.33 |     100 |   95.23 | 70                
  qr.service.js         |    90.9 |    88.88 |     100 |    90.9 | 10,50,89          
  ticket.service.js     |   97.72 |    93.93 |     100 |   97.61 | 137               
------------------------|---------|----------|---------|---------|-------------------
```
*Result:* Exceeds course target of $\ge 80\%$ statements and line coverage across core modules (`ticket.service.js` 97.72%, `checkin.service.js` 95.23%, `qr.service.js` 90.9%).

### C. Frontend Linter
Command executed from `client/`:
```bash
npm run lint
```
**Actual Output:**
```
Found 0 warnings and 0 errors.
Finished in 55ms on 7 files with 104 rules using 20 threads.
```
*Result:* **0 errors, 0 warnings.**

### D. Frontend Production Build
Command executed from `client/`:
```bash
npm run build
```
**Actual Output:**
```
vite v8.2.2 building client environment for production...
transforming...
✓ 49 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.46 kB │ gzip:   0.29 kB
dist/assets/react-CHdo91hT.svg    4.12 kB │ gzip:   2.06 kB
dist/assets/vite-BipodSl7.svg     8.71 kB │ gzip:   1.60 kB
dist/assets/hero-CLDdwZDr.png    13.05 kB
dist/assets/index-Bu-3uoQ7.css   11.85 kB │ gzip:   3.07 kB
dist/assets/index-lxpiVimm.js   579.87 kB │ gzip: 174.30 kB

✓ built in 255ms
```
*Result:* Production build compiled cleanly without errors.

---

## 4. Manual Test Cases & Actual Outcomes

| Test ID | Scenario | Input / Action | Expected Result | Actual Outcome | Status |
|---|---|---|---|---|---|
| **TC-PASS-01** | Confirmed digital pass view | Load `TKT-CONFIRMED-001` as authorized attendee Alex Johnson | Renders event details, attendee name, VIP tier, booking reference, and high-contrast signed QR code | Complete pass rendered with valid HMAC signature | **PASS** |
| **TC-PASS-02** | Confirmed demo ticket view | Load `TKT-DEMO-001` as demo attendee | Renders `EVT-TECH-2026`, `TKT-DEMO-001`, `USR-DEMO-001`, VIP Pass, Confirmed | Pass rendered cleanly matching manual test ticket | **PASS** |
| **TC-PASS-03** | Download QR image | Click "Save QR Image" | Downloads PNG file named `PassPulse-TKT-CONFIRMED-001-QR.png` | Valid image file downloaded | **PASS** |
| **TC-PASS-04** | Print pass styling | Click "Print Pass" | Browser print preview renders only ticket card; hides navigation and toolbars | Print stylesheet applied cleanly via `@media print` | **PASS** |
| **TC-PASS-05** | Unconfirmed booking rejection | Select `TKT-PENDING-001` | Displays warning card "Booking Not Confirmed", HTTP 400 | Warning card displayed; QR pass withheld | **PASS** |
| **TC-PASS-06** | Cancelled ticket rejection | Select `TKT-CANCELLED-001` | Displays error card "This ticket is no longer valid", HTTP 400 | Error card displayed; pass withheld | **PASS** |
| **TC-PASS-07** | Expired pass rejection | Select `TKT-EXPIRED-001` | Displays error card "This digital pass has expired", HTTP 400 | Error card displayed; pass withheld | **PASS** |
| **TC-PASS-08** | Non-existent ticket | Enter ID `TKT-INVALID-99` | Displays error card "Ticket Not Found", HTTP 404 | Error card displayed | **PASS** |
| **TC-PASS-09** | Unauthorized URL access (Anti-tamper) | User Sarah Connor attempts to load Alex's ticket `TKT-CONFIRMED-001` | Backend rejects with HTTP 403 Forbidden; UI displays "Access Forbidden" | 403 Forbidden displayed; no pass shown | **PASS** |
| **TC-PASS-10** | Unauthenticated access | Active user set to "Logged Out" | Backend rejects with HTTP 401 Unauthorized; UI displays "Authentication Required" | 401 Unauthorized displayed | **PASS** |
| **TC-GATE-01** | Gate Check-in verification | Paste signed QR payload from `TKT-DEMO-001` into Gate Scanner | Scanner returns `Check-in Successful`, status `CHECKED_IN`, logs timestamp | `CHECKED_IN` recorded | **PASS** |
| **TC-GATE-02** | Duplicate check-in prevention | Paste the same payload into Gate Scanner a second time | Scanner rejects entry with HTTP 409 `DUPLICATE_ENTRY` alert | `DUPLICATE_ENTRY` rejected | **PASS** |
| **TC-GATE-03** | Wrong event check-in rejection | Change Event ID in Gate Scanner to `EVT-WRONG` and submit | Scanner rejects entry with HTTP 400 `WRONG_EVENT` alert | `WRONG_EVENT` rejected | **PASS** |

---

## 5. Known Limitations & Untested Cases

In accordance with academic and engineering integrity standards:
1. **Device Camera Scanning (FR-013):**
   - *Status:* Implemented via `html5-qrcode` library in `GateScanner.jsx`, but **untested with physical camera hardware** in this headless development environment.
   - *Verification Performed:* The verification payload decoder, check-in validation service, and duplicate rejection logic were fully verified using the camera-free input dialog and automated integration tests.
   - *Future Work:* Physical device camera testing will be conducted once deployed to a mobile device with HTTPS/camera permissions.
2. **Persistent Database Storage:**
   - *Status:* Teammate-owned modules for PostgreSQL user authentication (Saatvik Gupta, Sprint 2) and ACID booking engine (Reet V Porwal, Sprint 4) are scheduled in later sprints and not yet merged into this branch.
   - *Verification Performed:* Confirmed ticket lookup and check-in records are maintained in-memory consistent with Sprint 5 architecture (`checkin.service.js`), with schema fields directly adhering to SRS Table 1, 2, and 3.

---

## 6. Specification & Test Plan Deviations

- **SRS Alignment:** No deviations from the submitted SRS (Deliverable 2, Section 5.4, FR-011 and FR-012) were identified.
- **Architecture Alignment:** The implementation directly fulfills the component boundaries specified in `PassPulse_Lab3_Component_Architecture.pdf` for the React.js SPA, QR Pass Service, and Check-in Service.

---

## 7. Captured Screenshot Evidence & Verification Log

All five mandatory screenshot scenarios have been captured directly from the live running application (`http://localhost:5173` with backend on `http://localhost:5000`) and visually verified. The PNG files are saved in `docs/screenshots/`:

| # | Screenshot Filename | File Size | Verification Status | Visual Evidence & Scenario Demonstrated |
|---|---|---|---|---|
| 1 | `docs/screenshots/01_attendee_pass_confirmed.png` | 128,036 bytes | **Verified Genuine** | Confirmed VIP pass for Alex Johnson, TechSummit 2026, status badge `CONFIRMED`, valid HMAC-SHA256 signed QR code displayed. |
| 2 | `docs/screenshots/02_attendee_pass_unconfirmed_warning.png` | 71,030 bytes | **Verified Genuine** | Warning card for ticket `TKT-PENDING-001`: "Booking Not Confirmed (HTTP 400 - UNCONFIRMED_BOOKING)". Pass not rendered. |
| 3 | `docs/screenshots/03_attendee_pass_unauthorized_403.png` | 69,442 bytes | **Verified Genuine** | Security rejection card when Sarah Connor (`USR-DEMO-002`) attempts to access Alex's pass: "Access Forbidden (HTTP 403 - FORBIDDEN)". |
| 4 | `docs/screenshots/04_gate_scanner_checkin_success.png` | 37,405 bytes | **Verified Genuine** | Live Gate Scanner screen showing green check-in alert: Code `CHECKED_IN`, Ticket ID `TKT-DEMO-001`, Attendee ID `USR-DEMO-001`. |
| 5 | `docs/screenshots/05_gate_scanner_duplicate_entry_rejection.png` | 33,347 bytes | **Verified Genuine** | Live Gate Scanner screen after re-submitting identical payload: red alert "Check-in Rejected", Code `DUPLICATE_ENTRY` (HTTP 409). |

### Reproduction Instructions
If screenshots need to be re-captured manually at any time:
1. Start backend: `cd server && npm run dev`
2. Start frontend: `cd client && npm run dev`
3. Visit the respective URLs and click the toolbar presets or test buttons as indicated in Section 8.

---

## 8. One-Minute Demonstration Script

Use this exact 60-second walkthrough during project evaluation:

| Time | Action | What to Say / Demonstrate |
|---|---|---|
| **0:00 – 0:15** | Open `http://localhost:5173`, click **"🎫 Attendee Digital Pass"** | *"Here is the attendee digital pass for FR-012. For a confirmed booking, it renders the attendee's name, event details, venue, ticket tier, and a cryptographically signed HMAC-SHA256 QR code generated by our backend QR service."* |
| **0:15 – 0:25** | Click **"Save QR Image"** and **"Copy QR Payload"** | *"The pass includes convenience features: attendees can download the raw QR image, print the pass, or copy the cryptographic payload. The secret key is never exposed to the client."* |
| **0:25 – 0:35** | Click **"Pending Booking"** and then select **"Sarah Connor"** | *"Security validation is enforced: unconfirmed bookings are rejected with a clear warning state. If a user tries to tamper with the URL to view another attendee's ticket, the backend enforces authorization and rejects the request with HTTP 403 Forbidden."* |
| **0:35 – 0:50** | Switch back to **"Demo Ticket"**, click **"📱 Test at Gate Scanner"**, paste payload into dialog | *"Now we demonstrate integration with FR-013/14. We navigate to the Gate Scanner with the event pre-filled. When we submit the signed payload through the test dialog, the backend validates the signature and marks the ticket as CHECKED_IN."* |
| **0:50 – 1:00** | Submit the same payload again in Gate Scanner | *"Submitting the same pass a second time immediately triggers a DUPLICATE_ENTRY rejection, preventing ticket pass sharing. Real camera-based scanning uses html5-qrcode and will be field-tested once hardware permissions are deployed."* |

---

## 9. Pull Request Status & Next Actions

- **Current PR on GitHub:** PR #12 (`feat(checkin): implement QR gate check-in`) targets `main` from `feature/gate-scanner`.
- **PR #12 Scope Distinction:** PR #12 currently contains only commit `72d1800` (Gate Scanner initial implementation). The new FR-012 Attendee Digital Pass changes are presently uncommitted in the local working tree.
- **Next Push Action:** Once approved, committing these local changes to `feature/gate-scanner` and pushing to `origin` will automatically update PR #12 to encompass the full FR-012 deliverable without opening a duplicate pull request.
- **Working Tree Integrity:** All uncommitted changes remain safely staged/unstaged locally; no destructive Git operations (reset, branch change, force push) have been executed.
- **Readiness:** FR-012 implementation, test suites (37 passing), coverage (>80%), linter (0 errors), and production build are fully verified and ready for review.

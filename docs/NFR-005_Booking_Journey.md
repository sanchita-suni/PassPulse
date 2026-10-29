# NFR-005 Attendee Booking Journey

**Requirement:** A first-time attendee can go from the home page to a confirmed booking in no more than 4 screens (SRS NFR-005, STP TC-UX-01).
**Issue:** #36

## Screen map

| Screen | View | What the attendee does | Step shown |
|---|---|---|---|
| 1 | Home (event catalog) | Searches or filters, opens an event | 1. Find event |
| 2 | Event details | Picks a tier and number of tickets, continues | 2. Choose tickets |
| 3 | Checkout | Signs in on the same screen if needed, holds seats (10 minute timer), confirms | 3. Checkout |
| 4 | Booking confirmed | Sees the booking reference and opens each QR pass | 4. Confirmed |

Design choices that keep the count at 4:

- The home page is the catalog, so there is no separate landing page to click through.
- Sign-in happens inside the checkout screen instead of on a separate login page.
- Tier and quantity are chosen on the event page, so there is no separate ticket selection screen.
- A progress bar (1 to 4) is shown on every screen of the journey.

## Dependency

Screens 3 and 4 call `POST /api/bookings/hold` (FR-008) and `POST /api/bookings/confirm` (FR-010) from the booking module (issues #20 and #22). Until that module is merged, the checkout screen shows "Booking is not available on this server yet" after the hold step. Screens 1 and 2 work today.

## Walkthrough protocol (TC-UX-01)

Run once the booking module is on `main`.

1. Recruit 5 people who have not used PassPulse.
2. Start each on the home page with a fresh attendee account (email and password given on paper).
3. Task: "Book 2 General tickets for TechSummit 2026."
4. Do not help. Record the number of screens visited, time taken and any point where they hesitated.
5. Pass if all 5 finish in 4 screens or fewer.

## Results

| Participant | Screens | Time (mm:ss) | Completed | Notes |
|---|---|---|---|---|
| P1 | | | | |
| P2 | | | | |
| P3 | | | | |
| P4 | | | | |
| P5 | | | | |

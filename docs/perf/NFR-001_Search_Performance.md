# NFR-001 Catalog Search Performance

**Requirement:** 95% of catalog search requests respond within 150 ms with 500 concurrent users (SRS NFR-001, STP TC-PERF-01).
**Issue:** #32

## What was changed

1. **Search index.** `GET /api/events` no longer copies and scans every event on each request. `event.service.js` keeps an index of public events with pre-lower-cased search text, timestamps and tier prices, sorted by date, plus a map by category. The index is rebuilt only when the event store changes (`EventModel.getVersion()`), so new or edited events are searchable immediately.
2. **Result cache.** The last 500 distinct filter combinations are cached against the index version and cleared on any write.
3. **Timing header.** Every catalog response carries `Server-Timing: search;dur=<ms>` so load tests can separate server time from network time.
4. **Database indexes.** `db/schema.sql` indexes `events.category`, `events.event_date` and `events.status` for when the catalog moves to PostgreSQL.

## How it is tested

| Check | Command | Setup |
|---|---|---|
| In-process test (runs in CI) | `npm test` (`tests/perf/search.perf.test.js`) | 10,000 events, 300 mixed queries through the HTTP stack, asserts p95 < 150 ms |
| Load benchmark | `npm run bench:search` | 10,000 events, 500 concurrent clients, keep-alive HTTP, 30 s |
| k6 (STP TC-PERF-01) | `k6 run -e BASE_URL=http://localhost:5000 server/tests/perf/catalog-search.k6.js` | 500 virtual users, 5 minutes, 1 s pause per user, threshold p(95) < 150 ms |

The query mix covers no filter, each single filter, combined filters, pagination and a no-match search.

## Results

Measured on 28 Oct 2026 on a 2-core Linux machine, Node 22. The API and the load generator ran on the same machine, which favours the server less than a separate load machine would.

| Scenario | Requests | Throughput | p50 | p95 | p99 | Errors | NFR-001 |
|---|---|---|---|---|---|---|---|
| In-process, 300 queries | 300 | n/a | n/a | < 150 ms (test passes) | n/a | 0 | Pass |
| 500 users, 1 s pause (`THINK_MS=1000`) | 15,000 | 500 req/s | 3 ms | 16.2 ms | 413.5 ms | 0 | **Pass** |
| 500 clients, no pause | 95,125 | 3,171 req/s | 125.2 ms | 187.3 ms | 223.4 ms | 0 | Fail |
| 500 clients, no pause, before this change | 48,015 | 1,601 req/s | 184.4 ms | 275.9 ms | 347.2 ms | 0 | Fail |

Search work itself takes 0.02 to 0.55 ms per query (measured in-process over 10,000 events). The p99 in the 1 s pause run comes from all 500 users opening connections in the same instant at the start.

## Reading the results

- With 500 users who each search about once per second, which is how the k6 script models real browsing, p95 is 16 ms, well inside the 150 ms target.
- With 500 clients firing back-to-back with no pause, a single Node process on 2 cores saturates at about 3,200 req/s. The 187 ms p95 is time spent queued, not searching. The change roughly doubled throughput and cut p95 by 32% in this mode.
- If the stricter no-pause reading is required, the next steps are running the API in cluster mode (one worker per core) or behind the reverse proxy with more than one API container. This is recorded in `docs/DEVIATIONS.md`.

## Reproduce

```
cd server
npm run bench:search                    # 500 clients, no pause
THINK_MS=1000 npm run bench:search      # 500 users, 1 s pause
CONCURRENCY=200 DURATION=60 npm run bench:search
```

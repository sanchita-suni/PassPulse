// NFR-001 / TC-PERF-01: 500 virtual users for 5 minutes against a running API.
// Run: k6 run -e BASE_URL=http://localhost:5000 server/tests/perf/catalog-search.k6.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const QUERIES = [
  '',
  'category=Tech',
  'search=summit',
  'venue=auditorium',
  'startDate=2026-11-01&endDate=2026-12-31',
  'minPrice=200&maxPrice=600',
  'category=Music&maxPrice=700',
];

export const options = {
  vus: 500,
  duration: '5m',
  thresholds: {
    http_req_duration: ['p(95)<150'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  const qs = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const res = http.get(`${BASE_URL}/api/events?${qs}`);
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1); // each virtual user browses about once per second
}

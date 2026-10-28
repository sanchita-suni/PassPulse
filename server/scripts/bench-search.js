/**
 * NFR-001 load benchmark without extra tools.
 * Starts the API in-process with a 10,000-event catalog and keeps CONCURRENCY
 * clients sending mixed catalog searches for DURATION seconds over keep-alive
 * HTTP, then prints throughput and latency percentiles.
 *
 * Usage: npm run bench:search                    (500 clients, 30 s, no pause)
 *        THINK_MS=1000 npm run bench:search      (500 users who pause 1 s, like k6 sleep(1))
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config();
// The QR module refuses to load without a secret; the benchmark never signs passes.
process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'bench-only-secret';

const http = require('http');
const app = require('../src/app');
const { seedPerfEvents, QUERIES } = require('../tests/perf/perfData');

const CONCURRENCY = Number(process.env.CONCURRENCY || 500);
const DURATION_S = Number(process.env.DURATION || 30);
const EVENTS = Number(process.env.EVENTS || 10000);
// Pause per simulated user between requests, like k6 sleep(); 0 = back-to-back.
const THINK_MS = Number(process.env.THINK_MS || 0);

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function main() {
  await seedPerfEvents(EVENTS);
  const server = http.createServer(app).listen(0);
  const { port } = server.address();
  const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });

  const latencies = [];
  let errors = 0;
  let q = 0;
  const end = Date.now() + DURATION_S * 1000;

  function once() {
    const path = `/api/events?${QUERIES[q++ % QUERIES.length]}`;
    return new Promise((resolve) => {
      const t0 = process.hrtime.bigint();
      const req = http.get({ host: '127.0.0.1', port, path, agent }, (res) => {
        res.resume();
        res.on('end', () => {
          if (res.statusCode === 200) latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
          else errors += 1;
          resolve();
        });
      });
      req.on('error', () => {
        errors += 1;
        resolve();
      });
    });
  }

  const pause = () => new Promise((r) => setTimeout(r, THINK_MS));

  async function client() {
    while (Date.now() < end) {
      await once();
      if (THINK_MS) await pause();
    }
  }

  console.log(`Catalog: ${EVENTS} events. Clients: ${CONCURRENCY}. Think time: ${THINK_MS} ms. Duration: ${DURATION_S}s`);
  await Promise.all(Array.from({ length: CONCURRENCY }, client));
  server.close();
  agent.destroy();

  latencies.sort((a, b) => a - b);
  const result = {
    requests: latencies.length,
    errors,
    rps: Math.round(latencies.length / DURATION_S),
    p50_ms: +pct(latencies, 50).toFixed(1),
    p95_ms: +pct(latencies, 95).toFixed(1),
    p99_ms: +pct(latencies, 99).toFixed(1),
    max_ms: +latencies[latencies.length - 1].toFixed(1),
  };
  console.log(JSON.stringify(result, null, 2));
  console.log(result.p95_ms <= 150 ? 'NFR-001 PASS: p95 <= 150 ms' : 'NFR-001 FAIL: p95 above 150 ms');
  process.exitCode = result.p95_ms <= 150 ? 0 : 1;
}

main();

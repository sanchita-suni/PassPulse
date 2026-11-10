process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'test-qr-hmac-secret-key-32-chars!!';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-auth!!';

const request = require('supertest');
const app = require('../app');
const EventModel = require('../models/event.model');
const ticketService = require('../services/ticket.service');
const checkinService = require('../services/checkin.service');
const telemetryService = require('../services/telemetry.service');
const { generateQrPass } = require('../services/qr.service');
const { generateToken } = require('../utils/jwt.util');
const tokens = require('../../tests/helpers/tokens');

describe('Telemetry Routes & SSE Stream Integration (FR-017 / Issue #29 / TC-ANL-01)', () => {
  jest.setTimeout(15000);

  const eventId = 'EVT-TEL-INT-001';
  const organizerId = 'USR-ORG-001';
  const otherOrganizerId = 'USR-ORG-002';
  const gateStaffToken = `Bearer ${generateToken({ id: 'USR-STAFF-001', userId: 'USR-STAFF-001', role: 'GATE_STAFF' })}`;

  let validTicketId = 'TKT-TEL-INT-001';
  let validQrData;

  beforeEach(async () => {
    telemetryService.clearSubscribers();
    checkinService.clearCheckInRecords();
    ticketService.clearTickets();
    await EventModel.clearAll();

    // Create event owned by USR-ORG-001
    await EventModel.insert({
      id: eventId,
      organizerId,
      title: 'Live Telemetry Conference',
      status: 'LIVE',
      category: 'Tech',
      venue: 'PES Convention Hall',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      capacity: 300,
      tiers: [{ id: 'TIER-1', name: 'Standard', price: 299, quota: 100, sold: 1, maxPerOrder: 5 }],
      notices: [],
    });

    // Register confirmed ticket
    ticketService.registerTicket({
      ticketId: validTicketId,
      eventId,
      userId: 'USR-ATTENDEE-001',
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    // Generate valid HMAC QR pass
    const pass = await generateQrPass({
      ticketId: validTicketId,
      eventId,
      userId: 'USR-ATTENDEE-001',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    validQrData = pass.qrData;
  });

  afterEach(() => {
    telemetryService.clearSubscribers();
    checkinService.clearCheckInRecords();
  });

  describe('Authentication & Authorization Guards', () => {
    test('unauthenticated request returns 401', async () => {
      const resSnapshot = await request(app).get(`/api/telemetry/${eventId}`);
      expect(resSnapshot.status).toBe(401);

      const resStream = await request(app).get(`/api/telemetry/${eventId}/stream`);
      expect(resStream.status).toBe(401);
    });

    test('attendee role returns 403 Forbidden', async () => {
      const resSnapshot = await request(app)
        .get(`/api/telemetry/${eventId}`)
        .set('Authorization', tokens.attendee());
      expect(resSnapshot.status).toBe(403);

      const resStream = await request(app)
        .get(`/api/telemetry/${eventId}/stream`)
        .set('Authorization', tokens.attendee());
      expect(resStream.status).toBe(403);
    });

    test('gate staff role returns 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/telemetry/${eventId}`)
        .set('Authorization', gateStaffToken);
      expect(res.status).toBe(403);
    });

    test('organizer accessing another organizer’s event returns 403 NOT_EVENT_OWNER', async () => {
      const res = await request(app)
        .get(`/api/telemetry/${eventId}`)
        .set('Authorization', tokens.otherOrganizer());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_EVENT_OWNER');
    });

    test('non-existent event returns 404 EVENT_NOT_FOUND', async () => {
      const res = await request(app)
        .get('/api/telemetry/EVT-NONEXISTENT')
        .set('Authorization', tokens.organizer());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('EVENT_NOT_FOUND');
    });

    test('event owner organizer returns 200 telemetry snapshot', async () => {
      const res = await request(app)
        .get(`/api/telemetry/${eventId}`)
        .set('Authorization', tokens.organizer());
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.eventId).toBe(eventId);
      expect(res.body.data.totalAttendees).toBe(1);
      expect(res.body.data.checkedInCount).toBe(0);
      expect(res.body.data.attendancePercentage).toBe(0);
      expect(res.body.data.scanVelocity).toBe(0);
    });

    test('admin can access telemetry for any organizer’s event', async () => {
      const res = await request(app)
        .get(`/api/telemetry/${eventId}`)
        .set('Authorization', tokens.admin());
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.eventId).toBe(eventId);
    });
  });

  describe('Server-Sent Events (SSE) Stream (/api/telemetry/:eventId/stream)', () => {
    test('establishes SSE connection with correct headers and initial snapshot', (done) => {
      const reqStream = request(app)
        .get(`/api/telemetry/${eventId}/stream`)
        .set('Authorization', tokens.organizer());

      reqStream
        .expect('Content-Type', /^text\/event-stream/)
        .expect('Cache-Control', /no-cache/)
        .expect('Connection', /keep-alive/)
        .expect(200)
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            const text = chunk.toString();
            if (text.startsWith('data:')) {
              const data = JSON.parse(text.replace('data:', '').trim());
              expect(data.eventId).toBe(eventId);
              expect(data.totalAttendees).toBe(1);
              expect(data.checkedInCount).toBe(0);
              expect(data.attendancePercentage).toBe(0);
              res.destroy(); // End test stream
              done();
            }
          });
          callback(null, '');
        })
        .end((err) => {
          if (err && err.code !== 'ECONNRESET') done(err);
        });
    });

    test('query-token fallback allows SSE connection when header is not supplied', (done) => {
      const rawToken = generateToken({
        id: organizerId,
        userId: organizerId,
        role: 'ORGANIZER',
        email: 'organizer@test.io',
      });

      request(app)
        .get(`/api/telemetry/${eventId}/stream?token=${rawToken}`)
        .expect(200)
        .expect('Content-Type', /^text\/event-stream/)
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            const text = chunk.toString();
            if (text.startsWith('data:')) {
              const data = JSON.parse(text.replace('data:', '').trim());
              expect(data.eventId).toBe(eventId);
              res.destroy();
              done();
            }
          });
          callback(null, '');
        })
        .end((err) => {
          if (err && err.code !== 'ECONNRESET') done(err);
        });
    });

    test('TC-ANL-01: gate check-in broadcasts live update to SSE subscriber within 3 seconds', (done) => {
      let snapshotReceived = false;
      const startTime = Date.now();

      const reqStream = request(app)
        .get(`/api/telemetry/${eventId}/stream`)
        .set('Authorization', tokens.organizer());

      reqStream
        .expect(200)
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            const text = chunk.toString();
            const lines = text.split('\n\n').filter((l) => l.startsWith('data:'));

            for (const line of lines) {
              const data = JSON.parse(line.replace('data:', '').trim());

              if (!snapshotReceived) {
                snapshotReceived = true;
                expect(data.checkedInCount).toBe(0);

                // Perform gate check-in immediately after stream establishes
                request(app)
                  .post('/api/checkin/verify')
                  .set('Authorization', gateStaffToken)
                  .send({
                    qrData: validQrData,
                    eventId,
                    ticketStatus: 'VALID',
                    bookingConfirmationStatus: 'CONFIRMED',
                  })
                  .then((checkinRes) => {
                    expect(checkinRes.status).toBe(200);
                    expect(checkinRes.body.code).toBe('CHECKED_IN');
                  })
                  .catch((err) => done(err));
              } else {
                // Second SSE event is the live check-in broadcast
                const latencyMs = Date.now() - startTime;
                expect(latencyMs).toBeLessThan(3000); // Must arrive within 3 seconds (FR-017 AC)
                expect(data.eventId).toBe(eventId);
                expect(data.checkedInCount).toBe(1);
                expect(data.totalAttendees).toBe(1);
                expect(data.attendancePercentage).toBe(100.0);
                expect(data.scanVelocity).toBe(1);
                res.destroy();
                done();
              }
            }
          });
          callback(null, '');
        })
        .end((err) => {
          if (err && err.code !== 'ECONNRESET') done(err);
        });
    });

    test('duplicate check-in (409) does NOT broadcast an SSE update', async () => {
      const mockRes = { write: jest.fn(), writableEnded: false, destroyed: false };
      telemetryService.addSubscriber(eventId, mockRes);

      // Perform first scan
      const firstScan = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', gateStaffToken)
        .send({
          qrData: validQrData,
          eventId,
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });
      expect(firstScan.status).toBe(200);
      expect(mockRes.write).toHaveBeenCalledTimes(1);

      mockRes.write.mockClear();

      // Perform duplicate scan of same ticket
      const secondScan = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', gateStaffToken)
        .send({
          qrData: validQrData,
          eventId,
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });
      expect(secondScan.status).toBe(409);
      expect(secondScan.body.code).toBe('DUPLICATE_ENTRY');

      // Crucial requirement: Duplicate scan must NEVER broadcast
      expect(mockRes.write).not.toHaveBeenCalled();
    });

    test('invalid or rejected check-in (400) does NOT broadcast an SSE update', async () => {
      const mockRes = { write: jest.fn(), writableEnded: false, destroyed: false };
      telemetryService.addSubscriber(eventId, mockRes);

      // Pass with wrong event ID
      const wrongEventScan = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', gateStaffToken)
        .send({
          qrData: validQrData,
          eventId: 'EVT-DIFFERENT-999',
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });
      expect(wrongEventScan.status).toBe(400);
      expect(wrongEventScan.body.code).toBe('WRONG_EVENT');

      // Must not trigger telemetry
      expect(mockRes.write).not.toHaveBeenCalled();
    });

    test('client disconnect cleans up subscriber from telemetry registry', (done) => {
      const reqStream = request(app)
        .get(`/api/telemetry/${eventId}/stream`)
        .set('Authorization', tokens.organizer());

      reqStream
        .expect(200)
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            const text = chunk.toString();
            if (text.startsWith('data:')) {
              expect(telemetryService.getSubscribersCount(eventId)).toBe(1);
              res.destroy(); // Client disconnects

              setTimeout(() => {
                expect(telemetryService.getSubscribersCount(eventId)).toBe(0);
                done();
              }, 50);
            }
          });
          callback(null, '');
        })
        .end((err) => {
          if (err && err.code !== 'ECONNRESET') done(err);
        });
    });

    test('multiple concurrent check-ins produce accurate final metrics', async () => {
      // Register 5 additional tickets and generate passes in parallel
      const ticketIndices = [2, 3, 4, 5, 6];
      ticketIndices.forEach((i) => {
        ticketService.registerTicket({
          ticketId: `TKT-TEL-CONC-${i}`,
          eventId,
          userId: `USR-CONC-${i}`,
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        });
      });

      const passes = await Promise.all(
        ticketIndices.map((i) =>
          generateQrPass({
            ticketId: `TKT-TEL-CONC-${i}`,
            eventId,
            userId: `USR-CONC-${i}`,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
        )
      );

      // Execute 5 concurrent check-ins
      const results = await Promise.all(
        passes.map((p) =>
          request(app)
            .post('/api/checkin/verify')
            .set('Authorization', gateStaffToken)
            .send({
              qrData: p.qrData,
              eventId,
              ticketStatus: 'VALID',
              bookingConfirmationStatus: 'CONFIRMED',
            })
        )
      );

      results.forEach((r) => {
        expect(r.status).toBe(200);
        expect(r.body.code).toBe('CHECKED_IN');
      });

      // Verify telemetry snapshot reflects all 5 check-ins accurately
      const telemetryRes = await request(app)
        .get(`/api/telemetry/${eventId}`)
        .set('Authorization', tokens.organizer());

      expect(telemetryRes.status).toBe(200);
      expect(telemetryRes.body.data.checkedInCount).toBe(5);
      expect(telemetryRes.body.data.scanVelocity).toBe(5);
    });
  });

  describe('verifyEventAccess helper unit tests', () => {
    const { verifyEventAccess } = require('../controllers/telemetry.controller');
    const db = require('../config/db');

    test('finds event in PostgreSQL when initialized and owner matches', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({
          rows: [{ id: 'EVT-PG-1', organizer_id: 'USR-ORG-PG' }],
        }),
      };
      db.setPool(mockPool);

      try {
        const ev = await verifyEventAccess('EVT-PG-1', { id: 'USR-ORG-PG', role: 'ORGANIZER' });
        expect(ev.id).toBe('EVT-PG-1');
      } finally {
        db.setPool(null);
      }
    });

    test('rejects with 403 when user is not owner in PostgreSQL', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({
          rows: [{ id: 'EVT-PG-1', organizer_id: 'USR-ORG-OTHER' }],
        }),
      };
      db.setPool(mockPool);

      try {
        await expect(
          verifyEventAccess('EVT-PG-1', { id: 'USR-ORG-PG', role: 'ORGANIZER' })
        ).rejects.toMatchObject({ status: 403, code: 'NOT_EVENT_OWNER' });
      } finally {
        db.setPool(null);
      }
    });

    test('rejects with 404 when event is missing in PostgreSQL', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      db.setPool(mockPool);

      try {
        await expect(
          verifyEventAccess('EVT-MISSING', { id: 'USR-ORG-PG', role: 'ORGANIZER' })
        ).rejects.toMatchObject({ status: 404, code: 'EVENT_NOT_FOUND' });
      } finally {
        db.setPool(null);
      }
    });
  });

  describe('Heartbeat & Unexpected Errors in Telemetry Controller', () => {
    test('sends periodic keep-alive comment and refreshed metrics', (done) => {
      process.env.TELEMETRY_HEARTBEAT_MS = '50';
      let keepAliveSeen = false;

      const reqStream = request(app)
        .get(`/api/telemetry/${eventId}/stream`)
        .set('Authorization', tokens.organizer());

      reqStream
        .expect(200)
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (chunk) => {
            const text = chunk.toString();
            if (text.includes(': keep-alive')) {
              keepAliveSeen = true;
              delete process.env.TELEMETRY_HEARTBEAT_MS;
              res.destroy();
              done();
            }
          });
          callback(null, '');
        })
        .end((err) => {
          delete process.env.TELEMETRY_HEARTBEAT_MS;
          if (err && err.code !== 'ECONNRESET') done(err);
        });
    });

    test('getTelemetry delegates unexpected non-EventError exceptions to error handler (500)', async () => {
      jest.spyOn(telemetryService, 'calculateMetrics').mockRejectedValueOnce(new Error('Unexpected disk read error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await request(app)
        .get(`/api/telemetry/${eventId}`)
        .set('Authorization', tokens.organizer());

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Internal Server Error');

      consoleSpy.mockRestore();
      jest.restoreAllMocks();
    });

    test('streamTelemetry handles unexpected calculation failure gracefully', async () => {
      jest.spyOn(telemetryService, 'calculateMetrics').mockRejectedValueOnce(new Error('Unexpected calculation crash'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await request(app)
        .get(`/api/telemetry/${eventId}/stream`)
        .set('Authorization', tokens.organizer());

      // Because headers were sent before calculation, error handler calls res.end()
      expect(res.status).toBe(200);

      consoleSpy.mockRestore();
      jest.restoreAllMocks();
    });
  });
});

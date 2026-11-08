const auditService = require('./audit.service');
const db = require('../config/db');

describe('Audit Service (SEC-005)', () => {
  beforeEach(() => {
    auditService.clearInMemoryLogs();
    auditService.setForceMemoryStore(true);
  });

  afterAll(() => {
    auditService.setForceMemoryStore(false);
  });

  describe('Validation & In-Memory Store', () => {
    test('rejects missing or non-string action', async () => {
      await expect(auditService.recordAudit({})).rejects.toThrow('Audit action must be a non-empty string');
      await expect(auditService.recordAudit({ action: '' })).rejects.toThrow('Audit action must be a non-empty string');
      await expect(auditService.recordAudit({ action: 123 })).rejects.toThrow('Audit action must be a non-empty string');
    });

    test('records audit event to in-memory store with sanitized fields', async () => {
      const record = await auditService.recordAudit({
        actorId: ' USR-ADMIN-001 ',
        action: 'EVENT_APPROVED',
        target: ' EVT-COMEDY-2026 ',
        ipAddress: ' 127.0.0.1 ',
      });

      expect(record).toMatchObject({
        id: 1,
        actorId: 'USR-ADMIN-001',
        action: 'EVENT_APPROVED',
        target: 'EVT-COMEDY-2026',
        ipAddress: '127.0.0.1',
      });
      expect(typeof record.createdAt).toBe('string');
      expect(auditService.getInMemoryLogs()).toHaveLength(1);
    });

    test('safely handles null/empty/non-string optional fields', async () => {
      const record = await auditService.recordAudit({
        action: 'LOGIN_FAILED',
        actorId: null,
        target: '',
        ipAddress: undefined,
      });

      expect(record.actorId).toBeNull();
      expect(record.target).toBeNull();
      expect(record.ipAddress).toBeNull();
      expect(record.action).toBe('LOGIN_FAILED');
    });

    test('retrieves audit logs with in-memory filtering and pagination', async () => {
      await auditService.recordAudit({ action: 'LOGIN_FAILED', actorId: null, target: 'a@x.com' });
      await auditService.recordAudit({ action: 'EVENT_APPROVED', actorId: 'USR-ADMIN-001', target: 'EVT-1' });
      await auditService.recordAudit({ action: 'USER_DEACTIVATED', actorId: 'USR-ADMIN-001', target: 'USR-2' });
      await auditService.recordAudit({ action: 'LOGIN_FAILED', actorId: null, target: 'b@x.com' });

      const all = await auditService.getAuditLogs();
      expect(all.total).toBe(4);
      expect(all.auditLogs).toHaveLength(4);

      const filteredAction = await auditService.getAuditLogs({ action: 'LOGIN_FAILED' });
      expect(filteredAction.total).toBe(2);
      expect(filteredAction.auditLogs.every((l) => l.action === 'LOGIN_FAILED')).toBe(true);

      const filteredActor = await auditService.getAuditLogs({ actorId: 'USR-ADMIN-001' });
      expect(filteredActor.total).toBe(2);

      const filteredTarget = await auditService.getAuditLogs({ target: 'EVT-1' });
      expect(filteredTarget.total).toBe(1);
      expect(filteredTarget.auditLogs[0].action).toBe('EVENT_APPROVED');

      const paginated = await auditService.getAuditLogs({ limit: 2, offset: 1 });
      expect(paginated.total).toBe(4);
      expect(paginated.limit).toBe(2);
      expect(paginated.offset).toBe(1);
      expect(paginated.auditLogs).toHaveLength(2);
    });

    test('clamps boundary limit and offset parameters', async () => {
      await auditService.recordAudit({ action: 'EVENT_APPROVED' });

      const resNegative = await auditService.getAuditLogs({ limit: -5, offset: -10 });
      expect(resNegative.limit).toBe(1);
      expect(resNegative.offset).toBe(0);

      const resExcessive = await auditService.getAuditLogs({ limit: 500 });
      expect(resExcessive.limit).toBe(100);
    });
  });

  describe('Database Persistence & Error Propagation', () => {
    test('records audit using provided client query inside transaction', async () => {
      auditService.setForceMemoryStore(false);
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              id: 99,
              actor_id: 'USR-STAFF-001',
              action: 'CHECK_IN_ACCEPTED',
              target: 'TKT-123',
              ip_address: '10.0.0.1',
              created_at: new Date('2026-11-08T10:00:00Z'),
            },
          ],
        }),
      };

      const record = await auditService.recordAudit({
        client: mockClient,
        actorId: 'USR-STAFF-001',
        action: 'CHECK_IN_ACCEPTED',
        target: 'TKT-123',
        ipAddress: '10.0.0.1',
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        ['USR-STAFF-001', 'CHECK_IN_ACCEPTED', 'TKT-123', '10.0.0.1']
      );
      expect(record).toMatchObject({
        id: 99,
        actorId: 'USR-STAFF-001',
        action: 'CHECK_IN_ACCEPTED',
        target: 'TKT-123',
        ipAddress: '10.0.0.1',
        createdAt: '2026-11-08T10:00:00.000Z',
      });
    });

    test('records audit directly with database pool when pool is initialized', async () => {
      auditService.setForceMemoryStore(false);
      const mockPool = {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              id: 101,
              actor_id: 'USR-ADMIN-001',
              action: 'USER_PROVISIONED',
              target: 'USR-NEW-1',
              ip_address: '192.168.1.1',
              created_at: '2026-11-08T10:30:00Z',
            },
          ],
        }),
      };
      jest.spyOn(db, 'getPool').mockReturnValue(mockPool);
      jest.spyOn(db, 'isPoolInitialized').mockReturnValue(true);

      const record = await auditService.recordAudit({
        actorId: 'USR-ADMIN-001',
        action: 'USER_PROVISIONED',
        target: 'USR-NEW-1',
        ipAddress: '192.168.1.1',
      });

      expect(record.id).toBe(101);
      expect(record.createdAt).toBe('2026-11-08T10:30:00Z');
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      db.getPool.mockRestore();
      db.isPoolInitialized.mockRestore();
    });

    test('does NOT silently swallow client query failure', async () => {
      auditService.setForceMemoryStore(false);
      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error('Connection terminated')),
      };

      await expect(
        auditService.recordAudit({
          client: mockClient,
          action: 'CHECK_IN_REJECTED',
        })
      ).rejects.toThrow('Connection terminated');
      expect(auditService.getInMemoryLogs()).toHaveLength(0);
    });

    test('does NOT silently swallow database pool write failure', async () => {
      auditService.setForceMemoryStore(false);
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('DB disk full')),
      };
      jest.spyOn(db, 'getPool').mockReturnValue(mockPool);
      jest.spyOn(db, 'isPoolInitialized').mockReturnValue(true);

      await expect(
        auditService.recordAudit({
          action: 'LOGIN_FAILED',
          target: 'user@x.com',
        })
      ).rejects.toThrow('DB disk full');
      expect(auditService.getInMemoryLogs()).toHaveLength(0);

      db.getPool.mockRestore();
      db.isPoolInitialized.mockRestore();
    });

    test('queries database pool for getAuditLogs when pool is initialized (with filters)', async () => {
      auditService.setForceMemoryStore(false);
      const mockPool = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ total: 1 }] })
          .mockResolvedValueOnce({
            rows: [
              {
                id: 10,
                actor_id: 'USR-ADMIN-001',
                action: 'EVENT_APPROVED',
                target: 'EVT-1',
                ip_address: '127.0.0.1',
                created_at: new Date('2026-11-08T12:00:00Z'),
              },
            ],
          }),
      };
      jest.spyOn(db, 'getPool').mockReturnValue(mockPool);
      jest.spyOn(db, 'isPoolInitialized').mockReturnValue(true);

      const res = await auditService.getAuditLogs({ action: 'EVENT_APPROVED', actorId: 'USR-ADMIN-001', target: 'EVT-1' });

      expect(res.total).toBe(1);
      expect(res.auditLogs[0]).toMatchObject({
        id: 10,
        actorId: 'USR-ADMIN-001',
        action: 'EVENT_APPROVED',
        target: 'EVT-1',
      });
      expect(mockPool.query).toHaveBeenCalledTimes(2);

      db.getPool.mockRestore();
      db.isPoolInitialized.mockRestore();
    });

    test('queries database pool for getAuditLogs with default unbounded filters', async () => {
      auditService.setForceMemoryStore(false);
      const mockPool = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ total: 0 }] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      jest.spyOn(db, 'getPool').mockReturnValue(mockPool);
      jest.spyOn(db, 'isPoolInitialized').mockReturnValue(true);

      const res = await auditService.getAuditLogs();
      expect(res.total).toBe(0);
      expect(res.auditLogs).toEqual([]);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE'),
        expect.any(Array)
      );

      db.getPool.mockRestore();
      db.isPoolInitialized.mockRestore();
    });

    test('uses database by default in non-test NODE_ENV', async () => {
      auditService.setForceMemoryStore(false);
      const savedEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const mockPool = {
        query: jest.fn().mockResolvedValue({
          rows: [
            {
              id: 200,
              actor_id: null,
              action: 'LOGIN_FAILED',
              target: 'hacker@x.com',
              ip_address: '8.8.8.8',
              created_at: new Date(),
            },
          ],
        }),
      };
      jest.spyOn(db, 'getPool').mockReturnValue(mockPool);

      try {
        const record = await auditService.recordAudit({
          action: 'LOGIN_FAILED',
          target: 'hacker@x.com',
        });
        expect(record.id).toBe(200);
        expect(mockPool.query).toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = savedEnv;
        db.getPool.mockRestore();
      }
    });
  });
});

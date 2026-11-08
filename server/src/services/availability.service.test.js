const os = require('os');
const path = require('path');
const fs = require('fs');
const availabilityService = require('./availability.service');
const db = require('../config/db');

describe('Availability Service (NFR-004 / Issue #35)', () => {
  let tempStateFile;

  beforeEach(() => {
    tempStateFile = path.join(
      os.tmpdir(),
      `passpulse-test-avail-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    availabilityService.resetAvailabilityState({ stateFilePath: tempStateFile });
  });

  afterEach(async () => {
    await availabilityService.stopAvailabilityPoller();
    availabilityService.resetAvailabilityState({ stateFilePath: tempStateFile });
    try {
      const dir = path.dirname(tempStateFile);
      const base = path.basename(tempStateFile);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.includes(base)) {
            try {
              fs.unlinkSync(path.join(dir, file));
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  });

  describe('startAvailabilityPoller & lifecycle', () => {
    test('starts with default interval when no options or env are provided', async () => {
      const mockChecker = jest.fn().mockResolvedValue({
        status: 'success',
        httpCode: 200,
        services: { database: { status: 'up' }, redis: { status: 'up' } },
      });

      availabilityService.startAvailabilityPoller({
        healthChecker: mockChecker,
        stateFilePath: tempStateFile,
      });
      expect(availabilityService.isPollerRunning()).toBe(true);

      // Calling start again should be a no-op (no duplicate timers)
      availabilityService.startAvailabilityPoller({
        healthChecker: mockChecker,
        stateFilePath: tempStateFile,
      });
      expect(availabilityService.isPollerRunning()).toBe(true);

      await availabilityService.stopAvailabilityPoller();
      expect(availabilityService.isPollerRunning()).toBe(false);
    });

    test('initialImmediate executes and completes initial cycle', async () => {
      const mockChecker = jest.fn().mockResolvedValue({
        status: 'success',
        httpCode: 200,
        services: { database: { status: 'up' }, redis: { status: 'up' } },
      });
      availabilityService.startAvailabilityPoller({
        intervalMs: 10000,
        healthChecker: mockChecker,
        stateFilePath: tempStateFile,
      });
      await new Promise((r) => setImmediate(r));
      expect(mockChecker).toHaveBeenCalled();
      await availabilityService.stopAvailabilityPoller();
    });

    test('handles environments where setInterval returns an object without unref', async () => {
      const origSetInterval = global.setInterval;
      const mockChecker = jest.fn().mockResolvedValue({
        status: 'success',
        httpCode: 200,
        services: { database: { status: 'up' }, redis: { status: 'up' } },
      });

      global.setInterval = jest.fn().mockImplementation((fn, ms) => {
        const timer = origSetInterval(fn, ms);
        delete timer.unref;
        return timer;
      });

      availabilityService.startAvailabilityPoller({
        intervalMs: 100,
        healthChecker: mockChecker,
        stateFilePath: tempStateFile,
      });
      expect(availabilityService.isPollerRunning()).toBe(true);

      await availabilityService.stopAvailabilityPoller();
      global.setInterval = origSetInterval;
    });

    test('uses AVAILABILITY_POLL_INTERVAL_MS env variable if provided', async () => {
      process.env.AVAILABILITY_POLL_INTERVAL_MS = '200';
      const mockChecker = jest.fn().mockResolvedValue({
        status: 'success',
        httpCode: 200,
        services: { database: { status: 'up' }, redis: { status: 'up' } },
      });

      availabilityService.startAvailabilityPoller({
        healthChecker: mockChecker,
        stateFilePath: tempStateFile,
      });
      expect(availabilityService.isPollerRunning()).toBe(true);
      await availabilityService.stopAvailabilityPoller();
      delete process.env.AVAILABILITY_POLL_INTERVAL_MS;
    });

    test('runPollCycle catches checker failures without throwing', async () => {
      const rejectingChecker = jest.fn().mockRejectedValue(new Error('Network catastrophic error'));

      const result = await availabilityService.runPollCycle({
        healthChecker: rejectingChecker,
        stateFilePath: tempStateFile,
      });

      expect(result.status).toBe('error');
      expect(result.httpCode).toBe(503);

      const summary = availabilityService.getAvailabilitySummary();
      expect(summary.failedChecks).toBe(1);
      expect(summary.totalChecks).toBe(1);
    });

    test('returns existing activePoll promise if a cycle is already in progress', async () => {
      const slowChecker = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  status: 'success',
                  httpCode: 200,
                  services: { database: { status: 'up' }, redis: { status: 'up' } },
                }),
              20
            );
          })
      );

      const p1 = availabilityService.runPollCycle({
        healthChecker: slowChecker,
        stateFilePath: tempStateFile,
      });
      const p2 = availabilityService.runPollCycle({
        healthChecker: slowChecker,
        stateFilePath: tempStateFile,
      });

      expect(p2).toBe(p1);
      await Promise.all([p1, p2]);
    });

    test('stopAvailabilityPoller awaits and suppresses activePoll error', async () => {
      const rejectingChecker = jest.fn().mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Async error')), 20))
      );

      const pollPromise = availabilityService.runPollCycle({
        healthChecker: rejectingChecker,
        stateFilePath: tempStateFile,
      });

      await expect(availabilityService.stopAvailabilityPoller()).resolves.toBeUndefined();
      await pollPromise;
    });
  });

  describe('outage incident tracking and recovery duration', () => {
    test('opens incident on failure, keeps it open on consecutive failures, and resolves on recovery', async () => {
      // 1. Initial healthy check
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          timestamp: '2026-11-08T10:00:00.000Z',
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      let summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(1);
      expect(summary.successfulChecks).toBe(1);
      expect(summary.failedChecks).toBe(0);
      expect(summary.activeIncident).toBeNull();

      // 2. Outage begins (DB down)
      await availabilityService.recordCheckResult(
        {
          status: 'error',
          httpCode: 503,
          timestamp: '2026-11-08T10:01:00.000Z',
          services: { database: { status: 'down' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(2);
      expect(summary.successfulChecks).toBe(1);
      expect(summary.failedChecks).toBe(1);
      expect(summary.activeIncident).not.toBeNull();
      expect(summary.activeIncident.service).toBe('database');
      expect(summary.activeIncident.status).toBe('OPEN');
      const incidentId = summary.activeIncident.id;

      // 3. Consecutive failure (same outage continues, should NOT create duplicate incident)
      await availabilityService.recordCheckResult(
        {
          status: 'error',
          httpCode: 503,
          timestamp: '2026-11-08T10:02:00.000Z',
          services: { database: { status: 'down' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(3);
      expect(summary.failedChecks).toBe(2);
      expect(summary.activeIncident.id).toBe(incidentId);

      // 4. Recovery
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          timestamp: '2026-11-08T10:03:00.000Z',
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(4);
      expect(summary.successfulChecks).toBe(2);
      expect(summary.failedChecks).toBe(2);
      expect(summary.activeIncident).toBeNull();
      expect(summary.incidents).toHaveLength(1);

      const resolved = summary.incidents[0];
      expect(resolved.id).toBe(incidentId);
      expect(resolved.status).toBe('RESOLVED');
      expect(resolved.durationSeconds).toBe(120); // 10:01:00 to 10:03:00 = 120s
    });

    test('correctly identifies service failure types including generic server failure', async () => {
      // Redis only failure
      await availabilityService.recordCheckResult(
        {
          status: 'error',
          httpCode: 503,
          timestamp: '2026-11-08T11:00:00.000Z',
          services: { database: { status: 'up' }, redis: { status: 'down' } },
        },
        { stateFilePath: tempStateFile }
      );
      let summary = availabilityService.getAvailabilitySummary();
      expect(summary.activeIncident.service).toBe('redis');

      // Recover
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          timestamp: '2026-11-08T11:01:00.000Z',
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      // Both DB and Redis failure
      await availabilityService.recordCheckResult(
        {
          status: 'error',
          httpCode: 503,
          timestamp: '2026-11-08T11:02:00.000Z',
          services: { database: { status: 'down' }, redis: { status: 'down' } },
        },
        { stateFilePath: tempStateFile }
      );
      summary = availabilityService.getAvailabilitySummary();
      expect(summary.activeIncident.service).toBe('database+redis');

      // Recover
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          timestamp: '2026-11-08T11:03:00.000Z',
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      // Generic server failure without individual dependency flag
      await availabilityService.recordCheckResult(
        {
          status: 'error',
          httpCode: 500,
          message: 'Unhandled process fault',
          timestamp: '2026-11-08T11:04:00.000Z',
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );
      summary = availabilityService.getAvailabilitySummary();
      expect(summary.activeIncident.service).toBe('server');
      expect(summary.activeIncident.failureCause).toBe('Unhandled process fault');
    });

    test('syncs incident start and recovery to database if pool is initialized', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rowCount: 1 }),
      };
      db.setPool(mockPool);

      // Start incident
      await availabilityService.recordCheckResult(
        {
          status: 'error',
          httpCode: 503,
          timestamp: '2026-11-08T12:00:00.000Z',
          services: { database: { status: 'down' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO availability_incidents'),
        expect.any(Array)
      );

      // Recover incident
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          timestamp: '2026-11-08T12:01:00.000Z',
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE availability_incidents'),
        expect.any(Array)
      );

      db.setPool(null);
    });

    test('silently handles database sync query rejections', async () => {
      const failingPool = {
        query: jest.fn().mockRejectedValue(new Error('DB failure during incident sync')),
      };
      db.setPool(failingPool);

      await expect(
        availabilityService.recordCheckResult(
          {
            status: 'error',
            httpCode: 503,
            timestamp: '2026-11-08T12:00:00.000Z',
            services: { database: { status: 'down' }, redis: { status: 'up' } },
          },
          { stateFilePath: tempStateFile }
        )
      ).resolves.toBeUndefined();

      await expect(
        availabilityService.recordCheckResult(
          {
            status: 'success',
            httpCode: 200,
            timestamp: '2026-11-08T12:01:00.000Z',
            services: { database: { status: 'up' }, redis: { status: 'up' } },
          },
          { stateFilePath: tempStateFile }
        )
      ).resolves.toBeUndefined();

      db.setPool(null);
    });
  });

  describe('availability percentage & 99.5% target calculations', () => {
    test('returns 100% when zero checks have executed', () => {
      const summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(0);
      expect(summary.availabilityPercentage).toBe(100.0);
      expect(summary.meetsTarget).toBe(true);
    });

    test('meetsTarget is true when availability is at or above 99.5%', async () => {
      // Simulate 1000 total checks with 4 failures (99.6% availability)
      for (let i = 0; i < 996; i++) {
        await availabilityService.recordCheckResult(
          {
            status: 'success',
            httpCode: 200,
            services: { database: { status: 'up' }, redis: { status: 'up' } },
          },
          { stateFilePath: tempStateFile }
        );
      }
      for (let i = 0; i < 4; i++) {
        await availabilityService.recordCheckResult(
          {
            status: 'error',
            httpCode: 503,
            services: { database: { status: 'down' }, redis: { status: 'up' } },
          },
          { stateFilePath: tempStateFile }
        );
      }

      const summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(1000);
      expect(summary.successfulChecks).toBe(996);
      expect(summary.failedChecks).toBe(4);
      expect(summary.availabilityPercentage).toBe(99.6);
      expect(summary.meetsTarget).toBe(true);
    });

    test('meetsTarget is false when availability drops below 99.5%', async () => {
      // Simulate 100 checks with 1 failure (99.0% availability)
      for (let i = 0; i < 99; i++) {
        await availabilityService.recordCheckResult(
          {
            status: 'success',
            httpCode: 200,
            services: { database: { status: 'up' }, redis: { status: 'up' } },
          },
          { stateFilePath: tempStateFile }
        );
      }
      await availabilityService.recordCheckResult(
        {
          status: 'error',
          httpCode: 503,
          services: { database: { status: 'down' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      const summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(100);
      expect(summary.successfulChecks).toBe(99);
      expect(summary.failedChecks).toBe(1);
      expect(summary.availabilityPercentage).toBe(99.0);
      expect(summary.meetsTarget).toBe(false);
    });
  });

  describe('persistence across restarts', () => {
    test('creates nested directory when saving state to non-existent folder', async () => {
      const nestedPath = path.join(os.tmpdir(), `nested-${Date.now()}`, 'deep', 'state.json');
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: nestedPath }
      );
      expect(fs.existsSync(nestedPath)).toBe(true);
      fs.rmSync(path.dirname(path.dirname(nestedPath)), { recursive: true, force: true });
    });

    test('loads state from file correctly', async () => {
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      expect(fs.existsSync(tempStateFile)).toBe(true);

      // Reset in-memory state and reload from file
      availabilityService.loadStateFromFile(tempStateFile);
      const summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(1);
      expect(summary.successfulChecks).toBe(1);
    });

    test('handles corrupt state file gracefully and preserves backup', () => {
      fs.writeFileSync(tempStateFile, 'INVALID_JSON_CORRUPT_DATA', 'utf8');
      const loadResult = availabilityService.loadStateFromFile(tempStateFile);
      expect(loadResult.success).toBe(true);
      expect(loadResult.corrupted).toBe(true);
      expect(loadResult.backedUp).toBe(true);
      expect(fs.existsSync(loadResult.backupPath)).toBe(true);
      expect(fs.readFileSync(loadResult.backupPath, 'utf8')).toBe('INVALID_JSON_CORRUPT_DATA');

      const summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(0);

      // Now saveStateToFile should succeed and write clean state while backup is preserved
      const saved = availabilityService.saveStateToFile(tempStateFile);
      expect(saved).toBe(true);
      expect(fs.existsSync(tempStateFile)).toBe(true);
      expect(fs.readFileSync(loadResult.backupPath, 'utf8')).toBe('INVALID_JSON_CORRUPT_DATA');
    });

    test('atomic write succeeds and cleans up temporary files', () => {
      const saved = availabilityService.saveStateToFile(tempStateFile);
      expect(saved).toBe(true);
      expect(fs.existsSync(tempStateFile)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(tempStateFile, 'utf8'));
      expect(parsed.metrics).toBeDefined();

      const dir = path.dirname(tempStateFile);
      const leftoverTmp = fs.readdirSync(dir).filter((f) => f.includes(path.basename(tempStateFile)) && f.endsWith('.tmp'));
      expect(leftoverTmp.length).toBe(0);
    });

    test('temporary write failure does not replace valid existing state', async () => {
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      const originalRaw = fs.readFileSync(tempStateFile, 'utf8');
      expect(JSON.parse(originalRaw).metrics.totalChecks).toBe(1);

      const spy = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        throw new Error('Disk full on temp write');
      });

      const saved = availabilityService.saveStateToFile(tempStateFile);
      expect(saved).toBe(false);

      // Verify original file is still intact and not corrupted/modified
      expect(fs.existsSync(tempStateFile)).toBe(true);
      expect(fs.readFileSync(tempStateFile, 'utf8')).toBe(originalRaw);

      spy.mockRestore();
    });

    test('rename failure does not silently report success and cleans up temp file', () => {
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
        throw new Error('EXDEV: cross-device link not permitted');
      });

      const saved = availabilityService.saveStateToFile(tempStateFile);
      expect(saved).toBe(false);

      const dir = path.dirname(tempStateFile);
      const leftoverTmp = fs.readdirSync(dir).filter((f) => f.includes(path.basename(tempStateFile)) && f.endsWith('.tmp'));
      expect(leftoverTmp.length).toBe(0);

      renameSpy.mockRestore();
    });

    test('backup failure blocks subsequent overwrites to protect corrupted history', () => {
      fs.writeFileSync(tempStateFile, 'CRITICAL_CORRUPTED_HISTORY_CONTENT', 'utf8');

      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
        throw new Error('EACCES: permission denied during backup');
      });

      const loadResult = availabilityService.loadStateFromFile(tempStateFile);
      expect(loadResult.success).toBe(false);
      expect(loadResult.corrupted).toBe(true);
      expect(loadResult.backedUp).toBe(false);
      expect(availabilityService.isWriteBlocked(tempStateFile)).toBe(true);

      // Attempt to save state: must be blocked to prevent destroying corrupted content
      const saveResult = availabilityService.saveStateToFile(tempStateFile);
      expect(saveResult).toBe(false);

      // Verify the corrupted file content was NEVER overwritten
      expect(fs.readFileSync(tempStateFile, 'utf8')).toBe('CRITICAL_CORRUPTED_HISTORY_CONTENT');

      renameSpy.mockRestore();
    });

    test('state survives service restart across multiple incidents', async () => {
      // 1st check: success
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      // 2nd check: failure (starts incident)
      await availabilityService.recordCheckResult(
        {
          status: 'error',
          httpCode: 503,
          services: { database: { status: 'down' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      // 3rd check: recovery (resolves incident)
      await availabilityService.recordCheckResult(
        {
          status: 'success',
          httpCode: 200,
          services: { database: { status: 'up' }, redis: { status: 'up' } },
        },
        { stateFilePath: tempStateFile }
      );

      const summaryBefore = availabilityService.getAvailabilitySummary();
      expect(summaryBefore.totalChecks).toBe(3);
      expect(summaryBefore.successfulChecks).toBe(2);
      expect(summaryBefore.failedChecks).toBe(1);
      expect(summaryBefore.incidents.length).toBe(1);

      // Simulate reboot: in-memory state lost, then reloaded from disk
      availabilityService.resetAvailabilityState({ stateFilePath: path.join(os.tmpdir(), `dummy-${Date.now()}`) });
      expect(availabilityService.getAvailabilitySummary().totalChecks).toBe(0);

      // Reload state from file
      const reloadResult = availabilityService.loadStateFromFile(tempStateFile);
      expect(reloadResult.success).toBe(true);

      const summaryAfter = availabilityService.getAvailabilitySummary();
      expect(summaryAfter.totalChecks).toBe(3);
      expect(summaryAfter.successfulChecks).toBe(2);
      expect(summaryAfter.failedChecks).toBe(1);
      expect(summaryAfter.incidents.length).toBe(1);
      expect(summaryAfter.incidents[0].status).toBe('RESOLVED');
    });

    test('Docker configuration specifies non-root permissions and named volume persistence', () => {
      const dockerfilePath = path.join(__dirname, '..', '..', 'Dockerfile');
      const composePath = path.join(__dirname, '..', '..', '..', 'docker-compose.yml');

      expect(fs.existsSync(dockerfilePath)).toBe(true);
      expect(fs.existsSync(composePath)).toBe(true);

      const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
      const compose = fs.readFileSync(composePath, 'utf8');

      // Dockerfile creates /app/data with node:node ownership before USER node
      expect(dockerfile).toMatch(/mkdir -p \/app\/data && chown -R node:node \/app\/data/);
      expect(dockerfile.indexOf('chown -R node:node /app/data')).toBeLessThan(dockerfile.indexOf('USER node'));

      // docker-compose.yml mounts server_data to /app/data and declares server_data volume
      expect(compose).toMatch(/server_data:\/app\/data/);
      expect(compose).toMatch(/volumes:\s+[\s\S]*server_data:/);
    });

    test('handles file read errors gracefully without crashing', () => {
      fs.writeFileSync(tempStateFile, JSON.stringify({ metrics: {} }));
      const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw new Error('I/O read failure');
      });

      const res = availabilityService.loadStateFromFile(tempStateFile);
      expect(res.success).toBe(false);
      expect(res.error).toBe('I/O read failure');

      readSpy.mockRestore();
    });

    test('loads state file with missing or non-numeric metric values using defaults', () => {
      fs.writeFileSync(
        tempStateFile,
        JSON.stringify({
          metrics: {
            totalChecks: 'not-a-number',
            successfulChecks: null,
            failedChecks: undefined,
            lastCheckAt: null,
          },
        })
      );

      const res = availabilityService.loadStateFromFile(tempStateFile);
      expect(res.success).toBe(true);

      const summary = availabilityService.getAvailabilitySummary();
      expect(summary.totalChecks).toBe(0);
      expect(summary.successfulChecks).toBe(0);
      expect(summary.failedChecks).toBe(0);
    });

    test('resetAvailabilityState clears active initialImmediate', () => {
      availabilityService.startAvailabilityPoller({
        stateFilePath: tempStateFile,
        intervalMs: 100000,
      });
      // Call reset while initialImmediate might be pending
      availabilityService.resetAvailabilityState({ stateFilePath: tempStateFile });
      expect(availabilityService.isWriteBlocked(tempStateFile)).toBe(false);
    });

    test('interval timer callback executes periodic poll cycle', async () => {
      jest.useFakeTimers();
      const mockChecker = jest.fn().mockResolvedValue({
        status: 'success',
        httpCode: 200,
        services: { database: { status: 'up' }, redis: { status: 'up' } },
      });

      availabilityService.startAvailabilityPoller({
        intervalMs: 60000,
        healthChecker: mockChecker,
        stateFilePath: tempStateFile,
      });

      jest.advanceTimersByTime(60000);
      expect(mockChecker).toHaveBeenCalled();

      await availabilityService.stopAvailabilityPoller();
      jest.useRealTimers();
    });

    test('handles file write errors gracefully without crashing', () => {
      const spy = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        throw new Error('Disk full');
      });

      expect(() => {
        availabilityService.saveStateToFile(tempStateFile);
      }).not.toThrow();

      spy.mockRestore();
    });

    test('resetAvailabilityState removes existing state file and unblocks path', () => {
      fs.writeFileSync(tempStateFile, JSON.stringify({ metrics: {} }));
      expect(fs.existsSync(tempStateFile)).toBe(true);
      availabilityService.resetAvailabilityState({ stateFilePath: tempStateFile });
      expect(fs.existsSync(tempStateFile)).toBe(false);
      expect(availabilityService.isWriteBlocked(tempStateFile)).toBe(false);
    });
  });
});

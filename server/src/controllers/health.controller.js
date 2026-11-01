const {
  getLiveness,
  getReadiness,
} = require('../services/health.service');

/**
 * Health Check Controller (NFR-004 / Issue #35)
 */

/**
 * Primary health check endpoint (`GET /api/health`).
 *
 * Supports:
 * - Basic health check (default): returns HTTP 200 with status, uptime, version, and memory.
 * - Detailed dependency check (`?detailed=true`): probes database and core subsystems.
 *   Returns HTTP 200 when all dependencies are healthy; HTTP 503 when degraded or unhealthy.
 */
async function getHealth(req, res, next) {
  try {
    const isDetailed = req.query.detailed === 'true' || req.query.check === 'all';

    if (isDetailed) {
      const readiness = await getReadiness({
        dbProbe: req.app?.locals?.dbProbe,
      });

      if (!readiness.ready) {
        return res.status(503).json({
          status: 'error',
          code: 'SERVICE_UNAVAILABLE',
          message: 'One or more dependencies are unhealthy',
          data: readiness,
        });
      }

      return res.status(200).json({
        status: 'success',
        message: 'PassPulse API is healthy and dependencies are operational',
        data: readiness,
      });
    }

    const liveness = getLiveness();

    return res.status(200).json({
      status: 'success',
      message: 'PassPulse API is running',
      data: liveness,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Liveness probe (`GET /api/health/live`).
 * Lightweight probe for container orchestrators and load balancers.
 */
function getLivenessController(req, res) {
  const liveness = getLiveness();
  return res.status(200).json({
    status: 'success',
    code: 'ALIVE',
    data: liveness,
  });
}

/**
 * Readiness probe (`GET /api/health/ready`).
 * Probes database and service availability.
 * Returns HTTP 200 when operational; HTTP 503 when dependencies fail.
 */
async function getReadinessController(req, res, next) {
  try {
    const readiness = await getReadiness({
      dbProbe: req.app?.locals?.dbProbe,
    });

    if (!readiness.ready) {
      return res.status(503).json({
        status: 'error',
        code: 'SERVICE_UNAVAILABLE',
        message: 'Server is not ready to accept traffic',
        data: readiness,
      });
    }

    return res.status(200).json({
      status: 'success',
      code: 'READY',
      data: readiness,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getHealth,
  getLivenessController,
  getReadinessController,
};

/**
 * Health check controller (NFR-004 / Issue #35)
 */
const healthService = require('../services/health.service');

async function getHealth(req, res) {
  try {
    const result = await healthService.checkHealth();
    return res.status(result.httpCode).json(result);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      httpCode: 503,
      message: 'PassPulse API health check failed',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime() * 100) / 100,
      services: {
        database: { status: 'down' },
        redis: { status: 'down' },
      },
    });
  }
}

function getLiveness(req, res) {
  const result = healthService.getLiveness();
  return res.status(result.httpCode).json(result);
}

async function getReadiness(req, res) {
  try {
    const result = await healthService.getReadiness();
    return res.status(result.httpCode).json(result);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      httpCode: 503,
      message: 'PassPulse API readiness check failed',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime() * 100) / 100,
      services: {
        database: { status: 'down' },
        redis: { status: 'down' },
      },
    });
  }
}

module.exports = {
  getHealth,
  getLiveness,
  getReadiness,
};

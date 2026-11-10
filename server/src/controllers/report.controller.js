const db = require('../config/db');
const { getManageableEvent } = require('../services/event.service');
const reportService = require('../services/report.service');

const SUPPORTED_FORMATS = ['csv', 'pdf'];

class ReportError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Verifies that the requesting user is authorized to manage/export reports for the specified event.
 *
 * Enforces:
 * - Event existence (404 EVENT_NOT_FOUND)
 * - Event ownership: Organizer must match event organizer_id; Admin allowed for all (403 NOT_EVENT_OWNER)
 *
 * @param {string} eventId
 * @param {object} user - Authenticated user payload from req.user
 * @returns {Promise<object>} The validated event record
 */
async function verifyEventAccess(eventId, user) {
  try {
    return await getManageableEvent(eventId, user);
  } catch (err) {
    // If not found in in-memory EventModel, check PostgreSQL when initialized
    if (err.code === 'EVENT_NOT_FOUND' && db.isPoolInitialized()) {
      const pool = db.getPool();
      const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
      if (!rows.length) {
        throw new ReportError(404, 'EVENT_NOT_FOUND', 'Event not found');
      }
      const dbEvent = rows[0];
      const role = (user.role || '').toUpperCase();
      const isAdmin = role === 'ADMIN';
      const userId = user.id || user.userId;
      if (!isAdmin && dbEvent.organizer_id !== userId) {
        throw new ReportError(403, 'NOT_EVENT_OWNER', 'You can only export reports for your own events');
      }
      return dbEvent;
    }
    // Re-wrap or re-throw
    if (err.code === 'NOT_EVENT_OWNER') {
      throw new ReportError(403, 'NOT_EVENT_OWNER', 'You can only export reports for your own events');
    }
    if (err.code === 'EVENT_NOT_FOUND') {
      throw new ReportError(404, 'EVENT_NOT_FOUND', 'Event not found');
    }
    throw err;
  }
}

function parseAndValidateFormat(queryFormat = 'csv') {
  const format = String(queryFormat || 'csv').trim().toLowerCase();
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new ReportError(
      400,
      'INVALID_REPORT_FORMAT',
      `Unsupported format '${format}'. Supported formats are: ${SUPPORTED_FORMATS.join(', ')}`
    );
  }
  return format;
}

/**
 * GET /api/reports/:eventId/attendance
 * Exports downloadable attendance summary report in CSV or PDF format (FR-018).
 */
async function exportAttendanceReport(req, res, next) {
  try {
    const { eventId } = req.params;
    if (!eventId) {
      return res.status(400).json({
        status: 'error',
        code: 'MISSING_EVENT_ID',
        message: 'eventId parameter is required',
      });
    }

    const format = parseAndValidateFormat(req.query.format);
    await verifyEventAccess(eventId, req.user);

    const report = await reportService.generateAttendanceReport(eventId, format);

    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    return res.status(200).send(report.data);
  } catch (error) {
    if (error.code && error.status) {
      return res.status(error.status).json({
        status: 'error',
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
}

/**
 * GET /api/reports/:eventId/revenue
 * Exports downloadable revenue summary report in CSV or PDF format (FR-018).
 */
async function exportRevenueReport(req, res, next) {
  try {
    const { eventId } = req.params;
    if (!eventId) {
      return res.status(400).json({
        status: 'error',
        code: 'MISSING_EVENT_ID',
        message: 'eventId parameter is required',
      });
    }

    const format = parseAndValidateFormat(req.query.format);
    await verifyEventAccess(eventId, req.user);

    const report = await reportService.generateRevenueReport(eventId, format);

    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    return res.status(200).send(report.data);
  } catch (error) {
    if (error.code && error.status) {
      return res.status(error.status).json({
        status: 'error',
        code: error.code,
        message: error.message,
      });
    }
    return next(error);
  }
}

/**
 * GET /api/reports/:eventId/export
 * Generic report dispatcher accepting type=attendance|revenue and format=csv|pdf (STORY-TEL-01).
 */
async function exportGenericReport(req, res, next) {
  try {
    const reportType = String(req.query.type || '').trim().toLowerCase();
    if (reportType === 'attendance') {
      return await exportAttendanceReport(req, res, next);
    }
    if (reportType === 'revenue') {
      return await exportRevenueReport(req, res, next);
    }

    return res.status(400).json({
      status: 'error',
      code: 'INVALID_REPORT_TYPE',
      message: "Query parameter 'type' must be either 'attendance' or 'revenue'",
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  verifyEventAccess,
  exportAttendanceReport,
  exportRevenueReport,
  exportGenericReport,
};

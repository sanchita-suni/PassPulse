const eventService = require('../services/event.service');

function sendError(res, err) {
  if (err instanceof eventService.EventError) {
    return res.status(err.status).json({ status: 'error', code: err.code, message: err.message });
  }
  console.error('Event API error:', err);
  return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
}

/**
 * GET /api/events (FR-004)
 */
async function listEvents(req, res) {
  try {
    const result = await eventService.searchEvents(req.query);
    return res.status(200).json({
      status: 'success',
      message: result.total === 0 ? 'No events found' : undefined,
      ...result,
    });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * GET /api/events/categories
 */
async function listCategories(req, res) {
  try {
    const categories = await eventService.listCategories();
    return res.status(200).json({ status: 'success', categories });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * GET /api/events/:id
 */
async function getEvent(req, res) {
  try {
    const event = await eventService.getPublicEvent(req.params.id);
    return res.status(200).json({ status: 'success', event });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { listEvents, listCategories, getEvent, sendError };

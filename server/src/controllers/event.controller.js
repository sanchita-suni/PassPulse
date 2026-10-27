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


/**
 * POST /api/events (FR-005)
 */
async function createEvent(req, res) {
  try {
    const event = await eventService.createEvent(req.body || {}, req.user);
    return res.status(201).json({ status: 'success', event });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * GET /api/events/mine (FR-005)
 */
async function listMyEvents(req, res) {
  try {
    const events = await eventService.listOrganizerEvents(req.user);
    return res.status(200).json({ status: 'success', total: events.length, events });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * GET /api/events/:id/manage (FR-005), any status, owner or admin only
 */
async function getManagedEvent(req, res) {
  try {
    const event = await eventService.getManageableEvent(req.params.id, req.user);
    return res.status(200).json({ status: 'success', event });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * PUT /api/events/:id (FR-005)
 */
async function updateEvent(req, res) {
  try {
    const event = await eventService.updateEvent(req.params.id, req.body || {}, req.user);
    return res.status(200).json({ status: 'success', event });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * POST /api/events/:id/cancel (FR-005)
 */
async function cancelEvent(req, res) {
  try {
    const event = await eventService.cancelEvent(req.params.id, req.user, {
      notifyHolders: req.body && req.body.notifyHolders,
    });
    return res.status(200).json({ status: 'success', event });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * PATCH /api/events/:id/status (FR-006)
 */
async function changeStatus(req, res) {
  try {
    const { status, notifyHolders } = req.body || {};
    const event = await eventService.changeStatus(req.params.id, status, req.user, { notifyHolders });
    return res.status(200).json({ status: 'success', event });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = {
  listEvents,
  listCategories,
  getEvent,
  createEvent,
  listMyEvents,
  getManagedEvent,
  updateEvent,
  cancelEvent,
  changeStatus,
  sendError,
};

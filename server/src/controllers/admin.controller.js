const adminService = require('../services/admin.service');
const { sendError } = require('./event.controller');

function handle(fn, status = 200) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      return res.status(status).json({ status: 'success', ...data });
    } catch (err) {
      return sendError(res, err);
    }
  };
}

const reason = (req) => (req.body || {}).reason;

module.exports = {
  listEvents: handle(async (req) => {
    const events = await adminService.listEvents(req.query);
    return { total: events.length, events };
  }),
  approveEvent: handle(async (req) => ({ event: await adminService.approveEvent(req.params.id, req.user) })),
  rejectEvent: handle(async (req) => ({ event: await adminService.rejectEvent(req.params.id, req.user, reason(req)) })),
  flagEvent: handle(async (req) => ({ event: await adminService.flagEvent(req.params.id, req.user, reason(req)) })),
  unflagEvent: handle(async (req) => ({ event: await adminService.unflagEvent(req.params.id, req.user) })),
  removeEvent: handle(async (req) => ({ event: await adminService.removeEvent(req.params.id, req.user, reason(req)) })),
  listUsers: handle(async () => {
    const users = adminService.listUsers();
    return { total: users.length, users };
  }),
  deactivateUser: handle(async (req) => ({ user: await adminService.setUserActive(req.params.id, req.user, false) })),
  reactivateUser: handle(async (req) => ({ user: await adminService.setUserActive(req.params.id, req.user, true) })),
};

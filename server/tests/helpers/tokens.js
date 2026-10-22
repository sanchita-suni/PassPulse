const { generateToken } = require('../../src/utils/jwt.util');

/**
 * Signed JWTs for the seeded demo roles, used by the event and admin suites.
 */
function tokenFor(id, role) {
  return `Bearer ${generateToken({ id, userId: id, role, email: `${id.toLowerCase()}@test.io` })}`;
}

module.exports = {
  tokenFor,
  organizer: () => tokenFor('USR-ORG-001', 'ORGANIZER'),
  otherOrganizer: () => tokenFor('USR-ORG-002', 'ORGANIZER'),
  attendee: () => tokenFor('USR-ATTENDEE-001', 'ATTENDEE'),
  admin: () => tokenFor('USR-ADMIN-001', 'ADMIN'),
};

/**
 * Event lifecycle state machine (FR-006, SAD Fig. B-3) and BR-005.
 *
 *   DRAFT -> PENDING_APPROVAL -> PUBLISHED -> LIVE -> COMPLETED
 *   PENDING_APPROVAL -> DRAFT (withdrawn or rejected)
 *   any state before COMPLETED -> CANCELLED
 */
const { EventError } = require('./event.service');

const STATES = ['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'LIVE', 'COMPLETED', 'CANCELLED'];

const TRANSITIONS = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['PUBLISHED', 'DRAFT', 'CANCELLED'],
  PUBLISHED: ['LIVE', 'CANCELLED'],
  LIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

// Publishing is the approval step, so only an admin may take it.
const ADMIN_ONLY = new Set(['PENDING_APPROVAL->PUBLISHED']);

function allowedTransitions(from, role) {
  const isAdmin = (role || '').toUpperCase() === 'ADMIN';
  return (TRANSITIONS[from] || []).filter((to) => isAdmin || !ADMIN_ONLY.has(`${from}->${to}`));
}

/**
 * Throws if `to` is not a legal next state for `event` and the caller's role.
 */
function assertTransition(event, to, role) {
  if (!STATES.includes(to)) {
    throw new EventError(400, 'VALIDATION_ERROR', `status must be one of: ${STATES.join(', ')}`);
  }
  if (!(TRANSITIONS[event.status] || []).includes(to)) {
    const err = new EventError(409, 'INVALID_TRANSITION', `Cannot move an event from ${event.status} to ${to}`);
    throw err;
  }
  if (!allowedTransitions(event.status, role).includes(to)) {
    throw new EventError(403, 'APPROVAL_REQUIRED', 'Only an admin can publish an event awaiting approval');
  }
  // BR-005: an event needs at least one tier with quota > 0 before review
  if (to === 'PENDING_APPROVAL' && !event.tiers.some((t) => t.quota > 0)) {
    throw new EventError(409, 'TIERS_REQUIRED', 'Add at least one ticket tier with quota above 0 before submitting');
  }
}

module.exports = { STATES, TRANSITIONS, allowedTransitions, assertTransition };
